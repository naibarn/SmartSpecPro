# Decision log

## Planning depth

- depth: standard
- rationale: the change spans a shared contract, an owner-scoped router
  mutation, prompt revision metadata, and a user-facing Character-tab editor;
  it remains bounded because storage stays in the existing JSONB object and no
  new service or SQL migration is required.
- promotion check: not promoted to full deep-plan; no unresolved product
  choice materially changes the approved outcome.

## Decisions

1. Use `updateCharacterIdentityDna` rather than generic `updateCharacter` data
   replacement. This protects unrelated JSONB fields and gives the server a
   focused validation boundary.
2. Treat `visualBible.ageRange` and `visualBible.designDna.ageRange` as one
   canonical age value and write them together.
3. Allow edits only to `ageRange` and `designDna.faceIdentity`; keep story/
   design analysis read-only in v1.
4. Add revision metadata in JSONB: `identityDnaRevision`,
   `identityDnaSource`, `identityDnaUpdatedAt`, and `promptDnaRevision`.
5. Save is non-generative. The UI marks existing prompt/portrait state stale and
   offers an explicit generation action.
6. Use optimistic revision checks to prevent silent last-write-wins behavior.

## Risks to re-check during implementation

- Prompt-generation persistence must preserve the edited canonical identity
  rather than replacing it with an unpinned LLM result.
- Existing visual-bible snapshots may not have revision metadata.
- The Character tab is a large component; keep new state/helpers isolated and
  add focused pure helpers/tests where possible.
- `data` is returned to the authorized client; do not broaden the DTO or expose
  private asset identifiers as part of this feature.
