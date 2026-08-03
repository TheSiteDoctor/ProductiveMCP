#!/usr/bin/env node

/**
 * Productive.io MCP Server - Auto Setup
 *
 * Connects to your Productive.io account, discovers your custom fields
 * and workflow statuses, and writes a productive.config.json file.
 *
 * Usage: npm run setup
 *
 * Requires PRODUCTIVE_API_TOKEN and PRODUCTIVE_ORG_ID in your .env file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = "https://api.productive.io/api/v2";

// ---------------------------------------------------------------------------
// Read .env
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) {
    console.error("\nError: .env file not found.");
    console.error("Copy .env.example to .env and add your credentials:\n");
    console.error("  cp .env.example .env\n");
    process.exit(1);
  }

  const env = {};
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGet(path, token, orgId, params = {}) {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": token,
      "X-Organization-Id": orgId,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchAllPages(path, token, orgId, params = {}) {
  const results = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await apiGet(path, token, orgId, {
      ...params,
      "page[number]": page,
      "page[size]": 100,
    });

    const data = Array.isArray(response.data) ? response.data : [response.data];
    results.push(...data);

    const totalCount = response.meta?.total_count;
    if (totalCount && results.length >= totalCount) {
      hasMore = false;
    } else if (data.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return results;
}

/**
 * Like fetchAllPages, but also accumulates the JSON:API `included` array so
 * callers can resolve relationships (fetchAllPages discards it).
 */
async function fetchAllPagesWithIncluded(path, token, orgId, params = {}) {
  const data = [];
  const includedById = new Map();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await apiGet(path, token, orgId, {
      ...params,
      "page[number]": page,
      "page[size]": 100,
    });

    const pageData = Array.isArray(response.data)
      ? response.data
      : [response.data];
    data.push(...pageData);

    for (const item of response.included || []) {
      includedById.set(`${item.type}:${item.id}`, item);
    }

    const totalCount = response.meta?.total_count;
    if (totalCount && data.length >= totalCount) {
      hasMore = false;
    } else if (pageData.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { data, included: [...includedById.values()] };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

async function discoverCustomFields(token, orgId) {
  console.log("\nFetching custom fields...");

  const fields = await fetchAllPages("/custom_fields", token, orgId);
  console.log(`  Found ${fields.length} custom fields`);

  // Try to identify common fields by name
  const typePatterns = [/^type$/i, /^task.?type$/i, /^category$/i];
  const priorityPatterns = [/^priority$/i, /^urgency$/i];
  const estimatePatterns = [
    /^estimate$/i,
    /^estimation$/i,
    /^time.?estimate$/i,
  ];
  const labelsPatterns = [/^labels?$/i, /^tags?$/i];

  let typeField = null;
  let priorityField = null;
  let estimateField = null;
  let labelsField = null;

  for (const field of fields) {
    const name = field.attributes?.name || "";

    if (!typeField) {
      for (const pattern of typePatterns) {
        if (pattern.test(name)) {
          typeField = field;
          break;
        }
      }
    }

    if (!priorityField) {
      for (const pattern of priorityPatterns) {
        if (pattern.test(name)) {
          priorityField = field;
          break;
        }
      }
    }

    if (!estimateField) {
      for (const pattern of estimatePatterns) {
        if (pattern.test(name)) {
          estimateField = field;
          break;
        }
      }
    }

    if (!labelsField) {
      for (const pattern of labelsPatterns) {
        if (pattern.test(name)) {
          labelsField = field;
          break;
        }
      }
    }
  }

  return {
    typeField,
    priorityField,
    estimateField,
    labelsField,
    allFields: fields,
  };
}

async function discoverFieldOptions(fieldId, token, orgId) {
  const options = await fetchAllPages("/custom_field_options", token, orgId, {
    "filter[custom_field_id]": fieldId,
  });

  const mapping = {};
  for (const option of options) {
    const name = option.attributes?.name;
    if (name) {
      mapping[name] = option.id;
    }
  }

  return mapping;
}

/**
 * Determine which workflow this organisation's tasks actually use, by sampling
 * recent tasks and counting the workflow behind each one's status.
 *
 * Productive scopes statuses to a workflow, and organisations commonly leave an
 * unused "Default workflow" in place alongside the one they really work in.
 * Sampling tells us which is which.
 */
async function detectDominantWorkflow(token, orgId, statusWorkflow) {
  const SAMPLE_PAGES = 2;
  const counts = {};

  for (let page = 1; page <= SAMPLE_PAGES; page++) {
    let response;
    try {
      response = await apiGet("/tasks", token, orgId, {
        "page[number]": page,
        "page[size]": 100,
        sort: "-created_at",
        // Required: without it the API omits relationship linkage entirely and
        // every task looks like it has no status.
        include: "workflow_status",
      });
    } catch {
      break; // Sampling is best-effort; fall back to counting statuses.
    }

    const tasks = Array.isArray(response.data) ? response.data : [];
    for (const task of tasks) {
      const statusId = task.relationships?.workflow_status?.data?.id;
      const workflowId = statusId ? statusWorkflow[statusId] : undefined;
      if (workflowId) {
        counts[workflowId] = (counts[workflowId] || 0) + 1;
      }
    }

    if (tasks.length < 100) break;
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { id: null, sampled: 0, counts };

  const sampled = ranked.reduce((sum, [, n]) => sum + n, 0);
  return { id: ranked[0][0], sampled, counts };
}

async function discoverWorkflowStatuses(token, orgId) {
  console.log("Fetching workflow statuses...");

  const { data: statuses, included } = await fetchAllPagesWithIncluded(
    "/workflow_statuses",
    token,
    orgId,
    { include: "workflow" },
  );
  console.log(`  Found ${statuses.length} workflow statuses`);

  const workflowNames = {};
  for (const item of included) {
    if (item.type === "workflows") {
      workflowNames[item.id] = item.attributes?.name || item.id;
    }
  }

  // status id -> workflow id
  const statusWorkflow = {};
  for (const status of statuses) {
    const workflowId = status.relationships?.workflow?.data?.id;
    if (workflowId) statusWorkflow[status.id] = workflowId;
  }

  const workflowCount = new Set(Object.values(statusWorkflow)).size;
  const dominant = await detectDominantWorkflow(token, orgId, statusWorkflow);
  const dominantName = dominant.id ? workflowNames[dominant.id] : null;

  if (workflowCount > 1) {
    console.log(`  Detected ${workflowCount} workflows.`);
    if (dominant.id) {
      const used = dominant.counts[dominant.id];
      console.log(
        `  Your tasks mostly use "${dominantName}" (${used}/${dominant.sampled} of sampled tasks).`,
      );
    } else {
      console.log(
        `  Could not determine which workflow your tasks use; falling back to the first of each name.`,
      );
    }
  }

  // Group by name so duplicates across workflows can be resolved deliberately
  // rather than by whichever the API happened to return first.
  const byName = new Map();
  for (const status of statuses) {
    const name = status.attributes?.name;
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(status);
  }

  const mapping = {};
  const statusWorkflowNames = {};
  const names = [];
  const collisions = [];
  const foreignOnly = [];

  for (const [name, candidates] of byName) {
    let chosen = candidates[0];

    if (candidates.length > 1) {
      const preferred = dominant.id
        ? candidates.find((c) => statusWorkflow[c.id] === dominant.id)
        : undefined;
      if (preferred) chosen = preferred;

      collisions.push({
        name,
        chosen,
        dropped: candidates.filter((c) => c.id !== chosen.id),
        resolved: Boolean(preferred),
      });
    } else if (
      dominant.id &&
      statusWorkflow[chosen.id] &&
      statusWorkflow[chosen.id] !== dominant.id
    ) {
      // Unique name, but it lives in a workflow your tasks don't use — the API
      // will reject it on those tasks.
      foreignOnly.push({ name, chosen });
    }

    mapping[name] = chosen.id;
    statusWorkflowNames[name] =
      workflowNames[statusWorkflow[chosen.id]] || "unknown";
    names.push(name);
  }

  if (collisions.length > 0) {
    console.log(
      `\n  ${collisions.length} status name(s) exist in more than one workflow:`,
    );
    for (const c of collisions) {
      const chosenWf = workflowNames[statusWorkflow[c.chosen.id]] || "unknown";
      const droppedDesc = c.dropped
        .map(
          (d) =>
            `${d.id} (${workflowNames[statusWorkflow[d.id]] || "unknown"})`,
        )
        .join(", ");
      console.log(
        `    "${c.name}": using ${c.chosen.id} (${chosenWf})${
          c.resolved ? "" : " [could not confirm — verify this]"
        }; ignoring ${droppedDesc}`,
      );
    }
  }

  if (foreignOnly.length > 0) {
    console.log(
      `\n  Warning: ${foreignOnly.length} status(es) exist only in a workflow your tasks don't use.`,
    );
    console.log(
      `  Setting these on a "${dominantName}" task will be rejected by the API:`,
    );
    for (const f of foreignOnly) {
      const wf = workflowNames[statusWorkflow[f.chosen.id]] || "unknown";
      console.log(`    "${f.name}" (only in ${wf})`);
    }
  }

  return {
    mapping,
    names,
    statusWorkflowNames,
    dominantWorkflow: dominant.id
      ? { id: dominant.id, name: dominantName }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("Productive.io MCP Server - Auto Setup");
  console.log("=".repeat(60));

  // Load credentials
  const env = loadEnv();
  const token = env.PRODUCTIVE_API_TOKEN;
  const orgId = env.PRODUCTIVE_ORG_ID;

  if (!token || token === "your_api_token_here") {
    console.error("\nError: PRODUCTIVE_API_TOKEN is not set in .env");
    console.error(
      "Add your API token from Productive.io Settings > Integrations > API\n",
    );
    process.exit(1);
  }

  if (!orgId || orgId === "your_org_id_here") {
    console.error("\nError: PRODUCTIVE_ORG_ID is not set in .env");
    console.error(
      "This is the number in your Productive URL: https://app.productive.io/{ORG_ID}/...\n",
    );
    process.exit(1);
  }

  // Verify connection
  console.log("\nConnecting to Productive.io...");
  try {
    await apiGet("/organization_memberships", token, orgId, {
      "page[size]": 1,
    });
    console.log("  Connected successfully");
  } catch (err) {
    console.error(`\nError: Could not connect to Productive.io`);
    console.error(`  ${err.message}`);
    console.error("\nCheck your API token and organisation ID in .env\n");
    process.exit(1);
  }

  // Discover custom fields
  const { typeField, priorityField, estimateField, labelsField, allFields } =
    await discoverCustomFields(token, orgId);

  const config = {
    custom_field_ids: {
      task_type: "",
      priority: "",
      estimate: "",
      labels: "",
    },
    task_type_options: {},
    priority_options: {},
    label_options: {},
    workflow_status_names: [],
    workflow_status_ids: {},
    workflow_status_workflows: {},
  };

  // Task type field
  if (typeField) {
    console.log(
      `  Task type field: "${typeField.attributes.name}" (ID: ${typeField.id})`,
    );
    config.custom_field_ids.task_type = typeField.id;

    const options = await discoverFieldOptions(typeField.id, token, orgId);
    config.task_type_options = options;
    console.log(`    Options: ${Object.keys(options).join(", ") || "(none)"}`);
  } else {
    console.log(
      "  Task type field: not found (task type setting will be disabled)",
    );
    console.log(
      "    If you have a custom field for task types, you can add it manually to productive.config.json",
    );
  }

  // Priority field
  if (priorityField) {
    console.log(
      `  Priority field: "${priorityField.attributes.name}" (ID: ${priorityField.id})`,
    );
    config.custom_field_ids.priority = priorityField.id;

    const options = await discoverFieldOptions(priorityField.id, token, orgId);
    config.priority_options = options;
    console.log(`    Options: ${Object.keys(options).join(", ") || "(none)"}`);
  } else {
    console.log(
      "  Priority field: not found (priority setting will be disabled)",
    );
  }

  // Estimate field
  if (estimateField) {
    console.log(
      `  Estimate field: "${estimateField.attributes.name}" (ID: ${estimateField.id})`,
    );
    config.custom_field_ids.estimate = estimateField.id;
  } else {
    console.log(
      "  Estimate field: not found (estimate setting will be disabled)",
    );
  }

  // Labels field
  if (labelsField) {
    console.log(
      `  Labels field: "${labelsField.attributes.name}" (ID: ${labelsField.id})`,
    );
    config.custom_field_ids.labels = labelsField.id;

    const options = await discoverFieldOptions(labelsField.id, token, orgId);
    config.label_options = options;
    console.log(`    Options: ${Object.keys(options).join(", ") || "(none)"}`);
  } else {
    console.log("  Labels field: not found (labels setting will be disabled)");
  }

  // Workflow statuses
  const {
    mapping: statusMapping,
    names: statusNames,
    statusWorkflowNames,
    dominantWorkflow,
  } = await discoverWorkflowStatuses(token, orgId);

  config.workflow_status_names = statusNames;
  config.workflow_status_ids = statusMapping;
  config.workflow_status_workflows = statusWorkflowNames;
  if (dominantWorkflow) {
    config.dominant_workflow = dominantWorkflow;
  }

  // Write config
  const configPath = join(__dirname, "productive.config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  console.log("\n" + "=".repeat(60));
  console.log("Setup complete!");
  console.log("=".repeat(60));
  console.log(`\nConfiguration written to: productive.config.json`);
  console.log(
    `  Custom fields found: ${[typeField, priorityField, estimateField, labelsField].filter(Boolean).length}/4`,
  );
  console.log(`  Workflow statuses found: ${statusNames.length}`);

  if (!typeField || !priorityField) {
    console.log("\nNote: Some custom fields weren't auto-detected.");
    console.log("You can manually edit productive.config.json if needed.");
    console.log(
      "The server works without them - you just won't be able to set those fields.\n",
    );

    if (allFields.length > 0) {
      console.log("Available custom fields in your account:");
      for (const field of allFields) {
        const name = field.attributes?.name || "(unnamed)";
        const kind = field.attributes?.custom_field_type || "";
        console.log(`  - "${name}" (ID: ${field.id}, type: ${kind})`);
      }
      console.log("");
    }
  }

  console.log("Next steps:");
  console.log("  1. Review productive.config.json (edit if needed)");
  console.log("  2. Run: npm run build");
  console.log("  3. Configure Claude Desktop or Claude Code (see README.md)\n");
}

main().catch((err) => {
  console.error(`\nUnexpected error: ${err.message}\n`);
  process.exit(1);
});
