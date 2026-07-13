# Request

Implement the approved design in
`docs/portable-skill-pack/specs/2026-07-13-grok-native-audio-capability-invariant-design.md`.

## Task

Make every Grok video model native-audio-capable regardless of provider and
prevent the previously-fixed rule from regressing again. Ensure native-audio
single-speaker and speaker-switch prompts retain every dialogue line, protect
dialogue through prompt QC, and prevent storyboard-derived artifacts from being
silently reused after a storyboard revision.

## Constraints

- Grok image/upscale models must not be classified as native-audio video.
- Existing user artifacts must not be deleted.
- Production backfill is report-first, backup-before-apply, and is not executed
  without explicit authorization.
- Preserve unrelated dirty-worktree changes, especially in the MCP seed,
  episode router/pipeline, and storyboard UI files.
- No new dependency unless the existing runtime cannot provide hashing/testing.

## Non-goals

- Changing native-audio capability rules for non-Grok model families.
- Automatically regenerating paid media.
- Mutating production data during tests or normal application startup.

