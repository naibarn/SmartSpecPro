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
section-12-production-wizard-guided-workflow
section-13-story-dialogue-density-reform
section-14-script-quality-qc-auto-improve
section-15-genre-preset-visual-identity-and-mix
section-16-ad-banner-overlay
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
| section-10-ui-redesign-genre-presets-story-generation | 02, 03, 04, 09 | 11, 12 | No |
| section-11-user-and-admin-preset-ownership | 10 | 12 | No |
| section-12-production-wizard-guided-workflow | 03, 04, 05, 07, 08, 10, 11, 13, 14 | - | No |
| section-13-story-dialogue-density-reform | 01, 02, 04, 07 | 12, 14 | Yes after 04/07 |
| section-14-script-quality-qc-auto-improve | 04, 08, 13 | 12 | No |
| section-15-genre-preset-visual-identity-and-mix | 02, 10, 11 | - | Yes (independent of 12/13/14) |
| section-16-ad-banner-overlay | 01, 02, 08 | 09 (final render/banner compositing) | Yes after 08 |

Note: section-08's 2026-07-07 addition (tie-in naturalness QC, task 10) executes
AFTER section-13/14 land — it consumes the section-14 scorecard v2 and
section-13 arc-replan mechanics; the rest of section-08 keeps its original
position in the graph.

Note (added 2026-07-09): section-16-ad-banner-overlay is a NEW, shipped
subsystem (task #30) — series-level banner design (skill + prompt/image
generation) depends on section-08's provider/model routing and product
reference resolution; the render-time banner compositing half of the work
was folded into section-09's final-render-suite scope (task #21) rather than
duplicated as its own compositing section — see spec §12.4 and §13.3.

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
10. section-13-story-dialogue-density-reform (2026-07-07) makes speech/story density a mandatory generation input at every layer (bible contentBudget → dialogue-complete script → per-shot budgets → duration-aware prompts) and adds arc-drift detection with append-only re-plan proposals for season-safe propagation.
11. section-14-script-quality-qc-auto-improve (2026-07-07) formalizes the shipped quality-review loop and extends it: scorecard v2 with intensity/continuity/tie-in dimensions + deterministic density metrics, policy floors, and a bounded auto-improve loop with regression guard and escalation.
12. section-12-production-wizard-guided-workflow adds the forward-looking guided production wizard so the shipped stage grid becomes an expert/detail surface while the main user path follows validated script → storyboard → script quality QC → frames → dialogue & density QC → video prompts → clips → assembly order. Runs last among the gated path: its gate steps consume section-13/14 outputs.
13. section-15-genre-preset-visual-identity-and-mix (2026-07-07) adds structured preset visual identity with end-to-end flow-through, the `sci_fi_mecha` seed family, and verifiable preset blending (weights + blend report + deterministic blend QC gate). Independent of 12/13/14 — can run in parallel after 02/10/11.
14. section-16-ad-banner-overlay (2026-07-08/09, task #30 — shipped) adds the series-level ad banner design studio (10 style presets, 3 placements, `vertical-drama-ad-banner-prompt` skill, vision-capable prompt generation, per-episode banner selection/timing) as a layer explicitly separate from in-story product tie-in (spec §13.3); its render-time compositing is implemented as part of section-09's final render suite (spec §12.4).

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

### section-12-production-wizard-guided-workflow

Add a guided Production Wizard to the episode workspace with one primary CTA, explicit locks, evidence summaries, script-quality + dialogue-density QC gates (sections 13/14), and repair paths. Video prompts become a downstream whole-episode stage after approved frames and passing dialogue/audio planning; per-shot prompt/dialogue actions remain secondary repair tools, and a spot repair re-enters at the earliest stale step without re-running unaffected stages.

### section-13-story-dialogue-density-reform

Make story/dialogue density a mandatory planning input (spec §7.7/§14.1): canonical speech-budget constants stay in `dialogueQuality.ts`, story bibles carry per-episode `contentBudget`, scripts become dialogue-complete with coverage validation, storyboards persist beat attribution + per-shot speech budgets, first-pass video prompts become duration-aware, and season impact is managed via deterministic arc-drift detection with append-only `arc_replan_proposal` review.

### section-14-script-quality-qc-auto-improve

Formalize the shipped episode quality-review loop and extend to v2 (spec §16.1): scorecard superset (hook/cliffhanger/continuity/tie-in + deterministic density metrics), per-tenant `VerticalDramaQualityPolicy` floors, bounded auto-improve loop (review → grouped repair incl. dialogue → re-review) with regression guard, human escalation with evidence, guided-mode gating, and recorded expert overrides.

### section-15-genre-preset-visual-identity-and-mix

Add structured `visualIdentityJson` to genre presets with an end-to-end flow-through rule (bible → character refs → start frames → motion prompts), seed the `sci_fi_mecha` family from the 2026-07-07 reference images, and upgrade Mix and Match to verifiable blending: per-selection weights, facet assignment pre-pass, deterministic visual-identity merge, blend provenance report, and a deterministic blend QC gate (spec §8.2.2).

### section-16-ad-banner-overlay

Shipped 2026-07-08/09 (task #30). Add the series-level ad banner overlay design studio: 10 style presets + 3 placement presets (`shared/verticalDramaSeries/adBannerPresets.ts`), the `vertical-drama-ad-banner-prompt` skill (vision-capable model resolution, editable generated prompt), per-series `adBanners` designs (existing `productTieIn` jsonb, no migration) and per-episode `adBannerPlan` (new nullable jsonb column), deterministic guardrails (forbidden claims, regulated-category approval gate, ≤5 banners, fullscreen non-overlap), and UI in the Product Tie-in tab distinct from in-story tie-in (spec §13.3). Render-time compositing lives in section-09 / spec §12.4, not here.

## Global Verification

Run focused tests section by section, then:

```bash
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm test -- skillRegistry
cd apps/web && pnpm test -- storyboardReviewWorkspace
cd apps/web && pnpm check
```

Run pytest only when implementation changes Python provider code.
