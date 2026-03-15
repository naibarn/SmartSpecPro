# Plan Uplift

## U1 - Add explicit preview expiration and retention policy

- Severity: medium
- Impact: low-impact
- Rationale: the current plan distinguishes preview from committed artifacts but does not say how long ephemeral previews live, which can create unbounded storage growth and ambiguous cleanup behavior.
- Concrete plan delta to apply: define a retention rule for ephemeral preview payloads and audit snapshots, including cleanup cadence, fields that remain immutable after preview cleanup, and UI behavior when a preview has expired but run metadata remains.

## U2 - Add commit conflict and stale-preview handling

- Severity: high
- Impact: high-impact
- Rationale: preview-first flows can fail in subtle ways if the underlying scope, permissions, source library items, or target template copy change between preview generation and user confirmation. Without explicit stale-preview rules, commit operations may create inconsistent artifacts or fail nondeterministically.
- Concrete plan delta to apply: require commit-time revalidation of permissions, source readability, target availability, and preview freshness; define user-visible stale-preview errors and the rule for forcing regeneration versus allowing commit.

## U3 - Add partial-success and fallback behavior per intent

- Severity: high
- Impact: high-impact
- Rationale: the current plan says preview and commit are separate, but it does not specify how each intent behaves when envelope parsing succeeds but payload validation only partially succeeds, or when deck commit fails after preview creation. These edge cases will shape both runtime behavior and test coverage.
- Concrete plan delta to apply: add intent-specific failure handling rules for research, storyboard, and deck flows, including what remains visible to users, what status is stored, and whether retries are safe.

## U4 - Add rollout and observability gates for template seeding and commit APIs

- Severity: medium
- Impact: low-impact
- Rationale: the current plan mentions feature gates and metrics broadly but does not define staged rollout checkpoints for preview-only release, deck commit release, and template seeding verification.
- Concrete plan delta to apply: split rollout into phases with explicit enablement gates, required dashboards, and acceptance checks before expanding exposure.

## U5 - Add provenance display contract for UI surfaces

- Severity: medium
- Impact: low-impact
- Rationale: the plan stores chunk-level provenance but does not define the minimum UI-facing shape for citations, source links, and “why this source was used” metadata. Without that, backend persistence may drift from the eventual frontend need.
- Concrete plan delta to apply: define a minimum provenance DTO for preview and committed artifacts that includes document title, chunk refs where available, source URI if available, and a short support summary.
