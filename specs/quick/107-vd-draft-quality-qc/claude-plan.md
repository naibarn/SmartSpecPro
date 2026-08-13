# Implementation plan: Vertical Drama Draft Quality QC

## 1. Scope and compatibility boundary

Implement an additive QC layer between transient preset synthesis and draft
application. Do not modify the existing synthesis response shape or charge
semantics except to expose an optional server-issued QC run id at the new
integration boundary. Existing series reads and downstream story-bible paths
must ignore the field when absent.

The source of truth is the best candidate plus its server-computed QC report.
The report is an audit/gate, never a creative prompt. Only the best candidate is
handed to Story Bible generation after create.

## 2. Shared contracts and deterministic score engine

Create `apps/web/shared/verticalDramaSeries/draftQualityQc.ts` with Zod schemas,
types, constants, and pure functions:

- rubric criterion ids and exact weights totaling 10;
- raw score range 0–5 and weighted-score calculation;
- `overallScore` rounded to two decimals by the server;
- status `passed`, `strong`, `needs_work`, or `blocked`;
- critical-fail codes and structural gate evaluation;
- candidate fingerprint input/output contract;
- QC run/request/receipt/status contracts and bounded round choices;
- credit estimate contract;
- best-candidate comparator that prefers higher score, then fewer critical
  failures, then earlier round for deterministic ties.

The score engine accepts only normalized judge criteria and explicit draft facts.
It must clamp/reject invalid model scores, reject duplicate/missing criteria,
and never accept a model-supplied total. It should expose a readable breakdown
for the UI and tests.

Export from the existing shared barrel only if that barrel's current conventions
allow it; otherwise import the new module directly to avoid unrelated barrel
churn.

## 3. Skill-first controller

Add `apps/web/skills/vertical-drama-draft-quality-controller/` with paired
`SKILL.md`/`skill.md`, manifest, evaluate/revise prompt references, and strict
input/output schemas.

Evaluate mode receives the complete transient draft, narrative UI locale,
target market/setting, spoken-language profile, audience, target episode count,
story context/design, user premise, and immutable constraints. It returns one
criterion result per rubric id, evidence, critical fails, strengths,
weaknesses, and recommendations. It does not rewrite.

Revise mode receives the current best draft and the judge feedback. It returns a
complete replacement draft plus changed-field summary. It must preserve the
explicit premise and identity constraints, keep the same title-language and
dialogue-language contract, and avoid adding uncontrolled subplots. Separate
system prompts and schema validation prevent accidentally calling the judge as
a writer or vice versa.

Add skill-content regression tests for paired copies, required markers, exact
criterion ids/weights, evaluate-vs-revise mode separation, and preservation
language.

## 4. QC service and durable pre-create job

Add a focused server service, preferably
`apps/web/server/services/verticalDramaDraftQualityQc.ts`, responsible for:

- validating a bounded candidate payload and owner/session identity;
- estimating the maximum credit budget as baseline plus two model calls per
  improvement round, with a visible conservative margin;
- creating/holding a credit reservation;
- executing evaluate and revise calls through the existing JSON planning helper
  with the new skill schemas;
- drawing actual credits per completed call and refunding unused reservation;
- normalizing model feedback and calling the shared score engine;
- retaining the best candidate and recording discarded rounds;
- early stopping on pass or two consecutive non-improvements;
- cancellation/failure cleanup and no duplicate charge.

Add a separate Redis/BullMQ job module for pre-create QC. Its record must carry
`draftSessionId`, tenant/user owner, request fingerprint, status, progress,
best candidate/report, history, credit estimate/actual, reservation id (never
exposed to the browser), and timestamps. Use a session pointer rather than
`seriesId`. Job payload/result size must be bounded; sensitive prompt text and
provider responses must not be logged. TTL and owner checks must be enforced on
every status read.

Wire queue init/close into the existing server bootstrap exactly once, with a
lazy dynamic executor import and bounded retry/backoff. Preserve the existing
story-job queue untouched. If Redis/BullMQ is unavailable, return a clear
actionable error rather than silently claiming QC passed.

## 5. Router contract and create receipt

Add tRPC procedures under `verticalDramaSeries`:

- `startDraftQualityQc`: accepts current synthesis draft, immutable source
  context, session id, and selected max rounds; validates limits and creates or
  dedupes the owner-scoped job.
- `getDraftQualityQcStatus`: owner-scoped poll returning status/progress/report,
  history summaries, credit estimate/actual, and a short error; never returns
  reservation internals.
- `cancelDraftQualityQc`: owner-scoped cancellation with refund/cleanup.

Extend `createSeriesInput` additively with an optional QC receipt/run id. Before
insert, validate the receipt against the authoritative Redis record and the
candidate fingerprint. Require automatic pass, or an exhausted-rounds
override with no critical fail and an explicit override marker. Store only a
bounded sanitized `bible.draftQualityQc` audit object alongside all existing
bible keys. Never trust client score, report, or candidate as proof.

Keep the current create flow, lineage handling, duration profile, look-lock
stamping, character/location seeding, and post-create Story Bible trigger
unchanged apart from adding the validated audit and selected QC candidate.

## 6. Wizard UI/UX contract

Create `VerticalDramaDraftQualityQcPanel.tsx` and integrate it at the existing
draft review/apply area. Use existing project primitives and semantic tokens.
The visual direction is enterprise-calm/technical-precision: a clear status
header, score ring or progress bar with numeric text, compact criterion rows,
and an expandable round history. Do not make color the only status signal.

### User/job to be done

The creator needs to know whether the draft is structurally strong enough to
commit to a full season before spending downstream generation credits.

### State matrix

| State | Required UI |
| --- | --- |
| idle/no QC | explain purpose, threshold, estimate, round selector, Start QC |
| queued/running | live status, phase, round/call progress, disabled Apply/Next, cancel |
| passed | 9.0/10 badge + text, breakdown, best round, Apply enabled |
| strong/not passed | score and reasons, regenerate/continue options, Apply disabled |
| failed | actionable error, retry, no false success, no stale pass |
| exhausted | best score/history, explicit override warning if eligible |
| stale draft | invalidate old result and require a new QC run |
| focused/disabled | keyboard focus rings and disabled labels/tooltips |

### Responsive matrix

| Viewport | Behavior |
| --- | --- |
| mobile | single-column panel, stacked score/breakdown, sticky bottom action |
| tablet | score header plus two-column breakdown where space permits |
| laptop/desktop | panel beside or above draft content without hiding the primary CTA |

### Accessibility and copy

All controls have labels; live progress uses an accessible status region; score
has text and `aria-label`; focus is visible; contrast is sufficient; reduced
motion is respected. Thai and English copy must cover labels, helper text,
loading, errors, pass, strong-but-blocked, exhausted/override, and credit
warnings. The estimate must say that the maximum is not necessarily consumed.

### Browser evidence

Run an authenticated browser pass if a session is available: start QC, observe
queued/running, complete with a mocked or safe test result, verify score rows,
attempt Apply before/after pass, change source to make result stale, and verify
mobile layout. If no browser session exists, record that evidence was skipped;
focused component tests remain mandatory.

## 7. Test-first plan

Write tests before implementation for shared score math/gates, loop best-candidate
selection/early stop, skill content contracts, credit reservation paths,
owner-scoped job status and cancellation, router receipt validation, create
backward compatibility, and wizard state gating. Add a focused integration test
that proves the best candidate handed to create is the same candidate shown by
the QC report.

## 8. Rollout and risk controls

Feature-flag new QC for newly synthesized drafts if a tenant flag already exists;
otherwise enable only when the new run is explicitly started. Old drafts and
manual/basic create paths remain valid. Fail closed on missing/invalid QC data
for the new gate, but do not reject legacy persisted bibles. Use idempotent
session/request fingerprints and refund on every terminal non-success path.

## 9. Verification

Run focused Vitest files for shared QC, server QC service/job/router, skill
content, and CreateSeriesWizard/panel; run `git diff --check`; run filtered
TypeScript diagnostics for changed files. Separate any repository-wide baseline
diagnostics and do not reformat unrelated dirty files.
