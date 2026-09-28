# Section 08 — Implementation order, acceptance, and handoff

## Ordered waves

1. Freeze official spec/SDK versions and wire fixtures.
2. Add transport/era adapter behind flags; preserve legacy behavior and close
   current security harness failures.
3. Add discovery and inbound OAuth metadata/challenge; test root/catalog truth.
4. Extend registry with aliases/output schemas/results/errors/snapshots.
5. Add docs Resources and verify Library/media-history download boundary.
6. Add job/credit/idempotency adapters and Feature 145 worker/R2 parity tests.
7. Harden SSRF, ownership, scopes, device revoke, Origin/Host, cursors, limits,
   rate/audit/redaction.
8. Add observability, load/failure/Inspector/real-client evidence.
9. Roll out internal -> selected tenants -> GA with independent kill switches.

## Single-writer ownership

Transport owns protocol routing; registry owns metadata; resources owns URI
allowlist/docs; auth owns principal/OAuth/security; job adapters own only
projection/orchestration; Feature 145 owns executor/worker/artifacts; tests own
fixtures/evidence. No wave may rewrite unrelated dirty worktree files.

## Deep-implement entry gates

- exact current symbols rechecked;
- official SDK/spec version locked;
- explicit HTTP method/media-type/CORS and disconnect/MRTR policy locked;
- no duplicate business tables/services proposed;
- resource/user-data boundary approved;
- OAuth issuer/metadata/JWKS/audience/resource/scopes verifier implemented and
  mock-tested; deployment configuration and live issuer evidence remain a
  release gate;
- static broad-scope sunset documented;
- durable idempotency mapping is proven independently of Redis;
- user revoke/tenant flag control-plane behavior and retention policy are
  included;
- feature flags and rollback defined;
- baseline security failures have owners;
- section dependency order and single-writer paths accepted.

## Definition of done

Modern is sessionless and horizontally routable; legacy remains compatible;
discovery/catalog/tools/resources agree; existing names and workflows work;
files/media are ACL-correct; OAuth/device/security tests pass; jobs/credits/
uploads/history remain exactly-once and Feature 145-compatible; observability,
rollout, Inspector, load/failure, and Windows/macOS evidence are recorded.

## Implementation status — 2026-08-17

Code-level transport, catalog/alias/schema, signed-cursor,
documentation-resource, OAuth JWKS verifier, rollout-flag, audit, CORS,
download ACL, executor upload hardening, targeted typecheck, secret scan,
failure harness, and load harness are implemented. This is not a production
approval: live issuer configuration, official Inspector/live MCP evidence,
live R2 upload/download, and real Windows/macOS render/upload runs remain
explicitly tracked in `implementation/evidence.md`.
