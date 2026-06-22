# Interview - Feature 123 Agent Experience Adapter Layer

## Interview Result

No additional user questions were required for Phase 0 planning.

The source spec already answers the key business and rollout questions:

- first live preview surface: Agency Chat
- package location: `packages/agent-experience`
- first implementation slice: package/contracts/fixtures/adapters/flags
- Runtype Persona posture: optional Phase 2 bridge, no Phase 0 dependency
- customer widget/page actions: explicitly deferred
- rollout posture: fixture preview before shadow mode before live preview

## Auto-Decisions

1. **Planning scope**
   - Decision: plan sections 01-08 from the spec, but make sections 01-03 the recommended first deep-implement target.
   - Rationale: the spec says the safe MVP foundation is contracts, fixtures, adapters, and flags.

2. **Validation strategy**
   - Decision: prefer dependency-free TypeScript guards in Phase 0 unless the implementer confirms Zod is already acceptable for the new package boundary.
   - Rationale: the spec requires Phase 0 to remain dependency-free where possible.

3. **Testing strategy**
   - Decision: use Vitest for package, shared flag, and app component tests.
   - Rationale: existing repo tests use Vitest and feature flag examples already follow this pattern.

4. **Runtype Persona strategy**
   - Decision: do not install `@runtypelabs/persona` during MVP implementation.
   - Rationale: dependency gate and bridge evaluation belong to Phase 2.

5. **UI strategy**
   - Decision: fixture-only preview may be planned, but no default UI replacement is in MVP.
   - Rationale: avoids regressions in Chat, Agency Chat, and Team Room.

6. **Persistence strategy**
   - Decision: no new database migration or Agent Experience ledger in MVP.
   - Rationale: existing runtime, Team, Work OS, artifact, approval, and trace stores remain authoritative.

## Open Questions Carried Forward

These do not block Phase 0:

1. Debug inspector audience: domain admins vs platform admins/developers.
2. Runtype Persona evaluation mode: npm-only vs source-level review.
3. Canonical credit/budget service for non-media `cost.estimate`.
4. Whether `agent_runtime_traces` / `agent_runtime_checkpoints` are required before production beta.
