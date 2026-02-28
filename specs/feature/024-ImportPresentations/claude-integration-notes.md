# Integration Notes — Feature 024 Plan Review

*Decisions on which Opus review suggestions to integrate into claude-plan.md*

---

## HIGH Priority — All Integrated

### H1: Make schema columns nullable ✅ INTEGRATING

The Opus review is correct. The `presentationConversionRecords` schema has NOT NULL constraints on `sourceItemId`, `deckLibraryItemId`, and `deckId` that will prevent inserting the queued row at import start time. Section 01 must be updated to:
- Make `sourceItemId` nullable (Google Slides imports have no source library item)
- Make `deckLibraryItemId` and `deckId` nullable (populated after conversion completes)
- Add a `slidesUrl` column (varchar, nullable) for Google Slides URL storage
- Drop or replace the unique index on `(tenantId, sourceItemId)` to handle NULL values

### H2: Use SMARTSPEC_WEB_GATEWAY_TOKEN ✅ INTEGRATING

The review found the correct env var name by reading the actual codebase. Replace every occurrence of `INTERNAL_SERVICE_SECRET` with `SMARTSPEC_WEB_GATEWAY_TOKEN` / `ENV.webGatewayToken`. This affects Sections 04 and 06.

### H3: Let Python handle its own token retrieval ✅ INTEGRATING

The review's architectural concern is valid. Having Node.js read, decrypt, and forward a short-lived access token is fragile and unnecessarily exposes the token. The correct pattern is:
- `startImport` tRPC passes `userId` (not the token) to the Python FastAPI endpoint
- Python Celery task calls `GoogleTokenService.get_valid_access_token(user_id)` to get a fresh, valid token (with automatic refresh if needed)
- This keeps all token lifecycle management within Python

---

## MEDIUM Priority — Mostly Integrated

### M1: Add `userId` column to `presentationConversionRecords` ✅ INTEGRATING

Required for the callback handler to reconstruct the actor. Add to Section 01 migration: `userId: integer("user_id").notNull().references(() => users.id)`.

### M2: `R2StorageService.upload_bytes` method ✅ INTEGRATING

The review correctly identified that `upload_bytes` doesn't exist. Plan will specify adding a new convenience method `upload_bytes(key: str, data: bytes, content_type: str) -> str` to `R2StorageService`. This is the cleanest solution since importers need explicit key control.

### M3: Cap fidelityWarnings at 25 items ✅ INTEGRATING

The existing Zod schema enforces `.max(25)`. Both Python importers must truncate their warnings list before returning. Add: after collection, if `len(warnings) > 25`, keep first 24 and append `f"... and {len(warnings) - 24} more warnings"`.

### M4: Explicit deck creation details ✅ INTEGRATING

Add specificity to Section 06: Drizzle insert for `libraryItem` with exact fields, manual `PresentationActor` construction from stored `tenantId` and `userId`.

### M5: Correct OAuth scope documentation ✅ INTEGRATING

Update Section 10: `drive.readonly` is the operative scope. No `presentations.readonly` needed. The existing Python `DRIVE_SCOPES` list already covers this.

### M6: Front-load image downloads ✅ ALREADY IN PLAN (reinforce)

Section 03 step 5 already says "Downloads all images first (or concurrently), before returning." Reinforce this as an explicit requirement with rationale (token expiry window).

### M7: Callback payload size ✅ INTEGRATING (partial)

Rather than adding intermediate storage (which would increase complexity significantly), the plan will specify increasing the JSON body limit for the internal callback route specifically. Also add a size check in the Celery task: if serialized slides JSON exceeds 8MB, emit a warning and truncate to first N slides.

### M8: Idempotency in callback ✅ INTEGRATING

Add explicit idempotency check at the start of the callback handler: if `conversionRecord.status === "done"` already, return 200 immediately. This prevents duplicate deck creation on Celery retries.

---

## LOW Priority — Selective Integration

### L1: Unique index concern ✅ INTEGRATING (as documentation)

Note in Section 01 that the existing unique index must be dropped/replaced when making `sourceItemId` nullable. For re-import scenarios: a failed import record can be deleted or overwritten by the user initiating a new import.

### L2: Specify Python router registration file ✅ INTEGRATING

Add `python-backend/app/main.py` as the file to modify in Section 04.

### L3: R2StorageService singleton pattern ✅ INTEGRATING

Note in Section 04 that `R2StorageService` should be accessed via the module-level singleton, not instantiated per-task.

### L4: Per-slide progress updates ✅ INTEGRATING

Update Section 04 progress formula: `5 + int(slide_index / total_slides * 75)` during slide parsing loop.

### L5: Catch corrupt PPTX exceptions ✅ INTEGRATING

Add to Section 02: catch `PackageNotFoundError`, `BadZipFile` from python-pptx and return user-friendly error message.

### L6: Anchor Google Slides URL regex ✅ INTEGRATING

Use `^https://docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)` in both Python extractor and frontend validator.

### L7: Batch slide insertion ⏸ NOT INTEGRATING (complexity vs benefit)

The optimistic concurrency pattern in `addSlideToDeck` uses version checks that are inherently sequential. Adding batch support would require modifying the presentation service, which is out of scope for this feature. 200 sequential inserts, while not optimal, complete in well under 1 second for typical decks. Leave for a future performance pass.

### L8: AffineTransform skew note ✅ INTEGRATING (as fidelityWarning)

Add to Section 03: detect elements with `abs(shearX) > 0.01 or abs(shearY) > 0.01 or abs(scaleX - scaleY) > 0.01` as having non-uniform transforms. Emit fidelityWarning and still render using bounding box.

### L9: S3 image cleanup on failure ✅ INTEGRATING (documented limitation)

Note as a known limitation: orphaned S3 images on import failure are not cleaned up. Rely on S3 lifecycle policy with a 7-day expiry for the `presentations/imports/` prefix.

### L10: Define cancelImport tRPC procedure ✅ INTEGRATING

Add a `cancelImport` mutation to Section 05: sets conversion record status to `"cancelled"`, calls Celery `revoke()` best-effort.
