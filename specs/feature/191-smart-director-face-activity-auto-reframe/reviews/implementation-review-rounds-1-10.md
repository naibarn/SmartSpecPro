# Feature 191 implementation-versus-spec review

The review was run after implementation in ten explicit rounds. Findings were
patched before moving to the next round.

| Round | Focus | Finding | Immediate action | Result |
|---:|---|---|---|---|
| 1 | Contract/version | Rust `CameraMotionPlan` did not yet carry analysis/evidence fields and rejected the new mode. | Added optional serde fields, `face_activity` mode, and bounded validation. | Closed |
| 2 | Planner geometry | The old fixed auto pattern did not provide feasible crop bounds or activity-weighted target selection. | Added normalized target tracks, activity weighting, crop-bound clamping, smoothing, and bounded output. | Closed |
| 3 | Mark compatibility | Same-time inferred and user frames could compete; Mark revision was not represented in the plan evidence. | User Mark frames win dedupe; plan evidence includes Mark revision and stale-result invalidation. | Closed |
| 4 | Quick mode | Existing face sampling updated the anchor but did not feed the shared plan. | Quick detector samples now append bounded face track points and use the shared planner. | Closed |
| 5 | Full Scan | A status-only Full Scan would be misleading. | Added bounded whole-video seek sampling, checkpoint-style bounded evidence, motion intervals, approved/degraded status, and playback restoration. | Closed locally; provider/model gates remain explicit |
| 6 | Render parity | Local command rejected every non-manual reframe even when a validated plan existed. | Admission now permits automatic reframe only with a supplied validated plan; Rust remapping preserves provenance. | Closed |
| 7 | Feature 186 lifecycle | The scan contract was not represented at the canonical job boundary. | Added `video.composition_scan` allow-list/registry, validated enqueue helper, and idempotency metadata. | Closed at adapter boundary |
| 8 | Safety/privacy | Evidence could grow without a durable bound or include raw frames. | Capped points/intervals, stored fingerprints/evidence references only, and added malformed-input tests. | Closed |
| 9 | UI/recovery | Mark edits and missing detector evidence needed truthful states. | Added stale/degraded/quick/scanning/approved state transitions and preserved existing Mark controls. | Closed locally |
| 10 | Verification/operations | Full typecheck was unsafe for the stated RAM budget; repository-wide Rust formatting has unrelated pre-existing drift. | Ran focused Vitest, full Worker Cargo tests, Python unit/compile checks, and diff checks; did not run npm typecheck. Recorded formatting limitation without rewriting unrelated files. | Accepted with explicit limitation |

## Remaining production gates

The implementation is locally complete for the defined adapter and fallback
boundaries. Production completion still requires a validated hand/object model
profile (or an approved degraded policy), real Feature 186 deployment/recovery
evidence, preview/render parity sampling on fixture videos, and the rollout
canary/rollback evidence listed in `spec.md`. The code fails closed or exposes a
degraded state when those capabilities are absent; it does not fabricate tracks.
