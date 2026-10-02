# Synthesized Implementation Scope — Spec 270

## Objective

Deliver a durable provider-neutral design-time capability for creating, revising, resolving, reviewing, and verifying SmartAIHub/Mini App UI without requiring Stitch or introducing a runtime provider dependency.

## Authorities

- Spec 270 owns design request/context/artifact/variant/decision/version/provider policy and component-intent resolution.
- Spec 224 owns DevelopmentRun, implementation, approval/evidence semantics, and final verification.
- Spec 256 owns capability discovery/routing; Spec 261 owns portable package identity/signing/lifecycle.
- Existing auth/tenant, worker-job/outbox, billing, asset/blob, and backup systems retain their domain authority.

## Required outcomes

1. Reconcile spec number, schema, owner services and component/capability catalogs; write a fail-closed G0 record.
2. Define versioned immutable canonical design contracts, provenance, concurrency, localization, rights, redaction/export, and semantic diff.
3. Deliver native/no-provider design and reuse-first Astryx/product-component resolution with fail-closed action binding.
4. Persist/recover through existing authorities and route async generation/verification through worker_jobs plus outbox.
5. Add Spec 224 design checkpoints/evidence and Spec 256 mapping without forking their state machines/registries.
6. Add optional certified Stitch adapter with isolated credentials, quota/error translation, sanitized/materialized assets, flags off by default.
7. Add Mini App/core UI authoring/preview, responsive/accessibility/theme/browser/performance verification, observability, and lifecycle/rollback evidence.

## Constraints

No DDL, production enablement, credential onboarding, live paid calls, or external transmission before G0/provider/owner gates. Do not add a second registry, scheduler, retry engine, approval DB, billing ledger, deployment authority, or backup authority. Imported HTML is untrusted and never executes. Do not use retired systems. Distinguish local proof from live provider, browser, production, cost, restore, or legal evidence.
