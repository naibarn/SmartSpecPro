# Research: Vertical Drama Draft QC

## Research decision

- Codebase research: required because this is an existing TypeScript/Vitest/tRPC
  application with existing Vertical Drama synthesis, Redis/BullMQ jobs, credit
  reservations, and Create Series wizard state.
- Web research: limited to BullMQ reliability concepts because the implementation
  needs a pre-create asynchronous job. The repository's existing job service is
  the primary implementation precedent.
- Testing: focused Vitest suites in `apps/web/server/services/__tests__`,
  `apps/web/shared/**/__tests__`, and component tests under
  `apps/web/client/src/components/verticalDramaSeries/__tests__`; run through
  the existing npm workspace command.
- SocratiCode: unavailable in this runtime; bounded `rg`, `sed`, status, and
  focused file reads were used instead. No broad rewrite or cleanup was done.

## Existing architecture findings

### Draft synthesis

`apps/web/server/services/verticalDramaPresetSynthesis.ts` provides the
transient `synthesizeVerticalDramaPreset` and V2 variant. They load the
`vertical-drama-preset-synthesizer` skill, validate a strict draft schema,
normalize roles, add structural diagnostics, clamp fields, and charge the
synthesis call. The router validates preset ownership before calling it, and
the client applies the returned draft explicitly.

The new QC layer must sit after synthesis and before `applyPresetDraft`/Next.
It must not modify the synthesis charge path or make the existing synthesis
response incompatible.

### Existing asynchronous job precedent

`apps/web/server/services/verticalDramaStoryJobs.ts` stores owner-scoped JSON
records in Redis, submits BullMQ jobs, polls status, serializes progress writes,
and dynamically imports router executors to avoid a circular dependency. It
uses a series pointer for one active story job per series. That pointer is not
appropriate before create because no series exists. The QC job therefore uses a
separate session/owner pointer and a separate queue/worker executor.

BullMQ's official guidance supports worker retry/backoff for thrown failures and
stalled-job redelivery; the implementation will keep model/schema failures as
explicit terminal records and use bounded attempts for infrastructure recovery.

### Credits

`creditService.ts` already exposes `createCreditReservation`,
`drawFromReservation`, `refundReservation`, and `commitCreditReservation`.
These helpers deduct the reservation upfront and refund unused credits. QC will
reserve only its own estimated budget, draw actual model-call usage, and refund
unused budget. Existing synthesis remains separately charged.

### Story identity and downstream handoff

The dirty worktree already contains additive `draftStoryContext` and
`draftStoryDesign` contracts and corresponding wizard/skill handoff. QC must
evaluate the same draft without turning score recommendations into story facts.
The selected best draft is passed downstream; the QC report is an audit/gate
field only.

### Current UI gap

`CreateSeriesWizard.tsx` currently gates Apply/Next on a current synthesis,
title selection, structural diagnostics, and explicit Apply. It has no quality
score, progress, credit estimate, or loop state. A separate panel is safer than
expanding the already large wizard, with a small integration at the existing
draft gate and mutation boundaries.

## Safety decisions

1. Keep all new fields additive and optional.
2. Validate candidate fingerprints and receipt ownership server-side.
3. Treat explicit user facts as immutable revision constraints.
4. Compute score and pass status on the server from bounded model output.
5. Keep an explicit override separate from automatic pass and expose the reason.
6. Avoid schema/database migration by storing final audit data in existing
   `bible` JSONB and transient pre-create state in Redis with TTL.
