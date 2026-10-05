# Spec 263/270 Public Tenant Completion

## Task classification
- Scope: large
- Risk: high
- Affected domains: public React routing, tenant context/API, Drizzle schema, public sitemap, design runtime boundaries
- Route: resume existing Spec 263/270 deep plans; implementation in a new task worktree from current `origin/main`
- Build policy: do not build in this session, per the user's prior instruction

## Goal
Complete repository-actionable gaps needed for the public homepage to use the current tenant's published content safely, preserve a usable SmartAIHub fallback, and stop unsupported legacy/global content from being presented as tenant-owned. Keep provider/design authoring fail-closed where durable storage, approved assets/claims, or live Spec 224/256 authority is absent.

## Evidence ledger
- source: public HTTP + local HTTP + screenshot
- identifier: GET `https://smartaihub.app/`, `/api/tenant/current`, `/api/tenant/public-pages/home`; local `127.0.0.1:3000` with `Host: smartaihub.app`
- observed: public bundle SHA-256 equals local `apps/web/dist/public/assets/index-D2uidb7f.js`; live public page payload is `tenantId:null`; service checkout is `/home/dev/projects/SmartSpecPro/apps/web` on local `main` commit `5e39d322`, while `origin/main` is `bd61133bc` (local checkout is behind); origin `Home.tsx` is neutral public information, and tenant-aware implementation was on a separate READY branch
- data state: local/domain-scoped endpoint also returns the legacy page with `tenantId:null`; source-level route claims to scope by tenant id, so runtime/source behavior discrepancy remains an operational gap requiring focused route/database evidence
- confidence: high that the published bundle was built from a stale checkout; high that the public API's legacy page is not tenant-owned; medium on the server/API discrepancy until its route/query path is directly reconciled
- next evidence: focused test of tenant scoping and compare branch artifact/source provenance; do not mutate production data

## Safe implementation boundary
1. Tenant ID types and server filters must use canonical string IDs.
2. Public page reads must return only published rows owned by the request tenant, deterministically select one row, and never fall back to an unowned/null-tenant row.
3. Frontend page cache and rendering must require exact tenant identity; delayed/missing tenant context must not render content from another tenant.
4. Primary SmartAIHub keeps the safe localized fallback from current `origin/main`; other tenants get a neutral tenant-branded fallback; valid published tenant pages override either fallback.
5. Sitemap host resolution follows primary or explicitly mapped active domain and uses the same tenant identity.
6. Do not fabricate product claims, film routes, media rights, durable design storage, or live provider/handoff authority. Do not re-enable retired Agency/workflow/OpenSandbox systems.

## Open external gates
- Spec 263 homepage high-fidelity/Film: approved design artifact, claim owner, rights-cleared proof media, and route/CTA owner remain absent.
- Spec 270 authoring: durable artifact owner/storage/recovery/retention and callable Spec 224/256 handoff authorities remain absent. Keep production authoring/provider flags disabled.
- Production build/deploy and browser certification are deferred; no build requested in this session.
