# section-05-character-stock-and-start-frames

## Goal

Implement durable character stock, 3x3 contact-sheet batch generation, cropped candidate-frame persistence, and final selected start frames for each episode.

## Depends On

- section-01-skill-packages
- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline

## Files

Create:

- `apps/web/server/services/verticalDramaCharacterAssetService.ts`
- `apps/web/server/services/verticalDramaStartFrameService.ts`
- `apps/web/server/services/verticalDramaContactSheetService.ts`
- `apps/web/shared/verticalDramaSeries/characterAssets.ts`
- `apps/web/shared/verticalDramaSeries/startFrames.ts`
- `apps/web/shared/verticalDramaSeries/contactSheets.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaContactSheetPicker.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaFrameRepairDialog.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCandidateVersionStrip.tsx`
- focused tests for character assets, contact sheets, cropping, and selection

## Core Contracts

- `VerticalDramaCharacterAsset`
- `VerticalDramaStartFramePlan`
- `VerticalDramaContactSheetBatchPlan`
- `VerticalDramaContactSheetGenerationJobGroup`
- `VerticalDramaContactSheetAsset`
- `VerticalDramaSelectedStartFrame`

## Start-Frame Plan Builder Outputs

The start-frame plan builder in `verticalDramaStartFrameService` (backing the `vertical-drama-shot-start-frame-render` skill, spec §6.4 / spec lines 233-248) must emit, in addition to the 9 render requests, the following per-plan outputs:

- **Per-frame QC checklist** — for each of the 9 start frames, a structured checklist covering identity match, aspect ratio (9:16), required character/product references present, and continuity notes satisfied.
- **Per-frame repair-prompt template** — for each frame, a reusable repair-prompt template (image prompt + negative prompt scaffold) so a failed/`needs_repair` frame can be regenerated without re-deriving the prompt.
- **Downstream video-input manifest** — a manifest that maps each approved start frame to its downstream video shot input (shot number, selected media asset ID, first/last-frame vs first-frame-only role), consumable by the motion-prompt/video stage.

These outputs stay linked to the shot number and `promptSetId` so QC results and repairs can be traced back to the originating render request.

## Contact-Sheet Behavior

- Default mode: `contact_sheet_3x3_batch`.
- Default image model: `google-banana-2-lite`, resolved through the app model registry.
- Image model dropdown lists every enabled image model that can produce valid candidates directly or through crop/pad/resize.
- Sheet count presets include 3 and 6.
- 3 sheets produce 27 candidate frames.
- 6 sheets produce 54 candidate frames.
- Full contact-sheet and cropped frames stay linked for audit and repair.
- Candidate approval requires explicit user selection.
- `vdflow render-images` maps to this section's image generation/import service for character references, full 3x3 sheets, cropped candidates, and selected start-frame manifests.
- Image generation/import must be independently callable from the episode runner and must not proceed until prompts, model IDs, references, and credit estimates are visible.

## Start-Frame Generation Modes

Per spec §7.5 (spec lines 1251-1254), `verticalDramaStartFrameService` must support **two** start-frame generation modes, not just contact sheets:

1. `single_frame_per_shot` — generate or import exactly **one** start-frame asset per shot (9 shots -> 9 frames). No 3x3 sheet, no cropping, one prompt set per shot, one media asset per shot. Selection is implicit: the single generated/imported frame becomes the candidate for that shot and still requires explicit approval before Storyboard Review handoff.
2. `contact_sheet_3x3_batch` — default MVP mode; generate one or more 3x3 contact-sheet images, crop each sheet into 9 candidate frames, then let the user select the best frame per shot.

Mode-selection UI note:

- The start-frame stage exposes a mode selector (`single_frame_per_shot` vs `contact_sheet_3x3_batch`) before any paid generation.
- `contact_sheet_3x3_batch` is preselected as the default; switching modes must not lose already-approved character stock or already-selected frames.
- In `single_frame_per_shot` mode the sheet-count preset, crop controls, and candidate-comparison grid are hidden; the surface collapses to a per-shot single-frame prompt/preview list.
- Both modes share the same prompt/model/credit visibility gate: paid generation stays blocked until visible prompts and model choice are approved.

## Image Model Dropdown And Incompatibility Reason Codes

Per spec §7.5 (spec lines 1260-1261), the image-model dropdown is **not** a filter. It must list every enabled `type = "image"` model from the current model registry, and models that cannot directly produce 9:16-compatible images stay **visible and selectable** rather than being removed.

- Every enabled `type = "image"` model is listed; none are hidden or filtered out.
- A model that cannot directly produce a 9:16-compatible image but can still yield valid 9:16 candidates through the contact-sheet crop/pad/resize path remains selectable, annotated with the path that makes it valid.
- A model that cannot produce valid 9:16 candidates through any supported path remains **listed and visible** but is surfaced with a clear machine-readable incompatibility **reason code** (e.g. `no_9_16_support`, `crop_pad_resize_unavailable`, `unsupported_output_dimensions`) plus human-readable copy, instead of being silently dropped.
- Reason codes are returned by the image-model resolver so the UI can render the incompatibility badge/tooltip and, where applicable, disable the approve-to-generate action for that specific model while keeping it visible in the list.
- `google-banana-2-lite` remains preselected unless tenant policy or model availability overrides it.

## Regeneration And Frame-Replace Controls

Per spec §7.5 (spec line 1358), the candidate picker must expose **three distinct** regeneration/replace controls after generation:

1. **Regenerate whole sheet** — re-run generation for one full contact sheet (all 9 cells / one `promptSetId` -> new `fullSheetMediaAssetId` and 9 new cropped candidates), scoped to a single `sheetIndex`.
2. **Regenerate single prompt set** — re-run one prompt set's generation (`promptSetId`) without touching other sheets in the job group.
3. **Replace single cropped frame** — replace one cropped candidate frame (`candidateFrameId`) for one `shotNumber` — via re-crop or targeted single-frame regeneration — without regenerating the rest of the sheet.

Each control must show its own credit estimate and stay behind the prompt/model approval gate before any paid re-generation.

## Repair-Without-Deletion Rule

Per spec §7.5 (spec line 1367), a failed crop or a wrong-frame QC result must create a **repair request** that does **not** delete the full contact sheet:

- The `fullSheetMediaAssetId` and its `VerticalDramaContactSheetAsset` record are preserved when a crop fails or a candidate frame is marked `qcStatus: "failed"` / `"needs_repair"`.
- Repair operates on the affected `candidateFrameId` (re-crop or replace), leaving the source sheet and all sibling candidate frames intact and still linked for audit and later prompt tuning.
- Only explicit user action may discard a full sheet; QC/crop failure never triggers implicit sheet deletion.

## Candidate-Frame Repair And Version Lineage

Per spec §7.5 (spec lines 1358, 1367, 1406-1413), §11.6 (repair route, spec lines 2162-2175), §16 (QC And Repair, spec lines 2453-2489), and the supersede semantics of §11.2 (spec line 2033), the picker must let the user actually **fix a bad frame** and **review old ones**, not merely approve/select. The following controls are additive to the three regeneration/replace controls above.

### Per-candidate-frame reject/flag with reason

- Every `VerticalDramaFrameCandidateCard` exposes a **reject/flag** affordance in addition to select/approve, so a specific start-frame candidate can be marked wrong.
- Rejecting/flagging captures a **reason**: free-text `reason` plus an optional machine-readable `reasonCode` (e.g. `identity_drift`, `wrong_aspect_ratio`, `crop_artifact`, `wrong_pose`, `product_mismatch`, `other`).
- Rejecting a candidate sets its `qcStatus` to `"needs_repair"` and records `{ candidateFrameId, shotNumber, reason, reasonCode, rejectedByUserId, rejectedAt }` without deleting the candidate or its source contact sheet (Repair-Without-Deletion Rule).
- The reject/flag reason is durable metadata carried alongside the candidate so it can prefill the repair instruction and appear in the audit chain.

### "Repair this frame" dialog wired to the repair route

- Each candidate card offers an explicit **Repair this frame** action opening a per-frame `VerticalDramaFrameRepairDialog`.
- The dialog's instruction textarea is **prefilled** from that frame's per-frame repair-prompt template (see Start-Frame Plan Builder Outputs: image prompt + negative prompt scaffold), seeded further by the reject/flag `reason`/`reasonCode` when present. The user may edit the instruction before submitting.
- The dialog shows **model and credit visibility** (target image model ID plus this repair's own credit estimate) and stays behind the prompt/model approval gate — no paid repair generation runs until the visible instruction and model are approved.
- Submitting posts to the shared repair route (`vdflow repair` equivalent, §11.6) with the same logical inputs as the GitHub repair command: `stage: "start_frame_image"`, `artifactId` (the source `contactSheetId` / candidate artifact), the target `shotNumber` and `candidateFrameId`, and the `instruction`. The mapped repair action is `regenerate_start_frame`.
- The repair creates a **new, non-destructive candidate version** that supersedes the prior candidate for that shot; it records `sourceArtifactIds` and `repairRequestIds`, marks the prior candidate `state: "superseded"`, and **never deletes** the full contact sheet or sibling candidates. A durable `repair` audit event references the repair artifact (§11.7).

### Version / lineage strip (browse + compare + pick the fix)

- Each shot exposes a per-shot **version/lineage strip** (`VerticalDramaCandidateVersionStrip`) that lists the superseded old candidate(s) alongside the new repaired candidate for that `shotNumber`.
- The strip is built by walking `sourceArtifactIds` back through the repair chain, so the full audit lineage (original candidate -> repaired candidate -> re-repaired candidate) is browsable in order.
- Every version in the strip is selectable, and the strip offers an **old-vs-new compare view** (side-by-side original candidate vs repaired candidate) so the user can judge the fix before choosing.
- The user can **re-select** any version as the approved start frame for that shot; re-selecting updates `VerticalDramaSelectedStartFrame` without mutating or deleting any superseded version.

### Candidate archive toggle

- The picker exposes a **"show replaced / all candidates"** toggle so previously replaced, superseded, or unselected candidate frames remain viewable after a selection is made.
- The toggle also applies on a **completed (read-only) episode**: replaced and superseded candidates stay retrievable for audit even after the episode is finished; the read-only surface disables repair/select actions but still renders the archived candidates and their lineage.
- Default view shows current/active candidates; toggling on reveals the archived (`superseded` / replaced / rejected) candidates, each labelled with its state and, where present, its reject reason.

### Per-shot repair on the storyboard/frame grid

- A per-shot **repair entry point** is reachable directly from the storyboard/frame grid (not only from a whole-sheet control), so repair is available at **shot granularity**.
- The shot-level entry maps to the `repair_storyboard_shot` / `regenerate_start_frame` repair actions (§16 recommended repairs) and opens the same `VerticalDramaFrameRepairDialog` targeting that shot's current candidate (`shotNumber` + `candidateFrameId`).
- This guarantees a bad frame can be repaired from wherever the shot is visible — whole-sheet regeneration is never the only path to a fix.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator reviewing visual continuity.
- Goal: compare many generated candidates cheaply and select the best frame per shot.
- Entry point: episode workspace start-frame stage.
- Success outcome: 8-9 approved start frames ready for Storyboard Review handoff.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Character stock panel | episode/detail workspace | approve/reject/stale character refs |
| Contact-sheet prompt review | episode workspace | view/edit prompts before generation |
| Candidate picker | episode workspace | compare full sheets and cropped frames |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaCharacterStockPanel` | component | character asset state | character service |
| `VerticalDramaContactSheetPicker` | component | prompt visibility, batch status, selection | contact-sheet service |
| `VerticalDramaFrameCandidateCard` | component | candidate display, selection, and reject/flag-with-reason | cropped frame metadata |
| `VerticalDramaFrameRepairDialog` | component | per-frame repair instruction (prefilled), model/credit visibility, repair-route submit | repair route, repair-prompt template |
| `VerticalDramaCandidateVersionStrip` | component | per-shot version/lineage browse, old-vs-new compare, re-select, archive toggle | candidate lineage via `sourceArtifactIds` |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | batch/status skeleton | component test |
| empty | generate/import CTA | component test |
| error | per-sheet retry/cancel reason | unit/UI test |
| success | selected frame pinned per shot | component test |
| disabled | generation disabled until prompt/model approval | unit test |
| selected/focus/hover | keyboard selectable candidates | browser evidence |
| rejected/flagged | candidate marked needs_repair with visible reason | component test |
| repairing | repair dialog prefilled, model/credit visible, submit gated | unit/UI test |
| versioned | lineage strip shows superseded + current, old-vs-new compare | component test |
| archived/read-only | replaced/superseded candidates retrievable via toggle; actions disabled on completed episode | component test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | one-column candidate list with sticky selected summary | screenshot |
| tablet 768x1024 | two-column candidate/sheet comparison | screenshot |
| desktop 1440x900 | dense sheet + candidate comparison | screenshot |
| laptop 1024x768 | no overlap between prompt panel and candidate grid | extended screenshot |
| wide-desktop 1280x800 | grid remains scan-friendly | extended screenshot |

### Accessibility Acceptance

- Candidate buttons expose shot number, sheet, and cell.
- Selection state is conveyed by text and ARIA state.
- Retry/cancel controls have accessible labels.
- Keyboard users can select and unselect candidates.
- Reject/flag, "Repair this frame", version-strip re-select, and archive-toggle controls have accessible labels and expose their state.
- The old-vs-new compare view labels which side is the superseded original and which is the repaired candidate.

### Copy Contract

- Prompt/model/credit visibility copy must state paid generation has not happened yet.
- Error copy must distinguish provider failure, crop failure, wrong aspect ratio, and rejected candidate.
- Repair-dialog copy must state the instruction is prefilled from the repair template and that repair creates a new version instead of overwriting or deleting the original.
- Archive-toggle copy must make clear that replaced/superseded candidates are retained for audit and remain viewable on completed episodes.

### Browser Evidence Required

Capture prompt-review, generating, ready-for-selection, and selected states.

## Tests First

- Test: character asset states transition through draft, generated/imported, approved, rejected, stale.
- Test: character reference change marks storyboard, start-frame, and motion prompt stages stale.
- Test: start-frame plan contains exactly 9 vertical render requests.
- Test: image model resolver lists every enabled image model and preselects `google-banana-2-lite`.
- Test: contact-sheet mode can plan 3 sheets -> 27 candidates and 6 sheets -> 54 candidates.
- Test: generation job group tracks `parallelJobLimit`, job IDs, expected/completed counts, and statuses.
- Test: app-safe `vdflow render-images` equivalent invokes the same character/start-frame image generation or import contracts.
- Test: every prompt, model ID, and credit estimate is visible before paid image generation.
- Test: crop is deterministic and persists crop box and resulting media asset ID.
- Test: cropped candidates validate or crop/pad/resize to 9:16 before approval.
- Test: user selection persists one selected candidate per shot.
- Test: cross-tenant/deleted assets cannot be attached.
- Test: `verticalDramaStartFrameService` supports `single_frame_per_shot` mode and plans exactly 9 single-frame render/import requests (one asset per shot, no cropping).
- Test: mode selector defaults to `contact_sheet_3x3_batch` and switching to `single_frame_per_shot` preserves approved character stock and existing selections.
- Test: incompatible image models remain listed with a reason code (image-model resolver returns every enabled `type = "image"` model; models with no valid 9:16 path stay selectable/visible and carry a machine-readable incompatibility reason code).
- Component test: candidate picker exposes three distinct controls — regenerate a whole sheet, regenerate a single prompt set, and replace a single cropped frame — each scoped to the correct `sheetIndex` / `promptSetId` / `candidateFrameId`.
- Test: start-frame plan builder emits a per-frame QC checklist, a per-frame repair-prompt template, and a downstream video-input manifest for the 9 frames.
- Test: a failed crop or `qcStatus: "failed" | "needs_repair"` creates a repair request without deleting the full contact sheet (preserves `fullSheetMediaAssetId` and sibling candidate frames).
- Component test: rejecting a candidate on `VerticalDramaFrameCandidateCard` records a reason (free text + optional `reasonCode`) and marks the candidate `qcStatus: "needs_repair"` without deleting it or its source sheet.
- Test: repair-from-frame submits the target (`stage: "start_frame_image"`, `artifactId`, `shotNumber`, `candidateFrameId`) plus instruction to the repair route and yields a NEW superseding candidate version (records `sourceArtifactIds`/`repairRequestIds`, marks prior `superseded`) without deleting the contact sheet.
- Test: repair dialog prefills the instruction from the per-frame repair-prompt template and stays behind the prompt/model approval gate with model + credit visibility before any paid repair.
- Component test: the version/lineage strip walks `sourceArtifactIds` to list superseded + current candidates for a shot, offers an old-vs-new compare, and lets the user re-select any version as the approved start frame.
- Component test: replaced/superseded/rejected candidates are retrievable via the "show replaced / all candidates" toggle, including on a completed (read-only) episode where repair/select actions are disabled.
- Test: a per-shot repair entry point on the storyboard/frame grid maps to `repair_storyboard_shot` / `regenerate_start_frame` and opens the frame repair dialog targeting that shot's candidate (`shotNumber` + `candidateFrameId`).

## Implementation Tasks

1. Add character asset relation helpers and state transitions.
2. Add start-frame request planning from shotgrid.
3. Add contact-sheet batch planner and job group orchestration.
4. Add media asset records for full sheets and cropped candidates.
5. Add deterministic 3x3 crop metadata and crop/pad/resize fallback.
6. Add per-sheet retry/cancel controls and failure artifacts.
7. Add selection state and approved start-frame manifest.
8. Add prompt visibility and edit/regenerate controls.
9. Add runner/admin-safe entry points equivalent to `vdflow render-images`.
10. Add `single_frame_per_shot` mode planning plus the mode selector and its collapsed single-frame UI.
11. Surface incompatibility reason codes from the image-model resolver and keep incompatible models visible/selectable in the dropdown.
12. Add the three regeneration controls (whole sheet / single prompt set / replace single cropped frame) to the candidate picker.
13. Emit per-frame QC checklist, per-frame repair-prompt template, and downstream video-input manifest from the start-frame plan builder.
14. Enforce repair-without-deletion so crop/QC failures create repair requests that preserve `fullSheetMediaAssetId`.
15. Add per-candidate reject/flag-with-reason (`reason` + optional `reasonCode`) on `VerticalDramaFrameCandidateCard` that marks the candidate `needs_repair` without deleting it or its sheet.
16. Add `VerticalDramaFrameRepairDialog` with a repair-prompt-template-prefilled instruction, model/credit visibility, and approval gate; wire submit to the repair route with `stage`/`artifactId`/`shotNumber`/`candidateFrameId`/`instruction` to create a new superseding candidate version.
17. Add `VerticalDramaCandidateVersionStrip` that walks `sourceArtifactIds` to browse superseded + current candidates, provides old-vs-new compare, and supports re-selecting the fixed frame.
18. Add the "show replaced / all candidates" archive toggle so replaced/superseded/rejected candidates stay retrievable, including on completed read-only episodes.
19. Add a per-shot repair entry point on the storyboard/frame grid mapping to `repair_storyboard_shot` / `regenerate_start_frame` so repair is reachable at shot granularity.

## Acceptance

- Series workspace shows approved character stock.
- Episode start-frame stage can be reviewed and repaired before paid generation.
- Multiple 3x3 batches can run concurrently within `parallelJobLimit`.
- User can compare candidates and select final start frames for 8-9 video shots.
- No cropped frame reaches Storyboard Review until explicitly selected.
- A bad candidate frame can be rejected with a reason, repaired at frame or shot granularity, and its fix picked from a browsable version lineage, all without deleting the original or its contact sheet.
- Replaced and superseded candidates remain viewable via the archive toggle, including on completed read-only episodes.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaCharacter
cd apps/web && pnpm test -- verticalDramaStartFrame
cd apps/web && pnpm check
```
