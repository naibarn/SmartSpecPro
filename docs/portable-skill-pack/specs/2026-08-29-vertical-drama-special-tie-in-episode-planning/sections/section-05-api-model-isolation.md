# Section 05 — API and model isolation

## Goal

Expose a protected special API and separate image/video model selections from normal
series memory.

## Owned files

- `apps/web/server/routers/verticalDramaEpisodes.ts` or additive special router module
- special capability catalog/model resolver
- API/model tests and shared client types

## Implementation

- Add list models, create, status, update-input, and retry procedures with explicit Zod
  input/output contracts and typed errors.
- Gate every procedure with feature flag, tenant/user/series/character/media ownership,
  and model capability validation.
- Persist image/video IDs and immutable capability snapshot on special input/output and
  in existing start-frame/motion selected-model fields.
- Never call normal series model-memory read/write from special procedures.
- Return bounded progress/error/status, sequence, episode ID, output version, shot count,
  model snapshot, and reference summary.

## TDD

Test procedure schemas, auth/flag gating, ownership, model compatibility, no-memory
interaction, status response, typed errors, and backward-compatible normal routers.

## Acceptance

The client can create and monitor a special episode with explicit independent model
choices; normal model preferences remain untouched.

## UI/UX Contract

### Target User / JTBD
Creator choosing models appropriate for tie-in output; success is explicit episode-local
image/video model selection without normal-memory mutation.

### Existing Pattern Reference
Reuse existing model selector/query and protected tRPC patterns; diverge only by using a
special catalog and episode-local snapshot.

### Surface Inventory
Model selectors and status/error fields in the section 06 creation dialog and section 07
episode view.

### Component Map
API owns validation/catalog/snapshot; dialog owns selection; episode view owns display of
the immutable snapshot.

### State Matrix
Loading, empty catalog, incompatible model error, selected, disabled while submitting,
and persisted success are required; UI tests own visual verification.

### Responsive Matrix
Selectors remain single-column on mobile 390x844 and fit the form at tablet 768x1024,
laptop 1024x768, and desktop 1440x900 without clipping.

### Accessibility Acceptance
Explicit labels, keyboard select, visible focus, error association, and status updates.

### Copy Contract
Use `Image Model`, `Video Model`, and clear Thai/English capability or unavailable-model
messages; never imply normal model memory was changed.

### Browser Evidence Required
Section 06 records selector loading/empty/error/selected states at required viewports.
