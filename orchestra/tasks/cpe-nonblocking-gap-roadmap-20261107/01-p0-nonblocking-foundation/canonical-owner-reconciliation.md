# CPE Canonical Owner Reconciliation

## Snapshot

- Current source: `main` at `50595c8c5c99970f481aa19b202edeb8111dd6af`.
- Candidate feature handoffs read on 2026-11-07 have `OPEN` for every row and `RECONCILIATION_REQUIRED`; their evidence freshness is `UNKNOWN`. This is unresolved verification state, not proof that source code is absent.
- Features 137, 138, 140, 139, 149, 150, 155, 157, 167, 170, 173, and 175 contain respectively 34, 31, 16, 18, 80, 85, 114, 170, 116, 100, 192, and 28 open ledger rows. Quick 298 has 15 open rows. Do not close whole ledgers from this CPE slice.

## CPE requirement mapping

| CPE | Primary canonical owner | Related specs | Source and focused evidence surface | Current disposition |
|---|---|---|---|
| 01 Director and shot intent | Feature 191 | Feature 140 | `verticalDramaShotSceneIntent.ts`; `verticalDramaEpisodePipeline.ts`; pipeline scene-contract and location/continuity tests | Source exists; storyboard facts and fallback proof remain incomplete. |
| 02 Composition and camera movement | Feature 137 | Features 173 and 191; Quick 298 | `videoPromptMotionAssurance.ts`; `verticalDramaVideoMotionPromptGeneration.ts`; motion-assurance tests; video prompt router tests | Source exists; face-observability was incorrectly treated as a generation blocker (P0 fix). |
| 03 Lighting and color | Feature 139 | Feature 173 | `seriesLookLock.ts`; look-lock/preset UI and prompt projection tests | Existing look-lock path; cross-path snapshot/version evidence remains open. |
| 04 Character identity | Feature 137 | Features 140 and 157 | `verticalDramaClipIdentityQc.ts`; `verticalDramaEpisodes.ts`; clip identity QC and router tests | QC path exists; prove warning/failure leaves successful clip readable and downloadable. |
| 05 Wardrobe and props | Feature 140 | Feature 137 | Shot-fact, wardrobe, and object-reference contracts/services; pipeline scene-contract tests | Existing pieces; end-to-end prompt projection and nonblocking proof remain open. |
| 06 Scene and location consistency | Feature 138 | Feature 140 | `verticalDramaSceneContinuityLock.ts`; `verticalDramaSceneVisualState.ts`; pipeline continuity and location tests | Existing fail-open enrichment; verify stale/error cases preserve generation. |
| 07 First and last frame | Feature 167 | Features 137 and 170 | Start/stop frame routes and plan contracts; start/stop frame route/service tests | Existing path; stale/missing optional last frame fallback proof and ledger evidence remain open. |
| 08 Model routing | Feature 170 | Features 173 and 186 | `verticalDramaProvider.ts`; provider routing and media transport resolver; provider capability tests | Existing routing; compatibility/tenant/budget fallback matrix remains open. |
| 09 Preview and approvals | Feature 157 | Quick 298 | `VerticalDramaStoryboardPanel.tsx`; manual approve/reject/cancel routes and component/router tests | Existing user-controlled flow; no-new-CPE-wait regression proof remains open. |
| 10 Visual QA | Feature 157 | Features 150 and 137 | `verticalDramaQc.ts`; frame continuity/clip identity QC; QC and router tests | Existing QC; advisory verdict versus media readiness needs regression proof. |
| 11 Repair and selective regeneration | Feature 157 | Features 137 and 149 | `verticalDramaEpisodeRepair.ts`; episode repair/regeneration routes; repair-stage and asset lineage tests | Existing bounded/manual repair seams; failed candidate preservation and billing proof remain open. |
| 12 Dialogue and lip sync | Feature 175 | Features 170 and 157 | `verticalDramaDialogueAudio.ts`; audio planning/QC and video prompt contracts; dialogue/audio tests | Partial primitives exist; exact lip-sync coverage and optional-QC fallback remain open. |
| 13 Sound and editing | Feature 175 | Feature 157 | Audio coordinator/mastering/QC and episode assembly services; audio/assembly tests | Feature 175 is unresolved; media and audio acceptance needs implementation/evidence. |
| 14 Cross-episode continuity | Feature 138 | Features 140 and 157 | Series memory planner, story bible and continuity facts; pipeline memory/continuity tests | Existing memory path; stale/missing-context and tenant-scope proof remains open. |
| 15 Cost-aware rendering | Feature 155 | Feature 157 | Existing `creditService.ts`, `pricingCalculator.ts`, reservations and idempotency; budget/credit tests | Generic billing primitives exist; series forecast/reserve/cap ledger is a real gap. |
| 16 Styles and templates | Feature 139 | Feature 173; Quick 298 | Series look-lock, presets and prompt projection; look-lock/preset tests | Existing pieces; unified optional application and snapshot-version evidence remains open. |

## Nonblocking acceptance mapping

| Requirement | Existing owner(s) | Relevant source/test surface | Evidence gap |
|---|---|---|---|
| NB-01 feature-off preserves baseline | Feature 157 | Pipeline and router feature-flag paths | No complete parity matrix across storyboard, image, video, assembly. |
| NB-02 missing/timeout/invalid/stale CPE falls back | Features 138, 140, 157 | Scene-intent, scene-continuity, prompt assurance and pipeline fallback tests | Some fail-open cases exist; no complete cross-stage injection matrix. |
| NB-03 quality, identity and continuity findings stay advisory | Features 137, 150, 157 | Video safety gate, motion assurance, QC, render routes and storyboard component | Confirmed blockers in route, prompt assurance and UI; addressed in P0 implementation. |
| NB-04 preserve latest successful asset | Features 137 and 157 | Clip identity QC, repair routes, media asset lineage and download projection | Direct warning/failure API and UI proof remains open. |
| NB-05 preserve manual approval/reject/cancel; add no CPE wait | Features 157 and 186 | Existing approval/cancellation routes and worker-job adapters | Need negative-control regression proof. |
| NB-06 bounded, compatible and authorized provider routing | Features 170, 173, 186 | Provider resolver, allowlists, capability and task admission tests | Full fallback matrix remains open. |
| NB-07 budget, idempotency and no duplicate charge | Feature 155; Feature 157 | Credit reservations/debit service and idempotency tests | Series-scoped forecast/reserve/cap accounting remains unimplemented. |
| NB-08 tenant/asset ownership, safety, capability, cancellation | Features 137, 157, 186 | Existing owner-scoped routers, media resolver and cancellation tests | Retain hard controls; add negative controls to the CPE matrix. |

No candidate canonical ledger was changed by this reconciliation. The shared Spec handoff writer requires fresh implementation and verification evidence bound to a canonical SHA before any row can become `PASS`; the mapping above does not satisfy that predicate by itself.
