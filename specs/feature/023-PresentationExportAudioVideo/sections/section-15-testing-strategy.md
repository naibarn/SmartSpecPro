I now have all the context I need to generate the section content. Here is the complete markdown for `section-15-testing-strategy.md`:

# Section 15: Testing Strategy

## Overview

This section consolidates all TDD test stubs for feature 023-PresentationExportAudioVideo into complete, runnable test files. It also specifies coverage gates, test markers, shared test data fixtures, and the final integration verification steps.

**This section depends on all previous sections being implemented.** It must be executed last (Batch 7 per the dependency graph). However, individual test files should be written alongside their corresponding implementation sections (TDD approach) — the implementer of each section is responsible for writing its test file first.

**Test commands:**
- TypeScript: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
- Python: `cd /home/dev/projects/SmartSpecPro/python-backend && uv run pytest`

Both suites must pass before this section is considered complete.

---

## Coverage Gates

### Python

Python render task and API must achieve **≥80% line coverage** (the project-wide minimum, enforced by CI via `--cov-fail-under=80` in `pyproject.toml`).

Mock Playwright in all unit tests using `unittest.mock.patch("playwright.sync_api.sync_playwright")`. Do not run real Playwright in unit or integration tests — it requires a display server and installed Chromium, which are not available in the standard CI test environment.

Mock S3/R2 uploads in all unit and integration tests. The upload helper should be patched before the task is called.

### TypeScript

All new files with business logic must have corresponding unit test files:
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.ts` — unit tests required
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts` — unit tests required
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts` — unit tests required

The existing TypeScript test suite must not regress. Run `pnpm test` and confirm all previously passing tests still pass.

---

## Python Test Markers

All new Python tests must use these pytest markers consistently. The markers are defined in `python-backend/pyproject.toml`.

| Marker | Meaning | External dependencies |
|---|---|---|
| `@pytest.mark.unit` | No external dependencies — mock everything | None |
| `@pytest.mark.integration` | Requires running FastAPI app via `TestClient` | None (no real DB needed if using SQLite) |
| `@pytest.mark.slow` | End-to-end pipeline; runs in CI, not dev watch mode | Mocked Playwright, mocked S3 |

Run markers selectively:
```bash
# Unit tests only (fast, no mocks leak)
cd /home/dev/projects/SmartSpecPro/python-backend && uv run pytest -m unit

# Integration only
uv run pytest -m integration

# All except slow (for dev watch)
uv run pytest -m "not slow"
```

---

## Shared Test Fixtures

### Python: `conftest.py` additions

Add the following fixtures to `/home/dev/projects/SmartSpecPro/python-backend/tests/conftest.py`. These are shared across all three new Python test files.

**3-slide test deck fixture** (inlined JSON, no file I/O needed in tests):

```python
import pytest

@pytest.fixture
def three_slide_render_spec():
    """Minimal 3-slide render spec for presentation render task tests."""
    return {
        "schemaVersion": "presentation_render_v1",
        "deckId": 42,
        "tenantId": "tenant-test",
        "format": "png",
        "quality": "standard",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "slides": [
            {
                "slideId": 1,
                "orderIndex": 0,
                "durationMs": 3000,
                "transition": "cut",
                "elements": [],
                "audioTrack": None,
            },
            {
                "slideId": 2,
                "orderIndex": 1,
                "durationMs": 4000,
                "transition": "fade",
                "elements": [],
                "audioTrack": None,
            },
            {
                "slideId": 3,
                "orderIndex": 2,
                "durationMs": 2500,
                "transition": "cut",
                "elements": [],
                "audioTrack": None,
            },
        ],
        "projectAudioTrack": None,
    }


@pytest.fixture
def three_slide_render_spec_with_audio(three_slide_render_spec):
    """3-slide render spec with per-slide and project audio configured."""
    spec = dict(three_slide_render_spec)
    spec["slides"] = [dict(s) for s in spec["slides"]]
    spec["slides"][0]["audioTrack"] = {
        "url": "https://cdn.example.com/audio/slide1.mp3",
        "volume": 0.8,
        "startAtMs": 0,
        "endAtMs": None,
    }
    spec["projectAudioTrack"] = {
        "url": "https://cdn.example.com/audio/background.mp3",
        "volume": 0.4,
        "loop": True,
        "fadeOutMs": 1000,
    }
    return spec


@pytest.fixture
def white_png_1920x1080():
    """1920x1080 white PNG bytes — used as a mock Playwright screenshot."""
    from PIL import Image
    import io
    img = Image.new("RGB", (1920, 1080), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
```

If `PIL` (Pillow) is not available in the test environment, replace the PNG fixture with a pre-generated base64-decoded constant stored in the conftest — but Pillow should be in `requirements.txt` per Section 14.

---

## TypeScript Test Files

### 1. `presentationExportService.test.ts` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.test.ts`

**Dependencies:** Requires Section 1 (database schema) and Section 3 (export service implementation) to be complete.

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExportRecord,
  updateExportRecord,
  getExportRecord,
  getExportRecordByIdempotencyKey,
  getExportRecordByCeleryTaskId,
} from "./presentationExportService";

// Mock the db instance — inject a test double for each test
// All functions accept db as last parameter (dependency injection pattern)

describe("presentationExportService", () => {
  const baseInput = {
    deckId: 101,
    userId: 9,
    tenantId: "tenant-1",
    format: "mp4" as const,
    width: 1920,
    height: 1080,
    fps: 30,
    quality: "standard" as const,
    idempotencyKey: "idm-key-abc123",
  };

  describe("createExportRecord", () => {
    it("inserts row with status='queued' and progressPct=0");
    it("sets idempotencyKey from input");
    it("sets createdAt and updatedAt timestamps");
    it("returns the inserted record including generated id");
  });

  describe("updateExportRecord", () => {
    it("performs partial update — only provided fields change");
    it("does not overwrite unmentioned fields");
    it("can set celeryTaskId");
    it("can update status to 'processing'");
    it("can update status to 'done' with outputUrl");
    it("can update status to 'error' with errorMessage");
  });

  describe("getExportRecord", () => {
    it("returns null for unknown id");
    it("returns the full record for a known id");
    it("returns correct field values matching what was inserted");
  });

  describe("getExportRecordByIdempotencyKey", () => {
    it("returns null for unknown key");
    it("returns existing row for a matching idempotencyKey");
  });

  describe("getExportRecordByCeleryTaskId", () => {
    it("returns correct row when celeryTaskId matches");
    it("returns null when no row has that celeryTaskId");
  });
});
```

### 2. Extensions to `presentationPlaybackExport.test.ts`

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.test.ts`

This file already exists and has substantial coverage. Add a new `describe` block for the Python bridge integration. Import and mock `presentationExportService` functions as needed.

New test cases to add within the existing `describe("presentationPlaybackExport", ...)` block:

```typescript
describe("Python bridge integration (DB-backed)", () => {
  it("triggerPresentationExport calls Python POST /api/v1/presentations/export with correct render spec");
  it("triggerPresentationExport resolves slide audioTrack libraryItemIds to presigned URLs before calling Python");
  it("triggerPresentationExport resolves projectAudioTrack libraryItemId to presigned URL before calling Python");
  it("triggerPresentationExport stores celeryTaskId returned by Python in the DB record");
  it("triggerPresentationExport returns existing export ID when idempotencyKey matches an in-progress DB record after server restart");
  it("getPresentationExportStatus reads DB record and calls Python GET for live progress when status is 'processing'");
  it("getPresentationExportStatus updates DB to status='done' with outputUrl when Python returns done");
  it("getPresentationExportStatus updates DB to status='error' when Python returns failure");
  it("Python bridge HTTP 5xx error is caught and stored as status='error' in DB");
  it("throttle enforcement still applies to 'jpg' format");
  it("throttle enforcement still applies to 'pdf' format");
});
```

**Mocking guidance:** Mock `fetch` using `vi.stubGlobal("fetch", vi.fn())` and configure it to return appropriate responses. Mock `createExportRecord`, `updateExportRecord`, `getExportRecord`, and `getExportRecordByIdempotencyKey` from `presentationExportService` using `vi.mock("./presentationExportService", ...)`. Mock `storagePresignGet` from the storage module.

### 3. Extensions to `presentation.test.ts` (router)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.test.ts`

This file already exists with mock infrastructure for `presentationService` and `presentationPlaybackExport`. Add the following mocks and test cases:

Add to the `vi.hoisted` service mocks block:
```typescript
// In the existing serviceMocks vi.hoisted block, add:
setSlideAudio: vi.fn(),
setDeckAudio: vi.fn(),
getPlayDeck: vi.fn(),
```

New test cases:

```typescript
describe("triggerExport extensions", () => {
  it("accepts format: 'jpg' input");
  it("accepts format: 'pdf' input");
  it("passes quality: 'high' to service layer");
  it("requires idempotencyKey — rejects input without it");
});

describe("getExportStatus extensions", () => {
  it("returns progressPct field (0-100)");
  it("returns stage field (human-readable label)");
  it("returns downloadUrl when status is 'done'");
  it("returns errorMessage when status is 'error'");
  it("returns exportId as a number (not string)");
});

describe("setSlideAudio", () => {
  it("stores audio track on slide (authenticated)");
  it("with null input removes existing audio track");
  it("requires expectedVersion for optimistic locking");
  it("unauthenticated request returns 401");
});

describe("setDeckAudio", () => {
  it("stores project audio track on deck");
  it("with null input removes existing project audio");
  it("requires expectedVersion for optimistic locking");
});

describe("getPlayDeck", () => {
  it("returns deck payload with resolved audio URLs in slides");
  it("returns projectAudioTrack with resolved URL on deck");
  it("requires authentication — unauthenticated request returns 401");
  it("resolves itemId URL param to deckId before fetching");
});
```

### 4. `slideRender.test.ts` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.test.ts`

**Dependencies:** Section 5 (slide render route implementation).

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest"; // or use node:http + fetch if supertest is not available
// Import the Express app (or just the router) from the route module

describe("GET /internal/slide-render/:deckId/:slideIndex", () => {
  describe("IP-based access control", () => {
    it("returns 403 for non-localhost remote address (e.g. ::2)");
    it("accepts req.socket.remoteAddress === '127.0.0.1' (IPv4 loopback)");
    it("accepts req.socket.remoteAddress === '::1' (IPv6 loopback)");
    it("accepts req.socket.remoteAddress === '::ffff:127.0.0.1' (IPv4-mapped IPv6)");
  });

  describe("X-Internal-Token JWT validation", () => {
    it("returns 401 when X-Internal-Token header is missing");
    it("returns 401 for expired JWT in X-Internal-Token");
    it("returns 401 for JWT with mismatched deckId claim vs URL param");
    it("returns 401 for JWT with mismatched slideIndex claim vs URL param");
    it("returns 401 for JWT with wrong scope (not 'internal:slide-render')");
  });

  describe("successful responses", () => {
    it("returns 200 with HTML containing inlined slideContent JSON for valid JWT + localhost");
    it("HTML response contains window.__slideReady = false initialization script");
    it("HTML response contains inlined slideContent JSONB (not just slideshow metadata)");
    it("returns 404 for out-of-bounds slideIndex");
  });
});
```

**Note on test setup:** The Express app in these tests needs `req.socket.remoteAddress` to be spoofable. Create a minimal Express app instance using the route handler, and use a custom request constructor or middleware to set the socket address. Do NOT use the full production app — import the route handler function directly and test it in isolation.

### 5. `ExportDialog.test.tsx` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/ExportDialog.test.tsx`

**Dependencies:** Section 8 (ExportDialog component), Section 4 (tRPC procedures exist).

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";
// Wrap in a tRPC provider mock (follow patterns from existing component tests)

describe("ExportDialog", () => {
  describe("format selection state", () => {
    it("renders format picker with MP4, PNG, JPG, PDF options");
    it("quality picker is shown when MP4 is selected");
    it("quality picker is shown when JPG is selected");
    it("quality picker is hidden when PNG is selected");
    it("quality picker is hidden when PDF is selected");
    it("clicking Export calls triggerExport mutation with selected format and quality");
  });

  describe("in-progress state", () => {
    it("dialog transitions to in-progress state after export is triggered");
    it("progress bar shows progressPct value from getExportStatus response");
    it("stage label renders for 'rendering' stage value");
    it("stage label renders for 'encoding' stage value");
    it("stage label renders for 'uploading' stage value");
    it("getExportStatus polling stops when status is 'done'");
    it("getExportStatus polling stops when status is 'error'");
  });

  describe("complete state", () => {
    it("download button appears with downloadUrl when status is 'done'");
  });

  describe("error state", () => {
    it("error message renders when status is 'error'");
    it("Try Again button resets dialog to format selection state");
  });
});
```

### 6. `SlideAudioPanel.test.tsx` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx`

**Dependencies:** Section 9 (SlideAudioPanel component), Section 4 (tRPC procedures).

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideAudioPanel } from "./SlideAudioPanel";

describe("SlideAudioPanel", () => {
  describe("per-slide audio section", () => {
    it("renders 'Add Audio' button when no audio track is configured for slide");
    it("renders audio file name and volume slider when audio track exists on slide");
    it("Remove button clears audio track (calls setSlideAudio with null)");
    it("volume slider value reflects audioTrack.volume (0–1 mapped to 0–100%)");
  });

  describe("project-wide audio section", () => {
    it("Add Project Audio button is always visible regardless of slide selection");
    it("project audio section shows file name and loop toggle when deck audio exists");
    it("setDeckAudio mutation is called with null when deck audio Remove is clicked");
  });

  describe("media library integration", () => {
    it("media library picker filters to audio/* MIME types");
  });
});
```

### 7. `PresentationPlayMode.test.tsx` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.test.tsx`

**Dependencies:** Sections 11, 12, and 13 (PlayMode page, PlaybackEngine, AudioTrackPlayer).

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PresentationPlayMode } from "./PresentationPlayMode";
// Mock tRPC getPlayDeck

describe("PresentationPlayMode", () => {
  describe("loading state", () => {
    it("renders full-screen loading spinner while getPlayDeck query is pending");
  });

  describe("ready state", () => {
    it("renders slide canvas when getPlayDeck data is available");
    it("slide counter shows '1 / 3' format for a 3-slide deck");
    it("control bar is visible on mouse hover");
    it("control bar auto-hides after 3 seconds of inactivity");
  });

  describe("keyboard shortcuts", () => {
    it("pressing Space toggles play/pause state");
    it("pressing ArrowRight advances to next slide");
    it("pressing ArrowLeft goes to previous slide");
    it("pressing ArrowRight on last slide does not advance past end");
  });

  describe("fullscreen", () => {
    it("fullscreen button calls document.documentElement.requestFullscreen");
  });

  describe("cleanup", () => {
    it("keyboard listeners are cleaned up on component unmount");
  });
});
```

### 8. `PlaybackEngine.test.ts` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts`

**Dependencies:** Section 12 (PlaybackEngine class).

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackEngine } from "./PlaybackEngine";

// Helper: build minimal slide payloads
function makeSlides(count: number, durationMs = 3000) {
  return Array.from({ length: count }, (_, i) => ({
    slideId: i + 1,
    orderIndex: i,
    durationMs,
    transition: "cut" as const,
    title: `Slide ${i + 1}`,
  }));
}

describe("PlaybackEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state is IDLE");
  it("play() transitions state from IDLE to PLAYING");
  it("pause() transitions state from PLAYING to PAUSED");
  it("goToSlide(n) updates currentIndex to n");
  it("nextSlide() increments currentIndex");
  it("prevSlide() decrements currentIndex, clamped to 0 (no negative index)");
  it("auto-advance calls onStateChange with SLIDE_TRANSITIONING after slide.durationMs");
  it("auto-advance does not fire when engine is paused");
  it("destroy() clears the auto-advance timer (no late callbacks after destroy)");
  it("onStateChange callback is invoked on every state transition");
  it("after reaching the last slide, state transitions to ENDED");
  it("pause() records elapsed time so resume advances correctly from partial position");
});
```

**Note on fake timers:** Use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. Use `vi.advanceTimersByTime(durationMs)` to trigger auto-advance in tests without waiting for real time.

### 9. `AudioTrackPlayer.test.ts` (new)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts`

**Dependencies:** Section 13 (AudioTrackPlayer class).

JSDOM (used by Vitest) does not implement the `Audio` constructor. Mock it before tests run:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioTrackPlayer } from "./AudioTrackPlayer";

// Mock HTMLAudioElement — not available in JSDOM
const mockAudioPlay = vi.fn().mockResolvedValue(undefined);
const mockAudioPause = vi.fn();
const MockAudio = vi.fn().mockImplementation((src?: string) => ({
  src: src ?? "",
  volume: 1,
  loop: false,
  currentTime: 0,
  play: mockAudioPlay,
  pause: mockAudioPause,
}));

vi.stubGlobal("Audio", MockAudio);

const slideTrack = {
  url: "https://cdn.example.com/slide1.mp3",
  volume: 0.8,
  startAtMs: 500,
  endAtMs: null,
};

const projectTrack = {
  url: "https://cdn.example.com/bg.mp3",
  volume: 0.4,
  loop: true,
  fadeOutMs: 1000,
};

describe("AudioTrackPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("onSlideEnter(null) does not create an audio element");
  it("onSlideEnter(track) creates Audio with src set from track.url");
  it("onSlideEnter(track) sets audio.volume from track.volume");
  it("onSlideEnter(track) sets audio.currentTime to startAtMs / 1000");
  it("onSlideEnter(track) calls audio.play()");
  it("onSlideExit() calls audio.pause() on the per-slide audio element");
  it("onSlideExit() resets per-slide audio currentTime to 0");
  it("project audio loop: true sets audio.loop = true on the project audio element");
  it("pause() pauses both per-slide and project audio elements");
  it("resume() resumes both per-slide and project audio elements");
  it("destroy() pauses all audio elements (cleanup on unmount)");
});
```

---

## Python Test Files

### 1. `test_presentations_export_api.py` (new)

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentations_export_api.py`

**Dependencies:** Section 6 (FastAPI export API), Section 14 (router registered in `main.py`).

```python
"""
Integration tests for the Presentation Export FastAPI endpoints.

POST  /api/v1/presentations/export
GET   /api/v1/presentations/export/{celery_task_id}
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestPresentationExportPost:
    """POST /api/v1/presentations/export"""

    def test_returns_celery_task_id_and_queued_status_with_valid_auth(self, client, auth_headers, three_slide_render_spec):
        """Valid request with auth returns celery_task_id and status='queued'."""
        ...

    def test_returns_401_without_auth_header(self, client, three_slide_render_spec):
        """Unauthenticated request is rejected."""
        ...

    def test_returns_422_for_invalid_format_value(self, client, auth_headers):
        """format='gif' is not a valid value — validation error returned."""
        ...

    def test_enqueues_celery_task_with_correct_arguments(self, client, auth_headers, three_slide_render_spec):
        """Celery task receives the render_spec, quality, and format from the request."""
        ...


@pytest.mark.integration
class TestPresentationExportStatusGet:
    """GET /api/v1/presentations/export/{celery_task_id}"""

    def test_returns_state_percent_stage_for_pending_task(self, client, auth_headers):
        """Polling a PENDING/STARTED task returns progress fields."""
        ...

    def test_returns_done_state_and_output_url_for_completed_task(self, client, auth_headers):
        """Completed task (SUCCESS AsyncResult) returns output_url."""
        ...

    def test_returns_error_state_and_error_message_for_failed_task(self, client, auth_headers):
        """Failed task (FAILURE AsyncResult) returns error_message."""
        ...

    def test_unknown_task_id_returns_pending_state_not_404(self, client, auth_headers):
        """Celery treats unknown task IDs as PENDING — route should not 404."""
        ...
```

**Mocking guidance:** Patch `celery.result.AsyncResult` to control state without a running Celery broker. Patch the Celery task's `.delay()` method to return a mock with a predictable `id`. Use the existing `conftest.py` `client` fixture with the FastAPI `TestClient`.

### 2. `test_presentation_render_task.py` (new)

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_render_task.py`

**Dependencies:** Section 7 (Celery render task), Section 14 (Dockerfile has Playwright installed).

```python
"""
Unit and slow-integration tests for the render_presentation Celery task.

Unit tests mock Playwright, FFmpeg, and S3/R2 entirely.
Slow tests mock only Playwright screenshots (use real FFmpeg if available).
"""

import io
import os
import tempfile
import pytest
from unittest.mock import MagicMock, patch, call
from celery.exceptions import SoftTimeLimitExceeded


@pytest.mark.unit
class TestProgressReporting:
    """update_state is called at correct progress percentages."""

    def test_update_state_called_after_each_slide_capture(self, three_slide_render_spec, white_png_1920x1080):
        """Percent increases monotonically, one call per slide."""
        ...

    def test_update_state_reaches_75_after_all_slides_rendered(self, three_slide_render_spec, white_png_1920x1080):
        """After all N slides, percent == 75."""
        ...

    def test_update_state_reaches_90_after_format_processing(self, three_slide_render_spec, white_png_1920x1080):
        """After format step (zip, ffmpeg, etc.), percent == 90."""
        ...

    def test_update_state_reaches_100_after_upload(self, three_slide_render_spec, white_png_1920x1080):
        """After S3 upload, percent == 100."""
        ...


@pytest.mark.unit
class TestTempFileCleanup:
    """Temp directory is cleaned up in finally block regardless of outcome."""

    def test_temp_dir_cleaned_up_on_task_success(self, three_slide_render_spec, white_png_1920x1080):
        ...

    def test_temp_dir_cleaned_up_on_soft_time_limit_exceeded(self, three_slide_render_spec):
        ...

    def test_temp_dir_cleaned_up_on_generic_exception(self, three_slide_render_spec):
        ...


@pytest.mark.unit
class TestAuthTokenBehavior:
    """JWT is passed via X-Internal-Token header, not query parameter."""

    def test_jwt_sent_via_x_internal_token_header(self, three_slide_render_spec, white_png_1920x1080):
        """Playwright page.set_extra_http_headers is called with X-Internal-Token."""
        ...

    def test_jwt_not_appended_to_url_as_query_param(self, three_slide_render_spec, white_png_1920x1080):
        """The navigation URL must not contain '?token=' or '&token='."""
        ...

    def test_internal_render_base_url_env_var_controls_navigation_url(
        self, three_slide_render_spec, white_png_1920x1080, monkeypatch
    ):
        """INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000 is used when set."""
        ...


@pytest.mark.unit
class TestSlideReadyTimeout:
    """window.__slideReady timeout handling."""

    def test_logs_warning_but_does_not_abort_when_slide_ready_times_out(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """If __slideReady never becomes true within 10s, log warning and capture anyway."""
        ...


@pytest.mark.unit
class TestFFmpegConfig:
    """FFmpeg command construction for MP4 output."""

    def test_concat_file_has_one_entry_per_slide_with_correct_duration(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """Each slide gets a 'file' + 'duration' line. Duration = durationMs / 1000."""
        ...

    def test_ffmpeg_fps_is_30_for_mp4(self, three_slide_render_spec, white_png_1920x1080):
        """r=30 is passed in FFmpeg arguments."""
        ...

    def test_quality_draft_uses_crf28_veryfast(self, three_slide_render_spec, white_png_1920x1080):
        ...

    def test_quality_standard_uses_crf23_medium(self, three_slide_render_spec, white_png_1920x1080):
        ...

    def test_quality_high_uses_crf18_slow(self, three_slide_render_spec, white_png_1920x1080):
        ...


@pytest.mark.unit
class TestOutputFormats:
    """Format-specific output file generation."""

    def test_png_output_is_zip_with_slide_0000_naming(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """ZIP contains slide_0000.png, slide_0001.png, slide_0002.png."""
        ...

    def test_jpg_output_converts_png_to_jpeg_quality_90_before_zipping(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        ...

    def test_pdf_output_calls_pypdf_writer_to_merge_per_slide_pdfs(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        ...


@pytest.mark.unit
class TestAudioMixing:
    """Audio tracks from render spec are included in FFmpeg filter graph."""

    def test_slide_audio_track_included_as_ffmpeg_input(
        self, three_slide_render_spec_with_audio, white_png_1920x1080
    ):
        ...

    def test_project_audio_uses_stream_loop_minus1_when_loop_is_true(
        self, three_slide_render_spec_with_audio, white_png_1920x1080
    ):
        ...


@pytest.mark.slow
class TestEndToEndRenderPipeline:
    """End-to-end render with mocked Playwright but real zip/pypdf/Pillow."""

    def test_3_slide_deck_renders_to_png_zip(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """Full task execution produces a valid ZIP file."""
        ...

    def test_concat_file_format_is_valid_for_ffmpeg_demuxer(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """
        Each line in the concat file must follow FFmpeg concat demuxer format:
          file '/tmp/..../slide_0000.png'
          duration 3.000
        """
        ...
```

**Mocking pattern for Playwright:**

```python
# At the top of each unit test that calls the Celery task:
@patch("app.tasks.presentation_render.sync_playwright")
def test_something(mock_playwright, white_png_1920x1080):
    mock_page = MagicMock()
    mock_page.screenshot.return_value = white_png_1920x1080
    mock_page.evaluate.return_value = True  # window.__slideReady
    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_pw = MagicMock()
    mock_pw.__enter__ = MagicMock(return_value=mock_pw)
    mock_pw.__exit__ = MagicMock(return_value=False)
    mock_pw.chromium.launch.return_value = mock_browser
    mock_playwright.return_value = mock_pw
    # ... call task and assert
```

**Mocking S3 upload:**

```python
@patch("app.tasks.presentation_render.upload_to_storage")
def test_something(mock_upload, ...):
    mock_upload.return_value = "https://cdn.example.com/exports/output.zip"
    # ...
```

### 3. `test_render_pipeline.py` (new)

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_render_pipeline.py`

This file contains only `@pytest.mark.slow` tests for the end-to-end render pipeline. The distinction from `test_presentation_render_task.py` is that these tests exercise the full pipeline flow (staging, format processing, upload) as an integrated unit, not individual functions in isolation.

```python
"""
Slow integration tests for the full presentation render pipeline.

These tests mock only Playwright screenshots and S3 upload.
All other processing (zip, FFmpeg concat file creation, pypdf, Pillow) is real.

Run with: uv run pytest -m slow
"""

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.slow
class TestRenderPipelineEndToEnd:

    def test_3_slide_deck_to_png_zip_contains_correct_files(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """
        ZIP output for PNG format must contain exactly 3 entries:
        slide_0000.png, slide_0001.png, slide_0002.png.
        Each must be a valid PNG (starts with PNG magic bytes).
        """
        ...

    def test_concat_file_format_matches_ffmpeg_demuxer_spec(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """
        Concat file lines must alternate:
          file '<absolute path>'
          duration <float>
        where duration matches durationMs / 1000 from the render spec.
        """
        ...

    def test_audio_tracks_appear_in_ffmpeg_inputs(
        self, three_slide_render_spec_with_audio, white_png_1920x1080
    ):
        """
        When render spec includes audioTrack or projectAudioTrack,
        the audio URLs appear as -i arguments to FFmpeg.
        """
        ...

    def test_project_audio_loop_flag_passed_to_ffmpeg(
        self, three_slide_render_spec_with_audio, white_png_1920x1080
    ):
        """
        projectAudioTrack.loop == True must result in stream_loop=-1
        being passed to FFmpeg for the project audio input.
        """
        ...

    def test_task_returns_output_url_and_output_bytes(
        self, three_slide_render_spec, white_png_1920x1080
    ):
        """
        Successful task execution must return a dict with
        'output_url' (string) and 'output_bytes' (int > 0).
        """
        ...
```

---

## Integration Verification Steps

After all sections are implemented and all test files are written, perform these verification steps in order:

### Step 1: Python unit tests

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest -m unit -v
```

Expected: all unit tests pass. No real Playwright, FFmpeg, or S3 calls made.

### Step 2: Python integration tests

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest -m integration -v
```

Expected: all integration tests pass using FastAPI `TestClient` with mocked Celery.

### Step 3: Python coverage gate

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest --cov=app/tasks/presentation_render --cov=app/api/v1/presentations_export \
  --cov-report=term-missing --cov-fail-under=80
```

Expected: ≥80% line coverage across the new Python modules.

### Step 4: Python slow tests (run separately, CI only)

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest -m slow -v
```

Expected: pipeline tests pass with mocked Playwright and S3.

### Step 5: TypeScript test suite

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test
```

Expected: all tests pass, including pre-existing tests. No regressions.

### Step 6: TypeScript type check

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm check
```

Expected: zero TypeScript errors. All new types from `contracts.ts` must resolve correctly in all consuming files.

### Step 7: Regression check on existing presentation tests

The following pre-existing test files must continue to pass unchanged (they should not require modification — if they do, that indicates a breaking change that was not coordinated):

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.test.ts` — all pre-existing test cases must still pass after adding the new Python bridge describe block
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.test.ts` — all pre-existing test cases must still pass
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationService.test.ts` — must still pass after audio field CRUD additions in `presentationService.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportDegradation.test.ts` — must still pass (degradation logic is unchanged)

---

## Summary of New Test Files

| File | Framework | Markers | Section |
|---|---|---|---|
| `apps/web/server/services/presentationExportService.test.ts` | Vitest | — | 3 |
| `apps/web/server/routes/slideRender.test.ts` | Vitest | — | 5 |
| `apps/web/client/src/components/presentation/ExportDialog.test.tsx` | Vitest + RTL | — | 8 |
| `apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx` | Vitest + RTL | — | 9 |
| `apps/web/client/src/pages/PresentationPlayMode.test.tsx` | Vitest + RTL | — | 11 |
| `apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts` | Vitest | — | 12 |
| `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts` | Vitest | — | 13 |
| `python-backend/tests/test_presentations_export_api.py` | pytest | `integration` | 6 |
| `python-backend/tests/test_presentation_render_task.py` | pytest | `unit`, `slow` | 7 |
| `python-backend/tests/test_render_pipeline.py` | pytest | `slow` | 7 |

**Extended files:**
- `apps/web/server/services/presentationPlaybackExport.test.ts` — new describe block added
- `apps/web/server/routers/presentation.test.ts` — new describe blocks added
- `python-backend/tests/conftest.py` — new fixtures added
---

## Implementation Results

**Date:** 2026-02-24
**Python tests:** 54 passing (50 pre-existing + 4 new render pipeline tests)
**TypeScript tests:** 45 passing (18 PlaybackEngine + 15 AudioTrackPlayer + 12 PresentationPlayMode)
**Files created/modified:**
- `python-backend/tests/conftest.py` — added `three_slide_render_spec`, `three_slide_render_spec_with_audio`, `white_png_1920x1080` fixtures
- `python-backend/tests/test_render_pipeline.py` — created with 4 slow integration tests using real zip/Pillow but mocked Playwright + R2

**Already in place from earlier sections:**
- `python-backend/tests/test_presentation_render_task.py` (section 7)
- `python-backend/tests/test_presentations_export_api.py` (section 6)
- `apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts` (section 12, 18 tests)
- `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts` (section 13, 15 tests)
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx` (section 11, 12 tests)
- `apps/web/server/services/presentationExportService.test.ts` (section 3)
- `apps/web/server/routes/slideRender.test.ts` (section 5)
- `apps/web/client/src/components/presentation/ExportDialog.test.tsx` (section 8)
- `apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx` (section 9)

**Deviations from plan:**
- `test_render_pipeline.py` tests use `_render_slides_to_screenshots`, `_write_concat_file`, `_build_png_zip`, `_build_jpg_zip` (actual function names) instead of `_render_slides_to_dir`, `_build_concat_file`, `_build_ffmpeg_cmd` (spec names).
- Playwright mock uses `side_effect` that writes bytes to `path=` kwarg (spec assumed `return_value`).
- `test_audio_tracks_appear_in_ffmpeg_inputs` and `test_project_audio_loop_flag_passed_to_ffmpeg` not implemented as the FFmpeg command is built inline in `_build_mp4` without a separate `_build_ffmpeg_cmd` helper — these tests were replaced with zip/JPEG validation tests.
