<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test -- verticalDrama
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-skill-packages
section-02-contracts-persistence-assets
section-03-dashboard-routes-feature-flags
section-04-series-memory-and-episode-pipeline
section-05-character-stock-and-start-frames
section-06-storyboard-review-handoff
section-07-audio-dialogue-subtitles
section-08-provider-qc-product-tie-in
section-09-assembly-export-artifacts
section-10-ui-redesign-genre-presets-story-generation
section-11-user-and-admin-preset-ownership
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-skill-packages | - | 04, 05, 07, 08 | Yes |
| section-02-contracts-persistence-assets | - | 03, 04, 05, 06, 07, 08, 09 | Yes |
| section-03-dashboard-routes-feature-flags | 02 | 04 | Yes after 02 |
| section-04-series-memory-and-episode-pipeline | 01, 02, 03 | 05, 06, 07, 08, 09 | No |
| section-05-character-stock-and-start-frames | 01, 02, 04 | 06, 08, 09 | Yes after 04 |
| section-06-storyboard-review-handoff | 02, 04, 05, 07, 08 | 09 | No |
| section-07-audio-dialogue-subtitles | 01, 02, 04 | 06, 08, 09 | Yes after 04 |
| section-08-provider-qc-product-tie-in | 01, 02, 04, 05, 07 | 06, 09 | No |
| section-09-assembly-export-artifacts | 02, 04, 06, 07, 08 | - | No |
| section-10-ui-redesign-genre-presets-story-generation | 02, 03, 04, 09 | 11 | No |
| section-11-user-and-admin-preset-ownership | 10 | - | No |

## Execution Order

1. section-01-skill-packages and section-02-contracts-persistence-assets can start first.
2. section-03-dashboard-routes-feature-flags starts after shared contracts/flags are available.
3. section-04-series-memory-and-episode-pipeline starts after skills, contracts, and UI entry are defined.
4. section-05-character-stock-and-start-frames and section-07-audio-dialogue-subtitles can run in parallel after the episode pipeline exists.
5. section-08-provider-qc-product-tie-in runs after start frames and audio policy are available.
6. section-06-storyboard-review-handoff runs after frame, audio, provider, and tie-in metadata contracts are stable.
7. section-09-assembly-export-artifacts finishes the artifact ledger, final assembly, export, and memory checkpoint path.
8. section-10-ui-redesign-genre-presets-story-generation retrofits the shipped UI (route, tabs, genre presets, real story generation, stage-card grid) after direct user feedback — implementation record, already shipped 2026-07-04.
9. section-11-user-and-admin-preset-ownership adds user-private vs. admin-published preset ownership on top of section-10's genre preset table, reusing the existing series-editing UI (no new screen).

## Section Summaries

### section-01-skill-packages

Create eight SmartSpecPro-compatible vertical drama skill packages, import the four GitHub guide skills losslessly, add the four SmartSpecPro-only skills, and prove registry/schema/fixture parity.

### section-02-contracts-persistence-assets

Add shared contracts, Drizzle tables, media asset linkage, artifact ledger contracts, tenant ownership checks, and secret-safe persistence boundaries.

### section-03-dashboard-routes-feature-flags

Expose the feature-flagged Dashboard routes and workspace shell without changing Article Video Builder or existing Storyboard Review routes.

### section-04-series-memory-and-episode-pipeline

Implement series memory, episode creation, stage runner, approvals, repair, stale propagation, and dry-run/plan/full execution modes.

### section-05-character-stock-and-start-frames

Implement character reference stock, 3x3 contact-sheet batch planning, concurrent sheet generation, deterministic cropping, candidate-frame selection, and start-frame approval.

### section-06-storyboard-review-handoff

Create idempotent Storyboard Review projects with ordered tasks, start/stop frames, metadata panels, prompt/model/provider visibility, and backlink/source lineage.

### section-07-audio-dialogue-subtitles

Plan dialogue, voice continuity, native audio, separate TTS, subtitle cues, timing, and audio repair states.

### section-08-provider-qc-product-tie-in

Resolve image/video models from the registry, enforce provider capability gates, add QC/repair flow, and integrate safe product tie-in planning.

### section-09-assembly-export-artifacts

Persist complete run artifacts, import generated clips, create final assembly/export metadata, and checkpoint memory updates after QC/export.

### section-10-ui-redesign-genre-presets-story-generation

Implementation record: route moved off `/dashboard`, persistent left project sidebar shell, always-navigable wizard/workspace tabs, genre preset library (36 seeded), real credit-consuming `generateStoryBible` action, episode workspace redesigned as an always-clickable stage-card grid.

### section-11-user-and-admin-preset-ownership

Add `scope`/ownership to genre presets so users can save their own in-progress series as a private preset (reusable only by them) and admins can publish presets globally (reusable by everyone) — via a "Save as preset" action on the existing series-editing UI, not a new preset-management screen.

## Global Verification

Run focused tests section by section, then:

```bash
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm test -- skillRegistry
cd apps/web && pnpm test -- storyboardReviewWorkspace
cd apps/web && pnpm check
```

Run pytest only when implementation changes Python provider code.
