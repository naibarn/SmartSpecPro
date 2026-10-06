## Section 06: Full-Slide Media Mode

### Goal

Allow poster/infographic/image-first slides to be generated as a complete visual artifact when that yields better quality.

### Scope

- mode selection
- prompt construction from content profile
- metadata and traceability
- generated-media insertion

### Deliverables

- full-slide media route
- prompt contract
- metadata persistence
- explanation UI contract
- provider suitability and Thai-text-risk rules
- explicit safety policy for text-in-image use

### Initial v1 Defaults

- only cover/title/poster/infographic candidates may auto-enter this mode
- timeout before fallback: `45s`
- generation retry max: `1`
- if Thai text risk is `high`, auto-routing is blocked
- editable source narrative must always be retained

### Key Decisions

- this mode is selective
- source narrative and why-chosen metadata must be preserved
- text-in-image quality risk must be part of the routing decision, not an afterthought
- request/output metadata must follow [Contracts Appendix](../contracts-appendix.md#4-full-slide-media-prompt-contract)
- dense Thai informational slides stay biased away from this mode unless the user explicitly overrides

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- What shipped:
  - enabled `full_slide_media` routing behind the `PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED` env gate and reused existing visual-first mode candidates from the content profiler
  - added Thai text risk estimation plus a safety block that keeps dense Thai informational slides out of image-first mode unless the flag/user flow changes later
  - built a full-slide visual prompt path that upgrades the slide prompt into poster/cover/infographic instructions and then compiles successful media outputs into single full-canvas visual slides
  - persisted provenance under `aiDesign.mediaModeMetadata` including `visualIntent`, `thaiTextRisk`, and `editableSourceRetained`
- Tests added or updated:
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - v1 uses the same media generation lane as normal image slides and swaps in a full-canvas visual slide at compile time instead of provisioning a separate canonical media job
  - rollout remains env-gated rather than tenant-flagged while quality is still being proven
- Follow-ups for later sections:
  - surface why full-slide media was chosen or blocked in the editor
  - add provider/model provenance once canonical preview and richer media telemetry are wired in
