# Proposed additive applicability note for SPEC-311 / SPEC-295

**Status:** DRAFT FOR CANONICAL INTEGRATION; NOT committed to original SPEC-311/295 files.

## Conflict being resolved

SPEC-311 R1.1 describes **full legacy application migration/cutover** for `smartaihub.app` and records that migration Workers/Containers/Queues/Hyperdrives were removed on 2026-11-01. Its completeness gates are appropriate for claiming all legacy routes Worker-native and retiring the legacy infrastructure. It does not define the **independent new-product launch** for the new confirmed production domain `smartsihub.com`.

The owner now directs a different parallel path: build a new small Hono SaaS Core and independent first-party modules, perform Debian-first human UAT at `aimarkethubs.com`, then expose *working safe slices* as restricted real-user beta at `smartsihub.com`. This **does not** route/flip `smartaihub.app`, migrate all legacy routes at once, or assert SPEC-311 completed.

## Suggested normative text for amendment

> **Independent New Modular Platform Release — 2026-11-01.** The canonical production domain for the new SmartAIHub modular platform is `smartsihub.com`. The separate legacy `smartaihub.app` runtime remains on Debian as legacy development and an active legacy co-existence surface where users still require it. `aimarkethubs.com` is the new Modular SaaS Debian development and authorized human-UAT site. New SPEC-312–317 provide the modular platform implementation path. A scope-limited new-domain Core/Module beta **is not the SPEC-311 full legacy cutover**, and SPEC-311's full-route completeness/soak/Container-exception gates **shall not** be applied to this independent new-domain beta. No change to old production DNS is required for that beta. Per-slice releases use existing SPEC-295 release/exact-target provenance with scoped authority, narrow critical identity/tenant/finance/data safety, actual runtime observations, rollback and human UAT. Partial functionality and noncritical defects are tracked as known issues and must not create a program-wide `BLOCKED` state. Legacy retirement remains separately governed by SPEC-311 and applicable authorities. Cloudflare resources deleted under the recorded decommission are not live and may not be reused by ID; fresh minimal resources for the new platform are provisioned only as needed under available scoped authority.

## Integration instruction

When adopting draft SPEC-312–317 into the canonical registry, make the smallest **additive revision** to the operative SPEC-311 and, if needed, SPEC-295 deployment policy; do not delete historical decommission evidence, rename the old release identity without audit, create a new approval authority, or mark the old migration completed. Reconcile any nested release tooling that still treats `smartaihub.app` as an immutable production domain. Demonstrate that new-platform beta deployment is not a production DNS cutover of the old service. The owner request expresses product-development direction, but actual provider access and deployment credentials remain required.

## R0.5 SPEC-318 background-job boundary

New-domain `smartsihub.com` queue transport/Rust native supervisor is incremental and NOT evidence that legacy SPEC-311 full runtime/job cutover is complete. SPEC-295 remains deployment authority and SPEC-224/278 retain canonical job/lease control. Any restored Cloudflare Queue requires a **new justified resource and receipt**, since migration resources were decommissioned on 2026-11-01. Targeted early beta is not blocked by old full-cutover gate or missing unrelated job types; only unsafe tenant/financial/data actions stop in their own scope.
