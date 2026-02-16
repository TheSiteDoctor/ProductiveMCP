#!/usr/bin/env node

/**
 * Productive.io MCP Server
 *
 * A Model Context Protocol server for managing tasks in Productive.io
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ProductiveClient } from "./client.js";
import { validateEnvironment } from "./utils/errors.js";
import { TASK_TYPES, PRIORITIES, WORKFLOW_STATUSES } from "./constants.js";

// Import schemas
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
} from "./schemas/project.js";
import {
  CreateTaskSchema,
  SearchTasksSchema,
  GetTaskSchema,
  UpdateTaskSchema,
  CreateTasksBatchSchema,
} from "./schemas/task.js";
import {
  CreateTodoSchema,
  ListTodosSchema,
  GetTodoSchema,
  UpdateTodoSchema,
  DeleteTodoSchema,
} from "./schemas/todo.js";
import {
  ListPagesSchema,
  GetPageSchema,
  CreatePageSchema,
  UpdatePageSchema,
  DeletePageSchema,
  SearchPagesSchema,
} from "./schemas/page.js";
import {
  CreateTaskDependencySchema,
  ListTaskDependenciesSchema,
  GetTaskDependencySchema,
  UpdateTaskDependencySchema,
  DeleteTaskDependencySchema,
} from "./schemas/dependency.js";
import {
  MarkAsBlockedBySchema,
  MarkAsDuplicateSchema,
} from "./schemas/workflow.js";
import {
  ListAttachmentsSchema,
  UploadAttachmentSchema,
} from "./schemas/attachment.js";
import { ListCommentsSchema } from "./schemas/comment.js";
import { ListSubtasksSchema } from "./schemas/subtask.js";
import {
  ListBudgetsSchema,
  GetBudgetSchema,
  UpdateBudgetSchema,
  MarkBudgetDeliveredSchema,
  CloseBudgetSchema,
  AuditProjectBudgetsSchema,
} from "./schemas/budget.js";
import {
  ListRevenueDistributionsSchema,
  GetRevenueDistributionSchema,
  CreateRevenueDistributionSchema,
  UpdateRevenueDistributionSchema,
  DeleteRevenueDistributionSchema,
  ExtendRevenueDistributionSchema,
  ReportOverdueDistributionsSchema,
} from "./schemas/revenue-distribution.js";
import {
  ListServicesSchema,
  GetServiceSchema,
  CreateServiceSchema,
  UpdateServiceSchema,
  ListServiceTypesSchema,
  GetServiceTypeSchema,
  CreateServiceTypeSchema,
  UpdateServiceTypeSchema,
  ArchiveServiceTypeSchema,
} from "./schemas/service.js";

// Import tool implementations
import {
  listProjects,
  listTaskLists,
  listPeople,
  listBoards,
  getTaskList,
  createTaskList,
  updateTaskList,
  archiveTaskList,
  restoreTaskList,
  deleteTaskList,
  repositionTaskList,
  moveTaskList,
  copyTaskList,
} from "./tools/projects.js";
import { createTask, searchTasks, getTask, updateTask } from "./tools/tasks.js";
import { createTasksBatch } from "./tools/batch.js";
import {
  createTodo,
  listTodos,
  getTodo,
  updateTodo,
  deleteTodo,
} from "./tools/todos.js";
import {
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  searchPages,
} from "./tools/pages.js";
import {
  createTaskDependency,
  listTaskDependencies,
  getTaskDependency,
  updateTaskDependency,
  deleteTaskDependency,
} from "./tools/dependencies.js";
import { markAsBlockedBy, markAsDuplicate } from "./tools/workflows.js";
import { listAttachments, uploadAttachment } from "./tools/attachments.js";
import { listComments } from "./tools/comments.js";
import { listSubtasks } from "./tools/subtasks.js";
import {
  listBudgets,
  getBudget,
  updateBudget,
  markBudgetDelivered,
  closeBudget,
  auditProjectBudgets,
} from "./tools/budgets.js";
import {
  listRevenueDistributions,
  getRevenueDistribution,
  createRevenueDistribution,
  updateRevenueDistribution,
  deleteRevenueDistribution,
  extendRevenueDistribution,
  reportOverdueDistributions,
} from "./tools/revenue-distributions.js";
import {
  listServices,
  getService,
  createService,
  updateService,
  listServiceTypes,
  getServiceType,
  createServiceType,
  updateServiceType,
  archiveServiceType,
} from "./tools/services.js";

// Validate environment variables
try {
  validateEnvironment();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Environment validation failed",
  );
  process.exit(1);
}

// Initialize API client
const client = new ProductiveClient(
  process.env.PRODUCTIVE_API_TOKEN!,
  process.env.PRODUCTIVE_ORG_ID!,
);

// Initialize MCP server
const server = new Server(
  {
    name: "productive-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Priority 1: Core Task Management
    {
      name: "productive_create_task",
      description:
        'Create a single task in Productive.io. Use this to create individual tasks with specific details. For creating multiple tasks at once, use productive_create_tasks_batch instead.\n\nIMPORTANT: Both project_id and task_list_id are REQUIRED. Use productive_list_task_lists to get valid task list IDs for a project.\n\nSupports custom fields:\n- task_type: Bug, Task, Feature, Question, Meeting, Test Case\n- priority: Highest, High, Medium, Low, Lowest\n- labels: Array of label strings\n- parent_task_id: ID of parent task (for creating sub-tasks)\n\nExample:\n{\n  "title": "Fix login bug on staging",\n  "description": "Users are unable to login after password reset",\n  "project_id": "1234",\n  "task_list_id": "5678",\n  "task_type": "Bug",\n  "priority": "High",\n  "due_date": "2025-11-20"\n}',
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title (1-200 characters)",
          },
          description: {
            type: "string",
            description:
              "Optional task description in Markdown or HTML format (max 10000 characters). Markdown will be automatically converted to HTML for Productive.",
          },
          project_id: {
            type: "string",
            description:
              "Project ID (required). Use productive_list_projects to find project IDs",
          },
          task_list_id: {
            type: "string",
            description:
              "Task list ID (required). Use productive_list_task_lists to find task list IDs for a project",
          },
          assignee_id: {
            type: "string",
            description:
              "Optional assignee person ID. Use productive_list_people to find person IDs",
          },
          due_date: {
            type: "string",
            description: "Optional due date in ISO 8601 format (YYYY-MM-DD)",
          },
          start_date: {
            type: "string",
            description: "Optional start date in ISO 8601 format (YYYY-MM-DD)",
          },
          initial_estimate: {
            type: "number",
            description:
              "Optional initial estimate in minutes. For example, use 90 for 1.5 hours, 120 for 2 hours.",
          },
          task_type: {
            type: "string",
            enum: [...TASK_TYPES],
            default: "Task",
            description:
              "Task type classification (default: Task). Always set this appropriately: Bug for defects, Feature for new functionality, Task for general work, Question for queries, Meeting for meetings, Test Case for test items.",
          },
          priority: {
            type: "string",
            enum: [...PRIORITIES],
            default: "Medium",
            description:
              "Task priority level (default: Medium). Set appropriately based on urgency and importance.",
          },
          workflow_status: {
            type: "string",
            enum: [...WORKFLOW_STATUSES],
            description: "Optional workflow status for the task",
          },
          labels: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Optional array of label strings to tag the task",
          },
          parent_task_id: {
            type: "string",
            description:
              "Optional parent task ID. Use this to create a sub-task under an existing task",
          },
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description:
                    "Todo item description (required, max 5000 characters)",
                },
                due_date: {
                  type: "string",
                  description:
                    "Optional due date in ISO 8601 format (YYYY-MM-DD)",
                },
                assignee_id: {
                  type: "string",
                  description: "Optional assignee person ID for this todo",
                },
                closed: {
                  type: "boolean",
                  description: "Whether the todo is completed (default: false)",
                },
              },
              required: ["description"],
            },
            description:
              "Optional array of todo/checklist items to create under this task",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["title", "project_id", "task_list_id"],
      },
    },
    {
      name: "productive_list_projects",
      description:
        'List available projects in Productive.io. Use this to find project IDs for task creation.\n\nExample:\n{\n  "status": "active",\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "archived", "all"],
            description: "Filter by project status (default: active)",
            default: "active",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_list_task_lists",
      description:
        'Get task lists for a specific project. Task lists help organize tasks within a project.\n\nIMPORTANT: By default, only ACTIVE task lists are returned. Inactive (archived) task lists cannot be used for creating new tasks and will cause validation errors.\n\nEach task list is marked as (Active) or (Inactive) in the results. Only use Active task lists when creating tasks.\n\nExample:\n{\n  "project_id": "1234",\n  "include_inactive": false\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Project ID (required)",
          },
          board_id: {
            type: "string",
            description:
              "Board ID (optional, filter task lists to a specific board)",
          },
          include_inactive: {
            type: "boolean",
            description:
              "Include inactive (archived) task lists in results (default: false)",
            default: false,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["project_id"],
      },
    },

    // Board tools
    {
      name: "productive_list_boards",
      description:
        'List boards for a project. Boards contain task lists. Use this to find board IDs for task list creation.\n\nExample:\n{\n  "project_id": "1234"\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Project ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["project_id"],
      },
    },

    // Task List CRUD tools
    {
      name: "productive_get_task_list",
      description:
        'Get a single task list by ID.\n\nExample:\n{\n  "task_list_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id"],
      },
    },
    {
      name: "productive_create_task_list",
      description:
        'Create a new task list within a project. If board_id is not provided, the first board in the project will be used automatically.\n\nExample:\n{\n  "project_id": "1234",\n  "name": "Sprint 1"\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Project ID (required)",
          },
          name: {
            type: "string",
            description: "Task list name (required, max 200 characters)",
          },
          board_id: {
            type: "string",
            description:
              "Board ID (optional, auto-detects first board if not provided)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["project_id", "name"],
      },
    },
    {
      name: "productive_update_task_list",
      description:
        'Update a task list name.\n\nExample:\n{\n  "task_list_id": "5678",\n  "name": "Sprint 2"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
          name: {
            type: "string",
            description: "New name (required, max 200 characters)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id", "name"],
      },
    },
    {
      name: "productive_archive_task_list",
      description:
        'Archive a task list. Archived task lists cannot be used for new tasks.\n\nExample:\n{\n  "task_list_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id"],
      },
    },
    {
      name: "productive_restore_task_list",
      description:
        'Restore an archived task list to active status.\n\nExample:\n{\n  "task_list_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id"],
      },
    },
    {
      name: "productive_delete_task_list",
      description:
        'Delete a task list permanently. Note: If deletion is not supported by the API, use productive_archive_task_list instead.\n\nExample:\n{\n  "task_list_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
        },
        required: ["task_list_id"],
      },
    },
    {
      name: "productive_reposition_task_list",
      description:
        'Reorder a task list by moving it before another task list.\n\nExample:\n{\n  "task_list_id": "5678",\n  "move_before_id": "9012"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID to move (required)",
          },
          move_before_id: {
            type: "string",
            description: "ID of task list to position before (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id", "move_before_id"],
      },
    },
    {
      name: "productive_move_task_list",
      description:
        'Move a task list to a different board within the project.\n\nExample:\n{\n  "task_list_id": "5678",\n  "board_id": "9012"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_list_id: {
            type: "string",
            description: "Task list ID (required)",
          },
          board_id: {
            type: "string",
            description: "Destination board ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_list_id", "board_id"],
      },
    },
    {
      name: "productive_copy_task_list",
      description:
        'Copy a task list to create a duplicate. Can copy to the same or different project.\n\nExample:\n{\n  "template_id": "5678",\n  "name": "Sprint 1 Copy",\n  "project_id": "1234",\n  "copy_open_tasks": true,\n  "copy_assignees": true\n}',
      inputSchema: {
        type: "object",
        properties: {
          template_id: {
            type: "string",
            description: "Source task list ID to copy (required)",
          },
          name: {
            type: "string",
            description: "Name for the new task list (required)",
          },
          project_id: {
            type: "string",
            description: "Destination project ID (required)",
          },
          board_id: {
            type: "string",
            description:
              "Destination board ID (optional, auto-detects if not provided)",
          },
          copy_open_tasks: {
            type: "boolean",
            description: "Copy open tasks to new list (default: true)",
            default: true,
          },
          copy_assignees: {
            type: "boolean",
            description: "Preserve task assignees (default: true)",
            default: true,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["template_id", "name", "project_id"],
      },
    },

    {
      name: "productive_search_tasks",
      description:
        'Search for existing tasks in Productive.io. Filter by query text, project, assignee, or status.\n\nExample:\n{\n  "query": "bug",\n  "project_id": "1234",\n  "closed": false\n}',
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for task title/description",
          },
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          assignee_id: {
            type: "string",
            description: "Filter by assignee person ID",
          },
          closed: {
            type: "boolean",
            description: "Filter by status (true for closed, false for open)",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_task",
      description:
        'Get details of a specific task by ID.\n\nExample:\n{\n  "task_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },

    // Todo/Checklist Management
    {
      name: "productive_create_todo",
      description:
        'Create a todo/checklist item under an existing task.\n\nExample:\n{\n  "task_id": "12345",\n  "description": "Review code changes",\n  "assignee_id": "67890"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to add the todo to (required)",
          },
          description: {
            type: "string",
            description:
              "Todo item description (required, max 5000 characters)",
          },
          due_date: {
            type: "string",
            description: "Optional due date in ISO 8601 format (YYYY-MM-DD)",
          },
          assignee_id: {
            type: "string",
            description: "Optional assignee person ID for this todo",
          },
          closed: {
            type: "boolean",
            description: "Whether the todo is completed (default: false)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id", "description"],
      },
    },
    {
      name: "productive_list_todos",
      description:
        'List all todos/checklist items for a specific task.\n\nExample:\n{\n  "task_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to list todos for (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "productive_update_todo",
      description:
        'Update a todo/checklist item (e.g., mark as complete, change description).\n\nExample:\n{\n  "todo_id": "98765",\n  "closed": true\n}',
      inputSchema: {
        type: "object",
        properties: {
          todo_id: {
            type: "string",
            description: "Todo ID (required)",
          },
          description: {
            type: "string",
            description: "New description",
          },
          due_date: {
            type: "string",
            description:
              "New due date in ISO 8601 format (YYYY-MM-DD), or null to clear",
          },
          closed: {
            type: "boolean",
            description: "Mark todo as complete (true) or incomplete (false)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["todo_id"],
      },
    },
    {
      name: "productive_delete_todo",
      description:
        'Delete a todo/checklist item.\n\nExample:\n{\n  "todo_id": "98765"\n}',
      inputSchema: {
        type: "object",
        properties: {
          todo_id: {
            type: "string",
            description: "Todo ID (required)",
          },
        },
        required: ["todo_id"],
      },
    },

    // Priority 2: Batch Operations
    {
      name: "productive_create_tasks_batch",
      description:
        'Create multiple tasks efficiently in a single operation. This is the recommended way to create multiple tasks at once. Automatically handles rate limiting and reports successes/failures.\n\nExample:\n{\n  "tasks": [\n    {"title": "Migrate database to PostgreSQL"},\n    {"title": "Update API documentation", "due_date": "2025-11-25"},\n    {"title": "Write integration tests"}\n  ],\n  "project_id": "1234"\n}',
      inputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "Array of tasks to create",
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Task title (1-200 characters, required)",
                },
                description: {
                  type: "string",
                  description:
                    "Optional task description in Markdown or HTML format (max 10000 characters). Markdown will be automatically converted to HTML.",
                },
                due_date: {
                  type: "string",
                  description:
                    "Optional due date in ISO 8601 format (YYYY-MM-DD)",
                },
                start_date: {
                  type: "string",
                  description:
                    "Optional start date in ISO 8601 format (YYYY-MM-DD)",
                },
                task_list_id: {
                  type: "string",
                  description:
                    "Optional task list ID (overrides default_task_list_id)",
                },
                assignee_id: {
                  type: "string",
                  description:
                    "Optional assignee ID (overrides default_assignee_id)",
                },
                task_type: {
                  type: "string",
                  enum: [...TASK_TYPES],
                  default: "Task",
                  description:
                    "Task type classification (default: Task). Always set appropriately: Bug for defects, Feature for new functionality, Task for general work.",
                },
                priority: {
                  type: "string",
                  enum: [...PRIORITIES],
                  default: "Medium",
                  description:
                    "Task priority level (default: Medium). Set appropriately based on urgency.",
                },
              },
              required: ["title"],
            },
          },
          project_id: {
            type: "string",
            description:
              "Project ID (applies to all tasks). Use productive_list_projects to find project IDs",
          },
          default_task_list_id: {
            type: "string",
            description:
              "Default task list ID for all tasks (can be overridden per task)",
          },
          default_assignee_id: {
            type: "string",
            description:
              "Default assignee ID for all tasks (can be overridden per task)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["tasks", "project_id"],
      },
    },

    // Priority 3: Enhancement Tools
    {
      name: "productive_update_task",
      description:
        'Update an existing task. You can update the title, description, dates, or mark it as complete.\n\nExample:\n{\n  "task_id": "5678",\n  "title": "Updated task title",\n  "closed": true\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID (required)",
          },
          title: {
            type: "string",
            description: "New task title (1-200 characters)",
          },
          description: {
            type: "string",
            description:
              "New description in Markdown or HTML format (or null to clear). Markdown will be automatically converted to HTML.",
          },
          due_date: {
            type: "string",
            description:
              "New due date in ISO 8601 format (YYYY-MM-DD), or null to clear",
          },
          start_date: {
            type: "string",
            description:
              "New start date in ISO 8601 format (YYYY-MM-DD), or null to clear",
          },
          estimate_minutes: {
            type: "number",
            description:
              "Initial estimate in minutes. For example, use 90 for 1.5 hours, 120 for 2 hours.",
          },
          task_type: {
            type: "string",
            enum: [...TASK_TYPES],
            description:
              "Task type classification. Set appropriately: Bug for defects, Feature for new functionality, Task for general work, Question for queries, Meeting for meetings, Test Case for test items.",
          },
          priority: {
            type: "string",
            enum: [...PRIORITIES],
            description:
              "Task priority level. Set appropriately based on urgency and importance.",
          },
          workflow_status: {
            type: "string",
            enum: [...WORKFLOW_STATUSES],
            description: "Workflow status for the task",
          },
          closed: {
            type: "boolean",
            description: "Mark task as closed (true) or open (false)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "productive_list_people",
      description:
        'List people in your Productive.io organization. Use this to find person IDs for task assignment.\n\nExample:\n{\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },

    // Page (Document) tools
    {
      name: "productive_list_pages",
      description:
        'List pages (documents) in Productive.io. Pages are used for project specifications, documentation, and notes.\n\nExample:\n{\n  "project_id": "1234",\n  "limit": 20,\n  "sort_by": "updated_at",\n  "sort_order": "desc"\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: ["string", "array"],
            description:
              "Filter by project ID (can be a single ID or array of IDs)",
          },
          creator_id: {
            type: "string",
            description: "Filter by creator person ID",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-200, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          sort_by: {
            type: "string",
            enum: [
              "created_at",
              "creator_name",
              "edited_at",
              "project",
              "title",
              "updated_at",
            ],
            description: "Field to sort by (default: updated_at)",
            default: "updated_at",
          },
          sort_order: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort direction (default: desc)",
            default: "desc",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_page",
      description:
        'Get a specific page (document) by ID. Returns the full page content.\n\nExample:\n{\n  "page_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "Page ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["page_id"],
      },
    },
    {
      name: "productive_create_page",
      description:
        'Create a new page (document) in Productive.io. Pages can be used for project specifications, documentation, meeting notes, etc.\n\nPages can be organized hierarchically using parent_page_id.\n\nExample:\n{\n  "title": "Project Specification",\n  "body": "# Requirements\\n\\nThis document outlines...",\n  "project_id": "1234",\n  "version_number": "1.0"\n}',
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Page title (required, max 500 characters)",
          },
          body: {
            type: "string",
            description: "Page content (optional, plain text or markdown)",
          },
          project_id: {
            type: "string",
            description: "Associate page with a project (optional)",
          },
          parent_page_id: {
            type: "string",
            description:
              "Create as a sub-page under an existing page (optional)",
          },
          version_number: {
            type: "string",
            description:
              'Version number for tracking (optional, e.g., "1.0", "2.1")',
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "productive_update_page",
      description:
        'Update an existing page (document). You can update the title, body content, or both.\n\nWARNING: Ensure no user has the page open in Productive for successful updates.\n\nExample:\n{\n  "page_id": "5678",\n  "title": "Updated Project Spec",\n  "body": "# Updated Requirements\\n\\nNew content..."\n}',
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "Page ID (required)",
          },
          title: {
            type: "string",
            description: "New page title (optional, max 500 characters)",
          },
          body: {
            type: ["string", "null"],
            description: "New page content (optional, null to clear)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["page_id"],
      },
    },
    {
      name: "productive_delete_page",
      description:
        'Delete a page (document) permanently.\n\nExample:\n{\n  "page_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "Page ID to delete (required)",
          },
        },
        required: ["page_id"],
      },
    },
    {
      name: "productive_search_pages",
      description:
        'Search for pages (documents) by title and filter by project.\n\nExample:\n{\n  "query": "specification",\n  "project_id": "1234",\n  "limit": 10\n}',
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term for page title/body",
          },
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-200, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },

    // Task Dependency tools
    {
      name: "productive_create_task_dependency",
      description:
        'Create a dependency between two tasks. Dependencies help manage task order and prevent bottlenecks.\n\nDependency types:\n- blocking: The source task blocks the dependent task from starting\n- waiting_on: The source task is waiting on (blocked by) the dependent task\n- related: Tasks are related but do not block each other\n\nExample:\n{\n  "task_id": "12345",\n  "dependent_task_id": "67890",\n  "dependency_type": "blocking"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Source task ID (required)",
          },
          dependent_task_id: {
            type: "string",
            description: "Dependent task ID (required)",
          },
          dependency_type: {
            type: "string",
            enum: ["blocking", "waiting_on", "related"],
            description:
              "Type of dependency: blocking (this task blocks dependent), waiting_on (this task waits on dependent), related (tasks are related)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id", "dependent_task_id", "dependency_type"],
      },
    },
    {
      name: "productive_list_task_dependencies",
      description:
        'List all dependencies for a specific task. Returns blocking, waiting on, and related dependencies.\n\nExample:\n{\n  "task_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to list dependencies for (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "productive_get_task_dependency",
      description:
        'Get details of a specific task dependency by ID.\n\nExample:\n{\n  "dependency_id": "98765"\n}',
      inputSchema: {
        type: "object",
        properties: {
          dependency_id: {
            type: "string",
            description: "Dependency ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["dependency_id"],
      },
    },
    {
      name: "productive_update_task_dependency",
      description:
        'Update the type of an existing task dependency.\n\nExample:\n{\n  "dependency_id": "98765",\n  "dependency_type": "waiting_on"\n}',
      inputSchema: {
        type: "object",
        properties: {
          dependency_id: {
            type: "string",
            description: "Dependency ID (required)",
          },
          dependency_type: {
            type: "string",
            enum: ["blocking", "waiting_on", "related"],
            description: "New dependency type",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["dependency_id", "dependency_type"],
      },
    },
    {
      name: "productive_delete_task_dependency",
      description:
        'Delete a task dependency.\n\nExample:\n{\n  "dependency_id": "98765"\n}',
      inputSchema: {
        type: "object",
        properties: {
          dependency_id: {
            type: "string",
            description: "Dependency ID to delete (required)",
          },
        },
        required: ["dependency_id"],
      },
    },

    // Workflow helper tools
    {
      name: "productive_mark_as_blocked_by",
      description:
        'Smart workflow: Mark a task as blocked by another task. This automatically sets the task status to "Blocked" and creates a "waiting_on" dependency.\n\nExample:\n{\n  "task_id": "12345",\n  "blocked_by_task_id": "67890"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID that is blocked (required)",
          },
          blocked_by_task_id: {
            type: "string",
            description: "Task ID that is blocking this task (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id", "blocked_by_task_id"],
      },
    },
    {
      name: "productive_mark_as_duplicate",
      description:
        'Smart workflow: Mark a task as duplicate/obsolete. This automatically sets the task status to "Obsolete / Won\'t Fix" and creates a "related" dependency to link to the original task.\n\nExample:\n{\n  "task_id": "12345",\n  "duplicate_of_task_id": "67890"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to mark as duplicate (required)",
          },
          duplicate_of_task_id: {
            type: "string",
            description: "Original task ID that this duplicates (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id", "duplicate_of_task_id"],
      },
    },

    // Attachment tools
    {
      name: "productive_list_attachments",
      description:
        'List all attachments for a specific task. Attachments are automatically included when fetching tasks, so this tool is mainly for convenience when you only need attachment information.\n\nNote: Inline images appear embedded in the task description HTML as <img> tags.\n\nExample:\n{\n  "task_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to list attachments for (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "productive_upload_attachment",
      description:
        'Upload an attachment to a task, comment, or page. Supports three input sources: local file path, URL to download from, or base64-encoded content.\n\nExactly one of file_path, url, or base64_content must be provided.\n\nExample (file path):\n{\n  "attachable_type": "task",\n  "attachable_id": "12345",\n  "file_path": "/path/to/file.pdf",\n  "filename": "report.pdf"\n}\n\nExample (URL):\n{\n  "attachable_type": "task",\n  "attachable_id": "12345",\n  "url": "https://example.com/image.png",\n  "filename": "screenshot.png"\n}\n\nExample (base64):\n{\n  "attachable_type": "comment",\n  "attachable_id": "67890",\n  "base64_content": "iVBORw0KGgo...",\n  "filename": "diagram.png",\n  "content_type": "image/png"\n}',
      inputSchema: {
        type: "object",
        properties: {
          attachable_type: {
            type: "string",
            enum: ["task", "comment", "page"],
            description:
              "Type of resource to attach to: task, comment, or page (required)",
          },
          attachable_id: {
            type: "string",
            description:
              "ID of the task, comment, or page to attach to (required)",
          },
          file_path: {
            type: "string",
            description:
              "Local file path to upload (provide exactly one of: file_path, url, or base64_content)",
          },
          url: {
            type: "string",
            description:
              "URL to download the file from (provide exactly one of: file_path, url, or base64_content)",
          },
          base64_content: {
            type: "string",
            description:
              "Base64-encoded file content (provide exactly one of: file_path, url, or base64_content)",
          },
          filename: {
            type: "string",
            description: "Filename for the attachment (required)",
          },
          content_type: {
            type: "string",
            description:
              "MIME type (optional, auto-detected from filename if not provided)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["attachable_type", "attachable_id", "filename"],
      },
    },

    // Comment tools
    {
      name: "productive_list_comments",
      description:
        'List all comments for a specific task. Returns comments with author information, sorted by most recent first.\n\nExample:\n{\n  "task_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to list comments for (required)",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["task_id"],
      },
    },

    // Sub-task tools
    {
      name: "productive_list_subtasks",
      description:
        'List all sub-tasks (child tasks) for a parent task. Sub-tasks are full tasks that are nested under a parent task, NOT to be confused with todos/checklists which are simple checkbox items.\n\nUse this when asked to "look at sub-tasks" or "show child tasks" of a parent task.\n\nExample:\n{\n  "parent_task_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          parent_task_id: {
            type: "string",
            description: "Parent task ID to list sub-tasks for (required)",
          },
          closed: {
            type: "boolean",
            description: "Filter by status (true for closed, false for open)",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["parent_task_id"],
      },
    },

    // Budget tools
    {
      name: "productive_list_budgets",
      description:
        'List budgets in Productive.io. Budgets are financial allocations for projects. Filter by project, company, responsible person, status, or recurring type.\n\nExample:\n{\n  "project_id": "1234",\n  "status": "open",\n  "recurring": true,\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          company_id: {
            type: "string",
            description: "Filter by company ID",
          },
          responsible_id: {
            type: "string",
            description: "Filter by responsible person ID",
          },
          status: {
            type: "string",
            enum: ["open", "closed"],
            description: "Filter by budget status",
          },
          recurring: {
            type: "boolean",
            description:
              "Filter by recurring budgets (true for recurring/retainer budgets, false for one-off)",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_budget",
      description:
        'Get details of a specific budget by ID.\n\nExample:\n{\n  "budget_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          budget_id: {
            type: "string",
            description: "Budget ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["budget_id"],
      },
    },
    {
      name: "productive_update_budget",
      description:
        'Update a budget. You can update the name, end date, or delivery date.\n\nExample:\n{\n  "budget_id": "5678",\n  "end_date": "2025-12-31"\n}',
      inputSchema: {
        type: "object",
        properties: {
          budget_id: {
            type: "string",
            description: "Budget ID (required)",
          },
          name: {
            type: "string",
            description: "New budget name (max 200 characters)",
          },
          end_date: {
            type: ["string", "null"],
            description:
              "New end date in ISO 8601 format (YYYY-MM-DD), or null to clear",
          },
          delivered_on: {
            type: ["string", "null"],
            description:
              "Delivery date in ISO 8601 format (YYYY-MM-DD), or null to clear",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["budget_id"],
      },
    },
    {
      name: "productive_mark_budget_delivered",
      description:
        'Mark a budget as delivered with its delivery date. This sets the delivered_on field.\n\nExample:\n{\n  "budget_id": "5678",\n  "delivered_on": "2025-01-15"\n}',
      inputSchema: {
        type: "object",
        properties: {
          budget_id: {
            type: "string",
            description: "Budget ID (required)",
          },
          delivered_on: {
            type: "string",
            description: "Delivery date in ISO 8601 format (YYYY-MM-DD)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["budget_id", "delivered_on"],
      },
    },
    {
      name: "productive_close_budget",
      description:
        'Close a budget. Sets the budget status to closed.\n\nExample:\n{\n  "budget_id": "5678"\n}',
      inputSchema: {
        type: "object",
        properties: {
          budget_id: {
            type: "string",
            description: "Budget ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["budget_id"],
      },
    },
    {
      name: "productive_audit_project_budgets",
      description:
        'Audit project budgets to find issues. Checks for:\n- Open budgets without end dates\n- Open budgets with expired end dates (not delivered)\n- Projects without any open budgets\n\nExample:\n{\n  "project_id": "1234"\n}',
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description:
              "Optional project ID to audit. If not provided, audits all open budgets.",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },

    // Revenue Distribution tools
    {
      name: "productive_list_revenue_distributions",
      description:
        'List revenue distributions. Revenue distributions define how budget revenue is spread over time.\n\nExample:\n{\n  "deal_id": "5678",\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          deal_id: {
            type: "string",
            description: "Filter by budget/deal ID",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_revenue_distribution",
      description:
        'Get details of a specific revenue distribution by ID.\n\nExample:\n{\n  "distribution_id": "98765"\n}',
      inputSchema: {
        type: "object",
        properties: {
          distribution_id: {
            type: "string",
            description: "Revenue distribution ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["distribution_id"],
      },
    },
    {
      name: "productive_create_revenue_distribution",
      description:
        'Create a new revenue distribution for a budget.\n\nExample:\n{\n  "deal_id": "5678",\n  "start_on": "2025-01-01",\n  "end_on": "2025-03-31",\n  "amount_percent": 100\n}',
      inputSchema: {
        type: "object",
        properties: {
          deal_id: {
            type: "string",
            description: "Budget/deal ID (required)",
          },
          start_on: {
            type: "string",
            description: "Start date in ISO 8601 format (YYYY-MM-DD)",
          },
          end_on: {
            type: "string",
            description: "End date in ISO 8601 format (YYYY-MM-DD)",
          },
          amount_percent: {
            type: "number",
            description: "Percentage of budget to distribute (0-100)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["deal_id", "start_on", "end_on", "amount_percent"],
      },
    },
    {
      name: "productive_update_revenue_distribution",
      description:
        'Update a revenue distribution. You can update the dates or amount percentage.\n\nExample:\n{\n  "distribution_id": "98765",\n  "end_on": "2025-04-30"\n}',
      inputSchema: {
        type: "object",
        properties: {
          distribution_id: {
            type: "string",
            description: "Revenue distribution ID (required)",
          },
          start_on: {
            type: "string",
            description: "New start date in ISO 8601 format (YYYY-MM-DD)",
          },
          end_on: {
            type: "string",
            description: "New end date in ISO 8601 format (YYYY-MM-DD)",
          },
          amount_percent: {
            type: "number",
            description: "New percentage of budget to distribute (0-100)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["distribution_id"],
      },
    },
    {
      name: "productive_delete_revenue_distribution",
      description:
        'Delete a revenue distribution.\n\nExample:\n{\n  "distribution_id": "98765"\n}',
      inputSchema: {
        type: "object",
        properties: {
          distribution_id: {
            type: "string",
            description: "Revenue distribution ID (required)",
          },
        },
        required: ["distribution_id"],
      },
    },
    {
      name: "productive_extend_revenue_distribution",
      description:
        'Extend a revenue distribution end date. Use this to extend the end date when a project delivery is delayed.\n\nExample:\n{\n  "distribution_id": "98765",\n  "new_end_on": "2025-04-30"\n}',
      inputSchema: {
        type: "object",
        properties: {
          distribution_id: {
            type: "string",
            description: "Revenue distribution ID (required)",
          },
          new_end_on: {
            type: "string",
            description: "New end date in ISO 8601 format (YYYY-MM-DD)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["distribution_id", "new_end_on"],
      },
    },
    {
      name: "productive_report_overdue_distributions",
      description:
        'Report revenue distributions that are past their end date. Identifies distributions where the end date has passed but the associated budget is not marked as delivered.\n\nExample:\n{\n  "project_id": "1234",\n  "as_of_date": "2025-01-15"\n}',
      inputSchema: {
        type: "object",
        properties: {
          as_of_date: {
            type: "string",
            description:
              "Reference date for checking overdue status (YYYY-MM-DD). Defaults to today.",
          },
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },

    // Service tools
    {
      name: "productive_list_services",
      description:
        'List services in Productive.io. Services are line items for budgets that form the basis for resourcing, time and expense tracking. Filter by budget, project, person, or billing type.\n\nExample:\n{\n  "deal_id": "5678",\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          deal_id: {
            type: "string",
            description: "Filter by budget/deal ID",
          },
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          person_id: {
            type: "string",
            description: "Filter by person ID",
          },
          billing_type: {
            type: "string",
            enum: ["Fixed", "Time and Materials", "Non-Billable"],
            description: "Filter by billing type",
          },
          time_tracking_enabled: {
            type: "boolean",
            description: "Filter by time tracking enabled",
          },
          expense_tracking_enabled: {
            type: "boolean",
            description: "Filter by expense tracking enabled",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_service",
      description:
        'Get details of a specific service by ID. Returns full service information including billing type, pricing, tracking configuration, and financial data.\n\nExample:\n{\n  "service_id": "12345"\n}',
      inputSchema: {
        type: "object",
        properties: {
          service_id: {
            type: "string",
            description: "Service ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["service_id"],
      },
    },
    {
      name: "productive_create_service",
      description:
        'Create a new service (budget line item) in Productive.io. Services belong to a budget/deal and require a service type.\n\nBilling types: Fixed, Time and Materials, Non-Billable\nUnits: Hour, Piece, Day\n\nIMPORTANT: Both deal_id and service_type_id are REQUIRED. Use productive_list_budgets and productive_list_service_types to find valid IDs.\n\nExample:\n{\n  "name": "Development",\n  "deal_id": "5678",\n  "service_type_id": "1234",\n  "billing_type": "Time and Materials",\n  "unit": "Hour",\n  "price": "150.00"\n}',
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Service name (1-200 characters)",
          },
          description: {
            type: "string",
            description: "Optional service description (max 5000 characters)",
          },
          deal_id: {
            type: "string",
            description:
              "Budget/deal ID (required). Use productive_list_budgets to find budget IDs",
          },
          service_type_id: {
            type: "string",
            description:
              "Service type ID (required). Use productive_list_service_types to find service type IDs",
          },
          billing_type: {
            type: "string",
            enum: ["Fixed", "Time and Materials", "Non-Billable"],
            description: "Billing type (default: Time and Materials)",
            default: "Time and Materials",
          },
          unit: {
            type: "string",
            enum: ["Hour", "Piece", "Day"],
            description: "Unit of measurement (default: Hour)",
            default: "Hour",
          },
          price: {
            type: "string",
            description: "Price per unit (e.g. '150.00')",
          },
          quantity: {
            type: "string",
            description: "Quantity (e.g. '100')",
          },
          person_id: {
            type: "string",
            description:
              "Optional person ID to assign. Use productive_list_people to find person IDs",
          },
          time_tracking_enabled: {
            type: "boolean",
            description: "Enable time tracking (default: true)",
            default: true,
          },
          expense_tracking_enabled: {
            type: "boolean",
            description: "Enable expense tracking (default: false)",
            default: false,
          },
          booking_tracking_enabled: {
            type: "boolean",
            description: "Enable booking tracking (default: false)",
            default: false,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["name", "deal_id", "service_type_id"],
      },
    },
    {
      name: "productive_update_service",
      description:
        'Update an existing service. You can update the name, description, billing type, unit, price, quantity, or tracking settings.\n\nExample:\n{\n  "service_id": "12345",\n  "price": "175.00",\n  "time_tracking_enabled": true\n}',
      inputSchema: {
        type: "object",
        properties: {
          service_id: {
            type: "string",
            description: "Service ID (required)",
          },
          name: {
            type: "string",
            description: "New service name (1-200 characters)",
          },
          description: {
            type: ["string", "null"],
            description: "New description (or null to clear)",
          },
          billing_type: {
            type: "string",
            enum: ["Fixed", "Time and Materials", "Non-Billable"],
            description: "New billing type",
          },
          unit: {
            type: "string",
            enum: ["Hour", "Piece", "Day"],
            description: "New unit of measurement",
          },
          price: {
            type: "string",
            description: "New price per unit",
          },
          quantity: {
            type: "string",
            description: "New quantity",
          },
          time_tracking_enabled: {
            type: "boolean",
            description: "Enable/disable time tracking",
          },
          expense_tracking_enabled: {
            type: "boolean",
            description: "Enable/disable expense tracking",
          },
          booking_tracking_enabled: {
            type: "boolean",
            description: "Enable/disable booking tracking",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["service_id"],
      },
    },

    // Service Type tools
    {
      name: "productive_list_service_types",
      description:
        'List service types in Productive.io. Service types classify services (e.g. "Development", "Design", "Consulting"). Use these when creating services.\n\nExample:\n{\n  "query": "dev",\n  "limit": 20\n}',
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search by name (partial match)",
          },
          person_id: {
            type: "string",
            description: "Filter by assigned person ID",
          },
          limit: {
            type: "number",
            description: "Number of results to return (1-100, default: 20)",
            default: 20,
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default: 0)",
            default: 0,
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
      },
    },
    {
      name: "productive_get_service_type",
      description:
        'Get details of a specific service type by ID.\n\nExample:\n{\n  "service_type_id": "1234"\n}',
      inputSchema: {
        type: "object",
        properties: {
          service_type_id: {
            type: "string",
            description: "Service type ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["service_type_id"],
      },
    },
    {
      name: "productive_create_service_type",
      description:
        'Create a new service type. Service types classify services within budgets.\n\nExample:\n{\n  "name": "Development",\n  "description": "Software development services"\n}',
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Service type name (1-200 characters, required)",
          },
          description: {
            type: "string",
            description: "Optional description (max 5000 characters)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "productive_update_service_type",
      description:
        'Update a service type name or description.\n\nExample:\n{\n  "service_type_id": "1234",\n  "name": "Backend Development"\n}',
      inputSchema: {
        type: "object",
        properties: {
          service_type_id: {
            type: "string",
            description: "Service type ID (required)",
          },
          name: {
            type: "string",
            description: "New name (1-200 characters)",
          },
          description: {
            type: ["string", "null"],
            description: "New description (or null to clear)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["service_type_id"],
      },
    },
    {
      name: "productive_archive_service_type",
      description:
        'Archive a service type. Archived service types cannot be used for new services.\n\nExample:\n{\n  "service_type_id": "1234"\n}',
      inputSchema: {
        type: "object",
        properties: {
          service_type_id: {
            type: "string",
            description: "Service type ID (required)",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["service_type_id"],
      },
    },
  ],
}));

// Safe logging function that won't crash on EPIPE
function safeLog(message: string, data?: unknown): void {
  try {
    if (data) {
      console.error(message, data);
    } else {
      console.error(message);
    }
  } catch (err) {
    // Ignore logging errors
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Log incoming tool call
  safeLog("[MCP Tool Call]", {
    tool: name,
    args: JSON.stringify(args, null, 2),
  });

  try {
    switch (name) {
      // Project tools
      case "productive_list_projects": {
        const validated = ListProjectsSchema.parse(args);
        const result = await listProjects(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_list_task_lists": {
        const validated = ListTaskListsSchema.parse(args);
        const result = await listTaskLists(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_list_people": {
        const validated = ListPeopleSchema.parse(args);
        const result = await listPeople(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Board tools
      case "productive_list_boards": {
        const validated = ListBoardsSchema.parse(args);
        const result = await listBoards(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Task list tools
      case "productive_get_task_list": {
        const validated = GetTaskListSchema.parse(args);
        const result = await getTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_create_task_list": {
        const validated = CreateTaskListSchema.parse(args);
        const result = await createTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_task_list": {
        const validated = UpdateTaskListSchema.parse(args);
        const result = await updateTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_archive_task_list": {
        const validated = ArchiveTaskListSchema.parse(args);
        const result = await archiveTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_restore_task_list": {
        const validated = RestoreTaskListSchema.parse(args);
        const result = await restoreTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_delete_task_list": {
        const validated = DeleteTaskListSchema.parse(args);
        const result = await deleteTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_reposition_task_list": {
        const validated = RepositionTaskListSchema.parse(args);
        const result = await repositionTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_move_task_list": {
        const validated = MoveTaskListSchema.parse(args);
        const result = await moveTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_copy_task_list": {
        const validated = CopyTaskListSchema.parse(args);
        const result = await copyTaskList(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Task tools
      case "productive_create_task": {
        const validated = CreateTaskSchema.parse(args);
        const result = await createTask(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_search_tasks": {
        const validated = SearchTasksSchema.parse(args);
        const result = await searchTasks(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_task": {
        const validated = GetTaskSchema.parse(args);
        const result = await getTask(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_task": {
        const validated = UpdateTaskSchema.parse(args);
        const result = await updateTask(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Todo tools
      case "productive_create_todo": {
        const validated = CreateTodoSchema.parse(args);
        const result = await createTodo(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_list_todos": {
        const validated = ListTodosSchema.parse(args);
        const result = await listTodos(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_todo": {
        const validated = UpdateTodoSchema.parse(args);
        const result = await updateTodo(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_delete_todo": {
        const validated = DeleteTodoSchema.parse(args);
        const result = await deleteTodo(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Page tools
      case "productive_list_pages": {
        const validated = ListPagesSchema.parse(args);
        const result = await listPages(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_page": {
        const validated = GetPageSchema.parse(args);
        const result = await getPage(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_create_page": {
        const validated = CreatePageSchema.parse(args);
        const result = await createPage(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_page": {
        const validated = UpdatePageSchema.parse(args);
        const result = await updatePage(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_delete_page": {
        const validated = DeletePageSchema.parse(args);
        const result = await deletePage(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_search_pages": {
        const validated = SearchPagesSchema.parse(args);
        const result = await searchPages(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Batch tools
      case "productive_create_tasks_batch": {
        const validated = CreateTasksBatchSchema.parse(args);
        const result = await createTasksBatch(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Task dependency tools
      case "productive_create_task_dependency": {
        const validated = CreateTaskDependencySchema.parse(args);
        const result = await createTaskDependency(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_list_task_dependencies": {
        const validated = ListTaskDependenciesSchema.parse(args);
        const result = await listTaskDependencies(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_task_dependency": {
        const validated = GetTaskDependencySchema.parse(args);
        const result = await getTaskDependency(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_task_dependency": {
        const validated = UpdateTaskDependencySchema.parse(args);
        const result = await updateTaskDependency(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_delete_task_dependency": {
        const validated = DeleteTaskDependencySchema.parse(args);
        const result = await deleteTaskDependency(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Workflow helper tools
      case "productive_mark_as_blocked_by": {
        const validated = MarkAsBlockedBySchema.parse(args);
        const result = await markAsBlockedBy(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_mark_as_duplicate": {
        const validated = MarkAsDuplicateSchema.parse(args);
        const result = await markAsDuplicate(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Attachment tools
      case "productive_list_attachments": {
        const validated = ListAttachmentsSchema.parse(args);
        const result = await listAttachments(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_upload_attachment": {
        const validated = UploadAttachmentSchema.parse(args);
        const result = await uploadAttachment(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Comment tools
      case "productive_list_comments": {
        const validated = ListCommentsSchema.parse(args);
        const result = await listComments(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Sub-task tools
      case "productive_list_subtasks": {
        const validated = ListSubtasksSchema.parse(args);
        const result = await listSubtasks(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Budget tools
      case "productive_list_budgets": {
        const validated = ListBudgetsSchema.parse(args);
        const result = await listBudgets(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_budget": {
        const validated = GetBudgetSchema.parse(args);
        const result = await getBudget(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_budget": {
        const validated = UpdateBudgetSchema.parse(args);
        const result = await updateBudget(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_mark_budget_delivered": {
        const validated = MarkBudgetDeliveredSchema.parse(args);
        const result = await markBudgetDelivered(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_close_budget": {
        const validated = CloseBudgetSchema.parse(args);
        const result = await closeBudget(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_audit_project_budgets": {
        const validated = AuditProjectBudgetsSchema.parse(args);
        const result = await auditProjectBudgets(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Revenue Distribution tools
      case "productive_list_revenue_distributions": {
        const validated = ListRevenueDistributionsSchema.parse(args);
        const result = await listRevenueDistributions(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_revenue_distribution": {
        const validated = GetRevenueDistributionSchema.parse(args);
        const result = await getRevenueDistribution(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_create_revenue_distribution": {
        const validated = CreateRevenueDistributionSchema.parse(args);
        const result = await createRevenueDistribution(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_revenue_distribution": {
        const validated = UpdateRevenueDistributionSchema.parse(args);
        const result = await updateRevenueDistribution(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_delete_revenue_distribution": {
        const validated = DeleteRevenueDistributionSchema.parse(args);
        const result = await deleteRevenueDistribution(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_extend_revenue_distribution": {
        const validated = ExtendRevenueDistributionSchema.parse(args);
        const result = await extendRevenueDistribution(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_report_overdue_distributions": {
        const validated = ReportOverdueDistributionsSchema.parse(args);
        const result = await reportOverdueDistributions(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Service tools
      case "productive_list_services": {
        const validated = ListServicesSchema.parse(args);
        const result = await listServices(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_service": {
        const validated = GetServiceSchema.parse(args);
        const result = await getService(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_create_service": {
        const validated = CreateServiceSchema.parse(args);
        const result = await createService(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_service": {
        const validated = UpdateServiceSchema.parse(args);
        const result = await updateService(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      // Service Type tools
      case "productive_list_service_types": {
        const validated = ListServiceTypesSchema.parse(args);
        const result = await listServiceTypes(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_get_service_type": {
        const validated = GetServiceTypeSchema.parse(args);
        const result = await getServiceType(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_create_service_type": {
        const validated = CreateServiceTypeSchema.parse(args);
        const result = await createServiceType(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_update_service_type": {
        const validated = UpdateServiceTypeSchema.parse(args);
        const result = await updateServiceType(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      case "productive_archive_service_type": {
        const validated = ArchiveServiceTypeSchema.parse(args);
        const result = await archiveServiceType(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }

      default:
        safeLog("[MCP Tool Error]", { tool: name, error: "Unknown tool" });
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Log detailed error information
    safeLog("[MCP Tool Error]", {
      tool: name,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  // Handle transport errors gracefully
  process.stdout.on("error", (err) => {
    if (err.code === "EPIPE") {
      // Client disconnected, exit gracefully
      process.exit(0);
    }
  });

  process.stderr.on("error", (err) => {
    if (err.code === "EPIPE") {
      // Client disconnected, exit gracefully
      process.exit(0);
    }
  });

  await server.connect(transport);
  safeLog("Productive MCP server running on stdio");
}

main().catch((error) => {
  safeLog("Fatal error:", error);
  process.exit(1);
});
