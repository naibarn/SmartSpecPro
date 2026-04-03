/**
 * OpenAPI Tool Factory — parses OpenAPI 3.0/3.1 specs and extracts tool previews
 * for bulk-creating custom agency tools.
 */

import yaml from "js-yaml";
import { validateSsrfUrlWithRuntime } from "./ssrfValidator";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ToolPreview {
  /** Derived from operationId or METHOD_path */
  name: string;
  description: string;
  httpMethod: string;
  path: string;
  /** JSON Schema derived from parameters + requestBody */
  inputSchema: Record<string, unknown>;
  /** Hint about auth scheme from securitySchemes */
  authHint?: { type: string; headerName: string };
}

export class OpenApiImportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "circular_ref"
      | "max_depth_exceeded"
      | "too_many_operations"
      | "spec_too_large"
      | "ssrf_blocked"
      | "parse_error",
  ) {
    super(message);
    this.name = "OpenApiImportError";
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_SPEC_SIZE = 500_000;
const MAX_OPERATIONS = 100;
const MAX_REF_DEPTH = 10;
// Intentionally excludes options, head, trace — uncommon for tool operations
const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

// ── Internal helpers ────────────────────────────────────────────────────────

/** Sanitize a path for use as a tool name (replace /, {, } with _) */
function sanitizePath(path: string): string {
  return path
    .replace(/^\//, "")
    .replace(/[/{}]/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "");
}

/**
 * Recursively resolve $ref references in a parsed OpenAPI spec.
 * Throws on circular references or excessive depth.
 */
function resolveRef(
  obj: Record<string, unknown>,
  root: Record<string, unknown>,
  depth: number = 0,
  visited: Set<string> = new Set(),
): Record<string, unknown> {
  if (depth > MAX_REF_DEPTH) {
    throw new OpenApiImportError(
      `Schema nesting depth exceeds ${MAX_REF_DEPTH} levels`,
      "max_depth_exceeded",
    );
  }

  const ref = obj["$ref"];
  if (typeof ref !== "string") return obj;

  if (visited.has(ref)) {
    throw new OpenApiImportError(
      `Circular $ref detected: ${ref}`,
      "circular_ref",
    );
  }

  visited.add(ref);

  // Resolve JSON pointer (e.g. #/components/schemas/Pet)
  const parts = ref.replace(/^#\//, "").split("/");
  let resolved: unknown = root;
  for (const part of parts) {
    if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
      resolved = (resolved as Record<string, unknown>)[part];
    } else {
      throw new OpenApiImportError(
        `Cannot resolve $ref: ${ref}`,
        "parse_error",
      );
    }
  }

  if (!resolved || typeof resolved !== "object") {
    throw new OpenApiImportError(
      `$ref resolves to non-object: ${ref}`,
      "parse_error",
    );
  }

  return resolveRef(
    resolved as Record<string, unknown>,
    root,
    depth + 1,
    new Set(visited),
  );
}

/**
 * Walk a schema tree checking for excessive nesting depth.
 * Checks allOf, oneOf, anyOf, items, properties, and additionalProperties.
 */
function checkSchemaDepth(
  schema: unknown,
  root: Record<string, unknown>,
  depth: number = 0,
  visited: Set<string> = new Set(),
): void {
  if (depth > MAX_REF_DEPTH) {
    throw new OpenApiImportError(
      `Schema nesting depth exceeds ${MAX_REF_DEPTH} levels`,
      "max_depth_exceeded",
    );
  }

  if (!schema || typeof schema !== "object") return;
  const s = schema as Record<string, unknown>;

  // Resolve $ref first
  if (s["$ref"]) {
    const resolved = resolveRef(s, root, depth, visited);
    checkSchemaDepth(resolved, root, depth + 1, new Set(visited));
    return;
  }

  // Check composition keywords
  for (const keyword of ["allOf", "oneOf", "anyOf"]) {
    const arr = s[keyword];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        checkSchemaDepth(item, root, depth + 1, visited);
      }
    }
  }

  // Check items (array schema)
  if (s.items) {
    checkSchemaDepth(s.items, root, depth + 1, visited);
  }

  // Check properties
  if (s.properties && typeof s.properties === "object") {
    for (const prop of Object.values(s.properties as Record<string, unknown>)) {
      checkSchemaDepth(prop, root, depth + 1, visited);
    }
  }

  // Check additionalProperties
  if (s.additionalProperties && typeof s.additionalProperties === "object") {
    checkSchemaDepth(s.additionalProperties, root, depth + 1, visited);
  }
}

/**
 * Build a flat JSON Schema from OpenAPI operation parameters and requestBody.
 */
function buildInputSchema(
  operation: Record<string, unknown>,
  root: Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Extract path/query/header parameters
  const params = operation.parameters;
  if (Array.isArray(params)) {
    for (const rawParam of params) {
      const param = rawParam["$ref"]
        ? resolveRef(rawParam as Record<string, unknown>, root)
        : (rawParam as Record<string, unknown>);
      const name = param.name as string;
      if (!name) continue;

      // Resolve parameter schema (may itself be a $ref)
      let schema: Record<string, unknown> = { type: "string" };
      if (param.schema) {
        const rawSchema = param.schema as Record<string, unknown>;
        schema = rawSchema["$ref"]
          ? resolveRef(rawSchema, root)
          : rawSchema;
      }

      // Spread full schema to preserve format, enum, min/max, pattern, etc.
      const { $ref: _ref, ...schemaProps } = schema;
      properties[name] = {
        ...schemaProps,
        type: schema.type || "string",
        description: (param.description as string) || schemaProps.description || undefined,
      };

      if (param.required === true) {
        required.push(name);
      }
    }
  }

  // Extract requestBody properties
  const requestBody = operation.requestBody as Record<string, unknown> | undefined;
  if (requestBody) {
    const resolved = requestBody["$ref"]
      ? resolveRef(requestBody, root)
      : requestBody;
    const content = resolved.content as Record<string, unknown> | undefined;
    if (content) {
      const jsonContent = (content["application/json"] || content["*/*"]) as
        | Record<string, unknown>
        | undefined;
      if (jsonContent?.schema) {
        const bodySchema = (jsonContent.schema as Record<string, unknown>)["$ref"]
          ? resolveRef(jsonContent.schema as Record<string, unknown>, root)
          : (jsonContent.schema as Record<string, unknown>);

        if (bodySchema.properties && typeof bodySchema.properties === "object") {
          for (const [key, val] of Object.entries(
            bodySchema.properties as Record<string, unknown>,
          )) {
            properties[key] = val;
          }
        }

        if (Array.isArray(bodySchema.required)) {
          for (const r of bodySchema.required) {
            if (typeof r === "string" && !required.includes(r)) {
              required.push(r);
            }
          }
        }
      }
    }
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties,
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

/**
 * Extract auth hint from securitySchemes.
 */
function extractAuthHint(
  spec: Record<string, unknown>,
): { type: string; headerName: string } | undefined {
  const components = spec.components as Record<string, unknown> | undefined;
  if (!components) return undefined;

  const schemes = components.securitySchemes as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!schemes) return undefined;

  for (const scheme of Object.values(schemes)) {
    if (scheme.type === "http" && scheme.scheme === "bearer") {
      return { type: "bearer", headerName: "Authorization" };
    }
    if (scheme.type === "apiKey") {
      return {
        type: "apiKey",
        headerName: (scheme.name as string) || "X-API-Key",
      };
    }
  }

  return undefined;
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function parseOpenApiSpec(options: {
  specContent: string;
  specFormat: "json" | "yaml";
  baseUrlOverride?: string;
}): Promise<{ previews: ToolPreview[]; baseUrl: string }> {
  const { specContent, specFormat, baseUrlOverride } = options;

  // 1. Size guard
  if (specContent.length > MAX_SPEC_SIZE) {
    throw new OpenApiImportError(
      `Spec exceeds ${MAX_SPEC_SIZE} byte limit (got ${specContent.length})`,
      "spec_too_large",
    );
  }

  // 2. Parse
  let spec: Record<string, unknown>;
  try {
    if (specFormat === "yaml") {
      spec = yaml.load(specContent) as Record<string, unknown>;
    } else {
      spec = JSON.parse(specContent);
    }
  } catch (e: any) {
    throw new OpenApiImportError(
      `Failed to parse spec: ${e.message}`,
      "parse_error",
    );
  }

  if (!spec || typeof spec !== "object") {
    throw new OpenApiImportError("Spec must be a valid object", "parse_error");
  }

  // 3. Basic OpenAPI validation
  if (!spec.openapi && !spec.swagger) {
    throw new OpenApiImportError(
      "Missing 'openapi' or 'swagger' version field",
      "parse_error",
    );
  }

  // 4. Extract base URL
  let baseUrl = "";
  const servers = spec.servers as Array<{ url?: string }> | undefined;
  if (servers && servers.length > 0 && servers[0].url) {
    baseUrl = servers[0].url;
  }
  if (baseUrlOverride) {
    baseUrl = baseUrlOverride;
  }

  // 5. SSRF validate base URL
  if (baseUrl) {
    try {
      await validateSsrfUrlWithRuntime(baseUrl);
    } catch (e: any) {
      throw new OpenApiImportError(
        `Base URL blocked: ${e.message}`,
        "ssrf_blocked",
      );
    }
  }

  // 6. Extract operations from paths
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) {
    throw new OpenApiImportError("Spec has no paths defined", "parse_error");
  }

  const previews: ToolPreview[] = [];
  let operationCount = 0;
  const authHint = extractAuthHint(spec);

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      operationCount++;
      if (operationCount > MAX_OPERATIONS) {
        throw new OpenApiImportError(
          `Spec has more than ${MAX_OPERATIONS} operations`,
          "too_many_operations",
        );
      }

      // Check schema depth for this operation's schemas
      if (operation.requestBody) {
        const rb = operation.requestBody as Record<string, unknown>;
        const resolvedRb = rb["$ref"] ? resolveRef(rb, spec) : rb;
        const rbContent = resolvedRb.content as Record<string, Record<string, unknown>> | undefined;
        if (rbContent) {
          const jsonSchema = (rbContent["application/json"] || rbContent["*/*"])?.schema;
          if (jsonSchema) {
            checkSchemaDepth(jsonSchema, spec);
          }
        }
      }
      if (Array.isArray(operation.parameters)) {
        for (const param of operation.parameters) {
          if (param && typeof param === "object") {
            const p = (param as Record<string, unknown>)["$ref"]
              ? resolveRef(param as Record<string, unknown>, spec)
              : (param as Record<string, unknown>);
            if (p.schema) {
              checkSchemaDepth(p.schema, spec);
            }
          }
        }
      }

      // Build tool name
      const operationId = operation.operationId as string | undefined;
      const name = operationId || `${method.toUpperCase()}_${sanitizePath(path)}`;

      // Build description
      const description =
        (operation.summary as string) ||
        (operation.description as string) ||
        `${method.toUpperCase()} ${path}`;

      // Build input schema
      const inputSchema = buildInputSchema(operation, spec);

      previews.push({
        name,
        description,
        httpMethod: method.toUpperCase(),
        path,
        inputSchema,
        authHint,
      });
    }
  }

  return { previews, baseUrl };
}
