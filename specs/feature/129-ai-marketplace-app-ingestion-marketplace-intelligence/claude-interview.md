# Interview Notes - Marketplace MCP Connector Ingestion

This plan uses the clarified decisions already provided by the stakeholder.

## Captured Decisions

1. Authorization model must open a browser page so the user can confirm connection rights before data is saved.
2. The implementation should proceed with the best production-grade approach instead of waiting for more clarification.
3. The Browser Connector Lab and real browser testability should be included from Phase 1, not deferred.
4. The spec and plan should avoid naming a specific connector host brand. Use vendor-neutral terms such as connector host, connector, connector grant, and MCP.
5. The primary reason to integrate through connectors is forward compatibility: when the upstream connector gains new fields or behavior, SmartSpecPro can discover, store, and promote useful data instead of rebuilding manual capture logic.
6. The first useful outcome is not a polished analytics dashboard. The first useful outcome is proof that users can connect, run a test search, see returned fields, save field samples, and turn validated data into durable snapshots.
7. Connector configuration belongs in each user's Settings / Integrations / Connections surface. Marketplace Intelligence and Marketplace Capture consume the user's connection status and should deep-link to Settings instead of duplicating full connection management.
8. Connector grants, raw payloads, probes, snapshots, watchlists, and reports are user-scoped in v1. Tenant feature flags may enable the feature, but a user's connector access cannot be reused by another user.
9. Marketplace Capture remains the canonical product system. Connector intelligence should relate to existing candidate batches and saved products, append current metric/evidence updates with provenance, and avoid silently overwriting user-confirmed product truth.

## Product Priorities

- Highest priority: Settings > Integrations connector configuration and `/marketplace-capture/intelligence/connector-lab`.
- Second priority: sanitized storage of returned data, recorded MCP probe evidence, field coverage, unknown field detection, payload shape hashes, and fixture promotion.
- Third priority: normalized snapshots, Marketplace Capture product enrichment, and competitive intelligence metrics.
- Later priority: automated reports, watchlists, pricing analysis, content handoff, and scheduled reprocessing.

## Assumptions For Planning

- The first connector target is Shopee.
- Some users will not have connector access, so the UI needs clear disabled and permission-denied states.
- Development and CI need a fixture replay path because live connector access may be unavailable or rate-limited.
- Raw payloads are sensitive operational data and should be admin/owner only with retention controls.
