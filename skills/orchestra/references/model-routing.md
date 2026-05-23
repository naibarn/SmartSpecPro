# Model Routing Policy

Use this reference whenever Orchestra dispatches a sub-agent, builds a Task Packet, or
decides whether an inline role should keep the conductor's current/default model.

## Default Model Rule

For sub-agent work that is bounded, routine, or primarily mechanical, set:

```text
model_preference: gpt-5.3-codex-spark
model_reason: lightweight-default
```

In Codex, this metadata MUST be enforced by passing the actual sub-agent tool
override:

```json
{ "model": "gpt-5.3-codex-spark" }
```

Task Packet metadata alone is not sufficient. If the conductor calls a Codex
`spawn_agent`/sub-agent tool for lightweight-default work and omits the `model`
field, the sub-agent inherits the parent/default model and the Spark routing
policy has not been applied.

This applies by default to:

- read-only exploration with a narrow question
- formatting, docs, copy, small tests, and small mechanical edits
- routine frontend/backend/Python changes with clear files and contracts
- independent reviewer/auditor agents that only need a bounded verdict
- background or sidecar tasks that should optimize for speed and cost

## Do Not Use Spark When

Use the inherited current/default model instead, unless the user explicitly names a
different model, when any of these apply:

- the user or Task Packet explicitly requests another model
- the task requires deep planning, difficult architecture, complex debugging, or nuanced
  product/security/data tradeoffs
- the task is high or critical risk: auth, RBAC, tenant isolation, encryption, secrets,
  migrations with data loss risk, production incident recovery, or public API breakage
- the task is performance-critical: `CMD-9 Performance`, load/latency work, slow query,
  N+1, cache, benchmark, or explicit high-throughput/high-efficiency analysis
- a prior Spark attempt returns `failed`, `blocked`, or cannot complete the assigned work
- a quality gate fails repeatedly and the fix requires broader reasoning than the original
  task
- the sub-agent tool does not support model override or rejects `gpt-5.3-codex-spark`

## Escalation and Fallback

If Spark cannot finish the task:

1. Record the failed or incomplete Spark attempt in `orchestra/progress.md`.
2. Re-dispatch the same role with `model_preference: inherited-default`.
3. Include the Spark result and exact blocker/error in the next Task Packet CONTEXT.
4. If the second attempt still cannot complete and the blocker is product ambiguity,
   destructive risk, or critical security risk, follow the normal Orchestra STOP rules.

## Dispatch Metadata

Every dispatched sub-agent packet must include:

```text
model_preference: gpt-5.3-codex-spark | inherited-default | explicit:<model>
model_reason: lightweight-default | explicit-user-request | high-complexity | high-risk | performance-critical | deep-route | retry-escalation | unavailable
```

When the active sub-agent tool has a model override field, map
`model_preference: gpt-5.3-codex-spark` to that override. In Codex this means the
tool call must include `model: "gpt-5.3-codex-spark"` for lightweight-default
dispatches. When the active tool does not support model overrides, keep the
metadata in the Task Packet so the routing decision remains auditable and record
the limitation in `orchestra/progress.md`.

## Inline Fallback

Inline fallback is not a real sub-agent dispatch and normally uses the conductor's current
model. Still record the intended `model_preference` in the Result Report or progress log so
future runs can preserve the same routing decision if a sub-agent tool becomes available.
