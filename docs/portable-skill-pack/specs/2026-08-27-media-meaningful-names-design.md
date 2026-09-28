# Meaningful Media Names for New Generated Assets

**Date:** 2026-08-27  
**Status:** Implemented
**Scope:** New image/video media created by generation and later shown in Media History, Library, or the public Gallery.

## Problem

Generated media currently falls back to provider or renderer-oriented prompt text. For Vertical Drama renders this can produce repeated names such as `remotion_render_mp4`, which makes the Gallery difficult to understand and search. The same media should have a meaningful display name and a meaningful download filename.

## Goals

- Generate a meaningful name at the source where the media job is created.
- Reuse one deterministic naming policy in Media History, Library, Gallery, and downloads.
- Prefer structured Vertical Drama metadata: series title, episode number, shot number, and clip number.
- Preserve the full generation prompt as searchable description/context.
- Apply the policy to new media only; do not rename historical records.
- Keep names safe for HTTP downloads and filesystem use.

## Non-goals

- Do not rename internal artifact types such as `remotion_render_mp4`.
- Do not rename existing R2/storage object keys or migrate historical media.
- Do not expose provider task IDs or internal job IDs as the primary user-facing name.
- Do not change media generation prompt semantics sent to providers.

## Naming policy

The resolver uses the first usable value in this order:

1. Explicit user/domain display title supplied by the caller.
2. Vertical Drama structured metadata:
   - series title
   - episode number
   - shot number and/or clip number when applicable
3. Existing source filename or title metadata.
4. A cleaned, bounded meaningful prefix of the prompt.
5. A technical fallback only when no meaningful text exists.

Examples:

- `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1`
- `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1 คลิป 2`
- `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29`
- Generic media with no domain metadata: a cleaned prompt title rather than the model ID.

The display title is bounded to the Gallery title limit. Separators and repeated whitespace are normalized, and control characters/path separators are removed from download filenames. The media extension is preserved or inferred from the media type.

## Data flow

1. Generation callers provide trusted naming metadata alongside existing provenance metadata.
2. The media task retains that metadata without sending app-only fields as provider prompt/input fields.
3. A shared resolver derives the user-facing display title and download filename.
4. Gallery publication writes the resolved title and the original prompt/description.
5. The public Gallery media endpoint uses the resolved filename for download responses only when the request is a download; normal image/video playback remains inline.
6. Existing records continue using their current title and current fallback behavior.

## Search behavior

Gallery search will continue to search title and description. New records will place the series/episode/shot keywords in the title and retain the complete prompt in the description, so searches such as the series name, `ตอนที่ 29`, or a prompt keyword can find the item.

## Compatibility and safety

- Internal `artifactType`, worker job contracts, render IDs, and durable storage keys remain unchanged.
- App-only naming metadata must be filtered from provider-facing payloads and must not alter generated output.
- Filename generation must prevent path traversal, control characters, and unsafe header characters.
- Names must be deterministic for the same metadata and must not contain a raw signed/provider URL.
- The resolver must degrade gracefully for non-Vertical-Drama image/video generation and for incomplete task metadata.

## Validation

- Unit tests for metadata precedence and Vertical Drama examples.
- Unit tests for Thai/Latin filename sanitization, extension handling, truncation, and empty metadata fallback.
- Media History tests confirming Add to Gallery sends the resolved title.
- Gallery/public-media tests confirming download responses use the meaningful filename while playback remains streamable/range-enabled.
- Focused typecheck/tests for affected web/shared packages.

## Acceptance criteria

- A newly generated Vertical Drama asset no longer receives `remotion_render_mp4` as its user-facing title when series/episode metadata is available.
- A newly published asset displays a searchable title such as `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1` and preserves its full prompt in description.
- Downloading that asset receives a filename derived from the same title, with the correct `.png`/`.mp4` extension.
- Existing Gallery items remain unchanged.
- Worker rendering, artifact reconciliation, public playback, and durable storage behavior remain compatible.
