# Spec 227 — SmartAIHub Publishing Policy, EDSA & Platform Compliance Engine
## Policy-aware media production, multimodal compliance, EDSA context assurance, AI disclosure, monetization risk, evidence, approval, publishing and post-publish monitoring

**Status:** Proposed / Target policy-compliance architecture; implementation pending  
**Spec ID:** 227  
**Revision:** 6 — policy RAG evidence/retrieval boundary hardening under Spec 229
**Date:** 2026-09-22  
**Target repository path:** `specs/feature/227-policy-retrieval-alignment-canonical/spec.md`  
**Primary owner:** SmartAIHub Media / Publishing / Policy Platform  
**Primary reference implementation:** YouTube Community Guidelines + EDSA  
**Architecture scope:** Platform-wide, tenant-aware, multi-platform  
**Canonical execution:** existing `worker_jobs` / `worker_job_events` control plane  
**Canonical approval:** shared SmartAIHub Approval infrastructure  
**Canonical evidence storage:** SmartAIHub Library / R2 + relational policy metadata  
**Canonical retrieval:** structured Policy Registry as enforcement source-of-truth; RAG/Vector as retrieval/explanation support only  

**Depends on / integrates with:**
- Spec 187 — Content Provenance & Copyright Protection, where implemented;
- Spec 195/186 lineage — canonical async job / Runner control-plane capabilities, according to the current repository baseline;
- Spec 196 — Goal Orchestration / Capability / Command Gateway where applicable;
- Spec 199 — External MCP Gateway;
- Spec 200 — External Agent Gateway / coding-agent control-plane capabilities where applicable;
- Spec 208 — Hybrid Computer Use Engine, only for explicitly allowed user-assisted surfaces; undocumented YouTube endpoints MUST NOT be used;
- Spec 209 — AI Workflow Studio;
- Spec 212 — Workflow / Mini App Marketplace where publishing templates are exposed;
- Specs 214/215 — workflow node catalog and execution semantics;
- Specs 217+ — tenant / product / white-label capabilities where applicable;
- Spec 224 — Autonomous Development Orchestrator Runtime, as the canonical development-runtime owner and reusable orchestration-pattern reference;
- Spec 225 — Universal Agent Access, Mobile & Cross-Device Control Plane;
- Spec 226 — Device-Independent Agent Platform Upgrade & Compatibility Bridge, for external development-control/progress compatibility into Spec 224;
- existing SmartAIHub Media Studio, AI Director, Video Editor, Library, R2, RAG/Vector, approval, audit and identity infrastructure.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

The source tree contains adjacent policy services such as age/content safety, browser policy and policy-safe media fixtures, but no Spec 227 Policy Registry, YouTube/EDSA policy-pack ingestion, multimodal publishing compliance engine, certification service or platform publishing gateway was found. The official YouTube/EDSA material in this document is an external policy reference, not implementation evidence.

Spec 227 remains a target policy domain. Any future implementation must use existing media/artifact, approval, audit, billing and `worker_jobs` authorities and must not treat RAG retrieval as the enforcement source of truth.

# 0. Executive Decision

SmartAIHub SHALL implement a reusable **Policy-Aware Media Production, EDSA & Publishing Compliance Engine** that shapes media generation before expensive production, evaluates media throughout production and before/after publication, uses Skill-first semantic reasoning to preserve creative intent while repairing policy risks, records evidence for every decision, and prevents a content-generation workflow from treating either a single LLM judgment or a rigid keyword rewrite as policy approval.

The first reference adapter SHALL be YouTube, including:

1. Community Guidelines screening;
2. Educational, Documentary, Scientific or Artistic (EDSA) context evaluation;
3. policy-specific hard prohibitions and exception limits;
4. advertiser-friendly / monetization risk as a separate dimension;
5. altered/synthetic media disclosure;
6. copyright / rights / provenance integration;
7. age-restriction risk and sensitive-content handling;
8. metadata / thumbnail / external-link checks;
9. upload-readiness, private-first publishing and post-publish monitoring;
10. evidence and human-review workflows.

The engine SHALL be multi-platform by design. YouTube EDSA SHALL NOT be hard-coded into the core domain model. The core SHALL expose a platform-neutral policy contract, while YouTube-specific semantics SHALL live in a versioned adapter and policy pack.

The central product principles are:

> **Policy-aware creation, not policy checking at the final upload button.**
>
> **Skill-first semantic remediation, not string replacement.**
>
> **Engineering-loop-first optimization, not one-shot Skill execution.** Every remediation attempt SHALL feed its diagnosis, evidence, semantic delta, quality result and policy result into the next iteration.
>
> **Deep problem solving, not a prompt-rewrite loop.** When local prompt repair is insufficient, the runtime SHALL be able to re-diagnose the problem, change representation strategy, re-plan a shot/scene, switch capabilities/models/providers, invoke specialist or independent-review agents, decompose work into bounded subproblems, or escalate a genuine semantic decision to the creator.
>
> **Preserve semantic source-of-truth.** Lower-level prompt optimization SHALL NOT silently rewrite higher-level story facts, shot purpose, character intent, chronology or documentary meaning merely to improve policy readiness.
>
> **Decision gates are choices, not dead ends.** When a meaning-preserving repair cannot be found with sufficient confidence, the creator SHALL be offered a path to continue with the original/best candidate (with cost/risk warning) and a path to edit the semantic source before downstream regeneration.
>
> **Best-effort compliance without sacrificing artifact completion.** A video project SHALL be allowed to finish rendering even when internal platform-compliance readiness remains unresolved, unless a separate SmartAIHub safety/legal control requires otherwise.

Compliance SHALL be evaluated throughout the content lifecycle:

```text
IDEA / RESEARCH
    ↓
SOURCE & CLAIM GROUNDING
    ↓
SCRIPT
    ↓
STORYBOARD / SHOT PLAN
    ↓
ASSET GENERATION / INGEST
    ↓
TIMELINE EDIT
    ↓
PRE-FINAL POLICY SCAN
    ↓
AUTO-REMEDIATION / HUMAN REVIEW
    ↓
FINAL RENDER
    ↓
FINAL MULTIMODAL CERTIFICATION
    ↓
UPLOAD PRIVATE / UNLISTED AS POLICY ALLOWS
    ↓
PLATFORM CHECKS / HUMAN DECISION
    ↓
PUBLISH / SCHEDULE
    ↓
POST-PUBLISH MONITORING / POLICY DRIFT / APPEAL EVIDENCE
```

The system SHALL NOT claim that SmartAIHub can grant a YouTube EDSA exception. YouTube determines EDSA exceptions case-by-case. SmartAIHub may only report internal readiness states such as `EDSA_READY_INTERNAL`.

---

# 1. Official Policy Baseline Verified for Revision 1

Revision 1 is designed against official YouTube documentation verified on **2026-09-22**.

## 1.1 EDSA core behavior

YouTube states that content that would otherwise violate Community Guidelines may sometimes remain when it has Educational, Documentary, Scientific or Artistic context. Evaluation is case-by-case. YouTube evaluates both **WHAT context exists** and **WHERE the context appears**.

Official source:
- https://support.google.com/youtube/answer/6345162?hl=en
- Thai: https://support.google.com/youtube/answer/6345162?hl=th

## 1.2 High-harm context placement

For high-harm categories, context may need to be present in the **video or audio itself**, including categories such as hate speech, violent criminal organizations, child safety, suicide/self-harm and graphic violence. Context only in comments, tags, channel descriptions or pinned comments is not sufficient for EDSA evaluation.

## 1.3 Content for which EDSA may not be available

The official EDSA guidance identifies categories that may not receive an EDSA exception even when context is present, including specific forms of child sexual abuse material, violent sexual assault imagery/audio, acts of decapitation, certain perpetrator-filmed major violent-event footage, unmodified terrorist/criminal-organization propaganda reuploads, self-harm/suicide instructions, bomb-building instructions intended to injure or kill, firearm-manufacturing instructions, prohibited sales, serious malicious cyber instructions, doxxing, hardcore pornography and spam.

The exact list SHALL be stored in versioned policy data, not copied permanently into application code.

## 1.4 Advertiser-friendly policy is separate

Advertiser-friendly eligibility SHALL be evaluated independently from Community Guidelines / EDSA. Documentary or educational context may change ad suitability, but EDSA readiness does not imply full monetization eligibility.

Official source:
- https://support.google.com/youtube/answer/6162278?hl=en
- update log: https://support.google.com/youtube/answer/9725604?hl=en

The policy update log recorded an advertiser-friendly Violent Content clarification in **August 2026**; therefore policy packs MUST be versioned and periodically refreshed.

## 1.5 Altered / synthetic media disclosure

YouTube requires disclosure for meaningfully altered or generated realistic content in relevant cases, including making a real person appear to say/do something they did not, altering footage of a real event/place, or generating a realistic scene that did not occur.

Official source:
- https://support.google.com/youtube/answer/14328491?hl=en

The YouTube Data API exposes `status.containsSyntheticMedia` on video resources for supported insert/update operations.

Official source:
- https://developers.google.com/youtube/v3/docs/videos

There is no equivalent public `edsa=true` property that grants or declares an EDSA exception. The adapter SHALL NOT invent one.

## 1.6 YouTube upload checks

YouTube supports upload-time checks for copyright and, for eligible monetizing creators, ad suitability. Private videos may be reviewed. Results can later change and MUST NOT be treated as immutable certification.

Official sources:
- https://support.google.com/youtube/answer/7561938?hl=en
- https://support.google.com/youtube/answer/16271309?hl=en
- https://support.google.com/youtube/answer/57407?hl=en

---

# 2. Problem Statement

SmartAIHub can generate scripts, images, video, audio, edits, subtitles, metadata and publishable media. Without a first-class policy layer, an automated content pipeline has several unacceptable failure modes:

- policy is checked only after expensive generation/rendering is finished;
- a script is safe but final footage is not;
- a source clip is allowed only with contextual narration, but the final edit removes the narration;
- context exists only in the description when the applicable policy requires video/audio context;
- an alternate language dub omits the countervailing context;
- a Shorts crop removes an on-screen warning or contextual text;
- an AI-generated realistic reconstruction is published without required disclosure;
- Community Guidelines pass while monetization risk remains high;
- copyrighted footage is mistaken for EDSA permission;
- content is changed after internal review without invalidating the previous result;
- policy text changes but old decisions are never re-evaluated;
- an LLM outputs “safe” without evidence, policy version or deterministic rule trace;
- operators cannot explain why a video was published after it is flagged later.

Spec 227 closes these gaps.

---

# 3. Goals

The implementation SHALL:

1. provide a platform-neutral Publishing Compliance Engine;
2. ship YouTube as the first production policy adapter;
3. perform multimodal analysis of final content, not script-only analysis;
4. model EDSA WHAT/WHERE context explicitly;
5. distinguish platform no-exception / destination-restriction findings from remediable context deficiencies without treating either as video-production failure;
6. separate Community Guidelines, EDSA, monetization, copyright, privacy, AI disclosure and audience classification;
7. integrate policy checks into creation workflows before final render;
8. offer safe automatic remediation where edits are allowed, with prompt/script/media remediation implemented Skill-first and semantically verified;
9. bound automatic repair/regeneration loops by attempt, cost and time budgets, then warn-and-complete instead of trapping the creative workflow;
10. require human review at configurable risk thresholds;
11. produce tamper-evident evidence bundles;
12. support policy versioning, diffing and re-certification;
13. support tenant-specific policy overlays without weakening SmartAIHub safety/legal controls;
14. support multilingual video, captions, dubbing and localized metadata;
15. support derivative formats such as Shorts and reframed exports;
16. provide APIs, workflow nodes and UI suitable for SmartAIHub Media Studio;
17. integrate with existing worker job / Runner infrastructure;
18. remain compatible with future Facebook, Instagram, TikTok, X and other platform adapters.

---

# 4. Non-Goals

Spec 227 SHALL NOT:

- guarantee that any platform will accept or monetize content;
- claim to provide legal advice;
- replace copyright licensing or rights clearance;
- bypass, evade or manipulate platform moderation;
- use undocumented/private platform APIs to force a status;
- automate appeals with fabricated evidence;
- treat EDSA as a user-controlled exemption flag;
- allow tenant policy overrides to relax mandatory platform or SmartAIHub safety blocks;
- make RAG retrieval success equivalent to policy permission;
- use a single scalar “safe score” as the only publication gate;
- implement prompt remediation primarily as hard-coded token substitution, regex rewriting, banned-word replacement or static negative-prompt injection;
- make internal compliance readiness a prerequisite for completing or rendering an otherwise valid creative project;
- create an unbounded regenerate-until-pass loop.

---

# 5. Terminology

## 5.1 Policy Pack
A versioned collection of normalized rules for a platform, policy family, locale and effective date.

## 5.2 Rule
A deterministic or model-assisted policy condition with source provenance, severity, input requirements and decision semantics.

## 5.3 Finding
A content-specific observation indicating that a rule may apply.

## 5.4 Evidence
The source artifact, timestamp, frame, transcript span, metadata field, policy clause and model/rule trace supporting a finding.

## 5.5 EDSA Context Map
A structured representation of WHAT contextual information exists, WHERE it exists and which risky segment it contextualizes.

## 5.6 Internal Readiness
SmartAIHub’s own pre-publication determination. It is not a platform decision.

## 5.7 Certification Snapshot
Immutable record of content hashes + policy pack versions + findings + decisions at a point in time.

## 5.8 Certification Invalidation
State transition triggered when content, metadata, policy pack or material evidence changes after certification.

## 5.9 Engineering Compliance Loop
A durable, bounded optimization loop that repeatedly diagnoses unresolved findings, selects a materially different repair strategy, invokes the appropriate Skill/model/capability, verifies semantic fidelity and media quality, re-scans policy readiness, and records what was learned for the next iteration. A single Skill call is never considered the complete remediation workflow.

## 5.10 Semantic Source of Truth
The highest-level creator-authored or creator-approved artifact that defines what the content **means**, rather than merely how it is rendered. Examples include a Series Bible, episode outline, scene summary, shot synopsis, documentary claim/evidence record or creator-approved script. Lower-level artifacts such as storyboard prompts, image prompts and video prompts derive from this source and MUST NOT silently redefine it.

## 5.11 Structural Replan
A remediation step that changes composition or production structure rather than merely rewriting words in a prompt. Examples include changing shot coverage, splitting one risky shot into contextual and action shots, replacing a direct depiction with aftermath/reaction coverage, moving context narration, or rebuilding a scene plan while preserving the creator-approved semantic source.

## 5.12 Problem-Solving Escalation
The progression from cheap/local repair to deeper strategies when the current hypothesis fails. It MAY escalate through semantic Skills, structural replanning, alternate models/providers, specialist agents, independent critics, bounded subruns and finally a creator semantic-decision gate. Escalation is evidence-driven; repeating the same failed tactic is not escalation.

## 5.13 Semantic Drift Decision Gate
A durable, non-terminal decision point used when a proposed remediation would materially change a semantic source of truth, when semantic fidelity is uncertain, or when the next meaningful attempt will spend material credits without a sufficiently credible meaning-preserving plan. The gate MUST offer at least a creator-controlled continuation path and an edit-source path.

## 5.14 Best-Effort Continuation Authority
An explicit creator or tenant policy allowing the runtime to continue production with the original intent or best usable candidate despite unresolved platform-readiness risk, within a bounded credit/attempt budget. This authority does not override independent SmartAIHub safety/legal controls.

---

# 6. Normative Architecture Principles

1. **Structured policy facts own deterministic state; Skills own semantic remediation.** Code/rules SHALL determine policy versions, evidence requirements, permissions, retry budgets, state transitions and explicit platform facts. Prompt/script/context rewriting SHALL default to model-reasoning Skills rather than brittle string substitution.
2. **Skill-first is mandatory for meaning-bearing transformations.** Any remediation that can alter creative intent, factual meaning, chronology, character identity, scene intent, EDSA context or narrative emphasis SHALL execute through a registered SmartAIHub Skill or equivalent governed reasoning capability with an explicit input/output contract.
3. **Engineering-loop does not mean prompt-loop.** Prompt repair is only the cheapest strategy tier. The runtime MUST support diagnosis, structural replanning, capability switching, specialist/critic invocation, bounded problem decomposition and creator decision when those are more appropriate.
4. **Semantic fidelity is a first-class acceptance criterion.** A policy fix is invalid if it materially changes the requested meaning merely to obtain a cleaner classifier result.
5. **Semantic source-of-truth has precedence over derived prompts.** A lower-level remediation SHALL NOT silently rewrite higher-level story/documentary facts. Crossing that boundary requires a semantic decision or explicit creator policy.
6. **RAG assists; it does not authorize.** Missing retrieval results MUST NOT be interpreted as permission.
7. **Final render is canonical for publication readiness, not for creative completion.** Script, storyboard and timeline scans are advisory; the final rendered artifact is scanned for publication readiness, while rendering itself remains independently completable.
8. **Policy decisions are multidimensional.** No single `safe=true` flag.
9. **Evidence accompanies every high-risk decision and every material remediation.**
10. **Policy packs are immutable once activated.** Updates create new versions.
11. **Changed content invalidates prior publication-readiness certification, not the existence/completion of the video artifact.**
12. **The system SHALL try hard before escalating to the user.** It SHALL exhaust reasonable autonomous strategies that do not materially change creator intent or exceed authorized cost/risk boundaries.
13. **User interruption occurs at a semantic/cost boundary, not at the first model failure.** A failed Skill call, failed prompt rewrite or failed generation candidate is an engineering observation, not automatically `ACTION_REQUIRED`.
14. **Decision gates SHALL preserve creator agency.** When semantic drift becomes material, the UI MUST offer at least `Continue with Original Intent / Best Candidate` and `Edit Semantic Source`, with optional AI-proposed alternatives.
15. **Compliance repair loops are bounded but effortful.** Exhausting attempt/cost/time/capability budgets SHALL produce a warning/review state and a completed best-usable artifact whenever rendering is otherwise possible; it SHALL NOT create an infinite or terminal creative-workflow block.
16. **Best-candidate preservation is mandatory.** Every loop SHALL maintain a ranked `best_candidate_so_far` so failed later attempts cannot destroy a better earlier result.
17. **Internal platform-policy uncertainty is warn/review by default.** `UNKNOWN`, `REMEDIATION_EXHAUSTED_WARNING` or `NOT_READY_FOR_PLATFORM` SHALL NOT equal `VIDEO_FAILED`.
18. **Human judgment remains first-class but is not the default repair mechanism.** Automation SHALL surface genuine editorial choices rather than asking the user to manually repair machine-fixable prompts.
19. **Platform-native verdicts outrank internal predictions.** If YouTube reports a restriction, SmartAIHub stores the observed platform result.
20. **Publication handling is scoped and user-controlled.** A platform-specific advisory MAY pause unattended auto-publication according to channel policy or require explicit acknowledgment, but MUST NOT block project editing, rendering, Library storage, download/export, duplication or remediation work unless a separate SmartAIHub safety/legal control requires it.
21. **Spec 224/226 are not media-runtime ownership.** Spec 224 owns software-development runs; Spec 226 bridges development control/progress into Spec 224. Spec 227 MAY reuse shared durable orchestration primitives/patterns exposed by that architecture but SHALL NOT turn ordinary media remediation into a `DevelopmentRun`.
22. **No duplicate orchestration authority.** If shared durable orchestration primitives such as recovery, decision epochs, subrun DAG, budget guards or harness strategy are available as platform services, Spec 227 SHALL consume them through stable interfaces rather than fork a second incompatible implementation.
23. **No undocumented API dependency.** Integrations MUST use official APIs, allowed browser surfaces, manual import or approved connectors.
24. **Tenant isolation is mandatory.** Policy evidence for one tenant SHALL NOT leak to another.

---

# 7. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                   SmartAIHub Creation Layer                 │
│ Research │ Script │ Media Gen │ Video Editor │ Metadata    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Publishing Compliance Orchestrator              │
│ lifecycle │ invalidation │ policy gates │ approvals         │
└──────────────┬──────────────────┬───────────────────────────┘
               │                  │
               ▼                  ▼
┌────────────────────────┐  ┌─────────────────────────────────┐
│ Policy Intelligence     │  │ Multimodal Content Intelligence│
│ Registry                │  │ ASR / OCR / frames / audio     │
│ Source snapshots        │  │ scene graph / metadata         │
│ Rule compiler           │  │ thumbnail / links / language   │
│ Policy diff             │  └──────────────┬──────────────────┘
└────────────┬───────────┘                 │
             └───────────────┬─────────────┘
                             ▼
                  ┌────────────────────────┐
                  │ Decision & EDSA Engine │
                  │ destination restrictions│
                  │ WHAT/WHERE evaluation  │
                  │ risk dimensions        │
                  └───────────┬────────────┘
                              │
                  ┌───────────┴────────────┐
                  ▼                        ▼
        ┌──────────────────────────┐      ┌───────────────────┐
        │ Problem-Solving / Repair │      │ Approval / Review │
        │ Skill-first remediation  │      │ Semantic decision │
        │ diagnose / replan        │      │ cost/credit choice│
        │ model/provider/specialist│      │ review evidence   │
        └────────────┬─────────────┘      └─────────┬─────────┘
                     └────────────┬─────────────────┘
                               ▼
                     ┌──────────────────┐
                     │ Final Certifier  │
                     │ hashes + bundle  │
                     └────────┬─────────┘
                              ▼
               ┌────────────────────────────┐
               │ Platform Publishing Adapter│
               │ YouTube first              │
               └────────────┬───────────────┘
                            ▼
               ┌────────────────────────────┐
               │ Post-Publish Monitor       │
               │ restrictions / drift       │
               │ incidents / appeal evidence│
               └────────────────────────────┘
```

---

# 8. Core Services

## 8.1 `PolicyRegistryService`
Responsibilities:
- store normalized policy packs;
- store source URLs and snapshots;
- track effective date, retrieval date and locale;
- activate/deprecate policy pack versions;
- expose machine-readable rules;
- prohibit silent mutation of active versions.

## 8.2 `PolicySourceIngestor`
Responsibilities:
- fetch approved official sources;
- hash source content;
- identify changed sections;
- queue policy-diff jobs;
- flag parsing ambiguity for review;
- never auto-activate semantic changes without configured governance.

## 8.3 `MultimodalContentAnalyzer`
Responsibilities:
- scene detection;
- frame sampling;
- OCR;
- ASR/transcript alignment;
- speaker/narration labeling where relevant;
- audio event classification;
- image/video risk classification;
- metadata/thumbnail/link inspection;
- language identification;
- mapping findings to timeline ranges.

## 8.4 `PolicyDecisionEngine`
Responsibilities:
- compile platform rules into executable decisions;
- evaluate platform no-exception / destination-restriction rules;
- invoke model-assisted classifiers with bounded schemas;
- aggregate multidimensional outcomes;
- produce rule traces.

## 8.5 `EdsaContextEngine`
Responsibilities:
- determine whether EDSA is relevant;
- map WHAT context;
- map WHERE context;
- evaluate proximity and semantic connection between risky content and context;
- enforce audio/video placement requirements where policy requires it;
- prevent metadata-only context from satisfying an A/V requirement.

## 8.6 `ComplianceRemediationEngine`
Responsibilities:
- propose corrections;
- estimate impact;
- apply user-authorized edits to script/timeline/metadata;
- rescan only impacted regions during iteration;
- always require full final certification after final render.

## 8.6A `ProblemSolvingEscalationController`
Responsibilities:
- classify whether the unresolved issue is prompt-level, representation-level, narrative/semantic, capability/provider, evidence/context, or irreducible platform conflict;
- maintain an evidence-backed hypothesis ledger;
- choose the next materially different strategy rather than repeat an ineffective call;
- escalate from local Skill repair to structural replan, alternate capability/provider, specialist/critic agents, or bounded subproblems;
- preserve `best_candidate_so_far`;
- decide when autonomous work has reached a semantic or authorized-cost boundary;
- create a `SemanticDriftDecision` rather than a generic error when creator input is genuinely required.

## 8.6B `SemanticDecisionService`
Responsibilities:
- bind the decision to the exact semantic-source version, candidate lineage, policy findings and cost estimate;
- expose `CONTINUE_ORIGINAL_INTENT`, `EDIT_SEMANTIC_SOURCE`, optional `USE_AI_ALTERNATIVE`, and `CANCEL` choices as policy permits;
- support a bounded continuation budget so the creator can authorize additional image/video generation without repeated prompts;
- invalidate only affected downstream artifacts when the creator edits a shot/scene source;
- allow unaffected branches/scenes to continue while one branch waits for a decision.

## 8.7 `CertificationService`
Responsibilities:
- hash final render and associated artifacts;
- bind policy versions;
- generate evidence bundle;
- transition to a publication-ready internal state;
- invalidate on material change.

## 8.8 `PlatformPublishingGateway`
Responsibilities:
- route to platform adapters;
- map canonical metadata to platform fields;
- enforce pre-upload gates;
- store remote IDs/statuses;
- surface manual/user-assisted steps when no official API exists.

## 8.9 `PostPublishPolicyMonitor`
Responsibilities:
- ingest platform-side changes/restrictions when accessible;
- detect policy version drift;
- schedule re-evaluation when configured;
- notify creators/admins;
- assemble appeal/review evidence without fabricating claims.

---

# 9. Policy Registry Data Model

Minimum tables/entities:

```text
policy_platforms
policy_families
policy_packs
policy_pack_sources
policy_rules
policy_rule_versions
policy_rule_dependencies
policy_rule_examples
policy_pack_activation
policy_source_snapshots
policy_diff_runs
policy_governance_reviews
```

## 9.1 `policy_packs`

Required fields:

```text
id UUID PK
platform_key TEXT
policy_family_key TEXT
version TEXT
locale TEXT
effective_from TIMESTAMPTZ NULL
effective_to TIMESTAMPTZ NULL
retrieved_at TIMESTAMPTZ
source_hash TEXT
schema_version INT
status ENUM(DRAFT, REVIEW_REQUIRED, ACTIVE, SUPERSEDED, REJECTED)
created_by
approved_by NULL
created_at
activated_at NULL
```

## 9.2 Rule schema

```json
{
  "rule_id": "youtube.edsa.high_harm.av_context_required",
  "version": "2026-09-22.1",
  "policy_family": "community_guidelines_edsa",
  "severity": "HIGH",
  "inputs": ["video", "audio", "transcript", "metadata"],
  "when": {
    "category_in": [
      "hate_speech",
      "violent_criminal_organizations",
      "child_safety",
      "suicide_self_harm",
      "graphic_violence"
    ]
  },
  "require": {
    "context_location_any": ["VIDEO", "AUDIO"]
  },
  "on_failure": "EDSA_CONTEXT_REQUIRED",
  "source_refs": ["official-youtube-edsa-source-id"]
}
```

Rules SHALL support deterministic predicates, model-assisted evidence fields and required human-review flags.

---

# 10. Policy Source Governance

Policy ingestion SHALL follow:

```text
FETCH OFFICIAL SOURCE
    ↓
SNAPSHOT + HASH
    ↓
NORMALIZE
    ↓
SEMANTIC DIFF
    ↓
RULE IMPACT ANALYSIS
    ↓
NO MATERIAL CHANGE ──→ record freshness
    │
    └ MATERIAL CHANGE
          ↓
      REVIEW_REQUIRED
          ↓
  authorized policy review
          ↓
       ACTIVATE
          ↓
identify affected certifications
```

A source fetch failure SHALL NOT delete the last valid active policy pack.

Policy source trust tiers:

```text
TIER 1  Official platform documentation / official developer docs
TIER 2  Official platform announcements / policy update notices
TIER 3  authoritative legal/regulatory source where applicable
TIER 4  secondary explanation — retrieval only, never enforcement authority
```

EDSA enforcement SHALL use Tier 1/2 platform sources.

---

# 11. RAG / Vector Policy Knowledge

SmartAIHub SHALL embed policy documents, examples, internal implementation notes and historical decisions for retrieval.

However:

```text
Structured Policy Registry = normative enforcement
Vector / Hybrid Search      = retrieval / explanation / example matching
Reranker                    = relevance improvement
LLM                         = bounded reasoning / explanation
```

The policy RAG pipeline SHOULD support:
- lexical BM25 or equivalent;
- vector semantic retrieval;
- metadata filters (`platform`, `policy_family`, `version`, `locale`, `effective_date`);
- fusion / hybrid ranking;
- reranking;
- source-line/span citation;
- stale-version suppression;
- no-result and conflict handling.

A compliance verdict MUST retain references to the structured rule IDs even when supporting prose was retrieved through RAG.

---

# 12. Content Object Model

A publication candidate SHALL be treated as a graph, not just one MP4.

```text
PublicationCandidate
 ├── master_video
 ├── audio_tracks[]
 ├── subtitle_tracks[]
 ├── chapters[]
 ├── title_localizations[]
 ├── descriptions[]
 ├── thumbnail_variants[]
 ├── tags / hashtags
 ├── external_links[]
 ├── source_assets[]
 ├── generated_assets[]
 ├── timeline_project
 ├── source_claims[]
 ├── licenses[]
 ├── provenance_records[]
 └── platform_targets[]
```

Certification SHALL bind all materially relevant children by cryptographic hash or immutable version identifier.

---

# 13. Multimodal Analysis Requirements

## 13.1 Video
The analyzer SHOULD inspect:
- shot boundaries;
- representative keyframes;
- high-motion/high-risk windows;
- content around detected risky scenes;
- overlays and captions;
- transitions that may alter perceived context;
- visible injuries, weapons, nudity, self-harm, minors and other policy categories as supported by approved classifiers.

## 13.2 Audio
Analyze:
- speech transcript;
- narration vs quoted/source audio where feasible;
- language;
- policy-sensitive statements;
- contextual condemnation/counterpoint;
- instructions vs reporting/descriptive discussion.

## 13.3 OCR / on-screen text
OCR SHALL be time-aligned and language-tagged.

## 13.4 Thumbnail
Thumbnail findings SHALL be separate because platform policies can treat thumbnails differently from body content.

## 13.5 Metadata
Inspect title, description, hashtags and outbound links.

## 13.6 Sampling safety
Uniform frame sampling alone is insufficient. The analyzer SHOULD combine:
- scene boundaries;
- semantic-triggered dense sampling;
- transcript-triggered windows;
- vision classifier-triggered windows;
- edit-decision-list changes;
- source asset risk inheritance.

---

# 14. Scene-Level Risk Graph

Each final video SHALL produce a scene/risk graph:

```json
{
  "scene_id": "sc_023",
  "start_ms": 134000,
  "end_ms": 157000,
  "languages": ["th"],
  "risk_findings": [
    {
      "category": "graphic_violence",
      "severity": "HIGH",
      "evidence": ["frame:sc_023:18", "transcript:134.2-139.8"]
    }
  ],
  "context_links": ["ctx_112"],
  "source_asset_ids": ["asset_911"]
}
```

Risk SHALL be represented temporally. Whole-video labels are insufficient for remediation and evidence.

---

# 15. EDSA Context Model

The EDSA engine SHALL explicitly capture **WHAT** and **WHERE**.

## 15.1 WHAT context
Possible contextual elements include:
- identity of persons/entities where relevant;
- description of what is happening;
- time/date;
- place;
- purpose for showing the content;
- historical/journalistic/scientific explanation;
- condemnation or countervailing viewpoint where policy-relevant;
- consequences / safety framing;
- distinction between quoted material and creator endorsement;
- source provenance.

Presence of these fields is evidence, not automatic qualification.

## 15.2 WHERE context

```text
VIDEO_VISUAL
AUDIO_NARRATION
AUDIO_SOURCE
TITLE
DESCRIPTION
CAPTIONS
COMMENTS              (non-qualifying for rules that require stronger placement)
PINNED_COMMENT         (non-qualifying where platform says it may not count)
CHANNEL_DESCRIPTION    (non-qualifying where platform says it may not count)
```

The policy rule determines allowed locations.

## 15.3 Context proximity
Context SHOULD be linked to the risky segment, not merely present anywhere in the asset.

A configurable proximity model SHALL consider:
- same scene;
- immediately preceding narration;
- immediately following explanation;
- persistent overlay;
- chapter-level framing;
- whole-video framing only when policy and semantic analysis support it.

A generic disclaimer at the beginning of the video SHALL NOT automatically satisfy scene-specific context requirements.

---

# 16. EDSA Internal Status Model

Allowed internal states:

```text
EDSA_NOT_EVALUATED
EDSA_NOT_REQUIRED
EDSA_POTENTIALLY_RELEVANT
EDSA_CONTEXT_REQUIRED
EDSA_CONTEXT_PRESENT_UNVERIFIED
EDSA_READY_INTERNAL
EDSA_REVIEW_RECOMMENDED
EDSA_NOT_AVAILABLE_FOR_RULE
EDSA_BLOCKED_BY_POLICY
EDSA_INVALIDATED
```

Forbidden naming in UI/API:

```text
EDSA_APPROVED
YOUTUBE_EDSA_APPROVED
EDSA_GUARANTEED
```

unless the value is a verbatim external platform decision from a documented platform surface and is clearly labeled as external.

---

# 17. Platform Publication Restriction Classification

The YouTube adapter SHALL maintain a rule set for content types for which EDSA may not be available under current official guidance. These rules classify **destination publication readiness**; they do not define whether the creative artifact is allowed to finish rendering.

Decision flow:

```text
policy violation candidate
      ↓
no-exception / destination-prohibited rule?
      ├── YES → NOT_READY_FOR_PLATFORM / PUBLISH_RESTRICTED
      │          + preserve project/video completion
      │          + allow non-destructive remediation attempts where meaningful
      └── NO
            ↓
      EDSA potentially relevant?
            ├── NO → normal policy decision
            └── YES → EDSA Context Engine
```

Automatic remediation SHALL NOT attempt to “context-wash” a no-exception category. If the system cannot make the candidate suitable without changing the creator's intended meaning, it SHALL stop remediation, preserve the completed artifact, explain the destination risk and require a user decision before any affected automated publication action.

---

# 18. Multi-Dimensional Decision Model

Every candidate SHALL expose independent dimensions.

Minimum dimensions:

```text
community_guidelines
edsa_readiness
advertiser_suitability
copyright_rights
synthetic_media_disclosure
age_restriction_risk
privacy_pii
child_audience
thumbnail_metadata
external_links
source_grounding
platform_api_readiness
```

Each dimension uses:

```text
NOT_EVALUATED
CLEAR
INFO
WARNING
REMEDIATION_REQUIRED
HUMAN_REVIEW_RECOMMENDED
NOT_READY_FOR_PLATFORM
EXTERNAL_DECISION_PENDING
EXTERNAL_RESTRICTED
UNKNOWN
```

The final gate SHALL be policy-composed from these dimensions.

---

# 19. Decision Confidence and Uncertainty

Model confidence MAY be stored, but publication logic SHALL NOT use one global model probability.

For high-risk rules:
- low confidence -> continue engineering loop where repairable; otherwise warn/review and, for unattended auto-publication only, pause according to channel policy;
- conflicting models -> human review;
- missing modality -> incomplete scan;
- missing policy source -> policy review required;
- unsupported language -> fallback translation + human review according to risk.

The UI SHALL show **why** a decision is uncertain.

---

# 20. Skill-First Semantic Remediation Engine

Remediation SHALL be **Skill-first** whenever the change carries meaning. The default implementation MUST NOT rewrite prompts by hard-coded word replacement, regex substitution, static banned-word deletion, or blindly appending generic negative prompts.

Canonical path:

```text
finding + creative intent + source evidence + scene context
+ active policy constraints + provider capabilities
        ↓
Capability Resolver
        ↓
Remediation Skill
        ↓
semantic candidate(s)
        ↓
Semantic Fidelity Verifier
        ↓
Policy/Quality Re-scan
        ↓
accept / retry / warn-and-complete
```

The Capability Resolver SHOULD prefer registered SmartAIHub Skills appropriate to the artifact type, for example:

```text
policy.prompt.image.remediate
policy.prompt.video.remediate
policy.script.context.remediate
policy.edsa.context.compose
policy.narration.context.compose
policy.storyboard.remediate
policy.thumbnail.remediate
policy.metadata.remediate
policy.timeline.remediate
policy.semantic_fidelity.verify
```

Skills MAY use the user's selected model, SmartAIHub-managed models, or an approved external harness through the existing capability architecture. The Skill contract SHALL preserve the original goal and explicitly return what it changed and why.

Supported remediation classes MAY include:

```text
SCRIPT_REWRITE
IMAGE_PROMPT_REWRITE
VIDEO_PROMPT_REWRITE
STORYBOARD_REPLAN
ADD_NARRATION
ADD_CONTEXT_CARD
ADD_ONSCREEN_LABEL
ADD_SOURCE_ATTRIBUTION
BLUR_REGION
CROP_REGION
TRIM_SEGMENT
REPLACE_SEGMENT
MUTE_AUDIO_RANGE
REPLACE_AUDIO_RANGE
ADD_WARNING
ADD_COUNTERVAILING_CONTEXT
ADD_CAPTION_CONTEXT
CHANGE_TITLE
CHANGE_DESCRIPTION
CHANGE_THUMBNAIL
REMOVE_EXTERNAL_LINK
SET_SYNTHETIC_MEDIA_DISCLOSURE
REQUEST_LICENSE_EVIDENCE
REQUEST_HUMAN_REVIEW
```

Every meaning-bearing remediation SHALL include:
- affected finding IDs;
- original creative intent / scene intent;
- source evidence that must remain true;
- policy constraint being addressed;
- planned content change;
- semantic-delta explanation;
- expected policy dimension impact;
- whether human approval is required;
- whether the edit is reversible;
- before/after artifact versions;
- Skill ID + Skill version + model/provider execution trace where permitted;
- Semantic Fidelity Verifier result.

## 20.1 Semantic Fidelity Contract

The remediation Skill SHALL optimize for **minimal semantic change** rather than merely maximizing a policy classifier score.

It MUST preserve, unless the user explicitly approves a change:
- subject identity;
- factual claims supported by sources;
- chronology;
- narrative purpose;
- emotional intent where compatible with policy;
- required characters/objects/locations;
- shot purpose and continuity;
- documentary/editorial context;
- user-specified visual style except where the risky representation itself is the issue.

A candidate SHALL be rejected by the Semantic Fidelity Verifier when the compliance improvement is achieved mainly by removing or distorting the central requested meaning.

## 20.2 Coding Boundary

Deterministic code SHOULD be used for:
- assembling Skill inputs;
- retrieving policy facts and constraints;
- validating schemas;
- permission checks;
- retry/budget accounting;
- artifact versioning;
- diffing;
- routing;
- state transitions;
- audit/evidence capture.

Deterministic code MUST NOT be the primary semantic author for complex prompt repair.

Simple mechanical edits MAY remain code-based when meaning cannot materially change, for example setting a disclosure boolean, removing an invalid external URL, or attaching already-approved metadata.

## 20.3 Deep Engineering Problem-Solving Loop

For image/video generation and every meaning-bearing remediation, the unit of work is a **problem-solving engineering loop**, not a single Skill call and not merely a repeated prompt rewrite.

Canonical cycle:

```text
creative intent + semantic source + evidence + policy constraints
      ↓
preflight diagnosis / constraint conflict detection
      ↓
produce / select candidate
      ↓
content + quality + continuity + semantic + policy scan
      ↓
PASS ─────────────────────────────────────────────→ accept
      │
      └─ NOT READY
          ↓
      classify failure class
          ↓
      update hypothesis ledger
          ↓
      select next strategy tier
          ↓
      execute Skill / replan / alternate capability / specialist
          ↓
      semantic fidelity + factual + continuity verify
          ↓
      policy re-scan
          ↓
      compare against best_candidate_so_far
          ↓
      learn attempt result
          ↓
      continue / escalate / semantic decision / warning-complete
```

### 20.3.1 Failure / Problem Classification

At minimum, unresolved work SHALL be classified into one or more of:

```text
PROMPT_EXPRESSION_FAILURE
REPRESENTATION_CONFLICT
CONTEXT_PLACEMENT_FAILURE
NARRATIVE_SEMANTIC_CONFLICT
FACTUAL_OR_EVIDENCE_CONFLICT
CONTINUITY_CONFLICT
MODEL_CAPABILITY_LIMIT
PROVIDER_POLICY_LIMIT
TOOL_OR_RUNTIME_FAILURE
COST_BUDGET_BOUNDARY
POLICY_AMBIGUITY
IRREDUCIBLE_PLATFORM_CONFLICT
UNKNOWN
```

This classification matters because a `NARRATIVE_SEMANTIC_CONFLICT` SHALL NOT be “fixed” by endlessly rewriting the same prompt, and a `MODEL_CAPABILITY_LIMIT` SHOULD normally try a different capability/provider rather than mutate the story.

### 20.3.2 Escalation Ladder

The controller SHALL progress through the cheapest credible strategy that addresses the diagnosed failure. It MAY skip tiers when evidence shows they are irrelevant.

```text
T0  deterministic/mechanical fix
    disclosure flag, metadata attachment, already-approved overlay placement

T1  Skill-first semantic prompt/context repair
    preserve semantic source; rewrite expression only

T2  representation repair
    camera distance, composition, timing, indirect depiction, context placement

T3  structural shot/scene replan
    split/reorder shots, add reaction/aftermath/context shot, rebuild storyboard
    WITHOUT silently changing higher-level story facts

T4  capability strategy change
    alternate model/provider/seed/mode/tool or regenerate only affected segment

T5  specialist / critic / multi-agent problem solving
    ask a specialist Skill/agent for alternatives; optionally use independent critic
    or bounded parallel proposals; synthesize rather than blindly choose one answer

T6  semantic-source decision boundary
    proposed solution now requires changing creator-approved shot/scene/story meaning
    or spending material credits without a sufficiently credible preservation plan
    → create Semantic Drift Decision Gate

T7  best-effort completion
    continue with creator-authorized original intent / best candidate or warning-complete
```

Repeated execution of the same effective strategy SHALL NOT count as meaningful progress merely because the prompt text differs.

### 20.3.3 Evidence-Driven Attempt Memory

Each iteration MUST record at least:
- unresolved finding IDs;
- failure/problem classification;
- hypothesized root cause;
- strategy tier and concrete strategy;
- why it differs from prior failed strategies;
- Skill/model/provider/version used;
- source semantic version;
- original and transformed prompt/script/scene references;
- semantic-fidelity result;
- quality/continuity result;
- policy-readiness delta;
- incremental cost/time;
- candidate rank relative to `best_candidate_so_far`;
- failed hypothesis markers;
- next recommended strategy if unresolved.

The controller SHOULD stop revisiting a hypothesis that repeatedly failed without new evidence.

### 20.3.4 Bounded Subproblem Decomposition

For complex failures, one giant prompt SHALL NOT be the only repair mechanism. The controller MAY create bounded subproblems such as:

```text
Subproblem A — preserve required plot action
Subproblem B — find a less risky visual representation
Subproblem C — compose EDSA context
Subproblem D — verify character/continuity locks
Subproblem E — estimate platform-readiness delta
        ↓
      JOIN / SYNTHESIZE
```

Subproblems MAY be executed by different Skills/models/agents when authorized. Their outputs are proposals/evidence; the parent Spec 227 loop remains the owner of media-compliance state.

### 20.3.5 Adaptive Budgets and Cost Awareness

The loop MUST be bounded by all configured limits that apply:

```text
max_attempts
max_strategy_escalations
max_incremental_cost
max_elapsed_runtime
provider_rate_limit_budget
user/tenant credit budget
max_parallel_proposals
```

Budgets SHALL be adaptive. Cheap reasoning, diagnosis and prompt alternatives MAY receive more iterations than image/video generations. Before a **materially expensive** next attempt, the runtime SHALL consider whether it has a credible meaning-preserving hypothesis. If not, it SHALL enter the Semantic Drift & Credit Decision Gate rather than burn credits blindly.

A creator or tenant MAY pre-authorize a bounded continuation envelope, for example:

```text
continue_with_original_intent = true
max_additional_video_attempts = 2
max_additional_credits = 30
```

Within that envelope the runtime may continue without repeatedly interrupting the user.

### 20.3.6 Honest Repair Ceiling

Spec 227 SHALL NOT claim that every policy conflict is solvable. The loop terminates or pauses only when one of these conditions is reached:

```text
READY_INTERNAL
SEMANTIC_DECISION_REQUIRED
NO_MEANING_PRESERVING_REPAIR_FOUND
REMEDIATION_BUDGET_EXHAUSTED
PROVIDER_CAPABILITY_EXHAUSTED
IRREDUCIBLE_PLATFORM_CONFLICT
USER_CANCELLED
SEPARATE_SAFETY_OR_LEGAL_CONTROL
```

`SEMANTIC_DECISION_REQUIRED` is a resumable state, not failure. For the other non-safety unresolved outcomes, the runtime SHALL preserve the best usable candidate and SHALL retain a path to finish the creative artifact with a warning.

## 20.4 Best-Candidate Selection and Non-Destructive Recovery

Every remediation loop SHALL preserve immutable candidate lineage. A candidate MAY replace the current working candidate only when it improves the configured objective without violating semantic-fidelity floors.

Canonical ranking dimensions:

```text
semantic_fidelity         hard floor
factual_fidelity          hard floor for grounded content
character/object lock     hard floor where required
continuity                weighted
creative_quality          weighted
policy_readiness          weighted
platform-specific risk    weighted
generation cost/time      tie-breaker / budget signal
```

A policy-clean candidate that materially changes the requested meaning SHALL rank below a semantically correct candidate with a warning. Compliance optimization SHALL NOT erase the user's core intent merely to obtain a cleaner classifier score.

## 20.5 User Interruption Policy

The compliance subsystem SHALL NOT surface a generic error such as `prompt failed policy check; please rewrite` while autonomous repair options remain. It SHALL continue diagnosis/escalation automatically.

The user SHOULD be interrupted only when:
- a proposed repair crosses the semantic source-of-truth boundary;
- multiple materially different editorial meanings are valid and the runtime cannot infer preference safely;
- semantic preservation confidence falls below the configured gate threshold;
- the next meaningful image/video attempt has material credit cost but the runtime lacks a credible repair hypothesis or pre-authorized continuation budget;
- required rights/authority information cannot be inferred or obtained;
- the user configured `ASSIST` or `REVIEW_ONLY` mode;
- a separate SmartAIHub safety/legal control requires human action.

Otherwise, unresolved platform-readiness findings become end-of-run warnings, not creative-workflow errors.

## 20.6 Semantic Drift & Credit Decision Gate

When autonomous optimization would materially change the meaning of the creator-approved source, or when the next expensive generation has uncertain value, Spec 227 SHALL create a durable decision object rather than silently mutate the content or fail the workflow.

Minimum choices:

```text
A. CONTINUE_ORIGINAL_INTENT
   Keep the semantic source unchanged.
   Permit SmartAIHub to generate/continue with the best available prompt/strategy.
   Show estimated additional credits/attempts and residual platform risk.
   The workflow retains a path to VIDEO_COMPLETED even if readiness remains warning.

B. EDIT_SEMANTIC_SOURCE
   Return the creator to the highest relevant editable semantic artifact
   (for example Shot Synopsis or Scene Summary).
   After save, invalidate/rebuild only affected downstream artifacts.

Optional:
C. USE_AI_ALTERNATIVE
   Show one or more AI-proposed story/shot alternatives with explicit semantic deltas.
   Nothing becomes canonical until selected/approved.

D. CANCEL_AFFECTED_BRANCH
   Cancel only the relevant branch/shot where product semantics allow.
```

The UI MUST NOT present `EDIT_SEMANTIC_SOURCE` as the only way to proceed. For ordinary platform-compliance optimization, a creator-controlled continuation path SHALL remain available unless an independent safety/legal rule forbids the requested action.

Decision payload MUST include:

```text
decision_id
project_id / scene_id / shot_id
semantic_source_ref + version/hash
current_best_candidate_ref
remaining_findings[]
strategies_already_tried[]
semantic_drift_summary
semantic_preservation_confidence
credits_spent_so_far
estimated_next_cost_range
recommended_choice + rationale
continuation_budget_options
expiry/supersession generation
```

A stale decision against an old Shot Synopsis or candidate generation SHALL be rejected/superseded rather than applied to the new content.

## 20.7 Drama Series Semantic Source Hierarchy

For Drama Series and similar narrative workflows, the canonical hierarchy SHOULD be:

```text
Series Bible
  ↓
Episode Outline / Episode Story
  ↓
Scene Summary
  ↓
Shot Synopsis
  ↓
Storyboard / Shot Design
  ↓
Image Prompt / Image Candidate
  ↓
Video Prompt / Video Candidate
  ↓
Timeline / Final Render
```

A prompt-level Skill MAY change wording, camera language or representation while preserving the approved Shot Synopsis. If the only credible compliance solution changes **who does what, why it happens, the narrative consequence, character motivation, chronology or required story beat**, that solution crosses the semantic boundary and SHALL NOT be silently applied.

Example:

```text
Shot Synopsis:
"A child runs into the burning house to rescue the dog."

Prompt repair proposal:
"The child remains outside while a firefighter rescues the dog."
```

The second version materially changes the plot action. Spec 227 SHALL surface a semantic decision, allowing the creator to:

```text
[Continue with original shot intent]
[Edit Shot Synopsis]
[Show AI story alternatives]
```

If the creator edits only that Shot Synopsis, downstream invalidation SHOULD be scoped:

```text
Shot Synopsis v2
  → storyboard for affected shot(s) invalidated
  → image/video prompts invalidated
  → affected generated assets/timeline dependencies reevaluated
  → unrelated scenes/shots continue running
```

A project SHALL NOT globally pause merely because one independent shot is waiting for semantic input.

## 20.8 Spec 224 / Spec 226 Alignment and Boundaries

Spec 224 and Spec 226 affect Spec 227 in **two different ways**.

### A. Implementation-time control

Once Spec 224 is implemented, SmartAIHub MAY use a `DevelopmentRun` to implement, test, debug, review, verify and evolve Spec 227 itself. Spec 226 enables authorized external control clients such as Codex/Claude/Hermes/ZCode to initiate/observe/request replan for those **software-development runs** through the canonical Spec 224 lifecycle.

This is the correct path for:
- fixing a bug in the Spec 227 implementation;
- adding a missing remediation Skill;
- changing a database/API/UI implementation;
- improving tests/evaluations;
- updating provider adapters or policy-engine code.

### B. Runtime media problem solving

An end-user video/shot remediation SHALL NOT automatically become a Spec 224 `DevelopmentRun`. Spec 227 owns media-policy optimization. However, it SHOULD reuse common orchestration primitives/patterns where the platform exposes them generically:

```text
Durable state / checkpoints
Recovery classification
Budget guards
Decision epochs / supersession
Subrun DAG / fan-out / join
Harness/provider strategy selection
Progress events
Evidence aggregation
Pause / resume / cancellation
```

If these primitives are not yet available as shared platform services, Spec 227 MAY implement a minimal compatibility layer over canonical `worker_jobs`, but its interfaces SHOULD permit later migration without changing creator-facing contracts.

Spec 226 SHALL NOT become a second media orchestrator. Its development-control MCP/progress bridge applies when the task is controlling a Spec 224 software-development run, not when an ordinary creator generates a scene.

### C. Optional specialist agents at media runtime

Spec 227 MAY invoke authorized specialist agents through the normal capability / external-agent architecture (for example a visual-representation critic, narrative-preservation reviewer or policy-context specialist). Their outputs are proposals/evidence inside the Spec 227 loop. They SHALL NOT self-certify platform readiness or seize lifecycle ownership.

---

# 21. Timeline-Aware Remediation

The Video Editor SHALL expose findings directly on the timeline.

Example:

```text
02:14.000 ───────────────────────── 02:37.000
[HIGH] Graphic violence
Rule: youtube.edsa.high_harm.av_context_required
Context: description only
Required: video or audio context

Actions:
[Generate contextual narration]
[Add on-screen context]
[Trim]
[Blur]
[Replace footage]
[Edit Shot/Scene source if meaning must change]
[Continue with original intent / warning if authorized]
[Send to review]
```

Applied fixes SHALL create normal project edits, not hidden mutations outside the project timeline.

---

# 22. Policy-Aware Pre-Production and Constraint Propagation

The engine SHOULD intervene **before generation** whenever possible. The preferred objective is to create an acceptable candidate on the first generation, not to rely on post-hoc censorship or expensive regeneration.

A canonical `PolicyConstraintManifest` SHALL be produced at project/episode/scene/shot scope and propagated into generation Skills.

```text
User Creative Goal
      ↓
Research / Sources
      ↓
Policy Risk Prediction
      ↓
PolicyConstraintManifest
      ├──→ Script Skill
      ├──→ Storyboard Skill
      ├──→ Image Prompt Skill
      ├──→ Video Prompt Skill
      ├──→ Narration / TTS Skill
      ├──→ Subtitle / Localization Skill
      ├──→ Thumbnail Skill
      └──→ Video Editor / AI Editor
```

At script stage:
- detect expected risky segments;
- request sourcing/claims;
- compose context placement through a Skill;
- warn when requested footage is unlikely to be suitable for the target platform even with EDSA;
- annotate shots requiring contextual narration, visual framing, disclosure or rights verification;
- preserve the user's core narrative instead of deleting sensitive meaning merely to reduce risk.

At image/video prompt stage, the generation Skill SHALL receive both creative intent and normalized policy constraints. It SHOULD semantically re-express risky visual details where appropriate while preserving scene purpose. The implementation SHALL NOT rely on a global banned-word list as the primary prompt transformation method.

Example shot metadata:

```json
{
  "shot_id": "S12",
  "creative_intent_ref": "intent:S12:v4",
  "policy_intent": {
    "edsa_context_required": true,
    "required_context_location": ["AUDIO", "VIDEO"],
    "synthetic_media_disclosure_candidate": false,
    "rights_clearance_required": true
  },
  "generation_constraints": {
    "preserve_scene_meaning": true,
    "minimize_gratuitous_detail": true,
    "context_dependency_refs": ["scene:S12:context"]
  }
}
```

## 22.1 Context Dependency Graph

Context required for a sensitive segment SHALL be represented as a dependency, not only as prose in a report.

Example:

```text
Sensitive Segment S12-B
requires_any:
  - narration:S12-context
  - overlay:S12-context
```

If an AI Editor, summarizer, Shorts generator, translator, dubber or reframe operation removes required context, the derived artifact SHALL be re-evaluated and the Skill SHOULD regenerate replacement context when appropriate.

## 22.2 Minor / Child Presence Is Context, Not an Automatic Block

Spec 227 SHALL explicitly distinguish **minor presence** from **child-safety risk**. The mere presence of a child/minor in a script, image prompt, video prompt or generated asset SHALL NOT be treated as a policy violation or negative generation constraint.

Canonical separation:

```text
minor_presence = NONE | PRESENT | CENTRAL_SUBJECT
minor_risk     = NORMAL | HEIGHTENED | SENSITIVE | PROHIBITED_BY_SEPARATE_SAFETY_RULE
audience       = GENERAL | MADE_FOR_KIDS_CANDIDATE | NOT_MADE_FOR_KIDS_CANDIDATE | UNKNOWN
```

These dimensions SHALL NOT be collapsed. `minor_presence=PRESENT` does not imply `minor_risk=SENSITIVE` and does not by itself determine `Made for Kids`.

Meaning-preserving prompt remediation SHALL NOT remove, age-up, replace or de-center a minor subject solely to obtain a cleaner classifier result. Normal contexts such as education, family life, sports, travel, ordinary drama, cartoons and age-appropriate activities SHOULD generate normally.

Where a minor appears in a genuinely sensitive context, the deep problem-solving loop MAY adjust representation, framing, context, shot structure or downstream publication guidance while preserving narrative intent. Independent SmartAIHub safety/legal controls remain authoritative for prohibited requests and are outside the warn-and-complete override.

---

# 23. Asset Provenance and Inheritance

Each media asset SHOULD carry:

```text
origin
source_url / source_file
creator / provider
license
license_evidence
created_at
modified_at
generated_by_ai
provider_model
prompt_ref where allowed
realistic_or_photorealistic
real_person_reference
real_event_reference
altered_real_event
content_credentials / C2PA metadata if available
asset_hash
policy_findings
```

When an asset is inserted into a timeline, relevant risk/provenance metadata SHALL propagate into the publication candidate and be revalidated in final context.

---

# 24. Synthetic / Altered Media Disclosure

The YouTube adapter SHALL evaluate whether disclosure is required under current policy.

Canonical states:

```text
NOT_APPLICABLE
NOT_REQUIRED_INTERNAL
REQUIRED
DECLARED
PLATFORM_LABELED
HUMAN_REVIEW_RECOMMENDED
```

For supported API uploads, the adapter SHALL map the declaration to `status.containsSyntheticMedia` according to current YouTube Data API semantics.

Disclosure SHALL NOT be inferred solely from “AI was used somewhere.” The engine SHALL distinguish assistive generation/editing from materially altered/generated realistic content according to active policy.

---

# 25. Advertiser Suitability

Advertiser suitability SHALL be a separate policy pack and decision dimension.

The engine SHOULD model likely categories from the official self-certification questionnaire/guidelines where permitted, but SHALL distinguish:

```text
INTERNAL_ESTIMATE
CREATOR_SELF_CERTIFICATION
PLATFORM_AUTOMATED_RESULT
PLATFORM_HUMAN_REVIEW_RESULT
```

An EDSA-ready documentary can still have:

```text
community_guidelines = CLEAR/EDSA_READY_INTERNAL
advertiser_suitability = WARNING or LIMITED_RISK
```

These states MUST NOT be collapsed.

---

# 26. Copyright / Rights Separation

EDSA SHALL NEVER be presented as copyright permission.

Publication readiness SHALL separately require evaluation of:
- ownership;
- licenses;
- platform Content ID risk where known;
- fair-use/fair-dealing claims as human/legal-risk assertions, not automatic guarantees;
- music rights;
- stock media restrictions;
- creator permission;
- territory/time-window restrictions where modeled.

Spec 187 provenance evidence SHOULD be reused rather than duplicated.

---

# 27. Claim & Source Grounding

For news, documentary, scientific, medical, safety-sensitive and other fact-heavy content, Spec 227 SHALL integrate with a Claim Ledger.

Minimum claim object:

```json
{
  "claim_id": "clm_991",
  "text": "...",
  "time_range": [81120, 86500],
  "claim_type": "FACTUAL",
  "sources": ["src_22", "src_24"],
  "source_status": "SUPPORTED",
  "contradictory_sources": [],
  "last_verified_at": "...",
  "language": "th"
}
```

A policy-sensitive claim without sufficient evidence MAY trigger `HUMAN_REVIEW_RECOMMENDED` or `REMEDIATION_REQUIRED` depending on the rule pack.

---

# 28. Multilingual, Dubbing and Localization Safety

This is mandatory.

A certification for one language SHALL NOT automatically certify another audio/title/description variant.

The engine SHALL detect context loss caused by:
- translated script omitting qualifiers;
- AI dubbing changing meaning;
- translated captions omitting warnings;
- localized title becoming sensationalized;
- localized description removing sources;
- source/quote attribution becoming ambiguous.

Each language variant SHALL have a derived policy result.

Where video/audio context is required, metadata translation alone cannot satisfy the requirement.

---

# 29. Shorts, Reframe and Derivative Export Safety

A landscape master may be compliant while a vertical crop is not.

Every derivative export SHALL invalidate visual-context assumptions when:
- overlay text is cropped;
- attribution is removed;
- warning card is outside crop;
- risky imagery becomes more focal;
- shortened duration removes contextual narration;
- thumbnail/frame selection changes presentation.

Therefore:

```text
master certification ≠ derivative certification
```

SmartAIHub SHALL perform derivative-level final scan for Shorts, Reels and other exports.

---

# 30. Thumbnail / Metadata Policy

Thumbnail, title and description SHALL be versioned with the certification snapshot.

Changing them after certification SHALL trigger targeted re-evaluation.

A content-body pass SHALL NOT override an unresolved thumbnail destination restriction; the video artifact itself still remains completable.

Metadata remediation SHOULD include:
- remove sensational framing;
- add accurate documentary context when relevant;
- remove unsupported claims;
- remove misleading hashtags;
- validate external links.

---

# 31. User / Tenant Policy Overlay

Tenant policy may be stricter than platform policy.

Example:

```text
YouTube permits with age restriction
Tenant policy: do not publish graphic violence
→ SmartAIHub tenant publication state = NOT_READY_FOR_TENANT_PUBLISH
```

Tenant policy SHALL NOT convert a platform no-exception / destination restriction into an internal `READY` result. This governs publication readiness only, not artifact completion.

Resolution precedence:

```text
SmartAIHub mandatory safety
  > platform hard policy
  > legal/region constraints
  > tenant policy
  > channel policy
  > workflow preference
```

---

# 32. Role-Based Access and Approval

Minimum roles:

```text
CREATOR
EDITOR
POLICY_REVIEWER
PUBLISHER
TENANT_ADMIN
PLATFORM_ADMIN
```

Policy actions SHALL be separately permissioned:
- view findings;
- apply low-risk remediation;
- approve high-risk content;
- change channel publishing policy;
- activate policy pack;
- override tenant warning;
- publish externally;
- request platform review/appeal.

SmartAIHub safety/legal blocks SHALL NOT be bypassable by ordinary content roles. Platform-readiness restrictions SHALL be represented separately and SHALL NOT convert the creative artifact into a failed project.

---

# 33. Human Review, Semantic Decisions and Completion Semantics

Default gate concept:

```text
LOW
  → Skill-first automated remediation allowed
  → automated progression allowed

MEDIUM
  → bounded autonomous problem solving
  → rescan/replan
  → if unresolved but meaning preserved: warning + complete artifact

HIGH
  → escalate through allowed autonomous strategy tiers first
  → if next repair would alter semantic source or spend material credits uncertainly:
       SEMANTIC_DRIFT_DECISION
  → creator chooses CONTINUE_ORIGINAL_INTENT or EDIT_SEMANTIC_SOURCE
  → either path preserves a route to complete the production

PLATFORM NOT READY / NO-EXCEPTION CATEGORY
  → complete best artifact when otherwise allowed
  → show explicit platform warning / remediation history / remaining findings
  → allow continued editing, export and alternate-destination use
  → do not mislabel project as failed

SMARTAIHUB SAFETY / LEGAL BLOCK
  → apply the separate safety/legal control to the prohibited action
```

Exact categories are policy-pack data and MUST NOT be frozen in source code.

The creator MAY intentionally produce material that is not destined for YouTube or not currently intended for publication. Therefore internal platform compliance is an attribute of a target publication candidate, not a universal validity requirement for every video project.

Before surfacing a warning or semantic decision, the runtime SHALL make a good-faith autonomous effort using strategies that preserve the current semantic source and remain inside authorized budgets. A warning is the **fallback result after optimization**, not a substitute for optimization.

A semantic decision is also **not** a failure. It is used because the system has reached a boundary where creator intent is more authoritative than another autonomous rewrite.

Human/creator decisions SHALL record:
- reviewer/creator identity;
- decision epoch/generation;
- semantic source version/hash;
- findings reviewed;
- strategies attempted;
- selected choice;
- continuation credit/attempt envelope where applicable;
- reason code and optional notes;
- policy version;
- artifact hashes;
- timestamp.

Unrelated branches SHOULD continue while a scoped shot/scene decision waits.

---

# 34. Decoupled Artifact, Compliance and Publication Lifecycles

Spec 227 SHALL NOT use one state machine in which policy readiness can prevent the video artifact from reaching completion.

## 34.1 Artifact lifecycle

```text
DRAFT
  ↓
IN_PRODUCTION
  ↓
RENDERING
  ├──→ VIDEO_RENDER_FAILED
  └──→ VIDEO_COMPLETED
```

`VIDEO_COMPLETED` means a usable artifact exists. It says nothing about whether a destination platform is ready to accept it.

## 34.2 Compliance lifecycle per target candidate

```text
NOT_SCANNED
  ↓
ANALYZING
  ↓
FINDINGS_READY
  ├──→ ENGINEERING_LOOP
  │       ↓
  │   ATTEMPT / VERIFY / DIAGNOSE / ESCALATE
  │       ↓
  │   READY_INTERNAL
  │       or
  │   WAITING_SEMANTIC_DECISION ──→ resume / edit-source replan
  │       or
  │   REMEDIATION_EXHAUSTED_WARNING
  │
  ├──→ HUMAN_REVIEW_RECOMMENDED
  ├──→ NOT_READY_FOR_PLATFORM
  └──→ READY_INTERNAL
```

## 34.3 Publication lifecycle

```text
NOT_REQUESTED
  ↓
PUBLISH_REQUESTED
  ├──→ WARNING_ACK_REQUIRED
  ├──→ REVIEW_REQUIRED
  ├──→ PUBLISH_RESTRICTED
  └──→ UPLOAD_PENDING
          ↓
      UPLOADED_PRIVATE
          ↓
      PLATFORM_CHECKS_PENDING
          ↓
      PLATFORM_CHECKS_OBSERVED
          ↓
      PUBLISH_READY
          ↓
      PUBLISHED
```

Canonical invariants:

```text
REMEDIATION_EXHAUSTED_WARNING != VIDEO_FAILED
NOT_READY_FOR_PLATFORM        != VIDEO_FAILED
PUBLISH_RESTRICTED            != VIDEO_FAILED
COMPLIANCE_SCAN_FAILED        != VIDEO_FAILED
```

A user SHALL still be able to edit, render, store in Library, download/export, duplicate, version and continue remediation of a completed artifact unless another independent SmartAIHub safety/legal control forbids the specific action.

Side states MAY include:

```text
INVALIDATED_CONTENT_CHANGED
INVALIDATED_POLICY_CHANGED
EXTERNAL_RESTRICTED
PUBLISH_FAILED_RECOVERABLE
PUBLISH_FAILED_TERMINAL
ARCHIVED
```

---

# 35. Certification Invalidation

The following MUST invalidate or partially invalidate certification:

- master video bytes change;
- audio track changes;
- caption/subtitle changes when policy-relevant;
- title/description/thumbnail changes;
- a referenced source/rights record is revoked;
- a policy pack with material impact becomes active;
- a platform target changes;
- locale/dub variant changes;
- crop/reframe/Shorts export changes;
- source asset is replaced;
- synthetic-media disclosure status changes;
- human reviewer revokes approval.

Targeted re-check MAY be used during editing, but final publication certification MUST bind the final artifact.

---

# 36. Certification Evidence Bundle

Every final certification SHALL produce an immutable bundle containing at least:

```text
manifest.json
content-hashes.json
policy-pack-manifest.json
rule-results.json
findings.json
scene-risk-map.json
edsa-context-map.json
transcript.json / references
ocr.json / references
thumbnail-findings.json
metadata-findings.json
claim-ledger.json / references
source-provenance.json
rights-evidence.json / references
synthetic-media-decision.json
advertiser-suitability-estimate.json
human-approvals.json
remediation-history.json
platform-upload.json
platform-observations.json
```

Large media bytes do not need to be duplicated if immutable object references + hashes are available.

The bundle SHALL be addressable by a certification ID and content hash.

---

# 37. Audit Integrity

Audit entries MUST be append-only at the logical layer.

Recommended:
- event hash chaining for high-value audit streams;
- immutable R2 object versioning where available;
- DB foreign keys to policy versions;
- signer identity for human approvals;
- content hash verification before publication.

A mismatch between certified hash and upload file hash SHALL invalidate the publication-readiness snapshot and pause that upload action for a fresh scan; it SHALL NOT invalidate or fail the completed video artifact.

---

# 38. YouTube Adapter

Interface:

```ts
interface PublishingPlatformAdapter {
  getCapabilities(): Promise<PlatformCapabilities>
  mapPolicyInputs(candidate): Promise<PlatformPolicyInput>
  evaluatePlatformSpecificRules(input): Promise<PolicyDecisionSet>
  prepareUpload(candidate, certification): Promise<UploadPlan>
  upload(plan): Promise<RemotePublicationRef>
  readRemoteStatus(ref): Promise<RemoteStatus>
  updateSupportedMetadata(ref, patch): Promise<RemoteStatus>
}
```

YouTube capabilities SHALL be dynamically described, including whether the current integration can:
- upload;
- set privacy status;
- schedule;
- set `containsSyntheticMedia`;
- set audience fields;
- update metadata;
- upload captions;
- set thumbnail;
- read processing/upload status.

Features not provided by official APIs SHALL be surfaced as user-assisted/manual steps rather than simulated.

---

# 39. YouTube Upload Strategy

Default high-confidence workflow:

```text
final certification
   ↓
upload as PRIVATE (default for managed compliance flows)
   ↓
record remote video id
   ↓
allow YouTube processing/checks
   ↓
record observable results / creator-provided platform result
   ↓
resolve remaining human gate
   ↓
publish / schedule
```

A tenant/channel may configure a different visibility workflow only when permitted by policy and role.

The engine SHALL clearly distinguish SmartAIHub’s internal checks from YouTube’s own checks.

---

# 40. Platform Check Ingestion

Platform-side check states MAY be obtained through:
- official APIs when exposed;
- approved connector capability;
- explicit user confirmation/import;
- policy-compliant user-assisted UI flow where applicable.

The implementation MUST NOT rely on undocumented/private YouTube endpoints.

Observed results SHALL include provenance:

```text
source = OFFICIAL_API | PLATFORM_UI_USER_CONFIRMED | CONNECTOR | MANUAL_DOCUMENT
observed_at
remote_video_id
raw_status_ref
normalized_status
```

---

# 41. Post-Publish Monitoring

The monitor SHOULD detect or accept updates for:
- visibility/status change;
- policy restriction;
- age restriction;
- copyright claim/strike information where available;
- monetization status/review result where available;
- platform label/disclosure changes;
- creator/admin manual incident reports.

A new restriction SHALL generate an incident linked to the original certification.

---

# 42. Policy Incident Workflow

```text
INCIDENT_DETECTED
  ↓
FREEZE_RELEVANT_EVIDENCE
  ↓
FETCH CURRENT POLICY PACK
  ↓
COMPARE PUBLISH-TIME vs CURRENT POLICY
  ↓
ROOT-CAUSE CLASSIFICATION
  ├── content changed
  ├── policy changed
  ├── model false negative
  ├── human decision issue
  ├── rights issue
  ├── platform decision difference
  └── unknown
  ↓
REMEDIATION / APPEAL SUPPORT / UNPUBLISH DECISION
```

The system SHALL NOT auto-file an appeal that asserts facts not supported by evidence.

---

# 43. Appeal / Review Evidence Assistant

Where a platform offers review/appeal, SmartAIHub MAY assemble:
- relevant timestamps;
- contextual narration transcript;
- source references;
- rights/license proof;
- policy version at publication;
- remediation history;
- human reviewer decision;
- concise factual explanation.

User SHALL approve any externally submitted appeal unless an official API and explicit tenant policy authorize automatic submission.

---

# 44. UI/UX — Policy & Publishing Workspace

Add a project-level **Policy & Publishing** surface.

Recommended structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ Policy & Publishing                                        │
├─────────────────────────────────────────────────────────────┤
│ Target: YouTube     Policy Pack: 2026-09-22.x              │
│ Final asset: render_v42.mp4   Hash: 9e...                   │
├─────────────────────────────────────────────────────────────┤
│ Community Guidelines        CLEAR / REVIEW / NOT_READY      │
│ EDSA readiness              NOT_REQUIRED / READY / REVIEW   │
│ Advertiser suitability      LOW / LIMITED-RISK / REVIEW     │
│ Copyright / rights          CLEAR / ACTION_REQUIRED         │
│ Synthetic media disclosure  NOT_REQUIRED / REQUIRED         │
│ Age restriction risk        LOW / HIGH                      │
│ Privacy / PII               CLEAR                           │
├─────────────────────────────────────────────────────────────┤
│ Findings Timeline                                           │
│ 02:14–02:37 HIGH graphic violence                          │
│   Context: description only                                │
│   Required: video/audio                                    │
│   [Fix] [Open Timeline] [Review]                           │
├─────────────────────────────────────────────────────────────┤
│ Optimization: 5 iterations │ Best candidate: v47          │
│ Remaining: 1 warning                                      │
│ [Optimize for Platform] [Run Final Scan] [View Attempts]   │
│ [Upload Private / Continue with Warning]                   │
└─────────────────────────────────────────────────────────────┘
```

The UI SHALL avoid presenting an AI estimate as an official YouTube verdict.

The default Creator View SHALL emphasize outcome and autonomous progress rather than exposing raw model errors. During an active loop it SHOULD show states such as `Analyzing`, `Trying a safer representation`, `Regenerating shot 12`, `Verifying meaning`, and `Selecting best candidate`. If the loop finishes with unresolved findings, the primary result SHALL remain the completed video plus a non-blocking warning summary.

A `View Attempts` panel SHALL expose the engineering-loop history for expert users without requiring creators to understand or manually rewrite prompts.

When semantic drift or uncertain high-cost regeneration requires creator input, the UI SHALL show a **Semantic Decision Card** rather than an error dialog. Example:

```text
┌─────────────────────────────────────────────────────────────┐
│ Shot 14 — Decision needed                                   │
├─────────────────────────────────────────────────────────────┤
│ SmartAIHub tried 5 meaning-preserving strategies.           │
│ The next policy-safer rewrite changes an important action. │
│ Semantic preservation confidence: 61%                      │
│ Credits spent: 8    Estimated next attempts: 12–24 credits │
├─────────────────────────────────────────────────────────────┤
│ [Continue with original intent]                            │
│   Keep the shot meaning; continue best-effort generation.  │
│                                                           │
│ [Edit Shot Synopsis]                                       │
│   Change the story beat, then rebuild only this branch.    │
│                                                           │
│ [Show AI alternatives]                                     │
│   Compare story-safe alternatives before choosing.         │
└─────────────────────────────────────────────────────────────┘
```

`Continue with original intent` SHALL NOT imply platform approval. It means the creator prefers semantic fidelity and authorizes bounded continued generation / best-effort completion despite residual platform-readiness risk.

---

# 45. Timeline Integration UX

Findings SHALL appear as timeline markers/layers.

Filters:

```text
All
EDSA
Violence
Child safety
Self-harm
Hate
Copyright
Synthetic media
Claims / sources
Privacy
Monetization
```

Clicking a finding SHALL seek the preview to the exact range and display evidence.

---

# 46. Mobile / Cross-Device Review

Integrate with Spec 225 for mobile approval.

A high-risk review/semantic-decision notification SHOULD include:
- project name;
- scene/shot and exact timestamp where applicable;
- policy dimension;
- short reason;
- semantic-drift summary when relevant;
- credits spent / estimated next cost where relevant;
- safe preview where permitted;
- context-appropriate actions such as `Continue original intent`, `Edit source`, `View AI alternatives`, `Request changes`, or `Open desktop review`.

Graphic/sensitive previews MAY require tap-to-reveal and SHALL honor tenant safety settings.

No secret/token/session value SHALL appear in mobile notifications.

---

# 47. Workflow Studio Nodes

Spec 214/215-compatible node types SHOULD include:

```text
Policy.ScanScript
Policy.ScanAssets
Policy.ScanTimeline
Policy.ScanFinalRender
Policy.EvaluateEDSA
Policy.EvaluateMonetization
Policy.CheckSyntheticDisclosure
Policy.CheckRights
Policy.ApplyRemediation
Policy.ClassifyProblem
Policy.ReplanShotOrScene
Policy.RequestSemanticDecision
Policy.RequestHumanReview
Policy.CertifyPublication
Publish.YouTubeUploadPrivate
Publish.WaitForPlatformReview
Publish.YouTubePublish
Publish.MonitorStatus
```

Nodes SHALL return structured outputs and job refs, not free-form-only text.

---

# 48. Worker Jobs

Long-running policy work SHALL use canonical `worker_jobs`.

Suggested job types:

```text
policy.source.fetch
policy.source.diff
policy.asset.analyze
policy.video.scene_scan
policy.audio.transcribe
policy.video.ocr
policy.decision.evaluate
policy.edsa.evaluate
policy.engineering_loop.run
policy.problem.classify
policy.remediation.plan
policy.remediation.strategy_select
policy.remediation.skill_execute
policy.remediation.structural_replan
policy.remediation.specialist_invoke
policy.remediation.semantic_verify
policy.remediation.candidate_rank
policy.remediation.render
policy.semantic_decision.create
policy.semantic_decision.apply
policy.downstream.invalidate_rebuild
policy.final_certify
platform.youtube.upload
platform.youtube.status_sync
policy.post_publish.monitor
```

All jobs SHALL be idempotent or carry explicit idempotency keys.

## 48.1 Durable Engineering Loop Execution

`policy.engineering_loop.run` SHALL be a durable parent job using canonical `worker_jobs` / `worker_job_events`. It owns the optimization cycle and may spawn child jobs for Skill execution, media generation, scanning, semantic verification and candidate rendering. A child failure is an iteration outcome, not automatically a parent creative-workflow failure.

Canonical loop state:

```text
LOOP_PLANNING
  ↓
PROBLEM_CLASSIFYING
  ↓
ATTEMPT_RUNNING
  ↓
VERIFYING
  ├──→ ACCEPTED
  └──→ ATTEMPT_NOT_READY
           ↓
       DIAGNOSING
           ↓
       STRATEGY_ESCALATION
        ├── local Skill repair
        ├── structural replan
        ├── capability/provider change
        ├── specialist/subproblem fan-out
        └── semantic boundary detected
                     ↓
          WAITING_SEMANTIC_DECISION
             ├── CONTINUE_ORIGINAL_INTENT → resume loop
             ├── EDIT_SEMANTIC_SOURCE → invalidate affected downstream → replan
             └── USE_AI_ALTERNATIVE → apply approved semantic revision → replan

Terminal loop outcomes:
READY_INTERNAL
WARNING_COMPLETE
USER_CANCELLED
SEPARATE_SAFETY_OR_LEGAL_CONTROL
```

The loop state MUST persist:
- attempt number;
- problem/failure classifications;
- current strategy tier;
- strategy history;
- failed hypotheses;
- semantic source ref/version/hash;
- decision epoch when waiting;
- findings remaining;
- cost/time consumed;
- `best_candidate_so_far`;
- candidate lineage;
- next strategy recommendation.

Runner/process restart SHALL resume from persisted loop state rather than restarting from attempt zero.

The parent job SHALL prefer automatic continuation. It MUST NOT emit a user-facing `ACTION_REQUIRED` merely because a Skill/model returned an unsatisfactory candidate while another permitted strategy remains.

---

# 49. Job Idempotency

Examples:

```text
policy.final_certify:<candidate_id>:<render_hash>:<policy_pack_set_hash>
platform.youtube.upload:<channel_id>:<certification_id>
policy.source.fetch:<source_id>:<scheduled_window>
```

A retry MUST NOT accidentally upload the same video multiple times.

---

# 50. API Surface

Illustrative endpoints:

```text
GET    /api/publishing/policy/platforms
GET    /api/publishing/policy/packs
POST   /api/publishing/candidates
POST   /api/publishing/candidates/:id/analyze
GET    /api/publishing/candidates/:id/findings
POST   /api/publishing/candidates/:id/remediations/preview
POST   /api/publishing/candidates/:id/remediations/apply
POST   /api/publishing/candidates/:id/optimize
GET    /api/publishing/candidates/:id/problem-solving
GET    /api/publishing/decisions/:decisionId
POST   /api/publishing/decisions/:decisionId/respond
POST   /api/publishing/candidates/:id/semantic-source/replan
POST   /api/publishing/candidates/:id/review
POST   /api/publishing/candidates/:id/certify
POST   /api/publishing/candidates/:id/publish/youtube
GET    /api/publishing/candidates/:id/status
GET    /api/publishing/certifications/:id/evidence
POST   /api/publishing/incidents/:id/review
```

All endpoints SHALL enforce tenant + project + role authorization.

---

# 51. Event Model

Recommended events:

```text
policy.pack.detected_change
policy.pack.review_required
policy.pack.activated
policy.scan.started
policy.scan.completed
policy.finding.created
policy.finding.resolved
policy.remediation.proposed
policy.remediation.applied
policy.problem.classified
policy.strategy.escalated
policy.semantic_decision.requested
policy.semantic_decision.responded
policy.semantic_source.changed
policy.downstream.invalidated
policy.subproblem.started
policy.subproblem.joined
policy.review.requested
policy.review.completed
policy.certification.created
policy.certification.invalidated
platform.upload.started
platform.upload.completed
platform.check.observed
platform.publication.published
platform.restriction.detected
policy.incident.created
```

Events SHALL include correlation IDs and tenant IDs.

---

# 52. Database Model

Minimum additional entities:

```text
publication_candidates
publication_candidate_assets
publication_variants
policy_scan_runs
policy_findings
policy_finding_evidence
policy_decision_dimensions
edsa_context_records
edsa_context_links
policy_remediations
policy_problem_solving_runs
policy_problem_attempts
policy_hypothesis_ledger
policy_subproblems
policy_semantic_decisions
policy_semantic_source_refs
policy_human_reviews
publication_certifications
publication_certification_assets
publication_evidence_bundles
platform_publications
platform_status_observations
policy_incidents
policy_incident_actions
```

Database design SHALL reuse existing project, user, tenant, job, asset and audit IDs rather than duplicating identity systems.

`policy_semantic_decisions` SHALL be version/epoch fenced. `policy_semantic_source_refs` SHOULD reference existing canonical Drama/Video project artifacts rather than copying story text into a second source-of-truth table.

---

# 53. Example Finding Schema

```json
{
  "finding_id": "pf_10042",
  "candidate_id": "pc_301",
  "platform": "youtube",
  "policy_pack_version": "2026-09-22.1",
  "rule_id": "youtube.edsa.high_harm.av_context_required",
  "dimension": "edsa_readiness",
  "severity": "HIGH",
  "status": "OPEN",
  "time_range_ms": [134000, 157000],
  "category": "graphic_violence",
  "evidence_refs": ["ev_201", "ev_202"],
  "required_action": "ADD_AUDIO_OR_VIDEO_CONTEXT",
  "model_confidence": 0.91,
  "review_recommended": true,
  "semantic_decision_required": false
}
```

`model_confidence` is diagnostic only, not the final policy result.

---

# 54. Example EDSA Context Record

```json
{
  "context_id": "ctx_112",
  "finding_id": "pf_10042",
  "what": {
    "who": true,
    "what_happened": true,
    "when": true,
    "where": true,
    "why_shown": true,
    "analysis": true,
    "countervailing_view": false
  },
  "where": [
    {
      "surface": "AUDIO_NARRATION",
      "time_range_ms": [129000, 139000]
    },
    {
      "surface": "VIDEO_VISUAL",
      "time_range_ms": [134000, 145000]
    }
  ],
  "placement_rule_satisfied": true,
  "semantic_link_verified": true
}
```

---

# 55. Caching

Cache keys MUST include policy version and content hash.

Safe cache target:

```text
<asset_hash, analyzer_version, policy_feature_schema_version>
```

Never reuse an old final policy decision only because the filename matches.

---

# 56. Analyzer Versioning

Store:
- ASR model/version;
- OCR model/version;
- vision model/version;
- policy classifier/version;
- LLM model/version/provider where available;
- prompts/schema version;
- deterministic rule engine version.

A material analyzer upgrade MAY trigger selective back-testing.

---

# 57. Model Routing

Different tasks MAY use different models:

```text
fast classifier       → broad screening
vision model          → frame/scene analysis
ASR                    → transcript
reasoning model        → contextual interpretation
reranker               → policy/source retrieval
specialized detector   → PII / nudity / violence where approved
```

Provider abstraction SHALL allow per-tenant and cost-aware routing while preserving minimum quality for high-risk scans.

---

# 58. Cost Controls

The engine SHOULD use hierarchical analysis:

```text
1. metadata/script cheap scan
2. asset inherited findings
3. sparse multimodal scan
4. dense scan around triggers
5. expensive reasoning only for ambiguous/high-risk ranges
6. full final cert scan
```

Cost optimization MUST NOT disable required final checks.

---

# 59. Security

Requirements:
- least-privilege OAuth scopes;
- encrypted platform tokens;
- no tokens in jobs/events/logs;
- signed webhook verification where applicable;
- tenant isolation;
- secure evidence access;
- restricted handling of sensitive frames;
- no raw sensitive thumbnails in ordinary notifications;
- audit of policy overrides;
- Secret Broker integration where available.

---

# 60. Privacy / PII

Policy analysis may itself process sensitive data.

The system SHALL:
- minimize retained frame extracts;
- permit evidence redaction where appropriate;
- segregate doxxing/PII findings;
- avoid embedding secrets/credentials into Vector DB;
- apply retention policies to temporary analysis outputs;
- avoid sending restricted assets to providers that the tenant has not authorized.

---

# 61. Data Retention

Suggested classes:

```text
TEMP_ANALYSIS_FRAMES      short TTL
TRANSCRIPTS               project retention policy
POLICY_FINDINGS           project/audit retention
CERTIFICATION_MANIFEST    long-lived
HUMAN_APPROVAL            long-lived audit
PLATFORM_STATUS           lifecycle audit
RAW_SENSITIVE_EVIDENCE    restricted retention
```

Exact TTL SHALL be tenant-configurable within platform constraints.

---

# 62. Observability

Metrics SHOULD include:

```text
policy_scan_latency_seconds
policy_scan_cost_estimate
findings_per_candidate
high_risk_findings_total
remediation_accept_rate
human_review_rate
certification_invalidations_total
policy_pack_age_seconds
policy_pack_diff_total
post_publish_restrictions_total
false_negative_incidents_total
false_positive_overrides_total
upload_duplicate_prevented_total
```

Dashboards SHALL distinguish model quality from platform outcomes.

---

# 63. Quality Metrics

Maintain labeled benchmark corpora permitted for internal evaluation.

Metrics:
- rule-level precision/recall;
- segment localization IoU/time-overlap;
- EDSA context detection precision/recall;
- context-location correctness;
- high-risk false-negative rate;
- remediation success rate;
- multilingual semantic-preservation score;
- derivative/crop context-loss detection rate;
- policy source freshness SLA.

High-risk false negatives SHALL be prioritized above cosmetic false positives.

---

# 64. Failure Handling

Failure classes:

```text
POLICY_SOURCE_UNAVAILABLE
POLICY_PACK_INVALID
ANALYZER_UNAVAILABLE
UNSUPPORTED_MEDIA
UNSUPPORTED_LANGUAGE
MODEL_TIMEOUT
MODEL_SCHEMA_INVALID
NO_PROGRESS_DETECTED
SEMANTIC_DRIFT_EXCEEDED
REPAIR_HYPOTHESIS_EXHAUSTED
EVIDENCE_MISSING
RIGHTS_UNKNOWN
FINAL_HASH_MISMATCH
PLATFORM_AUTH_REQUIRED
PLATFORM_RATE_LIMITED
PLATFORM_UPLOAD_FAILED
REMOTE_STATUS_UNKNOWN
```

Each class SHALL map to:
- retry policy;
- user-visible state;
- publication gate effect;
- escalation path.

---

# 65. Publication Action Handling for Unresolved Findings

Spec 227 SHALL NOT use unresolved platform-readiness findings to fail the creative artifact. `VIDEO_COMPLETED` remains independent.

For unattended or managed auto-publication, channel/tenant policy MAY require the automation to pause for explicit acknowledgment or review when:
- required final scan did not complete;
- final hash differs from the last scanned hash;
- a high-risk platform advisory remains after the engineering loop;
- mandatory platform disclosure is unresolved;
- rights evidence required by the selected publication policy is absent;
- a material policy pack ambiguity is unresolved;
- upload idempotency state is unknown after a network failure and remote duplication cannot be ruled out.

These states SHALL be represented as publication-action states such as `ACK_REQUIRED`, `REVIEW_RECOMMENDED`, `NOT_READY_FOR_AUTO_PUBLISH`, or `REMOTE_STATUS_UNKNOWN`, not `VIDEO_FAILED`. User-directed export/download and continued editing remain available unless a separate SmartAIHub safety/legal control forbids the specific action.

---

# 66. Policy Change Re-Evaluation

On new active policy pack:

```text
identify changed rules
    ↓
compute impacted categories
    ↓
find active/published certifications using affected old rules
    ↓
triage
  ├─ no material impact
  ├─ re-scan metadata only
  ├─ re-evaluate stored evidence
  └─ reprocess media
```

Do not automatically re-render old content unless remediation is required and the user approves.

---

# 67. Backward Compatibility

Spec 227 SHALL be additive.

Existing publish flows MAY initially operate in `LEGACY_OBSERVE_ONLY` mode:

```text
OFF
OBSERVE_ONLY
WARN_AND_ASSIST
AUTO_REMEDIATE_BOUNDED
MANAGED_PUBLISH_GATES
```

Rollout MUST support per-tenant and per-channel feature flags.

---

# 68. Migration Plan

## Phase 0 — Inventory
- identify existing YouTube upload code;
- identify Media Studio/Video Editor hooks;
- identify current asset provenance;
- identify existing approval/audit tables;
- identify current `worker_jobs` job taxonomy;
- identify existing content moderation utilities.

## Phase 1 — Core schema + Policy Registry
- migrations;
- rule schema;
- source snapshots;
- YouTube EDSA pack;
- policy pack activation workflow.

## Phase 2 — Script/metadata/thumbnail screening
- cheap early-stage policy checks;
- UI finding panel;
- no creative-workflow block from platform-readiness findings; warnings/remediation only.

## Phase 3 — Multimodal scene scanner
- ASR/OCR/frame analysis;
- scene risk map;
- EDSA context map.

## Phase 4 — Video Editor remediation
- timeline markers;
- generated narration/context overlays;
- blur/trim/replace workflows.

## Phase 4A — Deep problem-solving and semantic decisions
- problem/failure classifier;
- hypothesis ledger + no-progress detection;
- strategy tiers T0–T7;
- structural shot/scene replan;
- capability/provider switching;
- specialist/critic and bounded subproblem fan-out/join;
- semantic source hierarchy;
- Semantic Drift & Credit Decision Gate;
- scoped downstream invalidation/rebuild;
- cross-device attention integration;
- Spec 224/226 ownership-boundary tests.

## Phase 5 — Final certification
- hashes;
- evidence bundle;
- invalidation.

## Phase 6 — YouTube publishing adapter
- official Data API upload;
- private-first strategy;
- synthetic media field mapping;
- status observation.

## Phase 7 — Post-publish monitoring
- incident model;
- evidence assistant;
- policy drift.

## Phase 8 — Multi-platform adapters
- Facebook/Instagram/TikTok/etc. according to separate policy packs.

---

# 69. YouTube Policy Pack Initial Families

At minimum the initial YouTube implementation SHALL model:

```text
community_guidelines.general
community_guidelines.edsa
spam_deceptive_practices
sensitive_content
violent_dangerous_content
regulated_goods
misinformation where applicable in active policies
harassment_cyberbullying
hate_speech
violent_criminal_organizations
child_safety
suicide_self_harm
privacy_doxxing
external_links
thumbnail_metadata
altered_synthetic_media
advertiser_friendly
copyright_rights_integration
made_for_kids_audience_integration
```

Do not assume every family has identical EDSA semantics.

---

# 70. EDSA Decision Algorithm

Pseudo-code:

```text
function evaluate_edsa(candidate, finding, policy_pack):
    if finding.rule.edsa_relevance == NONE:
        return EDSA_NOT_REQUIRED

    if finding.rule.edsa_exception_available == false:
        return EDSA_NOT_AVAILABLE_FOR_RULE

    context = build_context_map(candidate, finding)

    if context.is_empty:
        return EDSA_CONTEXT_REQUIRED

    if finding.rule.requires_av_context:
        if not context.exists_in(VIDEO_VISUAL, AUDIO_NARRATION, AUDIO_SOURCE):
            return EDSA_CONTEXT_REQUIRED

    if not semantic_context_links_to_finding(context, finding):
        return EDSA_CONTEXT_REQUIRED

    if context.is_ambiguous or finding.is_high_risk:
        return EDSA_REVIEW_RECOMMENDED

    return EDSA_READY_INTERNAL
```

The actual rule engine SHALL evaluate the current policy pack, not hard-coded category names.

---

# 71. Publication Readiness / Auto-Publish Decision Algorithm

This algorithm governs a **publication action**, not whether the video project may complete. Platform findings are advisory/readiness states unless a separate SmartAIHub safety/legal control applies.

```text
if final_certification_missing:
    auto_publish = PAUSE_FOR_SCAN
else if final_hash_changed:
    auto_publish = PAUSE_FOR_RESCAN
else if required_disclosure_pending:
    auto_publish = ACK_OR_REMEDIATE
else if rights_required_and_unknown:
    auto_publish = ACK_OR_REVIEW
else if any dimension == NOT_READY_FOR_PLATFORM:
    auto_publish = ACK_OR_REVIEW according to channel policy
else if human_review_recommended:
    auto_publish = ACK_OR_REVIEW according to channel policy
else:
    auto_publish = READY_FOR_PRIVATE_UPLOAD

artifact_state remains VIDEO_COMPLETED whenever rendering succeeded
```

A creator MAY continue editing, export/download, retain the artifact, target another platform, or request another engineering-loop optimization pass. The system SHALL not equate `NOT_READY_FOR_PLATFORM` with a failed creative workflow.

After private upload:

```text
if external hard restriction observed:
    gate = EXTERNAL_RESTRICTED
else if configured platform checks pending:
    gate = PLATFORM_CHECKS_PENDING
else if approval pending:
    gate = ACK_OR_REVIEW
else:
    gate = PUBLISH_READY
```

---

# 72. AI Builder Integration

AI Builder SHALL be able to respond to commands such as:

```text
“Make this documentary safer for YouTube without removing the core reporting.”
“Check whether all graphic footage has EDSA context in audio or video.”
“Prepare a YouTube-safe cut and a stricter advertiser-friendly cut.”
“Create a Shorts version but preserve all required context.”
```

The builder SHALL produce a plan + policy findings + proposed edits, not silently rewrite factual meaning.

---

# 73. Dual-Cut / Variant Support

One project MAY generate multiple policy variants:

```text
MASTER_DOCUMENTARY
YOUTUBE_FULL
YOUTUBE_AD_FRIENDLY
YOUTUBE_SHORTS
FACEBOOK
TIKTOK
```

Each variant SHALL have independent certification.

Shared evidence may be reused by hash, but platform policy results remain distinct.

---

# 74. Publishing Templates

Marketplace/workflow templates MAY expose policy-aware presets such as:
- News explainer;
- Documentary;
- Educational history;
- Scientific explainer;
- Sensitive-event reporting;
- AI reenactment;
- Short-form documentary.

Templates SHALL declare required policy nodes and SHALL NOT bypass final certification.

---

# 75. Tenant / White-Label Integration

White-label tenants MAY:
- choose supported target platforms;
- configure stricter editorial standards;
- choose allowed model providers;
- require human approval above selected thresholds;
- configure retention;
- configure default publication visibility;
- brand policy-review UI.

They MAY NOT alter the meaning of official platform policy rules.

---

# 76. Accessibility and Context

On-screen context SHOULD also be available through narration/captions where practical.

The system SHOULD avoid relying solely on tiny overlays that are unreadable on mobile.

Where an EDSA rule requires video/audio context, accessibility variants SHALL preserve that context.

---

# 77. Live / Streaming Considerations

Revision 1 focuses on uploaded media, but architecture SHALL reserve support for live streams.

Future live mode needs:
- delayed broadcast buffer;
- live ASR;
- real-time risk detection;
- moderation escalation;
- stream interruption policy;
- post-stream VOD re-certification.

Live publishing SHALL NOT be enabled by this revision unless separately acceptance-tested.

---

# 78. Model and Prompt Injection Defense

Retrieved descriptions, captions and external webpages may contain adversarial instructions.

All policy retrieval content SHALL be treated as untrusted data.

The engine SHALL:
- separate system rules from retrieved text;
- use structured extraction schemas;
- refuse tool instructions embedded in policy/source documents;
- sanitize URLs and metadata;
- never expose secrets to content analyzers.

---

# 79. External Agent / Specialist Integration

External agents via Specs 199/200 MAY participate as **bounded specialists** inside the Spec 227 problem-solving loop. Examples:
- inspect findings/evidence;
- propose alternate visual representations;
- critique semantic drift;
- propose storyboard/scene repairs;
- compare multiple candidate strategies;
- edit permitted project artifacts through governed APIs;
- run scan/certification jobs.

Possible runtime roles:

```text
REMEDIATION_PLANNER
VISUAL_REPRESENTATION_SPECIALIST
NARRATIVE_PRESERVATION_CRITIC
POLICY_CONTEXT_SPECIALIST
INDEPENDENT_REVIEWER
CANDIDATE_COMPARATOR
```

Spec 227 remains lifecycle authority for the media-compliance loop. A specialist agent's answer is evidence/proposal, not a final policy verdict. External agents SHALL NOT directly publish unless explicit user/tenant capability permits it.

## 79.1 Relationship to Spec 224

Spec 224 MAY control **software-development work** used to build/fix/extend Spec 227. It SHALL NOT become the default owner of a creator's media-remediation run.

If a Spec 227 runtime incident reveals a product defect that requires source-code changes, an authorized admin/developer workflow MAY create a separate linked Spec 224 `DevelopmentRun`:

```text
Media run incident / reproducible defect
        ↓
create engineering issue/evidence bundle
        ↓
AUTHORIZED DEVELOPMENT REQUEST
        ↓
Spec 224 DevelopmentRun
        ↓
plan → implement → test → debug → review → final verify
```

The media project and development run SHALL retain separate IDs, permissions, budgets, terminal states and audit trails. A creator video job MUST NOT wait for self-development to finish in order to reach its own best-effort completion.

## 79.2 Relationship to Spec 226

Spec 226 MAY let external development clients initiate/observe/replan the linked Spec 224 development run and normalize provider progress. It SHALL NOT be used as a backdoor to control creator media projects or bypass Spec 227/Spec 215 permissions.

## 79.3 Shared Orchestration Primitive Reuse

Where SmartAIHub exposes generic primitives derived from the Spec 224 architecture, Spec 227 SHOULD reuse them for:

```text
recovery strategy registry
decision epochs / supersession
budget guard
subrun DAG / fan-out / join
harness/provider strategy
checkpoint / resume
evidence aggregation
attention event projection
```

Reuse SHALL occur through generic platform contracts, not by pretending a media shot is a software-development phase.

---

# 80. Computer Use Integration

Computer Use MAY assist with platform UI steps only when:
- official APIs do not expose the required user workflow;
- platform terms permit the interaction;
- user authorization/session is valid;
- actions are visible/audited;
- high-impact actions require approval according to policy.

Computer Use SHALL NOT be used to bypass API restrictions or moderation controls.

---

# 81. Testing Strategy

Test layers:

```text
UNIT
RULE-CONTRACT
POLICY-PACK FIXTURE
MULTIMODAL ANALYZER
TIMELINE INTEGRATION
DB / MIGRATION
WORKER JOB
API
UI
END-TO-END
PLATFORM SANDBOX / PRIVATE-UPLOAD
SECURITY
CHAOS / RETRY
REGRESSION
POLICY-DRIFT
```

## 81.1 Mandatory Deep Problem-Solving / Semantic-Decision Matrix

| ID | Scenario | Expected |
|---|---|---|
| P01 | prompt rewrite fails 3 times for same effective reason | classify no-progress; escalate to a different strategy tier rather than paraphrase again |
| P02 | safer camera/composition preserves Shot Synopsis | accept representation repair automatically after semantic verification |
| P03 | only policy-safer proposal changes who performs the key story action | create Semantic Drift Decision; do not silently mutate Shot Synopsis |
| P04 | creator selects `CONTINUE_ORIGINAL_INTENT` | authorize bounded further generation / best-effort completion; retain warning if unresolved |
| P05 | creator selects `EDIT_SEMANTIC_SOURCE` | open correct Shot/Scene source; save new version; invalidate/rebuild only affected downstream branch |
| P06 | unaffected shots are dependency-independent while Shot 14 waits | other shots continue; project does not globally pause |
| P07 | next video generation is materially expensive and repair hypothesis is weak | show cost range + continuation envelope before spending beyond pre-authorized budget |
| P08 | different provider/model can solve a capability limitation without semantic change | switch via capability strategy; preserve lineage/evidence |
| P09 | complex issue benefits from visual specialist + narrative critic | bounded subproblems fan out/join; parent loop synthesizes; specialists do not self-certify |
| P10 | all reasonable strategies exhausted | choose best candidate; `VIDEO_COMPLETED`; unresolved platform warning; no infinite loop |
| P11 | minor present in normal family/education scene | no automatic block, no age-up/removal solely because a minor is present |
| P12 | Spec 224 unavailable | Spec 227 loop remains functional over `worker_jobs` compatibility path |
| P13 | Spec 224/226 available and a code defect is found | linked software `DevelopmentRun` may fix product code; creator media run remains separate and completable |
| P14 | stale semantic decision arrives after Shot Synopsis changed | reject/supersede stale decision using version/epoch fence |

---

# 82. Mandatory EDSA Test Matrix

At minimum:

| ID | Scenario | Expected |
|---|---|---|
| E01 | ordinary educational video, no violation candidate | `EDSA_NOT_REQUIRED` |
| E02 | documentary violence with sufficient nearby A/V context | internal EDSA readiness, subject to risk review |
| E03 | graphic violence with context only in description | context failure when active rule requires A/V |
| E04 | high-risk scene with generic intro disclaimer only | no automatic satisfaction |
| E05 | platform no-exception category | completed artifact + `NOT_READY_FOR_PLATFORM` warning; no context-washing |
| E06 | quoted harmful claim with clear countervailing explanation | evaluate context and purpose; no automatic approval |
| E07 | same harmful claim promoted as recommendation | ordinary policy violation path |
| E08 | context overlay cropped from Shorts export | derivative certification fails/requires fix |
| E09 | Thai narration has context, English dub omits it | English variant fails/requires review |
| E10 | final render changes after certification | certification invalidated |
| E11 | policy pack materially changes | affected certification re-evaluation queued |
| E12 | comments contain context but video/audio do not | comments do not satisfy A/V requirement |

---

# 83. Synthetic Media Test Matrix

| ID | Scenario | Expected |
|---|---|---|
| S01 | non-realistic cartoon generation | evaluate; normally no realistic altered-content disclosure solely on this basis |
| S02 | photorealistic event that never occurred | disclosure candidate/required under active rule |
| S03 | real person made to appear to say new words | disclosure candidate/required |
| S04 | minor assistive color correction | no automatic disclosure solely because AI tool used |
| S05 | disclosure required but API field omitted | publication gate blocks until corrected |
| S06 | `containsSyntheticMedia=true` prepared for supported YouTube upload | API mapping test passes |

---

# 84. Monetization Separation Tests

| ID | Scenario | Community/EDSA | Monetization |
|---|---|---|---|
| M01 | documentary, non-graphic reporting | may be clear | independently evaluated |
| M02 | graphic documentary content with context | may be EDSA-ready | may be limited/no ads risk |
| M03 | content body clean, shocking thumbnail | body may pass | thumbnail/ad risk still flagged |
| M04 | policy updated Aug 2026 pack vs older pack | decisions tied to correct version | no stale rule reuse |

---

# 85. Rights / Provenance Tests

- EDSA-ready + missing footage rights -> not fully publish-ready;
- licensed footage + expired license -> invalidated;
- AI-generated asset with provider provenance -> propagated;
- source asset replaced -> downstream certification invalidated;
- identical asset hash reused -> evidence de-duplication permitted.

---

# 86. Resilience Tests

Mandatory:
- ASR service timeout;
- OCR timeout;
- model returns invalid JSON;
- policy source fetch returns HTML error page;
- policy source changes layout;
- job retried after worker crash;
- upload request times out after server may have accepted video;
- auth expires mid-upload;
- platform status unavailable;
- final object changed between hash and upload;
- duplicate publish command.

No resilience test may permit duplicate external publication.

---

# 87. Security Tests

Mandatory:
- tenant A cannot read tenant B evidence;
- platform token never enters logs;
- prompt injection inside description cannot call tools;
- malicious subtitle cannot alter policy rules;
- role without publisher permission cannot upload;
- reviewer cannot approve a certification for changed bytes;
- signed URLs expire;
- sensitive frame access audited.

---

# 88. Performance Targets

Initial targets SHOULD be measured and tuned, not treated as hard universal guarantees.

Suggested SLO starting points:
- script/metadata scan p95 < 10s for normal project sizes;
- timeline incremental scan returns first findings progressively;
- final long-video scan supports asynchronous progress;
- policy registry reads p95 < 200ms from cache/DB;
- no synchronous web-policy fetch on the publication critical path;
- evidence bundle generation resumable for large projects.

---

# 89. Policy Freshness SLO

Suggested:
- official source freshness check daily for high-impact policy families;
- source change detection within 24h target;
- material change review alert immediately after diff classification;
- UI displays last verified date;
- stale policy pack warning threshold configurable.

Publishing need not stop merely because a source has not changed recently, but a failed freshness process SHALL be observable.

---

# 90. Admin UI

Admin policy console SHOULD provide:

```text
Policy Sources
Policy Packs
Pending Diffs
Rule Changes
Activation History
Affected Certifications
Model Quality Dashboard
Incident Dashboard
False Positive / False Negative Review
Tenant Overlays
```

Admin SHALL be able to inspect normalized rule -> exact official source provenance.

---

# 91. Creator Explanation UX

For every significant finding, show:

```text
What was detected?
Where was it detected?
Which policy dimension is affected?
Why does it matter?
What context is currently present?
What is missing?
Which fixes are available?
Does human review remain required after the fix?
Which policy version is being used?
```

Avoid unexplained “AI says unsafe” messages.

---

# 92. No False Promise UX

Forbidden creator-facing phrases unless quoting an external platform result:

```text
Guaranteed YouTube safe
100% monetization safe
EDSA approved by YouTube
Will not get a strike
Copyright safe guaranteed
```

Preferred:

```text
Internal policy checks complete
EDSA context appears ready under policy pack X
Human review required
YouTube may still apply restrictions
Platform decision pending
```

---

# 93. Definition of Done — Core

Spec 227 core is implementation-complete only when:

1. versioned Policy Registry exists;
2. YouTube official policy sources are snapshot-backed;
3. structured rule engine is active;
4. RAG is supplementary, not authoritative;
5. script/metadata/thumbnail scanner works;
6. multimodal final scanner works;
7. scene-level evidence is produced;
8. EDSA WHAT/WHERE engine works;
9. destination restriction / SmartAIHub safety-legal controls are represented separately;
10. multidimensional decisions exist;
11. Skill-first remediation is orchestrated by a multi-iteration engineering loop and semantic fidelity is verified after each material change;
12. the loop distinguishes prompt repair from deeper problem solving and can escalate through structural replan, capability/provider change, specialist/critic invocation and bounded subproblem decomposition;
13. semantic source-of-truth hierarchy and drift detection prevent silent story/meaning mutation;
14. Semantic Drift & Credit Decision Gate offers both continuation and edit-source paths;
15. scoped downstream invalidation/rebuild works after a creator changes a Shot Synopsis/Scene source;
16. adaptive strategy escalation, best-candidate preservation and bounded exhaustion produce warning-and-complete rather than creative-workflow failure;
17. human review/semantic decisions work;
18. final hashes and evidence bundle work;
19. certification invalidates on change;
20. YouTube adapter can upload through supported official mechanisms;
21. synthetic media field is handled where supported;
22. private-first flow works;
23. duplicate upload is prevented;
24. policy drift workflow works;
25. audit/security/tenant isolation tests pass;
26. `VIDEO_COMPLETED` is independently reachable when compliance remains warning/review/not-ready;
27. Spec 224/226 boundaries are enforced: software-development control can implement/fix Spec 227 without becoming the media-runtime owner;
28. shared orchestration primitives are reused or abstracted for later migration rather than duplicated incompatibly.

---

# 94. Acceptance Criteria

## AC-227-001 — Number and ownership
Spec 227 is implemented as an independent cross-cutting policy/publishing capability and does not rewrite earlier implemented specs.

## AC-227-002 — Platform-neutral core
No YouTube-specific EDSA concept is required in the core interface to support future platforms.

## AC-227-003 — YouTube EDSA policy pack
The active YouTube pack represents WHAT/WHERE semantics and rule-specific context placement.

## AC-227-004 — No fake EDSA approval
No API/UI state falsely claims SmartAIHub grants a YouTube EDSA exception.

## AC-227-005 — No context-washing and scoped restriction
No-exception platform rules cannot be bypassed by adding generic context. The resulting restriction applies to target publication readiness, not to successful completion of an otherwise renderable video artifact.

## AC-227-006 — Final-render scan
A candidate cannot be final-certified from script-only analysis.

## AC-227-006A — Skill-first prompt remediation
Meaning-bearing image/video prompt remediation uses a governed Skill with semantic-fidelity verification; hard-coded word replacement is not the primary remediation path.

## AC-227-006B — Engineering remediation loop
A failed Skill result automatically triggers diagnosis, a materially different next strategy, semantic/quality verification and policy re-scan while authorized budgets remain. The runtime does not surface a generic repair error to the user while autonomous strategies remain.

## AC-227-006C — Best-candidate + bounded warning completion
After configured remediation/regeneration limits are exhausted, the system preserves the best usable candidate across all iterations, records `REMEDIATION_EXHAUSTED_WARNING` (or a more specific warning), completes rendering when otherwise possible, and does not enter an infinite compliance loop.

## AC-227-006D — Durable autonomous continuation
Engineering-loop state survives worker/process restart, resumes with prior attempt evidence, and does not request user action while a permitted autonomous repair strategy remains.

## AC-227-006E — Completion is independent from platform readiness
A project can reach `VIDEO_COMPLETED` while a YouTube candidate is `NOT_READY_FOR_PLATFORM`, `HUMAN_REVIEW_RECOMMENDED`, `REMEDIATION_EXHAUSTED_WARNING` or another publication-warning state.

## AC-227-006F — Engineering loop is deeper than prompt retry
A fixture in which prompt rewrites repeatedly fail MUST cause evidence-based escalation to a different strategy class such as structural shot replan, alternate capability/provider or specialist/critic analysis. Rephrasing the same prompt N times does not satisfy this criterion.

## AC-227-006G — Semantic drift decision
When the best policy-safer proposal materially changes a creator-approved Shot Synopsis/Scene meaning, the system does not silently apply it. It creates a durable semantic decision exposing at least `CONTINUE_ORIGINAL_INTENT` and `EDIT_SEMANTIC_SOURCE`.

## AC-227-006H — Credit-aware continuation
Before an uncertain materially expensive regeneration outside pre-authorized budget, the decision surface shows spent/estimated credits and allows the creator to authorize a bounded continuation envelope. Choosing continuation preserves a path to artifact completion even if platform readiness remains warning.

## AC-227-006I — Scoped semantic-source rebuild
Editing one Shot Synopsis invalidates and rebuilds only affected downstream storyboard/prompt/asset/timeline dependencies; unrelated scenes continue where dependency-safe.

## AC-227-006J — Specialist/subproblem escalation
A complex fixture can fan out bounded specialist/critic subproblems, join their evidence and select/replan a next strategy without giving any specialist lifecycle or certification authority.

## AC-227-006K — Spec 224/226 boundary
When Spec 224/226 are available, they may control implementation/fix work for Spec 227 and expose external development control/progress, but an ordinary media-compliance run remains a Spec 227 lifecycle. The media job is not converted into `DevelopmentRun`.

## AC-227-006L — 224 unavailable compatibility
Spec 227 remains operational over canonical `worker_jobs` before shared Spec 224-derived orchestration primitives are available, and can migrate to shared primitives later without changing creator-facing contracts.

## AC-227-006M — Minor presence is not automatic rejection
A normal image/video scenario containing a child/minor is generated and evaluated contextually; the runtime does not remove, age-up or reject the subject solely due to minor presence. Sensitive/prohibited risk is evaluated as a separate dimension.

## AC-227-007 — Timeline evidence
High-risk video findings include time ranges and evidence references.

## AC-227-008 — A/V context enforcement
Where policy requires A/V context, description-only context cannot satisfy the rule.

## AC-227-009 — Multilingual isolation
Each materially different language/dub variant has independent derived policy status.

## AC-227-010 — Derivative isolation
Shorts/reframes are independently final-scanned.

## AC-227-011 — Disclosure mapping
YouTube upload maps synthetic-media disclosure to supported official API fields.

## AC-227-012 — Monetization separation
EDSA/community and monetization states are never collapsed.

## AC-227-013 — Copyright separation
EDSA status never clears rights/copyright requirements.

## AC-227-014 — Policy version binding
Every certification references immutable policy pack versions.

## AC-227-015 — Content hash binding
The uploaded artifact hash must match the certified hash.

## AC-227-016 — Invalidation
Material content/metadata change invalidates affected certification dimensions.

## AC-227-017 — Evidence bundle
Every final certification can export/retrieve its evidence manifest.

## AC-227-018 — Human review audit
Reviewer identity, reason, policy version and hashes are recorded.

## AC-227-019 — Private-first publishing
Managed YouTube flow supports private upload before public release.

## AC-227-020 — No undocumented endpoint
No production path depends on undocumented/private YouTube API behavior.

## AC-227-021 — Retry safety
Network retry cannot create duplicate videos silently.

## AC-227-022 — Policy source diff
A changed official source produces a reviewable semantic diff.

## AC-227-023 — Policy pack activation governance
Material policy changes are not silently activated without configured review.

## AC-227-024 — Post-publish incident
A later platform restriction can be linked to original evidence and policy version.

## AC-227-025 — Tenant isolation
Cross-tenant policy evidence access tests pass.

## AC-227-026 — Role isolation
Only authorized roles can approve or publish high-risk content.

## AC-227-027 — Secrets
No platform token appears in user-visible findings, evidence bundles or logs.

## AC-227-028 — RAG fail-safe
A failed/empty policy retrieval cannot produce permission.

## AC-227-029 — Model schema validation
Malformed model output is rejected and does not become a policy decision.

## AC-227-030 — Policy explanation
Every destination-restricting or high-risk finding exposes source rule ID and supporting evidence.

## AC-227-031 — Remediation loop
Applied fix -> affected rescan -> final full certification works end-to-end.

## AC-227-032 — Editor markers
Timeline markers seek to exact problematic ranges.

## AC-227-033 — Provenance propagation
Source/generated asset provenance propagates into candidate evidence.

## AC-227-034 — Claim grounding integration
Configured fact-sensitive workflows can bind claims to sources.

## AC-227-035 — Observability
Scan, review, certification, invalidation and publish metrics are emitted.

## AC-227-036 — Historical reproducibility
Given stored artifacts/rule packs/analyzer versions, investigators can reconstruct why the engine made a decision.

## AC-227-037 — Platform verdict distinction
Internal estimate, creator self-certification and platform review result are distinct types.

## AC-227-038 — Accessibility preservation
Required context is not lost in captions/audio variants used by publication.

## AC-227-039 — Failure transparency
Unknown/incomplete scans show a non-green state; they never default to clear.

## AC-227-040 — Cross-platform extensibility
A second mock platform adapter can be implemented without changing core DB semantics for YouTube EDSA.

---

# 94A. Revision 4 Cross-Spec Decision Record

Revision 4 was produced after reviewing **Spec 224 Revision 11** and **Spec 226 Revision 2**. The resulting architecture decision is:

```text
Spec 224 = software-development lifecycle owner
Spec 226 = compatibility/control/progress bridge into Spec 224
Spec 227 = media policy-aware production/compliance lifecycle owner

Shared/generic orchestration primitives MAY be reused.
Domain lifecycle ownership SHALL NOT be collapsed.
```

Revision 4 explicitly rejects the assumption that an “engineering loop” is adequately implemented by `rewrite prompt → regenerate → scan → repeat`. That is only T1 of the escalation ladder. Complex remediation MUST be able to re-diagnose, structurally replan, change capability, invoke bounded specialists/critics, decompose subproblems, or return a genuine semantic decision to the creator.

The creator-facing invariant is:

> **Try hard automatically; never silently rewrite the story; when meaning or meaningful credit spend becomes the real decision, offer Continue vs Edit Source; whichever valid choice the creator makes, preserve a route to finish the video.**

---

# 95. Release Gates

## Gate A — Architecture
- schemas reviewed;
- rule contract reviewed;
- policy source governance approved;
- cross-spec integration approved.

## Gate B — Internal Scanning
- script/metadata/thumbnail tests pass;
- multimodal fixture suite passes;
- EDSA matrix passes.

## Gate C — Editor Integration
- timeline findings;
- remediation;
- re-scan;
- final invalidation;
- semantic source hierarchy;
- semantic drift decision card;
- continue-vs-edit-source paths;
- scoped downstream rebuild.

## Gate C2 — Deep Problem-Solving
- prompt-only retry fixture escalates correctly;
- structural replan works;
- alternate provider/capability strategy works where configured;
- specialist/critic fan-out/join works;
- hypothesis/no-progress detection works;
- credit-aware decision gate works;
- warning-complete always-finish behavior works;
- Spec 224/226 ownership boundary tests pass.

## Gate D — Publishing
- official YouTube auth/upload;
- private-first;
- disclosure fields;
- idempotency;
- hash match.

## Gate E — Operations
- policy source monitor;
- admin review;
- metrics;
- incident flow;
- runbooks.

## Gate F — Production Enablement
- canary tenant/channel;
- no critical security findings;
- no unresolved hard-rule false-negative defects;
- rollback tested.

---

# 96. Rollout

Recommended:

```text
Stage 1  OBSERVE_ONLY for internal channels
Stage 2  WARN + engineering-loop telemetry
Stage 3  AUTO_OPTIMIZE + deep escalation + warning completion
Stage 4  MANAGED_AUTO_PUBLISH acknowledgments for selected channels
Stage 5  tenant opt-in policy profiles
Stage 6  default enablement after quality/fidelity thresholds
```

Do not enable automatic public publishing for high-risk content in the first production stage.

---

# 97. Operational Runbooks Required

Before production:
- policy source outage;
- incorrect policy pack activation;
- model false-negative incident;
- duplicate upload uncertainty;
- YouTube OAuth expiry;
- platform API quota/rate limit;
- content hash mismatch;
- sensitive evidence leak;
- platform restriction after publication;
- rollback policy pack;
- revoke compromised platform credential.

---

# 98. Cross-Spec Ownership Matrix

| Capability | Owner |
|---|---|
| durable async execution | existing worker job / Runner control plane |
| external MCP | Spec 199 |
| external agents | Spec 200 |
| computer-use execution | Spec 208 |
| workflow authoring | Spec 209 |
| node catalog/runtime | Specs 214/215 |
| provenance/copyright evidence | Spec 187 where applicable |
| mobile/cross-device approval | Spec 225 |
| compatibility with implemented baseline | Spec 226 |
| publishing policy / EDSA / certification | **Spec 227** |

Spec 227 SHALL call shared infrastructure; it SHALL NOT recreate these systems.

---

# 99. Future Extensions

Reserved directions:
- Facebook/Instagram policy adapter;
- TikTok policy adapter;
- X policy adapter;
- podcast/audio platform adapter;
- live-stream policy guard;
- regional legal overlays;
- Content Credentials/C2PA verification expansion;
- creator-specific learned false-positive calibration without relaxing hard rules;
- platform feedback learning loop;
- policy simulation for multiple target platforms before edit;
- batch certification for episodic series;
- public API for external creator tools.

---

# 100. Implementation Order

Recommended engineering order:

```text
P227-01  schemas + migrations
P227-02  policy rule contract
P227-03  YouTube source snapshot / policy packs
P227-04  policy diff governance
P227-05  script/metadata/thumbnail scanner
P227-06  multimodal analysis pipeline
P227-07  scene risk graph
P227-08  EDSA WHAT/WHERE engine
P227-09  multidimensional decision aggregator
P227-10  remediation Skill contracts + semantic fidelity verifier
P227-10A engineering-loop orchestrator + strategy escalation + best-candidate store
P227-11  Video Editor timeline integration
P227-12  human review / approval
P227-13  certification + evidence bundle
P227-14  invalidation engine
P227-15  YouTube official publishing adapter
P227-16  synthetic-media disclosure mapping
P227-17  private-first + platform observation flow
P227-18  post-publish monitor / incident
P227-19  admin policy console
P227-20  benchmark / regression / security suite
P227-21  canary rollout
P227-22  production readiness final verify
```

Parallelization is allowed only where schema/contracts are stable.

---

# 101. Final Verify Checklist

`P227 FINAL_VERIFY = PASS` requires all items below:

```text
[ ] active immutable YouTube policy pack exists
[ ] official source provenance recorded
[ ] policy diff workflow tested
[ ] platform no-exception advisory path tested without blocking VIDEO_COMPLETED
[ ] EDSA WHAT model tested
[ ] EDSA WHERE model tested
[ ] high-harm A/V requirement tested
[ ] metadata-only false pass impossible
[ ] final render multimodal scan tested
[ ] multilingual variant tested
[ ] Shorts/reframe invalidation tested
[ ] copyright separation tested
[ ] monetization separation tested
[ ] synthetic media disclosure tested
[ ] evidence bundle hash verified
[ ] final asset hash == upload asset hash
[ ] human review audit tested
[ ] role enforcement tested
[ ] tenant isolation tested
[ ] engineering loop uses previous-attempt evidence
[ ] repeated-identical repair strategy is prevented
[ ] best-candidate rollback/preservation tested
[ ] exhausted remediation produces completed video + warning
[ ] retry/idempotency tested
[ ] private upload tested
[ ] no undocumented YouTube endpoint dependency
[ ] post-publish incident path tested
[ ] policy change re-evaluation tested
[ ] no unresolved P0/P1 defect
```

If any mandatory item is unresolved:

```text
P227 FINAL_VERIFY = BLOCKED
```

The implementation SHALL report exact blocker IDs and resume points rather than treating partial implementation as completion.

---

# 102. Canonical Product Position

Spec 227 establishes SmartAIHub as a **policy-aware media production and publishing system**, not merely a generation tool.

The intended product behavior is:

> Create → understand policy → preserve context → remediate → verify the actual final media → record evidence → obtain the required human/platform decisions → publish → monitor.

For YouTube specifically, EDSA is implemented as a **context-sensitive exception-readiness workflow**, not as a checkbox and not as a promise of platform approval.

This architecture allows SmartAIHub to add future platform policies without redesigning the media creation pipeline, while keeping policy decisions explainable, versioned, auditable and linked to the exact bytes that were published.

---

# Appendix A — Canonical Decision Example

```json
{
  "candidate_id": "pc_301",
  "platform": "youtube",
  "policy_pack_set": "yt-2026-09-22.1",
  "final_render_hash": "sha256:...",
  "dimensions": {
    "community_guidelines": "HUMAN_REVIEW_RECOMMENDED",
    "edsa_readiness": "EDSA_READY_INTERNAL",
    "advertiser_suitability": "WARNING",
    "copyright_rights": "CLEAR",
    "synthetic_media_disclosure": "REQUIRED",
    "age_restriction_risk": "WARNING",
    "privacy_pii": "CLEAR"
  },
  "publication_gate": "ACK_OR_REVIEW"
}
```

No dimension may silently overwrite another.

---

# Appendix B — Example Remediation Plan

```json
{
  "plan_id": "rem_818",
  "candidate_id": "pc_301",
  "finding_ids": ["pf_10042"],
  "steps": [
    {
      "type": "ADD_NARRATION",
      "range_ms": [129000, 141000],
      "requires_human_approval": true
    },
    {
      "type": "ADD_ONSCREEN_LABEL",
      "range_ms": [134000, 145000],
      "requires_human_approval": false
    }
  ],
  "after_apply": {
    "required": ["INCREMENTAL_RESCAN", "FINAL_FULL_SCAN"]
  }
}
```

---

# Appendix C — Repository Layout Proposal

```text
specs/feature/227-publishing-policy-edsa-compliance-engine/
  spec.md

apps/web/
  app/.../policy-publishing/

packages/
  policy-core/
  policy-registry/
  policy-rules/
  policy-rag/
  publishing-core/
  publishing-youtube/
  compliance-evidence/

services/
  policy-source-ingestor/
  multimodal-policy-analyzer/
  post-publish-monitor/

workers/
  policy-jobs/

policy-packs/
  youtube/
    community-guidelines/
    edsa/
    advertiser-friendly/
    altered-synthetic-media/

schemas/
  policy/
  publishing/
```

Actual repository placement SHOULD follow the current monorepo conventions discovered during implementation rather than force this illustrative layout.

---

# Appendix D — Source Registry Seed

Initial approved official sources:

1. YouTube EDSA guidance  
   `https://support.google.com/youtube/answer/6345162?hl=en`

2. YouTube Community Guidelines overview  
   `https://support.google.com/youtube/answer/9288567?hl=en`

3. Advertiser-friendly content guidelines  
   `https://support.google.com/youtube/answer/6162278?hl=en`

4. Advertiser-friendly policy update log  
   `https://support.google.com/youtube/answer/9725604?hl=en`

5. GenAI / altered-content disclosure  
   `https://support.google.com/youtube/answer/14328491?hl=en`

6. Upload / monetization checks  
   `https://support.google.com/youtube/answer/7561938?hl=en`

7. Upload flow  
   `https://support.google.com/youtube/answer/57407?hl=en`

8. Additional review / private videos  
   `https://support.google.com/youtube/answer/16271309?hl=en`

9. YouTube Data API video resource  
   `https://developers.google.com/youtube/v3/docs/videos`

The implementation SHALL snapshot and version these sources; URLs alone are not sufficient audit evidence.

---

# End of Spec 227 Revision 1

---

# Revision 5 Current Cross-Spec Alignment

Current dependencies/boundaries for this revision are:

```text
Spec 224 Revision 19+ = software-development lifecycle/closure authority
Spec 225 Revision 7+  = first-party device/cross-device surfaces
Spec 226 Revision 9+  = additive compatibility/external-control bridge
Spec 228 Revision 7+  = maintenance/issue/improvement lifecycle
Spec 230 Revision 2+  = development harness context/bootstrap
Spec 222 Revision 17+ = learning/advisory plane
```

Earlier Revision 4 references to older 224/226 revisions remain historical rationale and do not pin implementation to those obsolete revision numbers.

Kimi Code MAY participate as a bounded software-development harness when implementing/fixing Spec 227 through a linked Spec 224 DevelopmentRun, or as an authorized specialist where a normal external-agent capability is appropriate. Kimi Code SHALL NOT become the media-policy lifecycle owner, publication authority or compliance final verifier merely because its Desktop includes browser/computer tools.
---

# Revision 5C — Policy RAG Uses Spec 229 Without Delegating Policy Authority

Where Spec 227 uses retrieval/RAG for platform policies, evidence, guidance or historical policy sources, the retrieval transport/indexing/search SHALL use **Spec 229 Retrieval Broker** after cutover.

Spec 227 remains the sole owner of policy-rule semantics, policy pack versioning, remediation decisions, certification state and publication readiness. A high-scoring retrieval result cannot grant permission or override a no-exception rule.

```text
Spec 227 policy query
   ↓ authorized evidence request
Spec 229 Retrieval Broker
   ↓ cited/versioned evidence
Spec 227 policy engine
   ↓
rule evaluation / remediation / certification
```

Retrieval failure, stale policy evidence, ACL uncertainty or insufficient evidence MUST remain fail-safe/non-green under Spec 227 rules.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 6 — Policy Retrieval Evidence Hardening

Policy RAG SHALL use Spec 229 for retrieval transport, but Spec 227 MUST preserve exact policy-source identity/version and deterministic rule references.

For authoritative policy evaluation:

```text
exact/versioned rule lookup
+ retrieved supporting context
+ policy engine interpretation
```

is preferred over vector similarity alone.

Policy evidence returned by Spec 229 SHALL be rechecked for source version/freshness before a material publication decision where configured. A stale or semantically similar policy snippet cannot authorize publication.

Policy corpus ingestion/deletion/visibility changes SHALL propagate through Spec 229 projection lifecycle. Search quality tests MUST include exact rule IDs, policy-version changes, conflicting old/new guidance and multilingual wording.
