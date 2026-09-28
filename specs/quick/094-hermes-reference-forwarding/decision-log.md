# Decision log

- Depth: micro. The root cause is proven and the fix stays within one backend
  domain plus focused tests.
- Use a tolerant lookup that supports canonical keys, legacy prefixed keys,
  and exact first-party original URLs while retaining tenant/user predicates.
- Add a required-reference fail-closed option to the batch resolver. Vertical
  Drama paid image renders use it; generic optional-reference surfaces retain
  their existing best-effort behavior.
- No schema change.

Self-review:
1. Scope: no unrelated media behavior.
2. Contract: asset-id/checksum worker contract remains unchanged.
3. Security: tenant/user filters remain mandatory.
4. Failure mode: no silent image.generate downgrade for required VD inputs.
5. Coverage: prefix regression, ownership, and required-reference rejection.
6. Integration: existing generic Hermes callers remain backward compatible.
7. Deployment: targeted tests, type check, production payload verification.

Checksum self-heal review:
1. Evidence: recent three-reference jobs fail on SHA mismatch, not count limit.
2. Scope: one contract builder plus the existing storage-key canonicalizer.
3. Correctness: current object bytes are authoritative over cached metadata.
4. Data safety: only stale checksum metadata is updated; no asset bytes change.
5. Failure mode: hashing remains fail-closed; cache write-back remains best-effort.
6. Performance: at most three local/proxy reads per affected image submission.
7. Security: existing tenant/user ownership lookup remains unchanged.
