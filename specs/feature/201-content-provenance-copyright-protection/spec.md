# SPEC-201 — SmartAIHub Content Provenance & Copyright Protection

**Revision 1.3 focus:** externally reviewable ownership/rights evidence, trusted timestamps, image/audio/video verification, reproducible technical analysis, mandatory protection at the final compound/render boundary, and complete Dashboard/quick-link/image UI parity.  

**Status:** Proposed for implementation — Revision 1.3  
**Target:** SmartAIHub Web + SmartAIHub Desktop/Worker + Core API  
**Suggested path:** `specs/feature/201-content-provenance-copyright-protection/spec.md`  
**Primary use case:** Protect AI-generated images, audio, video/series assets; establish a verifiable chain of creation/registration and rights claims; verify suspected copies; and generate evidence packages for copyright/platform review.  
**Scope:** Image + audio + video. Implementation may be phased, but the data model, evidence model, UI, and external-review format MUST support all three media types from the beginning.

---

## 1. Executive Summary

SmartAIHub must provide a first-class **Content Provenance & Copyright Protection** capability for media created, edited, rendered, or exported through the platform.

The feature is not a single watermark function. It is a layered protection system combining:

1. **Visible branding watermark** — optional logo/text/episode identifier.
2. **Invisible video watermark** — machine-detectable signal embedded into the video essence.
3. **Invisible audio watermark** — optional supporting signal embedded into the audio.
4. **Video fingerprinting** — perceptual signatures for matching visually similar or partially copied videos.
5. **Audio fingerprinting** — supporting evidence when audio remains similar.
6. **Cryptographic hashes** — exact-file integrity evidence.
7. **C2PA / Content Credentials** — signed provenance manifest where supported.
8. **Production provenance records** — link the final asset to project, render job, source files, script/storyboard versions, timestamps, and publication records.
9. **Verification workflow** — upload a suspected copy and compare it against protected assets.
10. **Evidence package generation** — create a structured, signed package suitable for human review and platform copyright-report workflows.

This must integrate with the existing SmartAIHub architecture. It must **not create a second job system**. Heavy processing must run through the existing Worker/Desktop runtime and the unified `worker_jobs` / `worker_job_events` control plane.

The web application remains the main UI, control plane, evidence viewer, case manager, and audit interface.

## 1.1 Evidence Doctrine — What SmartAIHub Can and Cannot Prove

The system MUST distinguish three separate questions:

```text
A. Was this exact/related media observed or produced earlier?
B. Does the reported media technically match or derive from that media?
C. Does the claimant legally own the rights being asserted?
```

Technical tools can provide strong evidence for A and B. Question C also requires rights-holder identity, chain-of-title/licensing evidence, claimant declarations, and applicable law.

Therefore SmartAIHub MUST NOT present a watermark, fingerprint, hash, C2PA manifest, or creation timestamp by itself as conclusive proof of legal copyright ownership.

The target output is instead a **reviewable evidence chain** that allows a social-media IP administrator or other reviewer to answer:

1. Who is making the claim?
2. What exact work/right is being claimed?
3. When did SmartAIHub first observe or generate the media?
4. What cryptographic and third-party timestamp evidence exists?
5. What original/publication records exist?
6. Does the suspected image/audio/video technically match the registered original?
7. Which tools/versions/thresholds produced that conclusion?
8. Can the result be independently re-checked?


---

# 2. Problem Statement

Creators of AI series, short-form video, advertising, and other generated media can have their content downloaded, re-encoded, cropped, subtitled, branded by another page, and re-uploaded without permission.

A normal platform “Report” action may not be sufficient because:

- community-standard reports and intellectual-property reports are different workflows;
- copied media may be recompressed or modified;
- metadata can be removed;
- visible watermarks can be cropped or blurred;
- AI-generated source material can make authorship/provenance harder to demonstrate if the production history is not preserved.

SmartAIHub therefore needs to preserve evidence from the moment an asset is created and provide technical tools to compare a suspected copy against the original.

---

# 3. Goals

The system MUST:

- protect a final video during export or after export;
- generate a durable asset identity that does not expose tenant/user information;
- embed an invisible video watermark;
- optionally embed an invisible audio watermark;
- optionally add a visible watermark;
- preserve an unmodified source master;
- create a protected distribution master;
- generate exact hashes and perceptual fingerprints;
- create a C2PA manifest after all media transformations are complete;
- verify that the freshly protected output can be detected before it is marked ready;
- allow users to upload a suspected copy for verification;
- compare a suspicious clip against one selected original or search the user's protected assets;
- detect full-copy and partial-clip reuse where technically possible;
- report independent evidence signals instead of claiming legal infringement;
- store publication URLs and dates;
- generate a downloadable evidence package;
- create a rights-holder/authorized-representative profile suitable for an IP complaint;
- record the claimant's legal basis for asserting rights and the scope of the claim;
- preserve component-level licenses/assignments/permissions where the final work contains third-party material;
- create a signed Creation/Registration Certificate for each protected asset;
- obtain an external trusted timestamp for evidence anchors where configured;
- provide a reviewer-facing verification page and offline verification instructions;
- expose the exact analysis algorithms, versions, thresholds, matched regions/segments, and calibration policy used for each conclusion;
- maintain immutable audit events;
- respect tenant isolation;
- use the existing SmartAIHub job control plane;
- support retries, lease/heartbeat, idempotency, progress reporting, and failure recovery;
- work for short 9:16 Vertical Drama episodes and longer videos;
- remain extensible to image and audio assets.

---

# 4. Non-Goals

Version 1 MUST NOT:

- claim that a match is a legal determination of copyright infringement;
- automatically file copyright takedowns to Facebook, Instagram, YouTube, TikTok, or other platforms;
- scrape social platforms in ways that violate platform terms;
- treat metadata alone as ownership proof;
- claim that invisible watermarks are impossible to remove;
- expose raw watermark codewords or signing secrets to end users;
- require a new vector database;
- create a new parallel queue/job table;
- delete or replace existing SmartAIHub Library, Media Studio, Video Editor, or Worker workflows.

Future platform connectors may automate reporting only when supported by official APIs and user authorization.

---

# 5. Product Naming

User-facing feature name:

**Content Protection**

Supporting terms:

- Protected Asset
- Provenance
- Verification
- Match Evidence
- Protection Case
- Evidence Package

Avoid using “Copyright Verified” as a status because the system cannot make a legal determination.

Recommended statuses:

- Protected
- Protected with warnings
- Verification passed
- High-confidence system match
- High similarity
- Possible match
- Inconclusive
- No match

---

# 6. High-Level Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                         SmartAIHub Web                        │
│                                                               │
│ Content Protection UI                                         │
│ Library Asset Protection Tab                                  │
│ Media Studio / Video Editor Export Protection Controls        │
│ Verification UI                                               │
│ Case / Evidence UI                                            │
└───────────────────────┬───────────────────────────────────────┘
                        │ Core API
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                      SmartAIHub Core API                       │
│                                                               │
│ ContentProtectionService                                      │
│ ProtectionProfileService                                      │
│ ProvenanceService                                             │
│ VerificationService                                           │
│ CaseService                                                   │
│ EvidencePackageService                                        │
│ KeyProvider / SigningService                                  │
│ PostgreSQL Source of Truth                                    │
│ R2 Object Storage                                             │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        │ existing worker_jobs / worker_job_events
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                 Unified Job Control Plane                      │
│                                                               │
│ lease / heartbeat / retry / idempotency / outbox / watchdog  │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                  SmartAIHub Desktop / Worker                   │
│                                                               │
│ Rust/Tauri Orchestrator                                       │
│ FFmpeg                                                        │
│ Python watermark sidecar                                      │
│   ├─ VideoSeal provider                                       │
│   └─ AudioSeal provider                                       │
│ Fingerprint providers                                         │
│   ├─ vPDQ                                                     │
│   ├─ TMK+PDQF (phase 2)                                       │
│   └─ Chromaprint                                              │
│ C2PA tooling / remote signer integration                      │
└───────────────────────────────────────────────────────────────┘
```

---

# 7. Server vs Worker Responsibility

## 7.1 SmartAIHub Web / Server

The server SHOULD handle:

- UI and user actions;
- authorization and RBAC;
- tenant scoping;
- asset registration;
- protection profile selection;
- job creation;
- job state display;
- provenance metadata;
- publication records;
- evidence/case management;
- watermark identity creation;
- generation of opaque watermark payload/codeword;
- secret/key management;
- C2PA remote signing;
- audit events;
- report/evidence rendering;
- R2 access control and signed URLs.

The server MUST NOT perform GPU-heavy watermark embedding if an eligible Worker is available.

## 7.2 Worker/Desktop

The Worker SHOULD handle:

- FFmpeg decode/encode;
- visible watermark compositing;
- invisible video watermark embedding;
- invisible video watermark detection;
- audio watermark embedding/detection;
- visual fingerprint generation;
- audio fingerprint generation;
- media QC;
- video similarity analysis;
- suspected-copy analysis;
- long-file streaming processing.

The Worker MUST NOT receive platform signing private keys.

The Worker MUST NOT receive the HMAC/master secret used to derive watermark identities.

---

# 8. Technology Baseline

Initial implementation SHOULD use provider interfaces so algorithms can be replaced without changing the Core API.

## 8.1 Invisible Video Watermark

Initial provider:

`VideoSealProvider`

Reference implementation:

- Meta `facebookresearch/videoseal`
- stable VideoSeal v1.0 supports a 256-bit message
- upstream project includes video inference and streaming inference
- MIT-licensed upstream implementation at the time this specification was written

Do not couple domain logic directly to VideoSeal. Use:

```text
VideoWatermarkProvider
  embed()
  detect()
  health()
  capabilities()
  version()
```

## 8.2 Invisible Audio Watermark

Initial provider:

`AudioSealProvider`

Reference implementation:

- Meta `facebookresearch/audioseal`
- localized audio watermarking
- upstream 16-bit message model
- streaming support exists in current upstream releases
- MIT license at the time this specification was written

Audio watermarking is supporting evidence only because the small message space can collide and audio is commonly replaced.

## 8.3 Video Fingerprinting

MVP:

- `vPDQProvider` for frame-based perceptual matching and partial overlap;
- optional `TMKPDQFProvider` for whole-video similarity.

Reference family:

`facebook/ThreatExchange`

Fingerprinting MUST be treated independently from invisible watermarking.

## 8.4 Audio Fingerprinting

Initial provider:

`ChromaprintProvider`

Chromaprint is appropriate for near-identical/duplicate audio detection. It MUST NOT be described as a universal audio similarity engine.

## 8.5 Provenance

Use C2PA-compatible tooling behind:

```text
ProvenanceSigner
  prepare_manifest()
  sign_manifest()
  verify_manifest()
```

Recommended implementation paths:

- Rust: `c2pa-rs`
- CLI fallback: `c2patool`

The production signer MUST be replaceable without changing asset records.

---

# 9. Protection Layers

A protected video can have the following layers:

```text
Layer A  Source master preserved
Layer B  Visible watermark (optional)
Layer C  Invisible video watermark
Layer D  Invisible audio watermark (optional)
Layer E  C2PA manifest
Layer F  SHA-256 of final distributed bytes
Layer G  Video perceptual fingerprints
Layer H  Audio fingerprint
Layer I  Production provenance records
Layer J  Publication records
```

Protection profiles determine which layers are required.

---

# 10. Required Media Processing Order

Order is important.

```text
SOURCE MASTER
   │
   ├─ preserve immutable original
   │
   ▼
COMPOUND / FINAL RENDER
   │
   ├─ resolve ordered source clips, trims, revisions, and source hashes
   ├─ produce a new immutable compound artifact/version
   │
   ▼
Visible watermark / branding overlay
   │
   ▼
Invisible VIDEO watermark
   │
   ▼
Invisible AUDIO watermark
   │
   ▼
Encode/mux protected essence
   │
   ▼
Immediate watermark self-verification
   │
   ▼
Quality-control gate
   │
   ▼
C2PA manifest/signature
   │
   ▼
FINAL PROTECTED DISTRIBUTION MASTER
   │
   ├─ SHA-256
   ├─ video fingerprints
   ├─ audio fingerprint
   └─ R2 upload / registration
```

C2PA signing MUST occur after all transformations that change the file.

No media modification may occur after C2PA signing unless a new provenance version is created.

Protection MUST be bound to the artifact that will actually be distributed or published. A child clip, editor preview, or subepisode MAY be protected earlier for reuse, but it MUST NOT satisfy the protection gate for a later production-group, trailer, or other compound output whose bytes are produced by a subsequent concat/render operation.

## 10.1 Current Codebase Binding (Normative)

The following is the current repository baseline for this specification. It is an integration contract, not a claim that the content-protection runtime already exists.

| Product flow | Current compound/render boundary | Existing control plane | Spec-201 binding |
|---|---|---|---|
| Web Video Editor export | `editorMediaJobs.submit` → `editor_video_render` → Worker `run_editor_nle_render` | `workerJobs` + `worker_job_outbox` | Add a protection intent to the render handoff and protect the final render output before publish/READY |
| Vertical Drama episode/subepisode | `verticalDramaAssembly.buildAndPersistAssemblyManifest` → `vertical_drama_ffmpeg_assembly` runner → `verticalDramaEpisodeVideoAssembly.runAssemblyJob` → `assemblyManifest.compiledVideo` | existing `worker_jobs`/outbox job plus assembly manifest persistence | Protect the compiled output after concat/re-encode and before `compiledVideo.status = completed` is publishable |
| Vertical Drama production group/trailer | same download/concat/upload machinery reused by production episode groups and trailers | assembly manifest and R2 artifact metadata | Bind protection to the final production unit, not only its child shot/subepisode outputs |

The existing `watermarkImages` / `finalRender.watermarkIncluded` path is a visible image overlay only. It MUST NOT be reported as an invisible ownership watermark, a self-verifiable codeword, or a completed Spec-201 protection record.

The current codebase does not yet contain the `content_protection.protect` executor, invisible watermark provider adapter, protection persistence model, or protected-publish gate. Implementers MUST reuse the canonical `worker_jobs` plus outbox control plane and MUST NOT create a second queue.

## 10.2 Compound/Combine Protection Contract (Normative)

Every compound operation that can create a publishable video MUST produce a durable `compoundArtifactEnvelope` before protection starts. Its protection intent MUST include `requireBeforePublish: true` for publishable outputs:

```json
{
  "contractVersion": "sah-compound-protection.v1",
  "compoundArtifactId": "opaque-id",
  "compoundKind": "editor_render | vertical_drama_episode | production_group | trailer",
  "tenantId": "server-derived-tenant-id",
  "projectId": "project-id-or-null",
  "assemblyRevision": "revision-or-null",
  "orderedInputs": [
    {
      "assetId": "asset-id",
      "sourceHash": "sha256:...",
      "sourceRevision": "revision-or-null",
      "trimInMs": 0,
      "trimOutMs": 1000,
      "timelineIndex": 0
    }
  ],
  "compoundPlanDigest": "sha256:canonical-plan",
  "preProtectionArtifact": {
    "storageKey": "immutable-pre-protection-key",
    "sha256": "sha256:..."
  },
  "protectionIntent": {
    "profileId": "profile-id",
    "publicAssetId": "public-id",
    "requireBeforePublish": true,
    "requiredLayers": ["video_watermark", "self_verify", "fingerprint", "c2pa"]
  }
}
```

The envelope MUST be canonicalized and hashed. The digest MUST cover ordered inputs, trims, timeline positions, project/assembly revision, render settings, and the pre-protection artifact hash. Missing source hashes, missing ordering, or a stale revision MUST fail closed before protection.

The durable relationship MUST be recorded in existing job/artifact metadata using `causalJobId`, `compoundArtifactId`, `compoundPlanDigest`, and `sourceAssetIds`. The first implementation MAY carry these fields in `worker_jobs.inputJson` / `instructionsJson` and the artifact/provenance record; it MUST NOT invent an unrelated queue or an untraceable side job.

The required state transition is:

```text
COMPOUND_READY
  → PROTECTION_REQUESTED
  → PROTECTION_SELF_VERIFIED
  → PROTECTION_QC_PASSED
  → C2PA_SIGNED (when enabled)
  → PROTECTED_ARTIFACT_READY
  → PUBLISHABLE
```

`PUBLISHABLE`, `compiledVideo.status = completed`, and the editor export success state MUST be blocked when required protection is missing, stale, failed, or not causally linked to the exact compound artifact. Re-running the same compound/protection intent MUST be idempotent and MUST produce at most one active protected version for the same input digest and profile; a changed compound digest MUST create a new version and invalidate the old publish eligibility.

The protected artifact record MUST retain the final protected SHA-256, recovered watermark result, detector/provider/policy versions, fingerprint references, C2PA verification result, source hash list, compound plan digest, causal job ID, tenant ID, and creation timestamp. This is evidence of technical provenance; it MUST NOT be presented as conclusive legal ownership by itself.

---

# 11. Asset Identity and Invisible Watermark Identity

The watermark MUST NOT embed:

- raw user ID;
- email address;
- tenant name;
- project name;
- database primary key;
- personal information.

Create two IDs:

```text
internal_protected_asset_id = database UUID
public_asset_id             = cryptographically random public identifier
```

`public_asset_id` is safe to disclose in evidence reports and reviewer links. It MUST NOT be directly reversible to a user or tenant.

## 11.1 Public-Verifiable Image/Video Watermark Message

For the primary reviewer-verifiable mode, the expected watermark message MUST be reproducible from public evidence rather than requiring a SmartAIHub secret.

Before embedding, create a signed `creation_anchor` (Section 93) and calculate:

```text
media_watermark_message =
  SHA256(
    "SAH-PUBLIC-WM-V2" ||
    public_asset_id ||
    creation_anchor_digest
  )
```

The 256-bit digest can be embedded by VideoSeal/PixelSeal-compatible providers.

Advantages:

- a third-party reviewer can derive the expected message from the signed Creation Certificate;
- SmartAIHub does not have to reveal a secret HMAC key;
- the recovered message can be compared bit-for-bit or by error-tolerant agreement;
- the watermark remains free of personal information.

Security limitation:

The message is intentionally public and therefore may be replayed by an attacker who has access to a compatible embedder. For this reason a watermark match MUST NEVER be treated as standalone ownership proof. It must be combined with the earlier trusted timestamp, original hash/fingerprint, production provenance, publication records, and temporal/visual/audio match evidence.

## 11.2 Optional Private Watermark Mode

A tenant MAY additionally enable a private anti-enumeration watermark:

```text
private_watermark_message =
  HMAC-SHA256(
    active_watermark_secret,
    "SAH-PRIVATE-WM-V1" || public_asset_id || creation_anchor_digest
  )
```

This mode is useful for internal forensic checks, but the public-verifiable watermark remains the recommended mode for evidence intended for external platform review.

The raw application secret MUST remain server-side.

## 11.3 Strong Public Payload — Optional 1024-bit Mode

After benchmark validation, a high-capacity provider such as ChunkySeal MAY be used to embed a compact signed payload containing:

```text
format/version
public_asset_id
creation_anchor_digest prefix
signing_key_id
trusted timestamp reference
digital signature
error-detection bytes
```

This is OPTIONAL and MUST NOT become the default until SmartAIHub benchmark data demonstrates acceptable robustness after common social-platform transformations.

## 11.4 Audio Tag

Audio watermark payload capacity is smaller and MUST be treated as corroborating evidence.

Generate an externally reproducible tag:

```text
audio_tag =
  Trunc16(
    SHA256(
      "SAH-PUBLIC-AUDIO-WM-V1" ||
      public_asset_id ||
      creation_anchor_digest
    )
  )
```

The tag is intentionally public.

A 16-bit match has a material collision risk and MUST NOT be used as unique ownership proof. The report MUST combine it with audio fingerprinting, exact hashes, trusted timestamp/provenance, and other media signals.

---

# 12. Watermark Detection Strategy

## 12.1 Verification Against a Known Original

When the user selects an original protected asset:

1. Core loads the expected protected asset.
2. Core decrypts/derives the expected video watermark codeword.
3. The job receives only the expected codeword, not the master secret.
4. Worker extracts detector output from the suspicious copy.
5. Worker computes:
   - watermark presence score;
   - bit agreement;
   - Hamming distance;
   - segment-level detections;
   - surviving time ranges.
6. Worker calculates fingerprints.
7. Core merges independent evidence.

## 12.2 Search Across User's Protected Assets

Do NOT brute-force every watermark first.

Use this candidate pipeline:

```text
Suspected video
      │
      ├─ vPDQ / TMK fingerprints
      │
      ▼
Candidate protected assets
      │
      ├─ retrieve expected watermark codewords
      │
      ▼
Watermark comparison against candidates
      │
      ├─ audio fingerprint
      ├─ audio watermark
      └─ temporal overlap analysis
```

This avoids requiring a dedicated watermark-code vector database.

---

# 13. Detection Result Must Be Multi-Signal

A verification record MUST keep independent values.

Example:

```json
{
  "result": "HIGH_CONFIDENCE_SYSTEM_MATCH",
  "candidate_asset_id": "uuid",
  "signals": {
    "exact_sha256": false,
    "video_watermark_present": true,
    "video_watermark_bit_agreement": 0.947,
    "video_fingerprint_similarity": 0.962,
    "matched_video_duration_ratio": 0.88,
    "audio_watermark_present": true,
    "audio_tag_match": true,
    "audio_fingerprint_similarity": 0.91,
    "c2pa_manifest_present": false
  }
}
```

Never collapse all evidence into a single unexplained number.

---

# 14. Match Classification

Use these labels:

### CONFIRMED_EXACT_FILE

Final SHA-256 is identical.

This proves byte identity, not legal ownership.

### HIGH_CONFIDENCE_SYSTEM_MATCH

Strong system evidence indicates that the suspicious media derives from the registered protected asset.

Example conditions may include:

- strong visual fingerprint overlap; AND
- matching invisible video watermark; OR
- multiple independent strong signals.

### HIGH_SIMILARITY

Strong visual or audio similarity, but insufficient watermark evidence.

### POSSIBLE_MATCH

Some signals agree but confidence is not high enough.

### INCONCLUSIVE

Media is too short, too damaged, too transformed, or evidence conflicts.

### NO_MATCH

No meaningful match was detected against the tested asset/candidate set.

Thresholds MUST be versioned and calibrated using a benchmark corpus. They MUST NOT be hard-coded throughout application code.

---

# 15. Protection Profiles

Create system presets.

## 15.1 Standard — Default

Recommended for normal Vertical Drama / social video.

```text
visible_watermark       optional
video_watermark         required
audio_watermark         enabled when audio exists
video_fingerprint       required
audio_fingerprint       enabled when audio exists
c2pa                     enabled
preserve_source_master   required
self_verify              required
```

## 15.2 Strong

For high-value episodes/advertising.

```text
visible_watermark       recommended
video_watermark         stronger provider profile
audio_watermark         required when audio exists
video_fingerprint       required
audio_fingerprint       required
c2pa                     required
preserve_source_master   required
self_verify              required
enhanced attack QC       enabled
```

## 15.3 Provenance Only

For assets where invisible watermark processing is not desired.

```text
video_watermark         off
audio_watermark         off
fingerprints             on
c2pa                     on
hashes                   on
source master            on
```

## 15.4 Custom

Only users with permission `content_protection.profile.customize` may modify advanced parameters.

Raw algorithm parameters SHOULD NOT be exposed to ordinary users.

---

# 16. Visible Watermark

Visible watermark is optional and separate from invisible watermarking.

Supported configuration:

- text;
- logo asset;
- series title;
- episode ID;
- short protection ID;
- position;
- safe margin;
- opacity;
- size;
- static or time-varying placement.

Recommended SmartAIHub mode:

```text
{brand_name} · {series_code} · {episode_code}
```

Do not expose full internal UUIDs.

For anti-crop use, allow a “Dynamic Position” preset that moves at defined intervals.

---

# 17. Quality Control

Every protected asset MUST pass automatic QC before status `READY`.

## 17.1 Video QC

Required checks:

- decode succeeds;
- duration delta within tolerance;
- FPS valid;
- dimensions valid;
- no unexpected black frames introduced;
- no severe A/V drift;
- watermark presence detected;
- expected watermark similarity above self-verification threshold;
- file opens with ffprobe;
- C2PA validation passes when required;
- optional VMAF comparison against pre-watermark distribution master.

Do not use a universal VMAF threshold without calibration.

Initial product default MAY start at a configurable target such as:

```text
minimum_vmaf_target = 93
```

but it MUST remain configurable and SHOULD be validated on SmartAIHub's real content corpus before enforcing it globally.

## 17.2 Audio QC

Check:

- channel count;
- sample rate;
- duration;
- peak clipping;
- loudness delta;
- audio watermark self-detection;
- A/V sync.

---

# 18. Robustness Benchmark

Before enabling protection by default, create a repeatable benchmark suite.

Test corpus MUST include:

- 9:16 1080x1920 Vertical Drama;
- human close-ups;
- fast action;
- dark scenes;
- bright scenes;
- animation/AI images;
- heavy subtitles;
- 10-second clips;
- 30-second clips;
- 3–10 minute videos.

Transformation matrix:

- H.264 re-encode;
- H.265 re-encode;
- bitrate reduction;
- 1080p → 720p;
- 1080p → 540p;
- crop 5%;
- crop 10%;
- crop 20%;
- letterbox/pillarbox;
- overlay another logo;
- new subtitles;
- brightness/contrast adjustment;
- small color shift;
- FPS conversion;
- partial clip extraction;
- start/end trimming;
- social-platform-like transcoding;
- audio AAC re-encode;
- audio resampling;
- volume change;
- moderate noise;
- mono conversion.

For each provider/version record:

- watermark detection rate;
- bit agreement;
- fingerprint similarity;
- false-positive rate;
- processing time;
- GPU/CPU memory;
- output quality metrics.

Threshold changes require a new detector-policy version.

---

# 19. Worker Capability Model

Add worker capabilities:

```text
content_protection.ffmpeg
content_protection.videoseal
content_protection.audioseal
content_protection.vpdq
content_protection.tmk
content_protection.chromaprint
content_protection.c2pa
```

Worker registration MUST report:

```json
{
  "capabilities": {
    "content_protection.videoseal": {
      "version": "provider-version",
      "gpu": true,
      "streaming": true
    }
  }
}
```

Job router MUST select a compatible Worker.

No separate “Protection Worker” queue architecture should be created.

---

# 20. Job Types

Use the existing `worker_jobs` table and `worker_job_events`.

Add logical job types:

```text
content_protection.protect
content_protection.verify
content_protection.fingerprint
content_protection.reprotect
content_protection.evidence_prepare
```

Evidence PDF/ZIP rendering can remain server-side if it does not require heavy media processing.

---

# 21. Protection Job State Machine

```text
REQUESTED
  ↓
QUEUED
  ↓
LEASED
  ↓
PREPARING_INPUT
  ↓
VISIBLE_MARK
  ↓
VIDEO_WATERMARK
  ↓
AUDIO_WATERMARK
  ↓
ENCODING
  ↓
SELF_VERIFY
  ↓
QUALITY_CHECK
  ↓
C2PA_SIGNING
  ↓
FINGERPRINTING
  ↓
UPLOADING
  ↓
FINALIZING
  ↓
READY
```

Alternative terminal states:

```text
READY_WITH_WARNINGS
FAILED_RETRYABLE
FAILED_FINAL
CANCELLED
```

Progress events MUST be visible in the existing global job UI.

---

# 22. Idempotency

Protection operation idempotency key:

```text
SHA256(
  tenant_id ||
  source_asset_version_id ||
  protection_profile_version ||
  export_settings_hash
)
```

If the same request completes successfully, return the existing result unless `force_new_version=true`.

Never overwrite an earlier evidence-bearing protected version.

Create a new version.

---

# 23. Retry Rules

Examples:

### Retryable

- Worker disconnected;
- R2 upload transient failure;
- temporary file I/O;
- GPU OOM if lower-memory streaming fallback exists;
- temporary signing-service unavailable.

### Non-Retryable

- unsupported codec after normalization failed;
- corrupt media;
- missing source object;
- tenant authorization revoked;
- invalid protection profile.

All retries MUST obey existing job retry policy and idempotency.

---

# 24. Streaming Requirement

Watermark processing MUST support streaming/chunked processing.

Rule:

```text
short videos:
  normal or streaming path allowed

videos over configurable threshold:
  streaming required
```

Do not load long-form videos entirely into RAM.

Initial threshold can be based on duration/file size and tuned by benchmark.

---

# 25. Database Model

Use PostgreSQL as source of truth.

Do not duplicate worker job tables.

## 25.1 `content_protection_assets`

```sql
id uuid primary key
tenant_id uuid not null
owner_user_id uuid not null
source_library_asset_id uuid not null
source_asset_version_id uuid not null

asset_type varchar not null
protection_version int not null
profile_id uuid not null
profile_version int not null

status varchar not null

source_master_object_key text not null
protected_master_object_key text null

source_sha256 char(64) null
protected_sha256 char(64) null

duration_ms bigint null
width int null
height int null
fps numeric null
video_codec varchar null
audio_codec varchar null

created_at timestamptz not null
protected_at timestamptz null
deleted_at timestamptz null
```

Indexes:

```text
tenant_id + created_at
tenant_id + status
source_library_asset_id
source_asset_version_id
protected_sha256
```

---

## 25.2 `content_protection_watermarks`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null

channel varchar not null
provider varchar not null
provider_version varchar not null

watermark_id uuid not null
key_version varchar not null

video_codeword_encrypted bytea null
audio_tag_encrypted bytea null

embed_settings jsonb not null
self_verify_metrics jsonb null

created_at timestamptz not null
```

Never return encrypted/raw codeword data to normal API clients.

---

## 25.3 `content_protection_fingerprints`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null

fingerprint_type varchar not null
provider varchar not null
provider_version varchar not null

signature_object_key text null
signature_summary jsonb null
signature_sha256 char(64) not null

created_at timestamptz not null
```

Large TMK/vPDQ artifacts SHOULD live in R2.

---

## 25.4 `content_provenance_manifests`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null

standard varchar not null
standard_version varchar null
signer_provider varchar not null
signing_key_version varchar not null

manifest_object_key text not null
manifest_sha256 char(64) not null
validation_status varchar not null
validation_details jsonb null

created_at timestamptz not null
```

---

## 25.5 `content_publications`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null

platform varchar not null
publication_url text not null
external_post_id text null
publication_type varchar not null

published_at timestamptz null
registered_at timestamptz not null

is_original_publication boolean not null default true
notes text null
```

Supported platform enum initially:

```text
facebook
instagram
youtube
tiktok
x
website
other
```

---

## 25.6 `content_verification_runs`

```sql
id uuid primary key
tenant_id uuid not null
requested_by uuid not null

input_source_type varchar not null
input_object_key text not null
input_sha256 char(64) not null

compare_mode varchar not null
selected_protected_asset_id uuid null

status varchar not null
detector_policy_version varchar not null

job_id uuid null

started_at timestamptz null
completed_at timestamptz null
created_at timestamptz not null
```

`compare_mode`:

```text
SELECTED_ASSET
SEARCH_MY_PROTECTED_ASSETS
```

---

## 25.7 `content_verification_matches`

```sql
id uuid primary key
tenant_id uuid not null
verification_run_id uuid not null
protected_asset_id uuid not null

rank int not null
classification varchar not null

exact_hash_match boolean not null
video_watermark_score numeric null
video_watermark_presence numeric null
video_fingerprint_score numeric null
matched_duration_ratio numeric null
audio_watermark_score numeric null
audio_fingerprint_score numeric null
c2pa_status varchar null

matched_segments jsonb null
signals jsonb not null
explanation jsonb not null

created_at timestamptz not null
```

---

## 25.8 `content_protection_cases`

```sql
id uuid primary key
tenant_id uuid not null
created_by uuid not null

protected_asset_id uuid not null
verification_run_id uuid null

platform varchar null
original_url text null
suspected_url text null

title text not null
status varchar not null

claimant_name text null
claimant_role text null
notes text null

created_at timestamptz not null
updated_at timestamptz not null
closed_at timestamptz null
```

Case status:

```text
DRAFT
EVIDENCE_READY
SUBMITTED_EXTERNALLY
UNDER_REVIEW
RESOLVED
REJECTED
CLOSED
```

`SUBMITTED_EXTERNALLY` is manually set in V1.

---

## 25.9 `content_evidence_packages`

```sql
id uuid primary key
tenant_id uuid not null
case_id uuid not null

format_version varchar not null
bundle_object_key text not null
bundle_sha256 char(64) not null

report_pdf_object_key text null
report_json_object_key text not null

signed_manifest_object_key text not null
signing_key_version varchar not null

created_by uuid not null
created_at timestamptz not null
```

---

## 25.10 `content_protection_events`

Append-only audit events.

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid null
verification_run_id uuid null
case_id uuid null

actor_type varchar not null
actor_id uuid null
event_type varchar not null
event_data jsonb not null

created_at timestamptz not null
```

Do not update historical event rows.

---

# 26. Object Storage Layout

Recommended R2 keys:

```text
content-protection/
  {tenant_id}/
    assets/
      {protected_asset_id}/
        source/
          master.ext
        protected/
          v{protection_version}/master.mp4
        fingerprints/
          vpdq.bin
          tmk.bin
          chromaprint.json
        provenance/
          c2pa-manifest.bin
        qc/
          qc-report.json
    verification/
      {verification_run_id}/
        suspect-original.ext
        analysis.json
        previews/
    cases/
      {case_id}/
        evidence/
          {evidence_package_id}/
            evidence.zip
            report.pdf
            report.json
            manifest.json
            manifest.sig
```

Objects MUST be private by default.

UI downloads use expiring signed URLs.

---

# 27. Key Management

Create abstraction:

```text
KeyProvider
  current_key_version(purpose)
  hmac(purpose, bytes)
  encrypt(purpose, bytes)
  decrypt(purpose, ciphertext)
  sign(purpose, digest)
```

Purposes:

```text
watermark_derivation
watermark_storage
evidence_signing
c2pa_signing
```

Initial Debian deployment MAY use encrypted server-side secrets, but implementation MUST allow later migration to managed secret/KMS infrastructure without rewriting business logic.

Requirements:

- key version stored with every derived artifact;
- key rotation supported;
- old keys retained for verification according to retention policy;
- raw keys never logged;
- raw keys never returned to browser;
- raw keys never sent to Desktop Worker.

---

# 28. C2PA Design

Create a manifest after the protected file is finalized.

Minimum assertions/metadata SHOULD include:

```text
SmartAIHub protected asset identifier
protection format version
creation/protection timestamp
application name/version
source asset reference (opaque)
protection methods applied
```

A custom namespace MAY be used:

```text
com.smartaihub.content-protection
```

Do not store watermark codeword or secret material inside C2PA.

Example custom data:

```json
{
  "protection_version": 1,
  "protected_asset_id": "opaque-public-id",
  "watermark_id": "opaque-public-watermark-id",
  "video_watermark_provider": "videoseal",
  "audio_watermark": true,
  "fingerprint_set_version": "v1"
}
```

Production trust MUST support replacement of a development/self-signed signer with an appropriate production credential.

UI MUST distinguish:

```text
Manifest valid
Manifest invalid
Manifest absent
Signer trusted
Signer untrusted/unknown
```

Do not display “verified owner” solely because a C2PA manifest exists.

---

# 29. Production Provenance

Protected assets SHOULD link to existing SmartAIHub production data where available:

- tenant;
- project;
- series;
- season;
- episode;
- scene/shot lineage;
- script revision;
- storyboard revision;
- source image references;
- source audio references;
- source video references;
- generation provider;
- model;
- provider job ID;
- render job ID;
- editor project/timeline version;
- creator/user;
- creation timestamps;
- export settings.

Do not duplicate these entities. Store references/snapshots as appropriate.

Evidence generation should include a stable provenance snapshot so later editing of the project does not change historical evidence.

---

# 30. API Design

Base route:

```text
/v1/content-protection
```

## 30.1 Protect Existing Asset

```http
POST /v1/content-protection/protect
```

Request:

```json
{
  "source_asset_version_id": "uuid",
  "profile_id": "uuid",
  "visible_watermark": {
    "enabled": true,
    "preset": "brand_episode"
  },
  "force_new_version": false
}
```

Response:

```json
{
  "protected_asset_id": "uuid",
  "job_id": "uuid",
  "status": "QUEUED"
}
```

---

## 30.2 Get Protected Assets

```http
GET /v1/content-protection/assets
```

Filters:

```text
status
asset_type
project_id
series_id
created_from
created_to
q
cursor
limit
```

---

## 30.3 Get Protected Asset

```http
GET /v1/content-protection/assets/{id}
```

Return user-safe protection details.

Never return secret codeword.

---

## 30.4 Register Publication

```http
POST /v1/content-protection/assets/{id}/publications
```

Request:

```json
{
  "platform": "facebook",
  "publication_url": "https://...",
  "external_post_id": null,
  "published_at": "2026-09-14T01:20:00Z",
  "is_original_publication": true
}
```

---

## 30.5 Create Verification

```http
POST /v1/content-protection/verifications
```

Input must be either:

- uploaded file;
- existing Library asset;
- authorized connector/media reference.

Example:

```json
{
  "input_asset_id": "uuid",
  "compare_mode": "SEARCH_MY_PROTECTED_ASSETS",
  "selected_protected_asset_id": null
}
```

Response:

```json
{
  "verification_id": "uuid",
  "job_id": "uuid",
  "status": "QUEUED"
}
```

---

## 30.6 Verification Result

```http
GET /v1/content-protection/verifications/{id}
```

Returns ranked match candidates and signal details.

---

## 30.7 Create Case

```http
POST /v1/content-protection/cases
```

```json
{
  "protected_asset_id": "uuid",
  "verification_run_id": "uuid",
  "platform": "facebook",
  "original_url": "https://...",
  "suspected_url": "https://...",
  "title": "Suspected copy of EP017"
}
```

---

## 30.8 Generate Evidence Package

```http
POST /v1/content-protection/cases/{id}/evidence
```

Response:

```json
{
  "evidence_package_id": "uuid",
  "status": "GENERATING"
}
```

---

## 30.9 Protection Settings

```http
GET  /v1/content-protection/settings
PATCH /v1/content-protection/settings
```

---

# 31. Uploading a Suspected Copy

V1 SHOULD support:

1. Upload local video.
2. Select existing Library video.

Optional later:

3. Import through an authorized platform/storage connector.

A pasted Facebook/TikTok/YouTube URL MUST NOT automatically trigger scraping unless SmartAIHub has a permitted integration for that platform.

The URL may still be stored as case metadata.

---

# 32. Verification Job

Worker stages:

```text
INGEST
  ↓
HASH_INPUT
  ↓
PROBE_MEDIA
  ↓
VIDEO_FINGERPRINT
  ↓
AUDIO_FINGERPRINT
  ↓
CANDIDATE_SEARCH
  ↓
VIDEO_WATERMARK_DETECT
  ↓
AUDIO_WATERMARK_DETECT
  ↓
SEGMENT_ALIGNMENT
  ↓
C2PA_INSPECT
  ↓
RESULT_BUILD
  ↓
COMPLETE
```

The raw suspicious file hash MUST be computed immediately at ingest.

The original uploaded bytes SHOULD be preserved for the configured case retention period.

---

# 33. Partial Clip Matching

The system SHOULD detect cases such as:

```text
Original episode: 30 sec
Stolen clip:      sec 08–21
```

Verification result SHOULD return:

```json
{
  "matched_segments": [
    {
      "original_start_ms": 8000,
      "original_end_ms": 21100,
      "suspect_start_ms": 0,
      "suspect_end_ms": 13100,
      "visual_similarity": 0.95
    }
  ]
}
```

UI should visualize overlap on two timelines.

---

# 34. Evidence Package

Evidence package ZIP:

```text
README.txt
REVIEWER-INSTRUCTIONS.pdf
report.pdf
report.json

certificate/
  creation-registration-certificate.json
  creation-registration-certificate.sig
  trusted-timestamp.tsr
  signer-public-key.json
  transparency-proof.json

rights/
  rights-claim.json
  rights-holder-summary.pdf
  claim-scope.json
  component-rights-matrix.json
  supporting-document-index.json
  authorization-summary.pdf            # when filed by representative

original/
  protected-asset-summary.json
  source-master-sha256.txt
  protected-master-sha256.txt
  provenance-summary.json
  generation-receipts.json
  publication-history.json
  c2pa-verification.json
  image-pdq.json                        # image when applicable
  video-vpdq-summary.json               # video when applicable
  audio-fingerprint-summary.json        # audio/video when applicable
  thumbnails-or-waveform/

suspected/
  source-summary.json
  sha256.txt
  media-info.json
  c2pa-verification.json
  thumbnails-or-waveform/

comparison/
  verification-result.json
  verification-procedure.json
  detector-policy.json
  matched-regions.json                  # image
  matched-segments.json                 # audio/video
  watermark-analysis.json
  image-fingerprint-analysis.json
  video-fingerprint-analysis.json
  audio-fingerprint-analysis.json
  visual-comparison-contact-sheet.pdf
  audio-comparison-summary.pdf

integrity/
  manifest.json
  manifest.sig
  bundle-sha256.txt

audit/
  chain-of-custody.json
  relevant-events.json
```

`verification-procedure.json` MUST state exactly how every technical result was produced:

```text
tool/provider
tool version / model version
input SHA-256
normalization steps
algorithm parameters
threshold policy version
observed score
decision threshold
matched region/segment
known limitations
benchmark/calibration reference
```

The package MUST be understandable without access to SmartAIHub's internal database.

Do not include original full-resolution master by default because it can unnecessarily enlarge the package.

Provide optional checkbox:

`Include source/protected master files`

Only authorized owners/admins may include them.

---

# 35. Evidence Report PDF

Human-readable report sections:

1. Case summary
2. Claimant-provided information
3. Original protected asset
4. Original creation/protection timeline
5. Original publication history
6. Suspicious copy details
7. Exact hash result
8. Invisible video watermark result
9. Video fingerprint comparison
10. Audio evidence
11. C2PA/provenance findings
12. Matched timeline segments
13. System audit trail
14. Technical limitations
15. Evidence package hash/signature
16. Rights-holder identity and claimant capacity
17. Claim scope and component-rights matrix
18. Creation/Registration Certificate
19. External trusted timestamp evidence
20. Reproduction/verification instructions
21. Tool/provider versions and detector policy
22. Platform-specific complaint field mapping
23. Reviewer link / QR code, when enabled

Required disclaimer:

> SmartAIHub reports technical evidence and similarity findings. The report is not a legal determination of copyright ownership or infringement.

---

# 36. Evidence Package Integrity

Generate:

```text
bundle_sha256
```

Then sign a canonical manifest of package contents.

Example:

```json
{
  "format": "sah-evidence-v1",
  "case_id": "public-case-id",
  "generated_at": "...",
  "files": [
    {
      "path": "report.pdf",
      "sha256": "..."
    }
  ]
}
```

Sign the manifest using the evidence signing provider.

This allows later verification that evidence files were not modified after generation.

---

# 37. UI / UX — Navigation

Add one new top-level workspace:

**Content Protection**

Do not create separate duplicate screens for jobs or media files.

Recommended left navigation:

```text
Content Protection
  ├─ Overview
  ├─ Protected Assets
  ├─ Verify Copy
  ├─ Cases
  └─ Settings
```

The existing global job/activity UI remains the job progress surface.

## 37.1 Dashboard and Quick-Link Access Contract (Normative)

The implementation MUST make Content Protection reachable from the authenticated Dashboard on both web and desktop layouts. The shared menu registry is the source of truth; a page that is reachable only by typing a URL is not considered complete.

Add one shared main-menu item:

```text
id: content-protection
label: Content Protection
labelTh: การคุ้มครองสิทธิ์และหลักฐาน
path: /content-protection
group: main
requiresFeature: contentProtectionEnabled
```

The Dashboard MUST expose these quick links when the user has the corresponding permission:

```text
Content Protection       → /content-protection
Protected Assets         → /content-protection/assets
Verify Suspected Copy    → /content-protection/verify
```

The Dashboard MAY also show a compact status card with counts for Protected, Processing, Warning, Failed, and Not Protected assets. Quick links MUST remain available on mobile and desktop, use Thai/English translations, and preserve deep-link query/state where applicable.

The route matrix is:

| Route | Surface | Guard | Required permission |
|---|---|---|---|
| `/content-protection` | Overview | authenticated + tenant-scoped | `content_protection.view` |
| `/content-protection/assets` | Protected Assets | authenticated + tenant-scoped | `content_protection.view` |
| `/content-protection/assets/{id}` | Asset Detail | authenticated + asset tenant | `content_protection.view` |
| `/content-protection/assets/{id}/rights` | Rights & Ownership | authenticated + asset tenant | `content_protection.view` / `content_protection.protect` |
| `/content-protection/assets/{id}/certificate` | Creation Certificate | authenticated + asset tenant | `content_protection.view` |
| `/content-protection/verify` | Verify Copy | authenticated + tenant-scoped | `content_protection.verify` |
| `/content-protection/verifications/{id}` | Verification Result | authenticated + owner/tenant policy | `content_protection.verify` |
| `/content-protection/cases` | Cases | authenticated + tenant-scoped | `content_protection.case.manage` |
| `/content-protection/cases/{id}` | Case Detail | authenticated + case tenant | `content_protection.case.manage` |
| `/settings?section=contentProtection` | User Protection Settings | authenticated | `content_protection.view` |
| `/evidence-review/{public_case_id}?token=...` | External Reviewer | scoped public token | no tenant browsing; case token only |

`App.tsx`, the shared menu registry, Dashboard quick actions, and the server permission checks MUST all agree on these paths. Hiding a menu item is not an authorization boundary.

---

# 38. UI — Content Protection Overview

Route:

```text
/content-protection
```

Header:

```text
Content Protection
Protect, verify, and document the provenance of your media.
```

Primary actions:

```text
[ Protect an Asset ]
[ Verify Suspected Copy ]
```

Summary cards:

```text
Protected Assets
Verifications
High-confidence Matches
Open Cases
Protection Failures
```

Recent activity panel:

```text
EP017 protected successfully
EP018 protection failed: worker disconnected
Verification #V-102 found high-confidence match
Evidence package generated for Case #C-32
```

Protection health panel:

```text
Video watermark runtime       Ready
Audio watermark runtime       Ready
Fingerprint runtime           Ready
C2PA signer                   Ready
Eligible Workers              2
```

---

# 39. UI — Protected Assets List

Route:

```text
/content-protection/assets
```

Columns/cards:

```text
Thumbnail
Asset / Episode
Project / Series
Protection Status
Video Watermark
Audio Watermark
Fingerprint
C2PA
Original Publication
Protected At
Actions
```

Actions:

```text
View
Verify Copy
Add Publication
Generate Evidence
Re-protect
```

Filters:

```text
All
Protected
With warnings
Processing
Failed
Video
Project
Series
Date
```

Search should support title, episode code, project, and short asset ID.

---

# 40. UI — Protected Asset Detail

Route:

```text
/content-protection/assets/{id}
```

Header:

```text
EP017 — Protected
[ Verify Copy ] [ Add Publication ] [ More ]
```

Tabs:

```text
Summary
Protection
Rights & Ownership
Provenance
Publications
Files
Activity
```

## Summary

Show:

- preview;
- project/series/episode;
- source master;
- protected master;
- protection date;
- original publication;
- protection profile.

Protection badges:

```text
✓ Video watermark
✓ Audio watermark
✓ Video fingerprint
✓ Audio fingerprint
✓ C2PA
✓ Source master preserved
```

## Protection

Detailed technical status:

```text
Video watermark
Provider: VideoSeal
Provider version: ...
Self-verification: Passed
Detection quality: 98.6%
Protection ID: CP-7F32A91C
```

Do NOT show raw message/codeword.

## Provenance

Timeline view:

```text
Script revision
    ↓
Storyboard revision
    ↓
Generation jobs
    ↓
Video editor project
    ↓
Final render
    ↓
Protection job
    ↓
Published
```

## Publications

List original/publication records.

## Files

Provide controlled downloads:

- source master;
- protected master;
- report JSON;
- provenance manifest.

## Activity

Append-only protection and case audit trail.

## 40.1 Image Asset Detail

For image assets, the same detail page MUST replace video-only fields with image-appropriate evidence:

```text
Image preview
Image SHA-256
Image invisible watermark status
PDQ fingerprint / Hamming distance
Crop/resize alignment
Matched-region visualization
C2PA status
Creation/Registration Certificate
Rights & Ownership
```

The page MUST distinguish a standalone protected image from an image that was only used as an input to a later video compound. Protecting the input image does not satisfy the protection gate for the final video.

---

# 41. UI — Library Integration

Do not require creators to open Content Protection for routine work.

Existing Library asset detail MUST gain a new tab/section:

```text
Protection
```

Library thumbnail/card MAY show a shield badge:

```text
Shield check     Protected
Shield warning   Protected with warning
Shield clock     Processing
No shield        Not protected
```

Context menu:

```text
Protect asset
View protection
Verify copy
```

---

# 42. UI — Media Studio Integration

At final export/publish step add:

```text
Content Protection
[✓] Protect this export
```

When expanded:

```text
Protection profile
(•) Standard
( ) Strong
( ) Provenance only
( ) Custom

Visible watermark
[ ] Add brand watermark

[ Protection details ]
```

Default comes from tenant Content Protection settings.

Protection MUST run after the media export is finalized.

## 42.1 Image Export / Asset Integration

When Media Studio creates or exports an image, the user MUST see the same protection choice and status contract as for video:

```text
Digital ownership watermark
[ ON / OFF ]

Image protection profile
Standard
```

For a standalone image, the watermark is created after the final image transform/export and before the protected image is marked ready. Supported image evidence includes exact SHA-256, PixelSeal/VideoSeal image-mode detection, PDQ, crop/resize alignment, C2PA, and provenance.

When an image is later used inside a video compound, the final video MUST receive its own post-compound video protection. An image watermark on an input frame MUST NOT be treated as a watermark on the resulting video.

## 42.2 Digital Watermark User Choice and Visible Status (Normative)

The effective choice is resolved as:

```text
effectiveDigitalWatermarkChoice = perExportChoice ?? userDefaultChoice
```

The user MUST be able to override the choice for every protect/export/compound operation. Admin or tenant settings MAY provide a default profile and provider availability, but the UI MUST NOT silently change the user's explicit per-operation choice.

When enabled, the UI MUST show:

```text
Digital watermark: ON
Purpose: technical provenance and copy verification
Creation point: after final image export or final video compound
Verification: self-detect before Protected/Ready
```

When disabled, the UI MUST show:

```text
Digital watermark: OFF — disabled by user
This output will not be marked as Protected and cannot use watermark evidence.
```

The user's choice and its source (`per_export`, `user_default`, or `disabled_by_user`) MUST be retained in the artifact/provenance record. `OFF` MUST produce an explicit `UNPROTECTED_BY_USER_CHOICE` status, not an ambiguous success state.

---

# 43. UI — Video Editor Integration

In export dialog:

```text
Export Video

Resolution       1080x1920
Codec            H.264
...

Content Protection
[✓] Protect exported video

Profile          Standard
Visible mark     Brand + Episode ID

[ Export ]
```

Export workflow:

```text
Render
  ↓
Protection job
  ↓
Protected asset ready
```

If user chooses:

`Require protection before publish`

the Publish action MUST wait for protection status `READY` or `READY_WITH_WARNINGS` according to policy.

The export result MUST state whether the exact final compound artifact is `PROTECTED`, `PROTECTED_WITH_WARNINGS`, or `UNPROTECTED_BY_USER_CHOICE`. The dialog MUST distinguish `Digital ownership watermark` from `Visible mark` and show the watermark creation/self-verification stages in the existing job progress surface.

---

# 44. UI — Verify Suspected Copy

Route:

```text
/content-protection/verify
```

Step 1 — Source

```text
Verify a Suspected Copy

How would you like to provide the suspicious media?

[ Upload Image ]
[ Upload Video ]
[ Upload Audio ]
[ Choose from Library ]
```

Optional URL field:

```text
Suspected post URL
[ https://... ]
```

Explain that V1 stores the URL as evidence metadata; the user still provides the media file unless an authorized connector is available.

Step 2 — Compare mode

```text
Compare against

(•) Search all my protected assets
( ) Select a specific original asset
```

Step 3 — Review

```text
Input media and type
Duration or dimensions
File hash
Platform URL
Compare mode

[ Start Verification ]
```

---

# 45. UI — Verification Progress

Route:

```text
/content-protection/verifications/{id}
```

Use the existing job-event stream.

Progress component:

```text
✓ File received
✓ Exact hash
✓ Video fingerprint
✓ Candidate search
● Invisible watermark analysis
○ Audio analysis
○ Timeline alignment
○ Final report
```

Provide Cancel where supported by current job framework.

---

# 46. UI — Verification Result

Top result:

```text
HIGH-CONFIDENCE SYSTEM MATCH

Suspected media appears to derive from:
คาเฟ่รีโนเวทเพื่อรัก — EP017
```

Important wording:

Do NOT say:

```text
"Copyright infringement confirmed"
```

Show evidence cards:

```text
Invisible video watermark
Strong match
94.7% message agreement

Visual fingerprint
Strong match
96.2% similarity

Matched duration
88%

Audio fingerprint
91%

C2PA
Not present in suspected copy
```

For image verification, show modality-specific evidence:

```text
Invisible image watermark
Recovered / not recovered
Message agreement

PDQ fingerprint
Hamming distance and policy threshold

Crop/resize alignment
Matched regions and inlier ratio

C2PA / original publication evidence
```

The result MUST always display the media type and MUST never use a video watermark result to imply that an image was protected, or vice versa.

Timeline visualization:

```text
ORIGINAL
00:00 ─────────████████████████──────── 00:30
               08.0s          21.1s

SUSPECT
00:00 █████████████████ 13.1s
```

Actions:

```text
[ Create Protection Case ]
[ Download Technical Result ]
[ Compare Another File ]
```

---

# 47. UI — No/Weak Match Result

Example:

```text
INCONCLUSIVE

The video is visually similar in several segments, but there is not
enough independent evidence for a high-confidence system match.
```

Show why:

```text
Video watermark        Not recovered
Visual fingerprint     72%
Audio                   Replaced
Matched duration        18%
```

Do not hide uncertainty.

---

# 48. UI — Cases

Route:

```text
/content-protection/cases
```

Columns:

```text
Case
Original Asset
Platform
Suspected URL
Evidence Status
Submission Status
Updated
```

Actions:

```text
Open
Generate Evidence
Mark Submitted
Resolve
Close
```

---

# 49. UI — Case Detail

Route:

```text
/content-protection/cases/{id}
```

Sections:

```text
Case Summary
Original Asset
Suspected Copy
Verification
Publication Timeline
Evidence Package
External Report Status
Notes
Activity
```

Primary actions:

```text
[ Generate Evidence Package ]
[ Mark as Submitted ]
[ Add Note ]
```

V1 does not submit to social platforms automatically.

When user manually submits a report, allow:

```text
Submission date
Platform case/reference number
Status
Notes
```

---

# 50. UI — Content Protection Settings

Route:

```text
/settings?section=contentProtection
```

`/settings/content-protection` MAY remain as a compatibility alias, but it MUST redirect to the canonical Settings tab rather than creating a second settings page.

Sections:

## Default Protection

```text
Default protection on export     ON/OFF
Default profile                  Standard
Require protection before publish ON/OFF
Preserve source master           ON
```

## Visible Branding

```text
Default logo
Default text template
Opacity
Placement
Dynamic placement
```

## Verification

```text
Default compare mode
Evidence retention period
Keep suspected source files
```

## Provenance

```text
C2PA enabled
Signer status
Credential status
```

## Advanced

Admin-only:

```text
Provider versions
Detector policy version
QC thresholds
Feature flags
```

Do not expose signing keys or raw watermark codewords.

---

# 51. UI — Protection Preset Dialog

Advanced parameters MUST be presented as meaningful product options, not ML internals.

Good:

```text
Watermark durability
Normal / High

Visual quality priority
Balanced / Maximum quality

Long-video mode
Automatic
```

Bad:

```text
scaling_w = 0.2
detector_threshold = 0.84372
```

Raw provider values belong in admin/developer diagnostics only.

---

# 52. RBAC

Permissions:

```text
content_protection.view
content_protection.protect
content_protection.verify
content_protection.case.create
content_protection.case.manage
content_protection.evidence.generate
content_protection.master.download
content_protection.settings.manage
content_protection.profile.customize
```

Suggested role mapping:

### Owner/Admin

All permissions.

### Editor

Protect, view, verify, create case.

### Reviewer

View, verify, manage case, generate evidence.

### Viewer

Read-only.

## 52.1 User Watermark-Control Invariant

`content_protection.protect` and `content_protection.verify` permissions control access to the capability; they do not silently turn the user's watermark choice on. Every user-facing export/compound surface MUST expose the effective choice and resulting protection status before completion.

The user may choose `ON` or `OFF` per operation. A user who chooses `OFF` may still use the media workflow, but the output MUST remain explicitly unprotected and the system MUST not issue a protected-asset claim, watermark evidence claim, or protected publish state for it.

---

# 53. Tenant Isolation

Every query MUST be scoped by `tenant_id`.

Protection data MUST NOT leak across tenants.

`SEARCH_MY_PROTECTED_ASSETS` means only assets belonging to the current authorized tenant.

If future platform-wide anti-copy matching is added, it requires a separate privacy/security design.

---

# 54. Worker Trust Boundary

Desktop Worker may run on a user-controlled computer.

Therefore:

- do not send server master secrets;
- do not send C2PA private keys;
- send short-lived signed job authorization;
- send only asset-scoped watermark codeword;
- signed URLs must have short expiry;
- temporary files should be removed after job completion;
- logs must not contain payload bytes or tokens;
- Worker must report output SHA-256;
- server validates uploaded object hash.

---

# 55. Logging

Safe logs:

```text
job_id
tenant_id (internal structured log)
protected_asset_id
provider
provider_version
processing stage
duration
result classification
error code
```

Forbidden logs:

```text
raw signing key
raw HMAC secret
raw storage credentials
full watermark codeword
user auth token
presigned URL query string
```

---

# 56. Metrics

Metrics SHOULD include:

```text
protection_jobs_total
protection_jobs_failed_total
protection_job_duration_seconds
watermark_embed_duration_seconds
watermark_self_verify_failures_total
verification_jobs_total
verification_match_classification_total
fingerprint_duration_seconds
c2pa_sign_failures_total
worker_capability_available
evidence_packages_generated_total
```

Break down by provider/version, not by user-identifying labels.

---

# 57. Error Codes

Examples:

```text
CP_SOURCE_NOT_FOUND
CP_SOURCE_CORRUPT
CP_NO_COMPATIBLE_WORKER
CP_VIDEO_WATERMARK_EMBED_FAILED
CP_VIDEO_WATERMARK_SELF_VERIFY_FAILED
CP_AUDIO_WATERMARK_FAILED
CP_FINGERPRINT_FAILED
CP_C2PA_SIGN_FAILED
CP_QC_FAILED
CP_UPLOAD_FAILED

CV_INPUT_CORRUPT
CV_INPUT_TOO_SHORT
CV_NO_CANDIDATES
CV_WATERMARK_DETECT_FAILED
CV_FINGERPRINT_FAILED
CV_ANALYSIS_TIMEOUT
```

User UI should translate these into readable messages.

---

# 58. Graceful Degradation

Profiles define required vs optional layers.

Example Standard profile:

If:

```text
video watermark = success
fingerprints     = success
C2PA             = success
audio watermark  = failed
```

Result MAY be:

```text
READY_WITH_WARNINGS
```

If required video watermark self-verification fails:

```text
FAILED_FINAL
```

unless the user explicitly chooses a different profile and re-runs protection.

---

# 59. Re-Protecting an Asset

Never mutate historical protection records.

New algorithm/provider/profile creates:

```text
Protection v1
Protection v2
Protection v3
```

Publication records point to the actual distributed protection version.

Old versions remain verifiable according to retention policy.

---

# 60. Publication Workflow

After protection is ready:

```text
Protected Asset
   ↓
Publish externally
   ↓
Register publication URL
```

Registration may initially be manual.

Future connectors may automatically register:

- platform;
- post ID;
- URL;
- publication timestamp.

Publication records must not rewrite the actual creation/protection timestamps.

---

# 61. Protection of AI-Generated Content

The system MUST distinguish:

```text
AI-generated source material
vs.
final edited/assembled work
vs.
technical provenance evidence
```

SmartAIHub should preserve evidence of human/system production actions such as:

- script revisions;
- scene arrangement;
- selected generations;
- editing decisions;
- dialogue;
- subtitles;
- sound design;
- timeline;
- export.

Do not label all AI-generated output as automatically copyright-protected.

The product stores evidence; legal protection depends on applicable law and facts.

---

# 62. Security Against Watermark Replay

A watermark can be copied or replayed by a sufficiently capable attacker.

Therefore a matching watermark MUST NOT be treated alone as conclusive ownership evidence.

High-confidence reports SHOULD combine:

```text
watermark
+
visual fingerprint
+
temporal overlap
+
original production provenance
+
earlier publication record
```

This requirement must be reflected in UI language and evidence reports.

---

# 63. Attack / Abuse Considerations

Consider:

- crop/remove visible logo;
- re-encode;
- resize;
- subtitles/overlay;
- audio replacement;
- video-to-video transformation;
- frame interpolation;
- speed change;
- generated recreation;
- watermark removal attempts;
- watermark replay onto unrelated content;
- false complaints.

Mitigations:

- independent evidence signals;
- authenticated server records;
- audit logs;
- immutable source hash;
- publication history;
- no automatic takedown decision;
- human review before external complaint.

---

# 64. Privacy

Do not embed personal information in media.

Do not expose creator email/name inside machine watermarks unless the user explicitly selects visible branding.

Suspected-copy uploads may contain third-party personal information.

Therefore:

- default retention must be configurable;
- user can delete case evidence subject to platform retention policy;
- access is tenant-scoped;
- evidence exports are explicit user actions;
- temporary Worker copies are deleted.

---

# 65. Suggested Project Structure

## Backend

```text
python-backend/app/modules/content_protection/
  api/
    assets.py
    verification.py
    cases.py
    settings.py

  services/
    protection_service.py
    watermark_identity_service.py
    fingerprint_service.py
    provenance_service.py
    verification_service.py
    case_service.py
    evidence_service.py
    protection_profile_service.py

  providers/
    key_provider.py
    signer_provider.py

  models/
  schemas/
  policies/
  repositories/
  events/
```

Adapt names to the existing backend conventions rather than creating conflicting framework patterns.

## Web

```text
web/src/features/content-protection/
  pages/
    ProtectionOverviewPage
    ProtectedAssetsPage
    ProtectedAssetDetailPage
    VerifyCopyPage
    VerificationResultPage
    CasesPage
    CaseDetailPage
    ProtectionSettingsPage

  components/
    ProtectionBadge
    ProtectionStatusCard
    WatermarkStatus
    ProvenanceTimeline
    MatchEvidencePanel
    MatchTimeline
    EvidencePackageCard
    ProtectionProfileSelector

  api/
  hooks/
  types/
```

## Worker

```text
worker/
  content-protection/
    orchestrator/
    providers/
      videoseal/
      audioseal/
      vpdq/
      tmk/
      chromaprint/
    ffmpeg/
    qc/
    fingerprint/
    verification/
```

If the current Worker uses a Python sidecar for ML runtimes:

```text
python-sidecar/content_protection_runtime/
  server.py
  videoseal_provider.py
  audioseal_provider.py
  models.py
```

Rust/Tauri remains the orchestrator.

---

# 66. Provider Interfaces

Example conceptual interface:

```python
class VideoWatermarkProvider:
    def capabilities(self) -> dict: ...
    def embed(self, input_path, output_path, message, options) -> EmbedResult: ...
    def detect(self, input_path, options) -> DetectResult: ...
    def self_test(self) -> HealthResult: ...
```

Detection result:

```json
{
  "present": true,
  "presence_score": 0.98,
  "message_bits": "...",
  "soft_bits": [],
  "segments": [],
  "provider": "videoseal",
  "provider_version": "..."
}
```

Provider results must be normalized before reaching domain logic.

---

# 67. Job Payload Example — Protect

```json
{
  "schema_version": 1,
  "protected_asset_id": "uuid",
  "source": {
    "download_url": "short-lived-signed-url",
    "expected_sha256": "..."
  },
  "output": {
    "upload_url": "short-lived-signed-url"
  },
  "protection": {
    "profile_version": 1,
    "visible_watermark": {
      "enabled": true,
      "text": "AI Story Studio · S01E17"
    },
    "video_watermark": {
      "enabled": true,
      "provider": "videoseal",
      "message_b64": "asset-scoped-message-only"
    },
    "audio_watermark": {
      "enabled": true,
      "provider": "audioseal",
      "message": 12345
    }
  }
}
```

Never include server master key material.

---

# 68. Job Result Example — Protect

```json
{
  "schema_version": 1,
  "output_sha256": "...",
  "media": {
    "duration_ms": 30000,
    "width": 1080,
    "height": 1920
  },
  "video_watermark": {
    "status": "PASS",
    "presence_score": 0.99,
    "bit_agreement": 0.992
  },
  "audio_watermark": {
    "status": "PASS",
    "confidence": 0.97
  },
  "qc": {
    "status": "PASS",
    "vmaf": 96.1
  },
  "fingerprints": [
    {
      "type": "vpdq",
      "artifact_sha256": "..."
    }
  ]
}
```

Server verifies all expected artifacts before marking asset ready.

---

# 69. Job Payload Example — Verify

```json
{
  "schema_version": 1,
  "verification_id": "uuid",
  "suspect": {
    "download_url": "short-lived-signed-url",
    "expected_sha256": "..."
  },
  "candidates": [
    {
      "protected_asset_id": "uuid",
      "video_watermark_message_b64": "...",
      "fingerprint_artifacts": {
        "vpdq_url": "...",
        "chromaprint_url": "..."
      }
    }
  ],
  "detector_policy_version": "dp-v1"
}
```

Candidate set should be bounded.

---

# 70. Web Real-Time Updates

Use the existing job progress mechanism.

Do not create a separate WebSocket just for Content Protection unless the existing architecture cannot carry `worker_job_events`.

Map worker events to UI:

```text
content_protection.stage.started
content_protection.stage.progress
content_protection.stage.completed
content_protection.warning
content_protection.failed
content_protection.ready
```

---

# 71. Backward Compatibility

Existing unprotected assets remain usable.

Library can show:

```text
Not protected
[ Protect now ]
```

Do not silently re-encode old media.

Provide optional batch-protect action later:

```text
Select assets
→ Protect selected
```

Batch operation creates independent child jobs under the existing job control plane.

---

# 72. Performance Requirements

The system MUST:

- avoid loading long video fully into RAM;
- support GPU acceleration when available;
- support CPU fallback where practical;
- expose realistic progress;
- allow cancellation between safe processing stages;
- avoid duplicate downloads when multiple stages run on the same Worker;
- keep one local working directory per job;
- clean temporary files on completion/failure.

Benchmark P50/P95 on:

- 10s 1080x1920;
- 30s 1080x1920;
- 3min 1080p;
- 10min 1080p.

Do not set a production SLA until benchmarks are measured on actual Worker hardware.

---

# 73. Desktop Worker Diagnostics

Worker settings/diagnostics SHOULD display:

```text
Content Protection Runtime

FFmpeg            Ready
VideoSeal         Ready / GPU
AudioSeal         Ready
vPDQ              Ready
Chromaprint       Ready
C2PA tools        Ready

GPU               NVIDIA ...
VRAM              ...
Runtime version   ...
```

Button:

```text
[ Run Protection Self-Test ]
```

Self-test uses bundled non-user media.

---

# 74. Failure UX

Example:

```text
Protection failed

The invisible watermark could not be recovered from the protected
output during validation. The source master was not modified.

[ Retry ]
[ Use Provenance-only Protection ]
[ View Technical Details ]
```

Never leave the user unsure whether the distributed file is protected.

---

# 75. Accessibility / Mobile

Web UI must remain usable on tablet.

Requirements:

- status must not rely only on color;
- evidence cards stack on narrow view;
- tables have card layout fallback;
- progress available as text;
- touch targets meet existing SmartAIHub design system requirements.

---

# 76. Localization

All user-facing strings must support i18n.

Minimum:

```text
th
en
```

Do not hardcode English provider errors into user UI.

Technical detail panels may show provider identifiers.

---

# 77. Feature Flags

Recommended:

```text
content_protection.enabled
content_protection.video_watermark.enabled
content_protection.image_watermark.enabled
content_protection.audio_watermark.enabled
content_protection.c2pa.enabled
content_protection.verify.enabled
content_protection.cases.enabled
content_protection.evidence.enabled
```

Provider rollout can therefore be staged safely.

---

# 78. Migration Plan

## Phase 0 — Technical POC

Implement local CLI/runtime only:

- VideoSeal embed/detect;
- AudioSeal embed/detect;
- vPDQ;
- Chromaprint;
- FFmpeg pipeline;
- C2PA test manifest;
- attack benchmark.

Exit criteria:

- repeatable tests;
- acceptable visual/audio quality;
- baseline thresholds documented;
- long-video memory behavior known.

## Phase 1 — Protect on Export

Implement:

- DB tables;
- protection profiles;
- protect job;
- Worker integration;
- Library Protection tab;
- Video Editor export toggle;
- Media Studio export toggle;
- SHA-256;
- invisible video watermark;
- source master preservation;
- self-verification;
- C2PA;
- basic fingerprint.

This phase delivers useful protection immediately.

## Phase 2 — Verify Copy

Implement:

- suspicious file upload;
- selected-asset verification;
- search-my-assets candidate flow;
- vPDQ partial matching;
- audio fingerprint;
- audio watermark;
- verification result UI;
- segment timeline.

## Phase 3 — Cases & Evidence

Implement:

- case workflow;
- publication history;
- PDF report;
- signed ZIP evidence package;
- manual external-submission tracking.

## Phase 4 — Advanced Protection

Optional:

- TMK+PDQF;
- improved candidate indexing;
- image protection;
- audio-only protection;
- commercial watermark provider adapters;
- supported social-platform connectors;
- authorized monitoring.

---

# 79. Automated Tests

## Unit Tests

- watermark ID generation;
- key-version handling;
- tenant scoping;
- status transitions;
- protection profile validation;
- classification policy;
- evidence canonical manifest;
- publication records;
- idempotency key.

## Integration Tests

- protect real test video;
- output self-detect;
- C2PA verify;
- vPDQ artifact generation;
- AudioSeal artifact generation;
- Worker lease loss/recovery;
- R2 upload retry;
- job idempotency;
- evidence ZIP verification.

## Security Tests

- cross-tenant asset access;
- cross-tenant verification candidate leak;
- signed URL expiry;
- Worker payload contains no master secrets;
- logs contain no raw keys;
- unauthorized master download;
- unauthorized evidence export.

---

# 80. Robustness Test Cases

At minimum:

```text
T01 original protected file
T02 H.264 re-encode
T03 bitrate 50%
T04 720p resize
T05 crop 10%
T06 logo overlay
T07 subtitle overlay
T08 trim start/end
T09 partial middle clip
T10 FPS conversion
T11 audio re-encode
T12 audio replaced
T13 visual color adjustment
T14 crop + resize + subtitle
T15 strong transformation causing expected inconclusive result
```

For every test record all evidence signals, not only final classification.

---

# 81. Acceptance Criteria — Phase 1

Phase 1 is accepted when:

1. User can protect an existing Library video.
2. User can enable protection during Video Editor export.
3. User can enable protection during Media Studio export.
4. Original master remains unchanged.
5. Protected master has a unique protection record.
6. Invisible video watermark is embedded.
7. Worker self-detects the expected watermark.
8. Failed self-verification prevents normal `READY` status.
9. SHA-256 is recorded.
10. Basic video fingerprint is generated.
11. C2PA manifest can be added and verified when enabled.
12. Protection status appears in Library.
13. Job progress uses existing `worker_jobs` / `worker_job_events`.
14. Worker loss can be retried without duplicate final records.
15. User can register an original publication URL.
16. All queries are tenant-scoped.
17. Raw codeword/master keys are not returned to browser.
18. A protected asset detail page shows provenance and protection status.
19. Tablet UI is usable.
20. Thai and English strings are supported.
21. A Web Video Editor export that requests protection binds the protection intent to the final `editor_video_render` artifact, not to a preview or child clip.
22. A Vertical Drama episode, production group, or trailer that is publishable has a protection record bound to the exact `compiledVideo` artifact and assembly revision.
23. The protection record contains ordered input asset IDs, source SHA-256 values, trims, timeline indexes, render/assembly revision, compound plan digest, and final protected SHA-256.
24. Missing source hashes, stale revisions, or mismatched compound digests fail closed before the output becomes publishable.
25. The protected output passes invisible watermark self-detection and records detector/provider/policy versions.
26. A visible `watermarkImages` overlay alone cannot satisfy the invisible ownership-watermark gate.
27. Protection and compound jobs are causally linked through existing `worker_jobs` metadata and outbox flow; no second queue is introduced.
28. Repeating an unchanged compound/protection intent is idempotent; changing an input, trim, revision, render setting, or profile creates a new protected version.
29. Focused integration tests prove the Web Editor and Vertical Drama compound paths block unprotected publish and allow publish only after exact-artifact protection verification.
30. A standalone image can be protected after its final image transform/export and before it is marked ready.
31. Image protection records exact SHA-256, image watermark self-verification, PDQ evidence, and C2PA status when enabled.
32. Image verification supports upload/select-from-Library, watermark result, PDQ distance, crop/resize alignment, and matched-region visualization.
33. An image used as an input to a video compound does not satisfy the final video's protection gate.
34. The Dashboard main menu exposes Content Protection through the shared menu registry when the feature is enabled.
35. Dashboard quick links open Overview, Protected Assets, and Verify Copy on desktop and mobile.
36. Every export/compound UI visibly states whether the digital watermark is ON or OFF and identifies the creation stage.
37. The user can override the watermark choice per operation; an OFF choice is recorded as `UNPROTECTED_BY_USER_CHOICE`.
38. No raw watermark codeword, signing key, or secret is shown in image or video UI.

---

# 82. Acceptance Criteria — Phase 2

1. User can upload suspicious video.
2. Input bytes are hashed immediately.
3. User can compare with a selected original.
4. User can search own protected assets.
5. System reports watermark evidence.
6. System reports visual fingerprint evidence.
7. System reports matched duration/segments.
8. System reports audio evidence when available.
9. Partial clip reuse is testable.
10. Result does not state legal infringement.
11. Inconclusive results explain missing/weak signals.
12. Verification raw file follows retention policy.
13. Cross-tenant candidates are not exposed.

---

# 83. Acceptance Criteria — Phase 3

1. User can convert verification result into a case.
2. User can record original and suspicious URLs.
3. User can generate evidence package.
4. Evidence package includes hashes and technical results.
5. Evidence manifest is cryptographically signed.
6. Package integrity can be re-verified.
7. PDF contains a technical limitations statement.
8. External submission tracking is manual and auditable.
9. Case activity is append-only.
10. Historical reports remain tied to the exact protection version.

---

# 84. Definition of Done

Feature is not done when “a watermark was successfully embedded once.”

Done means:

```text
Protect
+ Self-verify
+ Preserve
+ Fingerprint
+ Provenance
+ Store
+ Display
+ Retry safely
+ Verify suspect
+ Explain evidence
+ Generate case evidence
+ Audit
+ Secure tenant data
```

---

# 85. Implementation Decisions That Must Not Be Violated

1. **Do not create a new job/queue system.**
2. **Do not put heavy video processing on the web server by default.**
3. **Do not expose secret keys/codewords to the browser.**
4. **Do not store user identity inside the invisible watermark.**
5. **Do not call a technical match a legal infringement decision.**
6. **Do not rely on C2PA metadata alone.**
7. **Do not rely on visible watermark alone.**
8. **Do not rely on invisible watermark alone.**
9. **Do not overwrite historical protection versions.**
10. **Do not modify media after final C2PA signing without creating a new version.**
11. **Do not scrape external platforms without a permitted integration.**
12. **Do not create duplicate media/library/job UIs when existing components can be integrated.**

---

# 86. Recommended Initial Engineering Order

Implement in this exact order:

```text
1. Provider POC + attack benchmark
2. Compound artifact envelope and digest binding for Web Video Editor and Vertical Drama
3. Database migrations for protection, artifact-version, and provenance records
4. ContentProtectionService
5. KeyProvider / opaque watermark identity
6. Worker capability registration
7. `content_protection.protect` job causally linked to the compound job
8. FFmpeg protected-export pipeline after the final compound/render transform
9. VideoSeal embed + self-detect
10. Protected publish/READY gate and idempotent version transition
11. fingerprint creation
12. C2PA signing
13. Library Protection UI
14. Media Studio / Video Editor export integration
15. publication registration
16. verification ingest
17. vPDQ candidate matching
18. watermark verification
19. audio evidence
20. verification result UI
21. cases
22. signed evidence package
23. robustness tuning
24. staged production rollout
```

Do not build Cases before the protect/verify evidence pipeline is stable.

---

# 87. Recommended Open-Source Baseline References

Implementers should verify current releases and licenses before pinning dependencies.

- Meta VideoSeal — `facebookresearch/videoseal`
- Meta AudioSeal — `facebookresearch/audioseal`
- Meta ThreatExchange — `facebook/ThreatExchange`
  - PDQ
  - vPDQ
  - TMK+PDQF
- Chromaprint — AcoustID/Chromaprint
- C2PA Rust SDK — Content Authenticity Initiative `contentauth/c2pa-rs`
- C2PA CLI — `contentauth/c2patool`
- FFmpeg / ffprobe
- libvmaf where quality benchmarking is enabled

Pin exact commit/package versions in the implementation lockfiles after POC validation.

---

# 88. Final Product Flow

For an ordinary creator, the complexity should remain hidden.

```text
Create Episode
      ↓
Edit
      ↓
Export
      ↓
[✓ Protect this export]
      ↓
SmartAIHub Worker
      ↓
Protected ✓
      ↓
Publish
      ↓
Register publication
```

If copying is suspected:

```text
Content Protection
      ↓
Verify Copy
      ↓
Upload suspicious video
      ↓
Analyze
      ↓
High-confidence system match
      ↓
Create Case
      ↓
Generate Evidence Package
      ↓
Use evidence in the platform's official IP-report workflow
```

This is the intended end-to-end user experience.

---

# 89. Future Extensions

The same architecture can later support:

- image invisible watermark;
- image perceptual fingerprint;
- audio-only copyright protection;
- licensed commercial watermark providers;
- cross-device verification;
- platform-authorized monitoring;
- creator/partner rights registry;
- revenue/licensing metadata;
- distribution partner tracking;
- per-recipient forensic watermarks;
- leak-source identification;
- API/MCP tools for protection and verification.

A future per-recipient forensic watermark mode should create a separate specification because it changes privacy, scale, encoding cost, and distribution semantics.

---

# 90. Final Architecture Principle

Content protection is a **cross-cutting Core capability**, not a standalone media-generation plugin.

Media creation tools call it through Core APIs.

The Web owns control, evidence, settings, and user experience.

The Worker owns expensive media analysis and embedding.

PostgreSQL remains the source of truth.

R2 stores immutable media/evidence artifacts.

The existing Unified Job Control Plane controls every asynchronous protection and verification job.

This prevents SmartAIHub from developing another isolated subsystem while still allowing watermark/fingerprint providers to evolve independently.

---

# 91. Gap Closed by Revision 1.1 — Ownership Evidence vs Media-Match Evidence

The original version of this specification was strong on watermark/fingerprint matching but not sufficient by itself to let an external social-media administrator evaluate a claim of ownership.

Revision 1.1 adds the missing evidence chain.

SmartAIHub MUST present evidence in four layers:

```text
LAYER 1 — CLAIMANT / AUTHORITY
Who is asserting the rights and in what capacity?

LAYER 2 — CREATION / REGISTRATION / CHAIN OF TITLE
What evidence links that claimant to the original work?

LAYER 3 — CRYPTOGRAPHIC / TEMPORAL PROVENANCE
What hash, signed manifest, C2PA record, and trusted timestamp existed before the dispute?

LAYER 4 — TECHNICAL MEDIA MATCH
How does the reported image/audio/video match or derive from the original?
```

A case cannot be marked `EVIDENCE_READY` until all required layers for that case type are complete.

---

# 92. Rights Holder Profile

Add a tenant-scoped **Rights Holder Profile**.

A profile may represent:

```text
INDIVIDUAL
ORGANIZATION
```

Required/optional data:

```text
public_display_name
legal_name
organization_name
country
business_registration_reference          optional
copyright_contact_email
copyright_contact_phone                   optional
mailing_address                           optional / case-dependent
website/domain                            optional
claimant_capacity
identity_verification_status
created_at
updated_at
```

`claimant_capacity`:

```text
COPYRIGHT_OWNER
EXCLUSIVE_LICENSEE
AUTHORIZED_REPRESENTATIVE
EMPLOYEE_AUTHORIZED_TO_FILE
LEGAL_COUNSEL
OTHER_AUTHORIZED_AGENT
```

Sensitive identity/contact data MUST:

- be encrypted at rest;
- never be embedded in media watermarks;
- never appear in public reviewer links unless explicitly selected;
- be exportable only by an authorized user;
- support a case-specific disclosure snapshot so later profile edits do not rewrite past evidence.

The UI MUST clearly explain that providing a Rights Holder Profile does not itself prove legal ownership.

---

# 93. Creation / Registration Certificate

Every protected media asset MUST have a signed certificate.

Certificate type:

```text
CREATED_IN_SMARTAIHUB
REGISTERED_EXTERNAL_MEDIA
IMPORTED_WITH_PROVIDER_RECEIPT
```

This distinction is critical.

For external media imported into SmartAIHub, the system MUST NOT claim that SmartAIHub knows the true creation time. It only knows when the exact bytes were first observed.

Minimum fields:

```json
{
  "format": "sah-creation-certificate-v1",
  "certificate_id": "public-id",
  "certificate_type": "CREATED_IN_SMARTAIHUB",
  "public_asset_id": "public-id",
  "media_type": "image|audio|video",
  "source_sha256": "...",
  "source_size": 123456,
  "first_observed_at": "...",
  "claimed_created_at": null,
  "generation": {
    "smartaihub_job_id": "public-job-ref",
    "provider": "provider-name",
    "provider_job_id": "provider-ref-if-available",
    "model": "model-name",
    "model_version": "if-known",
    "request_timestamp": "...",
    "result_timestamp": "...",
    "prompt_sha256": "optional",
    "reference_asset_sha256": []
  },
  "creator_account_assertion": {
    "rights_holder_profile_id": "snapshot-ref",
    "claimant_capacity": "COPYRIGHT_OWNER"
  },
  "signing_key_id": "...",
  "issued_at": "..."
}
```

Important timestamp semantics:

```text
claimed_created_at
  = user/provider claim; not automatically trusted

first_observed_at
  = first time SmartAIHub received and hashed the exact bytes

generation result timestamp
  = server/provider job evidence

trusted_timestamp_at
  = externally timestamped evidence-anchor time
```

UI and reports MUST NOT merge these into one generic “Created At” field.

---

# 94. Trusted Timestamp / Evidence Anchor

A local database timestamp can be challenged as editable.

For stronger evidence, SmartAIHub SHOULD create an externally timestamped evidence anchor as soon as the original media bytes are first finalized/observed.

Canonical anchor:

```json
{
  "format": "sah-evidence-anchor-v1",
  "certificate_id": "...",
  "public_asset_id": "...",
  "media_type": "...",
  "source_sha256": "...",
  "first_observed_at": "...",
  "rights_claim_id": "...",
  "generation_receipt_digest": "...",
  "ingredient_digest": "..."
}
```

Process:

```text
canonical JSON
      ↓
SHA-256
      ↓
SmartAIHub digital signature
      ↓
RFC 3161 / compatible trusted timestamp
      ↓
immutable evidence-anchor record
```

Preferred production design:

- use a trusted timestamp authority compatible with SmartAIHub's evidence/C2PA trust model;
- store the timestamp token (`.tsr`) in R2;
- verify the TSA chain when generating evidence;
- record TSA policy/certificate details;
- support TSA provider replacement.

If C2PA signing uses a trusted timestamp, preserve and report it separately as part of the evidence.

An optional append-only **Evidence Transparency Log** MAY also be implemented:

```text
asset anchor hashes
      ↓
Merkle tree
      ↓
daily root
      ↓
signed + externally timestamped
```

This makes later backdating/tampering harder to conceal.

---

# 95. Chain of Custody

Every evidence-relevant file MUST have a chain-of-custody record.

Events:

```text
INGESTED
HASHED
REGISTERED
TRANSFORM_STARTED
TRANSFORM_COMPLETED
WATERMARKED
C2PA_SIGNED
PUBLISHED_REGISTERED
SUSPECT_INGESTED
VERIFICATION_STARTED
VERIFICATION_COMPLETED
EVIDENCE_EXPORTED
```

Each event records:

```text
event_id
asset/case ID
input object key/version
input SHA-256
output object key/version
output SHA-256
actor/system
job_id
server timestamp
signature/anchor reference when applicable
```

Files used as evidence MUST never be silently overwritten.

A transformation creates a new object/version and explicitly links:

```text
input_hash → operation → output_hash
```

---

# 96. Rights Claim and Chain of Title

Add a separate `rights_claim` entity.

It answers:

> Why does this person or organization claim the right to request removal?

`rights_basis`:

```text
ORIGINAL_CREATOR
EMPLOYEE_OR_WORK_MADE_FOR_HIRE
ASSIGNMENT
EXCLUSIVE_LICENSE
COMMISSIONED_WORK
AUTHORIZED_DISTRIBUTOR_WITH_ENFORCEMENT_RIGHT
OTHER
```

Claim scope:

```text
WHOLE_FINAL_WORK
VISUAL_ONLY
AUDIO_ONLY
MUSIC_ONLY
SCRIPT_OR_TEXT
CHARACTER_OR_ARTWORK
SPECIFIC_TIME_RANGES
SPECIFIC_IMAGES
```

Supporting evidence may include:

- employment/work-for-hire document;
- copyright assignment;
- exclusive license;
- commissioning agreement;
- authorization letter;
- provider generation receipt;
- original project/timeline data;
- original camera/source files;
- source art files;
- source audio/stems;
- official publication/account records;
- registration certificate where applicable.

SmartAIHub MUST store each supporting document's SHA-256 and evidence snapshot.

---

# 97. Component Rights Matrix

A final video may contain elements that the claimant does not own.

Example:

```text
Final Episode
  ├─ Script                  owned
  ├─ AI-generated visuals    claimant asserts rights / provider terms
  ├─ Voice                   owned/licensed
  ├─ Music                   non-exclusive license
  ├─ SFX                     library license
  ├─ Logo                    owned
  └─ Font                    licensed
```

The case UI MUST provide a component-rights matrix:

```text
component_type
description
source
rights_basis
rights_holder
license_type
license_reference
territory
term/expiry
right_to_enforce   yes/no/unknown
evidence_document_ids
notes
```

The system MUST prevent the user from accidentally asserting ownership of a component explicitly recorded as third-party/non-owned.

Example:

If background music is licensed non-exclusively but the copied page duplicated the entire edited episode, the claim should identify the final audiovisual editing/visual work and other rights actually held, rather than claiming exclusive ownership of the licensed song.

---

# 98. AI-Generation Evidence

For assets generated through SmartAIHub, automatically preserve:

```text
generation provider
model/model version when known
provider request/job ID
server request time
server receipt time
output SHA-256 immediately on receipt
source/reference asset hashes
prompt hash
seed / generation parameters when available
billing/credit transaction reference
worker job ID
```

Prompt text SHOULD be private by default.

Evidence package defaults to:

```text
prompt_sha256
```

with an explicit option:

```text
[ ] Include full prompt in evidence package
```

Provider receipts or API response metadata SHOULD be stored when legally and technically permitted.

Do not claim a provider job receipt establishes copyright ownership. It establishes evidence of a generation transaction and chronology.

---

# 99. Publication Evidence

Publication evidence is important because social-media reviewers often need a legitimate/original location for the work.

For each publication record capture, when available through authorized APIs/connectors:

```text
platform
account/page/channel ID
account/page/channel display name
direct content URL
platform content ID
platform-reported creation/publication timestamp
visibility
caption/title
authorized account relationship
retrieved_at
retrieval method
raw response hash
```

Evidence strength:

```text
PLATFORM_API_VERIFIED
AUTHORIZED_CONNECTOR
USER_ENTERED_URL
USER_UPLOADED_SCREENSHOT
```

Never display a user-entered date as though it were a platform-verified timestamp.

Do not use unauthorized scraping to upgrade evidence strength.

---

# 100. Media-Type Verification Matrix

The report MUST use tools appropriate to each modality.

## 100.1 Image

Required/available signals:

```text
Exact SHA-256
C2PA validation
Public-verifiable invisible watermark — PixelSeal/VideoSeal family
PDQ perceptual hash
Crop/resize alignment
Matched-region visualization
Original/publication evidence
```

Recommended technical tools:

### PDQ

Purpose:

- identify perceptually similar images despite ordinary recompression/resizing;
- produce a 256-bit perceptual signature;
- compare using Hamming distance.

Report:

```text
original PDQ
suspect PDQ
Hamming distance
quality score
policy threshold
decision
```

### OpenCV alignment

Use feature/keypoint matching only as explanatory/forensic visualization, not standalone proof.

Possible provider:

```text
SIFT/ORB/AKAZE + RANSAC homography
```

Output:

```text
matched keypoints
estimated crop/transformation
inlier ratio
original region polygon
suspect region polygon
side-by-side overlay
```

### Image Invisible Watermark

Initial provider candidates:

```text
PixelSeal
VideoSeal image mode
```

The expected 256-bit message is derived using Section 11.1 so an external reviewer can reproduce the expected value.

## 100.2 Audio

Required/available signals:

```text
Exact SHA-256
C2PA validation when present
AudioSeal corroborating watermark
Chromaprint near-identical fingerprint
audfprint or equivalent landmark fingerprint for excerpts/time alignment
waveform/spectrogram comparison
original/publication evidence
```

### Chromaprint

Use for:

```text
same/near-identical recording
format changes
bitrate changes
duplicate/stream monitoring
```

The report MUST state that Chromaprint is not a universal similarity engine.

### audfprint / Landmark Fingerprint Provider

Use for:

```text
partial excerpts
time offset
matching interval
noisy excerpts
```

Output:

```text
matched duration
query start/end
reference start/end
consistent landmark hashes
score
threshold policy
```

### AudioSeal

Treat as corroborating evidence because the public tag is short.

## 100.3 Video

Required/available signals:

```text
Exact SHA-256
C2PA validation
VideoSeal/PixelSeal-compatible invisible watermark
vPDQ partial-frame fingerprint
TMK+PDQF optional whole-video signature
matched-time-range alignment
audio evidence from the video's audio track
side-by-side representative frames
original/publication evidence
```

### vPDQ

Report:

```text
query matched frame percentage
reference matched frame percentage
PDQ distance threshold
quality threshold
matched timestamps
matched duration ratio
```

### TMK+PDQF

Use as an additional whole-video similarity signal where benchmarked.

### Frame alignment

Generate a human-readable contact sheet with:

```text
original timestamp
suspect timestamp
original frame
suspect frame
visual score
crop/overlay notes
```

Do not make an administrator infer similarity from a single aggregate score.

---

# 101. Detector Policy and Calibration Evidence

Every match decision MUST record the exact policy that produced it.

Create versioned:

```text
detector_policy_version
```

Example:

```json
{
  "version": "dp-2026-09-01",
  "image": {
    "pdq_hamming_max": 31
  },
  "video": {
    "vpdq_quality_min": 50,
    "vpdq_distance_max": 31,
    "vpdq_query_match_min_percent": 80
  },
  "watermark": {
    "minimum_presence_score": 0.90,
    "minimum_bit_agreement": 0.90
  }
}
```

The values above are examples only. Production thresholds MUST come from SmartAIHub benchmark calibration.

Every report MUST expose:

```text
score
threshold
policy version
tool version
benchmark reference
```

Calibration artifacts SHOULD include:

```text
test corpus description
number of positive cases
number of negative cases
false-positive rate
false-negative rate
performance after each transformation class
```

This makes “96% match” reviewable rather than opaque.

---

# 102. Independent External Reviewer Verification

Social-media administrators cannot be expected to trust an internal SmartAIHub screen.

SmartAIHub MUST support two external verification paths.

## 102.1 Reviewer Link

Generate a case-scoped, read-only link:

```text
https://smartaihub.app/evidence-review/{public_case_id}?token={scoped_token}
```

Token properties:

```text
read-only
case-scoped
expiry configurable
revocable
audited
no tenant browsing
```

Reviewer page shows:

```text
Claimant / capacity
Claim scope
Original work
Creation/Registration Certificate
Trusted timestamp status
Original publication records
Suspected work
Technical match results
Matched image regions / audio-video time ranges
C2PA result
Watermark result
Fingerprint result
Tool versions
Detector-policy thresholds
Evidence package signature status
```

The page MUST contain:

```text
[ Verify Evidence Package ]
[ View Reproduction Instructions ]
[ Download Reviewer Report ]
```

Optionally:

```text
[ Re-run analysis with a local file ]
```

If a reviewer uploads media:

- calculate SHA-256 immediately;
- run verification against the case original;
- do not add the file to the claimant's Library;
- default to ephemeral retention;
- disclose retention before upload;
- return a newly signed verification result.

## 102.2 Offline Verification Kit

Evidence package MUST be verifiable without logging into SmartAIHub.

Provide a small open-source verifier specification:

```text
sah-evidence-verify
```

Minimum responsibilities:

```text
verify manifest.sig against SmartAIHub public key
verify every file SHA-256 against manifest
verify RFC 3161 trusted timestamp token
verify C2PA manifest/signature/trust result
print certificate and chain-of-custody summary
```

Optional media modules:

```text
image PDQ comparison
vPDQ comparison
audio fingerprint comparison
public watermark detector
```

The evidence ZIP MUST also include plain commands/instructions that can be reproduced with upstream tools.

---

# 103. Public Verification Key and Key History

Publish a stable verification-key endpoint:

```text
/.well-known/smartaihub-evidence-keys.json
```

Example:

```json
{
  "keys": [
    {
      "kid": "evidence-2026-q3",
      "alg": "Ed25519",
      "public_key": "...",
      "valid_from": "...",
      "valid_to": null,
      "status": "ACTIVE"
    }
  ]
}
```

Old verification keys MUST remain available after rotation so historical evidence remains verifiable.

Private signing keys remain in KeyProvider/KMS.

The public key history itself SHOULD be externally timestamped or otherwise anchored.

---

# 104. Platform Review Pack

Evidence generation MUST support platform-specific output templates while preserving one canonical evidence package.

Architecture:

```text
Canonical Evidence Model
        │
        ├─ Meta Review Pack
        ├─ YouTube Review Pack
        └─ TikTok Review Pack
```

Provider interface:

```text
PlatformClaimTemplateProvider
  required_fields()
  validate_case()
  render_summary()
  render_copy_paste_fields()
  version()
```

The template must be versioned because platform forms change over time.

Common fields include:

```text
rights holder / authorized representative
contact information
description of original copyrighted work
direct original/authorized URL
direct allegedly infringing URL(s)
claim scope
supporting ownership/authorization evidence
good-faith statement
accuracy/authority statement
electronic signature
```

SmartAIHub MUST NOT automatically submit a legal declaration without the user explicitly reviewing and signing/confirming it.

---

# 105. Reviewer Instructions — Required One-Page Summary

Every evidence package MUST start with a one-page reviewer workflow.

Example:

```text
STEP 1 — Identify the claimant
Check Rights Holder / Authorized Representative.

STEP 2 — Identify the original work
Open the original publication URL and Creation/Registration Certificate.

STEP 3 — Verify chronology
Check first-observed hash, RFC 3161 trusted timestamp and publication timestamp.

STEP 4 — Verify package integrity
Verify manifest signature and SHA-256 list.

STEP 5 — Verify technical match
Review matched frames/regions/time ranges and the independent signals.

STEP 6 — Reproduce if required
Use the reviewer link or offline verification instructions.

STEP 7 — Review rights scope
Confirm that the claimant is asserting only rights actually documented in the component-rights matrix.
```

The reviewer must not need to understand SmartAIHub's database schema.

---

# 106. New Database Tables

## 106.1 `content_rights_holder_profiles`

```sql
id uuid primary key
tenant_id uuid not null
profile_type varchar not null
public_display_name text not null
legal_name_encrypted bytea null
organization_name text null
country_code varchar null
business_registration_ref_encrypted bytea null
contact_email_encrypted bytea null
contact_phone_encrypted bytea null
mailing_address_encrypted bytea null
claimant_capacity varchar not null
identity_verification_status varchar not null
created_at timestamptz not null
updated_at timestamptz not null
```

## 106.2 `content_rights_claims`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null
rights_holder_profile_id uuid not null
rights_basis varchar not null
claim_scope varchar not null
statement text null
status varchar not null
snapshot_json jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

## 106.3 `content_rights_evidence_documents`

```sql
id uuid primary key
tenant_id uuid not null
rights_claim_id uuid not null
document_type varchar not null
object_key text not null
sha256 char(64) not null
issued_by text null
issued_at timestamptz null
expires_at timestamptz null
metadata jsonb not null
created_at timestamptz not null
```

## 106.4 `content_component_rights`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null
component_type varchar not null
description text not null
source_reference text null
rights_basis varchar not null
rights_holder text null
license_type varchar null
license_reference text null
right_to_enforce varchar not null
evidence_document_ids jsonb not null
created_at timestamptz not null
```

## 106.5 `content_creation_certificates`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null
certificate_type varchar not null
public_certificate_id varchar not null unique
certificate_json jsonb not null
certificate_sha256 char(64) not null
signature_object_key text not null
signing_key_id varchar not null
first_observed_at timestamptz not null
created_at timestamptz not null
```

## 106.6 `content_evidence_anchors`

```sql
id uuid primary key
tenant_id uuid not null
protected_asset_id uuid not null
anchor_type varchar not null
anchor_sha256 char(64) not null
signature_object_key text not null
tsa_token_object_key text null
tsa_validation_status varchar null
transparency_log_entry text null
created_at timestamptz not null
```

## 106.7 `content_external_review_links`

```sql
id uuid primary key
tenant_id uuid not null
case_id uuid not null
token_hash char(64) not null
expires_at timestamptz null
revoked_at timestamptz null
allowed_actions jsonb not null
created_by uuid not null
created_at timestamptz not null
last_accessed_at timestamptz null
```

---

# 107. New APIs

```http
POST /v1/content-protection/rights-holders
GET  /v1/content-protection/rights-holders/{id}
PATCH /v1/content-protection/rights-holders/{id}

POST /v1/content-protection/assets/{id}/rights-claims
GET  /v1/content-protection/assets/{id}/rights-claims

POST /v1/content-protection/rights-claims/{id}/documents
POST /v1/content-protection/assets/{id}/creation-certificate
GET  /v1/content-protection/assets/{id}/creation-certificate

POST /v1/content-protection/cases/{id}/review-link
DELETE /v1/content-protection/cases/{id}/review-link/{link_id}

POST /v1/content-protection/evidence/{id}/verify
GET  /.well-known/smartaihub-evidence-keys.json
```

Public reviewer route is a separate restricted surface and MUST NOT expose normal tenant APIs.

---

# 108. UI Additions Required by Revision 1.3

## 108.1 Protected Asset → `Rights & Ownership` Tab

Add tabs:

```text
Summary
Protection
Rights & Ownership
Provenance
Publications
Files
Activity
```

`Rights & Ownership` shows:

```text
Rights Holder
Claimant Capacity
Rights Basis
Claim Scope
Component Rights Matrix
Supporting Documents
Creation/Registration Certificate
Trusted Timestamp
Evidence Strength
```

Actions:

```text
[ Edit Rights Claim ]
[ Add License / Assignment ]
[ Generate Creation Certificate ]
[ Validate Evidence Readiness ]
```

## 108.2 Evidence Readiness Panel

Status example:

```text
Ownership / Rights Evidence
✓ Rights holder identified
✓ Claim scope defined
✓ Original source master preserved
✓ Creation certificate signed
✓ Trusted timestamp verified
✓ Original publication URL registered
✓ Video watermark self-verified
✓ Video fingerprint generated
! Music license: right to enforce = unknown

Overall
EVIDENCE NEEDS REVIEW
```

This prevents a technically strong match from being exported as a misleading “ownership proof” when rights documentation is incomplete.

## 108.3 Case → External Reviewer

Add:

```text
External Review

[ Generate Reviewer Link ]
[ Download Reviewer Pack ]
```

Options:

```text
Expires in: 7 / 30 / 90 days / custom
Allow reviewer re-analysis: yes/no
Show legal contact details: selected fields
Allow supporting document download: yes/no
```

Show access log.

## 108.4 Creation Certificate View

Human-readable view:

```text
Certificate ID
Asset ID
Media type
Certificate type
Source SHA-256
First observed
Trusted timestamp
Generated in SmartAIHub? yes/no
Provider / model
Provider job receipt
C2PA status
Signer key ID
Signature valid
```

Use exact labels:

```text
First observed by SmartAIHub
Claimed creation date
Trusted timestamp
Platform publication date
```

Never collapse these into one date.

## 108.5 Dashboard and Image UI Parity

The Dashboard menu and quick-link contract in Section 37.1 applies equally to image, audio, and video assets. The Protected Assets list MUST allow filtering by `image`, `audio`, and `video`; the detail, verification, certificate, and evidence-readiness screens MUST render modality-specific fields without dropping common ownership/provenance fields.

The image path MUST expose a visible sequence:

```text
Image selected/exported
  → Final image transform complete
  → Creating digital image watermark
  → Self-verifying image watermark
  → PDQ/C2PA/QC
  → Protected image ready
```

The video path MUST expose:

```text
Clips combined / final render complete
  → Creating digital video watermark
  → Self-verifying video watermark
  → Fingerprint/C2PA/QC
  → Protected video ready
```

The user-facing status MUST identify the media type, the exact artifact being protected, the user's ON/OFF choice, and whether the result is technically protected or unprotected.

---

# 109. Evidence Strength Model

Use explicit evidence grades for reviewer clarity.

Example:

```text
E0 — Claim only
User-entered statement with no technical corroboration.

E1 — Internal technical record
Hash/provenance stored by SmartAIHub.

E2 — Signed SmartAIHub record
Creation certificate + signed chain of custody.

E3 — Externally time-anchored
Trusted timestamp and/or independently verifiable platform/provider record.

E4 — Multi-signal derivation match
Strong media match + externally anchored original + documented rights claim.
```

The grade is a product evidence grade, NOT a legal determination.

UI label:

```text
Evidence Strength: E4
```

Never label it:

```text
Legal ownership confirmed
```

---

# 110. Acceptance Criteria — Ownership and External Verification

Revision 1.3 is not accepted until all of the following pass.

1. Image, audio, and video assets can receive a Creation/Registration Certificate.
2. Imported assets are labeled `REGISTERED_EXTERNAL_MEDIA`, not falsely labeled as created in SmartAIHub.
3. First-observed time and claimed creation time are separate.
4. Source SHA-256 is calculated immediately at first observation.
5. Evidence anchor can receive an external trusted timestamp.
6. Rights Holder Profile can represent an individual or organization.
7. Authorized representatives can attach proof of authorization.
8. Claim scope can be limited to visual/audio/specific portions.
9. Component-rights matrix can identify third-party licensed elements.
10. Evidence readiness warns when rights documentation conflicts with the claim.
11. Image verification supports PDQ and matched-region explanation.
12. Image invisible-watermark verification records recovered/expected message agreement.
13. Audio verification supports Chromaprint plus a partial/time-aligned fingerprint provider.
14. Video verification supports vPDQ matched time ranges.
15. Every technical result records tool/model version.
16. Every match records detector-policy version and threshold.
17. Evidence ZIP contains `verification-procedure.json`.
18. Evidence ZIP contains a one-page reviewer instruction document.
19. Evidence package is signed.
20. Evidence package file hashes can be verified offline.
21. Trusted timestamp token can be verified independently.
22. C2PA validation result can be independently reproduced.
23. Reviewer link is read-only, scoped, revocable and auditable.
24. Reviewer can see original vs suspect matched frames/regions/time ranges.
25. Reviewer can see evidence chronology and trust source for every timestamp.
26. Platform review pack can map canonical case data to Meta/YouTube/TikTok form fields.
27. The user must explicitly confirm/sign legal declarations; the system never auto-signs them.
28. The report clearly states that technical evidence supports a claim but does not adjudicate copyright ownership.
29. No personal identity data is embedded in invisible watermarks.
30. Historical certificates, evidence anchors, and evidence packages cannot be silently overwritten.
31. Dashboard navigation and quick links resolve to the same canonical Content Protection routes for web and desktop.
32. An authenticated user can open image, audio, and video protection details without cross-tenant leakage.
33. A user can explicitly disable digital watermarking for an operation and sees the unprotected warning before completion.
34. A user can explicitly enable digital watermarking and sees the watermark-creation, self-verification, and final protected states.
35. Image and video verification reports use modality-specific evidence and never conflate image watermarking with video watermarking.

---

# 111. Current External Platform Requirements — Design Implications

The implementation must assume that external platform IP teams primarily review a combination of:

```text
claimant identity/authority
description of original work
direct original/authorized location
direct allegedly infringing URLs
supporting rights evidence
comparison evidence
legal declarations/signature
```

Current official platform guidance demonstrates why the spec must not export only a watermark score:

- YouTube's copyright removal workflow requires claimant contact information, a clear description of the copyrighted work, direct links to the allegedly infringing content, legal statements, and a signature. YouTube states that requests can be processed by automated systems or human reviewers, and may request additional evidence/authorization.
- TikTok states that the reporter must be the owner or an authorized representative and that supporting documentation identifying that status should be included; its IP specialists review claims and may request missing information.
- Meta distinguishes ordinary content/community reporting from intellectual-property reporting; the evidence package should therefore be designed for the dedicated IP-report workflow, not as a substitute for a normal “Report post” action.
- C2PA itself is a provenance/authenticity standard. A valid C2PA credential proves that signed assertions are bound to media and have not been tampered with; it does not by itself decide whether the signer legally owns copyright.

For this reason the correct SmartAIHub product is:

```text
Rights Evidence
       +
Creation / Registration Certificate
       +
Trusted Timestamp
       +
Signed Provenance
       +
Media Watermark
       +
Perceptual / Acoustic Fingerprint
       +
Human-Readable Comparison
       +
Reproducible Verification Procedure
       ↓
Platform Review Pack
```

not merely:

```text
Watermark detected → "owner confirmed"
```

---

# 112. Implementation Priority for the New Evidence Layer

Insert these tasks before Cases/Evidence is considered production-ready:

```text
1. Rights Holder Profile
2. Rights Claim + Claim Scope
3. Component Rights Matrix
4. Creation/Registration Certificate
5. Evidence signing key + public key history
6. Trusted timestamp provider
7. Chain-of-custody events
8. Image PDQ + image watermark verification
9. Audio partial fingerprint provider
10. Public-verifiable watermark message mode
11. Detector-policy/calibration records
12. Reviewer instructions generator
13. External Reviewer Link
14. Offline Evidence Verifier
15. Platform Review Pack adapters
16. Evidence-readiness gate
```

The Cases module MUST consume these canonical records rather than inventing case-specific ownership data.

---

# 113. Revision 1.1 Final Architecture Principle

The system must make a reviewer able to distinguish:

```text
WHAT THE USER CLAIMS
WHAT SMARTAIHUB OBSERVED
WHAT WAS CRYPTOGRAPHICALLY SIGNED
WHAT A THIRD PARTY TIMESTAMPED
WHAT A SOCIAL PLATFORM PUBLISHED
WHAT THE MEDIA ANALYSIS FOUND
WHAT RIGHTS DOCUMENTS SUPPORT THE CLAIM
```

Every evidence item needs:

```text
source
timestamp
hash
signature/trust status
tool/version when calculated
confidence/threshold when analytical
```

That separation is the core requirement for evidence that can withstand external review.
