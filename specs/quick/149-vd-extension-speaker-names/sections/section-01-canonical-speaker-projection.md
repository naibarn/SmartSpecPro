# Section 01: Canonical speaker projection

## Ownership

- `apps/web/server/services/verticalDramaExtensionReadService.ts`
- `apps/web/server/services/__tests__/verticalDramaExtensionReadService.test.ts`

Do not modify the extension panel, route contract, schema, migration files, or
unrelated Vertical Drama generation paths.

## TDD expectations

- First add failing assertions for timed-plan and clip-only opaque identifiers.
- Cover canonical precedence, legacy human-name preservation, narration, and
  unresolved opaque fallback.
- Implement only the resolver and existing character-map pass-through needed
  to make those assertions pass.

## Acceptance checks

- Focused Vitest suite passes.
- No `character`/`character-N` speaker value leaks from covered inputs.
- Existing dialogue text, emotion, duration, and response shape stay unchanged.
- Scoped TypeScript diagnostics and `git diff --check` introduce no findings.

## Risks

Exact-text matching between audio-plan and clip lines is existing behavior and
remains out of scope. The resolver must handle an absent map without breaking
legacy human-readable names.

## Implementation outcome

- Modified the two declared ownership files only.
- Added canonical resolution for audio-plan and clip-only dialogue, explicit
  narrator precedence, legacy human-name compatibility, and fail-safe handling
  for unresolved internal key families.
- Red phase: 3 new tests failed while returning raw internal identifiers.
- Green phase: focused suite passed 11/11 after implementation and again after
  the review fix.
- Full TypeScript diagnostics remain repository-baseline dependent; no reported
  diagnostic references either changed file.
