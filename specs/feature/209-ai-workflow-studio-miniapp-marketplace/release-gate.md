# Spec 209 Release Gate

## Mockup fidelity contract

The implementation keeps the attached mockup hierarchy as the acceptance
surface:

1. `01-main-builder-top-down.png`: persistent left navigation, breadcrumb and
   header, top-down compact graph, right Configure/Settings/Notes inspector,
   and bottom output/data/trace/logs/artifacts/cost drawer.
2. `02-subflow-data-binding.png`: same builder shell with subflow breadcrumb,
   typed input/output contracts and compatible-source binding chips.
3. `03-run-debug-mini-app.png`: Run surface with input/upload form, progress
   steps, activity log, artifacts and latest preview/recovery actions.

No new dashboard or replacement visual language is part of this feature.

| Gate | สถานะ | Evidence |
| --- | --- | --- |
| Semantic definition/version/access schema | Pass | `0341_feature_209_workflow_studio.sql` + contract tests |
| AI candidate compile/validation/acceptance | Pass | compiler tests |
| Builder/inspector/drawer UI structure | Pass (repository/browser) | `WorkflowStudioPage.tsx`; Playwright evidence covers 390x844, 768x1024 and 1440x900 |
| Subflow typed binding/stale event protection | Pass | binding tests |
| Run/Mini App immutable publication/ACL | Pass | Mini App tests |
| Economics/correlation/cost projection | Pass | Spec 207 integration contract tests |
| Real Job/Runner/provider production proof | Unverified | production Run mutation/executor, Runner/provider certification, artifacts/recovery and settlement still require external activation evidence |

Production publication is blocked until upstream runtime, economic
reconciliation and browser evidence gates are attached.
