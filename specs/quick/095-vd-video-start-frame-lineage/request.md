# Request

Fix the Vertical Drama per-shot video flow end to end after production evidence
showed that a valid Kie GPT Image 2 PNG was not sent to Grok Video.

The approved design is:

- preserve the current approved start-frame asset when a per-shot video prompt
  is persisted;
- reconcile the authoritative approved start frame again at video submission;
- stop the Hermes Worker from assigning `.img` to valid image outputs;
- treat Kie `File type not supported` submission failures as non-retryable;
- add focused regression coverage without changing schema, provider limits, or
  historical assets.

Source design:
`docs/portable-skill-pack/specs/2026-07-20-vertical-drama-video-start-frame-lineage-design.md`

## Constraints

- Preserve unrelated changes in the dirty worktree.
- No schema migration.
- No deletion or rewriting of production assets.
- No paid provider request without explicit approval.
- No production service restart without explicit deployment confirmation.

