# Section 06 — Review projection and integration

## Goal

Make generated runs readable by the current Storyboard Review page without changing New Blank Project or legacy manual data.

## Projection

Map canonical run/shot rows to the existing `media_studio_storyboard_reviews`/task shape: ordered N tasks, prompt/image/video metadata, dialogue, image assets, skill/schema/model snapshots, and repair metadata. Upsert by run/shot identity. A projection error leaves `projection_pending`; `rebuildReviewProjection` is idempotent and only marks success after the review is readable.

## Route and menu

Add `/storyboard-review/new/skill-framework` before the parameter route and add a clearly labeled entry beside the existing New Blank Project action. Existing manual creation, six-task behavior, review controls, and old URLs remain unchanged.

## Tests

Project 2, 9, and 12 tasks through current review normalization; rebuild twice without duplicates; test projection failure/recovery; route ordering; and regression coverage for New Blank Project.

## UI/UX Contract

### Target User / JTBD
Creator lands in the familiar Review surface with generated shots and metadata intact.

### Surface Inventory
New Project menu, review route, shot list, image/prompt fields, run metadata, and rebuild/retry.

### Component Map
Projection adapts canonical data to existing tasks; manual projects keep their path.

### State Matrix
Support projection pending, readable, partial, failed, and rebuilding states.

### Responsive Matrix
Review cards retain prompt and status access on mobile, tablet, and desktop.

### Accessibility Acceptance
Menu, heading, task labels, and rebuild feedback are keyboard/screen-reader accessible.

### Copy Contract
Clearly distinguish Skill Framework from New Blank Project in both locales.

### Browser Evidence Required
Open both project types and verify the legacy flow remains unchanged.
