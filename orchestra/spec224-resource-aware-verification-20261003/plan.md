# Resource-Aware Verification — Phase 0–2

## Intent and scope

Implement the user's approved resource-aware verification workflow for Spec 224 only. This branch is based on the clean `origin/main` commit `b8d6c7fd5769bf217afbc20b98fa6fdc2cbb703e`; do not import or modify the dirty `/home/dev/projects/SmartSpecPro` worktree. Do not modify feature code for Specs 260, 262, or 266.

## Phase 0 — inventory findings

- Only the repository-root `AGENTS.md` exists in the inspected checkout.
- Root scripts are `pnpm exec turbo run build` and `pnpm exec turbo run typecheck`; `turbo.json` has no concurrency cap, and typecheck depends on upstream builds.
- `apps/web` defines `check` and `typecheck` as `tsc --noEmit` with an 8192 MiB Node heap; its atomic Vite build permits 6144 MiB. Full test and coverage profiles are broader still.
- CI has independent jobs plus a `turbo_build` job that runs `pnpm exec turbo run build typecheck` without `--concurrency=1`; distinct runners do not serialize full checks.
- `tsconfig.base.json` enables composite projects, but the app tsconfigs do not provide a root project-reference solution.
- Spec 224 already defines verification profiles (§36), outcome classes (§8), capacity admission (§124), durable `worker_jobs` lease/fencing, and evidence/final verification. Runtime has a canonical development-run/event/job path, but no explicit verification-resource admission or resource-failure classification was found.
- `worker_jobs` already has active dedupe, owner token, lease expiry, heartbeat and fencing version. A separate lease table is not justified in Phase 0–2 unless implementation proves the canonical job plane cannot safely provide the needed singleton.
- Discovery used bounded `rg`, manifest reads, schema/service reads and CI reads; no specialized code index was available. Two inventory command errors were recorded and recovered: the first Node manifest helper attempted to `require()` TOML and emitted `Invalid left-hand side in assignment`; Python config was then read with bounded `sed`. A guessed Drizzle test path returned `No such file`; `rg --files apps/web/drizzle` identified the actual migration test conventions under `apps/web/drizzle/__tests__`.

## Design decision

Add a small Spec 224 verification-control contract that is independent of feature code. Model profile selection, resource admission, one active FULL verification lease per repository identity, expiry reclamation with fencing, scoped-check independence, outcome classification, and a typed evidence bundle. Keep long-running verification jobs on the canonical worker-job/outbox plane; a single-row lease table supplies only repository-wide FULL exclusion, not a second queue or job engine. Bind resource outcomes to Spec 224 development-run events without using them as repairable code failures.

## Requirements-to-tests matrix

| Requirement | Focused test |
|---|---|
| Host and cgroup v1/v2 memory sampling with successive OOM delta | fake host/cgroup sampler reports bounded headroom and OOM delta |
| OOM/exit 137/heap exhaustion is `RESOURCE_BLOCKED` | classify explicit OOM, 137, and heap markers |
| concurrent FULL verification admits one lease | two concurrent acquisitions yield one winner |
| expired lease can be reclaimed safely | expiry permits new owner and increments fencing generation; prior owner cannot heartbeat/release |
| scoped/package verification is not blocked by FULL lease | scope-aware admission allows independent scoped work |
| code and baseline failures remain distinct | current candidate failures -> `CODE_FAILED`; reference baseline failures -> `BASELINE_FAILED` |
| results carry reproducible evidence | evidence includes profile, command/scope, revision, timing, exit classification and resource observation |
| verification scheduling is durable and phase-neutral | DevelopmentRun persistence test records a deduplicated admission event without phase/attempt changes |

## Implementation boundaries

- Update `AGENTS.md` with four verification profiles and fail-closed resource handling while preserving security, tenant, migration, retired-system and typecheck policies.
- Add focused tests before implementation (the test-first file is now present; implementation follows).
- Extend Spec 224 runtime and spec contract; use existing durable job leases/fencing where possible.
- Run only focused tests, lint/format on changed files, and bounded static inspection. Do not run full repository typecheck/build or unrelated specs' implementation code.
- Final publication boundary: commit only to `codex/spec224-resource-aware-verification-20261003`. Do not push, merge, deploy, or apply the migration to production in this turn.

## Verification outcome

- `git diff --check` passed after implementation.
- Drizzle JSON, snapshot table/columns/index, migration constraints, journal entry, and runtime imports were cross-checked with a bounded Node script and `rg`.
- Focused Vitest was attempted and could not start: `pnpm --filter @smartspec/web exec vitest run ...` -> `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "vitest" not found`. Per task constraints, dependencies were not installed.
- Full typecheck/build were not run under the repository RAM policy. The explicit `npm run typecheck` prohibition remains in force.
- This is a resource-admission foundation and durable contract. There is no active production Spec 224 verification executor/caller in the audited codebase; runtime rollout/integration certification remains a release gate.

## Lifecycle

See `lifecycle.md` and `test-design.md`.
