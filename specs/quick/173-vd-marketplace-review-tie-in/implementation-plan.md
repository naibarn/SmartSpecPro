# Implementation plan

## Objective

Deliver a durable Marketplace-to-Vertical-Drama tie-in idea workflow and close
the three observed UI/data failures while preserving normal episode behavior.

## Contract and persistence

1. Add shared Zod contracts for product snapshot, managed image references,
   bounded customer-journey evidence, selected character/DNA summaries,
   relationship memory, three idea cards, and additive look/scene slot requests.
2. Add a durable run/card store scoped by tenant, user, and series. Store the
   input fingerprint, variation index/seed, skill trace, normalized output,
   selected card, and bounded failure state. Deduplicate only identical retry
   intents; a new generation request must produce a new variation seed.
3. Add an additive migration/schema definitions and indexes for series/product
   lookups. Existing tables/rows remain unchanged.

## Skill-first runtime

1. Add `apps/web/skills/vertical-drama-marketplace-review-story-planner/` with
   `skill.md`, input/output schemas, examples, and strict JSON instructions.
2. Require the skill to create series scenes with character desire/conflict,
   natural dialogue and action, grounded product benefits, no unsupported
   claims, and continuity/DNA checks. Require exactly three distinct cards.
3. Add a server adapter using the shared text skill runtime. The server
   authorizes product/images/series/characters first, passes managed media
   references and bounded data, validates output, and persists it. No creative
   prose is appended by server code.

## API and UI integration

1. Add protected procedures to generate/list/select/delete idea cards and to
   create additive pending look/scene requests. Use existing tenant and series
   authorization helpers.
2. Add a Marketplace Review Ideas panel in the Special Tie-in dialog with
   product selection, character selection, generate-3 action, loading/error/
   empty states, card selection, and “use this idea” hydration into the
   existing Special Tie-in fields.
3. Keep normal episode creation and paid image/video actions unchanged.

## Fixes and slot orchestration

1. Fix Marketplace materialization so a Marketplace-managed storage key is
   copied/registered into Vertical Drama managed media when it is not already a
   Vertical Drama asset; return the durable URL and use it in the reference
   preview.
2. Add accessible reference thumbnails with separate fullscreen/lightbox
   actions, Escape and backdrop close, and protected media handling.
3. Make special model catalog responses explain compatibility. Keep exact
   provider capability checks at submit time, but choose a valid default
   duration/model combination or show an actionable duration adjustment rather
   than an unexplained empty selector.
4. Normalize skill `lookSlotRequests` and `sceneSlotRequests`; persist additive
   pending requests keyed by series/character or series/location and request
   fingerprint. Surface them in Character/Scene tabs with a link/status, while
   keeping the existing DNA and approved assets authoritative.

## Security and failure handling

- Product/image/character/media IDs are resolved server-side under the caller's
  tenant/user/series scope.
- Canonical references are managed IDs; raw provider URLs are execution-only.
- Skill output is schema-validated, bounded, and treated as untrusted text.
- Provider/runtime failure leaves a failed run with a retry action and does not
  create an episode or charge media credits.
- Slot requests are idempotent and never mutate authoritative visual state.

## Acceptance criteria

- Admin Skills lists the new skill after sync/import and its schemas parse.
- One generate action yields exactly three distinct persisted cards; a second
  action yields a different variation without removing the first run.
- A card renders as a series scene/script with natural product tie-in, acting,
  allowed/prohibited claims, and DNA/continuity notes.
- Selecting a card hydrates Special Tie-in and can create an episode through the
  existing non-paid creation path.
- Marketplace images materialize successfully, preview in the dialog, and open
  fullscreen.
- Image/video model selectors show compatible options or an actionable reason;
  no silent empty dropdown occurs for a valid catalog.
- Missing looks/scenes create pending additive requests visible in the proper
  tab, with no overwrite of existing DNA/look/scene records.
- Focused tests, schema/migration tests, client build, server parse/build, and
  targeted diff checks pass. Browser/live provider/migration execution remains
  explicitly reported if unavailable.
