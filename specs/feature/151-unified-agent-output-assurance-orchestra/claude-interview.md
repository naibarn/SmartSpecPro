# Deep-plan interview record

No follow-up interview was requested or needed: the user explicitly instructed autonomous execution without waiting for confirmation. The following decisions are inferred from the request history and are binding planning assumptions.

| Decision | Inferred answer |
| --- | --- |
| Primary outcome | Replace direct skill-only prompting and Agency Swarm execution with a reusable OpenAI Agents SDK Orchestra that plans, composes, verifies, repairs, and only then returns or authorizes output. |
| Scope | All current and future task kinds: video/image/text prompts, native skills, structured output, phone/cross-location/shout scene modes, narration, prop interaction, and new rule packs. |
| Quality policy | Deterministic contract and provider/evidence/side-effect gates are mandatory; an LLM reviewer alone is insufficient. |
| Credit policy | No paid provider call or credit reservation until evidence quality, output contract, provider capability, budget, and side-effect authorization pass. Unknown provider outcomes reconcile rather than auto-retry. |
| Identity policy | User selections may repeat or be changed. A custom character description overrides positional cues for that character and is omitted when empty. Speaker identity and visible-face requirements are explicit. |
| SDK policy | Adopt the current compatible OpenAI Agents SDK through a controlled dependency profile; do not let a package upgrade silently break the existing runtime or Agency migration tooling. |
| Agency policy | No new Agency Swarm execution and no fallback. Preserve historical records through read-only export/reconciliation, then remove active package/code/route references after proof. |
| Persistence policy | Preserve existing trace, checkpoint, idempotency, tenant, user, credit, and audit semantics. New assurance records must be replayable and tenant-scoped. |
| Release policy | Implement in bounded waves, run focused tests after each wave, stage only owned paths, commit, and push `main`. |
