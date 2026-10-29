# SPEC-256 duplicate ID resolution — 2026-10-30

Source checked at `origin/main` `121e83b7318b9d79faae8ce05e6e464a0cb87a88`.

## Disposition

Keep `specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md` as the canonical SPEC-256 record. Remove the nested duplicate `specs/feature/256-skill-first-capability-discovery-intent-execution/specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md` from canonical inventory.

## Evidence

- The nested file's frontmatter declares `proposed_path` as the parent canonical path above.
- The nested file is an exact byte-for-byte prefix of the parent file. The parent contains the nested content plus two later dated addenda (2026-10-11 and 2026-10-21); no unique normative text is lost by removing the nested duplicate.
- Git history shows the parent was subsequently updated by `440c9e534` and `d31943ebe`, while the nested copy has no later update after its original addition in `6fffb7478`.
- The parent metadata and historical intent therefore identify the nested record as a stale copy, not a distinct Spec proposal needing a new ID.

## Change and verification

The nested `spec.md` was removed after verifying the exact-prefix relationship. The canonical parent remains intact. Regenerate the repository classification projection from the resulting integrated source SHA and run the focused `tools.spec_handoff` tests. This resolves only the duplicate-ID inventory conflict; it does not certify SPEC-256 implementation acceptance or close unrelated open requirements.
