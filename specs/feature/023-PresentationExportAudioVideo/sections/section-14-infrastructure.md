I now have all the context needed to write the section. Let me produce the complete, self-contained implementation section.

# Section 14: Infrastructure — Dockerfile and Environment

## Overview

This section prepares the container and runtime environment that the Python presentation export Celery worker requires. It must be completed **before** implementing Section 6 (Python FastAPI Export API) and Section 7 (Python Celery Render Task), because the worker image must have Playwright and Chromium installed before any presentation render code can even be imported.

**Implementation order context:** This section is in Batch 3 (parallel with section-03-export-service and section-05-slide-render-route). All three can proceed simultaneously after sections 01 and 02 are complete.

**Files to create or modify:**

- `docker/Dockerfile.video-job-runner` — add Playwright, PyJWT, pypdf, Pillow
- `python-backend/requirements.txt` — verify pypdf and Pillow are listed
- `python-backend/app/core/celery_app.py` — add `presentation_export` queue and task route
- `nginx/conf.d/dev-host.conf` — add `/internal/` deny block to HTTP and HTTPS server blocks

---

## Tests First

This section uses a manual verification checklist rather than automated tests. Infrastructure changes cannot be meaningfully unit-tested but must be verified before proceeding to dependent sections.

From `claude-plan-tdd.md`, Section 14 verification checklist:

```
Manual verification checklist (run inside the built container):

- Verify: docker build -f docker/Dockerfile.video-job-runner . succeeds without errors
- Verify: playwright install chromium --with-deps completes in the container
- Verify: python -c "import playwright; print('ok')" runs successfully in container
- Verify: python -c "import PyJWT; print('ok')" runs successfully in container
- Verify: python -c "import pypdf; print('ok')" runs successfully in container
- Verify: python -c "from PIL import Image; print('ok')" runs successfully in container
- Verify: Nginx /internal/ deny block returns 403 for a curl request from outside localhost
- Verify: INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000 is set in worker environment
```

Run these checks immediately after the Dockerfile build before proceeding to Section 6 or Section 7.

**Quick verification commands:**

```bash
# Build the image
docker build -f docker/Dockerfile.video-job-runner -t smartspec-video-job-runner:local .

# Verify all Python imports
docker run --rm smartspec-video-job-runner:local \
  python -c "import playwright; import jwt; import pypdf; from PIL import Image; print('all ok')"

# Verify Nginx /internal/ deny (from outside the container)
curl -v https://smartaihub.app/internal/slide-render/1/0
# Expected: 403 Forbidden

# Verify env var is available to worker
docker run --rm -e INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000 \
  smartspec-video-job-runner:local \
  python -c "import os; print(os.environ.get('INTERNAL_RENDER_BASE_URL'))"
# Expected: http://host.docker.internal:3000
```

---

## 14.1 Dockerfile Changes

**File:** `/home/dev/projects/SmartSpecPro/docker/Dockerfile.video-job-runner`

The existing Dockerfile is a two-stage build (`builder` + final `python:3.11-slim` image). It already installs FFmpeg and font packages in the final stage. The change adds Playwright (with its Chromium browser), PyJWT, pypdf, and Pillow.

**Insert the following two `RUN` instructions** after the existing FFmpeg installation block (after the `fc-cache -fv` line and before the `useradd` line):

```dockerfile
# Install Playwright and PDF/image processing libraries for presentation export
RUN pip install playwright PyJWT pypdf Pillow

# Install Chromium browser and all required system dependencies for headless rendering
RUN playwright install chromium --with-deps
```

**Why `--with-deps`:** The `--with-deps` flag installs the full set of Chromium's system library dependencies (libglib2.0, libnss3, libatk, libcups, libdrm, libxcomposite, etc.) that are required for headless browser operation inside a minimal Debian/slim container. Without this flag, Chromium will fail to launch with missing shared library errors.

**Why these must run as root (before `USER appuser`):** System library installation via `apt-get` (triggered by `--with-deps`) and browser binary installation must run as root. Both lines must be placed before the `USER appuser` instruction.

**Full diff context** — the relevant section of the file after editing:

```dockerfile
# Install runtime dependencies including FFmpeg and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    tini \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Install Playwright and PDF/image processing libraries for presentation export
RUN pip install playwright PyJWT pypdf Pillow

# Install Chromium browser and all required system dependencies for headless rendering
RUN playwright install chromium --with-deps

# Create non-root user
RUN useradd -m -u 1001 appuser
```

**Note on PyJWT:** `PyJWT==2.8.0` is already in `python-backend/requirements.txt` (line 91). The explicit `pip install PyJWT` in the Dockerfile ensures it is available in the final image regardless of whether the builder stage's `--user` install path is fully copied. Verify it is present in `requirements.txt` — no version pin change is needed.

---

## 14.2 Python requirements.txt Updates

**File:** `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`

Verify the following packages are present (add them if missing — they are needed both inside Docker and in the local test environment outside Docker):

```
PyJWT==2.8.0         # Already present at line 91 — no change needed
playwright>=1.40.0   # ADD if missing — headless browser for slide screenshots
pypdf>=3.0.0         # ADD if missing — PDF merging for PDF export format
Pillow>=10.0.0       # ADD if missing — JPEG conversion and image processing
```

Check current state of `requirements.txt` and add any missing entries. Place them in the `# Utilities` section or at the end of the file, grouped logically:

```
# Presentation Export (Section 14)
playwright>=1.40.0
pypdf>=3.0.0
Pillow>=10.0.0
```

`PyJWT` is already present so no duplicate is needed.

**Important:** After updating `requirements.txt`, run `pip install -r requirements.txt` in the local Python environment to ensure tests (pytest) can import these packages without Docker. The render task unit tests mock Playwright, but `pypdf` and `Pillow` will be directly imported.

---

## 14.3 Celery Queue Registration

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

The existing `celery_app.py` defines three queues: `celery`, `video`, and `media`. The presentation export task needs its own dedicated queue with limited concurrency (to prevent OOM from multiple simultaneous Playwright instances).

**Change 1: Add to `REQUIRED_QUEUES` list**

```python
# Before:
REQUIRED_QUEUES = ["celery", "video", "media"]

# After:
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export"]
```

**Change 2: Add to `task_queues` in `celery_app.conf.update(...)`**

```python
task_queues=[
    Queue("celery"),
    Queue("video"),
    Queue("media"),
    Queue("presentation_export"),  # ADD: dedicated queue for Playwright-based slide rendering
],
```

**Change 3: Add to `task_routes` in `celery_app.conf.update(...)`**

```python
task_routes={
    # ... existing entries ...
    # Presentation export (Playwright + FFmpeg) -> dedicated queue, concurrency 2
    "app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"},
},
```

**Why a dedicated queue:** The presentation export worker must run with `--concurrency 2` to prevent OOM from multiple concurrent Playwright Chromium instances. Running it on the shared `video` queue would cause all video jobs to be limited to 2 concurrent workers.

**Worker startup command** (document in `run-services.sh` and operational runbook):

```bash
celery -A app.core.celery_app worker \
  -Q presentation_export \
  -c 2 \
  --hostname=presentation@%h \
  -l info
```

The `-c 2` flag caps Playwright concurrency. The `--hostname` flag ensures this worker does not conflict with the default worker hostname.

---

## 14.4 Nginx Configuration

**File:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`

The `/internal/slide-render/` route must be blocked at the Nginx level to prevent public internet access. This is the **primary defense**; the application-layer localhost IP check (in `slideRender.ts`) is a secondary defense.

Add the following `location` block to **both** the HTTP (:80) `smartaihub.app` server block **and** the HTTPS (:443) `smartaihub.app` server block. It must be placed **before** the catch-all `location /` block.

**Placement in the HTTP server block (first `server {}` block, `listen 80; server_name smartaihub.app localhost;`):**

Insert before the existing `location /` block (currently at line 159):

```nginx
# Block internal slide render route from public access
# This route is only accessible from localhost (used by Celery workers via Playwright)
location /internal/ {
    deny all;
    return 403;
}
```

**Placement in the HTTPS server block (`listen 443 ssl; server_name smartaihub.app;`):**

Insert before the existing `location /` block (currently at line 315):

```nginx
# Block internal slide render route from public access
location /internal/ {
    deny all;
    return 403;
}
```

**Note on placement:** Nginx uses the longest prefix match. Since `/internal/` is a more specific prefix than `/`, the deny block will match before the catch-all `location /` proxy. The `return 403;` short-circuits immediately without forwarding the request to the upstream.

**Note on the `docker.smartaihub.app` server block:** The third server block (lines 341–387) does not proxy to `web_host`, so it does not need the `/internal/` deny block.

**After editing `dev-host.conf`:** Reload Nginx to apply the change:

```bash
docker exec smartspec-nginx-dev nginx -t         # Verify config syntax
docker exec smartspec-nginx-dev nginx -s reload  # Apply without downtime
```

**Verify the block is active:**

```bash
curl -v https://smartaihub.app/internal/slide-render/1/0
# Expected response: HTTP/1.1 403 Forbidden
```

---

## 14.5 Environment Variables

The presentation export Celery worker requires two environment variables that are not currently in the worker environment.

**`JWT_SECRET`**

The Celery worker generates short-lived JWTs (5-minute TTL) to authenticate slide render requests to the Node.js internal route. It must use the same `JWT_SECRET` value as the Node.js web app (`apps/web/.env`).

Add `JWT_SECRET` to:
- The Docker `--env` or `docker-compose.yml` environment section for the video-job-runner container
- The `screen` startup command or `run-services.sh` entry for the presentation export worker
- Any `.env` file loaded by the worker process

**`INTERNAL_RENDER_BASE_URL`**

Controls the base URL that Playwright navigates to for slide screenshots.

| Environment | Value |
|---|---|
| Local development (no Docker) | `http://localhost:3000` (default if var not set) |
| Inside Docker container | `http://host.docker.internal:3000` |

`host.docker.internal` is a special DNS name provided by Docker Desktop and Docker Engine that resolves to the host machine's IP address from inside a container. `localhost` inside a container refers to the container itself (not the host), so the Node.js web app running on the host at port 3000 is not reachable via `localhost:3000` from inside the worker container.

Set this in the worker's Docker environment:

```
INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000
```

**Where to add environment variables for the Docker-based worker:**

If using `docker-compose.yml` for the worker, add to the service definition:

```yaml
environment:
  - JWT_SECRET=${JWT_SECRET}
  - INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000
```

If using a `screen`-based or `systemd`-based worker startup outside Docker (local development), the variables are inherited from the shell environment if sourced from `python-backend/.env`. Verify this `.env` file includes both variables.

---

## 14.6 Operational Runbook Entry

Document the presentation export worker startup alongside the existing worker commands. Add to the relevant section of `run-services.sh` or operational documentation:

```bash
# Presentation Export Worker (dedicated — Playwright + FFmpeg, max 2 concurrent)
# Must be started separately from the main media/video workers
# Requires: JWT_SECRET and INTERNAL_RENDER_BASE_URL env vars
celery -A app.core.celery_app worker \
  -Q presentation_export \
  -c 2 \
  --hostname=presentation@%h \
  -l info
```

**Memory considerations:** Each Playwright Chromium instance uses approximately 200–400 MB. With `--concurrency 2`, peak memory usage for this worker is approximately 800 MB–1 GB. If the server has limited memory, set Docker memory limit:

```yaml
deploy:
  resources:
    limits:
      memory: 1500m
```

---

## Dependencies and Sequencing

This section (14) has no dependencies on other feature sections and can be implemented immediately after Section 2 (Shared Contracts).

Sections that depend on this section being complete before they can be tested or run:
- **Section 6** (Python FastAPI Export API) — the FastAPI app imports from `app.tasks.presentation_render`; if Playwright is not installed, the import will fail
- **Section 7** (Python Celery Render Task) — the render task calls Playwright; requires Chromium in the image

The Nginx change in 14.4 is coordinated with Section 5 (Slide Render Route), which also documents the need for this block. Both sections reference the same change. Whichever is implemented first should add the Nginx block; the second section implementer should verify it is already present.
---

## Implementation Results

**Date:** 2026-02-24
**Files created/modified:**
- `docker/Dockerfile.video-job-runner` — added Playwright + pypdf + Pillow install (lines 44-48)

**Already in place from earlier sections:**
- `python-backend/requirements.txt` — playwright, pypdf, Pillow, PyJWT all present
- `python-backend/app/core/celery_app.py` — `presentation_export` queue and task route already added
- `nginx/conf.d/dev-host.conf` — `/internal/` deny blocks present in both HTTP and HTTPS server blocks

**Note:** No automated tests for this section (infrastructure verification is manual). The Dockerfile change cannot be verified without running a full Docker build; the `playwright install chromium --with-deps` line installs the Chromium browser and its system library dependencies inside the container.
