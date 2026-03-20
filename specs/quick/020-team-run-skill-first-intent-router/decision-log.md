# Decision Log

- Planning depth: `standard`
- Rationale:
  - The request is cross-cutting and architecture-heavy, but the needed solution can still be framed as a compact, execution-safe package because the codebase already contains most primitives.
  - The core need is not “invent a brand-new platform”, but “rewire existing chat/skill/agency/team-run systems behind a stricter routing contract”.

## Key architectural decisions

- `team run` should become `skill-first`, not `prompt-first`
- add a dedicated `room intent router` instead of letting room messages directly imply execution semantics
- keep `chat`, `skill`, and `agency` as the only top-level execution routes
- introduce an internal-only fallback skill for assistant-to-assistant discussion inside rooms
- keep direct Node→Python raw LLM turn execution only as emergency fallback, not default
- do not overload `roomType` to mean execution route; keep route resolution per message / turn

## Why not keep the current direct-LLM team turn path as the primary runtime?

- it bypasses the more mature skill execution policy layer
- it duplicates model-routing logic in a weaker form
- failures degrade to generic placeholders like `[Agent turn unavailable]`
- it makes normal team discussion and specialized execution look the same to the runtime

## Why not route everything to agency?

- many room actions are simple and should not pay the complexity overhead of full agency orchestration
- single-step specialized skills already exist and are cheaper, clearer, and easier to observe
- users still need a lightweight chat path for human-to-team conversation

## Why a dedicated team discussion skill?

- it centralizes model selection and policy under the skill system
- it allows later tuning of agent-to-agent behavior without touching generic chat
- it gives a safe default for “discussion turns” that are not specialized enough to map to another skill

## Review / revision rounds

### Round 1

- Check: architecture completeness
- Finding: initial draft did not separate human-originated room messages from agent-originated turns
- [AUTO-FIX]: split routing responsibilities in the implementation plan

### Round 2

- Check: codebase fit
- Finding: draft underused existing `skillExecutionPolicy` / `taskPlannerMiddleware`
- [AUTO-FIX]: made planner/policy reuse a first-class requirement

### Round 3

- Check: hidden recursion risks
- Finding: the team discussion skill could recurse into agency with no guardrail
- [AUTO-FIX]: added escalation thresholds and anti-recursion guidance

### Round 4

- Check: boundary between room type and route
- Finding: room type was still at risk of being conflated with runtime route
- [AUTO-FIX]: explicitly kept execution route as per-message / per-turn resolution

### Round 5

- Check: security / visibility
- Finding: internal-only skills were not specified tightly enough
- [AUTO-FIX]: added internal-only skill metadata and surface scopes to the plan

### Round 6

- Check: observability and rollout
- Finding: migration path for existing direct team turns was underspecified
- [AUTO-FIX]: added staged rollout, fallback rules, and audit fields

### Round 7

- Check: contradictions and obvious omissions
- Finding: no remaining meaningful gaps after adding section ownership and TDD coverage
- Outcome: second consecutive pass without a material architecture change; stop review loop
