# Feature 150: Vertical Drama Prompt Orchestra and Semantic Verification

**Status:** SPEC READY FOR IMPLEMENTATION — implementation not started by this spec
**Version:** 1.0.0
**Created:** 2026-08-18
**Priority:** P0 — credit protection, speaker identity, and future-use-case extensibility
**Owner:** Vertical Drama / Agent Runtime / Media Generation / Quality
**Depends-on:** Feature 130 (OpenAI Agents SDK runtime), Feature 131 (Vertical Drama storyboard/video flow), Feature 137 (identity-stable I2V), Feature 138 (scene continuity), Feature 140 (shot fact continuity), Feature 148 (unified agent/worker platform), Feature 149 (video prompt learning/QC ledger), Feature 151 (unified Agent Output Assurance Orchestra foundation)
**Related:** Existing `verticalDramaVideoMotionPromptGeneration`, `verticalDramaClipIdentityQc`, `verticalDramaQcReports`, `motionPromptPack`, `frameAnalysis`, `castPositionLock`, `motionProfile`, `promptQuality`, tenant-scoped media authorization, and provider capability registry

## 1. Executive decision

Vertical Drama video-prompt generation must be upgraded from a skill that writes
prompt prose into a governed **Prompt Orchestra**. OpenAI Agents SDK for Python
is the orchestration runtime, while deterministic contracts and validators remain
the authority for correctness.

The system must never treat an LLM-generated paragraph as proof that a shot is
valid. It must compile a versioned semantic contract, compose a prompt from that
contract, verify the result, repair only identified defects, and block provider
submission when a critical invariant is unresolved.

```text
Canonical episode/shot data (Node authority)
        |
        v
ShotSemanticContract v1
        |
        v
Python Prompt Orchestra (OpenAI Agents SDK Runner)
  Contract normalizer -> Composer skill -> deterministic verifier
                         -> risk-based vision verifier
                         -> targeted repair -> final gate
        |
        v
Node final gate + credit/provider task authority
        |
        v
Provider submission only when the contract is verified
```

This feature is deliberately broader than the current shot 6 failure. Shot 6
is the first regression target, not the feature boundary.

The reusable, non-Vertical-Drama runtime contract is specified in Feature 151.
This feature supplies the Vertical Drama contract and Rule Packs on top of that
foundation. Image prompt generation and generic skill execution must not create
parallel orchestration implementations.

## 2. Problem statement

The current video prompt can be readable to a person and still be unsafe to
send to a paid video provider. Recurring failure classes include:

1. A line is spoken by the wrong character or the wrong face moves.
2. A line has no machine-provable speaker cue, even when the prose sounds clear.
3. Custom character descriptions disappear or conflict with left/right position.
4. Extra people, duplicate bodies, reflections, or background staff are added.
5. A crowded/ambiguous reference image is used without enough identity evidence.
6. A character speaks while their face is hidden, too small, or unavailable to
   anchor the provider's voice/identity selection.
7. Phone calls, off-screen voices, intercuts, split screens, and remote locations
   are described without a valid visual representation of the speaker.
8. Required props, virtual phone screens, or continuity objects are omitted,
   duplicated, or assigned to the wrong person.
9. Actions and material motion are physically contradictory or temporally
   impossible.
10. The prompt exceeds a provider's limit and is silently truncated.
11. A corrective retry rewrites prose but leaves the underlying semantic defect.
12. The system spends video credits before it knows that a critical check failed.

The existing prompt generator and learning ledger contain useful evidence, but
there is no single contract that binds dialogue, cast, visual identity, camera
grammar, interaction topology, props, timing, and provider capability together.

## 3. Goals

1. Introduce a versioned `ShotSemanticContract` as the canonical input to prompt
   composition and verification.
2. Use the existing Python OpenAI Agents SDK adapter as the Orchestra runtime;
   do not create a second SDK bridge.
3. Make every dialogue event explicitly attributable to a `characterKey` and a
   visual identity anchor.
4. Support future interaction types through declarative Rule Packs rather than
   ad-hoc prompt edits.
5. Detect high-risk reference frames before paid generation.
6. Run deterministic checks before expensive vision/LLM checks.
7. Run bounded, targeted repair loops and never silently replace an approved
   candidate or spend an unbounded number of credits.
8. Prevent provider submission until the final gate passes.
9. Record all contract versions, defects, repairs, traces, provider limits, and
   outcomes in the Feature 149 learning/QC lineage.
10. Provide regression fixtures for current and anticipated use cases.
11. Preserve current UI flow: position selectors remain user-controlled, custom
   descriptions are optional, and existing prompt output remains visible/editable.
12. Keep the design extensible for post-render video QC and future provider
   capabilities.

## 4. Non-goals

1. This feature does not guarantee that a third-party video model will obey every
   physical instruction.
2. It does not silently regenerate failed clips or consume additional credits.
3. It does not replace the existing provider/media task authority.
4. It does not make off-screen dialogue universally valid; exceptions require an
   explicit contract policy and verifier evidence.
5. It does not automatically train or fine-tune a model from raw user feedback.
6. It does not remove Feature 149; it extends its lineage and policy surfaces.
7. It does not allow frontend code to call Python or the Agents SDK directly.
8. It does not introduce a second prompt-generation truth in Python.

## 5. Locked architectural decisions

### 5.1 Runtime boundary

The Python backend is the only runtime that imports `agents`. Node/TypeScript
remains authoritative for tenant scope, episode data, media tasks, credits,
provider submission, and the final server-side gate.

The Orchestra must extend:

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_version.py`

It must not add a Vertical Drama-only SDK import boundary or a new Python agent
service that bypasses the existing adapter.

### 5.2 Manager-style orchestration

Use one manager (`VerticalDramaPromptOrchestrator`) that owns the final result
and calls Composer, verifier, vision verifier, and repair agents as tools. Use
handoffs only for explicit specialist routing. The manager must still invoke a
deterministic final gate because SDK guardrails alone are not the domain source
of truth.

### 5.3 Skill boundary

The existing video-prompt skill is a Composer instruction/module. It may propose
wording, camera language, and style, but it may not invent cast members,
dialogue, locations, interaction topology, or required visual evidence.

### 5.4 Fail-closed policy

The following failures are blocking by default:

- unknown or ambiguous speaking identity;
- dialogue speaker mismatch or missing speaker cue;
- cast count mismatch in strict mode;
- custom identity and position contradiction;
- missing required reference asset;
- speaking segment without an allowed face identity anchor;
- invalid interaction topology;
- prompt length over the selected provider limit;
- unresolved required prop or location contradiction;
- verifier timeout for a high-risk shot when no safe fallback exists.

Warnings may pass only when the contract marks the check as non-critical and the
user has not selected strict mode.

## 6. Canonical semantic contract

The TypeScript and Python representations must be generated from one schema or
be checked for parity in CI. Names below describe the required semantics; exact
file placement follows repository conventions.

```ts
type ShotSemanticContract = {
  schemaVersion: 1;
  contractId: string;
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotId: string;
  sourceRevision: string;
  durationSec: number;
  providerId: string;
  modelId: string;
  providerLimits: {
    promptMaxChars?: number;
    negativePromptMaxChars?: number;
    maxReferenceImages?: number;
    supportsVision: boolean;
    supportsNativeAudio?: boolean;
  };
  cast: CharacterContract[];
  locations: LocationContract[];
  dialogue: DialogueEvent[];
  interactions: InteractionContract[];
  cameraPlan: CameraPlan;
  props: PropRequirement[];
  continuity: ContinuityConstraint[];
  faceVisibilityPolicy: FaceVisibilityPolicy;
  forbiddenElements: string[];
  risk: RiskProfile;
};
```

### 6.1 Character contract

```ts
type CharacterContract = {
  characterKey: string;
  displayName: string;
  referenceAssetIds: string[];
  customIdentityDescription?: string;
  positionHint?: "left" | "right" | "center" | "foreground" | "background";
  positionSource: "user" | "image_analysis" | "inferred" | "none";
  representation: "physical" | "phone_screen" | "split_screen" | "insert";
  physicalCast: boolean;
  allowedInFrame: boolean;
};
```

Rules:

- A custom identity description is authoritative for identity matching when
  supplied; it must not be repeated as a contradictory left/right instruction.
- Position is a hint for composition, not a unique-key lock. Users may select
  the same character in multiple slots when the shot semantics allow it.
- `physicalCast` controls cast cardinality. A face rendered on a phone screen
  is a representation of an existing character, not an extra physical person.
- Character selectors must not disable an already-selected name. Repeated names
  are valid when a user is correcting swapped positions or when the contract
  explicitly allows repeated representation.

### 6.1.1 Custom-description UI persistence

The existing optional custom-description fields are part of the contract input,
not ephemeral component state. The implementation must:

- key draft text by `characterKey`, never by visual slot index;
- preserve text while position selectors or cast order change;
- debounce persistence and flush on blur, explicit save, and shot navigation;
- avoid replacing a controlled value with an empty server snapshot while the
  user is typing;
- show a non-blocking unsaved/saved state without disrupting the existing flow;
- send the field only when non-empty after trimming;
- never send both a custom identity description and a contradictory positional
  identity instruction for the same character.

### 6.2 Dialogue event

```ts
type DialogueEvent = {
  lineId: string;
  sequence: number;
  speakerKey: string;
  speakerName: string;
  text: string;
  locationId?: string;
  interactionId?: string;
  timing?: { startSec?: number; endSec?: number };
  requiredFaceVisibility: "physical" | "phone_screen" | "split_screen" | "insert";
  allowOffscreenVoice: boolean;
  listenerKeys: string[];
  silencePolicy: "closed_mouth" | "natural_reaction" | "unrestricted";
};
```

Every line must have one canonical speaker key. The rendered prompt must include
an explicit speaker cue that is machine-linked to `lineId`; proximity-based
matching of a quote within arbitrary prose is not sufficient.

### 6.3 Interaction contract

```ts
type InteractionContract = {
  interactionId: string;
  type:
    | "in_person_dialogue"
    | "phone_call"
    | "cross_location_call"
    | "shout_across_locations"
    | "voiceover"
    | "crowd_reaction"
    | "prop_interaction";
  participantKeys: string[];
  locationIds: string[];
  communicationChannel: "direct" | "phone" | "distance" | "narration";
  visualRepresentation:
    | "single_frame"
    | "intercut"
    | "split_screen"
    | "phone_screen"
    | "insert_cut";
  requiredEvidence: string[];
};
```

## 7. Rule Pack system

Rules must be data-driven and versioned:

```ts
type PromptRulePack = {
  rulePackId: string;
  version: string;
  interactionTypes: string[];
  requiredContractFields: string[];
  deterministicChecks: string[];
  visionChecks: string[];
  temporalChecks: string[];
  repairPolicy: "targeted" | "user_action_required" | "block";
};
```

Initial packs:

### 7.1 `in_person_dialogue`

- Every speaking segment maps to a visible physical cast member.
- Silent listeners have closed-mouth or explicitly defined reaction behavior.
- No extra physical people are allowed in strict mode.

### 7.2 `phone_call`

- The speaking person must be visible physically or through an approved phone
  screen representation.
- The remote character on the screen must map to an existing `characterKey`.
- A phone screen cannot create a new unnamed character.
- If the provider/model cannot reliably render a phone screen, the plan must use
  an intercut or split-screen variant, or block for user selection.

### 7.3 `cross_location_call`

- Each participant has an explicit location.
- The camera plan must be `intercut` or `split_screen`; it cannot claim one
  continuous physical location for both participants.
- Every dialogue line records its active location and visible identity anchor.

### 7.4 `shout_across_locations`

- The interaction must identify distance and sightline assumptions.
- Each speaker receives a visible face segment when speaking.
- If the characters cannot be shown in the same frame, the plan must use
  intercut/split-screen; uncontrolled off-screen speech is blocked by default.

### 7.5 `voiceover`

- Off-screen voice is allowed only when explicitly selected.
- The voice must still map to a canonical character or narrator identity.
- The prompt must state that no unrelated character mouth moves.

### 7.6 `prop_interaction`

- Required props have an owner, continuity source, and visibility policy.
- The prompt cannot invent a prop merely because a generic action phrase suggests
  one.
- The same prop cannot appear duplicated unless the contract explicitly allows it.

## 8. Orchestra stages

### Stage A — Contract normalizer

Deterministically normalizes episode data into the contract:

- resolves character keys/names;
- preserves custom descriptions;
- maps dialogue lines to stable IDs;
- resolves provider/model capability;
- computes interaction type and risk;
- detects contradictions before any LLM call.

It must not use an LLM to resolve an authoritative identity conflict.

### Stage B — Prompt Composer

Uses the existing skill and receives the contract as immutable structured input.
Output must be `PromptDraft`, not free-form text only:

```ts
type PromptDraft = {
  prompt: string;
  negativePrompt?: string;
  dialogueCues: {
    lineId: string;
    speakerKey: string;
    renderedCue: string;
    promptSpan?: { start: number; end: number };
  }[];
  cameraSegments: CameraSegment[];
  representationEvidence: RepresentationEvidence[];
  referencedCharacters: string[];
  referencedProps: string[];
  warnings: string[];
};
```

### Stage C — Deterministic contract verifier

Checks the draft against the contract without an LLM. It must verify exact
dialogue text, speaker mapping, line coverage, cast cardinality, custom identity
preservation, interaction grammar, camera segment coverage, prop requirements,
forbidden elements, and provider length.

### Stage D — Risk classifier

Computes risk from structured facts, not only model confidence. High-risk signals
include crowded frames, more than two faces, occluded faces, multiple locations,
phone screens, intercuts, physical contact, complex props, ambiguous identity,
and multiple speaking turns.

### Stage E — Vision verifier

Runs only when required by the risk policy and the selected model has actual
vision capability. It returns structured evidence:

```ts
type VisionVerification = {
  status: "pass" | "warn" | "block";
  confidence: number;
  castFindings: CastFinding[];
  faceVisibilityFindings: FaceFinding[];
  extraPersonFindings: ExtraPersonFinding[];
  propFindings: PropFinding[];
  recommendedUserAction?: string;
};
```

If no capable vision model is available for a required check, fail closed rather
than silently falling back to a text-only model.

### Stage F — Targeted repair agent

Repairs only defect codes returned by validators. It must not rewrite the whole
prompt or alter approved dialogue, cast, locations, or props. Each repair carries
the prior contract hash and draft hash.

Maximum automatic repair attempts: **2**. A third failure becomes a blocked
result with actionable user guidance.

### Stage G — Final gate

The final gate produces a signed/versioned `VerifiedPromptArtifact` and refuses
provider submission unless all critical checks pass. Node repeats this gate at
the media submission boundary to protect against stale or tampered drafts.

## 9. Verification policy

### 9.1 Hard checks

- all dialogue lines have one speaker;
- all speakers exist in canonical cast;
- speaker cue is explicit and linked to line ID;
- custom identity descriptions are preserved;
- physical cast count is exact where strict mode is enabled;
- no forbidden extra person/duplicate/reflection instruction is present;
- speaking segments have required face evidence;
- interaction topology is valid;
- required assets and props are present;
- prompt fits provider limits;
- contract/draft hashes match the final submitted artifact.

### 9.2 Soft checks

- natural pose wording;
- camera style coherence;
- emotional continuity;
- likely physics risk;
- stylistic redundancy.

Soft checks may warn but cannot downgrade a hard failure.

### 9.3 Provider budget

Provider limits must be read from the capability registry at runtime. For KIE/Grok
the prompt budget is 4,096 characters. The compiler must reserve room for required
identity, dialogue, safety, and provider-specific tokens; it must never silently
truncate the prompt. If the budget cannot fit the contract, return a structured
`prompt_budget_exceeded` block and offer a user-reviewed compact variant.

## 10. Credit and side-effect gate

The provider submit path must require:

```text
contract status = verified
critical findings = 0
prompt artifact hash = submitted draft hash
provider capability snapshot = current
credit reservation = authorized
```

Any mismatch creates a new attempt or blocks. It must never mutate an approved
attempt in place.

Vision and repair calls may consume LLM credits, but they must be bounded and
visible. Video-provider credit reservation occurs only after the final gate.

## 11. Persistence and learning integration

Feature 149 remains the learning/QC ledger authority. This feature must extend
its prompt attempt payload rather than create a second learning table.

Required additions to the existing lineage:

- `contractId`, `contractVersion`, `contractHash`;
- `rulePackIds` and versions;
- `orchestraRunId` and SDK version;
- stage attempts and defect codes;
- deterministic/vision/temporal verifier results;
- repair parent hash and final artifact hash;
- provider budget and actual prompt length;
- user action requested when blocked;
- representation evidence for phone screens/intercuts/split screens.

All records remain tenant/user scoped, append-only, and linked to media task and
credit transaction IDs. Raw failures may create policy proposals but must not
rewrite the active skill automatically.

## 12. API and integration boundary

### 12.1 Node to Python

Add an internal authenticated runtime surface through the existing OpenAI Agents
runtime API boundary. The payload must include:

- contract JSON and schema version;
- approved reference asset IDs or authorized media references;
- requested rule packs;
- provider/model capability snapshot;
- tenant/user/run correlation;
- allowed tools and side-effect scope;
- idempotency key.

The frontend must never call this endpoint directly.

### 12.2 Python to Node

Return:

- status (`verified`, `warn`, `blocked`, `failed`);
- structured `PromptDraft` or `VerifiedPromptArtifact`;
- defect codes and human-readable fixes;
- contract/draft/final hashes;
- stage evidence and trace correlation;
- SDK/adapter/rule versions;
- repair count and cost metadata.

Node persists the result, revalidates the final artifact, and owns provider
submission.

## 13. Observability and operations

Every run must record:

- contract and rule versions;
- SDK and adapter version;
- selected model and fallback provenance;
- every stage start/end/failure;
- deterministic findings;
- vision confidence and model capability;
- repair attempts;
- provider budget;
- final gate decision;
- credit reservation decision.

Use Agents SDK tracing for agent/tool/handoff visibility, but use the SmartSpecPro
QC ledger as the domain source of truth. Sensitive media and prompt data must be
redacted or referenced by authorized artifact IDs in traces.

## 14. Security and tenancy

1. Contract, reference assets, traces, and QC artifacts are tenant/user scoped.
2. Python receives authorized references, not unrestricted storage URLs.
3. Agents cannot choose arbitrary tools, providers, write scopes, or media assets.
4. Mutating tools require explicit runtime policy and approval.
5. Prompt artifacts and traces must redact secrets and provider credentials.
6. A stale contract or revoked asset authorization fails the final gate.
7. User-supplied custom descriptions are treated as data, not executable
   instructions.

## 15. Failure modes and user recovery

| Failure | System action | User action |
| --- | --- | --- |
| Ambiguous/crowded reference | Block before paid submit | Replace image or add custom identity details |
| Missing speaker cue | Deterministic repair, then block if unresolved | Edit dialogue/speaker mapping |
| Extra physical person | Block in strict mode | Crop/reference a cleaner frame or adjust cast |
| Phone screen unsupported | Offer intercut/split-screen variant | Choose representation |
| Cross-location contradiction | Block | Confirm locations and cut plan |
| Prompt too long | Produce compact candidate, never truncate | Approve compact wording or simplify shot |
| Vision model unavailable | Fail closed for high-risk shot | Wait, choose a supported model, or explicitly lower risk |
| Provider capability changed | Recompile and reverify | No action unless contract no longer fits |
| Repair budget exhausted | Return defect ledger | User fixes source data/image |

## 16. Testing and evaluation

### 16.1 Contract tests

Cover:

- readable and opaque character keys;
- custom identity persistence;
- repeated character selection where allowed;
- exact dialogue line IDs;
- cast cardinality and representations;
- provider budgets;
- stale contract hashes;
- tenant isolation.

### 16.2 Rule Pack golden fixtures

At minimum:

1. Current shot 6 proposal scene.
2. Two-person in-person dialogue.
3. Phone call with virtual screen.
4. Phone call using intercut locations.
5. Shouting across two locations.
6. Split-screen conversation.
7. Voiceover with explicit narrator.
8. Crowded frame with unrelated people.
9. Prop interaction with a required ring box.
10. Ambiguous image that must be blocked.

### 16.3 Agent/runtime tests

- Composer cannot invent a new cast member.
- Validator catches a correct-looking prose prompt with the wrong speaker.
- Repair preserves approved lines and custom identity descriptions.
- Loop stops after two repairs.
- Python runtime uses the existing adapter boundary.
- SDK unavailable/error path is safe and observable.
- final Node gate rejects altered artifacts.

### 16.4 Provider and post-render evaluation

Use fixture clips or user-approved samples to evaluate:

- speaker/face alignment;
- silent listener mouth movement;
- extra people/duplicates;
- phone-screen identity;
- intercut location correctness;
- prop continuity;
- motion/physics defects.

No test may spend real provider credits by default. Credit-consuming tests must
be explicit, isolated, and approval-gated.

## 17. Rollout plan

### Phase 0 — Contract shadow mode

- Build contract and deterministic validators in Node.
- Run beside the existing generator without blocking low-risk shots.
- Log would-block findings and compare against current shot 6 behavior.

### Phase 1 — Hard gate for structural defects

- Block missing speaker cues, cast mismatch, missing custom identity, invalid
  provider length, and missing required references.
- Keep existing prompt output and UI flow.

### Phase 2 — Agents SDK Orchestra

- Add the Python manager and structured Composer/Repair surfaces through the
  existing adapter.
- Enable bounded repair for high-confidence deterministic defects.
- Add tracing and Feature 149 lineage fields.

### Phase 3 — Vision and Rule Packs

- Enable risk-based vision verification.
- Add phone call, cross-location, shout, split-screen, and prop Rule Packs.
- Fail closed when required visual evidence cannot be established.

### Phase 4 — Post-render QC and policy proposals

- Link rendered clips to prompt attempts.
- Add sampled video/audio QC and user labels.
- Generate reviewable policy proposals from failure clusters.
- Require regression fixtures and approval before policy promotion.

## 18. Agents SDK version policy

The repository currently pins `openai-agents==0.17.4`, but the dependency file
also retains `agency-swarm==1.8.0`. That Agency Swarm release pins
`openai-agents==0.9.3`, so the current requirements file is already not a
resolvable single environment when a normal dependency resolver is used. A
blind SDK bump would make this incompatibility worse.

At spec time, `openai-agents==0.21.1` is the latest release. It requires
`openai>=3,<4` and migrates the Agents SDK HTTP integrations to HTTPX2. The
latest release compatible with the current OpenAI v2 line is `0.20.0`, but it
still cannot coexist with the retained Agency Swarm pin. Therefore this feature
does **not** silently change the production requirements pin. It defines the
required dependency migration instead:

1. move legacy Agency Swarm into a separate optional/legacy runtime (or complete
   its deprecation) so it cannot constrain the Orchestra environment;
2. create an Agents Orchestra dependency set with `openai-agents==0.20.0` and
   `openai>=2.45.0,<3` as the first compatible upgrade;
3. run the full adapter, streaming, gateway, and provider-mock compatibility
   suite before enabling the Orchestra path;
4. only after the OpenAI v3/HTTPX2 migration is implemented and tested, evaluate
   upgrading the Orchestra environment to `openai-agents==0.21.1`;
5. pin and document the exact version with rollback instructions.

The implementation must not claim that the SDK is upgraded until the resolver,
runtime import, and focused tests all pass in the deployed Python environment.

The dependency conflict is a release blocker for a production SDK bump, not a
reason to delay the contract/validator work. The Orchestra can be implemented
behind the existing adapter first, then switched to the isolated dependency set.

The later 0.21.x migration must:

1. upgrade the OpenAI Python SDK and all dependent integrations;
2. audit custom `http_client` and transport code;
3. audit LangChain/OpenAI gateway compatibility;
4. run Python unit, API, adapter, streaming, and provider-mock tests;
5. run a staging canary and verify runtime health/trace metadata;
6. pin and document the exact version with rollback instructions.

The current repository pin remains unchanged until that isolation work is
complete. The existing import-boundary test remains the guard against silently
declaring an unresolvable SDK version.

The implementation must add a dependency-resolution gate (for example an
offline/CI `uv` resolution check against the Python manifests). The import-boundary
test alone only verifies declaration shape; it is not proof that the full
requirements set can be installed. The gate must fail when `agency-swarm` and
`openai-agents` pins cannot be resolved together.

## 19. Implementation file map

Expected implementation seams (exact names may be refined during planning):

### Node/TypeScript

- `apps/web/server/services/verticalDramaPromptContract.ts`
- `apps/web/server/services/verticalDramaPromptContractValidator.ts`
- `apps/web/server/services/verticalDramaPromptRulePacks.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaPromptOrchestraGateway.ts`
- `apps/web/server/services/verticalDramaPromptFinalGate.ts`
- shared schemas/types for contract parity
- Feature 149 prompt learning/QC lineage projection

### Python

- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/vertical_drama_prompt_orchestrator.py`
- `python-backend/app/services/vertical_drama_prompt_agents.py`
- `python-backend/app/services/vertical_drama_prompt_verifiers.py`
- existing internal Agents runtime router, extended rather than duplicated

### Skills

- `apps/web/skills/vertical-drama-shot-video-prompt/SKILL.md`
- structured output schema for PromptDraft
- rule-pack prompt fragments only; no authoritative identity invention

### Tests

- Node contract/rule/validator tests
- Python contract/orchestrator/adapter tests
- API boundary and security tests
- golden fixtures for every initial Rule Pack
- focused regression for shot 6

## 20. Acceptance criteria

The feature is complete only when all conditions hold:

1. Shot 6 produces a contract with three explicit dialogue events and correct
   speaker keys; the prior missing-cue warning cannot recur silently.
2. Custom identity descriptions survive position selection and reach the final
   prompt only for the characters that supplied them.
3. A duplicate or extra character cannot pass strict cast validation.
4. A phone-call shot cannot pass without a valid physical/phone-screen/split-
   screen identity anchor for every speaking segment.
5. A cross-location call cannot pass as a single continuous physical scene.
6. A shout-across-locations shot has explicit cut/split-screen semantics and
   visible speaker faces.
7. Prompt length is validated against the selected provider and never silently
   truncated.
8. High-risk image verification fails closed when no actual vision capability is
   available.
9. Automatic repair stops after two attempts and preserves lineage.
10. No failed final gate reaches the paid video provider.
11. Every attempt is linked to Feature 149 learning/QC evidence.
12. Adding a new interaction type requires a new Rule Pack and tests, not a
    rewrite of the Composer or final gate.
13. Existing low-risk prompt generation remains available during rollout and can
    be disabled independently by feature flag.
14. The Agents Orchestra dependency set is isolated from legacy Agency Swarm,
    resolves successfully, and its exact SDK pin is covered by focused runtime
    tests.

## 21. Risks and trade-offs

| Risk | Mitigation |
| --- | --- |
| More agent calls increase latency/cost | Deterministic-first checks, risk-based vision, max two repairs |
| SDK minor releases can break integrations | Exact pin, import boundary, compatibility suite, staged upgrade |
| Contract becomes too large | Versioned modular Rule Packs and stable IDs |
| False blocking frustrates users | Distinguish hard/soft checks and provide actionable fixes |
| Vision confidence is imperfect | Require evidence thresholds and fail closed only for critical checks |
| Prompt prose loses stylistic flexibility | Composer remains free to phrase non-authoritative style language |
| Learning loop changes behavior unexpectedly | Append-only ledger, policy proposals, human approval, rollback |
| Python/Node drift | Shared schema, hash parity, contract fixtures in both runtimes |

## 22. Definition of done

Implementation is ready for production rollout only after:

- contract, Rule Pack, and final-gate schemas are versioned;
- focused tests and golden fixtures pass;
- Python SDK upgrade compatibility is proven;
- staging runs show correct traces and no credit leakage;
- shot 6 and future-use-case regressions pass;
- failure messages are actionable in the existing UI;
- Feature 149 lineage contains enough evidence to explain every blocked,
  repaired, submitted, and rejected attempt;
- rollout and rollback feature flags are documented.

## 23. Source references

- OpenAI Agents SDK documentation: https://openai.github.io/openai-agents-python/
- Agents and Runner: https://openai.github.io/openai-agents-python/agents/
- Multi-agent orchestration: https://openai.github.io/openai-agents-python/multi_agent/
- Guardrails: https://openai.github.io/openai-agents-python/guardrails/
- Tracing: https://openai.github.io/openai-agents-python/tracing/
- PyPI release metadata: https://pypi.org/project/openai-agents/
- Agents SDK release notes: https://github.com/openai/openai-agents-python/blob/main/docs/release.md
