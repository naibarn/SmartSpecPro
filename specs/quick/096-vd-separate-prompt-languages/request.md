# Request

Implement the approved design in
`docs/portable-skill-pack/specs/2026-07-22-vd-separate-image-video-prompt-languages-design.md`.

## Summary

Separate Vertical Drama image-prompt language from video-prompt language at
the sub-episode level. Policy-safe synopsis mode must always preserve the
authoritative synopsis language, while video prompts may independently use
English or another supported prompt language.

## Constraints

- No database migration; use existing JSONB plans.
- Preserve existing episode behavior until a setting is changed.
- Snapshot the old shared prompt language as image language before changing a
  legacy episode's video language.
- Preserve concurrent frame/clip data with a locked fresh-row merge.
- Do not regenerate existing prompts or media when settings change.
- Do not change dialogue language, Thai accent, model routing, or Option 2's
  cinematic behavior.

## Non-goals

- Translating Option 1 synopses.
- Data backfill.
- New dependencies or visual redesign.
