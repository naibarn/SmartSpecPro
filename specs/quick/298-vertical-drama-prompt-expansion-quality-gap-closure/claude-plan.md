# Implementation Plan: Vertical Drama Prompt Expansion Quality Gap Closure

## 1. Implementation principles

This work is a contract repair across the existing prompt-expansion path. Keep
the 2,000-character input limit and current preview/apply UX, but replace the
false-success behavior at its source. The production path is fail-closed:
prompt expansion succeeds only after a real LLM-backed skill call returns a
validated, useful contract. There is no local/deterministic/mock/sample
fallback result. Work only in the files and tests named below; preserve
unrelated dirty changes in the checkout.

The central distinction is:

`creator premise` → `AI treatment (editable, profile-aware, pre-Draft)` →
`existing Draft generation` → `series/episode production artifacts`

The treatment is not a second Draft. It is a structured interpretation that
gives Draft a better premise context and makes unknowns visible before Draft
generation.

## 2. Shared contract and profile model

### 2.1 Files

- Extend `apps/web/shared/verticalDramaSeries/promptExpansion.ts`.
- Add a focused shared module if the types become too large:
  `apps/web/shared/verticalDramaSeries/promptExpansionTreatment.ts`.
- Add contract fixtures under
  `apps/web/server/services/__tests__/fixtures/promptExpansion/`.
- Add or update the feature skill files under
  `apps/web/skills/vertical-drama-prompt-expansion/`:
  `skill.md`, `skill.json`, `input.schema.json`, and `output.schema.json`.

### 2.2 Contract shape

Version the result as `promptExpansionContractVersion: 2`. Keep the current
shared preview envelope (`revision`, original text/hash, status, brief, sources,
warnings, slots) compatible where possible, and add:

- `treatmentKind: "story_treatment" | "profile_brief"`;
- `quality: { status, scoreBand, checks, missingFields, addedContentRatio }`;
- `provenance: { sourcePromptHash, generatedAt, skillSlug, skillVersion,
  model, runId }` with no raw prompt;
- `originalPrompt` retained separately from `expandedPrompt`;
- `treatment`, a discriminated union by `brief.profile`;
- `draftHandoff: { concisePrompt, authoritativeFacts, openQuestions,
  exclusions, sourceRunId }`.

Every creator-facing content field must be representable as
`creator_fact`, `model_inference`, or `user_edited`; factual claims also carry
`verification: not_required | needs_verification | verified` and source refs.
Do not allow unbounded recursive objects, arbitrary model metadata, or model
reasoning in the persisted contract. Bound list counts and field lengths in Zod
and JSON schema. Keep visual slots separate from story treatment semantics.

### 2.3 Story treatment fields

The `story` discriminator must support, without making every field falsely
required: `setting`, `protagonists[]`, `meetingAndIncitingEvent`,
`relationshipProgression[]`, `goalsAndNeeds`, `obstacles[]`, `opposingForces[]`,
`centralQuestion`, `majorConflict`, `turningPoints[]`, `climax`,
`endingDirection`, `unresolvedHooks[]`, `tone`, `audience`, `assumptions`,
`exclusions`, and `concisePrompt`.

The quality gate requires a minimum useful subset based on premise/profile. A
romance premise requires relationship and obstacle signals; a mystery premise
requires a central question and escalation; a premise that does not contain
enough information must produce an explicit open question instead of invented
character history or ending facts.

### 2.4 Non-story profiles

Define profile-specific minimums:

- `review`: subject, review criteria, audience angle, experience/limitations;
- `documentary`: subject, context, evidence boundaries, narrative angle;
- `news_report`: claims, time reference, sources, verification state, unknowns;
- `software_review`: product/workflow, user scenario, evaluation criteria,
  limitations, version/date assumptions.

No profile gate may require romance, protagonist arcs, or fictional endings.

## 3. Skill routing and structured execution

### 3.1 Add the feature skill

Implement `vertical-drama-prompt-expansion` as a read-only, interactive,
profile-aware structured capability. Its skill contract must explicitly state:

- one JSON object matching the versioned output schema;
- story treatment is pre-Draft and must not contain scenes/dialogue/shot grids;
- explicit facts outrank inference; unknowns become open questions;
- other profiles use their own minimum fields and evidence rules;
- no private reasoning, prompt instructions, or placeholder values in content;
- `execution_mode: llm-only`, real provider execution is mandatory, and no
  fixture/sample/mock output is a runtime result.

Use the existing story architecture planner as a design reference only. Do not
call its authoritative season/series contract for this dialog, because that
would make the optional treatment and Draft architecture the same artifact.

### 3.2 Route through a feature service, not a generic free-form call

In `apps/web/server/services/verticalDramaPromptExpansionService.ts`, add a
server-owned execution function that builds the bounded input payload, profile,
locale, schema name/version, and response-format request. The router should no
longer construct a custom JSON request while selecting
`general-article-writer`.

The server derives the profile with the shared `inferPromptExpansionProfile`
rule unless a validated profile hint is already part of the caller contract.
Client input may narrow presentation but cannot bypass the server's
profile-specific quality gate.

Extend `apps/web/server/services/unifiedOrchestrator.ts` and
`apps/web/server/services/executors/types.ts` with an explicit strict execution
option such as `strictSkillExecution: true` or `fallbackPolicy: "error"`.
When strict mode is enabled, every existing fallback branch must become a typed
error: missing selected skill, missing executor, and executor failure must not
resolve to `general-article-writer` or a text executor. Prompt expansion must
use strict mode and the exact selected skill.

The service must validate the resolved skill before calling the provider:
manifest exists, slug matches, `execution_mode` is exactly `llm-only`, output
schema/version is present, skill source is registered DB/filesystem content, and
the runtime path is not a mock, fixture, sample, sandbox command, or local
deterministic generator. Reject with a typed preflight error if any check fails.
The selected skill, skill version/hash, schema version, provider, model, and
response mode must be visible in telemetry and testable from the service
boundary.

The executor result must include real-run evidence before the service can mark
success: `modelUsed`, provider ID/request or trace ID, executor ID, input/output
token usage (or an explicit provider usage-unavailable marker), `success: true`,
and `mocked: false`. Missing or contradictory evidence is a failure.

### 3.3 Bounded retries and credit semantics

Use one user-visible preview operation with a bounded internal repair budget:
one initial real structured call plus at most two real-LLM schema/quality repair
attempts.
Transport/provider transient failures may use the existing executor retry policy;
do not create an unbounded loop. Parser repair and schema repair are part of the
same preview operation and must not appear as separate user charges. Reserve or
record one preview credit transaction for the operation using the existing
ledger mechanism, and make the tests prove that repair attempts do not deduct
again. If the budget is exhausted, return a typed recoverable failure with the
original prompt untouched and a retry action.

Never return a deterministic profile skeleton, original prompt, generic
instructions, sample output, fixture output, or mock output as an expansion.
When the budget is exhausted, return a typed failure only. If a real provider
call was made, retain sanitized attempt metadata and use the existing credit
reservation/void/refund boundary according to the provider billing result.

## 4. Parser, normalizer, and deterministic quality gate

### 4.1 Parser changes

Refactor `parsePromptExpansionModelOutput` into separately testable functions:

1. extract a single JSON candidate from raw text, accepting whitespace,
   Markdown fences, and approved transport envelopes;
2. normalize only known aliases and contract-version forms;
3. validate the versioned schema and profile discriminator;
4. normalize sources/slots without treating them as proof;
5. produce typed diagnostics, never silently substituting the original prompt.

Plain text is a rejected attempt because this feature requires the real skill's
structured contract. Unsafe, empty, malformed, copied, near-copied, generic, or
profile-incomplete output is a rejected attempt. There is no partial/plain-text
fallback object.

### 4.2 Quality gate

Add deterministic quality functions in the shared/service boundary. Checks must
include:

- normalized exact equality and near-equality against the original prompt;
- added-content ratio and number of distinct substantive sections;
- detection of generic instruction-only additions such as “clarify audience”
  without concrete premise development;
- profile-specific minimum fields and minimum non-empty content;
- preservation of creator facts and exclusion of prompt-injection/model
  instructions from content fields;
- unsupported factual-claim count and missing verification/source state;
- treatment-vs-Draft boundary violations such as episode scenes, dialogue, shot
  grids, or production commands in the treatment.

Return machine-readable check IDs and human-readable Thai/English warnings.
Thresholds must be constants with unit tests; do not claim a numeric score is a
measure of artistic quality. The gate only proves that the result is not an
empty/copy/generic/contract-invalid response.

### 4.3 Preview construction

Replace the production use of `buildDeterministicPromptExpansionPreview` with a
builder that accepts only a validated real-LLM result plus real-run evidence.
Remove the optional `modelOutput`/no-output success path from the production
contract and update its tests so a missing model result is a typed failure. On
parse/quality/provider/preflight failure, persist only a sanitized failed-run
record if useful, return a typed error, and retain the original prompt only for
retry/recovery. Never construct a preview with `expandedPrompt === originalPrompt`.

### 4.4 User-facing failure codes

Map these server codes to clear Thai/English UI messages and a trace ID:

| Code | Meaning | User action |
|---|---|---|
| `PROMPT_EXPANSION_SKILL_NOT_FOUND` | Exact skill is not registered/installed | Retry later/report issue |
| `PROMPT_EXPANSION_SKILL_NOT_LLM` | Skill is mock/sandbox/non-LLM or manifest invalid | Report issue; no Apply |
| `PROMPT_EXPANSION_PROVIDER_UNAVAILABLE` | No configured provider/model | Retry later/check configuration |
| `PROMPT_EXPANSION_LLM_FAILED` | Real LLM call timed out/failed/rate limited | Retry/cancel |
| `PROMPT_EXPANSION_OUTPUT_INVALID` | LLM did not return required JSON contract | Retry/cancel |
| `PROMPT_EXPANSION_OUTPUT_NOT_USEFUL` | Contract parsed but failed quality gate | Retry/edit original/cancel |
| `PROMPT_EXPANSION_REAL_RUN_UNPROVEN` | Execution evidence was missing/contradictory | Report issue; no Apply |
| `PROMPT_EXPANSION_CREDIT_UNAVAILABLE` | Credit reservation/settlement failed | Retry after balance/service recovery |

Do not expose raw provider errors, prompts, or model output. Do not use a
generic “ใช้โครงสร้างตั้งต้น” message because it hides the actual failure.

## 5. Persistence, router, and apply safety

### 5.1 Service and schema

Update `apps/web/server/services/verticalDramaPromptExpansionService.ts` to:

- validate owner and input before model execution;
- save the complete contract version and quality diagnostics in `previewJson`;
- save the approved treatment and approved hash separately in `approvedJson`;
- preserve source prompt/hash and run/skill/model provenance;
- enforce idempotency by tenant/user/key and make repeated preview requests
  return the same run only when the input hash/profile match;
- back the idempotency contract with the existing unique/index mechanism if
  available, or add the smallest additive unique constraint/migration needed;
  handle a concurrent insert conflict by rereading and rechecking hash/profile,
  never by returning a different user's or different-input run;
- distinguish `preview`, `failed`, `applied`, `cancelled`, and `stale` transitions
  with legal transition checks; do not create a successful `partial` expansion
  object.

Inspect migration `apps/web/drizzle/0244_vertical_drama_prompt_expansion.sql`
and `apps/web/drizzle/schema.ts`. Prefer additive JSON changes without a
database migration. If status/contract version needs an indexed column or a
constraint, add a new migration and update the feature migration test; do not
rewrite existing JSON rows. Provide a read-compatible legacy adapter for runs
created by the current implementation.

### 5.2 Router

In `apps/web/server/routers/verticalDramaSeries.ts`:

- keep the 2,000-character prompt input fence and server-side max validation;
- call the new service-owned structured preview function;
- pass locale/profile hints explicitly rather than inferring all semantics from
  free-form text in the router;
- return a successful preview and run ID only after strict real-run evidence and
  quality validation. On any preflight/provider/parse/quality failure, return a
  sanitized typed tRPC error with a stable failure code, Thai/English message,
  and trace ID; do not continue into preview construction.
- keep `applyPromptExpansion` owner/tenant scoped and reject stale hash,
  revision, status, or approved-payload mismatch;
- optionally persist a failed-run status with sanitized diagnostics for support,
  but never persist an `expandedPrompt` fallback or allow Apply for it;
- add cancellation/retry endpoints only if the existing client cannot represent
  the state through the current mutation lifecycle.

Apply must use a single compare-and-swap update that includes run ID, tenant,
user, expected revision, expected source hash, and current preview status. A
second user or tenant must receive `NOT_FOUND`/`CONFLICT` without information
leakage. An already-applied run is idempotent only for the exact same approved
hash; a different approval is a conflict.

## 6. Draft handoff and duplicate-prevention contract

### 6.1 Client handoff

In `CreateSeriesWizard.tsx` and
`VerticalDramaPromptExpansionDialog.tsx`, keep original prompt in local form
state and retain an `approvedPromptExpansion` lineage object. Applying may set
the visible `userPremise` to the approved concise handoff for compatibility, but
must also retain the original hash/run ID/treatment snapshot and mark the state
as approved. Editing the approved text marks provenance `user_edited`.

The UI must never imply that applying the treatment has already generated the
Draft. The next Draft CTA should consume the approved treatment as context.

### 6.2 Server handoff

At the existing Draft entry points in
`apps/web/server/routers/verticalDramaSeries.ts` and the relevant
`verticalDramaStoryBible.ts` builders, add an optional, backward-compatible
`promptExpansionContext` containing original prompt/hash, approved treatment,
run ID, and approved revision. Merge it into the existing `userPremise` context
once at the boundary that builds Draft input.

The merge rules are deterministic:

- explicit creator facts remain authoritative;
- approved user edits outrank model inference;
- model assumptions/open questions remain labelled;
- Draft may organize and elaborate, but may not silently contradict or remove
  approved facts;
- if the run is stale, missing, cross-owner, or hash-mismatched, fail closed or
  ask the user to re-preview rather than mixing contexts.

Do not add a new Draft route, new Draft persistence table, or an automatic
second call to the story architecture planner from the expansion dialog.

## 7. UI/UX contract

### 7.1 Files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaPromptExpansionDialog.tsx`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- existing shared UI primitives only; no new dependency.

### 7.2 State matrix

| State | Visible behavior | Allowed actions |
|---|---|---|
| idle | Original prompt and 2,000 counter | Expand, close |
| loading | Progress/attempt text; original remains visible | Cancel |
| structured success | Original and editable AI treatment separated; quality/provenance labels | Edit, retry, apply, cancel |
| rejected/failed | No expansion text; exact reason, trace ID, and recovery guidance | Retry, close/cancel |
| stale | Existing edits preserved; conflict explanation | Reopen/re-expand |
| applied | Confirmation that treatment was approved and will feed Draft | Close/continue to Draft |

The dialog must have a prominent “AI treatment, not Draft” explanation, an
original-vs-generated distinction, editable structured fields where supported,
and a concise handoff preview. Warnings must identify assumptions and
verification requirements. The 2,000-character counter and over-limit lock stay
visible in the wizard; programmatic submit also remains blocked server-side.

### 7.3 Responsive and accessibility acceptance

At 390x844, 768x1024, and 1440x900: the modal content remains readable, all
generated fields wrap rather than clip, the primary actions remain reachable,
and long Thai/English text does not widen the page. Keyboard focus is trapped
inside the dialog, Escape cancels without applying, labels are associated with
inputs, status/warnings use `role=status`/`role=alert` appropriately, and the
apply button explains why it is disabled. Do not hide scrollbars or truncate
creator data.

## 8. Tests-first plan

Write tests before implementation, following the test stubs in
`claude-plan-tdd.md`. Minimum coverage:

- shared schema/provenance/profile minimums and 2,000-character boundary;
- JSON, fenced JSON, wrapper, alias, plain-text rejection, malformed, empty,
  copied, generic, unsafe, and incomplete parser/gate cases;
- exact skill preflight, strict orchestrator routing, structured response-format
  wiring, mock/sample/sandbox rejection, and real-run evidence validation;
- bounded retry/quality repair, provider failure, credit behavior, and typed
  outcome status;
- persistence idempotency, legal transitions, owner/tenant isolation, stale
  hash/revision/CAS, same-approved-hash idempotency;
- Draft handoff lineage, single merge, stale/missing treatment rejection, and
  backward compatibility without an expansion run;
- dialog state matrix, original/generated distinction, edit provenance,
  2,000-counter lock, cancel/retry/apply behavior, and long text wrapping;
- Playwright evidence for responsive sizes, keyboard-only flow, failure/retry,
  and successful story treatment.

## 9. Rollout and verification gates

Implement behind the existing prompt-expansion capability flag if available;
otherwise add a narrowly scoped feature flag with a default-off migration path.
Keep legacy runs readable, but expose no expansion when the new strict path is
unavailable. Before enabling broadly, run focused tests, `git diff
--check`, changed-file diagnostics, and browser proof. Record full typecheck
noise separately. A non-mocked integration smoke test with a configured test
provider must prove skill manifest → strict orchestrator → real provider →
structured output evidence. Deployment, database migration application, live
provider behavior, credit accounting in production, and authenticated
production browser proof remain release gates and must not be claimed from
local mocks/planning/tests.

## 10. Review gates and stop condition

After implementation, review the actual diff against every acceptance item in
`claude-spec.md`, then rerun parser/service/UI/browser gates. Stop only when:

1. no success path can label the original prompt as an AI expansion;
2. the treatment/Draft boundary is explicit in contract, UI, persistence, and
   handoff;
3. profile-specific quality gates and non-story behavior are covered;
4. stale/tenant/idempotency/concurrency paths fail closed;
5. focused tests and responsive/keyboard evidence pass; and
6. remaining issues are either unrelated baseline noise or explicitly listed
   release-only proof, not an implementation gap.
