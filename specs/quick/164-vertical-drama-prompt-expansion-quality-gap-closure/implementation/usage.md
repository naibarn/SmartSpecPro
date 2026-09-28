# Usage

Run focused proof with:

```bash
npm --workspace apps/web test -- server/services/__tests__/verticalDramaPromptExpansionMigration.test.ts server/services/__tests__/verticalDramaPromptExpansionService.test.ts server/services/__tests__/verticalDramaPromptExpansionSkill.test.ts --run
npm --workspace apps/web test -- client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.lineage.test.tsx --run --environment jsdom
```

For an authorized real-provider smoke, set the explicit smoke environment
variables documented at the top of
`apps/web/scripts/prompt-expansion-live-smoke.ts` and run it from `apps/web`.
