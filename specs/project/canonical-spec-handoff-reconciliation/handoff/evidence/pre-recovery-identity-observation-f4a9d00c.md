# Pre-recovery duplicate-revision observation

- Canonical ref observed: `origin/main` at `f4a9d00c638c04ac74b15ddb8942fc786942524f`.
- Canonical inventory command was read-only; 436 records, complete walk. No global or per-Spec output was regenerated.
- The 12 prepared Spec directories remain untracked in the primary checkout and absent from canonical `origin/main`.
- The primary checkout lacks `specs/_config/handoff-roots.toml`; its candidate set is not validated as a canonical inventory.

The current framework parser reads each candidate and current canonical revision field. It confirms two real duplicate-revision conflicts:

| ID | Candidate revision / SHA-256 | Current canonical revision / SHA-256 | Observation |
|---|---|---|---|
| 278 | `1.4` / `e8c4e7cbcc2d4955cdc5419e0f78c216bb6c5e6f89cd6b260943252128c57f81` | `1.4` / `8973e0263cfba991db278e072fe4fe602f62ecb724fc28874c7f5b7ffa08d3e0` | Same path and ID; different normative content. Candidate blob is in a recovery branch commit that is not an ancestor of main. |
| 282 | `1.0` / `5c82aa08ce1887544d7172b0f4be4f2d272f90152101d0dae7b8be06121492a6` | `1.0` / `e22d6134574f15afff73b9d8acf958c91bdfe1f09a58fb93fe0baa4f0c45a04e` | Different paths with the same ID and revision. Candidate blob is not present in reachable Git history. |

These are unresolved authority conflicts, not winner selections or final Spec classifications. Do not choose by revision, file date, or path. Preserve both candidate sources for evidence-led reconciliation after the recovered set is uploaded and integrated.

Resume predicate remains: `Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`. Bulk reconciliation and generated inventory outputs remain paused.
