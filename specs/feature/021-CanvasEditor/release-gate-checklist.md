# CanvasEditor v2 Release Gate Checklist

## Scope
- Feature: `021-CanvasEditor`
- Runtime gate: `PRESENTATION_EDITOR_ENABLED` (global) + export-write gate `PRESENTATION_EXPORTS_ENABLED`
- Rollout stages: `internal` -> `selected_tenants` -> `ramp_25` -> `ramp_50` -> `ramp_100`

## Owners
| Role | Owner | Responsibility |
|---|---|---|
| Release lead | `@web-oncall` | Go/no-go decisions, stage progression |
| Backend owner | `@backend-oncall` | Export/save/conflict health checks |
| Frontend owner | `@frontend-oncall` | Editor runtime + mobile safety verification |
| SRE owner | `@sre-oncall` | Alert routing and rollback execution |

## Required Signals
- `presentation.conflict.total`
- `presentation.save.success`
- `presentation.export.queued`
- `presentation.export.degradation_warning.total`
- `presentation.export.throttle_rejection.total`

## Stage Gates
| Stage | Entry Criteria | Abort Thresholds | Evidence |
|---|---|---|---|
| `internal` | Unit/integration suites green, rollback drill completed | Any blocker in release readiness artifacts | CI run link + drill record |
| `selected_tenants` | Dashboard readiness verified, alerts routed to on-call | Export failure rate > 4%, conflict rate > 5% | Dashboard screenshot + alert-route test |
| `ramp_25` | Selected tenant canary stable for 2h | Degradation warning rate > 25%, queue p95 > 120s | Metrics snapshot + sign-off |
| `ramp_50` | `ramp_25` stable for 4h | Autosave p95 > 1500ms or conflict spike sustained 15m | SLO report |
| `ramp_100` | `ramp_50` stable for 24h | Any release-gate regression or tenant data anomaly | Final go/no-go log |

## Performance and UX Gates
- Drag/transform p95 `<= 120ms`.
- Viewport framerate `>= 45 FPS` normal path and `>= 30 FPS` at stress path.
- Autosave mutation p95 `<= 1500ms`.
- Accessibility smoke checks pass for keyboard focus + warning semantics.

## Rollback Commands (Reference)
- Disable editor runtime: set `PRESENTATION_EDITOR_ENABLED=false`.
- Disable export writes only: set `PRESENTATION_EXPORTS_ENABLED=false`.
- Validate stable fallback route: `/document-management?scope=my_library&sort=updated_desc&mode=editor`.

## Regression Command Set
- `bash -lc "cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationEditorState.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts server/services/presentationPlaybackExport.test.ts server/services/presentationWorkflowRegression.test.ts client/src/e2e/presentation-editor.desktop.spec.ts client/src/e2e/presentation-editor.mobile.spec.ts client/src/e2e/presentation-editor.accessibility.spec.ts"`

## Flakiness Policy
- Zero tolerance for tenant-scope and permission boundary failures.
- Non-deterministic timing failures must be stabilized with fake timers before stage advancement.
- Any quarantined test requires explicit owner + removal ETA in launch decision log.

## Completion Checklist
- [ ] Regression suites completed and attached.
- [ ] Dashboard readiness check passed with required signals.
- [ ] Alert route test delivered to on-call and acknowledged.
- [ ] Rollback drill evidence attached (`detect`/`decide`/`execute`/`verify`).
- [ ] Backup and restore rehearsal artifacts attached.
- [ ] Launch decision recorded in `launch-decision-log.md`.
