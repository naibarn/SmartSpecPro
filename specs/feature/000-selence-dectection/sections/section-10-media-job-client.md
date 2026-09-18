Now I have a complete understanding of all the relevant files and context. Let me produce the section content.

# Section 10: MediaJobClient Updates

## Overview

This section updates the `cutDeadAir()` method in `mediaJobClient.ts` to include the new `softeningBufferMs` and `crossfade` parameters in the `MediaJobSpec` params object. These two parameters connect the frontend dialog's server-side export option to the backend `dead_air_cut` handler implemented in Section 9. The change is minimal -- extending the method signature and the params object it builds.

## Dependencies

- **Section 09 (Backend dead_air_cut):** The Python backend handler `handle_dead_air_cut()` must accept `softeningBufferMs` and `crossfade` in its `spec.params`. This section sends those values; Section 09 consumes them.

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/mediaJobClient.ts` | Modify `cutDeadAir()` method signature and params object |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.test.ts` | Add new tests for `softeningBufferMs` and `crossfade` params |

## Tests (Write First)

Add these tests to the existing `describe("MediaJobClient", ...)` block in `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.test.ts`. They follow the exact same pattern as the existing `cutDeadAir` tests in that file (lines 232-263).

```typescript
// Test: cutDeadAir includes softeningBufferMs in job spec params
it("cutDeadAir includes softeningBufferMs in job spec params", async () => {
  mockAdapter.setStatusSequence([
    { jobId: "any", status: "done", progress: 1.0 },
  ]);

  const segments = [{ startMs: 1000, endMs: 3000 }];
  const promise = client.cutDeadAir("file:///test.mp4", segments, "remove", {
    softeningBufferMs: 200,
  });
  await vi.advanceTimersByTimeAsync(3100);
  await promise;

  const spec = mockAdapter.submitJobCalls[0];
  expect(spec.params?.softeningBufferMs).toBe(200);
});

// Test: cutDeadAir includes crossfade flag in job spec params
it("cutDeadAir includes crossfade flag in job spec params", async () => {
  mockAdapter.setStatusSequence([
    { jobId: "any", status: "done", progress: 1.0 },
  ]);

  const segments = [{ startMs: 1000, endMs: 3000 }];
  const promise = client.cutDeadAir("file:///test.mp4", segments, "remove", {
    crossfade: true,
  });
  await vi.advanceTimersByTimeAsync(3100);
  await promise;

  const spec = mockAdapter.submitJobCalls[0];
  expect(spec.params?.crossfade).toBe(true);
});

// Test: cutDeadAir defaults softeningBufferMs to 0 when not provided
it("cutDeadAir defaults softeningBufferMs to 0 when not provided", async () => {
  mockAdapter.setStatusSequence([
    { jobId: "any", status: "done", progress: 1.0 },
  ]);

  const promise = client.cutDeadAir("file:///test.mp4", []);
  await vi.advanceTimersByTimeAsync(3100);
  await promise;

  const spec = mockAdapter.submitJobCalls[0];
  expect(spec.params?.softeningBufferMs).toBe(0);
});

// Test: cutDeadAir defaults crossfade to false when not provided
it("cutDeadAir defaults crossfade to false when not provided", async () => {
  mockAdapter.setStatusSequence([
    { jobId: "any", status: "done", progress: 1.0 },
  ]);

  const promise = client.cutDeadAir("file:///test.mp4", []);
  await vi.advanceTimersByTimeAsync(3100);
  await promise;

  const spec = mockAdapter.submitJobCalls[0];
  expect(spec.params?.crossfade).toBe(false);
});
```

### Test Notes

- The existing test "cutDeadAir defaults to remove mode" (line 252) will still pass after the change because `mode` remains defaulted to `"remove"`.
- The existing test "cutDeadAir convenience method builds correct job spec" (line 232) will also still pass because `segments` and `mode` are still present in params. After the implementation, `softeningBufferMs` will default to `0` and `crossfade` will default to `false` in that test as well (since no options object is passed).

## Implementation Details

### 1. Add `CutDeadAirOptions` Interface

In `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/mediaJobClient.ts`, add a new interface alongside the existing helper types (near line 58, after the `SilenceSegment` interface):

```typescript
export interface CutDeadAirOptions {
  softeningBufferMs?: number;
  crossfade?: boolean;
}
```

### 2. Update `cutDeadAir()` Method Signature

The current method signature (lines 267-271) is:

```typescript
async cutDeadAir(
  assetUri: string,
  segments: SilenceSegment[],
  mode: "remove" | "compress" = "remove",
): Promise<MediaJobResult> {
```

Change it to accept an optional options parameter as the fourth argument:

```typescript
async cutDeadAir(
  assetUri: string,
  segments: SilenceSegment[],
  mode: "remove" | "compress" = "remove",
  options?: CutDeadAirOptions,
): Promise<MediaJobResult> {
```

### 3. Update the `params` Object in the Job Spec

The current params object (line 280) is:

```typescript
params: { segments, mode },
```

Extend it to include the two new fields with defaults:

```typescript
params: {
  segments: segments.map(s => ({ startMs: s.startMs, endMs: s.endMs })),
  mode,
  softeningBufferMs: options?.softeningBufferMs ?? 0,
  crossfade: options?.crossfade ?? false,
},
```

Note the segments mapping: the current code passes the `SilenceSegment[]` directly. The updated version explicitly maps each segment to `{ startMs, endMs }` to ensure only the required fields are serialized (matching the backend's expected input schema from Section 09). This is a defensive measure -- `SilenceSegment` already only has `startMs` and `endMs`, but explicit mapping prevents accidental extra fields if the interface is later extended.

### 4. Complete Updated Method

For clarity, the full updated method should look like:

```typescript
async cutDeadAir(
  assetUri: string,
  segments: SilenceSegment[],
  mode: "remove" | "compress" = "remove",
  options?: CutDeadAirOptions,
): Promise<MediaJobResult> {
  const jobId = generateJobId();
  const spec: MediaJobSpec = {
    specVersion: "0.1",
    jobId,
    jobType: "dead_air_cut",
    inputs: {
      assets: [{ assetId: "input", kind: "video", uri: assetUri }],
    },
    params: {
      segments: segments.map(s => ({ startMs: s.startMs, endMs: s.endMs })),
      mode,
      softeningBufferMs: options?.softeningBufferMs ?? 0,
      crossfade: options?.crossfade ?? false,
    },
    output: { mode: "file", target: "" },
  };
  await this.submitJob(spec);
  return this.waitForCompletion(jobId);
}
```

## Stage Label Support (No Code Changes Needed)

The `MediaJobClient` already supports progress updates via the `adapter.onProgress` mechanism and the `waitForCompletion` method's `onProgress` callback. When the backend `dead_air_cut` handler (Section 09) reports progress via `report_progress()`, the caller can listen for stage changes by checking the `stage` field on `MediaJobProgress`.

For example, callers of `cutDeadAir` can consume progress like this:

```typescript
const client = await createMediaJobClient();
const jobId = generateJobId();
// ... submit the job ...
const result = await client.waitForCompletion(jobId, (progress) => {
  // progress.stage may be "Preparing", "Building filter", "Encoding", "Finalizing"
  console.log(`Stage: ${progress.stage}, Progress: ${progress.progress}`);
});
```

No changes to `waitForCompletion` or the progress handling infrastructure are required. The existing `MediaJobProgress` interface in `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts` already has an optional `stage?: string` field (line 131).

## Backward Compatibility

The change is fully backward-compatible:

- The `options` parameter is optional, defaulting to `undefined`.
- When `options` is not provided, `softeningBufferMs` defaults to `0` and `crossfade` defaults to `false`, which matches the current behavior (no buffer, no crossfade).
- The `mode` parameter retains its default value of `"remove"`.
- Existing callers that pass only `(assetUri, segments)` or `(assetUri, segments, mode)` continue to work without modification.

## Verification Checklist

After implementing, run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run client/src/services/__tests__/mediaJobClient.test.ts
```

All existing tests plus the four new tests should pass. Specifically verify:

1. The four new tests pass (softeningBufferMs included, crossfade included, softeningBufferMs defaults to 0, crossfade defaults to false).
2. The existing "cutDeadAir convenience method builds correct job spec" test still passes (backward compatibility).
3. The existing "cutDeadAir defaults to remove mode" test still passes.
4. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to confirm no TypeScript errors.
## Implementation Notes

### What Was Actually Built

All planned functionality was implemented according to the specification, with additional validation and documentation improvements identified during code review.

**Files Modified:**
- Modified: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/mediaJobClient.ts`
- Modified: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.test.ts`

**Changes Made:**
1. Added `CutDeadAirOptions` interface with JSDoc documentation
2. Updated `cutDeadAir()` method signature to accept optional `options` parameter
3. Updated params object to include `softeningBufferMs` and `crossfade` with defaults
4. Added client-side validation (clamping softeningBufferMs to [0, 5000])
5. Added explicit segments mapping for defensive coding

**Test Coverage:**
- Added 6 new tests (4 as planned + 2 from code review)
- **Final Test Count:** 28 tests (100% pass rate)

### Code Review Improvements

During code review, the following improvements were identified and implemented:

#### 1. Client-Side Validation (MEDIUM)
**Issue:** No validation for `softeningBufferMs` - could accept negative or excessively large values.

**Fix:** Added clamping logic to ensure values stay within [0, 5000] range

**Impact:** Prevents invalid data from reaching backend, provides immediate feedback.

#### 2. JSDoc Documentation (LOW)
**Issue:** Since MediaJobSpec uses flexible params typing (polymorphic design), the expected parameter structure wasn't documented.

**Fix:** Added comprehensive JSDoc comments to `CutDeadAirOptions` interface explaining valid ranges, default values, and behavior.

**Impact:** Better developer experience, clearer API documentation.

#### 3. Additional Test Coverage (MEDIUM)
**Issue:** Missing tests for boundary values and combined options.

**Fixes:**
- Added test for clamping negative and excessive values
- Added test for using both options together

**Impact:** Better coverage of edge cases, ensures validation works correctly.

### Design Decisions

#### Type Safety Trade-off
**Review Finding:** MediaJobSpec params lacks strict typing for dead_air_cut parameters.

**Decision:** Accepted flexible params approach. MediaJobSpec is polymorphic and used across many job types. Adding strict typing would require discriminated unions for all job types, which is beyond this section's scope. The JSDoc documentation provides sufficient guidance.

**Rationale:** This is a reasonable design pattern for polymorphic job specs in TypeScript. The backend validates the params, and JSDoc provides developer guidance.

### Verification Results

All tests pass (28 tests, 100% pass rate). TypeScript check shows no errors in modified files.

### Backward Compatibility

Fully backward-compatible - all existing callers work without modification, all existing tests continue to pass.
