Now I have all the context needed. Let me generate the section content.

# Section 02: MediaJobClient and Engine Adapter Interface

## Overview

This section creates the frontend abstraction layer that routes media job submissions to the correct engine backend. It introduces the `IEngineAdapter` interface contract and the `MediaJobClient` class that wraps it with convenience methods and lifecycle management (polling, progress callbacks, cancellation).

**Depends on**: section-01-job-spec-types (the `MediaJobSpec`, `MediaJobProgress`, `MediaJobResult`, `MediaJobError`, `MediaAsset`, `MediaTimeline`, `MediaJobStatus` types must exist in `apps/web/shared/types/mediaJob.ts`)

**Blocks**: section-03 (TauriEngineAdapter), section-04 (WebEngineAdapter), section-05 (frontend consolidation), section-06 (web UI)

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/services/__tests__/mediaJobClient.test.ts` | **Create** | Unit tests for MediaJobClient and adapter routing |
| `apps/web/client/src/services/mediaJobClient.ts` | **Create** | IEngineAdapter interface + MediaJobClient class |

No existing files are modified in this section.

## Background and Context

### Current Architecture (Tightly Coupled)

The existing video editor services are Tauri-only. Two service classes in `apps/web/client/src/services/videoEditorService.ts` call Tauri's `invoke()` directly:

- `VideoEditorMediaLibrary` -- calls `invoke('ffmpeg_probe_file')`, `invoke('ffmpeg_generate_thumbnail')`, `invoke('ffmpeg_extract_waveform')`, etc.
- `VideoEditorRenderService` -- calls `invoke('start_render')`, `invoke('get_render_status')`, `invoke('cancel_render')`

Similarly, `apps/web/client/src/services/projectManager.ts` uses Tauri's `readTextFile`, `writeTextFile`, and `invoke('file_exists')`.

These are all desktop-only. The goal of this section is to introduce a platform-agnostic abstraction that sits between the UI and the engine. The adapter pattern allows the same `MediaJobClient` API to work with both Tauri (desktop) and HTTP/SSE (web) backends.

### Target Architecture

```
UI Components
     |
     v
MediaJobClient (this section)
     |
     v
IEngineAdapter (interface -- this section)
     |
     +--> TauriEngineAdapter (section-03)
     +--> WebEngineAdapter   (section-04)
```

### Path Aliases

Per `apps/web/vite.config.ts`, the alias `@/` maps to `client/src/` and `@shared/` maps to `shared/`. Imports from the shared types should use `@shared/types/mediaJob`.

## Tests (Write First)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.test.ts`

This test file validates the `MediaJobClient` class in isolation using mock adapters. The tests should cover:

### Test Stubs

```
Test: MediaJobClient routes to TauriEngineAdapter when window.__TAURI__ exists
Test: MediaJobClient routes to WebEngineAdapter when not in Tauri
Test: submitJob calls adapter.submitJob with correct spec
Test: waitForCompletion resolves when status is 'done'
Test: waitForCompletion rejects when status is 'error'
Test: waitForCompletion calls onProgress callback with each progress event
Test: cancelJob calls adapter.cancelJob
Test: probe convenience method builds correct job spec
Test: renderMp4 convenience method builds correct job spec with timeline
Test: getWaveformPeaks convenience method builds correct job spec with bucketMs
Test: detectDeadAir convenience method builds correct job spec with threshold params
```

### Test Structure Guidance

The test file should:

1. **Create a `MockEngineAdapter`** that implements `IEngineAdapter`. This mock should store calls for assertion and allow configuring return values (especially for `getStatus` to simulate progress/done/error sequences).

2. **Mock the `window.__TAURI__` global** to test adapter auto-detection. Use `vi.stubGlobal` to set/unset `window.__TAURI__` between tests. Restore after each test.

3. **Test `waitForCompletion` polling behavior**:
   - The mock `getStatus` should return `"running"` with increasing progress for a few calls, then `"done"`.
   - Verify that the `onProgress` callback was called with each intermediate progress event.
   - For the error case, have `getStatus` return `"error"` status and verify the promise rejects with the error info.

4. **Test convenience methods** (`probe`, `renderMp4`, `getWaveformPeaks`, `detectDeadAir`):
   - Call the convenience method with its typed parameters.
   - Capture the `MediaJobSpec` that was passed to `adapter.submitJob`.
   - Assert that `jobType`, `inputs`, and `params` fields are correctly populated.
   - For example, `probe("file:///test.mp4")` should produce a spec with `jobType: "probe"`, a single asset with `uri: "file:///test.mp4"`, and `specVersion: "0.1"`.

5. **Import types from section-01**: The tests import `MediaJobSpec`, `MediaJobProgress`, `MediaJobResult`, etc. from `@shared/types/mediaJob`. If section-01 is not yet implemented, these imports will fail -- that is expected and acceptable; the tests are written to be correct once dependencies are met.

6. **Auto-detection tests** should test the `createMediaJobClient()` factory function (or static method) rather than testing adapter instantiation directly. The factory checks `window.__TAURI__` and returns a `MediaJobClient` pre-wired with the appropriate adapter. Since the actual adapter classes (`TauriEngineAdapter`, `WebEngineAdapter`) come from sections 03 and 04, these tests may need to mock the adapter module imports or test only the detection logic in isolation.

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/mediaJobClient.ts`

This file defines three exports:

1. The `IEngineAdapter` interface
2. The `MediaJobClient` class
3. A `createMediaJobClient()` factory function

#### IEngineAdapter Interface

```typescript
interface IEngineAdapter {
  submitJob(spec: MediaJobSpec): Promise<string>
  getStatus(jobId: string): Promise<MediaJobProgress>
  cancelJob(jobId: string): Promise<void>
  onProgress(jobId: string, callback: (progress: MediaJobProgress) => void): () => void
}
```

Each method's contract:

- **`submitJob`**: Accepts a fully-formed `MediaJobSpec`, submits it to the engine, and returns the `jobId` string. The adapter is responsible for serialization and transport. The `jobId` in the spec should already be populated by the caller (the `MediaJobClient` generates it via `crypto.randomUUID()` or a fallback).

- **`getStatus`**: Polls the engine for the current status of a job. Returns a `MediaJobProgress` object. This is used both for one-shot status checks and as the fallback in `waitForCompletion` polling.

- **`cancelJob`**: Sends a cancellation request to the engine. Does not wait for confirmation. The next `getStatus` call should eventually reflect the `"canceled"` status.

- **`onProgress`**: Subscribes to real-time progress events for a job. The callback is invoked with each `MediaJobProgress` update. Returns an unsubscribe function. This is the preferred mechanism for live progress (Tauri events or SSE), with `getStatus` polling as fallback.

#### MediaJobClient Class

The class wraps an `IEngineAdapter` and provides:

**Core methods:**

- **`constructor(adapter: IEngineAdapter)`** -- Stores the adapter reference. No other setup needed.

- **`submitJob(spec: MediaJobSpec): Promise<string>`** -- Delegates to `adapter.submitJob(spec)`. Before delegating, it ensures `spec.jobId` is set (generates one if missing) and `spec.specVersion` is `"0.1"`.

- **`waitForCompletion(jobId, onProgress?): Promise<MediaJobResult>`** -- Orchestrates job completion tracking. Algorithm:
  1. Subscribe via `adapter.onProgress()` for real-time updates.
  2. Also start a polling fallback (`adapter.getStatus()`) at 1-second intervals.
  3. On each progress event (from either source), call `onProgress` callback if provided.
  4. When status is `"done"`, resolve with the `MediaJobResult` (which includes `artifacts` and `derived`).
  5. When status is `"error"`, reject with a `MediaJobError`.
  6. Clean up: unsubscribe from progress events and clear the polling interval.
  
  The dual approach (real-time subscription + polling fallback) ensures reliability. The `TauriEngineAdapter` uses Tauri events for `onProgress`; the `WebEngineAdapter` uses SSE. Polling catches any missed events.

- **`cancelJob(jobId): Promise<void>`** -- Delegates to `adapter.cancelJob(jobId)`.

**Convenience methods** (typed wrappers that build `MediaJobSpec` objects and call `submitJob` + `waitForCompletion`):

- **`probe(assetUri: string): Promise<MediaAsset>`** -- Builds a spec with `jobType: "probe"`, a single asset with the given URI, `output.mode: "memory"`. Waits for completion and returns the derived `MediaAsset` from the result.

- **`renderMp4(project: MediaTimeline, outputTarget: string, params?: RenderParams): Promise<MediaJobResult>`** -- Builds a spec with `jobType: "render_mp4_h264"`, sets `inputs.project` to the timeline, `output.target` to the outputTarget, and merges any extra render params (codec, bitrate, etc.) into `params`. Waits for completion.

- **`getWaveformPeaks(assetUri: string, bucketMs?: number): Promise<WaveformResult>`** -- Builds a spec with `jobType: "waveform_peaks"`, a single asset, and `params: { bucketMs: bucketMs ?? 100 }`. Returns the derived waveform data (`{ bucketMs, peaks, durationMs }`).

- **`getThumbnails(assetUri: string, intervalMs?: number): Promise<ThumbnailResult>`** -- Builds a spec with `jobType: "thumbnails"`, `params: { intervalMs: intervalMs ?? 5000 }`.

- **`detectDeadAir(assetUri: string, params?: DeadAirParams): Promise<DeadAirResult>`** -- Builds a spec with `jobType: "dead_air_detect"`, `params: { thresholdDb: params?.thresholdDb ?? -40, minSilenceMs: params?.minSilenceMs ?? 500 }`. Returns silence segments and keep segments.

- **`cutDeadAir(assetUri: string, segments: SilenceSegment[], mode?: "remove" | "compress"): Promise<MediaJobResult>`** -- Builds a spec with `jobType: "dead_air_cut"`, includes silence segments in params.

- **`extractSubtitles(assetUri: string, format?: "srt" | "vtt"): Promise<MediaJobResult>`** -- Builds a spec with `jobType: "subtitles_extract"`, `params: { format: format ?? "srt" }`.

- **`concat(clips: ConcatClip[], strategy?: "concat_copy" | "concat_reencode"): Promise<MediaJobResult>`** -- Builds a spec with `jobType: "concat"`, assets from all clips, `params: { strategy: strategy ?? "concat_reencode" }`.

Each convenience method follows the same pattern:
1. Generate a `jobId` via `crypto.randomUUID()`.
2. Construct a `MediaJobSpec` with appropriate fields.
3. Call `this.submitJob(spec)`.
4. Call `this.waitForCompletion(jobId)`.
5. Extract and return the typed result from `MediaJobResult.derived` or `MediaJobResult.artifacts`.

#### Helper Types for Convenience Methods

Define these locally in `mediaJobClient.ts` (or export them for consumers):

```typescript
interface RenderParams {
  codec?: string
  bitrate?: number
  audioBitrate?: number
}

interface WaveformResult {
  bucketMs: number
  peaks: number[]
  durationMs: number
}

interface ThumbnailResult {
  thumbnails: Array<{ timeMs: number; uri: string }>
}

interface DeadAirParams {
  thresholdDb?: number
  minSilenceMs?: number
}

interface DeadAirResult {
  silenceSegments: Array<{ startMs: number; endMs: number; durationMs: number }>
  keepSegments: Array<{ startMs: number; endMs: number }>
}

interface SilenceSegment {
  startMs: number
  endMs: number
}

interface ConcatClip {
  uri: string
  inMs?: number
  outMs?: number
}
```

#### Adapter Auto-Selection Factory

```typescript
function createMediaJobClient(): MediaJobClient
```

This factory function detects the runtime environment and instantiates the correct adapter:

- If `typeof window !== "undefined" && (window as any).__TAURI__` is truthy, dynamically import and instantiate `TauriEngineAdapter` from `./tauriEngineAdapter`.
- Otherwise, dynamically import and instantiate `WebEngineAdapter` from `./webEngineAdapter`.

Since the adapter modules (sections 03 and 04) do not exist yet, the factory should use dynamic `import()` so that the module resolution does not fail at load time. This also enables code-splitting -- the Tauri adapter code is not bundled into the web build, and vice versa.

The factory returns a `Promise<MediaJobClient>` due to dynamic imports:

```typescript
async function createMediaJobClient(): Promise<MediaJobClient>
```

Alternatively, a synchronous version can be provided that throws if called before initialization, paired with an `init()` method. The async factory approach is simpler and recommended.

#### JobId Generation

Use `crypto.randomUUID()` when available (modern browsers and Node.js 19+). Provide a fallback using `Date.now()` + `Math.random()` for older environments. Prefix with `"mj-"` for easy identification in logs.

#### Error Handling

- If `waitForCompletion` receives a `MediaJobProgress` with `status: "error"`, it should reject with a descriptive `Error` that includes the error code and message from the job.
- If polling fails (network error), retry up to 3 times with 1-second backoff before rejecting.
- The `cancelJob` method should not throw if the job is already completed or unknown -- it is a best-effort operation.

## Integration Notes

### How Sections 03 and 04 Implement the Interface

Section 03 will create `apps/web/client/src/services/tauriEngineAdapter.ts` implementing `IEngineAdapter` using Tauri's `invoke()` and `listen()` APIs. Section 04 will create `apps/web/client/src/services/webEngineAdapter.ts` implementing `IEngineAdapter` using HTTP fetch and SSE (`EventSource`).

### How Section 05 Consumes This

Section 05 (frontend consolidation) replaces all direct `invoke()` calls in the video editor components with calls to the `MediaJobClient` convenience methods. For example:

| Before (Tauri-only) | After (Platform-agnostic) |
|---|---|
| `invoke('ffmpeg_probe_file', { path })` | `jobClient.probe(uri)` |
| `invoke('start_render', { projectJson, outputPath })` | `jobClient.renderMp4(timeline, outputTarget)` |
| `invoke('ffmpeg_extract_waveform', { path })` | `jobClient.getWaveformPeaks(uri)` |

### Dependency on Section 01

All type imports (`MediaJobSpec`, `MediaJobProgress`, `MediaJobResult`, `MediaJobError`, `MediaAsset`, `MediaTimeline`, `MediaJobStatus`) come from `@shared/types/mediaJob` which is created in section-01. This section cannot compile without those types in place.

## Implementation Checklist

1. Create the test file at `apps/web/client/src/services/__tests__/mediaJobClient.test.ts` with all 11 test stubs listed above.
2. Create `apps/web/client/src/services/mediaJobClient.ts` with:
   - The `IEngineAdapter` interface (exported).
   - The helper types (`RenderParams`, `WaveformResult`, etc.) (exported).
   - The `MediaJobClient` class (exported).
   - The `createMediaJobClient()` async factory function (exported).
3. Verify tests pass (the ones that can run without actual adapter implementations -- adapter routing tests will need mocks).
4. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` to confirm no regressions.