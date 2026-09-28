# Request

Implement the approved Scene Visual State Inspector for Vertical Drama.

## User requirements

- Put the Inspector in the existing Location panel.
- Keep it collapsed by default so the storyboard does not become too tall.
- Make the heading and helper copy obvious to non-technical users.
- Edit the shared Location-level state once and apply it to every continuous shot
  in that Location.
- Allow corrections to the fields that currently cause visual drift, including
  furniture/bed type, props, wardrobe, lighting, layout, palette, and review
  gaps.
- Preserve existing images when the state changes.
- Mark affected prompt/image work as needing regeneration; do not auto-regenerate
  or spend credits on save.
- Complete the implementation and focused verification without another approval
  pause.

## Constraints

- Preserve unrelated dirty work in the repository.
- Reuse the current Scene Visual State API, revision checks, and shadcn-style UI
  primitives where possible.
- Keep feature-flag behavior unchanged.
- Do not deploy or mutate production data.

## Non-goals

- A full-screen Scene State workspace.
- Automatic image regeneration.
- Per-shot Scene Visual State overrides in this increment.
