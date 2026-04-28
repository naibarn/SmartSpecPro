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

## Scenario Format

Each scenario should include:

```text
id: stable identifier
user_message: raw request
expected_owner: skill or route
expected_agents: optional list
expected_gates: optional list
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

Level 3 live validation:

- representative scenarios are executed by the agent runtime and reviewed

The skill pack currently requires Level 1 in `skills/audit-skills.sh`. Level 2 can
be added when routing logic becomes executable outside the prompt.

