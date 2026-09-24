---
name: tsd-site-scaffold
description: Interactively scaffold site build tickets in Productive from a list of page types. Use when starting a new website project and the user wants the page/feature tickets set up (e.g. "set up the build tickets for acme.com", "scaffold the pages for the new site", "create the page features"). Asks which page types are needed, spots entity types that may need separate list and detail pages (Case Studies, Products, News etc), then creates a task list per page with Design / Front-end / Back-end / QA / QC tasks via the ProductiveMCP template tools.
---

# TSD Site Build Scaffolding

Turn a list of page types into build tickets in Productive: one task list per page, each holding the standard role tasks (Design / Front-end / Back-end / QA / QC).

## Prerequisites

Requires the ProductiveMCP server (the `productive_*` tools). If they're not available, say so and stop.

## Workflow

### 1. Identify the project

Resolve the target Productive project with `productive_list_projects` (search by the name the user gave). If ambiguous, ask.

### 2. Check the base templates

Run `productive_list_task_lists` for the project. If the standard lists (Project Management, Infrastructure setup, Go-live Launch) are missing, offer to apply `standard-delivery` (and `umbraco-setup` / `stripe-integration` / `ecommerce-build` where relevant) first - pages sit on top of that scaffolding, and `website-build` already covers Homepage and Content Page if applied.

### 3. Gather the page types

If the project has had discovery (a "Discovery: Content & Information Architecture" list exists), check the "Proposed sitemap and information architecture" task first. If it's signed off, offer its page types as the starting answer rather than asking from scratch.

Otherwise ask: **"Do you know what page types will be required yet?"**

The user answers free-form, e.g. "Homepage, Case Study List, Case Study Details, Contact Us".

### 4. Clarify list/detail entities (one batched question)

Some page types are really content entities that may need a **listing page**, a **details page**, or both - and the user may have named them ambiguously ("Case Studies", "FAQs", "Products"). When they have already been explicit (e.g. "Case Study List, Case Study Details") don't re-ask.

For ambiguous entity names, ask ONE batched question covering all of them, e.g.:

> "A couple of those could be one page or two: would Case Studies need separate list and detail pages, or just a single page? Same question for Products."

Typical patterns (guidance, not rules - the client's content decides):

| Usually list + detail | Often list-only (single page) | Always a single page |
| --- | --- | --- |
| Case Studies, Products, News/Blog/Articles, Events, Vacancies/Jobs, Projects/Portfolio, Courses, Recipes, People/Team (larger orgs) | FAQs, Testimonials, Stockists, Downloads/Resources, Team (small grid), Locations (single map), Galleries | Homepage, Contact Us, About Us, Search Results, 404/Error, Privacy/T&Cs/Cookie (Content Page covers these) |

Never ask about the "always single" group, and don't ask more than one round of clarification - make a sensible assumption for anything still unclear and flag it in the plan.

### 5. Confirm the plan

Present the final page list, using the user's own naming (e.g. "Case Study List" and "Case Study Details" as two pages). Defaults, which the user can override:

- Every page gets all five roles: Design, Front-end / CMS, Back-end, QA, QC.
- Purely static pages may drop Back-end if the user says so - but default to including it.
- If a page is already covered by an applied template (Homepage and Content Page in `website-build`; PLP/PDP/checkout in `ecommerce-build`), point that out rather than duplicating it - `skip_existing_tasks` protects against exact-title duplicates only.

### 6. Create the tickets

Compose an inline template and call `productive_apply_task_template` with `template_definition` (no stored template needed) - first with `dry_run: true`, show the user, then apply for real on their go-ahead.

One task list per page. Tasks per page, using EXACTLY these title patterns and descriptions (substituting the page name for `<Page>`):

- **`Design: <Page>`** (task_type `Feature`)
  "<Page> design for desktop and mobile, using the site-wide foundations. Client sign-off before build starts."
- **`Front-end / CMS: <Page>`** (task_type `Feature`)
  "Build the <Page> template and wire every section to CMS-editable content. Responsive across breakpoints."
- **`Back-end: <Page>`** (task_type `Feature`)
  "Models, controllers and any data/integration work <Page> needs."
- **`QA: <Page>`** (task_type `Test Case`)
  "Internal testing against the signed-off design and acceptance criteria: content editable as expected, responsive, cross-browser, no console errors."
- **`QC: <Page>`** (task_type `Test Case`)
  "Final quality control pass on UAT before client review: pixel check against design, real content in place, links and imagery correct."

Page-specific additions (append to the relevant description):

- Listing pages: Front-end/Back-end mention filtering/sorting/pagination and empty states; QA checks they work.
- Details pages: Back-end mentions routing/slugs and structured data where relevant (e.g. Article/Product schema); QA checks a real item end to end.
- Contact/forms pages: QA covers validation, the thank-you state, and the email reaching the right inbox.

Skeleton for the call:

```json
{
  "template_definition": {
    "name": "site-scaffold",
    "title": "Site Build Scaffold",
    "task_lists": [
      {
        "name": "Case Study List",
        "tasks": [
          { "title": "Design: Case Study List", "description": "...", "task_type": "Feature" },
          { "title": "Front-end / CMS: Case Study List", "description": "...", "task_type": "Feature" },
          { "title": "Back-end: Case Study List", "description": "...", "task_type": "Feature" },
          { "title": "QA: Case Study List", "description": "...", "task_type": "Test Case" },
          { "title": "QC: Case Study List", "description": "...", "task_type": "Test Case" }
        ]
      }
    ]
  },
  "project_id": "<id>",
  "dry_run": true
}
```

### 7. Report

Share the apply summary (created lists, task links, anything skipped). Suggest next steps only if obvious gaps exist (e.g. e-commerce pages named but `stripe-integration` not applied).

## Rules

- Never create tickets without showing the dry run and getting a yes.
- Use the user's page naming verbatim in list and task titles.
- Keep clarifying questions to a minimum: one round, batched.
- Don't add pages the user didn't ask for; suggest at most, and only when a gap is glaring (a site with news articles but no news listing, an e-commerce site with no basket).
