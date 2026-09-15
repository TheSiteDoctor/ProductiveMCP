/**
 * Task template loading and variable substitution
 *
 * Templates are JSON files in the `templates/` directory at the project root
 * (next to productive.config.json). Set PRODUCTIVE_TEMPLATES_DIR to load
 * them from somewhere else, e.g. a shared folder outside this repository.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TaskTemplateSchema,
  type TaskTemplate,
  type TemplateTask,
} from "../schemas/template.js";

/** A template plus where it came from, for error messages and listings. */
export interface LoadedTemplate {
  template: TaskTemplate;
  filePath: string;
}

/** Resolve the templates directory (env override, else <root>/templates). */
export function getTemplatesDir(): string {
  if (process.env.PRODUCTIVE_TEMPLATES_DIR) {
    return process.env.PRODUCTIVE_TEMPLATES_DIR;
  }
  const __filename = fileURLToPath(import.meta.url);
  // utils/ sits inside src/ or dist/, so the project root is two levels up
  return join(dirname(__filename), "..", "..", "templates");
}

/**
 * Load and validate every template in the templates directory.
 * Invalid files are reported in `errors` rather than aborting the listing,
 * so one broken template doesn't hide the rest.
 */
export function loadTemplates(): {
  templates: LoadedTemplate[];
  errors: string[];
} {
  const dir = getTemplatesDir();
  const templates: LoadedTemplate[] = [];
  const errors: string[] = [];

  if (!existsSync(dir)) {
    errors.push(
      `Templates directory not found: ${dir}. Create it (or set PRODUCTIVE_TEMPLATES_DIR) and add template JSON files.`,
    );
    return { templates, errors };
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = TaskTemplateSchema.parse(JSON.parse(raw));
      templates.push({ template: parsed, filePath });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown parse error";
      errors.push(`${file}: ${message}`);
    }
  }

  return { templates, errors };
}

/**
 * Load one template by its `name` field, with the file name (minus .json)
 * accepted as an alias. Throws with the available names when not found.
 */
export function loadTemplate(name: string): LoadedTemplate {
  const { templates, errors } = loadTemplates();

  const match = templates.find(
    (t) =>
      t.template.name === name ||
      basename(t.filePath, ".json") === name,
  );

  if (!match) {
    const available = templates.map((t) => t.template.name).join(", ");
    const errorNote = errors.length > 0 ? ` (${errors.length} template file(s) failed to load: ${errors.join("; ")})` : "";
    throw new Error(
      `Template "${name}" not found in ${getTemplatesDir()}. Available templates: ${available || "none"}.${errorNote}`,
    );
  }

  return match;
}

/** Matches {{variable_name}} placeholders, tolerating inner whitespace. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** Collect every distinct placeholder name used anywhere in the template. */
export function collectPlaceholders(template: TaskTemplate): string[] {
  const found = new Set<string>();
  const scan = (text: string | undefined): void => {
    if (!text) return;
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      found.add(match[1]);
    }
  };
  const scanTask = (task: TemplateTask): void => {
    scan(task.title);
    scan(task.description);
    for (const sub of task.subtasks || []) scanTask(sub);
  };
  for (const list of template.task_lists) {
    scan(list.name);
    for (const task of list.tasks) scanTask(task);
  }
  return [...found].sort();
}

/**
 * Resolve the values to substitute: supplied variables win, then declared
 * defaults. Throws when a placeholder used in the template has neither.
 */
export function resolveVariables(
  template: TaskTemplate,
  supplied: Record<string, string> = {},
): Record<string, string> {
  const declared = new Map(
    (template.variables || []).map((v) => [v.name, v]),
  );
  const placeholders = collectPlaceholders(template);

  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of placeholders) {
    if (supplied[name] !== undefined) {
      values[name] = supplied[name];
    } else if (declared.get(name)?.default !== undefined) {
      values[name] = declared.get(name)!.default!;
    } else {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    const described = missing
      .map((name) => {
        const description = declared.get(name)?.description;
        return description ? `${name} (${description})` : name;
      })
      .join(", ");
    throw new Error(
      `Template "${template.name}" requires values for: ${described}. Pass them in the "variables" argument, e.g. {"${missing[0]}": "..."}.`,
    );
  }

  return values;
}

/** Replace {{placeholders}} in a string with resolved values. */
function substitute(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(
    PLACEHOLDER_PATTERN,
    (whole, name: string) => values[name] ?? whole,
  );
}

/**
 * Return a deep copy of the template with all placeholders replaced.
 * Validation has already bounded field lengths, but substitution can push a
 * title past Productive's 200-character limit, so re-check titles here.
 */
export function substituteTemplate(
  template: TaskTemplate,
  values: Record<string, string>,
): TaskTemplate {
  const substituteTask = (task: TemplateTask): TemplateTask => {
    const title = substitute(task.title, values);
    if (title.length > 200) {
      throw new Error(
        `Task title exceeds 200 characters after variable substitution: "${title.slice(0, 80)}..."`,
      );
    }
    return {
      ...task,
      title,
      description: task.description
        ? substitute(task.description, values)
        : task.description,
      subtasks: task.subtasks?.map(substituteTask),
    };
  };

  return {
    ...template,
    task_lists: template.task_lists.map((list) => ({
      name: substitute(list.name, values),
      tasks: list.tasks.map(substituteTask),
    })),
  };
}

/** Total number of tasks in a template, counting nested subtasks. */
export function countTasks(template: TaskTemplate): number {
  const countTask = (task: TemplateTask): number =>
    1 + (task.subtasks || []).reduce((sum, sub) => sum + countTask(sub), 0);
  return template.task_lists.reduce(
    (sum, list) => sum + list.tasks.reduce((s, t) => s + countTask(t), 0),
    0,
  );
}

/** Total estimated minutes across a template's tasks (nested included). */
export function totalEstimateMinutes(template: TaskTemplate): number {
  const sumTask = (task: TemplateTask): number =>
    (task.estimate_minutes || 0) +
    (task.subtasks || []).reduce((sum, sub) => sum + sumTask(sub), 0);
  return template.task_lists.reduce(
    (sum, list) => sum + list.tasks.reduce((s, t) => s + sumTask(t), 0),
    0,
  );
}
