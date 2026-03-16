# Orchestra Plan

## Task
Security audit of 3 local deep-* plugins (deep-plan, deep-project, deep-implement) and identify relevant cybersecurity skills from external repo to strengthen them.

## Classification
- scope: medium
- risk: high
- affected_domains: [security, plugins, scripts]
- estimated_file_count: 30+
- chosen_route: multi-agent waves
- task_summary: Audit local plugins for input validation, path traversal, command injection, secrets exposure, and subagent isolation gaps. Match findings to cybersecurity skills.
- decision_mode: auto_by_default

## Wave Plan

### Wave 1: Parallel Security Audit (3 agents)
- Agent A: ssp-security-fastapi — audit Python scripts in all 3 plugins
- Agent B: ssp-security-frontend — audit SKILL.md and reference docs for prompt injection / subagent isolation
- Agent C: ssp-research — fetch and analyze cybersecurity skills repo for relevant matches

### Wave 2: Aggregation (1 agent)
- Agent D: Conductor — synthesize findings, produce prioritized vulnerability list + skill recommendations
