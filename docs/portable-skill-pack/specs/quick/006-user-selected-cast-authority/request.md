# Request

Implement the approved user-selected cast authority for Vertical Drama prompt
generation.

## User requirements

- Treat the characters selected by the user for the approved frame as the
  authoritative physical cast.
- Allow only explicitly selected caller references as an additional caller/media
  presence.
- Do not derive visible characters from synopsis, storyboard mentions, episode
  beats, or continuity prose.
- A character mentioned only as narrative context must not appear in the Start
  Frame image or video prompt.
- Do not block prompt generation merely because narrative/storyboard context
  contains an extra character.
- Apply the same rule to Start Frame, Legacy, and Enhanced paths.
- Preserve authored dialogue and prevent wrong-speaker reassignment.
- Do not mutate existing episode data, call an AI provider, regenerate media, or
  spend credits during implementation verification.

## Evidence driving the change

Episode 262 shot 9 has three user-selected physical characters, while its
storyboard also lists มยุรี even though she is only mentioned in the narrative
and has no dialogue or visual presence. The approved frame is correctly a
three-person image; the prompt pipeline must not reintroduce the fourth name.

## Constraints

- Preserve unrelated dirty work in the repository.
- Keep the existing tenant/ownership and paid-action boundaries unchanged.
- Prefer a shared resolver over separate Legacy and Enhanced heuristics.
- Use the package manager and focused tests already used by `apps/web`.

## Non-goals

- No automatic repair or regeneration of the existing episode 262 media.
- No database migration.
- No redesign of the storyboard UI or caller picker.
- No provider retry or production deployment.
