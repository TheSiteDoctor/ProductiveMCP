/**
 * Project-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Project,
  TaskList,
  Person,
  Board,
  FormattedProject,
  FormattedTaskList,
  FormattedPerson,
  FormattedBoard,
  CreateTaskListPayload,
  UpdateTaskListPayload,
  RepositionTaskListPayload,
  MoveTaskListPayload,
  CopyTaskListPayload,
} from "../types.js";
import {
  formatProject,
  formatProjectListMarkdown,
  formatTaskList,
  formatTaskListsMarkdown,
  formatSingleTaskListMarkdown,
  formatPerson,
  formatPeopleListMarkdown,
  formatBoard,
  formatBoardsMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  ListProjectsSchema,
  ListTaskListsSchema,
  ListPeopleSchema,
  ListBoardsSchema,
  GetTaskListSchema,
  CreateTaskListSchema,
  UpdateTaskListSchema,
  ArchiveTaskListSchema,
  RestoreTaskListSchema,
  DeleteTaskListSchema,
  RepositionTaskListSchema,
  MoveTaskListSchema,
  CopyTaskListSchema,
} from "../schemas/project.js";

/**
 * List projects
 */
export async function listProjects(
  client: ProductiveClient,
  args: z.infer<typeof ListProjectsSchema>,
): Promise<string> {
  // Fetch ALL projects by paginating through all pages
  // The Productive API doesn't support filter[archived], so we fetch all and filter client-side
  // API uses page[number] and page[size] for pagination, not page[limit] and page[offset]

  let allProjects: FormattedProject[] = [];
  let currentPage = 1;
  let totalPages = 1;

  // Fetch all pages
  do {
    const params: Record<string, unknown> = {
      "page[number]": currentPage,
      "page[size]": 30, // API default page size
      include: "company", // Include company/client data
    };

    const response = await client.get<JSONAPIResponse>("/projects", params);

    const pageProjects = (
      Array.isArray(response.data) ? response.data : [response.data]
    ).map((project) => formatProject(project as Project, response.included));

    allProjects = allProjects.concat(pageProjects);

    // Get pagination info from meta
    if (response.meta?.total_pages) {
      totalPages = response.meta.total_pages as number;
    }

    currentPage++;
  } while (currentPage <= totalPages);

  // Filter by status client-side
  // Note: If 'archived' field is undefined, we treat it as active (not archived)
  if (args.status !== "all") {
    if (args.status === "archived") {
      allProjects = allProjects.filter((project) => project.archived === true);
    } else {
      // status === 'active': include projects where archived is false or undefined
      allProjects = allProjects.filter((project) => project.archived !== true);
    }
  }

  // Apply user-requested pagination after filtering
  const startIndex = args.offset;
  const endIndex = startIndex + args.limit;
  const paginatedProjects = allProjects.slice(startIndex, endIndex);

  const result = formatResponse(paginatedProjects, args.response_format, () =>
    formatProjectListMarkdown(paginatedProjects),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List task lists for a project
 */
export async function listTaskLists(
  client: ProductiveClient,
  args: z.infer<typeof ListTaskListsSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    "filter[project_id]": args.project_id,
  };

  // Filter by board if specified
  if (args.board_id) {
    params["filter[board_id]"] = args.board_id;
  }

  // By default, only return active (non-archived) task lists
  // Status: 1 = Active, 2 = Archived
  if (!args.include_inactive) {
    params["filter[status]"] = "1";
  }

  const response = await client.get<JSONAPIResponse>("/task_lists", params);

  // Sort by position to reflect display order. The sort_order is derived
  // from the array index to make ordering explicit.
  const taskLists = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((taskList, index) => ({
    ...formatTaskList(taskList as TaskList),
    sort_order: index + 1,
  }));

  const result = formatResponse(taskLists, args.response_format, () =>
    formatTaskListsMarkdown(taskLists),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List people
 */
export async function listPeople(
  client: ProductiveClient,
  args: z.infer<typeof ListPeopleSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  // API uses page[number] (1-indexed) and page[size]
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };

  const response = await client.get<JSONAPIResponse>("/people", params);

  const people = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((person) => formatPerson(person as Person));

  const result = formatResponse(people, args.response_format, () =>
    formatPeopleListMarkdown(people),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List boards for a project
 */
export async function listBoards(
  client: ProductiveClient,
  args: z.infer<typeof ListBoardsSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    "filter[project_id]": args.project_id,
  };

  const response = await client.get<JSONAPIResponse>("/boards", params);

  const boards = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((board) => formatBoard(board as Board));

  const result = formatResponse(boards, args.response_format, () =>
    formatBoardsMarkdown(boards),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get the first board for a project (for auto-detect)
 */
async function getDefaultBoardId(
  client: ProductiveClient,
  projectId: string,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>("/boards", {
    "filter[project_id]": projectId,
  });

  const boards = Array.isArray(response.data) ? response.data : [response.data];

  if (boards.length === 0) {
    throw new Error(
      "Project has no boards. Please create a board first in Productive.",
    );
  }

  return (boards[0] as Board).id;
}

/**
 * Get a single task list by ID
 */
export async function getTaskList(
  client: ProductiveClient,
  args: z.infer<typeof GetTaskListSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}`,
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(taskList, args.response_format, () =>
    formatSingleTaskListMarkdown(taskList),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a new task list
 */
export async function createTaskList(
  client: ProductiveClient,
  args: z.infer<typeof CreateTaskListSchema>,
): Promise<string> {
  const boardId =
    args.board_id || (await getDefaultBoardId(client, args.project_id));

  const payload: CreateTaskListPayload = {
    data: {
      type: "task_lists",
      attributes: {
        name: args.name,
      },
      relationships: {
        project: {
          data: {
            type: "projects",
            id: args.project_id,
          },
        },
        board: {
          data: {
            type: "boards",
            id: boardId,
          },
        },
      },
    },
  };

  const response = await client.post<JSONAPIResponse>("/task_lists", payload);

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list created successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a task list (rename)
 */
export async function updateTaskList(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTaskListSchema>,
): Promise<string> {
  const payload: UpdateTaskListPayload = {
    data: {
      type: "task_lists",
      id: args.task_list_id,
      attributes: {
        name: args.name,
      },
    },
  };

  const response = await client.patch<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}`,
    payload,
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list updated successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Archive a task list
 */
export async function archiveTaskList(
  client: ProductiveClient,
  args: z.infer<typeof ArchiveTaskListSchema>,
): Promise<string> {
  const response = await client.patch<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}/archive`,
    {},
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list archived successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Restore an archived task list
 */
export async function restoreTaskList(
  client: ProductiveClient,
  args: z.infer<typeof RestoreTaskListSchema>,
): Promise<string> {
  const response = await client.patch<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}/restore`,
    {},
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list restored successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a task list
 */
export async function deleteTaskList(
  client: ProductiveClient,
  args: z.infer<typeof DeleteTaskListSchema>,
): Promise<string> {
  try {
    await client.delete(`/task_lists/${args.task_list_id}`);
    return `Task list ${args.task_list_id} deleted successfully.`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      throw new Error(
        "Delete operation not supported for task lists. Use archive_task_list instead to deactivate the task list.",
      );
    }
    throw error;
  }
}

/**
 * Reposition a task list (move before another)
 */
export async function repositionTaskList(
  client: ProductiveClient,
  args: z.infer<typeof RepositionTaskListSchema>,
): Promise<string> {
  const payload: RepositionTaskListPayload = {
    data: {
      type: "task_lists",
      attributes: {
        move_before_id: parseInt(args.move_before_id, 10),
      },
    },
  };

  const response = await client.patch<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}/reposition`,
    payload,
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list repositioned successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Move a task list to a different board
 */
export async function moveTaskList(
  client: ProductiveClient,
  args: z.infer<typeof MoveTaskListSchema>,
): Promise<string> {
  const payload: MoveTaskListPayload = {
    data: {
      type: "task_lists",
      id: args.task_list_id,
      relationships: {
        board: {
          data: {
            type: "boards",
            id: args.board_id,
          },
        },
      },
    },
  };

  const response = await client.patch<JSONAPIResponse>(
    `/task_lists/${args.task_list_id}/move`,
    payload,
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list moved successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Copy a task list
 */
export async function copyTaskList(
  client: ProductiveClient,
  args: z.infer<typeof CopyTaskListSchema>,
): Promise<string> {
  const boardId =
    args.board_id || (await getDefaultBoardId(client, args.project_id));

  const payload: CopyTaskListPayload = {
    data: {
      type: "task_lists",
      attributes: {
        template_id: parseInt(args.template_id, 10),
        name: args.name,
        copy_open_tasks: args.copy_open_tasks,
        copy_assignees: args.copy_assignees,
      },
      relationships: {
        project: {
          data: {
            type: "projects",
            id: args.project_id,
          },
        },
        board: {
          data: {
            type: "boards",
            id: boardId,
          },
        },
      },
    },
  };

  const response = await client.post<JSONAPIResponse>(
    "/task_lists/copy",
    payload,
  );

  const taskListData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const taskList = formatTaskList(taskListData as TaskList);

  const result = formatResponse(
    taskList,
    args.response_format,
    () =>
      `Task list copied successfully:\n\n${formatSingleTaskListMarkdown(taskList)}`,
  );

  return truncateResponse(result, args.response_format);
}
