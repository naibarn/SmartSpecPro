# Recovery candidate content comparison correction

- Canonical ref observed: `refs/heads/main` at `826979a32dd296d5d6f46ef9d7e2b79dbb22d607`.
- Candidate sources were inspected read-only in the prepared source checkout. No candidate content was edited.

## Spec 278

The recovered Spec 278 file and the current canonical file have different SHA-256 digests, but a full line comparison shows only 10 differing lines, all trailing Markdown whitespace in the metadata header. After trimming trailing whitespace line-by-line, the complete files are equal. There is no normative-content conflict. Keep the existing canonical main copy; treat the recovered file as a formatting variant/duplicate and do not upload it as a second revision. The earlier pre-recovery observation that called this a normative conflict is superseded by this comparison.

## Spec 282

The recovered Work Context / Organizational Collaboration Spec and the current canonical Continuous Canonicalization Spec have materially different scopes and digests. The current Spec 282 entered main through PR #24; the recovered Work Context file is not present in reachable Git history and remains in the prepared candidate source. Specs 284 and 285 from the recovered package explicitly refer to Spec 282 as Work Context. This is a genuine authority/numbering conflict and cannot be resolved by path, date, revision, or repository presence alone.

Required authority choice: retain current Spec 282 and authorize a new canonical ID for the recovered Work Context Spec with dependent-reference updates, or authorize an evidence-led versioned reconciliation of both scopes. Do not overwrite either file or silently retarget dependencies before that decision.

## Spec 281 and dependent inventory

Spec 281 still lists Docker/OCI containers as deployment targets and remains excluded until that normative boundary is reconciled with the retired-runtime policy. No final inventory-derived manifests, global views, reconciliation queues, or closure records were regenerated after the nine-Spec partial upload. Migration remains `WAITING_POST_RECOVERY_SPEC_UPLOAD`.
