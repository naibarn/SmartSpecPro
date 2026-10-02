# Spec 262 — implementation-ready synthesis

## Product goal

Extend the existing Spec260 emergency platform into a global, provenance-rich map and adaptive situation feed, with a verified Thailand hydrology pack and gradual regional-pack onboarding. Reuse the existing `/disaster/map` public route, shared dashboard/route authorities, existing SmartAIHub AI Chat & Feedback / Task Control panel, existing source/capture/claim foundations, and the canonical durable job/outbox control plane.

## Normative boundaries

1. Spec260 remains canonical for emergency identity, public/operations routes, emergency data, disclosure, user identity, audit and task execution. Spec262 adds projections/contracts and does not fork these authorities.
2. MapLibre remains the normal rendering surface; provider choices are server-validated. Map provider credentials and privileged provider calls stay server-side. A server/provider credential test is distinct from browser worker/asset/map-render success.
3. Linux/tunnel and Cloudflare ingress must expose the same contracts. Deployment mode is determined from trusted server deployment configuration/capabilities; the browser never chooses a privileged backend or audience. Cloudflare is currently a proxy to the Linux platform service.
4. Existing AI Chat & Feedback panel is the only Chat surface. Map context is typed, visible, removable, scope-limited, authorization-rechecked and never auto-sent. Existing conversation, Task Control, billing and audit authorities remain canonical.
5. Geospatial, observation, forecast, official-warning and inferred claims are distinct fact classes. Every domain observation has source/provenance, event/observation/ingestion times, CRS/units, freshness/quality and uncertainty. Missing coverage is explicit; absence of returned items never means absence of incidents.
6. Long-running source acquisition, normalization, trend/impact recompute and archive work uses canonical `worker_jobs` + transactional outbox, leases/fencing, idempotency, retry budgets and cancellation. No Agency, legacy workflows/workpacks, OpenSandbox, Docker execution or duplicate queue.
7. PostgreSQL remains system of record. Migrations are additive, journaled and designed for compatible rollout; no duplicate authority for geometry, sources, claims, events, watches, route IDs, capability registry or job state.
8. Safety gates fail closed: authorization, public geometry disclosure, stale-data action gates, provider-rights expiry, source manipulation, model validation, exercise isolation, tenant/federation isolation, legal hold/deletion and kill-switch expiry.
9. Implement incrementally. A feature is advertised only when its dependencies, data rights, coverage and evidence gates are satisfied. Unvalidated forecasts must be disabled or labeled as exploratory; no false precision or life-safety recommendation.

## User choices already answered

- Reuse existing Chat & Feedback UI (AI Chat, Task Control, Send Feedback); no Map Chat.
- Support Linux server/tunnel and Cloudflare ingress and detect mode automatically when the trusted runtime can do so.
- Complete implementation/local proof before the final real-environment verification gate.
- Continue independently through safe repo-local work and close discovered gaps.

## Required coverage

The plan and section manifest map the full active Spec262 content: base sections 0–50, all normative R1.1 additions and tests/scenarios, R1.2 12-pass hardening and tests, R1.3 12-pass hardening and tests, R1.4 12-pass hardening and tests, R1.5 12-pass hardening and tests, R1.6 12-pass hardening and tests, R1.7 12-pass hardening and tests, and R1.8 Spec260/Chat amendments. Acceptance test IDs 1–513 and integrated scenarios A–AR must each map to an automated test, browser/contract evidence, or a documented external evidence gate with owner and reason. Superseded older wording is subordinate to the latest R1.8 amendments.

## Out of scope

- Replacing Spec260 identity, emergency case, claim, route, disclosure, job or chat authority.
- Claiming full hydrologic forecasting, flood depth/arrival, upstream provider connectivity, production provider licenses or Cloudflare deployment without evidence.
- Automated outbound writes to public agencies or operational control systems.
- A new chat page, a second orchestration/queue runtime, a second database authority, or resurrecting retired systems.

## Observable completion

All repository-local contracts, migrations, adapters, map/feed/chat/admin surfaces, worker execution, safety policies, observability and tests are implemented; section checklist is green; relevant focused suites/build/static checks pass; local browser verification demonstrates success, empty, partial, stale and unavailable states across required viewports. Any external evidence that cannot be produced locally remains a clearly named final gate rather than an implied pass.
