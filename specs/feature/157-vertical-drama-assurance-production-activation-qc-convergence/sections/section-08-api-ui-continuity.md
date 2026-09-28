# Section 08 — Additive API Projection and Non-Blocking UI Continuity

## Outcome and implementation boundary

This section makes the durable assurance work from Sections 01–07 usable from
the existing Vertical Drama routers and creator surfaces. It does not create a
new workflow, route, status store, lifecycle authority, QC algorithm, credit
owner, provider owner, or database table. It exposes one additive browser-safe
projection, maps typed failures to Thai/English actions, and makes refresh,
reconnect, retry, repair, cancel, and reconciliation behavior consistent across
the existing Draft, story, prompt, and episode surfaces.

Completion means:

- every upgraded status/read/mutation response retains its current fields and
  adds the same optional `assurance` envelope;
- the server remains authoritative for `state`, `nextAction`, readiness, and
  capability booleans; clients do not infer permission from raw status or
  error text when the envelope exists;
- legacy responses with no assurance envelope continue to render and behave as
  they do before Feature 157;
- a transient query/network failure does not clear a known run ID, reset a
  running job to idle, start duplicate work, or hide the last durable result;
- queued/running/degraded/stale/reconciliation states never lock editing,
  saving, inspection, history, source editing, prompt preview, or navigation;
- only the unsafe transition itself—candidate activation, paid provider work,
  assembly, export, or publish—is disabled when readiness is insufficient;
- known API failures produce stable Thai/English copy and one safe next action,
  while unknown failures show generic safe copy plus the existing trace ID;
- modal and page presentations remain usable at the canonical responsive
  matrix, with no clipped actions, hidden overflow, inaccessible dialogs, or
  unbounded spinner;
- focused router/component tests and authenticated browser evidence prove the
  contract without claiming provider, deployment, migration, or production
  evidence that was not run.

Section 04 owns the Draft QC recovery/CAS fix and its minimum panel wiring.
Section 08 consumes that result and completes cross-surface API, copy, polling,
responsive, and accessibility convergence. It must not reimplement Section
04's resolver or allow a UI fallback to override its capabilities. Section 07
may already have wired prompt/media adapter results by the time this section is
implemented; Section 08 presents those additive results but does not change
their deterministic gates or provider calls.

## Dependencies and ownership rules

Implement after Sections 01, 02, 04, and 05. In the execution order from
`sections/index.md`, Section 07 should also be present before browser proof is
collected, but Draft UI continuity does not depend on enabling a Section 07
adapter.

Consume these upstream contracts rather than redeclaring them:

- `apps/web/shared/verticalDramaSeries/assurance.ts`:
  `AssuranceUiProjection`, its schema, state/disposition/readiness/error/action
  enums, and `buildAssuranceUiProjection`;
- `apps/web/server/services/verticalDramaAssuranceRepository.ts` and
  `verticalDramaAssuranceReconciliation.ts`: durable projection/event replay,
  liveness, and reconciliation facts;
- the Section 04 authoritative Draft resolver, named
  `resolveCurrentVerticalDramaDraftQualityQcResult` unless implementation uses
  the equivalent final symbol;
- `verticalDramaDraftLedger.ts`: Draft content, candidate lineage, receipt,
  and active-version CAS;
- Section 05 production-context admission and findings;
- Section 07 adapter results for story, prompt, frame, video, B-roll, assembly,
  and season paths.

Authority is split as follows:

| Boundary | Sole authority | UI/API rule |
| --- | --- | --- |
| attempt state, events, lease, stale/reconciliation | durable assurance repository/reconciler | router projects; browser never transitions state locally |
| Draft result/currentness/repair/CAS | Section 04 resolver plus Draft QC/ledger services | panel renders server capabilities; no browser repair inference when `assurance` exists |
| source/profile/readiness/findings | Section 05 production-context service | browser may edit the target but cannot upgrade evidence/readiness |
| story/prompt/media validation | existing domain services plus Sections 06–07 adapters | existing surfaces stay in place; projection is additive |
| credit/provider side effects | Section 03 billing/final-gate owners | UI confirms spending and disables duplicate paid retry during reconciliation |
| response and typed error projection | `verticalDramaSeries`/`verticalDramaEpisodes` routers plus the API projection helper below | legacy fields remain present |
| presentation and localization | current Vertical Drama components plus the pure copy presenter below | no raw exception is the only visible outcome |

## Current repository evidence and contradictions to fix

The implementation starts by preserving working behavior and writing tests for
these observed seams:

1. `apps/web/shared/verticalDramaSeries/draftQualityQc.ts` currently exposes
   only `queued | running | succeeded | failed | cancelled` through
   `DraftQualityQcJobStatus`, while Feature 157 needs recovered, awaiting,
   stale, retryable, fatal, and reconciliation states. Keep the legacy enum;
   expose the richer state under the additive assurance envelope.
2. `apps/web/server/routers/verticalDramaSeries.ts` independently builds the
   output of `getDraftQualityQcStatus` and `getDraftWorkspaceStatus`. Both must
   call the same projection helper so status, workspace restore, repair
   admission, and refresh cannot disagree.
3. `repairDraftQualityQc` currently throws English raw-message preconditions.
   Preserve tRPC transport codes, but add a whitelisted structured assurance
   error payload and stop requiring clients to parse `error.message`.
4. `cancelDraftQualityQc` currently returns only `{ ok: true }`. Add the
   resulting projection so a post-submit uncertainty can return
   `reconciliation_required` instead of appearing fully cancelled.
5. `CreateSeriesWizard.tsx` currently maps a query error to `idle`, clears the
   run ID when any status error occurs, polls only legacy queued/running values,
   and uses raw mutation messages in toasts. A network interruption must retain
   the run identity and last known projection; only an authoritative
   not-found/stale response may retire it.
6. `CreateSeriesWizard.tsx` obtains `repairDraftQualityQc` through an optional
   `as any` compatibility seam. Keep that guard for one dual-deploy window, but
   add typed use after router/client generation is synchronized and test both
   old/new clients.
7. `VerticalDramaDraftQualityQcPanel.tsx` calculates `canRepair` from status,
   recovered booleans, report, and repair plan. That remains the legacy fallback
   only. When `assurance` exists, its `canRepair`, `canRetry`, `canCancel`, and
   `nextAction` win.
8. `VerticalDramaStoryGenerationAssurancePanel.tsx` maintains its own status
   copy/action inference and polls every four seconds whenever `runId` exists,
   including terminal runs. Map `StoryGenerationRunSummary` server-side to the
   common projection and stop polling terminal states.
9. `VerticalDramaDraftQualityQcPanel.tsx` and
   `VerticalDramaStoryGenerationAssurancePanel.tsx` have separate inline
   bilingual dictionaries. Extract common assurance state/action/error copy to
   one pure Vertical Drama copy module while preserving existing Draft-specific
   explanatory text.
10. The current Draft panel already has credit confirmation, history,
    candidate selection, warning acceptance, semantic tokens, report
    normalization, and reduced-motion spinner classes. Reuse these; do not
    redesign or replace the six-step wizard.

## Exact file and symbol plan

### Shared contract use

Extend `apps/web/shared/verticalDramaSeries/assurance.ts` only if prior sections
have not already added the API error wrapper types. Preserve the existing
state/action enum and add no client-only permission enum. Required exports for
this section are:

- `AssuranceUiProjectionSchema` / `AssuranceUiProjection`;
- `VerticalDramaAssuranceErrorCodeSchema` / type, extended by Sections 04, 05,
  and 07 with their domain codes;
- `VerticalDramaAssuranceApiErrorSchema` / type, a browser-safe error payload;
- `VerticalDramaAssuranceTimingSchema` / type for liveness fields that are not
  part of the capability projection.

The API error type contains fields only, with no raw exception or domain
content:

```ts
type VerticalDramaAssuranceApiError = {
  schemaVersion: 1;
  surface: "vertical_drama_assurance";
  errorCode: VerticalDramaAssuranceErrorCode;
  userMessageKey: string;
  nextAction: AssuranceUiProjection["nextAction"];
  projection: AssuranceUiProjection | null;
};

type VerticalDramaAssuranceTiming = {
  startedAt: string | null;
  heartbeatAt: string | null;
  expiresAt: string | null;
  eventCursor: number | null;
};
```

Do not add story text, prompt text, report evidence, signed/provider URLs,
storage paths, credit identifiers, lease/fence tokens, or cross-tenant IDs to
the error payload. The existing tRPC `data.traceId` remains the support
correlation field.

### Server API projection helper

Create
`apps/web/server/services/verticalDramaAssuranceApiProjection.ts` with pure,
focused exports:

- `withVerticalDramaAssuranceProjection<TLegacy>(legacy, projection, timing)`
  — returns the legacy payload unchanged plus `assurance` and
  `assuranceTiming`;
- `buildVerticalDramaAssuranceApiError(errorCode, projection)` — validates a
  stable code/message key/action and returns only the public error shape;
- `createVerticalDramaAssuranceTrpcError({ trpcCode, errorCode, projection })`
  — places the validated public payload in `TRPCError.cause` while preserving
  existing tRPC status semantics;
- `mapStoryGenerationSummaryToAssuranceProjection(summary)` — maps Feature 152
  status to the Section 01 state/action contract without changing the stored
  story status;
- `readLegacyVerticalDramaProjection(...)` only as a temporary compatibility
  adapter when `assurance` is absent; it must be deterministic and must never
  enable an action the old response cannot prove.

Use one nested envelope to avoid collisions with existing top-level `status`,
`result`, and `error` fields:

```ts
type VerticalDramaAssuranceApiEnvelope<TLegacy> = TLegacy & {
  assurance?: AssuranceUiProjection | null;
  assuranceTiming?: VerticalDramaAssuranceTiming | null;
};
```

Compatibility semantics are exact:

- field absent: old server or intentionally unupgraded route; new client uses
  the conservative legacy adapter;
- `assurance: null`: upgraded server proves there is no admitted attempt for
  this optional surface;
- `assurance: object`: canonical state/action/capability truth;
- unknown additive fields: ignored by old clients and tolerated by new clients;
- no response carries two independently computed assurance projections.

### tRPC error formatter

Update `apps/web/server/_core/trpc.ts` narrowly. Its existing
`errorFormatter` already exposes only a trace ID and validated retry-after
seconds. Add one schema-checked branch that parses
`error.cause` with `VerticalDramaAssuranceApiErrorSchema` and, only on success,
sets `shape.data.verticalDramaAssurance`. Invalid/arbitrary cause values are
not forwarded. Preserve database-message sanitization, existing trace IDs,
HTTP/tRPC codes, and retry-after behavior.

Add
`apps/web/server/_core/__tests__/trpc.verticalDramaAssuranceError.test.ts` to
prove valid payload exposure, invalid-cause rejection, trace preservation, and
no raw details. Do not generalize this into an unrestricted `cause` pass-through.

### Existing routers and procedures

Modify `apps/web/server/routers/verticalDramaSeries.ts` additively:

| Existing procedure | Required response/action contract |
| --- | --- |
| `getDraftQualityQcEstimate` | retain model/call/credit fields; add evaluate-only policy metadata only if already supplied upstream; no attempt projection is fabricated |
| `startDraftQualityQc` | retain run/candidate/completeness fields; return admitted attempt projection and timing; duplicate idempotency returns the same attempt |
| `repairDraftQualityQc` | retain legacy `runId` + fingerprint input; accept additive exact-result/idempotency fields; return projection or structured typed precondition error |
| `getDraftQualityQcStatus` | retain status/progress/result/history/error/failure/run/request fingerprint; append projection from the authoritative Section 04 resolver |
| `getDraftWorkspaceStatus` | retain composition/QC shape; use the same resolver and place the identical QC projection under `qc.assurance`; refresh remains read-only |
| `selectDraftQualityQcCandidate` | retain exact run/version/stage/fingerprint checks; return selection facts plus projection; selection does not activate |
| `cancelDraftQualityQc` | remain idempotent; return `{ ok: true, assurance, assuranceTiming }`; uncertain paid outcome projects reconciliation, not a false clean cancellation |
| `getStoryGenerationRun` | retain `StoryGenerationRunSummary`; add common projection/timing derived server-side |
| `resumeStoryGeneration`, `repairStoryGeneration`, `approveStoryGenerationRepair`, `rejectStoryGenerationRepair`, `cancelStoryGeneration` | keep procedure names and current fields; use projection capabilities for admission and return updated projection |

Do not add duplicate `getProjection`, `retry`, or `reconcile` public endpoints
merely to match logical names from the spec. A retry remains the existing start
or resume mutation with a new bounded attempt and caller idempotency key. A
reconcile action is normally a read/status refresh or operator-owned reconciler;
it must not become a browser button that resubmits a paid provider task.

When Section 07 has added assurance to existing
`apps/web/server/routers/verticalDramaEpisodes.ts` procedures, preserve their
names and append the same envelope. The minimum browser-visible set is
`generateShotStartFramePrompt`, `generateShotReferenceFramePrompt`,
`generateShotVideoPrompt`, `getActiveShotVideoPromptJobs`, `bindShotBroll`, and
`assembleEpisodeVideo`. Section 08 changes only response/error projection and
presentation for these routes; it does not alter prompt composition, media
generation, B-roll validation, charging, or final-gate behavior.

### Client copy and error presenter

Create
`apps/web/client/src/components/verticalDramaSeries/verticalDramaAssuranceCopy.ts`
as a browser-only pure module. Export:

- `VerticalDramaAssuranceLocale` (`"th" | "en"`);
- `VERTICAL_DRAMA_ASSURANCE_STATE_COPY`;
- `VERTICAL_DRAMA_ASSURANCE_ACTION_COPY`;
- `VERTICAL_DRAMA_ASSURANCE_ERROR_COPY`;
- `getVerticalDramaAssuranceStateCopy`;
- `getVerticalDramaAssuranceActionCopy`;
- `presentVerticalDramaAssuranceError(error, lang)`.

Use compile-time `satisfies` coverage against the shared state/action/error
unions so a newly registered code fails tests/TypeScript until both Thai and
English copy exist. `presentVerticalDramaAssuranceError` reads
`error.data.verticalDramaAssurance`, uses the stable `userMessageKey`/code,
returns a generic localized network/system fallback when absent, and carries
`traceId` separately for support. It never makes repair/retry permission from
the exception and never displays raw `TRPCClientError`, SQL, provider response,
or model output as the only message.

Keep Draft-specific score/report/repair-plan text in
`VerticalDramaDraftQualityQcPanel.tsx`. Replace only duplicated common state,
action, and error strings. Reuse `VerticalDramaLang`/`pickCopy` conventions
from `verticalDramaCopy.ts`; do not add a third app-wide i18n runtime.

### Existing components and pages

Modify these existing surfaces sequentially; do not run parallel writers on
the same file:

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
  — query/mutation orchestration, durable run identity, optional envelope
  parsing, idempotency intent, refresh/reconnect, and prop threading;
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx`
  — state/action presentation, confirmations, live status, report/history, and
  legacy fallback;
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryGenerationAssurancePanel.tsx`
  — common projection, terminal-aware polling, typed actions/errors, and
  restrained status announcements;
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
  — keep the existing story assurance panel placement/run ID and thread any
  new projection only if the parent already owns it;
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` and
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  — consume Section 07 projection on enabled prompt/media paths, preserve
  existing editor/preview/status surfaces, and avoid a second polling store.

Do not change route paths, the six Create-Series step IDs, candidate receipt
semantics, `presentation="modal" | "page"`, source-signature invalidation,
history loading, source-pack recovery, prompt model selection, or existing
preview/edit/confirm behavior.

## API state, error, and action contract

### Canonical state mapping

If `assurance` exists, it is the only lifecycle/action truth. Legacy fields are
display/history compatibility only.

| Existing source | Canonical projection |
| --- | --- |
| Draft `queued` / `running` | same canonical state; editable/inspectable, cancel only if server allows |
| Draft `failed` + exact `recoveredFromFailure` evidence | `recovered` / `recovered_needs_repair` |
| Draft stale Redis/worker record with durable current source | `stale` or `retryable_failed` according to reconciler evidence, never local `idle` |
| story `validating` / `repairing` | canonical `running` with phase preserved in timing/progress |
| story `awaiting_approval` / `needs_repair` | `awaiting_action`; repair/approval capability is server-derived |
| story `partial` | `awaiting_action` with inspect/resume or repair action; never success |
| story `awaiting_reconciliation` | `reconciliation_required` |
| known transient provider/runtime failure without accepted candidate | `retryable_failed` |
| persistence/ownership/contract corruption | `fatal_failed` |

The browser may continue to render top-level `status` for old data, but must
not reinterpret a canonical `recovered` result as succeeded or let a legacy
`failed` label hide it.

### Stable error-to-action matrix

Sections 04, 05, and 07 extend the shared error union. At minimum the UI copy
map and router tests cover:

| Stable code | Safe message intent | Action |
| --- | --- | --- |
| `qc_result_missing` | no current completed scorecard; Draft preserved | `run_qc` |
| `qc_result_not_current` | result is history-only after a newer edit | `inspect` or fresh `run_qc` from returned projection |
| `qc_source_version_mismatch` | source changed; no repair against old version | `edit`/fresh `run_qc` |
| `qc_source_fingerprint_mismatch` | exact Draft does not match receipt | `run_qc` |
| `qc_contract_version_mismatch` | result must be reevaluated under current contract | `run_qc` |
| `qc_repair_already_running` | existing repair is still active | `inspect`/`cancel` when allowed |
| `VD_ASSURANCE_CONTEXT_MISSING` | current production context must be recaptured | `edit` |
| `VD_ASSURANCE_CONTEXT_STALE` | affected downstream result is stale | `retry` from fresh context |
| `VD_ASSURANCE_SOURCE_NOT_READY` | source/evidence/rights step needs attention | `edit` |
| `VD_ASSURANCE_CAPABILITY_UNAVAILABLE` | advisory work may continue; unsafe boundary waits | `retry` or `inspect` from projection |
| provider/credit uncertainty code from Section 03 | outcome is being reconciled; no resubmit/refund | `reconcile` |
| cancellation/fence conflict | old attempt cannot publish | `retry` as a new attempt when server allows |

HTTP/tRPC codes remain compatible (`BAD_REQUEST`, `CONFLICT`,
`PRECONDITION_FAILED`, `NOT_FOUND`, etc.). The stable assurance code is the
product contract. The UI does not branch on translated/raw message text.

### Retry, repair, cancel, and refresh idempotency

- One explicit user intent receives one client idempotency key scoped to
  action, attempt, source/context fingerprint, and candidate when applicable.
  React rerender, transport retry, double click, refocus, or reconnect reuses
  that key; an explicit later Retry creates a new intent key.
- Start, repair, resume, and any credit-consuming retry retain the existing
  confirmation before mutation. Closing the dialog performs no mutation.
- While a mutation is pending, disable only duplicate submission of that
  action. Editing, save, navigation, history, and inspection remain available.
- Cancel uses server `canCancel`. Cancellation before side effect ends safely;
  possible provider acceptance produces reconciliation and blocks duplicate
  paid retry.
- Query refetch, window focus, browser reconnect, tab restoration, and
  `getDraftWorkspaceStatus` are read-only. They never call start/repair/resume.
- Keep the last successful projection as placeholder data during a transient
  refetch failure. Show an offline/refresh notice without pretending the run
  became idle or terminal.
- Stop normal polling in terminal states. Poll queued/running at the existing
  bounded cadence; poll reconciliation at a slower bounded cadence until
  `expiresAt`/operator policy, then show an explicit waiting action rather than
  spinning forever.

### No-blocking-guardrail rule

Guardrails are enforced at the risky transition, not by disabling the entire
workspace:

- source/QC/Agent warnings never disable ordinary editing, save, navigation,
  history, or non-paid preview;
- a stale context disables repair/paid generation against that stale artifact,
  but the source and candidate remain visible and editable;
- reconciliation disables resubmit/refund/export, but inspection and editing
  remain available;
- advisory Draft QC below 9.0 retains the existing explicit warning acceptance
  and “Use this Draft and continue” path when deterministic Draft readiness and
  receipt checks pass;
- blocking findings name the affected field/source/claim/media target when safe
  and pair the disabled transition with visible explanatory text and one
  repair/edit/retry action;
- no optional Agent/runtime outage becomes a full-page “system unavailable”
  lock. The browser presents the server's legacy/degraded mode and waits only
  at the unsafe final boundary.

## UI/UX Contract

### Target User / JTBD

- Role: authenticated Vertical Drama creator/editor in the current
  Create-Series, story, episode, or storyboard workspace.
- Goal: understand whether work is active, recovered, waiting, stale,
  retryable, cancelled, or reconciling and take the next safe action without
  losing edits or creating duplicate paid work.
- Entry points: `/drama-series`, existing Create-Series modal/page wizard,
  series deep-story panel, episode page, and storyboard/prompt job surfaces.
- Success outcome: the creator always has an honest state, preserved content,
  and reachable next action; only an unsafe transition is blocked.

### Existing Pattern Reference

- Searched with targeted `rg` because SocratiCode was unavailable:
  `DraftQualityQc`, `StoryGenerationAssurancePanel`, `aria-live`,
  `refetchInterval`, `recoveredFromFailure`, `awaiting_reconciliation`,
  Create-Series sizing, and existing Playwright route mocks.
- Found patterns:
  `VerticalDramaDraftQualityQcPanel.tsx` for report/history/confirmation,
  `VerticalDramaProductionWizard.tsx` for one-primary-action semantics,
  mobile accordion and reduced motion,
  `VerticalDramaStoryboardReviewPanel.tsx` for semantic loading/error/empty
  states, and `marketplace-hyperframes-ui.spec.ts` for authenticated app-route
  tRPC interception and browser evidence.
- Decision: reuse. Keep the existing panels/routes and apply the common
  projection/copy contract. Do not introduce a new dashboard, route, global
  drawer, or second status store.
- Divergence: the existing story panel's unconditional polling and the Draft
  wizard's query-error-to-idle behavior must change because they violate
  durable recovery and can cause duplicate work.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Create-Series modal/page | `CreateSeriesWizard.tsx`, `/drama-series` | retain six steps and editable Draft; consume optional projection and durable restore |
| Draft QC panel | `VerticalDramaDraftQualityQcPanel.tsx` | render canonical states/actions, typed copy, legacy fallback, confirmation/history |
| Draft API/status | `verticalDramaSeries.ts` Draft procedures | additive envelope and typed error data |
| Story assurance panel | `VerticalDramaStoryGenerationAssurancePanel.tsx` | common projection, terminal-aware polling, safe action buttons |
| Deep-story host | `VerticalDramaDeepStoryDraftsPanel.tsx` | preserve placement/run identity and panel ownership |
| Episode prompt/media | `VerticalDramaEpisodePage.tsx`, existing episode routes | present Section 07 state at prompt/paid boundaries without hiding editors |
| Storyboard job status | `VerticalDramaStoryboardPanel.tsx` | reuse existing job state; show stale/retry/reconciliation actions |
| Browser evidence | `apps/web/tests/e2e/vertical-drama-assurance-continuity.spec.ts` | authenticated real-route state and responsive matrix |

### Component Map

| Component/helper | File | Owns | Consumes |
| --- | --- | --- | --- |
| API envelope helper | `verticalDramaAssuranceApiProjection.ts` | shape merge, story mapping, public error payload | shared projection + durable facts |
| tRPC formatter | `server/_core/trpc.ts` | whitelist of structured public cause | validated API error schema |
| assurance copy presenter | `verticalDramaAssuranceCopy.ts` | Thai/English state/action/error copy and safe fallback | stable code/action unions + trace ID |
| `CreateSeriesWizard` | existing file | query/mutation intent, durable run ID, refresh, candidate receipt | legacy payload + optional assurance envelope |
| `VerticalDramaDraftQualityQcPanel` | existing file | visual state/report/actions/dialogs | projection capabilities + legacy props |
| `VerticalDramaStoryGenerationAssurancePanel` | existing file | story run presentation/actions | projected story summary |
| episode/storyboard surfaces | existing files | local editors/previews/status placement | Section 07 envelope; no lifecycle authority |

Do not dispatch separate frontend/UI writers against the same file in
parallel. Implement behavior first, then perform a later visual/accessibility
review wave on the same files.

### State Matrix

| State | Expected UI | Allowed actions | Verification |
| --- | --- | --- | --- |
| loading/restoring | retain editable content and last projection; bounded “restoring status” indicator | edit/save/inspect/navigation; no auto-start | refresh and offline fixtures |
| empty/no attempt | existing empty copy; no fabricated failure or repair | edit/save/run QC/preview/continue where domain gate permits | legacy and upgraded-null fixtures |
| queued | phase/queue copy, cancel if allowed, no duplicate start | edit/save/inspect/cancel/continue advisory Draft | component + reconnect tests |
| running | restrained progress, last report/history preserved | edit/save/inspect/cancel; no repair/retry/paid continuation | mutation and browser tests |
| succeeded/verified | verified/readiness label and explicit continue | inspect/continue; versioned repair only if server enables | final-gate fixture |
| recovered | warning, exact baseline/report/history, never success styling | inspect/repair/retry/continue advisory Draft according to server/domain gate | immutable-mutation regression |
| awaiting action | finding target and concrete edit/repair/approval/retry instruction | only capability-authorized action; editing stays open | source/contract fixtures |
| retryable failed | transient explanation and explicit Retry; last valid artifact remains | edit/save/inspect/retry | runtime/provider/network fixtures |
| stale | stale artifact remains comparison-only; explain fresh source requirement | edit/inspect/fresh retry; no stale repair/paid submit | source-edit race fixture |
| reconciliation required | provider/credit result pending; no false cancelled/success | edit/save/inspect; no paid retry/refund/export | provider uncertainty fixture |
| fatal failed | safe terminal incident copy with trace ID | edit/save/inspect/operator path; no auto retry | persistence failure fixture |
| cancelled | explicit terminal state; no spinner | edit/save/inspect/new explicit run | idempotent cancel fixture |
| partial success/story resumable | incomplete work and checkpoint are visible; never “passed” | resume or repair only when projection enables | story panel fixture |
| disabled/hover/focus/selected | one primary action; disabled reason stays visible; candidate selection distinct from activation | keyboard/touch behavior unchanged | jsdom + browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | modal/page content uses one column; actions stack/wrap; primary action and dialog footer remain reachable; long Thai/English copy wraps | required screenshot + interaction |
| tablet 768x1024 | wizard stepper wraps without horizontal page overflow; QC/history grids remain readable; status and actions do not overlap | required screenshot |
| laptop 1024x768 | multi-panel/page presentation fits the existing shell; status/history and modal footer are not clipped | extended screenshot because breakpoint risk is high |
| desktop 1440x900 | existing density/hierarchy and side-by-side summary/actions remain stable | required screenshot |
| small-mobile 360x800 | long message key/trace/action copy uses `overflow-wrap:anywhere`; touch controls and details summaries remain reachable | extended screenshot + overflow measurement |
| wide-desktop 1280x800 | page-mode wizard does not inherit modal viewport width and no panel creates body-level horizontal scroll | extended screenshot |

Retain `CreateSeriesWizard`'s current `presentation="page"` parent containment,
`min-w-0`, and inline-size strategy. Fix the structural child that overflows;
do not hide body scrollbars, clip report/evidence text, truncate user data, or
set a modal-only fixed width on page mode.

### Accessibility Acceptance

- Keyboard path: logical order reaches status details, Start/Cancel/Inspect/
  Repair/Retry/Approve/Continue, candidate versions, and confirmation controls.
- Focus visibility: existing focus rings remain visible. Opening a confirmation
  moves focus into the dialog; cancel/complete returns focus to the invoking
  button. A state change never jumps focus to the top of the wizard.
- Labels/semantics: top-level async state uses `role="status"` with
  `aria-live="polite"`; terminal errors use `role="alert"` once. Progress has
  `role="progressbar"`, numeric values, and localized `aria-valuetext`.
- Announcement restraint: announce state/phase transitions, not every poll,
  heartbeat, call count, or repeated identical response. Use `aria-busy` on
  the affected status region rather than the whole editable workspace.
- Disabled actions: pair native disabled controls with always-visible text
  identified by `aria-describedby`; do not rely on an inaccessible hover-only
  tooltip.
- Names/semantics: icon-only controls have localized accessible names; icons
  are decorative; candidate selection and active/confirmed state are conveyed
  by text and `aria-current`/`aria-pressed` where appropriate.
- Contrast: state is text + icon + semantic surface, never color alone. Reuse
  existing foreground/background/destructive/amber/emerald tokens with light
  and dark evidence.
- Reduced motion: spinners use `motion-reduce:animate-none`; progress width
  transitions use `motion-reduce:transition-none`; no information depends on
  animation.

### Visual Direction and Design Token Extraction

Sources:

- `VerticalDramaDraftQualityQcPanel.tsx`
- `CreateSeriesWizard.tsx`
- `VerticalDramaProductionWizard.tsx`
- `VerticalDramaStoryboardReviewPanel.tsx`
- existing shadcn Button/AlertDialog/Badge/Select primitives and product
  semantic Tailwind tokens.

Token summary:

- Color: semantic `background`, `foreground`, `muted`, `primary`,
  `destructive`, and existing warning/success dark-mode mappings.
- Typography: current wizard heading/body/label/caption scale; no new font.
- Spacing: current panel/card/grid gaps and responsive wizard padding.
- Radius/elevation: existing rounded panel/dialog/card borders and shadows.
- Motion: existing restrained spinner/progress transitions with reduced-motion
  alternatives.
- Components: existing shadcn/Radix primitives; use Astryx discovery before
  adding any new UI primitive, but do not replace working components solely for
  this feature.
- Density: balanced operational density; report/history remain information-rich
  and collapsible rather than truncated.

Do not change raw brand colors, introduce a second design system, hide
overflow, or replace complete report content with a vague badge.

Before implementation changes visual structure, run from the repository root:

`npm run astryx -- build "Vertical Drama asynchronous assurance status recovery actions"`

Then inspect every proposed Astryx component with
`npm run astryx -- component <Name>`. Existing components and semantic tokens
remain the default; no new dependency is needed.

### Copy Contract

- Tone: calm, concise, factual, and action-oriented. Always say whether the
  Draft/artifact is preserved and what can be done next.
- Primary languages: Thai and English with parity. The active `lang` chooses
  copy; unsupported/missing locale falls back to English, never an empty label.
- Required action labels: Start QC/เริ่มตรวจ QC, Inspect/ตรวจสอบผล,
  Repair/ซ่อม, Retry/ลองใหม่, Cancel/ยกเลิก, Reconcile/กำลังตรวจสอบผล,
  Continue/ดำเนินการต่อ, and use-current-Draft wording already present.
- Distinguish quality from infrastructure: “QC found issues” is not “the
  service failed”; “recovered” is not “passed”; “reconciling” is not
  “cancelled”.
- Known error copy is keyed by stable code/message key and includes the next
  action. Unknown copy is generic and shows the trace ID in a support line.
- Never show only raw `TRPCClientError`, internal stack/SQL/storage/provider
  text, signed URL, prompt/story content, or opaque code with no explanation.
- Preserve current credit confirmation, advisory threshold, warning acceptance,
  current/previous/recovered result labels, and “Use this Draft and continue”.

### Browser Evidence Required

Create `apps/web/tests/e2e/vertical-drama-assurance-continuity.spec.ts` using
the existing authenticated real-app route interception pattern from
`marketplace-hyperframes-ui.spec.ts`; a standalone static HTML fixture is not
sufficient release evidence. Open the actual `/drama-series` route and wizard
modal/page, mock tRPC with tenant-owned fixtures, and log mutation calls.

Record evidence in
`specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence/implementation/ui-browser-evidence.md`
and stable screenshots under
`artifacts/ui/vertical-drama-assurance/<state>-<viewport>-after.png` (or the
actual Playwright output path, recorded in the evidence file).

At minimum prove:

1. queued/running allows editing and continuing the advisory Draft while
   showing cancel;
2. current recovered result offers confirmed repair and starts exactly one
   mutation;
3. stale typed error preserves history and offers fresh QC, not stale repair;
4. reconciliation preserves editing and disables paid retry/export;
5. refresh/reconnect restores the same attempt without a start/repair mutation;
6. legacy response with no `assurance` still renders current behavior;
7. Thai and English state/action/error copy exists;
8. keyboard order, dialog focus return, accessible names, live-region restraint,
   reduced motion, light/dark readability, console cleanliness, and no body
   horizontal overflow pass at the required/extended viewport matrix.

Skipped browser checks are recorded as skipped with reason and residual risk;
they are never reported as pass.

## TDD-first implementation sequence

Write each failing test before its production change. Keep critical lifecycle
decisions in server/shared tests; component tests prove presentation and
interaction, not domain authority.

### 1. Shared envelope, error, and copy tests

Extend
`apps/web/shared/verticalDramaSeries/__tests__/verticalDramaAssurance.test.ts`
and create
`apps/web/client/src/components/verticalDramaSeries/__tests__/verticalDramaAssuranceCopy.test.ts`:

- envelope/timing/error schemas accept only the public fields above;
- every registered assurance state/action/error has Thai and English copy;
- missing Thai falls back to English; unknown errors produce generic safe copy;
- structured error presentation retains trace ID but strips raw message/cause;
- recovered, stale, retryable, fatal, cancelled, and reconciliation labels are
  semantically distinct;
- adding a new error code without copy fails the parity test.

### 2. API projection and tRPC formatter tests

Create
`apps/web/server/services/__tests__/verticalDramaAssuranceApiProjection.test.ts`
and the `_core` formatter test named above:

- adding an envelope leaves legacy payload fields byte-equivalent;
- absent/null/object envelope semantics are distinct;
- Draft status and workspace projection from the same durable facts are deeply
  equal except route-specific wrappers;
- story status mapping covers every `STORY_GENERATION_STATUSES` member;
- unknown story status fails closed rather than becoming succeeded;
- only schema-valid Vertical Drama assurance causes reach tRPC error data;
- trace/retry-after/database sanitization behavior remains unchanged.

### 3. Router contract tests

Create focused files rather than extending an unrelated giant router suite:

- `apps/web/server/routers/__tests__/verticalDramaSeries.draftQualityQcAssuranceProjection.test.ts`;
- `apps/web/server/routers/__tests__/verticalDramaSeries.storyAssuranceProjection.test.ts`;
- add Section 07 episode-route projection cases to its focused router test or
  `apps/web/server/routers/__tests__/verticalDramaEpisodes.assuranceProjection.test.ts`.

Prove:

- all listed reads/mutations retain old fields and return one projection;
- status/workspace/repair resolve the same recovered candidate;
- duplicate start/repair/resume input returns one attempt and no duplicate
  model/credit/provider side effect;
- each typed repair error exposes stable code/message key/action/trace data;
- cancel returns cancelled or reconciliation according to durable call facts;
- cross-tenant run/candidate/error lookup fails closed without leaking whether
  the object exists;
- old mutation input without additive fields works only when the server can
  prove all missing facts;
- response reads and browser refresh never enqueue work.

### 4. Draft panel and wizard interaction tests

Extend:

- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaDraftQualityQcPanel.test.tsx`;
- `apps/web/client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx`;
- `CreateSeriesWizard.lineage.test.tsx` only for existing lineage/recovery
  boundaries.

Add cases for every state in the matrix. In particular:

- `assurance` capabilities override contradictory legacy booleans;
- absent envelope retains all existing status/history/confirmation behavior;
- transient query error retains run ID, last result, editor, and retry-status
  action instead of resetting to idle;
- authoritative stale/not-found projection retires only the invalid active
  pointer and preserves durable history;
- refresh/reconnect issues no start/repair mutation;
- double click/transport retry reuses one idempotency intent;
- recovered repair and all paid retries require confirmation;
- reconciliation has no paid retry button;
- disabled reasons are visible and associated with controls;
- state announcements are not repeated for identical polling payloads;
- focus returns after AlertDialog close and long Thai/English content wraps.

### 5. Story, episode, and storyboard tests

Extend/create:

- `VerticalDramaStoryGenerationAssurancePanel.test.tsx`;
- relevant `VerticalDramaEpisodePage.*.test.ts` / `.test.tsx` focused files;
- relevant `VerticalDramaStoryboardPanel.*.test.tsx` files from Section 07.

Prove terminal-aware polling, partial/approval/repair/reconciliation mappings,
server-authorized actions, no duplicate resume/repair, editor availability, and
provider-ready boundary disablement. Do not convert a legacy fallback pass into
evidence that the Agent-active path passed.

### 6. Responsive/accessibility browser proof

Add the Playwright test last, after stable server/client contracts. Use real
app components with intercepted tenant-owned tRPC responses and mutation logs.
Run axe where the existing browser harness supports it, plus explicit keyboard,
focus, overflow, console, reduced-motion, and action-reachability assertions.

## Migration, flags, rollout, and rollback

### Database migration

Section 08 adds no database migration, index, backfill, queue, or durable table.
It consumes the additive nullable/versioned persistence from Section 02. If an
implementation attempt needs new durable lifecycle data to render a state,
stop and return that requirement to Section 02 rather than storing it in local
storage, Redis-only UI metadata, or a new UI-owned table.

The API/client migration is additive:

1. deploy schemas/projection helpers and readers that tolerate absent fields;
2. deploy router responses with old fields plus optional envelope;
3. deploy client code that prefers the envelope and falls back conservatively;
4. keep legacy fields populated through Draft/story/prompt canary and rollback
   windows;
5. remove no legacy field in Feature 157.

### Feature flags

Add no UI-only Feature 157 flag. The UI always understands absent, null, and
present projection forms. Underlying behavior remains controlled by upstream
flags: `verticalDramaAssuranceShadow`,
`verticalDramaDraftQcOrchestraActive`,
`verticalDramaPromptQcOrchestraActive`, the final Section 01 story-assurance
flag name, and `verticalDramaAssuranceKillSwitch`.

The kill switch changes runtime selection to the safe deterministic/legacy
path but does not hide state, clear evidence, reset the UI, or disable editing.
Shadow state is visibly identified and never enables a paid/export boundary.

### Rollout

1. Land shared/API/copy tests and the additive router envelope with all active
   adapter flags off.
2. Deploy client legacy fallback plus envelope preference; verify old-server/
   new-client and new-server/old-client combinations.
3. Run Draft QC shadow and compare old/new status, actions, errors, timing, and
   mutation counts with no extra user-funded model call.
4. Enable Draft QC canary for explicit tenants/series only after the recovered
   repair regression, refresh/reconnect, and authenticated browser matrix pass.
5. Enable prompt/media/story projections as their upstream adapters enter
   canary; projection display does not itself enable those adapters.
6. Promote only when no raw-error-only state, dead action, duplicate mutation,
   body overflow, focus failure, or infinite spinner exists in the canary
   evidence.

### Rollback

- Set the upstream task-family active flag off or the assurance kill switch on;
  keep additive responses and accepted durable evidence.
- If the client presentation regresses, roll back the client bundle; the server
  continues returning old fields and the prior client ignores additive data.
- Do not roll back the Section 02 schema destructively, delete attempts/events,
  clear Redis broadly, revert creator edits, fabricate cancellation, refund
  without ledger evidence, or resubmit uncertain provider tasks.
- Reconciliation state survives rollback and remains inspectable until the
  existing provider/credit owner resolves it.

## Concrete verification commands

Run from `/home/dev/projects/SmartSpecPro` unless stated otherwise.

Shared/server/router proof:

```bash
npm --workspace apps/web test -- \
  shared/verticalDramaSeries/__tests__/verticalDramaAssurance.test.ts \
  server/services/__tests__/verticalDramaAssuranceApiProjection.test.ts \
  server/_core/__tests__/trpc.verticalDramaAssuranceError.test.ts \
  server/routers/__tests__/verticalDramaSeries.draftQualityQcAssuranceProjection.test.ts \
  server/routers/__tests__/verticalDramaSeries.storyAssuranceProjection.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.assuranceProjection.test.ts
```

Browser-facing Vitest with jsdom:

```bash
npm --workspace apps/web test -- --environment jsdom \
  client/src/components/verticalDramaSeries/__tests__/verticalDramaAssuranceCopy.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaDraftQualityQcPanel.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.lineage.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryGenerationAssurancePanel.test.tsx
```

Run the exact Section 07 episode/storyboard focused tests added by that section
in the same jsdom environment. Do not substitute a broad Vertical Drama suite
whose baseline failures obscure the changed surface.

UI-contract and browser proof:

```bash
uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-ui-contracts.py \
  --planning-dir /home/dev/projects/SmartSpecPro/specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence

npm --workspace apps/web exec -- playwright test \
  tests/e2e/vertical-drama-assurance-continuity.spec.ts \
  --project=chromium
```

For authenticated live-route evidence against an existing staging/dev server,
set `PLAYWRIGHT_USE_EXISTING_SERVER=1` and an explicit
`PLAYWRIGHT_BASE_URL`; record the URL class/environment without recording
credentials or tokens.

Diagnostics and diff hygiene:

```bash
npm --workspace apps/web run check
git diff --check -- \
  apps/web/shared/verticalDramaSeries/assurance.ts \
  apps/web/server/services/verticalDramaAssuranceApiProjection.ts \
  apps/web/server/_core/trpc.ts \
  apps/web/server/routers/verticalDramaSeries.ts \
  apps/web/server/routers/verticalDramaEpisodes.ts \
  apps/web/client/src/components/verticalDramaSeries/verticalDramaAssuranceCopy.ts \
  apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx \
  apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx \
  apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryGenerationAssurancePanel.tsx \
  apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx \
  apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx \
  apps/web/client/src/pages/VerticalDramaEpisodePage.tsx \
  apps/web/tests/e2e/vertical-drama-assurance-continuity.spec.ts
```

Report broad `npm --workspace apps/web run check` failures separately if they
remain baseline-noisy or resource-constrained. Focused Vitest/jsdom evidence is
not browser proof; intercepted browser proof is not live provider/deployment
proof; neither proves migrations or production canary.

## Acceptance criteria

- [ ] Every upgraded route returns its legacy fields unchanged plus at most one
      optional assurance envelope and timing object.
- [ ] Status, workspace restore, repair admission, and refresh project the same
      durable Draft result and action.
- [ ] Known failures expose stable code/message key/action and the existing
      trace ID through a schema-whitelisted tRPC error field.
- [ ] No arbitrary `TRPCError.cause`, raw provider/model/SQL/storage detail, or
      private content reaches the browser projection.
- [ ] New clients render old responses; old clients ignore new fields; legacy
      status/result/history/receipt/route contracts remain tested.
- [ ] Transient network/refetch failure retains run identity, last result,
      editable content, and a safe status retry; it never resets to idle or
      auto-starts work.
- [ ] Queued/running/recovered/awaiting/retryable/stale/reconciliation/fatal/
      cancelled/succeeded/partial/empty states each have Thai and English copy
      and only server-authorized actions.
- [ ] Start/repair/paid retry confirmations remain explicit; duplicate clicks,
      transport retry, focus, and reconnect cannot duplicate a mutation,
      charge, or provider task.
- [ ] Advisory QC/runtime findings do not block edit/save/inspect/navigation/
      preview; only the unsafe transition is gated and its reason is visible.
- [ ] Recovered is not shown as verified success; reconciliation is not shown
      as cancelled; partial story output is not shown as completed.
- [ ] Terminal runs stop normal polling; active/reconciliation polling is
      bounded; no infinite spinner remains after lease/expiry policy.
- [ ] Focus order/return, labels, alerts/live regions, progress semantics,
      disabled reasons, contrast, and reduced motion meet the accessibility
      contract.
- [ ] Modal and page wizard presentations pass 390x844, 768x1024, 1440x900 and
      the risk viewports 360x800, 1024x768, 1280x800 with no body horizontal
      overflow, clipped primary action, or truncated user data.
- [ ] Focused shared/server/router/jsdom tests, UI-contract checker, browser
      evidence, and `git diff --check` pass or are reported honestly with exact
      skipped boundaries.
- [ ] No database migration, new dependency, new route/navigation model,
      duplicate status store, provider authority, credit path, or unrelated
      dirty-worktree edit is introduced by this section.

## Safe commit and handoff boundary

Commit only the additive shared API/error schema if required, API projection
helper, narrow tRPC formatter whitelist, existing router response wiring,
copy/presenter module, listed existing UI surfaces, focused tests, and browser
evidence owned by this section. Do not include Section 02 migrations, Section
03 credit/provider logic, Section 04 QC algorithm/CAS changes, Section 05
source admission logic, Section 06 runtime internals, or Section 07 prompt/media
validators unless a dependent section has already landed them and this section
changes only their browser projection.

Section 09 consumes the final error codes, timing, metrics dimensions, flags,
and rollback behavior for operations/runbook work. Section 10 consumes the
focused tests and authenticated evidence and must keep browser, provider,
deployment, migration, and production-canary claims separate.
