I now have all the context needed. Let me produce the section content.

# Section 08: Validation & Security Hardening

## Overview

This section implements the security and validation layer for the Media Job System. It covers five concerns:

1. **Job Spec schema validation** -- enhanced validation beyond what section-01 provides, specifically for web-facing deployments
2. **SSRF prevention** -- blocking localhost, internal IPs, and private network URIs when jobs run on the web backend
3. **Path sanitization extension** -- expanding the Rust `sanitize_path()` allowlist to support new file types (subtitles, images, JSON)
4. **Codec/preset allowlisting** -- ensuring only known-safe codecs and presets are accepted
5. **Desktop sandbox enforcement** -- constraining output paths to the Tauri workspace directory
6. **Web backend resource limits** -- FFmpeg timeout, max output file size, and input validation on the Python Celery worker

This section can be built in parallel with sections 03 and 04 since it touches separate files. It depends on sections 01 and 02 for the types and client interface.

---

## Dependencies

- **section-01-job-spec-types**: Provides `MediaJobSpec`, `validateJobSpec`, `MediaAsset`, `VALID_JOB_TYPES`, and all related types from `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts`
- **section-02-media-job-client**: Provides the `IEngineAdapter` interface and `MediaJobClient` from `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/mediaJobClient.ts`
- **section-03-desktop-engine-adapter** (soft dependency): The Rust `sanitize_path()` in `render.rs` is extended here, but section-03 can proceed independently since the Rust changes are additive
- **section-04-web-engine-adapter** (soft dependency): The Python worker security tests assume the worker module exists, but the security validation can be defined as standalone utility functions

---

## Background Context

### Existing Security Infrastructure

The codebase already has several security patterns this section builds on:

**Rust sanitization functions** in `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs`:
- `sanitize_path(path: &str)` -- rejects shell metacharacters (`; | & \` $ ( ) < >`) and null bytes, validates file extensions against an allowlist of `mp4 | mov | avi | mkv | mp3 | wav | aac`
- `sanitize_codec(codec: &str)` -- validates against a fixed allowlist of known FFmpeg codecs
- `sanitize_numeric(value)` -- ensures a value is a valid number with no injection characters
- `validate_project_limits(project)` -- enforces MAX_CLIPS (1000), MAX_DURATION_SECONDS (3600), MAX_VIDEO_BITRATE (50000), MAX_AUDIO_BITRATE (320), MAX_RESOLUTION_PIXELS (3840x2160), FPS (1-120), volume (0.0-2.0), speed (0.0-10.0)

**Python secure validators** in `/home/dev/projects/SmartSpecPro/python-backend/app/core/secure_validators.py`:
- `SecureURLValidator` -- validates storage URLs against approved domain allowlist, rejects non-HTTPS, checks for path traversal
- `PathValidator` -- double-decodes URL encoding to catch `%2e%2e` traversal attempts
- These validators are focused on marketplace/storage URLs but provide the SSRF prevention pattern to follow

**Node.js rate limiting** in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts`:
- In-memory sliding window rate limiter keyed by IP
- Already used for auth endpoints (`loginProcedure`, `registerProcedure`)
- Will be applied to media job submission endpoints

**tRPC auth procedures** in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/trpc.ts`:
- `protectedProcedure` -- requires authenticated user
- `adminProcedure` -- requires admin role
- `domainAdminProcedure` -- requires admin or domain_admin role
- Rate-limited variants already exist for auth flows

**Audit logging** in `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`:
- JSONL-based audit logger with `media_request` and `media_response` event types
- Automatic payload sanitization (redacts sensitive keys)
- Trace ID correlation via `traceContext.ts`

### The Threat Model

The video editor handles user-supplied media files and user-constructed project specifications. The main attack vectors are:

1. **SSRF via asset URIs** -- A user submits a job with `uri: "http://169.254.169.254/latest/meta-data/"` to probe cloud metadata endpoints. The web backend's FFmpeg process would fetch this URL.
2. **Command injection via filter parameters** -- FFmpeg's `-filter_complex` accepts string arguments. If unsanitized user values (filenames, numeric params) are interpolated, an attacker could inject additional FFmpeg commands.
3. **Path traversal** -- A user provides `output.target: "../../etc/passwd"` to write outside the workspace.
4. **Resource exhaustion (DoS)** -- A user submits a job with 10,000 clips, 8K resolution, or a 100-hour timeline to consume server resources.
5. **File type confusion** -- A user uploads a `.mp4` file that is actually a `.html` file (magic byte mismatch).

---

## Tests (Write First)

### TypeScript Validation Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/types/__tests__/mediaJobValidation.test.ts`

This file tests the enhanced validation functions that go beyond the basic `validateJobSpec` from section-01. These validations are specific to the web backend engine context.

```typescript
import { describe, it, expect } from "vitest";
import {
  validateWebJobSpec,
  isInternalUri,
  validateCodecAllowlist,
  validateResolutionLimits,
  validateBitrateLimits,
  sanitizeUri,
} from "../mediaJobValidation";
import type { MediaJobSpec } from "../mediaJob";

describe("validateWebJobSpec (SSRF prevention)", () => {
  it("rejects localhost URI on web backend", () => {
    /**
     * Create a valid MediaJobSpec with an asset whose uri is
     * "http://localhost:8080/secret". Call validateWebJobSpec
     * with engine context "web_backend". Assert that the result
     * is { valid: false } with an error message mentioning
     * "localhost" or "internal".
     */
  });

  it("rejects internal IP URIs (10.x)", () => {
    /**
     * Use uri "http://10.0.0.1/metadata". Assert rejection
     * with a message about private/internal IP ranges.
     */
  });

  it("rejects internal IP URIs (172.16.x-172.31.x)", () => {
    /**
     * Use uri "http://172.16.0.1/admin". Assert rejection.
     */
  });

  it("rejects internal IP URIs (192.168.x)", () => {
    /**
     * Use uri "http://192.168.1.1/config". Assert rejection.
     */
  });

  it("rejects cloud metadata endpoint (169.254.169.254)", () => {
    /**
     * Use uri "http://169.254.169.254/latest/meta-data/".
     * Assert rejection. This is the AWS/GCP metadata service.
     */
  });

  it("rejects file:// URIs on web backend", () => {
    /**
     * Use uri "file:///etc/passwd". On web backend, file://
     * URIs must not be allowed (only on desktop). Assert rejection.
     */
  });

  it("allows file:// URIs on desktop_sidecar engine", () => {
    /**
     * Same file:// URI but with engine context "desktop_sidecar".
     * Assert valid since desktop is local.
     */
  });

  it("allows valid https:// URIs on web backend", () => {
    /**
     * Use uri "https://storage.example.com/media/clip.mp4".
     * Assert valid.
     */
  });
});

describe("validateWebJobSpec (path traversal)", () => {
  it("rejects paths with traversal (..)", () => {
    /**
     * Set output.target to "../../../etc/shadow".
     * Assert rejection with path traversal error.
     */
  });

  it("rejects URL-encoded traversal (%2e%2e)", () => {
    /**
     * Set output.target to "%2e%2e/%2e%2e/etc/passwd".
     * Assert rejection even with encoding.
     */
  });
});

describe("validateCodecAllowlist", () => {
  it("rejects unknown codecs", () => {
    /**
     * Call validateCodecAllowlist("custom_evil_codec").
     * Assert rejection with unknown codec error.
     */
  });

  it("accepts known safe codecs (libx264, aac, etc.)", () => {
    /**
     * Call validateCodecAllowlist for each of: "libx264", "libx265",
     * "aac", "libmp3lame". Assert all are accepted.
     */
  });
});

describe("validateBitrateLimits", () => {
  it("enforces video bitrate limit", () => {
    /**
     * Call with videoBitrate=100000 (100Mbps). Assert rejection
     * since max is 50000 (50Mbps).
     */
  });

  it("enforces audio bitrate limit", () => {
    /**
     * Call with audioBitrate=1000 (1Mbps). Assert rejection
     * since max is 320kbps.
     */
  });

  it("accepts bitrates within limits", () => {
    /**
     * Call with videoBitrate=5000, audioBitrate=128.
     * Assert accepted.
     */
  });
});

describe("validateResolutionLimits", () => {
  it("enforces max resolution (4K)", () => {
    /**
     * Call with width=7680, height=4320 (8K). Assert rejection
     * since max total pixels is 3840*2160.
     */
  });

  it("accepts resolutions within limits", () => {
    /**
     * Call with width=1920, height=1080. Assert accepted.
     */
  });
});

describe("isInternalUri", () => {
  it("detects IPv4 loopback (127.x.x.x)", () => {
    /** Assert isInternalUri("http://127.0.0.1/") returns true */
  });

  it("detects IPv6 loopback (::1)", () => {
    /** Assert isInternalUri("http://[::1]/") returns true */
  });

  it("detects link-local (169.254.x.x)", () => {
    /** Assert isInternalUri("http://169.254.1.1/") returns true */
  });

  it("returns false for public IPs", () => {
    /** Assert isInternalUri("http://8.8.8.8/") returns false */
  });

  it("returns false for valid domain names", () => {
    /** Assert isInternalUri("https://cdn.example.com/file.mp4") returns false */
  });
});
```

Run with:
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test shared/types/__tests__/mediaJobValidation.test.ts
```

### Python Worker Security Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_security.py`

These tests verify the Celery worker rejects unsafe inputs. They assume that the worker module from section-04 (`python-backend/app/tasks/media_job_worker.py` or `python-backend/app/workers/media_job_worker.py`) exports validation utility functions. If the worker module does not yet exist, the security validation functions can be placed in a standalone module at `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py`.

```python
"""
Security tests for the media job worker validation layer.

Tests SSRF prevention, path traversal rejection, resource limits, and
input sanitization for FFmpeg command construction.
"""
import pytest

# Import the validation utilities.
# If the worker module from section-04 is not yet available,
# these functions should be in app.core.media_job_validators.
from app.core.media_job_validators import (
    validate_job_spec_security,
    validate_uri_no_ssrf,
    validate_output_path,
    FFMPEG_TIMEOUT_SECONDS,
    MAX_OUTPUT_FILE_BYTES,
)


class TestPathTraversal:
    """Worker rejects job specs with path traversal in URIs or output targets."""

    def test_rejects_uri_with_dot_dot(self):
        """
        Provide a job spec where an asset URI contains '../../etc/passwd'.
        Assert validate_job_spec_security raises ValueError with
        a message about path traversal.
        """
        pass

    def test_rejects_encoded_traversal(self):
        """
        Provide a job spec with URI containing '%2e%2e%2f' (encoded ..).
        Assert rejection even with URL encoding.
        """
        pass

    def test_rejects_output_path_traversal(self):
        """
        Provide a job spec with output.target = '../../tmp/evil'.
        Assert validate_output_path raises ValueError.
        """
        pass


class TestSSRFPrevention:
    """Worker rejects job specs with SSRF-prone URIs."""

    def test_rejects_localhost(self):
        """
        URI: 'http://localhost:8080/api/secret'.
        Assert validate_uri_no_ssrf raises ValueError.
        """
        pass

    def test_rejects_127_0_0_1(self):
        """
        URI: 'http://127.0.0.1/admin'.
        Assert rejection.
        """
        pass

    def test_rejects_private_10_range(self):
        """
        URI: 'http://10.0.0.5:3000/internal'.
        Assert rejection.
        """
        pass

    def test_rejects_private_172_range(self):
        """
        URI: 'http://172.20.0.1/private'.
        Assert rejection.
        """
        pass

    def test_rejects_private_192_168_range(self):
        """
        URI: 'http://192.168.0.1/config'.
        Assert rejection.
        """
        pass

    def test_rejects_metadata_endpoint(self):
        """
        URI: 'http://169.254.169.254/latest/meta-data/'.
        Assert rejection. (AWS/GCP metadata service)
        """
        pass

    def test_allows_public_https_url(self):
        """
        URI: 'https://cdn.example.com/media/video.mp4'.
        Assert no exception raised.
        """
        pass


class TestResourceLimits:
    """Worker enforces FFmpeg timeout and output size limits."""

    def test_ffmpeg_timeout_is_configured(self):
        """
        Assert FFMPEG_TIMEOUT_SECONDS is set to a reasonable value
        (e.g., 1800 = 30 minutes). This matches the existing Celery
        task_time_limit of 1800 in celery_app.py.
        """
        assert FFMPEG_TIMEOUT_SECONDS == 1800

    def test_max_output_file_size_is_configured(self):
        """
        Assert MAX_OUTPUT_FILE_BYTES is set (e.g., 10GB).
        This prevents a runaway render from filling disk.
        """
        assert MAX_OUTPUT_FILE_BYTES > 0
        assert MAX_OUTPUT_FILE_BYTES <= 10 * 1024 * 1024 * 1024  # 10GB max


class TestFFmpegArgSanitization:
    """
    No user-supplied strings are passed directly to FFmpeg.
    Only job-spec-derived values are used.
    """

    def test_rejects_shell_metacharacters_in_uri(self):
        """
        URI containing '; rm -rf /' is rejected before
        any FFmpeg command is constructed.
        """
        pass

    def test_rejects_pipe_in_filename(self):
        """
        URI containing '| cat /etc/passwd' is rejected.
        """
        pass
```

Run with:
```bash
cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_media_job_security.py -v
```

---

## Implementation Details

### Files to Create

| File | Description |
|------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJobValidation.ts` | TypeScript web-aware validation functions |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py` | Python validation utilities for the Celery worker |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/types/__tests__/mediaJobValidation.test.ts` | TypeScript validation tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_security.py` | Python security tests |

### Files to Modify

| File | Changes |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs` | Extend `sanitize_path()` extension allowlist |

---

### 8.1 TypeScript Web-Aware Validation Module

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJobValidation.ts`

This module provides validation functions that are context-aware -- they enforce stricter rules when the job is destined for the web backend vs. the desktop sidecar.

**Key functions to implement:**

```typescript
/**
 * Checks whether a URI points to a localhost, private IP, or cloud
 * metadata endpoint. Used to prevent SSRF when the web backend
 * fetches remote assets.
 */
export function isInternalUri(uri: string): boolean
```

The function should parse the URI hostname and check against:
- `localhost`, `127.x.x.x` (IPv4 loopback)
- `::1`, `[::1]` (IPv6 loopback)
- `10.x.x.x` (Class A private)
- `172.16.x.x` through `172.31.x.x` (Class B private)
- `192.168.x.x` (Class C private)
- `169.254.x.x` (link-local, AWS/GCP metadata)
- `0.0.0.0`

Use `URL` constructor for parsing. For IP matching, extract the hostname and check numeric ranges. Do not rely on DNS resolution (the hostname could resolve to an internal IP after validation -- this is a known SSRF bypass; note it in a comment as a limitation and recommend DNS rebinding protection at the infrastructure level).

```typescript
/**
 * Validates a URI against SSRF and injection rules.
 * Returns sanitized URI or throws with descriptive error.
 */
export function sanitizeUri(
  uri: string,
  context: "web_backend" | "desktop_sidecar" | "web_wasm"
): string
```

Rules by context:
- **web_backend**: Reject `file://` URIs entirely. Reject URIs where `isInternalUri()` returns true. Require `https://` scheme (or `http://` only in development via `NODE_ENV === "development"`). Reject URIs containing shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `<`, `>`).
- **desktop_sidecar**: Allow `file://` URIs. Still reject shell metacharacters. Allow `asset://` scheme.
- **web_wasm**: Same as web_backend (runs in browser context).

```typescript
/**
 * Validates codec name against an allowlist.
 * Prevents arbitrary codec injection into FFmpeg commands.
 */
export function validateCodecAllowlist(codec: string): boolean
```

Allowlist (superset of what exists in Rust `sanitize_codec()`):
```
libx264, libx265, h264, hevc, h264_videotoolbox, h264_mf, h264_qsv,
h264_nvenc, hevc_videotoolbox, hevc_mf, hevc_qsv, hevc_nvenc,
aac, mp3, libmp3lame, libfdk_aac, libvorbis, libopus, flac, pcm_s16le,
copy
```

```typescript
/**
 * Validates video/audio bitrate against upper bounds.
 */
export function validateBitrateLimits(opts: {
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
}): { valid: boolean; errors: string[] }
```

Limits: video max 50,000 kbps (50 Mbps), audio max 320 kbps. Values must be positive integers.

```typescript
/**
 * Validates output resolution does not exceed 4K (3840x2160).
 */
export function validateResolutionLimits(
  width: number,
  height: number
): { valid: boolean; errors: string[] }
```

Check that `width * height <= 3840 * 2160` and both dimensions are positive integers <= 7680 (safeguard against degenerate dimensions like 1x8294400).

```typescript
/**
 * Orchestrator function that runs all web-specific validations
 * on a MediaJobSpec. Calls validateJobSpec from section-01 first,
 * then applies the additional checks from this module.
 */
export function validateWebJobSpec(
  spec: MediaJobSpec,
  engineContext: "web_backend" | "desktop_sidecar" | "web_wasm"
): { valid: boolean; errors: string[] }
```

This function:
1. Calls `validateJobSpec(spec)` from section-01's `mediaJob.ts` for basic structural validation
2. Validates all asset URIs via `sanitizeUri()` for the given engine context
3. Validates `output.target` for path traversal (reject `..`, URL-encoded variants)
4. If `spec.params` contains codec/preset, validate against allowlist
5. If `spec.inputs.project` exists, validate resolution and bitrate limits from the timeline/params
6. Returns combined errors from all checks

### 8.2 Extend Rust `sanitize_path()` Extension Allowlist

**File**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs`

The current `sanitize_path()` function at line 26 only allows: `mp4 | mov | avi | mkv | mp3 | wav | aac`.

This must be extended to support the new job types introduced in sections 03 and 04:
- **Subtitle extraction**: `.srt`, `.vtt`
- **Thumbnail output**: `.jpg`, `.jpeg`, `.png`, `.webp`
- **Waveform output**: `.json`
- **Image inputs**: `.gif`, `.bmp`, `.tiff`

The change is a single line modification to the `matches!()` macro in `sanitize_path()`:

```rust
// Before:
if !matches!(ext_str.as_str(), "mp4" | "mov" | "avi" | "mkv" | "mp3" | "wav" | "aac") {

// After:
if !matches!(ext_str.as_str(),
    "mp4" | "mov" | "avi" | "mkv" | "webm" |
    "mp3" | "wav" | "aac" | "flac" | "ogg" |
    "srt" | "vtt" |
    "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" |
    "json"
) {
```

This is an additive change -- no existing allowed extensions are removed.

### 8.3 Desktop Sandbox Enforcement

This is enforced in the Tauri adapter layer (section-03's `job_dispatcher.rs`). The implementation guidance for section-03 should include:

Before executing any job, the dispatcher must validate that `output.target` resolves to a path within the Tauri app's workspace directory. Specifically:

```rust
fn validate_output_in_workspace(output_target: &str, workspace: &Path) -> Result<(), String> {
    let output_path = PathBuf::from(output_target);
    let canonical = output_path.canonicalize()
        .map_err(|_| "Output path does not exist or is not accessible")?;
    let workspace_canonical = workspace.canonicalize()
        .map_err(|_| "Workspace path is invalid")?;

    if !canonical.starts_with(&workspace_canonical) {
        return Err("Output path must be within the workspace directory".to_string());
    }
    Ok(())
}
```

For new files that do not yet exist (cannot be canonicalized), validate the parent directory is within the workspace.

Since section-08 does not own the `job_dispatcher.rs` file (that is section-03), document this requirement here so the section-03 implementer includes it. The TypeScript-side validation in `validateWebJobSpec()` handles path traversal detection independently as a defense-in-depth measure.

### 8.4 Python Worker Validation Module

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py`

This module provides the Python-side security validation for the Celery worker. It mirrors the TypeScript validation logic for consistency but uses Python conventions.

**Key functions and constants to implement:**

```python
"""
Security validation for media job worker.

Validates job specs for SSRF, path traversal, resource limits,
and input sanitization before any FFmpeg command is constructed.

These validators are called at the top of the Celery task
(from section-04's media_job_worker.py) before dispatching
to any job handler.
"""
import ipaddress
import re
from urllib.parse import urlparse, unquote

# Resource limit constants
FFMPEG_TIMEOUT_SECONDS: int = 1800  # 30 minutes (matches celery_app.py task_time_limit)
MAX_OUTPUT_FILE_BYTES: int = 10 * 1024 * 1024 * 1024  # 10 GB
MAX_CLIPS: int = 1000
MAX_DURATION_SECONDS: float = 3600.0  # 1 hour
MAX_RESOLUTION_PIXELS: int = 3840 * 2160  # 4K
MAX_VIDEO_BITRATE_KBPS: int = 50000
MAX_AUDIO_BITRATE_KBPS: int = 320

# Shell metacharacters that must not appear in URIs or paths
SHELL_METACHARACTERS = set(';|&`$(){}><')

# Allowed codecs (mirrors the TypeScript allowlist)
ALLOWED_CODECS = {
    "libx264", "libx265", "h264", "hevc",
    "h264_videotoolbox", "h264_mf", "h264_qsv", "h264_nvenc",
    "hevc_videotoolbox", "hevc_mf", "hevc_qsv", "hevc_nvenc",
    "aac", "mp3", "libmp3lame", "libfdk_aac", "libvorbis",
    "libopus", "flac", "pcm_s16le", "copy",
}


def validate_uri_no_ssrf(uri: str) -> str:
    """Validate that a URI does not target internal/private network addresses.

    Raises ValueError if the URI is SSRF-prone.
    Returns the URI unchanged if safe.
    """
    # Implementation: parse with urlparse, extract hostname,
    # check against private ranges using ipaddress module,
    # check for localhost, link-local, metadata endpoints.
    # Reject file:// scheme on web backend.
    ...


def validate_output_path(target: str, workspace_dir: str) -> str:
    """Validate output path is within workspace and has no traversal.

    Double-decodes URL encoding to catch %2e%2e attacks.
    Raises ValueError if unsafe.
    """
    ...


def validate_job_spec_security(spec_dict: dict) -> None:
    """Top-level validation entry point for the Celery worker.

    Called before dispatching to any job handler. Validates:
    1. All asset URIs for SSRF and injection
    2. Output target for path traversal
    3. Codec against allowlist (if specified in params)
    4. Resource limits (clip count, duration, resolution, bitrate)
    5. No shell metacharacters in any string values

    Raises ValueError with descriptive message on any failure.
    """
    ...
```

The `validate_uri_no_ssrf` function should use Python's `ipaddress` module for robust IP range checking:

```python
def _is_private_ip(hostname: str) -> bool:
    """Check if hostname is a private/internal IP address."""
    try:
        addr = ipaddress.ip_address(hostname)
        return (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
        )
    except ValueError:
        # Not an IP address (it's a hostname) -- cannot determine
        # without DNS lookup. Return False but note the DNS rebinding risk.
        return False
```

Note: Python's `ipaddress.is_private` covers 10.x, 172.16-31.x, 192.168.x, and loopback. `is_link_local` covers 169.254.x. This is more robust than manual range checking.

The `validate_output_path` function follows the pattern from the existing `PathValidator` in `/home/dev/projects/SmartSpecPro/python-backend/app/core/secure_validators.py`:

```python
def validate_output_path(target: str, workspace_dir: str) -> str:
    """Validate output path is safe."""
    # Double-decode to catch encoded traversal
    decoded = unquote(unquote(target))

    # Check for path traversal patterns
    if '..' in decoded:
        raise ValueError("Path traversal detected in output target")

    # Verify path resolves within workspace
    # (use os.path.realpath + os.path.commonpath)
    ...
```

### 8.5 Web Backend Resource Limits in Celery

The Python Celery worker already has global resource limits configured in `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`:
- `task_time_limit`: 1800 seconds (30 minutes)
- `task_soft_time_limit`: 1740 seconds (29 minutes)

The media job worker should additionally:

1. **Per-job FFmpeg timeout**: When spawning FFmpeg subprocess, use `subprocess.run(..., timeout=FFMPEG_TIMEOUT_SECONDS)` or `asyncio.wait_for()` with the same limit. This is a defense-in-depth measure beyond Celery's task_time_limit.

2. **Output file size monitoring**: After FFmpeg completes, check the output file size against `MAX_OUTPUT_FILE_BYTES`. If exceeded, delete the output and return an error. This prevents a malicious render spec from filling the disk.

3. **No user-supplied FFmpeg args**: The worker must never pass raw user strings to FFmpeg command lines. All values must be derived from the validated job spec and interpolated through parameterized construction (e.g., building args as a list, never using string interpolation with `f"ffmpeg {user_input}"`).

4. **Temporary file cleanup**: All temporary files created during job execution must be cleaned up in a `finally` block, even on error. Use Python's `tempfile.TemporaryDirectory()` context manager for automatic cleanup.

### 8.6 Node.js API Layer Security

The media job API routes (defined in section-04 at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`) must include:

1. **Auth**: All endpoints use `protectedProcedure` from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/trpc.ts`
2. **Rate limiting**: Job submission uses the existing `createRateLimitMiddleware` with a limit of 10 submissions per 15 minutes per IP
3. **Ownership enforcement**: Users can only view/cancel their own jobs. Admin can view all. This is enforced by filtering Redis keys by user ID.
4. **Concurrent job limit**: Maximum 3 concurrent jobs per user (configurable). Check before accepting new submissions.
5. **Input validation**: Call `validateWebJobSpec(spec, "web_backend")` before enqueuing to Celery. Return 400 with validation errors on failure.
6. **Audit logging**: Every submission logs a `media_request` event. Every completion or failure logs a `media_response` event. Use the traceId from the job spec's `telemetry.traceId` field (or generate one).

These requirements are documented here so the section-04 implementer integrates them. The validation function `validateWebJobSpec` is provided by this section's TypeScript module.

---

## Integration Points

### How Section-04 (Web Engine Adapter) Uses This Section

The Node.js router from section-04 imports and calls `validateWebJobSpec` at the API boundary:

```typescript
// In apps/web/server/routers/mediaJobs.ts (section-04)
import { validateWebJobSpec } from "@shared/types/mediaJobValidation";

// Inside the submit procedure:
const validation = validateWebJobSpec(input.spec, "web_backend");
if (!validation.valid) {
  throw new TRPCError({ code: "BAD_REQUEST", message: validation.errors.join("; ") });
}
```

The Python worker from section-04 imports and calls `validate_job_spec_security` at the task entry:

```python
# In python-backend/app/tasks/media_job_worker.py (section-04)
from app.core.media_job_validators import validate_job_spec_security

@celery_app.task(bind=True)
def execute_media_job(self, spec_json: str) -> dict:
    spec = json.loads(spec_json)
    validate_job_spec_security(spec)  # raises ValueError on failure
    # ... proceed with job handling
```

### How Section-03 (Desktop Adapter) Uses This Section

The Rust dispatcher from section-03 uses the extended `sanitize_path()` (which accepts the new file extensions) and calls `validate_output_in_workspace()` before executing any job.

---

## Checklist

1. Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/shared/types/__tests__/mediaJobValidation.test.ts` with all test stubs. Flesh out test bodies with concrete assertions.
2. Create the test file at `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_security.py` with all test stubs.
3. Run both test suites -- they should fail (no implementation yet).
4. Create `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJobValidation.ts` with `isInternalUri`, `sanitizeUri`, `validateCodecAllowlist`, `validateBitrateLimits`, `validateResolutionLimits`, and `validateWebJobSpec`.
5. Create `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py` with `validate_uri_no_ssrf`, `validate_output_path`, `validate_job_spec_security`, and resource limit constants.
6. Modify `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs` line 26 to extend the `sanitize_path()` file extension allowlist.
7. Run TypeScript tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test shared/types/__tests__/mediaJobValidation.test.ts`
8. Run Python tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_media_job_security.py -v`
9. Run full test suites to verify no regressions:
   - `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
   - `cd /home/dev/projects/SmartSpecPro/python-backend && pytest`

---

## Notes for Implementers

- The `isInternalUri` function is intentionally limited to hostname/IP-based checks. It does NOT perform DNS resolution, which means a hostname like `evil.com` that resolves to `127.0.0.1` would pass validation. This is a known limitation. Full SSRF protection requires DNS rebinding protection at the infrastructure level (e.g., using a DNS proxy that blocks private IP resolution). Document this in a code comment.

- The TypeScript validation module (`mediaJobValidation.ts`) is separate from the base validation in `mediaJob.ts` (section-01) by design. Section-01 provides structural/schema validation that applies everywhere. Section-08 provides context-aware security validation that depends on the engine target. This separation means desktop-only deployments do not pay the cost of web-specific checks.

- The Python `ipaddress` module's `is_private` property already covers RFC 1918 ranges. Do not manually enumerate IP ranges -- let the standard library handle it.

- The Rust `sanitize_path()` extension allowlist change is backward-compatible. No existing allowed extensions are removed. If a Rust test exists that explicitly tests the rejected extension set, it may need updating (add the new extensions to the "allowed" test cases, not the "rejected" ones).

- The `ALLOWED_CODECS` set must be kept in sync between the TypeScript module and the Python module. If a codec is added to one, it must be added to the other. Consider extracting this to a shared JSON file in the future, but for v0.1 duplicating the small set is acceptable.

- The per-user concurrent job limit of 3 is an API-layer concern (section-04), not a validation concern. This section defines the validation functions; the rate limiting and concurrency enforcement are wired in by the section-04 implementer using the existing `createRateLimitMiddleware` pattern.