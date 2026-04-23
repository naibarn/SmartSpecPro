# Synthesized Specification

## Feature 106: OpenAI Agents Python Native Skill System

This feature upgrades SmartSpecPro’s skill stack so OpenAI Agents Python can load and execute skills as native bundles instead of relying on the current hybrid legacy entrypoint model.

## Problem to solve

The repository already has:

- a large skill library
- an Intelligence Skill Creator
- an OpenAI Agents adapter boundary
- checkpointing and maintenance tools

But the current system still mixes `skill.md`, `SKILL.md`, legacy `skill.py` / `skill.js` entrypoints, and DB-backed registry state. The desired runtime contract is not yet native to OpenAI sandbox agents and not yet enforced end to end.

## Required outcomes

- New skills must be creatable as native `agents_python` bundles.
- Native bundles must use `SKILL.md` as the primary contract.
- Executable bundles must include `scripts/run.sh` and `scripts/verify.sh`.
- The Python runtime must load skills through sandbox-mounted skills, using the sandbox agent pattern and lazy local skill loading for larger directories.
- Long-running runs must persist phase progress and support resume.
- Maintenance and migration must operate on the same bundle contract used at runtime.
- Safety rules must be enforced by runtime and validation policy, not only by prose in `SKILL.md`.

## Confirmed implementation order

1. ISC native bundle creation and export.
2. Native bundle evaluation and validation.
3. Python native skill runtime and supervisor.
4. Node registry, resolver, and router integration.
5. Maintenance, upgrade, and migration paths.
6. TDD coverage and cross-system rollout hardening.

## Migration policy

The rollout should not attempt to convert every legacy skill at once. It should start with a curated high-usage/high-risk subset, then broaden once the native bundle contract is stable.

## Testing model

- Web/Node code: `vitest`
- Python backend code: `pytest`
- Focus tests on bundle contracts, runtime loading, resume behavior, redaction, compatibility gates, and safe maintenance policies.
