---
spec_id: 304
title: SmartAIHub Application Identity, Universal Routing, Managed Hosting & Deployment Contract
revision: R0.1
date: 2026-10-07
status: DESIGN_CONTRACT
scope: Platform-wide / App identity and runtime context
risk_class: HIGH
normative_language: RFC-style MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
---

# SPEC-304 — SmartAIHub Application Identity, Universal Routing, Managed Hosting & Deployment Contract

## 0. Decision and authority

SPEC-304 defines stable App identity, canonical routing, aliases/domains, App Shell/startup semantics, channel deployment bindings, runtime requirement declarations, and context injection. It integrates with (and does not duplicate) SPEC-295, which remains authority for production releases, migrations, deployment lifecycle, health, rollback, and desired/observed operational state. SPEC-288 remains Resource Fabric; SPEC-261 portable package; SPEC-281 portable knowledge runtime; SPEC-279 command ingress; SPEC-302 global Project identity. An App may be an Asset under SPEC-303 without confusing app identity with ownership.

## 1. Stable App identity

`AppIdentity` has stable opaque `appId` and `publicAppId`, tenant/publisher relationships, lifecycle, canonical product identity, policy references, creation time, and aliases. Listing, Release, Deployment, and channel records reference it; none becomes its identity. The canonical SmartAIHub route is `https://smartaihub.app/apps/{publicAppId}`. URL/slug/domain is mutable alias data and MUST NOT be used as canonical identity.

`publicAppId` MUST remain stable through ownership transfer, publisher/maintainer changes, release promotion, custom-domain change, clone/fork, or channel expansion. A clone receives a new App identity and records its parent/provenance; explicitly licensed content may be referenced or copied under its rights, but private user memory is never cloned by default.

## 2. App, listing, release, deployment, and domain bindings

- `AppIdentity`: product identity and lifecycle.
- `AppListing`: discoverability, description, categories, public visibility, reviews/install references, and channel presentation.
- `AppRelease`: immutable package/build/version reference and provenance.
- `AppDeployment`: operational target and SPEC-295 lifecycle reference.
- `AppChannelBinding`: app, channel, partner, tenant, release/deployment references, audience and policy, effective interval.
- `AppRouteAlias`: mutable slug/custom domain/redirect mapping with verified ownership, routing policy, and history.
- `RuntimeRequirementDeclaration`: requested capabilities, minimum runtime/API versions, data residency, storage, secret scopes, resource profile, network boundaries, and portability class.

One App MAY have multiple listings, releases, deployments, channels, aliases, and custom domains, subject to policy. Custom domains require domain-control proof and explicit tenant/publisher authorization. Alias changes preserve old route redirect/retirement policy and cannot transfer identity.

## 3. Routing and startup semantics

Resolution maps host/domain + route alias + channel context to a verified `publicAppId`, then selects an authorized active deployment/release using channel policy. Unknown, stale, conflicting, or unauthorized aliases fail closed and emit an auditable routing receipt. Routing does not select a project or grant permissions by URL.

An app MAY declare a default/startup app for an eligible user, tenant, or channel. This is a scoped preference, not global ownership or authorization. Explicit user selection and tenant policy outrank defaults. App Home may expose Continue, Saved, Recent, My Apps, My Assets, Purchased, Subscribed/Hosted, Recommended, Official, Trending, and Discover; “Official” is certification, not owner identity.

## 4. Runtime context injection

The host creates a signed, audience-bound runtime context at each invocation. Minimum fields are `userId` (stable principal reference), `tenantId`, `appId`, `deploymentId`, optional `canonicalProjectId`, optional `workContextId`, `channelId`, `sessionId`, roles/scopes, capability grants, permission ceiling, quota/budget reference, and provenance/correlation. Context SHOULD include conversation/space, app installation, environment, policy epochs, and expiry where needed.

The runtime MUST validate issuer, audience, tenant, deployment, expiry, policy epoch, capabilities, and permission ceiling. A hosted app cannot expand the ceiling or impersonate another host app. Project references are resolved/authorized under SPEC-302; memory under SPEC-268; Chat surface/runtime under SPEC-269; command ingress under SPEC-279. Context is minimized and secret-safe; secrets are separately scoped references, not embedded values.

Self-hosted/portable execution receives only contractually exportable data and capabilities. It MUST declare runtime compatibility and data portability; host credentials, private user memory, tenant data, and analytics are excluded unless separately authorized and rights-bound.

## 5. App Shell and Chat surfaces

App Shell supplies navigation, identity/context display, permission/quota boundaries, localization/accessibility, and error states. App Home is a composable surface, not a separate app identity. Project-aware apps display a subtle project context control and expose No Project/Create Project states when permitted.

An embedded Chat surface passes `hostAppId` equal to the embedding App, optional canonical project/work context, `conversationSpaceId`, memory profile, knowledge bindings, billing context, and permission ceiling. SmartAIHub's central conversation runtime does not become the embedding App identity. Default integration is shared Chat UI with skin/profile (Level 1) or custom Chat UI over shared Conversation Runtime API (Level 2). A custom conversation runtime (Level 3) requires explicit capability compatibility and is an advanced/external exception; apps MUST NOT clone the canonical runtime per app.

## 6. Deployment lifecycle integration

SPEC-304 supplies identity, route, runtime requirements, and app/channel bindings to SPEC-295. SPEC-295 owns release set, environment, migration, deployment transitions, health, rollback, and operational evidence. A routing receipt may refer to observed deployment state but cannot mark a release/deployment healthy or complete. Deployments are immutable-target references; changing an alias or App identity does not mutate an already recorded release.

No deployment or migration is executed by this design contract. Runtime profiles must follow approved platform boundaries; risky isolated execution uses the approved Cloudflare Container runtime and long-running work uses the canonical `worker_jobs` plus outbox control plane. No retired Agency, OpenSandbox/Docker dispatch, or legacy custom workflow engine may be introduced.

## 7. Acceptance contract

Required scenarios: stable ID after domain/slug change; stable installs/reviews through owner transfer; clone creates distinct ID without private memory; one App across two channels; one channel resolving the same Asset/App; default/startup preference scoped correctly; invalid route alias rejected; tenant/policy revocation during active session; runtime context ceiling cannot be expanded; App invoking a shared Chat runtime reports its own `hostAppId`; custom Chat skin does not fork memory authority; and SPEC-295 rollback does not mutate AppIdentity.

## 8. Migration and rollout

Inventory current app IDs, slugs, custom domains, listings, releases, deployments, tenant boundaries, and runtime context injection. Add aliases and stable IDs as additive mappings. Preserve old routes with an explicit redirect/cutover plan. Migrate one channel/app class at a time with collision report, context validation, auth tests, rollback, and exact-SHA evidence. Do not rekey production URLs or run a production migration as a documentation checkpoint.
