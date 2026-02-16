/**
 * Todo-related MCP tools
 */

import { z } from 'zod';
import type { ProductiveClient } from '../client.js';
import type {
  JSONAPIResponse,
  Todo,
  CreateTodoPayload,
  UpdateTodoPayload,
  FormattedTodo,
} from '../types.js';
import { formatResponse, truncateResponse } from '../utils/formatting.js';
import {
  CreateTodoSchema,
  ListTodosSchema,
  GetTodoSchema,
  UpdateTodoSchema,
  DeleteTodoSchema,
} from '../schemas/todo.js';

/**
 * Format a todo for display
 */
function formatTodo(todo: Todo): FormattedTodo {
  const attributes = todo.attributes!;

  // Extract task ID from relationships
  let taskId: string | null = null;
  if (todo.relationships?.task?.data && 'id' in todo.relationships.task.data) {
    taskId = todo.relationships.task.data.id;
  }

  // Extract assignee ID from relationships
  let assigneeId: string | null = null;
  if (todo.relationships?.assignee?.data && 'id' in todo.relationships.assignee.data) {
    assigneeId = todo.relationships.assignee.data.id;
  }

  return {
    id: todo.id,
    description: attributes.description,
    closed: attributes.closed,
    due_date: attributes.due_date,
    task_id: taskId,
    assignee_id: assigneeId,
    created_at: attributes.created_at,
  };
}

/**
 * Format todo as markdown
 */
function formatTodoMarkdown(todo: FormattedTodo): string {
  const status = todo.closed ? '✓' : '○';
  let markdown = `${status} ${todo.description}\n`;
  markdown += `  ID: ${todo.id}\n`;
  if (todo.due_date) {
    markdown += `  Due: ${todo.due_date}\n`;
  }
  if (todo.assignee_id) {
    markdown += `  Assignee ID: ${todo.assignee_id}\n`;
  }
  return markdown;
}

/**
 * Format list of todos as markdown
 */
function formatTodoListMarkdown(todos: FormattedTodo[]): string {
  if (todos.length === 0) {
    return 'No todos found.';
  }

  let markdown = `# Todo Items (${todos.length})\n\n`;
  todos.forEach((todo) => {
    markdown += formatTodoMarkdown(todo) + '\n';
  });

  return markdown.trim();
}

/**
 * Create a single todo item
 */
export async function createTodo(
  client: ProductiveClient,
  args: z.infer<typeof CreateTodoSchema>
): Promise<string> {
  const payload: CreateTodoPayload = {
    data: {
      type: 'todos',
      attributes: {
        description: args.description,
      },
      relationships: {
        task: {
          data: {
            type: 'tasks',
            id: args.task_id,
          },
        },
      },
    },
  };

  // Add optional attributes
  if (args.due_date) {
    payload.data.attributes.due_date = args.due_date;
  }
  if (args.closed !== undefined) {
    payload.data.attributes.closed = args.closed;
  }

  // Add optional assignee relationship
  if (args.assignee_id && payload.data.relationships) {
    payload.data.relationships.assignee = {
      data: {
        type: 'people',
        id: args.assignee_id,
      },
    };
  }

  const response = await client.post<JSONAPIResponse>('/todos', payload);
  const todoData = Array.isArray(response.data) ? response.data[0] : response.data;
  const todo = formatTodo(todoData as Todo);

  const result = formatResponse(
    todo,
    args.response_format,
    () => `Todo created successfully:\n\n${formatTodoMarkdown(todo)}`
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List todos for a task
 */
export async function listTodos(
  client: ProductiveClient,
  args: z.infer<typeof ListTodosSchema>
): Promise<string> {
  const params: Record<string, unknown> = {
    'filter[task_id]': args.task_id,
    'page[size]': 200, // Get all todos for the task
  };

  const response = await client.get<JSONAPIResponse>('/todos', params);

  const todos = (Array.isArray(response.data) ? response.data : [response.data])
    .map((todo) => formatTodo(todo as Todo));

  const result = formatResponse(
    { todos, count: todos.length },
    args.response_format,
    () => formatTodoListMarkdown(todos)
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a specific todo
 */
export async function getTodo(
  client: ProductiveClient,
  args: z.infer<typeof GetTodoSchema>
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(`/todos/${args.todo_id}`);

  const todoData = Array.isArray(response.data) ? response.data[0] : response.data;
  const todo = formatTodo(todoData as Todo);

  const result = formatResponse(
    todo,
    args.response_format,
    () => formatTodoMarkdown(todo)
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a todo
 */
export async function updateTodo(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTodoSchema>
): Promise<string> {
  const payload: UpdateTodoPayload = {
    data: {
      type: 'todos',
      id: args.todo_id,
    },
  };

  // Build attributes object only if there are attributes to update
  const attributes: Record<string, unknown> = {};

  if (args.description !== undefined) {
    attributes.description = args.description;
  }
  if (args.due_date !== undefined) {
    attributes.due_date = args.due_date;
  }
  if (args.closed !== undefined) {
    attributes.closed = args.closed;
  }

  if (Object.keys(attributes).length > 0) {
    payload.data.attributes = attributes;
  }

  const response = await client.patch<JSONAPIResponse>(
    `/todos/${args.todo_id}`,
    payload
  );

  const todoData = Array.isArray(response.data) ? response.data[0] : response.data;
  const todo = formatTodo(todoData as Todo);

  const result = formatResponse(
    todo,
    args.response_format,
    () => `Todo updated successfully:\n\n${formatTodoMarkdown(todo)}`
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a todo
 */
export async function deleteTodo(
  client: ProductiveClient,
  args: z.infer<typeof DeleteTodoSchema>
): Promise<string> {
  await client.delete(`/todos/${args.todo_id}`);
  return `Todo ${args.todo_id} deleted successfully.`;
}
