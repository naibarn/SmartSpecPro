Now I have all the context I need. Let me generate the section content.

# Section 11: Integration Tests and Security Validation

## Overview

This section is the final integration layer for Spec 035 (Auto Draft & Content Automation Engine). It contains end-to-end integration tests and security-specific test suites that validate the combined behavior of all preceding sections working together.

**This section depends on all prior sections being complete:**
- Section 01: Shared types, feature flag middleware, rate limiting
- Section 02: `autoDraftTool.ts` handler
- Section 03: `modelSuggestTool.ts` handler
- Section 04: `fileParseTool.ts` handler
- Section 05: `scheduleDraftTool.ts` handler and scheduler extension
- Sections 06-09: Python registration, agent template, skill discovery stub, UI

Do not start this section until sections 01-10 are implemented and their unit tests pass.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routers/autoDraftTool.integration.test.ts` | End-to-end auto-draft flow, credit deduction, audit trail |
| `apps/web/server/routers/fileParseTool.security.test.ts` | Security attack vector tests for file parsing |
| `apps/web/server/routers/scheduleDraftTool.security.test.ts` | SSRF, cron, placeholder injection, schedule limit |

All three files live alongside the unit tests in `apps/web/server/routers/`. They use **Vitest** (`import { describe, it, expect, vi, beforeEach } from "vitest"`), following the same mocking patterns already established in that directory (e.g., `vi.hoisted`, `vi.mock`).

---

## Background: Testing Conventions in This Codebase

### Mock strategy (from existing tests)
All external collaborators (Redis, DB, `generateAIDraft`, audit logger) are mocked via `vi.hoisted` + `vi.mock`. Example pattern from `__tests__/presentation.ai.test.ts`:

```typescript
const { mockGenerateAIDraft, mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockGenerateAIDraft: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock("../../services/aiPresentationService", () => ({
  generateAIDraft: mockGenerateAIDraft,
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({ get: mockRedisGet, set: mockRedisSet }),
}));
```

### Feature flag pattern
Feature flag middleware returns 503 when `ENABLE_CONTENT_AUTOMATION` is unset or `"false"`. Integration tests set `process.env.ENABLE_CONTENT_AUTOMATION = "true"` in `beforeEach` and clean up in `afterEach`.

### Auth pattern
Internal tool endpoints authenticate via `X-Service-Token`. Tests construct a valid service token using the same `signBearerToken` helper used by the handlers themselves, or mock the token validation function.

### Integration vs. DB integration
These tests do NOT require a real database connection. They mock Drizzle queries and Redis. True DB integration tests (like `adminTenants.integration.test.ts`) are guarded by `RUN_DB_INTEGRATION_TESTS === "true"` env flag and are not required here. The auto-draft integration tests remain pure Vitest with mocks.

---

## Test File 1: `autoDraftTool.integration.test.ts`

**Path:** `apps/web/server/routers/autoDraftTool.integration.test.ts`

**Purpose:** Validate the end-to-end auto-draft request flow — from HTTP request through skill resolution, JWT minting, `generateAIDraft()` call, Redis progress read, DB query, and audit log emission — all with mocked collaborators.

### What to mock
- `generateAIDraft` from `../../services/aiPresentationService`
- Redis client (`getRedisClient`) — return `mockRedisGet`, `mockRedisSet`
- Drizzle DB client — mock `users` table query (return active user), `decks` table query (return deck with `slideCount`)
- `signBearerToken` from `../../_core/tokens` — spy on, verify arguments
- Audit logger (`auditLogger.info`) — spy on emitted events
- `creditTransactions` table query — return summed credits

### Test stubs

```typescript
// apps/web/server/routers/autoDraftTool.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted declarations for all mocks...

describe("autoDraftTool integration", () => {
  beforeEach(() => {
    process.env.ENABLE_CONTENT_AUTOMATION = "true";
    vi.clearAllMocks();
    // set up default mock return values
  });

  afterEach(() => {
    delete process.env.ENABLE_CONTENT_AUTOMATION;
  });

  it("end-to-end auto-draft flow with mocked LLM and media APIs", async () => {
    /**
     * Arrange: valid X-Service-Token, active user, skill slug resolves,
     *          generateAIDraft resolves, Redis progress key returns success status,
     *          DB deck query returns { id: "deck-123", slideCount: 10 }
     * Act: POST /api/internal/tools/auto-draft with valid body
     * Assert: response 200 with { deck_id: "deck-123", slide_count: 10, success: true }
     *         generateAIDraft called once with correct params
     */
  });

  it("credit deduction works with scoped JWT", async () => {
    /**
     * Arrange: same as above; also mock creditTransactions query to return
     *          { creditsUsed: 5.5 } for the given traceId
     * Act: POST /api/internal/tools/auto-draft
     * Assert: response includes credits_used: 5.5
     *         signBearerToken was called with scope ["auto-draft:execute"]
     *         JWT payload contains origin: "auto-draft-agent"
     */
  });

  it("audit trail includes origin 'auto-draft-agent'", async () => {
    /**
     * Arrange: valid request; spy on auditLogger
     * Act: POST /api/internal/tools/auto-draft
     * Assert: auditLogger.info was called with event "auto_draft.started"
     *         auditLogger.info was called with event "auto_draft.completed"
     *         completed event includes origin: "auto-draft-agent"
     *         started event includes userId and topic
     */
  });
});
```

### Key assertions for each test case

**End-to-end flow test:**
- `generateAIDraft` was called exactly once
- The `PresentationActor` passed to `generateAIDraft` has `userId` from the service token
- The `canvasWidth`/`canvasHeight` values match the `canvas_preset` from the request
- Response has `{ success: true, deck_id: "deck-123", slide_count: 10 }`
- Response `source` field is overridden to `"agency_auto_draft:{agency_run_id}"` (not whatever the caller sent)

**Credit deduction test:**
- `signBearerToken` receives `{ scopes: ["auto-draft:execute"], origin: "auto-draft-agent" }` in the payload argument
- JWT TTL is 15 minutes (900 seconds)
- `credits_used` in response equals the sum from `creditTransactions` mock

**Audit trail test:**
- `auto_draft.started` event logged with `{ userId, tenantId, topic }`
- `auto_draft.completed` event logged with `{ deck_id, credits_used, duration_ms, origin: "auto-draft-agent" }`
- If `generateAIDraft` throws, `auto_draft.failed` is logged with sanitized `error_type` (no raw stack traces)

---

## Test File 2: `fileParseTool.security.test.ts`

**Path:** `apps/web/server/routers/fileParseTool.security.test.ts`

**Purpose:** Exhaustively test all security attack vectors for file input. These tests are deliberately adversarial — they send crafted inputs designed to exploit known vulnerabilities.

### What to mock
- HTTP fetch / URL fetch (to avoid real network calls) — mock the "fetch file from R2/S3" helper
- `Papa.parse` — use real library (no mock) so formula injection tests run against real parsing logic
- `xlsx.read` — use real library for magic byte detection; mock for the ZIP bomb test (return synthetic large size)

### Test stubs

```typescript
// apps/web/server/routers/fileParseTool.security.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("fileParseTool security", () => {
  describe("formula injection vectors", () => {
    it("strips = prefix from cell values", async () => {
      // Input cell value: "=CMD('echo hacked')"
      // Expected sanitized: "CMD('echo hacked')"
    });

    it("strips + prefix from cell values", async () => {
      // Input: "+cmd|' /C calc'!A0"
      // Expected: "cmd|' /C calc'!A0"
    });

    it("strips - prefix from cell values", async () => {
      // Input: "-2+3+cmd|' /C calc'!A0"
      // Expected: "2+3+cmd|' /C calc'!A0"
    });

    it("strips @ prefix from cell values", async () => {
      // Input: "@SUM(1+1)*cmd|' /C calc'!A0"
      // Expected: "SUM(1+1)*cmd|' /C calc'!A0"
    });

    it("strips leading whitespace before formula prefix check", async () => {
      // Input: "  =DANGEROUS()"
      // Expected: stripped and sanitized
    });

    it("does not strip = in the middle of a value", async () => {
      // Input: "price=100" — the = is not a prefix
      // Expected: "price=100" unchanged
    });
  });

  describe("SSRF vectors", () => {
    it("rejects file URL with private IP 192.168.1.1", async () => {
      // Expect 400 with SSRF error message
    });

    it("rejects file URL with private IP 10.0.0.1", async () => {});

    it("rejects file URL with private IP 172.16.0.1", async () => {});

    it("rejects file URL pointing to localhost", async () => {
      // Variants: localhost, 127.0.0.1, ::1
    });

    it("rejects file:// scheme", async () => {});

    it("rejects gopher:// scheme", async () => {});

    it("rejects dict:// scheme", async () => {});

    it("rejects ftp:// scheme", async () => {});

    it("rejects metadata IP 169.254.169.254 (cloud metadata)", async () => {
      // AWS instance metadata endpoint
    });
  });

  describe("file size limits", () => {
    it("rejects file with Content-Length header > 5MB", async () => {
      // Mock HEAD response: Content-Length: 5242881
      // Expect 400 before any body is read
    });

    it("rejects file when streaming byte count exceeds 5MB (no Content-Length)", async () => {
      // Mock fetch with no Content-Length, but body stream emits > 5MB
      // Expect 400 with size limit error
    });

    it("accepts file with Content-Length exactly at 5MB boundary", async () => {
      // Content-Length: 5242880 — should proceed
    });
  });

  describe("row limits", () => {
    it("CSV: trims to 100 data rows even if file has 200 rows", async () => {
      // Generate CSV with 200 rows, verify only 100 InputItems returned
    });

    it("XLSX: sheetRows:101 cap produces max 100 data rows", async () => {
      // Mock xlsx.read to return a sheet with 101 rows (header + 100 data)
      // Verify total_rows capped at 100
    });
  });

  describe("ZIP bomb detection", () => {
    it("rejects XLSX where decompressed size > 50MB", async () => {
      /**
       * Use real xlsx.read on a small file but mock the decompressed size
       * check to return a size > 50MB, verify 400 response
       */
    });
  });
});
```

### Specific attack vectors to cover exhaustively

The formula injection tests MUST cover the exact prefixes `=`, `+`, `-`, `@` because these are the four characters that trigger spreadsheet formula execution in all major spreadsheet applications (Excel, Google Sheets, LibreOffice Calc). The stripping logic in `fileParseTool.ts` (Section 04) must handle:
1. Prefix on raw cell text (most common)
2. Prefix after whitespace trimming (bypass via leading spaces)
3. Prefix NOT in middle of string (must not corrupt valid data like `"x=1"`)

SSRF tests must cover all RFC 1918 private ranges plus the cloud metadata IP `169.254.169.254`. The test for `localhost` must include all equivalent forms: `"localhost"`, `"127.0.0.1"`, `"::1"`, and any `0.0.0.0` variants.

---

## Test File 3: `scheduleDraftTool.security.test.ts`

**Path:** `apps/web/server/routers/scheduleDraftTool.security.test.ts`

**Purpose:** Validate security constraints for schedule creation: webhook SSRF, cron interval enforcement, per-user schedule limits, and placeholder injection prevention.

### What to mock
- Drizzle DB client — count of active schedules per user (for limit test), insert operation
- Redis (not needed for schedule creation, but for rate limit gate)
- `validateCronExpression` internal helper — spy to verify it is called with the correct expression

### Test stubs

```typescript
// apps/web/server/routers/scheduleDraftTool.security.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("scheduleDraftTool security", () => {
  describe("webhook SSRF validation", () => {
    it("blocks webhook URL pointing to 192.168.x.x private IP", async () => {
      // POST with notify_webhook_url: "http://192.168.1.100/webhook"
      // Expect 400
    });

    it("blocks webhook URL pointing to localhost", async () => {
      // Variants: http://localhost/hook, http://127.0.0.1/hook
    });

    it("blocks webhook URL pointing to cloud metadata endpoint", async () => {
      // http://169.254.169.254/latest/meta-data/
    });

    it("blocks webhook URL with non-HTTP scheme", async () => {
      // file:///etc/passwd, gopher://internal.host/...
    });

    it("accepts legitimate HTTPS webhook URL", async () => {
      // https://hooks.zapier.com/hooks/catch/...
      // Expect 201 schedule created
    });
  });

  describe("cron expression validation", () => {
    it("rejects every-minute pattern '* * * * *'", async () => {
      // Should fail: interval < 1 hour
    });

    it("rejects every-5-minutes pattern '*/5 * * * *'", async () => {});

    it("rejects every-30-minutes pattern '*/30 * * * *'", async () => {});

    it("accepts hourly pattern '0 * * * *'", async () => {
      // Minimum allowed interval
    });

    it("accepts daily pattern '0 9 * * *'", async () => {});

    it("accepts weekly pattern '0 9 * * 1'", async () => {});

    it("rejects invalid cron string 'not-a-cron'", async () => {});
  });

  describe("per-user schedule limit", () => {
    it("blocks creation when user already has 10 active schedules", async () => {
      // Mock DB count query to return 10
      // Expect 429 or 400 with schedule limit error
    });

    it("allows creation when user has 9 active schedules", async () => {
      // Mock DB count query to return 9
      // Expect 201
    });
  });

  describe("placeholder injection", () => {
    it("blocks unsupported placeholder {{week}}", async () => {
      // topic_template: "Weekly roundup for {{week}}"
      // Expect 400 with placeholder validation error
    });

    it("blocks unsupported placeholder {{user}}", async () => {
      // Could be a user enumeration vector if allowed
    });

    it("blocks template injection attempt {{../../etc/passwd}}", async () => {});

    it("allows {{date}} placeholder", async () => {
      // topic_template: "Daily news for {{date}}"
      // Expect 201
    });

    it("allows {{day_of_week}} placeholder", async () => {
      // topic_template: "{{day_of_week}} morning brief"
      // Expect 201
    });

    it("allows template with no placeholders", async () => {
      // Static topic template — still valid
    });

    it("allows combination of both allowed placeholders", async () => {
      // topic_template: "{{day_of_week}} {{date}} report"
    });
  });
});
```

### Placeholder injection rationale

The validation whitelist of `{{date}}` and `{{day_of_week}}` is intentionally strict. Any unrecognized `{{...}}` token must be rejected at creation time rather than substituted at runtime, because:
1. An unrecognized placeholder silently passes through to the LLM prompt, potentially leaking system context
2. Placeholders like `{{userId}}` or `{{tenantId}}` could cause information disclosure if a future version adds those substitutions

The regex pattern for placeholder validation should be: reject the topic_template if it contains any `{{...}}` token that is not exactly `{{date}}` or `{{day_of_week}}` (case-sensitive).

---

## Coverage Requirements

The 80% minimum coverage target applies to all files created in sections 01-10. The integration and security test files themselves do not need to be counted in the coverage denominator (they are test files), but they must execute the production code paths in `autoDraftTool.ts`, `fileParseTool.ts`, and `scheduleDraftTool.ts` to contribute to overall coverage.

After implementing these tests, run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test:coverage -- --reporter=verbose server/routers/autoDraftTool
pnpm test:coverage -- --reporter=verbose server/routers/fileParseTool
pnpm test:coverage -- --reporter=verbose server/routers/scheduleDraftTool
```

Verify that coverage for each of those three handler files is at or above 80%.

---

## Running the Tests

**Run all integration and security tests together:**
```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm vitest run server/routers/autoDraftTool.integration.test.ts \
  server/routers/fileParseTool.security.test.ts \
  server/routers/scheduleDraftTool.security.test.ts
```

**Run with coverage:**
```bash
pnpm test:coverage -- \
  server/routers/autoDraftTool.integration.test.ts \
  server/routers/fileParseTool.security.test.ts \
  server/routers/scheduleDraftTool.security.test.ts
```

**Prerequisites before running:**
1. Sections 01-10 are fully implemented (all handlers exist)
2. Unit tests for each section pass (`pnpm vitest run server/routers/autoDraftTool.test.ts` etc.)
3. `ENABLE_CONTENT_AUTOMATION=true` is either in `.env` or the test sets it in `beforeEach`
4. No real network calls are made — all fetches and DB calls must be mocked

---

## Dependency Notes (Do Not Duplicate Content From)

The following behavior is specified and tested in their respective sections — do not re-test it here; just rely on it being correct:

- Zod schema validation (Section 01 `types.test.ts`)
- Feature flag 503 responses (Section 01 `contentAutomationGate.test.ts`)
- Rate limiting logic (Section 01 `contentAutomationRateLimit.test.ts`)
- Individual unit tests for each handler (Sections 02-05)
- Python tool registration (Section 06)
- Agent template seed correctness (Section 07)

The integration and security tests in this section add value by:
1. Testing the **combined** path through multiple collaborators (JWT → `generateAIDraft` → Redis → DB → audit log)
2. Testing **adversarial inputs** not present in happy-path unit tests
3. Confirming that security defenses are active at the HTTP handler layer (not just at the Zod schema layer)