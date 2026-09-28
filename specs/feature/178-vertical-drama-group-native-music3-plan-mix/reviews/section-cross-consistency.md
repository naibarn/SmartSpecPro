# Section Cross-Consistency Review

## Round 1

| Check | Result | Evidence |
|---|---|---|
| Interface alignment | PASS | All sections use `scopeType`, `productionGroupId`, `groupRevision`, `planRevision` and `sourceHash`; existing job kinds remain `episode_audio_analyze`, `minimax_music3_generate` and `episode_score_mix`. |
| Coverage gaps | PASS | Schema, final-cut publication, Web service/router, Worker ASR/Music3/mix/QC, UI and integration proof each have an owning section. |
| Overlaps | PASS | Section 01 owns contracts/schema; section 02 owns Web final-cut/services/router; section 03 owns Worker execution; section 04 owns UI; section 05 owns proof. |
| Dependency order | PASS | 01 precedes 02/03, both precede UI/integration, and integration is last. |
| Self-containment | PASS | Each section lists ownership paths, requirements, test stubs and exit criteria. |
| UI evidence | PASS | Every section has the required UI/UX headings; section 04 contains the full state/responsive/accessibility/copy contract. |

## Review fixes

The first consistency pass found that the plan could be read as introducing new
`production_episode_*` job kinds while the current scheduler already uses the
three existing audio job kinds. The plan and section 01 were corrected to use
the existing job kinds with an explicit production-group scope discriminator.
The shared contract, scheduler, callback and Rust parser must therefore be
updated together in implementation wave 01/03.

## Round 2

Rechecked all section references after the correction. No dangling job kind,
scope field or dependency remains.

## Round 3 — 20-round audit reconciliation

Rechecked the additions made during the completeness audit: the pipeline-run
table is owned by section 01 and orchestrated by section 02; composition and
speech edit-map artifacts are owned by sections 02/03; typed export/QC artifact
kinds are owned by section 01 and published by section 03; batch readiness,
feature-flag-off heading behavior and runtime evidence are owned by sections 04/
05. Dependencies remain 01 → 02/03 → 04 → 05. PASS.
