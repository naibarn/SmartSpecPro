# Section 08 — Series settings and nine-shot Web UI

## Objective

Extend existing Drama Series surfaces so users can bind approved image/video
Comfy workflows and submit one canonical job for each storyboard shot.

## Owned files

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- existing `VerticalDramaEpisodeWorkspace.tsx` and
  `VerticalDramaWorkerShotInspector.tsx` seams
- related shared localization and browser tests

## Required implementation

1. Extend existing `workerMediaWorkflowPolicy` and
   `mediaWorkflowPolicySnapshotSchema`; do not create a parallel Series policy
   store or a second storyboard/editor.
2. Add a compact Generate with Worker drawer to each of the nine shot cards:
   eligible Worker/profile, Manual/Guided/Automated AI mode, exact workflow
   version, duration, start/last/ordered reference frames, schema-driven
   advanced inputs, preflight, cost/consent summary, submit, inline status, and
   canonical job detail link.
3. Series settings store image and video defaults, allowed workflow versions,
   allowed profiles, binding revision, and user override policy.
4. Server owns tenant/owner/job/revision/output target; Web never calls Comfy,
   stages local IDs, or sees local paths/secrets.
5. Filter deleted/archived Series according to existing server ownership rules.

## TDD sequence

- Series owner/admin authorization and deleted/archived filtering.
- Image/video defaults and binding revision conflict.
- Exact episode/shot, one job per submit, frames/duration/version.
- Mode evidence, consent, missing Worker/profile/capability/budget/target,
  stale binding, localized recovery.
- Responsive/accessibility and canonical job detail link.

## UI/UX Contract

### Target User / JTBD

An episode editor chooses a safe default quickly, while an advanced user can
change workflow/frames without leaving the nine-shot storyboard.

### Surface Inventory

Series Settings owns defaults/bindings. The existing nine-shot storyboard card
owns the Generate with Worker drawer. The canonical Web Render Job detail owns
full progress; no duplicate queue is embedded.

### Existing Pattern Reference

- Searched `VerticalDramaSeriesDetailPage.tsx`, `VerticalDramaSettingsTab.tsx`,
  `VerticalDramaEpisodePage.tsx`, `VerticalDramaStoryboardPanel.tsx`,
  `VerticalDramaEpisodeWorkspace.tsx`, and `VerticalDramaWorkerShotInspector.tsx`.
- Decision: reuse existing nine-shot cards, inspector, drawer, form, and worker
  media policy patterns; diverge only for Comfy workflow/frame controls.

### Component Map

Worker/profile selector, image/video workflow selectors, mode selector, frame
pack preview/order, duration, advanced schema disclosure, preflight summary,
consent/cost, submit, inline status, and detail link.

### State Matrix

Default ready is compact; advanced fields are disclosed; no eligible Worker or
workflow blocks submit with cause; preflight pending disables submit; queued/
claimed/running/completed/failed uses the shared projection; stale binding asks
reload; deleted Series cannot submit.

### Responsive Matrix

Desktop drawer fits beside shot; tablet stacks fields; mobile uses a full-height
drawer with sticky submit/status and frame list that preserves order.

### Accessibility Acceptance

Drawer focus trap/return, labelled controls, frame order announced, errors linked
to fields, confirmation for remote upload, and status not color-only.

### Visual Direction / Token Strategy

Reuse existing Drama Series card hierarchy, semantic tokens, form controls,
spacing, radius, focus ring, and drawer behavior. Keep defaults compact;
advanced workflow/schema inputs are disclosed and use existing primitives.

### Copy Contract

Thai/English keys distinguish default vs override, image vs video, start/last/
reference, Manual/Guided/Automated AI, consent, and canonical job state.

### Browser Evidence Required

Use an owned active Series with nine shots to verify settings, drawer submit,
frame ordering, localized errors, busy queue, and canonical detail navigation.

## Exit criteria

Episode users submit safe image/video jobs with start/last/ordered references,
see the real queue/result, and never reach an alternate queue/editor.
