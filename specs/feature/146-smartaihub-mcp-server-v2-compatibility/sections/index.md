<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web run test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-transport-discovery
section-02-registry-results
section-03-resources-files
section-04-auth-oauth-security
section-05-jobs-credits-workers
section-06-observability-rollout
section-07-test-matrix
section-08-implementation-gates
END_MANIFEST -->

<!-- LEGACY_SECTION_METADATA
feature: 146-smartaihub-mcp-server-v2-compatibility
spec: ../spec.md
sections:
  - id: section-01-transport-discovery
    file: section-01-transport-discovery.md
    title: Transport, protocol eras, and discovery
    depends_on: []
  - id: section-02-registry-results
    file: section-02-registry-results.md
    title: Unified tool registry, aliases, schemas, and results
    depends_on: [section-01-transport-discovery]
  - id: section-03-resources-files
    file: section-03-resources-files.md
    title: Documentation resources and permission-correct files/media
    depends_on: [section-02-registry-results]
  - id: section-04-auth-oauth-security
    file: section-04-auth-oauth-security.md
    title: Auth, OAuth, device security, and request hardening
    depends_on: [section-01-transport-discovery]
  - id: section-05-jobs-credits-workers
    file: section-05-jobs-credits-workers.md
    title: Async jobs, idempotency, credits, workers, and uploads
    depends_on: [section-02-registry-results, section-03-resources-files]
  - id: section-06-observability-rollout
    file: section-06-observability-rollout.md
    title: Observability, flags, rollout, and operations
    depends_on: [section-01-transport-discovery, section-04-auth-oauth-security]
  - id: section-07-test-matrix
    file: section-07-test-matrix.md
    title: TDD, protocol conformance, security, load, and platform proof
    depends_on: [section-01-transport-discovery, section-02-registry-results, section-03-resources-files, section-04-auth-oauth-security, section-05-jobs-credits-workers]
  - id: section-08-implementation-gates
    file: section-08-implementation-gates.md
    title: Implementation order, acceptance, and deep-implement handoff
    depends_on: [section-01-transport-discovery, section-02-registry-results, section-03-resources-files, section-04-auth-oauth-security, section-05-jobs-credits-workers, section-06-observability-rollout, section-07-test-matrix]
-->

# Feature 146 section plan

This index splits `../spec.md` into single-writer implementation units. The
sections are additive to Feature 145 and must preserve its Worker/Remotion,
connected-device, ACL, R2, and media-history contracts.

| Order | Section | Deliverable |
|---:|---|---|
| 1 | [Transport and discovery](section-01-transport-discovery.md) | Modern/legacy era adapter, discovery, endpoint truth, and no-root regression. |
| 2 | [Registry and results](section-02-registry-results.md) | Canonical tools, guide aliases, schemas, annotations, results, and errors. |
| 3 | [Resources and files](section-03-resources-files.md) | Docs resources plus ACL-checked Library/media-history download behavior. |
| 4 | [Auth/OAuth/security](section-04-auth-oauth-security.md) | Principal, OAuth metadata/challenge, scopes, device revocation, SSRF/origin. |
| 5 | [Jobs/credits/workers](section-05-jobs-credits-workers.md) | Existing job/credit/idempotency/worker/R2 adapters and no duplicate source. |
| 6 | [Observability/rollout](section-06-observability-rollout.md) | Metrics, traces, audits, flags, staged deployment, kill switch. |
| 7 | [Test matrix](section-07-test-matrix.md) | Unit, protocol, integration, security, load, failure, Inspector, platform proof. |
| 8 | [Implementation gates](section-08-implementation-gates.md) | Dependency order, DoD, review checklist, deep-implement handoff. |

## Cross-section invariants

- Canonical endpoint is `https://smartaihub.app/v1/mcp`.
- Existing `smartspec.*` names remain valid; aliases point to one handler.
- Modern requests do not require `Mcp-Session-Id` or sticky routing.
- Legacy sessions remain compatibility-only and never authorize modern calls.
- `resources/list/read` is documentation-only in the first release.
- User files/media are accessed through existing owner/tenant ACL tools and
  short-lived broker grants, never arbitrary resource URIs.
- Feature 145 owns executor installation, worker control, Remotion rendering,
  artifact upload, and connected-device pairing semantics.
- Generic Redis MCP replay caching is never the exactly-once authority; durable
  tool/job/credit idempotency remains authoritative.
- DB/job/credit/artifact state is authoritative; Redis is ephemeral only.
- GET/OPTIONS/HEAD/CORS/disconnect/MRTR behavior is explicit and tested.
- Protected-resource metadata is not enabled without real issuer/JWKS/token
  verification configuration.
- No capability is advertised until implementation and test gates pass.

## Implementation ownership

| Section | Primary code ownership | Test ownership |
|---|---|---|
| 01 | `mcpPublicServer.ts`, `mcpV2Protocol.ts`, `_core/index.ts` | transport/security suites |
| 02 | `mcpRegistry.ts`, `mcpResultAdapter.ts` | registry schema/result suites |
| 03 | `mcpResources.ts`, download broker adapters | resource/file ACL suites |
| 04 | `authz.ts`, OAuth metadata/challenge helpers | auth/OAuth/device suites |
| 05 | existing media/remotion/worker adapters only | idempotency/worker parity suites |
| 06 | `mcpObservability.ts`, flags, rollout docs | failure/rollout suites |
| 07 | shared fixtures and evidence harness | protocol/load/platform suites |
| 08 | planning/evidence/release checklist | final acceptance report |

## Execution order

1. Section 01 and its pure protocol fixtures.
2. Sections 02 and 04 after transport contracts are fixed.
3. Sections 03 and 05 after registry/auth contracts are available.
4. Section 06 after stable request/error/audit dimensions.
5. Section 07 continuously, with final cross-section tests after 01–06.
6. Section 08 records completion and keeps native Windows/macOS proof external.
- Protected-resource metadata is not enabled without a real discoverable
  authorization-server/JWKS/token-verification configuration.
- No capability is advertised until its implementation and test gates pass.
