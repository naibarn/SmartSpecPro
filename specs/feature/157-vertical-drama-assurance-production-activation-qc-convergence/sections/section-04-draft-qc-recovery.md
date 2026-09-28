# Section 04 — Draft QC Recovery, Repair Admission, and CAS Activation

## Purpose and completion boundary

This section closes the production failure in which Draft QC has a complete,
durable baseline scorecard, a later improvement attempt violates an immutable
contract, and the browser can display the recovered candidate but the repair
mutation still rejects it with `Draft QC repair requires a completed, current
QC result`.

The implementation must make the recovered baseline one authoritative,
tenant-scoped result across service, worker, ledger, router, and browser reads.
It must preserve the existing advisory Draft QC workflow and legacy response
shape while adding durable assurance state, typed next actions, exact repair
admission, and candidate-versus-active compare-and-set (CAS). A repair may
create and evaluate a new candidate, but it may not silently activate it,
overwrite a newer creator edit, duplicate a paid model call, or discard the
source candidate.

Completion means all of the following are true:

- a complete baseline is durably linked before the first improvement call;
- a failed post-baseline revision projects as `recovered`, not as an ordinary
  unusable failure, when current ownership/version/fingerprint evidence exists;
- the same authoritative resolver drives status, workspace restore, repair
  admission, candidate selection, and receipt confirmation;
- current recovered evidence can start one explicitly confirmed repair without
  the observed precondition error;
- missing, historical, stale, mismatched, or concurrently repaired evidence
  fails with a stable code and next action;
- every repaired output is freshly evaluated and reaches final gate/CAS before
  activation or confirmation eligibility;
- refresh, Redis expiry, worker restart, cancellation, and duplicate delivery
  reconstruct one safe projection without another charge or infinite spinner;
- all legacy fields, routes, wizard steps, save/edit/preview behavior, and
  below-threshold advisory confirmation remain compatible during rollout.

## Dependencies and ownership boundaries

Implement this section after Sections 01–03. It consumes their versioned
assurance request/result vocabulary, durable attempt/event repository,
lease/fence operations, billing call identity, and deterministic final-gate
policy. If those sections use different concrete symbol names after the
required persistence inventory, adapt the imports but preserve the semantics
specified here.

The authority split is non-negotiable:

- `verticalDramaDraftQualityQc.ts` owns Draft evaluation, bounded revision,
  immutable/mutable validation, additive merge, completeness/story-control
  validation, fresh re-evaluation, and candidate comparison.
- `verticalDramaDraftQualityQcJobs.ts` owns queue admission, progress,
  cancellation, worker execution, Redis compatibility, recovery, and public
  Draft QC projection.
- `verticalDramaDraftLedger.ts` owns immutable Draft snapshots and the
  candidate/active-version CAS. Assurance persistence stores attempt state and
  references; it must not become a second Draft-content ledger.
- `verticalDramaSeries.ts` owns tenant-scoped tRPC admission and compatibility
  projection. The router must not infer currentness from a browser boolean or
  from Redis alone.
- `CreateSeriesWizard.tsx` and
  `VerticalDramaDraftQualityQcPanel.tsx` render server capabilities and next
  actions. They must not reconstruct lifecycle state from raw tRPC status or
  error text.
- The existing credit reservation/draw/refund owner remains authoritative for
  Draft QC calls. The Agent Runtime, if enabled later, may report usage but may
  not charge again.

Draft QC remains advisory for authoring. Score below 9.0 and non-passing
advisory findings do not block editing or explicit confirmation. Deterministic
completeness, ownership, immutable identity, source-currentness, candidate
fingerprint, final-gate, CAS, credit, and downstream paid/export gates remain
hard boundaries.

## Exact current contract inventory

### Shared Draft QC contract

Preserve and extend `apps/web/shared/verticalDramaSeries/draftQualityQc.ts`.
The current public surface includes:

- `DRAFT_QC_PASS_THRESHOLD`,
  `DRAFT_QC_MAX_IMPROVEMENT_ROUNDS`,
  `DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS`,
  `DRAFT_QC_ROUND_OPTIONS`,
  `DRAFT_QC_MAX_CHANGED_FIELDS`,
  `DRAFT_QC_IMMUTABLE_PRESERVED_PATHS`, and
  `DRAFT_QC_MUTABLE_STORY_DESIGN_KEYS`;
- `draftQualityQcReportSchema`, `DraftQualityQcReport`,
  `draftQualityQcHistoryEntrySchema`, `DraftQualityQcHistoryEntry`,
  `draftQualityQcFailureSchema`, `DraftQualityQcFailure`,
  `draftQualityQcRoundBudgetSchema`,
  `draftQualityQcCreditEstimateSchema`,
  `DraftQualityQcCreditEstimate`, `DraftQualityQcResultSnapshot`,
  `draftQualityQcJobStatusSchema`, `DraftQualityQcJobStatus`,
  `draftQualityQcProgressSchema`, `DraftQualityQcProgress`,
  `draftQualityQcReceiptSchema`, and `DraftQualityQcReceipt`;
- `buildDraftQualityQcRepairPlan`,
  `normalizeDraftQualityQcRoundBudget`,
  `estimateDraftQualityQcCredits`, and
  `fingerprintDraftQualityQcCandidate`.

Legacy status is currently limited to `queued`, `running`, `succeeded`,
`failed`, and `cancelled`. `DraftQualityQcResultSnapshot` already carries the
compatibility fields `best`, `history`, `creditEstimate`, `stopReason`,
`roundsAttempted`, `evaluationsCompleted`, `model`, optional
`draftArtifactId`, optional `runId`, optional `recoveredFromFailure`, and
optional `recoveryMessage`. History entries may omit `candidateVersion`,
`candidateFingerprint`, and `report` for legacy records. Reports may omit the
additive `evaluationWarnings` field at runtime and are normalized by the UI.

Section 01's assurance projection must be added alongside this shape. Do not
remove or repurpose the legacy fields in this section. New clients consume
`state`, `disposition`, `readiness`, `attemptId`, source/current references,
`nextAction`, capability booleans, `errorCode`, and `userMessageKey`; old
clients continue to receive the current status/result/error/failure fields.

### Draft QC service

Preserve these current symbols in
`apps/web/server/services/verticalDramaDraftQualityQc.ts`:

- `DraftQualityQcDraft`, `DraftQualityQcImmutableConstraints`,
  `DraftQualityQcLoopInput`, `DraftQualityQcProgressEvent`,
  `DraftQualityQcCandidateResult`, `DraftQualityQcLoopResult`,
  `DraftQualityQcRepairInput`, and `DraftQualityQcDependencies`;
- `VerticalDramaDraftQualityQcError`, whose `failure` retains completed
  history, `lastReport`, call counts, round counts, phase, and credit estimate;
- `recoverDraftQualityQcRevisionOutput`, which may recover only omitted
  audit-only `changedFields`, never a missing Draft or scorecard;
- `mergeDraftRevisionPreservingFields` and the existing immutable,
  `storyDesign`, completeness, and story-control checks;
- `runVerticalDramaDraftQualityQc` and
  `runVerticalDramaDraftQualityQcRepair`.

The current standard run evaluates and persists a `qc-baseline`, then may
persist scored `qc-revision` versions and a `qc-final` snapshot. The default
round budget is two; zero is a deliberate evaluate-only option. The explicit
repair performs one revise plus one fresh evaluate, uses additive merge,
protects immutable fields, checks completeness/story control, persists a new
`qc-revision` with `parentVersion`, and retains both source and repaired
history entries. Preserve these properties.

### Job, recovery, and projection service

Preserve these current symbols in
`apps/web/server/services/verticalDramaDraftQualityQcJobs.ts`:

- `VERTICAL_DRAMA_DRAFT_QC_QUEUE`, `DRAFT_QC_STALE_AFTER_MS`,
  `VerticalDramaDraftQualityQcOwner`,
  `VerticalDramaDraftQualityQcPayload`,
  `VerticalDramaDraftQualityQcPublicResult`,
  `VerticalDramaDraftQualityQcRecord`, and
  `DraftQualityQcReconciliation`;
- `enqueueVerticalDramaDraftQualityQc`,
  `getVerticalDramaDraftQualityQcStatus`,
  `getVerticalDramaDraftQualityQcStatusBySession`,
  `getVerticalDramaDraftQualityQcRunIdBySession`, and
  `clearVerticalDramaDraftQualityQcPointer`;
- `recoverVerticalDramaDraftQualityQcResultFromFailure`,
  `recoverVerticalDramaDraftQualityQcResultByRunId`, and
  `recoverVerticalDramaDraftQualityQcHistory`;
- `reconcileVerticalDramaDraftQualityQc`,
  `cancelVerticalDramaDraftQualityQc`, and
  `runVerticalDramaDraftQualityQcJob`.

The current Redis record and active pointer have a one-hour TTL. The current
worker stores a recovered result in the failed Redis record when recovery
succeeds, and also attempts to append a durable `qc-final` recovery snapshot.
Status and workspace reads can reconstruct a result from `failure` or durable
snapshots. This section must converge those branches into one resolver and one
durable projection; Redis remains a progress cache, not repair authority.

### Draft ledger and current CAS gap

Preserve `VerticalDramaDraftLedgerStage`, `VerticalDramaDraftJobStatus`,
`VerticalDramaDraftLedgerOwner`, `AppendVerticalDramaDraftVersionInput`,
`VerticalDramaDraftVersionRef`, `VerticalDramaDraftJobPatch`,
`ensureVerticalDramaDraftJob`, `updateVerticalDramaDraftJob`,
`appendVerticalDramaDraftVersion`, `getVerticalDramaDraftLedger`,
`getVerticalDramaDraftLedgerBySession`,
`getVerticalDramaDraftLedgerByQcRunId`,
`getVerticalDramaDraftQcSnapshotsByRunId`,
`getVerticalDramaDraftQcSnapshotsByDraftId`,
`getVerticalDramaDraftVersion`, and
`listVerticalDramaDraftVersionSummaries` in
`apps/web/server/services/verticalDramaDraftLedger.ts`.

`appendVerticalDramaDraftVersion` currently locks the ledger, allocates an
immutable next version, writes JSON/Markdown storage, inserts the version, and
advances `currentVersion`. That protects sequence allocation but is not a
domain activation CAS: a late QC/repair snapshot can still advance the current
pointer after a newer creator edit. Section 02 must provide, and this section
must consume, an expected-active-version operation that atomically compares
tenant/user/draft, expected active version, expected source fingerprint,
candidate version/fingerprint, and worker fence token. A CAS loss retains the
candidate and report as stale evidence and never overwrites the newer Draft.

### Existing router procedures

Preserve the existing procedures in
`apps/web/server/routers/verticalDramaSeries.ts` and evolve their schemas
additively:

| Procedure | Current role | Required evolution |
| --- | --- | --- |
| `getDraftQualityQcEstimate` | returns model and estimated calls/credits for the selected round budget | keep old fields; identify evaluate-only zero and configured normal policy without silently changing the user's selection |
| `startDraftQualityQc` | repairs pre-QC completeness, snapshots immutable constraints, and enqueues QC | admit/get one durable attempt keyed to exact source and policy; return additive projection/trace fields |
| `repairDraftQualityQc` | accepts `runId` and `candidateFingerprint`, reloads report/version, and enqueues one repair | resolve the authoritative current result first; accept additive exact-result/source/contract/policy/idempotency metadata while retaining the two legacy inputs during migration |
| `getDraftQualityQcStatus` | reconciles one run and returns status/progress/result/history/error/failure | return the durable compatibility projection; lazy `includeHistory` remains supported |
| `getDraftWorkspaceStatus` | restores composition and QC by draft session | use the same authoritative resolver as status and repair; refresh is read-only and never admits work |
| `selectDraftQualityQcCandidate` | validates run, draft version, stage, and fingerprint before returning content | retain exact checks; selection remains explicit and does not activate automatically |
| `cancelDraftQualityQc` | idempotently cancels/fences an active run | append durable cancellation; if a paid call may have completed, reconcile rather than refund/retry blindly |

The existing create path consumes `draftQualityQcReceipt` plus
`draftQualityQcCandidate` and independently validates run, candidate
fingerprint, ledger evidence, and candidate content. Preserve this confirmation
path. Do not introduce a second “confirm” endpoint merely to rename it.

### Existing UI compatibility

`CreateSeriesWizard.tsx` currently calls all six Draft QC procedures above,
polls `getDraftQualityQcStatus` only while queued/running, restores through
`getDraftWorkspaceStatus`, stores source signatures, retains
`draftQcPreviousResult`, distinguishes `draftQcRecoveredFromFailure`, supports
history selection, requires a matching candidate fingerprint, and invalidates
QC state when relevant Draft fields change. Its repair procedure is currently
accessed through an optional `as any` compatibility seam, so rollout must not
assume every generated client knows the new mutation on the first deploy.

`VerticalDramaDraftQualityQcPanel.tsx` currently accepts `status`, `progress`,
`report`, `previousResult`, `recoveredResult`, `history`, `estimate`,
`maxRounds`, `error`, `failure`, selection/confirmation props, and start,
repair, cancel, override, and candidate-selection callbacks. It already:

- normalizes legacy reports missing `evaluationWarnings`;
- fails closed on an incomplete core scorecard without fabricating a score;
- shows queued/running progress and permits cancellation/continuation;
- shows recovered and historical results separately;
- offers repair only for a non-passing current or recovered result with a safe
  deterministic repair plan;
- confirms credit-consuming start/repair actions;
- keeps explicit candidate confirmation and warning acceptance.

Retain all of this behavior. New projection fields replace local inference
incrementally; they do not remove legacy props until a later compatibility
cleanup after canary evidence.

## Observed regression and authoritative root cause

The regression fixture is:

1. baseline evaluation succeeds and its complete report, candidate version,
   and candidate fingerprint are durable;
2. an improvement response changes immutable `storyContract`;
3. `runVerticalDramaDraftQualityQc` correctly throws
   `VerticalDramaDraftQualityQcError` while retaining baseline history;
4. job/status recovery can reconstruct the baseline and the UI can present it
   as recovered;
5. `repairDraftQualityQc` independently reads the Redis record and admits
   repair only when `record.result` is present and either the record is
   `succeeded` or `record.result.recoveredFromFailure === true`;
6. when the durable recovery exists only through status/workspace
   reconstruction, Redis expiry, or a failed recovery finalization write,
   `record.result` remains null and repair returns the generic conflict even
   though exact current evidence exists.

The root cause is therefore not the immutable check. That check is correct.
It is a split-authority/currentness bug: status projection, workspace restore,
and repair admission do not resolve the same durable result. A browser boolean
can reveal the mismatch but cannot safely fix it. The repair route must resolve
and validate current durable evidence server-side before admission.

## Target recovery and projection contract

Add one server-owned resolver in the Draft QC job/domain boundary, with a name
such as `resolveCurrentVerticalDramaDraftQualityQcResult`. The concrete name
may follow Section 02's repository conventions, but all callers must share it.
Its input is tenant/user plus run or draft/session scope; its output contains:

- the legacy record/result/history fields when available;
- durable execution/attempt ID, public assurance state, disposition,
  readiness, progress phase, next action, capability booleans, error code, and
  user-message key;
- exact draft ID/session ID, source version/fingerprint, result version,
  candidate version/fingerprint, contract version, policy hash, and context
  fingerprint;
- recovery provenance (`live_record`, `failure_history`, `durable_snapshot`,
  or `legacy_projection`) and the accepted/recovered artifact reference;
- lease/fence and active-version facts required by final gate, never exposed as
  mutation authority to the browser.

Resolution order must be deterministic:

1. tenant-scope every lookup and reject missing identity;
2. read the durable attempt/event projection and exact Draft ledger references;
3. merge live Redis progress only when run/owner/attempt/fence match;
4. accept a recovered candidate only when a complete report, immutable ledger
   version, run relation, source fingerprint, candidate fingerprint, contract
   version, and current source/active-version relation all match;
5. map legacy `status: failed` plus
   `result.recoveredFromFailure: true` to public `state: recovered` and
   `disposition: recovered_needs_repair`;
6. if recovery is exact but no longer current, retain it as inspectable history
   and return `awaiting_action`/`refresh`, never `canRepair: true`;
7. never recover from browser state, a score alone, an unmatched history row,
   a provider URL, or an ownerless/ambiguous legacy record.

Persist baseline completion and its durable reference before issuing the first
revision call. Append a baseline-completed event only after the report and
candidate artifact are durable. If later revision/evaluation/finalization
fails, append rejection/failure and recovery events in one repeat-safe
transition. A replay after Redis loss must yield the same state and action.

Use these outcome mappings:

| Evidence/outcome | Public state and disposition | Capabilities/next action |
| --- | --- | --- |
| current baseline or repaired candidate passes all hard gates and CAS | `succeeded` / `verified` | inspect, continue; explicit future repair remains versioned |
| later attempt fails but exact current baseline is recoverable | `recovered` / `recovered_needs_repair` | edit, inspect, repair, retry; never paid/export-ready |
| complete baseline remains below hard QC after bounded attempts | `awaiting_action` / `recovered_needs_repair` | inspect and repair/retry as allowed; advisory confirmation remains separately available |
| no complete baseline before safe transient failure | `retryable_failed` | retry from the current source |
| exact result exists but source/active/context changed | `awaiting_action` or `stale` | refresh or run QC from fresh source; inspect old evidence |
| ledger cannot prove ownership/content | `fatal_failed` | inspect/operator action; no repair/activation |
| cancellation or lease loss | `cancelled` or `stale` | new run from current source; old worker fenced |

## Repair admission and execution

### Admission preconditions

`repairDraftQualityQc` must call the shared resolver before any reservation,
queue write, or model call. The server, not the client, re-derives current
source/active/context fingerprints and validates:

- authenticated tenant/user owns the attempt, draft, session, version, and
  candidate artifact;
- public state is `succeeded` or `recovered`, disposition permits repair, and
  no equivalent repair attempt is queued/running;
- result version, source version/fingerprint, candidate version/fingerprint,
  contract/output version, policy hash, and context fingerprint match the
  current durable facts;
- the report is schema-complete, non-passing, and has a safe repair plan with
  at least one `autoRunnable` action;
- target paths remain disjoint from preserved paths; mandatory protections for
  `storyContext`, `storyContract`, visual identity, and server-owned
  `storyDesign` controls remain additive;
- the caller's idempotency key admits or returns exactly one repair attempt.

Legacy callers may send only `runId` and `candidateFingerprint` during the
dual-read period. The server fills the additive metadata only when it can prove
it from durable state. It must not guess missing currentness or fabricate a
contract/policy version.

### Stable repair errors

Return a tRPC-compatible error envelope with additive stable code, projection,
message key, and trace/request ID. Keep HTTP/tRPC compatibility, but do not
make clients parse message text.

| Stable code | Condition | State / next action |
| --- | --- | --- |
| `qc_result_missing` | no complete result can be proven | `awaiting_action` / `run_qc` |
| `qc_result_not_current` | result is historical or active source changed | `awaiting_action` / `refresh` |
| `qc_source_version_mismatch` | supplied/resolved source version differs | `stale` / `refresh` |
| `qc_source_fingerprint_mismatch` | version matches but content fingerprint differs | `stale` / `run_qc` |
| `qc_contract_version_mismatch` | contract/output/policy context differs | `awaiting_action` / `run_qc` |
| `qc_repair_already_running` | matching repair attempt is queued/running | return existing attempt / inspect or cancel |

Keep authorization failures indistinguishable from not-found at the external
boundary. Persistence checksum/ownership failures map to `fatal_failed`, not to
a retry that could mutate the wrong Draft. Credit/provider uncertainty from
Sections 02–03 maps to `reconciliation_required` and cannot admit repair.

### Bounded repair and fresh QC

Preserve `runVerticalDramaDraftQualityQcRepair` as the narrow execution seam.
Bind it to the admitted source/result/contract/policy references and fence
token. It performs exactly one user-confirmed bounded repair round in the
initial canary policy:

1. retain the source candidate and report unchanged;
2. reserve through the existing Draft QC billing owner once;
3. run one revision within allowlisted paths;
4. apply additive merge and immutable, mutable-story-design, completeness, and
   story-control validation;
5. persist the rejected output/findings if invalid without changing active
   content;
6. freshly evaluate a structurally and semantically valid repaired candidate;
7. persist the new candidate with parent/source lineage and full report;
8. execute deterministic final gate and candidate/active CAS;
9. publish success only when the worker still owns its lease/fence and CAS
   succeeds; otherwise retain the candidate as stale inspectable evidence.

A higher score is not sufficient for activation. The report, hard findings,
current source/context, credit reconciliation, lease, and CAS must all pass.
Conversely, a safe non-passing result remains advisory and explicitly
selectable under the existing confirmation policy; it is not silently promoted
by the repair worker.

## CAS and race handling

The model/provider calls must occur outside a long-held database transaction.
Capture `expectedActiveVersion` and source fingerprint at admission. After the
candidate and report are durable, call the Section 02 final-gate/CAS seam in a
short transaction.

The CAS predicate must include tenant, user, draft, expected active version,
expected source fingerprint, candidate version/fingerprint, attempt ID, and
current fence token. The transaction records the final-gate decision and
active pointer change together, or records a CAS-lost event without changing
the pointer. It must be idempotent if the worker receives the same completion
twice.

Required race outcomes:

- newer creator edit: creator version wins; repair becomes stale, remains
  inspectable, and the UI offers fresh QC;
- duplicate worker delivery: the existing attempt/result is returned; no
  second reservation, model call, version activation, or event sequence;
- cancellation before paid call: fence worker and refund unused reservation
  exactly once;
- cancellation or lease loss after a call may have run: preserve usage/call
  facts, fence activation, and reconcile before retry/refund;
- Redis expiry or worker restart: rebuild from durable attempt/events and
  candidate ledger, acquire a new fence only through reconciliation, and do
  not replay a completed paid call;
- invalid repaired candidate: source baseline remains current; rejected
  candidate/report/finding remains inspectable; no CAS is attempted.

## Router and client migration

Deploy dual-read/dual-write behavior before enabling the new Draft QC mode.
Status and workspace responses retain `status`, `progress`, `result`,
`historicalResult`, `error`, `failure`, `runId`, and `requestFingerprint`, then
add the assurance projection. History remains lazy through `includeHistory`.

During compatibility mode:

- legacy failed records with an exact `recoveredFromFailure` result project to
  new `state: recovered` while retaining legacy `status: failed`;
- new recovered records may project legacy `status: failed` plus the existing
  recovery fields for old clients, while new clients use `state`;
- legacy reports without `evaluationWarnings` continue to render;
- legacy history without candidate version/fingerprint remains comparison-only
  and cannot enable repair or activation;
- the optional UI mutation seam for `repairDraftQualityQc` remains guarded
  until generated client types and server deployment are in lockstep;
- editing a QC-relevant field continues to clear current receipt/selection and
  require fresh QC without deleting history;
- the six wizard steps, routes, session recovery, direct save/edit, preview,
  candidate selection, warning confirmation, and “Use this Draft and continue”
  behavior remain unchanged.

Replace raw `error.message` rendering for known Draft QC outcomes with
`userMessageKey` plus Thai/English fallback copy. Unknown errors retain a
generic safe fallback and trace ID; raw `TRPCClientError` must never be the only
visible message. Buttons are enabled from server `canRepair`, `canRetry`, and
`canCancel`, with legacy derivation retained only while the new fields are
absent.

## UI/UX Contract

### Target User / JTBD

- Role: authenticated Vertical Drama creator working in the existing
  Create-Series wizard.
- Goal: inspect a complete QC result, understand why an improvement stopped,
  and safely repair, retry, cancel, confirm, or continue without losing the
  Draft or paying twice.
- Entry point: existing Draft review/QC surface inside
  `CreateSeriesWizard.tsx`.
- Success outcome: the user always sees durable state and one valid next
  action; a current recovered result can start confirmed repair, while stale or
  unsafe results explain the required refresh/re-QC action.

### Existing Pattern Reference

- Searched with targeted repository queries for `DraftQualityQc`,
  `repairDraftQualityQc`, `recoveredFromFailure`, candidate selection, and the
  observed error because SocratiCode was unavailable.
- Found patterns:
  `VerticalDramaDraftQualityQcPanel.tsx`, `CreateSeriesWizard.tsx`, the router
  Draft QC procedures, and their focused component/service tests.
- Decision: reuse. Extend the current panel, confirmation dialogs, history,
  warning acceptance, and wizard wiring additively. Do not add a route, modal
  workflow, second editable Draft surface, or replacement navigation model.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Draft QC panel | `VerticalDramaDraftQualityQcPanel.tsx` | consume capabilities/state/code additively; retain all current props and legacy normalization |
| Create-Series wizard | `CreateSeriesWizard.tsx` | map projection to repair/retry/cancel/continue; preserve source-signature invalidation and receipt confirmation |
| QC status query | `verticalDramaSeries.getDraftQualityQcStatus` | expose durable projection and typed next action |
| Workspace restore | `verticalDramaSeries.getDraftWorkspaceStatus` | reproduce the same projection after refresh/reconnect |
| Repair mutation | `verticalDramaSeries.repairDraftQualityQc` | return existing/new attempt or typed precondition without raw-message parsing |

### Component Map

| Component | Owns | Consumes |
| --- | --- | --- |
| `CreateSeriesWizard` | query/mutation wiring, source-currentness, selected candidate, receipt confirmation | legacy response plus additive assurance projection |
| `VerticalDramaDraftQualityQcPanel` | accessible presentation, confirmations, report/history, action buttons | server state, next action, capabilities, stable copy key, legacy fallback props |
| router projection helper | compatibility response shape | shared authoritative resolver; no UI-local truth |

No new visual component is required. If implementation extracts a pure state
mapper for testability, keep it presentation-only and make server capability
flags authoritative.

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading/restoring | keep Draft editable; show bounded status loading without assuming queued | refresh fixture does not start a mutation |
| queued/running | progress, phase, cancel, inspect/continue; repair/retry disabled | polling and reconnect retain run/attempt ID |
| recovered | warning treatment, complete baseline/report/history, repair and retry when server allows, no paid/export readiness | immutable-mutation regression exposes repair |
| succeeded | current result, selection/confirmation, explicit future repair if allowed | candidate/report/fingerprint remain paired |
| awaiting action/stale | preserve report/history; show refresh, edit, or run-QC action from code | wrong version/fingerprint/contract fixtures |
| retryable failed | safe explanation and retry; no repair unless exact result separately exists | transient fixture has no raw error-only state |
| cancelled/fatal/reconciliation | terminal message and only safe server-provided action | no infinite spinner or duplicate mutation |
| empty/legacy | existing “No QC result yet” and Start QC/continue behavior | old response without assurance fields still renders |
| disabled/hover/focus/selected | explain disabled repair; visible keyboard focus; selected candidate remains distinct from active Draft | jsdom interaction and browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | actions stack, copy/history wrap, dialogs remain reachable, no horizontal overflow | authenticated screenshot plus action flow |
| tablet 768x1024 | panel grids collapse cleanly; report/history remain readable | screenshot with recovered/error state |
| laptop 1024x768 | wizard and QC panel fit existing navigation without clipped buttons/dialog footer | screenshot because this is a multi-panel boundary |
| desktop 1440x900 | current hierarchy and side-by-side summary/actions remain stable | baseline/recovered screenshots |
| small-mobile 360x800 | long codes/messages wrap; touch targets remain usable | extended overflow check |
| wide-desktop 1280x800 | no new width assumptions or excessive empty state | optional screenshot if layout differs from desktop |

Do not hide overflow, truncate report/error content, or solve wrapping by
removing user data.

### Accessibility Acceptance

- Keyboard path: tab order reaches Start/Cancel/Repair/Retry, confirmation
  controls, candidate selection, and history details in document order.
- Focus visibility: every interactive control keeps a visible focus ring;
  opening/closing confirmation returns focus to the invoking action.
- Labels/semantics: progress retains accessible values; failures use an alert
  region; status changes use restrained `aria-live`; disabled actions have
  adjacent explanatory text.
- Contrast: recovered/warning/error states must not rely on color alone and
  retain readable light/dark contrast using existing semantic tokens.
- Reduced motion: existing spinner/progress animation honors reduced motion;
  no new mandatory motion is introduced.

### Visual Direction and Token Strategy

Reuse the existing Draft QC panel hierarchy, shadcn controls, Tailwind semantic
tokens, warning/error/success surfaces, spacing, typography, and restrained
motion. This section is behavioral production hardening, not a redesign. Do
not add raw colors, widths that break the existing wizard, or a parallel Astryx
surface.

### Copy Contract

- Tone: calm, specific, actionable, and explicit that the Draft is preserved.
- Languages: Thai and English parity in the existing local copy object or the
  repository's selected localization seam.
- Required concepts: recovered result, current result, stale result, run QC,
  refresh, retry, repair already running, cancellation, reconciliation, and
  trace ID for unknown failure.
- Known error copy comes from stable code/message key. It must say what
  happened and the next action; never show only “repair failed” or raw
  `TRPCClientError`.
- Preserve existing advisory wording, credit confirmation, below-threshold
  warning, “Use this Draft and continue”, and legacy fallback strings.

### Browser Evidence Required

Record authenticated evidence at mobile 390x844, tablet 768x1024, laptop
1024x768, and desktop 1440x900 for queued/running, recovered with repair,
typed stale error, legacy response, and refresh/reconnect. Prove keyboard focus,
dialog return focus, no overflow, no raw error-only state, and no duplicate run
after refresh. Browser evidence is separate from Vitest, deployment, provider,
migration, and production-canary evidence; a skipped browser run is reported as
skipped, not passed.

## TDD implementation sequence

Write failing tests before each production change. Extend current test files
and conventions instead of creating a parallel harness.

### 1. Service baseline and immutable-regression tests

Extend
`apps/web/server/services/__tests__/verticalDramaDraftQualityQc.test.ts`:

- baseline report/version/fingerprint is persisted before the first revise;
- valid baseline followed by immutable `storyContract` mutation throws a
  typed failure that retains the complete baseline history/reference;
- malformed or incomplete repair output preserves the source baseline and
  never produces an active candidate;
- one explicit repair performs one revise plus one fresh evaluate, applies
  allowlisted additive changes, and retains source/repaired lineage;
- `maxImprovementRounds=0` performs evaluate only, while omitted/default policy
  remains bounded and nonzero;
- immutable `storyContext`, `storyContract`, visual identity, and mandatory
  server-owned paths remain protected without incorrectly making all
  `characters`/`locations` universally immutable.

### 2. Resolver, durability, restart, and idempotency tests

Extend
`apps/web/server/services/__tests__/verticalDramaDraftQualityQcJobs.test.ts`
and the Section 02 repository tests:

- the observed failure resolves to current `recovered` state from exact
  failure history/durable ledger evidence;
- status, workspace restore, and repair admission receive the same result and
  projection;
- Redis expiry and worker restart recover the baseline and do not replay paid
  calls;
- cancellation, stale lease, and duplicate queue delivery are idempotent and
  cannot resurrect success;
- missing owner/run/version/fingerprint/report never fabricates recovery;
- replay of durable events yields byte-equivalent state/disposition/action
  semantics, allowing only intentionally omitted transient timestamps;
- legacy failed plus `recoveredFromFailure` maps to new recovered state while
  retaining legacy fields.

### 3. Ledger and CAS tests

Extend `verticalDramaDraftLedger` and assurance repository tests:

- a repair candidate can be appended without activating it;
- CAS activates only the expected tenant/user/draft/source/candidate/fence;
- a newer creator edit wins against a late repair completion;
- CAS loss retains the candidate/report and returns stale/fresh-QC action;
- duplicate finalization produces one active pointer and one accepted event;
- storage/ledger failure before candidate durability cannot publish success.

### 4. Router contract and regression tests

Add focused router tests under
`apps/web/server/routers/__tests__/verticalDramaSeries.*.test.ts` for the exact
procedures:

- `repairDraftQualityQc` accepts a current recovered result reconstructed from
  durable evidence and does not return the observed generic conflict;
- no result, historical result, wrong source version, wrong fingerprint,
  wrong contract/policy, and already-running repair return their distinct
  stable codes/actions without queueing or charging;
- duplicate idempotency returns the existing repair attempt;
- tenant mismatch is not disclosed and never reads another owner's report;
- `getDraftQualityQcStatus` and `getDraftWorkspaceStatus` return compatible
  legacy fields plus identical additive projection;
- `selectDraftQualityQcCandidate` retains run/version/stage/fingerprint checks;
- legacy repair input remains accepted only when all additive facts can be
  proven server-side.

### 5. UI and wizard tests

Extend
`VerticalDramaDraftQualityQcPanel.test.tsx` and
`CreateSeriesWizard.test.tsx`; add focused lineage coverage where it belongs:

- current recovered projection enables repair and sends the exact result
  reference/fingerprint/idempotency input;
- missing/stale/wrong-contract/already-running codes show the correct Thai and
  English next action, not raw error text;
- server capability false keeps repair disabled with an explanation even if a
  legacy local condition appears repairable;
- old responses without assurance fields retain existing start, progress,
  recovery, history, selection, confirmation, override, and continue behavior;
- refresh/reconnect reproduces running or recovered state without calling a
  start/repair mutation;
- newer Draft edits invalidate current selection/receipt and preserve history
  as comparison-only;
- incomplete reports fail closed; reports missing only additive
  `evaluationWarnings` still render;
- keyboard, alert/live regions, reduced-motion classes, long-message wrapping,
  and confirmation-dialog focus behavior are covered where jsdom can prove
  them.

Run browser-facing Vitest with jsdom. The focused command is:

`npm --workspace apps/web test -- --environment jsdom shared/verticalDramaSeries/__tests__/draftQualityQc.test.ts server/services/__tests__/verticalDramaDraftQualityQc.test.ts server/services/__tests__/verticalDramaDraftQualityQcJobs.test.ts server/services/__tests__/verticalDramaDraftLedger.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaDraftQualityQcPanel.test.tsx client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.lineage.test.tsx`

Add the focused router and Section 02 repository test paths to that command as
they are created. Also run `git diff --check` and changed-file diagnostics.
Report broad `npm --workspace apps/web run check` separately if it remains
baseline-noisy or resource-constrained. Focused local proof does not establish
browser, migration, deployment, provider, or production correctness.

## Observability, security, and operational evidence

Emit redacted, tenant-scoped metrics/events for baseline persistence,
recovery source, recovery accepted/rejected reason, repair admission code,
repair attempts, candidate rejection, final-gate outcome, CAS success/loss,
lease loss, duplicate admission, credit reconciliation, time to terminal state,
and raw-error fallback count. Correlate execution, attempt, run, draft, source
version/fingerprint, contract/policy, and trace IDs without logging story text,
prompts, signed/provider URLs, tokens, or private evidence.

Require authenticated tenant identity for every resolver, repair, selection,
history, and CAS lookup. Never infer ownership from Draft content or
fingerprint. Treat persisted Draft/report text as untrusted data for any Agent
or model prompt. No Agent/tool receives DB, credit, storage, provider, or
activation authority.

The operator view/runbook must explain how to distinguish live, recovered,
historical, stale, and reconciliation-required results; inspect exact source
and candidate references; identify a lost CAS; safely retry from current
source; and disable the new adapter without deleting accepted evidence.

## Rollout and rollback

Use an additive, dependency-ordered rollout:

1. Land failing replay/router/CAS tests and inventory exact legacy records.
2. Deploy nullable durable fields/repository and dual-read projection with all
   new Draft QC activation flags off.
3. Dual-write baseline/result/event facts while the current deterministic path
   remains authoritative. Compare old/new status, result, history, source
   fingerprint, capability, and credit facts in shadow; do not issue an extra
   tenant-funded model call.
4. Enable Draft QC shadow for internal tenant/series allowlists. A shadow
   result cannot activate, satisfy repair admission, or prove provider
   readiness.
5. Enable Draft QC canary with one bounded repair round. Require zero observed
   generic precondition errors for proven current recovered results, zero
   invalid activations, zero duplicate charges, and complete terminal/action
   state for synthetic/canary runs.
6. Expand only after authenticated browser refresh/reconnect, staging worker
   restart, Redis expiry, migration rehearsal, and rollback evidence pass.

Use the repository's final flag names after the Section 01 flag-registry
inventory. The logical controls remain independent Draft QC shadow, Draft QC
active/canary, and assurance kill switch. The kill switch disables the new
adapter/admission path and returns to the existing deterministic compatibility
path; it must not clear ledger evidence, roll back additive schema, revert user
Drafts, refund without evidence, or resubmit uncertain work.

Backfill only when tenant, owner, run, draft/session, source version,
fingerprint, complete report, and candidate ledger version are provable.
Ambiguous rows remain legacy/history-only or needs-review. Never manufacture a
score, recovered state, policy hash, ownership, or active candidate.

## Acceptance checklist and safe handoff

- The immutable `storyContract` replay ends with an exact current recovered
  baseline and repair starts successfully.
- All six typed repair preconditions return stable codes/actions and no side
  effect.
- Status, workspace restore, repair admission, selection, and confirmation use
  one authoritative durable resolution.
- Invalid repair never activates; repaired candidates are freshly evaluated.
- Newer creator edits win the CAS and remain intact.
- Redis expiry, restart, cancellation, and duplicate delivery preserve one
  result and exact-once credit/model effects.
- Legacy status/result/history/error/failure/report fields and current wizard
  behavior still pass focused tests.
- UI states, responsive behavior, accessibility, Thai/English copy, and
  authenticated browser evidence satisfy the contract above.
- Metrics, runbook, migration rehearsal, canary thresholds, kill switch, and
  rollback evidence are recorded separately from local tests.

The safe implementation boundary for this section is the shared Draft QC
contract, Draft QC service/job/ledger/router/UI files and their focused tests.
Do not stage or modify unrelated dirty-worktree files. Do not activate later
prompt/media/story/season adapters as part of this section; Section 04 only
provides the proven Draft QC recovery/repair seam those later sections may
reuse.
