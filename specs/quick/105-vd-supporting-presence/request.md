# Request

Implement shot-local supporting presence for Vertical Drama image generation.

## Requirements

- Auto-detect generic visible people/groups from each shot's own story content.
- Support police, villagers, building members, staff, customers, crowds, and
  other generic roles without requiring a durable character row.
- Keep identity-locked character refs, screen callers, and generic supporting
  presence as separate contracts.
- Give the user full per-shot customization: accept, edit, add, remove,
  suppress, and optionally promote later.
- Never propagate an auto-detected role to unrelated shots.
- Preserve user overrides during prompt/start-frame regeneration.

## Scope

Expected surfaces are the shared Vertical Drama contracts, storyboard generation
schema/prompt, start-frame prompt/planning projection, episode router mutation,
episode page wiring, storyboard panel UI, and focused tests. No database migration
is required because storyboard and start-frame plan are JSONB documents.

## Non-goals

- Automatically creating durable character roster entries.
- Automatically attaching portraits for generic roles.
- Automatic paid image regeneration or automatic promotion of named people.
