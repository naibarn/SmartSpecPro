# Section 02 — Python render retry

## Ownership

Own `python-backend/app/tasks/presentation_render.py` and its focused test file.

## Work

- Add a constant for two per-slide retries.
- Factor or add a helper that creates a fresh page/token/request for each
  attempt in screenshot and record modes.
- Retry only transient navigation/readiness/media failures; preserve terminal
  HTTP and structural errors.
- Close failed pages before retry and successful pages after capture/recording.

## Acceptance

- A transient attempt can recover and capture exactly once.
- The retry limit is enforced.
- `E_SLIDE_MEDIA_DEGRADED` remains the final error after exhaustion.
- Existing token/header, progress, PNG, and video behavior remains intact.
