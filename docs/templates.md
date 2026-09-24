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

## How templates are structured

Templates follow TSD's Productive hierarchy:

| Level | In Productive | Examples |
| ----- | ------------- | -------- |
| Task list | A project phase (milestone) | Discovery / Foundation, Core Delivery, Go-live |
| Top-level ticket | A **Feature** - the epic, i.e. a deliverable | Project Management, Infrastructure setup, Homepage, Product Listing Page (PLP) |
| Children | The tasks, meetings and test cases that deliver it | Design: Homepage, QA: Homepage, DSU / Regular Check-in |

The phase names are variables with defaults, so templates need no configuration but can match a project's own naming:

| Variable | Default |
| -------- | ------- |
| `foundation_list` | Discovery / Foundation |
| `delivery_list` | Core Delivery |
| `launch_list` | Go-live |

Templates that share a phase and a Feature title combine: `umbraco-setup` adds "Install Umbraco" inside standard-delivery's "Infrastructure setup" Feature, and `website-build` adds its canonical URL check inside the "Go-live Launch" Feature.

## The templates

Seven templates ship with this repository, listed in the order they are normally applied:

- **`discovery`** (Discovery / Foundation, 43 tickets) - foundational discovery for rebuilds and larger projects. Seven Features: Access & Accounts, Goals & Stakeholders, Current Site Audit (Screaming Frog crawl, full legacy URL inventory), SEO Baseline, Analytics & Tracking, Technical & Integrations, and Content & Information Architecture (sitemap, redirect map), then a findings playback and a "Discovery sign-off" milestone. High priority marks what's lost for good once the old site is switched off; access requests are due five days after applying.
- **`standard-delivery`** (53 tickets, plus one Show & Tell per sprint) - the Features every project gets. In the core delivery phase: **Project Setup** (agree the Product Owners and Project Team, kick-offs, repo, development environment), **Project Management** (ceremonies for the life of the project, including a `Show & Tell: Sprint N` ticket per planned sprint from `sprint_count`), **Infrastructure setup**, **Third-party accounts** (get or create GTM, GA4, Clarity, Search Console, cookie consent and CreateSend), **Transactional email** (client set up in the SMTP provider, SMTP details shared), and a **Build Complete** milestone marking the start of UAT. **Go-live Launch** in the go-live phase is a lean gate of must-pass checks (production licences, live SMTP provider, DNS, HTTPS and www redirects, canonical URLs, GTM/GA4/Clarity, Search Console, StatusCake, Seq, and a live test transaction for e-commerce). Platform-neutral; CMS work lives in add-ons.
- **`umbraco-setup`** (add-on, 5 tickets) - adds Umbraco and Igloo Theme installation to the Infrastructure setup Feature, and client CMS training to Project Management, both in the core delivery phase.
- **`website-build`** (20 tickets) - a Feature per page type in the core delivery phase (Site-wide, Homepage, Content Page), each with Design / Front-end / Back-end / QA / QC tasks; adds canonical URL enforcement to Go-live Launch and a "Site go-live" release milestone.
- **`ecommerce-build`** (add-on, 36 tickets) - a Feature per shop page in the core delivery phase: PLP, PDP and the four checkout steps (Basket, Shipping, Billing, Order Complete), each with the same five-role breakdown.
- **`stripe-integration`** (18 tickets) - a **Stripe Integration** Feature in the core delivery phase (account in the client's name, sandbox keys and per-environment webhook secrets, end-to-end sandbox payment tests, starting the client's account activation early) and a **Stripe Go-live** Feature in the go-live phase (live keys and webhook, wallet domain verification, live smoke test).
- **`site-go-live`** (131 tickets) - the exhaustive go-live reference checklist, with each section (DNS Changes, On the server, Source Code Changes and so on) as a Feature in the go-live phase. Modernised for GA4/GTM, Search Console and Umbraco Commerce; the transactional email tasks are provider-neutral via the `email_provider` variable (default `Mailgun / Mandrill / SendGrid`).

## Template format

```json
{
  "name": "standard-delivery",
  "title": "Standard Project Delivery",
  "description": "What this template is for",
  "variables": [
    {
      "name": "domain_name",
      "description": "The project's primary domain, e.g. example.com"
    },
    {
      "name": "foundation_list",
      "description": "Task list (project phase) for foundation work",
      "default": "Discovery / Foundation"
    }
  ],
  "task_lists": [
    {
      "name": "{{foundation_list}}",
      "tasks": [
        {
          "title": "Infrastructure setup ({{domain_name}})",
          "description": "Markdown supported - converted to HTML on creation",
          "task_type": "Feature",
          "subtasks": [
            {
              "title": "Create GitHub repo ({{domain_name}})",
              "task_type": "Task",
              "priority": "Medium",
              "labels": ["Setup"],
              "estimate_minutes": 30,
              "due_in_days": 7
            }
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
- `repeat` - create the task several times: a whole number, or a single `{{variable}}` holding one (maximum 52). `{{repeat_index}}` in the title or description becomes 1, 2, 3 and so on. For example `"title": "Show & Tell: Sprint {{repeat_index}}", "repeat": "{{sprint_count}}"`.
- `repeat_every_days` - with `repeat`, each copy is due this many days after the previous one (the first copy uses `due_in_days`).
- `subtasks` - nested tasks, arbitrarily deep. Each level is created with a `parent_task` relationship.

Placeholders (`{{variable_name}}`) work in task list names, task titles and descriptions.

## Apply behaviour

- **Task list reuse**: if the project already has an active task list with the same name (case-insensitive), tasks are added to it rather than a duplicate being created. Set `reuse_existing_task_lists: false` to always create new lists.
- **Merging into existing tickets**: within a reused list, a ticket whose title already exists at the same level (case-insensitive) is reused rather than recreated, and only the template's missing children are added beneath it - at every depth. This is how add-ons contribute tasks to another template's Features, and why re-applying a template is idempotent. The summary marks reused tickets _(existing)_. Set `skip_existing_tasks: false` to always create new tickets.
- **Phase order**: Productive appends new task lists at the end. When a template creates a list and one of its later phases already exists (for example a template creating Core Delivery after another template created Go-live), the new list is moved before that later phase, so phases stay in order.
- **Milestones stay last**: a milestone marks the end of its phase. When a template adds a new top-level ticket to a list that already holds a milestone (for example `website-build` adding pages to Core Delivery after `standard-delivery` created Build Complete), the ticket is moved above the milestone. If Productive refuses the move, the summary carries a warning and the ticket stays at the end of the list.
- **Board**: newly created task lists go on the board given by `board_id`, or the project's first board.
- **Assignee**: `default_assignee_id` assigns every created task to one person; otherwise tasks are unassigned.
- **Ordering**: tasks are created sequentially in template order, so Productive displays them in the order written.
- **Failures don't abort the run**: a failed task is recorded and the run continues; its subtasks are skipped (they'd have no parent) and reported as such. The summary lists every failure with its error.
- **Rate limiting** is handled by the shared client (100 requests per 10 seconds), so large templates like `site-go-live` simply take a couple of minutes.

## Previewing templates: the Template Planner

`npm run templates:report` builds `template-report.html` (git-ignored): a self-contained page showing every template as a nested tree of task lists, features, tasks and subtasks, with types, estimates, priorities and relative due dates. Tick the templates to stack (or pick a preset such as "Rebuild" or "E-commerce site") and it shows the merged result, following the same rules as apply: same-name task lists merge, new phase lists are placed before later phases, and a ticket an earlier template already created is shown once, with the other templates' children merged into it. Variable values can be edited live. Nothing touches the Productive API.

Pass a path to write elsewhere, and `--fragment` to omit the `<html>`/`<head>`/`<body>` wrapper for hosts that supply their own.

## Inline templates and page scaffolding

`productive_apply_task_template` also accepts a `template_definition` - a full template object passed inline instead of a stored template name. This is for structures composed on the fly, where no file exists (or should exist) on the server.

The main consumer is the **`tsd-site-scaffold` skill** (in `skills/tsd-site-scaffold/`): it asks which page types a new site needs ("Homepage, Case Study List, Case Study Details, Contact Us"), spots entity types that may need separate list and detail pages (Case Studies, Products, News - but not FAQs or Contact Us), then composes an inline template creating a Feature per page in the core delivery phase, with the standard Design / Front-end / Back-end / QA / QC tasks beneath it. For Igloo builds it also asks which Igloo widgets the design needs and creates an `Igloo: <Widget>` Feature for each, with Front-end / Back-end / QA / QC tasks (design is already done by then). It can be re-run once design is signed off to add the widgets. Install it by copying the folder into `~/.claude/skills/` (Claude Code) or uploading it as a skill on claude.ai.

## Writing a new template

1. Copy an existing file in `templates/` and edit it.
2. Keep the JSON valid against the schema (`src/schemas/template.ts`) - `productive_list_task_templates` reports any file that fails validation, without hiding the others.
3. Preview it with `productive_get_task_template`, then do a `dry_run` apply against a test project.
