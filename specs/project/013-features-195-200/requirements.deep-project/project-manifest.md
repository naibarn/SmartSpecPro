<!-- SPLIT_MANIFEST
01-feature-195-job-control-plane
02-feature-196-goal-orchestration
03-feature-197-runner-fabric
04-feature-198-intelligent-chat
05-feature-199-external-mcp-gateway
06-feature-200-external-agent-control-plane
END_MANIFEST -->

# Project Manifest — Features 195–200

## Source specifications

| Split | Source spec | Ownership |
|---|---|---|
| 01 | `specs/feature/195-unified-async-job-control-plane/spec.md` | Durable `worker_jobs`, outbox, attempts, leases, fencing and lifecycle truth |
| 02 | `specs/feature/196-universal-goal-orchestration/spec.md` | Goal/Plan, capability resolution, command semantics and orchestration |
| 03 | `specs/feature/197-runner-adaptive-execution-fabric/spec.md` | Runner/device identity, local resolution and execution control |
| 04 | `specs/feature/198-intelligent-chat-universal-orchestration-capability-evolution/spec.md` | Chat/Assistant UI, request lifecycle, evolution and evaluation |
| 05 | `specs/feature/199-external-mcp-gateway-upstream-management/spec.md` | External MCP upstream lifecycle, policy, quarantine and invocation |
| 06 | `specs/feature/200-universal-coding-agent-control-plane/spec.md` | External Agent providers, sessions, events, results and Agent Runtime Core |

## Dependency graph

`01 → 02 → 03 → 04 → 05 → 06`

All splits reuse the five shared compatibility contracts (`SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`) without treating those identifiers as existing runtime implementations. Feature 198 is the primary end-user control surface; Feature 199 and Feature 200 remain sibling execution domains with no direct bypass between them.

## Per-split implementation order

Each split is implemented in this order: contract/types, persistence/migration, domain services, API/router, UI, focused tests and recovery/acceptance evidence. A split cannot advance until its canonical outputs and compatibility tests are green.

## Cross-cutting gates

- Server-derived tenant/auth authority and auditability.
- Idempotency, bounded retries, lease/fencing and stale-result rejection.
- No secrets in queue payloads, logs, UI or external-agent prompts.
- Durable state before queue publication; realtime transport remains non-authoritative.
- Migration rollback and no-destructive-change review.
- Focused tests only; never whole-repository typecheck.
- Final minimum ten-round cross-spec consistency audit with immediate high-confidence fixes.
