import crypto from "crypto";

export type McpProjectedFieldKind = "string" | "number" | "boolean" | "enum";

export interface McpProjectedField {
  name: string;
  label: string;
  kind: McpProjectedFieldKind;
  required: boolean;
  options?: string[];
  hidden?: boolean;
  warning?: string;
}

export interface McpToolSchemaProjection {
  toolName: string;
  schemaHash: string;
  fields: McpProjectedField[];
  warnings: string[];
}

const PROTECTED_FIELD_NAMES = new Set([
  "transport",
  "mcpConnectionId",
  "sharedGroupId",
  "connectionOwnerUserId",
  "creditPolicy",
  "originSurface",
  "providerKey",
  "ownerUserId",
  "actorUserId",
]);

function schemaHash(inputSchema: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(inputSchema)).digest("hex");
}

export function projectMcpToolInputSchema(params: {
  toolName: string;
  inputSchema: Record<string, unknown>;
}): McpToolSchemaProjection {
  const properties = (params.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(
    Array.isArray(params.inputSchema.required)
      ? params.inputSchema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  const fields: McpProjectedField[] = [];
  const warnings: string[] = [];

  for (const [name, property] of Object.entries(properties)) {
    if (PROTECTED_FIELD_NAMES.has(name)) {
      warnings.push(`${name} is protected and cannot be controlled by provider schema`);
      continue;
    }
    const type = property.type;
    const label = typeof property.title === "string" ? property.title : name;
    if (Array.isArray(property.enum) && property.enum.every((value) => typeof value === "string")) {
      fields.push({ name, label, kind: "enum", required: required.has(name), options: property.enum as string[] });
      continue;
    }
    if (type === "string" || type === "number" || type === "integer" || type === "boolean") {
      fields.push({
        name,
        label,
        kind: type === "integer" ? "number" : type,
        required: required.has(name),
      } as McpProjectedField);
      continue;
    }
    fields.push({
      name,
      label,
      kind: "string",
      required: required.has(name),
      hidden: true,
      warning: `Unsupported MCP schema field type: ${String(type ?? "unknown")}`,
    });
    warnings.push(`${name} is hidden because its schema type is unsupported`);
  }

  return {
    toolName: params.toolName,
    schemaHash: schemaHash(params.inputSchema),
    fields,
    warnings,
  };
}
