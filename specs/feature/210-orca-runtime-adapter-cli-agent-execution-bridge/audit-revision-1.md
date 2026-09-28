# Spec 210 Repository-Convergence Audit — 2026-09-19

Scope: `spec.md` in this package.

Method: SocratiCode MCP was unavailable in this session, so the audit used
targeted shell discovery and exact source/spec reads. The spec was checked
against the current repository and the authoritative boundaries in Specs 195,
196, 197, 199, 200, 206, 207, 208 and 209. This is a documentation audit; it
does not claim that the Orca adapter is implemented.

## 20 focused rounds

| Round | Focus | Evidence checked | Finding and immediate disposition |
|---:|---|---|---|
| 1 | Package inventory | Target directory and files | Only `spec.md` existed; no manifest or implementation companion was assumed. Added this ledger. |
| 2 | Header and lifecycle status | Spec metadata, revision, durable-truth declaration | Status did not explicitly say repository integration was partial. Updated Revision 6 and production-disabled status. |
| 3 | Cross-spec ownership | Spec 210 ownership table; Specs 195/200/206/207/208/209 | Ownership was directionally consistent. Expanded durable-job wording to include attempts, dispatches, outbox and settlements. |
| 4 | Feature 195 Job Control Plane | `apps/web/drizzle/schema.ts`, `jobControlPlaneTypes.ts`, `jobControlPlaneGateway.ts` | Spec rejected a second Job system but lacked actual table/status vocabulary. Added the current physical-table and status baseline. |
| 5 | Feature 196 orchestration | Feature 196 ownership and retired-boundary clauses | No new Goal/Plan or command gateway was introduced. Kept Orca subordinate to shared orchestration. |
| 6 | Feature 197 Runner boundary | Feature 197 Runner-first and local-execution rules | Local CLI execution remains Runner-owned. Added explicit reuse of the existing Runner identity/control boundary. |
| 7 | Spec 199 MCP boundary | MCP Gateway ownership and capability rules | Spec 210 already routed Skills/MCP through SmartAIHub. No direct upstream-MCP bypass gap remained. |
| 8 | Spec 200 external-agent semantics | Adapter/session/result ownership and native-adapter retention | Spec 210 remained an adapter under Spec 200. No duplicate semantic owner was added. |
| 9 | Spec 206 route ordering | A2A-first versus Spec 200 native routing | `protocol_route` and `runtime_adapter` stayed separate; no route-order change required. |
| 10 | Spec 207 economics | Economic owner, usage settlement and aggregate retry budget | No second ledger was proposed. Existing attempt-level and aggregate-budget rules were retained. |
| 11 | Spec 208 computer-use boundary | Computer-use ownership and Runner/cloud boundary | No unrestricted browser/desktop capability was added; no change required. |
| 12 | Spec 209 workflow boundary | Workflow node/runtime identity and shared execution rules | Orca runtime/session/worktree identities remain run-state only; no workflow-definition leakage found. |
| 13 | Web Job schema | `workerJobs`, `workerJobAttempts`, event/dispatch/outbox/settlement declarations | Proposed Spec 210 fields are not currently present. Added an explicit migration/subordinate-record gate. |
| 14 | Job admission authority | `createControlPlaneJob()` and executor registration | Tenant, actor, authorization scope and idempotency remain server-derived. Added this as a normative compatibility fact. |
| 15 | Runner wire protocol | `runnerContracts.ts`, `protocol.rs`, `runnerControl.ts` | `sah-runner-v1`, auth, sequencing, fencing, WSS and HTTPS fallback are current evidence. Added explicit reuse requirement. |
| 16 | Runner adapter/process reality | `apps/runner-app/src/adapters.rs`, `execution.rs`, `process.rs` | Approved manifests have no `orca.v1`; current process path is direct approved executable start/cancel, not Orca session control. Added a release gap and no-false-certification rule. |
| 17 | Current agent runtimes | Web Agent Runtime client and Python OpenAI Agents/LangGraph paths | Native approved runtimes must remain intact; added explicit non-replacement/non-reroute rule. |
| 18 | Security and retired systems | Secret rejection, tenant/profile scope and retired-system prohibitions | Boundaries were present; current-baseline table now ties them to implementation planning. |
| 19 | Rollout and acceptance completeness | Rollout gates, implementation order, acceptance criteria | Added repository-baseline rollout Gate 19 and criteria 91–94. |
| 20 | Final convergence | Revision history, target references, contract checks and audit count | No unresolved spec-internal gap found after repair. Remaining blockers are explicit external implementation/certification work. |

## Immediate repairs applied

- `spec.md` Revision 6 now states that repository integration is partial and the
  Orca route is not production-enabled.
- Durable execution truth now names the existing Job attempts, events,
  dispatches, outbox and settlements in addition to `worker_jobs`.
- Added `## 5.1 Current Repository Compatibility Baseline — 2026-09-19` with
  actual paths, current status vocabulary, current Runner protocol and the
  absence of `orca.v1` implementation evidence.
- Added explicit blockers for shared Job/attempt migration, authenticated
  session commands, conformance/security tests and certified compatibility
  tuples.
- Promoted the retired-system prohibition into normative section 4.1 instead of
  leaving it only in the repository-baseline evidence table.
- Added rollout Gate 19, acceptance criteria 91–94 and Revision 6 history.
- The later 207–210 cross-spec audit advanced Spec 210 to Revision 7; its
  detailed combined ledger is `orchestra/spec-audit-207-210-2026-09-19.md`.

## Residual release gates

These are not documentation gaps and were not represented as complete:

1. Implement and register the Orca adapter through the existing Runner.
2. Add the reviewed shared persistence/migration for route-attempt identity.
3. Implement authenticated session/control commands and durable reconciliation.
4. Run focused adapter, tenant-isolation, secret-redaction, crash/restart and
   mixed-version tests on certified OS/provider tuples.
5. Enable production routing only after the listed rollout gates and rollback
   proof pass.

No TypeScript typecheck was run, in accordance with repository instructions.
No application code was changed in this audit.
