# Synthesized Implementation Specification

The implementation closes the seven-round audit gaps in Features 162/163.

## Functional contract

The server resolves Worker identity and Series access from durable pairing,
tenant, group, and explicit policy records. It returns safe projections with
independent read/bind/process/publish capabilities. Binding rows retain a
server-resolved owner snapshot, safe display metadata, root fingerprint,
policy snapshot, revision, and audit/revoke state.

Admin workflow policies are versioned per operation. A resolver chooses a
compatible allowlisted workflow from the live Worker capability probe, records
an immutable resolution, and rejects stale policy/probe/input revisions.

The storyboard can submit a typed shot-video request containing exactly one
approved start frame and an ordered reference pack. Server admission pins the
Series, episode/shot revisions, binding, policy, workflow resolution, budget,
and idempotency key. Worker execution negotiates MCP, runs the allowlisted
workflow, reconciles remote execution IDs after restart, performs QC, and
publishes only a verified derived artifact.

The local media workspace scans/probes all supported files, emits bounded
analysis evidence, creates editable batch plans, performs dead-air/reframe/
still-motion processing without mutating sources, and retains lineage/QC.

The Worker UI exposes canonical screens with legacy aliases and the Web UI
exposes compact nine-shot status plus a Shot Inspector for advanced controls.

## Non-functional contract

Fail closed on missing identity, permissions, revisions, capabilities, schemas,
checksums, QC, and output confinement. Preserve existing user data and old
routes. Keep original media local until derived publication. Use additive
migrations only.
