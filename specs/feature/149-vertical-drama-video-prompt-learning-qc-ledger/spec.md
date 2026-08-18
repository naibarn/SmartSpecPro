# Feature 149: Vertical Drama Video Prompt Learning and QC Ledger

**Status:** SPEC READY FOR REVIEW — implementation not started by this spec
**Version:** 1.0.0
**Created:** 2026-08-18
**Priority:** P0 — credit protection and production reliability
**Owner:** Vertical Drama / Media Generation / Quality
**Depends-on:** Existing Vertical Drama episode pipeline, `motionPromptPack`,
`verticalDramaVideoMotionPromptGeneration`, `verticalDramaClipIdentityQc`,
`verticalDramaQcReports`, run artifacts, media task persistence, tenant-scoped
media authorization, and existing feature-flag infrastructure
**Related:** Feature 137 identity-stable I2V pipeline, Feature 138 scene
continuity QC, Feature 144 character visual identity prompts, Feature 112
skill-based prompt generation and QA loop

This feature adds an immutable learning and evidence layer around Vertical Drama
video prompts and generated clips. It does not replace the existing media
provider, prompt generator, episode pipeline, or video task authority.

## 1. Executive decision

SmartSpecPro should record every future Vertical Drama video-prompt attempt and
connect it to the paid video render, post-video QC, and user feedback. The
record is an auditable lineage, not an uncontrolled self-training loop.

The system must learn in this order:

```text
Prompt and references
        |
        v
No-credit deterministic preflight
        |
        +--> block / ask for correction when confidence is high
        |
        v
Paid video generation (existing provider/task path)
        |
        v
Post-video QC and sampled evidence
        |
        v
User labels and corrections
        |
        v
Failure clusters and policy proposals
        |
        v
Human approval + versioned policy rollout
```

Raw failures must never directly rewrite the active prompt skill or silently
change the next user's prompt. A policy proposal is a versioned artifact that
requires approval, regression coverage, rollout controls, and rollback.

## 2. Problem statement

Video prompt failures are the largest source of wasted generation credits in
the current Vertical Drama workflow. Recurring failures include:

1. The wrong character speaks or the wrong mouth moves.
2. Extra people, duplicate people, or unapproved background people appear.
3. A character's identity, face, age, hair, or wardrobe drifts.
4. The requested action is not performed or is assigned to the wrong person.
5. Poses, object interactions, or material motion violate basic physics.
6. Human and prop motion looks unnatural even when the scene is otherwise
   recognizable.
7. Dialogue timing exceeds the clip duration or the reaction cut is mistimed.
8. Ambiguous or crowded reference frames are sent to a paid provider without
   enough evidence that the model can identify the cast.

The current system already persists useful pieces such as `frameAnalysis`,
`castPositionLock`, `motionProfile`, `promptQuality`, `identityQc`, and
`videoTask`, but these are not yet a complete searchable lineage. In
particular, there is no durable, consistent link from a prompt version to the
actual video outcome and a human-labelled failure reason.

## 3. Goals

1. Record every new video-prompt generation with immutable provenance.
2. Link prompt, reference images, model/provider, credit transaction, video
   task, output asset, QC result, and user feedback.
3. Run deterministic preflight checks before any paid video generation.
4. Block high-confidence structural failures before credits are spent.
5. Extend post-video QC beyond identity to cast count, speaker alignment,
   timing, action consistency, and motion/physics risk.
6. Let users label a bad clip in a few clicks with a standard failure taxonomy.
7. Aggregate failures by prompt policy, model family, provider, scene type,
   and reference quality.
8. Produce versioned, reviewable policy/rule proposals from repeated failures.
9. Preserve immutable history so a bad policy can be diagnosed and rolled back.
10. Keep tenant isolation, media ACLs, credit accounting, and existing task
    ownership unchanged.

## 4. Non-goals

1. Do not build a new video-generation provider or queue.
2. Do not automatically fine-tune or retrain a model in the MVP.
3. Do not let one user's feedback change prompts for all tenants immediately.
4. Do not silently regenerate a failed video or spend more credits.
5. Do not make every post-video QC check a paid external vision call.
6. Do not replace `vertical_drama_episodes.motionPromptPack` as the current
   rendering projection during the first rollout.
7. Do not store unrestricted provider URLs, user secrets, or arbitrary files in
   the learning ledger.
8. Do not claim that physics or natural motion can be guaranteed before the
   provider renders a clip.

## 5. Existing compatibility baseline

The implementation must extend these existing seams rather than creating a
parallel prompt or media authority:

| Existing seam | Required use |
| --- | --- |
| `verticalDramaVideoMotionPromptGeneration` | Emit the prompt provenance snapshot and preflight result at the authoritative generation boundary. |
| `motionPromptPack.clips[]` | Continue to hold the renderable prompt projection; add only optional IDs/status fields. |
| `frameAnalysis`, `castPositionLock`, `motionProfile` | Use as deterministic evidence for identity, position, risk, and preflight checks. |
| `promptQuality` | Preserve the existing candidate/judge record and link it to the learning event. |
| `verticalDramaClipIdentityQc` | Extend the existing sampled post-video identity flow instead of creating a second sampler. |
| `vertical_drama_run_artifacts` | Store immutable full prompt/provenance and evidence payloads with checksums. |
| `vertical_drama_qc_reports` | Store stage-level QC summaries and recommended repairs. |
| `vertical_drama_memory_events` | Store approved cross-shot/series learning facts only after human approval; do not use it as a raw event dump. |
| Existing media task and credit services | Remain the authority for provider jobs, credit transactions, and output assets. |
| Existing tenant/media ACL services | Authorize every prompt, evidence frame, and video access. |

## 6. Core invariants

1. Every paid render has exactly one immutable prompt provenance record, even if
   the provider later fails.
2. A prompt record always identifies the exact start frame and additional
   reference assets by canonical IDs and hashes.
3. A prompt with a known high-confidence preflight failure cannot reach the paid
   video submit path.
4. A retry creates a new prompt attempt and never overwrites the old attempt.
5. A user correction is append-only and never edits historical QC evidence.
6. The active policy/skill version is recorded on every prompt attempt.
7. QC absence is distinguishable from QC pass; missing evidence must not be
   reported as success.
8. Credit deduction and learning-event writes are correlated but independently
   recoverable. A failed ledger write must not create a second credit charge.
9. All records are scoped by tenant, user, series, and episode as applicable.
10. Policy promotion requires approval, regression tests, rollout percentage,
    and rollback metadata.

## 7. Learning lifecycle

### 7.1 Prompt generation

At the canonical server boundary, create a `prompt_attempt` record before the
provider-facing video request is submitted. The record contains:

- episode, shot, clip, and run identifiers;
- prompt text and negative prompt in a content-addressed artifact;
- prompt and negative-prompt hashes;
- selected model, provider, model family, and capability snapshot;
- prompt skill version, policy version, and generator build/version;
- dialogue lines, speaker names, character keys, and custom descriptions;
- start-frame and reference asset IDs/checksums;
- `frameAnalysis`, `castPositionLock`, `motionProfile`, and `promptQuality`;
- duration, timing budget, native-audio capability, and audio mode;
- preflight status, risk score, warnings, and blocking reasons.

The prompt artifact is immutable. The JSONB episode projection may reference
the artifact but must not be the only copy of the evidence.

### 7.2 Paid render submission

When the existing video task is submitted, append a `render_submitted` event
with:

- media task ID and provider job ID;
- credit transaction ID and amount;
- provider request fingerprint (redacted and bounded);
- prompt attempt ID;
- submit timestamp and task status.

If submission fails before a provider job exists, record the failure without
creating a false video outcome. If the ledger is temporarily unavailable, the
request must use an idempotency key and reconcile later from the existing media
task/credit authority.

### 7.3 Render completion

Append a `render_completed` or `render_failed` event. A completed event links
the canonical `mediaAssetId`, MIME/size/checksum, duration, and provider result
metadata. The system must distinguish:

- provider failure;
- output unavailable/expired;
- output present but not yet sampled;
- output sampled and passed/warned/failed;
- user-rejected output.

### 7.4 QC and feedback

QC writes a structured report and links evidence frames/audio segments. User
feedback creates a separate append-only event referencing the same prompt
attempt and video asset. It never mutates the original prompt or QC report.

## 8. Data model

### 8.1 `vertical_drama_prompt_learning_events`

Add an append-only event table for searchable lineage. The exact Drizzle name
may follow repository naming conventions, but the contract must include:

```ts
type VideoPromptLearningEvent = {
  id: string;
  schemaVersion: number;
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  runId?: number;
  shotNumber?: number;
  clipNumber?: number;
  promptAttemptId: string;
  eventType:
    | "prompt_generated"
    | "preflight_passed"
    | "preflight_warned"
    | "preflight_blocked"
    | "render_submitted"
    | "render_completed"
    | "render_failed"
    | "qc_started"
    | "qc_completed"
    | "user_feedback"
    | "policy_proposed"
    | "policy_approved"
    | "policy_rolled_back";
  promptArtifactId?: string;
  evidenceArtifactId?: string;
  videoAssetId?: string;
  mediaTaskId?: string;
  creditTransactionId?: string;
  promptHash: string;
  policyVersion: string;
  skillVersion?: string;
  providerId?: string;
  modelId?: string;
  modelFamily?: string;
  status: "ok" | "warning" | "blocked" | "failed" | "pending";
  riskScore?: number;
  labels?: VideoPromptFailureLabel[];
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
};
```

Required indexes:

- tenant + series + created time;
- tenant + episode + shot + clip;
- prompt hash + policy version;
- model family/provider + event type + created time;
- video asset ID and media task ID;
- idempotency key unique within the owning tenant/run boundary.

### 8.2 Prompt provenance artifact

Store the full prompt and references in a `vertical_drama_run_artifacts` row
with stage `video_prompt_learning` or an equivalent versioned stage. Its
payload must include:

```ts
type VideoPromptProvenance = {
  prompt: string;
  negativeMotionPrompt?: string;
  dialogue: Array<{
    characterKey?: string;
    speakerName?: string;
    line: string;
    startSeconds?: number;
    endSeconds?: number;
  }>;
  references: Array<{
    role: "start_frame" | "character" | "location" | "additional";
    assetId: string;
    checksum?: string;
    characterKey?: string;
  }>;
  frameAnalysis?: Record<string, unknown>;
  castPositionLock?: Record<string, unknown>;
  motionProfile?: Record<string, unknown>;
  promptQuality?: Record<string, unknown>;
  selectedModel?: Record<string, unknown>;
  timing?: Record<string, unknown>;
};
```

### 8.3 Failure taxonomy

```ts
type VideoPromptFailureLabel =
  | "wrong_speaker_or_lip_sync"
  | "extra_or_missing_person"
  | "identity_drift"
  | "wardrobe_or_appearance_drift"
  | "wrong_action_or_actor"
  | "pose_or_anatomy_failure"
  | "physics_or_object_interaction"
  | "unnatural_human_motion"
  | "unnatural_material_or_prop_motion"
  | "camera_or_framing_failure"
  | "timing_or_duration_failure"
  | "scene_continuity_failure"
  | "audio_or_ambience_failure"
  | "reference_frame_ambiguous"
  | "provider_or_output_failure"
  | "other";
```

Every label may include severity (`info`, `warning`, `blocking`), confidence,
timestamp range, evidence artifact ID, and a short user note.

### 8.4 Policy versions

Add a versioned policy projection, either as a dedicated table or an equivalent
existing governed policy artifact. It must contain:

- policy key and semantic version;
- status: draft, approved, canary, active, rolled_back, retired;
- normalized rules and affected model families;
- source failure cluster/event IDs;
- regression suite ID/results;
- created/approved/rolled-back by and timestamps;
- rollout percentage and tenant allowlist/denylist.

## 9. No-credit preflight

Preflight runs after prompt generation and before credit deduction/provider
submission. It must be deterministic where possible and return structured
reasons rather than a free-text warning only.

### 9.1 Blocking checks

Block by default when any of these are true:

1. A custom identity is combined with a conflicting screen-position cue.
2. A native-audio quote lacks an explicit speaker name and speaking verb.
3. A dialogue line is assigned to a character not present in the reference
   manifest or frame analysis.
4. Required cast count and frame analysis disagree with high confidence.
5. A face is unmatchable/overlapped while the prompt requires reliable
   speaker lip-sync.
6. The dialogue timeline cannot fit within the clip duration.
7. A prompt asks for a face reveal/turn that violates the motion contract.
8. A provider/model capability does not support the requested audio/reference
   mode.

### 9.2 Warning checks

Warn or require configurable confirmation when:

- more than two speakers share one crowded frame;
- a complex prop interaction is requested without a verified start state;
- the action includes a large turn, hand-off, kneeling/rising transition, or
  material deformation;
- the reference is low-resolution or faces are small;
- the prompt contains contradictory camera, cut, or continuity language;
- the model family has a historically high failure rate for this label.

### 9.3 Risk score

The risk score is explainable and bounded (0–100). It is derived from facts,
not from an opaque LLM verdict. Suggested bands:

- 0–29: allow;
- 30–59: allow with visible warning and learning record;
- 60–79: require user confirmation or a free correction step;
- 80–100: block until the reference/prompt is corrected.

Tenants may configure thresholds, but a hard structural contradiction cannot be
downgraded by configuration.

## 10. Post-video QC

Post-video QC is advisory in the first rollout and must not silently spend the
user's video-generation credits. Sampling must reuse the existing
`verticalDramaClipIdentityQc` task path where possible.

### 10.1 Local/low-cost checks

1. Extract bounded keyframes at start, action midpoint, dialogue transitions,
   and final reaction.
2. Compare visible cast count and face separation with the start frame.
3. Check duration and presence of an output audio track when native audio was
   requested.
4. Run deterministic dialogue timeline and mouth-activity metadata checks when
   the provider exposes usable timing data.
5. Detect obvious frame duplication, severe black frames, missing output, or
   provider truncation.

### 10.2 Vision/audio checks

Only run deeper analysis when enabled, requested, or risk-triggered:

- identity consistency per character;
- speaker-to-mouth alignment;
- extra/missing people;
- action completion and actor ownership;
- pose/anatomy abnormalities;
- object/hand interaction and material motion;
- camera/scene continuity;
- audio clarity, timing, and ambience mismatch.

The result must include `pass`, `warn`, `fail`, or `samples_unavailable`, with
evidence and confidence. Missing samples are not a pass.

### 10.3 QC report contract

Extend the existing QC report shape with a stage such as
`video_prompt_outcome_qc`, linking:

- prompt attempt ID;
- video asset ID;
- sampled evidence asset IDs;
- failure labels and severity;
- detector/version;
- recommended repair action;
- whether a user confirmed/rejected the finding.

## 11. User feedback UX

The storyboard clip card should show a compact QC state:

- Not checked;
- Sampling;
- Pass;
- Warning;
- Failed;
- User rejected;
- Samples unavailable.

The user can select one or more failure labels, optionally choose a timestamp,
attach a short note, and submit. The form must not force the user to rewrite a
prompt. It should offer actions such as:

- Fix prompt only;
- Replace reference image;
- Re-map character;
- Change model/provider;
- Regenerate after confirmation;
- Mark as acceptable.

Submitting feedback records an event and does not trigger a paid regeneration
automatically. A later repair flow must create a new prompt attempt and keep
the failed clip as immutable evidence.

## 12. Learning and policy promotion

### 12.1 Aggregation

Aggregate events by:

- failure label and severity;
- provider/model/family;
- prompt policy and skill version;
- shot composition and speaker count;
- reference quality/ambiguity signals;
- series/tenant scope where authorized;
- whether preflight predicted the failure.

Track at minimum:

- first-pass acceptance rate;
- paid-render failure rate;
- credit waste rate;
- re-render rate;
- failure rate per 100 renders;
- preflight precision and false-block rate;
- QC coverage and samples-unavailable rate;
- model/provider comparison;
- policy version regression delta.

### 12.2 Proposal generation

When a cluster reaches a configurable minimum sample count and confidence, the
system may create a policy proposal containing:

- observed pattern;
- supporting event IDs and evidence;
- proposed rule or skill wording change;
- affected model families;
- expected benefit and possible regressions;
- regression cases to add;
- rollout and rollback plan.

The proposal is not active until approved by an authorized reviewer.

### 12.3 Controlled rollout

Policy rollout must support:

1. offline regression suite;
2. canary tenant or allowlisted series;
3. percentage rollout;
4. comparison against previous policy;
5. automatic rollback on a configured regression threshold;
6. permanent policy/version history.

Approved improvements may update prompt instructions, deterministic validators,
model routing hints, or preflight thresholds. They must not rewrite historical
prompt artifacts.

## 13. API and service boundaries

Recommended server boundaries:

- `verticalDramaVideoPromptLearningService`
  - `recordPromptAttempt`
  - `recordRenderEvent`
  - `recordQcEvent`
  - `recordUserFeedback`
  - `getPromptLearningTimeline`
  - `getPromptFailureSummary`
- `verticalDramaVideoPromptPreflight`
  - pure deterministic checks and risk scoring;
  - no provider calls and no credit deduction.
- Existing `verticalDramaClipIdentityQc`
  - retain sampling/task ownership;
  - emit normalized QC evidence into the ledger.
- `verticalDramaPromptPolicyService`
  - proposal, approval, canary, active, rollback;
  - never edits a skill file or policy row in place.

All public procedures must use existing episode ownership and tenant guards.
Internal event writes must be idempotent and safe to retry.

## 14. Feature flags and rollout

Introduce independent flags so recording can ship before blocking behavior:

| Flag | Initial behavior |
| --- | --- |
| `verticalDramaVideoPromptLearningLedger` | On for metadata/provenance recording; no credit cost. |
| `verticalDramaVideoPromptPreflight` | Shadow mode first, then warning, then high-confidence blocking. |
| `verticalDramaVideoPromptOutcomeQc` | Advisory sampling; reuse existing identity QC capability. |
| `verticalDramaVideoPromptUserFeedback` | On for clip-level labels and notes. |
| `verticalDramaVideoPromptPolicyPromotion` | Off until regression and approval workflow is proven. |
| `verticalDramaVideoPromptDeepQc` | Off by default; explicit/risk-triggered due possible model cost. |

Existing `verticalDramaClipIdentityQc`, scene-continuity QC, and series QC flags
remain authoritative for their current features. New flags must not change the
meaning of an existing flag.

## 15. Security, privacy, and retention

1. Every read and write is tenant/user/series scoped.
2. Prompt artifacts reference canonical media assets; do not persist raw
   unauthenticated provider URLs as the access mechanism.
3. Evidence downloads use existing protected media/broker URLs.
4. User notes are treated as untrusted text and never injected into prompts
   without sanitization and an explicit policy boundary.
5. Store hashes and metadata for long-term analytics; apply configurable media
   evidence retention and deletion.
6. Cross-tenant aggregation is allowed only on approved, de-identified metrics.
7. Policy proposals must identify their source evidence without exposing another
   tenant's private frames or dialogue.
8. Audit policy approval, rollback, and any export of evidence.

## 16. Failure handling and recovery

| Failure | Required behavior |
| --- | --- |
| Ledger write timeout | Do not retry credit deduction; enqueue idempotent reconciliation from media/credit records. |
| Provider job missing | Record `render_failed` or `output_unavailable`; never show QC pass. |
| Sampling unavailable | Persist `samples_unavailable`; keep the clip usable only according to existing policy. |
| Duplicate callback | Ignore using media task/provider job idempotency. |
| Partial feedback submission | Validate labels and evidence ownership; reject the whole event rather than writing a partial label. |
| Policy proposal failure | Keep existing active policy; preserve source events. |
| Policy regression | Roll back to the previous approved version and mark the canary as failed. |
| Database migration interruption | Use additive migration, resumable backfill, and no mutation of existing prompt JSONB. |

## 17. Migration and backfill

1. Add the event/policy tables and indexes additively.
2. Add optional `promptAttemptId`, `learningEventId`, and QC status references
   to the motion prompt clip projection only when needed; old clips remain
   readable.
3. Record all newly generated prompts after the feature flag is enabled.
4. Backfill only metadata that is already present and trustworthy on existing
   clips; label legacy outcomes as `historical_unlinked` when the render link
   cannot be proven.
5. Do not infer a pass/fail result for historical clips with no QC evidence.
6. Do not rewrite or delete existing `motionPromptPack` clips during backfill.

## 18. Testing requirements

### 18.1 Unit tests

- prompt provenance hashing and redaction;
- idempotent event writes;
- preflight cast/speaker/custom-identity rules;
- dialogue duration budget;
- risk score boundaries;
- failure-label validation;
- tenant/owner filtering;
- policy version transitions and rollback.

### 18.2 Integration tests

- prompt generation → event → existing episode projection;
- paid submit → credit transaction correlation;
- provider callback → media asset → render event;
- identity QC → QC report → learning event;
- user feedback → evidence ownership → aggregate query;
- interrupted writes and callback retries;
- old motion prompt packs round-trip without new metadata.

### 18.3 Regression fixtures

Create fixtures for the known expensive failures:

1. Two speakers with swapped quotes.
2. Five-character frame with one extra background person.
3. Custom identity plus conflicting screen-position phrase.
4. Speaker quote without an explicit speaker cue.
5. Dialogue longer than a 7-second clip.
6. Kneeling/proposal action with an impossible prop interaction.
7. Covered mouth followed by required visible lip-sync.
8. Crowded/low-resolution frame with unmatchable faces.

### 18.4 Browser tests

- clip QC state transitions;
- feedback label submission and validation;
- evidence frame access and tenant isolation;
- no automatic paid regeneration after feedback;
- policy status and rollback display for authorized reviewers.

## 19. Acceptance criteria

The feature is complete when:

1. Every newly generated video prompt has a queryable immutable provenance
   record with prompt hash, model, policy, references, and timing.
2. Every paid render is linked to exactly one prompt attempt and credit
   transaction or has a reconciled failure state.
3. High-confidence speaker, cast-count, custom-identity, and timing failures
   are blocked before paid submission.
4. A completed clip can receive a structured QC result and evidence without
   overwriting its prompt or output artifact.
5. A user can label the known failure categories in the clip UI.
6. Failure summaries can be filtered by model/provider/policy/version.
7. A policy proposal cites evidence and cannot become active without approval.
8. A canary policy can be rolled back without changing historical records.
9. No learning event path silently deducts video-generation credits.
10. Existing episodes and legacy motion prompt packs continue to render.
11. Focused server, shared-contract, migration, and browser tests pass.
12. Tenant isolation and protected media access are covered by tests.

## 20. Implementation waves

### Wave 1 — Provenance ledger, no behavior change

- Add additive schema and typed contracts.
- Emit prompt/render events at canonical boundaries.
- Persist immutable prompt/reference artifacts.
- Add reconciliation and idempotency tests.

### Wave 2 — Deterministic preflight

- Implement pure preflight service and risk score.
- Run in shadow mode and record predicted failures.
- Compare predictions with later user/QC labels.
- Enable high-confidence blocks after precision review.

### Wave 3 — Outcome QC and feedback

- Extend existing identity QC integration.
- Add cast/speaker/timing/action evidence where available.
- Add clip feedback UI and structured labels.
- Add QC and learning timeline to the episode workspace.

### Wave 4 — Aggregation and governed learning

- Add failure summaries and model/provider comparisons.
- Generate policy proposals from repeated clusters.
- Add approval, canary, rollback, and regression-gate workflow.
- Promote only approved rules to active prompt policy.

## 21. Operational metrics and launch gates

Before enabling blocking behavior, observe at least:

- 100+ prompt attempts or a tenant-approved smaller pilot;
- provenance write success ≥ 99.9%;
- event reconciliation success ≥ 99.9%;
- no duplicate credit charge in retry tests;
- preflight precision and false-block rate measured separately;
- QC samples-unavailable rate reported;
- no cross-tenant evidence access in security tests.

Launch gates must be evaluated per model family. A rule that improves one
provider but harms another must not be promoted globally without scoped policy
metadata.

## 22. Open decisions for implementation planning

1. Whether deep post-video audio/vision QC uses an existing provider budget,
   an internal QC budget, or only user-triggered analysis.
2. Evidence retention duration per tenant/plan.
3. Whether the first feedback UI lives inside the existing storyboard card or
   a dedicated QC drawer.
4. Minimum sample count and confidence threshold for policy proposals.
5. Whether policy scope starts per model family or per provider/model.

These decisions must be resolved in the implementation plan without changing
the core invariants above.
