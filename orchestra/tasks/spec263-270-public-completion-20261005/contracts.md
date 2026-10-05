# Contracts and Findings

- Public home page resolution is tenant-owned: `GET /api/tenant/public-pages/:pageKey` must require the resolved `req.tenant`, and only published rows with its exact ID may be returned.
- Client must namespace cache by tenant and verify `tenantId`, `pageKey`, and `isPublished`; a global/null tenant row is never shared across tenant domains.
- SmartAIHub fallback copy is shared only for the configured SmartAIHub primary domain. Other tenants use their own published page or tenant-branded fallback.
- The Film product destination currently supported by the app is authenticated `/drama-series`; public entry is routed through local `/login?returnUrl=%2Fdrama-series`. No `/film` route is invented.
- Provider candidates require canonical `schemaVersion: 1` and a catalog snapshot. Missing snapshot must fail before policy, negotiation, or generation.
- Native design remains default-off. No speculative migration or UI route is allowed without the section's G0 owner/recovery/reference closure and handoff authority gates.

## Parallel contract — Spec 263 public closeout (2026-10-05)

### Shared interfaces
- Traceability route key is the exact public pathname (dynamic routes use `:slug`); locale identity is `th` or `en`; route inventory must distinguish public indexable, public noindex, auth-only, and tenant-private surfaces.
- Public claim record uses: `claim_id`, `copy_ref`, `authority`, `implementation_ref`, `evidence_ref`, `owner`, `allowed_routes`, `cta_destination`, `signed_in_behavior`, `signed_out_behavior`, `media_ids`, `indexability`, `freshness`, `acceptance_status`, `disposition`.
- Public asset record uses: `asset_id`, `source_type`, `source_ref`, `sha256`, `created_at`, `tool_or_license`, `prompt_or_license_ref`, `permitted_contexts`, `prohibited_contexts`, `synthetic`, `rights_status`, `withdrawal_path`, `fallback`, `acceptance_status`.

### Ownership and test boundaries
| Workstream | Ownership paths | Tests / proof |
|---|---|---|
| Route/locale/redirect inventory agent | `specs/feature/263-smartaihub-public-website-experience-modernization/implementation/public-route-inventory.json`; `.../public-locale-route-map.json`; `.../public-redirect-map.json` | Read-only source assertions + JSON validation; conductor checks each route against `App.tsx`, SEO and crawler sources. |
| Public truth/asset inventory agent | `.../implementation/public-truth-map.md`; `.../implementation/public-claims-registry.json` | Read-only source/spec trace; conductor checks no unsupported claims or unverified asset is represented as approved. |
| Main conductor | `design/public/**`; `apps/web/client/src/components/publicUi/**`; `apps/web/client/src/pages/Home.tsx`; public-site locales; Spec 263/270 section and closeout state | Focused UI/content tests, browser matrix and visual conformance; no agent writes these paths. |
| Verification agent (later wave) | `orchestra/tasks/spec263-270-public-completion-20261005/evidence/**` and task `review-rounds.md` only | Browser evidence only; no source or spec edits. |

### Impact boundary
| Affected surface | Handling |
|---|---|
| Home, Navbar/Footer, existing public routes | In-scope; preserve current tenant checks, auth routes and public data boundaries. |
| Sitemap, robots, prerender, SEO and analytics consent | Quality gate + targeted repair if task-caused; don't add claims to crawl outputs. |
| Authenticated Studio, providers, DB, worker queue, billing/credits | Out of scope; no backend behavior or migration for a public redesign. |
| Product/legal facts not supported by code/spec evidence | Remove or downgrade from public copy; external approval remains only if retaining the claim/media is normative. |
