## Fresh Start Notes
- Platform: standard
- SocratiCode active: yes, green index.
- Existing completed Orchestra session archived under `orchestra/archive/`.
- Existing dirty work was present before this task and left untouched.

[COMPLETE] wave-1-ui-design - User approved mode-scoped Auto vs Standard controls.
[COMPLETE] wave-2-implementation - Product Detail now hides Standard custom controls while Auto mode is active and hides Advanced Auto while Standard mode is active, while keeping shared run status visible.

## Verification
- PASS: `cd apps/web && corepack pnpm test client/src/lib/marketplaceHyperframesUiState.test.ts client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx`
- PASS: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 corepack pnpm check`
- PASS: `cd apps/web && PLAYWRIGHT_E2E_PORT=3017 corepack pnpm e2e:marketplace-hyperframes`
- PASS: Advanced Auto defaults regression — all 7 optional controls display concrete defaults, with `frameStrategy=storyboard_3x3_split`.
- Note: commands warned that local Node is `v20.19.2`, while package engines require `>=20.20.0 <21 || >=22.22.0`.
