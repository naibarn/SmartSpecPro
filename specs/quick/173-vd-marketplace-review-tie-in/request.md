# Request

Implement the approved Vertical Drama Marketplace-to-series tie-in review flow.

## Required outcome

- Add a real skill, `vertical-drama-marketplace-review-story-planner`, visible in
  the Admin Skills registry through the existing folder-sync/import contract.
- Given an authorized Marketplace Capture product, managed product images,
  product details/customer-journey evidence, selected series characters,
  Character DNA, and bounded relationship memory, generate exactly three
  distinct JSON idea cards per request.
- Each card must be a believable series scene/mini-episode, not a direct product
  pitch, and must contain acting, dialogue, product-use context, allowed
  benefits, prohibited/unsupported claims, and continuity notes.
- Persist runs and cards so later generations remain selectable without deleting
  previous ideas. Selecting a card hydrates the existing Special Tie-in dialog.
- When the selected story needs a missing character look or scene/location,
  create pending look/scene slot requests without overwriting existing assets.
- Repair the existing preview/fullscreen, model-selector, and Marketplace image
  selection failures shown in the supplied screenshots.

## Constraints

- Preserve unrelated dirty work in the repository.
- Reuse existing tenant/user authorization, managed media, skill runtime,
  Special Tie-in episode, Character DNA, look, and location boundaries.
- Do not auto-render paid media while generating ideas.
- Never infer or overwrite authoritative Character DNA/visual state from prose.
