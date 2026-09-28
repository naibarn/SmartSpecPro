# Section 01 — Web contract, API, Skill and persistence

## Ownership

Own shared TypeScript contracts, Skill adapter, protected procedures, durable run/story/placement persistence and credit-context integration. Do not implement FFmpeg, Whisper or Worker process execution.

## UI/UX Contract

### Target User / JTBD
N/A for this API/contract section; browser behavior is owned by section-02. This section supplies the validated data and error states consumed by that UI.

### Existing Pattern Reference
Searched with `rg` in `apps/web/client/src/components/verticalDramaSeries` and `apps/web/client/src/lib`; `SpecialTieInEpisodeDialog.tsx`, existing media preview and model-selection tests are the reuse references. Decision: reuse existing server contracts and validation conventions.

### Surface Inventory
N/A; no direct surface ownership. Exposed tRPC/query results are consumed by the existing Special Tie-in dialog.

### Component Map
N/A; no React component is implemented in this section.

### State Matrix
| State | API contract | Verification |
|---|---|---|
| loading | typed pending job projection | router tests |
| empty | no current ideas; explicit history query | service tests |
| error | typed code/trace/retryability | router tests |
| success/partial | validated payload with status/warnings | contract tests |
| disabled/selected | catalog/allowlist validation response | service tests |

### Responsive Matrix
N/A; layout is owned by section-02.

### Accessibility Acceptance
N/A for server code; section-02 owns labels, focus and keyboard evidence.

### Copy Contract
API returns stable error codes and localized message keys; UI owns Thai/English presentation in section-02.

### Browser Evidence Required
N/A directly; section-02 must prove the browser-visible contract using `ui-browser-verification.md`.

## Target areas

- `apps/web/shared/marketplaceReviewIdeas/`
- `apps/web/shared/verticalDramaSeries/specialTieInContracts.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaMarketplaceReviewSkillAdapter.ts`
- existing media, B-roll, async-job and credit services

## Required behavior

- accept only authorized managed IDs and selected character IDs
- persist source/guide/story/model fingerprints
- generate exactly three ideas with a new variation seed per run
- enforce no-dialogue and nine-shot review gates
- expose explicit history selection after refresh
- validate B-roll prepared-time bounds and source revisions
- resolve LLM/image/video models from the current catalog with deterministic recommended defaults
- use canonical character IDs, versioned guide/story contracts and Worker event cursors
- record all billable operations in the existing ledger without Worker-side deduction

## TDD and acceptance

Add contract, service, router, migration and billing tests before implementation. Tests must prove old special/normal records still parse and stale/unauthorized inputs cannot create downstream jobs.
