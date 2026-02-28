# Interview Transcript — Feature 024: Import Presentations

*Conducted during deep-plan session — 2026-02-24*

---

## Q1: How does the PPTX file reach the Celery task?

**Question:** For PPTX import: how does the file reach the Celery task? The spec says 'upload to library (base64) → tRPC startImport' but the Python task needs to download the PPTX from S3. Does the user first upload the PPTX via the existing library upload flow?

**Answer:** Use existing library upload — user uploads PPTX as a library item first.

Frontend uploads PPTX via existing file upload flow → gets `libraryItemId` → calls `startImport` with that ID. Celery downloads from S3 using the library item's stored URL.

---

## Q2: What triggers deck creation in Node.js after Python finishes?

**Question:** After the Celery task finishes parsing, how does the deck get created in Node.js? Python callback vs Node.js polling.

**Answer:** Python callback to Node.js.

Python POSTs result to an internal Express route on Node.js. Node.js then calls `presentationService.createDeck + addSlide` in response to the callback.

---

## Q3: How does the Google OAuth access token reach the Python Celery task?

**Question:** For Google Slides import: where is the user's Google OAuth access token stored, and how does it reach the Python Celery task?

**Answer:** Node.js fetches the token from DB and passes it to `startImport`, which forwards it to Python.

Node.js tRPC reads the decrypted Google access token from the user's OAuth record, includes it in the Python API call body (as `accessToken`).

---

## Q4: Should embedded images become libraryItems or just S3 URLs in JSON?

**Question:** When the Python importer uploads embedded PPTX/GSlides images to S3, should these images also be registered as libraryItems rows?

**Answer:** S3 URL embedded in slideContent JSON only (Recommended for simplicity).

Images uploaded to S3, URL stored directly in the slide's `PresentationSlideContent` JSON. No libraryItem record needed per image.

---

## Q5: How should we track processing progress?

**Question:** The `presentationConversionRecords` table has no `progress` column. The frontend needs a progress %. How should this be handled?

**Answer:** Add a progress integer column to `presentationConversionRecords`.

Run a Drizzle migration to add `progress INT` (0-100). Celery task updates it during processing. `getImportStatus` returns it.

---

## Q6: How should the imported deck's libraryItem be created?

**Question:** When the deck is created in Node.js after import, `createPresentationDeckForLibraryItem` requires an existing libraryItem. How should the import service create one?

**Answer:** Create a new libraryItem of type `'presentation'` programmatically in the import service.

Import service calls an internal `createLibraryItem` function with title, type=`'presentation'`, and then `createPresentationDeckForLibraryItem` with the new ID.

---

## Q7: Does INTERNAL_SERVICE_SECRET already exist for Python → Node.js callback auth?

**Question:** For the Python → Node.js callback authentication: does `INTERNAL_SERVICE_SECRET` already exist as an environment variable?

**Answer:** Yes — `INTERNAL_SERVICE_SECRET` already exists. Use it as a Bearer token in the callback POST.

---

## Q8: Should we also add a `status` column to presentationConversionRecords?

**Question:** The spec mentions tracking `status` (queued/done/failed) but the schema shown has no explicit `status` column. Since we're already adding `progress`, should we also add `status`?

**Answer:** Yes — add both `status` (varchar) and `progress` (int) in one migration.

Single Drizzle migration: `ALTER TABLE presentationConversionRecords ADD COLUMN status VARCHAR(16), ADD COLUMN progress INT`.

---

## Q9: What happens after the user clicks "Open Deck"?

**Question:** After import completes and the user clicks "Open Deck", what should happen?

**Answer:** Navigate directly to the PresentationEditor for the new deck.

Close dialog, redirect to the editor route for `deckLibraryItemId`.

---

## Q10: Where should the 50MB file size limit be enforced?

**Question:** For the 50MB PPTX file size limit, where should it be enforced?

**Answer:** Both client-side (before upload) AND server-side (FastAPI validator) — defense in depth.

React checks `file.size` before sending XHR. FastAPI rejects files >50MB via Content-Length check.
