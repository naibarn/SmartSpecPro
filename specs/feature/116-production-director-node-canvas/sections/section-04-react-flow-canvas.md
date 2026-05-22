# Section 04: React Flow Canvas

## Goal

Render the generated plan as editable nodes and edges.

## Requirements

- Use existing React Flow.
- Support pan, zoom, fit view, node selection, edit drawer, reconnect edges, add/delete nodes, lock nodes, and save layout.
- Node types include planning/reasoning, `video_shot` group nodes, context/source asset, asset creation, image, video, TTS, music, sound effect, voice changer, speech-to-text, QA, human review, and handoff nodes. See Section 06 and Section 07 for the canonical node catalog.
- Edge types include uses_asset, requires_before, generates_for, qa_of, approval_gate, handoff_to, and fallback_to.
- Invalid connections show actionable warnings.
- Mobile and screen-reader fallback uses a structured plan list.

## Acceptance

- Canvas loads from planner output.
- User can edit node details and reconnect edges.
- Multiple image/video/audio nodes keep separate configuration snapshots and outputs.
- Shot group nodes can collapse/expand and link to the Video Shot workspace.
- Invalid canvas state blocks approval but does not destroy user edits.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator reviewing a generated production plan before spending credits.
- Goal: understand the plan, edit dependencies, fix invalid connections, open shots/nodes, and approve only when the graph is ready.
- Entry point: Production Workspace after fixture/live planner output, saved project restore, or result import.
- Success outcome: the same plan is understandable and editable through canvas interaction, keyboard commands, and list fallback.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Production canvas | `apps/web/client/src/features/media-production/components/ProductionCanvas.tsx` | Render nodes/edges, toolbars, status overlays, validation warnings, and list fallback toggle. |
| Shot group node | `ProductionShotGroupNode.tsx` | Show shot order, title, status, thumbnail, duration, warnings, collapse/expand, and open-shot action. |
| Node drawer | `ProductionNodeDrawer.tsx` | Show node summary, inputs/outputs, readiness, estimate, configure action, blockers, and debug payload only when permitted. |
| Canvas validation | shared/client canvas validation helpers | Validate edge/node changes before approval and map errors to friendly copy. |
| List fallback | `ProductionPlanListFallback.tsx` or equivalent | Keyboard/screen-reader/mobile alternative for every core canvas action. |

### Component Map

| Component | Owns | Consumes | Must expose |
| --- | --- | --- | --- |
| `ProductionCanvas` | viewport, fit/pan/zoom, node/edge state, selected item, list fallback toggle | `ProductionSpace`, validation result, feature flags | stable dimensions, no layout shift, keyboard shortcuts/help tooltip. |
| `ProductionShotGroupNode` | shot display and open-shot intent | `ProductionShot`, child node summaries, warnings | accessible name with order/status/readiness. |
| `ProductionNodeDrawer` | selected node details and actions | node config snapshot, tool binding, readiness, output refs | focus trap, return focus, Configure/Save/Back affordances. |
| `ProductionPlanListFallback` | ordered shots, nodes, edges, warnings | same graph model as canvas | open/reorder/reconnect/configure without drag/drop. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | Skeleton canvas area with stable toolbar height and no stale active project actions. | Screenshot and no stale node selected. |
| empty | Friendly drop/plan target plus `Create Plan Canvas`; no approve/handoff/execution actions. | Unit/UI test and mobile screenshot. |
| error | Validation or render failure panel with retry and list fallback. | Browser negative test for malformed planner output. |
| success | Canvas, verifier summary, warnings, approve/revise actions, and list fallback are visible. | Fixture E2E journey. |
| partial success | Partial plan marked incomplete; approve/handoff/execution disabled. | Planner partial-output test. |
| disabled/focus/hover/selected | Disabled actions explain why; selected node/edge is visible; focus ring appears on toolbar, node actions, drawer controls. | Keyboard and screenshot evidence. |
| conflict | Stale layout or graph save conflict shows reload/save-as-new path. | Router/UI conflict test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Canvas defaults to plan list. Toolbar is icon-first with labels in tooltips. Drawer is full-screen. Node actions remain reachable by list rows. | Mobile screenshot and keyboard/touch path. |
| 768x1024 | Canvas preview and list fallback can switch; drawer uses side or full-height panel without covering primary blockers. | Tablet screenshot. |
| 1280x800 | Canvas, node drawer, and verifier summary fit without overlapping fixed action bars. | Laptop screenshot and overflow check. |
| 1440x900 | Full canvas layout with mini-map/toolbar/status rail when implemented; list fallback still available. | Desktop screenshot and dark/light check. |

### Accessibility Acceptance

- Keyboard commands must cover: focus canvas/list, select next/previous node, open node drawer, open shot, configure node, delete with confirmation, begin reconnect through list fallback, save layout, approve, and return focus.
- React Flow node wrappers must have readable accessible names such as `Shot 03: Product demo, ready with warnings`.
- Edge reconnect must have a non-pointer fallback: choose source row, choose target row, select edge type, validate, save.
- Icon-only toolbar buttons need `aria-label`, tooltip, disabled reason where disabled, and visible focus.
- The drawer must trap focus, close safely, restore focus to the node/list row, and warn before discarding unsaved edits.
- Status changes from validation, save, and planner output should use polite live-region announcements.
- Canvas animation, auto-layout motion, edge animations, and minimap motion must respect reduced motion.

### Browser Evidence Required

- `implementation/ui-browser-evidence.md` must include screenshots/traces for canvas empty, loaded, invalid-edge, drawer-open, list-fallback, partial-output, schema-invalid, and disabled-feature states.
- Required assertions: no console errors, no horizontal overflow, focus visible on every toolbar/list/drawer action, accessible names for nodes and icon controls, dark/light readability, and no provider-credit reservation during canvas edit/save.
