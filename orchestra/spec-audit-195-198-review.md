# Feature 195-198 Spec/Codebase Audit

Date: 2026-09-17
Scope: `specs/feature/195/spec.md`, `specs/feature/196/spec.md`, `specs/feature/197/spec.md`, `specs/feature/198-intelligent-chat-universal-orchestration-capability-evolution/spec.md`

## Findings closed

1. Corrected stale recommended/proposed paths for Features 195, 196 and 198.
2. Aligned Feature 195 logical outbox/inbox/lease names with physical `worker_job_outbox`, `worker_job_dispatches` and `worker_job_attempts` semantics.
3. Corrected Feature 198 self-references accidentally naming Feature 196 and updated its related-spec contract to Features 195-197 plus 194.
4. Distinguished Feature 186 current implementation baseline from Feature 195 target authority.
5. Added explicit partial/target status for Goal/Plan/Offer/Runner/trajectory capabilities not found as complete current code.
6. Added retired-system and Docker/OpenSandbox-dispatch boundaries without changing runtime code.
7. Added validator-compatible Problem/Solution/Requirements/Architecture/Implementation and review-oriented sections with substantive content.
8. Recorded the confirmed Help screenshot router gap: module exists but is not included by current Python `main.py`.

## Twenty independent review passes

| Pass | Audit surface | Result |
|---:|---|---|
| 1 | File identity and metadata | Paths corrected; all four target files exist |
| 2 | Feature ownership | 195 execution, 196 planning, 197 Runner, 198 Chat/evolution |
| 3 | Dependency direction | No reverse ownership or duplicate source-of-truth claim found after edits |
| 4 | Canonical Job schema | Matched `worker_jobs`, events and attempts |
| 5 | Outbox | Matched `worker_job_outbox`; duplicate `job_outbox` implication removed |
| 6 | Dispatch dedupe | Matched `worker_job_dispatches` and dedupe indexes |
| 7 | Lease/fencing | Matched attempts, lease generation/token and canonical transitions |
| 8 | Node control API | Checked gateway, routes, claim, heartbeat and terminal operations |
| 9 | Python bridge | Checked internal publish/claim/status path and no second Job truth |
| 10 | Queue/readiness | Separated current PostgreSQL-pull from Cloudflare migration target |
| 11 | Provider admission | Checked reservations, late binding and settlement boundary |
| 12 | Agents runtime | Checked Python contracts, adapter and Web runtime client |
| 13 | LangGraph | Checked governed runtime and removed legacy-engine ambiguity |
| 14 | Chat surface | Checked current router/runtime versus Universal Command Gateway target |
| 15 | Capability catalog | Checked model registry, static surfaces, Skills, media and Context Packs |
| 16 | MCP/Runner roles | Checked caller versus local runtime identity and control boundary |
| 17 | RAG/vector | Checked Feature 194 relationship and provider abstraction |
| 18 | Help/UI/context | Checked 84 EN + 84 TH topics, routes, injector and screenshot inclusion |
| 19 | Persistence/security/operations | Checked tenant, egress, billing, telemetry, rollback and missing target stores |
| 20 | Retired systems/acceptance/convergence | Confirmed no active retired dispatch design and no remaining doc identity gap |

## Verification

- SmartSpec validator: 0 errors for all four files.
- Remaining validator warnings: exact existing camelCase/snake_case source filenames; no source files were renamed.
- Referenced-path existence checks: all checked paths present.
- Help corpus count: 84 English and 84 Thai topics.
- Python router check: OpenAI Agents and Job Control Plane routers included; Help screenshot router absent.
- Worktree policy: unrelated existing changes preserved; this audit changed no application source or schema files.

## Current-workspace re-audit — 2026-09-17

A second audit was run against the current workspace after the earlier review record. It completed 34 executable consistency rounds, exceeding the requested minimum of 20. The checks covered file identity, explicit Feature IDs, canonical paths, required contract sections, cross-spec ownership, physical Job tables, outbox naming, contract versioning, transport rollout claims, Goal/Plan and Runner target status, Feature 198 persistence and Help gaps, code anchors, router inclusion, capability filtering, Help corpus counts, retired-system boundaries and worktree scope.

New documentary gaps found and closed in this re-audit:

1. Added the missing explicit `Feature ID: 197` metadata.
2. Added the missing Feature 197 recommended path and aligned its date with the current audit baseline.
3. Replaced the stale `job_outbox(status, next_attempt_at)` index example with the canonical `worker_job_outbox` physical table and actual lifecycle fields.
4. Recorded the current `feature-186-v1` control-plane contract and required mixed-version/rollback evidence before version advancement.
5. Classified residual legacy identifiers/routes and Python Docker/Kilo compatibility code as out-of-scope residue, not implementation evidence, across all four specs.
6. Added the current partial-implementation status to Feature 198 and clarified its convergence result.
7. Marked `capacity_leases` and `provider_executions` as logical target roles, with physical-table creation gated by a fresh equivalence/impact review because the current schema exposes `worker_job_provider_reservations` instead.

Evidence rechecked:

- All 34 executable rounds passed after correcting the test assertion wording.
- `validate_spec.py` exited successfully for all four specs with 0 errors. It reports warnings because `.spec/registry` is a SPEC-001-only registry and its legacy JSON keys (`apis`, `data_models`, `glossary`, `critical_sections`) do not match the validator's expected keys; those warnings are registry/tooling coverage gaps, not undocumented Feature 195–198 code claims.
- Repository evidence still matches the specs: canonical `worker_job_*` tables exist, current adapters and the Python bridge use `feature-186-v1`, the Python main app includes Agents and Job Control Plane routers but not the Help screenshot router, the capability catalog excludes retired Agency/workflow surfaces, and the Help corpus contains 84 English plus 84 Thai topics.
- Existing legacy code was not removed because retired-system removal requires a separate authorized migration/data-retention/rollback audit. No application source or schema files were changed; unrelated worktree changes were preserved.

The remaining gaps are explicitly labeled target work: Goal/Plan/Offer persistence and gateway completion, Runner identity/session/offer/control contracts, Retrieval Broker and vector cutover, Help screenshot wiring, Feature 198 trajectory/evaluation/learning persistence, and Cloudflare deployment/enqueue/rollback proof.
