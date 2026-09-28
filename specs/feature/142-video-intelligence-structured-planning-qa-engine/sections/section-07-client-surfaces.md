<!-- SECTION: section-07-client-surfaces -->

# Section 07 — Client Surfaces

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** `section-04-stage-wiring-credits`, `section-05-scene-planner`, `section-06-repair-applier`
**Blocks:** `section-08-guards-observability`
**Parallelizable:** No — needs all three stages to exist server-side.
**Test command:** `cd apps/web && npx vitest run`
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. What this section delivers

The three Video Intelligence stages are now real server-side. This section makes
them usable, honest and safe in the UI.

1. **`StageEstimateDialog`** (new, shared) — the estimate → confirm gate required
   by decision **D4**. Used by scene plan, quality review and quality repair.
2. **`QaPanel`** — a real scorecard (overall score, per-dimension bars, issues
   grouped by severity, per-round history with before/after and one-click
   revert), a distinct claim-compliance **gate** banner, and per-stage repair
   buttons labelled by cost class.
3. **`ScenesPanel`** — the plan button, the `fill_empty` / `replace` re-run mode
   selector, and a destructive confirmation for `replace`.
4. **`RenderPanel`** — `VI_CLAIM_VIOLATION` becomes an actionable message that
   navigates back to the QA stage, not a raw error dump.
5. **Required states everywhere** — loading, empty, running, success, error,
   unsaved-changes, and **stale**.
6. **Cost honesty** — post-run the UI reports actual credits from the job record,
   and never implies a failed stage was free.
7. **i18n** — every new string goes through `videoStudioCopy.ts` + `pickCopy`.
8. **`NotWiredJobCard.tsx` and `NotWiredJobCard.test.tsx` are deleted.**

### 1.1 Background (self-contained)

Video Studio lives at `/video-studio/:id`. `VideoStudioWorkspacePage.tsx` loads
the project via `trpc.videoProjects.get`, keeps an **in-memory draft** of
`VideoProjectDocument` (`draftDocument`), tracks `baseRevision` and
`hasUnsavedChanges`, and renders exactly one stage panel at a time from a
`StageRail` (Brief → Scenes → Narration → Motion → Captions → QA → Render).

Until this feature, the three AI stages were dead: `ScenesPanel` and `QaPanel`
each rendered a `NotWiredJobCard`, whose only job was to enqueue a job and then
explain the `VI_*_NOT_WIRED` failure that always came back. Sections 04–06
replaced those throws with real work, so the card has nothing left to say.

Job polling already exists and must be reused, not reinvented:
`useGenerationJobPoll(projectId, kind)` (resume-on-mount + 2.5 s poll, stops on
terminal status) returning `{ jobId, setJobId, jobStatus }`.

**Astryx exception.** Every file in `components/videoStudio/` imports
`@astryxdesign/core/*` directly. That is a deliberate, twice-confirmed user
decision (see `planning/video-studio-astryx-migration/plan.md`) — keep the same
docstring note on every new file so a later reader does not "fix" it.

---

## 2. Interfaces this section consumes (do not re-implement)

### 2.1 From section-04 — `videoProjects.getStageEstimate` (tRPC **query**)

```ts
// input:  { projectId: number; stage: "scene_plan" | "quality_review" | "quality_repair" }
// output:
{
  stage: VideoIntelligenceStage;
  modelId: string;              // the SAME id dispatch pins into the job payload
  maxLoops: number;             // clamped >= 1
  perRoundCredits: number;      // one LLM call, from real pricing x real doc size
  typicalCredits: number;       // perRoundCredits x maxLoops
  ceilingCredits: number;       // perRoundCredits x 5 x maxLoops  <- the headline number
  callsPerRoundCeiling: number; // 5
  basis: {
    sceneCount: number; narrationChars: number; captionChars: number;
    layerCount: number; claimCount: number;
    estimatedInputTokens: number; estimatedOutputTokens: number;
  };
  isCeiling: true;
}
```

Registered on `videoIntelligenceCrudProcedure` (60/min), so calling it on dialog
open is safe. It makes no LLM call and no credit charge.

### 2.2 Stage mutations (sections 04–06)

```ts
videoProjects.runScenePlanStage   ({ projectId, baseRevision?, mode?: "replace" | "fill_empty" })
videoProjects.runQualityReview    ({ projectId, baseRevision? })
videoProjects.applyQualityRepairs ({ projectId, baseRevision?, stages?: string[] })
// all return { jobId, traceId, estimate }
```

### 2.3 Job polling result payloads

`videoProjects.getGenerationJobStatus` returns the job record:
`{ status: "queued" | "running" | "succeeded" | "failed", progress, result, error, ... }`.

`result` for a completed quality review (section-04 §4.5):

```ts
{
  kind: "quality_review"; traceId: string; revision: number; rounds: number;
  review: VideoProjectReview; creditsUsed: number; modelId: string | null;
  blocksFinalRender: boolean; ledgerEntryCount: number;
}
```

Scene plan and repair results follow the same envelope shape from sections 05/06
(`kind`, `traceId`, `revision`, `creditsUsed`, `modelId`, plus their own fields —
`applied` / `skipped` / `rolledBack` for repair, `plannedSceneIds` / `summary`
for scene plan). Treat every field as optional on the client and degrade
gracefully; a Redis-round-tripped `result` is `unknown` to TypeScript.

### 2.4 Persisted review history

`trpc.videoProjects.get` runs `SELECT *`, so the project row already carries
`qaLedger`. Read it with the shared type from section-04:

```ts
import type { QaLedger, QaLedgerEntry } from "@shared/videoIntelligence/qaLedger";
// { entries: QaLedgerEntry[]; totalCount: number }
// QaLedgerEntry = { at, round, revision, review, creditsUsed, modelId, traceId }
```

🔴 **Prerequisite for this section:** `shared/videoIntelligence/qaLedger.ts` must
export the review type **structurally from `shared/`** (section-04 §6.1 allows
either). The client cannot import `server/services/videoProjectQualityLoop.ts`.
If section-04 shipped a type-only import from `server/`, replace it with the
structural declaration in `shared/` — a purely additive change that keeps both
sides assignment-compatible.

### 2.5 Revision trail (already shipped, reuse as-is)

```ts
videoProjects.listRevisions   ({ projectId })            // -> rows incl. { revision, reason, createdAt }
videoProjects.restoreRevision ({ projectId, revision })  // -> { revision }
```

These are the D1 safety net. Do not build a new revert mechanism.

---

## 3. Files created / modified / deleted

```
apps/web/client/src/components/videoStudio/
  StageEstimateDialog.tsx                    NEW      estimate -> confirm gate (D4)
  StageLaunchCard.tsx                        NEW      shared launch card (replaces NotWiredJobCard's role)
  qaPanelState.ts                            NEW      PURE state/staleness/derivation helpers
  QaPanel.tsx                                CHANGED  scorecard, repairs, history, revert
  ScenesPanel.tsx                            CHANGED  plan button, re-run mode, destructive confirm
  RenderPanel.tsx                            CHANGED  actionable VI_CLAIM_VIOLATION -> QA
  videoStudioCopy.ts                         CHANGED  new copy keys + renderableJobError()
  NotWiredJobCard.tsx                        DELETED
apps/web/client/src/pages/
  VideoStudioWorkspacePage.tsx               CHANGED  thread hasUnsavedChanges / onDocumentSaved / onGoToQa

# tests
  videoStudio/__tests__/qaPanelState.test.ts             NEW  pure, no render
  videoStudio/__tests__/StageEstimateDialog.test.tsx     NEW
  videoStudio/__tests__/QaPanel.test.tsx                 NEW  (named in claude-plan.md §3.2)
  videoStudio/__tests__/ScenesPanel.test.tsx             NEW
  videoStudio/__tests__/videoStudioCopy.test.ts          NEW  migrates the FE03 allowlist coverage
  videoStudio/__tests__/NotWiredJobCard.test.tsx         DELETED
  pages/__tests__/VideoStudioWorkspacePage.test.tsx      CHANGED  mock header + unsaved-changes guard
```

**Two additions to `claude-plan.md` §3.2's file list, with rationale:**

- `StageLaunchCard.tsx` — three panels need the identical "button + progress +
  terminal error + blocked-reason" shell. `NotWiredJobCard` already was that
  shell; this is a rework of it minus the not-wired notice, not a new pattern.
  Implement it as a rename of `NotWiredJobCard.tsx` if that keeps the diff
  honest, but the `notWired*` copy keys must go.
- `qaPanelState.ts` — pure derivation (state machine, staleness, claim block,
  score delta) extracted so the rules are testable without jsdom. Precedent in
  the same folder: `createDefaultDocument.ts` + its own test.

---

## 4. Contracts introduced by this section

### 4.1 `videoStudioCopy.renderableJobError` — 🔴 security carry-over

`NotWiredJobCard` is being deleted, and with it the only enforcement of a
pre-merge security gate (**FE03**): a raw job/mutation error string is rendered
verbatim **only** when it starts with our own greppable `VI_` prefix; anything
else falls back to a generic message instead of echoing worker text (or a leaked
stack trace) into the DOM.

That property must survive the deletion. Move it into the copy module:

```ts
/** FE03 (pre-merge security gate, carried over from the deleted NotWiredJobCard):
 *  only render an error verbatim when it is one of our own `VI_*` codes.
 *  Any other value returns the generic message. Never returns null for a
 *  non-empty input — the user always sees SOMETHING. */
export function renderableJobError(lang: VideoStudioLang, error: string | null | undefined): string | null;
```

Every error surface in this section (`StageLaunchCard`, `StageEstimateDialog`,
`RenderPanel`) routes through it. `RenderPanel`'s current
`description={queueRender.error.message}` is a live instance of the same gap —
fix it while you are there.

### 4.2 `qaPanelState.ts` (NEW, pure — zero React, zero trpc)

```ts
export type StagePanelStatus =
  | "loading" | "empty" | "running" | "success" | "error";

export type QaReviewView = {
  status: StagePanelStatus;
  /** Newest ledger entry, or the just-finished job's review. */
  latest: QaLedgerEntry | null;
  /** Previous entry, for the before/after delta the interview requires. */
  previous: QaLedgerEntry | null;
  /** TRUE when the document moved on since `latest` was produced. */
  isStale: boolean;
  staleReason: "revision_changed" | "unsaved_changes" | null;
  /** Actual credits reported by the finished job record, if any. */
  actualCreditsUsed: number | null;
  /** TRUE when the job terminated `failed` — credits may still have been spent. */
  failedButPossiblyBilled: boolean;
  errorMessage: string | null;
};

/** PURE. `jobStatus` / `qaLedger` are `unknown`-shaped at runtime (Redis and
 *  jsonb round-trips) — normalise defensively, never throw. */
export function deriveQaReviewView(args: {
  qaLedger: unknown;
  projectRevision: number;
  hasUnsavedChanges: boolean;
  jobStatus: unknown;
}): QaReviewView;

/** PURE. Ordered high -> medium -> low; unknown severities sort last, never dropped. */
export function groupIssuesBySeverity(review: VideoProjectReview): Array<{
  severity: "high" | "medium" | "low" | "unknown";
  issues: VideoProjectReview["issues"];
}>;

/** PURE. Primary source is the finished job's `blocksFinalRender`. When no job
 *  result is present, fall back to an ADVISORY check on the local document
 *  (`claims[].status` in {prohibited, unsupported}) — labelled in the UI as
 *  derived from the document, never presented as the server verdict. */
export function deriveClaimBlock(args: {
  document: VideoProjectDocument;
  jobResult: unknown;
}): { blocked: boolean; source: "job" | "document"; offendingClaimCount: number };

/** PURE. Zero-cost repair stages consume no LLM call (plan §7.1). */
export const ZERO_COST_REPAIR_STAGES = ["captions", "scenes", "motion"] as const;
export const LLM_REPAIR_STAGES = ["content", "narration", "claims"] as const;
export function isZeroCostRepairStage(stage: string): boolean;
```

**Staleness rule (exact, because it is the one required state most likely to be
skipped):** `isStale` is true when either
`latest.revision !== projectRevision` (→ `"revision_changed"`) **or**
`hasUnsavedChanges === true` (→ `"unsaved_changes"`). `revision_changed` wins
when both hold. A stale review is still **shown** — marked stale, never hidden
and never presented as current.

### 4.3 `StageEstimateDialog.tsx` (NEW)

```tsx
export function StageEstimateDialog(props: {
  lang: VideoStudioLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: "scene_plan" | "quality_review" | "quality_repair";
  /** section-04 §4.4 payload; undefined while loading or on error. */
  estimate: StageEstimate | undefined;
  isLoading: boolean;
  /** Raw error from the estimate query — routed through renderableJobError. */
  error?: string | null;
  /** Destructive re-run (scene plan `replace`): renders a warning and gates
   *  Confirm behind an explicit acknowledgement control. */
  destructive?: { title: string; body: string } | null;
  isConfirming?: boolean;
  onConfirm: () => void;
}): JSX.Element;
```

Reuse the Astryx `Dialog` + `Layout` / `LayoutContent` / `LayoutFooter` +
`DialogHeader` composition already used by `CatalogCreateDialog.tsx` — do not
introduce a second dialog pattern.

Rules the tests lock:

- The **headline number is `ceilingCredits`** and it is explicitly labelled a
  ceiling ("อย่างมาก" / "at most"). `typicalCredits` is shown beside it. Both
  the `perRoundCredits × callsPerRoundCeiling × maxLoops` reasoning and the
  "actual billing follows real token usage" sentence are visible copy.
- `modelId` and `maxLoops` are shown — the user is confirming a price for a
  specific model.
- A collapsible/secondary "why this number" block renders `basis`
  (scenes / narration chars / caption chars / layers / claims / est. tokens).
- **Confirm is disabled** while `isLoading`, when `estimate` is undefined, when
  `error` is set, and — when `destructive` is present — until the acknowledgement
  is ticked.
- The dialog never calls a mutation itself; it only calls `onConfirm`.

### 4.4 `StageLaunchCard.tsx` (NEW, shared shell)

```tsx
export function StageLaunchCard(props: {
  lang: VideoStudioLang;
  title: string;
  buttonLabel: string;
  icon?: React.ReactNode;
  testId: string;                    // keep the EXISTING ids (see §6.6)
  jobStatus?: { status: "queued" | "running" | "succeeded" | "failed";
                error: string | null;
                progress: { stage: string; message?: string } | null } | null;
  /** Non-null = launch blocked; renders the reason banner and disables the
   *  button. Used for unsaved changes (spec §6.4 rule 2). */
  blockedReason?: { title: string; body?: string } | null;
  isPending?: boolean;
  onRun: () => void;                 // opens the estimate dialog — NOT the mutation
  children?: React.ReactNode;        // stage-specific controls (e.g. re-run mode)
}): JSX.Element;
```

Never hides the button (the Guided-mode rule inherited from `NotWiredJobCard`);
shows progress while `queued`/`running`; renders terminal errors through
`renderableJobError`.

---

## 5. Tests first (TDD)

### 5.0 Conventions that make these tests look native

- Client tests run under **jsdom** (`vitest.config.ts` scopes jsdom to
  `client/src/**/*.test.tsx`). A pure `*.test.ts` in the same folder is fine.
- Use the **hand-rolled `@/lib/trpc` mock** from
  `client/src/pages/__tests__/VideoStudioWorkspacePage.test.tsx:42-78`:
  `useMutation` returns `{ mutate: (input) => mock(input, opts), isPending: false }`
  so **both the input and the callbacks are assertable**. `useQuery` returns a
  plain object from a `vi.fn()`.
- **Astryx `Dialog` needs jsdom patching** in `beforeEach`
  (`CatalogCreateDialog.test.tsx:20-27`):
  `HTMLDialogElement.prototype.showModal` / `.close` assigned to `vi.fn()`.
- Mock `react-i18next` with `useTranslation: () => ({ i18n: { language: "th" } })`
  when the component under test uses `useVideoStudioLang`; panels receive `lang`
  as a prop, so most tests can pass `lang="en"` and assert English copy.
- Use `mockReturnValue` / `mockResolvedValue` (persistent), never `…Once` — this
  repo has a recorded failure class where a leaked `…Once` queue produced
  misleading downstream failures.
- **Baseline discipline:** record the failing-set **identity** before starting and
  compare identity, not counts.

### 5.1 `__tests__/videoStudioCopy.test.ts` (pure) — FE03 migration

The assertions below replace `NotWiredJobCard.test.tsx`. **Write them before
deleting that file**, so the security property is never uncovered.

```ts
describe("renderableJobError (FE03 allowlist, carried over from NotWiredJobCard)", () => {
  it("returns a VI_-prefixed error verbatim");
  it("returns the generic message for an arbitrary non-VI_ error (no verbatim echo)");
  it("returns the generic message for an HTML-looking payload");
  it("returns null for null/empty input");
});

describe("videoStudioCopy", () => {
  it("no longer exports notWiredTitle / notWiredBody");
  it("every new key has BOTH a th and an en string");   // no missing-locale drift
});
```

### 5.2 `__tests__/qaPanelState.test.ts` (pure, no render)

```ts
describe("deriveQaReviewView", () => {
  it("returns 'empty' when the ledger has no entries and there is no job");
  it("returns 'running' while the job is queued or running");
  it("returns 'error' with the job error when the job failed");
  it("returns 'success' with the newest ledger entry as `latest`");
  it("exposes the previous entry so the UI can show a before/after score delta");

  // staleness — the required state most likely to be skipped
  it("marks stale with reason 'revision_changed' when latest.revision !== projectRevision");
  it("marks stale with reason 'unsaved_changes' when hasUnsavedChanges is true");
  it("prefers 'revision_changed' when both conditions hold");
  it("is NOT stale when revisions match and there are no unsaved changes");
  it("still returns `latest` when stale — a stale review is marked, never hidden");

  // cost honesty
  it("reports actualCreditsUsed from a succeeded job result");
  it("sets failedButPossiblyBilled on a failed job — failure is not implied to be free");

  // defensive normalisation (Redis / jsonb round-trips are `unknown`)
  it("treats a null / array / malformed qaLedger as empty instead of throwing");
  it("treats a malformed job result as absent instead of throwing");
});

describe("groupIssuesBySeverity", () => {
  it("orders high, then medium, then low");
  it("keeps an unrecognised severity in an 'unknown' group instead of dropping the issue");
});

describe("deriveClaimBlock", () => {
  it("uses the job result's blocksFinalRender when a job result is present (source 'job')");
  it("falls back to document claims with status prohibited/unsupported (source 'document')");
  it("counts the offending claims so the banner can be specific");
});

describe("repair cost classes", () => {
  it("captions/scenes/motion are zero-cost; content/narration/claims are not");
});
```

### 5.3 `__tests__/StageEstimateDialog.test.tsx`

```ts
it("shows ceilingCredits as the headline number and labels it a ceiling");
it("shows typicalCredits alongside the ceiling");
it("shows the resolved modelId and maxLoops");
it("states that actual billing follows real token usage");
it("renders the basis block (scenes, narration chars, layers, claims, est. tokens)");
it("disables Confirm while the estimate is loading");
it("disables Confirm and shows an admin-actionable message on VI_NO_RECOMMENDED_MODEL");
it("disables Confirm and shows a top-up message on VI_INSUFFICIENT_CREDITS");
it("does not echo a non-VI_ estimate error verbatim");                 // FE03
it("calls onConfirm exactly once when Confirm is clicked");
it("gates Confirm behind the acknowledgement when `destructive` is set");
it("never calls a mutation itself");
```

### 5.4 `__tests__/QaPanel.test.tsx` (the file named in `claude-plan.md` §3.2)

Covers every item in `claude-plan-tdd.md` §5 that belongs to QA.

```ts
it("renders score, per-dimension scorecard and issues grouped by severity");
it("renders skill-authored issue messages verbatim (content language, not translated)");
it("renders an unknown scorecard dimension key instead of dropping it");   // keys are open
it("shows the estimate dialog and does NOT run the stage until confirmed");        // D4
it("passes projectId and baseRevision into runQualityReview on confirm");
it("renders a claim-compliance block as a distinct error banner, not an opinion");
it("marks a review STALE when the document changed since it was produced");
it("marks a review STALE while there are unsaved changes, and blocks launch with the reason");
it("reports actual credits from the job record after a run");
it("does not imply a failed stage was free");                                     // §9.4 rule 4
it("labels captions/scenes/motion repairs as free and content/narration/claims as billable");
it("passes the selected repair stages into applyQualityRepairs");
it("lists each repair round with its score delta (before/after)");                 // D1
it("offers one-click revert per repair round and calls restoreRevision with that round's revision");
it("asks for confirmation before reverting");
it("renders every state: loading, empty, success, error, unsaved-changes, stale");
it("keeps the existing claims editor working (add / edit / remove)");             // regression
```

### 5.5 `__tests__/ScenesPanel.test.tsx`

```ts
it("shows the estimate dialog and does NOT run the stage until confirmed");
it("defaults the re-run mode to fill_empty");
it("requires a confirmation for the destructive 'replace' re-run mode");
it("passes mode and baseRevision into runScenePlanStage");
it("blocks launch with a reason banner while there are unsaved changes");
it("surfaces VI_PLAN_LAYER_BUDGET_EXCEEDED / VI_PLAN_TIMELINE_INVALID as specific copy");
it("does not echo a non-VI_ job error verbatim");                                  // FE03
it("calls onDocumentSaved after a succeeded scene_plan job so the draft is refreshed");
it("keeps the existing scene editor working (add / remove / edit timing)");        // regression
```

### 5.6 `pages/__tests__/VideoStudioWorkspacePage.test.tsx` (CHANGED)

⚠️ **This file will break the moment a panel adds a new trpc hook** — the mock is
hand-rolled and lists procedures explicitly (`:42-78`). Extend it with
`getStageEstimate.useQuery`, `listRevisions.useQuery`, `restoreRevision.useMutation`
before touching the panels, or every workspace test fails with an unhelpful
"cannot read properties of undefined".

```ts
it("passes hasUnsavedChanges into the Scenes and QA panels");
it("does not dispatch a stage while the workspace holds unsaved changes");   // spec §14.5
it("refetches the project after a stage job completes (onDocumentSaved)");
it("navigates to the QA stage from the RenderPanel claim-violation action");
```

### 5.7 Deletion

`__tests__/NotWiredJobCard.test.tsx` is removed together with the component. Its
`VI_*_NOT_WIRED` allowlist assertions are meaningless once no `*_NOT_WIRED` error
can be produced — but its **security** assertion is not, which is why §5.1 must
land first.

---

## 6. Implementation guidance

### 6.1 Wiring the estimate → confirm → run flow (identical in all three launches)

```
click "Run …"           -> setEstimateOpen(true)            // NO mutation yet
dialog open             -> getStageEstimate.useQuery({ projectId, stage }, { enabled: open, staleTime: 0 })
click "Confirm"         -> mutation.mutate({ projectId, baseRevision, …stageArgs })
mutation onSuccess      -> poll.setJobId(result.jobId); setEstimateOpen(false)
poll -> succeeded       -> show result + actual credits; call onDocumentSaved()
```

- `enabled: open` keeps the estimate off the panel-mount path; `staleTime: 0`
  keeps the quoted model fresh, because the model that is quoted is the model
  that dispatch pins.
- The **run button must not call the mutation** (D4). One test locks this per
  panel; it is the single easiest regression to introduce here.

### 6.2 `QaPanel.tsx`

Keep the existing claims editor and QA-target card untouched — they already work
and have no reason to change. Replace only the two `NotWiredJobCard` blocks.

Structure, top to bottom:

1. **Review launch card** (`StageLaunchCard`, testId `video-studio-run-quality-review`)
   with the estimate dialog.
2. **Scorecard card**, rendered from `view.latest.review`:
   - overall `score` as a large number out of 10 plus a `Badge`
     (`success` ≥ targetScore, `warning` otherwise);
   - a **stale marker** when `view.isStale` — a `Badge`/`Banner status="warning"`
     naming the reason and offering "re-run review". Never hide the score.
   - per-dimension bars from `review.scorecard`. **Keys are open** (section-03:
     Motion Studio reviews legitimately omit `product_claim_compliance` /
     `product_fidelity`). Render whatever keys arrive, humanised
     (`replace(/_/g, " ")`); never map through a fixed list. Use
     `@astryxdesign/core/Progressbar` if the installed package exports it —
     otherwise a width-styled `div` with `role="progressbar"`,
     `aria-valuenow/min/max` and an accessible label. Do not import a
     non-Astryx bar component into this folder.
3. **Claim-compliance banner** — `Banner status="error"` when
   `deriveClaimBlock(...).blocked`. This is a **gate, not an opinion**: distinct
   from the issues list, above it, and worded as "cannot render final until
   fixed". When `source === "document"`, say the check is derived from the
   current document (the server verdict arrives with the next review).
4. **Issues list** via `groupIssuesBySeverity` — Badge variants
   `error` / `warning` / `neutral`, `dimension` as the label, `message` rendered
   **verbatim** (skill-authored, already in `document.content.language`; the i18n
   rule forbids translating it).
5. **Repair card** — per-stage buttons for the stages present in
   `review.repairInstructions` (fall back to the distinct `issues[].repairStage`
   values), each tagged **ฟรี / Free** or **ใช้เครดิต / Uses credits** from
   `isZeroCostRepairStage`, plus an "apply all". Launch goes through the same
   estimate dialog; when the selection contains no LLM-backed stage the dialog
   shows 0 credits and says no AI call will be made.
6. **Round history** — one row per `qaLedger.entries` entry (newest first):
   round, timestamp, score with the delta vs the previous entry, issue count,
   `creditsUsed`, `modelId`, and a **Revert** button.
   - Revert calls `restoreRevision({ projectId, revision: entry.revision })` —
     restoring the revision that review **judged** returns the document to the
     state before that round's repairs. Confirm first (Astryx `Dialog`), then on
     success call `onDocumentSaved()`.
   - This is the D1 safety net; it is load-bearing because the user never
     approved the individual edit.
7. **Cost line** — after a run: "ใช้จริง X เครดิต / Actual: X credits" from
   `view.actualCreditsUsed`, next to the number that was quoted. When
   `view.failedButPossiblyBilled`, show the explicit "a failed stage may still
   have cost credits" copy. **Never** print or imply 0 for a failed stage.

### 6.3 `ScenesPanel.tsx`

- Replace `NotWiredJobCard` with `StageLaunchCard` (testId unchanged:
  `video-studio-run-scene-plan`) and put the re-run mode selector in its
  `children`: an Astryx `Selector` with `fill_empty` (default) and `replace`.
- `fill_empty` plans only empty scenes; `replace` re-plans everything. When
  `replace` is selected, pass `destructive` into `StageEstimateDialog` so Confirm
  is gated behind an explicit acknowledgement (spec §6.7). Say plainly that the
  previous document is kept as a revision and can be reverted.
- Map planner error codes to specific copy (`VI_PLAN_TEMPLATE_UNKNOWN`,
  `VI_PLAN_PARAMS_INVALID`, `VI_PLAN_LAYER_BUDGET_EXCEEDED`,
  `VI_PLAN_TIMELINE_INVALID`) and state the reassuring, true fact that the
  document was left unchanged (section-05 validates fail-closed before any
  write). Anything not `VI_`-prefixed goes through `renderableJobError`.

### 6.4 The draft-vs-server-document trap (read this before coding)

The panels edit an **in-memory draft**; a stage job mutates the **server**
document and bumps `revision`. If the panel keeps the old draft after a job
succeeds, the next Save silently overwrites everything the AI just wrote.

Reuse the mechanism `NarrationPanel` already uses: an `onDocumentSaved` callback
that the workspace implements as `setBaseRevision(null); projectQuery.refetch();`
(`VideoStudioWorkspacePage.tsx:216-219`) — the `baseRevision === null` reset is
what re-seeds `draftDocument` from the server in the page's effect.

- Fire it when a `scene_plan`, `quality_repair` **or** `quality_review` job
  reaches `succeeded` (review appends to the ledger and may change `status`).
- Fire it on a successful `restoreRevision`.
- Fire it **once** per terminal transition — guard on the jobId you already
  handled, or the refetch loop will fight the poll.

### 6.5 Unsaved-changes guard (spec §6.4 rule 2)

Thread `hasUnsavedChanges` from the workspace into `ScenesPanel` and `QaPanel`
(`RenderPanel` already receives it). When true, pass `blockedReason` into
`StageLaunchCard`: the run button is disabled and the reason is stated, reusing
`videoStudioCopy.unsavedChanges` plus a "save before running" line — the same
wording pattern as `RenderPanel`'s existing unsaved-changes banner. Do not invent
a second pattern, and do not silently disable a button without saying why.

### 6.6 Test ids — keep the existing ones

`video-studio-run-scene-plan`, `video-studio-run-quality-review`,
`video-studio-apply-quality-repairs`, `video-studio-qa-panel`,
`video-studio-scenes-panel`, `video-studio-render-panel` already exist and are
referenced by shipped tests. Keep them. New ids follow the same prefix:
`video-studio-stage-estimate-dialog`, `video-studio-stage-estimate-confirm`,
`video-studio-qa-scorecard`, `video-studio-qa-claim-block`,
`video-studio-qa-stale`, `video-studio-qa-round-<n>-revert`,
`video-studio-scene-plan-mode`.

### 6.7 `RenderPanel.tsx`

- Add an `onGoToQa: () => void` prop; the workspace passes `() => setStage("qa")`.
- On `VI_CLAIM_VIOLATION`, keep `videoStudioCopy.claimViolation` as the title and
  add an `endContent` Button ("ไปที่ขั้นตอนตรวจสอบคุณภาพ" / "Go to QA") that calls
  it. Actionable, not a dump.
- Replace `description={queueRender.error.message}` with
  `renderableJobError(lang, queueRender.error.message)` — same FE03 rule as
  everywhere else in this section.

### 6.8 Copy additions (`videoStudioCopy.ts`)

Remove `notWiredTitle` / `notWiredBody`. Add (Thai first — the app is Thai-first;
these are the exact strings, so no bare strings end up in components):

| Key | th | en |
|---|---|---|
| `estimateTitle` | ประมาณการเครดิตก่อนเริ่ม | Credit estimate before running |
| `estimateCeiling` | ใช้เครดิตอย่างมาก | At most |
| `estimateTypical` | โดยทั่วไปประมาณ | Typically about |
| `estimateCeilingNote` | เป็นเพดานสูงสุด (ตรวจ + ซ่อม + ตรวจซ้ำ ต่อรอบ) การเรียกเก็บจริงคิดตามจำนวนโทเค็นที่ใช้จริง | This is a ceiling (review + repairs + re-review per round). Actual billing follows real token usage. |
| `estimateModel` | โมเดลที่ใช้ | Model |
| `estimateMaxLoops` | จำนวนรอบสูงสุด | Max rounds |
| `estimateBasis` | ที่มาของตัวเลข | Why this number |
| `estimateConfirm` | ยืนยันและเริ่ม | Confirm and run |
| `noRecommendedModel` | ยังไม่มีโมเดลที่แนะนำและรองรับผลลัพธ์แบบมีโครงสร้าง กรุณาติดต่อผู้ดูแลระบบ | No recommended structured-output model is available. Please contact an administrator. |
| `insufficientCredits` | เครดิตไม่พอสำหรับขั้นตอนนี้ | Not enough credits for this stage |
| `saveBeforeRunning` | บันทึกการเปลี่ยนแปลงก่อนเริ่มขั้นตอนนี้ | Save your changes before running this stage |
| `qaEmpty` | ยังไม่เคยตรวจสอบคุณภาพโปรเจกต์นี้ | This project has not been reviewed yet |
| `qaScore` | คะแนนรวม | Overall score |
| `qaStale` | ผลตรวจนี้ล้าสมัย (เอกสารเปลี่ยนไปหลังการตรวจ) | This review is out of date — the document changed after it was produced |
| `qaStaleUnsaved` | ผลตรวจนี้ยังไม่รวมการแก้ไขที่ยังไม่ได้บันทึก | This review does not include your unsaved changes |
| `qaRerun` | ตรวจสอบใหม่ | Re-run review |
| `qaIssuesHigh` / `qaIssuesMedium` / `qaIssuesLow` | รุนแรง / ปานกลาง / เล็กน้อย | High / Medium / Low |
| `qaClaimBlockTitle` | ติดล็อกการอ้างสิทธิ์ — ยังเรนเดอร์ไฟล์จริงไม่ได้ | Claim compliance blocks the final render |
| `qaClaimBlockFromDocument` | ตรวจจากเอกสารปัจจุบัน (ผลจากเซิร์ฟเวอร์จะมาพร้อมการตรวจครั้งถัดไป) | Derived from the current document — the server verdict arrives with the next review |
| `repairFree` | ฟรี (ไม่เรียกใช้ AI) | Free (no AI call) |
| `repairBillable` | ใช้เครดิต | Uses credits |
| `repairApplyAll` | ซ่อมทั้งหมด | Repair all |
| `qaRound` | รอบที่ | Round |
| `qaRevert` | ย้อนกลับรอบนี้ | Revert this round |
| `qaRevertConfirm` | ย้อนเอกสารกลับไปสถานะก่อนการซ่อมรอบนี้? | Revert the document to its state before this repair round? |
| `creditsActual` | ใช้จริง | Actual |
| `creditsFailedNotFree` | ขั้นตอนล้มเหลว แต่เครดิตอาจถูกใช้ไปแล้วบางส่วน | The stage failed, but credits may already have been spent |
| `scenePlanMode` | โหมดการวางแผนซ้ำ | Re-run mode |
| `scenePlanModeFillEmpty` | วางแผนเฉพาะฉากที่ยังว่าง | Plan only empty scenes |
| `scenePlanModeReplace` | วางแผนใหม่ทั้งหมด (แทนที่ของเดิม) | Re-plan everything (replaces existing) |
| `scenePlanReplaceWarning` | จะเขียนทับฉากที่คุณแก้ไขเอง เอกสารเดิมถูกเก็บเป็นเวอร์ชันย้อนกลับได้ | This overwrites scenes you edited manually. The previous document is kept as a revertable revision. |
| `planLayerBudget` | แผนฉากใช้เลเยอร์เกิน 40 จึงเรนเดอร์ไฟล์จริงไม่ได้ ระบบไม่ได้แก้ไขเอกสารเดิม | The plan exceeds the 40-layer budget, so it could never be final-rendered. Your document was left unchanged. |
| `planTimelineInvalid` | ช่วงเวลาของฉากซ้อนทับหรือเกินความยาววิดีโอ ระบบไม่ได้แก้ไขเอกสารเดิม | Scene timings overlap or exceed the video duration. Your document was left unchanged. |
| `goToQa` | ไปที่ขั้นตอนตรวจสอบคุณภาพ | Go to QA |

---

## 7. Traps and non-negotiables

1. 🔴 **The FE03 allowlist must land before `NotWiredJobCard` is deleted.**
   Write `renderableJobError` + its test first (§5.1); only then remove the
   component and its test. Deleting first leaves a window with no coverage and a
   real verbatim-echo path in `RenderPanel`.
2. 🔴 **The run button must not run the stage.** Estimate → confirm → run is
   decision D4, and one confirm authorises the whole auto-repair loop (D1). A
   button that dispatches directly silently spends the ceiling.
3. **Quote the ceiling, label it a ceiling.** Under-quoting a number the user
   clicks "confirm" on is the failure mode this design exists to avoid.
4. **Never imply a failed stage was free.** A provider call that succeeded and
   then failed schema validation is already billed by `callLLMStructured`.
5. **A stale review is marked, never hidden and never shown as current.** Both
   staleness reasons must be implemented — `revision_changed` alone is a
   half-fix, because the draft can diverge without any save.
6. **Scorecard keys are open.** A fixed dimension list wrongly rejects a valid
   Motion Studio review.
7. **Skill-authored text is rendered verbatim** in the project's content
   language. Only platform chrome goes through `pickCopy`. No bare strings in
   components either way.
8. **Refresh the draft after every successful stage job** (§6.4) or the next
   Save overwrites the AI's work. This is the same failure class already recorded
   for full regeneration wiping manual edits.
9. **The workspace test's hand-rolled trpc mock must be extended first** (§5.6),
   or every new hook crashes it with an unrelated-looking error.
10. **Keep existing `data-testid`s.** Shipped tests select on them.
11. **Do not import `server/*` from the client.** The review type comes from
    `@shared/videoIntelligence/qaLedger` (§2.4).
12. **Astryx-only inside `components/videoStudio/`**, and keep the
    Astryx-exception docstring on every new file.
13. **Deployment:** this section is client-only, so
    `cd apps/web && npm run build:deploy` ships it with no restart — but it is
    inert until sections 04–06's server changes are live
    (`sudo systemctl restart smartspec-web.service`).

---

## 8. Exit criteria

- Every stage launch goes through estimate → confirm → run; no panel dispatches a
  stage without an explicit confirm.
- The QA tab shows a real score, per-dimension bars, issues grouped by severity,
  and a distinct claim-compliance gate banner.
- A review whose document moved on is visibly marked **stale**, with the reason,
  and is still readable.
- Reported credits match the job record; a failed stage is never presented as
  free.
- Every repair round is listed with its score delta and is revertable in one
  click through the existing `restoreRevision` procedure.
- `replace` scene planning cannot be launched without an explicit destructive
  acknowledgement.
- `VI_CLAIM_VIOLATION` in the render panel offers a route back to QA instead of a
  raw error dump.
- No user-facing string bypasses `videoStudioCopy` + `pickCopy`; every new key has
  both `th` and `en`.
- `NotWiredJobCard.tsx` and `NotWiredJobCard.test.tsx` no longer exist, and the
  FE03 allowlist is covered by `videoStudioCopy.test.ts`.
- Full `apps/web` suite run at the section boundary; failing-set **identity**
  matches the recorded baseline plus only intentionally-changed files.