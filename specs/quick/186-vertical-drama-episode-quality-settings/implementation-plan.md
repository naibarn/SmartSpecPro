# Implementation Plan

## Objective

Implement and verify durable, capability-aware, per-episode Image Quality and LLM Thinking Quality controls for Vertical Drama.

## Work sections

1. Shared contract and capability helpers
   - Add the JSON-safe settings schema/types and normalizers.
   - Add helpers to resolve image quality options from the selected media model and LLM reasoning support from the resolved model/provider.
   - Keep unknown legacy/null settings equivalent to Auto.

2. Persistence and inheritance
   - Add nullable `generationSettings` to series and episode Drizzle schema plus manual migration.
   - Extend episode detail projection with settings/capability view data.
   - Add an ownership-checked `setEpisodeGenerationSettings` mutation using one transaction to update current episode and series default.
   - Pass the series default snapshot through `insertEpisodeWithSafeNumber` so every new-episode path inherits it.

3. Runtime adapters
   - Read the current episode's settings at image generation time and pass `quality` only when selected model metadata supports it.
   - Thread the LLM reasoning override into Vertical Drama skill calls.
   - For OpenRouter, send one `reasoning` object with `effort` and `exclude: true`; Auto preserves current skill policy behavior.
   - Record effective setting metadata in run/provider request context where an existing metadata boundary exists.

4. Client UI and localization
   - Add a compact, accessible settings group to the existing episode workspace settings area.
   - Render Image quality options from the selected image model and LLM thinking options from the selected/resolved LLM model.
   - Add optimistic save/revert behavior, loading/error/unsupported states, and Thai/English copy.

5. Verification
   - Add shared contract/helper tests.
   - Add server router tests for ownership, transaction/update, inheritance, model validation, and old-episode non-retroactivity.
   - Add OpenRouter request-builder tests and image payload tests.
   - Add UI tests for independent controls and capability states.
   - Run focused Vitest, schema/migration checks, Prettier/diff checks, targeted build/type diagnostics, and a bounded real provider probe only if credentials/model state are available and the task path is safe.

## Acceptance criteria

- All eight criteria in the approved design document pass.
- No unrelated dirty files are staged, rewritten, or deleted.
- No real provider call occurs during ordinary test runs.
- Any paid verification is explicitly reported with model, task, and credit evidence.
