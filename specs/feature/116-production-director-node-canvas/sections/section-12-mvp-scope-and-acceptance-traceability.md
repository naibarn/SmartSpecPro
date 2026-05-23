# Section 12: MVP Scope and Acceptance Traceability

## Goal

Prevent implementation scope creep by defining what must ship first, what can wait, and how requirements map to tests.

## MVP Must-Have

MVP must include:

- Production tab renders exclusively, not stacked above Image/Video/Audio forms.
- Project search/open/save for ProductionSpace.
- Brief panel.
- Context asset board with click-to-add and basic drag/drop.
- Product Evidence Tray with Feature 115 selected image import, image role, fidelity risk, evidence badges, and approval state.
- Per-shot product usage model for product-related shots.
- Character/provider asset search.
- Fixture-driven planner output renderer.
- Video Shot tab with shot list and shot editor.
- React Flow canvas with `video_shot` group nodes.
- Node drawer.
- Per-node config snapshot contract.
- Image node config handoff with `Save to Node`.
- Video node config handoff with `Save to Node`.
- Basic Audio TTS node config handoff with `Save to Node`.
- Save/load shots, nodes, canvas layout.
- Verifier/readiness display from fixture or deterministic schema.
- Storyboard Review and Video Edit handoff payload shape with ordered shots.
- Per-shot product evidence manifest in Storyboard Review and Video Edit handoff payloads.
- Completed UI/UX contracts for Production Workspace, React Flow Canvas, Video Shot Workspace, Node Drawer/Config Mode, Product Evidence Tray, and Handoff/Execution/Export.
- Browser evidence artifact with mobile/tablet/laptop/desktop screenshots or documented manual evidence.
- Keyboard-only and accessible-name coverage for the canonical goal-to-output journey.
- No provider-generation credits during planning/config-only flows.

## Should-Have After MVP

- Live planner/verifier calls.
- Music, sound effect, voice changer, speech-to-text node config handoff.
- Caption/subtitle node.
- Delivery variants.
- Batch run one shot.
- Continuity check node.
- Advanced product image recovery actions beyond relink/request more evidence.
- Legacy adapter on-save migration.
- Optimistic locking UI.
- Undo/redo.

## Canonical MVP Boundary

For implementation planning and deep-implement, this section is canonical for MVP scope.

MVP node configuration adapters are limited to:

- Image node config mode,
- Video node config mode,
- basic TTS Audio node config mode.

Music, sound effects, voice changer, speech-to-text, caption/subtitle, delivery variants, continuity checks, run-one-shot, and full matrix adapter coverage must stay out of MVP unless a later planning decision explicitly promotes them. Plans and tests may define the full node matrix, but MVP implementation packets must not require full matrix adapter implementation before the first release gate.

## Implementation Alignment Addendum

The production code must keep two separate statuses visible:

- **MVP enabled**: Image, Video, and basic TTS config adapters can save isolated node snapshots and may be run only after explicit generation confirmation.
- **Full matrix known but deferred**: Music, SFX, voice changer, STT, caption/subtitle, continuity, timeline assembly, final render, delivery variants, and publish/export node kinds may exist in the shared catalog and UI palette, but must render as disabled/deferred until their later release gates promote them.

The shared contract must expose a first-class node catalog with `adapterStatus` so tests can prove the UI did not accidentally enable a deferred adapter.

Server enforcement is required, not only UI disablement:

- `Save to Node` must reject node kinds whose catalog entry is `deferred` or `preview_only`;
- `Save to Node` must reject `toolSurface`/`adapter` mismatches against `PRODUCTION_NODE_CATALOG`;
- execution scheduling must reject `deferred`, `preview_only`, `disabled`, missing-config, and adapter-mismatched nodes before credit reservation or provider dispatch;
- shared validation may read legacy preview-only config snapshots, but new executable config saves must be catalog compliant.

Planning selection is MVP scope. The Production workspace must show:

- selected planning skill,
- Auto vs Manual model mode,
- selected model when manual,
- context-pack summary: asset count, shot count, product evidence status, target surfaces, and capability ids.

Downstream result sync-back is a release-gate item, but the MVP backend must include the safe import contract and tests. The import path must:

- reject stale `sourceSpaceVersion` as a conflict;
- record imported Storyboard Review / Video Edit result records;
- import selected takes, timeline cues, captions, product warning resolutions, and manual approvals;
- skip locked shot/node updates unless an explicit `allowLockedUpdates` flag is supplied;
- append a new ProductionSpace version instead of mutating an old version.

Runtime payload acceptance must be allowlisted for security-sensitive fields. Router schemas must validate node kind, node status, shot status, product evidence manifest, access policy, and tool binding metadata instead of accepting arbitrary `unknown` / passthrough data for those fields.

Handoff idempotency must be tenant-scoped. Preview and dispatch paths must include tenant context when deriving Storyboard Review or Video Edit payload identity keys.

## Later / Explicitly Deferred

- Full multi-user collaboration cursors.
- Real-time canvas co-editing.
- Full automated batch execution for every provider.
- Publish/export to social platforms.
- Dedicated advanced caption editor if Video Edit already covers MVP.
- Dedicated Storyboard Review project table if existing handoff records are sufficient.

## Requirement Traceability

| Requirement | Primary section | Acceptance proof |
| --- | --- | --- |
| Production tab not stacked over media forms | Section 01 | UI test: Production tab excludes Image/Video/Audio prompt composer. |
| Whole story breaks into shots | Section 07 | Planner fixture renders ordered `video_shot` nodes. |
| Shot owns child nodes | Section 07 | Save/load shot with independent child node graph. |
| Node config opens existing tool | Section 06 | Image/Video/Audio node handoff tests. |
| Node configs do not overwrite each other | Section 06 | Two image nodes preserve different snapshots. |
| Planning does not spend provider credits | Section 10 | Router/service test: planner/config paths do not reserve provider credits. |
| Storyboard Review receives ordered shots | Section 10/11 | Handoff payload snapshot test. |
| Video Edit receives timeline/captions | Section 10/11 | Handoff payload includes timeline/cue sheet. |
| Product images import from Feature 115 | Section 15 | Mapper test: `selectedProductImages` normalize to `ProductStoryboardAsset`. |
| Product claims remain evidence-backed | Section 15 | Validation test: `claimIds` map to approved/evidence-backed claim IDs. |
| Feature 115 readiness gates are honored | Section 15 | Negative tests: `needs_user_review`, `insufficient_evidence`, and unresolved `ready_with_warnings` block generation/handoff. |
| Claim risk/approval state is preserved | Section 15 | Mapper test: `EvidenceBackedClaim.risk` and `approvedByUser` normalize into `ProductClaimEvidenceMap`. |
| Product shots own per-shot usage | Section 15 | Save/load test: `ProductionShotProductUse` survives shot edits without mutating other shots. |
| Product Evidence Tray actions work | Section 15 | UI/router tests: approve/block role change, claim link, evidence link, request more evidence, relink. |
| Product tray and shot usage conflicts are visible | Section 15 | Conflict test: project-level product edits and shot-level usage edits do not silently overwrite. |
| Product evidence reaches Review/Edit | Section 15 | Handoff snapshot includes per-shot product evidence manifest. |
| Review/Edit results sync back | Section 11/15 | Import tests: `ProductionDownstreamResultImport` rejects stale source versions, records result status, updates selected takes/timeline/captions/product warning resolutions, and skips locked configs by default. |
| Old interim runs open | Section 09 | Legacy adapter test. |
| Migration is no-data-loss | Section 09 | Backfill/rollback tests preserve old run, goal, plan, verification, approval, asset plan, and projection records. |
| Unsupported planner tools blocked | Section 08 | Capability registry/verifier test. |
| MVP adapters are bounded | Section 13 | Shared catalog + UI tests prove Image, Video, and basic TTS are `mvp_enabled`, while full-matrix nodes render as `deferred` and cannot be added/run before promotion. |
| MVP adapters are server-enforced | Section 13 | Service/router tests prove `Save to Node` and execution reject deferred/preview-only/disabled nodes and adapter mismatches before credit reservation/provider dispatch. |
| Versioned saves reject stale edits | Section 08/13 | Router tests: stale `saveSpace`, `saveShot`, `saveNodeConfig`, and `saveCanvasLayout` return conflicts. |
| Mutating router procedures enforce ownership | Section 05/08 | Router tests cover cross-tenant, cross-user, unauthenticated, forbidden, and permission-denied cases for get/save/archive/export/handoff/import. |
| Mutating router procedures enforce tenant context matrix | Section 05/08 | Router tests cover missing tenant and cross-user rejection for every mutating ProductionSpace procedure: save, shot, node config, layout, archive, restore, delete, run, cancel, retry, product actions, stale-ref repair, and downstream import. |
| Execution scheduler uses existing media infra | Section 10 | Scheduler tests prove mediaGenerationService/credit/status/cancel/retry integration instead of duplicate provider submission. |
| Handoff builders are server-safe | Section 10 | Shared builder tests prove Video Edit/Storyboard Review payloads work without importing client-only modules into server code. |
| Feature flags are deterministic | Section 14 | Flag truth-table tests cover disabled/read-safe/fixture/live modes and kill-switch precedence. |
| UI/UX contracts are complete | Section 01/04/06/07/10/14/15 | Review gate confirms every required field from `ui-ux-planning-contract.md` is present or explicitly marked N/A with reason. |
| Responsive behavior is proven | Section 01/04/06/07/10/14/15 | Browser evidence covers 390x844, 768x1024, 1280x800, and 1440x900 with no overlap/overflow on primary flows. |
| Accessibility is executable | Section 01/04/06/07/10/14/15 | Keyboard-only path, focus trap/restore, icon labels, accessible names, contrast, reduced motion, and axe/WCAG or documented equivalent pass. |
| Canonical user journey works | Section 01/12 | Browser/E2E proof: create goal, add asset/product evidence, render fixture plan, edit/reconnect/list fallback, configure Image/Video/TTS, Save to Node, approve/preview handoff, verify zero provider-credit spend. |
| UI copy explains recovery | Section 01/10/14/15 | Thai/English copy tests or snapshot review cover live-disabled, provider-disabled, planner failed/partial/schema-invalid, product blocked, invalid edge, stale conflict, permission denied, export success. |
| Execution state copy is first-class | Section 10/14 | UI tests cover confirm, progress, failure/retry, cancellation, and reconcile copy in the Production workspace execution status panel. |
| Visual/token strategy is followed | Section 01 | Visual review confirms semantic tokens, button hierarchy, status colors, focus rings, dark/light readability, and operational density match existing Media Studio/shadcn patterns. |

## Release Gate

Do not enable live execution until:

- MVP UI tests pass,
- shared contract tests pass,
- planner fixture tests pass,
- legacy adapter can read existing runs,
- `Save to Node` is implemented for at least Image/Video/basic TTS,
- product image bridge mapper and Product Evidence Tray tests pass,
- product evidence manifests are present in Storyboard Review and Video Edit handoff snapshots,
- downstream result record import handles stale source-version conflicts, selected takes, timeline/caption updates, product warning resolution, manual approvals, locked-config skips, and idempotent record replacement,
- server-side catalog enforcement rejects deferred/preview-only/disabled node config saves and execution attempts,
- router schemas allowlist security-sensitive ProductionSpace payload fields and reject unsupported node kinds/statuses,
- handoff idempotency keys are tenant-scoped,
- `needs_user_review`, `insufficient_evidence`, claim risk, and warning-acceptance gates block unsafe generation,
- stale version tests pass for space, shot, node config, and canvas layout saves,
- archive/export, audit events, metrics, stale-ref repair, and kill switches exist for ProductionSpace,
- credit reservation tests prove planning/config-only paths are safe.
- scheduler integration tests prove existing media generation, credit reservation/refund, polling/status, cancellation, and retry contracts are used.
- migration/backfill/rollback/schema-version tests pass or the release package explicitly proves the MVP migration is additive/no-data-loss and leaves legacy records untouched until an admin/backfill migration is enabled.
- mutating router authorization and tenant isolation tests pass for every new procedure.
- `implementation/ui-browser-evidence.md` exists and records browser evidence or explicit skipped checks for every required viewport and state. Skipped browser evidence is not a pass.
- Canonical E2E/browser journey passes with mocked provider/credit APIs and proves planning, canvas edits, node config, Save to Node, approval, handoff preview, and export/archive readiness without provider-generation credit spend.
- Accessibility gates pass for keyboard-only navigation, focus trap/restore, accessible names for icon-only controls, contrast/dark-light readability, reduced motion, and axe/WCAG or documented equivalent.

Do not enable Storyboard Review / Video Edit live handoff until downstream result sync can import selected takes, timeline changes, captions, and product warning resolution back into Production without overwriting locked node configs.
