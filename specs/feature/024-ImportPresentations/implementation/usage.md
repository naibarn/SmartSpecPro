# Feature 024: Import Presentations — Usage Guide

## Overview

Import existing presentations into SmartSpecPro from two sources:
- **PPTX files** — Upload a .pptx file from the library
- **Google Slides** — Paste a Google Slides URL (requires connected Google account)

## User Flow

### PPTX Import
1. Open the Presentation Editor for any deck
2. Click the **Import** button in the toolbar
3. Select the **PPTX** tab
4. Choose a .pptx file (max 50 MB)
5. Wait for processing (progress bar shows status)
6. View results including any fidelity warnings
7. Click **Open Deck** to navigate to the imported presentation

### Google Slides Import
1. Ensure a Google account is connected (Settings → Integrations)
2. Open the Presentation Editor
3. Click **Import** → **Google Slides** tab
4. Paste the Google Slides URL
5. Click **Import** — the system fetches slides via Google API
6. View results and click **Open Deck**

## Architecture

```
Client (Dialog) → tRPC (startImport) → Python (Celery task)
                                              ↓
                                        Parse PPTX/GSlides
                                        Upload images to R2
                                              ↓
                                   Node.js callback → Create deck
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| DB Schema | `drizzle/schema.ts` | `presentationConversionRecords`, `presentationSourceAttachments` |
| PPTX Parser | `python-backend/app/services/pptx_importer.py` | Parse .pptx → slides JSON |
| GSlides Parser | `python-backend/app/services/gslides_importer.py` | Google Slides API → slides JSON |
| Celery Task | `python-backend/app/tasks/presentation_import_tasks.py` | Async import orchestration |
| FastAPI Endpoints | `python-backend/app/api/v1/presentation_import.py` | Start/status/cancel API |
| tRPC Router | `apps/web/server/routers/presentationImport.ts` | Type-safe client-server RPC |
| Service Layer | `apps/web/server/services/presentationImportService.ts` | Create deck from import result |
| Callback Route | `apps/web/server/routes/presentationImportCallback.ts` | Internal Python→Node.js callback |
| React Dialog | `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx` | UI component |
| Editor Integration | `apps/web/client/src/pages/PresentationEditor.tsx` | Import button in toolbar |

### Celery Worker

Start the import worker:
```bash
celery -A app.core.celery_app worker -Q presentation_import -c 4 --hostname=import@%h
```

Required environment variables:
- `NODE_INTERNAL_URL` — Node.js internal URL (default: `http://localhost:3000`)
- `SMARTSPEC_WEB_GATEWAY_TOKEN` — Shared secret for callback auth

## Supported Elements

| Element Type | PPTX | Google Slides |
|-------------|------|---------------|
| Text boxes | Yes | Yes |
| Images (embedded) | Yes | Yes |
| Rectangles/shapes | Yes | Yes |
| Lines | Yes | Yes |
| Groups | Yes (recursive) | Yes (recursive) |
| Tables | Fidelity warning | Fidelity warning |
| Charts | Fidelity warning | Fidelity warning |
| Videos | Fidelity warning | Fidelity warning |
| SmartArt | Fidelity warning | N/A |

## Security Controls

- Client-side file size limit (50 MB)
- SSRF protection on image downloads (HTTPS-only)
- Timing-safe callback auth (Bearer token)
- Tenant isolation on all operations
- S3 path scoping by tenant_id
- Parameterized SQL queries throughout
- Input validation (Zod + Pydantic)

## Limitations

- Maximum 200 slides per import (truncated with fidelity warning)
- Slides JSON payload capped at 8 MB (truncated with fidelity warning)
- No VBA macro execution (python-pptx ignores macros)
- No S3 lifecycle rule for orphan cleanup (see **Infrastructure TODO** below)
- Unsupported shapes produce fidelity warnings, not errors

## Infrastructure TODO: S3 Lifecycle Rule for Orphan Cleanup

**Problem:** When an import task fails after uploading some images to R2/S3 but before creating
the deck, orphan image files remain at `{tenant_id}/presentations/imports/{conversion_id}/`.
These files are never referenced by any deck and accumulate over time.

**Recommended fix:** Add an S3 lifecycle rule on the bucket to auto-expire objects under
`*/presentations/imports/` that are older than 7 days. Alternatively, create a Celery periodic
task that scans `presentationConversionRecords` for `status='failed'` rows older than 7 days
and deletes their corresponding S3 prefix.

**Scope:** This is an infrastructure/ops task, not an application-code issue. The import feature
functions correctly without it — orphan images simply consume extra storage.

**Estimated impact:** Low — each failed import leaves at most ~50 MB of image files (the PPTX
size limit). With typical failure rates, this would accumulate slowly.

## Test Coverage

- **Python**: 87 tests (pptx_importer 74%, gslides_importer 97%, tasks+API 33 tests)
- **TypeScript**: 46 tests (tRPC router, callback route, service layer, dialog, editor integration)
