# Feature 199 — External MCP Gateway Planning Spec

## Goal

Plan and implement a first-class External MCP upstream gateway that manages remote and Runner-hosted servers, exposes only authorized lazy capabilities and enforces protocol, credential, risk, quarantine, audit and revocation controls.

## Scope

In scope: upstream installation/connection lifecycle, discovery, OAuth and credential isolation, schema revisions, health/reconciliation, risk/quarantine/review, capability projection, policy-controlled execution, Runner bridge, RAG projection, admin/end-user UI and API contracts. Out of scope: owning Chat, Goal/Plan, durable Jobs, Runner identity or External Agent runtime.

## User-Facing Behavior

Platform/Tenant Admins can register and review MCP upstreams; authorized users can connect approved apps, select scoped capabilities and approve high-impact calls. Users see Connected Apps and health/activity states, not raw tokens or arbitrary transport details.

## Technical Constraints

Extend current MCP registry/routes/routers, persistence and Python MCP adapters; map existing hosted/inbound MCP foundations instead of duplicating them. Use Feature 196 Capability Gateway, Feature 195 `worker_jobs`, Feature 197 Runner and Feature 198 Chat. External Agents must never connect directly to arbitrary upstreams.

## Dependencies

Inputs: shared Job, capability, Runner, context, asset, approval and audit contracts from Features 195–198. Downstream: Feature 200 consumes governed MCP capabilities through Feature 196/199 only.

## Outputs

Produces upstream/installation/connection/revision/tool/credential/risk/revocation contracts, gateway services, policy/health/reconciliation APIs, role-scoped UI and focused security/integration tests.

## Edge Cases

1. A server changes a tool schema after approval; the new revision is quarantined until re-reviewed.
2. OAuth callback or credential refresh arrives after the connection was revoked; it must remain unusable.
3. A remote call completes after its Job lease or capability grant expires; its effect is rejected or marked unknown.
4. Lazy discovery returns thousands of tools or malformed JSON schema; results are bounded, validated and fail closed.

## Error Handling

Separate transport, protocol, auth, schema, policy, quota, provider-effect and reconciliation errors. Quarantine untrusted changes, revoke grants on policy changes, bound reconnect/retry and keep audit lineage for every discovery and execution decision.

## Testing Expectations

Test tenant/role/agent policy, OAuth/credential non-disclosure, schema drift/quarantine, lazy discovery, idempotent management mutations, health/reconnect, Runner bridge, RAG lineage, approval/risk gates, direct-bypass rejection and UI role/state matrices. Use focused Web/Python tests; no whole-repository typecheck.

