# R6 Wave 1 Ownership Contracts

Reconnaissance only. No concurrent writer is authorized by these contracts.

| Workstream | Owner | Owned paths | Output | Constraints |
|---|---|---|---|---|
| AutoTeam runtime | `/root` primary conductor | runtime/test path pending scout; scouts read-only | exact call graph, scheduled entrypoint, missing acceptance, safest single-writer implementation slice | preserve runEngine and Feature186 authority; no second scheduler |
| Schema fixture | schema scout | `apps/web/drizzle/**`, curated test bootstrap scripts, current schema/migration sources (read-only) | dependency closure and minimal disposable bootstrap; retired migration hazards | no DB connection/mutation, no migration execution, no edits |
| SPEC-271 / SPEC-302 authority | authority scout | SPEC-271 and SPEC-302 specs/handoffs plus SPEC-224 authority docs (read-only) | exact owner blockers and independently eligible tests | no fabricated grants, no promotion of synthetic evidence to authoritative receipt |
| AutoTeam recovery map | runtime scout | AutoTeam scan/evaluation/recovery files and direct tests (read-only) | scheduler→scan→evaluation→runEngine chain and test seams | no edits; include exact symbols and test commands |

All scouts use the exact clean task worktree at `c889afaa231c6abd0aec38860037283ff7aa3863`. They must report `read-only`, exact files inspected, conclusions, and unknowns. Model override: `gpt-5.6-sol` because the packets' primary deliverable is decomposition/acceptance planning; no implementation writes.
