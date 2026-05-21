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
  type_id?: number | null;
  custom_fields?: Record<string, string | string[] | number>;
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
      custom_fields?: Record<string, string | string[]>;
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
      remaining_time?: number;
      closed?: boolean;
      custom_fields?: Record<string, string | string[] | number>;
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
      task_list?: {
        data: {
          type: "task_lists";
          id: string;
        };
      };
      parent_task?: {
        data: {
          type: "tasks";
          id: string;
        } | null;
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
  labels: string[];
  parent_task_id: string | null;
  is_milestone: boolean;
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

// Productive Document Format (used for Page body content)
export interface ProductiveDocNode {
  type: string;
  content?: ProductiveDocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export interface ProductiveDoc {
  type: "doc";
  content: ProductiveDocNode[];
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
  visible_to_clients: boolean;
  commentable_type?: string | null;
  commentable_id?: string | null;
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
  visible_to_clients: boolean;
  author_id: string | null;
  author_name: string | null;
  task_id: string | null;
  commentable_type: string | null;
  commentable_id: string | null;
}

/**
 * Resource types Productive lets you comment on. Each one is sent under a
 * different relationship key in the create payload.
 */
export type CommentableType =
  | "task"
  | "deal"
  | "project"
  | "discussion"
  | "invoice"
  | "person"
  | "company"
  | "purchase_order";

export interface CreateCommentPayload {
  data: {
    type: "comments";
    attributes: {
      body: string;
      visible_to_clients?: boolean;
    };
    // Polymorphic: exactly one of these is set based on the commentable_type.
    // The relationship key uses the singular form ("deal", "task", etc.) and the
    // target resource type uses the plural form ("deals", "tasks").
    relationships: Record<
      string,
      {
        data: {
          type: string;
          id: string;
        };
      }
    >;
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

// Deal types (deals with budget=false, i.e. sales deals)
export interface DealAttributes {
  name: string;
  budget: boolean;
  date: string | null;
  end_date: string | null;
  probability: number | null;
  revenue: number | null;
  services_revenue: number | null;
  budget_total: number | null;
  profit: number | null;
  profit_margin: number | null;
  currency: string | null;
  note: string | null;
  tag_list: string[] | null;
  sales_closed_at: string | null;
  sales_closed_on: string | null;
  lost_comment: string | null;
  days_since_created: number | null;
  days_since_last_activity: number | null;
  days_in_current_stage: number | null;
  last_activity_at: string | null;
  // Manual deal value (alternative to services-derived value).
  // deal_value: stringified decimal in minor units (cents/pence) — e.g. "250000.0" = £2,500.00
  // deal_value_source: "manual" sets the deal value directly; "from_services" derives it from services
  // deal_value_total: read-only effective value in minor units (cents), sums retainer periods
  deal_value: string | null;
  deal_value_source: "manual" | "from_services" | null;
  deal_value_total: number | null;
  created_at: string;
  updated_at: string;
}

export interface Deal extends JSONAPIData<DealAttributes> {
  type: "deals";
  id: string;
}

export interface FormattedDeal {
  id: string;
  name: string;
  stage_status: "open" | "won" | "lost" | null;
  probability: number | null;
  revenue: number | null;
  services_revenue: number | null;
  budget_total: number | null;
  deal_value: string | null;
  deal_value_source: "manual" | "from_services" | null;
  deal_value_total: number | null;
  profit: number | null;
  profit_margin: number | null;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  sales_closed_on: string | null;
  note: string | null;
  tag_list: string[];
  lost_comment: string | null;
  days_since_created: number | null;
  days_since_last_activity: number | null;
  days_in_current_stage: number | null;
  last_activity_at: string | null;
  project_id: string | null;
  project_name: string | null;
  company_id: string | null;
  company_name: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  deal_status_id: string | null;
  deal_status_name: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  created_at: string;
  url: string | null;
  /**
   * Revenue distributions attached to this deal. Populated when the
   * caller passes them through to `formatDeal` (e.g. getDeal fetches
   * them via /revenue_distributions?filter[deal_id]=X). Empty when not
   * fetched — not the same as "deal has no distributions".
   */
  revenue_distributions?: FormattedRevenueDistribution[];
}

export interface UpdateDealPayload {
  data: {
    type: "deals";
    id: string;
    attributes?: {
      name?: string;
      probability?: number;
      deal_status_id?: number;
      note?: string | null;
      tag_list?: string[];
      // deal_value is sent as integer minor units (cents/pence) per Productive API docs
      deal_value?: number;
      deal_value_source?: "manual" | "from_services";
      // The deal's "Date Opened" surfaces as `date` on the API, not `start_date`.
      date?: string;
      end_date?: string;
      currency?: string;
      custom_fields?: Record<string, unknown>;
    };
    relationships?: {
      responsible?: { data: { type: "people"; id: string } };
    };
  };
}

// Deal Status types (pipeline stages)
export interface DealStatusAttributes {
  name: string;
  position: number | null;
  status_id: number; // 1=open, 2=won, 3=lost
  probability: number | null;
  created_at: string;
}

export interface DealStatus extends JSONAPIData<DealStatusAttributes> {
  type: "deal_statuses";
  id: string;
}

export interface FormattedDealStatus {
  id: string;
  name: string;
  position: number | null;
  stage_status: "open" | "won" | "lost";
  probability: number | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
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

// Timer types
//
// A Productive timer is a thin tracking-session marker — only `started_at`,
// `stopped_at`, `total_time`, and `person_id` live on the resource itself.
// All metadata (service, task, note, billable_time, …) is on the linked
// `time_entry` that Productive auto-mints when you POST /timers.
//
// Verbs supported by the API (empirically discovered against the live org):
//   POST   /timers                   — start (accepts started_at, service)
//   GET    /timers, /timers/{id}     — list / read (use ?include=time_entry)
//   PATCH  /timers/{id}/stop         — stop (empty body)
//   PATCH  /timers/{id}              — 404 (timers are not directly patchable)
//   DELETE /timers/{id}              — 404
// Update note / task / service / billable_time via PATCH /time_entries/{id}.
export interface TimerAttributes {
  person_id: number;
  started_at: string;
  stopped_at: string | null;
  total_time: number; // accumulated minutes (computed by Productive on stop)
}

export interface Timer extends JSONAPIData<TimerAttributes> {
  type: "timers";
  id: string;
}

export interface CreateTimerPayload {
  data: {
    type: "timers";
    attributes: {
      started_at?: string;
    };
    relationships: {
      service: {
        data: {
          type: "services";
          id: string;
        };
      };
    };
  };
}

export interface FormattedTimer {
  id: string;
  started_at: string;
  stopped_at: string | null;
  is_running: boolean;
  elapsed_minutes: number | null;
  billable_minutes: number | null;
  note: string | null;
  service_id: string | null;
  service_name: string | null;
  task_id: string | null;
  task_title: string | null;
  task_number: number | null;
  project_id: string | null;
  project_name: string | null;
  person_id: string | null;
  person_name: string | null;
  url: string | null;
}

// Time entry types
export interface TimeEntryAttributes {
  date: string;
  time: number; // minutes
  billable_time: number | null;
  note: string | null;
  started_at: string | null;
  approved: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface TimeEntry extends JSONAPIData<TimeEntryAttributes> {
  type: "time_entries";
  id: string;
}

export interface CreateTimeEntryPayload {
  data: {
    type: "time_entries";
    attributes: {
      date: string;
      time: number;
      billable_time?: number;
      note?: string;
      started_at?: string;
    };
    relationships: {
      service: {
        data: {
          type: "services";
          id: string;
        };
      };
      task?: {
        data: {
          type: "tasks";
          id: string;
        };
      };
      person: {
        data: {
          type: "people";
          id: string;
        };
      };
    };
  };
}

export interface UpdateTimeEntryPayload {
  data: {
    type: "time_entries";
    id: string;
    attributes?: {
      date?: string;
      time?: number;
      billable_time?: number;
      note?: string | null;
      started_at?: string | null;
    };
    relationships?: {
      service?: {
        data: {
          type: "services";
          id: string;
        };
      };
      task?: {
        data: {
          type: "tasks";
          id: string;
        } | null;
      };
    };
  };
}

export interface FormattedTimeEntry {
  id: string;
  date: string;
  time_minutes: number;
  billable_minutes: number | null;
  note: string | null;
  started_at: string | null;
  approved: boolean | null;
  service_id: string | null;
  service_name: string | null;
  task_id: string | null;
  task_title: string | null;
  task_number: number | null;
  project_id: string | null;
  project_name: string | null;
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

// Pipeline types
export interface PipelineAttributes {
  name: string;
  position: number | null;
  icon_id: string | null;
  pipeline_type_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Pipeline extends JSONAPIData<PipelineAttributes> {
  type: "pipelines";
  id: string;
}

export interface FormattedPipeline {
  id: string;
  name: string;
  position: number | null;
  icon_id: string | null;
  pipeline_type_id: number | null;
}

// Company types
export interface CompanyAttributes {
  name: string;
  billing_name: string | null;
  domain: string | null;
  default_currency: string | null;
  vat: string | null;
  tag_list: string[] | null;
  archived_at: string | null;
  last_activity_at: string | null;
  due_days: number | null;
  payment_terms_type: number | null;
  parent_company_id: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Company extends JSONAPIData<CompanyAttributes> {
  type: "companies";
  id: string;
}

export interface FormattedCompany {
  id: string;
  name: string;
  billing_name: string | null;
  domain: string | null;
  default_currency: string | null;
  tag_list: string[];
  archived: boolean;
  last_activity_at: string | null;
  parent_company_id: string | null;
  url: string | null;
}

// Custom field types
export interface CustomFieldAttributes {
  name: string;
  description: string | null;
  data_type_id: number;
  customizable_type: string;
  required: boolean;
  position: number | null;
  archived_at: string | null;
  aggregation_type_id: number | null;
  formatting_type_id: number | null;
  global: boolean;
  show_in_add_edit_views: boolean;
  sensitive: boolean;
  quick_add_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomField extends JSONAPIData<CustomFieldAttributes> {
  type: "custom_fields";
  id: string;
}

export interface CustomFieldOptionAttributes {
  name: string;
  position: number | null;
  color_id: string | null;
  archived_at: string | null;
}

export interface CustomFieldOption extends JSONAPIData<CustomFieldOptionAttributes> {
  type: "custom_field_options";
  id: string;
}

export interface FormattedCustomFieldOption {
  id: string;
  name: string;
  archived: boolean;
}

export interface FormattedCustomField {
  id: string;
  name: string;
  description: string | null;
  data_type_id: number;
  data_type: string; // friendly label
  customizable_type: string;
  required: boolean;
  archived: boolean;
  position: number | null;
  options: FormattedCustomFieldOption[] | null;
}

// Deal/budget create payloads — sit alongside the existing UpdateDealPayload
// (deals and budgets share the /deals endpoint; budget=false → deal, budget=true → budget).
export interface CreateDealPayload {
  data: {
    type: "deals";
    attributes: {
      name: string;
      budget?: boolean;
      currency?: string;
      // Cents/pence as string ("60000.0") — matches the API's reported format.
      deal_value?: string;
      deal_value_source?: "manual" | "from_services";
      // Productive uses `date` for the start date, not `start_date`.
      date?: string;
      end_date?: string;
      deal_type_id?: number;
      probability?: number;
      note?: string;
      tag_list?: string[];
      custom_fields?: Record<string, unknown>;
    };
    relationships: {
      company: { data: { type: "companies"; id: string } };
      responsible?: { data: { type: "people"; id: string } };
      deal_status?: { data: { type: "deal_statuses"; id: string } };
      pipeline?: { data: { type: "pipelines"; id: string } };
      project?: { data: { type: "projects"; id: string } };
      contact?: { data: { type: "people"; id: string } };
    };
  };
}
