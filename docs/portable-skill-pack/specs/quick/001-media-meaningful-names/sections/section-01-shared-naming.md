# Section 01: Shared naming contract

## Ownership

Own the pure shared media naming module and its unit tests. Do not modify Gallery routes or Vertical Drama callers in this section.

## Target files

- New `apps/web/shared/mediaDisplayName.ts`.
- New focused test near the shared/web test conventions.

## Behavior

Implement normalized recursive metadata extraction with bounded depth. Support explicit title, series title, episode number, shot number, clip number, source filename, prompt, and media type. Return a display title and safe download filename. Keep the resolver dependency-free and usable from client and server.

## TDD and acceptance

- Cover precedence, VD formatting, generic fallback, truncation, extension, Unicode, and unsafe characters.
- The resolver must be deterministic and must never return `remotion_render_mp4` when a meaningful field exists.

## Risks

Avoid broad task-object typing or provider-specific imports. Do not make the resolver depend on database access.
