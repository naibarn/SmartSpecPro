# Planning Request - Feature 082 Work OS

## User Request

Continue from the updated Work OS spec and turn it into an implementation plan and TDD plan that match the current codebase.

## Working Assumptions

- The current code already contains a partial Work OS implementation in `workOsService`, `workOsRouter`, `workOs` tests, the Drizzle schema, and the admin dashboards.
- The next step is planning and hardening, not redesigning the feature from scratch.
- Existing unrelated workspace changes, including locale edits, must be left alone.
- The plan should keep compatibility-first behavior, preserve tenant isolation, and avoid introducing a second workflow engine.

## Planning Focus

- Canonical Work OS schema and migration envelope
- Work OS service boundary and legacy compatibility adapter
- Intake normalization and triage fallback
- Approvals, exceptions, outcomes, and SLA state
- Operator surfaces, timeline projections, and monitoring
- Rollout, regression coverage, and release guardrails

## Non-Goals

- Replacing workpacks or role agents
- Rebuilding the whole UI from scratch
- Replacing the approval proxy backend immediately
- Backfilling every legacy record in the first pass
