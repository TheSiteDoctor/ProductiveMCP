/**
 * Tool registry — maps tool names to { schema, handler } pairs.
 * Shared by both the MCP server (index.ts) and the CLI (cli.ts).
 */

import { z } from "zod";
import type { ProductiveClient } from "./client.js";

// Schemas
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
  CreateMilestoneSchema,
  SearchTasksSchema,
  GetTaskSchema,
  UpdateTaskSchema,
  CreateTasksBatchSchema,
  ListMyTasksDueTodaySchema,
} from "./schemas/task.js";
import {
  StartTimerSchema,
  StopTimerSchema,
  GetRunningTimerSchema,
  UpdateTimerSchema,
} from "./schemas/timer.js";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  DeleteTimeEntrySchema,
  ListTimeEntriesSchema,
} from "./schemas/time-entry.js";
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
import {
  ListCommentsSchema,
  CreateCommentSchema,
  GetCommentSchema,
  UpdateCommentSchema,
  DeleteCommentSchema,
} from "./schemas/comment.js";
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
  ListDealsSchema,
  GetDealSchema,
  SearchDealsSchema,
  UpdateDealSchema,
  CreateDealSchema,
  CreateBudgetSchema,
  ListDealStatusesSchema,
} from "./schemas/deal.js";
import { ListPipelinesSchema } from "./schemas/pipeline.js";
import { ListCompaniesSchema, GetCompanySchema } from "./schemas/company.js";
import { ListCustomFieldsSchema } from "./schemas/custom-field.js";
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

// Tool handlers
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
import {
  createTask,
  createMilestone,
  searchTasks,
  getTask,
  updateTask,
  listMyTasksDueToday,
} from "./tools/tasks.js";
import {
  startTimer,
  stopTimer,
  getRunningTimer,
  updateTimer,
} from "./tools/timers.js";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  listTimeEntries,
} from "./tools/time-entries.js";
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
import {
  listComments,
  createComment,
  getComment,
  updateComment,
  deleteComment,
} from "./tools/comments.js";
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
  listDeals,
  getDeal,
  searchDeals,
  updateDeal,
  createDeal,
  createBudget,
  listDealStatuses,
} from "./tools/deals.js";
import { listPipelines } from "./tools/pipelines.js";
import { listCompanies, getCompany } from "./tools/companies.js";
import { listCustomFields } from "./tools/custom-fields.js";
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

// Task templates
import {
  ListTaskTemplatesSchema,
  GetTaskTemplateSchema,
  ApplyTaskTemplateSchema,
} from "./schemas/template.js";
import {
  listTaskTemplates,
  getTaskTemplate,
  applyTaskTemplate,
} from "./tools/templates.js";

export interface ToolRegistryEntry {
  schema: z.ZodTypeAny;
  handler: (client: ProductiveClient, args: any) => Promise<string>;
}

export const toolRegistry: Record<string, ToolRegistryEntry> = {
  // Project tools
  productive_list_projects: {
    schema: ListProjectsSchema,
    handler: listProjects,
  },
  productive_list_task_lists: {
    schema: ListTaskListsSchema,
    handler: listTaskLists,
  },
  productive_list_people: { schema: ListPeopleSchema, handler: listPeople },
  productive_list_boards: { schema: ListBoardsSchema, handler: listBoards },
  productive_get_task_list: { schema: GetTaskListSchema, handler: getTaskList },
  productive_create_task_list: {
    schema: CreateTaskListSchema,
    handler: createTaskList,
  },
  productive_update_task_list: {
    schema: UpdateTaskListSchema,
    handler: updateTaskList,
  },
  productive_archive_task_list: {
    schema: ArchiveTaskListSchema,
    handler: archiveTaskList,
  },
  productive_restore_task_list: {
    schema: RestoreTaskListSchema,
    handler: restoreTaskList,
  },
  productive_delete_task_list: {
    schema: DeleteTaskListSchema,
    handler: deleteTaskList,
  },
  productive_reposition_task_list: {
    schema: RepositionTaskListSchema,
    handler: repositionTaskList,
  },
  productive_move_task_list: {
    schema: MoveTaskListSchema,
    handler: moveTaskList,
  },
  productive_copy_task_list: {
    schema: CopyTaskListSchema,
    handler: copyTaskList,
  },

  // Task tools
  productive_create_task: { schema: CreateTaskSchema, handler: createTask },
  productive_create_milestone: {
    schema: CreateMilestoneSchema,
    handler: createMilestone,
  },
  productive_search_tasks: { schema: SearchTasksSchema, handler: searchTasks },
  productive_get_task: { schema: GetTaskSchema, handler: getTask },
  productive_update_task: { schema: UpdateTaskSchema, handler: updateTask },
  productive_create_tasks_batch: {
    schema: CreateTasksBatchSchema,
    handler: createTasksBatch,
  },

  // Todo tools
  productive_create_todo: { schema: CreateTodoSchema, handler: createTodo },
  productive_list_todos: { schema: ListTodosSchema, handler: listTodos },
  productive_get_todo: { schema: GetTodoSchema, handler: getTodo },
  productive_update_todo: { schema: UpdateTodoSchema, handler: updateTodo },
  productive_delete_todo: { schema: DeleteTodoSchema, handler: deleteTodo },

  // Page tools
  productive_list_pages: { schema: ListPagesSchema, handler: listPages },
  productive_get_page: { schema: GetPageSchema, handler: getPage },
  productive_create_page: { schema: CreatePageSchema, handler: createPage },
  productive_update_page: { schema: UpdatePageSchema, handler: updatePage },
  productive_delete_page: { schema: DeletePageSchema, handler: deletePage },
  productive_search_pages: { schema: SearchPagesSchema, handler: searchPages },

  // Dependency tools
  productive_create_task_dependency: {
    schema: CreateTaskDependencySchema,
    handler: createTaskDependency,
  },
  productive_list_task_dependencies: {
    schema: ListTaskDependenciesSchema,
    handler: listTaskDependencies,
  },
  productive_get_task_dependency: {
    schema: GetTaskDependencySchema,
    handler: getTaskDependency,
  },
  productive_update_task_dependency: {
    schema: UpdateTaskDependencySchema,
    handler: updateTaskDependency,
  },
  productive_delete_task_dependency: {
    schema: DeleteTaskDependencySchema,
    handler: deleteTaskDependency,
  },

  // Workflow tools
  productive_mark_as_blocked_by: {
    schema: MarkAsBlockedBySchema,
    handler: markAsBlockedBy,
  },
  productive_mark_as_duplicate: {
    schema: MarkAsDuplicateSchema,
    handler: markAsDuplicate,
  },

  // Attachment tools
  productive_list_attachments: {
    schema: ListAttachmentsSchema,
    handler: listAttachments,
  },
  productive_upload_attachment: {
    schema: UploadAttachmentSchema,
    handler: uploadAttachment,
  },

  // Comment tools
  productive_list_comments: {
    schema: ListCommentsSchema,
    handler: listComments,
  },
  productive_create_comment: {
    schema: CreateCommentSchema,
    handler: createComment,
  },
  productive_get_comment: { schema: GetCommentSchema, handler: getComment },
  productive_update_comment: {
    schema: UpdateCommentSchema,
    handler: updateComment,
  },
  productive_delete_comment: {
    schema: DeleteCommentSchema,
    handler: deleteComment,
  },

  // Subtask tools
  productive_list_subtasks: {
    schema: ListSubtasksSchema,
    handler: listSubtasks,
  },

  // Budget tools
  productive_list_budgets: { schema: ListBudgetsSchema, handler: listBudgets },
  productive_get_budget: { schema: GetBudgetSchema, handler: getBudget },
  productive_update_budget: {
    schema: UpdateBudgetSchema,
    handler: updateBudget,
  },
  productive_mark_budget_delivered: {
    schema: MarkBudgetDeliveredSchema,
    handler: markBudgetDelivered,
  },
  productive_close_budget: { schema: CloseBudgetSchema, handler: closeBudget },
  productive_audit_project_budgets: {
    schema: AuditProjectBudgetsSchema,
    handler: auditProjectBudgets,
  },

  // Deal tools
  productive_list_deals: { schema: ListDealsSchema, handler: listDeals },
  productive_get_deal: { schema: GetDealSchema, handler: getDeal },
  productive_search_deals: { schema: SearchDealsSchema, handler: searchDeals },
  productive_create_deal: { schema: CreateDealSchema, handler: createDeal },
  productive_update_deal: { schema: UpdateDealSchema, handler: updateDeal },
  productive_list_deal_statuses: {
    schema: ListDealStatusesSchema,
    handler: listDealStatuses,
  },
  productive_list_pipelines: {
    schema: ListPipelinesSchema,
    handler: listPipelines,
  },

  // Budget create (lives on the same /deals endpoint as deals — budget=true)
  productive_create_budget: {
    schema: CreateBudgetSchema,
    handler: createBudget,
  },

  // Company tools
  productive_list_companies: {
    schema: ListCompaniesSchema,
    handler: listCompanies,
  },
  productive_get_company: { schema: GetCompanySchema, handler: getCompany },

  // Custom field discovery
  productive_list_custom_fields: {
    schema: ListCustomFieldsSchema,
    handler: listCustomFields,
  },

  // Revenue distribution tools
  productive_list_revenue_distributions: {
    schema: ListRevenueDistributionsSchema,
    handler: listRevenueDistributions,
  },
  productive_get_revenue_distribution: {
    schema: GetRevenueDistributionSchema,
    handler: getRevenueDistribution,
  },
  productive_create_revenue_distribution: {
    schema: CreateRevenueDistributionSchema,
    handler: createRevenueDistribution,
  },
  productive_update_revenue_distribution: {
    schema: UpdateRevenueDistributionSchema,
    handler: updateRevenueDistribution,
  },
  productive_delete_revenue_distribution: {
    schema: DeleteRevenueDistributionSchema,
    handler: deleteRevenueDistribution,
  },
  productive_extend_revenue_distribution: {
    schema: ExtendRevenueDistributionSchema,
    handler: extendRevenueDistribution,
  },
  productive_report_overdue_distributions: {
    schema: ReportOverdueDistributionsSchema,
    handler: reportOverdueDistributions,
  },

  // Service tools
  productive_list_services: {
    schema: ListServicesSchema,
    handler: listServices,
  },
  productive_get_service: { schema: GetServiceSchema, handler: getService },
  productive_create_service: {
    schema: CreateServiceSchema,
    handler: createService,
  },
  productive_update_service: {
    schema: UpdateServiceSchema,
    handler: updateService,
  },
  productive_list_service_types: {
    schema: ListServiceTypesSchema,
    handler: listServiceTypes,
  },
  productive_get_service_type: {
    schema: GetServiceTypeSchema,
    handler: getServiceType,
  },
  productive_create_service_type: {
    schema: CreateServiceTypeSchema,
    handler: createServiceType,
  },
  productive_update_service_type: {
    schema: UpdateServiceTypeSchema,
    handler: updateServiceType,
  },
  productive_archive_service_type: {
    schema: ArchiveServiceTypeSchema,
    handler: archiveServiceType,
  },

  // Timer tools
  productive_start_timer: { schema: StartTimerSchema, handler: startTimer },
  productive_stop_timer: { schema: StopTimerSchema, handler: stopTimer },
  productive_get_running_timer: {
    schema: GetRunningTimerSchema,
    handler: getRunningTimer,
  },
  productive_update_timer: {
    schema: UpdateTimerSchema,
    handler: updateTimer,
  },

  // Time entry tools
  productive_create_time_entry: {
    schema: CreateTimeEntrySchema,
    handler: createTimeEntry,
  },
  productive_update_time_entry: {
    schema: UpdateTimeEntrySchema,
    handler: updateTimeEntry,
  },
  productive_delete_time_entry: {
    schema: DeleteTimeEntrySchema,
    handler: deleteTimeEntry,
  },
  productive_list_time_entries: {
    schema: ListTimeEntriesSchema,
    handler: listTimeEntries,
  },

  // Task convenience tools
  productive_list_my_tasks_due_today: {
    schema: ListMyTasksDueTodaySchema,
    handler: listMyTasksDueToday,
  },

  // Task template tools (list/get read template files and need no client)
  productive_list_task_templates: {
    schema: ListTaskTemplatesSchema,
    handler: (_client, args) => listTaskTemplates(args),
  },
  productive_get_task_template: {
    schema: GetTaskTemplateSchema,
    handler: (_client, args) => getTaskTemplate(args),
  },
  productive_apply_task_template: {
    schema: ApplyTaskTemplateSchema,
    handler: applyTaskTemplate,
  },
};
