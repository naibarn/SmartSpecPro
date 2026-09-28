# Section 06 — Compound/render integration

Extend `apps/web/server/routers/editorMediaJobs.ts` and
`apps/web/server/services/editorMediaJobContract.ts` to carry the validated
watermark choice and compound envelope through the Web Video Editor render.
After final render output exists, enqueue protection with the same revision,
plan hash, and ordered source hashes; intermediate clip protection is never
treated as final video protection.

Add a narrow post-persist hook to `apps/web/server/services/verticalDramaAssembly.ts`
after `compiledVideo` is created. Bind `causalJobId`, `compoundArtifactId`,
`compoundPlanDigest`, and source asset IDs. Block protected publication until
the gate passes, while leaving assembly artifacts inspectable on failure. Keep
OFF output explicit and unprotected.

Tests first: editor binding, Vertical Drama binding, stale revision/plan,
duplicate completion, OFF result, and protected publish gate.

Also integrate the existing Media Studio final image/video export completion
path: image protection starts after the final image transform, while a video
created from images receives its own protection only after final video bytes are
available.

## UI/UX Contract

### Target User / JTBD

Creators must know whether the final compound/export artifact—not an
intermediate clip or image input—will be protected before publishing.

### Surface Inventory

Web Video Editor export, Media Studio export, and Vertical Drama assembly/publish
status surfaces.

### Component Map

Existing export/assembly dialogs receive a shared watermark-choice control and
final-artifact protection status/progress link; the Content Protection pages
own detailed evidence.

### State Matrix

Show loading, choice ON/OFF, processing stages, protected, protected with
warnings, unprotected by user choice, stale, failed, and publish-blocked states.

### Responsive Matrix

The choice/status block remains usable at 390x844, 768x1024, and 1440x900 and
does not hide the publish-blocking reason on smaller screens.

### Accessibility Acceptance

Choice controls are labelled, keyboard reachable, screen-reader announced, and
status is not represented by color alone; reduced motion is supported.

### Copy Contract

Thai/English copy explicitly says “final compound artifact”, separates “Digital
watermark” from “Visible mark”, and identifies OFF as unprotected.

### Browser Evidence Required

Capture export/assembly status with ON and OFF choices, final-artifact stage,
publish-blocked state, and a link to detailed evidence.

## Implementation record

- Added the shared protection intent to Web Video Editor final render,
  Remotion metadata, Vertical Drama episode/season/production flows, and the
  series trailer flow.
- Final compound handoff binds causal job, final output SHA-256, ordered source
  IDs/checksums, revision/plan digest, and a validated compound envelope.
- Vertical Drama ffmpeg protection fails closed when a clip has no real
  media-library identity/checksum. Legacy in-process production assembly rejects
  protection ON and directs protected output through Remotion.
- Trailer compilation now records its final artifact and downloaded source
  hashes so image/video combinations use the same protection gate.
- OFF is persisted as `UNPROTECTED_BY_USER_CHOICE`; intermediate clip outputs
  are never treated as final protected media.
