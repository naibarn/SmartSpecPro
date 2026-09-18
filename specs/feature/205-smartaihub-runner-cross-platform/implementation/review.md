# Feature 205 implementation review

## Review result

The implementation is internally consistent with Features 195, 197, 199, 200
and 204 at the repository boundary:

- one canonical Job/attempt/lease/fence/outbox path remains authoritative;
- Runner identity and credentials do not reuse Worker identity or token
  audiences;
- Agent task/session/result meaning remains Feature 200-owned;
- MCP upstream grants remain Feature 199-owned;
- Cloudflare lifecycle/pool/deployment remains Feature 204-owned;
- the combined Feedback/Chat launcher and Task Control panel remain the only
  user-facing entry point.

## Fixes made during implementation review

1. Fixed sequence-zero duplicate detection in the Rust control channel.
2. Fixed Runner token revocation TTL units so old credentials remain denied for
   their remaining lifetime.
3. Added atomic database snapshot/node projection for the Drizzle repository.
4. Added monotonic revision and idempotent capability publication checks.
5. Added Runner-versus-Worker UI labeling and Runner inventory counts.
6. Added manual workflow trigger policy, target matrix, profile/publish/signing
   inputs, deterministic manifests and SHA-256 output.
7. Added operation-scope enforcement on enrollment, capabilities, heartbeat and
   status routes, plus Runner refresh rotation with a bounded replay grace.
8. Added Runner-specific device binding/proof headers with nonce replay
   protection; Worker token/header namespaces remain separate.
9. Added persistent atomic journal round-trip and symlink-component rejection
   in the local workspace policy.
10. Added native RSA request-proof signing for local WSS/HTTPS transport and
    server-side body-hash recomputation instead of trusting a header.
11. Added a locked/rechecked Drizzle snapshot commit and safe UI display states
    for verification, unavailable, reconciling and waiting-for-capability.
12. Added authenticated browser Runner setup at `/api/runners/setup` and
    embedded the Runner enrollment form in the existing `/workers/connect`
    entrypoint without merging it with Worker App credentials.
13. Added local `run` periodic discovery/reconciliation and explicit `rescan`
    commands with bounded refresh intervals.
14. Added protocol-version negotiation and authenticated envelope binding for
    Runner ID, node ID, profile and node kind on WSS and HTTPS control paths.
15. Added explicit Runner control rotation, access-token refresh and
    owner-scoped revocation routes; revoked nodes are rejected before WSS
    handshake and before credential rotation/refresh.
16. Added a separate published-valid Runner release catalog with withdrawn and
    invalid asset filtering, storage hash recomputation, range-aware
    same-origin downloads and command-bound update binaries.
17. Added manual-only cross-platform release build control, selected-commit
    manifests, optional GitHub Release publishing and server-side catalog sync
    with required raw-binary signature metadata.
18. Added durable update commands with owner/admin authorization, native
    platform/profile compatibility checks, monotonic phase transitions and
    idempotent acknowledgements.
19. Added localized Dashboard download/version/update controls and admin
    build/sync controls while keeping GitHub details out of the normal user
    surface.
20. Persisted the manual publish decision so artifact-only workflow runs cannot
    be imported into the public catalog accidentally, and completed checksum
    asset sync for every requested native target.
21. Closed the native update state-machine gap: Runner now acknowledges
    `verifying → replacing → restarting → completed`, uses bounded idempotent
    ack retries, runs a copied post-exit helper so Windows can release the
    live executable lock, confirms authenticated health with the new binary,
    and rolls back on failed confirmation.
22. Renamed the release target to `macos-arm64` across the build contract,
    Admin control and workflow matrix; artifact import still recognizes the
    legacy `macos-aarch64` filename, while the Intel lane is labeled x64.

## Known boundaries

The local repository cannot prove real native installations, signed artifacts,
provider-specific account/session behavior, target Cloudflare bindings,
signed artifacts or authenticated browser deployment. The generic Rust
transport/process host and Cloudflare lifecycle adapter are implemented and
focused-tested; those external gates remain unverified rather than being
promoted by local fake-host tests.
