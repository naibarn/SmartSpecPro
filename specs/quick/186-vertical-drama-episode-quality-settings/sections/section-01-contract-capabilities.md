# Section 01 — Contract and Capabilities

## Ownership

Shared settings contract, normalization, image-quality capability resolution, and LLM reasoning capability resolution.

## Target files

- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/episodeGenerationSettings.ts` (new if needed)
- `apps/web/server/services/verticalDramaEpisodeGenerationSettings.ts` (new if needed)
- focused shared/server tests

## Requirements

- Keep the settings schema additive and tolerant of absent legacy values.
- Treat Image quality as model-specific provider input, not LLM reasoning.
- Prefer OpenRouter `supported_efforts`/catalog metadata when available; otherwise use the existing `supportsThinking` gate and safe standard effort values.
- Never create a provider fallback.

## UI/UX Contract

Target user/JTBD: episode creator tuning the next generation.

Existing pattern: reuse existing media-model capability metadata and Radix selects.

State matrix: Auto, supported, unsupported, loading, malformed legacy data.

Responsive/accessibility: controls expose labels and keyboard-selectable options at required mobile/tablet/desktop viewports.

Browser evidence: route-level smoke is required after UI integration; if browser tooling is unavailable, record it as unverified rather than pass.
