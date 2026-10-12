# Mini App Factory G0 SPEC Reconciliation

Observed at canonical `origin/main` SHA `d0b558f7b1e511bbb866b35bae7f3880b742277c` on 2026-10-12. The registered task workspace was created by `workspace_authority.py create` at this SHA. The dirty primary checkout was not read for task data, modified, or synchronized.

## Resume checkpoint and current program state

- Resume source: `orchestra/programs/autonomous-mini-app-factory/program.json`, latest durable program checkpoint `LANE1_RECEIPT_BACKED_SETTLEMENT_AND_WINDOWS_RUNNER_AUTHORITY` (source/integrated SHA `7ca6dacb5773c1b2eaf4e29dd139220d6018bac0`). No earlier focused G0 audit artifact was present in the canonical program directory; prior Factory implementation, runtime, and handoff evidence remains accepted at its recorded SHAs and was not rerun.
- Current implementation evidence already proves Factory worker/outbox stage execution and cross-process resume with synthetic handlers, Research Notes runtime/package work, and Project Wiki reuse through PACKAGE. Deployment, migration on an authorized target, live external Runner dispatch/accounting, and complete end-user acceptance remain separate open obligations.
- Existing canonical program snapshot is stale: it reports canonical SHA `cf4fccc2b9744451f68a66f632049073ce0bb981` and 313 Specs. Dynamic inventory at this checkpoint reports 315 canonical Specs, 472 total records, a complete walk, zero diagnostics, and no canonical source missing from `origin/main`. This reconciliation does not rewrite the program snapshot or infer closure from inventory counts.
- Direct factory stage contract: 18 stages in `factory-pipeline.v1.json`; the dependency graph is preserved in the G1–G6 backlog below. `recovery` branches from requirements intake and is not allowed to create a second queue or execution authority.

## G0 scope decisions

| Authority | Factory dependency | Reconciled status | Boundary / next evidence |
|---|---|---|---|
| Spec 261 SPAAS | Canonical portable Mini App package, capability and deployment declarations | Applicable; unresolved | Establish Factory input/output conformance against the normative package contract. Existing package digests and validation evidence remain partial, not a complete standard conformance claim. |
| Spec 224 + Feature 195 | Orchestrator admission and durable `worker_jobs`/outbox stage execution | Applicable; partially implemented | Keep long-running stages on the existing control plane. Trusted live Runner, fresh authorization, and receipt/accounting verification remain pending; no parallel scheduler or dispatch path. |
| Spec 256 | Mini App capability grants intersect with current user, project, and asset rights | Applicable where Factory stages request capabilities; unresolved | Bind stage declarations to callable capability authority; no capability grant follows from app declaration alone. |
| Spec 287 (and Spec 240 surface authority) | Mini App design contract and core rendering conformance | Applicable; unresolved | Add a design-contract/conformance gate before UAT; UI/action ownership remains with their existing Specs. |
| Spec 288 | Portable backend resource interfaces | Applicable; unresolved | Validate package/backend resource claims against Resource Fabric; provider-native paths require explicit justification. |
| Spec 302 | Canonical Project identity/context | Applicable for project-backed Apps; partial | Keep Project identity independent of App identity; current durable receipt/target acceptance is still open. |
| Spec 304 | Stable App identity, route aliases, App-to-release/deployment references | Applicable; partial | Keep identity and route ownership in Spec 304; existing route/API evidence does not prove production ingress or deployment. |
| Spec 295 | Release, deployment, migration and runtime operations | Applicable only to deploy/migrate/smoke stages; unresolved at target boundary | Factory consumes existing release/deployment/migration authorities; no new deployer, migration engine, secret store, or production execution. |
| Spec 303 | Asset rights/distribution | Conditional for publication/distribution, not required for local package/test | Before marketplace or third-party distribution, prove asset ownership/license and immutable rights evidence; do not claim this gate for current local package evidence. |

Canonical ledgers were reconciled through `tools.spec_handoff` batch writers for selected normative rows in Specs 224, 256, 261, 287, 288, and 295. Only task-specific applicability/relevance, rationale, and next-action fields were changed. Requirement final states and implementation/verification evidence were not promoted. Spec 302 already classifies its project-identity requirement as partial/relevant and retains its authorized-target next action. Spec 304 retains its existing partial route evidence and production-ingress blocker. Spec 303 remains open and conditional for any future publication/distribution work; no evidence or closure was added.

## G1–G6 dependency-driven backlog

| Gate | Objective and source dependencies | Prerequisites | Completion predicate / evidence |
|---|---|---|---|
| G1 — Requirements and SPEC intake | Factory `requirements_intake` → `spec_compile`; Spec 261 is package authority and Specs 224/256/287/288/302/304/295 supply bounded contracts. | Approved user requirements or an existing canonical SPEC slice; ownership/disposition is current in canonical ledgers. | Input maps to requirement IDs, explicit non-goals, app scope, and canonical package profile. Evidence: source SHA, SPEC digest, requirement IDs, owner and applicability decisions. |
| G2 — Plan and manifest admission | `plan` → `manifest_validate`; Spec 261 package declarations, Spec 256 capabilities, Spec 302 Project and Spec 304 App identity. | G1 traceability complete. | Dependency order, target constraints, capability grants, tenant/project/app scope, migration/rollback needs, and evidence plan validate before generated files. |
| G3 — Safe scaffold, data and action contracts | `scaffold` → `data_migration` → `backend_actions`; Specs 288/302/304, Feature 195, Spec 224. | G2 manifest passes; existing project/app/resource owners identified. | App-scoped writes only; auth derives from trusted identity; migration has declared rollback; durable jobs use worker_jobs/outbox; no retired workflow/Agency/workpack/OpenSandbox path. |
| G4 — UI, capability and background stages | `ui_implementation`, `ai_capabilities`, `background_jobs`; Specs 287/240, 256, 224 and 195. | G3 contracts and ownership boundaries pass. | Design contract and conformance evidence; capability policy/fallback is explicit; jobs prove idempotency, retry, recovery, and cross-tenant denial. Live provider/Runner work remains gated by authority. |
| G5 — Test and portable package | `tests` → `package`; Specs 261, 287, 288, 302/304, plus conditional Spec 303 distribution rights. | G4 outputs complete. | Focused functional/auth/isolation/UI checks pass; package validates deterministically and binds exact source/artifact digests. Rights proof is required only when distributing protected assets. |
| G6 — Target operations and acceptance | `deploy` → `migrate` → `smoke` → `uat` → `evidence`; Spec 295 owns operations, Spec 304 owns App identity/route references. `recovery` remains an independent dependency-ready path. | G5 package; owner-authorized isolated non-production target, credentials, database, and migration window. | Exact artifact is deployed to registered target; normal migration records STARTED/SUCCEEDED; authenticated smoke, cross-tenant denial, required jobs and viewport/headless UAT pass; evidence binds SHA/target/artifact. Otherwise retain a scoped wait with predicate and next action; never imply production readiness. |

## Recovery classification and continuation

- Workspace path: `/home/dev/.codex/worktrees/global-mini-app-factory-g0-reconciliation-20261012`.
- Recovery classification: `WORKTREE_CREATED_AND_REGISTERED`; `recovery_attempts=[]`; no failure or fallback was exercised because preflight passed on `/` with 185,122,492,416 available bytes and 42,499,767 available inodes.
- Canonical SHA: `d0b558f7b1e511bbb866b35bae7f3880b742277c` (the exact refreshed `origin/main` tip).
- Continuation result: registered task workspace was clean at creation and G0 resumed from the existing program evidence checkpoint; it now contains only this G0 evidence and approved Spec handoff updates. No runtime tests were repeated; G0 inventory and ledger reconciliation are the new evidence.
