# Section 07 — TDD, conformance, security, load, and platform proof

## Scope

Own the complete test plan and evidence report. Do not mark platform rendering
ready from protocol tests alone.

## Required suites

1. Unit: era/header/content type, schemas/aliases/results/cache, URI/SSRF,
   ownership/scopes, idempotency/credit projection, error redaction.
2. Protocol: modern discover/list/call/resources, legacy initialize/list/call,
   unsupported version, mismatch, batch, session expiry, GET/OPTIONS/HEAD,
   Accept/content type, disconnect cancellation, MRTR rejection, and legacy
   projection.
3. Integration: MCP to core/job/credit/outbox, worker callback/R2 publication,
   Library/media-history ACL and signed downloads.
4. Security: OAuth 401 metadata, invalid token categories, device revocation,
   authorization-server/JWKS/PKCE policy, Origin/Host, SSRF/rebinding, cursors,
   rate limits, no enumeration/leaks, user-only revoke, and tenant flag audit.
5. Load/failure: list/status storms, concurrent generation/idempotency, DB/
   queue/worker/provider/R2/Redis failures, client disconnect/retry.
6. Real-client: pinned official Inspector, Hermes CLI/agent and Hermes One on
   Windows 11 x64, macOS arm64/x64 where supported, and existing Worker App
   regression. Mac proof must explicitly show no Xcode build is needed by the
   user for standalone executor use, per Feature 145.

Also verify current generic MCP Redis replay caching cannot substitute for
durable idempotency, and run migration/retention preflight tests before any
schema change.

## Existing failures that block a green claim

The current run passed 51 legacy public-server tests but had two security-suite
failures: a `smartspec.files.read` timeout and an undefined session ID in an
unknown-method test setup. Fix or reclassify them with evidence; do not mute.
Separate unrelated repository-wide TypeScript baseline errors from this feature.

## CI gates

TypeScript, focused unit/integration/protocol/security tests, schema snapshots,
Inspector smoke, dependency audit, and secret/security lint must pass. Load and
failure evidence is a release gate for GA, not an optional post-release task.

## Implementation status — 2026-08-17

The expanded focused MCP wave passes the public-server, security, protocol,
registry, resource, OAuth metadata/JWKS/authz, rollout-policy, download ACL,
and CORS suites: 11 files, 96 tests. It also covers signed cursor binding,
unknown-field schema rejection, media-history/library downloads, grant
revocation, and OAuth fail-closed integration. The final command and exact count are recorded in
`implementation/evidence.md`.

The repository now contains targeted typecheck/secret-scan scripts, a modern
Inspector-style live protocol smoke, a pinned official Inspector CLI step
(`@modelcontextprotocol/inspector@2.2.0`), a failure-mode harness, and a k6
MCP scenario. Native Windows 11/macOS Hermes/Remotion execution, live endpoint
evidence, load execution, and multi-instance retry proof are not inferred from
unit tests and remain explicit environment gates.
