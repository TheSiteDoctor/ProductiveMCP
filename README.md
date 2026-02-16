# Productive.io MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that gives Claude (and other MCP-compatible AI clients) full access to your [Productive.io](https://productive.io) account.

Ask Claude to create tasks, search projects, manage budgets, and more - all through natural conversation.

## Features

- **Task Management** - Create, search, update, and bulk-create tasks
- **Task List Management** - Full CRUD: create, rename, archive, restore, delete, reposition, move, copy
- **Project Discovery** - List and search projects, boards, and team members
- **Budget Management** - List, update, audit, close budgets; mark as delivered
- **Revenue Distributions** - Create, update, extend, and report on revenue distributions
- **Service Management** - Manage services (budget line items) and service types
- **Task Dependencies** - Create blocking, waiting-on, and related dependencies
- **Pages & Comments** - Create and manage documentation pages and task comments
- **Attachments** - Upload and list file attachments on tasks
- **Checklists** - Create and manage to-do items on tasks
- **Rate Limiting** - Automatic handling of Productive.io's API rate limits
- **Flexible Output** - Both Markdown and JSON response formats

## Quick Start

### Prerequisites

- Node.js 18+
- A Productive.io account with API access

### 1. Install

```bash
npm install
```

### 2. Add your credentials

```bash
cp .env.example .env
```

Edit `.env` and fill in two values:

- **API Token** - from Productive.io → Settings → Integrations → API → Generate a token
- **Organisation ID** - the number in your Productive URL: `https://app.productive.io/{ORG_ID}/...`

### 3. Run auto-setup

```bash
npm run setup
```

This connects to your Productive account, discovers your custom fields and workflow statuses, and writes a `productive.config.json` file. No manual API calls or source code editing needed.

### 4. Build

```bash
npm run build
```

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "productive": {
      "command": "node",
      "args": ["/absolute/path/to/productive-mcp-server/dist/index.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_org_id_here"
      }
    }
  }
}
```

### Connect to Claude Code

Add to `.claude/settings.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "productive": {
      "command": "node",
      "args": ["/absolute/path/to/productive-mcp-server/dist/index.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_org_id_here"
      }
    }
  }
}
```

### Verify

Restart Claude and ask: "List my projects in Productive"

## Custom Field Configuration

Productive.io uses custom fields for task type, priority, and estimates. These field IDs are unique to each organisation.

**The recommended approach is `npm run setup`** which auto-discovers everything. The generated `productive.config.json` file is loaded at runtime - no source code editing or rebuilding needed after setup.

If auto-detection doesn't find your fields (they may be named differently), you can edit `productive.config.json` manually. The setup script will list all available custom fields in your account to help you identify the right ones.

The server works without custom field configuration - you just won't be able to set task types, priorities, or workflow statuses through Claude.

## Available Tools

### Task Management

| Tool                            | Description                            |
| ------------------------------- | -------------------------------------- |
| `productive_create_task`        | Create a single task with full options |
| `productive_create_tasks_batch` | Bulk-create multiple tasks efficiently |
| `productive_search_tasks`       | Search and filter tasks                |
| `productive_get_task`           | Get full task details                  |
| `productive_update_task`        | Update task properties                 |

### Project & Organisation

| Tool                         | Description                         |
| ---------------------------- | ----------------------------------- |
| `productive_list_projects`   | List projects (active/archived/all) |
| `productive_list_task_lists` | Get task lists for a project        |
| `productive_list_boards`     | List project boards                 |
| `productive_list_people`     | List team members                   |

### Task Lists

| Tool                              | Description                    |
| --------------------------------- | ------------------------------ |
| `productive_get_task_list`        | Get task list details          |
| `productive_create_task_list`     | Create a new task list         |
| `productive_update_task_list`     | Rename a task list             |
| `productive_archive_task_list`    | Archive a task list            |
| `productive_restore_task_list`    | Restore an archived task list  |
| `productive_delete_task_list`     | Permanently delete a task list |
| `productive_reposition_task_list` | Reorder task lists             |
| `productive_move_task_list`       | Move to a different board      |
| `productive_copy_task_list`       | Duplicate a task list          |

### Budgets

| Tool                               | Description                |
| ---------------------------------- | -------------------------- |
| `productive_list_budgets`          | List budgets with filters  |
| `productive_get_budget`            | Get budget details         |
| `productive_update_budget`         | Update budget properties   |
| `productive_mark_budget_delivered` | Mark a budget as delivered |
| `productive_close_budget`          | Close a budget             |
| `productive_audit_project_budgets` | Audit budgets for issues   |

### Revenue Distributions

| Tool                                      | Description                  |
| ----------------------------------------- | ---------------------------- |
| `productive_list_revenue_distributions`   | List distributions           |
| `productive_get_revenue_distribution`     | Get distribution details     |
| `productive_create_revenue_distribution`  | Create a distribution        |
| `productive_update_revenue_distribution`  | Update a distribution        |
| `productive_delete_revenue_distribution`  | Delete a distribution        |
| `productive_extend_revenue_distribution`  | Extend a distribution period |
| `productive_report_overdue_distributions` | Find overdue distributions   |

### Services

| Tool                              | Description                       |
| --------------------------------- | --------------------------------- |
| `productive_list_services`        | List services (budget line items) |
| `productive_get_service`          | Get service details               |
| `productive_create_service`       | Create a service                  |
| `productive_update_service`       | Update a service                  |
| `productive_list_service_types`   | List service types                |
| `productive_get_service_type`     | Get service type details          |
| `productive_create_service_type`  | Create a service type             |
| `productive_update_service_type`  | Update a service type             |
| `productive_archive_service_type` | Archive a service type            |

### Dependencies

| Tool                                | Description            |
| ----------------------------------- | ---------------------- |
| `productive_create_task_dependency` | Create a dependency    |
| `productive_list_task_dependencies` | List dependencies      |
| `productive_get_task_dependency`    | Get dependency details |
| `productive_update_task_dependency` | Change dependency type |
| `productive_delete_task_dependency` | Remove a dependency    |
| `productive_mark_as_blocked_by`     | Mark task as blocked   |
| `productive_mark_as_duplicate`      | Mark task as duplicate |

### Pages, Comments & Attachments

| Tool                                                                                                     | Description        |
| -------------------------------------------------------------------------------------------------------- | ------------------ |
| `productive_list_pages` / `productive_search_pages`                                                      | Find pages         |
| `productive_get_page` / `productive_create_page` / `productive_update_page` / `productive_delete_page`   | Page CRUD          |
| `productive_list_comments`                                                                               | List task comments |
| `productive_list_attachments` / `productive_upload_attachment`                                           | Manage attachments |
| `productive_create_todo` / `productive_list_todos` / `productive_update_todo` / `productive_delete_todo` | Checklist items    |
| `productive_list_subtasks`                                                                               | List child tasks   |

## Development

```bash
npm run dev      # Watch mode with auto-reload
npm run build    # Compile TypeScript
npm start        # Run compiled server
npm run clean    # Remove build artifacts
```

## Licence

MIT
