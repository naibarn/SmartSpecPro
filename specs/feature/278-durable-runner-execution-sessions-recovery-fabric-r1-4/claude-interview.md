# Deep Plan Interview — Spec 278 R1.4

## Q&A

No product clarification was needed. The user explicitly requested deep-plan and full deep-implement coverage of Spec 278, including all planned sections and at least ten post-implementation gap-review rounds with immediate fixes.

## Auto-decisions

- Preserve `worker_jobs` as canonical job/lease/terminal authority; durable session data is a separate linked execution continuity projection.
- Implement in spec milestone order and keep feature-gated/dark projection before behavior changes.
- Use additive migrations and avoid production data operations in this local implementation task.
- Preserve unrelated dirty work. The current shared `orchestra/` has an active unrelated session marker, so Spec 278 orchestration state is isolated in this feature directory.
- Do not create commits on protected/dirty `main`; do not stage unrelated user changes.
- Cloudflare snapshot semantics are reconstructable, not live-process persistence.
- No external beta/production certification claim without the spec's independent soak and environment evidence.
