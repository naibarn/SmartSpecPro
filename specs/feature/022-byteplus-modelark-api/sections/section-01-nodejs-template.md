# Section 01: Node.js Provider Template, Connection Test, and testConnection Wiring

**Feature:** 022 — BytePlus ModelArk API Integration
**Section:** `section-01-nodejs-template`
**Runtime:** Node.js/TypeScript
**Files to modify/create:**
- `apps/web/server/routers/mediaProviders.ts` (modify)
- `apps/web/server/routers/mediaProviders.test.ts` (create — does not yet exist)

**Test command:** `cd apps/web && npm test` (Vitest — use npm, not pnpm, in this project)
**Typecheck command:** `cd apps/web && npm run check`

**Implementation status:** COMPLETE
**Tests:** 13/13 passing
**Files created:**
- `apps/web/server/routers/mediaProviders.ts` (modified)
- `apps/web/server/routers/mediaProviders.test.ts` (created)

**Deviations from plan:**
- `PROVIDER_TEMPLATES` and `testBytePlusModelArk` are exported (not in original plan) to enable direct unit testing
- "testConnection switch" tests in the test file verify routing via PROVIDER_TEMPLATES membership and direct function call (not via tRPC caller) due to DB mocking complexity
- Package manager is `npm` in this workspace (not `pnpm`)

**Depends on:** Nothing (this section is independently implementable)
**Blocks:** section-02-nodejs-media-models (weakly, same file vicinity)

---

## Background

SmartSpecPro has a multi-provider media generation system. Providers are registered in two places:

1. `PROVIDER_TEMPLATES` array in `apps/web/server/routers/mediaProviders.ts` — drives the admin UI provider picker and `templates` tRPC procedure
2. `testConnection` tRPC procedure in the same file — routes to provider-specific connection-test functions based on `providerName`

This section adds BytePlus ModelArk as a new provider entry in both places, plus a concrete `testBytePlusModelArk` function.

BytePlus ModelArk is ByteDance's AI platform. It offers:
- **Seedream** models — synchronous image generation (a task ID and image URL come back in a single response)
- **Seedance** models — asynchronous video generation (a task ID is returned; the result must be polled later)

The 6 models registered here are the same IDs that section-02 adds to `MEDIA_MODELS` and that the Python adapter (section-03) uses in its `IMAGE_MODELS`/`VIDEO_MODELS` sets.

### Existing Code Structure (reference)

The `mediaProviders.ts` file already contains:
- `PROVIDER_TEMPLATES` array — entries for `kie_ai`, `fal_ai`, `replicate`, `runpod`
- `validateExternalUrl(url)` function (lines 388–404) — blocks private/internal network addresses; must be called before any outbound HTTP request
- `testConnection` tRPC procedure — switch on `provider.providerName`, currently handles `kie_ai`, `fal_ai`, `replicate`; unknown providers fall to `testGenericProvider`
- `testKieAI(apiKey, baseUrl)` — the canonical pattern to follow for the new `testBytePlusModelArk` function

---

## Tests First

Create the file `apps/web/server/routers/mediaProviders.test.ts`. This file does not yet exist.

The test suite uses **Vitest**. Mock `fetch` to avoid real network calls.

### Test stubs

```typescript
// apps/web/server/routers/mediaProviders.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// Import what you need once the implementation exports are available.
// For now, test through the tRPC caller or by importing helpers directly.

describe("PROVIDER_TEMPLATES — BytePlus ModelArk entry", () => {
  it("includes an entry with providerName 'byteplus_modelark'", () => {
    // Assert PROVIDER_TEMPLATES contains an object where providerName === "byteplus_modelark"
  });

  it("has providerType 'multimodal'", () => {
    // Assert the byteplus_modelark template has providerType === "multimodal"
  });

  it("has exactly 6 models in availableModels (2 image, 4 video)", () => {
    // Assert availableModels.length === 6
    // Assert models filtered by type "image" has length 2
    // Assert models filtered by type "video" has length 4
  });

  it("defaultModel is 'seedream-4-5-251128'", () => {
    // Assert the byteplus_modelark template defaultModel === "seedream-4-5-251128"
  });

  it("baseUrl is the Southeast Asia endpoint", () => {
    // Assert baseUrl === "https://ark.ap-southeast.bytepluses.com/api/v3"
  });
});

describe("testBytePlusModelArk", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {success: true, latencyMs: number} on 200 response", async () => {
    // Mock fetch to return status 200
    // Call testBytePlusModelArk(apiKey, baseUrl)
    // Assert result.success === true
    // Assert typeof result.latencyMs === "number"
  });

  it("returns {success: false} on 401 response", async () => {
    // Mock fetch to return status 401
    // Assert result.success === false
  });

  it("calls validateExternalUrl(baseUrl) before fetch", async () => {
    // Spy on validateExternalUrl or observe that a private IP throws before fetch is called
    // Pass a valid baseUrl, verify no fetch call on invalid URL
  });

  it("rejects when baseUrl is a private IP (SSRF blocked)", async () => {
    // Call testBytePlusModelArk("key", "http://192.168.1.1/api")
    // Assert it throws or rejects with an error mentioning private/internal network
  });

  it("uses correct Authorization header format (Bearer token)", async () => {
    // Mock fetch and capture the request headers
    // Assert headers["Authorization"] === "Bearer <apiKey>"
  });
});

describe("testConnection switch — byteplus_modelark routing", () => {
  it("with provider_name 'byteplus_modelark' invokes testBytePlusModelArk", async () => {
    // Use a tRPC test caller or spy on testBytePlusModelArk
    // Confirm the byteplus_modelark case is reached
  });

  it("with provider_name 'kie_ai' still invokes the KieAI test (no regression)", async () => {
    // Confirm kie_ai case still routes to testKieAI
  });
});
```

---

## Implementation

### 1.1 Add BytePlus ModelArk to `PROVIDER_TEMPLATES`

**File:** `apps/web/server/routers/mediaProviders.ts`

Append a new object to the `PROVIDER_TEMPLATES` array after the existing `runpod` entry (around line 74, before the closing `]`). The entry must include all 6 model IDs that are canonical across this entire feature:

```typescript
{
  providerName: "byteplus_modelark",
  displayName: "BytePlus ModelArk",
  description: "ByteDance's enterprise AI platform — Seedream models for synchronous image generation and Seedance models for asynchronous video generation via task polling",
  providerType: "multimodal" as const,
  baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
  defaultModel: "seedream-4-5-251128",
  availableModels: [
    // Image models (Seedream — synchronous)
    { id: "seedream-4-5-251128", name: "Seedream 4.5", type: "image" as const, description: "High-quality synchronous image generation (Seedream 4.5)" },
    { id: "seedream-4-0-250828", name: "Seedream 4.0", type: "image" as const, description: "Image generation with Seedream 4.0" },
    // Video models (Seedance — async task/polling)
    { id: "seedance-1-0-pro-fast-251015", name: "Seedance 1.0 Pro Fast", type: "video" as const, description: "Fast professional video generation (T2V + I2V)" },
    { id: "seedance-1-0-pro-250528",      name: "Seedance 1.0 Pro",      type: "video" as const, description: "Professional video generation (T2V + I2V)" },
    { id: "seedance-1-0-lite-t2v-250428", name: "Seedance 1.0 Lite T2V", type: "video" as const, description: "Lightweight text-to-video generation" },
    { id: "seedance-1-0-lite-i2v-250428", name: "Seedance 1.0 Lite I2V", type: "video" as const, description: "Lightweight image-to-video generation" },
  ],
},
```

Key constraints:
- The model `id` values here must be identical to those used in section-02 (`MEDIA_MODELS` registry) and section-03 (Python adapter `IMAGE_MODELS`/`VIDEO_MODELS` sets). Do not invent alternate spellings.
- `providerType` must be `"multimodal"` (not `"image"` or `"video"` — it supports both).
- `baseUrl` is the default that `testConnection` falls back to when the stored provider record has no `baseUrl`.

### 1.2 Implement `testBytePlusModelArk`

**File:** `apps/web/server/routers/mediaProviders.ts`

Add this function alongside the existing `testKieAI`, `testFalAI`, etc. functions (after line 465):

```typescript
async function testBytePlusModelArk(
  apiKey: string,
  baseUrl: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  /**
   * Validates connectivity and API key for BytePlus ModelArk.
   * GETs the task list endpoint with a small page_size to confirm auth works.
   * Returns {success, message, latencyMs}.
   *
   * SSRF note: validateExternalUrl() must be called BEFORE any fetch.
   */
  validateExternalUrl(baseUrl);
  const startTime = Date.now();
  const url = `${baseUrl.replace(/\/$/, "")}/contents/generations/tasks?page_size=3&filter.status=succeeded`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const latencyMs = Date.now() - startTime;

  if (response.status === 401) {
    return { success: false, message: "Invalid API key (401 Unauthorized)", latencyMs };
  }
  if (!response.ok) {
    const text = await response.text();
    return { success: false, message: `API error: ${response.status} - ${text}`, latencyMs };
  }
  return { success: true, message: "Connection successful", latencyMs };
}
```

Important implementation notes:
- `validateExternalUrl(baseUrl)` must be called **first**, before the `fetch`. If the URL points to a private network, the function throws and no HTTP request is made. This is required for SSRF protection.
- Strip a trailing slash from `baseUrl` before appending the path (use `.replace(/\/$/, "")`).
- Compute `latencyMs` from `Date.now()` difference taken around the `fetch` call.
- Return `latencyMs` in the return object so the caller (`testConnection`) can include it in the saved `lastTestResult`.
- The function should NOT catch exceptions — the `testConnection` procedure has its own `try/catch` wrapper that handles network errors and sets `latencyMs`.

### 1.3 Wire Into `testConnection` Switch

**File:** `apps/web/server/routers/mediaProviders.ts`

In the `testConnection` tRPC procedure (lines 286–301), add a `case "byteplus_modelark":` branch:

```typescript
switch (provider.providerName) {
  case "kie_ai":
    result = await testKieAI(apiKey, provider.baseUrl || "https://api.kie.ai/api/v1");
    break;
  case "fal_ai":
    result = await testFalAI(apiKey);
    break;
  case "replicate":
    result = await testReplicate(apiKey);
    break;
  case "byteplus_modelark":                          // ← ADD THIS CASE
    result = await testBytePlusModelArk(
      apiKey,
      provider.baseUrl || "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
    break;
  default:
    result = await testGenericProvider(apiKey, provider.baseUrl || "");
}
```

The fallback `baseUrl` value in the `case` branch must exactly match the `baseUrl` in `PROVIDER_TEMPLATES` above.

Note that `result.latencyMs = Date.now() - startTime` is assigned **after** the switch block (line 302 in the current file). This means `testBytePlusModelArk` does not need to set `latencyMs` on `result` — but it does return `latencyMs` in its own return value, and the procedure's outer assignment overwrites it with the total wall-clock time. Both are fine; the outer assignment is the one persisted to `lastTestResult`.

---

## Verification

After completing all changes in this section:

```bash
cd apps/web && pnpm check   # TypeScript must compile with 0 errors
cd apps/web && pnpm test    # All tests must pass
```

Also confirm manually that the `PROVIDER_TEMPLATES` array has 5 entries total (kie_ai, fal_ai, replicate, runpod, byteplus_modelark).

The 6 BytePlus model IDs used here (to copy precisely for cross-section consistency):
- `"seedream-4-5-251128"` (image)
- `"seedream-4-0-250828"` (image)
- `"seedance-1-0-pro-fast-251015"` (video)
- `"seedance-1-0-pro-250528"` (video)
- `"seedance-1-0-lite-t2v-250428"` (video)
- `"seedance-1-0-lite-i2v-250428"` (video)