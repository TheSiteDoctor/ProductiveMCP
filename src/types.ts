/**
 * TypeScript interfaces for Productive.io API types
 */

// JSON:API base structure
export interface JSONAPIData<T = unknown> {
  type: string;
  id?: string;
  attributes?: T;
  relationships?: Record<string, JSONAPIRelationship>;
}

export interface JSONAPIRelationship {
  data: JSONAPIResourceIdentifier | JSONAPIResourceIdentifier[] | null;
}

export interface JSONAPIResourceIdentifier {
  type: string;
  id: string;
}

export interface JSONAPIResponse<T = unknown> {
  data: JSONAPIData<T> | JSONAPIData<T>[];
  included?: JSONAPIData[];
  meta?: {
    total_count?: number;
    current_page?: number;
    total_pages?: number;
  };
}

// Task types
export interface TaskAttributes {
  title: string;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  initial_estimate?: number | null;
  closed: boolean;
  created_at: string;
  updated_at: string;
  number?: number;
  custom_fields?: Record<string, string | number>;
}

export interface Task extends JSONAPIData<TaskAttributes> {
  type: "tasks";
  id: string;
}

// Project types
export interface ProjectAttributes {
  name: string;
  project_number?: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project extends JSONAPIData<ProjectAttributes> {
  type: "projects";
  id: string;
}

// Task list types
export interface TaskListAttributes {
  name: string;
  position: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TaskList extends JSONAPIData<TaskListAttributes> {
  type: "task_lists";
  id: string;
}

// Board types
export interface BoardAttributes {
  name: string;
  position: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Board extends JSONAPIData<BoardAttributes> {
  type: "boards";
  id: string;
}

export interface FormattedBoard {
  id: string;
  name: string;
  position: number | null;
  archived: boolean;
}

// Task list payloads
export interface CreateTaskListPayload {
  data: {
    type: "task_lists";
    attributes: {
      name: string;
    };
    relationships: {
      project: {
        data: {
          type: "projects";
          id: string;
        };
      };
      board: {
        data: {
          type: "boards";
          id: string;
        };
      };
    };
  };
}

export interface UpdateTaskListPayload {
  data: {
    type: "task_lists";
    id: string;
    attributes?: {
      name?: string;
    };
  };
}

export interface RepositionTaskListPayload {
  data: {
    type: "task_lists";
    attributes: {
      move_before_id: number;
    };
  };
}

export interface MoveTaskListPayload {
  data: {
    type: "task_lists";
    id: string;
    relationships: {
      board: {
        data: {
          type: "boards";
          id: string;
        };
      };
    };
  };
}

export interface CopyTaskListPayload {
  data: {
    type: "task_lists";
    attributes: {
      template_id: number;
      name: string;
      copy_open_tasks: boolean;
      copy_assignees: boolean;
    };
    relationships: {
      project: {
        data: {
          type: "projects";
          id: string;
        };
      };
      board: {
        data: {
          type: "boards";
          id: string;
        };
      };
    };
  };
}

// Person types
export interface PersonAttributes {
  first_name: string;
  last_name: string;
  email: string;
  active: boolean;
}

export interface Person extends JSONAPIData<PersonAttributes> {
  type: "people";
  id: string;
}

// Response format enum
export type ResponseFormat = "markdown" | "json";

// Todo types
export interface TodoAttributes {
  description: string;
  closed_at: string | null;
  closed: boolean;
  due_date: string | null;
  created_at: string;
  todoable_type: "task" | "deal";
  due_time: string | null;
  position: number;
}

export interface Todo extends JSONAPIData<TodoAttributes> {
  type: "todos";
  id: string;
}

export interface CreateTodoPayload {
  data: {
    type: "todos";
    attributes: {
      description: string;
      due_date?: string;
      closed?: boolean;
    };
    relationships: {
      task?: {
        data: {
          type: "tasks";
          id: string;
        };
      };
      assignee?: {
        data: {
          type: "people";
          id: string;
        };
      };
    };
  };
}

export interface UpdateTodoPayload {
  data: {
    type: "todos";
    id: string;
    attributes?: {
      description?: string;
      due_date?: string | null;
      closed?: boolean;
    };
  };
}

export interface FormattedTodo {
  id: string;
  description: string;
  closed: boolean;
  due_date: string | null;
  task_id: string | null;
  assignee_id: string | null;
  created_at: string;
}

// Task creation payload
export interface CreateTaskPayload {
  data: {
    type: "tasks";
    attributes: {
      title: string;
      description?: string;
      due_date?: string;
      start_date?: string;
      initial_estimate?: number;
      custom_fields?: Record<string, string>;
      label_list?: string[];
    };
    relationships?: {
      project?: {
        data: {
          type: "projects";
          id: string;
        };
      };
      task_list?: {
        data: {
          type: "task_lists";
          id: string;
        };
      };
      assignee?: {
        data: {
          type: "people";
          id: string;
        };
      };
      parent_task?: {
        data: {
          type: "tasks";
          id: string;
        };
      };
      workflow_status?: {
        data: {
          type: "workflow_statuses";
          id: string;
        };
      };
    };
  };
}

// Task update payload
export interface UpdateTaskPayload {
  data: {
    type: "tasks";
    id: string;
    attributes?: {
      title?: string;
      description?: string | null;
      due_date?: string | null;
      start_date?: string | null;
      initial_estimate?: number;
      closed?: boolean;
      custom_fields?: Record<string, string | number>;
    };
    relationships?: {
      assignee?: {
        data: {
          type: "people";
          id: string;
        } | null;
      };
      workflow_status?: {
        data: {
          type: "workflow_statuses";
          id: string;
        };
      };
    };
  };
}

// Re-export attachment types
export type {
  Attachment,
  AttachmentAttributes,
  FormattedAttachment,
} from "./types/attachment.js";

// Formatted responses
export interface FormattedTask {
  id: string;
  number: number | null;
  title: string;
  description: string | null;
  project_id: string | null;
  project_name: string | null;
  task_list_id: string | null;
  task_list_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  estimate_minutes: number | null;
  task_type: string | null;
  priority: string | null;
  workflow_status: string | null;
  closed: boolean;
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  url: string | null;
  attachments: Array<import("./types/attachment.js").FormattedAttachment>;
}

export interface FormattedProject {
  id: string;
  name: string;
  project_number: string | null;
  archived: boolean;
  client_id: string | null;
  client_name: string | null;
}

export interface FormattedTaskList {
  id: string;
  name: string;
  position: number | null;
  sort_order: number | null;
  archived: boolean;
  board_id: string | null;
  project_id: string | null;
}

export interface FormattedPerson {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

// Page types
export interface PageAttributes {
  title: string;
  body?: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  parent_page_id: string | null;
  root_page_id: string | null;
  public_access: boolean;
  public_uuid: string | null;
  version_number?: string | null;
}

export interface Page extends JSONAPIData<PageAttributes> {
  type: "pages";
  id: string;
}

export interface CreatePagePayload {
  data: {
    type: "pages";
    attributes: {
      title: string;
      body?: string;
      version_number?: string;
    };
    relationships?: {
      project?: {
        data: {
          type: "projects";
          id: string;
        };
      };
      parent_page?: {
        data: {
          type: "pages";
          id: string;
        };
      };
    };
  };
}

export interface UpdatePagePayload {
  data: {
    type: "pages";
    id: string;
    attributes?: {
      title?: string;
      body?: string | null;
    };
  };
}

export interface FormattedPage {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  parent_page_id: string | null;
  root_page_id: string | null;
  public_access: boolean;
  public_uuid: string | null;
  version_number: string | null;
  project_id: string | null;
  project_name: string | null;
  creator_id: string | null;
  creator_name: string | null;
  url: string | null;
}

// Batch operation results
export interface BatchTaskResult {
  success: boolean;
  task?: FormattedTask;
  error?: string;
  index: number;
  title: string;
}

export interface BatchOperationSummary {
  total: number;
  successful: number;
  failed: number;
  results: BatchTaskResult[];
}

// Task dependency types
export type DependencyType = "blocking" | "waiting_on" | "related";

export interface TaskDependencyAttributes {
  type_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskDependency extends JSONAPIData<TaskDependencyAttributes> {
  type: "task_dependencies";
  id: string;
}

export interface CreateTaskDependencyPayload {
  data: {
    type: "task_dependencies";
    attributes: {
      task_id: number;
      dependent_task_id: number;
      type_id: number;
    };
  };
}

export interface UpdateTaskDependencyPayload {
  data: {
    type: "task_dependencies";
    id: string;
    attributes: {
      type_id: number;
    };
  };
}

export interface FormattedTaskDependency {
  id: string;
  task_id: string;
  task_title: string | null;
  dependent_task_id: string;
  dependent_task_title: string | null;
  dependency_type: DependencyType;
  created_at: string | null;
}

// Comment types
export interface CommentAttributes {
  body: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
}

export interface Comment extends JSONAPIData<CommentAttributes> {
  type: "comments";
  id: string;
}

export interface FormattedComment {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  author_id: string | null;
  author_name: string | null;
  task_id: string | null;
}

export interface CreateCommentPayload {
  data: {
    type: "comments";
    attributes: {
      body: string;
    };
    relationships: {
      task: {
        data: {
          type: "tasks";
          id: string;
        };
      };
    };
  };
}

export interface UpdateCommentPayload {
  data: {
    type: "comments";
    id: string;
    attributes?: {
      body?: string;
    };
  };
}

// Budget types (deals with budget=true)
export interface BudgetAttributes {
  name: string;
  budget: boolean;
  budget_status: number; // 1=open, 2=closed
  date: string | null; // start date
  end_date: string | null;
  delivered_on: string | null;
  total: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget extends JSONAPIData<BudgetAttributes> {
  type: "deals";
  id: string;
}

export interface UpdateBudgetPayload {
  data: {
    type: "deals";
    id: string;
    attributes?: {
      name?: string;
      end_date?: string | null;
      delivered_on?: string | null;
      budget_status?: number;
    };
  };
}

export interface FormattedBudget {
  id: string;
  name: string;
  status: "open" | "closed";
  start_date: string | null;
  end_date: string | null;
  delivered_on: string | null;
  total: string | null;
  currency: string | null;
  project_id: string | null;
  project_name: string | null;
  company_id: string | null;
  company_name: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  created_at: string;
  url: string | null;
}

export interface BudgetAuditIssue {
  budget_id: string;
  budget_name: string;
  project_id: string | null;
  project_name: string | null;
  issue_type: "no_end_date" | "expired_end_date" | "no_open_budget";
  details: string;
}

export interface BudgetAuditResult {
  total_budgets_checked: number;
  issues_found: number;
  issues: BudgetAuditIssue[];
  projects_without_open_budget: Array<{
    project_id: string;
    project_name: string;
  }>;
}

// Revenue Distribution types
export interface RevenueDistributionAttributes {
  start_on: string;
  end_on: string;
  amount_percent: string;
  created_at: string;
  updated_at: string;
}

export interface RevenueDistribution extends JSONAPIData<RevenueDistributionAttributes> {
  type: "revenue_distributions";
  id: string;
}

export interface CreateRevenueDistributionPayload {
  data: {
    type: "revenue_distributions";
    attributes: {
      start_on: string;
      end_on: string;
      amount_percent: string;
    };
    relationships: {
      deal: {
        data: {
          type: "deals";
          id: string;
        };
      };
    };
  };
}

export interface UpdateRevenueDistributionPayload {
  data: {
    type: "revenue_distributions";
    id: string;
    attributes?: {
      start_on?: string;
      end_on?: string;
      amount_percent?: string;
    };
  };
}

export interface FormattedRevenueDistribution {
  id: string;
  start_on: string;
  end_on: string;
  amount_percent: string;
  deal_id: string | null;
  deal_name: string | null;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
}

export interface OverdueDistributionReport {
  total_checked: number;
  overdue_count: number;
  overdue_distributions: Array<{
    distribution: FormattedRevenueDistribution;
    days_overdue: number;
    budget_delivered: boolean;
  }>;
}

// Service types
export interface ServiceAttributes {
  name: string;
  description: string | null;
  position: number | null;
  billing_type_id: number; // 1=Fixed, 2=Time and Materials, 3=None/Not Billable
  unit_id: number; // 1=Hour, 2=Piece, 3=Day
  price: string | null;
  quantity: string | null;
  billable: boolean;
  time_tracking_enabled: boolean;
  expense_tracking_enabled: boolean;
  booking_tracking_enabled: boolean;
  budget_cap_enabled: boolean;
  budgeted_time: number | null;
  worked_time: number | null;
  billable_time: number | null;
  estimated_time: number | null;
  booked_time: number | null;
  revenue: string | null;
  cost: string | null;
  profit: string | null;
  budget_total: string | null;
  budget_used: string | null;
  markup: string | null;
  discount: string | null;
  profit_margin: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service extends JSONAPIData<ServiceAttributes> {
  type: "services";
  id: string;
}

export interface CreateServicePayload {
  data: {
    type: "services";
    attributes: {
      name: string;
      description?: string;
      billing_type_id: number;
      unit_id: number;
      price?: string;
      quantity?: string;
      time_tracking_enabled?: boolean;
      expense_tracking_enabled?: boolean;
      booking_tracking_enabled?: boolean;
    };
    relationships: {
      deal: {
        data: {
          type: "deals";
          id: string;
        };
      };
      service_type: {
        data: {
          type: "service_types";
          id: string;
        };
      };
      person?: {
        data: {
          type: "people";
          id: string;
        };
      };
    };
  };
}

export interface UpdateServicePayload {
  data: {
    type: "services";
    id: string;
    attributes?: {
      name?: string;
      description?: string | null;
      billing_type_id?: number;
      unit_id?: number;
      price?: string;
      quantity?: string;
      time_tracking_enabled?: boolean;
      expense_tracking_enabled?: boolean;
      booking_tracking_enabled?: boolean;
    };
  };
}

export interface FormattedService {
  id: string;
  name: string;
  description: string | null;
  billing_type: string;
  unit: string;
  price: string | null;
  quantity: string | null;
  billable: boolean;
  time_tracking_enabled: boolean;
  expense_tracking_enabled: boolean;
  booking_tracking_enabled: boolean;
  budget_cap_enabled: boolean;
  budgeted_time: number | null;
  worked_time: number | null;
  revenue: string | null;
  cost: string | null;
  profit: string | null;
  profit_margin: string | null;
  budget_total: string | null;
  budget_used: string | null;
  deal_id: string | null;
  deal_name: string | null;
  service_type_id: string | null;
  service_type_name: string | null;
  person_id: string | null;
  person_name: string | null;
}

// Service Type types
export interface ServiceTypeAttributes {
  name: string;
  description: string | null;
  archived_at: string | null;
}

export interface ServiceType extends JSONAPIData<ServiceTypeAttributes> {
  type: "service_types";
  id: string;
}

export interface CreateServiceTypePayload {
  data: {
    type: "service_types";
    attributes: {
      name: string;
      description?: string;
    };
  };
}

export interface UpdateServiceTypePayload {
  data: {
    type: "service_types";
    id: string;
    attributes?: {
      name?: string;
      description?: string | null;
    };
  };
}

export interface FormattedServiceType {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
}
