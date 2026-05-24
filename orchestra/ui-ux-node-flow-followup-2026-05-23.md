# UI/UX Follow-Up Review - Production Director Node Flow

Date: 2026-05-23
Scope: Read-only review after prompt/generate node workflow additions.

## Evidence

- SocratiCode status: green.
- Browser evidence summary: `apps/web/test-results/production-director/browser-evidence-summary.json` status `pass`.
- Screenshots reviewed:
  - `apps/web/test-results/production-director/1440x900-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/360x800-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/1440x900-light-selected.png`
- Files inspected:
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx`
  - `apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx`
  - `apps/web/client/src/features/media-production/components/NodeConfigPanel.tsx`
  - `apps/web/client/src/pages/MediaStudio.tsx`

## Verdict

- Accessibility/responsive technical gate: PASS from existing browser evidence.
- User comprehension / workflow clarity: IMPROVEMENTS RECOMMENDED.
- Blocking visual defects: none found.

## Recommended Improvements

| Priority | Area | Finding | Recommended change |
|---|---|---|---|
| HIGH | End-to-end guidance | The workspace now has the mechanics, but users still need to infer the correct order: brief -> assets/evidence -> prompt node -> generate node -> QA/handoff. | Add a compact "Next best action" strip above the canvas showing the current step, why it matters, and one primary CTA. Use state from selected node/status/outputs to switch between "Run prompt", "Open generated prompt", "Run image/video/audio", "Review output", and "Send to review". |
| HIGH | Node comprehension | Nodes show a short preview and details, but the node card does not make input/output contracts visually obvious. | Add a 3-part node card structure: Input chips, Work/Prompt summary, Output preview. Use small media thumbnails for refs and a distinct prompt/output badge. |
| HIGH | Run semantics | `Run` and `Regenerate` exist, but users may not understand whether it spends credits, runs locally, or calls a provider. | Add a tiny cost/scope indicator beside the run button: "local prompt", "uses credits", "needs confirm", or "ready". Make provider-credit nodes require the existing confirm but show the reason before click. |
| MEDIUM | Prompt handoff visibility | Generated prompts are saved and passed downstream, but the relation is not visually explicit. | Show "Prompt from: [upstream node]" on generate nodes and a "Feeds: image/video/audio node" line on prompt nodes. Add a subtle edge label style for prompt edges. |
| MEDIUM | Asset assignment | Dragging assets into nodes works, but users may not know whether dropping on canvas creates a context asset or attaches to a node. | While dragging an asset, highlight eligible nodes as drop targets and show a temporary label "Drop to attach reference" vs "Drop empty space to add to canvas". |
| MEDIUM | Details panel | Expanded node details are useful but hidden inside the card and cramped for long prompt/output text. | Add a right-side or modal "Node Detail" view opened from Details/Open output, with tabs: Overview, Prompt, References, Outputs, Run log. Keep the card compact. |
| MEDIUM | Mobile workflow | Mobile technically passes, but screenshots show a long vertical stack before the right asset/history panel and safeguards. | Add a sticky mobile action bar for selected node: Details, Run/Regenerate, Attach, Output. Collapse lower panels into tabs: Assets, Evidence, Config, Safeguards. |
| MEDIUM | Node drawer | The drawer still presents many node types equally, while users need recommended next nodes. | Put "Recommended next" at the top based on current flow. For example after Script: Image Prompt, Video Prompt, Audio Prompt. Keep full catalog behind search/filter. |
| LOW | Copy/glossary | Some labels remain technical or mixed language (`Adapter`, `Output target`, `Prompt Packaging`, `dependency`). | Rename user-facing labels: Adapter -> วิธีรัน/ตัวเชื่อม, Output target -> ส่งผลลัพธ์ไปที่, Prompt Packaging -> เตรียมพรอมป์, dependency -> ลำดับงาน. |
| LOW | Empty right rail value | When only one fixture asset exists, History/Library/Marketplace looks sparse and disconnected from the production flow. | Add contextual empty/help state: "ลากรูปนี้ใส่ node เพื่อใช้เป็น reference" and show selected-node destination if a node is selected. |

## Suggested Implementation Order

1. Add selected-node next action strip and run-cost/scope labels.
2. Improve node cards with input/work/output structure.
3. Add drag-over node highlighting and explicit drop destination copy.
4. Add node detail drawer/modal for full prompt, references, outputs, and run log.
5. Add recommended-next node grouping in the drawer.
6. Collapse lower panels into mobile tabs/sticky selected-node actions.
7. Polish Thai/English glossary and edge/node labels.

## Acceptance Checks

- A new user can answer within 5 seconds: "What should I do next?"
- A selected node shows what it needs, what it will run, and where the result goes.
- Prompt nodes visibly feed generate nodes.
- Generate nodes visibly show provider/credit confirmation status.
- Dragging an asset gives live feedback for attach-vs-add behavior.
- Mobile selected-node workflow can run/details/output without scrolling through every panel.

## Implementation Pass

Completed in this follow-up pass:

- Added a workspace-level "Next best action" strip with contextual CTA.
- Upgraded canvas node cards to show input, run scope/cost, prompt, output, and feed/prompt-source hints.
- Added provider/credit/local-run indicators next to node run controls.
- Added drag-over feedback and eligible-node highlighting while dragging assets into the canvas.
- Added a selected-node detail panel with Overview, Prompt, References, Outputs, and Run log tabs.
- Added a sticky mobile selected-node action bar for configure/run/output.
- Collapsed lower mobile panels into Assets/Evidence/Config tabs.
- Added recommended-next grouping in the node drawer.
- Extended user-facing labels for prompt, reference, edge, and adapter terminology.

Verification:

- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed.
- `npm --prefix apps/web test -- client/src/features/media-production/production-director.e2e.test.tsx` passed 19/19.
- `npm --prefix apps/web run e2e:production-director-browser` passed 24/24.
