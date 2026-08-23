# Feature 160 — Skill-first Prompt Expansion and Context-aware Visual Source Assets

**Status:** DESIGN AMENDED — MEDIA/FOOTAGE/NEWS SCOPE ADDED — SPEC REVIEW PASSED (5 rounds)
**Created:** 2026-08-23
**Last amended:** 2026-08-23
**Priority:** P0 for review/documentary authoring; optional for fiction
**Depends on:** Feature 153 long-form story architecture, Feature 154 documentary/review grounding, Feature 155 credit ledger, Feature 156 Series Profile/Story Sources & Media, existing managed-media and shot-reference contracts

## 1. Executive decision

Extend the existing **Story Sources & Media** aggregate with two optional capabilities:

1. A skill-first prompt-expansion flow that turns a short creator idea into a reviewable structured brief and a ready-to-use prompt.
2. A visual-source planning flow that proposes editable media slots, generates prompts and images on demand, accepts creator-uploaded stills and video footage, and binds approved media to story/episode usage with explicit semantic roles.
3. A shared visual canon and evidence ledger that propagates the confirmed source set through draft, full story, deep shot draft, start-frame, reference, B-roll, and final assembly.
4. A dedicated `news_report` editorial profile, separate from documentary, using the same media/source infrastructure but stricter freshness, attribution, claim, correction, and footage rules.

The feature must return to the existing Vertical Drama flow after user confirmation. It must not force prompt expansion, source-slot generation, image generation, web research, or shot binding.

The existing source pack, `media_assets`, credit ledger, managed storage, start-frame state, shot-reference pipeline, and episode assembly remain authoritative. No second source/media aggregate is introduced. A bounded prompt-expansion run record may be added only to support async recovery and idempotency; it is an operation ledger, not a competing source of truth. Feature-specific normalized child records may describe source segments, evidence, visual canon snapshots, and B-roll bindings, but must always resolve back to the canonical source/media rows.

## 2. Problem statement

Creators often know the subject but not the production brief:

- “รีวิวร้านกาแฟหรูหรา อยู่ริมอ่างเก็บน้ำ”
- “แนวสารคดี พาท่องเที่ยวหอไอเฟล”
- “แนวสารคดี ปะการังน้ำตื้นและการอนุรักษ์”
- “รีวิวการใช้งาน smartaihub.app เกี่ยวกับการสร้างซีรีย์แนวตั้ง”

The current free-form premise can be too short for reliable review/documentary/news coverage. It also does not provide a consistent way to plan visual coverage before episode drafting. If media is later attached to a shot without understanding its semantic purpose, a restaurant/location image can incorrectly compete with a start frame, a product/software detail image can incorrectly replace a scene, or real video footage can be treated as a generic reference instead of a timed B-roll segment. News also needs a stronger separation between verified claims, direct observations, archive footage, creator footage, file footage, and AI illustration.

## 3. Goals

1. Let a creator preview an AI-expanded brief in a dialog, inspect assumptions and research evidence, then explicitly apply or cancel it.
2. Use web research when the prompt names an identifiable place, venue, product, software, website, or URL.
3. Treat broad topics as creative interpretation unless the user supplies evidence; never present invented details as verified facts.
4. Create editable visual/media slots from the confirmed brief without creating paid image tasks.
5. Generate prompts per slot or in a selected batch using the existing skill/media generation path.
6. Generate images per slot or in a selected batch using existing credit, task, import, and managed-media contracts.
7. Accept creator-uploaded real photos and video footage, including multiple usable time segments from one footage file.
8. Classify each visual/media slot into explicit semantic roles:
   - `scene_anchor`: place, venue, interior, exterior, route, or environment that can define a scene;
   - `subject_reference`: product, object, UI, dish/detail, material, or other subject reference that supplements a scene;
   - `b_roll_insert`: planned cutaway, insert, overlay, still B-roll, or video footage segment that must not silently become a start frame.
9. Distinguish media modality, origin, evidence status, and semantic role; an AI-generated image is never equivalent to creator footage.
10. Propagate one immutable visual-source snapshot and fingerprint into draft, full story, shot plans, and final B-roll assembly.
11. Add a dedicated `news_report` profile with claim/evidence/attribution/freshness/correction contracts.
12. Allow users to override an AI role recommendation while showing the consequence of that override.
13. Let episode shots select Story Source media with conflict-aware behavior when an existing start frame or scene anchor is present.
14. Preserve tenant isolation, rights/disclosure state, media durability, credit idempotency, and legacy source/scene behavior.

## 4. Non-goals

1. Do not require prompt expansion before normal story drafting.
2. Do not scrape or copy Google Maps imagery, third-party photographs, or copyrighted page assets.
3. Do not claim AI-generated imagery is an accurate photograph of a real location.
4. Do not silently replace an approved start frame or merge scene and subject references.
5. Do not create a new wallet, credit ledger, provider routing contract, or media playback system.
6. Do not automatically generate all recommended images or video assets when slots are planned.
7. Do not make a source slot a factual claim merely because a user or model typed a description.
8. Do not rewrite the story bible, relationship graph, draft history, or QC ledger without the existing explicit flow.
9. Do not build an unbounded JSON array for unlimited slots. Slots remain normalized source-pack rows with server quotas and bounded payloads.
10. Do not fetch arbitrary user URLs from the application server outside the approved research/search boundary.
11. Do not treat image/video pixels alone as proof of a factual claim, current status, location, date, casualty/impact figure, or official measurement.
12. Do not make real news footage, archive footage, or licensed media editable by an AI image/video generator unless the user explicitly chooses an edit workflow and the result is labelled as generated/derived.
13. Do not overload `vertical_drama_shot_references` with footage timeline semantics; reference bindings and B-roll segment bindings remain separate contracts.

## 5. User flow

### 5.1 Prompt expansion

1. User enters a short premise in the existing premise field.
2. User clicks `ช่วยขยายโจทย์`; the UI explains that an identifiable entity may invoke the existing LLM/web-search accounting and shows the available preflight estimate when the provider can calculate one.
3. The server classifies the prompt as `specific_entity`, `broad_topic`, or `mixed`.
4. Identifiable entities trigger the research skill; broad topics do not require web search.
5. The expansion skill returns a structured preview.
6. The dialog displays the original prompt, ready-to-use prompt, structured interpretation, assumptions, open questions, warnings, and research sources.
7. User chooses `นำโจทย์นี้ไปใช้`, `สร้างคำตอบใหม่`, or `ยกเลิก`.
8. Apply is compare-and-swap protected by the original prompt hash. It writes to the existing premise field only after confirmation.
9. The user can continue editing the applied prompt and enter the existing planning/draft flow normally.

Cancel, research failure, or stale preview must leave the original premise unchanged.

### 5.2 Visual planning

1. User opens Story Sources & Media after applying or editing the premise.
2. User clicks `คิดภาพประกอบจากโจทย์`.
3. The system proposes editable draft slots with title, short description, semantic role, rationale, and confidence.
4. The user edits, deletes, reorders, or adds slots.
5. User generates a prompt for one slot or selected slots.
6. User reviews/edits the prompt.
7. User generates an image for one slot or selected slots. Credit estimate/preflight is shown before paid generation.
8. Completed images are imported as managed media and linked to source assets; provider URLs are not canonical.

For a generated `scene_anchor` or software/UI visual, the card must show a plain-language notice such as “ภาพตีความโดย AI ไม่ใช่ภาพยืนยันสถานที่/หน้าจอจริง” unless the asset is a creator-provided or rights-cleared source. A generated illustration may support the story visually, but it is never evidence of a real location, current product UI, price, feature, or operating condition.

### 5.3 Real photos and video footage

1. User can upload a still image or video footage into a source asset through the existing managed-media import path.
2. The system derives and stores bounded media metadata: `mediaType`, MIME type, dimensions, file size, duration when video, orientation, checksum, and storage readiness.
3. The user can describe provenance: capture date/time, location, photographer/source, rights status, disclosure requirement, and whether the file is current, archive, file footage, or illustrative.
4. For video, the system creates a poster/thumbnail and may create a bounded transcript or shot index. It must not send the entire footage to an LLM by default.
5. The user can create one or more named source segments with `inPointSec`, `outPointSec`, description, evidence scope, and intended B-roll role. A segment is the production unit; the original media asset remains immutable.
6. A real photo or footage segment can be marked `creator_evidence` or `verified_source` only when the user supplies sufficient provenance or an approved source record. Upload alone does not prove date, place, or factual claim.
7. AI-generated image/video remains `illustrative_only` unless a separate human/official evidence process explicitly changes its evidence status; the normal flow must not do so automatically.
8. The UI must show whether a candidate is a still, footage, archive, file footage, creator upload, licensed source, web import, or AI-generated illustration before binding.

### 5.4 News authoring flow

1. If the prompt describes a current event, incident, public warning, disaster, election, market movement, or “latest/current/today” situation, the user is offered the `ข่าว` / `news_report` profile separately from `สารคดี`.
2. The news preflight extracts a bounded claim ledger with `claimId`, claim text, time scope, geography, source requirement, and verification status.
3. Web search and supplied sources are used to verify claims; the original user text is not silently treated as verified.
4. The user reviews the claim/evidence summary and the proposed visual coverage before the full story is generated.
5. The story plan maps every material claim to source evidence and, where appropriate, a visual still or footage segment. A visual may illustrate a claim but cannot replace textual/source verification.
6. Full story and deep shots carry attribution, `asOf` time, archive/file-footage labels, and `needs_update` markers where applicable.
7. Changing the news source snapshot, current figures, time window, or footage provenance marks affected draft/story/shot/B-roll outputs stale and requires a bounded replan or correction pass.

### 5.5 Shot binding

1. In an episode shot's media/reference picker, user opens `สื่อจากเรื่อง`.
2. Assets are grouped by semantic role and filtered by profile, scene, and shot context.
3. The system recommends a binding mode but does not bind automatically.
4. `subject_reference` adds to the shot's additional reference set.
5. `b_roll_insert` adds to the shot's B-roll/insert plan. Still B-roll and video footage use different binding records and render behavior.
6. `scene_anchor` opens an explicit decision when a start frame/environment anchor already exists.
7. Selecting “ใช้เป็นภาพกำหนดฉาก” invokes the existing start-frame mutation under its normal lock/approval rules; selecting “เพิ่มเป็น reference” keeps the current start frame.
8. A video footage segment is never converted into an image reference implicitly. It is bound to an episode/shot B-roll timeline with explicit in/out points, fit/crop/audio policy, and source label.

## 6. Architecture

### 6.1 Components

```text
CreateSeriesWizard / Planning premise field
  -> PromptExpansionDialog
  -> intent/entity gate
  -> research skill (optional web search)
  -> expansion skill (structured brief)
  -> user apply / cancel

StorySourcesHub
  -> visual slot planner skill
  -> normalized vertical_drama_source_slots
  -> slot prompt skill / media ingest
  -> existing image generation or upload/import
  -> source media metadata + optional video segments
  -> vertical_drama_source_assets -> media_assets

Confirmed Source Pack
  -> VisualSourceSnapshot + VisualCoveragePlan
  -> draft/story architecture
  -> story bible / deep shot draft
  -> claim/evidence/visual alignment gate
  -> start-frame vs reference vs B-roll resolver
  -> B-roll segment timeline / episode assembly

Episode shot media picker
  -> source-slot asset resolver
  -> role/conflict resolver
  -> explicit start-frame/reference/B-roll binding
  -> existing start-frame / shot-reference paths
  -> new normalized B-roll segment timeline binding

News report path
  -> claim ledger + web/source verification
  -> freshness/attribution/correction gate
  -> same visual canon and assembly path with stricter editorial rules
```

### 6.2 Skill-first boundary

The creator-facing feature must invoke registered skills through the existing skill execution policy/catalog. Large feature-specific prompts must not be embedded directly in a router handler.

Initial skill responsibilities:

- `vertical-drama-premise-expansion`: produce structured brief; accepts normalized research bundle.
- `vertical-drama-source-visual-planner`: propose visual slots and semantic roles.
- Existing shot prompt/start-frame/image prompt skills remain the downstream prompt authorities; new code supplies bounded context, not a parallel prompt dialect.

The research phase is capability-driven. It may use the existing web-search-capable Responses path, but it must be a separate provider call from structured function-tool authoring because the current Responses provider contract rejects mixed web-search and function tools in one call.

### 6.3 No implicit generation

Slot suggestion is a planning operation. Prompt generation is a separate operation. Image generation is a paid media operation. Each boundary has its own state, retry, telemetry, and user action.

### 6.4 Shared visual canon propagation

After the user confirms the source pack and before paid story generation, the server creates an immutable, bounded `VisualSourceSnapshot`. It is a run input, not a second source of truth.

```ts
type VisualSourceSnapshot = {
  snapshotId: string;
  packId: number;
  packVersion: number;
  visualRevision: string;
  fingerprint: string;
  profileId: string;
  slots: Array<{
    slotId: number;
    slotKey: string;
    semanticRole: VisualSemanticRole;
    mediaType: "image" | "video" | "text" | "metadata";
    origin: "upload" | "licensed" | "web_import" | "generated" | "user_text" | "unknown";
    sourceAssetId: number | null;
    mediaAssetId: number | null;
    segmentIds: number[];
    evidenceStatus: "verified_source" | "creator_evidence" | "illustrative_only" | "needs_review";
    rightsStatus: string;
    disclosureStatus: string;
    factualScope: string[];
    illustrativeLabel: string | null;
  }>;
  coveragePlan: VisualCoverageRequirement[];
  capturedAt: string;
};
```

The snapshot must be passed to both plan-level and deep generation, persisted with the draft/story artifact, and included in the durable story-generation contract as `visualSourceRevision` and `visualSourceFingerprint`. A worker must fail closed if the current source pack fingerprint differs from the admitted run.

The LLM may select only bounded `slotKey`, `claimId`, and `segmentId` values supplied by the server. It must never invent media IDs, URLs, timestamps, evidence status, or source citations. The server resolves those keys to tenant-owned media and validates every reference before persistence.

### 6.5 Visual coverage plan

The visual planner produces obligations separately from assets. An obligation can remain `unfulfilled` when the user has not uploaded/generate the media yet.

```ts
type VisualCoverageRequirement = {
  requirementId: string;
  scope: "series" | "episode" | "scene" | "shot";
  episodeNumber?: number;
  shotNumber?: number;
  purpose: string;
  preferredRoles: VisualSemanticRole[];
  preferredMediaTypes: Array<"image" | "video" | "graphic" | "text_overlay">;
  required: boolean;
  sourceSlotKeys: string[];
  claimIds: string[];
  status: "planned" | "fulfilled" | "not_applicable" | "needs_source" | "needs_review";
  notApplicableReason?: string;
};
```

The plan-level draft must produce coverage by episode. The full story/deep shot draft must produce coverage by shot. Deterministic validation checks that every required obligation is fulfilled or explicitly marked `not_applicable` with a creator-facing warning. Prose similarity is not sufficient proof of coverage.

### 6.6 Media modality and evidence separation

Media modality, provenance, semantic role, and evidence status are independent fields:

| Dimension | Values | Meaning |
|---|---|---|
| `mediaType` | `image`, `video`, `text`, `metadata` | What the asset physically is |
| `origin` | `upload`, `licensed`, `web_import`, `generated`, `user_text` | Where it came from |
| `semanticRole` | `scene_anchor`, `subject_reference`, `b_roll_insert` | What the story uses it for |
| `evidenceStatus` | `verified_source`, `creator_evidence`, `illustrative_only`, `needs_review` | What factual weight it can carry |

An uploaded file is not automatically verified. A generated visual is `illustrative_only` by default. A real photo/footage can be used as visual evidence only within its declared factual scope and capture/source context. The claim ledger remains authoritative for factual verification.

### 6.7 Editorial profile boundary

`news_report` is a separate profile from `documentary`:

- shared: source pack, media assets, source segments, visual canon, claim evidence storage, managed media, B-roll binding, start-frame/reference separation, credits, and tenant/security rules;
- news-specific: current-event classification, `asOf` time, source freshness, attribution, correction/retraction, claim-level verification, archive/file-footage labels, and stricter AI-illustration restrictions;
- documentary-specific: broader evergreen narrative, interviews/archive context, observational sequencing, and optional labelled reenactment.

Do not create a second news media pipeline. Create a separate profile/format contract and validators over the shared infrastructure. The profile must be explicit in the series bible and in every generation run.

## 7. Research and grounding contract

### 7.1 Classification

The entity gate returns:

```ts
type PromptResearchMode =
  | "specific_entity"
  | "broad_topic"
  | "mixed";
```

Signals include named places, businesses, products, software, domains, URLs, place IDs, and explicit “review/use/visit” language. Classification is not factual verification.

### 7.2 Research bundle

```ts
type ResearchSource = {
  url: string;
  title: string;
  accessedAt: string;
  relevance: string;
  supportLevel: "direct" | "partial" | "context_only";
  sourceClass: "official" | "government" | "owner" | "reputable_secondary" | "unknown";
};

type ResearchBundle = {
  mode: PromptResearchMode;
  entityCandidates: string[];
  verifiedClaims: Array<{ claim: string; sourceUrls: string[] }>;
  uncertainClaims: Array<{ claim: string; reason: string; sourceUrls: string[] }>;
  sources: ResearchSource[];
  searchCount: number;
  retrievedAt: string;
};
```

Limits: maximum search calls per expansion request, maximum sources, maximum source URL length, maximum claim length, maximum research text, and maximum total preview payload. Exact limits use existing response/search safety constants and are covered by tests.

### 7.3 Research policy

- `specific_entity` and `mixed` search by default when the feature flag is enabled.
- Search is not started when the preflight/accounting guard rejects the request; the original prompt remains unchanged and the user receives an actionable credit/limit message.
- A URL is checked against an allowlisted research/fetch boundary; no arbitrary server-side fetch is introduced.
- Official and owner sources are preferred for place/software identity and feature claims.
- Search results are evidence, not instructions. Prompt injection in page content must not alter tools, policy, tenant, credits, or output schema.
- `broad_topic` may produce creative coverage suggestions but must label them `creative_interpretation`.
- Missing or contradictory evidence is shown as a warning and never silently resolved as fact.
- Research citations are presented to the user before apply and retained as source-pack evidence when the user applies the expansion.

### 7.4 Claim and news evidence contract

The `news_report` profile uses a claim ledger in addition to the general research bundle:

```ts
type NewsClaim = {
  claimId: string;
  text: string;
  claimType: "current_status" | "impact" | "measurement" | "historical" | "forecast" | "attribution" | "public_advice";
  geography: string | null;
  validFrom: string | null;
  validUntil: string | null;
  asOf: string | null;
  evidenceRefs: string[];
  visualRefs: string[];
  status: "verified" | "partially_verified" | "needs_verification" | "contradicted" | "stale";
  attribution: string | null;
  correctionNote: string | null;
};
```

Rules:

- News classification is advisory until the creator selects/applies the `news_report` profile; an ambiguous prompt must not silently switch a documentary/review series into news.
- Every material number, date, place, impact count, warning, measurement, quote, and forecast in a news draft must have at least one evidence reference or be explicitly labelled `needs_verification`.
- A visual reference can support observation/context but cannot independently verify a numerical or current-event claim.
- `validUntil`/freshness is mandatory for current status and forecast claims when the source provides a time window.
- Contradictory sources remain visible; the model must not choose silently.
- Archive footage and file footage must carry a visible label and original date/source when known.
- A correction/retraction creates a new source/evidence revision and marks affected claims, scripts, visual coverage, and B-roll bindings stale.
- The stale cascade includes generated narration, subtitles/lower-thirds, episode assembly manifests, thumbnails/covers, and any export/publish readiness derived from the affected claim.
- Generated maps, diagrams, reconstructions, or AI visuals must be labelled as illustration and cannot satisfy `verified_source` evidence.

### 7.5 `news_report` profile contract

Add `news_report` to the series-profile and series-format registries. It is not an alias for `documentary` and is not a new storage or rendering system.

Minimum profile policy:

```ts
type NewsReportProfile = {
  profileId: "news_report";
  contentKind: "news";
  seriesFormatKind: "news_report";
  factPolicy: "required_sources";
  sourceGatePolicy: "required";
  bRollPolicy: "evidence_and_broll";
  freshnessPolicy: "as_of_required";
  aiVisualEvidencePolicy: "illustration_only";
  correctionPolicy: "revision_and_stale_dependents";
};
```

Default source slots should cover, subject to the creator's brief:

- `incident_identity`: current event/location identity, image/video/text/metadata;
- `current_scene`: creator or licensed field photo/footage, image/video;
- `official_update`: official statement, measurement, warning, or dashboard, text/image/video/metadata;
- `impact_scope`: affected people/area/counts and map/data evidence, image/video/text/metadata;
- `historical_context`: archive/file footage or historical source, image/video/text;
- `what_next`: current monitoring/forecast/public-advice source, text/video/metadata.

News episode engine:

1. headline/hook with explicit time context;
2. what happened and where;
3. verified impact/scope;
4. current official update or direct observation;
5. historical context when relevant;
6. what is being monitored/what remains uncertain;
7. attribution, disclosure, correction/update path, and next question.

The profile must support `breaking`, `developing`, `explainer`, and `retrospective` as editorial modes without changing the media contract. `breaking` and `developing` require stronger freshness/staleness gates; `retrospective` permits archive-heavy coverage but still labels dates and sources.

### 7.6 News flood/landslide reference scenario

For a prompt about flooding and landslides in Nan, the planner must not merely create generic “flood pictures”. It should propose a reviewable evidence/visual plan such as:

| Editorial need | Claim/evidence expectation | Preferred media |
|---|---|---|
| Current flooding/landslide situation | current location, capture time, source attribution | creator/official video segment or real photo |
| Affected scope | 7 districts, 34 subdistricts, 223 villages, and affected families only after source verification | official report/dashboard, map/data graphic, labelled field footage |
| N.1 station | station identity, measurement time, measurement source | real station photo/footage, official gauge data |
| Historical comparison | each 2549/2554/2561/2567 value tied to an archive/official source | dated archive footage/photo, chart, source label |
| 8.40–8.50m wall and 8.72m level | measurement definitions and source must be explicit | verified chart/diagram plus source footage if available |
| 19–21 Aug monitoring | forecast/monitoring window and issuing authority | official update, map, current footage with `asOf` |
| Public impact and next steps | attribution and uncertainty; do not infer harm from generic visuals | creator/official footage, interview/source, explicit public advice |

The supplied text may seed candidate claims, but the system must label them `needs_verification` until web/official/creator evidence is applied. The system must not create an AI flood image and attach it to a numerical claim merely because it visually resembles the topic.

For each generated news shot, the final structured output must be able to answer:

- Which claim(s) does this shot support?
- Which source/evidence record verifies those claims?
- Which exact image or footage segment is shown?
- Is it current footage, archive/file footage, creator observation, or AI illustration?
- What is the `asOf`/capture time and attribution?
- What label/disclosure must appear on screen or in narration?

## 8. Prompt expansion contract

```ts
type PromptExpansionPreview = {
  originalPrompt: string;
  expandedPrompt: string;
  structuredInterpretation: {
    contentIntent: string;
    audience: string | null;
    coverage: string[];
    tone: string | null;
    factualClaims: string[];
    visualDirections: string[];
    exclusions: string[];
  };
  assumptions: string[];
  openQuestions: string[];
  researchSources: ResearchSource[];
  grounding: "researched_entity" | "creative_interpretation" | "mixed";
  warnings: string[];
  sourcePromptHash: string;
};
```

The expansion skill must:

1. preserve explicit user intent;
2. avoid adding unsupported price, address, opening hours, product features, ratings, history, or claims;
3. distinguish requested creative direction from researched facts;
4. explain assumptions in human-readable language;
5. return a useful partial result when sources are incomplete;
6. validate against a strict schema and perform bounded repair only;
7. return an actionable error without mutating the source prompt if validation fails.

Apply requires `sourcePromptHash` to match the server's current premise hash. A stale preview returns `CONFLICT` and the user is asked to regenerate.

### 8.1 Draft and full-story propagation contract

The existing draft/full-story flow remains the authoring flow, but its schemas gain additive visual/evidence projections. The model receives the bounded `VisualSourceSnapshot` and `VisualCoverageRequirement` ledger in both the plan-level call and every deep-draft chunk.

```ts
type VisualUsageRef = {
  requirementId: string;
  slotKeys: string[];
  segmentIds: number[];
  mode: "scene_anchor" | "reference" | "b_roll_still" | "b_roll_footage" | "illustration";
  claimIds: string[];
  rationale: string;
};

type StoryVisualAlignment = {
  visualSourceRevision: string;
  visualSourceFingerprint: string;
  usageRefs: VisualUsageRef[];
  missingRequirementIds: string[];
  notApplicable: Array<{ requirementId: string; reason: string }>;
  status: "aligned" | "partial" | "needs_source" | "stale" | "blocked";
};
```

Required propagation:

- `planVerticalDramaStoryArchitecture` receives the visual snapshot/coverage summary before it creates the foundation.
- `synthesizeVerticalDramaPreset` and V2 receive the same snapshot and must emit episode-level visual coverage and claim refs.
- `generateStoryBible` receives the snapshot as an explicit labelled prompt block, not only buried inside `Existing bible` JSON.
- `generateStoryBibleDeep` and premium/retry/resume paths receive the same snapshot/fingerprint and must emit shot-level `visualUsageRefs`, `claimRefs`, and `brollSegmentRefs`.
- Deep chunks must use the same snapshot across all chunks; a changed snapshot fences the run and prevents stale commit.
- The deterministic gate validates all slot/segment/claim keys against the snapshot and tenant-owned rows before persistence.
- A story may plan a missing visual source, but it must not claim that the source exists or mark the coverage as aligned until the asset/segment is durable and eligible.
- Changing a slot description, semantic role, source asset, segment bounds, evidence status, source revision, or claim revision invalidates only affected coverage and downstream artifacts where possible; broad invalidation is allowed when dependency mapping is uncertain.

For review/documentary profiles, unsupported factual claims remain `needs_verification`. For `news_report`, a material claim without acceptable evidence is blocking at final gate. AI-generated visuals can satisfy an illustrative coverage requirement but never a factual evidence requirement.

### 8.2 Canon precedence and stage propagation

When sources and prose disagree, the pipeline uses this precedence:

1. Current user-approved media binding and exact source segment revision for what is visibly shown.
2. The admitted `VisualSourceSnapshot` and its evidence/rights/disclosure state.
3. Approved story architecture, story bible, episode plan, and shot contract.
4. LLM-generated suggestions, descriptions, and prompt prose.

The precedence does not make a user-uploaded image factually true. It means that once a user binds a source segment, the rendering/assembly stages must preserve that selected visual and cannot silently substitute another asset.

Required propagation matrix:

| Stage | Required input | Required output/gate |
|---|---|---|
| Prompt expansion/apply | premise hash, research bundle, profile choice | editable brief, claims, visual directions, no mutation before apply |
| Source planning | confirmed brief, profile, research/claim bundle | slots, roles, media obligations, no paid task |
| Media ingest | managed media, provenance, rights/disclosure | durable source asset, metadata, evidence status, optional segments |
| Snapshot admission | accepted slots/assets/segments/claims | immutable snapshot/fingerprint and coverage plan |
| Foundation/story architecture | snapshot summary and required coverage | architecture cannot introduce an untracked real subject/place/claim |
| Draft synthesis/story bible | full bounded snapshot and claim ledger | episode-level `visualUsageRefs`, `claimRefs`, alignment report |
| Deep story draft | same snapshot/fingerprint on every chunk/retry/resume | shot-level usage/segment/claim refs; stale fence; deterministic gate |
| Storyboard/start-frame | approved shot visual refs and scene-anchor decisions | scene anchor may affect start frame; subject refs remain references; B-roll excluded |
| Motion/video prompt | approved start frame plus reference bindings and B-roll plan | no free-text asset IDs; footage is not silently sent as an image reference |
| B-roll assembly | active still/footage bindings and exact segment bounds | bounded timeline, labels/audio policy, source provenance, overflow gate |
| Final publish/export | all prior fingerprints and QC reports | no stale/blocked/unknown evidence or binding commits |

Every stage must persist the source revision/fingerprint it consumed. A missing or mismatched fingerprint is a `stale_input` finding and cannot be treated as a successful legacy fallback for a profile that requires visual canon.

## 9. Visual slot contract

The existing normalized `vertical_drama_source_slots` table remains the slot identity. Existing `usagePolicy` remains the downstream production policy. Add a separate semantic role so the meaning of an asset is not overloaded into `reference`, `broll`, or `insert`.

```ts
type VisualSemanticRole =
  | "scene_anchor"
  | "subject_reference"
  | "b_roll_insert";

type VisualMediaType = "image" | "video" | "text" | "metadata";
type VisualMediaOrigin =
  | "upload"
  | "licensed"
  | "web_import"
  | "generated"
  | "user_text"
  | "unknown";
type VisualEvidenceStatus =
  | "verified_source"
  | "creator_evidence"
  | "illustrative_only"
  | "needs_review";

type SourceMediaSegment = {
  segmentId: number;
  revision: number;
  sourceAssetId: number;
  mediaAssetId: number;
  mediaType: "image" | "video";
  inPointSec: number | null;
  outPointSec: number | null;
  label: string;
  description: string | null;
  captureAt: string | null;
  location: string | null;
  evidenceStatus: VisualEvidenceStatus;
  evidenceScope: string[];
  transcriptRef: string | null;
  analysisRevision: number;
  status: "draft" | "ready" | "needs_review" | "stale";
};

type VisualSlotView = {
  slotId: number;
  slotKey: string;
  title: string;
  narrativeDescription: string | null;
  semanticRole: VisualSemanticRole;
  roleReason: string;
  roleConfidence: "high" | "medium" | "low";
  origin: "user" | "ai_suggested";
  mediaType: VisualMediaType;
  mediaOrigin: VisualMediaOrigin;
  evidenceStatus: VisualEvidenceStatus;
  sourceAssetId: number | null;
  mediaAssetId: number | null;
  segmentIds: number[];
  durationSec: number | null;
  captureAt: string | null;
  location: string | null;
  rightsStatus: string;
  disclosureStatus: string;
  factualScope: string[];
  status: "draft" | "prompt_ready" | "generating" | "ready" | "failed" | "needs_review";
  prompt: string | null;
  promptVersion: number;
  promptSourceHash: string | null;
  version: number;
  updatedAt: string;
};
```

Required invariants:

- `slotKey` remains unique within a pack.
- slot rows remain bounded by server quota and paginated reads.
- `semanticRole` is always present after migration; legacy rows map from profile/default `usagePolicy` with `roleConfidence = "low"` and `needs_review` only when ambiguous.
- changing title/description/role invalidates a prior prompt by setting `promptSourceHash` stale and status `needs_review`.
- `sourceAssetId` on a slot always points to a `vertical_drama_source_assets` row; that source asset may point to a managed `mediaAssetId`. A generated image is therefore registered as a source asset first and durable media second; no provider URL is canonical.
- `mediaType`, `mediaOrigin`, and `evidenceStatus` are independent and must be derived from validated asset metadata/provenance, not from the slot title or LLM output.
- `upload_video` is a first-class source kind. Video source assets must expose bounded duration/thumbnail metadata and may have zero or more immutable child `SourceMediaSegment` rows.
- A B-roll binding to video must reference a segment with valid `0 <= inPointSec < outPointSec <= durationSec`; a still image binding has a deterministic display duration supplied by the episode timeline.
- Every binding stores the admitted visual-source revision/fingerprint and segment revision; a binding from a changed snapshot is stale until reconciled.
- A source asset may be reused by multiple slots and shots, but a source segment belongs to exactly one parent source asset and is never copied into a new media object.
- Missing capture time/location/provenance does not block a creator-owned visual from being used as an observation, but it blocks promotion to `verified_source` and surfaces `needs_review` for news claims.
- role overrides are explicit user actions and produce an audit event.
- generated assets for real places, venues, products, or software carry an explicit illustrative/non-evidence label unless the provenance is a creator-provided or rights-cleared source.
- slot status `ready` means the managed media import is durable; it does not mean rights/disclosure or production readiness has passed. The existing source-pack readiness contract remains authoritative for those gates.

Recommended initial role mapping:

| Profile/context | Default role | Reason |
|---|---|---|
| location/restaurant exterior, interior, route, venue atmosphere | `scene_anchor` | Defines the environment/space of the shot |
| product body, dish detail, software UI, screen, control, material | `subject_reference` | Identifies a subject without replacing the scene |
| coral detail, texture, map-like illustration, supporting cutaway, comparison visual | `b_roll_insert` | Supports narration as an insert/cutaway |
| creator-uploaded field photo or verified event footage | `b_roll_insert` | Supports an observed event without becoming a start frame |
| AI-generated reconstruction, map, diagram, or atmosphere | `b_roll_insert` | Illustration only; cannot satisfy factual evidence |

The mapping is a recommendation, not an authorization to replace a start frame.

## 10. Shot binding and conflict contract

Keep the existing `vertical_drama_shot_references` relation for additional image/reference inputs to generated video. Add nullable source-slot provenance only if old readers remain compatible. Do not put real footage timeline semantics into that table. Introduce a separate normalized source-media binding for B-roll stills and footage segments, preserving the distinction between a source-pack `sourceAssetId`, a managed `mediaAssetId`, and a source `segmentId`.

Minimum binding fields:

```ts
type ShotSourceBinding = {
  episodeId: number;
  shotNumber: number;
  sourceSlotId: number;
  mediaAssetId: number;
  semanticRole: VisualSemanticRole;
  bindingMode: "reference" | "scene_anchor" | "b_roll_still";
  isActive: boolean;
  createdBy: number;
  createdAt: string;
};

type ShotBrollBinding = {
  id: number;
  episodeId: number;
  shotNumber: number;
  sourceSlotId: number;
  sourceAssetId: number;
  mediaAssetId: number;
  segmentId: number | null;
  mediaType: "image" | "video";
  inPointSec: number | null;
  outPointSec: number | null;
  displayDurationSec: number | null;
  visualSourceRevision: string;
  visualSourceFingerprint: string;
  fitMode: "cover" | "contain" | "picture_in_picture" | "full_frame";
  audioPolicy: "mute" | "source_audio" | "mix_under_voiceover";
  labelMode: "none" | "creator_upload" | "archive" | "file_footage" | "ai_illustration" | "source_label";
  sortOrder: number;
  isActive: boolean;
  status: "active" | "stale" | "blocked";
  createdBy: number;
  createdAt: string;
};
```

Rules:

1. `subject_reference` maps to additional reference media and never changes the approved start frame.
2. `b_roll_insert` maps to a still/footage B-roll binding and never enters the start-frame reference set by default.
3. `scene_anchor` requires an explicit action to become the environment/start-frame anchor.
4. If the shot has an approved/locked start frame, the UI must show the current asset, proposed asset, and consequences before replacement.
5. If the shot is in a non-editable render/production state, binding is rejected or queued through existing edit-lock rules.
6. Multiple shots may use one source slot/media asset; the asset is not copied.
7. A shot may have multiple subject references and B-roll items, but at most one active environment anchor through the existing start-frame contract.
8. Unbinding a source slot must not delete the underlying source/media asset.
9. A video B-roll binding must preserve the original asset, segment in/out points, source label, and audio policy through episode assembly.
10. B-roll order and duration are explicit timeline data; the LLM may recommend them but the server validates bounds and persists the final values.
11. A B-roll segment can be used as evidence for an observation only within its declared evidence scope; it cannot automatically verify unrelated narration.
12. An approved `scene_anchor` promotion records the source slot/media/segment provenance on the start-frame state; it does not delete or silently replace the source asset.
13. Start-frame regeneration must carry the visual source revision and invalidate the approved frame when the bound scene-anchor asset, segment, or scene prompt changes.
14. Motion-prompt generation reads the server-resolved start-frame/reference/B-roll projections; it must not trust LLM free-text asset IDs or reconstruct source URLs.
15. Final assembly rejects any B-roll binding whose source revision, segment revision, storage readiness, rights/disclosure, or evidence label is stale/blocked.

## 11. API/service contract

Names are logical boundaries; final tRPC names must follow existing router naming conventions.

### Prompt expansion criteria

- `createPromptExpansionPreview` — starts or returns an idempotent expansion run for an owner and prompt hash.
- `getPromptExpansionPreview` — reads a bounded owner-scoped run result.
- `applyPromptExpansion` — compare-and-swap applies `expandedPrompt` to the existing premise field.
- `retryPromptExpansion` — retries only failed/expired research or authoring stages.

### Visual slots

- `suggestVisualSlots` — creates/returns draft slot suggestions for the confirmed prompt hash; no paid task.
- `saveVisualSlot` — optimistic revision update for title, description, role, order, and usage policy.
- `generateVisualSlotPrompt` — prompt skill for one slot.
- `generateVisualSlotPromptsBatch` — selected slots, idempotent per slot revision.
- `generateVisualSlotImage` — existing media admission/generation/import path for one slot.
- `generateVisualSlotImagesBatch` — selected slots with per-slot task state and credit preflight.

### Source media and footage

- `registerSourceMedia` — registers an uploaded/imported still or video through the existing managed-media path; validates MIME, ownership, storage, and rights metadata.
- `getSourceMediaMetadata` — returns a bounded browser-safe projection including media type, duration, poster, provenance, evidence status, and readiness.
- `createSourceMediaSegment` — creates an immutable, owner-scoped video segment or still usage record with validated time bounds and evidence scope.
- `updateSourceMediaSegment` — optimistic revision update for description, label, evidence scope, and in/out points; changing time bounds invalidates dependent B-roll/QC.
- `analyzeSourceMedia` — optional vision/transcript/shot-index analysis; never promotes evidence status by itself.

### Visual canon and story propagation

- `createVisualSourceSnapshot` — freezes accepted source slots/assets/segments and returns a fingerprint for a generation run.
- `getVisualSourceSnapshot` — reads a bounded owner-scoped snapshot and its coverage obligations.
- `validateVisualCoverage` — deterministic coverage/evidence/role check after draft and full-story generation.
- `reconcileVisualSourceSnapshot` — marks affected draft/story/shot/B-roll artifacts stale after a source revision change.

### News evidence

- `buildNewsClaimLedger` — extracts bounded claims, time scope, geography, attribution, and evidence requirements from the confirmed brief/research bundle.
- `verifyNewsClaims` — applies research/source results and returns verified, partial, stale, contradictory, and needs-verification states.
- `applyNewsCorrection` — creates a new evidence revision and marks dependent claims and media bindings stale without deleting the original audit trail.

### Shot binding

- `listSourceAssetsForShot` — owner-scoped, role-grouped candidates.
- `bindSourceSlotToShot` — records a binding and applies only the selected binding mode.
- `unbindSourceSlotFromShot` — deactivates the binding; never deletes source/media assets.
- `promoteSourceSlotToSceneAnchor` — explicit, lock-aware start-frame/environment mutation.
- `bindSourceMediaToBroll` — binds a still or exact video segment to an episode/shot B-roll timeline.
- `unbindSourceMediaFromBroll` — deactivates a B-roll binding without deleting source media.
- `reorderShotBroll` — changes only explicit B-roll ordering/duration/audio policy under episode edit locks.

Every mutation requires authenticated tenant context, owner checks, expected revision where applicable, and a client mutation/idempotency key for retryable work. AI output can propose slot/claim/coverage keys but cannot directly persist media IDs, evidence status, timecodes, or news verification results.

## 12. Data model and migration boundary

### 12.1 Existing tables reused

- `vertical_drama_source_packs`
- `vertical_drama_source_slots`
- `vertical_drama_source_assets`
- `vertical_drama_source_analyses`
- `vertical_drama_source_media_segments` (new normalized child of source assets for video in/out points and bounded evidence scope)
- `vertical_drama_visual_source_snapshots` (new immutable run-input snapshot/fingerprint and bounded coverage plan)
- `vertical_drama_news_claims` / `vertical_drama_news_evidence` (new only when the existing source-pack evidence schema cannot represent claim revisions, freshness, attribution, and correction lineage)
- `vertical_drama_shot_broll_bindings` (new normalized timeline binding; separate from image/reference rows)
- normalized source-pack evidence rows for applied research claims and citations, if the existing source-pack schema has no equivalent child relation
- `vertical_drama_source_pack_audit_events`
- `media_assets`
- existing episode start-frame and shot-reference structures

### 12.2 Expected migration

The implementation should add a migration after the currently documented source-pack migration (provisionally `0240_vertical_drama_visual_source_assets.sql`; the final number must be checked against the migration journal). It should add only bounded fields/indexes required for:

- source-slot semantic role, rationale, confidence, origin;
- slot prompt/version/hash and generation state/error/task correlation;
- bounded normalized research evidence/citation rows linked to the source pack and applied prompt revision;
- shot-binding source-slot provenance and semantic binding mode if existing shot references can safely be extended;
- media modality/origin/evidence metadata and bounded video duration/poster metadata;
- immutable source-media segments with validated in/out points, labels, transcript references, and evidence scope;
- visual source snapshot revision/fingerprint, coverage obligations, and stale/reconciliation status;
- news claim/evidence revisions, freshness/as-of/attribution/correction fields;
- still/footage B-roll binding fields including segment, in/out points, display duration, fit, audio, label, and ordering;
- optional prompt expansion operation ledger if async recovery cannot use an existing job contract.

No destructive backfill is allowed. Legacy rows receive deterministic defaults and remain readable. Any ambiguous legacy slot is marked `needs_review`, not silently promoted to `scene_anchor`.

Migration rules:

- Do not add duration/timecode semantics to the shared `media_assets` table unless a current shared media contract already owns those fields; prefer feature-scoped metadata/segment tables.
- Existing `upload_video` source kinds remain readable and are upgraded with derived metadata lazily or through a bounded backfill; failed metadata extraction remains `needs_review`, not silently treated as an image.
- Existing `vertical_drama_shot_references` rows remain valid image/reference rows. No legacy row is converted into a B-roll timeline binding automatically.
- Existing `sourcePackBrollManifest` consumers receive additive fields and remain compatible with old fields during rollout.
- All new foreign keys and indexes include tenant/user/parent lookup paths and protect against cross-tenant attachment.
- Segment uniqueness is scoped to `(tenantId, sourceAssetId, revision, inPointSec, outPointSec)` or an equivalent idempotency key; B-roll binding uniqueness is scoped to the owner, episode/shot, segment revision, and active logical placement.
- Snapshot, segment, claim, evidence, and B-roll rows have explicit status/revision fields so a worker can distinguish active, stale, blocked, failed, and soft-deleted data without guessing from nullable IDs.

### 12.3 Prompt expansion run ledger

If required for asynchronous recovery, add a bounded owner-scoped operation table with:

- `tenantId`, `userId`, optional `seriesId`, optional `packId`/`draftSessionId`;
- `inputHash`, `status`, `stage`, `resultJson`, bounded research source metadata;
- `idempotencyKey`, attempt count, error code, created/updated/expiry timestamps.

This table stores operation state only. The applied premise, source slots, source assets, and media assets remain authoritative elsewhere.

### 12.4 Applied research evidence and digest propagation

Preview citations are not authoritative until the user applies the preview. On apply, persist bounded evidence rows or the existing equivalent source-pack evidence contract with claim, URL, title, source class, support level, accessed timestamp, and applied prompt revision. Do not persist raw page bodies.

`buildSourcePackDigest` must advance its digest version and include semantic role, role rationale/confidence, source provenance, illustrative/non-evidence state, and applied research evidence. `buildSourcePackBrollManifest` must include semantic role and exclude `scene_anchor` entries unless an explicit shot binding promotes them. Story-generation and B-roll consumers must receive the updated digest/manifest without requiring a second client-side copy of source data.

The digest is not itself the run canon. Before draft/full-story generation, build the immutable `VisualSourceSnapshot` with a fingerprint over slot revision, source asset/media identity, segment revision, evidence status, rights/disclosure, claim/evidence revision, and profile version. Never include raw provider URLs or unbounded page bodies in the snapshot.

The story-generation contract must include:

- `visualSourceRevision` and `visualSourceFingerprint`;
- an input ref of kind `visual_source_snapshot`;
- evidence policy requirements for `visual_source`, `news_claim`, and `news_evidence` when the profile requires them;
- output contract fields for per-episode/per-shot `visualSourceRefs`, `claimRefs`, and `brollSegmentRefs`;
- final-gate findings for missing, stale, contradictory, unauthorized, unavailable, or role-conflicting media.

Visual slots suggested from a prompt are optional by default. They do not become required source-gate items merely because the AI suggested them; only profile-required slots or an explicit user action may block drafting.

### 12.5 Operational bounds

- Reuse the existing source-pack slot/asset quotas as the hard upper bounds; do not raise them in this feature without a separate capacity decision.
- Suggested slots and batch requests use smaller feature-level caps (profile-dependent, bounded in the implementation plan) so one prompt cannot create hundreds of LLM/image tasks.
- Batch image generation uses bounded concurrency and returns per-slot state; it must not issue an unbounded `Promise.all` or unbounded provider fan-out.
- Source-slot and shot candidate reads are paginated or bounded and must batch media URL/ownership checks to avoid N+1 queries.
- Digest and B-roll manifests remain bounded by their existing 128/256 entry limits; evidence is summarized and capped rather than embedding raw page content.
- Video analysis is bounded by file size, duration, sampled frames, transcript length, and concurrency. The default path analyzes metadata/poster and user-selected segments, not every frame of every upload.
- A source asset may have many segments only within a server quota; segment reads are paginated/bounded and edits use optimistic revisions.
- B-roll timeline duration must fit the target episode/shot budget. Overflow is a blocking validation finding, not silent truncation.
- News claim ledgers are bounded per brief/episode and retain revision lineage without storing duplicate raw articles or full transcripts.
- Prompt-expansion operation rows expire and are cleaned through the existing bounded retention mechanism; applied source-pack evidence remains subject to source-pack lifecycle/retention rules.

### 12.6 Source media metadata and segments

The feature must not overload the shared `media_assets` registry with editorial meaning. Resolve the canonical `mediaAssetId`, then store feature-scoped metadata as needed:

```ts
type SourceMediaMetadata = {
  sourceAssetId: number;
  mediaAssetId: number;
  mediaType: "image" | "video";
  mimeType: string;
  durationSec: number | null;
  frameRate: number | null;
  audioAvailable: boolean | null;
  audioChannels: number | null;
  width: number | null;
  height: number | null;
  orientation: "portrait" | "landscape" | "square" | "unknown";
  posterMediaAssetId: number | null;
  checksumSha256: string | null;
  origin: "upload" | "licensed" | "web_import" | "generated" | "unknown";
  captureAt: string | null;
  capturedLocation: string | null;
  sourceName: string | null;
  rightsStatus: string;
  disclosureStatus: string;
  evidenceStatus: VisualEvidenceStatus;
  evidenceScope: string[];
  transcriptStatus: "not_requested" | "queued" | "ready" | "failed";
  analysisStatus: "not_requested" | "queued" | "ready" | "failed" | "needs_review";
};
```

Video segments must be immutable in identity and revisioned in metadata. A segment stores parent source asset, in/out points, description, labels, capture/source context, evidence scope, transcript/analysis references, and stale status. Updating the time range creates a new segment revision or invalidates all dependent bindings; it never mutates the original media bytes.

### 12.7 Visual source snapshot and B-roll binding tables

`vertical_drama_visual_source_snapshots` stores the bounded snapshot JSON, fingerprint, source-pack revision, profile version, coverage plan, status, and owner. It is immutable after admission; a new source revision creates a new snapshot.

`vertical_drama_shot_broll_bindings` stores episode/shot, slot/source/media/segment IDs, in/out or still display duration, order, fit/crop, audio policy, disclosure label, source revision, and active/stale state. It must have owner-scoped lookup indexes and a uniqueness/idempotency key over the logical binding.

The B-roll assembler consumes this table and emits a bounded assembly projection. The projection must preserve source provenance and labels into the final episode manifest. It must not silently turn a B-roll item into a start frame, a generated-video reference, or an evidence claim.

### 12.8 News claim/evidence revision model

News claims and evidence must be revisioned rather than overwritten. A correction creates a new revision linked to the prior claim/evidence, records who/what caused the correction, and marks dependent story/visual/B-roll artifacts stale. The original source is retained for audit unless the existing retention/privacy policy requires redaction.

### 12.9 B-roll assembly projection

The B-roll binding table is not itself a rendered video. The assembler must build a bounded projection with deterministic ordering:

```ts
type BrollAssemblyItem = {
  bindingId: number;
  sourceAssetId: number;
  mediaAssetId: number;
  segmentId: number | null;
  mediaType: "image" | "video";
  startSec: number;
  durationSec: number;
  inPointSec: number | null;
  outPointSec: number | null;
  fitMode: "cover" | "contain" | "picture_in_picture" | "full_frame";
  audioPolicy: "mute" | "source_audio" | "mix_under_voiceover";
  disclosureLabel: string | null;
  sourceAttribution: string | null;
  visualSourceFingerprint: string;
};
```

Rules:

- Still images receive an explicit display duration and cannot create an unbounded freeze-frame.
- Footage uses exact source in/out points; no implicit “play the whole file” fallback when a segment is required.
- `source_audio` and `mix_under_voiceover` require an audio track and bounded mix/ducking policy; otherwise the item is downgraded to mute with a visible warning or blocked by the profile.
- `fitMode`, portrait crop, safe areas, subtitles, labels, and source attribution are validated before render.
- Assembly order is deterministic by explicit `sortOrder` and stable binding ID; LLM order suggestions are not authoritative until persisted.
- Source labels such as `creator_upload`, `archive`, `file_footage`, and `ai_illustration` survive into the episode manifest and publish/export projection.
- A failed encode/render preserves the binding projection and can be retried without re-uploading, re-analyzing, or re-generating source media.
- Final assembly must resolve managed media through the authorized storage path and never persist a provider URL as the durable playback source.

## 13. Credit, task, and media lifecycle

1. Prompt expansion, slot suggestion, and prompt generation do not reserve image-generation credits, but any normal LLM/model cost follows the existing accounting policy.
2. Web-search accounting uses the existing web-search cost/audit path; no second wallet or transaction family is introduced. The UI must distinguish model/search cost from image-generation cost.
3. Before a research run, use the existing spend guard/preflight where available and show the estimate or a clear “cost determined during run” notice. A search run that cannot pass accounting must not mutate the premise.
4. Research, authoring, and batch operations carry one operation/idempotency identity through provider calls and ledger writes. If the current web-search adapter cannot make its separate search charge idempotent, the adapter must be repaired before this feature is enabled.
5. Image generation calls the existing estimate/preflight/reservation/charge path.
6. Batch generation reserves/charges per admitted task with idempotency; already successful slots are skipped.
7. Provider completion is not proof of durable media. Import/register the managed asset before marking the slot ready.
8. Import or sync failure leaves a recoverable task state and does not trigger silent paid regeneration.
9. User upload/import of an already-owned still or footage file does not become an image/video-generation charge. Any optional vision/transcript/shot-index analysis is a separately disclosed model operation with its own idempotency and cost path.
10. Binding, segmenting, reordering, and assembling existing stills/footage do not create generation charges; render/encoding costs follow the existing assembly contract.
11. Existing managed-media authorization and `/api/storage/files/...` playback rules remain in force.
12. A failed B-roll assembly must preserve source bindings and allow a sync/retry without re-uploading or regenerating the source media.

## 14. Error and recovery matrix

| Failure | User-visible result | Safe retry |
|---|---|---|
| No entity found | Creative interpretation label; no fabricated fact | Re-run with URL/details |
| Search timeout | Partial sources + warning | Retry research only |
| Conflicting sources | Claims separated and flagged | User chooses/edits |
| Expansion schema failure | Original premise preserved | Retry bounded authoring |
| Stale apply hash | Conflict; preview not applied | Regenerate from current prompt |
| Slot save conflict | Reload latest slot/pack revision | Retry with current revision |
| Prompt generation failure | Slot remains editable; prompt status failed | Retry slot only |
| Image admission failure | No charge or reservation released per existing contract | Retry admission |
| Provider failure | Per-slot failed state; no duplicate task | Retry task per policy |
| Provider success/import failure | Recover original task/import; no silent regeneration | Sync/import retry |
| Unsupported MIME or corrupt footage | Asset rejected before story/B-roll use | Re-upload or repair file |
| Video metadata/thumbnail extraction failure | Asset remains `needs_review`; no silent image fallback | Retry extraction or use a replacement |
| Invalid video segment bounds | Segment not saved; original footage preserved | Correct in/out points |
| Missing footage provenance | Observation allowed with warning; news evidence blocked | Add source/date/location or use another source |
| AI visual selected for factual news B-roll | Binding blocked or forced `ai_illustration` label | Use verified/creator footage or explicitly publish illustration |
| News claim has no evidence | Claim marked `needs_verification`; final news gate blocks | Add source, edit claim, or disclose uncertainty |
| News source becomes stale/contradictory | Affected claim/story/B-roll marked stale | Verify latest source or apply correction |
| B-roll timeline exceeds episode budget | Assembly/draft gate blocks with exact overflow | Reorder, trim, or remove segments |
| Footage audio conflicts with voiceover | Audio policy warning/block according to profile | Mute, duck, or mix explicitly |
| Upload/analysis cancelled | Preserve durable upload and current segment state; no phantom ready status | Resume metadata/analysis only |
| Partial B-roll assembly failure | Keep completed projection and exact failed item | Retry failed item/encode without duplicate upload |
| Missing poster/transcript | Playback/assembly may continue only where policy allows; claim/evidence remains unchanged | Retry extraction or provide manual metadata |
| Duplicate footage upload | Check checksum/owner scope and offer reuse; never create duplicate bindings silently | Reuse canonical media or confirm new copy |
| Visual snapshot changed during generation | Run fenced and cannot commit stale output | Start a new idempotent run |
| Scene-anchor conflict | Compare current/proposed assets | Explicit replace or keep |
| Tenant/ownership mismatch | Not found/forbidden; no data disclosure | No cross-tenant retry |

## 15. Security and privacy

- Resolve tenant identity before research, database reads, provider calls, credit reservation, or media binding.
- Scope every source-pack, slot, asset, series, episode, and shot query by tenant and user ownership.
- Treat model/search/image costs as separate user-visible cost categories while retaining the single `credit_transactions` ledger.
- Treat web content and user descriptions as untrusted data.
- Sanitize and bound URLs, citations, HTML/text extraction, prompt fields, and JSON payloads.
- Do not persist raw page bodies or raw provider payloads in normal logs.
- Do not use external provider URLs as durable playback or ownership evidence.
- Enforce rights/disclosure readiness independently from factual grounding.
- Validate MIME/storage metadata and reject path traversal, unsupported containers, malformed timecodes, and unauthorized media before any analysis or assembly call.
- Never expose raw local paths, provider URLs, signed query strings, private transcripts, or unredacted EXIF/location metadata to the browser unless the existing authorized asset projection permits it.
- Treat uploaded footage audio, speech, faces, bystanders, license text, and embedded personal data as sensitive media; analysis and publication must follow existing privacy/rights policies.
- News sources, correction actions, and attribution changes are audit events; model-authored text cannot directly change verification status or correction lineage without a server/user action.
- Keep research source URLs visible to the user before applying researched claims.
- Record audit events for expansion apply, role override, scene-anchor promotion, and binding changes without raw secrets or full prompts.

### 15.1 Operational observability and quality gates

Every new operation emits bounded structured telemetry with tenant/user-safe identifiers, feature/profile, source revision, stage, status, duration, retry count, credit category, and failure code. Do not log raw footage, raw page bodies, signed URLs, full transcripts, or complete prompts by default.

Minimum quality gates:

1. `source_media_admission`: MIME/storage/ownership/rights readiness.
2. `source_media_analysis`: metadata/poster/transcript/vision result validity; analysis failure never becomes evidence success.
3. `visual_snapshot_admission`: source/slot/segment/claim fingerprint and bounded coverage plan.
4. `draft_visual_alignment`: episode coverage, claim refs, role routing, and unresolved source warnings.
5. `story_visual_alignment`: full-story/deep-shot coverage, stale fence, unknown ID rejection, and evidence policy.
6. `start_frame_reference_boundary`: scene-anchor/reference/B-roll separation and approved-frame invalidation.
7. `broll_timeline_readiness`: segment bounds, duration budget, audio/crop/label policy, storage, rights/disclosure.
8. `news_publish_readiness`: claim verification, freshness/as-of, attribution, correction state, archive/file-footage labels, and no blocking findings.

Each gate returns machine-readable findings with code, severity, target paths, impacted episodes/shots, user action, and whether retry, repair, or approval is required. A passed LLM response without passed deterministic gates is never publish-ready.

## 16. UX and accessibility contract

- Use existing source-hub primitives and copy-map conventions.
- Keep the default path short and hide technical details behind expandable sections.
- Show a text label plus icon/status, never color alone.
- Dialog must support keyboard focus order, focus restoration, escape/cancel, screen-reader headings, and live status for research/generation.
- Batch selection must expose selected count, pending/success/failed count, and estimated credit before confirmation.
- Slot role badges must include human-readable descriptions, not only internal enum names.
- Generated real-world/location/software visuals must show the illustrative/non-evidence label next to the preview, not only inside technical details.
- Media cards must show modality/origin/evidence status, duration for video, capture/source date when known, and whether the item is still, footage, archive, file footage, or AI illustration.
- Footage preview must support poster playback, scrubber, exact in/out selection, segment description, source label, and audio policy before binding.
- News UI must show `asOf`, source attribution, claim status, stale/contradictory warnings, archive/file-footage labels, and a correction action without hiding the original revision.
- A B-roll timeline must show total duration, order, shot/episode placement, still/footage distinction, audio mix state, and any overflow/blocking reason.
- Conflict dialog must state exactly what will change and what will remain unchanged.
- Mobile uses one-column slot cards and a sticky batch action area; desktop can use the existing grid/list layout.
- Thai and English copy must keep “โจทย์ฉบับขยาย”, “แหล่งอ้างอิง”, “ภาพกำหนดฉาก”, “ภาพอ้างอิงวัตถุ/สินค้า”, “ภาพนิ่ง B-roll”, “วิดีโอฟุตเทจ”, “แฟ้มภาพ”, and “ภาพประกอบตัดสลับ” semantically distinct.

## 17. Test plan

### Shared/server unit tests

- entity classification and broad-topic fallback;
- research source normalization, source priority, citation mapping, limits;
- prompt schema validation, repair, grounding labels, prompt hash;
- source-slot role resolver for location, restaurant, documentary, product, and software profiles;
- legacy slot migration/defaults and ambiguous `needs_review` behavior;
- optimistic revision and idempotency;
- tenant/owner checks for every new procedure;
- scene-anchor conflict resolver and start-frame precedence;
- subject-reference/start-frame/still-B-roll/footage-B-roll routing boundaries;
- source media MIME/origin/evidence resolver and upload-vs-generated classification;
- video metadata extraction, poster, duration, segment in/out validation, stale segment revisions, and audio policy;
- immutable visual-source snapshot fingerprinting, cross-stage propagation, stale-run fencing, and deterministic coverage validation;
- draft/full-story/deep-draft output rejects unknown slot/segment/claim IDs and reports missing required visual obligations;
- `news_report` profile selection separate from documentary and correct episode engine/freshness policy;
- news claim ledger, attribution, as-of time, contradictory/stale evidence, archive/file-footage labels, and correction lineage;
- AI-generated visual cannot satisfy factual evidence and is labelled in news B-roll;
- B-roll duration/order/overflow, assembly projection, sync retry, and no accidental start-frame/reference leakage;
- quality-gate finding codes, impacted paths, retry/repair/approval state, and redacted telemetry;
- generation admission/import/late-success behavior and credit idempotency.
- source-pack digest/manifest propagation of roles, evidence, and illustrative labels.

### Client tests

- expansion dialog original/proposed/details/sources/warnings;
- cancel/apply/stale preview/regenerate;
- slot planning, edit, delete, reorder, role override;
- single and batch prompt/image actions with independent status/error;
- still upload and video footage upload/import with metadata/poster/segment editor;
- shot picker role groups and explicit conflict decision;
- B-roll timeline binding/reorder/trim/audio-label states;
- news claim/evidence review, freshness warning, archive label, and correction flow;
- keyboard/focus/live status and narrow viewport states.

### Browser evidence

1. Documentary/location prompt with researched Eiffel Tower/place evidence and explicit apply.
2. Broad coral-conservation prompt with creative-interpretation labeling and no false place facts.
3. Software review prompt with domain research, unsupported-claim warning, and editable brief.
4. Source slots → prompt → one image and selected batch image generation.
5. Restaurant/location `scene_anchor` conflict against an existing start frame.
6. Product/software `subject_reference` binding that leaves start frame unchanged.
7. B-roll binding that does not enter start-frame references.
8. Refresh/retry during expansion and image import.
9. Generated location/software image visibly marked as illustrative and excluded from evidence claims.
10. Creator-uploaded real photo used as still B-roll without entering start-frame references.
11. Creator-uploaded video footage trimmed to an exact segment, bound to B-roll, preserved through assembly, and labelled with source/date.
12. AI-generated image/video selected for a news story is blocked from factual evidence or visibly labelled as illustration.
13. News flood/landslide prompt creates a claim ledger, source/visual coverage plan, as-of/freshness warnings, and separate news profile—not documentary.
14. News story with a stale/contradictory source creates a correction/stale state and prevents silent final publication.
15. Full-story/deep-draft run receives the same visual snapshot fingerprint and rejects stale source changes.
16. B-roll duration overflow blocks assembly with an actionable timeline repair message.

Focused tests must be separated from known baseline-wide typecheck or E2E noise. Browser/provider/deployment/production evidence must be reported separately when not run.

## 18. Rollout and flags

Use independently controllable tenant flags:

- `verticalDramaPromptExpansion`
- `verticalDramaVisualSlotPlanning`
- `verticalDramaVisualSlotGeneration`
- `verticalDramaSourceShotBinding`
- `verticalDramaSourceVideoFootage`
- `verticalDramaNewsReportProfile`
- `verticalDramaVisualCanonPropagation`

Rollout order:

1. Read-only preview and contract tests.
2. Prompt apply and editable slot drafts.
3. Prompt generation and single-image generation for selected tenants.
4. Batch image generation after credit/idempotency proof.
5. Shot binding after conflict and browser proof.
6. Video footage/segment B-roll after metadata, rights, timeline, and assembly proof.
7. News profile after claim/evidence/freshness/correction proof.
8. Keep legacy source/scene paths available during the full rollout window.

Flag-off behavior must preserve the current premise, source-pack, scene, and shot-reference behavior byte-for-byte where practical.

## 19. Acceptance criteria

### Prompt expansion acceptance

- User can preview a full structured interpretation before applying it.
- Cancel never changes the original prompt.
- Apply returns to the existing flow and leaves the prompt editable.
- Identifiable place/software/site prompts search when enabled and show source links before apply.
- Broad topics are not presented as researched facts.
- Unsupported or missing web information is visible as a warning.

### Visual sources

- User can create editable slots from the confirmed prompt without image generation or image-generation credit charge; any normal planner/model cost follows existing accounting and is disclosed.
- Each slot has an explicit semantic role, reason, confidence, and editable description.
- Prompt and image generation work per slot and in batch.
- Batch operations have per-slot progress/errors and do not duplicate successful tasks.
- Generated media is durable, owner-scoped, rights-aware, and linked through `mediaAssetId`.
- User can upload a real still or video footage file without an image/video-generation charge and see managed-media readiness before use.
- Video footage exposes bounded duration/poster metadata and supports exact named segments with valid in/out points.
- Media modality, origin, evidence status, rights, disclosure, capture/source context, and segment provenance remain separate and visible.
- A creator-uploaded photo/footage segment can be used as B-roll while an AI-generated visual is clearly marked `illustrative_only`.

### Shot safety

- Location/restaurant/environment imagery is recognized as a possible `scene_anchor`.
- Product/software/detail imagery defaults to `subject_reference`.
- Illustrative/cutaway imagery defaults to `b_roll_insert`.
- AI-generated real-world/location/software imagery is visibly marked as illustrative and cannot satisfy a factual evidence requirement by itself.
- Existing approved start frames are never silently replaced.
- Explicit scene-anchor promotion changes only the intended start-frame/environment state.
- Subject references and B-roll never leak into the start-frame path by default.
- Video footage is never silently converted into an image reference; it enters assembly through an explicit B-roll segment binding.
- Still/footage B-roll preserves source IDs, segment/timecode, labels, audio policy, order, and duration through final assembly.

### Visual canon and story alignment

- After source confirmation, one immutable visual snapshot/fingerprint is created for the generation run.
- Draft, story bible, deep story draft, resume/retry, start-frame, reference, and B-roll consumers all use the same snapshot revision.
- Draft/full-story outputs contain validated slot/segment/claim references, not only prose descriptions.
- Required visual obligations are either fulfilled or explicitly marked not applicable with a warning; prose-only coverage does not pass.
- Changing a source slot, media asset, segment, evidence status, claim, or source revision marks dependent outputs stale and prevents stale commit.
- Scene anchors, subject references, still B-roll, and footage B-roll have mutually clear routing and no accidental cross-path leakage.

### News report

- `news_report` is selectable separately from `documentary` and uses a dedicated episode engine.
- Current-event prompts produce a claim ledger with evidence refs, attribution, geography, as-of/freshness, and verification state.
- Material claims without acceptable evidence block the news final gate or remain explicitly labelled `needs_verification`.
- Archive/file footage, creator footage, licensed footage, and AI illustration are visibly distinguished.
- AI-generated media cannot satisfy factual news evidence requirements.
- Stale, contradictory, corrected, or retracted sources create revision/stale states and cannot be silently overwritten.

### Reliability and security

- Every new read/write is tenant/user scoped and fail-closed on missing tenant.
- Web search, prompt generation, media generation, import, and binding have separate retry/error boundaries.
- Credit ledger and task idempotency remain single-source and pass focused tests.
- Legacy source packs and existing scene flows remain readable and usable.
- Upload/import/segment/assembly failures are recoverable without paid regeneration or duplicate credit charge.

## 20. Implementation waves

### Wave 1 — contracts and research/expansion

- Shared schemas, role enums, prompt preview contract, research bundle contract.
- Shared media modality/origin/evidence/segment contracts and `news_report` profile/format contracts.
- Skill files and policy registration.
- Server expansion run/apply boundaries.
- Dialog and focused tests.

### Wave 2 — visual slots and generation

- Migration/ORM fields or bounded operation ledger as required by the final schema audit.
- Slot suggestion/edit/revision lifecycle.
- Prompt generation and existing media admission/import wiring.
- Still/video upload/import metadata, poster, source segment editor, rights/disclosure/evidence labels.
- Single and batch UI/tests.

### Wave 3 — visual canon and story propagation

- Immutable `VisualSourceSnapshot` and fingerprint/fence contract.
- Coverage planner and claim/evidence/visual ledger.
- Thread the same snapshot into foundation, draft synthesis, story bible, deep draft, retry/resume, and final alignment gate.
- Persist typed slot/segment/claim refs and stale dependency propagation.

### Wave 4 — shot binding and conflict safety

- Source asset resolver for shots.
- Binding provenance and semantic modes for scene anchor, reference, still B-roll, and footage B-roll.
- Start-frame conflict/promote path.
- B-roll segment timeline, audio/label policy, assembly projection, and focused tests.

### Wave 5 — news profile and browser proof

- News claim ledger, source freshness, attribution, correction/revision, and final gate.
- News-specific prompt/format/profile UI and source/visual review.

- Desktop/mobile browser evidence.
- Feature-flag checks, migration check, typecheck, focused test suites, diff review.
- Reconcile all baseline failures and residual risks before enabling production flags.

## 21. Open implementation decisions to resolve before coding

1. Confirm the exact existing source-pack branch/schema state before selecting migration columns versus a small binding table.
2. Confirm the available skill catalog IDs and execution-policy registration names before creating new skill files.
3. Confirm the existing shot start-frame mutation/lock API to ensure scene-anchor promotion reuses it rather than writing JSON directly.
4. Confirm the exact existing web-search cost/audit path and user-facing estimate copy; do not invent a new charge.
5. Confirm browser test harness and feature-flag fixture patterns.
6. Confirm the canonical managed-media upload/import path for stills and video, including metadata extraction, poster generation, storage existence, and tenant-scoped playback.
7. Confirm whether source-media metadata belongs in an existing media contract or in feature-scoped tables; do not duplicate the shared `media_assets` registry.
8. Confirm the existing episode assembly extension point for still/footage B-roll timeline bindings and audio/label propagation.
9. Confirm the available vision/transcript/shot-index skills and their bounded input/output/cost contracts; analysis must not silently promote evidence status.
10. Confirm the existing story-generation contract/final-gate extension point for visual snapshot fingerprints, claim evidence, stale fencing, and deep-draft resume parity.
11. Confirm the news profile naming/feature-flag migration path and whether existing format enums require a compatibility version bump.

These are implementation discovery checks, not user-facing product choices. They must be resolved in the implementation plan before code changes.

## 22. Spec gap-review record

This amendment was reviewed in five independent passes before implementation. Each pass checked the spec itself and added missing contracts before the next pass.

### Round 1 — data model, identity, and ownership

- Finding: source assets had media identity but no explicit modality/origin/evidence separation; footage segments and binding revisions were underspecified.
- Closed by: `VisualMediaType`, `VisualMediaOrigin`, `VisualEvidenceStatus`, `SourceMediaSegment.revision`, media metadata, source/binding revision fingerprints, uniqueness/index rules, and explicit active/stale/blocked states.
- Verification: every media/binding contract now resolves through `sourceAssetId`/`mediaAssetId`; no provider URL is canonical; tenant/user ownership and idempotency are specified.

### Round 2 — end-to-end flow propagation

- Finding: a source digest could reach one LLM stage but disappear before deep draft, start-frame, motion prompt, or assembly.
- Closed by: immutable `VisualSourceSnapshot`, `VisualCoverageRequirement`, canon precedence, propagation matrix, stage fingerprints, stale-run fencing, deterministic coverage gates, and explicit start-frame/reference/B-roll boundaries.
- Verification: plan-level, full-story, deep/retry/resume, storyboard, motion, B-roll assembly, and final export are all named consumers with inputs and gates.

### Round 3 — news and evidence integrity

- Finding: documentary rules were not sufficient for current-event reporting; numbers, dates, footage age, attribution, and corrections could drift.
- Closed by: separate `news_report` profile/format, claim ledger, freshness/as-of, attribution, archive/file-footage labels, contradiction handling, correction revision lineage, stale cascade, and Nan flood/landslide reference scenario.
- Verification: AI visuals cannot satisfy factual evidence; user text remains `needs_verification` until evidence is applied; news profile selection is user-controlled.

### Round 4 — real media, footage, and assembly

- Finding: image B-roll and video footage require different production behavior; a generic shot-reference row cannot represent segment timecodes, audio, crop, labels, or timeline duration.
- Closed by: separate `vertical_drama_shot_broll_bindings`, source segments, exact in/out validation, still display duration, audio/fit/label policy, deterministic assembly projection, overflow gate, and recoverable partial assembly rules.
- Verification: video footage never silently becomes a reference/start frame; original media remains immutable and reusable; source provenance survives into final assembly.

### Round 5 — security, operations, UX, tests, rollout, and recovery

- Finding: the feature needed explicit large-file/privacy/telemetry boundaries, quality-gate ownership, browser proof, rollout order, and retry semantics.
- Closed by: bounded media analysis, sensitive footage handling, redacted telemetry, eight machine-readable quality gates, upload/analysis/assembly recovery matrix, UX requirements, focused/browser tests, independent flags, five implementation waves, and migration decisions.
- Verification: every new operation has an owner/idempotency/retry boundary; no paid regeneration is implied for upload/import/assembly failure; news publish requires a separate final gate.

### Final review result

`PASS — 5/5 gap-review rounds completed.` No unresolved product/design gap was found in the amended scope. The remaining items in section 21 are implementation discovery checks (existing code extension points, migration shape, skill IDs, and test harness), not missing behavior decisions. Implementation must not begin until those checks are resolved in the implementation plan and the final-gate contracts are mapped to actual code paths.
