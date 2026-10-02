---
spec_id: 251
numbering_status: PROVISIONAL_PENDING_CANONICAL_REGISTRY_CHECK
name: SmartAIHub Creator Workspace & Media Localization
version: 0.1.0
status: DESIGN_PROPOSAL_NOT_IMPLEMENTED_NOT_PRODUCTION_CERTIFIED
prepared: 2026-09-27
source_baseline: OpenCreator public GitHub README inspected 2026-09-27; SmartAIHub Library spec snapshots
canonical_owners: Creator product shell / media-domain orchestration and revisions only
implementation_boundary: Specs 1-214 immutable; Spec 224 active and unchanged; Spec 250 assigned to another proposal
companion_specs: [215,216,217,220,221,225,226,227,229,231,232,233,234,236,237,240,241,242,245,247,248]
suggested_path: specs/feature/251-creator-workspace-media-localization/spec.md
initial_feature_flags: OFF
---

# Spec 251 — Creator Workspace & Media Localization

**Purpose.** Deliver a guided, end-to-end creator product for authorized source intake, source-grounded writing, multilingual subtitle/dubbing production, video-editing collaboration, safe export, and optional publishing. Existing SmartAIHub capabilities remain the execution and data authorities. This specification owns **creator-domain product composition and revision coordination**, not a second LLM gateway, Agent Runtime, speech service, project store, billing ledger, video-editor engine, or workflow compiler.

**Registry gate.** `251` is a candidate number because the Library-visible Spec 250 is already owner-assigned to development execution reliability. Before admitting this document, inspect the canonical SmartSpecPro registry plus main, open PRs, branches, worktrees, untracked spec files and owner decisions. If 251 conflicts, reassign this proposed new document; NEVER rename or overwrite an admitted earlier spec. This file does not authorize a database migration or production rollout.

**Baseline gate.** User reports implementation has reached **Spec 214**; preserve Specs 1–214 exactly. Spec 224 remains active and is not in-place edited. The attached updated documents for 215/216/225/226/227/234/240/247 are **proposed full-document revisions preserving existing text** until respective owners reconcile actual repository revisions, deployed APIs, migration journal and other in-flight changes.

## 0. User outcomes, differentiation and non-goals

Users SHALL be able to (1) create a Project-linked creator workspace, (2) import rights-eligible local/Library media or an authorized source URL, (3) choose a target such as video translation, article, short script, thumbnail or repurposed short, (4) inspect a plan, budget and rights/voice consent, (5) run existing Skills/Workflow capabilities while away from the device, (6) edit text, timings, shot choices and styles via either Chat or visual editors with a shared revision, (7) run only invalidated downstream steps, (8) compare language/aspect-ratio versions, and (9) export or submit authorized publishing artifacts with provenance and no double customer charge.

Out of scope: a new canonical Node Type, custom global queue/credit database, a parallel Project/Library/Memory store, automated mass downloading of unauthorized content, bypassing DRM/paywalls/logins/platform controls, arbitrary external cookie collection, unconsented voice cloning or impersonation, guaranteed support for a specific number of languages/providers, replacing an existing full timeline editor, unverified automatic publishing, mandatory GPU/desktop inference, and a second autonomous-development runtime. Auto Clips and Digital Avatar are optional future product slices, not dependencies of P0.

### 0.1 Evidence and competitor baseline

At inspection time the public OpenCreator README describes ten available tools: video translation, video download, thumbnails, image generation, article writing, Xiaohongshu posts, short-video scripts, stick-figure animation, smart dubbing and video generation. It describes Auto Clips and Digital Avatar as in development. Its published video-translation page claims 101 target languages; this is an external project claim, **not** a SmartAIHub requirement or account certification. Its shared Chat/Workspace state, versioning and packaged desktop flow are useful UX benchmarks. SmartAIHub SHALL not assume API access, licensing, language quality or provider entitlement from a competitor README. Source: https://github.com/krillinai/OpenCreator (checked 2026-09-27).

## 1. Explicit ownership and compatibility table

| Concern | Sole canonical owner | 251 responsibility |
|---|---|---|
| Canonical 16 Node Types and manifests | **Frozen implemented Spec 214** | Use existing `typeId` contracts and capability binding; propose additions through a future versioned registry change only if conformance demonstrates a genuine semantic gap |
| Workflow plan, fork, retry, checkpoint and execution | Spec 215; physical durable work in existing `worker_jobs` | Supply creator-domain DAG, cache/invalidation inputs, semantic edit intents and ArtifactRefs; never schedule a competing job |
| Workflow Studio and Flow-to-Mini-App | Spec 216 / implemented 209 baseline | Ship creator presets/templates through the existing Studio and Mini App definition |
| Agent/intent/dialogue | Feature 196 and existing orchestrator; external adapters 200/239 | Interpret creator commands as bounded, reviewed proposals; no creator Agent Runtime |
| GenUI / shared declarative surfaces | Spec 240 | Define Creator UI slots/typed payloads; no JSX generation engine in 251 |
| Existing Video Editor / Rough Cut / render engine | Existing media-domain implementation and its verified contracts | Integrate EditPlan, EDL, timeline snapshots and render preset contract; no duplicate editor |
| Speech ASR, TTS, diarization and alignment | Spec 247 | Create localization plans, locale variants and review workflow; no private speech-provider SDK bypass |
| LLM/provider policy | Spec 231 and AI Gateway | Request verified text translation/image/video capabilities by contract |
| Project identity, private knowledge and Memory | Spec 233 / 241 | Bind authorized ProjectRef and source versions, never invent or merge project membership |
| Tenant policy, source rights, approval, egress | Spec 220, rights/provenance lineage and existing Approval | Add creator-specific intake, consent and release context through approved policy hooks |
| Retrieval, RAG, authoritative factual evidence | Spec 229 / Cloudflare Vectorize projection | Supply authorized source-set/version to script, translation glossary and claims checks; search success is not permission |
| Media bytes and artifact references | Existing Library/R2; PostgreSQL System of Record | Introduce only domain-specific immutable revision manifests linking source assets |
| Credits and billing | Spec 207 existing economic authority | Show plan estimates and variant-level actuals; never reserve/settle in a second ledger |
| Skills authoring and exchange | Spec 221 / Spec 248 | Define candidate Creator Skill packs and parameter profiles; Skills cannot automatically execute privileged tools |
| Publishing/content/rights certification | Spec 227 and existing provenance policy | Submit exact exported bytes and per-locale revision for certification |
| Devices, attention and action bindings | Specs 225/226 | Desktop/Web full editing; mobile/tablet intake, review, approve and export status |
| Distribution, white-label and Mini App sale | Spec 217 / existing marketplace, Spec 234 upgrade | Productize approved creator templates without duplicate listing/payment authority |
| Cloud target and migration | Specs 232/245; Agents SDK 242 as optional execution placement | Target Workers for short trusted control actions, authorized persistent Runner/Container for long FFmpeg/ASR/media jobs |

## 2. Product taxonomy and scoped release phases

**P0 — Certified creator beta.** One tenant-scoped Creator Workspace; local/R2 ingest; verified user-authorized URL import via a constrained provider adapter where available; one English ↔ Thai source-target locale pairing that has passed actual account and quality gates; immutable transcript/subtitle revisions; bilingual preview; synthetic voice TTS if certified; full manual edit and approval; basic title/description; Chat/Visual shared revision; exports SRT/VTT, audio and 16:9/9:16 MP4; per-attempt metering; mobile review; two-cohort canary with rollback. A certified *single* batch speech provider may launch P0 independently of full multi-provider completion, but must display a no-fallback degraded state when required capabilities are unavailable.

**P1 — Creator suite.** Licensed multi-source URL adapters where their source access and legal/account conditions are met; editable article/short-script pipeline with citations; thumbnail A/B versions; locale batch variants and consistent glossary/voice profiles; side-by-side comparison; approved Skill/template publication; export preset catalog; safe social scheduling/integration where external capabilities permit.

**P2 — Advanced creator.** Guided stick-figure animation as a thin pipeline on existing Drama Series/Video Generation/Storyboard tools; auto highlights/auto clips after separately measured EDL/rough-cut certification; licensed/avatar workflows only after independent consent and anti-impersonation review; enterprise review roles. Never advertise P2 as already implemented or as a necessary condition for P0.

### 2.1 Localized product capability truth

A locale appears as `DOCUMENTED`, `ACCOUNT_PROBED`, `THAI_OR_LOCALE_EVAL_PASSED`, `CERTIFIED`, `DEGRADED` or `UNAVAILABLE` per operation, provider, account, endpoint, region, revision and feature combination. A published global language count, sibling model or historical account probe MUST NOT unlock locale selection. A translation model's text-locale availability does not imply ASR, TTS, word alignment, speaker retention or video export. UI shall distinguish translated subtitles without dubbing from a complete dubbed-video variant.

## 3. Creator Workspace information architecture

- **Project Picker:** explicitly resolve an accessible ProjectRef from Spec 233; offer project suggestions only as suggestions, never treat guessed IDs as grants.
- **Creator Dashboard:** recent runs, active jobs, current budgets, queued human review and stale/unsupported steps.
- **Source Bin:** user-uploaded and authorized external assets, source URL history, rights/consent state, technical inspection, capture origin and checksum.
- **Production Board:** guided recipe cards (Translate Video, Short Script, Article, Thumbnail, Shorts, Voiceover, Animation), scope selectors and typed settings.
- **Visual Editor:** transcript/segment table, waveform or source scrubber, bilingual preview, Shot/EDL preview, voice profile per permitted target, timeline link, batch/segment rerun, compare revision.
- **Mini Chat:** opt-in right/left/bottom overlay within creator workspace; can propose bounded changes against selected Project/run and visible editor slot; no unrelated tenant/project retrieval. No hidden global conversation graft.
- **Jobs/Versions/Exports:** durable status, side-by-side diff, error receipts, cost by variant, exact export manifest and publish certification state.

The Web, Desktop, PWA, tablet and phone share one semantic `CreatorWorkspaceRevision`; each host gets fresh authorized action bindings. Full timeline editing MAY remain desktop/Web, but phones SHALL support capture/intake, transcript correction, targeted review, approvals and output retrieval. A lost phone, closed tab or disconnected desktop MUST NOT cancel an already-authorized durable job without user intent.

## 4. Canonical records (logical contracts; map to deployed schema before any migration)

```ts
interface CreatorWorkspaceRef {
  workspaceId: string; tenantId: string; projectId: string;
  ownerPrincipalRef: string; recipeId: string;
  currentRevisionId: string; currentRevisionNumber: number;
  rightsPolicyRef: string; retentionPolicyRef: string;
  createdAt: string; updatedAt: string;
}
interface SourceIntakeManifest {
  intakeId: string; workspaceId: string; sourceKind: 'LIBRARY'|'LOCAL_UPLOAD'|'AUTHORIZED_URL';
  sourceLocatorRef: string; // Private/restricted ref. Never blindly display signed media URL.
  sourceAssetId?: string; sourceAssetRevision?: string;
  sourcePlatform?: string; sourceUrlDigest?: string;
  rightsEvidenceRef: string; consentReceiptRefs: string[];
  contentHash: string; mediaProbeRef: string; sourceTimebaseRef: string;
  accessPolicyVersion: string; sourceRevocationEpoch: number;
  malwareScanRef: string; lineageRef: string;
  intakeState: 'PENDING'|'VALIDATED'|'RESTRICTED'|'FAILED'|'REVOKED';
}
interface CreatorRevisionManifest {
  revisionId: string; workspaceId: string; revisionNumber: number;
  parentRevisionIds: string[]; sourceManifestRefs: string[];
  recipeVersion: string; workflowDefinitionRef: string; planDigest: string;
  editIntentRefs: string[]; editorTimelineRef?: string; transcriptRevisionRefs: string[];
  variantRefs: string[]; artifactRefs: string[]; supersededRevisionId?: string;
  provenanceRef: string; policyVersion: string; createdBy: string; createdAt: string;
}
interface LocalizationVariant {
  variantId: string; revisionId: string; sourceLocale: string; targetLocale: string;
  transcriptRevisionRef: string; glossaryRevisionRef?: string;
  translatedSubtitleRevisionRef?: string; syntheticVoiceConsentRef?: string;
  speechProfileRef?: string; synthesisArtifactRef?: string; alignmentEvidenceRef?: string;
  renderManifestRef?: string; qaEvidenceRef?: string;
  state: 'DRAFT'|'RUNNING'|'NEEDS_REVIEW'|'CERTIFIED_FOR_EXPORT'|'DEGRADED'|'FAILED'|'REVOKED';
}
interface CreatorExportManifest {
  exportId: string; workspaceId: string; sourceRevisionId: string;
  variantIds: string[]; presetVersion: string; sourceAssetHash: string;
  videoArtifactRef?: string; audioArtifactRefs: string[];
  subtitleArtifactRefs: string[]; qualityEvidenceRefs: string[];
  policyCertificationRef?: string; publishReceiptRef?: string;
  billableJobRefs: string[]; exportState: string; checksum: string;
}
```

These are **domain projections**, not authority for ACL, Wallet, global job lifecycle, source bytes, transcript canonical truth or Project membership. After inspecting real repositories, reuse existing identifiers/tables where possible. All persisted domain tables must carry tenant/project scope, optimistic revision and immutable audit events. R2 bytes are referenced by versioned Library AssetRefs; Vectorize holds only derived authorized search projections; PostgreSQL remains the transactional SoR.

### 4.1 Shared editing protocol: Chat ↔ Visual ↔ Timeline

```ts
type CreatorEditIntent =
  | {kind:'CORRECT_TRANSCRIPT'; transcriptRevisionRef:string; segmentIds:string[]; patchRef:string}
  | {kind:'RETRANSLATE'; targetLocale:string; segmentIds:string[]; glossaryRevisionRef?:string}
  | {kind:'CHANGE_VOICE'; targetLocale:string; segmentIds:string[]; speechProfileRef:string}
  | {kind:'ADJUST_SUBTITLE'; variantId:string; cueIds:string[]; stylePatchRef?:string; timingPatchRef?:string}
  | {kind:'CHANGE_FRAMING'; shotIds:string[]; renderPresetRef:string}
  | {kind:'GENERATE_THUMBNAIL'; sourceRevisionRef:string; variantCount:number; designBriefRef:string}
  | {kind:'REGENERATE_STAGE'; stageInstanceRefs:string[]; reason:string};
interface CreatorEditProposal {
  proposalId:string; tenantId:string; projectId:string; workspaceId:string;
  baseRevisionId:string; baseRevisionNumber:number; actorRef:string;
  originSurface:'CHAT'|'VISUAL'|'TIMELINE'|'AUTOMATION';
  normalizedIntents:CreatorEditIntent[]; impactedArtifactRefs:string[];
  proposedInvalidationGraphRef:string; changePreviewRef:string;
  costQuoteRef?:string; approvalRequirementRefs:string[];
  actionBindingRef:string; idempotencyKey:string; expiresAt:string;
}
```

Only the trusted Creator Domain command handler accepts an `EditProposal`. It rechecks tenant/project/grants, revision fence, referenced immutable artifacts, policy, current budgets and any required approval; it computes a new domain revision in a transaction; then it submits permitted work to Spec 215 and/or existing `worker_jobs`. Generated UI and Chat never write production media manifests directly. Conflicting `baseRevisionId` produces a visible three-way conflict or rebase request, never an unannounced last-write-wins overwrite. `Preview` is non-mutating; `Apply` is an explicitly authorized action. A model-generated free-text edit is untrusted until validated against this typed contract.

### 4.2 Revision/DAG invalidation examples

| User change | Validated invalidation | Work not rerun automatically |
|---|---|---|
| Source transcript correction | Translation for changed segments → affected subtitle/alignment → relevant dub → derived render/QC | Unrelated language/segments/source ingest |
| Thai glossary entry revision | Affected Thai text/translation → downstream subtitle/dub and export | Other languages, original ASR, rights scan |
| Change subtitle font/color | Subtitle render/composition and output QC | Transcribe, translate, speech synthesize |
| Replace synthetic voice profile | Targeted synthetic-audio segments, timing alignment, remux/QC | Other target locales/source captions |
| Change crop 16:9 → 9:16 | Affected shot composition, safe-area checks, render/QC | Speech/translation unless captions must be resegmented for readable layout |
| Edit one thumbnail | Thumbnail variants and metadata/publish QA | All unrelated video variants |

Invalidate *derived* snapshots, not immutable parent assets. Missing provenance or unknown cross-step dependencies default to a broader safe rerun with the new quote disclosed. A published output remains bound to its old exact hash until independently re-certified; previously charged jobs are not re-billed on projection/render retries.

## 5. Existing Spec 214 Node mapping (NO NEW TYPE)

| Recipe stage | Existing typeId | Capability/semantic binding (examples only; verify registry) |
|---|---|---|
| User/asset event | `core.trigger` | Project/media authorization event |
| Source inspection/import | `core.capability` | `media.import.inspect`, `media.import.authorized_fetch` via approved connector/Runner |
| Media retrieval/glossary evidence | `data.retrieval` | Spec 229 scoped Library/hybrid retrieval |
| ASR/TTS/align or media tools | `core.capability` | Spec 247 speech façade, FFprobe/FFmpeg/render capability adapters |
| Contextual translation/script | `ai.model` or `ai.agent` | Spec 231 verified model route / Feature 196 bounded agent |
| Deterministic segment/manifest map | `data.transform` | Timebase conversion and typed metadata transforms |
| Localized subworkflow | `flow.subflow` | Immutable localized recipe version |
| Branch by target locale | `flow.router`, graph fan-out | Capability/consent gate per variant |
| Join approved variants | `flow.join` | Deterministic gather/partial-success report |
| Bounded segment repair | `flow.loop` | Configured max iteration and spending cap |
| Correct or approve | `human.input`, `human.approval` | Durable checkpoint through Spec 225/226 attention bridge |
| Wait provider callback | `flow.wait` | Event/checkpoint, not CPU-pinning sleep |
| Export immutable bundle | `data.artifact` | Exact content hash and Library revision |
| QA | `quality.verifier` | Technical + locale + rights/policy + provenance evidence |

`automation.computer_use` is optional only for approved supervised external UI actions; it is NOT a shortcut for third-party downloader restrictions or official API absence. No `speech.translate`, `media.download`, `creator.export` or other extra semantic Node Type may be silently added to frozen Spec 214; these are capabilities or composed recipes unless future formal taxonomy governance proves otherwise.

## 6. Intake and authorized URL protocol

1. Resolve principal, tenant, Project, purpose, source ownership/license evidence, country/region, retention and consent **before** probing any URL or uploading third-party content. Accept user-owned files, authorized Library assets or expressly permitted licensed/public sources under provider/platform conditions.
2. Analyze only a supported allowlisted platform/official API or approved user-provided fetch path. A recognized link is **not** permission or proof of accessible formats. Per-platform adapter manifest must include supported URL shapes, TOS/license review, official APIs, account/region gates, release version, allowed cookie use and rollback capability. No browser cookie harvesting, DRM bypass, rate-limit evasion or undocumented protected endpoints. Authenticated access may use a user-granted official connector where lawful; never treat an opaque cookie blob as unrestricted authority.
3. Never have Cloudflare Workers perform an unbounded multi-GB synchronous download. Use a registered authorized Runner or suitable persistent container/streaming ingress, quarantine until scan completes, and stage immutable data into R2/Library. An optional version-pinned `yt-dlp` adapter, if permitted, runs in a sandboxed restricted Runner with allowlisted sources and egress, version/rollback and rights checks; not automatically enabled for every site.
4. Enforce SSRF protections including DNS re-resolution, redirect validation, disallow private/metadata ranges, byte/time/redirect quotas, MIME sniffing, codec/probe, archive/decompression limits, malware scan, network-bound source revocation, and signed URL minimal scope.
5. Persist `intakeId`, origin URL digest (avoid storing exposed tokens), AssetRef, content hash, exact source PTS/timebase, caption provenance, license evidence and access/deletion obligations. Failed or revoked intake must not leave accessible partial media or unreconciled third-party provider uploads.
6. Quote total download+processing+egress cost before ingestion when practical, show source-specific legal uncertainty, and provide a non-downloader fallback (upload your authorized source file) if policy/access prevents fetch.

## 7. Localization production recipe and QA

```text
Rights-gated source intake + media technical probe
  -> source audio extraction, channel/PTS clock manifest, consent/region gate
  -> Spec 247 verified ASR or existing caption ingestion
  -> immutable verbatim transcript + confidence provenance
  -> human optional source correction -> alignment invalidation
  -> for each *certified* locale:
       glossary + authorized contextual retrieval
       -> translation with source span anchors and source-faithfulness review
       -> subtitle segmentation + locale readability and timestamp QC
       -> optional separately approved, budgeted TTS voice + segment timing
       -> optional duck/remix video, lip-sync only if separately certified
       -> locale-specific legal/claim/disclosure and output technical QC
  -> aspect-ratio render 16:9 / 9:16 / 1:1 as supported
  -> exact hash-bound export, comparison and optional Spec 227 publishing gate
```

The pipeline MUST preserve rational audio/video timebase, VFR frame PTS, resampling offsets, chunk overlaps, channel identities and independently typed confidence measures as required by Spec 247; never fabricate word alignment from sentence timing. Source transcript, corrected transcript, translated text, generated subtitles, synthesized voice and rendered export are separate immutable lineage layers. Source audio is never overwritten by dubbing. A changed transcript/glossary invalidates dependent translations/audio/exports. A variant can be complete for subtitles but degraded for dubbing; label each deliverable honestly. User may reject machine translation, manually correct individual subtitle cues or substitute authorized original/recorded voice.

**QA is multi-dimensional, not one opaque score:** import/license evidence; transcript coverage/timestamp drift; language fidelity/terms/numbers/names; subtitle collisions/readability/safe margin; TTS language entitlement, content/voice consent and loudness; audio/video sync; cropped warning/context preservation; source-claim grounding and exact output hash-bound policy certification. Factual or sensitive translated claims trigger human review under existing publishing controls. A result failing locale quality may still be exportable as an explicitly marked draft if policy permits; do not silently call it certified.

## 8. Script, article, thumbnail and repurposing recipes

**Article Writer / Short Video Script:** User submits an authorized brief/source set; choose audience, platform, desired length, locale and tone; use Spec 229 evidence for factual claims; plan headline and outline/segments; present an editable draft with citation/source map, transformations and optional thumbnail. Avoid copying protected text verbatim or inventing factual evidence. Export Markdown/HTML and other document formats only through an existing certified export capability. Each revision retains prompt/model/skill/profile and source references.

**Thumbnail:** Typed topic, specific output video revision and optional licensed reference image. Generate multiple independently versioned variations through existing Media Studio image API. Show preview, dimensions, readable text-area warning, platform policy and provenance. Human chooses a variant; regeneration does not overwrite others or auto-publish.

**Shorts / Reels / Vertical:** Choose authorized master/source EDL; suggest bounded highlights or manually selected intervals; use existing Rough Cut and subject-aware reframe where actually implemented/certified; recompute caption safe zones, crop warning/claim context, shot continuity and audio mix; preserve source timestamps and exact derivative ancestry. P0 accepts manual clip selection; automatic highlight detection is optional P2 and cannot be advertised as shipped before code tests.

**Stick-figure animation (P2):** A guided recipe using existing script→storyboard→image/video generation→TTS→caption→render. Character consistency uses versioned licensed design refs; no requirement for a new 3D engine. If generic generated visual quality cannot meet target, expose manual review/replace shot. Digital Avatar is separate, initially OFF, with distinct identity/likeness permission and abuse review.

## 9. Reliability, economics and Cloudflare compatibility

Each creator operation uses a logical `workspaceId/revisionId/runId` plus deterministic per-stage/variant/segment attempt keys. Spec 215 owns logical run/checkpoints/replay; `worker_jobs` owns physical async work. Save an immutable plan/price/policy/provider snapshot on admission. Spec 207 reserves approved budget once per logical billable operation and settles provider-observed usage; distinguish `not_sent`, `sent_unknown`, `accepted`, `succeeded`, `failed` and `cancel_pending` attempt states before retry. Callback duplication, provider timeout after acceptance, client refresh and offline replay MUST NOT create double customer charges. An upstream cost after timeout stays reconcilable even when the customer is not charged twice.

Use Cloudflare Workers for authz, API routing, small transforms, status, short durable dispatch handoff, provider gateway calls and signed links. Use an authorized registered Windows/macOS/Linux Runner or provisioned persistent container for long FFmpeg/Remotion/media decode/large-file stream. Persist PostgreSQL state via the existing supported connection pattern; R2 for immutable media; Vectorize is the current derived semantic index, **not** a replacement transaction store. The existing Queue/Workflow/Job migration owners determine actual execution placement; this spec cannot silently migrate Redis or change live traffic during an unsafe cutover.

If a required model/account/region/locale becomes unavailable after admission, persist a truthful degraded state; either resume on independently authorized/quoted certified fallback or request review. No unauthorized cross-region transfer, automatic voice cloning or duplicate paid shadow run. Respect no-customer-loss staged rollout and give existing jobs drain/rollback priority.

## 10. Security, privacy, content authenticity and distribution

All reads, writes, variant previews, export URLs and GenUI action bindings MUST check the current principal, tenant, Project and release entitlement on the server. A published creator Mini App may operate on a permitted user's own assets; its publisher must not gain access to customer originals or private chat. Cross-Project usage requires explicit grants, cross-tenant usage requires valid published-asset entitlement rather than implied admin rights. Prompt injection in video captions, transcript, fetched page metadata, image OCR or Skill instructions does not become agent/system authority.

Voice likeness/speaker reference capture requires revocable, purpose-specific proof from the actual owner or other lawful authorization. Record synthetic-audio and altered-realistic-media disclosures where required. Deletion cascades or tombstones to derivative transcripts, embeddings, provider objects and published links according to authoritative retention policies; irreversibly deleted source/consent must prevent future re-runs. Existing Spec 227 decides destination-specific rights and final-publication policy **per exported locale, audio, subtitles, metadata, thumbnail and aspect ratio**; one master certification never blesses all derivatives.

Credential and remote URL handling: redact query tokens, never log raw third-party media or transcript by default, no external API keys/browser cookies in model context or client state, per-tenant isolation in caches, bounded retries, security review of optional downloader binary and dependencies. External Skill/Template submission follows Spec 221/248 license, safety and release governance rather than automatically installing downloaded code.

## 11. Public and internal API contract sketch (versioned adapters)

| API / event | Input | Output | Authority |
|---|---|---|---|
| `creator.workspace.create` | ProjectRef, recipeRef, policyRef | WorkspaceRef, revision 0 | Creator domain + Project authorization |
| `creator.source.inspect` | WorkspaceRef, allowed source locator | Intake quote/probe/rights warnings | Existing Library/approved import adapter |
| `creator.source.commit` | Validated source intake + consent | SourceIntakeManifest/AssetRef | Library + Creator metadata |
| `creator.plan.preview` | Workspace revision + typed settings | Immutable plan preview, cost estimate, required approvals | Spec 215 compiler / Spec 207 quote |
| `creator.run.start` | Approved preview digest + revision fence | Canonical WorkflowRun/job refs | Spec 215 / `worker_jobs` |
| `creator.edit.propose` | Base revision + typed intents | Diff/impact graph and approval/quote | Feature 196 or Visual editor, then Creator validator |
| `creator.edit.apply` | Proposal ID + action binding + approval | New immutable revision + changed-stage refs | Creator transaction → existing runtime |
| `creator.variant.retry` | Revision + segment/locale target | Existing or new stage/job refs | Spec 215 + credit reconciliation |
| `creator.export.request` | Exact revision/variant IDs + preset | Export job + eventual immutable bundle | Library/media + Spec 227 certification |
| `creator.workspace.events` | Authorized stream cursor/epoch | Replayable revision/run/status projection | Existing authorized event transport/Spec 225/226 |

All APIs MUST use explicit versioned schemas, authenticated service principals, tenant/project filter on database access, request idempotency and non-leaking error codes. Stage events contain sequence and stable artifact refs; do not persist raw user media or secrets in job payloads/logs. Opening a stale deep link resolves an authorized historical revision but mints *new* action tokens after current authorization checks.

## 12. UX behavior and human attention

First entry shows an actual recipe and estimated cost, not an empty general-purpose chat with invisible side effects. The creator may begin from Chat or visual workspace; both resolve to the same authorized `workspaceId`/`revisionId`, and editor selections become explicit ephemeral Chat context. Chat suggestions are drafts until user or authorized automation applies them. UI shows precisely whether a language variant is waiting for transcript correction, translation review, authorized voice selection, provider capacity, technical QA or publication review. Compare two revisions without mixing their timestamps, subtitles or source files. Clear per-locale/variant cancellation and partial retry affordances prevent recreating an entire project unnecessarily.

The mobile/tab UI prioritizes capture, current progress, human decisions, correcting a selected subtitle, comparing versions, sharing a restricted preview and retrieving approved export. Background job runs remain independent of connected UI sessions. Large upload progress uses resumable authorization-bound upload sessions when supported; disconnection is surfaced honestly rather than assuming the OS continued background transfer. Notification payloads contain opaque task IDs, not private transcripts or expiring media URLs.

## 13. Proposed data migration and repository boundaries

Prior to implementation inspect deployed schema, indexes, RLS/RBAC, existing media Project schema, actual 214 manifest, Spec 215 run contracts, Spec 247 speech contracts, migrations journal and current Plan/Project/Library UI. Submit a **schema-fit worksheet** mapping each logical record in §4 to existing tables; create tables only for legitimate creator-domain gaps, with separately reviewed additive expand/backfill/canary/contract migrations. The known historical fresh migration replay blocker around `0015` and `workflow_templates` is not permission to edit or resurrect deprecated legacy `/workflows`. Neither Spec 251 nor this artifact bundle authorizes production DDL, historic migration rewrite or in-progress Spec 224 changes.

Suggested code boundaries, contingent on real repo inspection:

```text
features/creator/                product orchestration, recipes, domain revisions
features/creator/contracts/      versioned public envelopes and converters
features/creator/ui/             Creator slots consuming Spec 240/216, no second renderer
features/creator/recipes/        certified templates referencing Spec 214/215
features/creator/tests/          contract, quality, security and regression suites
adapters/media-import/           only reviewed supported provider/source adapters
adapters/media-localization/     Spec 247 and existing media editor interoperability
```

Keep recipe definitions declarative, pin all skill/subflow/provider/preset versions, and fail closed on missing real contracts. No new global `CreatorAgent`, `CreatorJobQueue`, `CreatorWallet` or `CreatorVectorDB` should be introduced.

## 14. Work packages, dependencies and measurable exits

| Package | Prerequisites | Deliverable | Exit proof |
|---|---|---|---|
| C0 Source reconciliation | Confirm registry IDs; frozen 1–214 and actual 224; actual current 215/216/240/247; migration journal | Signed impact/owner map + feature flags | No overwritten files and zero unidentified authorities |
| C1 Contracts and safe intake | Spec 220, Library/R2, approved Runner | Domain schema + local ingest + authorized URL inspection sandbox | Same-tenant ownership/rights tests; redirect/SSRF/upload quarantine tests |
| C2 Compiler profile | Spec 215 revision owners, frozen 214 taxonomy | Immutable versioned media recipe, stage manifests, partial invalidation | Deterministic DAG/fork/resume, no new Node Type and double-charge guard |
| C3 Speech/localization | Spec 247 independently certified feature/locale tuples | ASR/translation/subtitles/TTS pilot with segment review | Thai holdout + timebase QC + rollback + rights/voice evidence |
| C4 Creator UI | Specs 216/240/225/226 actual contracts | Shared versioned Chat+Visual workspace and mobile review | Conflict, offline/replay and unauthorized action tests |
| C5 Exports and QA | Existing editor/Runner, Spec 227 | R2 immutable MP4, SRT/VTT/audio and per-locale publish candidate | Output roundtrip, hash-bound QC and individual release cert |
| C6 Extended tools | Certified C1–C5 | Article, short-script, thumbnail, vertical presets, reviewed Skill/template packs | Source provenance, cost and creator publication QA |
| C7 Canary promotion | Actual connected staging/production evidence | Beta cohort + rollback drills | No customer work loss, cross-tenant leak or duplicate settled charge |

No fixed-duration SLA or performance increase is asserted without measured device/network/locale/provider evidence. Observability required: time to first preview, stage p50/p95, provider/version/locale/preset, transcript CER where independently measured, subtitle boundary drift, manual correction burden, GPU/Runner utilization, render queue, first-pass valid export, per-variant cost, multi-device resume, and rollback completion. No raw audio or secrets in ordinary traces.

## 15. Acceptance test corpus (design scenarios, NOT executed tests)

| ID | Scenario | Required assertion |
|---|---|---|
| CR-001 | New workspace from authorized Project | Correct tenant/project and immutable revision 0 |
| CR-002 | Ambiguous natural-language Project reference | Present choices; do not infer permission |
| CR-003 | Private Library asset owned by another tenant | No metadata, preview or byte leak |
| CR-004 | Expired share/revoked rights before queue dispatch | No further fetch or processing |
| CR-005 | User-owned 2GB video upload interruption | Resume when supported, or truthful failed/retry state; no orphan accessible bytes |
| CR-006 | Redirect from public source to internal metadata IP | Reject SSRF before fetch |
| CR-007 | Platform link recognized but download disallowed | No evasion; upload-own-file fallback |
| CR-008 | Downloader binary update fails | Pinned previous audited version remains usable/feature disabled safely |
| CR-009 | Unsupported format/codec and malformed metadata | Quarantine with actionable error, no crash or downstream execution |
| CR-010 | Source VFR PTS with 44.1→16 kHz resample | Reversible offsets, bounded tested drift and monotonic SRT/VTT |
| CR-011 | Two target locales + one uncertified Thai TTS route | Only independently eligible tuples execute, per-variant degradation visible |
| CR-012 | Correct a transcript cue after initial translation | Rerun impacted locale/segments without unauthorized unrelated regen |
| CR-013 | Change subtitle style only | Rerender subtitle/export, no ASR or translation debit |
| CR-014 | Change voice with expired consent | Block audio synthesis and any publish of affected derivative |
| CR-015 | Dub sync produces drift above declared tolerance | No certified export; allow review/retry |
| CR-016 | Edited captions contain prompt injection | Treat as data; no unsanctioned tools/actions |
| CR-017 | Chat edits stale revision simultaneously with visual editor | Deterministic conflict/rebase; no lost update |
| CR-018 | Chat proposes more expensive provider or external upload | Preview and separately approve cost/purpose/region before apply |
| CR-019 | UI reconnect replays duplicate revision events | Same revision and action state, no new billable run |
| CR-020 | Browser closes during approved long FFmpeg task | `worker_jobs` continues, mobile can review result |
| CR-021 | Provider accepts billable TTS then times out | Reconcile upstream attempt; customer not charged twice |
| CR-022 | Duplicate provider callback and queue redelivery | One logical terminal state and single authorized settlement |
| CR-023 | Late provider callback after user deletion | Tombstone fences resurrection in R2/SQL/Vectorize views |
| CR-024 | Revision A certified; revision B changes one subtitle | A stays historical; B requires targeted recheck before publish |
| CR-025 | Alternate language dub drops a warning | Spec 227 flags variant; cannot inherit master certification |
| CR-026 | Reframe 16:9 master to 9:16 hides a source disclosure | Fail output policy QC or require explicit corrected composition |
| CR-027 | Multiple export sizes issued for same revision | Each exact content hash has its own QA and rights/publish state |
| CR-028 | Mobile device cannot access timeline editor | Accessible correction/review/approval fallback and safe navigation |
| CR-029 | Creator Mini App with two users | Per-user workspace and grants; publisher cannot read customer source |
| CR-030 | Public Skill references an unapproved Tool | No implicit installation/execution; normal tool approval gate |
| CR-031 | Model/locale entitlement revoked mid-flight | Drain accepted attempts, block future unauthorized egress and show degraded state |
| CR-032 | Thai glossary term and numerals regression | Human-reviewed holdout threshold; reject affected release tuple |
| CR-033 | Source video is private or violates intake rights | Import blocked regardless of technical downloader success |
| CR-034 | Two beta tenants on cloud canary | No lost jobs, no cross-tenant egress, rollback new jobs only |
| CR-035 | All source assets offline on local desktop | Honest offline preview; no cloud leak/silent job success |
| CR-036 | Partial subtitle update while Video Editor open | Consistent revision/EDL binding; offer safe merge or stale view |
| CR-037 | Unapproved avatar/voice likeness | Reject generation or require new independent consent; no implicit reuse |
| CR-038 | Article from an external website with unsupported claims | Draft cites source or flags unverifiable claims; not fabricated evidence |
| CR-039 | Thumbnail regenerated multiple times | Stable independent variants, cost receipts and original preserved |
| CR-040 | Unavailable optional Auto Clips/Digital Avatar | Controls visibly marked P2 disabled; P0 workflow remains functional |

## 16. Ten-axis cross-spec audit checklist (design only)

Review and record before admission: (A1) actual repository/spec-number and frozen baseline; (A2) 214 16-node taxonomy and 215 compilation ownership; (A3) domain/Library/PostgreSQL/Vectorize authority; (A4) per-stage/locale spend and retries; (A5) Chat/Visual optimistic revision and action authorization; (A6) import rights/SSRF/third-party constraints; (A7) locale/provider/ASR/TTS/timecode certification; (A8) publishing/derivative rights and AI disclosure; (A9) Web/Desktop/mobile continuity and recovery; (A10) Cloudflare phased deployment/canary/no-customer-loss. Each axis must cite code/API/test/evidence on implementation; this document's presence does not mean any code test passed.

## 17. Governance decisions and unresolved implementation gates

1. Confirm whether candidate 251 is free in the **actual** canonical repository (the Library search alone cannot prove it).
2. Obtain owner approval of updated 215/216/225/226/227/234/240/247 versions and any conflicting live revision newer than the materialized snapshot. The deliverable pack is a proposal, not an automatic overwrite of sources.
3. Inspect full deployed API/schema and current blocked historical migration replay before proposing additive DDL. No live schema changes while fresh replay/upgrade authority remains unresolved.
4. Verify each upstream media provider, legal use, source-region, account entitlement and local downloader environment. Never infer compliance from open-source source code.
5. Certify initial Thai/English ASR+translation+TTS+render tuples through independent real-account QA. Unsupported/dub-unavailable routes must visibly degrade rather than silently use a different service.
6. Obtain concrete Web/Desktop/Mobile integration fixtures and cross-owner API approvals. No shadow billable audio or unapproved public broadcasting.

**Source references:** SmartAIHub Library snapshots of Specs 214 R6, 215 R3, 216 device-independent amendment, 225, 226 R10, 227 R4, 234 R3, 240 R0.6, 247 R1.8 (materialized 2026-09-27); OpenCreator public GitHub README https://github.com/krillinai/OpenCreator (inspected 2026-09-27). This proposal does not claim access to or certification of the current SmartSpecPro Git HEAD.
