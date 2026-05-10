---
name: intelligence-skill-creator
description: Native skill bundle for intelligence-skill-creator
version: 0.5.1
category: automation
execution_mode: sandbox-command
target_platform: agents_python
bundle_topology: single-agent
triggerPatterns:
  - intelligence skill creator
  - Intelligence Skill Creator
---
# Intelligence Skill Creator
## When To Use

Use this skill when the task should run through the native OpenAI Agents Python bundle contract.
## OpenAI Agents SDK Compatibility

- Mount this bundle into the Agents SDK `Skills` sandbox capability.
- Keep `scripts/run.sh` and `scripts/verify.sh` deterministic and shell-safe.
- Prefer structured outputs, explicit inputs, and resumable artifacts.
## Inputs

- None
## Workflow

- discover
- inspect
- plan
- execute
- verify
- summarize
- finalize
## Exact Commands

- `scripts/run.sh`
- `scripts/verify.sh`
## Guardrails

- Use scripts/run.sh and scripts/verify.sh as the declared entrypoints.
- Confine writes to declared output paths.
- Do not finalize before verification passes.
- Keep scripts deterministic, idempotent, and shell-safe.
- Prefer structured outputs that validate against the bundle contract.
- Keep logs trace-friendly with explicit task IDs and outcome messages.
- Preserve compatibility with legacy skill metadata during migration.
## Verification

- Run `scripts/verify.sh` before finalizing any run.
## Final Response Checklist

- Verification command completed successfully.
- Outputs are written to declared paths only.
- No secrets were persisted.
