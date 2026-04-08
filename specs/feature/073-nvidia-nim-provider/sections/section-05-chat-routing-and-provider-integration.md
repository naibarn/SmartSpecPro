# Section 05: Chat Routing and Provider Integration

## Goal

Wire NVIDIA NIM Hosted into the standard chat runtime so mapped NVIDIA chat models use the existing OpenAI-compatible route family without introducing provider-specific branching in phase 1.

This section is intentionally small compared with the catalog and admin work. Most of the feature risk lives upstream in sync, classification, and mapping safety. Here we only need to prove that a valid NVIDIA chat mapping can traverse the current chat stack cleanly.

## Files in scope

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/llmRoutes.unit.test.ts`
- `apps/web/server/_core/llmRoutes.kie.test.ts` if route-family coverage needs to be expanded for regression protection
- any small shared helper in `apps/web/server/_core/` if NVIDIA needs a provider-name or route-family utility

## Why this section is separate

The NVIDIA feature does not require a new chat protocol. That is an important constraint:

- the hosted NVIDIA chat surface already fits the OpenAI-compatible `/v1/chat/completions` shape
- the provider-specific complexity is in catalog sync and safety gating, not in the chat transport itself
- keeping the runtime change small reduces the chance of regressing existing OpenAI-compatible providers

This section should therefore reuse the current route-family handling as much as possible and only add NVIDIA-specific integration if the shared routing code cannot already express it cleanly.

## Implementation requirements

### 1. Standard chat-completions routing for NVIDIA

Mapped NVIDIA chat models must resolve to the existing chat-completions route family.

The implementation should ensure:

- a mapped `nvidia_nim` chat row uses `/v1/chat/completions`
- the request body is treated as ordinary OpenAI-compatible chat-completions payload
- no Kie-style per-family path resolver is introduced for NVIDIA in phase 1
- no NVIDIA-specific request-body transformation is required unless an existing shared helper already handles it

If route-family resolution is driven by `apiStyle`, NVIDIA chat mappings should behave like other generic chat-completions providers.

### 2. Preserve existing provider behavior

The NVIDIA change must not alter the behavior of existing providers.

Particularly important regressions to avoid:

- Kie route-family routing
- OpenAI-compatible providers already using `chat/completions`
- providers that already rely on `responses` or `messages` route families

The safest implementation is to make NVIDIA fit the existing generic path rather than creating a new special branch.

### 3. Explicit boundary between catalog safety and runtime routing

This section should not try to compensate for catalog or mutation mistakes.

The runtime should assume that:

- only valid chat mappings reach it
- non-chat NVIDIA rows are already excluded by the catalog/mutation workstreams
- invalid mappings are suppressed before runtime selection

That keeps this section focused on transport integration instead of repeating safety checks already owned by admin/runtime loaders.

### 4. Minimal provider integration surface

If the current routing stack needs a provider-name check for NVIDIA, keep it narrow and local.

Prefer:

- existing generic route-family resolution
- small catalog-driven dispatch helpers

A new hardcoded NVIDIA route map should be avoided unless the shared route code cannot represent the existing `/v1/chat/completions` flow.

## Tests to write first

- Vitest: a mapped NVIDIA chat model resolves to the standard chat-completions route family.
- Vitest: a mapped NVIDIA chat model uses the same transport path as other generic chat-completions providers.
- Vitest: NVIDIA integration does not change the behavior of existing OpenAI-compatible providers.
- Vitest: NVIDIA integration does not change Kie route-family behavior.
- Vitest: invalid or non-chat NVIDIA rows are never expected to reach the runtime path in this section.

## Acceptance criteria

- A mapped `nvidia_nim` chat model routes through `/v1/chat/completions`.
- NVIDIA chat requests use the shared OpenAI-compatible chat-completions behavior.
- No new NVIDIA-specific route-family branch is needed in phase 1.
- Existing provider routing remains green after NVIDIA support lands.

## Implementation Notes

Implementation touchpoints:

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/llmRoutes.unit.test.ts`
- optional small route helper in `apps/web/server/_core/` if the shared dispatch needs a narrow NVIDIA-compatible hook

Deviation from plan: keep NVIDIA runtime integration intentionally boring. The catalog and admin work are the real feature; the runtime should only prove that a reviewed NVIDIA chat mapping behaves like any other OpenAI-compatible chat provider.

## Tests

- `apps/web/server/_core/llmRoutes.unit.test.ts`
- `apps/web/server/_core/llmRoutes.kie.test.ts` if a regression guard is needed for route-family dispatch
