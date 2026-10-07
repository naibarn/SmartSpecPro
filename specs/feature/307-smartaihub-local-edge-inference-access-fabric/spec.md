---
audit_passes: 60
baseline: SPEC-307-SmartAIHub-Local-Edge-Inference-Access-Fabric-R1.3-30PASS-PROVISIONAL
canonical_registry_gate: REQUIRED
date: 2026-10-08
document_kind: CUMULATIVE_AMENDMENT
miniapp_numbering: NOT_APPLICABLE
ownership: SmartAIHub shared/core infrastructure
prepared: 2026-10-08
reference_projects:
- omnichar/ComfyUI-Omnichar
- omnichar/OmniChar
- hypersniper05/MCP-Image-Generator-Uncensored
related_specs:
- 200
- 207
- 215
- 220
- 224
- 226
- 227
- 231
- 240
- 247
- 251
- 252
- 253
- 258
- 267
- 269
- 279
- 287
- 288
- 307
revision: R1.5
spec_id: 307
status: PROPOSED_AUDIT_HARDENED_R1.5_60PASS_IMPLEMENTATION_READY_AFTER_REGISTRY_GATE
title: SmartAIHub Local & Edge Inference Access Fabric --- Portable
  Multimodal Character & Continuity Fabric Amendment
---

# SPEC-307 R1.5 --- Portable Multimodal Character, Continuity & Capability Provisioning Fabric

## 0. Canonical registry and merge rule

This document is a cumulative amendment to SPEC-307 R1.3, not a new Mini
App and not a new execution authority.

Before merge, implementation SHALL verify `origin/main`, the canonical
`SPEC_INDEX`, the canonical SPEC-307 file and any newer revision. If
SPEC-307 has advanced beyond R1.3, this amendment SHALL be semantically
rebased onto that revision rather than overwriting newer work. If `307`
is not the canonical identity, preserve this amendment's semantic
ownership and reconcile the number through the canonical registry.

The R1.3 requirements remain normative unless explicitly extended here.

This amendment adds a **Portable Multimodal Character & Continuity
Fabric (PMCCF)** shared by SmartAIHub Image, Video, Film/Stage, Creator
workflows, Skills, Agents and detached Mini Apps. It SHALL NOT make
ComfyUI, OmniChar, `.char`, Qwen Image, FLUX, MiniMax, Seedance, any
LoRA format or any provider-specific prompt syntax the SmartAIHub domain
model.

------------------------------------------------------------------------

# 1. Executive decision

SmartAIHub SHALL represent a reusable character as a provider-neutral,
versioned, rights-aware multimodal asset.

Canonical direction:

``` text
User / Mini App / Agent / Film / Image / Video
                    |
                    v
        Portable Character Reference
                    |
                    v
   Character & Continuity Resolver
      |        |         |        |
      |        |         |        +-- rights / consent / policy
      |        |         +----------- continuity state
      |        +--------------------- reference-role selection
      +------------------------------ immutable character revision
                    |
                    v
        Provider Compilation Layer
      /        |        |        \
  Qwen      ComfyUI    FLUX     Video/other
 Image        adapter   adapter    adapter
                    |
                    v
          SPEC-307 ai.media.*
                    |
                    v
      existing job/runner/control plane
```

The core invariant is:

> **Character identity is a reusable semantic asset. A prompt is not the
> character. A provider adapter is not the character. A LoRA is not the
> character. A Film performance is not the character.**

A provider-specific representation is a compiled derivative of a
canonical character revision.

------------------------------------------------------------------------

# 2. Why this belongs in shared/core infrastructure

The same person/character may be used by:

-   image generation and editing;
-   multi-reference image workflows;
-   Film Studio storyboards and generated takes;
-   Vertical Drama;
-   video generation;
-   voice/dialogue workflows;
-   Creator Workspace;
-   future 3D/avatar workflows;
-   detached Mini Apps;
-   local GPU and cloud providers.

Putting identity inside Film Studio would prevent Image/Mini Apps from
sharing it. Putting identity inside ComfyUI would couple product state
to one runtime. Putting identity inside a provider prompt would destroy
portability and provenance.

Therefore PMCCF is shared infrastructure consumed by domain products.

------------------------------------------------------------------------

# 3. Authority boundaries

## 3.1 SPEC-307

SPEC-307 owns:

-   provider-neutral inference/media capability access;
-   provider/runtime discovery and qualification;
-   local/edge/cloud execution candidate normalization;
-   `ai.media.*` portable execution APIs;
-   provider compilation/adapter boundary;
-   pipeline identity and model/component eligibility;
-   the PMCCF shared portable character representation and compilation
    interface added by this amendment.

SPEC-307 SHALL NOT become a Film database, timeline, voice-cloning
product, generic asset library, rights ledger or job queue.

## 3.2 SPEC-252 --- Film Studio

SPEC-252 remains authoritative for Film-owned Scene, Shot,
CharacterPerformance, Camera and GeneratedTake revisions.

`CharacterPerformanceV1` describes **what a character does in a Film
shot**. PMCCF describes **who/what the reusable character is**.

Required relationship:

``` text
PortableCharacterRevision
          |
          +---- identity / appearance / voice / rights
          |
Film CharacterPerformanceV1
          |
          +---- motion / face track / speech cues / shot timing
```

SPEC-252 SHOULD reference `portableCharacterRevisionRef` from cast/actor
mappings and generated-take conditioning, but SHALL NOT duplicate the
PMCCF manifest.

## 3.3 SPEC-258 --- Stage Workspace

SPEC-258 remains authoritative for Stage Workspace, Quick Shot, Prompt
Motion, direction outputs, Playblast and motion interchange.

It MAY select or lock a PMCCF character revision, wardrobe state or
continuity snapshot for a shot. It SHALL NOT own shared character
identity.

## 3.4 SPEC-253 --- cross-product handoff

SPEC-253 remains authoritative for authorized cross-product handoff.
Handoff bundles MAY carry immutable character revision references and
continuity snapshots, not unrestricted access to an entire character
library.

## 3.5 SPEC-247 --- speech/audio

SPEC-247 or the current canonical speech/audio authority remains
authoritative for speech execution. PMCCF may reference authorized voice
identity material and voice constraints; it SHALL NOT bypass
voice/likeness consent or create a second speech gateway.

## 3.6 SPEC-279 / SPEC-287 / SPEC-288

-   SPEC-279 remains command ingress and headless invocation authority.
-   SPEC-287 remains UI/design governance authority.
-   SPEC-288 remains portable resource lifecycle/placement authority.
-   PMCCF integrates with them; it does not replace them.

## 3.7 Job, workflow, billing and authorization owners

Existing workflow, durable job, runner, budget/credit, authorization,
audit and approval owners remain unchanged. PMCCF SHALL use them.

------------------------------------------------------------------------

# 4. Canonical domain model

## 4.1 Stable identity versus revision

A character has a stable logical ID and immutable revisions.

``` ts
interface PortableCharacterV1 {
  schemaVersion: 'character.v1';
  characterId: string;
  tenantId: string;
  owningProjectId?: string;
  displayName: string;
  currentRevisionRef: string;
  lifecycleState: 'DRAFT'|'ACTIVE'|'ARCHIVED'|'REVOKED';
  createdBy: string;
  createdAt: string;
}
```

Every material edit creates a new revision.

``` ts
interface PortableCharacterRevisionV1 {
  schemaVersion: 'character.revision.v1';
  characterId: string;
  revisionId: string;
  parentRevisionIds: string[];
  tenantId: string;
  projectId?: string;

  semanticIdentity: CharacterSemanticIdentityV1;
  referenceSets: CharacterReferenceSetV1[];
  appearanceStates: CharacterAppearanceStateV1[];
  voiceProfileRef?: string;
  adapterAssetRefs: CharacterAdapterAssetRefV1[];
  continuityPolicy: CharacterContinuityPolicyV1;

  rightsPolicyRef: string;
  consentEvidenceRefs: string[];
  licenseEvidenceRefs: string[];
  provenanceRefs: string[];

  immutableContentDigest: string;
  createdBy: string;
  createdAt: string;
}
```

## 4.2 Semantic identity

``` ts
interface CharacterSemanticIdentityV1 {
  canonicalDescription: string;
  immutableTraits: string[];
  preferredTraits?: string[];
  forbiddenDrift?: string[];
  aliases?: string[];
  fictionalOrReal: 'FICTIONAL'|'REAL_PERSON'|'SYNTHETIC_COMPOSITE'|'UNKNOWN';
}
```

The description is semantic guidance, not sufficient proof of identity.

## 4.3 Reference roles

Reference images SHALL carry explicit roles rather than being an
unordered image array.

``` ts
type CharacterReferenceRole =
  | 'FACE'
  | 'HEAD'
  | 'BODY'
  | 'FULL_BODY'
  | 'HAIR'
  | 'WARDROBE'
  | 'ACCESSORY'
  | 'POSE'
  | 'STYLE_ONLY'
  | 'IDENTITY_GENERAL'
  | 'NEGATIVE_IDENTITY'
  | 'OTHER';

interface CharacterReferenceSetV1 {
  referenceSetId: string;
  role: CharacterReferenceRole;
  assetRefs: string[];
  priority: number;
  allowedUses: string[];
  notes?: string;
  provenanceRefs: string[];
  rightsEvidenceRefs: string[];
}
```

A provider adapter SHALL NOT silently reinterpret `STYLE_ONLY` as
identity or `WARDROBE` as face identity.

## 4.4 Appearance state

Wardrobe and mutable appearance are separate from identity.

``` ts
interface CharacterAppearanceStateV1 {
  appearanceStateId: string;
  label: string;
  wardrobeRefs: string[];
  hairState?: string;
  makeupState?: string;
  accessoryRefs: string[];
  semanticDescription?: string;
  validFromStoryPoint?: string;
  validUntilStoryPoint?: string;
  lockedFields: string[];
}
```

Changing clothing SHALL NOT require creation of a different character.

## 4.5 Adapter assets

``` ts
interface CharacterAdapterAssetRefV1 {
  adapterAssetId: string;
  kind: 'LORA'|'EMBEDDING'|'FACE_ADAPTER'|'VOICE_ADAPTER'|'OTHER';
  assetRef: string;
  modelFamilyCompatibility: string[];
  immutableDigest: string;
  licenseEvidenceRefs: string[];
  qualificationEvidenceRefs: string[];
  rightsEvidenceRefs: string[];
}
```

A LoRA or embedding is a derivative implementation aid. It never becomes
canonical identity truth.

------------------------------------------------------------------------

# 5. Multimodal identity

PMCCF SHALL support identity components independently.

``` text
Portable Character
 ├── semantic identity
 ├── visual identity references
 ├── body references
 ├── appearance/wardrobe states
 ├── voice identity reference
 ├── provider adapter assets
 ├── rights / consent / provenance
 └── continuity policies
```

Future optional extensions MAY include gesture style, gait,
facial-expression priors, 3D avatar/rig refs and motion signatures, but
these SHALL be separately versioned and SHALL NOT make P0 dependent on
3D.

Voice references MUST remain permission-scoped. A character record
containing a voice reference does not itself authorize voice cloning or
synthesis.

------------------------------------------------------------------------

# 6. Character Resolver

The Character Resolver converts a semantic request into a bounded
provider-independent character requirement.

Input:

``` ts
interface CharacterResolveRequestV1 {
  characterRevisionRef: string;
  appearanceStateRef?: string;
  purpose: 'IMAGE'|'IMAGE_EDIT'|'VIDEO'|'FILM_PREVIS'|'FILM_TAKE'|'VOICE'|'OTHER';
  sceneOrShotRef?: string;
  requestedReferenceRoles?: CharacterReferenceRole[];
  lockedTraits?: string[];
  targetCapabilityRequirements: string[];
  policyContextRef: string;
}
```

Output:

``` ts
interface ResolvedCharacterBundleV1 {
  bundleId: string;
  characterRevisionRef: string;
  appearanceStateRef?: string;
  semanticIdentityDigest: string;
  selectedReferenceRefs: Array<{
    assetRef: string;
    role: CharacterReferenceRole;
    priority: number;
  }>;
  adapterAssetRefs: string[];
  lockedTraits: string[];
  rightsDecisionRef: string;
  provenanceRefs: string[];
  exactDigest: string;
}
```

The resolver SHALL be deterministic for the same immutable inputs,
policy epoch and resolver version unless an explicitly declared
stochastic selection policy is requested.

------------------------------------------------------------------------

# 7. Provider compilation

## 7.1 Compiler contract

Provider syntax SHALL be generated only after semantic resolution.

``` ts
interface CharacterCompileRequestV1 {
  resolvedCharacterBundleRef: string;
  providerCapabilityRef: string;
  modelRevisionRef: string;
  taskType: string;
  maxReferenceInputs?: number;
  targetPromptDialect?: string;
}

interface CompiledCharacterConditioningV1 {
  compilerVersion: string;
  sourceBundleRef: string;
  providerCapabilityRef: string;
  modelRevisionRef: string;
  promptFragments: string[];
  orderedReferenceInputs: Array<{
    assetRef: string;
    providerSlot?: string;
    role: CharacterReferenceRole;
  }>;
  adapterBindings: Array<{
    adapterAssetRef: string;
    strength?: number;
  }>;
  downgradeReasons: string[];
  omittedReferenceRoles: CharacterReferenceRole[];
  exactDigest: string;
}
```

## 7.2 Reference-slot budgeting

When a provider accepts fewer references than are available, the
compiler SHALL perform role-aware allocation.

It MUST NOT simply truncate the tail of an array.

Selection SHALL consider:

1.  identity-critical face/head references;
2.  body/full-body references when composition requires them;
3.  active wardrobe/appearance references;
4.  task-specific pose/reference needs;
5.  provider capability and known qualification evidence;
6.  user locks and continuity requirements.

Any omitted material role SHALL be recorded.

## 7.3 Provider dialects

Adapters MAY compile semantic references into provider-specific forms
such as ordinal prose, provider image tokens, named reference slots,
LoRA bindings, ControlNet-like inputs or other documented mechanisms.

Provider syntax is replaceable and MUST NOT leak into Mini App business
logic or canonical character records.

------------------------------------------------------------------------

# 8. OmniChar / `.char` interoperability

OmniChar concepts are valuable interoperability references, not
SmartAIHub authority.

Required support:

``` text
.char import
    -> quarantine/untrusted parse
    -> validate schema
    -> extract references
    -> hash assets
    -> inspect licenses/provenance
    -> map supported fields
    -> mark unsupported/unverified fields
    -> create DRAFT PortableCharacterRevision
    -> explicit review/activation

PortableCharacterRevision
    -> compatibility projection
    -> .char export when representable
```

Rules:

-   `.char` SHALL NOT be stored as the only source of truth.
-   Import SHALL preserve the original package as provenance where
    policy allows.
-   Unknown executable/config content SHALL NOT be executed.
-   Paths SHALL be sandboxed; no traversal or arbitrary local-file
    resolution.
-   External URLs SHALL be subject to SSRF/network policy.
-   Embedded LoRA/model assets SHALL pass license, malware/content and
    size gates.
-   Export SHALL report lossy fields.
-   SmartAIHub-only fields such as richer consent, continuity history or
    project policy MAY be omitted only with explicit compatibility
    metadata.

`omnichar-sdk` MAY be used as an optional adapter where its license and
behavior are acceptable. GPL ComfyUI node code SHALL remain an
external/isolated integration unless legal review explicitly approves
another arrangement.

------------------------------------------------------------------------

# 9. ComfyUI adapter

ComfyUI is an execution backend, not a domain owner.

``` text
PMCCF Character
      |
      v
Character Compiler
      |
      v
ComfyUI Adapter
      |
      +-- workflow template
      +-- reference images
      +-- LoRA bindings
      +-- provider/model parameters
      |
      v
SPEC-307 execution envelope
```

The adapter SHALL:

-   pin workflow/node/model revisions where material;
-   discover installed nodes/capabilities;
-   fail with typed capability gaps;
-   preserve exact workflow/pipeline identity;
-   avoid granting ComfyUI broad access to SmartAIHub storage;
-   use bounded signed asset access;
-   return artifacts through canonical asset/provenance paths;
-   remain removable without changing application semantics.

------------------------------------------------------------------------

# 10. Qwen Image MCP integration

The existing SPEC-307 Qwen Image MCP reference adapter SHALL accept
PMCCF character bundles through the same provider-neutral path.

Example:

``` ts
await ai.media.generate({
  profile: 'character.production',
  prompt: 'standing outside a hotel at night',
  characters: [{
    characterRevisionRef: 'charrev:alice:42',
    appearanceStateRef: 'appearance:alice:work',
    continuitySnapshotRef: 'continuity:scene23'
  }],
  requirements: {
    identityContinuity: 'high',
    locality: 'local-preferred'
  }
});
```

The Mini App SHALL NOT need to know whether the execution path uses Qwen
multi-reference editing, a LoRA, ComfyUI, a cloud image API or another
qualified provider.

------------------------------------------------------------------------

# 11. Portable `ai.media.*` API extension

Additive request fields:

``` ts
interface MediaCharacterBindingV1 {
  bindingId: string;
  characterRevisionRef: string;
  appearanceStateRef?: string;
  continuitySnapshotRef?: string;
  roleInOutput?: string;
  lockedTraits?: string[];
  referencePolicy?: 'AUTO'|'IDENTITY_FIRST'|'APPEARANCE_FIRST'|'EXPLICIT';
  explicitReferenceRefs?: string[];
}

interface PortableMediaRequestCharacterExtensionV1 {
  characters?: MediaCharacterBindingV1[];
  continuityTargetRef?: string;
  continuityRequirement?: 'BEST_EFFORT'|'NORMAL'|'HIGH'|'STRICT';
}
```

This extension applies to relevant `ai.media.generate`, `ai.media.edit`
and future video-generation calls.

Detached Mini Apps SHALL be able to bind the same semantic extension to
a standalone adapter.

------------------------------------------------------------------------

# 12. Continuity state

Identity consistency and story continuity are related but distinct.

``` ts
interface CharacterContinuitySnapshotV1 {
  schemaVersion: 'character.continuity.v1';
  snapshotId: string;
  characterRevisionRef: string;
  appearanceStateRef?: string;
  projectId?: string;
  sceneRef?: string;
  shotRef?: string;
  storyPoint?: string;

  lockedIdentityTraits: string[];
  lockedAppearanceTraits: string[];
  temporaryState: {
    dirt?: string;
    injury?: string;
    wetness?: string;
    carriedObjects?: string[];
    freeform?: Record<string,string>;
  };

  acceptedOutputAssetRefs: string[];
  sourceSnapshotRef?: string;
  createdAt: string;
}
```

Temporary story state SHALL NOT mutate the underlying character
identity.

Example:

``` text
Alice identity
    |
    +-- Work wardrobe
    |
Scene 22 snapshot: clean coat
    |
Scene 23 snapshot: wet coat
    |
Scene 24 snapshot: wet coat + torn sleeve
```

------------------------------------------------------------------------

# 13. Continuity verification

Generated media is a candidate until required checks pass.

``` ts
interface CharacterContinuityEvidenceV1 {
  evidenceId: string;
  characterRevisionRef: string;
  candidateAssetRef: string;
  evaluatorRefs: string[];
  dimensions: {
    faceIdentity?: number;
    bodyIdentity?: number;
    hair?: number;
    wardrobe?: number;
    accessory?: number;
    voiceIdentity?: number;
    semanticTraitConsistency?: number;
  };
  temporal?: {
    worstTimestampMs?: number;
    worstFrame?: number;
    driftSegments?: Array<{startMs:number; endMs:number; score:number}>;
  };
  confidence: number;
  thresholdProfileRef: string;
  decision: 'PASS'|'REPAIR'|'REVIEW'|'UNSCORABLE';
  evidenceRefs: string[];
}
```

Scores SHALL NOT be treated as universal truth across evaluator
versions. Thresholds require calibration by content type and evaluator
revision.

------------------------------------------------------------------------

# 14. Generate → Verify → Repair loop

PMCCF SHALL integrate with the existing workflow/job architecture:

``` text
Resolve character
      ↓
Compile provider conditioning
      ↓
Generate candidate
      ↓
Continuity evaluation
      ↓
PASS? ─────────────── yes ──> candidate ready
  |
  no
  ↓
classify drift
  ↓
bounded repair plan
  ↓
retry only affected generation stage
  ↓
re-evaluate
```

The loop MUST be bounded by:

-   maximum attempts;
-   cost/budget ceiling;
-   time ceiling;
-   provider availability;
-   semantic-drift guard;
-   user locks;
-   rights/policy;
-   diminishing-return detection.

It SHALL NOT create infinite autonomous retries.

Repair actions MAY include reference-role rebalance, stronger identity
reference, different qualified adapter asset, provider/model reroute,
prompt constraint reinforcement, local inpainting/editing or escalation
to review.

The system SHALL preserve the best prior candidate rather than
overwriting it.

------------------------------------------------------------------------

# 15. Multi-character scenes

Every character in a multi-character request SHALL have a stable binding
ID.

Adapters SHALL preserve mapping between:

``` text
semantic character
→ provider reference slots
→ detected/generated subject
→ continuity evidence
```

The verifier SHALL detect at minimum:

-   identity swap;
-   face merge;
-   wardrobe swap;
-   missing character;
-   duplicate character;
-   role/reference cross-assignment.

A high aggregate score SHALL NOT hide one character failing badly.

------------------------------------------------------------------------

# 16. Image editing and identity preservation

For edits, the system SHALL distinguish:

``` text
edit target
protected identity
protected appearance
editable appearance
background/environment
style
pose/composition
```

An instruction such as "change the background" SHALL NOT implicitly
authorize identity regeneration.

An instruction such as "change Alice's coat" MAY change the active
appearance state/candidate while preserving Alice's identity.

The edit compiler SHALL include explicit protected-field intent.

------------------------------------------------------------------------

# 17. Video temporal continuity

Video evaluation SHOULD support:

-   per-frame/segment identity confidence;
-   worst-frame localization;
-   appearance drift;
-   character disappearance/reappearance;
-   identity swap between actors;
-   voice-to-character mismatch where authorized evaluation exists;
-   start/end consistency with adjacent approved shots.

A video provider returning a playable file is not evidence that
character continuity passed.

------------------------------------------------------------------------

# 18. Film integration amendments

## 18.1 SPEC-252 additive fields

Recommended additive extension:

``` ts
interface FilmCastCharacterBindingV1 {
  actorId: string;
  portableCharacterRevisionRef: string;
  defaultAppearanceStateRef?: string;
  continuityPolicyRef?: string;
}

interface FilmGeneratedTakeCharacterEvidenceV1 {
  takeId: string;
  characterBindingRefs: string[];
  continuitySnapshotRefs: string[];
  continuityEvidenceRefs: string[];
}
```

Existing `CharacterPerformanceV1` remains unchanged in semantic
ownership.

## 18.2 SPEC-258 Stage behavior

Stage Workspace SHOULD display:

-   selected character identity revision;
-   active appearance/wardrobe state;
-   continuity status;
-   locks;
-   provider downgrade warning;
-   candidate continuity result.

Stage SHALL permit "use previous approved appearance" without copying
raw prompt text.

------------------------------------------------------------------------

# 19. Beyond characters: extensibility boundary

PMCCF SHALL NOT prematurely generalize every asset into one schema.
However, its compiler pattern SHOULD be reusable for future portable
semantic assets:

``` text
Character
Location
Object/Prop
Wardrobe
Style
Voice
Camera
```

Each future domain type requires its own typed schema and rights
semantics.

Do not create an untyped `UniversalAsset<any>` blob.

------------------------------------------------------------------------

# 20. Storage and asset handling

PostgreSQL remains transactional metadata/relationship SoR where
consistent with current architecture. Heavy images/audio/LoRAs/packages
remain in canonical object storage/library paths. Vector search is
derived discovery, never authorization truth.

Requirements:

-   immutable content digests;
-   tenant/project scoped references;
-   signed bounded retrieval;
-   no raw filesystem path in portable APIs;
-   deduplication must not leak cross-tenant existence;
-   revocation-aware caches;
-   retention/deletion propagation;
-   derived adapter assets linked to source revision and training
    evidence.

------------------------------------------------------------------------

# 21. Rights, likeness, consent and provenance

For real-person likeness or voice, the system SHALL maintain evidence
sufficient for the applicable policy and use context.

At minimum distinguish:

-   source ownership/license;
-   likeness/voice consent where applicable;
-   allowed purpose;
-   allowed tenant/project;
-   allowed external-provider egress;
-   allowed derivative/training use;
-   expiry/revocation;
-   publication/commercial restrictions.

Consent to use a reference image is not automatically consent to train a
LoRA, clone a voice or publish generated derivatives.

Revocation SHALL fence new generation and invalidate cached
authorization decisions. Existing artifacts follow the applicable
retention/legal policy; they are not silently destroyed without
authority.

------------------------------------------------------------------------

# 22. Adapter/model licensing

The SPEC-307 R1.3 component-license gate extends to character adapters.

A generation pipeline using a character LoRA is eligible only when the
base model, LoRA, VAE, upscaler, workflow/runtime and other material
components are eligible for the requested use.

Unknown commercial eligibility fails closed for managed commercial
execution unless the authorized policy provides a review/exception path.

------------------------------------------------------------------------

# 23. Security

Imported character packages, workflow files, model adapters and
community nodes are untrusted inputs.

Mandatory controls:

-   archive bomb limits;
-   file count/size limits;
-   path traversal prevention;
-   symlink escape prevention;
-   MIME/content validation;
-   digest before activation;
-   no arbitrary script execution during import;
-   no pickle-like unsafe deserialization without isolated explicit
    policy;
-   SSRF controls for referenced URLs;
-   malware/content scanning where available;
-   sandbox community code;
-   least-privilege egress;
-   no inherited platform secrets;
-   signed short-lived asset URLs;
-   tenant/project authorization before every material read;
-   audit all export/egress.

------------------------------------------------------------------------

# 24. Privacy and data minimization

Provider compilation SHALL send the minimum reference set required for
the selected route.

A cloud provider MUST NOT receive every stored face/body/voice reference
merely because they exist.

Local-only character assets SHALL make cloud routes ineligible.

Telemetry SHALL avoid raw biometric-like media unless explicitly
required and authorized; prefer digests, role metadata, scores and
bounded evidence references.

------------------------------------------------------------------------

# 25. Failure semantics

Typed failures SHALL include at least:

``` text
CHARACTER_NOT_FOUND
CHARACTER_REVISION_REVOKED
REFERENCE_NOT_AUTHORIZED
REFERENCE_ROLE_UNSUPPORTED
APPEARANCE_STATE_NOT_FOUND
VOICE_USE_NOT_AUTHORIZED
ADAPTER_ASSET_INELIGIBLE
PROVIDER_REFERENCE_LIMIT
PROVIDER_CHARACTER_CONTROL_UNQUALIFIED
CONTINUITY_THRESHOLD_NOT_MET
IDENTITY_SWAP_DETECTED
CONTINUITY_UNSCORABLE
LOSSY_CHARACTER_EXPORT
UNSAFE_CHARACTER_PACKAGE
RIGHTS_EVIDENCE_INSUFFICIENT
```

Failure SHALL be surfaced to Task Control and calling applications
through existing status/evidence contracts.

------------------------------------------------------------------------

# 26. Observability

Track:

-   character resolve latency;
-   compiler latency;
-   references selected/omitted by role;
-   provider route;
-   continuity pass/retry/review rate;
-   drift dimensions;
-   retry cost;
-   best-candidate retention;
-   identity swap incidents;
-   provider/model/compiler revision;
-   rights/consent decision refs;
-   cache hit/miss without leaking sensitive asset identity.

Do not log raw voice/image references in ordinary structured logs.

------------------------------------------------------------------------

# 27. Caching

Safe cache keys MUST include all material inputs:

``` text
character revision digest
appearance state digest
continuity snapshot digest
provider/model revision
compiler version
reference selection policy
task type
material generation settings
policy/rights epoch where required
```

A cache result created before rights revocation SHALL NOT remain usable
merely because the media bytes still exist.

------------------------------------------------------------------------

# 28. UX requirements

User-facing products SHOULD present simple concepts:

``` text
Character: Alice
Look: Work
Continuity: From Scene 23
Identity lock: High
```

Users SHOULD NOT need to understand LoRA weights, provider reference
syntax or ComfyUI graph topology for normal use.

Advanced UI MAY expose diagnostics.

Mobile/tablet SHALL support selecting a character/look, reviewing
continuity warnings and accepting/rejecting candidates without requiring
desktop Stage Workspace.

------------------------------------------------------------------------

# 29. Headless / agent control

All material operations SHALL be expressible through canonical
commands/capabilities rather than requiring UI automation.

Candidate semantic operations:

``` text
character.create
character.revision.create
character.reference.add
character.appearance.create
character.import
character.export
character.resolve
character.continuity.snapshot
character.continuity.evaluate
character.continuity.explain
```

Final command names MUST reconcile with SPEC-279 and existing registries
before implementation to avoid duplicates.

WebMCP/MCP/A2A/CLI/API projections are adapters over canonical commands.

------------------------------------------------------------------------

# 30. Detached Mini App portability

A detached Mini App MAY carry or connect to:

-   portable character manifests;
-   referenced assets according to export policy;
-   standalone resolver/compiler implementation;
-   provider adapters.

It SHALL NOT require SmartAIHub-specific database IDs as its only usable
identity representation.

Export MUST include schema version, content digests and compatibility
metadata sufficient for deterministic interpretation.

Secrets and provider credentials are never embedded in portable
character packages.

------------------------------------------------------------------------

# 31. Migration

No destructive migration is required for P0.

Existing Film/Drama/Image character references SHALL continue to work.

Adoption sequence:

1.  add PMCCF schemas behind feature flag;
2.  create adapters from existing character/cast refs;
3.  permit DRAFT portable characters;
4.  dual-read legacy + PMCCF;
5.  write PMCCF for new opted-in flows;
6.  add continuity verification;
7.  add `.char` import/export;
8.  migrate only proven compatible legacy data;
9.  keep reversible fallback until conformance gates pass.

Do not bulk-convert unknown legacy references into false identity truth.

------------------------------------------------------------------------

# 32. Feature flags

``` text
character_fabric.enabled=false
character_fabric.provider_compile.enabled=false
character_fabric.continuity_eval.enabled=false
character_fabric.auto_repair.enabled=false
character_fabric.omnichar_import.enabled=false
character_fabric.omnichar_export.enabled=false
character_fabric.comfyui_adapter.enabled=false
character_fabric.qwen_mcp_adapter.enabled=false
```

Flags SHALL be independently reversible.

------------------------------------------------------------------------

# 33. Delivery plan

  -----------------------------------------------------------------------
  Phase                   Deliverable             Exit gate
  ----------------------- ----------------------- -----------------------
  C0                      Canonical registry +    no duplicate authority
                          deployed
                          schema/interface audit

  C1                      PortableCharacter +     tenant/project/rights
                          immutable revisions +   tests pass
                          reference roles

  C2                      Resolver +              deterministic golden
                          provider-neutral        tests
                          character bundle

  C3                      Provider compiler +     no silent role
                          reference-slot          truncation
                          budgeting

  C4                      Qwen MCP adapter        removable adapter;
                          integration             route evidence

  C5                      ComfyUI adapter         pinned workflow/node
                          integration             provenance

  C6                      `.char` import/export   sandbox + lossy-export
                                                  evidence

  C7                      Image continuity        calibrated threshold
                          evaluator               profiles

  C8                      bounded repair loop     retry/cost/finality
                                                  tests

  C9                      SPEC-252/258 Film       no ownership
                          integration             duplication

  C10                     video temporal          worst-frame/segment
                          continuity              evidence

  C11                     detached Mini App       provider rebinding
                          portability             without business-logic
                                                  rewrite

  C12                     canary + rollback       no legacy regression
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 34. Acceptance tests

Minimum acceptance suite:

1.  Same character revision used through two different providers without
    changing Mini App business logic.
2.  Qwen MCP adapter can consume a portable character binding.
3.  ComfyUI adapter can consume the same binding.
4.  Provider with fewer reference slots produces explicit
    omission/downgrade evidence.
5.  Face/body/wardrobe references are role-aware; no tail truncation.
6.  Changing wardrobe does not mutate character identity.
7.  Film CharacterPerformance remains independent from portable
    identity.
8.  Stage can reuse previous approved appearance by reference.
9.  Image background edit preserves protected identity.
10. Multi-character test detects identity swap.
11. Multi-character aggregate cannot hide one failed subject.
12. Video evaluator identifies a worst drift segment.
13. Repair loop stops at configured budget/attempt ceiling.
14. Best previous candidate survives failed repair.
15. Rights revocation prevents new generation.
16. Local-only asset never egresses to cloud.
17. Voice reference does not authorize cloning by existence.
18. LoRA license is evaluated independently from orchestration-code
    license.
19. `.char` import cannot path-traverse.
20. `.char` import does not execute embedded code.
21. Lossy `.char` export reports omitted SmartAIHub fields.
22. Detached Mini App rebinds from SmartAIHub Runner to standalone
    adapter.
23. Cache is invalidated/fenced after rights-policy epoch change.
24. Cross-tenant asset IDs do not leak through dedup/cache.
25. Missing provider capability fails typed, not silently degraded.
26. Provider/model revision change invalidates affected qualification
    evidence.
27. Character resolver is idempotent for immutable inputs.
28. Every generated candidate records exact character revision and
    compiled conditioning digest.
29. Existing projects work with all new flags disabled.
30. No new scheduler, credit ledger, approval ledger or Film database is
    introduced.

------------------------------------------------------------------------

# 35. Implementation invariants

The implementation is rejected if any of the following becomes true:

-   `.char` becomes canonical SmartAIHub truth;
-   ComfyUI becomes mandatory;
-   Qwen becomes mandatory;
-   Mini Apps contain provider prompt dialects as business logic;
-   LoRA identity is confused with character identity;
-   Film performance and portable identity are merged into one mutable
    record;
-   continuity retry can run unbounded;
-   raw reference arrays are silently truncated;
-   voice references bypass consent;
-   provider-generated media is automatically marked approved;
-   shared character records bypass tenant/project authorization;
-   a new queue/job/billing/approval system is created;
-   provider/runtime implementation details leak into detached Mini App
    contracts.

------------------------------------------------------------------------

# 36. 40-pass gap audit

This revision was reviewed in four groups of ten passes. Each pass asks
a different failure question; discovered gaps are incorporated into the
normative sections above.

## Passes 1--10 --- domain and ownership

1.  Canonical identity vs provider representation --- closed by
    immutable portable revision.
2.  Character vs Film performance --- closed by explicit SPEC-252
    boundary.
3.  Identity vs wardrobe --- closed by appearance states.
4.  Character vs continuity state --- closed by snapshot separation.
5.  Voice vs visual identity --- closed by multimodal independent
    components.
6.  Shared core vs Mini App --- closed: shared/core ownership.
7.  `.char` interoperability vs authority --- closed: adapter only.
8.  ComfyUI dependency risk --- closed: removable adapter.
9.  Qwen dependency risk --- closed: provider-neutral compilation.
10. Future asset over-generalization --- closed: typed future schemas,
    no `any` blob.

## Passes 11--20 --- execution and correctness

11. Reference count mismatch --- closed by role-aware slot budgeting.
12. Silent reference loss --- closed by omission evidence.
13. Provider syntax leakage --- closed by compiler boundary.
14. Provider capability hallucination --- closed by qualification
    requirement.
15. Multi-character swap --- closed by stable binding/evaluator.
16. Edit destroys identity --- closed by protected edit semantics.
17. Video temporal drift --- closed by segment/frame evidence.
18. Infinite repair loop --- closed by hard attempt/cost/time bounds.
19. Retry destroys best output --- closed by best-candidate retention.
20. Cache produces stale identity/rights --- closed by digest + policy
    epoch.

## Passes 21--30 --- security, rights and portability

21. Malicious archive --- closed by package sandbox limits.
22. Path traversal/symlink escape --- closed explicitly.
23. SSRF through external refs --- closed explicitly.
24. Unsafe model deserialization --- isolated/blocked by policy.
25. License confusion --- component-level eligibility.
26. Consent confusion --- source use != training != voice clone !=
    publication.
27. Revocation --- fences new use and cached authorization.
28. Cross-tenant leakage --- scoped refs/cache/dedup.
29. Detached Mini App coupling --- portable schemas and rebinding.
30. Secrets in package --- prohibited.

## Passes 31--40 --- operations, UX and regression

31. Mobile cannot review --- mobile/tablet acceptance required.
32. Headless agent requires UI --- canonical commands required.
33. New job system accidentally introduced --- explicitly prohibited.
34. New Film database accidentally introduced --- explicitly prohibited.
35. Legacy migration corrupts meaning --- dual-read and opt-in
    migration.
36. Feature rollback impossible --- independent flags.
37. Observability leaks raw media --- metadata/evidence-only logging
    default.
38. Provider upgrade invalidates evidence --- revision/digest
    qualification.
39. Output marked complete too early --- continuity candidate gate.
40. Spec-number/worktree drift --- canonical origin/main registry gate
    before merge.

Result: **40/40 PMCCF domain passes addressed. Provisioning-specific
gaps are addressed by the R1.5 extension in Sections 40--74.
Implementation remains gated by canonical repository reconciliation and
real provider/runtime qualification.**

------------------------------------------------------------------------

# 37. Required companion changes

When implementing this amendment, make additive changes only:

### SPEC-307

Merge this PMCCF amendment into the latest canonical SPEC-307 revision
after registry/rebase gate.

### SPEC-252

Add portable character/cast binding references and continuity evidence
refs. Do not replace `CharacterPerformanceV1`.

### SPEC-258

Add character revision, appearance state, continuity snapshot/status and
identity-lock presentation to Stage/Quick Shot workflows. Do not move
character ownership into Stage.

### SPEC-253

Allow scoped immutable character revision and continuity snapshot refs
in media handoff extensions.

### SPEC-279

Register/reconcile character semantic commands without creating
duplicate command names.

### SPEC-287

Apply existing UI governance to Character/Look/Continuity selectors and
review states.

No retrospective mutation of already-implemented/frozen specifications
is required where project policy forbids it; an implementation
amendment/migration spec may carry the additive behavior while
preserving prior contracts.

------------------------------------------------------------------------

# 38. Definition of Done

PMCCF is done only when:

-   a character is created once and reused across at least two
    independently qualified media backends;
-   provider-specific syntax is absent from Mini App business logic;
-   Image and Film consumers reference the same portable identity
    revision;
-   wardrobe/temporary continuity changes do not mutate identity;
-   continuity evidence is stored and explainable;
-   repair is bounded, recoverable and budget-aware;
-   rights/consent/license gates are enforced before execution and
    egress;
-   `.char` interoperability works without becoming canonical truth;
-   ComfyUI and Qwen MCP remain optional/removable;
-   detached Mini App rebinding is demonstrated;
-   legacy behavior is unchanged with flags disabled;
-   canonical repository/spec registry reconciliation has passed.

------------------------------------------------------------------------

# 39. Implementation priority

Recommended priority is **C0 → C1 → C2 → C3 → C4 → C7 → C8 → C9**, then
ComfyUI/`.char` interoperability and video temporal scoring.

This sequence creates immediate value for the existing Qwen Image path
while establishing the provider-neutral domain contract first. It avoids
spending early implementation effort on ComfyUI-specific integration
before the shared character semantics are stable.

The first production milestone should prove:

``` text
Create Alice once
  -> use Alice in Qwen image generation
  -> edit Alice while preserving identity
  -> reuse Alice in Film Studio
  -> verify continuity
  -> switch provider without rewriting the Mini App
```

That is the minimum evidence that Portable Multimodal Character &
Continuity Fabric is functioning as shared SmartAIHub infrastructure
rather than as a provider-specific feature.
------------------------------------------------------------------------

# 40. Capability Pack & Automated Provisioning --- normative extension

## 40.1 Objective

SmartAIHub SHALL close the gap between **capability discovery** and
**usable capability**.

A Mini App, Skill, Agent or workflow SHALL request semantic capability.
It SHALL NOT directly install Ollama, llama.cpp, Strata, ComfyUI, CUDA
components, model weights, LoRAs, VAEs, upscalers, continuity evaluators
or arbitrary packages.

Canonical flow:

``` text
Capability request
      ↓
Discover current capabilities
      ↓
Satisfied? ── yes ──> execute
      |
      no
      ↓
Capability Gap Analyzer
      ↓
Provisioning Recommendation Engine
      ↓
ranked choices:
  use existing / local lite / local quality / advanced / cloud / hybrid
      ↓
show impact + reason + requirements
      ↓
user/policy approval when installation, download, spend or privilege is material
      ↓
Provisioning Transaction
      ↓
download → verify → stage → install → probe → benchmark → qualify
      ↓
register capability
      ↓
execute original intent
```

The original user task SHOULD resume automatically after successful
provisioning when policy permits. The user SHALL NOT need to repeat the
original prompt merely because a capability had to be installed.

## 40.2 Core versus optional packs

The SmartAIHub Desktop/Runner core SHOULD remain lightweight.

Canonical capability families:

``` text
CORE
├─ Runner / capability discovery
├─ resource & health probes
├─ package/model registry client
├─ provisioning transaction manager
├─ policy/approval integration
├─ Portable Character schema/resolver
└─ cloud/provider adapters that do not require heavyweight local runtimes

OPTIONAL
├─ Local LLM Pack
├─ Local Image Pack
├─ Advanced Image/ComfyUI Pack
├─ Character Continuity Evaluator Pack
├─ Local Speech Pack
├─ Local Video Pack
└─ future specialized packs
```

Portable Character Identity itself SHALL NOT require a GPU runtime.
Provider execution and local continuity evaluation may.

## 40.3 Capability Pack Manifest

Every managed pack SHALL publish a signed/versioned manifest.

``` ts
interface CapabilityPackManifestV1 {
  schemaVersion: 'capability.pack.v1';
  packId: string;
  version: string;
  channel: 'STABLE'|'BETA'|'EXPERIMENTAL';
  publisherRef: string;

  provides: string[];
  optionalProvides?: string[];
  conflictsWith?: string[];
  supersedes?: string[];

  supportedPlatforms: Array<{
    os: 'WINDOWS'|'LINUX'|'MACOS';
    arch: 'X64'|'ARM64';
    gpuVendors?: Array<'NVIDIA'|'AMD'|'INTEL'|'APPLE'|'CPU_ONLY'>;
  }>;

  requirements: {
    minRamBytes?: number;
    recommendedRamBytes?: number;
    minVramBytes?: number;
    recommendedVramBytes?: number;
    diskDownloadBytes?: number;
    diskInstalledBytes?: number;
    tempDiskBytes?: number;
    driverConstraints?: string[];
    runtimeConstraints?: string[];
  };

  components: CapabilityPackComponentV1[];
  healthProbeRef: string;
  benchmarkProfileRefs: string[];
  rollbackPolicyRef: string;
  licenseEvidenceRefs: string[];
  securityEvidenceRefs: string[];
  immutableDigest: string;
  signatureRef: string;
}
```

A pack manifest describes compatibility and installation. It does not
become routing truth until qualification probes pass on the actual node.

## 40.4 Pack component types

``` ts
type CapabilityPackComponentKind =
  | 'RUNTIME'
  | 'MODEL'
  | 'MODEL_ADAPTER'
  | 'LORA'
  | 'VAE'
  | 'UPSCALER'
  | 'EVALUATOR'
  | 'COMFYUI_NODE'
  | 'WORKFLOW'
  | 'DRIVER_HELPER'
  | 'SYSTEM_LIBRARY'
  | 'CONFIG'
  | 'OTHER';
```

Each material component SHALL carry source, version/revision, digest,
license metadata and install scope.

Unknown code SHALL NOT be installed merely because a model/workflow
depends on it.

------------------------------------------------------------------------

# 41. Device Capability Inventory

Provisioning SHALL begin with a factual device inventory.

``` ts
interface DeviceCapabilityInventoryV1 {
  nodeId: string;
  os: string;
  osVersion: string;
  architecture: string;

  cpu: {
    model?: string;
    logicalCores?: number;
  };

  memory: {
    totalBytes: number;
    availableBytes?: number;
  };

  gpu: Array<{
    vendor: string;
    model: string;
    vramTotalBytes?: number;
    vramFreeBytes?: number;
    driverVersion?: string;
    computeBackends: string[];
  }>;

  storage: Array<{
    volumeRef: string;
    freeBytes: number;
    filesystem?: string;
  }>;

  installedRuntimeRefs: string[];
  installedPackRefs: string[];
  registeredModelRefs: string[];
  networkClass?: 'OFFLINE'|'METERED'|'NORMAL'|'HIGH_BANDWIDTH'|'UNKNOWN';
  powerClass?: 'BATTERY'|'AC'|'SERVER'|'UNKNOWN';
  observedAt: string;
}
```

Inventory collection SHALL minimize sensitive data and SHALL NOT upload
unnecessary hardware identifiers.

GPU model name alone is insufficient. Recommendation SHALL consider
measured free VRAM/RAM, disk, runtime compatibility, workload and
benchmark evidence.

------------------------------------------------------------------------

# 42. Capability Gap Analyzer

A semantic requirement is compared with the inventory and currently
qualified capabilities.

Example:

``` ts
interface CapabilityGapV1 {
  requestRef: string;
  requiredCapabilities: string[];
  satisfiedCapabilities: string[];
  missingCapabilities: string[];
  degradedCapabilities: string[];
  blockers: Array<{
    code: string;
    detail: string;
    remediationClass:
      | 'INSTALL_PACK'
      | 'DOWNLOAD_MODEL'
      | 'UPDATE_RUNTIME'
      | 'UPDATE_DRIVER'
      | 'FREE_DISK'
      | 'USE_CLOUD'
      | 'USE_OTHER_NODE'
      | 'POLICY_REVIEW'
      | 'UNAVAILABLE';
  }>;
}
```

The analyzer SHALL distinguish:

-   runtime missing;
-   model missing;
-   model installed but not qualified;
-   insufficient current free VRAM;
-   insufficient physical VRAM;
-   insufficient disk;
-   incompatible driver/runtime;
-   capability present on another authorized Runner;
-   cloud route available;
-   license/policy prevents a route.

------------------------------------------------------------------------

# 43. Provisioning Recommendation Engine

## 43.1 Ranked alternatives, not one opaque answer

When a capability is missing, the system SHALL produce ranked
alternatives.

Canonical option classes:

``` text
USE_EXISTING
LOCAL_LITE
LOCAL_BALANCED
LOCAL_QUALITY
LOCAL_ADVANCED
OTHER_AUTHORIZED_NODE
CLOUD
HYBRID
NOT_RECOMMENDED
```

Example UX:

``` text
You need: image.generate + character.identity.high

Recommended — Local Balanced
✓ Your device is compatible
✓ private/local execution
✓ no per-image provider charge
Requires:
  Qwen Image runtime
  qualified image model
  ~estimated download/install space
Expected:
  quality: High
  speed: measured after install
  setup: One-time

Alternative — Cloud
✓ no installation
✓ fastest setup
! usage charges
! authorized references leave this device

Advanced — ComfyUI
✓ maximum workflow flexibility
! larger maintenance surface
! extra nodes/models may be required

[Install recommended] [Use cloud] [Compare] [Not now]
```

The recommendation SHALL never present unmeasured speed or VRAM fit as a
guaranteed fact.

## 43.2 Recommendation inputs

At minimum:

``` text
requested capability
quality target
privacy/locality requirement
latency preference
expected usage frequency
batch/concurrency needs
current device inventory
measured benchmark evidence
download size
installed size
temporary install space
runtime/model license eligibility
network condition
power/battery state when relevant
cloud availability
estimated cloud cost where available
existing installed components
component reuse potential
maintenance complexity
stability/channel
user/tenant policy
```

## 43.3 Suitability score

The engine MAY calculate an internal normalized score:

``` text
Suitability =
  capability_fit
+ hardware_fit
+ quality_fit
+ privacy_fit
+ reuse_fit
+ cost_fit
+ operational_fit
- install_burden
- maintenance_burden
- compatibility_risk
- policy_risk
```

Weights SHALL be policy/profile-driven and explainable. A score MUST NOT
override a hard constraint.

## 43.4 Recommendation profiles

User/tenant may choose a preference profile:

``` text
AUTO_BALANCED
LOCAL_FIRST
PRIVACY_FIRST
LOWEST_COST
BEST_QUALITY
FASTEST_SETUP
LOW_DISK
CLOUD_FIRST
MANUAL
```

`AUTO_BALANCED` SHOULD be the default unless product policy requires
otherwise.

A Mini App MAY request requirements but SHALL NOT silently change the
user's global preference profile.

------------------------------------------------------------------------

# 44. Recommendation explainability

Every recommendation SHALL expose:

-   why it is recommended;
-   what will be installed/downloaded;
-   whether code, models or both are installed;
-   source/publisher;
-   version/channel;
-   estimated download size;
-   estimated final disk usage;
-   temporary disk requirement;
-   expected VRAM/RAM class;
-   measured/estimated performance status;
-   quality tier;
-   privacy/egress behavior;
-   recurring cloud cost when applicable;
-   license/commercial-use eligibility;
-   restart/admin-right requirement;
-   rollback/uninstall availability;
-   known conflicts;
-   what functionality remains unavailable.

The UI SHALL distinguish:

``` text
MEASURED_ON_THIS_DEVICE
MEASURED_ON_SIMILAR_DEVICE
VENDOR_DOCUMENTED
COMMUNITY_REPORTED
ESTIMATED
UNKNOWN
```

Marketing claims SHALL NOT be shown as local benchmark evidence.

------------------------------------------------------------------------

# 45. Smart defaults by workload

The engine SHOULD reason by workload rather than product name.

## 45.1 Local LLM

Default choice order:

``` text
already-qualified compatible runtime
→ smallest sufficient managed Local LLM pack
→ alternative authorized local runtime
→ other authorized Runner
→ cloud
```

Do not install multiple LLM runtimes when one qualified runtime
satisfies the requested capability unless the user explicitly wants
redundancy/benchmarking or another capability requires it.

Managed runtime examples MAY include llama.cpp, Ollama, Strata or future
engines, but none is mandatory.

## 45.2 Image generation

Default choice order:

``` text
existing qualified image runtime
→ Local Image Pack
→ cloud image provider
→ Advanced ComfyUI Pack only when workflow flexibility/custom nodes justify it
```

ComfyUI SHALL NOT be the default dependency for ordinary image
generation merely because it can perform the task.

## 45.3 Portable Character Identity

Default:

``` text
Portable Character core: no additional heavyweight AI runtime required
```

For actual generation:

``` text
character identity
+ requested media capability
→ choose image/video backend
```

For automated continuity scoring:

``` text
existing evaluator
→ optional Continuity Evaluator Pack
→ managed/cloud evaluator if policy allows
→ human review if no eligible evaluator
```

Creating/importing a portable character SHALL NOT force installation of
a continuity model or LoRA training stack.

## 45.4 Character LoRA

LoRA training/generation is optional and SHOULD be recommended only when
expected continuity/quality benefit justifies:

-   training time;
-   storage;
-   GPU requirements;
-   model-family coupling;
-   rights/consent requirements;
-   maintenance burden.

Reference-first workflows SHOULD be preferred when independently
qualified as sufficient.

## 45.5 Video generation

Local video packs SHOULD be offered only when actual hardware
qualification and workload justify them. Cloud/remote GPU SHOULD remain
a first-class alternative.

------------------------------------------------------------------------

# 46. Provisioning Plan

Before mutation, create an immutable plan.

``` ts
interface ProvisioningPlanV1 {
  planId: string;
  requestRef: string;
  nodeId: string;
  selectedOptionId: string;
  componentActions: Array<{
    action: 'INSTALL'|'DOWNLOAD'|'UPDATE'|'REUSE'|'ENABLE'|'REMOVE_CONFLICT';
    componentRef: string;
    sourceRef?: string;
    immutableDigest?: string;
    targetScope: 'USER'|'SMARTAIHUB_MANAGED'|'SYSTEM';
  }>;

  diskImpact: {
    downloadBytes?: number;
    installedBytes?: number;
    tempBytes?: number;
  };

  privilegeRequirements: string[];
  restartRequirements: string[];
  expectedCapabilities: string[];
  rollbackPlanRef: string;
  approvalRequirements: string[];
  exactDigest: string;
}
```

The plan SHALL be previewable before consequential mutation.

------------------------------------------------------------------------

# 47. Approval and autonomy rules

The system MAY automatically:

-   inspect capabilities;
-   calculate recommendations;
-   reuse already authorized installed components;
-   run non-invasive health probes;
-   use a previously authorized cloud/local route within policy and
    budget.

Explicit approval is REQUIRED by default before:

-   installing executable code;
-   installing system-wide components;
-   changing drivers;
-   downloading materially large model assets when not preauthorized;
-   accepting new licenses/terms;
-   enabling external network listeners;
-   exposing a local service to LAN/Internet;
-   incurring spend beyond existing authorization;
-   uninstalling user-managed software;
-   removing conflicting software;
-   changing security/firewall settings.

Users/tenants MAY preauthorize bounded managed pack updates/downloads
through policy.

A Mini App SHALL NOT grant itself installation authority.

------------------------------------------------------------------------

# 48. Transactional provisioning lifecycle

Provisioning SHALL be durable and recoverable:

``` text
PLANNED
→ APPROVED
→ PREFLIGHT
→ DOWNLOADING
→ VERIFIED
→ STAGED
→ INSTALLING
→ PROBING
→ BENCHMARKING
→ QUALIFIED
→ ACTIVATED
```

Failure states:

``` text
BLOCKED
FAILED_DOWNLOAD
FAILED_VERIFY
FAILED_INSTALL
FAILED_PROBE
FAILED_BENCHMARK
ROLLING_BACK
ROLLED_BACK
NEEDS_REBOOT
NEEDS_USER_ACTION
```

Power loss, app close or Runner restart SHALL resume from durable state
rather than starting blindly from zero.

------------------------------------------------------------------------

# 49. Download, integrity and supply-chain controls

Managed downloads SHALL require:

-   allowlisted/approved source policy;
-   HTTPS or equivalent trusted transport;
-   immutable digest where available;
-   signature/attestation verification where supported;
-   expected size bounds;
-   resumable partial download;
-   quarantine before activation;
-   license metadata;
-   provenance;
-   malware/security scanning where available.

Digest mismatch SHALL fail closed.

Mutable `latest` URLs SHALL NOT be sufficient production identity.

------------------------------------------------------------------------

# 50. Model Store and deduplication

Models and large reusable assets SHOULD be managed through a
content-addressed Model Store.

``` text
Model Store
├─ blobs/<digest>
├─ manifests
├─ runtime compatibility
├─ license evidence
├─ qualification evidence
└─ logical aliases
```

Multiple Mini Apps/packs SHOULD reference the same immutable blob
instead of downloading duplicates.

Rules:

-   ref-count or equivalent safe lifecycle;
-   do not delete a shared blob while referenced;
-   user can inspect disk use by pack/model;
-   uninstall pack removes only unreferenced managed assets;
-   external/user-managed model directories remain user-owned unless
    explicitly imported;
-   dedup MUST NOT create cross-tenant information leakage.

------------------------------------------------------------------------

# 51. Coexistence with user-managed runtimes

SmartAIHub SHALL support:

``` text
MANAGED
USER_MANAGED
EXTERNAL_REMOTE
CLOUD
```

If a compatible user-installed runtime already exists, the system SHOULD
offer:

``` text
Use existing installation
Install SmartAIHub-managed isolated copy
Use cloud instead
```

It SHALL NOT silently overwrite, upgrade or reconfigure a user-managed
runtime.

Managed installs SHOULD prefer isolated application-owned
directories/environments over polluting global Python/system package
state.

------------------------------------------------------------------------

# 52. Drivers and CUDA-like system dependencies

GPU driver mutation is high impact.

Rules:

1.  probe existing driver/backend first;
2.  prefer runtime distributions that can use compatible existing
    drivers/libraries;
3.  do not install a full developer toolkit merely because a runtime can
    optionally compile from source;
4.  prefer verified prebuilt artifacts for ordinary users;
5.  driver update recommendation SHALL explain why it is needed;
6.  driver installation/update requires explicit approval and, where
    appropriate, elevated privileges/reboot;
7.  rollback/recovery guidance must be available;
8.  never claim a toolkit is required when only a runtime
    library/prebuilt package is actually needed.

------------------------------------------------------------------------

# 53. Runtime isolation

Managed runtimes SHOULD be isolated by pack/runtime identity.

Examples:

``` text
SmartAIHub/runtime/llm/<runtime>/<version>
SmartAIHub/runtime/image/<runtime>/<version>
SmartAIHub/runtime/comfyui/<version>
SmartAIHub/models/<content-digest>
```

Python-based stacks SHOULD use isolated environments. Node/custom-node
dependencies SHALL NOT share a mutable global environment by default.

This reduces dependency conflicts between Mini Apps and capability
packs.

------------------------------------------------------------------------

# 54. Update policy

Every pack/component SHALL support an update policy:

``` text
PINNED
SECURITY_ONLY
STABLE_AUTO
MANUAL
```

Updates SHALL:

-   stage beside the active version when practical;
-   run health/compatibility probes before switch;
-   preserve prior known-good version until commit;
-   invalidate qualification evidence when material runtime/model
    changes;
-   support rollback;
-   not silently upgrade user-managed components.

Model updates are not equivalent to runtime updates and SHALL be tracked
separately.

------------------------------------------------------------------------

# 55. Uninstall and disk management

User SHALL be able to see:

``` text
Pack
Models
Installed size
Last used
Used by
Safe to remove?
Re-download cost
```

Uninstall SHALL produce an impact preview.

Example:

``` text
Remove Advanced Image Pack?
Will remove:
  ComfyUI runtime 4.2 GB

Will keep:
  Qwen model 12.8 GB
because Local Image Pack also uses it.

Capabilities lost:
  custom ComfyUI workflows
  selected custom nodes
```

The system SHALL NOT delete user-created workflows, character assets or
project outputs as part of runtime uninstall.

------------------------------------------------------------------------

# 56. Cloud versus local comparison

Recommendation UI SHALL compare local and cloud honestly.

At minimum:

  -----------------------------------------------------------------------
  Dimension               Local                   Cloud
  ----------------------- ----------------------- -----------------------
  setup                   download/install may be usually immediate
                          required

  recurring cost          power/storage; often no usage/provider fee
                          per-call provider fee

  privacy                 can remain on device    authorized data egress

  offline                 possible                generally no

  quality                 hardware/model          provider dependent
                          dependent

  speed                   device/workload         network/provider
                          dependent               dependent

  maintenance             local runtime/model     provider-managed
                          updates

  scale                   bounded by local        provider quota/capacity
                          hardware
  -----------------------------------------------------------------------

Do not label local as "free"; electricity, storage, maintenance and
hardware are real costs.

Do not label cloud as "better"; route by requirement/evidence.

------------------------------------------------------------------------

# 57. Recommendation examples

## 57.1 User asks for text summarization

``` text
Current:
  local LLM capability: absent
  cloud LLM: authorized

Choices:
1. Use cloud now — fastest setup
2. Install Local LLM Lite — recommended if frequent/private use
3. Use another authorized Runner — if available
```

The user may continue immediately with cloud while a local pack is
installed separately only if requested/authorized.

## 57.2 User asks for image generation with capable local GPU

``` text
Choices:
1. Install Local Image Pack — recommended for repeated local generation
2. Use cloud — no install
3. Install Advanced ComfyUI Pack — only if custom workflows/nodes are needed
```

## 57.3 User creates Portable Character only

``` text
No heavyweight install required.
Optional:
- Continuity Evaluator Pack — for automated identity checks
- Local Image Pack — to generate locally
- Cloud image route — generate without local model install
```

## 57.4 User requests high-consistency character images

``` text
Existing reference-based backend qualified?
  yes → use it first

If continuity remains below target:
  recommend stronger reference strategy
  → optional compatible adapter/LoRA
  → optional training only after rights/cost/hardware checks
```

Do not jump directly to LoRA training.

------------------------------------------------------------------------

# 58. SmartAIHub Desktop/Runner UX

Capability Center SHOULD expose:

``` text
Device
Capabilities
Recommended
Installed
Models
Updates
Storage
Benchmarks
Problems
```

Each capability card SHOULD show:

``` text
Local LLM          Ready
Image Generation   Install recommended
Character Identity Ready
Continuity Check   Cloud available / Local optional
Video Generation   Cloud recommended
```

The UI SHALL distinguish **Ready**, **Available to install**, **Cloud
available**, **Degraded**, **Unsupported**, **Blocked by policy**, and
**Needs attention**.

------------------------------------------------------------------------

# 59. Mini App contract

Mini Apps declare semantic requirements:

``` yaml
capabilities:
  required:
    - id: ai.text.generate
      profile: balanced
  optional:
    - id: ai.media.image.generate
      profile: local-preferred
    - id: character.continuity.evaluate
      profile: optional
```

A Mini App SHALL NOT declare:

``` yaml
pip_install: ...
winget_install: ...
download_this_exe: ...
cuda_version: ...
comfyui_nodes: ...
```

Those belong to approved Capability Pack manifests and provisioning
policy.

This is essential to detached Mini App portability.

------------------------------------------------------------------------

# 60. Agent/headless provisioning API

Candidate semantic operations:

``` text
capability.inspect
capability.gap.analyze
capability.recommend
capability.provision.preview
capability.provision.apply
capability.provision.status
capability.provision.cancel
capability.pack.update.preview
capability.pack.update.apply
capability.pack.uninstall.preview
capability.pack.uninstall.apply
capability.benchmark
capability.explain
```

Names MUST be reconciled with SPEC-279/current command registry.

Agents may prepare plans. They may execute only within
explicit/preauthorized authority.

------------------------------------------------------------------------

# 61. Multi-node recommendation

If several authorized Runner nodes exist, recommendation SHALL consider
placement before installing duplicates.

Example:

``` text
Desktop A: image generation ready
Laptop B: no suitable GPU
Server C: LLM ready

Laptop user asks for image:
  1. use Desktop A if authorized/online
  2. cloud
  3. local CPU/degraded only if useful
```

Do not recommend a heavyweight install on every device when an existing
authorized node satisfies the workload better.

------------------------------------------------------------------------

# 62. Offline and metered-network behavior

Provisioning SHALL detect/accept network constraints.

For metered/slow networks:

-   show exact/estimated download size;
-   allow pause/resume;
-   permit "download later";
-   allow transfer/import of verified pack/model blobs from another
    trusted device where policy permits;
-   never auto-download multi-GB models merely because a Mini App was
    opened.

Offline mode SHALL use already-qualified local capabilities and clearly
mark unavailable cloud routes.

------------------------------------------------------------------------

# 63. Benchmark and qualification

After installation, benchmark the capability actually required.

Examples:

### LLM

``` text
model load time
tokens/sec
time-to-first-token
context-size probe
structured-output conformance
tool-call conformance
peak RAM/VRAM
OOM rate
concurrency
```

### Image

``` text
cold load
generation latency by tested resolution
edit latency
reference-count tests
peak RAM/VRAM
OOM/failure rate
output capability conformance
```

### Continuity evaluator

``` text
latency
memory
supported media type
calibration profile
false accept/reject benchmark set version
```

Qualification evidence is scoped to material runtime/model/hardware
revisions.

------------------------------------------------------------------------

# 64. Recommendation learning without lock-in

The engine MAY improve recommendations from aggregate operational
evidence, but SHALL NOT learn opaque user-specific installation behavior
that overrides explicit preferences.

Useful evidence:

``` text
pack install success rate
runtime crash/OOM rate
benchmark distributions by hardware class
model load failures
rollback frequency
capability conformance
```

Recommendations SHOULD become more accurate as evidence accumulates.

Users retain the ability to choose another eligible route.

------------------------------------------------------------------------

# 65. Provisioning security boundaries

Provisioning is a privileged subsystem.

Mandatory:

-   signed/approved manifests;
-   least privilege;
-   privilege escalation only for the exact approved step;
-   no arbitrary shell from Mini App manifests;
-   no untrusted post-install script with inherited secrets;
-   sandbox probes where practical;
-   redact secrets from logs;
-   package source allowlist/policy;
-   immutable evidence receipt;
-   command/argument allowlisting for privileged helper;
-   no network listener exposure by default;
-   localhost services bind loopback unless explicitly authorized
    otherwise.

------------------------------------------------------------------------

# 66. Failure recovery

A failed install SHALL NOT leave routing believing the capability is
ready.

On failure:

``` text
preserve original active version
preserve downloaded verified blobs when safe
remove/disable incomplete staged environment
record failure evidence
offer retry / alternate route / cloud
resume original task through alternate route when authorized
```

Repeated identical failure SHOULD reduce recommendation ranking for that
node until evidence changes.

------------------------------------------------------------------------

# 67. Provisioning-specific failure codes

``` text
CAPABILITY_MISSING
NO_ELIGIBLE_PROVISION_OPTION
INSUFFICIENT_DISK
INSUFFICIENT_RAM
INSUFFICIENT_VRAM
DRIVER_INCOMPATIBLE
RUNTIME_CONFLICT
LICENSE_NOT_ACCEPTED
LICENSE_INELIGIBLE
DOWNLOAD_FAILED
DIGEST_MISMATCH
SIGNATURE_INVALID
INSTALL_FAILED
HEALTH_PROBE_FAILED
BENCHMARK_FAILED
QUALIFICATION_FAILED
ADMIN_APPROVAL_REQUIRED
REBOOT_REQUIRED
NETWORK_METERED_CONFIRMATION_REQUIRED
PACK_ROLLBACK_COMPLETED
PACK_ROLLBACK_FAILED
USER_MANAGED_COMPONENT_CONFLICT
```

------------------------------------------------------------------------

# 68. Provisioning observability

Track without exposing private content:

``` text
recommendation shown
option selected
reason codes
plan digest
download bytes
cache/dedup savings
install duration
probe outcome
benchmark refs
activation outcome
rollback outcome
capability first successful use
```

Do not use recommendation telemetry to silently install software.

------------------------------------------------------------------------

# 69. Additional feature flags

``` text
capability_provisioning.enabled=false
capability_recommendations.enabled=false
capability_managed_packs.enabled=false
capability_auto_resume.enabled=false
capability_model_store.enabled=false
capability_benchmark_after_install.enabled=false
capability_managed_updates.enabled=false
```

All SHALL be independently reversible.

------------------------------------------------------------------------

# 70. Provisioning delivery sequence

  --------------------------------------------------------------------------
  Phase                   Deliverable                Exit gate
  ----------------------- -------------------------- -----------------------
  P0                      inventory + gap analyzer   factual device state;
                                                     no mutation

  P1                      recommendation engine +    explainable ranked
                          compare UI                 choices

  P2                      signed pack manifest +     no arbitrary Mini App
                          registry                   installers

  P3                      model store + dedup        safe ref lifecycle

  P4                      transactional installer    resume/rollback
                                                     verified

  P5                      health probes +            capability not Ready
                          qualification              before proof

  P6                      benchmarks                 evidence-driven routing

  P7                      Local LLM pack             one managed reference
                                                     runtime

  P8                      Local Image pack           one managed reference
                                                     runtime

  P9                      Continuity Evaluator pack  optional character QA

  P10                     Advanced ComfyUI pack      optional, isolated

  P11                     multi-node/cloud/hybrid    no unnecessary
                          recommendation             duplicate install

  P12                     update/uninstall/storage   reversible lifecycle
                          UX

  P13                     canary                     legacy/no-pack users
                                                     unaffected
  --------------------------------------------------------------------------

------------------------------------------------------------------------

# 71. Additional acceptance tests

31. Opening a Mini App does not automatically download a multi-GB model.
32. Missing LLM capability produces at least local/cloud alternatives
    when eligible.
33. Missing image capability does not automatically recommend ComfyUI as
    the only route.
34. Creating Portable Character requires no heavyweight AI pack.
35. Continuity evaluator is optional unless product policy explicitly
    requires automated verification.
36. Recommendation explains download/install/temp disk separately.
37. Recommendation distinguishes measured versus estimated performance.
38. Hard privacy policy eliminates cloud options.
39. Low-disk profile does not recommend an ineligible large pack.
40. Existing compatible user-managed runtime is offered before duplicate
    managed install where safe.
41. User-managed runtime is never silently upgraded.
42. Failed staged update preserves previous known-good runtime.
43. Power loss during download resumes safely.
44. Digest mismatch never activates the component.
45. Shared model blob is downloaded once for two compatible packs.
46. Uninstalling one pack does not remove a model still referenced by
    another.
47. Driver update always requires explicit approval.
48. Mini App manifest cannot execute arbitrary installer commands.
49. Other authorized Runner is considered before unnecessary local
    install.
50. Metered network blocks/surfaces large automatic download.
51. Original user task can resume after successful approved
    provisioning.
52. Original task can route to cloud after local provisioning failure
    when authorized.
53. Capability is not marked Ready until health probe succeeds.
54. Material model/runtime change invalidates qualification evidence.
55. Recommendation ranking includes license eligibility.
56. Local route is not called "free" solely because no API charge
    exists.
57. Cloud route explains egress and estimated usage cost when known.
58. LoRA training is not required merely to create a character.
59. Capability Center accurately separates
    Ready/Install/Cloud/Unsupported/Blocked states.
60. All new provisioning feature flags disabled preserves previous
    SPEC-307 behavior.

------------------------------------------------------------------------

# 72. 60-pass audit result

The original PMCCF passes 1--40 remain valid.

Passes 41--60 specifically audited provisioning:

41. Discovery without remediation --- closed by Gap Analyzer +
    recommendations.
42. One-size-fits-all install --- closed by ranked option classes.
43. GPU-name-only decision --- closed by inventory + measured
    qualification.
44. Dependency zoo --- closed by minimum-sufficient pack selection and
    reuse.
45. ComfyUI over-installation --- closed by Advanced/optional status.
46. Portable Character falsely requiring GPU --- explicitly prohibited.
47. Mini App arbitrary installers --- prohibited by semantic capability
    contract.
48. User software overwritten --- managed/user-managed separation.
49. Failed update bricks runtime --- staged activation + rollback.
50. Duplicate model storage --- content-addressed Model Store.
51. Silent large download --- approval/network/disk UX.
52. Driver mutation too casually --- privileged explicit gate.
53. Capability marked ready before proof ---
    probe/benchmark/qualification lifecycle.
54. No cloud/local comparison --- explicit comparison contract.
55. No multi-node awareness --- placement before duplicate provisioning.
56. Task lost after installation --- auto-resume original intent.
57. License ignored in recommendation --- eligibility is a hard/ranking
    input.
58. Uninstall deletes shared/user data --- impact preview/ref-safe
    removal.
59. Updates invalidate evidence silently --- requalification required.
60. Provisioning telemetry becomes authority --- telemetry informs;
    user/policy authority remains explicit.

Result: **60/60 documented architecture passes addressed.** This does
not replace real installation, security, license, compatibility and
hardware qualification testing.

------------------------------------------------------------------------

# 73. Revised Definition of Done

In addition to Section 38, SPEC-307 R1.5 is complete only when:

1.  a Mini App can declare a semantic capability without installer
    logic;
2.  SmartAIHub detects a missing capability;
3.  it offers at least the eligible Local/Cloud/Other-node choices with
    explanations;
4.  user can compare install size, privacy, cost, quality evidence and
    maintenance burden;
5.  an approved managed pack installs transactionally;
6.  failed installation rolls back;
7.  successful install is probed and benchmarked before registration;
8.  the original user task resumes without re-entering the prompt;
9.  shared models are deduplicated;
10. update/uninstall lifecycle is reversible and understandable;
11. Portable Character creation remains lightweight;
12. actual image/LLM/continuity execution selects the minimum sufficient
    qualified runtime;
13. ComfyUI remains optional;
14. user-managed software remains untouched unless explicitly
    authorized;
15. all behavior is available headlessly through canonical
    command/capability surfaces.

------------------------------------------------------------------------

# 74. Recommended first implementation milestone

Implement this end-to-end scenario first:

``` text
User opens Mini App
→ requests local image generation using Alice
→ SmartAIHub sees Character Fabric ready but image.generate missing
→ detects device inventory
→ recommends:
     A. Local Image Pack
     B. Cloud
     C. Advanced ComfyUI (optional)
→ user selects Local Image Pack
→ show exact plan/size/source/license/privacy
→ approve
→ download + verify + staged install
→ health probe + benchmark
→ register image.generate
→ resume original Alice generation
→ continuity check via existing/cloud evaluator
→ optionally recommend local Continuity Evaluator only after demonstrated repeated need
```

This proves the complete product value: **Mini Apps ask for
capabilities; SmartAIHub makes the machine capable, safely and
explainably.**
