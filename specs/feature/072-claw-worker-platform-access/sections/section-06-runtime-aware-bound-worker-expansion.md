# Section 06: Runtime-Aware Bound Worker Expansion

## Goal

Move Bound Worker eligibility from an OpenClaw-only check toward a runtime-aware capability and policy model.

## Why this section exists

The current codebase binds only `openclaw_gateway` workers to external connectors. That is a valid first production path, but Feature 072 should not hardcode this forever if ZeroClaw and other Claw-family runtimes are meant to join later.

## Scope

1. Preserve OpenClaw as the first supported runtime path.
2. Replace hardcoded binding assumptions with capability or policy checks where appropriate.
3. Introduce eligibility signals such as:
   - `supportsBoundConnector`
   - execution profile
   - capability families
   - policy profile
4. Update team-facing and admin-facing UX to display why a worker is bindable or not bindable.
5. Preserve personal-worker ownership so users bind only their own workers.

## Suggested files

- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/client/src/pages/Teams.tsx`
- worker registration and shared runtime schema files

## Eligibility rules

The implementation should distinguish:

- current production-ready OpenClaw binding
- future-eligible runtimes that can advertise the right capabilities
- runtimes that remain intentionally ineligible for Bound Worker flows

Ownership rules must also stay explicit:

- a user should register and manage their own personal workers
- worker selection surfaces should show only workers owned by the current user for normal binding flows
- another user in the same tenant must not be able to bind or use someone else's worker
- cross-tenant workers must never appear as eligible

This keeps the UX honest while still opening the architectural path for ZeroClaw later.

## Design rules

- Do not pretend all Claw runtimes are interchangeable.
- Do not remove the current OpenClaw production path until the runtime-aware contract exists.
- Prefer explicit capability and policy signals over string-matching runtime names in every call site.
- Do not let admin visibility turn into admin reassignment of one user's personal worker to another user by accident.

## Testing first

- team-service tests for current OpenClaw eligibility
- tests for rejection of unsupported or disabled workers
- tests for future capability-based eligibility wiring
- Teams page tests that show bindable and non-bindable states clearly
- owner-only binding tests
- cross-tenant invisibility tests

## Handoff to later sections

- Section 08 should explain the runtime support truth clearly in docs and rollout notes.
