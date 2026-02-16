/**
 * Task dependency MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  TaskDependency,
  TaskDependencyAttributes,
  CreateTaskDependencyPayload,
  UpdateTaskDependencyPayload,
  FormattedTaskDependency,
  DependencyType,
} from "../types.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";
import {
  CreateTaskDependencySchema,
  ListTaskDependenciesSchema,
  GetTaskDependencySchema,
  UpdateTaskDependencySchema,
  DeleteTaskDependencySchema,
} from "../schemas/dependency.js";
import { DEPENDENCY_TYPE_IDS, DEPENDENCY_TYPE_NAMES } from "../constants.js";

/**
 * Format a task dependency for display
 */
function formatTaskDependency(
  dependency: TaskDependency,
  includedData?: unknown[],
): FormattedTaskDependency {
  const attributes = dependency.attributes as TaskDependencyAttributes;

  // Extract task info from relationships and included data
  let taskId: string | null = null;
  let taskTitle: string | null = null;
  let dependentTaskId: string | null = null;
  let dependentTaskTitle: string | null = null;

  if (
    dependency.relationships?.task?.data &&
    "id" in dependency.relationships.task.data
  ) {
    taskId = dependency.relationships.task.data.id;

    if (includedData) {
      const task = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { title?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "tasks" &&
          "id" in item &&
          (item as { id: unknown }).id === taskId,
      );
      if (task?.attributes?.title) {
        taskTitle = task.attributes.title;
      }
    }
  }

  if (
    dependency.relationships?.dependent_task?.data &&
    "id" in dependency.relationships.dependent_task.data
  ) {
    dependentTaskId = dependency.relationships.dependent_task.data.id;

    if (includedData) {
      const task = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { title?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "tasks" &&
          "id" in item &&
          (item as { id: unknown }).id === dependentTaskId,
      );
      if (task?.attributes?.title) {
        dependentTaskTitle = task.attributes.title;
      }
    }
  }

  // Map type_id to dependency type name
  const dependencyType: DependencyType =
    DEPENDENCY_TYPE_NAMES[attributes.type_id] || "related";

  return {
    id: dependency.id,
    task_id: taskId || "",
    task_title: taskTitle,
    dependent_task_id: dependentTaskId || "",
    dependent_task_title: dependentTaskTitle,
    dependency_type: dependencyType,
    created_at: attributes.created_at || null,
  };
}

/**
 * Format dependency type for display
 */
function formatDependencyTypeDisplay(type: DependencyType): string {
  switch (type) {
    case "blocking":
      return "Blocking";
    case "waiting_on":
      return "Waiting On (Is Blocked By)";
    case "related":
      return "Related";
    default:
      return type;
  }
}

/**
 * Format a task dependency as markdown
 */
function formatTaskDependencyMarkdown(
  dependency: FormattedTaskDependency,
): string {
  const lines = [
    "# Task Dependency",
    "",
    `**ID**: ${dependency.id}`,
    `**Type**: ${formatDependencyTypeDisplay(dependency.dependency_type)}`,
  ];

  if (dependency.task_title) {
    lines.push(
      `**Task**: ${dependency.task_title} (ID: ${dependency.task_id})`,
    );
  } else {
    lines.push(`**Task ID**: ${dependency.task_id}`);
  }

  if (dependency.dependent_task_title) {
    lines.push(
      `**Dependent Task**: ${dependency.dependent_task_title} (ID: ${dependency.dependent_task_id})`,
    );
  } else {
    lines.push(`**Dependent Task ID**: ${dependency.dependent_task_id}`);
  }

  if (dependency.created_at) {
    const createdDate = new Date(dependency.created_at).toLocaleString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      },
    );
    lines.push(`**Created**: ${createdDate}`);
  }

  return lines.join("\n");
}

/**
 * Format a list of task dependencies as markdown
 */
function formatTaskDependencyListMarkdown(
  dependencies: FormattedTaskDependency[],
  taskId: string,
): string {
  if (dependencies.length === 0) {
    return `No dependencies found for task ${taskId}.`;
  }

  const lines = [
    `# Dependencies for Task ${taskId}`,
    "",
    `**Total**: ${dependencies.length} dependencies`,
    "",
  ];

  // Group by dependency type
  const blocking = dependencies.filter((d) => d.dependency_type === "blocking");
  const waitingOn = dependencies.filter(
    (d) => d.dependency_type === "waiting_on",
  );
  const related = dependencies.filter((d) => d.dependency_type === "related");

  if (blocking.length > 0) {
    lines.push("## Blocking", "");
    for (const dep of blocking) {
      const taskName =
        dep.dependent_task_title || `Task ${dep.dependent_task_id}`;
      lines.push(`- **${taskName}** (ID: ${dep.dependent_task_id})`);
    }
    lines.push("");
  }

  if (waitingOn.length > 0) {
    lines.push("## Waiting On (Is Blocked By)", "");
    for (const dep of waitingOn) {
      const taskName =
        dep.dependent_task_title || `Task ${dep.dependent_task_id}`;
      lines.push(`- **${taskName}** (ID: ${dep.dependent_task_id})`);
    }
    lines.push("");
  }

  if (related.length > 0) {
    lines.push("## Related", "");
    for (const dep of related) {
      const taskName =
        dep.dependent_task_title || `Task ${dep.dependent_task_id}`;
      lines.push(`- **${taskName}** (ID: ${dep.dependent_task_id})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Create a task dependency
 */
export async function createTaskDependency(
  client: ProductiveClient,
  args: z.infer<typeof CreateTaskDependencySchema>,
): Promise<string> {
  const typeId = DEPENDENCY_TYPE_IDS[args.dependency_type];

  const payload: CreateTaskDependencyPayload = {
    data: {
      type: "task_dependencies",
      attributes: {
        task_id: parseInt(args.task_id, 10),
        dependent_task_id: parseInt(args.dependent_task_id, 10),
        type_id: typeId,
      },
    },
  };

  const response = await client.post<JSONAPIResponse>(
    "/task_dependencies",
    payload,
  );

  const dependencyData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const dependency = formatTaskDependency(
    dependencyData as TaskDependency,
    response.included,
  );

  const result = formatResponse(
    dependency,
    args.response_format,
    () =>
      `# Dependency Created Successfully\n\n${formatTaskDependencyMarkdown(dependency)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List task dependencies for a task
 */
export async function listTaskDependencies(
  client: ProductiveClient,
  args: z.infer<typeof ListTaskDependenciesSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    "filter[task_id]": args.task_id,
    include: "task,dependent_task",
    "page[size]": 200, // Get all dependencies
  };

  const response = await client.get<JSONAPIResponse>(
    "/task_dependencies",
    params,
  );

  const dependencies = (
    Array.isArray(response.data) ? response.data : [response.data]
  )
    .filter((d) => d && d.id) // Filter out null/undefined entries
    .map((dep) =>
      formatTaskDependency(dep as TaskDependency, response.included),
    );

  const result = formatResponse(
    { task_id: args.task_id, dependencies, count: dependencies.length },
    args.response_format,
    () => formatTaskDependencyListMarkdown(dependencies, args.task_id),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a specific task dependency
 */
export async function getTaskDependency(
  client: ProductiveClient,
  args: z.infer<typeof GetTaskDependencySchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(
    `/task_dependencies/${args.dependency_id}`,
    {
      include: "task,dependent_task",
    },
  );

  const dependencyData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const dependency = formatTaskDependency(
    dependencyData as TaskDependency,
    response.included,
  );

  const result = formatResponse(dependency, args.response_format, () =>
    formatTaskDependencyMarkdown(dependency),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a task dependency
 */
export async function updateTaskDependency(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTaskDependencySchema>,
): Promise<string> {
  const typeId = DEPENDENCY_TYPE_IDS[args.dependency_type];

  const payload: UpdateTaskDependencyPayload = {
    data: {
      type: "task_dependencies",
      id: args.dependency_id,
      attributes: {
        type_id: typeId,
      },
    },
  };

  const response = await client.patch<JSONAPIResponse>(
    `/task_dependencies/${args.dependency_id}`,
    payload,
    { include: "task,dependent_task" },
  );

  const dependencyData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const dependency = formatTaskDependency(
    dependencyData as TaskDependency,
    response.included,
  );

  const result = formatResponse(
    dependency,
    args.response_format,
    () =>
      `# Dependency Updated Successfully\n\n${formatTaskDependencyMarkdown(dependency)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a task dependency
 */
export async function deleteTaskDependency(
  client: ProductiveClient,
  args: z.infer<typeof DeleteTaskDependencySchema>,
): Promise<string> {
  await client.delete(`/task_dependencies/${args.dependency_id}`);

  return `Task dependency ${args.dependency_id} deleted successfully.`;
}
