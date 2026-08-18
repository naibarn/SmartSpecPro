# Implementation plan

## Objective

Return canonical character display names in Vertical Drama extension dialogue
lines and prevent internal character identifiers from reaching the panel.

## Current-codebase fit

Keep the change in `verticalDramaExtensionReadService.ts`, where the extension
response is already projected. Build a `characterKey -> name` map from the
already-loaded scoped character rows and pass it to the pure dialogue helper.

## Approach

1. Extend the pure projection input with a read-only character-name map.
2. Add a small resolver that considers narration, `speakerCharacterId`, the
   text-matched clip `characterKey`, and stored `speakerName`/`characterKey`.
3. Map identity keys to canonical names before accepting legacy human-readable
   labels.
4. Reject unresolved opaque `character`/`character-N` labels and use
   `ไม่ระบุผู้พูด`.
5. Pass the existing series character map from the episode-detail projection.

## Risks and mitigations

- Legacy keys may themselves be human-readable Thai names: preserve labels
  that are not opaque internal-key patterns.
- Audio-plan and clip lines are matched by text today: do not change matching,
  timing, emotion, or ordering behavior in this fix.
- Narration may lack a character key: resolve narration before speaker fallback.

## Acceptance criteria

- `speakerName: "character-2"` plus canonical mapping returns the real name.
- Clip-only `characterKey: "character-2"` returns the real name.
- A stale plan speaker label cannot override the clip's canonical character.
- Narration returns `ผู้บรรยาย`.
- Unresolved opaque keys never appear in the response.
- Existing human-readable legacy speakers still render unchanged.
- Existing focused tests pass with no API or UI type changes.

