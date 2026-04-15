import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue = Record<string, unknown>;

async function loadSchema(): Promise<JsonValue> {
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../skills/editorial-layout-planner/output.schema.json",
  );
  const raw = await fs.readFile(schemaPath, "utf8");
  return JSON.parse(raw) as JsonValue;
}

function resolveJsonPointer(root: JsonValue, pointer: string): unknown {
  const parts = pointer.split("/").slice(1);
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return current;
}

function collectSchemaIssues(schema: JsonValue): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }

    const record = node as JsonValue;
    if (typeof record.$ref === "string") {
      const ref = String(record.$ref);
      if (seen.has(`${path}::${ref}`)) {
        return;
      }
      seen.add(`${path}::${ref}`);
      const resolved = resolveJsonPointer(schema, ref);
      if (resolved) {
        visit(resolved, `${path} -> ${ref}`);
      }
      return;
    }

    if (record.type === "object" && record.properties && typeof record.properties === "object") {
      const propertyKeys = Object.keys(record.properties as Record<string, unknown>);
      const requiredKeys = Array.isArray(record.required) ? record.required.map(String) : [];
      const missing = propertyKeys.filter((key) => !requiredKeys.includes(key));
      if (missing.length > 0) {
        issues.push(`${path} missing required keys: ${missing.join(", ")}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(record, "const") && typeof record.type !== "string") {
      issues.push(`${path} has const without type`);
    }

    for (const [key, value] of Object.entries(record)) {
      if (key === "properties" || key === "required" || key === "additionalProperties" || key === "title" || key === "type") {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, `${path}/${key}[${index}]`));
        continue;
      }
      if (value && typeof value === "object") {
        visit(value, `${path}/${key}`);
      }
    }
  };

  visit(schema, "root");
  return issues;
}

describe("editorial-layout-planner output schema", () => {
  it("keeps every object schema strict-compatible for provider structured output", async () => {
    const schema = await loadSchema();
    const issues = collectSchemaIssues(schema);
    expect(issues).toEqual([]);
  });
});
