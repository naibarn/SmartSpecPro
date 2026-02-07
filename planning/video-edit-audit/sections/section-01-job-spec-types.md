Now I have complete context. The `shared/` directory exists but has no `types/` subdirectory -- the plan says to create `apps/web/shared/types/mediaJob.ts`. Let me generate the section content.

# Section 01: Job Spec Type System & Shared Contract

## Overview

This section defines the **Media Job Spec v0.1** TypeScript types -- the foundational contract between the video editor UI and all media processing engines (desktop Tauri/FFmpeg and web Python/Celery). Every subsequent section depends on these types.

The work involves creating a single new file at `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts` containing:

1. Asset, Timeline, and Clip type definitions (ms-based)
2. Job envelope types (spec, progress, result, error)
3. A `validateJobSpec()` validation function
4. Conversion helpers between the existing `VideoEditorProject` format (seconds) and the new types (milliseconds)

No database changes are required. No other sections need to be completed first.

---

## Dependencies

- **None** -- this is the first section and has no prerequisites.
- **Blocks**: Sections 02 through 08 all depend on the types defined here.

---

## Background Context

### Existing Type System

The current video editor types live in `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`. Key characteristics:

- All time values are in **seconds** (e.g., `startTime`, `duration`, `trimIn`, `trimOut`)
- The project version string is `"1.0"`
- Track types include `'video' | 'audio' | 'overlay'`
- Clips reference assets by `assetId` into a `Record<string, Asset>` lookup
- Assets have `path` (local filesystem path) and `originalPath` (URL if generated)
- There are **duplicate type definitions**: `MediaLibraryAsset` and `RenderJob` exist in both `videoEditor.ts` and `videoEditorService.ts` (at `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts`)

### Path Aliases

The Vite config at `/home/dev/projects/SmartSpecPro/apps/web/vite.config.ts` defines:

- `@shared` resolves to `apps/web/shared/`
- `@/` resolves to `apps/web/client/src/`

So the new file at `apps/web/shared/types/mediaJob.ts` can be imported as `@shared/types/mediaJob` from client code and with a relative path from server code.

### Shared Directory Structure

Currently `apps/web/shared/` contains `types.ts` and `const.ts`. The existing `types.ts` re-exports from `drizzle/schema` and `_core/errors`. The new file goes in a new `types/` subdirectory. This is a parallel placement, not a modification to the existing `types.ts`.

---

## Tests (Write First)

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/shared/types/__tests__/mediaJob.test.ts`.

The project uses Vitest with `describe`/`it`/`expect` from `"vitest"`. Follow the existing test conventions seen in files like `apps/web/server/schema.test.ts`.

### Test Stubs

```typescript
import { describe, it, expect } from "vitest";

// Import the types and functions under test.
// Adjust import path as needed -- the implementation file is at
// apps/web/shared/types/mediaJob.ts, imported as @shared/types/mediaJob
// or via relative path "../mediaJob".
import {
  validateJobSpec,
  projectToTimeline,
  timelineToProject,
  msToSeconds,
  secondsToMs,
} from "../mediaJob";
import type {
  MediaJobSpec,
  MediaAsset,
  MediaTimeline,
  MediaTrack,
  MediaClip,
  MediaJobProgress,
  MediaJobResult,
  MediaJobError,
  MediaArtifact,
  MediaJobType,
  MediaJobStatus,
  MediaStream,
} from "../mediaJob";

describe("validateJobSpec", () => {
  it("accepts a valid probe job spec", () => {
    /** Build a minimal valid probe spec and assert { valid: true, errors: [] } */
  });

  it("accepts a valid render_mp4_h264 job spec", () => {
    /** Build a valid render spec with a timeline and assert valid */
  });

  it("rejects missing jobType", () => {
    /** Omit jobType, assert valid === false and errors includes jobType message */
  });

  it("rejects missing specVersion", () => {
    /** Omit specVersion, assert valid === false */
  });

  it("rejects outMs <= inMs on a clip", () => {
    /** Create a clip where outMs <= inMs, assert validation catches it */
  });

  it("rejects bucketMs outside 10-500 range", () => {
    /** Set params.bucketMs to 5 or 600, assert rejection */
  });

  it("rejects unknown jobType", () => {
    /** Set jobType to "unknown_type", assert rejection */
  });

  it("rejects invalid URI format (contains shell chars)", () => {
    /** Set asset URI containing shell metacharacters like ; or |, assert rejection */
  });
});

describe("projectToTimeline", () => {
  it("converts seconds to ms correctly", () => {
    /** Create a VideoEditorProject with known second values,
     *  convert, and assert all time fields are multiplied by 1000 */
  });

  it("preserves all track and clip data", () => {
    /** Create a project with multiple tracks and clips,
     *  convert, and verify trackId, clipId, assetId, volume, speed are preserved */
  });
});

describe("timelineToProject", () => {
  it("converts ms to seconds correctly", () => {
    /** Create a MediaTimeline with known ms values,
     *  convert, and assert all time fields are divided by 1000 */
  });
});

describe("msToSeconds / secondsToMs", () => {
  it("msToSeconds and secondsToMs are inverse operations", () => {
    const original = 1500;
    expect(secondsToMs(msToSeconds(original))).toBe(original);
    expect(msToSeconds(secondsToMs(1.5))).toBe(1.5);
  });
});
```

Run tests with:
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test shared/types/__tests__/mediaJob.test.ts
```

---

## Implementation Details

### File to Create

**`/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts`**

This single file contains all exports. It is organized into four logical sections described below.

### 1. Asset Model

Define the `MediaAsset` interface representing a media file (video, audio, image, or subtitle). It uses URIs (`file://`, `https://`, or `asset://`) rather than bare filesystem paths, making it platform-agnostic.

```typescript
interface MediaStream {
  type: "video" | "audio";
  codec: string;
  // video-specific
  width?: number;
  height?: number;
  fps?: number;
  // audio-specific
  channels?: number;
  sampleRate?: number;
}

interface MediaAsset {
  assetId: string;
  kind: "video" | "audio" | "image" | "subtitle";
  uri: string;               // file:// | https:// | asset://
  mime?: string;
  label?: string;
  durationMs?: number;
  streams?: MediaStream[];
  contentHash?: string;
  extra?: Record<string, unknown>;
}
```

### 2. Timeline Model (ms-based)

Define the timeline data model. All time values are in **milliseconds** (not seconds like the existing `VideoEditorProject`).

```typescript
interface MediaTimeline {
  projectId: string;
  fps: number;
  width: number;
  height: number;
  tracks: MediaTrack[];
}

interface MediaTrack {
  trackId: string;
  type: "video" | "audio" | "subtitle";
  clips: MediaClip[];
}

interface MediaClip {
  clipId: string;
  assetId: string;
  inMs?: number;              // trim start within the source asset
  outMs?: number;             // trim end within the source asset
  startMs: number;            // position on the timeline
  playbackRate?: number;      // 1.0 = normal speed
  volume?: number;            // 0.0 - 1.0
  mute?: boolean;
}
```

### 3. Job Envelope, Progress, and Result

The job spec is the core contract. Define the `MediaJobType` union, the `MediaJobSpec` interface (with `specVersion: "0.1"`), and the result/error types.

```typescript
type MediaJobType =
  | "probe"
  | "render_mp4_h264"
  | "render_hls"
  | "waveform_peaks"
  | "thumbnails"
  | "subtitles_extract"
  | "subtitles_burnin"
  | "concat"
  | "dead_air_detect"
  | "dead_air_cut"
  | "generate_clip_from_api";

interface MediaJobSpec {
  specVersion: "0.1";
  jobId: string;
  jobType: MediaJobType;
  priority?: "low" | "normal" | "high";
  inputs: {
    assets?: MediaAsset[];
    project?: MediaTimeline | null;
  };
  params?: Record<string, unknown>;
  output: {
    mode: "file" | "dir" | "memory";
    target: string;
    overwrite?: boolean;
  };
  engine?: {
    strategy: "desktop_sidecar" | "web_backend" | "web_wasm";
    hints?: Record<string, unknown>;
  };
  cache?: { enabled?: boolean; key?: string };
  telemetry?: { traceId?: string };
}

type MediaJobStatus = "queued" | "running" | "done" | "error" | "canceled";

interface MediaJobProgress {
  jobId: string;
  status: MediaJobStatus;
  progress: number;           // 0.0 - 1.0
  etaMs?: number;
  stage?: string;
  message?: string;
  metrics?: { speed?: string; outTimeMs?: number };
}

interface MediaJobResult {
  jobId: string;
  status: "done";
  artifacts: MediaArtifact[];
  derived?: Record<string, unknown>;
}

interface MediaJobError {
  jobId: string;
  status: "error";
  error: { code: string; message: string; details?: Record<string, unknown> };
}

interface MediaArtifact {
  kind: string;
  uri: string;
  mime?: string;
}
```

### 4. Validation Function

Implement `validateJobSpec(spec: MediaJobSpec): { valid: boolean; errors: string[] }` that checks:

- **Required fields present**: `specVersion`, `jobId`, `jobType`, `inputs`, `output` must exist.
- **specVersion** must equal `"0.1"`.
- **jobType** must be one of the known `MediaJobType` values.
- **Clip validation**: For every clip in `inputs.project.tracks[*].clips[*]`, if both `inMs` and `outMs` are defined, then `outMs > inMs`.
- **URI format**: Asset URIs must not contain shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `{`, `}`, `>`, `<`). This prevents injection when URIs are passed to FFmpeg.
- **Numeric range validation for params**: If `params.bucketMs` exists (for `waveform_peaks`), it must be between 10 and 500 inclusive. If `params.segmentSeconds` exists, it must be between 2 and 10 inclusive.
- Return `{ valid: true, errors: [] }` when all checks pass, or `{ valid: false, errors: [...messages] }` with descriptive error strings.

The valid `MediaJobType` values should be stored in an exported array constant (e.g., `VALID_JOB_TYPES`) so other code can reference them.

### 5. Conversion Helpers

These functions bridge between the existing `VideoEditorProject` types (seconds-based, version `"1.0"`) and the new `MediaTimeline` types (ms-based).

```typescript
function msToSeconds(ms: number): number
  /** Return ms / 1000 */

function secondsToMs(s: number): number
  /** Return Math.round(s * 1000) — round to avoid floating-point drift */

function projectToTimeline(project: VideoEditorProject): MediaTimeline
  /**
   * Convert an existing VideoEditorProject to a MediaTimeline.
   *
   * Mapping:
   * - project.settings.fps → timeline.fps
   * - project.settings.width → timeline.width
   * - project.settings.height → timeline.height
   * - project.timeline.tracks → timeline.tracks (mapped)
   *   - track.id → trackId
   *   - track.type → type (map 'overlay' to 'video')
   *   - track.clips → clips (mapped)
   *     - clip.id → clipId
   *     - clip.assetId → assetId
   *     - clip.startTime (seconds) → startMs (ms via secondsToMs)
   *     - clip.trimIn (seconds) → inMs (ms via secondsToMs)
   *     - clip.trimOut (seconds) → outMs (ms via secondsToMs)
   *     - clip.speed → playbackRate
   *     - clip.volume → volume
   *
   * The projectId is derived from project.name or a generated ID.
   */

function timelineToProject(timeline: MediaTimeline): VideoEditorProject
  /**
   * Convert a MediaTimeline back to a VideoEditorProject.
   *
   * Inverse of projectToTimeline. Time values converted from ms to seconds
   * via msToSeconds. Sets version to "2.0" on the output project.
   * Missing fields (audioMixing, export settings) get sensible defaults
   * from createEmptyProject().
   */
```

The `projectToTimeline` function must import the `VideoEditorProject` type from the existing file. Use a relative import:
```typescript
import type { VideoEditorProject } from "../../client/src/types/videoEditor";
```

Or, since this file is in `shared/types/`, you may need to verify the exact relative path. The file is at `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts` and it needs to reference `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`. That relative path would be `../../client/src/types/videoEditor`.

### Type Exports

All interfaces, types, and functions should be exported. The test file imports them directly. Downstream sections (02-08) will import from `@shared/types/mediaJob`.

---

## Checklist

1. Create directory `/home/dev/projects/SmartSpecPro/apps/web/shared/types/` if it does not exist.
2. Create test file at `/home/dev/projects/SmartSpecPro/apps/web/shared/types/__tests__/mediaJob.test.ts` with the test stubs above. Flesh out each test body with concrete assertions.
3. Run the tests -- they should all fail (no implementation yet).
4. Create `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts` with all interfaces, types, the `VALID_JOB_TYPES` constant, `validateJobSpec()`, `msToSeconds()`, `secondsToMs()`, `projectToTimeline()`, and `timelineToProject()`.
5. Run the tests again -- they should all pass.
6. Run the full test suite (`cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`) to verify no regressions.

---

## Notes for Implementers

- The `VideoEditorProject` type uses `trimOut` to mean the **end point** of the trim (not the amount trimmed from the end). When converting to `outMs`, use `secondsToMs(clip.trimOut)` directly.
- The existing `VideoEditorProject` track type includes `'overlay'` which has no equivalent in the new `MediaTrack.type`. Map `'overlay'` to `'video'` during conversion.
- The `videoEditorService.ts` file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts` has duplicate `MediaLibraryAsset` and `RenderJob` definitions. This section does NOT address that duplication -- it is handled in Section 05 (Frontend Consolidation).
- The `projectManager.ts` validation bug (checking `settings.sample_rate` instead of `settings.sampleRate`) is also deferred to Section 05.
- The URI validation in `validateJobSpec` is intentionally conservative. It blocks shell metacharacters but does not perform full URL parsing. SSRF prevention (blocking `localhost`, internal IPs) is handled in Section 08 (Validation & Security).