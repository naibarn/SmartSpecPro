# UI/UX Node Flow Re-Review - 2026-05-23

## Scope

- Surface: Media Studio Production Director, Production Flow Canvas, node cards, node detail panel, Context Assets, mobile flow.
- Request: Review the latest developed UI/UX and identify any remaining improvements that would help users understand the flow and work faster.
- Mode: Read-only review. No product code changes in this pass.

## Evidence Reviewed

- SocratiCode status: green, 90,304 indexed chunks, active watcher.
- Browser evidence summary: `apps/web/test-results/production-director/browser-evidence-summary.json` status `pass`.
- Screenshots:
  - `apps/web/test-results/production-director/1440x900-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/360x800-media-studio-live-auth.png`
- Relevant files:
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx`
  - `apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx`
  - `apps/web/client/src/features/media-production/components/NodeConfigPanel.tsx`
  - `apps/web/client/src/features/media-production/production-director.e2e.test.tsx`
  - `apps/web/tests/e2e/production-director-browser.spec.ts`

## Verdict

- Technical UI gate: PASS from existing browser evidence.
- Accessibility/overflow/page-scroll: PASS from existing browser evidence.
- User comprehension: IMPROVED, but more guidance is recommended before calling the workflow fully polished.
- Blocking visual defects: none found in the reviewed evidence.

The latest work clearly improves the system: node cards now show run scope, prompt/output hints, selected-node detail exists, mobile has selected-node actions, Context Assets have explicit attach actions, and the canvas keeps page scroll available. The remaining issues are mostly about reducing cognitive load and making important states visible in the first screenshot and in deterministic test evidence.

## Main Findings

| Priority | Area | Finding | Recommended improvement |
|---|---|---|---|
| HIGH | Evidence coverage | New important UX affordances are present in code but not explicitly asserted in the component/browser tests. Searches found no test assertions for `production-next-action`, `production-node-detail-panel`, `production-mobile-node-actions`, drag-over copy, recommended-next drawer, or prompt/feed labels. | Add deterministic tests for selected node detail tabs, next-action CTA, mobile selected-node bar, drag-over asset hint, recommended-next drawer, and prompt/output visibility. Browser evidence should screenshot at least one selected prompt/generate node with output. |
| HIGH | First-screen comprehension | The live desktop screenshot still makes users read many sections before understanding the current step. The Next Best Action strip exists after metrics, but it is not visible enough as the primary work guide in the first-screen flow. | Move or duplicate a compact "next action" summary into the top project/brief band, then keep the larger strip above the canvas. It should say: current step, why, primary action, and whether credits are involved. |
| HIGH | Mobile workflow length | The 360px screenshot is technically valid, but the page is very long and the right-rail/history content appears far below the canvas. Important actions still require long scrolling unless a node is selected. | Add a persistent mobile workflow rail/header with 3 states: project, selected node, output. Keep Add Node, Details, Run, Attach, Output accessible without scrolling through every panel. |
| MEDIUM | Selected-node detail placement | The selected-node detail panel is inline below the canvas. This is clear, but it pushes the Node Inspector and lower panels down and can make the canvas section feel heavy. | On desktop, consider a right-side drawer or split panel inside the canvas section. On mobile, keep inline details but collapse sections by default. |
| MEDIUM | Duplicate node action surfaces | Node cards, selected-node detail, mobile sticky bar, and Node Inspector all expose overlapping actions. This gives power users options, but it also creates visual repetition and makes the "official" next action less obvious. | Treat the selected-node detail/next-action as the primary action surface. Make Node Inspector a compact fallback list with fewer visible buttons and move secondary/destructive actions into More. |
| MEDIUM | Thai glossary polish | Some Thai locale labels still contain English technical terms such as `local prompt`, `Prompt`, `References`, `Outputs`, `Run log`, `Assets`, `Evidence`, and `Config`. | Apply a final Thai glossary pass: `local prompt` -> `สร้างพรอมป์ในระบบ`, `Prompt` -> `พรอมป์`, `References` -> `ไฟล์อ้างอิง`, `Outputs` -> `ผลลัพธ์`, `Run log` -> `บันทึกการทำงาน`, `Assets` -> `แอสเซ็ต`, `Evidence` -> `หลักฐาน`, `Config` -> `ตั้งค่า`. |
| MEDIUM | Asset drag/drop clarity | Context Assets now have explicit attach actions and the canvas has drag-over copy. However, the right history/library/marketplace panel still does not strongly show "attach to selected node" as the destination in the screenshot. | Add selected-node destination text/actions to every reusable media card in the right panel: `Attach to: <node title>` when a node is selected, and `Select a node to attach` when not selected. |
| MEDIUM | Node card density | Node cards now expose more useful information, but the card can become dense when title, prompt, status, input chips, output, and feed labels all appear together. | Keep node cards as summaries only: title, type/status, one-line "needs/does/produces", and one latest output thumbnail/text. Move long prompt/feed/reference details into the detail panel. |
| LOW | Drawer recommendation | Recommended next nodes are surfaced, but the full catalog is still close by and may distract new users. | Add an "Only recommended" default view when a node is selected, with full catalog behind search/filter. |
| LOW | Safeguards visibility | Mobile lower tabs currently group Assets/Evidence/Config, while safeguards remain part of the config column. Users may miss cancel/repair/handoff controls. | Add Safeguards as a fourth mobile tab or place execution controls in the selected-node sticky/action area. |

## Suggested Additional Test Scenarios

1. Desktop selected node: select an image/video/audio generate node and assert that the detail panel shows Overview, Prompt, References, Outputs, and Run log.
2. Node output return: run/regenerate a node with a mocked output and assert the output appears on the node card and in the Outputs tab.
3. Prompt chain: assert a prompt-agent node shows `Feeds`, and the downstream generate node shows `Prompt from`.
4. Mobile selected node: at 360px width, select a node and assert the sticky action bar exposes configure/run/output without horizontal overflow.
5. Drag media to node: simulate dragging a right-panel/history asset over the canvas and dropping on a node; assert the node receives a reference and the user sees attach feedback.
6. Thai locale: assert no English-only technical labels remain in the main node workflow for Thai mode.
7. Run/cancel semantics: assert a running node shows Cancel, completed node shows Regenerate, and credit-spending nodes show confirmation/cost before executing.

## Recommended Next Implementation Order

1. Add missing test coverage for the new UX affordances.
2. Make the next action visible in the first-screen project band.
3. Reduce duplicate Node Inspector actions and make selected-node detail the primary surface.
4. Add right-panel media card "Attach to selected node" destination states.
5. Polish Thai glossary for node workflow terms.
6. Add Safeguards/execution as a mobile tab or sticky selected-node control.
7. Re-run browser evidence and save screenshots for selected node, prompt chain, outputs, and mobile sticky action states.

## Completion Criteria

- A new user can answer these questions without guessing:
  - What should I do next?
  - What does this node need?
  - What will this node produce?
  - Will this action spend credits?
  - Where did this output go?
  - How do I attach this image/video/audio to the selected node?
- The screenshots visibly prove selected-node detail, output return, prompt chaining, mobile actions, and drag/attach behavior.
- Tests fail if the core guidance surfaces disappear.

## Implementation Follow-Up

Implemented in the follow-up pass:

- Added a compact next-action strip in the first project/brief band, while keeping the full next-action panel above the canvas.
- Reworked canvas node cards into a cleaner workflow-card UI with a status pill, surface accent rail, input/run/output chips, a short work summary, and compact action buttons.
- Removed forced fit-to-all initial canvas behavior so nodes open at a more readable default zoom.
- Added mobile side-panel tabs for Assets, Evidence, Config, and Safeguards.
- Added right-panel attach-to-selected-node affordances for History, Library, and Marketplace media, plus production asset drag payloads for dropping right-panel media onto canvas nodes.
- Updated Context Assets copy and button labels so the selected node destination is explicit.
- Added deterministic tests for next-action, selected-node detail tabs, node work summary, prompt/feed/output affordances, and attach-to-node actions.
- Updated browser evidence expectations to allow intentionally hidden inactive mobile tab panels while preserving overflow, overlap, page-scroll, and axe gates.

Verification after the follow-up pass:

- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed.
- `npm --prefix apps/web test -- client/src/features/media-production/production-director.e2e.test.tsx` passed 19/19.
- `npm --prefix apps/web run e2e:production-director-browser` passed 24/24.
