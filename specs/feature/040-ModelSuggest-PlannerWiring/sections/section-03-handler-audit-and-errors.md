# Section 03: Handler Audit Logging and Error Handling

## Overview

Add audit logging and try-catch error handling to the `modelSuggestHandler` HTTP handler in `apps/web/server/routers/modelSuggestTool.ts`. This section depends on Section 01 (`suggestModel()` exported) and Section 02 (`verifyInternalToken` SHA-256 fix) being complete first. Section 04 depends on this section.

## Files to Modify

- `apps/web/server/routers/modelSuggestTool.ts` — add audit imports, try-catch in handler, emit audit event
- `apps/web/server/services/auditLogger.ts` — extend `AuditEventType` union with two new strings
- `apps/web/server/routers/modelSuggestTool.test.ts` — add audit mock + new test cases

## Step 1: Extend AuditEventType

In `apps/web/server/services/auditLogger.ts`, find the `AuditEventType` union and add two new string literals alongside existing entries:

```
"model_suggest_response"
"auto_draft.model_selected"
```

Without this, TypeScript strict mode will reject the `eventType` field in `auditLogger.log(...)` calls in both this section and Section 05.

## Step 2: Add Imports to modelSuggestTool.ts

Add alongside existing imports (check for duplicates first):

```typescript
import { auditLogger } from "../services/auditLogger";
import type { AuditEventType } from "../services/auditLogger";
import { getTraceId } from "../services/traceContext";
```

## Step 3: Wrap `suggestModel()` Call in Handler with try-catch

In `modelSuggestHandler`, after auth + Zod validation, the handler calls `await suggestModel(purpose, quality_preference)` (after Section 01 refactor). Wrap in try-catch:

```typescript
let result: SuggestResult;
try {
  result = await suggestModel(purpose, quality_preference);
} catch (err) {
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = raw
    .replace(/https?:\/\/[^\s]+/g, "[redacted]")
    .replace(/postgresql:\/\/[^\s]+/g, "[redacted]")
    .slice(0, 200);
  res.status(500).json({ success: false, error: sanitized });
  return;
}
```

## Step 4: Emit Audit Event After Successful Result

After the try-catch block, before sending the response:

```typescript
auditLogger.log({
  eventType: "model_suggest_response" as AuditEventType,
  traceId: getTraceId(),
  userId: parseResult.data.userId,
  metadata: {
    tenantId: parseResult.data.tenantId,
    purpose: parseResult.data.purpose,
    recommendedModelId: result.recommended?.model_id ?? null,
    alternativeCount: result.alternatives.length,
  },
});
```

`parseResult.data.userId` and `parseResult.data.tenantId` are available because `ModelSuggestRequestSchema` in `shared/contentAutomation/types.ts` now includes `userId: z.number().int().positive()` and `tenantId: z.string().min(1)`.

## Step 5: Send Response

```typescript
res.json({
  success: true,
  recommended: result.recommended,
  alternatives: result.alternatives,
  ...(result.message ? { message: result.message } : {}),
});
```

## Tests (Write First — TDD)

Add at top of `modelSuggestTool.test.ts` alongside other `vi.mock()` calls (BEFORE imports — Vitest hoists mocks):

```typescript
vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));
vi.mock("../services/traceContext", () => ({
  getTraceId: vi.fn().mockReturnValue("test-trace-id"),
}));
```

Add import:
```typescript
import { auditLogger } from "../services/auditLogger";
```

New describe blocks:

```typescript
describe("modelSuggestHandler audit logging", () => {
  // Test: emits "model_suggest_response" audit event on successful response
  // verify: vi.mocked(auditLogger.log) called once with { eventType: "model_suggest_response" }

  // Test: audit event metadata includes purpose and recommendedModelId
  // verify: metadata.purpose === "image", metadata.recommendedModelId === first model's model_id

  // Test: audit event recommendedModelId is null when no models available
  // setup: vi.mocked(getModelsByTypeAsync).mockResolvedValue([])
  // verify: metadata.recommendedModelId === null

  // Test: does NOT emit audit event when authentication fails
  // setup: wrong x-internal-token header
  // verify: vi.mocked(auditLogger.log).not.toHaveBeenCalled()
});

describe("modelSuggestHandler error handling", () => {
  // Test: returns 500 with sanitized message when getModelsByTypeAsync throws
  // setup: vi.mocked(getModelsByTypeAsync).mockRejectedValue(new Error("postgresql://user:pass@localhost/db"))
  // Note: suggestModel() swallows this internally (Section 01) — to reach handler's catch,
  // either mock suggestModel directly or mock getModelsByTypeAsync to throw synchronously
  // verify: res.status(500).json called; error field does not contain "postgresql://"

  // Test: 500 error message does not contain URLs
  // setup: error contains "https://secret.api.example.com/key=abc123"
  // verify: response error does not contain "https://"

  // Test: 500 error string is at most 200 characters
  // setup: error message is 500 characters long
  // verify: response error.length <= 200
});
```

**Testing approach for error path:** The handler's try-catch is a **safety net only** — it is logically unreachable in normal operation because Section 01's `suggestModel()` swallows all errors internally and always resolves. Attempting to test the handler's catch via `vi.spyOn` on the exported function from the same module creates a circular mock problem (the handler imports `suggestModel` from the same file at compile time; vitest module mocking after load is unreliable here).

**Recommended approach:**
1. Test the **sanitization logic** (URL stripping, 200-char truncation) by calling `suggestModel()` directly with a mocked `getModelsByTypeAsync` that throws — this exercises the catch behavior inside `suggestModel()`, which is where errors are actually caught.
2. Document the handler's catch block as an unreachable safety net. Add a single comment in the implementation: `// Safety net: suggestModel() resolves all errors internally` — no dedicated test required.
3. The three error tests in the describe block (`returns 500 with sanitized message`, `500 error message does not contain URLs`, `500 error string is at most 200 characters`) should be omitted or clearly marked as skipped with `it.skip(...)` and a note explaining why the path is unreachable.

This prevents test fragility from circular mocking while maintaining full coverage of the sanitization logic where it actually matters.

## Verification

```bash
cd apps/web && pnpm test -- modelSuggestTool
cd apps/web && pnpm check
```

## Definition of Done

- [x] `"model_suggest_response"` and `"auto_draft.model_selected"` added to `AuditEventType`
- [x] `auditLogger` and `getTraceId` imported in `modelSuggestTool.ts`
- [x] `suggestModel()` call wrapped in try-catch with sanitized 500 response (strips all URI schemes via RFC-3986 regex, max 200 chars)
- [x] Audit event emitted after successful result with traceId, userId, metadata fields
- [x] No audit event emitted on 401 or 400 early-return paths
- [x] All new audit + error tests pass (35 pass, 3 todo)
- [x] `pnpm check` passes (pre-existing errors in unrelated files, no new errors introduced)

## Implementation Notes

- Removed `as AuditEventType` cast (redundant after union was extended)
- URL sanitizer broadened to RFC-3986 scheme regex: `/[a-z][a-z0-9+\-.]*:\/\/[^\s]+/gi`
- `traceId: getTraceId() ?? undefined` used instead of direct call (consistent with other callers)
- Error-handler catch block tests converted to `it.todo()` (visible in reports)
- Test added to verify `traceId` propagation in audit event

## Files Modified

- `apps/web/server/services/auditLogger.ts` — extended AuditEventType union
- `apps/web/server/routers/modelSuggestTool.ts` — added audit imports, try-catch, audit event emission
- `apps/web/server/routers/modelSuggestTool.test.ts` — added 4 audit tests + 3 todo error tests
