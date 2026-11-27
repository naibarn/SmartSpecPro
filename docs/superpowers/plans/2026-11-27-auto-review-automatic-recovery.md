# Auto Review Automatic Recovery Implementation Plan

> Inline execution in the primary checkout, per repository policy.

**Goal:** Recover transient Auto Review worker failures automatically and create missing video prompts from approved images without requiring users to repair jobs.

**Architecture:** Use bounded canonical worker retries for idempotent LLM-only work. Reconcile approved storyboard checkpoints and enqueue one prompt-only job per missing shot, preserving successful outputs and existing video approval gates.

**Tech Stack:** TypeScript, Drizzle, Vitest, canonical `worker_jobs` + outbox.

**Spec:** `docs/superpowers/specs/2026-11-27-auto-review-automatic-recovery-design.md`

## Global Constraints

- Preserve approved artifacts and tenant ownership.
- Do not dispatch actual video generation as recovery.
- Keep recovery bounded and idempotent.
- Preserve unrelated workspace modifications.

## Review Focus

- Transient provider errors exhaust the bounded retry cap and surface a terminal status.
- A failed shot does not discard already generated prompt checkpoints.
- A video prompt is never generated without an approved image.
- Existing video prompts and media artifacts are not resubmitted.
- Duplicate reconciliation does not enqueue duplicate shot prompts.

### Task 1: Bounded retries for LLM-only worker operations

**Files:** `apps/web/server/services/marketplaceAutoReviewWorkerJob.ts`, its focused test.

- [x] Assert person detection and single-shot prompt jobs get 3 attempts while bulk media dispatch stays at 1.
- [x] Run the worker admission test and confirm RED.
- [x] Implement operation-scoped retry policy with existing transient error classes and bounded backoff.
- [x] Run the worker admission test and confirm GREEN.

### Task 2: Per-shot missing video prompt reconciliation

**Files:** `apps/web/server/services/marketplaceAutoReviewAutomation.ts`, new focused automation tests if test seams permit.

- [x] Add focused coverage that approved-image shots without current approved video prompts are selected individually; existing prompts are excluded.
- [x] Replace all-shot bulk prompt generation with deterministic single-shot prompt-only worker admissions and pass the configured public runtime URL.
- [x] Persist per-shot worker IDs, allow at most two deterministic replacement attempts after terminal worker failures (including legacy jobs with a one-attempt policy), and preserve successful shot results.
- [x] Resume one paused generic automatic-step failure after a code fix so already-running legacy continuations can recover; keep permanent and exhausted failures paused.
- [x] Run focused checks for automation and worker services.

### Task 3: Integrate, release, and verify

- [ ] Run targeted fast gate and inspect owned diff.
- [ ] Commit/push through the configured canonical path, reconcile `main` with `origin/main`.
- [ ] Deploy only `legacy-debian-dev` and verify live health plus core endpoints.
