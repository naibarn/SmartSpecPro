# Section 13: SDK Documentation -- OpenAPI Spec, Swagger UI, and MCP Manifest

## Overview

This section adds API discoverability and documentation to the Public API gateway. It covers three deliverables:

1. **OpenAPI 3.0 specification** served at `GET /v1/openapi.json` describing all `/v1/*` endpoints
2. **Swagger UI** mounted at `GET /v1/docs` for interactive API exploration
3. **MCP discovery manifest** verification at `GET /.well-known/mcp.json`

Python and TypeScript SDK stubs are documented here but deferred to a follow-up -- the REST API plus OpenAPI spec is sufficient for v1. SDK generation can be automated from the OpenAPI document later.

## Dependencies

This section depends on all endpoint sections being complete:
- **Section 05** (Skill API) -- `/v1/skills/*` endpoints
- **Section 06** (Agency API) -- `/v1/agencies/*` endpoints
- **Section 07** (Presentation API) -- `/v1/presentations/*` endpoints
- **Section 08** (Video/Media API) -- `/v1/video-projects/*` and `/v1/media/*` endpoints
- **Section 09** (MCP Server) -- `/v1/mcp` endpoint and `/.well-known/mcp.json`
- **Section 10** (Job Automation) -- `/v1/jobs/*` endpoints
- **Section 11** (Webhooks/Events) -- `/v1/webhooks/*` and `/v1/events` endpoints
- **Section 12** (Admin UI) -- no direct dependency, but the admin tRPC endpoints are not documented in the public OpenAPI spec

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routes/publicDocsApi.ts` | OpenAPI spec builder and Swagger UI mount |
| `apps/web/server/routes/__tests__/publicDocsApi.test.ts` | Tests for OpenAPI and Swagger endpoints |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Mount the docs routes |
| `apps/web/package.json` | Add `swagger-ui-express` and `@types/swagger-ui-express` dependencies |

---

## Tests

All tests go in `apps/web/server/routes/__tests__/publicDocsApi.test.ts`. The test file uses Vitest and exercises the OpenAPI spec and Swagger UI routes.

### OpenAPI Spec Tests

```
Test: GET /v1/openapi.json returns valid JSON with openapi 3.0.x version field
Test: OpenAPI spec info.title is "SmartSpecPro Public API"
Test: OpenAPI spec contains securitySchemes with bearerAuth (type: http, scheme: bearer)
Test: OpenAPI spec contains paths for all /v1/* endpoint groups (skills, agencies, presentations, video-projects, media, mcp, jobs, webhooks, events)
Test: Each path operation has at least one response schema defined
Test: POST /v1/skills/:skillId/execute path exists with requestBody and 200 response
Test: Error response schema matches common error format ({ error: { code, message, type } })
Test: OpenAPI spec servers array includes https://smartaihub.app
```

### Swagger UI Tests

```
Test: GET /v1/docs returns 200 with Content-Type text/html
Test: GET /v1/docs HTML contains swagger-ui references
Test: GET /v1/docs page loads the /v1/openapi.json spec URL
```

### MCP Manifest Verification Tests

```
Test: GET /.well-known/mcp.json returns valid JSON
Test: MCP manifest url field is "https://smartaihub.app/v1/mcp"
Test: MCP manifest auth.type is "bearer"
Test: MCP manifest capabilities.tools is true
Test: MCP manifest docs field is "https://smartaihub.app/v1/docs"
```

### Test Structure

```typescript
// apps/web/server/routes/__tests__/publicDocsApi.test.ts
import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the public API documentation endpoints.
 *
 * These tests validate that:
 * 1. The OpenAPI 3.0 spec is well-formed and covers all /v1/* endpoints
 * 2. Swagger UI is mounted and serves interactive docs
 * 3. The MCP discovery manifest is correct
 *
 * Approach: Import the spec builder function directly and validate
 * the generated object structure. For Swagger UI, use supertest
 * or a lightweight Express mock to verify the mounted route returns HTML.
 */

describe("OpenAPI Spec", () => {
  // Import and call buildOpenApiSpec() to get the raw spec object
  // Validate structure: openapi version, info, paths, components, securitySchemes
  // Validate that all endpoint groups have path entries
  // Validate error schema component matches the common error format
});

describe("Swagger UI", () => {
  // Mount the docs router on a test Express app
  // GET /v1/docs should return HTML containing swagger-ui
});

describe("MCP Manifest", () => {
  // Verify /.well-known/mcp.json structure
  // This endpoint is defined in section-09 (MCP Server)
  // These tests verify the contract is correct
});
```

---

## Implementation Details

### 1. Install Dependencies

Add `swagger-ui-express` to `apps/web/package.json`:

```bash
cd apps/web
pnpm add swagger-ui-express
pnpm add -D @types/swagger-ui-express
```

### 2. OpenAPI Spec Builder

Create `apps/web/server/routes/publicDocsApi.ts`. This file exports:

- **`buildOpenApiSpec()`** -- a function that returns a complete OpenAPI 3.0 JSON object
- **`registerPublicDocsRoutes(app)`** -- mounts `GET /v1/openapi.json` and `GET /v1/docs`

The spec should be built programmatically (not from JSDoc annotations) because the route files are spread across many modules. Constructing the spec as a plain JavaScript object gives full control and avoids annotation drift.

#### Spec Structure

The `buildOpenApiSpec()` function returns an object with this shape:

```typescript
{
  openapi: "3.0.3",
  info: {
    title: "SmartSpecPro Public API",
    version: "1.0.0",
    description: "Programmatic access to SmartSpecPro skills, agencies, media generation, presentations, and automation."
  },
  externalDocs: {
    description: "SmartSpecPro Developer Guide",
    url: "https://smartaihub.app/v1/docs"
  },
  servers: [
    { url: "https://smartaihub.app", description: "Production" }
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key in sk-ssp_ format"
      }
    },
    schemas: {
      // Common schemas: Error, Pagination, CreditHeaders, etc.
    }
  },
  paths: {
    // All /v1/* paths grouped by tag
  }
}
```

#### Path Definitions

Each endpoint group corresponds to a tag. The paths section must include entries for every endpoint defined in sections 05-11:

| Tag | Paths |
|-----|-------|
| Skills | `GET /v1/skills`, `GET /v1/skills/{skillId}`, `POST /v1/skills/{skillId}/execute`, `POST /v1/skills/detect` |
| Agencies | `GET /v1/agencies`, `POST /v1/agencies/{agencyId}/invoke`, `GET /v1/agencies/{agencyId}/runs/{runId}`, `GET /v1/agencies/{agencyId}/runs/{runId}/stream` |
| Presentations | `POST /v1/presentations/generate`, `GET /v1/presentations/tasks/{taskId}/progress`, `GET /v1/presentations/decks/{deckId}`, `POST /v1/presentations/decks/{deckId}/export`, `GET /v1/presentations/decks/{deckId}/export/download` |
| Video Projects | `POST /v1/video-projects`, `GET /v1/video-projects/{id}`, `GET /v1/video-projects/{id}/export/download` |
| Media | `POST /v1/media/images/generate`, `POST /v1/media/videos/generate`, `POST /v1/media/audio/generate`, `GET /v1/media/{taskId}/status` |
| MCP | `POST /v1/mcp` |
| Jobs | `POST /v1/jobs`, `GET /v1/jobs`, `GET /v1/jobs/{jobId}`, `DELETE /v1/jobs/{jobId}` |
| Webhooks | `POST /v1/webhooks`, `GET /v1/webhooks`, `DELETE /v1/webhooks/{id}` |
| Events | `GET /v1/events` |

#### Common Schemas

Define reusable component schemas referenced throughout the spec:

- **`Error`** -- the standard error envelope:
  ```
  { error: { code: string, message: string, type: string } }
  ```
  Error types: `invalid_request_error`, `authentication_error`, `billing_error`, `rate_limit_error`, `not_found_error`, `internal_error`, `feature_disabled_error`

- **`Pagination`** -- `{ page: number, limit: number, total: number, has_more: boolean }`

- **`SkillSummary`**, **`SkillDetail`**, **`AgencySummary`**, **`JobStatus`**, **`WebhookEndpoint`**, etc. -- one schema per primary resource type

Each path operation must declare:
- `operationId` (unique, camelCase, e.g. `listSkills`, `executeSkill`)
- `tags` array (one tag)
- `summary` (short one-liner)
- `description` (detailed, including scope requirement)
- `parameters` (path params, query params)
- `requestBody` (for POST/PUT, with JSON schema)
- `responses` (at minimum 200, 400, 401, 403, 429)
- `security` reference to `bearerAuth`

#### Response Headers

All operations should declare common response headers in a shared `headers` component:

- `X-Request-Id` -- string, trace ID for debugging
- `X-Credits-Used` -- integer, credits consumed by this request
- `X-Credits-Remaining` -- integer, remaining credit balance
- `X-RateLimit-Limit` -- integer, requests per minute allowed
- `X-RateLimit-Remaining` -- integer, requests remaining in current window
- `X-RateLimit-Reset` -- integer, Unix timestamp when the window resets

### 3. Swagger UI Mount

Within `registerPublicDocsRoutes(app)`, mount Swagger UI:

```typescript
import swaggerUi from "swagger-ui-express";

// GET /v1/openapi.json -- raw spec
app.get("/v1/openapi.json", (_req, res) => {
  res.json(buildOpenApiSpec());
});

// GET /v1/docs -- interactive Swagger UI
app.use("/v1/docs", swaggerUi.serve, swaggerUi.setup(buildOpenApiSpec(), {
  customSiteTitle: "SmartSpecPro API Docs",
  customCss: ".swagger-ui .topbar { display: none }",
  swaggerOptions: {
    persistAuthorization: true,
  },
}));
```

The Swagger UI does not require authentication -- it is a public documentation page. The "Try it out" feature requires the user to enter their API key in the Authorize dialog.

### 4. MCP Manifest Verification

The MCP manifest at `GET /.well-known/mcp.json` is implemented in section-09 (MCP Server). This section only verifies the contract. The manifest must contain:

```json
{
  "name": "SmartSpecPro",
  "url": "https://smartaihub.app/v1/mcp",
  "auth": { "type": "bearer" },
  "capabilities": { "tools": true },
  "docs": "https://smartaihub.app/v1/docs"
}
```

If section-09 has not yet registered this route, the tests in this section should document the expected contract so the MCP section implementer can verify compatibility.

### 5. Route Registration

In `apps/web/server/_core/index.ts`, import and register the docs routes. The docs routes do not require authentication middleware -- they are public documentation endpoints.

```typescript
import { registerPublicDocsRoutes } from "../routes/publicDocsApi";

// After all /v1/* API routes are registered:
registerPublicDocsRoutes(app);
```

Place the registration after all other `/v1/*` routes so the spec builder can reference the complete route set. The docs routes themselves (`/v1/openapi.json` and `/v1/docs`) should not go through the API key auth middleware or rate limiter since they are informational endpoints.

### 6. SDK Stubs (Deferred)

Full SDK packages are deferred to a follow-up. For v1, the OpenAPI spec enables consumers to:

- Use `openapi-generator-cli` to auto-generate a TypeScript client
- Use `openapi-generator-cli` to auto-generate a Python client
- Use any HTTP client directly with the documented endpoints

Include a note in the OpenAPI spec `info.description` field pointing to the generation approach:

> SDK generation: Use `npx @openapitools/openapi-generator-cli generate -i https://smartaihub.app/v1/openapi.json -g typescript-fetch -o ./smartspec-sdk` to generate a TypeScript SDK.

---

## Security Considerations

- The OpenAPI spec and Swagger UI are **unauthenticated** -- they describe the API surface but do not grant access. All actual endpoint calls still require a valid API key.
- The spec must NOT include example API keys or any secret values in example payloads.
- The `servers` array should only list the production URL (`https://smartaihub.app`), not localhost.
- Swagger UI's "Try it out" feature sends real requests -- the `persistAuthorization` option lets users store their key in the browser session for convenience, but the key is only stored in browser memory (not persisted to disk).

---

## Verification Checklist

- [ ] `GET /v1/openapi.json` returns a valid OpenAPI 3.0 document
- [ ] All endpoint groups (skills, agencies, presentations, video-projects, media, mcp, jobs, webhooks, events) have path entries
- [ ] Each path operation has `operationId`, `tags`, `summary`, `responses`
- [ ] Common error schema matches `{ error: { code, message, type } }` format
- [ ] `securitySchemes` declares `bearerAuth` with `type: http, scheme: bearer`
- [ ] `servers` array contains `https://smartaihub.app`
- [ ] `GET /v1/docs` returns Swagger UI HTML page
- [ ] Swagger UI loads the spec from `/v1/openapi.json`
- [ ] `GET /.well-known/mcp.json` returns correct manifest (section-09 responsibility, verified here)
- [ ] Docs routes are not behind API key auth or rate limiter
- [ ] No secret values appear in example payloads
- [ ] Response header schemas (`X-Request-Id`, `X-Credits-Used`, etc.) are documented
- [ ] `swagger-ui-express` and `@types/swagger-ui-express` added to `apps/web/package.json`
