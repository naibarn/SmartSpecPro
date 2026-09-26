# Synthesized Specification — Spec 214 Completion

## Goal
Complete the Spec 214 v4 semantic node contract in SmartSpecPro so authoring and compile-time consumers resolve only registered, strongly described node types and do not encode provider/product/runtime policy as new semantic IDs.

## Canonical requirements
1. Register exactly the 16 canonical core types specified in Spec 214.
2. Model identity, semantics, ports, config, resolution/bindings, runtime requirements, execution/effects, security, governance, UI, AI Builder discovery, compatibility, lifecycle, and presets with one authoritative field per concern.
3. Validate manifests and instances deeply: schema/version/digest/IDs, ports, configuration, bindings, protected secret material, and runtime-only fields. Missing values must remain distinct from explicit null.
4. Support deterministic, side-effect-free binding/config-derived schema projection and exact version lookup; do not invent a runtime resolver or new registry authority.
5. Expose compact semantic search, compatible presets, binding requirements, coverage metadata, and historical manifest access only where actual retained manifests exist; unknown records fail closed.
6. Keep WorkflowInterface, bindings, scopes, policies, instrumentation, execution state, and physical job control outside the Node Type taxonomy. Spec 215 consumes the contracts; Feature 195 remains job authority.
7. Ensure Studio conversion and AI Builder candidates use canonical IDs and real registered bindings. Never imply a placeholder/default binding is available or live-certified.
8. Enforce extension admission against the 10-point test; provider/protocol-specific types are rejected when a core semantic type plus binding/composition is sufficient.
9. Add the missing machine-readable 112-name disposition artifact referenced by the R20 manifest, generated from Appendix A and protected by exact count/uniqueness/category/target checks.
10. Align R20 profile and coverage-manifest Spec 214 revisions with the current Spec 214 v6.
11. Validate R20 corpus identity and static semantic-coverage requirements without claiming 5,860 authenticated model/provider executions.
12. Preserve stored data, current migration, and existing runtime until a read-only deployed inventory and rollback plan authorize a later cutover.

## Non-goals
- No new workflow engine or `/workflows` legacy-engine caller.
- No Agency, `work/request(s)`, `workpacks/*`, OpenSandbox, `sandbox_jobs`, or Docker dispatch.
- No scheduler, run/attempt lifecycle, queue, lease, retry engine, or new durable job ledger in Spec 214.
- No deployment, production database mutation, provider invocation, or external certification claim.
- No unrelated cleanup of the heavily dirty worktree.

## Acceptance and proof
Local completion requires focused tests for all section behavior, exact 16-type registry, unsupported/legacy rejection at canonical boundaries, R20 corpus identity and 112-name disposition integrity, `git diff --check`, and clean forbidden-system/scope scans. Production inventory, runtime activation, and 5,860 live prompt executions remain explicit external gates.
