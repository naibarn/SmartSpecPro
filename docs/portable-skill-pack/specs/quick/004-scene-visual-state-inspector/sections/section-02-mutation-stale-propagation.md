# Section 02 — Mutation and Stale Propagation

## Ownership

Own the `updateSceneVisualState` input and transaction behavior. Do not redesign
the UI or alter unrelated episode mutations.

## Target files

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts`
- Shared contract files from Section 01 only as needed for type validation.

## Work

- Extend the patch schema for the structured sleep-surface field and any list
  edits exposed by the UI.
- Keep tenant/user/series/episode ownership checks, row lock, and
  `expectedRevision` conflict behavior.
- In the same transaction, update the shared Location state and all member
  frame entries. Preserve image/media anchors, set
  `imageStaleReason: "prompt_changed"` and `imageStaleAt`, and clear stale
  continuity QC data.
- Return the updated state/plan and affected shot numbers for UI feedback.
- Do not spend credits, call providers, delete assets, or overwrite image URLs.

## TDD and acceptance

- Two member shots are invalidated; an unrelated shot is untouched.
- Existing approved/generated media anchors survive.
- No-image frames still expose a visible stale/needs-regeneration signal.
- Stale revision returns the existing conflict error and leaves state unchanged.
- Manual edit remains protected from ordinary planning.

## Security and data safety

Use the existing owned-episode loader and locked update predicate. Keep user
free text out of audit metadata. Bound arrays and strings at the Zod boundary.

## UI/UX Contract

### Target User / JTBD

Scene author needs confidence that one save updates the intended continuous
shots and preserves paid image work.

### Surface Inventory

Save impact summary, affected-shot status, success state, and revision-conflict
message in the Location Inspector.

### Component Map

Router mutation response feeds the Location Inspector's save/result state; no
new backend-facing UI component is required here.

### State Matrix

Success: show affected count. Conflict: show refresh/retry. Validation failure:
show field guidance. Unauthorized/invalid episode: show safe generic failure.

### Responsive Matrix

Impact and conflict content must wrap in the Location panel on narrow screens.

### Accessibility Acceptance

Mutation errors and success must be announced through the existing alert/toast
pattern and remain visible as text, not color alone.

### Copy Contract

Use `การแก้ไขนี้มีผลกับ N ช็อต ภาพเดิมจะยังอยู่ แต่ต้องสร้างภาพใหม่จึงจะเห็นการเปลี่ยนแปลง`.

### Browser Evidence Required

Save a shared edit and confirm the affected count, stale shot status, retained
old image, and conflict recovery in the authenticated browser smoke test.
