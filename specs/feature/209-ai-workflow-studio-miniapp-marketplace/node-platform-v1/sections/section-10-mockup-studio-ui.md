# Section 10 — Mockup-led Workflow Studio UI/UX

## Goal

Replace the non-functional/static-feeling builder interactions with a usable
editor matching the supplied mockup, while keeping behavior registry-driven.

## Owned paths

- `apps/web/client/src/pages/WorkflowStudioPage.tsx`
- focused components under `apps/web/client/src/components/workflowStudio/`
- Feature 209 page/graph tests
- `apps/web/client/src/locales/{en,th}/` workflow strings.

## Existing pattern reference

Reuse `DynamicSkillForm`, `EditorMobileSheet`, `RenderProgressDialog`,
`ReviewWorkspacePanel`, `AIDraftModal`, Dashboard primitives, existing i18n,
and the current React Flow dependency. Diverge only for graph-specific ports,
edges, minimap, nested flow navigation, and canvas interactions.

## Implementation behavior

- Preserve the mockup’s top navigation, Dashboard return, language toggle,
  Build/Test/Runs/Analytics tabs, workflow title/version/status, Run/Publish
  actions, centered dotted canvas, bottom palette, right inspector, and bottom
  debug dock.
- Extract canvas, node card, palette, inspector, AI panel, run dock, and preview
  components so page logic is not one generic renderer.
- Render node cards from registry metadata: semantic icon/color, category/type,
  Main/Subflow badge, input/output handles, readiness, status, and output preview.
- Wire move, delete, edge add/delete, branch labels, resize, duplicate, undo/
  redo, zoom +/-/fit, minimap, and keyboard/tablet controls to graph state.
- Use Configure/Settings/Notes inspector tabs. Configure is a schema-driven
  form with mappings, friendly labels, field help, validation, output preview,
  and JSON advanced mode. Skill nodes use the real `input.json`/`ui.json` form.
- Show output as a node preview where compact, and a selected-node Output tab
  for full text/object/file/artifact previews.
- Show Main flow/Subflow breadcrumbs, parent-node name, double-click desktop
  entry, explicit tablet button, and return action.
- Keep truthful disabled/not-ready states and readable typography; do not add
  static buttons without handlers.

## UI/UX Contract

### Target User / JTBD

- Role: workflow builder/operator entering from Dashboard.
- Goal: assemble, configure, run, and debug a real workflow.
- Entry: Dashboard workflow link or `/studio/workflow`.
- Success: every core action works with mouse, touch, and keyboard, and results
  are understandable without raw JSON.

### Existing Pattern Reference

- Search: `rg` for `Resizable`, `ReactFlow`, `DynamicSkillForm`,
  `EditorMobileSheet`, `RenderProgressDialog`, `AIDraftModal`, and Dashboard
  primitives under `apps/web/client/src`.
- Found: paths listed above and in `claude-research.md`.
- Decision: reuse existing primitives and tokens; diverge only for graph-specific
  rendering and nested navigation.

### Surface Inventory

| Surface | Route/file | Change |
|---|---|---|
| Dashboard entry/return | Dashboard + Workflow Studio | working navigation |
| Builder canvas | WorkflowStudioPage + Canvas | graph editing |
| Node palette | workflowStudio components | registry search/categories |
| Inspector | workflowStudio components | schema form/bindings/output |
| Subflow | canvas/breadcrumbs | nested navigation |
| Run/debug dock | WorkflowStudioPage/components | live output/events/controls |
| AI panel | builder | draft/edit candidate review |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `WorkflowStudioCanvas` | React Flow/layout interaction | graph state, handlers |
| `WorkflowNodeCard` | node visual/status/ports | registry node, runtime state |
| `NodePalette` | search/add/drag/readiness | registry projection |
| `WorkflowInspector` | configure/settings/notes | schema, bindings, diagnostics |
| `SubflowBreadcrumbs` | flow identity/navigation | graph roots/parent node |
| `WorkflowRunDock` | run tabs/actions | run projection/events |
| `ArtifactPreview` | output/artifact display | authorized preview refs |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton and disabled actions | component/browser |
| empty | guided add-node and AI prompt | component/browser |
| error | inline field/edge/run error with recovery | component/browser |
| not-ready | reason and configure/provider action | component/browser |
| success | saved/published/run status and timestamp | browser |
| partial | checkpoint/output and resume/run-from | browser |
| approval | waiting reviewer controls | browser |
| retry/cancel | attempt/status/action state | browser |
| hover/focus/selected | visible border/focus/edge selection | accessibility/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | inspector/debug as sheets, primary actions reachable | screenshot/E2E |
| tablet 768x1024 | collapsible inspector and explicit buttons | screenshot/E2E |
| desktop 1440x900 | mockup three-region layout | screenshot/E2E |
| small-mobile 360x800 | no clipped toolbar/palette | screenshot |
| laptop 1024x768 | panel/canvas boundary works | screenshot |
| wide-desktop 1280x800 | dense graph remains legible | screenshot |

### Accessibility Acceptance

- Keyboard reaches toolbar, palette, nodes, edges/handles, inspector, tabs,
  dialogs, run controls, and destructive confirmations.
- Icon-only actions have labels; nodes announce semantic type/status/selected
  state; focus ring and contrast are visible; color is not the only signal.
- Reduced motion disables non-essential graph animation.

### Copy Contract

- Thai default, English switch/fallback; simple action labels and clear errors.
- Examples: `เพิ่ม Node`, `เชื่อมต่อ`, `ลบ`, `เปิด Subflow`, `ตั้งค่า`,
  `สร้าง Draft ด้วย AI`, `ตรวจสอบ`, `เริ่ม Run`, `หยุด`, `ลองใหม่`, `ดำเนินการต่อ`.
- Validation says what field/port is missing and how to fix it; no false
  “พร้อมใช้งาน” for unavailable adapters.

### Browser Evidence Required

Record all required viewport screenshots/E2E in
`node-platform-v1/implementation/ui-browser-evidence.md` following
`ui-browser-verification.md`, including canvas editing, subflow, inspector,
AI panel, run waiting approval, output/artifact, and error states.

## TDD-first checks

- Registry cards/forms differ by type and show correct ports/status.
- Add/move/delete/connect/delete-edge/resize/zoom/fit/duplicate/undo/redo work.
- Inspector form and advanced JSON round-trip work, including Skill schema.
- Dashboard return/language switch/tabs/responsive sheets/focus labels work.
- All loading/empty/error/not-ready/approval/partial/success states render.

## Exit criteria

The page is a functioning editor matching the attached mockup’s information
architecture, not a static preview or collection of inert buttons.
