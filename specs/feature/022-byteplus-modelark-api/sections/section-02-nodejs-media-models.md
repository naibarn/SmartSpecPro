Now I have all the information needed. Let me write the section content:

# Section 02: Node.js MEDIA_MODELS Registry

## Overview

This section adds all 6 BytePlus ModelArk model IDs to the `ImageModel` and `VideoModel` TypeScript union types and registers them in the `MEDIA_MODELS` registry inside `apps/web/server/services/mediaGenerationService.ts`. Without these entries, BytePlus models fall back to `provider: "kie.ai"` which routes them to the wrong rate limiter bucket and credit tracking pipeline.

**Dependency:** This section is independent and can be implemented in parallel with section-01 (Node.js template) and section-03 (Python adapter). Section-07 (end-to-end integration validation) depends on this section being complete.

**File to modify:** `apps/web/server/services/mediaGenerationService.ts`

**Test command:** `cd apps/web && npm run check && npm test`

**Implementation status:** COMPLETE
**Tests:** 15/15 passing
**Files created/modified:**
- `apps/web/server/services/mediaGenerationService.ts` (modified — union types + MEDIA_MODELS entries)
- `apps/web/server/services/mediaGenerationService.test.ts` (created — 15 tests)
- `apps/web/server/services/llmRateLimiter.ts` (modified — added byteplus_modelark rate limiter config)

**Deviations from plan:**
- Added `byteplus_modelark` entry to `MEDIA_PROVIDER_LIMITS` in llmRateLimiter.ts (missing from plan but required for correct rate limiting)
- Removed '1K'/'2K'/'4K' shorthand strings from supportsSizes (plan included them; removed to avoid frontend parse failures — Python adapter handles size conversion via SIZE_MAP)
- Test count is 15 (plan specified 14; added id-field integrity test)

---

## Background

The `MEDIA_MODELS` registry (a `Record<string, ModelMetadata>` constant) is the central lookup table that the Node.js media generation pipeline uses to:

1. Resolve `provider` string for rate limiter bucket selection (e.g., `scheduleMediaWithLimiter`)
2. Determine `type` (`"image"` or `"video"`) to decide which Python endpoint to call
3. Return `creditCost` for pre-generation credit checks and post-generation deduction

The existing `ImageModel` and `VideoModel` TypeScript union types must include all valid model IDs — otherwise passing a BytePlus model ID string to a typed parameter causes a compile error, which is caught by `pnpm check`.

### BytePlus Model Catalog

| Model ID | Type | Credit Cost | Capabilities |
|---|---|---|---|
| `seedream-4-5-251128` | image | 15 | text-to-image |
| `seedream-4-0-250828` | image | 10 | text-to-image |
| `seedance-1-0-pro-fast-251015` | video | 20 | T2V |
| `seedance-1-0-pro-250528` | video | 30 | T2V, I2V |
| `seedance-1-0-lite-t2v-250428` | video | 20 | T2V |
| `seedance-1-0-lite-i2v-250428` | video | 20 | I2V |

The `provider` value for all 6 entries must be `"byteplus_modelark"` — this string is the authoritative provider identifier used across the whole system (Python adapter, LLMGateway routing, admin UI, rate limiter buckets).

---

## Tests First

Create or extend a Vitest test file. The natural location is alongside the service file. If a dedicated test file does not yet exist for `mediaGenerationService.ts`, create one at:

**`/home/dev/projects/SmartSpecPro/apps/web/server/services/mediaGenerationService.test.ts`**

If a test file already exists, append these tests to it.

### Test stubs

```typescript
// apps/web/server/services/mediaGenerationService.test.ts
import { describe, it, expect } from "vitest";
import { MEDIA_MODELS } from "./mediaGenerationService";

describe("MEDIA_MODELS — BytePlus ModelArk entries", () => {
  // Image models
  it('MEDIA_MODELS["seedream-4-5-251128"] has provider "byteplus_modelark" and type "image"', () => {
    // Assert provider === "byteplus_modelark" and type === "image"
  });

  it('MEDIA_MODELS["seedream-4-0-250828"] has provider "byteplus_modelark" and type "image"', () => {
    // Assert provider === "byteplus_modelark" and type === "image"
  });

  it("Seedream 4.5 creditCost is 15", () => {
    // Assert creditCost === 15
  });

  it("Seedream 4.0 creditCost is 10", () => {
    // Assert creditCost === 10
  });

  // Video models
  it('MEDIA_MODELS["seedance-1-0-pro-250528"] has provider "byteplus_modelark" and type "video"', () => {
    // Assert provider === "byteplus_modelark" and type === "video"
  });

  it('MEDIA_MODELS["seedance-1-0-lite-t2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    // Assert provider === "byteplus_modelark" and type === "video"
  });

  it('MEDIA_MODELS["seedance-1-0-lite-i2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    // Assert provider === "byteplus_modelark" and type === "video"
  });

  it('MEDIA_MODELS["seedance-1-0-pro-fast-251015"] has provider "byteplus_modelark" and type "video"', () => {
    // Assert provider === "byteplus_modelark" and type === "video"
  });

  it("Seedance Pro creditCost is 30", () => {
    // Assert creditCost === 30
  });

  it("Seedance Pro Fast creditCost is 20", () => {
    // Assert creditCost === 20
  });

  it("Seedance Lite T2V creditCost is 20", () => {
    // Assert creditCost === 20
  });

  it("Seedance Lite I2V creditCost is 20", () => {
    // Assert creditCost === 20
  });

  it("all 6 BytePlus models are present in MEDIA_MODELS", () => {
    // Assert all 6 IDs exist as keys in MEDIA_MODELS
    const byteplusModels = Object.values(MEDIA_MODELS).filter(
      (m) => m.provider === "byteplus_modelark",
    );
    // Assert byteplusModels.length === 6
  });

  it("TypeScript compilation validates union types (run pnpm check separately)", () => {
    // This is a marker test — TypeScript compilation itself is the real assertion.
    // If ImageModel and VideoModel unions do not include the BytePlus IDs,
    // `pnpm check` will fail with type errors.
    expect(true).toBe(true);
  });
});
```

Run these tests first to confirm they fail (red), then implement the production code.

---

## Implementation

### Step 1 — Add BytePlus IDs to `ImageModel` union type

Locate the `ImageModel` type near the top of `mediaGenerationService.ts` (currently around line 17). Add the two Seedream model IDs:

```typescript
export type ImageModel =
  | "google-nano-banana-pro"
  | "flux-2.0"
  | "z-image"
  | "grok-imagine"
  // BytePlus ModelArk — Seedream image models
  | "seedream-4-5-251128"
  | "seedream-4-0-250828";
```

### Step 2 — Add BytePlus IDs to `VideoModel` union type

Locate the `VideoModel` type (currently around line 23). Add the four Seedance model IDs:

```typescript
export type VideoModel =
  | "veo-3-1"
  | "sora-2"
  | "kling-2.6"
  // BytePlus ModelArk — Seedance video models
  | "seedance-1-0-pro-fast-251015"
  | "seedance-1-0-pro-250528"
  | "seedance-1-0-lite-t2v-250428"
  | "seedance-1-0-lite-i2v-250428";
```

### Step 3 — Add entries to `MEDIA_MODELS` registry

In the `MEDIA_MODELS` constant (currently ends around line 144), add a new block after the existing video models section and before the audio models section:

```typescript
  // ========== BytePlus ModelArk — Seedream Image Models ==========
  "seedream-4-5-251128": {
    id: "seedream-4-5-251128",
    type: "image",
    name: "Seedream 4.5",
    provider: "byteplus_modelark",
    description: "BytePlus Seedream 4.5 — high-quality image generation (synchronous)",
    supportsSizes: ["1K", "2K", "4K", "1024x1024", "2048x2048", "4096x4096"],
    creditCost: 15,
  },
  "seedream-4-0-250828": {
    id: "seedream-4-0-250828",
    type: "image",
    name: "Seedream 4.0",
    provider: "byteplus_modelark",
    description: "BytePlus Seedream 4.0 — cost-efficient image generation (synchronous)",
    supportsSizes: ["1K", "2K", "4K", "1024x1024", "2048x2048", "4096x4096"],
    creditCost: 10,
  },
  // ========== BytePlus ModelArk — Seedance Video Models ==========
  "seedance-1-0-pro-fast-251015": {
    id: "seedance-1-0-pro-fast-251015",
    type: "video",
    name: "Seedance Pro Fast",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Pro Fast — fast text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-pro-250528": {
    id: "seedance-1-0-pro-250528",
    type: "video",
    name: "Seedance Pro",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Pro — high-quality text-to-video and image-to-video (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 30,
  },
  "seedance-1-0-lite-t2v-250428": {
    id: "seedance-1-0-lite-t2v-250428",
    type: "video",
    name: "Seedance Lite T2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-lite-i2v-250428": {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video",
    name: "Seedance Lite I2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — image-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
```

The `ModelMetadata` interface already has an optional `capabilities` field is not present — `supportsDurations` and `supportsAspectRatios` are the appropriate optional fields from the existing interface. Do not add a new `capabilities` field unless `ModelMetadata` already defines it.

---

## Verification

After implementing both the union types and MEDIA_MODELS entries:

1. Run TypeScript check:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
   ```
   This must pass with zero errors. TypeScript compilation is the authoritative validation for the union type additions — if a model ID string is missing from the union, any call site that passes it typed will produce a compile error here.

2. Run the Vitest tests:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
   ```
   All 6 MEDIA_MODELS entry tests must pass.

3. Verify provider string is exactly `"byteplus_modelark"` (not `"byteplus"`, `"byteplus-modelark"`, or any other variant). This string must match exactly the `providerName` used in section-01's `PROVIDER_TEMPLATES`, the Python adapter's `get_media_provider_key("byteplus_modelark")` calls in sections 05 and 06, and the admin provider records.

---

## Notes for the Implementer

- Do not change the `ModelMetadata` interface itself — all needed fields (`id`, `type`, `name`, `provider`, `description`, `creditCost`, `supportsSizes`, `supportsDurations`, `supportsAspectRatios`) already exist as optional or required properties.
- The `supportsSizes` entries for image models include both BytePlus shorthand (`"1K"`, `"2K"`, `"4K"`) and pixel equivalents (`"1024x1024"`, `"2048x2048"`, `"4096x4096"`) for UI display compatibility. The Python adapter's `SIZE_MAP` (defined in section-03) handles the actual conversion before calling the BytePlus API.
- Watermark toggle is an admin-only configJSON setting — do not add a `supportsWatermark` field to `ModelMetadata` here. The Python adapter reads watermark from provider configJSON.
- No database migration is required for this section — `MEDIA_MODELS` is an in-memory registry in the Node.js service, not a database table.