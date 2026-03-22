No neighboring sections written yet. I have all the context I need. Let me produce the section content.

# Section 04 — OpenAPI Import (ToolFactory)

## Overview

This section implements the OpenAPI 3.0/3.1 import flow that lets users paste or upload an OpenAPI specification and bulk-create custom tools from its operations. It depends on **section-01** (database migration adding `inputSchema`, `outputSchema`, `httpMethod`, `headersEncrypted`, `version`, `isEnabled`, etc. to `agencyTools`) and **section-02** (custom tools backend CRUD — the `createCustomTool` procedure and SSRF validation patterns).

**Scope**: A new service file (`openApiToolFactory.ts`), two tRPC procedures (`importOpenAPITools`, `confirmOpenAPIImport`), and a frontend modal (`OpenAPIImportModal.tsx`).

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/services/openApiToolFactory.ts` | **CREATE** | OpenAPI parser + tool preview extraction |
| `apps/web/server/services/__tests__/openApiToolFactory.test.ts` | **CREATE** | Unit tests for parser service |
| `apps/web/server/routers/agency.ts` | **MODIFY** | Add `importOpenAPITools` and `confirmOpenAPIImport` procedures |
| `apps/web/server/routers/__tests__/agencyOpenApiImport.test.ts` | **CREATE** | tRPC procedure tests |
| `apps/web/client/src/components/agency/OpenAPIImportModal.tsx` | **CREATE** | Frontend import wizard modal |
| `apps/web/client/src/components/agency/OpenAPIImportModal.test.tsx` | **CREATE** | Frontend component tests |

---

## Dependencies

- **section-01-database-migration**: The `agencyTools` table must have the new columns (`inputSchema`, `outputSchema`, `httpMethod`, `headersEncrypted`, `version`, `isEnabled`, `strictSchema`, `oneCallAtATime`, `icon`, `category`).
- **section-02-custom-tools-backend**: The `createCustomTool` procedure, SSRF validation helper (`apps/web/server/services/ssrfValidation.ts`), and encryption via `apps/web/server/services/crypto.ts` must be in place.
- **NPM dependency**: Add `@readme/openapi-parser` (or `swagger-parser`) and `yaml` to `apps/web/package.json`.

---

## Tests (Write First)

### 4.1 Parser Service Tests

**File**: `apps/web/server/services/__tests__/openApiToolFactory.test.ts`

```
Test: parseOpenApiSpec — parses valid OpenAPI 3.0 JSON spec and returns ToolPreview[]
  - Input: minimal OpenAPI 3.0 JSON with 2 GET operations
  - Assert: returns array of 2 previews with correct name, description, method, path, inputSchema

Test: parseOpenApiSpec — parses valid OpenAPI 3.1 YAML spec
  - Input: OpenAPI 3.1 YAML string with 1 POST operation + requestBody
  - Assert: returns 1 preview; inputSchema includes requestBody properties merged with path params

Test: parseOpenApiSpec — rejects circular $ref
  - Input: spec with schema A referencing B referencing A
  - Assert: throws OpenApiImportError with code "circular_ref"

Test: parseOpenApiSpec — rejects nesting depth >10
  - Input: spec with deeply nested allOf/oneOf (11 levels)
  - Assert: throws OpenApiImportError with code "max_depth_exceeded"

Test: parseOpenApiSpec — rejects spec with >100 operations
  - Input: spec with 101 path+method combos
  - Assert: throws OpenApiImportError with code "too_many_operations"

Test: parseOpenApiSpec — rejects spec >500KB
  - Input: string of 501,000 bytes
  - Assert: throws OpenApiImportError with code "spec_too_large"

Test: parseOpenApiSpec — SSRF-validates base URL (server.url)
  - Input: spec with servers[0].url = "http://169.254.169.254/..."
  - Assert: throws OpenApiImportError with code "ssrf_blocked"

Test: parseOpenApiSpec — extracts inputSchema from path parameters + requestBody
  - Input: POST /pets with path param petId (string) + requestBody {name, tag}
  - Assert: inputSchema has properties petId, name, tag with correct types; petId is required

Test: parseOpenApiSpec — uses operationId as tool name when available
  - Input: operation with operationId "listPets"
  - Assert: preview.name === "listPets"

Test: parseOpenApiSpec — falls back to METHOD_path as tool name
  - Input: operation without operationId, GET /pets
  - Assert: preview.name === "GET_pets"

Test: parseOpenApiSpec — extracts security scheme as auth header hint
  - Input: spec with securitySchemes.bearerAuth (type: http, scheme: bearer)
  - Assert: preview.authHint === { type: "bearer", headerName: "Authorization" }
```

### 4.2 tRPC Procedure Tests

**File**: `apps/web/server/routers/__tests__/agencyOpenApiImport.test.ts`

```
Test: importOpenAPITools — parses valid spec and returns previews
  - Mock: parser returns 3 ToolPreview items
  - Assert: result.previews has length 3, each with name/description/method/path/inputSchema

Test: importOpenAPITools — rejects spec >500KB via Zod validation
  - Input: specContent string of 501KB
  - Assert: throws TRPCError with code BAD_REQUEST

Test: importOpenAPITools — applies rate limit 5/min per user
  - Call 6 times rapidly
  - Assert: 6th call throws TRPCError with code TOO_MANY_REQUESTS

Test: importOpenAPITools — validates baseUrl override with SSRF check
  - Input: baseUrl = "http://10.0.0.1/api"
  - Assert: throws TRPCError with code BAD_REQUEST, message contains "SSRF"

Test: confirmOpenAPIImport — bulk creates tools from selected previews
  - Mock: DB empty (0 existing tools), input: 3 tool previews
  - Assert: 3 rows inserted into agencyTools with correct fields

Test: confirmOpenAPIImport — rejects if total tools would exceed 50-tool cap
  - Mock: DB has 48 existing tools, input: 5 previews to import
  - Assert: throws TRPCError with code BAD_REQUEST, message contains "50 tool limit"

Test: confirmOpenAPIImport — encrypts API key header before storage
  - Input: apiKey provided in import
  - Assert: inserted rows have headersEncrypted !== null, value is encrypt() output format

Test: confirmOpenAPIImport — sets toolType to "openapi_import" on created tools
  - Assert: all inserted tools have toolType === "openapi_import"
```

### 4.3 Frontend Component Tests

**File**: `apps/web/client/src/components/agency/OpenAPIImportModal.test.tsx`

```
Test: renders upload/paste area when opened
  - Assert: textarea for spec content visible, "Import" button present

Test: shows preview table after successful parse
  - Mock: tRPC importOpenAPITools returns 3 previews
  - Assert: table with 3 rows, each with checkbox, name, method, path

Test: disables confirm button when no tools selected
  - Assert: confirm button disabled when all checkboxes unchecked

Test: shows error toast on parse failure
  - Mock: tRPC importOpenAPITools throws error
  - Assert: error message displayed

Test: calls confirmOpenAPIImport with selected tool IDs on confirm
  - Select 2 of 3 tools, click confirm
  - Assert: confirmOpenAPIImport called with exactly 2 selected previews

Test: shows base URL override input field
  - Assert: optional baseUrl text input present

Test: shows API key input field (password type)
  - Assert: input[type="password"] for apiKey present
```

---

## Implementation Guidance

### 4.4 Parser Service — `openApiToolFactory.ts`

**Location**: `apps/web/server/services/openApiToolFactory.ts`

**Exports**:

```typescript
// Type definitions (not full implementations)
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
  ) { ... }
}

export async function parseOpenApiSpec(options: {
  specContent: string;
  specFormat: "json" | "yaml";
  baseUrlOverride?: string;
}): Promise<{ previews: ToolPreview[]; baseUrl: string }>;
```

**Key logic inside `parseOpenApiSpec`**:

1. **Size guard**: If `specContent.length > 500_000`, throw `spec_too_large`.
2. **Parse**: Use `yaml` package for YAML, `JSON.parse` for JSON. Catch parse errors and wrap as `parse_error`.
3. **Validate with `@readme/openapi-parser`**: Call `OpenAPIParser.validate(spec)`. This detects circular `$ref` (catch and map to `circular_ref`).
4. **Extract base URL**: From `spec.servers[0].url`, overridden by `baseUrlOverride` if provided.
5. **SSRF validate base URL**: Import `validateSsrfUrl` from `apps/web/server/services/ssrfValidation.ts`. If blocked, throw `ssrf_blocked`.
6. **Depth check**: Walk the schema tree. If any `$ref` resolution chain exceeds 10 levels, throw `max_depth_exceeded`.
7. **Operation extraction**: Iterate `spec.paths` entries. For each path, iterate HTTP methods (`get`, `post`, `put`, `delete`, `patch`). Count total; if >100, throw `too_many_operations`.
8. **Build ToolPreview per operation**:
   - `name`: `operation.operationId` or `${METHOD.toUpperCase()}_${sanitizePath(path)}` (replace `/`, `{`, `}` with underscores).
   - `description`: `operation.summary` or `operation.description` or `"${method} ${path}"`.
   - `inputSchema`: Merge path parameters (as `properties` with `required` array), query parameters, and `requestBody.content["application/json"].schema` into a single JSON Schema object.
   - `authHint`: Derive from `spec.components.securitySchemes` (first bearer or apiKey scheme).
9. Return `{ previews, baseUrl }`.

### 4.5 tRPC Procedures

**Location**: `apps/web/server/routers/agency.ts` — add to the existing agency router.

**`importOpenAPITools`** (mutation):

```typescript
// Zod input schema sketch (not full implementation)
z.object({
  specContent: z.string().min(1).max(500_000),
  specFormat: z.enum(["json", "yaml"]),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(500).optional(),
})
```

- Rate limit: 5 calls/min per user (use existing rate-limit pattern from section-02).
- Call `parseOpenApiSpec(...)` from the service.
- If `baseUrl` provided, run SSRF validation before passing to parser.
- Return `{ previews: ToolPreview[], baseUrl: string }`.

**`confirmOpenAPIImport`** (mutation):

```typescript
// Zod input schema sketch
z.object({
  selectedTools: z.array(z.object({
    name: z.string().max(100),
    description: z.string().max(500),
    httpMethod: z.string(),
    path: z.string(),
    inputSchema: z.record(z.unknown()),
  })).min(1).max(100),
  baseUrl: z.string().url(),
  apiKey: z.string().max(500).optional(),
  agencyId: z.string().uuid().optional(),
})
```

- **50-tool cap check**: Count existing tools for tenant (`SELECT count(*) FROM agency_tools WHERE tenantId = ?`). If `existingCount + selectedTools.length > 50`, reject with BAD_REQUEST.
- **Bulk insert**: For each selected tool, INSERT into `agencyTools` with:
  - `id`: `crypto.randomUUID()`
  - `tenantId`: from context
  - `name`: from preview
  - `description`: from preview
  - `toolType`: `"openapi_import"`
  - `config`: `{ baseUrl, path: tool.path }` (JSONB)
  - `httpMethod`: from preview
  - `inputSchema`: from preview
  - `headersEncrypted`: if `apiKey` provided, `encrypt(JSON.stringify({ Authorization: "Bearer " + apiKey }))`, else null
  - `version`: 1
  - `isEnabled`: true
- Use a single `db.insert(agencyTools).values(allRows)` for efficiency.
- Return `{ created: number, toolIds: string[] }`.

### 4.6 Frontend — `OpenAPIImportModal.tsx`

**Location**: `apps/web/client/src/components/agency/OpenAPIImportModal.tsx`

**Props**:

```typescript
interface OpenAPIImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (toolIds: string[]) => void;
}
```

**Two-step wizard UI**:

1. **Step 1 — Input**: Radix Dialog with:
   - Textarea for pasting spec content (or file upload button that reads file to textarea).
   - Radio group for format: JSON / YAML.
   - Optional: base URL override text input.
   - Optional: API key input (`type="password"`).
   - "Parse & Preview" button → calls `trpc.agency.importOpenAPITools.useMutation()`.
   - Loading state with spinner while parsing.

2. **Step 2 — Preview & Confirm**: Shows after successful parse:
   - Table with columns: checkbox, name, method, path, description.
   - "Select All" / "Deselect All" toggle.
   - Tool count badge: "X of Y selected".
   - Warning banner if selection would exceed 50-tool cap (requires knowing current tool count — fetch via existing `listCustomTools` or a separate count query).
   - "Confirm Import" button → calls `trpc.agency.confirmOpenAPIImport.useMutation()`.
   - Success toast on completion, calls `onImportComplete` callback.

**State management**: Use React `useState` for step, selected tool indices, spec content, format, baseUrl, apiKey. Use TanStack Query mutations for the two tRPC calls.

**Integration point**: The modal is triggered from a button in the `ToolPicker.tsx` component (section-03) or `CustomToolCreator.tsx`. Add an "Import from OpenAPI" button that opens this modal. If section-03 is not yet implemented, the modal can be rendered standalone from `AgencyBuilder.tsx` sidebar.

---

## Security Considerations

- **SSRF**: Base URL is validated at import time (in `parseOpenApiSpec`) AND at execution time (in the custom tool bridge from section-02). Double validation is intentional because DNS can resolve differently over time.
- **Spec size**: Hard limit at 500KB prevents memory exhaustion from large specs.
- **Operation count**: Hard limit at 100 prevents excessive tool creation from a single import.
- **Circular $ref**: Detected by the OpenAPI parser library; wrapped as a typed error.
- **API key encryption**: Keys are encrypted via `crypto.ts` AES-256-GCM before database storage in `headersEncrypted`. Never stored in plaintext `config` JSONB.
- **Tenant isolation**: Both procedures use `ctx.tenantId` for all queries and inserts. The 50-tool cap is per-tenant.

---

## Verification Checklist

- [ ] All 10 parser service tests pass
- [ ] All 8 tRPC procedure tests pass
- [ ] All 7 frontend component tests pass
- [ ] `pnpm check` passes with no new type errors
- [ ] Importing a Petstore-style spec creates correct tools with proper inputSchema
- [ ] Base URL SSRF validation blocks private IPs
- [ ] 50-tool cap enforced when tenant already has tools
- [ ] API key stored encrypted, not in plaintext config column
- [ ] Rate limit (5/min) works on importOpenAPITools