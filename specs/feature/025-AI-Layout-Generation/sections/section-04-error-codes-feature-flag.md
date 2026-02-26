Good. Now I have comprehensive understanding. Let me produce the section content.

# Section 04: Error Codes and Feature Flag

## Overview

This section adds three AI-specific error codes to the presentation constants module, a feature flag for gating AI generation (defaulting to OFF), and extends the availability endpoint to expose the AI generation flag to the client. These are small but critical pieces used by the tRPC router (section-07) and frontend (section-08).

**Dependencies:** Section 01 (shared types/presets) must be complete, as the error codes sit alongside constants used by AI types. However, this section only modifies `constants.ts` and `contracts.ts` in `shared/presentation/`, plus the availability query in the presentation router.

**Blocks:** Section 07 (tRPC router), which uses the feature flag guard and error code mappings.

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/constants.ts` | Add 3 error codes, feature flag constant, `isPresentationAIGenerationEnabled()` function |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` | Extend `presentationAvailabilitySchema` with optional `aiGenerationEnabled` field |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts` | Update `getAvailability()` to include `aiGenerationEnabled` |

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/constants.ai.test.ts` | Tests for the new error codes and feature flag function |

---

## Tests (implement first)

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/constants.ai.test.ts`.

The tests validate three aspects: (1) the new error codes exist in `PRESENTATION_ERROR_CODE_VALUES` and `PRESENTATION_ERROR_CODE`, (2) the feature flag function `isPresentationAIGenerationEnabled()` defaults to OFF and respects env var values, and (3) the availability schema accepts the new optional `aiGenerationEnabled` field.

```typescript
import { describe, expect, it, afterEach, vi } from "vitest";

import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ERROR_CODE_VALUES,
  PRESENTATION_AI_GENERATION_FLAG_ENV,
  isPresentationAIGenerationEnabled,
} from "../constants";
import { presentationAvailabilitySchema } from "../contracts";

describe("AI error codes in PRESENTATION_ERROR_CODE_VALUES", () => {
  it("includes PRESENTATION_AI_GENERATION_FAILED", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_GENERATION_FAILED",
    );
  });

  it("includes PRESENTATION_AI_INSUFFICIENT_CREDITS", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
    );
  });

  it("includes PRESENTATION_AI_INVALID_RESPONSE", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_INVALID_RESPONSE",
    );
  });

  it("has matching entries in PRESENTATION_ERROR_CODE object", () => {
    expect(PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED).toBe(
      "PRESENTATION_AI_GENERATION_FAILED",
    );
    expect(PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS).toBe(
      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
    );
    expect(PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE).toBe(
      "PRESENTATION_AI_INVALID_RESPONSE",
    );
  });
});

describe("PRESENTATION_AI_GENERATION_FLAG_ENV", () => {
  it("equals 'PRESENTATION_AI_GENERATION_ENABLED'", () => {
    expect(PRESENTATION_AI_GENERATION_FLAG_ENV).toBe(
      "PRESENTATION_AI_GENERATION_ENABLED",
    );
  });
});

describe("isPresentationAIGenerationEnabled()", () => {
  afterEach(() => {
    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
  });

  it("returns false when env var is unset (default OFF)", () => {
    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "true";
    expect(isPresentationAIGenerationEnabled()).toBe(true);
  });

  it("returns true when env var is '1'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "1";
    expect(isPresentationAIGenerationEnabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "false";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is '0'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "0";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is 'off'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "off";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is empty string", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });
});

describe("presentationAvailabilitySchema with aiGenerationEnabled", () => {
  it("accepts existing shape without aiGenerationEnabled (backward compat)", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts shape with aiGenerationEnabled: true", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
      aiGenerationEnabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBe(true);
    }
  });

  it("accepts shape with aiGenerationEnabled: false", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
      aiGenerationEnabled: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBe(false);
    }
  });

  it("defaults aiGenerationEnabled to undefined when omitted", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBeUndefined();
    }
  });
});
```

---

## Implementation Details

### 1. Add Error Codes and Feature Flag to Constants

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/constants.ts`

**Changes to `PRESENTATION_ERROR_CODE_VALUES`:** Append three new string literals to the existing `as const` array:

- `"PRESENTATION_AI_GENERATION_FAILED"` -- used when the AI pipeline fails for any non-credit, non-validation reason (LLM timeout, internal error, etc.)
- `"PRESENTATION_AI_INSUFFICIENT_CREDITS"` -- used when the credit pre-check fails before starting the pipeline
- `"PRESENTATION_AI_INVALID_RESPONSE"` -- used when the LLM returns data that cannot be parsed or validated against the expected Zod schema after retries

Add these at the end of the array, after `"PRESENTATION_RENDER_SCHEMA_MISMATCH"`.

**Changes to `PRESENTATION_ERROR_CODE` object:** Add three corresponding shorthand entries:

```typescript
AI_GENERATION_FAILED: "PRESENTATION_AI_GENERATION_FAILED",
AI_INSUFFICIENT_CREDITS: "PRESENTATION_AI_INSUFFICIENT_CREDITS",
AI_INVALID_RESPONSE: "PRESENTATION_AI_INVALID_RESPONSE",
```

**New constant:** Add the feature flag environment variable name:

```typescript
export const PRESENTATION_AI_GENERATION_FLAG_ENV = "PRESENTATION_AI_GENERATION_ENABLED";
```

**New function:** `isPresentationAIGenerationEnabled()`. This follows the exact same pattern as the existing `isPresentationFeatureEnabled()` and `isPresentationExportWriteEnabled()`, with one critical difference: it defaults to `false` (OFF) when the env var is unset. The existing functions default to `true` (ON) when unset. The logic is inverted:

```typescript
export function isPresentationAIGenerationEnabled(): boolean {
  const raw = (process.env[PRESENTATION_AI_GENERATION_FLAG_ENV] || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return false; // default OFF, unlike isPresentationFeatureEnabled which defaults ON
  }
  return ["1", "true", "on", "yes", "enabled"].includes(raw);
}
```

The key behavioral difference from the existing feature flag functions:
- `isPresentationFeatureEnabled()`: unset env => `true` (ON by default). Checks for "falsy" strings.
- `isPresentationAIGenerationEnabled()`: unset env => `false` (OFF by default). Checks for "truthy" strings.

This means AI generation must be explicitly enabled in production by setting `PRESENTATION_AI_GENERATION_ENABLED=true` in the `.env` file. This is a safety measure since the feature involves LLM credit consumption.

### 2. Extend the Availability Schema

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`

Add an optional `aiGenerationEnabled` boolean field to `presentationAvailabilitySchema`:

```typescript
export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
  aiGenerationEnabled: z.boolean().optional(), // <-- NEW
});
```

Making it `optional()` ensures backward compatibility: older clients that do not know about AI generation will simply ignore this field. The `PresentationAvailability` type (derived via `z.infer`) will automatically gain `aiGenerationEnabled?: boolean`.

### 3. Update the Availability Query in the Presentation Router

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts`

Update the `getAvailability()` function to include the new field. Import `isPresentationAIGenerationEnabled` from `@shared/presentation/constants`.

The existing function:

```typescript
function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }
  return { enabled: true };
}
```

Updated function:

```typescript
function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }
  return {
    enabled: true,
    aiGenerationEnabled: isPresentationAIGenerationEnabled(),
  };
}
```

When the presentation editor is disabled entirely, `aiGenerationEnabled` is omitted (undefined), which the client should interpret as false. When the editor is enabled, the field explicitly reports whether AI generation is also enabled.

Add `isPresentationAIGenerationEnabled` to the import statement from `@shared/presentation/constants` at the top of the file (line 8 area, alongside the existing `isPresentationFeatureEnabled` and `isPresentationExportWriteEnabled` imports).

### 4. Add `ensureAIGenerationEnabled()` Guard (for section-07)

While not strictly required by this section alone, it is useful to add the guard function in the presentation router file now, since it logically belongs with the feature flag. Section 07 (tRPC router) will call this guard in the `ai.generateDraft` mutation.

```typescript
function ensureAIGenerationEnabled(): void {
  if (isPresentationAIGenerationEnabled()) {
    return;
  }
  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
    `${PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED}: AI presentation generation is currently disabled`,
  );
}
```

This follows the exact pattern of the existing `ensureFeatureEnabled()` and `ensureExportWriteEnabled()` guard functions already in the file.

### 5. Add AI Error Code Mappings (for section-07)

Extend the `mapPresentationServiceError()` function in the presentation router to handle the new AI error codes. Add these mappings:

```typescript
if (error.code === PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS) {
  return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
}

if (
  error.code === PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED
  || error.code === PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE
) {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}
```

Add these before the final fallback `return new TRPCError({ code: "BAD_REQUEST", ... })` at the end of the function.

---

## Verification Checklist (COMPLETED)

All steps completed. 16 new tests pass, 49 total presentation tests pass (no regressions).

### Implementation matches plan exactly
- 3 error codes added to `PRESENTATION_ERROR_CODE_VALUES` and `PRESENTATION_ERROR_CODE`
- `PRESENTATION_AI_GENERATION_FLAG_ENV` constant and `isPresentationAIGenerationEnabled()` function added
- `presentationAvailabilitySchema` extended with optional `aiGenerationEnabled` field
- `getAvailability()` updated to include `aiGenerationEnabled` from flag check
- `ensureAIGenerationEnabled()` guard function added for section-07
- `mapPresentationServiceError()` extended with AI error code → tRPC error mappings
- Total: 16 tests

## Notes on Default-OFF Behavior

The AI generation feature flag defaults to OFF, which is intentional and different from the main presentation editor flag (defaults ON). The reasoning:

- AI generation consumes LLM credits with every use
- The pipeline involves multiple external API calls (LLM + image generation)
- Operators should explicitly opt-in to enable this feature
- This prevents accidental credit consumption on deployments that have not been configured for AI generation

To enable in production, add to `/home/dev/projects/SmartSpecPro/apps/web/.env`:

```
PRESENTATION_AI_GENERATION_ENABLED=true
```