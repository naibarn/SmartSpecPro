# Vertical Drama Location Camera-Variant Generation

## Goal

Separate editing the current location primary image from creating a reusable
camera-view image derived from that primary reference. A request such as
“zoom through the clinic glass to see the reception counter” must create a new
sub-view instead of returning another establishing plate or silently replacing
the primary image.

## Accepted design

- `primary_edit` keeps the existing image-to-image edit behavior. It creates a
  candidate that can later be selected as the primary reference.
- `camera_variant` is a distinct image-to-image operation. It always attaches
  the current primary image as the reference, explicitly asks the provider to
  change camera distance/composition, and persists the result as a non-primary
  location asset with camera-view metadata.
- The existing text-to-image establishing flow remains available when a
  location has no primary image.
- The primary reference remains pinned while either operation completes. The
  user chooses a new primary explicitly.
- Every saved alternate view gets its own delete action. Deleting an alternate
  removes only the location-asset link; the canonical media asset remains in
  Media History/Library. The primary delete flow remains separately guarded.

## Data flow

The location panel sends an explicit generation mode and instruction to the
existing `generateLocationImage` procedure. The router validates that a
camera variant or primary edit has an approved primary reference, builds a
mode-specific provider prompt, and sends exactly that reference through the
existing media transport. The post-render persistence path stores the mode,
source asset link, camera view, and role. `camera_variant` uses a coverage role
when selected, otherwise `other`; `primary_edit` uses `establishing_plate`.

## Failure handling and safety

- Fail closed when no approved primary exists for a reference-based operation.
- Fail closed when the selected model does not support reference images.
- Keep the current primary unchanged until an explicit “set as primary” action.
- Keep tenant/user/series ownership checks on the existing link/delete
  procedures.
- Preserve paid confirmation dialogs and credit reservation/refund behavior.

## UI authoring clarity

- The location camera selector is labeled as the camera-position/shot-grammar
  field, and its adjacent directive is labeled as the specific point or
  direction the camera should target.
- The blue primary-edit box explicitly describes edits to existing image
  content and states that it does not create a new camera angle.
- The green camera-variant box explicitly describes what should be visible in
  the new view and states that it is combined with the camera controls above.
- Helper copy uses concrete examples so users do not put camera placement and
  scene content into the same instruction.

## Gallery interaction

- Clicking any scene-library thumbnail opens the existing full-screen image
  lightbox.
- Every candidate thumbnail exposes a Replace action and accepts a local image
  file dropped onto it.
- Replacement uploads through the existing managed-media path, preserves the
  candidate role and camera metadata, promotes the new asset when replacing the
  primary, and removes the old location link only after the new asset is ready.
- The canonical media asset is never deleted as part of replacing a location
  link.

## Verification

- Unit-test the mode-specific prompt contracts.
- Test router dispatch for reference URLs and generation metadata.
- Test that alternate candidates can be deleted without affecting the primary.
- Run focused Vitest suites and the web TypeScript check; report unrelated
  dirty-worktree failures separately.
