# Skill Behavior Tests

Structural audits prove files exist. Behavior tests prove the skill system makes
the right routing and gate decisions.

## Required Scenario Coverage

Maintain scenario coverage for:

- meta activation chooses the right skill family
- visual UI requests route to the visual UI workflow
- security-sensitive requests route to security gates
- deep planning requests choose the correct deep-* chain
- trivial requests do not trigger heavyweight orchestration
- final completion requires verification evidence
- final completion for medium+ work requires review convergence evidence; Codex standard
  light mode may use one targeted clean round for implementation-ready medium work
- review/gate-driven fixes mark covered gates stale and require reruns
- Task Packet examples preserve all 8 required fields
- Result Report output contracts preserve all 6 required fields
- Claude Code dispatch examples use generated `ssp-*` names
- Standard/Open-Code fallback routes preserve the same contracts when sequential
- sub-agent-first default outside Codex standard light mode: non-trivial tasks dispatch at
  least one agent when tooling exists and dispatch is authorized
- Codex standard light mode: routine small/medium work uses direct/inline execution unless
  the user explicitly asked for sub-agents, delegation, or parallel agent work
- parallel-default behavior: 2+ independent agents dispatch as one batch unless a
  `sequential_reason` is recorded
- inline/direct execution is forbidden for non-trivial tasks only when an authorized
  Task/sub-agent tool is available and light mode does not apply
- lightweight sub-agent work defaults to `gpt-5.3-codex-spark` when model overrides are
  available, while explicit overrides, deep/high-risk/performance work, and failed Spark
  attempts use inherited/default or requested models
- overlapping writer scenarios split or use explicit worktree isolation
- installed-skill routing covers launch, deploy, release, security, migration,
  API/health, performance, SEO/content, analytics, rescue, docs, and skill-system flows

## Scenario Format

Each scenario should include:

```text
id: stable identifier
user_message: raw request
expected_owner: skill or route
expected_agents: optional list
expected_gates: optional list
expected_dispatch_mode: optional dispatch expectation (`parallel_batch`,
  `parallel_with_worktree`, `single_agent`, `mixed_parallel_waves`,
  `sequential_exception`)
expected_model_preference: optional model expectation (`gpt-5.3-codex-spark`,
  `inherited-default`, or `explicit:<model>`)
expected_waves: optional array of agent-name arrays, where each inner array is one batch
forbidden_execution: optional list such as `direct-edit` or `inline-with-agent-tool`
sequential_reason: required when 2+ expected agents are not expected to run in parallel
why: short reasoning
```

## Validation Levels

Level 1 structural validation:

- scenario file exists
- each scenario has required fields
- referenced skills/agents/gates exist in the repo

Level 2 behavioral validation:

- a parser or lightweight classifier confirms expected routes
- false positive and false negative guard cases remain stable
- visual UI requests distinguish `frontend` behavior work from `ui-builder`
  visual-polish work
- UI route-level work requires browser evidence gates
- security-sensitive work has a formal `security-gate` route
- async frontend data-flow work can use `frontend` as writer while still requiring
  component state and browser evidence gates
- scenarios with 2+ independent expected agents declare `expected_dispatch_mode` or a
  `sequential_reason`
- scenarios marked with `forbidden_execution` are checked so direct/inline regressions do
  not become the default again
- review convergence scenarios require `Review Convergence Gate`, stale-gate reruns, and
  no `single-review-only` completion path
- generated `.claude/agents/ssp-*` definitions match portable source content

Level 3 live validation:

- representative scenarios are executed by the agent runtime and reviewed

The skill pack requires Level 1 and a lightweight Level 2 classifier in
`skills/audit-skills.sh`. Level 3 remains optional because it depends on the active agent
runtime.
