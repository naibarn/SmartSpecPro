# Section 02 — Server Relation and Repair

## Ownership

Own `apps/web/server/routers/verticalDramaCharacters.ts` and focused router tests.

## Work

- Project symmetric twin metadata in list/detail DTOs while preserving existing fields.
- Add an idempotent tenant/user/series-scoped repair mutation for explicit legacy pairs.
- Materialize shared DNA snapshots and provenance without touching media or credits.
- Return actionable states for missing/ambiguous identity.

## TDD and acceptance

Test DTOs, repair idempotency, explicit series-53 pair fixture, ambiguity refusal,
authorization scope, and zero calls to generation/credit services.

## Risks

Use additive JSONB updates and optimistic revision checks where available. Never update
rows outside the supplied series or infer a relation from a single vague role string.

## Implementation status (2026-09-06)

Implemented `listCharacters` symmetric twin projection and the explicit,
tenant/user/series-scoped `linkCharacterTwins` mutation. The mutation is
credit-free, idempotent for an existing link, rejects variants/cross-links, and
materializes target shared DNA with provenance while preserving local data.
Subsequent identity-DNA edits on either linked row propagate only the shared
age/face fields to its sibling.
