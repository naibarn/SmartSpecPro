# CPE Non-Blocking Gap Closure — Planning Requirements

## Objective

Create a repository-grounded implementation roadmap to close the remaining Vertical Drama Cinematic Production Engine (CPE) gaps across P0–P4. Reuse existing Vertical Drama capabilities and canonical SPECs. Do not plan a duplicate rendering pipeline or replace existing image/video generation workflows.

## Governing product invariant

Normal image and video production must remain usable under the same fundamental conditions whether optional CPE enhancements are enabled, disabled, unavailable, timed out, stale, or invalid. CPE planning, aesthetic scores, continuity findings, camera/lighting suggestions, and identity warnings are advisory. They must not create new prerequisites, mandatory approvals, waits, automatic repair loops, or production-stage failures. Preserve existing manual approval, cancellation, authorization, safety, billing, technical-integrity, tenant, and asset-ownership behavior.

When an optional CPE step fails, record a bounded diagnostic, discard invalid/stale changes, and continue through the existing storyboard/generation contracts. Never overwrite a successful image/video with a failed candidate. Usable generated media remains inspectable/downloadable with warnings. Partial assembly may use only existing explicit assembly contracts and must label technical fallbacks truthfully.

The critical CPE directive takes precedence over older broad assurance plans wherever they would let an aesthetic/CPE finding change image or video eligibility. Reconcile Feature 157's generic `provider_ready`, `awaiting_action`, and production-QC gates: they may enforce existing authorization, tenant/asset ownership, content safety, explicit user approval, valid credits/budget, configured-provider capability, cancellation, and essential technical/artifact integrity. They must not inherit a cinematic score, identity/continuity/lighting/camera/style warning, missing optional CPE service, or failed advisory QA result as a new paid image/video prerequisite.

## Scope to plan

Reconcile and close real gaps in the existing capabilities corresponding to:

- P0: Non-blocking integration foundation, immutable production contracts, plan fallback, diagnostics, and end-to-end regression proof.
- P1: AI director/shot intent; composition and camera movement; lighting/color; character, wardrobe, prop, scene and location consistency; first/last-frame planning; compatible multi-model routing; reusable style presets and production templates.
- P2: Storyboard preview and existing user-controlled approvals; advisory visual QA; selective repair; version lineage and successful-asset preservation.
- P3: Dialogue/lip-sync, sound design, editing/assembly, and cross-episode continuity.
- P4: Cost-aware optimization and bounded autonomous suggestions/repairs that can never exceed a valid user-approved budget or repeatedly spend without fresh authorization.

Cover API/UI contracts, persistence and migration only where source evidence requires them, durable jobs through the repository's canonical `worker_jobs` plus outbox control plane, observability, rollout/rollback, and tenant/asset isolation.

## Required acceptance evidence

Plan tests proving at minimum:

1. CPE off, missing, timeout, invalid output, and stale metadata preserve original workflow behavior and continue image/video generation.
2. Low cinematic score, continuity warning, identity warning, and QA failure do not reject usable media, prevent downstream production, or hide a successful asset.
3. Failed repair/provider candidates never replace the last successful asset; a technical failure remains distinct from advisory quality.
4. No new CPE approval/wait state; explicit manual approval, rejection, and cancellation retain current semantics.
5. Provider fallback is bounded, configured, compatible, authorized, and budgeted; no duplicate credit deduction or paid retry without valid budget/authorization.
6. Tenant/asset ownership, provider safety, essential technical validation, and content-safety rules remain hard controls.
7. Partial assembly and any fallback are correctly labeled and never misrepresented as generated video.
8. Existing feature-off compatibility, regression, integration, and UI evidence are recorded before any P0–P4 completion claim.

## Current repository context

- Planning baseline: canonical `main` SHA `620bbe26c65f53d3026a67f9edd03818c51ee664`; implementation reconciliation SHA: `50595c8c5c99970f481aa19b202edeb8111dd6af` (2026-11-07).
- Current development checkout contains unrelated dirty/untracked files; preserve them.
- The existing CPE-related work is distributed across Vertical Drama services and SPECs; reconcile before assigning work. Do not create a new SPEC ID in this plan.
- The owner explicitly requests a comprehensive plan now; this planning task does not authorize production deployment.

## Required plan output

Produce a dependency-aware project manifest and implementation-ready sections. Each section must name its objective, owned source/spec paths, requirements, prerequisites, observable completion predicate, focused tests/evidence, safe fallback, and unresolved assumptions. Clearly separate already implemented behavior from source-backed gaps and evidence/rollout gaps. Recommend an earliest safe slice and preserve normal image/video production throughout every phase.
