# Section 01 — Contract and Transactional Persistence

## Ownership

Shared Vertical Drama contracts/resolver, language-setting router procedures,
and their focused tests.

## Tasks

- Add optional `imagePromptLanguage` to `VerticalDramaStartFramePlan`.
- Correct stale shared-language documentation.
- Add a pure effective-image-language resolver.
- Add `setEpisodeImagePromptLanguage`.
- Update `setEpisodeVideoPromptLanguage` to snapshot legacy image language in
  the same locked fresh-row transaction before changing video language.
- Preserve tenant/user/series ownership predicates and credit-free behavior.

## TDD expectations

Write failing resolver and router tests first, including a fresh-row fixture
whose frames differ from the initially loaded row. Assert that the fresh frames
survive the merge.

## Acceptance checks

- Explicit image language wins.
- Legacy shared language is the fallback only while image language is absent.
- English is the final fallback.
- Both mutations return independently persisted values.
- A failed write cannot partially change video language without snapshotting
  image language.

## Implementation result

Completed. Added the shared resolver and independent image-language mutation.
Both language setters now merge against a locked fresh episode row, and the
video setter snapshots the legacy effective image language atomically.
