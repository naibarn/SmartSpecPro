---
spec_id: 255
numbering_status: PROVISIONAL_PENDING_CANONICAL_SMARTSPECPRO_REGISTRY_CHECK
title: SmartAIHub Semantic Media Graph & Incremental Production Contracts
revision: 1.0-proposed
status: IMPLEMENTATION_PROPOSAL_NOT_CODE_CERTIFIED
prepared: 2026-09-27
source_inspiration: Public concepts observed in hypit-ai/hypit; clean-room SmartAIHub design only
proposed_path: specs/feature/255-semantic-media-graph-incremental-production/spec.md
implementation_boundary: Specs 1-214 immutable; Spec 224 active unchanged; no second Workflow/Job/Billing/Approval/Render/Speech authority
feature_flags:
  semantic_media.enabled: false
  semantic_media.impact_preview.enabled: false
  semantic_media.incremental_reuse.enabled: false
  semantic_media.semantic_retime.enabled: false
primary_owner: cross-product semantic-media representation, anchor/evidence contracts, semantic change sets, reusable-artifact candidate contracts and conformance
canonical_non_owners:
  workflow_invalidation_execution: Spec 215
  physical_jobs: Feature 195 worker_jobs
  billing_settlement: Spec 207
  universal_chat_task_control: Feature 196 + Specs 225/226
  film_domain_truth: Spec 252
  cross_product_handoff: Spec 253
  external_execution_placement: Spec 254
  speech_alignment_truth: Spec 247
  creator_localization: Spec 251
  media_bytes: Library/R2 + PostgreSQL SoR metadata
companion_specs: [195,196,207,215,220,224,225,226,227,231,233,240,247,251,252,253,254]
---

# Spec 255 — Semantic Media Graph & Incremental Production Contracts

## 0. Executive decision

SmartAIHub SHALL add a shared **Semantic Media Graph (SMG)** contract so Film Studio, Video Editor, Creator Workspace, Vertical Drama and future media products can describe *what a media element means*, *what source evidence it is anchored to*, *which derived artifacts depend on it*, and *which existing artifacts are candidates for safe reuse*.

This specification deliberately does **not** create a second video editor, timeline engine, workflow compiler, render runtime, cache daemon, speech stack or job ledger. It supplies normalized semantic evidence to the existing owners. **Spec 215 remains the only logical workflow invalidation/re-run authority**; Feature 195 remains the physical job authority. Spec 255 may say “these semantic entities changed and these artifact candidates appear reusable,” but it MUST NOT directly dispatch paid work or declare an artifact authorized for final delivery.

The primary product outcome is inexpensive, explainable revision: when a user changes one line, crop, graphic, voice, shot or language variant, SmartAIHub can preserve unrelated approved work, identify only the affected branch, show what will be reused/rebuilt, obtain any required approval, and execute the existing workflow path.

### 0.1 Non-goals

P0 explicitly excludes:

- a SmartAIHub clone/fork of Hypit, SVML/SVS/SVRUN or any other third-party runtime;
- a new canonical workflow DAG or invalidation database outside Spec 215;
- a new `media_jobs`, `film_jobs` or render queue;
- a new ASR/forced-alignment implementation outside Spec 247;
- a second Timeline editor, compositor or FFmpeg/Chromium rendering authority;
- global cross-tenant content caching;
- automatic reuse that bypasses ACL, consent, retention, rights, release or publication policy;
- naïve translated-word-to-word timing assumptions;
- implicit modification of locked manual editor ranges or approved Film/Drama assets.

## 1. Design principles

1. **Semantic and temporal coordinates are distinct.** A phrase, event or narrative cue may exist even when exact word timing is unknown. Time mapping is evidence attached to an anchor, not the identity of the anchor.
2. **Meaning survives variants; timing may not.** A semantic cue can relate Thai dialogue, English dubbing, captions, a graphic and B-roll while each locale/aspect variant retains independent clock mappings and QC.
3. **Reuse is two gates.** Technical equivalence identifies a candidate; current authorization determines whether it may actually be reused, delivered or published.
4. **Conservative when uncertain.** Missing dependency evidence results in `REBUILD_OR_REVIEW`, never unsafe reuse.
5. **Manual edits and locks dominate AI proposals.** Semantic retiming may produce a candidate overlay, not silently move protected tracks.
6. **Immutable ancestry.** New edits create versioned revisions and ancestry edges; approved historical outputs remain attributable.
7. **Explainability before spend.** Before paid regeneration, the user can inspect affected items, reuse candidates, new work, estimated cost and reasons.
8. **No cross-product mutation through graph edges.** Product ownership remains explicit; Spec 253 handles authorized handoff.
9. **Mobile review is first-class.** A phone/tablet can inspect an impact plan, reuse/rebuild decisions, cost and approvals without opening a full desktop timeline.

## 2. Ownership matrix

| Concern | Canonical owner | Spec 255 role |
|---|---|---|
| User goal, conversation, context | Feature 196 / 225 / 226 | Expose semantic edit/impact projections only |
| Product domain revision | Film 252 / Editor / Drama / Creator 251 | Reference immutable domain revisions; never commit foreign truth |
| Workflow DAG and transitive invalidation | **Spec 215** | Provide semantic `ChangeSet` + dependency/reuse evidence consumed by compiler |
| Physical execution and recovery | Feature 195 / current Runner | No dispatch authority |
| Credits/reservation/settlement | Spec 207 | Attach quote inputs and observed reuse; no ledger |
| Speech timestamps/alignment/diarization | **Spec 247** | Consume evidence and precision; do not manufacture word timing |
| External placement/model execution | 231 / 242 / 243 / 254 | Supply immutable requested inputs/expected outputs only |
| Cross-product handoff | **Spec 253** | Supply optional semantic envelope carried by handoff |
| Media bytes | Library/R2 | Reference immutable AssetRefs/content digests |
| Rights/consent/release | 220 / 227 | Re-check live policy before reuse/delivery |
| Generated UI | 240 | Typed impact/reuse cards only |

## 3. Core model: Semantic Media Graph

### 3.1 Graph envelope

```ts
interface SemanticMediaGraphV1 {
  schemaVersion: 'sah.semantic-media-graph.v1';
  graphId: string;
  graphRevisionId: string;
  tenantId: string;
  projectId: string;
  sourceDomain: 'film'|'video_editor'|'vertical_drama'|'creator'|'media_studio'|'other';
  sourceObjectRef: string;
  sourceObjectRevisionRef: string;
  mediaClockManifestRef?: string;
  nodes: SemanticMediaNodeV1[];
  edges: SemanticMediaEdgeV1[];
  clockMaps: SemanticClockMapRefV1[];
  policySnapshotRef: string;
  provenanceManifestRef: string;
  createdAt: string;
}
```

The graph is a **projection** over canonical product state. It must be reconstructable from source revisions plus approved derived evidence. It is not a replacement database for Film, Timeline, Drama or Creator.

### 3.2 Stable semantic node types

P0 node types:

- `SCRIPT_DOCUMENT`
- `SCRIPT_SPAN`
- `SEMANTIC_CUE`
- `SPEAKER_TURN`
- `CAPTION_CUE`
- `SHOT`
- `CLIP_RANGE`
- `AUDIO_RANGE`
- `BROLL_CUE`
- `GRAPHIC_CUE`
- `MOTION_EVENT`
- `CAMERA_EVENT`
- `OBJECT_EVENT`
- `TRANSITION_EVENT`
- `VARIANT`
- `DERIVED_ARTIFACT`

P0 MUST use a versioned enum/registry extension mechanism; unknown node types remain readable as opaque metadata but cannot authorize privileged automatic retiming.

### 3.3 Semantic anchors

```ts
interface SemanticAnchorV1 {
  anchorId: string;
  semanticNodeRef: string;
  sourceRevisionRef: string;
  anchorKind: 'TEXT_SPAN'|'WORD_EVIDENCE'|'SPEAKER_TURN'|'EVENT'|'FRAME_RANGE'|'AUDIO_RANGE'|'MANUAL_MARKER';
  textSpan?: {
    transcriptRevisionRef: string;
    startUnicodeScalar: number;
    endUnicodeScalar: number;
    originalTextDigest: string;
  };
  timingEvidence?: SemanticTimingEvidenceV1[];
  ancestry?: {parentAnchorRef:string; relation:'SAME_MEANING'|'SPLIT'|'MERGED'|'TRANSLATED_FROM'|'REPHRASED_FROM'}[];
  confidenceClass: 'EXACT'|'VERIFIED'|'APPROXIMATE'|'MANUAL'|'UNKNOWN';
}
```

Text offsets SHALL be relative to an immutable transcript revision and SHALL preserve original Unicode text. Thai tokenization or display segmentation MUST NOT rewrite source offsets. A UI may present words/graphemes differently while retaining the source span identity.

### 3.4 Timing evidence

```ts
interface SemanticTimingEvidenceV1 {
  evidenceRef: string;
  precision: 'FRAME_EXACT'|'NATIVE_WORD'|'VERIFIED_ALIGNMENT'|'SEGMENT_ONLY'|'MANUAL'|'UNKNOWN';
  mediaClockManifestRef: string;
  startTick: string;
  endTick: string;
  clockDomain: 'VIDEO_PTS'|'AUDIO_SAMPLE'|'NORMALIZED_MEDIA';
  sourceProviderAttemptRef?: string;
  alignmentRevisionRef?: string;
  verifiedBy?: 'PROVIDER_NATIVE'|'SPEC247_ALIGNMENT'|'HUMAN'|'DETERMINISTIC_EDITOR';
}
```

`SEGMENT_ONLY` or `UNKNOWN` evidence MUST NOT be promoted to word-level accuracy. Editing a transcript span invalidates timing evidence covering that span until Spec 247 or a human correction produces a new verified mapping.

## 4. Semantic relationships

Required P0 edge types:

- `CONTAINS`
- `FOLLOWS`
- `ANCHORS_TO`
- `EXPRESSES_CUE`
- `VISUALIZES_CUE`
- `CAPTIONS_CUE`
- `VOICES_CUE`
- `OCCURS_IN_SHOT`
- `DEPENDS_ON`
- `DERIVED_FROM`
- `VARIANT_OF`
- `LOCKED_BY`
- `SUPERSEDES`

Edges are semantic evidence only. They do not grant permission and do not permit one product to mutate another.

### 4.1 Cross-language semantic cue rule

Translated/dubbed language variants SHALL link through a language-independent `SEMANTIC_CUE` or explicit translation ancestry. They MUST NOT assume that word N in source language equals word N in target language. Each locale has its own text span and timing evidence.

Example:

```text
SEMANTIC_CUE: product_benefit_fast_delivery
  ├─ Thai SCRIPT_SPAN + VERIFIED_ALIGNMENT
  ├─ English SCRIPT_SPAN + VERIFIED_ALIGNMENT
  ├─ GRAPHIC_CUE "24h delivery"
  └─ BROLL_CUE courier-arrival
```

Changing the English translation may invalidate English timing/caption/dub while leaving Thai source timing valid.

## 5. ChangeSet contract

Domain owners emit or derive a semantic change description after a user/agent proposal is validated against the current base revision.

```ts
interface SemanticChangeSetV1 {
  schemaVersion:'sah.semantic-change-set.v1';
  changeSetId:string;
  tenantId:string;
  projectId:string;
  sourceDomain:string;
  baseRevisionRef:string;
  proposedRevisionRef?:string;
  changes:Array<{
    semanticRef:string;
    changeKind:'TEXT_CHANGED'|'TIMING_CHANGED'|'STYLE_CHANGED'|'ASSET_CHANGED'|'CAMERA_CHANGED'|'MOTION_CHANGED'|'AUDIO_CHANGED'|'RIGHTS_CHANGED'|'DELETED'|'ADDED';
    changedFieldPaths:string[];
    oldDigest?:string;
    newDigest?:string;
  }>;
  manualLockRefs:string[];
  policyEpochRef:string;
  generatedAt:string;
}
```

Spec 255 MUST NOT convert this directly into physical jobs. The normalized ChangeSet is an input to Spec 215 and relevant domain adapters.

## 6. Semantic impact projection

### 6.1 Impact classes

Spec 255 may compute a **pre-execution projection** for UX and compiler input:

- `UNAFFECTED`
- `REUSE_CANDIDATE`
- `POLICY_RECHECK_REQUIRED`
- `REALIGN_REQUIRED`
- `RECOMPOSE_REQUIRED`
- `RENDER_REQUIRED`
- `REGENERATE_REQUIRED`
- `HUMAN_REVIEW_REQUIRED`
- `BLOCKED`
- `UNKNOWN_DEPENDENCY`

This projection is not a final WorkflowRun plan. Spec 215 validates the exact workflow stage graph, current stage fingerprints and policy before deciding which stages rerun.

### 6.2 Conservative fallback

If any output-affecting dependency is absent, stale, unversioned or ambiguous, classify the branch `UNKNOWN_DEPENDENCY` and let Spec 215 conservatively rebuild or require review. An optimization may waste compute; it must never reuse a stale or unauthorized artifact.

## 7. Reuse candidate contract

### 7.1 Technical reuse key

```ts
interface MediaReuseCandidateV1 {
  schemaVersion:'sah.media-reuse-candidate.v1';
  candidateId:string;
  artifactRef:string;
  artifactDigest:string;
  sourceDomain:string;
  sourceRevisionRef:string;
  outputSemanticRef:string;
  technicalReuseKey:string;
  dependencyFingerprintRef:string;
  producerVersionRefs:string[];
  timebaseRef?:string;
  variantRef?:string;
  observedQualityReceiptRefs:string[];
  currentPolicyCheck:'NOT_RUN'|'PASS'|'FAIL'|'REVIEW';
  retentionState:'AVAILABLE'|'EXPIRED'|'DELETION_PENDING'|'DELETED';
}
```

A technical key SHALL contain all output-affecting inputs relevant to that artifact: immutable source refs/digests, semantic constraints, model/adapter/compiler/renderer version, seed when meaningful, media clock/timebase, locale/aspect variant and required style/conditioning parameters.

### 7.2 Authorization and reuse

A hash match is not authorization. Prior to actual reuse, the existing owner SHALL re-check:

- tenant/project ACL;
- rights and consent epochs;
- retention/deletion state;
- source availability;
- provider/model derivative restrictions;
- release/publication scope;
- current policy version;
- destination-product eligibility.

Default scope is **same tenant + same authorized project**. Cross-project reuse requires explicit source and target grants. Cross-tenant generated-artifact reuse is disabled by default even for byte-identical content.

### 7.3 Reuse plan is advisory until compiled

```ts
interface SemanticReusePlanV1 {
  planRef:string;
  baseRevisionRef:string;
  changeSetRef:string;
  reuseCandidates:string[];
  rebuildSemanticRefs:string[];
  realignSemanticRefs:string[];
  reviewSemanticRefs:string[];
  blockedSemanticRefs:string[];
  projectedSavings?:{currencyOrCredit:string; baselineEstimate:number; revisedEstimate:number; methodologyRef:string};
  reasons:Record<string,string[]>;
}
```

The plan is shown to the user and passed to Spec 215. **Spec 215 may reject or expand the rerun set** if actual workflow fingerprints or policy require it.

## 8. Source-backed editing and semantic retiming

### 8.1 One source revision, multiple control surfaces

Chat, compact Chat, Task Control, Film Studio, Creator and Video Editor may propose edits, but every mutation resolves to the canonical owning product revision. UI state is not the source of truth.

A proposed semantic edit SHALL carry:

- target domain/object/revision;
- changed semantic anchors;
- affected manual locks;
- impact projection;
- optional reuse plan;
- exact quote/approval requirements;
- expiry and idempotency key.

### 8.2 Retiming behavior

When verified semantic timing changes, dependent captions/B-roll/graphics may be retimed according to declared edge rules. P0 edge retiming policies:

- `FOLLOW_ANCHOR_START`
- `FOLLOW_ANCHOR_END`
- `FIT_ANCHOR_RANGE`
- `OFFSET_FROM_ANCHOR`
- `MANUAL_ONLY`
- `LOCKED`

The system SHALL produce a candidate timeline/overlay first when the operation touches manual editor state. Protected clips, audio, subtitles, keyframes or lock ranges do not move automatically.

### 8.3 Timing uncertainty

If an anchor has only segment-level evidence, word-sensitive elements remain `REALIGN_REQUIRED` or `HUMAN_REVIEW_REQUIRED`. Coarse B-roll that explicitly declares segment tolerance may still be eligible for segment-level retiming.

## 9. Incremental production lifecycle

```text
User/Agent edit proposal
        ↓
Canonical domain validates base revision + locks
        ↓
SemanticChangeSetV1
        ↓
Spec 255 semantic impact + reuse candidates
        ↓
Spec 215 compiler validates actual DAG + fingerprints + policy
        ↓
Spec 207 quote/reservation / Approval as required
        ↓
Feature 195 worker_jobs / existing executors
        ↓
Verified artifacts + receipts
        ↓
Domain owner commits candidate revision
        ↓
Spec 253 optional cross-product handoff
```

No layer may skip directly from semantic graph analysis to an external paid provider call.

## 10. Integration with Spec 252 — AI Film Studio

Spec 252 SHALL publish Film Scene/Shot/Performance/Camera semantic IDs into an SMG projection where enabled. `film.edit.propose` may include:

```ts
semanticImpactRef?: string;
semanticChangeSetRef?: string;
semanticReusePlanRef?: string;
semanticGraphRevisionRef?: string;
```

Film remains owner of shot/performance/camera truth. Spec 255 does not create a second Film graph. Camera-only changes should not invalidate unchanged speech; dialogue changes should not automatically regenerate visual takes unless dependency evidence says the visual is dialogue-conditioned.

## 11. Integration with Spec 253 — Cross-product handoff

`MediaHandoffBundle` may carry an optional `SemanticMediaEnvelopeV1` containing only the authorized subset required by the receiver:

```ts
interface SemanticMediaEnvelopeV1 {
  schemaVersion:'sah.semantic-media-envelope.v1';
  sourceGraphRevisionRef:string;
  semanticNodeRefs:string[];
  anchorRefs:string[];
  clockMapRefs:string[];
  dependencyFingerprintRefs:string[];
  sourceRevisionDigest:string;
  policyEpochRef:string;
}
```

The destination may import the envelope as read-only provenance/context. Its own product adapter decides whether to materialize candidate clips/captions/graphics. No foreign graph edge may directly patch destination state.

## 12. Integration with Spec 254 — external intelligence/execution

Spec 254 external executors receive an immutable **compiled stage request** after Spec 215 admission. An external model/agent is never allowed to declare an old artifact reusable solely because it “looks similar.” Reuse eligibility comes from canonical dependency fingerprints and current authorization.

A reused external result MUST retain original producer attempt/provenance and be associated with the new WorkflowRun through a reuse receipt rather than pretending a new provider execution occurred.

## 13. Integration with Spec 247 — speech/alignment

Spec 255 consumes `NATIVE_WORD` or `VERIFIED_ALIGNMENT` evidence for word-sensitive semantic anchors. `SEGMENT_ONLY` remains segment-only. Any transcript edit within a timed span invalidates affected word timing until re-aligned. Spec 247 remains the speech/alignment authority and requires no duplicate provider integration in Spec 255.

## 14. Integration with Creator / localization

Spec 251 locale variants map to independent semantic spans and timing evidence linked by shared semantic cues. A source-language correction invalidates only the translations/dubs/captions that actually depend on the changed cue. An unrelated locale or aspect branch remains reusable when the workflow fingerprint proves independence.

## 15. Component/template extensibility

P1 may define reusable **Semantic Media Components** for captions, motion graphics, lower thirds, callouts and code-rendered visual templates. The reusable package belongs to existing Skill/Marketplace/package owners (Specs 221/248 or product-specific template systems); Spec 255 only defines how a component declares semantic anchor inputs and output dependencies.

No P0 dependency on a new authoring language is allowed.

## 16. Storage and indexing

- Canonical media bytes remain in R2/Library.
- PostgreSQL remains SoR for graph metadata/revision/ACL/provenance references.
- Vectorize may index authorized textual descriptions for discovery, but vector similarity is never dependency/reuse proof.
- Large graph projections may be reconstructed/cached, but cache loss must not lose canonical product data.
- Content-addressed artifact storage may deduplicate bytes internally where allowed, while ACL and policy remain per logical artifact reference.

## 17. Security, privacy and prompt-injection boundary

Semantic text, captions, transcripts and imported metadata are untrusted content. They cannot authorize tools, policy changes, external egress or cross-project reads. Every consequential action re-resolves trusted context server-side.

External agents receive only the least-privilege semantic subset needed for the admitted stage. Private semantic graphs are not exposed to public Mini Apps or marketplace components without explicit grant. Signed URLs are transport capability, not reusable authorization.

## 18. Failure and recovery semantics

- Missing semantic graph cache: rebuild projection from canonical revisions.
- Missing/stale alignment: degrade to coarse timing or require review; never fabricate word times.
- Missing dependency: conservative rerun/review.
- Corrupt reused artifact: quarantine and rebuild eligible stage.
- Rights revoked after technical match: block reuse/delivery.
- Provider accepted unknown job: reconcile under existing job/economic owners; unaffected reused artifacts remain intact.
- Late output against stale revision: attach to historical revision for review, never auto-activate.
- Worker loss: use Spec 215/195 checkpoints and receipts; no semantic graph-specific recovery authority.

## 19. UI/UX requirements

Impact preview must answer five questions:

1. **What changed?**
2. **What will be kept/reused?**
3. **What will be rebuilt/re-aligned?**
4. **Why?**
5. **What will it cost before approval?**

P0 UI fields:

- affected scenes/shots/clips/lines;
- `Reuse`, `Re-align`, `Re-render`, `Regenerate`, `Review`, `Blocked` chips;
- before/after estimated cost and methodology label;
- manual lock conflicts;
- evidence precision (`verified word`, `segment only`, `manual`, `unknown`);
- “force rebuild selected” control where policy permits;
- “open precise editor” deep link;
- mobile approval/reject/revise actions through shared Task Control.

Do not claim “saved X credits” unless baseline and revised quote methodologies are comparable and observable.

## 20. Observability and economics

Emit metrics/events through existing telemetry:

- `semantic_change_count`
- `reuse_candidate_count`
- `reuse_accepted_count`
- `reuse_rejected_policy_count`
- `reuse_rejected_fingerprint_count`
- `conservative_rerun_count`
- `realignment_required_count`
- `manual_lock_conflict_count`
- `estimated_cost_before_reuse`
- `estimated_cost_after_reuse`
- `actual_incremental_cost`
- `false_safe_reuse_incident_count` (target: zero)

Never derive billing directly from these metrics. Spec 207 receipts remain authoritative.

## 21. Required acceptance cases

| ID | Scenario | Required result |
|---|---|---|
| SMG-01 | Change subtitle font only | Caption composite/final visual branch invalidated; ASR/TTS/video generation reusable if fingerprints prove independence |
| SMG-02 | Correct one Thai transcript span | Affected word timing becomes stale until verified alignment; unrelated spans remain valid |
| SMG-03 | Change 9:16 crop only | 9:16 visual branch rerenders; 16:9 and unchanged audio remain reusable |
| SMG-04 | Change one Film camera path | Camera-dependent visual outputs rerun; unrelated dialogue ASR/TTS do not |
| SMG-05 | Change voice for English locale | English audio + sync/QC affected; Thai transcript and unrelated locales reusable |
| SMG-06 | Source rights revoked | Matching technical reuse key does not permit reuse/export |
| SMG-07 | Same bytes, changed policy epoch | Policy recheck required; no blind cache hit |
| SMG-08 | Segment-only ASR evidence | Word-following graphic cannot auto-retime as word-exact |
| SMG-09 | Thai segmentation display changes | Immutable transcript span offsets remain stable |
| SMG-10 | Translation rephrases one cue | Target locale gets new span/timing; source locale timing stays intact |
| SMG-11 | Manual locked timeline range | Semantic retime returns candidate/conflict; protected range unchanged |
| SMG-12 | Stale base revision | Reject/rebase; no last-write-wins |
| SMG-13 | Dependency metadata incomplete | Conservative rerun/review with revised quote |
| SMG-14 | Corrupt cached artifact | Quarantine candidate; rebuild stage; no final delivery |
| SMG-15 | Cross-tenant identical artifact hash | No reuse by default |
| SMG-16 | Cross-project same tenant | Require explicit source+target authorization |
| SMG-17 | Provider late output for old revision | Historical candidate only; no active mutation |
| SMG-18 | Worker dies after reused steps chosen | Existing receipts/checkpoints recover without recharging reused stages |
| SMG-19 | Retry same semantic edit | Idempotent domain revision and no duplicate paid WorkflowRun |
| SMG-20 | Feature flags OFF | Legacy Film/Editor/Drama/Creator behavior unchanged |
| SMG-21 | Delete source during downstream run | Deletion/revocation epoch prevents resurrection via old reuse candidate |
| SMG-22 | Word timing re-aligned after edit | New evidence revision enables dependent retime; old evidence remains historical |
| SMG-23 | B-roll tolerates segment timing | Coarse retime allowed only when component declares segment precision sufficient |
| SMG-24 | Caption requires word highlight | `SEGMENT_ONLY` cannot satisfy; alignment/manual review required |
| SMG-25 | Same semantic cue in Thai/English | Independent locale spans and clocks; no positional word mapping assumption |
| SMG-26 | User forces rebuild of reusable shot | Compiler receives explicit rebuild override and quote reflects it |
| SMG-27 | Reuse candidate expired by retention | Reject and rerun/recreate if authorized |
| SMG-28 | Vector similarity finds old visual | Similarity may suggest, never prove reuse eligibility |
| SMG-29 | Mobile reviews edit impact | Same canonical plan/quote as desktop; no new duplicate task |
| SMG-30 | Cross-product handoff rejects semantic envelope | Original product state and approved source asset remain unchanged |

A release SHALL have zero false-safe-reuse failures in the conformance suite. Conservative extra reruns are optimization defects, not permission to relax safety.

## 22. Benchmark corpus and investment validation

Before broad rollout create a fixed benchmark set:

1. Thai short-form ad with word-highlight captions, B-roll and motion graphics.
2. Thai → English localized version with different sentence lengths.
3. 16:9 + 9:16 independent camera/crop variants.
4. Dialogue scene with manual timeline locks.
5. Film shot with generated video + separate audio.
6. Creator source with one corrected transcript span.

Track baseline full rebuild versus incremental path. Suggested business success targets for the benchmark—not protocol guarantees—are:

- median edit-variant cost reduction >= 30%;
- median revision completion-time reduction >= 30%;
- zero unauthorized/cross-tenant reuse;
- zero duplicate customer settlement;
- zero silent mutation of protected editor/Film state.

If cost/time savings do not clear the threshold on edit-heavy cases, keep semantic impact preview but defer more complex automatic retiming.

## 23. Rollout sequence

| Phase | Deliverable | Gate |
|---|---|---|
| S0 | Canonical repo/spec/DDL/API reconciliation | Confirm number 255 and actual owner contracts; no production changes |
| S1 | Read-only SMG projection + schemas | Reconstructible from current revisions; feature flag OFF by default |
| S2 | Impact preview only | No execution; explain affected/reusable/unknown items |
| S3 | Reuse candidate generation | No paid dispatch; authorization + fingerprint negative tests |
| S4 | Spec 215 incremental compile | Existing WorkflowRun reruns only validated affected stages |
| S5 | Spec 247 semantic timing | Word/segment precision truthfulness + Thai fixtures |
| S6 | 252/253/254 integration | Film proposal, handoff envelope, external execution receipt coverage |
| S7 | Two-tenant canary | Billing, ACL, retention, recovery, rollback, legacy flag-OFF golden tests |
| S8 | Optional component/template ecosystem | Only after P0 savings and correctness measured |

## 24. Implementation package layout

Suggested new contract files; names are proposals until mapped to actual repository conventions:

```text
contracts/semantic-media/
  semantic-media-graph.v1.schema.json
  semantic-change-set.v1.schema.json
  semantic-timing-evidence.v1.schema.json
  media-reuse-candidate.v1.schema.json
  semantic-reuse-plan.v1.schema.json
  semantic-media-envelope.v1.schema.json

services/semantic-media/
  projection/
  impact/
  reuse-candidate/
  adapters/

conformance/semantic-media/
  fixtures/
  cross-product/
  security/
  economics/
```

These modules must call existing owner APIs rather than introduce direct writes to foreign product tables.

## 25. Clean-room / licensing boundary

The public Hypit project was studied only as conceptual evidence that word/semantic anchoring, explicit artifact reuse and code-addressable video composition can improve agentic video workflows. SmartAIHub implementation SHALL be independently designed from SmartAIHub requirements and contracts.

Do not copy Hypit source, schemas, tests, identifiers, bundled assets, runtime packages or user-facing branding into SmartAIHub without a separately approved license review. The current public Hypit license restricts use of its source/derivative works for multi-tenant hosted/SaaS offerings without commercial authorization. Conceptual inspiration does not authorize source-code reuse.

## 26. Exit criteria

Spec 255 is implementation-ready only after S0 maps every proposed contract to actual repository owners and confirms there is no competing semantic-media authority. Production readiness requires measured conformance evidence, not document completion.
