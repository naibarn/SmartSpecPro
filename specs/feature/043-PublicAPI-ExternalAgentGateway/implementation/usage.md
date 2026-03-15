# Feature 043: Public API / External Agent Gateway — Usage Guide

All 13 sections implemented across 13 commits on `codex/feature-043-public-api`.

---

## What Was Built

### Authentication & Key Management (Sections 01–04)

- **Database schema**: `api_keys`, `api_audit_events`, `api_webhook_endpoints`, `api_webhook_deliveries` tables
- **API key service** (`server/services/apiKeyService.ts`): create, list, revoke, authenticate keys with SHA-256 hash storage
- **Auth middleware** (`server/middleware/apiKeyAuth.ts`): `apiKeyAuthMiddleware` + `requireScopes()` + `publicApiFeatureGuard`
- **Rate limiter** (`server/services/apiRateLimiter.ts`): sliding-window per key, with `X-RateLimit-*` headers
- **Audit logger** (`server/services/apiAuditLogger.ts`): structured events to `api_audit_events`

### Public REST Endpoints (Sections 05–11)

| Route prefix | Section | Scope |
|---|---|---|
| `GET/POST /v1/skills/*` | 05 | `skills:read`, `skills:execute` |
| `GET/POST /v1/agencies/*` | 06 | `agency:read`, `agency:invoke` |
| `POST/GET /v1/presentations/*` | 07 | `presentations:read`, `presentations:generate`, `presentations:export` |
| `POST/GET /v1/video-projects/*` | 08 | `media:generate` |
| `POST/GET /v1/media/*` | 08 | `media:generate` |
| `POST /v1/mcp` | 09 | `mcp:read` |
| `GET /.well-known/mcp.json` | 09 | public |
| `POST/GET /v1/jobs/*` | 10 | `jobs:read`, `jobs:write` |
| `POST/GET/DELETE /v1/webhooks/*` | 11 | `webhooks:manage` |
| `GET /v1/events` | 11 | `events:read` (SSE) |

### Admin UI (Section 12)

- **tRPC router** (`server/routers/apiKeys.ts`): `apiKeys.list`, `apiKeys.create`, `apiKeys.revoke`, `apiKeys.getUsageStats`, `apiKeys.listWebhooks`, `apiKeys.deleteWebhook`, `apiKeys.reEnableWebhook`
- **React page** (`client/src/pages/AdminAPIKeys.tsx`): Keys tab + Webhooks tab, scope bundle shortcuts, one-time key display
- **Route**: `/admin/api-keys`

### Documentation (Section 13)

- `GET /v1/openapi.json` — full OpenAPI 3.0.3 spec (unauthenticated)
- `GET /v1/docs` — Swagger UI (unauthenticated)
- OpenAPI covers all 9 endpoint groups with operationIds, schemas, and common response headers

---

## How to Use

### Create an API key (admin UI)

1. Navigate to **Admin → API Keys**
2. Click **Create API Key**
3. Select scopes (or use a bundle like "Full Access")
4. Copy the `sk-ssp_...` key — it's shown once only

### Authenticate

```bash
curl -H "Authorization: Bearer sk-ssp_..." https://smartaihub.app/v1/skills
```

### Execute a skill

```bash
curl -X POST https://smartaihub.app/v1/skills/{skillId}/execute \
  -H "Authorization: Bearer sk-ssp_..." \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "Write a product description for..."}}'
```

### Subscribe to real-time events

```bash
curl -H "Authorization: Bearer sk-ssp_..." \
     -H "Accept: text/event-stream" \
     "https://smartaihub.app/v1/events?types=job.completed,media.ready"
```

### Register a webhook

```bash
curl -X POST https://smartaihub.app/v1/webhooks \
  -H "Authorization: Bearer sk-ssp_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourserver.com/hook", "events": ["job.completed"], "retry_policy": "exponential"}'
```

### Generate a TypeScript SDK

```bash
npx @openapitools/openapi-generator-cli generate \
  -i https://smartaihub.app/v1/openapi.json \
  -g typescript-fetch \
  -o ./smartspec-sdk
```

---

## Commits

| Section | Commit | Description |
|---|---|---|
| 01 | b776ea02 | Database schema & foundation |
| 02 | 72e57a9b | API key service |
| 03 | 4a339de7 | Auth extension |
| 04 | c5e228da | Rate limiter, audit & middleware |
| 05 | daa5abe0 | Skill execution public API |
| 06 | 78d7c73d | Agency invocation public API |
| 07 | 466f6cc4 | Presentation API |
| 08 | 1f384ef4 | Video & media API |
| 09 | 56c62332 | MCP server |
| 10 | 85d47cf6 | Job automation API |
| 11 | a75c4f6e | Webhooks & event streaming |
| 12 | f2099dd7 | Admin UI & tRPC router |
| 13 | 0a9391be | OpenAPI spec, Swagger UI, MCP manifest |
