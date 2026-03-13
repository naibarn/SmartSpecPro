## Implementation Decision Log

### Section 01 - Foundation Shape

- Options considered:
  - keep profiling and mode routing buried inside `aiPresentationService.ts`
  - introduce a shared deterministic profiling/routing module and keep AI service as the first consumer
- Decision taken:
  - introduce `apps/web/shared/presentation/contentProfile.ts` as the shared foundation
- Mode:
  - auto
- Rationale:
  - Section 01 explicitly calls for shared routing inputs that later editor explanation surfaces can reuse, so embedding the logic only in the service would create drift immediately

### Section 01 - Contract Rollout

- Options considered:
  - defer additive `aiDesign` fields until long-form rendering is implemented
  - add the additive schema fields now and keep most of them optional/metadata-first
- Decision taken:
  - add the v1 routing metadata fields now as optional additive contract
- Mode:
  - auto
- Rationale:
  - later sections depend on the persistence shape, and adding it now keeps Section 01 aligned with the already-approved contracts appendix

### Section 01 - Compact Recipe Suppression

- Options considered:
  - suppress compact component recipes whenever the router prefers `long_form_block`
  - suppress only when structured mode is explicitly `unsafe` and the copy shows real long-form text pressure
- Decision taken:
  - use targeted suppression only for `unsafe` structured fits with long-form text pressure
- Mode:
  - auto
- Rationale:
  - a broader rule incorrectly blocked valid compact recipes such as timeline/stat/poster cases, while the targeted rule still protects the dense Thai prose cases Section 01 is meant to catch
