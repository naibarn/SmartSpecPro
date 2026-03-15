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

### Section 02 - First Long-Form Recipe

- Options considered:
  - ship several long-form families at once
  - ship one long-form family end-to-end and use it to prove the routing and block contract first
- Decision taken:
  - ship `sectioned-explainer` first as the initial long-form family
- Mode:
  - auto
- Rationale:
  - the section goal is to create a real dense-text destination quickly, and one complete recipe across shared/server/editor surfaces is lower-risk than half-implementing multiple families at once

### Section 02 - Slot Budget Placement

- Options considered:
  - store slot budgets only next to the new long-form recipe
  - add shared slot-budget metadata for all built-in recipes now
- Decision taken:
  - introduce shared slot-budget metadata for all built-in recipes now
- Mode:
  - auto
- Rationale:
  - Section 03 needs recipe-aware compaction inputs for both compact and long-form layouts, so centralizing the metadata early avoids immediate drift

### Section 02 - Compact Recipe Protection

- Options considered:
  - let the new long-form heuristic outrank all compact recipes whenever copy looks dense after normalization
  - add deterministic guardrails so timeline/stat/framework/process slides keep their compact recipes even when normalized sections inflate structure counts
- Decision taken:
  - add deterministic compact-recipe guardrails alongside softer scoring penalties for `sectioned-explainer`
- Mode:
  - auto
- Rationale:
  - normalization derives sections from body lines, which can make short metric or roadmap slides look artificially long-form; the extra guardrails keep Section 02 from regressing existing compact recipe coverage
