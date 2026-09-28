# Plan review round 1 — architecture and ownership

## Checks

- One canonical source remains `worker_jobs`; the plan does not add a Web job
  ledger.
- Shared camera planner and shared cut map are the only cross-runtime outputs.
- Browser analysis owns capability/provenance only; server owns dispatch,
  authorization, promotion, and render settlement.

## Finding and resolution

The first draft did not explicitly identify the already-shipped Worker App
MediaPipe runtime. The plan now requires reuse of `@mediapipe/tasks-vision`
1.0.1, the same model/WASM assets, and shared pure normalization. No further
ownership gap remains for this round.

## Result

PASS after the reuse decision was added to research, plan, and browser section.
