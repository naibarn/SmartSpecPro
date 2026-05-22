# Section 01: Production Workspace UX

## Goal

Turn Production Director into an exclusive planning workspace inside Media Studio.

## Requirements

- Production tab renders only Production planning UI.
- Image/Video/Audio prompt composer and generate controls must not appear below Production.
- Project header is visible when Production is active:
  - current project,
  - save state,
  - search/open project,
  - new project,
  - thumbnails/status.
- Goal brief stays short:
  - project name,
  - concept,
  - audience/platform,
  - output type,
  - duration/aspect/language,
  - product/brand truth,
  - creative direction,
  - constraints.
- Use progressive disclosure for advanced settings.

## Acceptance

- Switching to Production does not render Image tab controls.
- Switching to Image/Video/Audio shows those standalone tabs normally.
- Saving/opening a Production project does not mutate unrelated media tab state unless user explicitly applies a node to that tab.

## UX State Matrix

Production must cover these states explicitly:

| State | User sees | Required actions | Must not happen |
| --- | --- | --- | --- |
| No project | Empty project-first workspace with short explanation, `Create Project`, `Search Projects`, and optional import from marketplace handoff. | Create/open/search. | No prompt composer, no provider generate button. |
| Draft project | Header, brief, context asset board, product evidence tray, planner selector, save state. | Save, add assets, create plan canvas. | Do not mutate Image/Video/Audio tab state. |
| Unsaved changes | Dirty indicator in header and save button. | Save, discard local edits, leave with warning where needed. | Do not auto-overwrite remote space. |
| Loading project | Skeleton or compact loading panel. | Cancel/close picker. | Do not show stale previous project as active. |
| Plan generating | Progress/status panel with skill/model used. | Cancel/retry when supported. | No provider generation credit reservation. |
| Planner failed | Friendly failure panel with failure code, schema/validation summary, and last safe draft version. | Retry with same inputs, edit brief/context, open debug payload if permitted. | Do not save malformed planner output as an approved or executable space. |
| Planner partial output | Partial plan preview clearly marked as incomplete, with missing shots/nodes listed. | Save as draft only, revise planner input, or discard partial plan. | Do not allow approve, handoff, or execution from partial output. |
| Planner schema invalid | Validation report mapped to user-facing missing/invalid fields. | Fix context/capability issue, retry planner, or switch to fixture/manual planning. | Do not expose raw schema stack traces to normal users. |
| Plan ready | Canvas, ordered shot overview, warnings, cost estimate, verify/approve/revise actions. | Edit nodes, open shots, verify, approve. | Do not allow handoff if blocking verifier issues exist. |
| Verifier blocked | Blocking issues grouped by shot/node/product/provider. | Fix node/shot, revise plan, request more evidence. | Do not hide blockers in raw JSON. |
| Approved | Approved badge, locked snapshot info, handoff/configure actions according to feature flags. | Handoff, configure node, execute allowed scope. | Do not silently unlock locked nodes. |
| Conflict | Conflict panel with local/remote version summary. | Reload latest, save as new version where safe, cancel. | No stale overwrite. |
| Feature disabled | Read-compatible state with why action is disabled. | Open existing project, switch tabs, copy/export where allowed. | No live planner/handoff/execution. |

## Project Search UX

Project search cards must show:

- thumbnail or neutral placeholder,
- project title,
- one-line description/goal,
- status,
- platform/audience when present,
- updated time,
- blocked/warning badge when latest verifier state requires attention.

The search/open flow must load the selected ProductionSpace and restore the selected tab context without inheriting unrelated Image/Video/Audio form state.

## Global UI/UX Completion Contract

Feature 116 is not implementation-ready until every user-facing surface below has a completed UI/UX contract, executable verification, and browser evidence. These contracts are release blockers for deep-implement, not optional review notes.

| Surface | Canonical section | Required proof |
| --- | --- | --- |
| Production Workspace | Section 01 | Goal-first journey, project header/search/save/new, brief, planner states, product evidence entry, no nested provider forms. |
| React Flow Canvas | Section 04 | Canvas and list fallback support edit/reconnect/add/delete/open/approve without drag-only behavior. |
| Video Shot Workspace | Section 07 | No-project, no-shot, stale-shot, selected-shot, locked-shot, and product-shot recovery states. |
| Node Drawer / Node Config Mode | Section 06 and Section 13 | Configure, Save to Node, Back to Production, conflict recovery, and isolated node snapshots. |
| Product Evidence Tray | Section 15 | Product identity, image roles, fidelity risk, claim/evidence linking, approvals, blockers, and shot usage. |
| Handoff / Execution / Export | Section 10 and Section 14 | Preview/live-disabled states, confirmation states, progress, failures, safe export, archive, restore, and permissions. |

## UI/UX Contract: Production Workspace

### Target User / JTBD

- Role: creator, marketer, or operator building a product/story/video workflow inside Media Studio.
- Goal: turn a plain creative goal plus existing assets into an approved, editable production plan before spending provider-generation credits.
- Entry point: Media Studio `Production` tab, Feature 115 marketplace storytelling handoff, saved Production project search, or a downstream result import.
- Success outcome: user can understand the next step, fix blockers, configure nodes, preview handoff payloads, and export/archive the project without guessing what a raw enum or provider key means.

### End-to-End Journey Stepper

Production Workspace must show the user's journey as a compact persistent stepper or checklist. The stepper may collapse on mobile, but the current step and blockers must remain visible.

| Step | Label EN | Label TH | Completion signal | Primary action |
| --- | --- | --- | --- | --- |
| 1 | Goal | เป้าหมาย | Brief has name, output type, audience/platform, and constraints. | Save goal |
| 2 | Assets | สินทรัพย์ | Required context/product/character/audio refs are added or explicitly skipped. | Add assets |
| 3 | Plan | แผนงาน | Planner fixture/live output validates into a draft ProductionSpace. | Create Plan Canvas |
| 4 | Fix blockers | แก้สิ่งที่ติดขัด | Verifier blockers are resolved or warnings are accepted by an allowed role. | Review blockers |
| 5 | Approve | อนุมัติ | Current space version is approved and locked. | Approve plan |
| 6 | Configure / Generate | ตั้งค่า / สร้าง | Image, Video, and basic TTS MVP nodes have config snapshots; generation needs credit confirmation. | Configure node |
| 7 | Review / Edit | ตรวจ / ตัดต่อ | Storyboard Review or Video Edit preview/live target is available. | Preview handoff |
| 8 | Export / Archive | ส่งออก / เก็บถาวร | Safe export or archive result is recorded. | Export project |

### Design Token Extraction

Sources:

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/ui/button.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/ui/tabs.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/ui/badge.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/dashboard`

Token summary:

- Color: use existing semantic tokens first (`background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`, `primary`, `accent`, `destructive`, `ring`). Sky/blue can remain a Media Studio accent, but warning/error/success states must use semantic status treatment and readable foregrounds.
- Typography: compact operational UI with small labels, readable body text, no hero-scale type inside work panels, no viewport-scaled text.
- Spacing: dense but scannable Media Studio layout, stable 8-16 px component gaps, fixed toolbar/control heights, and no layout shift when badges, hover states, or status labels change.
- Radius: follow existing shadcn/dashboard pattern, generally `rounded-md` or `rounded-lg`; do not create oversized rounded cards for nested tool surfaces.
- Elevation: prefer borders and subtle shadows from existing dashboard surfaces; modals/drawers may use overlay elevation.
- Motion: restrained transitions only; all canvas animations, drawer transitions, and loading shimmer must respect reduced motion.
- Component primitives: use existing Button, Badge, Tabs, Tooltip, Dialog/Drawer/Sheet equivalent, ScrollArea, Select, Popover/Command, dashboard surfaces, and lucide icons.
- Density: operational workspace, not a marketing landing page. Prioritize scanning, comparison, repeated action, and visible status.

Do not change:

- The existing Image/Video/Audio standalone surfaces.
- Existing shadcn focus ring and disabled opacity behavior.
- Existing Media Studio tab semantics unless the Production workspace is active.

### Visual Direction

- The first viewport must clearly signal the active Production project and current step, not a decorative hero.
- Use a three-zone mental model on desktop: project/brief context, plan/canvas or list, and evidence/status/actions.
- Use a stacked task model on mobile: Header, Stepper, Goal, Assets, Plan List, Preview/Status. Do not force a full canvas as the only primary view on mobile.
- Button hierarchy: one primary next action per state; secondary actions for save/open/retry; destructive actions require confirmation; provider-generation actions stay disabled until readiness and credit confirmation pass.
- Icon-only controls must use lucide icons, visible tooltips, and accessible names.
- Status colors must be semantic: blocked/destructive, warning/amber treatment, ready/success treatment, neutral/draft muted treatment. Color alone must never carry meaning.
- Focus ring: use existing `focus-visible:ring-ring/50` style or equivalent semantic ring on every interactive control, canvas node action, toolbar button, drawer control, and list fallback row.

### Responsive Matrix

| Viewport | Expected behavior | Blocking checks |
| --- | --- | --- |
| 390x844 mobile | Production shows stacked Header, Stepper, Goal, Assets, Plan List, and Preview/Status tabs. Canvas defaults to list fallback. Sticky primary action never covers content. Drawers become full-screen panels. | No horizontal overflow, no clipped Thai text, touch targets at least 44 px where practical, Save to Node reachable. |
| 768x1024 tablet | Two-column or stacked split is allowed. Canvas can show preview with list fallback available. Product Evidence Tray may become a collapsible side panel. | No overlapping drawer/canvas/toolbars, keyboard focus order remains logical. |
| 1280x800 laptop | Three-zone operational layout fits without hiding the stepper, header save state, verifier summary, and primary action. | Node drawer does not cover approval/handoff blockers; no text overflow in status badges. |
| 1440x900 desktop | Full workspace can show header, brief/asset rail, canvas, verifier/status rail, and footer/action bar. | Primary journey and blockers remain visible; dark/light readability passes. |

### Accessibility Acceptance

- Keyboard path: open Production, create/open project, save goal, add asset by click, create fixture plan, navigate canvas/list, open node drawer, open Video Shot, configure node, Save to Node, approve/preview handoff, export/archive.
- Focus order: header actions, stepper/current state, main content, contextual action rail, drawer/dialog content, then return to the trigger on close.
- Drawer/dialog behavior: trap focus while open, Escape closes when safe, focus returns to the launching node/row/action, unsaved changes prompt before close.
- Canvas/list fallback: every React Flow node and edge action must have a keyboard/list equivalent for open, configure, delete, reconnect/reorder where supported, approve, and view blockers.
- Labels/semantics: icon-only controls must have `aria-label` and tooltip text; node state badges must expose readable labels; status updates use polite live regions.
- Contrast: primary text, muted text, warning, destructive, disabled, and focus states must be readable in light and dark mode. Color-only warnings fail the gate.
- Reduced motion: canvas layout animation, auto-scroll, skeleton shimmer, and drawer transitions must be disabled or simplified when reduced motion is requested.

### Browser Evidence Gate

Before Feature 116 can be marked complete, implementation must produce `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md` with:

- route/surface list and changed files;
- build/dev server command;
- screenshot or trace references for 390x844, 768x1024, 1280x800, and 1440x900;
- console error result;
- keyboard-only journey result;
- no overflow/overlap result;
- loading, empty, error, disabled, hover, focus, selected, conflict, and success state evidence;
- dark/light readability result;
- accessible name and focus-trap result;
- skipped checks with blockers. Skipped browser evidence is not a pass.

Implementation must add or identify a deterministic browser command before release, for example `npm --prefix apps/web run e2e:production-director` wrapping a mocked Playwright route test. If no browser runner exists yet, the release gate remains failed until either the runner is added or an approved manual evidence file records every required check as inspected.

### Copy Contract

Use direct, recovery-oriented copy. Normal UI must not show raw provider keys, raw enum-only labels, private storage keys, internal adapter IDs, raw Feature 115 debug terms, or stack traces.

| Situation | EN copy intent | TH copy intent | Required action |
| --- | --- | --- | --- |
| Live handoff disabled | Preview handoff package. Live handoff is unavailable until this project is ready. | ดูตัวอย่างแพ็กเกจส่งต่อได้ แต่ยังส่งจริงไม่ได้จนกว่าโปรเจกต์จะพร้อม | Show preview, disabled live button, reason, next fix. |
| Provider generation disabled | Generate after approval and credit confirmation. | สร้างไฟล์ได้หลังอนุมัติแผนและยืนยันเครดิต | Show readiness blockers and credit confirmation path. |
| Planner failed | The planner could not create a usable plan. Your draft is safe. | ตัววางแผนยังสร้างแผนที่ใช้ได้ไม่ได้ ฉบับร่างยังปลอดภัย | Retry, edit inputs, view permitted debug summary. |
| Partial planner output | This plan is incomplete. Save as draft or revise before approval. | แผนนี้ยังไม่ครบ บันทึกเป็นร่างหรือแก้ก่อนอนุมัติ | Save draft, revise, discard. |
| Schema invalid | Some planner fields are missing or invalid. | ข้อมูลจากตัววางแผนบางส่วนขาดหรือไม่ถูกต้อง | Show field-level fixes, no raw stack trace. |
| Product evidence blocked | Product evidence is not ready for this shot. | หลักฐานสินค้ายังไม่พร้อมสำหรับช็อตนี้ | Relink image, approve claim, request more evidence. |
| Invalid canvas edge | This connection cannot run in that order. | การเชื่อมต่อนี้ยังรันตามลำดับนี้ไม่ได้ | Explain source/target issue and suggest valid targets. |
| Stale version conflict | A newer version exists. Reload or save a new version. | มีเวอร์ชันใหม่กว่าแล้ว โหลดล่าสุดหรือบันทึกเป็นเวอร์ชันใหม่ | Reload, compare summary, save as new where safe. |
| Permission denied | You do not have permission to change this Production project. | คุณไม่มีสิทธิ์แก้โปรเจกต์ Production นี้ | Read-only view, request access, switch project. |
| Export success | Export package is ready. Secrets and private URLs were excluded. | แพ็กเกจส่งออกพร้อมแล้ว โดยตัด secrets และ URL ส่วนตัวออกแล้ว | Open/download manifest, copy audit ref. |

### Execution Lifecycle Labels

| Internal state | EN label | TH label |
| --- | --- | --- |
| `draft` | Draft | ร่าง |
| `needs_config` | Needs setup | ต้องตั้งค่า |
| `ready` | Ready | พร้อม |
| `queued` | Queued | รอคิว |
| `reserving_credits` | Confirming credits | กำลังตรวจเครดิต |
| `running` | Generating | กำลังสร้าง |
| `completed` | Completed | เสร็จแล้ว |
| `qa_running` | Checking quality | กำลังตรวจคุณภาพ |
| `qa_passed` | Quality passed | ผ่านคุณภาพ |
| `qa_warning` | Passed with warnings | ผ่านพร้อมคำเตือน |
| `needs_revision` | Needs revision | ต้องแก้ไข |
| `failed` | Failed | ล้มเหลว |
| `cancelled` | Cancelled | ยกเลิกแล้ว |
