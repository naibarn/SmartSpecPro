# Spec 209 implementation review

## Review checklist

1. Dashboard route enters the existing Workflow Studio shell.
2. Builder, Subflow, Library and Marketplace navigation are reachable.
3. ReactFlow nodes render at responsive sizes and remain visible.
4. Node drag and keyboard nudge update the graph model.
5. Typed edge validation rejects self-links, duplicate links, bad ports and cycles.
6. Edge selection and deletion update dirty state.
7. Properties edits update labels, capabilities, ports and policies.
8. Invalid JSON/ports block publish and run actions.
9. Draft creation/save uses expected revision and tenant authorization.
10. Published versions remain immutable.
11. Run admission uses exact version hash and idempotency.
12. Unsupported capabilities fail before canonical Job creation.
13. Bounded run modes compile a bounded step plan.
14. Checkpoint resume validates tenant, version, input fingerprint and status.
15. Canonical executor reports progress and projects terminal/partial output.
16. Approval, reject, input, retry, cancel and resume use the Job control plane.
17. Run refresh rebuilds status, events, jobs, logs and artifacts from queries.
18. Marketplace detail/readiness/entitlement is server-derived.
19. English and Thai workflow keys are present for new UI states.
20. Focused tests, build, browser flow and diff checks pass.

## Known external proof boundary

The browser proof uses a controlled tRPC fixture. It proves the UI contract and
interaction path, not a production provider effect, artifact publication or
economic settlement. Those require target-environment evidence after migration
and worker/provider activation.
