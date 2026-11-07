# Section 03 — Provider Capability Routing

## Requirement IDs

CPE-08, NB-06, NB-07

## Objective

Complete a verifiable routing matrix for configured image/video providers without unauthorized or capability-blind fallback.

## Owned paths

Existing model registry, `verticalDramaProviderRouting.ts`, `verticalDramaProvider.ts`, media transport resolver, generation adapters and current provider tests.

## Tasks

1. Resolve reference cap, duration, resolution, aspect ratio, modality and transport from registry/provider facts.
2. Keep only currently authorized/configured compatible routes in the candidate set.
3. Bound attempts by existing provider policy and one valid budget allocation; reconcile uncertain outcomes before retries.
4. Keep CPE-specific route selection optional; use the current selected model when the optional router is absent or fails and the current route is valid.

## Completion predicate

Model matrix tests demonstrate correct compatible routing, a safe configured fallback, and denial of disallowed/incompatible provider. No duplicate paid task or credit debit.

## Prerequisites and fallback

Requires sections 01–02. Existing configured route is fallback; no speculative provider is added.

## Focused tests and evidence

Run the provider/model matrix for modality, references, duration, resolution, aspect ratio, transport, tenant allowlist, disabled model, timeout and ambiguous task outcome. Assert fallback stays within configured compatible choices and uses one authorized budget/idempotency allocation.

## Unresolved assumptions

Confirm canonical source for provider capability and price/version data for every supported route; if a provider's capability is unknown, preserve the current selected route only when its existing contract validates it, otherwise return its normal technical error.
