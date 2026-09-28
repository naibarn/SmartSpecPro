# Section 07 — Content Protection workspace

Create lazy pages/components under
`apps/web/client/src/pages/content-protection/` for overview, assets, asset
detail, verification input/progress/result, cases, rights, certificate, and
settings. Use `trpc` hooks and existing UI primitives/i18n. The image detail
surface shows dimensions, SHA-256, invisible image watermark, PDQ,
crop/resize alignment, C2PA, and evidence; video detail shows duration,
fingerprint/video watermark, compound lineage, and video C2PA. Keep the legal
ownership disclaimer visible near technical evidence.

The protect/export UI has an ON/OFF control and shows the effective choice
before submit. Processing shows the exact stages when watermark creation and
self-verification happen. OFF displays `Digital watermark: OFF — disabled by
user` and the resulting unprotected state.

Tests first: page states, modality-specific cards, ON/OFF copy, loading/error/
empty/disabled states, tabs, keyboard labels, and safe error rendering.

## UI/UX Contract

### Target User / JTBD

Creators protect or verify media; reviewers inspect technical evidence without
being misled into a legal ownership conclusion.

### Surface Inventory

All `/content-protection/*` routes plus embedded protect controls.

### Component Map

Overview, assets list, asset detail, modality evidence cards, verification
input/progress/result, cases, rights, certificate, settings, and reusable
watermark-choice/status components under `client/src/pages/content-protection/`.

### State Matrix

Loading, empty, error, disabled, ON, OFF, processing, success, inconclusive,
selected, and focus states are all represented with actionable copy.

### Responsive Matrix

Support 390x844 mobile, 768x1024 tablet, and 1440x900 desktop. Cards stack on
small screens and evidence tables become readable scroll regions.

### Accessibility Acceptance

Use semantic headings/tabs, labelled file/library controls, keyboard-visible
focus, screen-reader status announcements, adequate contrast, and reduced-motion
fallbacks.

### Copy Contract

Provide Thai and English labels. Technical evidence must say “technical signal”
and never “legal ownership confirmed”. ON/OFF and stage copy must be explicit.

### Browser Evidence Required

Authenticated route entry, upload/select controls, image/video cards, ON/OFF
notices, progress stages, and mobile quick navigation.

## Implementation record

- Added the lazy top-level `/content-protection` workspace with overview,
  protected assets/detail, verification input/result, cases/evidence packages,
  rights claims, certificate, and settings views.
- Added modality-specific image/video/audio evidence copy, exact processing
  stages, technical-only ownership disclaimer, responsive card layouts, and
  accessible labels/focus states.
- Added ON/OFF controls to the standalone workspace and embedded final render
  surfaces; image protection visibly reports its separate rollout flag.
