<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canonical-registry-and-discovery-foundation
section-02-delegated-worker-mcp-auth-and-session-enablement
section-03-billing-budget-idempotency-and-concurrency
section-04-gateway-and-knowledge-tool-parity
section-05-skills-agencies-media-and-jobs-parity
section-06-presentations-video-and-artifact-safe-results
section-07-legacy-mcp-migration-and-browser-gating
section-08-docs-observability-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-canonical-registry-and-discovery-foundation | - | 02, 03, 04, 05, 06, 07, 08 | No |
| section-02-delegated-worker-mcp-auth-and-session-enablement | 01 | 03, 04, 05, 06, 07 | No |
| section-03-billing-budget-idempotency-and-concurrency | 01, 02 | 04, 05, 06, 07, 08 | No |
| section-04-gateway-and-knowledge-tool-parity | 01, 02, 03 | 08 | Yes |
| section-05-skills-agencies-media-and-jobs-parity | 01, 02, 03 | 08 | Yes |
| section-06-presentations-video-and-artifact-safe-results | 01, 02, 03 | 08 | Yes |
| section-07-legacy-mcp-migration-and-browser-gating | 01, 02, 03 | 08 | Yes |
| section-08-docs-observability-and-rollout | 04, 05, 06, 07 | - | No |

## Execution Order

1. `section-01-canonical-registry-and-discovery-foundation`
2. `section-02-delegated-worker-mcp-auth-and-session-enablement`
3. `section-03-billing-budget-idempotency-and-concurrency`
4. `section-04-gateway-and-knowledge-tool-parity`, `section-05-skills-agencies-media-and-jobs-parity`, `section-06-presentations-video-and-artifact-safe-results`, and `section-07-legacy-mcp-migration-and-browser-gating` in parallel where practical
5. `section-08-docs-observability-and-rollout`

## Section Summaries

### section-01-canonical-registry-and-discovery-foundation

Create the canonical MCP registry, discovery contracts, and static catalog so `tools/list`, `tools/call`, the delegated manifest, and developer-facing docs all derive from the same truth source.

### section-02-delegated-worker-mcp-auth-and-session-enablement

Enable delegated personal workers to use `/v1/mcp` safely by reusing Feature 072 delegated sessions, owner-bound enforcement, and same-tenant checks.

### section-03-billing-budget-idempotency-and-concurrency

Connect MCP execution to delegated-worker budget windows, job envelopes, billing attribution, idempotency, and concurrency controls.

### section-04-gateway-and-knowledge-tool-parity

Implement the highest-value real MCP wrappers first: gateway models/credits/chat/responses and owner-bound Library/RAG tools.

### section-05-skills-agencies-media-and-jobs-parity

Convert the major operational families from stub or bridge-only MCP tools into real wrappers that reuse the existing backend services and public routes.

### section-06-presentations-video-and-artifact-safe-results

Complete the presentation and video families and normalize long-running result handling, artifact references, and safe-serving behavior.

### section-07-legacy-mcp-migration-and-browser-gating

Migrate real legacy MCP behavior into the canonical public truth model and keep browser MCP gated unless its current safety and billing controls can be preserved.

### section-08-docs-observability-and-rollout

Finish operator visibility, static/discovery documentation, rollout flags, kill switches, and regression coverage that proves MCP is truthful and safe.
