# Claude Interview Transcript - 083-Agent-Registry-And-Organization-Model

Interview mode for this run:
- No live stakeholder Q&A was required because the user explicitly delegated the design choices to the system.
- The decisions below are the plan-time assumptions I adopted to keep the implementation grounded and consistent with the repository.

## Q1. Where should the registry live?

Assumed answer:
- In the existing `apps/web` stack as DB-backed records, with Drizzle schema changes and service/router layers in the web server.

Why:
- The repo already hosts role-agent governance, tenant flags, and runtime delegation there.
- That keeps registry selection close to the systems that already consume capability and rollout data.

## Q2. What should outcome memory store?

Assumed answer:
- Summarized, machine-readable outcome memory only: workload class, selected version, model family, success/failure outcome, operator overrides, and improvement notes.

Why:
- That is enough for version guidance and promotion decisions without duplicating raw traces already captured elsewhere.
- Raw execution logs and telemetry should remain in the existing activity/event systems.

## Q3. What rollout targeting should be in scope?

Assumed answer:
- Tenant, team, queue, and workpack-family targeting in the first release.
- Environment and model-family compatibility should be recorded as metadata, but not treated as the primary targeting axis unless a later feature needs it.

Why:
- Those four selectors match the spec and the existing tenant/team/workpack structure already in the repo.
- Keeping the first scope tighter reduces the chance of ambiguous eligibility logic.

## Q4. How should policy widening behave?

Assumed answer:
- Any widening of tool scope, data scope, or budget must force review, create a new immutable version, and preserve the previous stable pointer for rollback.

Why:
- This is the safest default for a governed registry.
- It aligns with the spec's emphasis on explicit version promotion and fail-closed authority.

## Q5. How should Feature 080 consume this work?

Assumed answer:
- Feature 080 role agents should migrate onto the registry through an adapter path, not by rewriting all role-agent logic at once.

Why:
- The repo already has working role-agent flows.
- An adapter path lets us preserve behavior while centralizing governance.
