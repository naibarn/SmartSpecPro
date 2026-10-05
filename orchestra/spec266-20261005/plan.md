# Orchestra Plan — Spec 266 R1.2 Completion

- Intent: explicit deep-plan → deep-implement all sections → at least ten independent gap-review rounds.
- Scope: large; eight dependent sections across contracts, persistence, research, resolver, GIS, admin, packs, and migration gates.
- Risk: high; tenant isolation, rights, evidence lineage, durable jobs, external providers, and migration/rollback.
- Route: research/provenance slice first (complete); deep-plan recovery/rebuild (complete); deep-implement all eight sections (complete); eleven post-implementation review rounds (complete); scoped final proof (complete), with heavy integration verification pending.
- Worktree: isolated `/home/dev/projects/SmartSpecPro-spec266-unified-data-evidence`, branch `codex/spec266-unified-data-evidence-20261005`, based at `d6ef8f3eb88f408a0259633ef4c48325e12bf0cd` plus the exact user-dirty Spec 266 R1.2 spec diff.
- Original checkout: heavily dirty on `codex/spec261-spaas-phase-a-20261005`; untouched except creation of the isolated worktree.
- Research: SocratiCode unavailable; targeted shell/agent discovery and official W3C/OpenAI/Cloudflare sources captured in the Spec 266 `claude-research.md`.
- Hard gate: checked-in `orchestra/.wave-active` names a separate active schema-owner wave. No Drizzle schema/SQL/snapshot/journal edits or migration execution until that owner releases it.
- Scope gate: `worker_jobs` + outbox only; prohibited retired systems stay absent. 260/262 source/write authority remains intact.
- Verification: focused Vitest and static checks only; repository-wide typecheck/build/E2E are prohibited or resource-heavy.
- Loop budget: user-required ten post-implementation review rounds are a distinct checklist series; close every MUST_FIX and rerun impacted focused gates each round. Record all ten rounds durably.
