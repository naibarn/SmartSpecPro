# Orchestra Plan

## Task
Deep-implement feature-131 vertical-drama-series-storyboard-video-flow — all 9 section files — autonomously, using sub-agents, no per-step confirmation.

## Classification
- scope: project (full feature, 9 sections)
- risk: HIGH (10 new DB tables + migration, tenant isolation, media generation, feature flags, provider adapters)
- affected_domains: [shared contracts, drizzle schema/DB, apps/web skills, tRPC routers, services, React UI, python-backend provider, tests]
- chosen_route: section-by-section implementation in dependency order (claude-code, sub-agents authorized)
- decision_mode: auto_by_default (user waived confirmation)
- parallel_default: true (disjoint sections per wave)
- branch: feat/131-vertical-drama-implementation

## Dependency Waves (from sections/index.md)
- Wave 1: section-01 (skills), section-02 (contracts+DB) — no deps, disjoint
- Wave 2: section-03 (deps 02)
- Wave 3: section-04 (deps 01,02,03)
- Wave 4: section-05, section-07 (deps 01,02,04)
- Wave 5: section-08 (deps 01,02,04,05,07)
- Wave 6: section-06 (deps 02,04,05,07,08)
- Wave 7: section-09 (deps 02,04,06,07,08)

## Safety
- DB Safety Protocol: full backup + row-count baseline before section-02 migration; new tables are additive (low risk).
- Feature flags default OFF (fail-closed) — no behavior change to existing app until enabled.
- Conductor owns: DB migration, git, gates. Sub-agents own bounded per-section file writes.

## Gates per wave
- `cd apps/web && pnpm check` (typecheck), focused `pnpm test -- <area>`, security gate for router/auth/schema waves.
