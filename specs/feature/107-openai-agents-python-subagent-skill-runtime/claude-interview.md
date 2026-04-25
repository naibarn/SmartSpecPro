# Interview Transcript

## Q1. Are there any business or product constraints that should change the default rollout order?

Answer:
No additional product constraints were provided beyond the spec. The implementation should support all three pillars together:
- creating new subagent-aware skills
- upgrading existing legacy skills toward subagent awareness
- running subagent-aware skills from every supported entrypoint

## Auto-Decisions

- Use OpenAI Agents Python as the primary runtime path.
- Keep the orchestrator in control by default.
- Prefer `Agent.as_tool()` for bounded specialist work.
- Use handoffs only when ownership must truly transfer.
- Keep single-agent skills valid and make subagent support opt-in.
- Add a machine-readable `subagents.json` manifest and validate it against `SKILL.md` and `skill.lock.json`.
- Persist parent/child lineage and checkpoint state separately from conversation history.
- Enforce tool, path, and scope boundaries at runtime instead of relying on prose alone.
- Use `pytest` for `python-backend/` and `vitest` for `apps/web/`.
