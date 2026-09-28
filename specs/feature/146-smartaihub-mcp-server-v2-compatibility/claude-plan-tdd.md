# Feature 146 TDD plan

Tests are written before corresponding implementation changes. Existing Vitest
fixtures and mock boundaries are preferred.

## Section 01 — transport/discovery

- Modern `server/discover` returns supported protocol and truthful capabilities
  without a session.
- Modern tools/resources requests work without `Mcp-Session-Id` when enabled.
- Legacy initialize/session/list/call remain compatible and isolated.
- Unsupported version, header/body mismatch, invalid media type, oversized
  batch/body, invalid cursor, and malformed JSON produce safe protocol errors.
- GET/DELETE/OPTIONS/HEAD, CORS, Origin rejection, root SPA fallback, and
  disconnect cancellation are explicit.

## Section 02 — registry/results

- Snapshots contain canonical names, aliases, schema revisions, input/output
  schemas, annotations, scopes, cache policies, and idempotency metadata.
- Alias and canonical execution are equivalent and share all checks.
- Unknown fields, missing required fields, ambiguous render kind, duplicate
  idempotency, unknown tools, and provider failures are safely represented.
- Modern structured results/cache envelopes and legacy text projections are
  stable and redacted.

## Section 03 — resources/files

- Only allowlisted documentation URIs appear in `resources/list` and reads obey
  revision/MIME/byte limits.
- Traversal, arbitrary paths, R2 key guessing, external URLs, and user-data URIs
  are rejected.
- Library, R2, and Media History image/video/file downloads remain owner/tenant
  scoped, extension-preserving, and brokered.
- Cross-tenant, revoked-device, expired-grant, and deleted-object cases fail
  closed.

## Section 04 — auth/security

- Bearer/API-key/pairing principals resolve to correct tenant/user/device.
- Expired, revoked, wrong-audience/resource, wrong-scope, malformed, and
  query-string tokens are rejected with correct status/challenge.
- PRM is absent/disabled unless issuer/JWKS/introspection configuration is real.
- Origin/host, CSRF/session separation, rate/quota, audit redaction, and
  owner-only device revoke are covered.

## Section 05 — jobs/credits/workers

- Image/video/Remotion calls preserve durable idempotency and credits across
  duplicate retries and instance switching.
- Status/cancel projections enforce job kind and ownership.
- Queue outage, worker crash, lease expiry, provider timeout, R2 failure,
  duplicate callback, and disconnect never produce false success or double
  settlement.
- Artifact checksum, publication, history, Library registration, and download
  redemption match Worker App behavior.

## Section 06 — observability/rollout

- Metrics/audit dimensions are bounded and omit secrets, URLs, prompts, bytes.
- Kill switch/tenant flag order is deterministic and preserves durable state.
- Redis unavailable/slow behavior is safe without replacing durable idempotency.
- Retry/timeout/concurrency/backpressure limits are observable and enforced.

## Section 07 — integration/platform

- Run focused MCP suites and pinned MCP Inspector fixture.
- Run load/failure matrix and load-balancer instance switching.
- Record real Hermes CLI/Agent and Hermes One tests on Windows 11 x64 and macOS
  arm64/x64, including standalone no-Xcode Remotion rendering.
- Run existing Worker App Windows regression and compare artifacts.

## Section 08 — acceptance

- All focused tests pass; `git diff --check` passes on feature files.
- Typecheck is reported separately from unrelated baseline diagnostics.
- Evidence identifies PASS/FAIL/BLOCKED/NOT RUN for every gate.
- Tenant flag remains off for any failed or unexecuted mandatory gate.
