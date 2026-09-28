# Section 02 — Public media model catalog

## Ownership

Own `apps/web/server/routers/mediaModels.ts` and its adjacent router tests.

## Work

- Load provider enabled state for `mediaModels.list`.
- Apply the same normalized disabled-provider predicate for image, video, and
  audio.
- Build the returned provider list after filtering.
- Leave `adminList`, `adminTemplates`, and readiness annotations unchanged.

## User-facing contract

- Target user: authenticated user choosing a generation model.
- Surface inventory: Media Studio, Vertical Drama, Marketplace, presentation,
  video editor, and other clients consuming `mediaModels.list`.
- State matrix: loading/error behavior remains query-driven; a disabled
  provider model is absent; an empty eligible catalog remains empty and should
  not display a stale option.
- Responsive/accessibility: no component markup changes; existing selectors
  consume the filtered response and retain their current keyboard and screen
  reader behavior.
- Copy/localization: no new user-facing copy is required. Existing generation
  error copy remains the fallback for stale persisted selections.
- Browser evidence: an authenticated browser check is recommended after
  deployment; it is outside local contract proof.

## TDD expectations

- Test all three media types with enabled/disabled provider fixtures.
- Test that Admin still returns the disabled model with
  `providerReadiness: "provider_disabled"`.
- Test provider list contains no disabled-only provider after filtering.

## Risks

- Do not reuse Admin `includeDisabled` semantics in the public procedure.
- Do not broaden the change to API-key or health-test filtering here.

## Implemented

- `mediaModels.list` now loads provider state and removes models belonging to
  disabled providers before capability projection.
- `media.getModels` now treats present-but-disabled provider rows as
  authoritative, preventing the all-disabled fallback leak.
