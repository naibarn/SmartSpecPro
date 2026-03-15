# Research Notes

## Deck evidence

- Latest affected deck: `presentation_decks.id = 55` (`New Presentation 14/3/2569 14:50:11`)
- Deck 55 pattern from persisted JSON:
  - `7/8` slides saved as `long_form_block`
  - `6/8` slides saved as `sectioned-explainer`
  - slide 5 (`two-column-article`) has `image_srcs = []`
- This confirms recipe monoculture and at least one real missing-image persistence case.

## Root causes observed in code

### 1. Recipe monoculture / weak layout variety

- `resolveAIComponentRecipeForSlide()` in `apps/web/server/services/aiPresentationService.ts` heavily prefers `sectioned-explainer` for dense content.
- Overflow safety currently reroutes some unsafe recipes to `sectioned-explainer`, which is safer than broken output but can still over-concentrate the deck into one family.
- `buildRecipeSupplementalMediaElements()` in `apps/web/server/services/aiPresentationLayoutEngine.ts` injects full-slide media behind text whenever the chosen component has no media slot, reinforcing the repeated “text overlay on image” look.

### 2. Missing image on some slides

- Deck 55 slide 5 is persisted with no `image` element at all.
- This is not a polling/pending-media issue; persisted JSON already lacks image binding.
- Current pipeline allows text-only recipes such as `two-column-article` to survive even when the generated deck would benefit from media and the surrounding deck is otherwise media-rich.

### 3. Text/note drift and text escaping blocks

- Earlier fixes aligned saved notes with rendered content by building note text from rendered slide content for auto-topic/fallback slides.
- Remaining text escape issue is separate: fallback components and overlay-heavy layouts can still fit visually poorly because the family choice is wrong or because supplemental media keeps the text in an image-overlay composition instead of using split/article layouts.

## Likely affected modules

- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/services/aiPresentationLayoutEngine.ts`
- `apps/web/server/services/aiPresentationComponentRecipes.ts`
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`

## Constraints

- Keep fixes server-side so saved deck JSON is correct on first load.
- Prefer deterministic fallbacks over “unsafe but saved anyway”.
- Preserve media URLs already generated when switching recipes/families.
