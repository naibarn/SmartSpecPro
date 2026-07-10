<!-- PROJECT_CONFIG
runtime: node-pnpm
test_command: cd apps/web && pnpm check
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-static-presets
section-02-preset-synthesizer-skill
section-03-backend-synthesis
section-04-create-wizard-ux
END_MANIFEST -->

# Section Index

## Execution Order

1. `section-01-static-presets`
   - Adds six curated preset categories and labels.
   - Can be implemented independently.

2. `section-02-preset-synthesizer-skill`
   - Adds the dedicated skill package and schema/fixture verification.
   - Should be completed before backend service work.

3. `section-03-backend-synthesis`
   - Adds the service and tRPC mutation that call the skill.
   - Depends on section 02.

4. `section-04-create-wizard-ux`
   - Adds the simple Mix and Match UX in the existing wizard.
   - Depends on sections 01 and 03.

## Shared Contract

The synthesized draft shape must match the existing preset/wizard fields:

```ts
type SynthesizedGenrePresetDraft = {
  title: string;
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: Array<{ name: string; role: string; description: string }>;
  visualBible: string;
  mixRecipe?: {
    primaryFlavor: string;
    supportingFlavors: string[];
    rationale: string;
  };
  warnings: Array<{ code: string; message: string }>;
  contract_version: 1;
};
```

## Gate Commands

```bash
cd apps/web && pnpm test -- verticalDramaPresetSynthesis
cd apps/web && pnpm test -- verticalDramaSeries.synthesizeGenrePreset
cd apps/web && pnpm test -- CreateSeriesWizard
cd apps/web && pnpm check
```
