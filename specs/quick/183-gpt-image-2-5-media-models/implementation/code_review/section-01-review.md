# Code Review: Section 01 — Catalog and Migration

Date: 2026-09-09
Reviewer: inline conductor review (the read-only review subagent timed out and was closed)

## PASS

- Both catalog rows use the exact Kie text-to-image IDs as canonical IDs and pair them with the exact image-to-image IDs through `apiConfig`.
- The static registry and seed expose optional `input_urls` with a 16-image cap, documented aspect ratios, and 1K/2K/4K resolution fields.
- The SQL migration is scoped to the two rows, uses `ON CONFLICT ("modelId") DO UPDATE`, contains no delete, and preserves the user-owned 0288 SQL file.
- The journal JSON remains valid and its new task entry is monotonic after the visible 0287 entry.
- The catalog test prevents accidental standalone image-to-image rows.

## NICE_TO_HAVE

- The visible worktree still has a pending user-owned 0288 migration that is not in the journal. It was intentionally not changed; the final report must call out that ledger condition separately.

No MUST_FIX findings.
