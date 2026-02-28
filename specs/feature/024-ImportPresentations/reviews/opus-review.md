# Implementation Plan Review: Feature 024 - Import Presentations

## Executive Summary

**CONDITIONAL PASS** — The plan is well-structured, thorough in its element-parsing logic, and demonstrates strong understanding of the existing codebase patterns. However, it contains three HIGH-priority schema/data-model issues that will cause runtime failures if not addressed before implementation, plus several MEDIUM-priority gaps around OAuth token handling, the internal callback authentication mechanism, and error recovery semantics. These are all fixable without major architectural changes.

---

## HIGH Priority Concerns (Blockers)

### H1. `presentationConversionRecords` has NOT NULL columns without defaults for `sourceItemId`, `deckLibraryItemId`, and `deckId` — insert will fail at queue time

**Problem:** The plan (Section 01, Section 05) says the tRPC `startImport` mutation creates a `presentationConversionRecords` row at queue time with `status: "queued"`. However, the existing schema shows:

```typescript
sourceItemId: integer("source_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
deckLibraryItemId: integer("deck_library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
```

All three are `notNull()` with no default. At queue time:
- For Google Slides imports, there is **no** `sourceLibraryItemId` (source is a URL). The plan would pass `null`, violating NOT NULL.
- `deckLibraryItemId` and `deckId` don't exist yet — the deck is created after Python finishes, in the callback handler.

**Resolution:** Make `sourceItemId`, `deckLibraryItemId`, and `deckId` nullable in the schema. Add a `slidesUrl` column (varchar, nullable) for Google Slides imports. Handle the unique index on `(tenantId, sourceItemId)` which breaks for NULL values.

### H2. Wrong environment variable name for internal auth

**Problem:** The plan references `INTERNAL_SERVICE_SECRET` for Python→Node.js callback auth, but the codebase uses `SMARTSPEC_WEB_GATEWAY_TOKEN` / `ENV.webGatewayToken` for internal service authentication.

**Resolution:** Replace all references to `INTERNAL_SERVICE_SECRET` with `SMARTSPEC_WEB_GATEWAY_TOKEN` / `ENV.webGatewayToken`. Consistent in both Python task (Section 04) and Node.js callback handler (Section 06).

### H3. Google Slides OAuth token flow is architecturally wrong

**Problem:** Section 05 says Node.js reads the Google access token from the DB and forwards it to Python. But Google Drive OAuth tokens are managed by Python's `GoogleTokenService` (with refresh logic). Node.js doesn't have a `oauth_connections` table in Drizzle, and passing raw tokens between services creates unnecessary security surface.

**Resolution:** Python Celery task retrieves the token itself via `GoogleTokenService.get_valid_access_token(user_id)`. The `startImport` tRPC mutation passes `userId` (not the token) to Python. The conversion record needs to store `userId` (requires a new column).

---

## MEDIUM Priority Suggestions

### M1. Missing `userId` column on `presentationConversionRecords`

The callback handler needs to construct a `PresentationActor` with userId. The table doesn't have a `userId` column. Add it to the Section 01 migration.

### M2. `R2StorageService.upload_bytes` does not exist

The actual method is `upload_file(file_content, filename, folder, content_type, db_session)`. Add an `upload_bytes(key, data, content_type)` convenience method to `R2StorageService`, or adapt importers to use the existing interface.

### M3. `fidelityWarnings` must be capped at 25 items (Zod schema)

The existing `presentationConversionResultSchema` caps fidelityWarnings at `.max(25)`. Add truncation in both Python importers before returning.

### M4. Deck creation needs explicit details about Drizzle insert and actor construction

Be explicit: create the `libraryItem` via direct Drizzle insert with `status: "active"`. Construct `PresentationActor` manually using stored `tenantId` and `userId` from the conversion record.

### M5. OAuth scope documentation is incorrect

The existing `DRIVE_SCOPES` already includes `drive.readonly` which is sufficient for Slides API. The plan incorrectly says to add `presentations.readonly`. Correct the security section.

### M6. Google access token may expire during image downloads

Token has ~1 hour lifetime. If image downloads take long, token could expire. The current plan's approach of front-loading all downloads immediately after `presentations.get()` mitigates this and should be explicit.

### M7. Callback payload size may exceed Express 10MB JSON limit

For large presentations, the full slide content JSON could exceed 10MB. Either increase the limit specifically for the internal callback route, or store parsed results in the DB and have the callback carry only the conversion_id + status.

### M8. No duplicate callback protection (idempotency)

Celery retries (up to 2) could trigger multiple callbacks with `status: "done"`, creating duplicate decks. Add idempotency check: before creating the deck, check if `conversionRecord.status === "done"` already.

---

## LOW Priority Notes

- **L1:** Unique index on `(tenantId, sourceItemId)` prevents re-importing same PPTX after failure
- **L2:** Specify exact Python file for router registration (`python-backend/app/main.py`)
- **L3:** `R2StorageService` is a singleton — don't instantiate per-task, use module-level instance
- **L4:** Progress granularity: update per-slide (not just 5 → 80 jump)
- **L5:** Catch `PackageNotFoundError` / `BadZipFile` from python-pptx for corrupt files
- **L6:** Anchor Google Slides URL regex to `^https://docs\.google\.com/...`
- **L7:** Consider batch slide insertion for performance (200 sequential DB ops is slow)
- **L8:** AffineTransform rotation formula is oversimplified for skewed elements
- **L9:** S3 image cleanup on import failure not addressed
- **L10:** Cancel functionality references a non-defined endpoint — needs to be defined
