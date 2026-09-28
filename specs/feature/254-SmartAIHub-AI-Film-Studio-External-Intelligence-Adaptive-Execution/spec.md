---
spec_id: 254
numbering_status: PROVISIONAL_PENDING_CANONICAL_SMARTSPECPRO_REGISTRY_CHECK
title: SmartAIHub AI Film Studio — External Intelligence & Adaptive Execution
revision: 1.2-proposed-second-20pass-audited
status: DOCUMENT_AUDITED_R1_2_IMPLEMENTATION_UNVERIFIED
prepared: 2026-09-27
original_baseline_revision: 1.0-proposed
audit_passes: 40  # cumulative: previous 20 + a second, distinct set of 20
owner_review_status: PENDING_CANONICAL_REPOSITORY_RECONCILIATION
source_baseline: Film Studio Blueprint v1.3 Capability Fabric (N0–N12); v1.4 Universal Chat/Task Control; proposed Specs 252/253; Library snapshots of Specs 215/225/226/240/242/243/244/248 and Feature 197
proposed_path: specs/feature/254-film-external-intelligence-adaptive-execution/spec.md
primary_owner: Film-specific external-capability composition, workload profiles, qualification requirements and conformance; NOT platform-wide scheduling/registry/job ownership
feature_flags:
  film.external_execution.enabled: false
  film.external_execution.local_runner: false
  film.external_execution.cf_sandbox: false
  film.external_execution.remote_gpu: false
  film.external_execution.hosted_harness: false
  film.external_execution.experimental_model_packs: false
implementation_boundary: Specs 1–214 frozen; Spec 224 under implementation unchanged; Spec 252/253 and 254 numbers provisional until canonical registry confirms
companion_specs: [195,196,197,199,200,206,207,208,214,215,216,220,221,224,225,226,229,231,232,233,237,239,240,241,242,243,244,245,247,248,251,252,253]
---

# Spec 254 — AI Film Studio: External Intelligence & Adaptive Execution

**Purpose.** Turn the external-intelligence and adaptive-execution architecture in the approved-to-discuss Film Studio Blueprint into an independently implementable, testable **Film-domain integration specification**. A user may ask Universal Chat to create, enhance, continue or repair a film/series shot on any device. Film Studio can use native capabilities, approved external agents, Cloudflare isolated CPU execution, an opted-in user's Runner/GPU, licensed hosted video APIs or certified remote GPU services; return first-party artifacts and review cards; and still work when any optional backend is absent.

**Critical ownership decision.** Spec 254 owns *Film-specific execution intent, provider-independent task profiles, conditioning negotiation, qualification gates and verified film results*. It does **not** implement a new Capability Registry, Resource Scheduler, Chat, Agent runtime, workflow compiler, queue, job state machine, Runner protocol, billing ledger, approval service, generic placement authority, GPU marketplace or development lifecycle. Platform-wide reusable descriptors and placement rules are additive proposals to their existing owners (Feature 196/197, Specs 215, 242/243 and 253). This distinction prevents a Film-specific design from becoming a second platform.

**Release truth.** This document was reconciled against saved document snapshots and the local v1.3/v1.4 blueprints, not live Git HEAD, deployed database, Cloudflare account, GPU vendor entitlement or MiniMax model runtime. Nothing here authorizes a production migration/deploy or certifies a model feature; all proposed API names must map to actual existing contracts in gate E0. The provisional number 254 must be checked against main, active branches/worktrees, pending PRs and owner decisions. If occupied, renumber this *new* proposed document only.

## 0. Non-negotiable architectural invariants

1. **One command entry:** Full Chat, compact `AI Chat & Feedback`, Task Control and phone/tablet use the *same* authenticated Feature 196 conversation/semantic command APIs through Specs 225/226. Film UI supplies bounded Page Context; it does not start another Film Chat service. Without an active page, Chat still discovers authorized Film actions and projects.
2. **One durable execution authority:** Spec 215 owns logical workflow/DAG compilation, the existing shared orchestration kernel owns permitted run transitions, Feature 195/186 owns admitted physical `worker_jobs`, receipts, fencing and outbox; Feature 197 governs Runner-first local execution/offer semantics. A Cloudflare workflow, local Runner journal or hosted-agent session is subordinate correlation state, never a parallel job ledger.
3. **Preserve product independence:** Spec 252 owns film scene/shot/performance/camera/take revisions. Spec 253 owns normalized cross-product command and `MediaHandoffBundle` contract. Existing Editor timeline, Vertical Drama episode/shot and Spec 251 Creator localized derivatives retain separate domain ownership. Film integration OFF means their original quick workflows still work unchanged.
4. **Consent and eligibility before optimization:** A technically reachable Runner, MCP tool, unreviewed ComfyUI node or remote GPU is not an authorized execution offer. Eligibility requires current ACL, project/scope, rights, region, model entitlement, hardware/runtime compatibility, signed reviewed version, privacy/egress consent, spend cap and an explicit user local-resource opt-in where relevant.
5. **External intelligence is replaceable:** A hosted reasoning harness may develop a *candidate* camera/motion plan, asset, program or tool adapter; only typed, independently validated results may modify an authorized Film revision or become a Skill/Model Pack. External provider assertions are evidence, not finality.
6. **Data portability:** User-owned scene, skeleton, animation, source media, approved renders, decisions and provider receipts must remain accessible via canonical Project/Library/R2/PG even if the external provider disappears. Preserve lawful source-use/redistribution restrictions and support relink for device-local originals.
7. **No assumed Cloudflare GPU:** Workers/Agents and Sandbox/Container may handle allowed control, CPU media, FFmpeg and sandboxed Python/Node/Shell according to actual account/SDK capability. Large H3/Wan/LTX-class model inference routes only to a separately certified GPU backend or account-entitled hosted video API unless independently verified otherwise.
8. **Unknown outcome is not safe retry:** When a remote billable attempt may have been accepted, reconcile provider status/receipts first. Never make an unapproved second paid request, reinterpret a stale callback as current, or charge the customer twice.
9. **Safe self-extension:** Spec 244 can propose candidate tools and benchmarks; Spec 248/221 govern Skill provenance and distribution; Spec 224 alone owns *platform code* changes through isolated development, tests, review and Final Verify. No Film production request installs third-party code or changes production code implicitly.

## 1. Responsibility matrix and integration seams

| Concern | Canonical owner | Spec 254 produces or consumes |
|---|---|---|
| Universal intent, conversation and generic capability retrieval | Feature 196 | Film capability requirements, goal decomposition, domain context refs |
| Cross-device context, universal Task Control, first-party actions | Specs 225/226 | Film-specific projection fields, progress/result/decision adapters |
| Film scene, shot, motion, camera, conditioning and takes | Spec 252 | Immutable exact Film revision refs and typed Film recipes |
| Cross-product semantics and media handoff | Spec 253 | Film-origin and Film-destination conformance fixtures |
| Capability registry / local resource offers | Feature 196 / Feature 197 / installed Runner and registry | Read-only normalized Film requirements and qualified execution offers |
| Workflow logic, task ordering, restart | Spec 215 + existing kernel | Stage DAG, causal parent IDs, invalidation fingerprints, receipts |
| Canonical physical execution | Feature 195 `worker_jobs` | Canonical `jobRef`, fenced attempt IDs and verified results |
| Access, secrets, egress and consent | Spec 220 and existing approval | Authorization proof refs, no raw credentials in task packet |
| Reservations and actual settlement | Spec 207 | Per-stage quote/observed cost and reconciliation refs |
| Cloudflare Agents/Sandbox/Container/Workflows | Spec 242, Cloudflare migration owners 232/245 | Adapter-selected sandbox CPU tasks, R2 snapshots and owner events |
| Managed hosted reasoning agents and harness | Spec 243 / historical Spec 200 / A2A Spec 206 | Bounded delegated work packet, managed session correlation and review |
| Local Runner / user GPU / ComfyUI | Feature 197 / existing Runner and MCP gateway | Local execution profile, consent/time windows, compatibility test inputs |
| Text/video model and prompt routing | Spec 231 and existing Media Gateway | Film conditioning capability constraints and certified provider offer |
| Dynamic safe UI / approved Mini Apps | Spec 240 + 216/217 | Preview, progress, selective approval and compare projections |
| Research and external Skill distribution | Spec 244 + 248 + 221 | Candidate intake, benchmark profile, signed reviewed pack refs |
| Licensing, outputs, publication | Spec 220/227 and Library/R2 | Provenance, face/voice consent, region, output and derivative policy checks |
| Localization/speech | Spec 247 / 251 | Independent authorized dub/subtitle variants; no second speech gateway |

**Implementation rule:** Treat proposed interfaces in §3–§8 as logical schemas and adapters. No `film_worker_jobs`, `film_gpu_registry`, `film_chat_history`, `film_cloud_agent` durable authority or duplicate `credit_transactions` table. Persistent Film-specific metadata may be introduced only after schema-fit against deployed databases and explicit owner-approved expand/migrate plan.

## 2. Product experience and three execution scenarios

**A. Phone/tablet only.** User asks the existing Chat to produce a 9:16 chase shot. Confirm Project/shot and budget, create a draft Film proposal, generate cheap pose/clay preview, route approved CPU preprocessing to an account-eligible isolated container or existing compute service, and use a certified hosted video API or remote GPU for heavy generation. Return preview, price, QC and approve/revise actions in first-party Chat/Task Control. No local computer, MCP connection or second UI is mandatory.

**B. User computer with optional GPU.** The same Film goal checks a *consented* Runner's real VRAM/driver/OS, toolchain/checkpoint hashes, available capacity and privacy constraints. A qualified ComfyUI model pack may execute locally; if insufficient, offer an approved cloud alternative **before** data leaves the device. A Runner disconnect fences admission; in-flight side effects follow the canonical reconciliation policy. User can pause/revoke resource contribution without losing Film draft state.

**C. Specialized external intelligence.** User requests a technically difficult motion plan, novel 3D reconstruction or shot-specific tool integration. Feature 196 may ask Spec 243 for a bounded approved hosted harness, or Spec 200 for a compatible installed local harness. A hosted agent receives *minimum relevant evidence*, explicit tool allowlist and capped budget; it returns a machine-readable proposal, files and receipts. Spec 252 validates the plan before a Film revision, or Spec 224 receives a separate development goal if genuinely new platform code is required. No hosted tool gains direct privileged database writes.

**D. Existing products unchanged.** Vertical Drama retains simple script→storyboard→generate/native-audio episode flow, and its original 9-shot preset remains available; Video Editor retains timeline/manual locks; Spec 251 retains original ingest/translation/voice/subtitle flow. Their optional `Enhance with Film Studio` and `Use external capability` buttons use Spec 253's bounded handoff only. Rejecting a proposed import cannot alter the origin.

## 3. Task taxonomy, Film requirements and normalized contracts

A Film task is classified independently of its execution backend:

| Film stage | Required inputs | Optional extra control | Valid result types | Non-GPU fallback |
|---|---|---|---|---|
| `film.story.plan` | Authorized story/brief/continuity refs | Localized dialogue/glossary | Structured scene/shot proposal | Existing LLM Gateway |
| `film.scene.block` | Scene & actor refs | Imported GLB/USD, rough 3D | Editable Film Scene draft, stage preview | Browser/sandbox simple primitives |
| `film.motion.plan` | Actor and action constraints | Motion library, video Mocap | Skeleton/curve proposal and confidence | Human/stock motion preset |
| `film.previs.render` | Pinned Scene/Shot/Camera/Performance revisions | Depth/segmentation/pose | Frames, clay MP4, transform/timebase manifest | Browser CPU/WebGL or sandbox/Runner |
| `film.condition.compile` | Previs refs + chosen output/control target | Pose, Depth, edge, start/end, camera track | Immutable conditioning manifest | Simpler reference type only after approval |
| `film.video.generate` | Prompt/asset/conditioning refs | Certified ControlNet, motion context, LoRA, native audio | Generated Take refs and provider receipt | Hosted video API with truthful limitations |
| `film.audio.finish` | Audio intent + actual Video Take | Voice, lip-sync, ambient continuity | Separate immutable audio/video artifacts | Existing certified Spec 247 path |
| `film.shot.verify` | Shot intent, approved refs, produced takes | Vision and skeletal tracking tools | Multidimensional QC evidence; no opaque single grade | Human comparison and technical checks |
| `film.postproduce` | Approved takes, timeline handoff intent | Editor/Creator variants | Candidate EDL/AssetRefs | Existing Editor/export path |
| `film.tool.evaluate` | Safe candidate package + synthetic fixture | Benchmark corpus and compatible hardware | Untrusted qualification evidence | Deferred candidate, no production admission |

### 3.1 Portable FilmExecutionRequestV1

Every delegated asynchronous Film operation MUST reference immutable input revisions and contain a bounded plan, not raw user context. This is a logical payload to the current job/adapter owner, not a new job database.

```ts
interface FilmExecutionRequestV1 {
  schemaVersion: 'sah.film.external-task.v1'; taskId: string;
  canonicalGoalRef: string; workflowRunRef: string; stageRef: string;
  canonicalJobRef?: string; // stamped after current Feature 195 admission
  tenantId: string; projectId: string; initiatingPrincipalRef: string;
  filmRef: string; shotRevisionRefs: string[]; inputAssetRefs: string[];
  inputDigest: string; planRevisionRef: string;
  capability: { id: string; contractVersion: string; required: string[];
    optional: string[]; inputModality: string[]; outputModality: string[] };
  constraints: { regionAllowlist: string[]; externalEgressAllowed: boolean;
    rightsEvidenceRefs: string[]; approvalRefs: string[];
    costQuoteRef: string; costCeilingMinor: number; currency: string;
    deadlineRef?: string; minimumControlFidelity?: string;
    userRunnerConsentRef?: string; requiredOutputDigest?: string };
  execution: { eligibleBackendOfferRefs: string[]; selectedOfferRef?: string;
    attemptCorrelationRef?: string; cancellationMode: 'SAFE'|'BEST_EFFORT';
    checkpointRef?: string; leaseEpoch?: number };
  outputs: { expectedArtifactTypes: string[]; verificationPolicyRef: string;
    destinationAssetNamespaceRef: string };
  idempotencyKey: string;
}
```

The request's `tenantId`, principal and approval references are stamped by trusted server code; LLM/tool/user-provided strings are never grants. The current owner resolves `inputAssetRefs` into short-lived least-privilege handles only **after** assignment and independently rechecks licensing and egress. `planRevisionRef` + input digest + provider manifest/version + user-relevant constraints bind the chosen execution attempt.

### 3.2 Qualified ExecutionOfferV1

```ts
interface FilmExecutionOfferV1 {
  schemaVersion: 'sah.film.execution-offer.v1'; offerId: string;
  capabilityId: string; capabilityContractVersion: string;
  backendKind: 'NATIVE_API'|'CF_SANDBOX_CPU'|'LOCAL_RUNNER'|
    'REMOTE_GPU'|'MANAGED_HARNESS';
  backendAdapterRef: string; executionProfileRef: string;
  qualificationRef: string; qualificationStatus:
    'DISCOVERED'|'PROBED'|'CERTIFIED_PILOT'|'CERTIFIED_PRODUCTION'|
    'DEGRADED'|'REVOKED'|'EXPIRED';
  hardwareProfileRef?: string; modelPackRef?: string;
  allowedRegions: string[]; allowedDataClasses: string[];
  outputModality: string[]; featureCombinations: string[];
  priceQuoteRef: string; healthObservationRef: string;
  consentRequirement: 'NONE'|'USER_RESOURCE_OPT_IN'|'SOURCE_EGRESS_CONSENT';
  expiry: string; signedManifestDigest: string;
}
```

An offer is a *scoped projection* of existing trusted registry/Runner/provider observations, never a new truth source. Qualification applies to a full tuple: backend adapter, account and region, runtime version, model/checkpoint plus license, GPU driver/VRAM, conditioning combinations, output resolution/fps and tested workload family. An offer for Text-to-Video does not certify Depth+Pose+Audio jointly. Stale health, expired consent and unsupported locale downgrade eligibility before scoring.

### 3.3 FilmExecutionResultV1

```ts
interface FilmExecutionResultV1 {
  schemaVersion: 'sah.film.external-result.v1'; taskId: string;
  canonicalJobRef: string; attemptRef: string; leaseEpoch: number;
  selectedOfferRef: string; submittedInputDigest: string;
  outcome: 'SUCCEEDED'|'FAILED'|'CANCELLED'|'UNKNOWN_PENDING_RECONCILIATION';
  artifactRefs: string[]; artifactDigests: string[];
  provenanceRef: string; producerReceiptRef: string;
  observedCostRef?: string; qcEvidenceRefs: string[];
  warningCodes: string[]; completedAt?: string;
}
```

A result is eligible for committing a **candidate** Generated Take only if the input digest, current job/lease epoch, exact source revision, asset hash, current rights epoch and verifier assertions all match. A remote agent's `SUCCEEDED` field alone is insufficient; immutable output bytes must be registered through the existing Library/R2 checks. Only Film's domain command handler may accept a verified result into Spec 252's canonical Film revision.

## 4. Capability discovery, qualification and Model Pack admission

Use Spec 244 for research and candidate evaluation, Feature 196's Capability Registry/Resolver for semantic discovery, Feature 197 for Runner capability advertisements, Spec 248 for approved MCP Skill distribution, Specs 199/200/206/239 for MCP/A2A/external-agent discovery, and Spec 231/current Media Gateway for provider accounts. Each discovery source is untrusted until qualified.

**Admission lifecycle:** `DISCOVERED → SNAPSHOTTED → LICENSE_REVIEWED → ISOLATED_PROBED → TASK_CONTRACT_TESTED → BENCHMARKED → HUMAN_APPROVED → CERTIFIED_PILOT → CERTIFIED_PRODUCTION`, with independent `DEGRADED`, `QUARANTINED`, `EXPIRED`, `REVOKED` exits. Discovery must not execute third-party installers. Review each tool's license, weights and downstream derivative constraints, source repository/tag/signature/hash, supply-chain vulnerabilities, requested permissions, runtime/OS/GPU resources, network destinations, privacy class and expected outputs.

**Model Pack Manifest.** For H3/Wan/LTX-class open-weight or community ecosystems, package *separately* the official base checkpoint, quantization, LoRA, ControlNet, ComfyUI Custom Nodes, graph JSON, VAE/text encoder, install dependencies and per-combination verified capabilities. Store publisher, reviewed license evidence and expiry, immutable hashes, source URL/ref, declared tool permissions, runtime/driver requirements, required input conditioning, accepted aspect/FPS/duration, real benchmark receipt and rollback version. Never equate a community graph's advertised feature with compatibility across all quantized checkpoints. Unsupported combinations are a truthful `UNAVAILABLE`, not silent fallback to a base model.

**Tool integrity.** A Custom Node executes code and may reach files/network. Review changes, pin versions, sign manifests, sandbox tests with fake/synthetic inputs, deny live project secrets and unrestricted internet egress, scan produced artifacts and reproduce tests. Installed tools are not promoted from another tenant's approval. A pack may be installed on an opted-in user Runner only following informed owner consent, OS-specific installer verification and a reversible backup. Model licenses and provider ToS MUST be evaluated for exact user purpose and relevant region; do not infer unrestricted use from downloadable weights.

**Capability evidence.** Separate `DECLARED` by creator, `DOCUMENTED` in provider docs, `ACCOUNT_PROBED` at actual endpoint, `BENCHMARK_PASSED` on the tested combination, and `CERTIFIED_PILOT/PRODUCTION` by SmartAIHub approval. Expire evidence on version changes, policy updates, availability changes, driver updates, test regressions and account/region changes. Do not use an LLM's numerical confidence as independent certification.

## 5. Deterministic placement & adaptive replanning

### 5.1 Two-phase selection

**Phase A — mandatory eligibility gate (not negotiable):** Enforce current user grants, scope, output license, data classification, consent, region, model/account entitlement, required control features, tested runtime/driver/VRAM, input size, current health, max duration, checkpoint/recovery support, spending cap, tool trust, approved egress and whether the user explicitly allows use of a personal Runner. Drop all ineligible offers; do not include them in quality/cost scoring or quote them as available.

**Phase B — rank only eligible offers:** Use measured task-family quality, first-preview latency, total expected cost (including retries/transfer/egress), data locality, recovery probability, current queue and user preference. Ranking configuration/version must be logged and comprehensible; a model suggestion is advisory. If no offer satisfies required fidelity or consent, return `NEEDS_DECISION` or `DEGRADED` with an honest explanation and alternatives (e.g., accept a lower-fidelity video-reference route, supply a Runner, select region-compatible provider or defer). No automatic weakening of approved creative constraints.

### 5.2 Route examples and hard requirements

| Task / device profile | Default eligible path | Fallback requiring check |
|---|---|---|
| General Chat or short plan | Existing authorized Gateway | Certified alternate model under Spec 231 |
| Low-cost browser 3D preview | Local WebGL when measured capable | Opted-in Runner or CPU renderer; low-end mobile receives video/image preview |
| CPU Blender-less stage/frame/FFmpeg | Authorized short-lived CF Sandbox/Container where image/SDK/account certified | Existing authorized CPU Runner/other persistent container |
| H3/Wan/LTX inference, ComfyUI | Consented suitable local GPU and verified pack | Independently certified remote GPU / licensed hosted API with egress approval |
| Seedance/other closed provider | Certified current Media Gateway capability | Alternative only if required conditioning/audio/region/rights fidelity still passes |
| Long-horizon research or custom plan | Existing Feature 196 + approved Spec 243 harness if genuinely needed | Current native LLM/Skill; unqualified agent is not chosen |
| Actual platform adapter/code change | Separate Spec 224 development run | Use an existing certified solution or present an unsupported action |

Placement reroutes only **future unaccepted steps** automatically within the same approved constraints. An `accepted` billable third-party attempt or uncertain outcome must reconcile via callback/status/idempotency before a substitute is sent. Local-only media never moves to a cloud provider absent new explicit permission. User preference to use GPU when available is subordinate to hardware safety and a configured time-window/consent policy; Runner discovery is never consent.

## 6. Execution backends and exact boundaries

### 6.1 Cloudflare isolated CPU executor — Spec 242

Use current Spec 242's native Agent/Sandbox/Workflow adapters; do not instantiate a second Film-specific Cloudflare Agent with its own business truth. Approved images are pinned by digest and SDK/runtime tested; enforce CPU/memory/disk/elapsed-time/egress quota and process-tree lifecycle. Provision scratch workspace only after existing job admission; stage bounded short-lived read handles; write partial outputs to quarantine; publish atomic content-addressed R2 checkpoint manifests before advancing stage. On sandbox idle eviction, process failure or platform upgrade, restore a *new* workspace incarnation from verified archive manifest or rerun a safely repeatable step. Never assume process memory/files survive eviction or that CPU sandbox supplies arbitrary GPU.

`SUSPENDED/LOST/UNKNOWN` sandbox effects require receipt reconciliation. Every workspace has a tenant/job scoped identity and egress policy. User withdrawal or asset deletion fences future dispatch and makes existing replay checkpoints ineligible when rights expired. A malicious model node cannot directly mint a new container or access Cloudflare admin tokens.

### 6.2 User/organization Runner, local GPU and ComfyUI — Feature 197

Expose normalized Runner offers: OS, architecture, hardware health/available VRAM, driver/CUDA/runtime, verified local tool hashes, installed model pack hashes, checkpoint disk size, job concurrency, bandwidth, network accessibility, data-locality mode and current owner-approved sharing window. The Runner is the mandatory gateway for *local* tools; ComfyUI and CLI are not independently trusted job authorities. Runner polls/accepts existing canonical fenced jobs and sends progress/outputs with digest and toolchain provenance.

Implement owner opt-in per machine/project/work family, start/end schedule, allowed resources, thermal/electricity cap where feasible, transfer/egress consent, usage display, pause/revoke, and machine-loss recovery. **Do not infer GPU readiness from a registered Runner or a marketing VRAM figure; run per-workload capability probes.** Local project assets can be kept local when permitted, but an external hosted video API cannot use them without a separate transfer consent and protected link. Unknown local acceptance is reconciled through current Runner receipts before reassigning a billable or side-effectful step.

### 6.3 Remote GPU and provider API — Media Gateway / approved resource adapters

Separate GPU compute leasing from video-model API generation, each with distinct pricing, credential, licensing, network and completion models. Remote GPU receives an immutable allowed pack/image and a bounded execution packet via existing Feature 195/197 resource provider semantics; raw model-provider API calls use the current Media Gateway. A provider must report observed billing/attempt IDs and output digests; no fabricated percentages. Explicitly warn when an offer lacks pose/depth/native-audio preservation. Charge for provider-accepted work only through Spec 207 existing ledger policy; preflight quote covers GPU time, data transfer, retries and storage.

### 6.4 Managed agent/harness — Spec 243

Use a bounded `DelegatedFilmIntelligenceTask`: planning goal, required result schema, selected Film scope, redacted minimal Context Pack, tool allowlist, deadline/budget, privacy/region and human-decision boundaries. Provider owns its *session loop* and may autonomously call only scoped tools; SmartAIHub owns goal, approved external effects, physical job admission, artifacts and final verification. An agent can propose camera path, motion, reconstruction or a candidate ComfyUI workflow; it cannot import arbitrary Skills, upload raw Story Bible outside approved bounds, override producer decisions or alter production code. Session ID and provider run ID are subordinate to canonical refs. Timeouts and loss produce `UNKNOWN_PENDING_RECONCILIATION`, not assumed failure.

### 6.5 MCP Skills, A2A and remote tools

Discover only through existing Spec 199/200/206/239/248 gateways. Agent Card/manifest is a claimed capability, not a grant. Normalize capability IDs and typed I/O but retain versioned protocol and provenance. Every external MCP tool call is constrained by tenant/project, action schema, data-minimization and cost. When providers furnish UI, Spec 240 validates/sandboxes typed A2UI or MCP Apps surfaces; third-party HTML or an embedded button cannot bypass server-issued action bindings.

## 7. Conditioning negotiation and future-model extensibility

Film Studio's Spec 252 `Director Graph` remains the sole Film scene/performance truth. A model-specific compiler receives exact `shotRevisionId`, `performanceRevision`, `cameraVariant`, `story/character licensed references`, output aspect/resolution and required preservation constraints, then *asks* current capability registry/Media Gateway for independently verified compatible control routes. Conditioning Adapter output is a versioned immutable manifest of: source digests, generated pose/depth/clay/mask/keyframe refs, coordinate transforms, timebase, provider/compiler/model-pack versions, license evidence and known fidelity gaps.

**Interoperability paths:** Clay/video reference; 2D pose video; depth/edge/segmentation/motion vectors; first/last or timed keyframes; face/voice and native audio when separately certified; direct 3D scene/skeleton/camera trajectory in future provider extensions. Adding a modality is a schema-versioned Adapter + conformance operation, not an alteration of Film's canonical data shape or all product UIs. No assumption that one provider accepts all controls jointly or that pose control provides exact per-frame determinism.

**Model-specific pack principle:** H3 family and community extensions may contribute ControlNet/ComfyUI/quantization/motion-context pack profiles, Wan character animation or LTX-style editing can contribute different input modes, and licensed managed providers such as Seedance can consume supported reference modes. These are **candidate profiles** only until exact current versions/accounts/regions/licensing are tested. The user sees preservation promises and degraded-mode disclaimers *before* approval. Video created for 16:9 cannot automatically become a correctly directed 9:16 shot: share narrative/action revisions but keep independent camera composition and output QC.

**Future-proofing:** Use versioned modality descriptors with registered validators, semantic input/output classes and content-addressed artifact refs. Unknown optional fields roundtrip where safe but never grant privileged processing. Breaking contract changes require a new version and read-old/write-new compatibility adapter. Store provider-specific JSON in signed opaque pack refs, not in Film Scene SQL columns. Keep export adapters for glTF/VRM, OpenUSD and OTIO without assuming every provider supports them natively.

## 8. Lifecycle, recovery, billing and causal dependency

The existing Spec 215 DAG decomposes each Film goal into approved logical stages (story, motion, previs, conditioning, video, audio, assembly, QC, optional localization). Admit physical work through canonical Feature 195 jobs *after* resource and quote checks. Stage input fingerprint includes: source revision IDs/digests, full approved constraint set, chosen conditioning contract, model/pack/runtime version, policy epoch and accepted parent receipts. A user edit invalidates only downstream affected stages after source owner's dependency analysis; already certified unchanged assets remain immutable.

Canonical logical attempt states proposed for adapter mapping: `NOT_SENT`, `SENT_UNCONFIRMED`, `PROVIDER_ACCEPTED`, `RUNNING`, `SUCCEEDED`, `FAILED_CONFIRMED`, `CANCEL_REQUESTED`, `CANCELLED_CONFIRMED`, `UNKNOWN_PENDING_RECONCILIATION`. Map to existing job schema, do not alter historic states without owner approval. Before retry/reroute inspect provider idempotency, accepted job ID, callback cursor, metered usage and already-uploaded artifacts. If accepted outcome cannot be resolved, pause for operator review under existing incident controls rather than silently dispatch another paid provider call. Preserve customer reservation/settlement exactly once according to existing economic owner.

A backend crash may preserve certified immutable child outputs; late callbacks must carry original job/lease/plan revision and cannot commit a superseded Film revision. Cancel is not a guarantee of provider refund. Partial failure returns a first-party artifact card with completed stages, blocked dependency and actionable recover/requote options. Cross-product workflows may have multiple owner-domain revisions but never one giant transaction updating Editor, Creator and Drama databases.

## 9. Chat, Task Control and safe UI requirements

Existing full Chat, compact launcher and phone/tablet SHALL show the same conversation and goal/task references. A Film task card can show plan, current stage, truthful progress state, estimated and observed spend, currently assigned resource category (not private device identity), related Shot/Take refs, partial previews, approvals and available actions. User commands `ใช้ GPU เครื่องฉันถ้าว่าง`, `ย้ายไป Cloud`, `ขอพรีวิวก่อน`, `ไม่ส่งข้อมูลออกนอกเครื่อง`, `แก้ช็อตสาม` and `เปิด Timeline` map to typed existing action APIs, verified resource policy and revision-fenced Film commands—not direct backend flags or tool-origin JavaScript.

Spec 240 owns trusted component validation and optional generated progress/preview/motion compare UI. Unsupported/low-end clients receive native cards, thumbnails, playable proxies and text actions. The selected page, clip and time-range use Feature 196 permission-filtered Page Context Envelope, refreshed after route/device switch. A stale or guessed project may be used for read-only suggestion only where approved; external egress or spend demands a confirmed target. Chat never lets a third-party hosted agent author its own approval button.

Task Control reads existing job/run/domain projections from Specs 225/226; child GPU and Cloudflare job attempts are *children of the same visible goal*. `Runner 0/0` or `MCP 0/0` only affects dependent capabilities, not eligibility for cloud-backed work. Decisions/approvals accepted on one device are immediately stale elsewhere via version/epoch and current-rights recheck. No new Film-specific task control state machine.

## 10. Security, legal provenance, tenant isolation and independent QC

Every external task is classified for secrets, restricted customer media, private likeness/voice, project IP, licensing conditions, cross-border transfer and output publication rights. Enforce server-side per-tenant and per-project ACL at metadata lookup, signed URL issue, remote credential grant, job admission, result ingest and public export. External agent receives no global DB/vector credentials or arbitrary filesystem access. Sandbox denies inbound control-plane/admin egress; outgoing domains are explicit allowlist; logs are redacted; input media is private by default. Revoke external access when consent/project rights expire and tombstone cached outputs according to governing retention rules.

Output QC uses deterministic frame/audio/container checks plus independent film-domain verifiers (reference identity, shot sequence, pose trajectory, framing/fidelity, native audio sync, Thai dialog where applicable, source/derivative rights). Treat all vision/LLM scores as calibrated evidence and keep human review for uncertain high-impact defects. A package creator cannot approve their own unsafe pack solely from its reported benchmark. Runtime image, custom node, checkpoint and external Agent versions are reproducible via provenance and must support rollback. If exact rights are unclear, the feature remains unqualified for the affected region/usage; this specification does not purport to resolve unsettled license interpretations.

## 11. Additive delivery work packages and go/no-go gates

| Package | Owner interface | Deliverable | Required exit evidence |
|---|---|---|---|
| E0 Actual source reconciliation | 252/253, 196/197, 215, 242/243 and deploy owner | Verified spec registry, active worktrees/PRs, service API/schema and migration journal; flag defaults OFF | Owner map, ABI/API compatibility fixtures; no speculative production DDL |
| E1 Film task & offer contracts | 254 → existing registry/job owners | Versioned JSON Schemas, feature-tuple descriptors and immutable task/result lineage | Valid/invalid corpus; zero unchecked `UNKNOWN` offers |
| E2 Capability qualification pilot | 244 + 248 + model gateway | Signed/hashed test pack, approved synthetic benchmark, exact license & region review | Profile CERTIFIED_PILOT only after offline review; quarantine rollback passes |
| E3 Cloudflare CPU executor | 242 + Feature 195 | Pinned image, FFmpeg/previs CPU test, R2 scratch checkpoint, failure/restart | Eviction/cancellation/tenant-escape/egress and duplicate callback tests |
| E4 Opt-in local Runner GPU | Feature 197 | User consent/preferences + ComfyUI pack validation + scoped physical job dispatch | Real VRAM/driver probe, thermal/concurrency guard where supported, revocation and offline fallback |
| E5 Hosted provider / GPU | Current media gateway and qualified GPU backend | One lawful actual-account provider per tested modality; generation receipt reconciliation | No unapproved egress; real billable timeout and no-double-charge tests |
| E6 Hosted intelligent agent (optional P1) | Spec 243/200 | Bounded camera/motion/reconstruction task; independently verified result | Provider session loss, forged completion and expired context tests |
| E7 Film workflow demonstration | 252 + 215 + 254 | One shot from chat→pose/clay→model→QC→review with 9:16 and 16:9 variants | Pinned source digest, separate compositions, approved budget and honest failure |
| E8 Safe cross-product handoff | Spec 253/Editor/Drama/251 | Optional candidate import and localization from resulting asset | Legacy flows work with flags OFF; locked editor segments and native-audio originals preserved |
| E9 Adaptive discovery and safe self-extension (P2) | 244/248 + separate Spec 224 | Tool candidate evaluation, diff-based adapter proposal through PR | Signed review/independent tests; no autonomous production deployment |
| E10 Canary and performance | Existing release/migration owners | Two-tenant opt-in release, rollback and no-customer-loss validation | Zero cross-tenant leak, unauthorized spend or original product regression |

**MVP definition:** E0–E3 and E7 with **one** certified executable video route; E4 only when a real opted-in qualified Runner exists. E6, advanced model-pack marketplace and E9 are not launch blockers. Disabling this spec's flags removes adaptive placement while Film Studio's existing simple Previs, Editor, Drama and Creator continue to work.

## 12. Required design acceptance and chaos corpus (NOT executed)

| ID | Scenario | Required assertion |
|---|---|---|
| FE-001 | Existing Film scene exported with external flags OFF | Native scene/pose/clay draft persists; original Editor/Drama/Creator unaffected |
| FE-002 | User mobile with no Runner or MCP | Eligible API/CPU sandbox path works; no impossible local-GPU dependency |
| FE-003 | Tool discovered from GitHub README | `DISCOVERED` only; cannot run on customer production data |
| FE-004 | MCP/A2A agent self-advertises admin rights | Reject inherited permissions; bind actual least-privilege grants |
| FE-005 | Unreviewed ComfyUI Custom Node tries file/network access | Quarantine; no credential exposure; fails safe |
| FE-006 | Local GPU advertised 16 GB but usable free VRAM too low | Deny heavy offer; present certified alternate quote |
| FE-007 | Runner exists without opt-in | Not eligible for GPU task; no local file access |
| FE-008 | User revokes Runner grant during accepted task | Fence new dispatch; reconcile existing attempt; revoke upload handles |
| FE-009 | Local-only media and failed local GPU | No silent remote upload; offer offline/review alternative |
| FE-010 | CF Sandbox loses workspace mid-FFmpeg | Restore verified R2 checkpoint or safe rerun; no orphan final asset |
| FE-011 | CF image/SDK/toolchain incompatibility | Block affected placement, preserve other available routes |
| FE-012 | Cloudflare CPU sandbox asked for large GPU model | Mark incompatible, route only separately certified GPU/API |
| FE-013 | Provider accepts paid call then request times out | Reconcile accepted request ID before retry, one customer settlement |
| FE-014 | Provider callback arrives twice or out of order | Deduplicate via job/attempt/epoch; one accepted Film result |
| FE-015 | Callback for superseded shot revision | Preserve evidence but never overwrite current shot/take |
| FE-016 | Hosted agent reports `SUCCEEDED` without valid artifact hash | Independent verifier rejects candidate commit |
| FE-017 | Hosted agent tries to read whole private Project Memory | Only allowed minimum Context Pack, trace violation |
| FE-018 | Agent session changes tenant/project without new grants | Deny; revoke old action bindings and cached context |
| FE-019 | Remote provider region violates approved residency | Ineligible before scoring; no external egress |
| FE-020 | H3 candidate ControlNet+quantization combo not tested | Explicit `UNAVAILABLE`, even when components individually documented |
| FE-021 | Community Model Pack license incompatible with commercial export | Reject relevant output or require separate lawful authorization |
| FE-022 | Model unavailable after budget approved | Present compatible alternatives with revised quote; no silent quality downgrade |
| FE-023 | 16:9 and 9:16 from one performance | Two independent camera variants/QC; unchanged skeleton revision reused |
| FE-024 | External GPU disappears while output upload partial | Partial quarantined; recover or review without corrupt Film asset |
| FE-025 | User switches phone→desktop→compact Chat | Same canonical conversation/goal, fresh action tokens and review refs |
| FE-026 | Film to existing Video Editor | Candidate EDL, unchanged current timeline and manual locks until explicit apply |
| FE-027 | Film to Vertical Drama | Candidate take, existing native audio and series bible unchanged until domain accept |
| FE-028 | Film/Drama to Creator | Creator independently checks voice consent, locale QA and exact export hash |
| FE-029 | Tool pack update regresses benchmark | Stop new dispatch to updated pack, retain pinned qualified previous version |
| FE-030 | Spec 244 proposes a new tool requiring core code | Send separate scoped Spec 224 development request; no direct production install |
| FE-031 | Stale page selection commands `แก้ตรงนี้` | Resolve safely or ask target choice; never mutate guessed shot |
| FE-032 | Task Control reports GPU job cancel | Show actual provider cancellation/charges; not guaranteed refund |
| FE-033 | ComfyUI graph references nonexistent model/checkpoint | Detect before accepting physical job; no surprise partial billing |
| FE-034 | Secret in prompt/clip metadata asks agent to call tool | Ignore injected instruction; policy owner remains authoritative |
| FE-035 | Rights/consent revoked during provider generation | Stop further controlled processing, fence future exports and obey deletion policy |
| FE-036 | Quota/financial cap hit mid-run | Pause future billable stages, surface honest operator/user decision |
| FE-037 | Runner telemetry goes stale | Exclude offer until re-probed; admitted job follows lease timeout policy |
| FE-038 | No eligible offer remains | Return `DEGRADED`/decision with precise missing capabilities, not success |
| FE-039 | Multiple agents suggest different camera paths | Keep alternatives as Film drafts; domain owner/human approves one revision |
| FE-040 | Untrusted Mini App launches GPU action | Existing Spec 240/220 scoped action binding and same billing approval required |
| FE-041 | Immutable Film output is linked to withdrawn remote provider | Approved lawful asset remains retrievable unless rights policy mandates removal |
| FE-042 | SDK runtime updated without account probe | Invalidate affected certification before enabling changed profile |
| FE-043 | Concurrent task proposals race on one performance revision | Optimistic revision conflict, no lost edit or unrequested rerender |
| FE-044 | External provider outputs wrong FPS/timebase | Fail technical QC and prevent silently drifted Editor/Creator handoff |
| FE-045 | Disabling Film external flags during existing work | Drain/settle admitted attempts according to owner; no customer work loss |

## 13. Required cross-spec amendments and merge instructions

- **Spec 252:** add 254 as a *Film-owned integration dependency* for external task profiles/qualification, without transferring Film Scene/Shot/Performance truth or creating Film runtime state. Preserve basic low-cost Previs with 254 OFF.
- **Spec 253:** bind portable Film Task/Offer/Result refs into its universal Product Command and Media Handoff protocol. 253 owns cross-product interoperability **only**; 254 chooses certified execution for Film stages.
- **Feature 197 / historical Features 195/196:** create additive improvement backlog/compatibility bridge in Spec 226 or the relevant post-freeze owner; no retroactive edits to frozen 1–214. Runner remains exclusive local execution gateway and job truth stays canonical.
- **Spec 215:** add a declarative Film stage recipe and fingerprints/recovery adapter only; never introduce custom Spec 214 Node Types or a new workflow runtime.
- **Specs 225/226:** one Chat/Task Control task/ref/result/attention projection for local/remote/external execution; no second Conversation or product-only Task Board.
- **Spec 240:** safe Film preview/plan/offer/approval cards through existing GeneratedSurfaceEnvelope; UI source is not permission.
- **Spec 242:** certify Film CPU sandbox image/checkpoint/egress/eviction mapping through existing adapter; Cloudflare GPU remains separate capability evidence.
- **Spec 243:** approve Film-delegated managed-harness task profile, bounded tool grants, session events and independently verified results; no provider-owned finality.
- **Spec 244:** intake new media/3D/motion/model tools, compare versioned benchmarks, recommend only; production promotion through established authority.
- **Spec 248:** catalog approved Film Skills/Model Packs with provenance and revocation; no auto-install from discovery.
- **Spec 251 / existing Video Editor / Vertical Drama:** optional Spec 253 handoff only; original workflows and native audio/timeline locks unchanged.
- **Specs 231/247/220/207/227:** verify exact routing/audio/rights/billing/release policy tuples; reuse actual deployed owner APIs and account entitlements.

Before merging any revised spec, reconcile SHA/version of current SmartSpecPro main, open branches, active worktrees and deployed API/schema with the source manifest. Protect Spec 224 implementation and current Cloudflare migration owner gates. Suggested repo path is illustrative; this document alone does not reserve the spec number.


---

# AUDIT-R1.1 / 20-PASS IMPLEMENTATION HARDENING — SPEC 254 (2026-09-27)

**Normative precedence.** This appendix strengthens Film-specific use of the existing shared execution and qualification authorities. It does not establish a parallel Scheduler, Registry, Run Ledger, Sandbox SDK, GPU Marketplace or security policy. Preserve v1 wire fixtures for archival conformance; new clients negotiate separate v1.1 contract schemas. Do not assume any vendor/model/account capability is production-certified from saved documentation. No live GPU/API billing, Cloudflare eviction or deployed system was exercised in this document audit.

## C1. Workload specification and joint capability matching

`FilmExecutionRequestV1_1` MUST include source and policy epochs, exact immutable Film/Shot/Performance/Camera/Conditioning references, expected timebase/pass alignment, required creative preservation set and permitted fallback set. Workload classes separate `PLAN_REASONING`, `3D_PREVIS_CPU`, `MOTION_GPU`, `VIDEO_GEN_GPU`, `VIDEO_API`, `VIDEO_EDIT`, `AUDIO_FINISH`, `INDEPENDENT_QC` and `TOOL_EVALUATION`. Declared capability evidence and tested **joint** conditioning combinations are distinct; never infer a model supports Pose+Depth+Audio+long duration+9:16 from independent single-feature claims. Missing fidelity is explicitly quoted and requires the creator's decision before dispatch.

`FilmExecutionOfferV1_1` MUST bind account+region+model checkpoint hash+adapter/toolchain/container image+GPU/driver profile+input pass combination+output FPS/aspect/duration+tested benchmark revision+license grant scope+health observation expiry. A `CERTIFIED_PRODUCTION` label without a matching current tuple is ineligible. Spec 231 routes text/video model support where it owns the route; Film only supplies workload requirements. The qualification tuple is immutable per admitted attempt even if new Model Pack version becomes available.

## C2. Resource selection, privacy and complete quote

Selection sequence: resolve currently authorized resources → filter ACL/consent/source locality/region/output license/conditioning/health/VRAM/image/runtime/quota → compute data-transfer and run-time quote → optionally compare latency and measured quality → request approval for policy-sensitive paid external work → reserve through Spec 207 → admit through Feature 195. Avoid spurious tasks on disconnected runners. `USER_RESOURCE_OPT_IN` is machine/work-family/project scoped and revocable; Runner discovery is not opt-in. Never transfer local-only originals to hosted GPU, managed agent or provider API without new user-granted egress purpose and authenticated upload path.

Quotes include provider units, GPU compute, storage, ingress/egress, potential repair iterations, creator's maximum total spend and stop condition. A new fallback's cost or privacy class outside the accepted envelope requires a fresh decision. Placement preference and model quality are subordinate to mandatory data/rights constraints. Cloudflare CPU Sandbox is an allowed *execution class* only where the account/region/image/SDK workload is independently certified; it is not an implicit GPU service.

## C3. Exactly-once external effect admission and unknown outcomes

The existing canonical job service stamps `canonicalJobRef`, attempt/lease epoch, provider idempotency token and immutable approved execution-envelope digest. **All side-effecting dispatches** use a durable pre-send intent and accepted/unknown outcome reconciliation through existing worker_job events/outbox (or the current owner-approved equivalent). Retry is allowed only when `NOT_SENT` is proved or provider idempotency/status query proves same logical effect; unknown provider result always enters review/reconciliation before any substitute paid call. Revocation or cancel after accepted execution fences new work and future release, but it cannot retroactively assert the vendor did not charge.

Remote results MUST bind the exact admitted job+attempt+offer+input digest+rights/policy epochs and expected artifact count. Library/R2 validates actual artifact bytes and checksum in quarantine; independent QC compares declared control fidelity, audio and expected source/camera/version. `SUCCEEDED` from the provider is **observed execution**, not canonical Film commit or Final Verify. If a callback arrives after Film changed, attach it to historical revision or operator review only; do not silently promote stale output or charge customer twice.

## C4. Cloudflare sandbox and opaque remote execution

Spec 242 controls Cloudflare Agent/Sandbox identity, tool grants, egress and temporary container lifecycle. Every Film task uses a pinned digest of image/toolchain/workspace manifest and tenant-scoped scratch paths; no live platform admin secrets or cloud credentials enter untrusted subprocess environment. Apply CPU/time/memory/disk/process/network ceilings, block metadata and private network egress unless a reviewed destination exception exists, and quarantine output before R2 commit. Sandbox cancellation signals are best-effort until canonical receipt confirms terminal outcome; neither provider Workflow state nor local container files are canonical job truth.

Persist a checkpoint only after *all* required output chunks and exact asset hashes are durably written, then atomically publish an R2 content-addressed checkpoint manifest. On eviction restore into a new workspace incarnation; never revive old lease ownership or stale signed URLs. Resource/egress denial is `DEGRADED` with a first-party user decision, not a hidden local file leak or recursive retry loop.

## C5. Local Runner, local-only assets and fallback limits

Feature 197 remains the exclusive gateway for local tools/GPU/ComfyUI. A Runner offer MUST expire promptly, carry actual usable memory/disk/driver state and independently tested pack compatibility, and specify the machine/tenant/project/user authorization scope. Respect owner-approved time window, concurrency, thermal/VRAM pressure and local file grants; encrypt/expire per-job handles and redact local path/user directory information from Chat and generic traces. A Runner failure after acceptance requires lease and receipt reconciliation before any remote failover. A user machine that goes offline does not cause a cloud upload of local-only source media by default.

For a phone-only user, offer authorized cloud CPU preview and an **account-eligible** hosted video API or remote GPU without mandating Runner or ComfyUI. If no eligible resource exists, return an actionable reviewable `NO_ELIGIBLE_OFFER` state and retain editable Film draft; do not fabricate success or promise unavailable cloud compute.

## C6. Hosted agents, tool development and independent review

A managed Agent under Spec 243 receives a narrowly scoped, minimized Film task packet with explicit allowed data classes, allowed tools, budget, timeout and expected typed result. It may return draft camera/motion paths, proposed ComfyUI graph or an evaluation report—not unreviewed code/configuration to live production. Provider session IDs are subordinate; run loss reconciles provider events/receipts. A model's self-rated score is never production QA. If a genuinely missing adapter requires code, hand off a separate *development* goal to Spec 224 with isolated worktree, tests, review and approved promotion. No recursive uncontrolled self-modification from a normal Film request.

## C7. Research→pack qualification→safe deployment

Spec 244 proposes discoveries; Specs 221/248 review Skill provenance; existing registries own registrations and revocations. Split base model, quantization, ControlNet, LoRA, text/VAE encoders, ComfyUI Custom Nodes, workflow JSON and runtime into **distinct signed immutable parts**, then certify only explicit tested combinations. Bundle manifests include exact upstream license and geography, artwork/voice training-source restrictions when applicable, publisher identity, provenance, asset origin, dependency hashes and rollback pointer. License approval of a checkpoint does not cover an unrelated community Custom Node or an output's downstream distribution rights.

Unreviewed packages run only in quarantined synthetic-data sandbox with no tenant secrets and restricted egress. Test initial and updated packages for deterministic install, integration, negative security and resource-pressure behavior. A newly published GitHub repository, A2A Agent Card or MCP Skill remains DISCOVERED only until its specific build/feature tuple passes verification. Quality/cost improvements may nominate a pack for pilot but cannot activate it for all tenants without owner approval and rollback evidence.

## C8. Runtime portability, result reproducibility and QC

Version each Adapter/Executor Contract independently from film records and capture image SHA, toolchain/driver hash, seed where supported, exact input/output hashes and intermediate conditioning manifests. A deterministic Pose/Clay renderer must reproduce byte-identical outputs under pinned runtime when codec/container timestamps are normalized or offer a declared canonical decoded-frame hash; do not demand byte-identical output from inherently stochastic video generation. Compare model outputs by declared metrics and reproducible test corpus, with optional human side-by-side review. Cross-backend fallback never degrades required creative controls or replaces an accepted paid request without reconciliation.

## C9. Finite recovery, observability and policy revocation

Define bounded retries with budgets, lease fencing, a dead-letter/operator review state and no orphan cloud resources. Record structured sanitized events: admission, dispatch, provider accepted, unknown pending, checkpoint, quarantine, independent verify, candidate commit, charge settle, user decision and rollback. Correlate canonical goal/workflow/job refs without logging raw media, signed URLs, private filenames, prompts containing secrets or provider credentials. An asset/consent/region/policy epoch change fences subsequent stages and invalidates output export eligibility according to canonical policy; existing remote attempts are cancelled where supported and otherwise tracked honestly until terminal reconciliation.

## C10. Film-specific release gates and no-regression guarantee

Pilot requires: one verified provider route for the chosen workload, one optional tested local Runner profile if enabled, one independently probed CPU sandbox *only if enabled*, real unknown-acceptance and duplicate callback tests with provider sandbox/test account where available, full signed artifact/hash verification, explicit localized consent handling, mobile no-Runner demo, unchanged Editor/Drama/Creator with flags OFF, two-tenant access isolation and recoverable disabled rollout. Production promotion requires current repo SHA, real deployed API/DDL fit, source-owner approvals, cloud/provider account entitlement and spend-cap proof; **document-generated test fixtures alone do not satisfy this gate**.

**Acceptance gates A254-01–15 (design-only):** 01 full qualification tuple; 02 no guessed Cloudflare GPU; 03 joint conditioning fidelity; 04 local consent/offline file; 05 phone-only remote compute; 06 rights/region egress; 07 pre-send intent; 08 provider unknown/duplicate callbacks; 09 source-epoch stale result; 10 container eviction checkpoint; 11 local Runner low VRAM/cancel; 12 hosted-agent draft-only external outputs; 13 community pack license/supply chain; 14 two-tenant rollback/old-product parity; 15 owner-approved cost/quality pilot and canary.


---

# AUDIT-R1.2 — NEW 20-PASS DEEP CONFORMANCE HARDENING (passes 21–40 cumulative)

**Precedence:** New, proposed Film-domain external-execution constraints only. The physical scheduler, Runner contract, isolation backend, global registry and managed-agent lifecycles remain with Feature 197 and Specs 242/243; this spec supplies admission requirements and conformance. All named public provider features below are *candidate* capabilities pending exact model/version/account and license verification.

## F1. Fully bound provider tuple and transitive supply-chain qualifications (pass 35)

A candidate model or community workflow MUST be qualified for a *whole combination*: model+checkpoint hash, ControlNet and LoRA hashes, ComfyUI/Custom Node pinned revision, Python/CUDA/driver/toolchain, selected conditioning inputs, output format/length/aspect/audio, exact tenancy+region entitlement and independent rights/redistribution terms. Base-model approval never automatically covers a community pack, turbo variant, quantization or transitive dependency. `ModelPackAdmissionManifest` includes signed owner, checksum/SBOM and known vulnerability policy, dependency lock, operating region, use class (personal/commercial/training/distribution), review/benchmark receipts, expiry/revocation and pack-specific fallback semantics. H3, Wan, LTX and managed providers remain candidates until this tuple passes a real entitlement and quality probe; no unsupported numerical claim. Tool updates default to sandbox staging, not auto-install into Production or a user's Runner.

**Acceptance D254-35:** H3 base approved but a new ControlNet/accelerator combination untested ⇒ block joint claim; revoked license expires an offer without erasing historical fact that it previously ran.

## F2. Recursive data-egress and tool-invocation boundaries (pass 36)

`FilmExecutionRequestV1_2` SHALL specify an immutable data-classification and transitive egress graph: source refs+origin region, purpose, allowed recipients/categories, max bytes, TTL, no-training/no-logging conditions where enforceable, approved third-party tools and subagent delegation count/depth. An Agent whose direct endpoint is authorized cannot delegate to an unapproved fourth-party model, silently replicate a private Story Bible in logs, or convert a local-only file into a remote URL. Credentials stay with trusted Secret Broker/egress proxy and are never copied into prompt, workspace or generated UI. Prompt injection in captions, scene metadata, retrieved web pages, SVG/GLB extras, subtitles or a community Skill never alters declared resource permissions. If a backend cannot provide an enforceable egress guarantee, the route is ineligible for classified content; do not mislabel provider contractual assurances as runtime network isolation.

**Acceptance D254-36:** authorized hosted agent tries an unlisted web upload or delegated MCP tool to transmit local-only footage ⇒ denied and event recorded; ordinary non-sensitive text planning still works.

## F3. Runner occupancy, owner consent and portable recovery limits (pass 37)

Resource eligibility SHALL include current owner opt-in for exact machine/project/work class/window, hardware probe freshness, power/thermal guard where measurable, GPU available VRAM *after* other local workloads, disk quota, network health, operating system, pack hashes, isolation capability and job checkpoint support. A machine merely registered or once online is not an offer. Shared third-party user GPU pooling remains **OFF** without an independently governed policy and owner grant; private self-use is not marketplace authorization. Priority/fairness across workloads must follow platform Feature 197 policies, not an ad-hoc Film scheduler. An accepted attempt retains its canonical job/lease epoch; Runner offline or claim expiration requires receipt reconciliation before moving a non-repeatable job elsewhere. A source marked `LOCAL_ONLY` may fail cleanly rather than 'fallback' to Cloud against consent.

**Acceptance D254-37:** battery/thermal shutdown and Runner disconnect mid-previs preserve verified checkpoint; no unconsented cloud upload; eligible tablet-only user can run independent cloud path when allowed.

## F4. Cloudflare container lifecycle and actual cost (pass 38)

Cloudflare Sandbox/Container instance creation is not an automatic GPU offer; CPU subprocess tasks must have a registered image digest, scoped filesystem, user+tenant isolation, restricted network egress, bounded wall/memory/disk, lease/heartbeat/cleanup and approved media codec. Snapshot mutable work only via checksummed immutable R2 asset manifest committed through existing canonical job transition. Treat container eviction/restart as new incarnation fenced by the same parent job/attempt reconciliation; local temp files are never presumed durable. Cancel/expiry must revoke credentials, stop children where supported, delete or expire intermediate media according to retention, reconcile provider-observed runtime/transfer billing and surface unsupported cancellation honestly. No secret or customer original in ordinary logs.

**Acceptance D254-38:** kill sandbox between artifact upload and event commit ⇒ reconcile digest from quarantine, no double final output/charge; an evicted sandbox cannot publish late files under an old lease.

## F5. External outcome and artifact trust, not provider-declared success (pass 39)

`FilmExecutionResultV1_2` SHALL replace parallel artifact refs/digest arrays with mandatory `verifiedArtifacts[]`: each item carries exact AssetRef revision, byte size, MIME/probe result, SHA-256 computed by *SmartAIHub trusted ingest*, quarantine scan receipt, media duration/fps/timebase when video/audio, independent QA receipt, production use restrictions and source attempt/lease epoch. Provider-supplied digest is untrusted comparison input only. A result may be `SUCCEEDED` at provider and yet remain `QUARANTINED`, `QA_FAILED`, `POLICY_REVOKED` or `WAITING_RECONCILIATION` at Film. Accept only when submitted input, stage plan, selected offer, exact shot+camera+performance revisions, policy/consent/rights epochs, canonical job/attempt ID and verified artifacts match current approved target. A late but valid output belongs to historical revision for explicit rebase, never automatically to active Shot; acceptance and outbox publish are atomic under existing PG conventions.

If provider accepted a billable request but result is unknown, query provider by accepted job ID/idempotency before any retry; if unqueryable, raise operator attention. `exactly-once customer settlement` is a business effect enforced by Spec 207 receipts, not an impossible promise of exactly-once execution from an unreliable external provider. The cost quote covers accepted work, output storage, GPU wall, transfer and bounded retry ceiling; never confuse an estimated provider price with a settled debit.

**Acceptance D254-39:** one provider returns wrong output digest, another returns reused AssetRef and a third sends a stale lease event: all quarantined/rejected without debit duplication; late valid callback may be reviewed on old revision.

## F6. Safe tool development, review and platform evolution (pass 40)

Spec 244 may discover candidate algorithms or operator-requested integrations. An approved isolated qualification job can benchmark or generate a *draft* plugin/ComfyUI workflow, but none may self-install or self-publish into the production Capability Registry, Marketplace or customer Runner. Promotion requires Spec 221/248 package review; for platform code changes use the existing Spec 224 protected fork → isolated implement/test/security review → regression evidence → human decision → PR/Final Verify lifecycle. Spec 253 owns optional cross-product adapter conformance, and Specs 225/226 show readable Task Cards and independent approvals through shared Chat. Observed user success/reject signals may inform approved local/tenant-scoped evaluation only; never silently use private Film assets to train a third-party model. A provider uninstall must leave Director Graph, paid job receipts, original media, native Editor/Drama/Creator and historical review accessible under existing rights/retention policy.

**Acceptance D254-40:** malicious Skill claims administrator action or installs a custom Node: rejected before privileged execution; an independently tested new model pack only enters canary after owner approval; rollback restores prior production without rewriting active Film data.

## F7. New R1.2 wire compatibility and release gates

R1.2 schema adapters introduce a new version for `film-external-task`, `film-execution-offer` and `film-external-result`; keep v1/v1.1 snapshots readable for historical receipts and expose explicit fallback/unsupported states. Production promotion requires current repo registry and DDL journal reconciliation, exact real-account backend probes, two-tenant auth/economic canary, Browser/Local/Cloud job drain and negative egress tests, actual revocation drill, and Editor/Drama/Creator flag-OFF golden fixtures. Any failure blocks only affected optional placement or creative control where safe, not baseline Chat or native Film drafts.
