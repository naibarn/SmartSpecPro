# Self Review Round 1

## Verdict

The plan is directionally correct and aligns with the spec. It addresses the observed production failure by replacing message-count completion with route-aware durable evidence. The plan still needed several quality and safety refinements before section splitting.

## Findings and Required Fixes

### 1. Completion gate must be route-specific and enforced centrally

Risk: If completion checks are spread across the run engine, media adapter, review service, and UI, one route can still complete without evidence.

Fix: Keep `autoTeamCompletionEvidence.ts` as the single server-side source of truth. `runEngine` and routers must call this service before status changes to `completed`.

Status: covered in plan and reinforced in TDD plan.

### 2. Media prompt stages must not become terminal stages

Risk: A video prompt skill could produce a nice storyboard/prompt and the run could stop there, recreating a text-only failure.

Fix: For `media.video` and `media.image`, prompt and storyboard artifacts are intermediate evidence only. Completion requires `auto_team_media_job_refs` with terminal provider status.

Status: covered in plan and reinforced in section acceptance criteria.

### 3. Existing image executor may be synchronous

Risk: Video already uses async media generation, but image execution currently appears to call synchronous generation while async image support exists. If Auto-Team expects a job ref for images, image route behavior can be inconsistent.

Fix: The media lifecycle section must either adapt synchronous image results into a terminal job ref or move image execution to the async image path when available.

Status: added to section 04.

### 4. Work OS visibility must not depend on queue ownership only

Risk: Existing Work OS projections can hide requests after assignment if filters only look at queue/open ownership. The user's core complaint is that assigned work looks deleted.

Fix: My Requests and Work OS Console projections must include request creator, requester, work case, team run, and room links, independent of current queue owner.

Status: covered in plan and section 07.

### 5. Tenant isolation must apply to every new lookup and deep link

Risk: New job/review/final-result links create more IDs that can be guessed or copied.

Fix: Every read/write must require tenant scope, and router inputs must validate that `roomId`, `runId`, `workRequestId`, `workCaseId`, `stageId`, `jobRefId`, and `reviewId` all belong to the same tenant.

Status: covered in security sections and TDD plan.

### 6. Idempotency must cover provider submission and polling

Risk: Retrying a blocked stage could submit duplicate video jobs and charge credits multiple times.

Fix: Media submit must first look up an unfinished job ref by idempotency key. Polling must update the same row. Submit keys must include prompt hash, provider, model, stage, attempt, and tenant.

Status: covered in plan and section 04.

### 7. Loop guard must distinguish "valid multi-step work" from broken repetition

Risk: Guarding only on repeated stages might stop valid multi-persona work. Guarding too weakly leaves infinite chat loops.

Fix: Repetition guard should key on no new durable evidence, same stage/skill/fingerprint, repeated blocked reason, and no state transition.

Status: covered in plan and section 06.

### 8. Language enforcement must be stored and passed through all execution layers

Risk: `/work/request` language toggle can create the room language, but prompts may still fall back to English if the run engine or skill executor omits it.

Fix: Persist selected language on room/run metadata and include it in route decision, stage execution prompts, media prompt generation, review prompts, and room UI labels.

Status: covered in plan and section 07.

### 9. Backfill must be non-authoritative

Risk: Backfilling old rooms into verified records would make fake old completions look valid.

Fix: Legacy-derived records must be marked `legacy_unverified`, and old rooms should be retryable into canonical runs instead of treated as complete.

Status: covered in plan and section 08.

### 10. UI must expose controls but not bypass policy

Risk: Retry/cancel/stop controls can become unsafe if they directly mutate provider jobs or skip review.

Fix: UI controls call server mutations that enforce tenant, run state, policy, idempotency, and route evidence rules.

Status: covered in TDD and section 07.

## Additional Implementation Notes

- Prefer adding new canonical tables over overloading `team_messages.metadataJson`; messages should reference canonical records, not contain them as the only source.
- Keep room message posting side-effect-free with respect to stage completion. A message post should not mark a stage complete unless the execution service has persisted evidence first.
- Record sanitized blocked reasons for users and full diagnostic details in server logs.
- The debug inspection helper should query canonical records plus room messages so future debugging is evidence-led.

## Review Outcome

Proceed to TDD planning and section splitting. The main adjustments are to make completion evidence central, add image async adaptation expectations, strengthen Work OS visibility semantics, and keep all new deep links tenant-scoped.
