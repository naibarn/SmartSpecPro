# Media Studio Aspect Ratio Single Source Design

## Problem

Media Studio displays the canonical `aspectRatio` selection, but the generation
path can prefer a hidden `dynamicFormValues.aspectRatio` value seeded from a
skill schema. A hidden default such as `16:9` can therefore override a visible
`9:16` selection before the request reaches the backend and Kie.ai.

## Decision

The visible Media Studio `aspectRatio` state is the canonical source for image
generation. Skill form fields named `aspectRatio` or `aspect_ratio` are aliases
of that state, not independent generation settings.

The existing Veo storyboard resolver remains the only specialized exception
because it intentionally reconciles provider generation mode constraints.

## Data Flow

1. The user changes the Media Studio aspect-ratio selector.
2. Media Studio stores the value in the tab's canonical `aspectRatio` state.
3. Hidden skill aliases and model input aliases mirror the canonical value.
4. New generation and retry generation derive their final ratio from the same
   resolver.
5. The request sends matching top-level `aspectRatio` and model-specific
   `extraParams.aspect_ratio` values.
6. The server treats the top-level value as authoritative when normalizing
   duplicated aspect-ratio fields before forwarding to Python/Kie.ai.

## Changes

- Add a small pure resolver for the final Media Studio generation ratio.
- Use it in both initial generation and retry paths.
- Prevent `DynamicSkillForm` from seeding defaults for excluded fields.
- Keep hidden skill aliases synchronized with the canonical ratio where those
  aliases already exist.
- Normalize conflicting duplicated aspect-ratio values at the server boundary.
- Preserve Veo storyboard-specific aspect-ratio behavior.

## Failure Handling

- Empty or absent skill aliases cannot replace the canonical ratio.
- A stale hidden value cannot replace a newer visible selection.
- A conflicting client payload is normalized at the server boundary rather
  than forwarded inconsistently.
- Existing model-supported-ratio validation remains active.

## Verification

- Unit test: visible `9:16` plus hidden skill default `16:9` resolves to `9:16`.
- Unit test: excluded Dynamic Skill fields are not seeded into hidden state.
- Unit test: retry uses the same ratio resolution as first generation.
- Unit/server test: conflicting top-level and extra-param ratios normalize to
  the top-level value.
- Run focused frontend/server tests and the relevant TypeScript check.

## Non-goals

- No change to Kie.ai model routing, credit calculation, prompt generation, or
  supported aspect-ratio lists.
- No database migration or new dependency.
