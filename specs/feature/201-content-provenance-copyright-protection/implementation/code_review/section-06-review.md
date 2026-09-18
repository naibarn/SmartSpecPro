# Section 06 review

## Scope checked

- Web Video Editor final render queue and contract
- Vertical Drama episode, production, Remotion, season, and trailer assembly
- `workerRegistryService` final artifact handoff
- `contentProtectionAssets` compound envelope fields

## Findings and disposition

1. Web Video Editor final renders carry user intent through the queue metadata;
   intermediate clips are not treated as final protected output.
2. Remotion render manifests carry source byte hashes and final output hashes.
   Reconciliation holds compiled-video completion while protection is pending
   and rejects failed protection instead of publishing silently.
3. Vertical Drama ffmpeg assembly requires a real media-library identity and
   checksum for every source clip when protection is ON. Synthetic URL/JSON
   hashes are not accepted as ownership evidence.
4. Production Episode legacy in-process ffmpeg rejects protection ON because it
   cannot satisfy the worker/artifact gate. The Remotion path is required for a
   protected production output.
5. Trailer assembly now records final output SHA-256 and downloaded source
   hashes in a worker artifact, then enters the same compound protection path.
6. OFF is persisted and surfaced as `UNPROTECTED_BY_USER_CHOICE`; it never
   implies a protected result.

## Verification

- Compound/render focused tests passed, including 199 tests in the final
  cross-section TypeScript run.
- Legacy production path has an explicit fail-closed precondition.

## Residual acceptance gate

Real provider execution and authenticated browser acceptance remain deployment
gates; local tests prove contracts and state transitions only.

## Review result

APPROVED. No silent protected-publication path remains in the audited final
compound routes.
