#!/usr/bin/env node
/**
 * Build the Template Planner: a self-contained HTML page previewing what the
 * task templates create, including how stacked templates merge.
 *
 * Usage:
 *   npm run templates:report                 # writes template-report.html
 *   node scripts/template-report.mjs out.html
 *   node scripts/template-report.mjs out.html --fragment
 *
 * --fragment omits the <!doctype>/<html>/<head>/<body> wrapper, for hosts
 * that supply their own document skeleton.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatesDir = process.env.PRODUCTIVE_TEMPLATES_DIR || join(root, "templates");
const args = process.argv.slice(2);
const fragment = args.includes("--fragment");
const outPath = resolve(args.find((a) => !a.startsWith("--")) || join(root, "template-report.html"));

if (!existsSync(templatesDir)) {
  console.error(`Templates directory not found: ${templatesDir}`);
  process.exit(1);
}

const templates = [];
for (const file of readdirSync(templatesDir).filter((f) => f.endsWith(".json")).sort()) {
  try {
    const t = JSON.parse(readFileSync(join(templatesDir, file), "utf-8"));
    if (!t.name || !Array.isArray(t.task_lists)) throw new Error("missing name or task_lists");
    templates.push(t);
  } catch (err) {
    console.error(`Skipping ${file}: ${err instanceof Error ? err.message : err}`);
  }
}

const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
// Escape "<" so template text can never close the inline <script> early.
const json = JSON.stringify(templates).replace(/</g, "\\u003c");

let page = readFileSync(join(root, "scripts", "template-report.html"), "utf-8")
  .replace("/*__TEMPLATES__*/[]", () => json)
  .replace("__GENERATED__", generated);

if (!fragment) {
  // The page opens with <title>, font links and <style>; those belong in <head>.
  const split = page.indexOf('<div class="wrap">');
  page = `<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${page.slice(0, split)}</head>\n<body>\n${page.slice(split)}</body>\n</html>\n`;
}

writeFileSync(outPath, page);
console.log(`Wrote ${outPath} (${templates.length} templates)`);
