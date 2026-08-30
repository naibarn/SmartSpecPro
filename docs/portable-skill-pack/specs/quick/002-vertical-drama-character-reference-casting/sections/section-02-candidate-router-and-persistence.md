# Section 02 — Candidate Router and Persistence

## Ownership

Own `verticalDramaCharacters.ts`, `verticalDramaCharacterStock.ts` and their focused tests. Preserve the existing no-reference path.

## Contract

- Extend preview input with bounded casting options and reference asset-link IDs.
- Branch to the named skill only for candidate mode with at least one reference ID.
- Validate asset IDs against tenant/user/series/character ownership and resolve provider-safe URLs.
- Store prompt-only candidates with a mode marker, options and reference IDs; retain optional snapshot compatibility.
- Resolve references again when submitting image tasks. Pass one reference set to each independent image task and keep `numImages/outputCount = 1`.
- Selection writes `visualBible` only if the selected candidate has a valid snapshot; otherwise only promote the image and preserve existing DNA.

## TDD

- Add route branch tests for no-reference and reference-guided modes.
- Add metadata round-trip and selection preservation tests.
- Add provider/Hermes reference propagation assertions.
- Add ownership and max-bound rejection tests.

## Acceptance

Reference-guided candidate batches are durable, retryable and selectable; failure before task submission leaves no partial batch; existing candidate batches remain compatible.
