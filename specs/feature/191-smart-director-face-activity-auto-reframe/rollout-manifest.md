# Feature 191 rollout manifest

| Wave | Scope | Flag/state | Canary | Rollback |
|---|---|---|---|---|
| 0 | shared contract/planner | disabled by default | unit fixtures | keep legacy camera plan |
| 1 | Face + Activity Quick preview | user opt-in | one Worker App fixture | switch to legacy `auto` |
| 2 | bounded Full Scan | `cameraAnalysisMode=full_scan` | short local clips | use Quick/Marks |
| 3 | canonical `video.composition_scan` job boundary | Feature 186 registry | one tenant/job class | quarantine and retain evidence |
| 4 | render parity and capability profiles | approved only after evidence | fixture video set | preserve previous plan |
| 5 | retirement of old automatic pattern | after metrics/recovery proof | staged tenant sample | leave legacy modes readable |

Every wave requires source/Mark/policy/capability fingerprints, no duplicate
side-effecting producer, bounded evidence, and a recovery/rollback record.
Production activation is blocked until hand/object/object-model capability and
deployment recovery evidence are accepted.

## Numeric enablement budgets

These are the initial measured-budget placeholders for the local rollout
fixtures. A wave owner must replace them with device/fixture evidence before
enabling the corresponding production class; an absent measurement is a
blocked gate, not an implicit unlimited budget.

| Class | Budget | Initial ceiling | Owner/evidence |
|---|---|---:|---|
| Quick preview | per-sample latency | 250 ms | Worker App owner / fixture timing |
| Quick preview | detector sample rate | 10 fps | Media Intelligence / capability profile |
| Full Scan | detector sample rate | 2–10 fps | Media Intelligence / fixture timing |
| Full Scan | maximum source duration | 90,000 ms | Worker App owner / native guard |
| Full Scan | inline track points | 256 | Media Intelligence / Python contract |
| Camera plan | keyframes | 512 | Worker App owner / shared + Rust validators |
| Evidence artifact | serialized provenance | 8 KiB | Worker App owner / Rust validator |
| Evidence artifact | serialized track metadata | 64 KiB | Worker App owner / Rust validator |
| Full Scan | concurrent jobs per worker | 1 | Feature 186 owner / deployment evidence |

CPU, memory, artifact-size, subject-clipping, fallback, and preview/render
parity ceilings remain mandatory rollout fields. They are intentionally left
as `TBD-blocked` until representative Worker/device fixtures measure them;
the class cannot be promoted on local unit tests alone.

The Wave 2/3 production gate also requires an end-to-end Worker App producer
and consumer for the canonical `video.composition_scan` job. The current local
button is a face/motion-only degraded fallback; it must not be treated as the
canonical Full Scan path until it submits through Feature 186, resumes from a
durable checkpoint, and consumes the source-bound evidence artifact.
