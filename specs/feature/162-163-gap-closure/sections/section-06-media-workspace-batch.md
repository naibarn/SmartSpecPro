# Section 06 — Media Workspace Batch Integration

## Goal

Make the Worker Media Workspace useful for a full footage folder rather than a
single manually typed source file.

## Owned files

- `apps/worker-app/src/SeriesWorkspacePanel.tsx`
- `apps/worker-app/src/screens/media-workspace/MediaWorkspaceHost.tsx`
- typed native commands/state and queue/published projections
- focused Worker UI/native integration tests

## Implementation

Show inventory rows with probe/analysis/status, allow bounded multi-select and
AI-assisted/manual policy review, submit batch jobs with per-file progress, and
surface derived QC/publication/index state. Preserve existing source root,
binding revision, idempotency, and local-only semantics.

## Acceptance

Folder scan, selection, mixed outcomes, cancel/retry, ready artifact retention,
and published/indexed projection states are usable without exposing absolute
paths or creating duplicate coordinators.

## UI/UX Contract

### Target User / JTBD

Operator needs to turn a local footage folder into trustworthy Series assets
with the fewest manual reviews while retaining control over edits and focus.

### Surface Inventory

Folder binding, scan summary, inventory table, AI recommendation, manual
overrides, multi-select, dead-air/reframe controls, progress, QC, retry/cancel,
and publication/index status.

### Component Map

Media Workspace owns inventory and batch intent; native commands own local
processing; remote projections expose only safe IDs, statuses, and artifacts.

### State Matrix

Unbound, scanning, no media, needs review, queued, processing, mixed result,
ready locally, uploading, indexed, failed, and canceled are distinct states.

### Responsive Matrix

Desktop supports dense inventory rows; narrow screens use stacked asset cards
with selection and primary batch actions fixed near the list header.

### Accessibility Acceptance

Selection controls have labels, progress has a text equivalent, focus targets
remain reachable, and AI recommendations are editable rather than implicit.

### Copy Contract

Explain “ตัด dead air”, “ปรับเฟรมตามบุคคล/วัตถุ”, “ตรวจสอบก่อนส่งขึ้น R2”,
and “สร้างดัชนี AI” in plain language with safe defaults.

### Browser Evidence Required

Verify scan, review, multi-select, mixed-result, retry, and published/indexed
states using a local path that is never rendered to the server projection.
