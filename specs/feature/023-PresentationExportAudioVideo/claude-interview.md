# Interview Transcript — Presentation Export, Audio & Video Playback

Feature: 023-PresentationExportAudioVideo
Date: 2026-02-23

---

## Round 1 — Export Flow & Internal Render Endpoint

### Q1: How should the signed token for the internal Playwright render route be generated?

**Options presented:**
- Use existing `signBearerToken()` JWT
- Separate HMAC signed URL
- Internal IP restriction only

**Answer: Use existing `signBearerToken()` JWT (Recommended)**

The Celery task will generate a scoped JWT via `signBearerToken()` before navigating Playwright to the internal slide render endpoint. This reuses existing auth infrastructure rather than introducing a new token type.

---

### Q2: Should the export job write to `presentation_exports` DB immediately or only after Python confirms enqueue?

**Options presented:**
- Write to DB before calling Python
- Write to DB only after Python confirms
- Keep current in-memory approach

**Answer: Write to DB before calling Python (Recommended)**

Node.js creates the `presentation_exports` DB record with `status='queued'` first, then calls Python to enqueue the Celery task. This gives instant polling capability and survives Python being temporarily down. The record must be updated to include the Celery `task_id` once Python responds.

---

### Q3: How should video elements on slides be handled during MP4 export via Playwright screenshot?

**Options presented:**
- Show video poster/thumbnail
- Replace with static placeholder image
- Skip export warning only

**Answer: Show video poster/thumbnail (Recommended)**

The internal slide render page should ensure video elements show their `poster` attribute or first frame by setting `video.currentTime = 0` and waiting before Playwright takes the screenshot.

---

## Round 2 — Audio Resolution & UI Placement

### Q4: Who resolves audio library item URLs before the Celery render task runs?

**Options presented:**
- Node.js resolves URLs before sending to Python
- Python resolves via internal API call
- Presigned URLs baked into render spec

**Answer: Node.js resolves URLs before sending to Python (Recommended)**

The tRPC `triggerExport` handler fetches audio library item URLs from the DB and includes the resolved URLs in the render spec payload sent to Python. Python never needs to query the library — it receives a self-contained render spec.

---

### Q5: Where in the PresentationEditor UI should Export and Audio attachment live?

**Options presented:**
- Export: toolbar button, Audio: right panel tab
- Export: File menu dropdown, Audio: slide context menu
- Export: floating action button, Audio: bottom bar

**Answer: Export: toolbar button, Audio: right panel tab (Recommended)**

- **Export button**: In the top toolbar alongside existing Save/Undo buttons. Clicking opens the `ExportDialog` modal.
- **Audio attachment**: A new "Audio" tab in the right properties panel (alongside existing element properties tabs). Shows per-slide audio when a slide is selected, and deck-wide audio configuration.

---

### Q6: Which ID should the PresentationPlayMode URL use?

**Options presented:**
- Use libraryItemId (consistent with editor)
- Use deckId (as spec says)
- Either — both should work

**Answer: Use libraryItemId (consistent with editor) (Recommended)**

Route: `/presentation/:itemId/play` — uses the same library item ID as the editor route `/presentation-editor/:itemId`. Play mode resolves `deckId` from `libraryItemId` internally. This keeps URL patterns consistent.

---

## Round 3 — Error Handling & Edge Cases

### Q7: When an export job fails, what should happen?

**Options presented:**
- Show error in UI, allow manual retry with new export
- Auto-retry once, then surface error
- Silent failure with notification

**Answer: Show error in UI, allow manual retry with new export (Recommended)**

When the Celery task errors or times out:
1. Mark the `presentation_exports` record as `status='error'` with the error message
2. The `ExportDialog` polls `getExportStatus` and shows the error message when status is "error"
3. User can click Export again, which creates a fresh export job (new `exportId`, new DB record)
4. The old failed record is kept in DB for audit/debugging purposes

---

### Q8: When a slide's `durationMs` is shorter than its audio track, what happens during MP4 export?

**Options presented:**
- Fade out audio at slide end
- Continue audio on next slide
- Hard cut

**Answer: Fade out audio at slide end (Recommended)**

Apply a 0.5-second `afade` (type="out") to the slide's audio track when the slide ends. The audio is cut at the slide's `durationMs`. It does not bleed into the next slide. The fade prevents an abrupt audio cut.

---

### Q9: How long should the export's signed S3 download URL be valid?

**Options presented:**
- 24 hours
- 7 days
- 48 hours

**Answer: 48 hours**

The `output_url` stored in `presentation_exports` will be a presigned S3/R2 URL valid for 48 hours. This is stored in the DB record; if the URL expires, the record still exists but the download link is stale.

---

## Summary of Key Decisions

| Decision | Choice |
|----------|--------|
| Render token mechanism | Use existing `signBearerToken()` JWT with render scope |
| Export DB write timing | Write to DB before calling Python (status='queued') |
| Video elements in export | Show poster/first frame (video.currentTime = 0) |
| Audio URL resolution | Node.js resolves to signed URLs before sending to Python |
| Export button location | Top toolbar |
| Audio panel location | Right panel, new "Audio" tab |
| Play mode URL ID | libraryItemId (route: `/presentation/:itemId/play`) |
| Export failure UX | Show error, allow fresh retry |
| Audio overflow in MP4 | 0.5s afade cutoff at slide boundary |
| Download URL TTL | 48 hours |
