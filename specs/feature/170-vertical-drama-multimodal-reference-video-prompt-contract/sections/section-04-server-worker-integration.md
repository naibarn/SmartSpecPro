# Section 04 — Server, worker, render, bulk, retry, and recovery integration

## Objective

Thread one canonical bundle and terminal prompt through every prompt/render path,
worker payload, retry/repair, bulk generation, credit/task admission, and
completed-task recovery.

## Files and boundaries

- Integrate `verticalDramaEpisodes.ts` prompt, render, split, bulk, repair,
  speaker-switch, and recovery paths.
- Integrate `verticalDramaEpisodePipeline.ts` motion-pack construction.
- Update `verticalDramaMedia/contracts.ts` worker schemas and dispatch.
- Make `verticalDramaVideoPromptFormatter.ts` text-preserving after finalization.
- Preserve existing task, credit, managed-media, and recovery services.

## Required behavior

Resolve and snapshot IDs once before skill invocation. Persist bundle revision,
fingerprint, capability profile, terminal skill stamp, and prompt hashes before
paid dispatch. Compare all stamps again before credit/task admission; stale state
fails without charge or provider submission.

No stop remains valid and sends no stop field. Prompt-only stop never reaches
provider. A real stop image is resolved and mapped to native last-frame only when
the selected profile guarantees it. Mixed-mode providers receive typed arrays and
mapping audit without a fake first/last claim.

Worker payloads carry optional image-only start/stop plus typed ordered
references, bundle fingerprint, and terminal prompt stamp. Read old singular
video/audio fields for compatibility but write new payloads only in the array
contract. Retries and completed-task linking preserve the same bundle before
attempting a new paid task.

## TDD-first tests

Cover actual authorized URL resolution, no-stop, prompt-only stop, stale
revision/profile/hash rejection before credits, bulk/split/repair/retry/judge/
speaker-switch fingerprint reuse, old/new worker payloads, formatter immutability,
mapping audits, task idempotency, credit safety, and completed-task recovery.

## Exit criteria

Focused Vertical Drama router/pipeline/worker tests and Python request tests pass
with no duplicate paid submission or post-finalization text mutation.

## UI/UX Contract

### Target User / JTBD
N/A — server/worker integration; user-facing status rendering is section 05.

### Existing Pattern Reference
N/A — no new UI surface; preserve existing task/credit/recovery patterns.

### Surface Inventory
N/A — no browser surface is changed by this section.

### Component Map
N/A — no browser components are owned here.

### State Matrix
N/A — task and API states are covered by integration tests; UI mapping is section 05.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — accessibility acceptance is in section 05.

### Copy Contract
N/A — structured server errors are localized by the UI section.

### Browser Evidence Required
N/A — browser evidence is required in section 05.

### Implementation status

Implemented in `apps/web/server/routers/verticalDramaEpisodes.ts`,
`apps/web/server/services/verticalDramaEpisodePipeline.ts`, and the shared
worker contracts. Provider arrays are derived from canonical asset MIME types,
frame fields use the selected capability mode's native mapping, and retries
retain the same asset-backed bundle. Focused server/service tests pass.
