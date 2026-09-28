# Section 03: Episode List Projection

## Depends on

Sections 01 and 02.

## Owns

- `apps/web/server/routers/verticalDramaSeries.ts`
- focused additions to the nearest existing Vertical Drama series projection test

## Implementation

1. Extend the owned `verticalDramaSeries.get` episode select with `coverImage` only; retain the existing light projection and raw-manifest stripping.
2. Resolve the current cover asset URL only after owner-scoped asset validation. Missing/malformed/unowned assets produce a null URL rather than a broken client payload.
3. Return the display-safe cover DTO: status, URL, model id, selected shot numbers, error, and minimal task handle for resume polling. Strip prompt, asset id, idempotency key, provider metadata, raw script, and raw Start Frame plan.
4. Preserve the existing `thumbnailUrl` derived from approved Start Frames. The client uses the cover URL when valid and falls back to `thumbnailUrl` otherwise.
5. Ensure old rows with null `coverImage` return a stable null/no-cover shape and do not add extra per-episode broad queries if a batch resolver can be used.

## Tests first

Assert safe fields only, null behavior for missing assets, cover precedence when URL exists, and unchanged Start Frame thumbnail fallback. Include a regression case proving raw prompt/task metadata is not returned.

## Completion proof

- Series get focused tests pass.
- Existing episode projection fields and navigation data remain unchanged.
- No raw internal JSONB crosses the API boundary.

## UI/UX Contract

This section owns the API-to-card display boundary, not the card layout.

### Target User / JTBD

The series owner needs each episode card to show the current cover immediately after reload.

### Surface Inventory

Safe cover URL/status/model/error/task handle plus existing Start Frame thumbnail fallback.

### Component Map

Section 04 consumes the DTO in the episode card and toolbar; this section does not add interactive controls.

### State Matrix

Null cover uses the old thumbnail; valid cover URL takes precedence; invalid/missing asset falls back safely; generating/failed remain explicit.

### Responsive Matrix

The projection is independent of viewport; it must remain compact enough for the existing responsive card grid.

### Accessibility Acceptance

The projection provides enough state for the UI to render episode-specific alt text and status labels.

### Copy Contract

No new prose is generated here. UI labels come from the approved Thai/English cover state copy.

### Browser Evidence Required

No direct browser evidence here; section 05 confirms the card behavior where the harness is available.
