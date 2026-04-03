#!/usr/bin/env node

/**
 * Productive CLI — command-line interface to Productive.io API.
 * Reuses the same tool handlers and Zod schemas as the MCP server.
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { z } from "zod";
import { ProductiveClient } from "./client.js";
import { validateEnvironment } from "./utils/errors.js";
import { toolRegistry } from "./registry.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/**
 * Convert tool name to CLI command name.
 * "productive_search_tasks" -> "search-tasks"
 */
function toCommandName(toolName: string): string {
  return toolName.replace(/^productive_/, "").replace(/_/g, "-");
}

/**
 * Expand @file references in string values.
 * - @path reads from file
 * - @- reads from stdin
 */
function expandFileRefs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("@")) {
      const filePath = value.slice(1);
      try {
        if (filePath === "-") {
          result[key] = readFileSync(0, "utf-8");
        } else {
          result[key] = readFileSync(filePath, "utf-8");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Could not read file '${filePath}' for --${key}: ${msg}`,
        );
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Introspect a Zod schema to determine the shape keys and their types,
 * then register them as Commander options on the given command.
 */
function registerOptions(cmd: Command, schema: z.ZodTypeAny): void {
  // Unwrap ZodEffects (from .strict(), .transform(), etc.) to get the underlying object
  let inner = schema;
  while (inner instanceof z.ZodEffects) {
    inner = inner._def.schema;
  }
  if (!(inner instanceof z.ZodObject)) return;

  const shape = inner.shape as Record<string, z.ZodTypeAny>;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    // Skip response_format — we handle it globally
    if (key === "response_format") continue;

    const flag = `--${key}`;
    const isOptional = fieldSchema.isOptional();
    const description = getFieldDescription(fieldSchema);

    // Determine the base type (unwrap optional/default wrappers)
    const baseType = unwrapZodType(fieldSchema);

    if (baseType instanceof z.ZodBoolean) {
      cmd.option(flag, description);
    } else if (baseType instanceof z.ZodArray) {
      // Accept comma-separated values: --labels "Bug,Urgent"
      cmd.option(
        `${flag} <values>`,
        description,
        (val: string, prev: string[]) => {
          const items = val.split(",").map((s) => s.trim());
          return prev ? prev.concat(items) : items;
        },
        undefined,
      );
    } else if (baseType instanceof z.ZodEnum) {
      const choices = (baseType._def.values as string[]).join(", ");
      cmd.option(`${flag} <value>`, `${description} [choices: ${choices}]`);
    } else {
      // String, number, etc.
      if (isOptional) {
        cmd.option(`${flag} <value>`, description);
      } else {
        cmd.requiredOption(`${flag} <value>`, description);
      }
    }
  }
}

/**
 * Unwrap ZodOptional, ZodDefault, ZodEffects to get the inner type.
 */
function unwrapZodType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
    } else if (current instanceof z.ZodEffects) {
      current = current._def.schema;
    } else if (current instanceof z.ZodUnion) {
      // For union types (e.g. OptionalISO8601DateSchema = string | null),
      // use the first non-null option
      const options = current._def.options as z.ZodTypeAny[];
      const nonNull = options.find((o) => !(o instanceof z.ZodNull));
      if (nonNull) {
        current = nonNull;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return current;
}

/**
 * Extract a description from a Zod field (uses checks for min/max hints).
 */
function getFieldDescription(schema: z.ZodTypeAny): string {
  const base = unwrapZodType(schema);
  const parts: string[] = [];

  if (base instanceof z.ZodNumber) {
    parts.push("(number)");
  } else if (base instanceof z.ZodString) {
    // Check for string constraints
    const checks = (base._def as any).checks as
      | Array<{ kind: string; value?: number }>
      | undefined;
    if (checks) {
      const maxCheck = checks.find((c) => c.kind === "max");
      if (maxCheck?.value) parts.push(`(max ${maxCheck.value} chars)`);
    }
  }

  if (schema.isOptional()) {
    parts.push("(optional)");
  }

  return parts.join(" ") || "";
}

/**
 * Filter args to only include keys present in the schema shape,
 * preventing .strict() rejections from Commander internals.
 */
function filterToSchemaKeys(
  args: Record<string, unknown>,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  let inner = schema;
  while (inner instanceof z.ZodEffects) {
    inner = inner._def.schema;
  }
  if (!(inner instanceof z.ZodObject)) return args;

  const shapeKeys = new Set(
    Object.keys(inner.shape as Record<string, unknown>),
  );
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (shapeKeys.has(key) && value !== undefined) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Try to parse a string value as JSON (for complex/nested args).
 * Returns the parsed value if valid JSON object/array, otherwise the original string.
 */
function maybeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Coerce string values to numbers for ZodNumber fields.
 * Commander passes all <value> args as strings, but some schemas use
 * z.number() (not z.coerce.number()), which would reject string input.
 */
function coerceNumericFields(
  args: Record<string, unknown>,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  let inner = schema;
  while (inner instanceof z.ZodEffects) {
    inner = inner._def.schema;
  }
  if (!(inner instanceof z.ZodObject)) return args;

  const shape = inner.shape as Record<string, z.ZodTypeAny>;
  const result = { ...args };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== "string") continue;
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const baseType = unwrapZodType(fieldSchema);
    if (baseType instanceof z.ZodNumber) {
      const num = Number(value);
      if (!isNaN(num)) {
        result[key] = num;
      }
    }
  }

  return result;
}

// --- Main ---

const program = new Command()
  .name("productive")
  .description("CLI for the Productive.io API")
  .version(version)
  .option("--format <format>", "Output format: json or markdown", "json");

// Register a subcommand for each tool in the registry
for (const [toolName, entry] of Object.entries(toolRegistry)) {
  const cmdName = toCommandName(toolName);
  const cmd = program.command(cmdName);
  cmd.option("--format <format>", "Output format: json or markdown", "json");

  registerOptions(cmd, entry.schema);

  cmd.action(async (opts: Record<string, unknown>) => {
    try {
      validateEnvironment();
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Environment validation failed",
      );
      process.exit(1);
    }

    const client = new ProductiveClient(
      process.env.PRODUCTIVE_API_TOKEN!,
      process.env.PRODUCTIVE_ORG_ID!,
    );

    try {
      // Expand @file references
      let args = expandFileRefs(opts);

      // Try parsing JSON strings for complex fields
      for (const [key, value] of Object.entries(args)) {
        args[key] = maybeParseJson(value);
      }

      // Inject response_format — prefer subcommand --format, fall back to global
      if (!args.response_format) {
        args.response_format = (opts.format as string) || program.opts().format;
      }

      // Coerce string values to numbers for z.number() fields
      args = coerceNumericFields(args, entry.schema);

      // Filter to schema keys only (avoid .strict() rejections)
      args = filterToSchemaKeys(args, entry.schema);

      // Validate with Zod schema
      const validated = entry.schema.parse(args);

      // Call the tool handler
      const result = await entry.handler(client, validated);
      console.log(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:");
        for (const issue of error.issues) {
          console.error(`  ${issue.path.join(".")}: ${issue.message}`);
        }
        process.exit(1);
      }
      console.error(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
      process.exit(1);
    }
  });
}

program.parse();
