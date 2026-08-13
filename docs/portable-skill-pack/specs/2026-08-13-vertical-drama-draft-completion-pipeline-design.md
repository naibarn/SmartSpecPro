# Vertical Drama Draft Completion Pipeline

**Status:** Approved for implementation
**Date:** 2026-08-13
**Scope:** Create-Series Wizard draft generation before Draft Quality QC

## Decision

The Create-Series Wizard must never send a structurally incomplete draft to Draft
Quality QC. Any omitted creative input is permission for the LLM to make a
coherent creative decision. The final transient draft must contain all required
story identity, architecture, design/control, cast, locations, visual, title,
and premise fields before QC starts.

`needs_creator_decision` remains valid only as an internal input ambiguity marker
while a job is running. It is not valid in the terminal `ready_for_qc` draft.
Every AI choice is marked `source: ai_inferred` with a short `rationale`; user
provided facts remain authoritative and are never overwritten.

## Why the current flow fails

The existing synchronous `synthesizeGenrePreset` path can spend the whole proxy
budget inside one or more LLM calls. A successful response can also parse while
`storyContext`, `storyDesign`, or `storyContract` is absent because those fields
are currently additive/optional for legacy callers. The wizard then reaches QC
with a warning or a blocking architecture diagnostic, which is too late: QC is
intended to judge quality, not manufacture the story foundation.

## Chosen architecture

Use a transient, owner-scoped Redis/BullMQ composition job. Keep the existing
synchronous mutation for backward compatibility and non-wizard callers, but the
Create-Series Wizard uses the new submit/status/cancel procedures.

```text
submitDraftComposition
        |
        v
foundation: storyContext + storyContract
        |
        v
compose: title options + premise + cast + locations + visual bible
        |
        v
complete: storyDesign + storyControlSeed + missing/invalid sections
        |
        v
validate: deterministic contract, IDs, windows, cross-section coherence
        |                    \
        |                     -> targeted LLM repair, maximum 2 rounds
        v
ready_for_qc
        |
        v
existing Draft Quality QC
        |
        v
explicit Apply draft
```

The job returns immediately with a `jobId`; polling uses the same owner and
session scoping pattern as the existing pre-create Draft QC jobs. A job record is
TTL-bounded, deduplicated by request fingerprint, and released on every terminal
state. Queue admission is fail-fast so the wizard never polls an orphaned job.

## Contracts

Add a strict `WizardCompleteDraftSchema` at the composition terminal boundary.
Do not weaken the existing `SynthesizedGenrePresetDraft` schema because old
callers and stored legacy drafts remain supported. The strict boundary requires:

- non-empty title and 4–5 distinct title options, with the recommended title in
  the candidate set;
- non-empty category, logline, main plot, season arc, tone, cliffhanger style,
  visual bible, and creator-readable premise summary;
- 2–8 canonical characters with stable names, roles, descriptions, occupation,
  narrative role, and role tier;
- 3–12 named locations with descriptions;
- complete `storyContext` where every required fact has a value and source;
- complete `storyContract` accepted by the story-architecture evaluator;
- complete `storyDesign` with primary engine, bounded pressure threads, early
  payoff, romance progression, advantage beats, conflict guardrails, and valid
  story-control seed;
- diagnostics containing no `blocking`, `error`, or unresolved `missing` item;
- no dangling character, thread, arc, payoff, or episode-window references.

The terminal result includes a `draftCompletenessReport` with stage, repair
round, missing paths, contradiction paths, and a stable draft fingerprint. This
is diagnostic metadata only; the draft itself is the source sent to QC.

## LLM stages

1. **Foundation.** Resolve user constraints, lineage, selected preset flavor,
   language, market, setting, and story identity. Generate a complete story
   architecture contract in the same call. User facts win. Language and market
   never imply nationality, ethnicity, or origin.
2. **Composer.** Write the readable draft from the approved foundation. Return
   title choices, plot, cast, locations, visual bible, and all normal wizard
   fields. Do not copy a preset verbatim.
3. **Completer/repairer.** Receive the current draft plus deterministic missing
   and contradiction paths. Fill or repair only those paths while preserving
   user facts, the foundation contract, canonical names, and IDs. Run at most two
   repair rounds. A repair failure is terminal and retryable from the wizard.

The default path uses one foundation call, one composer call, and zero to two
targeted repair calls. It does not generate multiple full candidates by default;
that cost is unnecessary because Draft QC already evaluates and optionally
revises the best draft.

## Job states and UI behavior

The public states are:

`queued`, `building_foundation`, `composing`, `completing`, `validating`,
`ready_for_qc`, `failed`, `cancelled`.

The wizard shows progress and keeps Generate/Apply/QC actions disabled until the
job is `ready_for_qc`. Draft QC can only start from that state. A stale source
signature cancels the usable state and requires a new composition job. Refresh
and late responses cannot overwrite a newer request because the client matches
both job id and source signature.

## Failure and operational rules

- User input is copied into the job payload only after size-bounded validation.
- Redis records are owner-scoped and TTL-bounded; no incomplete draft is
  persisted to the series database.
- Queue failure marks the job failed immediately and permits retry.
- Provider/credit failure preserves the user's form and exposes a retryable
  error; no partial draft is accepted.
- Completion uses deterministic validation before QC, so QC never becomes a
  workaround for missing structure.
- Existing QC credit accounting, receipt fingerprinting, and final create gate
  remain authoritative after completion.

## Verification and rollout

Tests cover strict schema acceptance/rejection, missing-fact completion,
architecture/design repair, cross-reference validation, owner isolation,
dedupe/cancel/queue failure, worker registration, router wiring, and wizard
state transitions. Focused Vitest suites are the primary signal; repository-wide
typecheck noise is reported separately if unrelated baseline diagnostics remain.

No database migration is required. The first rollout can be enabled for the
Create-Series Wizard by using the new procedures directly; legacy synthesis
callers remain unchanged until separately migrated.
