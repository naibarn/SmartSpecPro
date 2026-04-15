# Claude Spec - 083-Agent-Registry-And-Organization-Model

## 1. Feature Summary

Feature 083 introduces a governed registry for all agent kinds in SmartSpecPro. The registry becomes the source of truth for agent identity, versioning, rollout posture, policy bindings, memory scope, and evidence-based promotion. It covers both runtime-facing agents and persistent role agents.

## 2. Confirmed Goals

1. Every governed agent must be represented by a registry identity plus one or more immutable versions.
2. Registry records must declare tool scope, disallowed actions, memory scope, budget policy, approval requirements, escalation rules, and rollout posture.
3. Selection must be fail-closed when no eligible version matches tenant, team, queue, workpack-family, and policy conditions.
4. Version promotion must be explicit and audited.
5. Rollout states must include `draft`, `shadow`, `canary`, `supervised`, `general`, and `frozen`.
6. Outcome memory must capture machine-readable performance evidence that can influence future selection when policy allows it.
7. Feature 080 role agents should reuse this registry model instead of bypassing it.

## 3. Adopted Assumptions

Because the user delegated the design choices to the system, the planning assumptions are:

- The registry will be implemented in the existing `apps/web` stack using Drizzle-backed tables and TypeScript services.
- Outcome memory will be summarized evidence, not raw trace duplication.
- Initial rollout targeting will be tenant, team, queue, and workpack-family.
- Environment and model-family compatibility will be modeled as metadata and compatibility gates, not primary routing dimensions.
- Existing role-agent flows will migrate through adapters and service refactors instead of a big-bang rewrite.
- Migration must be idempotent and cutover must have a single source of truth after the compatibility window.
- Outcome memory must be redacted, retention-scoped, and separated from raw telemetry.

## 4. Current-State Fit

- `roleAgentContracts` already provides the conceptual vocabulary for autonomy, contracts, workpack bindings, checkpoints, and approvals.
- `roleConfigurationService` and `roleMonitor` already expose the operational surfaces for creating and managing role agents.
- `workerDelegationService` already consumes capability and knowledge scope profiles for runtime manifests.
- `tenantFeatureFlags` already provides a tenant-scoped rollout gate and admin control model.
- `agentTemplates` and `agentActivityEvents` are related concepts, but they are not sufficient to represent governed registry identities and immutable versions.

## 5. Success Criteria

1. A team or tenant can resolve the same registry identity to different versions depending on rollout posture and policy.
2. The system can explain why a version was eligible.
3. A policy widening change creates a new version and preserves the prior stable version for rollback.
4. Role agents can be represented through the same registry model as planner/reviewer-style agents.
5. Evidence from completed runs can guide future resolution without violating policy or tenant boundaries.
6. Existing role-agent records can be bootstrapped into the registry without duplicate identities or split-brain writes.
7. Sensitive memory content is redacted or expired according to policy before it becomes durable learning data.
