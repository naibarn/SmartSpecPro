# Model Routing Policy

Use this reference whenever Orchestra dispatches a sub-agent, builds a Task Packet, or
decides whether an inline role should keep the conductor's current/default model.

## Planning vs Coding Split — Opus Plans, Sonnet Codes (Claude Code)

On Claude Code the tier policy is: **planning/architecture runs on Opus; implementation
runs on Sonnet.** This keeps deep reasoning where it matters while making routine coding
cheap and fast.

How it is wired (portable across repos via `skills/portable_install.py`):

- `skills/portable_install.py` sets each generated `.claude/agents/ssp-*.md` model via
  `OPUS_AGENTS = {"architect", "product-ux"}` + `model_for(name)`. Planning/design agents
  get `model: opus`; every other implementation/reviewer agent gets `model: sonnet`.
- To add another Opus planning agent in any repo: add its source slug to `OPUS_AGENTS` and
  re-run `python3 skills/portable_install.py generate-claude-agents`. Do NOT hand-edit the
  generated `.claude/agents/*.md` — they regenerate from `skills/sub-agents/agents/*.md`.
- The session/conductor default should be Sonnet (repo `.claude/settings*.json` `"model":
  "sonnet"`) so inline conductor coding is also Sonnet. This is a per-repo settings choice,
  not a skill artifact.

### Delegate Coding for Context Isolation (token saving)

Prefer delegating substantive coding to a Sonnet `ssp-*` implementation agent rather than
editing inline. A sub-agent runs in a **fresh, isolated context** — it does NOT inherit the
conductor's accumulated history. Its noisy work (multi-file reads, long tool output, big
diffs, trial-and-error) stays in the sub-agent's throwaway context; only a compact result
returns. This keeps the conductor lean, delays compaction, and lowers token cost per turn.
It also guarantees coding runs on Sonnet even when the conductor is still on Opus.

| Coding task | Action |
|---|---|
| Touches 2+ files, or needs multi-file reads to make the change | MUST delegate to a Sonnet `ssp-*` implementer |
| Requires iteration/search/exploration before editing | MUST delegate (offload the noise) |
| Non-trivial single-file change (new function, refactor, logic) | SHOULD delegate |
| Trivial edit (typo, one-line config, rename, comment, 1–3 line fix) | May edit inline — a sub-agent round-trip costs more than it saves |

This split is orthogonal to `lightweight-default` below: `lightweight-default` (Haiku/GPT 5.5)
is for bounded mechanical sub-work; the Opus/Sonnet split is the primary planning-vs-coding
tiering. When both apply, the escalation rules under "Do Not Use the Lightweight Model When"
still govern.

## Default Model Rule

First confirm that sub-agent dispatch is authorized for the current platform and user
request. In Codex standard light mode, do not call `spawn_agent` solely to apply this model
policy; direct/inline execution uses the conductor's current model and records the intended
model preference only as audit metadata.

For sub-agent work that is bounded, routine, or primarily mechanical, set:

```text
model_preference: gpt-5.5
model_reason: lightweight-default
```

In Codex, this metadata MUST be enforced by passing the actual sub-agent tool
override:

```json
{ "model": "gpt-5.5" }
```

Task Packet metadata alone is not sufficient. If the conductor calls a Codex
`spawn_agent`/sub-agent tool for lightweight-default work and omits the `model`
field, the sub-agent inherits the parent/default model and the GPT 5.5 routing
policy has not been applied.

This applies by default to:

- read-only exploration with a narrow question
- formatting, docs, copy, small tests, and small mechanical edits
- routine frontend/backend/Python changes with clear files and contracts
- independent reviewer/auditor agents that only need a bounded verdict
- background or sidecar tasks that should optimize for speed and cost

## Host-Specific Lightweight Model

`lightweight-default` is a role, not a fixed model string. Map it to the fast, low-cost
model of the active host when that host's sub-agent tool supports a model override:

| Host | `lightweight-default` maps to | Override field value |
|------|-------------------------------|----------------------|
| Codex / Standard | GPT 5.5 | `model: "gpt-5.5"` |
| Claude Code | Haiku 4.5 | `model: "haiku"` (Task tool `model` field) |
| Any host without a model-override field | inherited-default | (omit; keep metadata only) |

On Claude Code the native Task tool accepts a `model` field (`haiku`, `sonnet`, `opus`,
`fable`). For `lightweight-default` packets, pass `model: "haiku"` so bounded/mechanical
sub-agent work runs on Haiku 4.5 rather than silently inheriting the conductor's heavier
Opus/Sonnet model. Never pass `gpt-5.5` to a Claude Code agent — it is not a valid Claude
model; use `haiku` there. The escalation rules below ("Do Not Use ... When") apply
identically regardless of host — they escalate to `inherited-default`.

## Do Not Use the Lightweight Model When

Use the inherited current/default model instead, unless the user explicitly names a
different model, when any of these apply:

- the user or Task Packet explicitly requests another model
- the task requires deep planning, difficult architecture, complex debugging, or nuanced
  product/security/data tradeoffs
- the task is high or critical risk: auth, RBAC, tenant isolation, encryption, secrets,
  migrations with data loss risk, production incident recovery, or public API breakage
- the task is performance-critical: `CMD-9 Performance`, load/latency work, slow query,
  N+1, cache, benchmark, or explicit high-throughput/high-efficiency analysis
- a prior GPT 5.5 attempt returns `failed`, `blocked`, or cannot complete the assigned work
- a quality gate fails repeatedly and the fix requires broader reasoning than the original
  task
- the sub-agent tool does not support model override or rejects `gpt-5.5`

## Escalation and Fallback

If GPT 5.5 cannot finish the task:

1. Record the failed or incomplete GPT 5.5 attempt in `orchestra/progress.md`.
2. Re-dispatch the same role with `model_preference: inherited-default`.
3. Include the GPT 5.5 result and exact blocker/error in the next Task Packet CONTEXT.
4. If the second attempt still cannot complete and the blocker is product ambiguity,
   destructive risk, or critical security risk, follow the normal Orchestra STOP rules.

## Dispatch Metadata

Every dispatched sub-agent packet must include:

```text
model_preference: gpt-5.5 | inherited-default | explicit:<model>
model_reason: lightweight-default | explicit-user-request | high-complexity | high-risk | performance-critical | deep-route | retry-escalation | unavailable
```

When the active sub-agent tool has a model override field, map
`model_preference: gpt-5.5` to that override. In Codex this means the
tool call must include `model: "gpt-5.5"` for lightweight-default
dispatches. When the active tool does not support model overrides, keep the
metadata in the Task Packet so the routing decision remains auditable and record
the limitation in `orchestra/progress.md`.

## Inline Fallback

Inline fallback is not a real sub-agent dispatch and normally uses the conductor's current
model. Still record the intended `model_preference` in the Result Report or progress log so
future runs can preserve the same routing decision if a sub-agent tool becomes available.
