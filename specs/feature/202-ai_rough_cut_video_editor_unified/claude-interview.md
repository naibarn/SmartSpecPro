# Deep-plan interview transcript — Spec 202

This plan is being executed from the user's explicit instruction to complete
planning, implementation, and a minimum ten-round post-implementation audit.
No additional business answers were supplied, so the existing Spec 202/203
contracts and current code are the source of truth.

## Q1 — What should happen where the current Worker cannot execute a requested AI operation?

**Answer / applied decision:** Keep the operation visible but fail closed. If
there is no eligible executor, return a capability-blocked state with a reason;
if a valid executor capability exists but all agents are temporarily offline or
busy, expose waiting-agent state with bounded timeout/retry. Never report a
queued row as successful readiness.

## Q2 — Should legacy Web Editor data continue to work during migration?

**Answer / applied decision:** Yes. Preserve `/video-editor?legacy=1` through a
versioned read/convert adapter. All writes and jobs still pass through the
server-authoritative revision/CAS and snapshot boundary.

## Q3 — What is the acceptance boundary for AI algorithms that are not yet present in the repository?

**Answer / applied decision:** Implement typed contracts, deterministic compiler/
validator boundaries, capability admission, and honest fallback/degraded states
first. Do not fabricate full model behavior or claim production readiness from
a placeholder executor.

## Auto-decisions

- Follow existing TypeScript/Drizzle/tRPC/Vitest and Rust/Tauri conventions.
- Use current `worker_jobs` plus outbox as the only execution control plane.
- Do not run repository typecheck due the documented RAM restriction.
- Do not commit unrelated dirty changes; selected implementation changes may be
  left in the worktree when safe selective commits are not possible.
