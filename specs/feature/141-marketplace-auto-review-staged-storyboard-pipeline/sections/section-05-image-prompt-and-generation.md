# Section 05 — deterministic image prompts, image generation, and image-result gate

## Purpose and scope

This section turns the approved story into one deterministic image prompt per
shot, pauses for user approval of each exact prompt, generates only approved
shots, validates each image, and pauses again for image-result acceptance before
any video work. Approval is never copied between shots.

Dependencies: Sections 01–04.

## Tests first

Write tests before implementation:

- `apps/web/server/services/__tests__/marketplaceAutoReviewStagedPromptCompiler.test.ts`
  golden snapshots cover the supported GPT Image 2 and Nano Banana 2 adapter
  shapes;
- snapshots prove byte-for-byte preservation of the approved `storySummary`,
  correct reference-role mapping, compact product-preservation clause rules,
  and no prohibited creative prose or hidden prompt enhancer;
- ordered reference-manifest, attachment, model, cost, safety, story-revision,
  and compiled/submitted hash drift fixtures fail before provider submission;
- nine image-prompt checkpoints are created and visible, with none auto-approved;
- approving shot 1 releases only shot 1 image work;
- image task/provider assertions prove no task exists before prompt approval;
- product-fidelity QA fixtures distinguish hard mismatch (non-overridable), valid
  output, allowed warning, missing artifact, unsafe output, and corrupted media;
- allowed-warning acceptance records evidence and creates `image_result` approval;
- rejected image regeneration is shot-local, bounded, and requires a new prompt
  or result approval as appropriate;
- continuity dependencies and per-run/per-shot active-attempt limits hold under
  duplicate worker/retry races;
- the accepted image artifact/hash supplied to Section 06 is exact.

Suggested test locations:

- `apps/web/server/services/__tests__/marketplaceAutoReviewStagedPromptCompiler.test.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedImageGate.test.ts`;
- existing sequential image/reference/shot-regeneration suites as regression
  targets.

## Implementation contract

### Files

- create `apps/web/server/services/marketplaceAutoReviewStagedPromptCompiler.ts`;
- add the compiler test file above;
- modify image scheduling/QA branches in
  `apps/web/server/services/marketplaceAutoReviewService.ts`;
- reuse deterministic reference and product-prompt helpers from
  `apps/web/server/services/productReferenceStoryboardSkillRunner.ts` and the
  existing shared Vertical Drama prompt policy tests where compatible;
- use existing media-task/provider capability infrastructure in
  `apps/web/server/services/mediaGenerationService.ts` and
  `apps/web/server/services/mediaProviderUtils.ts`;
- persist trace/prompt/manifest artifacts through the existing Marketplace Auto
  Review artifact helpers;
- expose result/retry state to the review components named in Section 08.

### Deterministic compiler

The compiler consumes only the approved story plan, normalized evidence,
reference manifest, selected model, and server-controlled product-preservation
policy. The default synopsis-direct shape is:

1. preserve the approved story summary verbatim;
2. map references and their roles deterministically;
3. append only the compact strict product-preservation clause when product
   presence requires it;
4. normalize/bound the prompt and compute content/reference/model/cost hashes.

The compiler must not add arbitrary prompt enhancers, rewrite approved story text,
or silently change attachment order. Capability limits, aliases, attachment
limits, and pricing come from the repository's versioned provider catalog at
implementation time.

Create one `image_prompt` checkpoint per shot. The review projection shows the
exact prompt, reference roles, attachment list, model/provider, estimated image
cost, safety warnings, revision, and hash indicator. Approval of one checkpoint
releases only that shot's image reservation/submission.

### Image generation and QA

The worker schedules only prompt-approved shots through existing durable media
tasks, leases, and attempts. One shot has at most one active attempt; the run
uses the configured bounded image concurrency. If a prompt/model/reference/
cost/safety revision changes before submission, the shared guard supersedes the
approval and stops the task.

After provider completion, persist the image artifact/hash, actual cost, QA
evidence, continuity result, and safe warnings. Create `image_result` in
`awaiting` only after the artifact passes structural safety checks. The user may
accept a valid result or explicitly allowed warning. Hard product mismatch,
unsafe result, missing artifact, or corruption cannot be overridden. Rejection
invalidates only that shot's downstream state and creates a bounded regeneration
attempt.

No Shot Video Director call, video prompt artifact, video reservation, or video
provider task is permitted until the exact accepted image result checkpoint is
approved by the shared Section 03 guard.

## Acceptance criteria

- Every shot has an independently reviewable exact image prompt.
- No image provider task or media reservation exists before matching prompt
  approval and immediate worker-side recheck.
- Every generated image has a separate inspect/accept/reject checkpoint.
- Hard product-fidelity failure cannot be overridden and never releases video.
- Accepted image hash, prompt hash, model, references, safety, and cost are all
  traceable in the downstream handoff.
- Retry/reload/duplicate worker behavior is shot-local and idempotent.

## Handoff

Section 06 receives only the accepted image artifact/hash and the shot's approved
story/dialogue context. It must not read an unaccepted image or regenerate a
video prompt for another shot.

## Implementation record

Added the deterministic staged prompt compiler and sequential image pipeline.
Each shot receives its own revision/hash-bound `image_prompt` checkpoint; the
worker consumes only the approved shot checkpoint, submits through the existing
media generation service with the product reference, polls by the real user
identity, and creates `image_result=awaiting` only after an artifact exists. The
image-only output mode stops before video and uses the final assembly review as a
non-render completion gate. Rejection/retry is shot-local.

Proof: `marketplaceAutoReviewStagedPromptCompiler.test.ts`, staged pipeline and
checkpoint guard suites, and the UI checkpoint component tests.
