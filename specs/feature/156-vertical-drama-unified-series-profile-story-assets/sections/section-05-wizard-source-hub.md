# Section 05 — Wizard and Story Sources Hub

## Objective

Insert one profile-driven Story Sources & Media step into the existing six-step
wizard without changing stable step IDs, while making the order of operations
obvious: choose profile, prepare sources/slots, pass readiness, then draft.

## Target Files

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- `apps/web/client/src/components/verticalDramaSeries/StorySourcesHub.tsx`
- `apps/web/client/src/components/verticalDramaSeries/SourceSlotEditor.tsx`
- `apps/web/client/src/components/verticalDramaSeries/ProfilePicker.tsx`
- `apps/web/client/src/components/verticalDramaSeries/*.test.tsx`

## Tests First

1. Test stable six step IDs and profile-driven step visibility.
2. Test that the old separate format/look/evidence controls cannot contradict
   the selected profile.
3. Test staged session creation before series creation and attach on submit.
4. Test default slots by profile, unlimited custom-slot pagination, media/video
   slot editing, AI-description opt-in, and combined readiness with Draft QC.
5. Add browser proof for mobile/desktop happy, blocked, partial, and retry states.

## Implementation

- Keep `basic`, `story`, `characters`, `bible`, `product`, and `review` IDs.
  Re-label the `product` step to “เรื่องและสื่อประกอบ” / “Story Sources & Media”
  and render profile-specific source guidance inside it.
- Replace the separate creator-facing selectors with one ProfilePicker. Preserve
  legacy values only as migration display/warnings.
- Start a server-issued staged draft session when the wizard opens or when the
  source hub is first entered. Autosave pack changes with debounced idempotency.
- Render required default slots, user-created slots, and media/video previews;
  no hard UI limit, while server quota and pagination protect payload size.
- Make the final review button show one combined readiness panel for source pack,
  Draft Quality QC, and foundation receipt. Explain that production rights are a
  second state where applicable.

## UI/UX Contract

### Target User / JTBD

Prepare all facts, media, and story purpose before asking the system to draft.

### Surface Inventory

Profile picker, step navigation, Story Sources & Media hub, slot list/editor,
upload controls, generated-description action, readiness panel, and final review.

### Component Map

`CreateSeriesWizard` → `ProfilePicker` → `StorySourcesHub` → `SourceSlotEditor` →
`ReadinessPanel`; all use the existing design-system primitives and copy map.

### State Matrix

| State        | User-visible behavior                            | Allowed action    |
| ------------ | ------------------------------------------------ | ----------------- |
| Loading      | Skeleton and disabled draft action               | Wait              |
| Empty        | Profile-specific slot guidance                   | Add source        |
| Partial      | Progress and missing-slot explanation            | Add/edit/continue |
| Analyzing    | Per-slot progress, no data loss                  | Navigate or wait  |
| Blocked      | Actionable block list                            | Repair or edit    |
| Ready        | Draft action enabled, production rights separate | Draft             |
| Stale/failed | Preserve prior data and show retry               | Reanalyze         |

### Responsive Matrix

| Surface      | Mobile                                    | Desktop                      |
| ------------ | ----------------------------------------- | ---------------------------- |
| Wizard steps | Horizontal scroll with current-step label | Full step rail               |
| Slot list    | Single-column cards                       | Two/three-column media grid  |
| Editor       | Full-screen sheet                         | Side panel or modal          |
| Readiness    | Sticky bottom summary                     | Inline summary beside review |

### Accessibility Acceptance

Keyboard-operable steps and slots, labelled upload controls, focus restoration
after dialogs, live status for analysis, semantic errors, and no color-only state.

### Copy Contract

Use one name consistently: “เรื่องและสื่อประกอบ / Story Sources & Media”. Explain
“ต้องเตรียมส่วนนี้ก่อนร่างเรื่อง” for non-fiction/review profiles and label AI
text as a suggestion until accepted.

### Browser Evidence Required

Record a complete desktop and narrow viewport flow for restaurant review and
fiction, including profile choice, custom slot, image/video source, blocked gate,
repair, and successful draft handoff.

## Acceptance

- User can understand what to do first without opening a second tab or choosing
  mutually conflicting controls.
- Existing wizard step IDs and series creation payload compatibility remain intact.
