# TDD Plan - Agent Registry And Organization Model (083-Agent-Registry-And-Organization-Model)

This file mirrors `claude-plan.md` and defines the tests to write before each implementation phase.

## 1. Plan Intent

- Test: planning artifacts exist and remain internally consistent across `spec`, `research`, `interview`, `plan`, `tdd`, and `sections`.

## 2. Current-State Constraints and Design Principles

- Test: existing role-agent and delegated-worker behavior stays unchanged for non-registry flows.
- Test: tenant-scoped access rules still reject cross-tenant reads and writes.
- Test: registry selection never falls back to an unreviewed or ambiguous version.

## 3. Target Registry Model

- Test: new registry schema exports the required table/enum names.
- Test: required version contract fields are present in validation schemas.
- Test: first-wave agent kinds accept planner, specialist, reviewer, approver, analyst, connector_operator, knowledge_agent, supervisor, and role_agent.
- Test: rollout state enum only accepts `draft`, `shadow`, `canary`, `supervised`, `general`, and `frozen`.
- Test: immutable version records cannot be mutated in place after publication.

## 4. Data Model and Persistence Strategy

- Test: schema migration adds registry tables and indexes without removing existing role-agent tables.
- Test: stable pointer relationships survive promotion and rollback operations.
- Test: indexing by tenant, rollout posture, and targeting dimensions supports expected lookup paths.
- Test: backfill/bootstrap logic is idempotent and does not duplicate registry identities or versions.
- Test: cutover preserves a single source of truth after migration and rejects dual-writer behavior.

## 5. Registry Services and Resolution Engine

- Test: registry creation stores the expected identity and owner fields.
- Test: version creation produces a new immutable version and leaves the previous version intact.
- Test: promotion requires review when scope, budget, or tool access widens.
- Test: rollback restores the previous stable version pointer.
- Test: resolver returns a fail-closed error when no eligible version matches.
- Test: resolver reason payload explains which eligibility gate rejected a version.
- Test: evidence-informed preference only applies when policy enables it.
- Test: promotion, freeze, and rollback are serialized through a transaction-safe path.
- Test: stale reads are revalidated before the final resolution is returned.

## 6. API and UX Delivery Plan

- Test: admin registry endpoints require the right tenant/admin authorization.
- Test: registry inspection endpoints return identity, version, policy, and rollout data together.
- Test: tenant feature-flag gating hides registry rollout actions when disabled.
- Test: safe-launch controls reject forbidden transitions like promoting a frozen version.
- Test: authorization matrix distinguishes system admin, tenant admin, and regular-user visibility.
- Test: outcome-memory inspection is narrower than registry-policy inspection when the route requires it.

## 7. Existing Runtime Integration

- Test: role-agent creation routes through the registry adapter path.
- Test: delegated worker manifest generation consumes registry capability data.
- Test: runtime selection fails closed when registry eligibility is incomplete.
- Test: workpack-family targeting is honored during selection.

## 8. Observability, Security, and Governance

- Test: registry resolution writes audit events with selected version and reason metadata.
- Test: promotion events include previous stable pointer and review status.
- Test: cross-tenant attempts to inspect or modify registry records are denied.
- Test: outcome-memory writes are tenant-scoped and do not leak across registries.
- Test: security posture remains fail-closed for ambiguous policies or missing bindings.
- Test: outcome-memory redaction blocks secrets, tokens, and sensitive prompt fragments before persistence.
- Test: retention rules expire or compact memory according to policy without breaking resolver behavior.

## 9. Rollout, TDD, and Acceptance Criteria

- Test: phased rollout can expose registry features to a limited tenant cohort before general availability.
- Test: registry state can be fully exercised in staging without breaking existing role-agent flows.
- Test: final acceptance path covers create -> version -> promote -> resolve -> rollback -> memory writeback.
