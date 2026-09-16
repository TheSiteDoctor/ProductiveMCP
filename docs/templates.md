# Task Templates

Every new project needs the same core delivery tickets, and some always get forgotten. Task templates fix that: a JSON file describes a standard set of task lists, tasks and subtasks, and one tool call creates the whole structure in a Productive project.

## The three tools

| Tool | What it does |
| ---- | ------------ |
| `productive_list_task_templates` | Lists the templates found on disk, with task counts and the variables each needs |
| `productive_get_task_template` | Renders one template's full tree so you can review it before applying |
| `productive_apply_task_template` | Creates the template's task lists and tasks in a project |

A typical conversation with Claude:

> "We've won a new project for acme.co.uk - spin up the standard delivery tickets in the Acme project."

Claude looks up the project ID, runs `productive_apply_task_template` with `template: "standard-delivery"` and `variables: {"domain_name": "acme.co.uk"}`, and reports back with links to every created task.

Use `dry_run: true` to preview exactly what would be created (with variables substituted) without touching the API.

## Where templates live

JSON files in the `templates/` directory at the project root. Set the `PRODUCTIVE_TEMPLATES_DIR` environment variable to load them from somewhere else - useful if you keep templates in a shared folder or a separate repository.

Six templates ship with this repository:

- **`standard-delivery`** - TSD's standard Feature/Task breakdown for a new project: Project Management (kick-offs, ceremonies, budget and RAID tracking, UAT, close-down), Infrastructure setup (repo, CI/CD, hosting, database, blob storage, per-environment Seq keys, StatusCake monitoring for test and live, CreateSend), and Go-live Launch - a deliberately lean gate of the must-pass launch checks: production licences, DNS, HTTPS and www redirects, canonical URLs, GTM/GA4/Clarity firing, Search Console, StatusCake on the live URL, Seq logging, and a live test transaction for e-commerce. Deliberately platform-neutral - CMS-specific work lives in add-on templates. (`site-go-live` is the exhaustive reference checklist; Go-live Launch is the short list every project must actually pass.)
- **`umbraco-setup`** - Umbraco add-on for standard-delivery: Umbraco and Igloo Theme installation plus client CMS training and handover. Its task lists share standard-delivery's names, so applying it afterwards adds the tasks to the existing lists rather than duplicating them.
- **`website-build`** - build scaffolding for a standard www site: site-wide design/front-end, a Design / Front-end / Back-end / QA / QC breakdown for the Homepage and Content Page types, canonical URL enforcement, and a "Site go-live" release milestone. Apply alongside standard-delivery; shared list names merge and duplicate task titles are skipped.
- **`ecommerce-build`** - e-commerce add-on to website-build: PLP, PDP and the four checkout steps (Basket, Shipping, Billing, Order Complete), each with the same five-role breakdown. Pair with stripe-integration for the payment provider work.
- **`site-go-live`** - the exhaustive go-live checklist (131 tasks) covering DNS, server setup, source code changes, third-party services, content, SEO, testing, security, performance and post-launch tasks - modernised for GA4/GTM, Search Console and Umbraco Commerce. The transactional email tasks are provider-neutral: the `email_provider` variable (default `Mailgun`) names the provider, and the checklist steps - unique API key per customer, sending domain/sub-account, SPF/DKIM records - apply to Mailgun, SendGrid or any equivalent.
- **`stripe-integration`** - the sandbox-to-live sequence for Stripe on Umbraco Commerce: account creation (in the client's name), test keys, per-environment webhooks and signing secrets, end-to-end sandbox payment tests (success, decline, 3DS, refund), client account activation, statement descriptor, live keys/webhook, wallet domain verification and a live smoke test.

## Template format

```json
{
  "name": "standard-delivery",
  "title": "Standard Project Delivery",
  "description": "What this template is for",
  "variables": [
    {
      "name": "domain_name",
      "description": "The project's primary domain, e.g. example.com",
      "default": "example.com"
    }
  ],
  "task_lists": [
    {
      "name": "Infrastructure setup ({{domain_name}})",
      "tasks": [
        {
          "title": "Create GitHub repo ({{domain_name}})",
          "description": "Markdown supported - converted to HTML on creation",
          "task_type": "Task",
          "priority": "Medium",
          "labels": ["Setup"],
          "estimate_minutes": 30,
          "due_in_days": 7,
          "subtasks": [
            { "title": "Add branch protection rules" }
          ]
        }
      ]
    }
  ]
}
```

### Fields

**Template level**

- `name` (required) - kebab-case identifier used by the tools. The file name (minus `.json`) is accepted as an alias.
- `title` (required) - display name.
- `description` - what the template is for.
- `variables` - declares the `{{placeholders}}` used in the body. Each has a `name` (lower_snake_case), an optional `description`, and an optional `default`. A placeholder without a default must be supplied when applying; the error message lists anything missing.
- `task_lists` (required) - the Productive task lists to create, each with a `name` and `tasks`.

**Task level**

- `title` (required, max 200 characters after substitution).
- `description` - Markdown, converted to HTML on creation (max 10,000 characters).
- `task_type` - one of the configured types (`Bug`, `Task`, `Feature`, `Question`, `Meeting`, `Test Case`). Skipped silently if the organisation hasn't configured the custom field, so templates stay portable.
- `priority` - `Highest`/`High`/`Medium`/`Low`/`Lowest`. Same portability rule.
- `labels` - label names; missing labels are created automatically.
- `estimate_minutes` - sets `initial_estimate` (Productive auto-sets "Time to complete" to match on creation).
- `due_in_days` - due date set to N days after the apply date.
- `milestone` - `true` creates the task as a Productive milestone (`type_id: 3`) rather than a normal task.
- `subtasks` - nested tasks, arbitrarily deep. Each level is created with a `parent_task` relationship.

Placeholders (`{{variable_name}}`) work in task list names, task titles and descriptions.

## Apply behaviour

- **Task list reuse**: if the project already has an active task list with the same name (case-insensitive), tasks are added to it rather than a duplicate being created. Set `reuse_existing_task_lists: false` to always create new lists.
- **Duplicate task skipping**: within a reused list, a top-level task whose title already exists (case-insensitive) is skipped along with its subtasks and reported as such - so re-applying a template, or stacking add-on templates that share a task, is idempotent. Set `skip_existing_tasks: false` to disable.
- **Board**: newly created task lists go on the board given by `board_id`, or the project's first board.
- **Assignee**: `default_assignee_id` assigns every created task to one person; otherwise tasks are unassigned.
- **Ordering**: tasks are created sequentially in template order, so Productive displays them in the order written.
- **Failures don't abort the run**: a failed task is recorded and the run continues; its subtasks are skipped (they'd have no parent) and reported as such. The summary lists every failure with its error.
- **Rate limiting** is handled by the shared client (100 requests per 10 seconds), so large templates like `site-go-live` simply take a couple of minutes.

## Writing a new template

1. Copy an existing file in `templates/` and edit it.
2. Keep the JSON valid against the schema (`src/schemas/template.ts`) - `productive_list_task_templates` reports any file that fails validation, without hiding the others.
3. Preview it with `productive_get_task_template`, then do a `dry_run` apply against a test project.
