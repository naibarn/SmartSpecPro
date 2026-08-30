# Section 04 — Storyboard Stop Frame UI

## Goal

Add an attractive, understandable Stop Frame slot next to the existing Start
Frame slot without changing start labels, start test IDs, or start usage.

## Owned files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardReviewPanel.tsx`
- existing locale files and focused component/page tests

## Interaction contract

## Implementation status

Complete. Storyboard and fallback workspace expose an optional Stop slot,
separate prompt/image actions, authorized picker selection, and paid-render
confirmation without changing Start controls.

The page owns stop job/task polling, authorized URLs, picker target, and errors;
the panel renders state and emits `{ shotNumber, role }`. Picker targets are
explicitly `{ type: "startFrame" | "stopFrame", shotNumber }`, with no
fall-through. Existing upload/history/library/lightbox/editor/confirmation
primitives are reused.

Each shot card gets a “ภาพสำหรับวิดีโอ” frame-pair area with equal 9:16 Start
and Stop previews and a subtle directional connector. Start stays primary and
required. Stop is optional and independent:

- `สร้าง prompt Stop Frame` calls only stop prompt generation.
- `สร้างภาพ Stop Frame` requires an existing stop prompt and explicit credit
  confirmation.
- `เปลี่ยนภาพ Stop Frame` can select authorized existing media without a stop
  prompt; AI rendering cannot.
- stop failure/stale/unsupported states do not disable start actions.

Use Thai-first i18n with English fallback. Required copy includes
`Stop Frame ไม่บังคับ — ใช้เมื่อเครื่องมือวิดีโอรองรับ` and the disabled
explanation `สร้าง start prompt ก่อน เพื่อใช้เป็นหลักยึดความต่อเนื่อง`.

## UI/UX Contract

### Target User / JTBD

- Target user: authenticated Vertical Drama creator editing an episode shot.
- Success: user can choose start-only or start+stop and sees what video receives.
- Responsive: 390x844 and 360x800 stack without overflow; 768x1024 remains
  readable; 1024x768 and 1280x800 preserve dense storyboard usability; 1440x900
  shows balanced adjacent 9:16 cards and connector.
- Accessibility: keyboard order is Start preview/actions, Stop preview/actions,
  then shared shot actions; every control/status has role+shot accessible name;
  visible focus, contrast, dark/light, and reduced-motion support remain.
- No icon-only primary actions. Show role-specific errors and stale/expired
  explanation.

### Surface Inventory

| Surface | Owner | Change |
| --- | --- | --- |
| Shot card frame pair | `VerticalDramaStoryboardPanel` | Add Start/Stop 9:16 slots |
| Prompt/image actions | panel + episode page | Add role-specific callbacks |
| Media picker | episode page/shared picker | Add explicit stop target |
| Review panel | `VerticalDramaStoryboardReviewPanel` | Show stop readiness/attachment |

### Component Map

Reuse current preview, upload, history/library picker, lightbox, prompt editor,
confirmation, and task-polling primitives. Add only a role-aware frame-pair
wrapper and stop action controls; do not duplicate authorization or polling.

### State Matrix

| UI state | Start | Stop |
| --- | --- | --- |
| empty | existing required state | optional empty state |
| prompt ready | existing | stop image action enabled |
| loading | existing | independent stop loading |
| success | existing | thumbnail, replace, clear |
| error/stale/expired | existing | role-specific recovery |
| unsupported | existing | notice; start remains enabled |

### Responsive Matrix

| Viewport | Required behavior |
| --- | --- |
| 390x844 / 360x800 | stacked slots, no horizontal overflow |
| 768x1024 / 1024x768 | readable compact layout, no clipped actions |
| 1280x800 / 1440x900 | balanced adjacent slots and connector |

### Accessibility Acceptance

Keyboard order is Start preview/actions, Stop preview/actions, then shared shot
actions. Accessible names include shot number and role. Visible focus, contrast,
reduced motion, and non-icon-only primary actions are required.

### Copy Contract

Thai-first with English fallback. Use `Start Frame`, `Stop Frame`,
`สร้าง prompt Stop Frame`, `สร้างภาพ Stop Frame`, `เปลี่ยนภาพ Stop Frame`,
and `Stop Frame ไม่บังคับ — ใช้เมื่อเครื่องมือวิดีโอรองรับ`.

### Browser Evidence Required

Record authenticated mobile/tablet/desktop checks in
`implementation/ui-browser-evidence.md`; report browser/auth blockers as
skipped rather than passing them.

## Test-first stubs

Render/interaction/state/reload tests, picker isolation, prompt-vs-image action
separation, start compatibility, i18n fallback, keyboard order/focus, mobile
overflow, dark/light readability, and unsupported provider notice.

## Dependencies and outputs

Consumes Section 02 procedures/state and Section 03 canonical URL/motion state.
Produces a role-aware storyboard UI and browser evidence file; does not change
the existing Start Frame workflow.
