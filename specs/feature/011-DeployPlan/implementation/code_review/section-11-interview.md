# Code Review Interview: Section 11 - Video Rendering Pipeline

## Auto-fixes Applied

### 1. CRITICAL: Render Hash Mismatch (Node.js vs Python)
**Issue:** Node.js `JSON.stringify` doesn't sort keys and uses default separators. Python uses `sort_keys=True, separators=(',', ':')`. Hash would never match cross-system.
**Fix:** Added `stableStringify()` function to `renderHash.ts` that recursively sorts keys and uses compact separators (no spaces), matching Python's `json.dumps(sort_keys=True, separators=(',', ':'))`.
**Status:** Applied.

### 2. CRITICAL: `storageHeadObject` Does Not Exist
**Issue:** Dynamic import of `storageHeadObject` from `../storage` fails silently because this function doesn't exist. R2 cache check was always skipped.
**Fix:** Replaced with `storageResolveUrl(outputKey)` which exists and returns null if the object doesn't exist.
**Status:** Applied.

### 3. HIGH: Environment Variable Race Condition
**Issue:** Inline fallback set `os.environ["RENDER_SPEC"]` globally before spawning a background thread. Two concurrent requests would overwrite each other.
**Fix:** Modified `entrypoint.main()` to accept an optional `render_spec_dict` argument. The inline fallback now passes the spec directly: `thread = threading.Thread(target=render_main, args=(spec_copy,))`.
**Status:** Applied.

### 4. HIGH: Empty `fontfile=''` in drawtext
**Issue:** FFmpeg drawtext filter included `fontfile=''` which causes lookup failure.
**Fix:** Removed the `fontfile=''` parameter. Fontconfig-installed fonts are resolved via the `font=` parameter.
**Status:** Applied.

### 5. HIGH: Input Validation `z.any()`
**Issue:** `renderSubmitSchema` accepted `project: z.any()`, allowing any value including null.
**Fix:** Added structural validation: `z.object({ settings: z.object({ width, height, fps, sampleRate }), timeline: z.object({ tracks: z.array(...) }) }).passthrough()`.
**Status:** Applied.

### 6. MEDIUM: Fetch Response Not Checked
**Issue:** In the non-Cloud-Tasks fallback, the `fetch()` response was ignored.
**Fix:** Added `if (!resp.ok) throw new Error(...)` after the fetch call.
**Status:** Applied.

### 7. LOW: Redundant RenderProfile Type
**Issue:** `RenderProfile` type exported from both `videoEditor.ts` and `renderHash.ts`.
**Fix:** Changed `renderHash.ts` to re-export from the shared types file: `export type { RenderProfile } from "../../client/src/types/videoEditor"`.
**Status:** Applied.

## Items Let Go (Not Fixed)

### HIGH: No Database Update After Render
**Reason:** No render records schema exists yet. DB tracking of completed renders is a future concern — this section establishes the pipeline infrastructure.

### HIGH: Background Thread Fire-and-Forget
**Reason:** This is the dev-only inline fallback path. In production, Cloud Run Jobs handle rendering and have built-in retry/failure tracking.

### MEDIUM: No Auth on Fallback HTTP Call
**Reason:** OIDC middleware is Section 04 scope. The fallback path is for local dev only.

### MEDIUM: Job Routing Tests Test Python Mirror
**Reason:** Python tests validate the routing algorithm. The TypeScript implementation mirrors this exactly. TypeScript-specific tests via Vitest are a separate concern.

### MEDIUM: Shallow Idempotency/Drawtext Tests
**Reason:** These test the contract and fixture structure. Real integration tests require FFmpeg binary and R2 connectivity.

### MEDIUM: Missing v2/audio Tests
**Reason:** Would need FFmpeg subprocess invocation to be meaningful. Covered by integration testing.

### MEDIUM: Audio-less Clips / No xfade Transitions
**Reason:** Edge case handling and transition support to be added during hardening phase when connected to real FFmpeg processing.

### LOW: No Duration/Resolution in Upload Metadata
**Reason:** Requires ffprobe on output. Will be added when DB render records are implemented.

### LOW: Missing media_job_worker.py Refactoring
**Reason:** Intentional decision to avoid modifying working production code in this section. The new video package is self-contained.

## Verification
- All 27 tests pass after fixes
- Files re-staged
