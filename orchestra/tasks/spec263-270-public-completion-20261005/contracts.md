# Contracts and Findings

- Public home page resolution is tenant-owned: `GET /api/tenant/public-pages/:pageKey` must require the resolved `req.tenant`, and only published rows with its exact ID may be returned.
- Client must namespace cache by tenant and verify `tenantId`, `pageKey`, and `isPublished`; a global/null tenant row is never shared across tenant domains.
- SmartAIHub fallback copy is shared only for the configured SmartAIHub primary domain. Other tenants use their own published page or tenant-branded fallback.
- The Film product destination currently supported by the app is authenticated `/drama-series`; public entry is routed through local `/login?returnUrl=%2Fdrama-series`. No `/film` route is invented.
- Provider candidates require canonical `schemaVersion: 1` and a catalog snapshot. Missing snapshot must fail before policy, negotiation, or generation.
- Native design remains default-off. No speculative migration or UI route is allowed without the section's G0 owner/recovery/reference closure and handoff authority gates.
