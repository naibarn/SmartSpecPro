<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run <focused files>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-director-shot-intent
section-02-visual-canon-and-frame-planning
section-03-provider-capability-routing
section-04-preview-presets-and-approvals
END_MANIFEST -->

# P1 Sections — Director and Visual Continuity

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-director-shot-intent | P0 | 02, 03, 04 | No |
| section-02-visual-canon-and-frame-planning | 01 | 03, 04 | No |
| section-03-provider-capability-routing | 01, 02 | 04 | No |
| section-04-preview-presets-and-approvals | 01, 02, 03 | P2 | No |

## Execution Order

Run all sections sequentially because they share storyboard, shot, prompt, and UI contracts.

## Section Summaries

### section-01-director-shot-intent
Extend current scene intent at the existing storyboard seam and validate current-revision fallback.

### section-02-visual-canon-and-frame-planning
Wire style, identity, wardrobe, props, location and first/last-frame facts through existing contracts.

### section-03-provider-capability-routing
Route only to configured, tenant-authorized models whose reference/duration/transport capabilities match.

### section-04-preview-presets-and-approvals
Surface preview and preset selection in existing UI while preserving all explicit approval and cancel behavior.
