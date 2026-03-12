I now have all the context I need. Let me generate the section content.

# Section 02: Fix `verifyInternalToken()` Security Issue

## Overview

This section fixes a timing-oracle vulnerability in `verifyInternalToken()` inside `apps/web/server/routers/modelSuggestTool.ts`. The current implementation passes raw `Buffer.from(token)` and `Buffer.from(expected)` directly to `crypto.timingSafeEqual()`, which throws `RangeError` when the two buffers are different lengths. This length-mismatch exception leaks the length of the expected token via observable timing behavior — an attacker can discover the expected token length by probing with tokens of different lengths.

The fix hashes both the submitted token and the expected value with SHA-256 before comparison, ensuring equal-length 32-byte buffers regardless of input. This preserves constant-time comparison semantics without leaking any information about the expected token.

## Dependencies

- **No dependency on other sections.** This section can be implemented in parallel with section-01-suggest-model-function.
- Section 03 (handler audit and errors) depends on this section being done first.

## Background: The Vulnerability

### Current code (lines 16–26 of `modelSuggestTool.ts`)

```typescript
function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

The `try/catch` around `timingSafeEqual` suppresses the `RangeError`, so the function does not crash. However, the distinguishable behavior (crash path vs. comparison path) allows an attacker to detect the expected token length:

- If submitted token length != expected token length: exception path (measurably different timing profile)
- If submitted token length == expected token length: actual comparison (different timing profile)

This is a length oracle. SHA-256 hashing before comparison produces a fixed 32-byte digest for any input, so buffer lengths are always identical and the code path is indistinguishable regardless of input token length.

### Fix: SHA-256 Hash Before Comparison

Both the submitted token and the expected value are hashed with `createHash("sha256")` before being passed to `timingSafeEqual`. The resulting digests are always 32 bytes, eliminating the length oracle.

`createHash` is already imported via `import crypto from "node:crypto"` at line 1 of the file.

## File to Modify

**`/home/dev/projects/SmartSpecPro/apps/web/server/routers/modelSuggestTool.ts`**

Replace the `verifyInternalToken` function body. The function signature does not change — it remains `function verifyInternalToken(req: Request): boolean`. Only the internal comparison logic changes.

### New Implementation (stub with intent)

```typescript
function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  // Hash both values with SHA-256 to ensure equal-length buffers.
  // This prevents a length oracle attack where timingSafeEqual throws
  // RangeError on length mismatch, leaking the expected token's length.
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(tokenHash, expectedHash);
}
```

No try/catch is needed after this fix because both digests are always 32 bytes — `timingSafeEqual` will never throw `RangeError`.

## Tests to Write First

These tests go into the **existing** file `/home/dev/projects/SmartSpecPro/apps/web/server/routers/modelSuggestTool.test.ts`. Add a new `describe` block for `verifyInternalToken` behavior. The existing mocks (`ENV`, `getModelsByTypeAsync`, `contentAutomationGate`) are already set up at the top of the file and apply to this block.

The existing test factory helpers `buildRequest()` and `buildResponse()` can be reused. The existing tests cover authentication via the HTTP handler; these new tests focus specifically on the length-oracle fix.

```typescript
describe("verifyInternalToken security", () => {
  it("returns true when token matches expected value", async () => {
    // Use buildRequest() — it sends "test-gateway-token" which matches ENV mock
    // Call modelSuggestHandler and expect 200 (not 401)
  });

  it("returns false when token is wrong", async () => {
    // buildRequest() with x-internal-token: "wrong-token"
    // expect statusMock called with 401
  });

  it("returns false when token header is missing", async () => {
    // buildRequest() with x-internal-token: ""
    // expect statusMock called with 401
  });

  it("tokens of different lengths are rejected without throwing RangeError", async () => {
    // Send a very short token (1 char) and a very long token (200 chars)
    // Both should return 401 — no unhandled RangeError exception
    // The test itself should not throw; use expect(...).resolves or await the handler
    for (const badToken of ["x", "a".repeat(200)]) {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = badToken;
      const { res, statusMock } = buildResponse();
      await expect(modelSuggestHandler(req, res)).resolves.toBeUndefined();
      expect(statusMock).toHaveBeenCalledWith(401);
      vi.clearAllMocks();
      vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
    }
  });

  it("returns false when ENV.webGatewayToken is empty string", async () => {
    // Temporarily override the ENV mock to return empty string for webGatewayToken
    // Expect 401
  });
});
```

The critical test case is the length-mismatch test. Before the fix, the old implementation catches the `RangeError` silently, so it would return `false` (401) without crashing the test — but the point is to verify the fix does not rely on exception suppression. After the fix, no exception is generated at all. The test confirms the handler resolves normally (no unhandled rejection) while still rejecting the wrong-length token.

For the empty-string `webGatewayToken` test, temporarily re-mock the `ENV` module:

```typescript
it("returns false when ENV.webGatewayToken is empty string", async () => {
  vi.doMock("../_core/env", () => ({ ENV: { webGatewayToken: "" } }));
  // Re-import modelSuggestHandler after the mock update, or call handler
  // with a request that would otherwise match — expect 401
});
```

Note: if re-importing is complex in the test file setup, an alternative is to test `verifyInternalToken` by calling `modelSuggestHandler` with any token when `ENV.webGatewayToken` is `""` — the guard `if (!expected) return false` should trigger first.

## Existing Tests That Must Continue to Pass

The following existing tests in `modelSuggestTool.test.ts` exercise `verifyInternalToken` indirectly through `modelSuggestHandler`. They must not regress:

- `"returns 401 when X-Internal-Token is missing"` (line 56)
- `"returns 401 when X-Internal-Token does not match"` (line 67)
- All tests in `"model filtering and ranking"` and `"cost tier mapping"` use `buildRequest()` which sends the correct token — they must still return 200.

## Checklist

- [x] Read lines 16–26 of `modelSuggestTool.ts`
- [x] Write the new tests under `describe("verifyInternalToken security")`
- [x] Replace `verifyInternalToken` with SHA-256 hashing approach
- [x] Remove try/catch from the replacement
- [x] All 31 tests pass
- [ ] `pnpm check` passes (verified in Section 04)

## Implementation Notes

**Actual files modified:**
- `apps/web/server/routers/modelSuggestTool.ts` — SHA-256 hashing before `timingSafeEqual`, try-catch removed
- `apps/web/server/routers/modelSuggestTool.test.ts` — added `ENV` import, 6 new security tests

**Deviations from plan:**
- Added separate test for truly missing header (undefined) in addition to empty string test (code review finding)
- Test name "missing header" corrected to "empty string" for accuracy

**Test count:** 31 total, all passing