# Release gates

Run these gates in dependency order. They are evidence requirements, not
feature flags.

1. Feature 195: migration journal, canonical `worker_jobs` schema, outbox
   dedupe, lease fencing, terminal evidence and focused lifecycle tests.
2. Feature 196: command/goal/plan hash, policy decision, approval revision and
   Job handoff tests.
3. Feature 197: trusted Runner registration, fresh capability snapshot, offer
   expiry, lease fence and reconnect/replay tests.
4. Feature 198: Chat tenant/correlation scope, canonical Job hydration,
   terminal/unknown state rendering and reconnect tests.
5. Feature 199: MCP schema hash, grant revision, quarantine/revocation,
   high-risk approval and durable side-effect tests.
6. Feature 200: provider-neutral manifest, credential exclusion, event sequence,
   adapter registry and workspace/result verification tests.

Local unit tests prove contracts only. Before activation, attach selected
database migration output, target runtime readiness, provider/OAuth test
account evidence, Runner reconnect evidence, browser screenshots and rollback
evidence. A local green test must not be reported as production activation.

The repository rule is to use focused checks; do not run the full Web
TypeScript typecheck in constrained-RAM environments.
