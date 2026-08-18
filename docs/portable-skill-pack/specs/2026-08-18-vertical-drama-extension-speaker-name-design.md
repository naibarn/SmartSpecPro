# Vertical Drama Extension Speaker Name Resolution

## Problem

The Chrome extension's Drama Series shot cards can display internal speaker
identifiers such as `character-2` instead of the character's display name. The
panel renders the extension API response correctly; the server projection is
the boundary that currently leaks the internal identifier.

## Approved design

Resolve every non-narrator speaker at the extension read boundary using the
series' existing `vertical_drama_characters` rows. Prefer stable identity
fields (`speakerCharacterId` and the matched clip `characterKey`) over a stale
`speakerName`. Preserve an already human-readable name for legacy records, but
never expose opaque `character`/`character-N` identifiers. If no canonical or
human-readable name can be resolved, return `ไม่ระบุผู้พูด`.

This fixes existing persisted episodes immediately without a migration or an
extension UI change. The response shape remains unchanged.

## Failure handling

- Narration remains `ผู้บรรยาย`.
- A canonical character map entry always wins over an opaque stored label.
- Missing character rows degrade to `ไม่ระบุผู้พูด`, not an internal key.
- Dialogue text, emotion, timing, authorization, and media projection remain
  unchanged.

## Verification

Add focused regressions for both dialogue-audio-plan and clip-only paths, then
run the existing extension read-service suite, touched-file type diagnostics,
and scoped diff checks.

