# section-08-provider-qc-product-tie-in

## Goal

Resolve image/video models from the live registry, enforce provider capability gates, create QC/repair decisions, and integrate safe product tie-in planning.

## Depends On

- section-01-skill-packages
- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline
- section-05-character-stock-and-start-frames
- section-07-audio-dialogue-subtitles

## Files

Create:

- `apps/web/server/services/verticalDramaProviderRoutingService.ts`
- `apps/web/server/services/verticalDramaQcService.ts`
- `apps/web/server/services/verticalDramaProductTieInService.ts`
- `apps/web/shared/verticalDramaSeries/providerRouting.ts`
- `apps/web/shared/verticalDramaSeries/qc.ts`
- `apps/web/shared/verticalDramaSeries/productTieIn.ts`
- focused provider/QC/tie-in tests

Modify if needed:

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` only if existing provider payload mapping cannot support selected models

## Model Routing Requirements

Image model routing:

- list every enabled compatible `type = "image"` model;
- default to `google-banana-2-lite` when available;
- support crop/pad/resize compatibility for contact-sheet candidates;
- show credit estimates before paid image generation.

Video model routing:

- list every enabled compatible `type = "video"` model;
- support aliases for Veo 3.1 Lite/Quality/Fast, Gemini Omni/Omni Flash, Grok Imagine 1.5, and Seedance labels;
- support motion modes `first_last_frame_bridge`, `first_frame_to_video`, `image_to_video`, `text_to_video`, `reference_to_video`, and `prompt_only`;
- preserve GitHub/default bridge profile `veo31_first_last_bridge_60s` as 8 adjacent clip jobs from 9 frames with `8+8+8+8+8+8+8+4` timing;
- offer the fallback duration profile `vertical_drama_60s_9_shots` (9 clips, `per_shot_first_frame_or_prompt` motion mode, `8+8+8+4+8+8+4+8+4` timing) as a routing option for providers without first/last-frame support, alongside the default bridge;
- block or reroute unsupported human-face input references;
- preserve raw upstream provider statuses `ready`, `blocked`, `fallback_text_to_video`, `manual_review_required`, and `external_provider_required` alongside normalized app status.

Provider adapter abstraction:

All provider routing must go through adapter interfaces, not one-off provider calls inside UI code. Each adapter implements a shared `VerticalDramaVideoProviderAdapter` contract (`providerId`, `capabilities`, `createClip`, `getJob`, `downloadResult`, optional `cancelJob`) so routing outcomes, gating, and lifecycle are uniform across providers (see spec §9.1).

Required adapters:

- `VeoCompatibleVideoProvider`: MVP first/last-frame bridge path, allowed only when tenant/provider config confirms 9:16, required durations, first/last-frame input, and audio policy support (the production bridge allowlist).
- `OpenAIVideoProvider`: prompt-only or capability-gated fallback only. It is NOT the human-face first/last-frame bridge default for MVP; `openai_sora`/`openai_videos` stay disabled/capability-gated for human-face bridge unless policy changes.
- `ExternalImageToVideoProvider`: requires explicit tenant/provider configuration (`base_url`, `api_key_env`, create/status/download endpoints) before it can be selected.
- `MockVideoProvider`: produces DETERMINISTIC placeholder artifacts so dry-run and tests run without provider keys.

Provider job lifecycle:

- `create`: submit a paid or mock provider job only after approval, credit, payload, and QC gates pass.
- `poll`: refresh provider status without mutating prompts or frame references.
- `webhook`: accept provider callbacks only through existing authenticated/provider-verified infrastructure.
- `download/import`: stage provider outputs into tenant-owned `mediaAssets` before durable references are exposed.
- `cancel`: cancel queued/running jobs when the provider supports it and mark affected tasks repairable.
- `retry/repair`: create a new job attempt linked to the prior provider job and repair artifact.
- `timeout`: enforce a per-job timeout; a job that exceeds it transitions to the `timed_out` status and is marked repairable rather than left hanging.
- `error mapping`: map raw provider errors into stable app error codes (`errorCode`) so QC, repair, and UI copy do not depend on upstream wording.

Provider job status values are `queued`, `running`, `succeeded`, `failed`, `cancelled`, and `timed_out`.

`vdflow render-video` maps to this lifecycle for approved clip requests in `render_video` or `full` mode.

Sub-shot decomposition in video routing (feature-flagged):

Sub-shots are opt-in via `verticalDramaSeriesSubShots` (default off; default routing behavior with the flag off is unchanged). When the flag is on, the motion-prompt/provider-routing stage resolves each main shot's sub-shots per `VerticalDramaSubShotPolicy` (see spec §7.4 Sub-Shot Decomposition):

- resolve the sub-shot count "as feasible": `auto` mode aims for `targetPerShot` (2-3) and never exceeds `maxPerShot` (raise-to 4-5), with `N = min(targetPerShot, floor(D / minSubShotSeconds))` for a main shot of duration `D`, so a short main shot (e.g. the trailing 4s) receives fewer sub-shots; `fixed` mode forces `targetPerShot` when feasible.
- ONLY when the resolved provider supports the resulting short clip durations AND the required input mode, emit each sub-shot as its own short `video_clip_requests` entry carrying `parentShotNumber` + `subShotNumber` (mapped to `parent_shot_number` / `sub_shot_number`), so assembly concatenates the ordered cuts; a non-decomposed clip omits these or sets `sub_shot_number = null`.
- sub-shot durations for a parent shot always sum to the parent main-shot duration, and the episode stays 60 seconds / 9 shots / 9 frames — sub-shots never change the shot count or episode total; `source_shot_numbers` still maps back to the 9 storyboard shots.
- by default sub-shots reuse the parent shot's approved start frame (reframed via `cameraSetup`); `perSubShotStartFrames: true` opts into distinct per-sub-shot start frames.
- when the provider cannot support the resulting durations/count, degrade per `fallbackOnUnsupported` — reduce `N` toward feasible (`fewer_sub_shots`) or collapse to the single parent clip (`single_clip`) — and NEVER degrade silently: record the reason in `provider_feasibility.blocking_reasons` and surface it alongside the raw upstream provider status.
- the resolved decomposition, counts, durations, camera setups, transitions, and feasibility/degrade decisions are emitted in `sub_shot_plan` (present only when the flag is on).

Sub-shot capability gate:

The provider capability matrix adds sub-shot feasibility checks so a provider that cannot do the short durations or the requested count blocks or reduces sub-shots, never silently:

- sub-shot min-duration feasibility: the provider must support clip durations `>= minSubShotSeconds` (anti-choppy + provider floor); a provider below that floor blocks or reduces the count.
- sub-shot count feasibility: the resolved `N` must be within the provider's supported per-request clip granularity and `<= maxPerShot`; otherwise reduce toward feasible or collapse per `fallbackOnUnsupported`.
- input-mode feasibility: the provider must support the sub-shot input mode (parent-frame reframe, or distinct per-sub-shot start frames when `perSubShotStartFrames`).
- any gate that reduces or collapses sub-shots records its reason in `provider_feasibility.blocking_reasons` (consistent with the "fallbacks never happen silently" rule).

## Runtime Config And Tenant Policy Mapping

Provider routing reads a `VerticalDramaRuntimeConfig` mapped from feature flags, model/provider registry config, tenant policy, and secret storage — never from a hard-coded runtime client (see spec §9.2). The GitHub guide's `.env.example` / `config/default.yaml` are guidance only.

Beta defaults:

- `default_mode = "dry_run"`.
- `auto_approve_generated_character_refs = false`.
- `auto_approve_start_frames = false` for human characters and product tie-in scenes.

Tenant-admin restrictions (policy-enforced, not UI branches):

- allowed providers;
- max episode count;
- native audio;
- regulated product categories;
- prompt-only fallback (`allow_prompt_only_fallback`).

Rules:

- Changes to provider policy, auto-approval policy, and product approval policy must be audit logged.
- Generated/provider assets inherit tenant and project ownership checks before reuse as references.

## Product Tie-In Requirements

- Product cannot unrealistically solve the main conflict.
- Every placement needs `story_function`.
- Regulated claims produce warnings or blocks.
- Product visuals must use approved product references when available.
- Placement history prevents repetitive use.
- Tie-in metadata must be auditable and removable.

Disclosure handling:

- The tie-in config carries a `disclosurePolicy` field (`not_required` | `show_overlay_disclosure` | `caption_disclosure` | `manual_review`).
- Caption/overlay disclosure text (`disclosureText`) is stored SEPARATELY from the video prompt — disclosure copy must never be merged into the motion/video prompt payload.
- `disclosureRequired`/`disclosureText` travel in tie-in usage output and Storyboard Review metadata, not in provider prompt fields.

Mandatory approval (MVP + beta):

- Tie-in config carries a `requireHumanApproval` gate; product tie-in approval is mandatory for MVP and beta, including all regulated categories.
- Regulated categories (`health`, `beauty`, `finance`, `medical`, `baby_kids`, `other`) require manual review BEFORE any paid generation.
- A tie-in must be approve / remove / repair-able before Storyboard Review project creation; the approving user is recorded as `approvedByUserId`.
- Post-beta tenant configurability of approval may be added only after audit logs, disclosure storage, and claim-review metrics are stable.

Provenance:

- Tie-in config carries a `productSource` enum (`manual` | `marketplace` | `library` | `uploaded_reference`).
- Product provenance is retained for audit and later Library/marketplace workflows.

## QC Requirements

QC runs at:

- script/story consistency;
- series continuity QC (relationship/plot continuity across episodes) as a distinct stage;
- character visual bible/asset readiness;
- storyboard shotgrid;
- contact-sheet/candidate frame selection;
- motion prompt/provider routing;
- product tie-in QC as a distinct stage;
- Storyboard Review handoff;
- clip import;
- assembly/export;
- memory checkpoint.

QC output includes severity, target stage/shot/clip, issue code, repair action, and whether the stage blocks paid generation.

Each QC result also carries an explicit `score` (number) and a `passed` boolean so callers can gate paid generation on a hard pass/fail rather than parsing issue lists.

Required checks (every stage evaluates the relevant subset):

- 9:16 output;
- duration sums correctly;
- sub-shot decomposition (only when `verticalDramaSeriesSubShots` is on): per parent shot, sub-shot durations sum to the parent main-shot duration, each sub-shot is `>= minSubShotSeconds`, sub-shot count is `<= maxPerShot`, and cut rhythm/identity/continuity is preserved across cuts (not choppy, not stretched) (see spec §7.4 / §16);
- character identity and wardrobe consistency;
- relationship/plot continuity;
- no duplicate or contradictory episode memory;
- no forced or unsupported product claims;
- prompt/overlay/audio separation;
- provider capability policy honored;
- a repair queue exists for every failed stage;
- skill contract version matches the persisted episode run;
- audio/subtitle timing stays within episode duration;
- Storyboard Review start/stop frame roles are valid;
- generated/provider assets are tenant-owned and not stale/deleted.

### Interactive QC Repair Queue

QC results must be actionable, not just informational (see spec §16 L2508–2533, §11.6). Each QC result carries a `recommendedRepairs[]` list, and every entry renders as a CLICKABLE repair action rather than static display copy:

- Each `recommendedRepairs[]` entry carries `action` (repair verb/type), `instruction` (human-readable + payload seed for the repair), `autoRunnable` (boolean), and a concrete target (`stage` plus one of `artifactId` / `shot` / `clip` as applicable).
- In the QC panel, warnings/blocks and their recommended repairs are NOT display-only. Clicking a recommended repair opens a repair dialog PRE-FILLED with that entry's `action`, `instruction`, and target (stage / artifactId / shot / clip), so the user submits an already-scoped repair to the repair route without re-entering context.
- `autoRunnable: true` repairs additionally offer a one-click run that submits the prefilled repair immediately. The one-click run stays behind the paid/credit gate whenever the repair triggers paid re-generation (see Repair Job Status And Credit Confirmation below); free re-plan/repair may run without the gate.
- Every recommended repair resolves to a concrete repair entry point (see Repair Reachability below) so no QC-recommended action is a dead end.

### Repair Job Status And Credit Confirmation

Repairs are jobs with observable outcomes and an explicit paid/free distinction (see spec §16 L2508–2533, §11.6):

- A repair-specific status/result surface renders on the repaired target. Repair job status values reuse the provider job lifecycle vocabulary — `queued`, `running`, `succeeded`, `failed`, `timed_out` — shown against the stage/artifactId/shot/clip the repair targeted, so the user sees repair progress in place rather than only a global toast.
- Repair outcomes (succeeded/failed/timed_out) surface the resulting artifact reference or the mapped stable `errorCode` on the target, and a failed/timed_out repair remains repairable.
- Free vs paid repair is explicit:
  - Free repairs (re-plan / prompt or metadata repair that does not call a paid provider) run without a credit confirmation.
  - Paid repairs (re-generation that submits a paid provider job) REQUIRE a credit-estimate confirmation before the job is created. The credit estimate is shown and must be confirmed; declining leaves the target unchanged.
- The credit confirmation for paid repair reuses the same credit-gate the initial paid generation used, so a QC-driven re-generation can never bypass the paid/credit gate.

### Repair Reachability

QC `recommendedRepairs` actions do not implement repair themselves — they route to the concrete per-target repair entry points implemented in the relevant sections, so every QC-recommended action is reachable from the UI:

- start-frame / contact-sheet frame repairs → section-05-character-stock-and-start-frames;
- script / character / story-consistency repairs → section-04-series-memory-and-episode-pipeline;
- clip / motion-prompt / provider-routing repairs → section-06 (clip generation/motion);
- sub-shot repairs (`repair_sub_shot`, `adjust_sub_shot_timing`) → section-06 (clip generation/motion), targeting the parent shot's sub-shot decomposition;
- assembly / export repairs → section-09 (assembly/export).

Sub-shot repair actions `repair_sub_shot` (edit a sub-shot's camera setup / motion prompt / transition) and `adjust_sub_shot_timing` (rebalance durations so they sum to the parent and each meets `minSubShotSeconds`) are reachable per-target repair entry points, so a QC-flagged sub-shot issue is never a dead end.

A recommended repair whose target maps to another section opens that section's repair entry point pre-filled with the QC-provided `action`/`instruction`/target; this section owns the QC-side wiring, not the downstream repair implementation.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator making model, provider, QC, and tie-in decisions.
- Goal: understand why a model/provider is available or blocked and whether tie-ins are safe.
- Entry point: episode provider/QC stage and Storyboard Review metadata.
- Success outcome: user can approve, repair, or switch model without hidden fallback.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Provider model controls | episode workspace | registry-backed model list |
| QC panel | episode workspace | warnings/blocks + clickable prefilled repair actions |
| Repair status surface | episode workspace / repaired target | repair job queued/running/succeeded/failed/timed_out + result on target |
| Tie-in panel | episode workspace | product placement policy |
| Storyboard Review metadata | existing route | provider payload preview and tie-in metadata |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaProviderRoutingService` | server service | model/provider decisions | registry/policy |
| `verticalDramaQcService` | server service | QC reports | stage outputs |
| `verticalDramaProductTieInService` | server service | tie-in plan | product references |
| Provider/QC UI panels | section 03/06 UI | display/actions | routing/QC/tie-in contracts |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | resolver/QC pending state | UI test |
| empty | no model/tie-in selection shows guided control | UI test |
| error | blocked model/claim shows reason and alternatives | unit/UI test |
| success | payload preview and QC pass visible | integration test |
| disabled/focus/hover | paid generate disabled when QC blocks | UI/accessibility test |
| repair-pending | paid repair shows credit-estimate confirm before running | UI test |
| repair-status | repair job status/result renders on the repaired target | UI/integration test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | model selector and QC cards stack | screenshot |
| tablet 768x1024 | payload preview remains scrollable | screenshot |
| desktop 1440x900 | model/QC/tie-in panels fit workspace | screenshot |

### Accessibility Acceptance

- Model incompatibility and QC severity include text labels.
- Payload preview is keyboard accessible and copyable.
- Product compliance warnings are screen-reader friendly.

### Copy Contract

- Copy must say when fallback is recommended versus blocked.
- Tie-in copy must avoid unsupported product claims.

### Browser Evidence Required

Capture compatible model, blocked model, QC failure, and tie-in warning states.

## Tests First

- Test: image model resolver lists every enabled compatible image model and default behavior.
- Test: video model resolver lists every enabled compatible video model.
- Test: aliases resolve for Veo, Omni/Gemini Omni, Seedance, and Grok Imagine variants.
- Test: unsupported model/mode combinations return clear reason codes.
- Test: raw upstream provider statuses `ready`, `blocked`, `fallback_text_to_video`, `manual_review_required`, and `external_provider_required` round-trip separately from app labels.
- Test: provider payload previews redact secrets and signed URL queries.
- Test: first/last-frame bridge is allowed only when capabilities match.
- Test: default bridge profile creates 8 provider jobs from 9 selected frames and preserves the 60-second timing schedule.
- Test: provider job lifecycle covers create, poll, webhook, download/import, cancel, retry, and repair states.
- Test: `openai_sora` and `openai_videos` stay disabled/capability-gated for human-face bridge unless policy changes.
- Test: app-safe `vdflow render-video` equivalent invokes provider job lifecycle only for approved clip requests.
- Test: product tie-in blocks unsupported regulated claims.
- Test: tie-in fatigue history prevents repeated placement.
- Test: QC repair action marks affected stage stale.
- Test: a QC-flagged issue surfaces a clickable repair action prefilled with the recommended `action`, `instruction`, and target (stage/artifactId/shot/clip), wired to the correct repair route/target.
- Test: an `autoRunnable` recommended repair offers one-click run, and the one-click run stays behind the paid/credit gate when the repair triggers paid re-generation.
- Test: repair job status/result (`queued`/`running`/`succeeded`/`failed`/`timed_out`) renders on the repaired target, and a failed/timed_out repair stays repairable.
- Test: a paid repair (re-generation) requires a credit-estimate confirmation before the job is created, and declining leaves the target unchanged.
- Test: a free re-plan/repair runs without a credit confirmation while paid re-generation is gated (free vs paid repair are distinguished).
- Test: each QC `recommendedRepairs` action resolves to a reachable per-target repair entry point (start-frame→section-05, script/character→section-04, clip/motion→section-06, assembly→section-09).
- Test: provider routing goes through a `VerticalDramaVideoProviderAdapter` and `MockVideoProvider` produces deterministic dry-run artifacts without keys.
- Test: `ExternalImageToVideoProvider` is unavailable until explicit tenant/provider config is present.
- Test: a job exceeding its timeout transitions to `timed_out` and is marked repairable; raw provider errors map to stable app error codes.
- Test: fallback duration profile `vertical_drama_60s_9_shots` routes for providers without first/last-frame support.
- Test: with `verticalDramaSeriesSubShots` on and a supporting provider, each main shot emits ordered sub-clip `video_clip_requests` entries carrying `parentShotNumber`/`subShotNumber`, sub-shot durations sum to the parent, and the episode stays 60s/9 shots.
- Test: an unsupported provider degrades sub-shots per `fallbackOnUnsupported` (fewer sub-shots, or collapse to the single parent clip) and records the reason in `provider_feasibility.blocking_reasons` (never silent); with the flag off, routing is unchanged.
- Test: the sub-shot capability gate blocks or reduces sub-shots when the provider cannot do `minSubShotSeconds` durations or the resolved count, and records the blocking reason.
- Test: sub-shot QC catches a bad per-parent duration sum, a sub-shot below `minSubShotSeconds`, and a count above `maxPerShot`, and flags choppy/stretched cut rhythm/identity/continuity breaks.
- Test: `repair_sub_shot` and `adjust_sub_shot_timing` are reachable repair actions from a sub-shot QC issue, targeting the parent shot's decomposition.
- Test: regulated-category tie-in requires human approval before paid generation is allowed.
- Test: tie-in disclosure text is stored separately from the video prompt payload.
- Test: tie-in can be approved, removed, or repaired before Storyboard Review creation, and `productSource` provenance is retained.
- Test: beta defaults resolve to `default_mode = "dry_run"`, `auto_approve_generated_character_refs = false`, and `auto_approve_start_frames = false` for human/product scenes.
- Test: tenant-admin restrictions (allowed providers, max episodes, native audio, regulated categories, prompt-only fallback) are enforced and policy changes are audit logged.
- Test: QC result exposes `score` and `passed`, and a repair queue exists for every failed stage.
- Test: series continuity QC and product tie-in QC run as distinct stages.

## Implementation Tasks

1. Add registry-backed image/video model resolver helpers.
2. Add provider capability matrix and routing outcomes.
3. Add provider request snapshot mapper for `external_image_to_video_request`, `veo31_request`, OpenAI-compatible request skeletons, and Kie-style model payloads.
4. Add provider job lifecycle orchestration for create, poll, webhook, download/import, cancel, retry, and repair.
5. Add app-safe `vdflow render-video` equivalent for approved clip requests.
6. Add QC report service and stage repair actions.
6a. Render `recommendedRepairs[]` as clickable, prefilled repair actions wired to the concrete per-target repair entry points, with a repair job status/result surface on the repaired target and a credit-estimate confirmation gate before any paid re-generation.
7. Add product tie-in planner service and compliance checks.
8. Add policy/audit logging for provider policy, auto-approval, fallback, and product approval changes.
9. Add tests for alias mapping, capability gates, redaction, tie-in compliance, provider lifecycle, and QC stale propagation.

## Acceptance

- Provider fallbacks never happen silently.
- Model lists come from registry/policy, not hard-coded UI branches.
- Product tie-ins are natural, auditable, and removable.
- QC and repair states are visible before Storyboard Review handoff.
- No credentials or signed URLs leak to artifacts or browser JSON.
- No API key, bearer token, signed upload URL, or provider webhook secret is stored in series tables, Storyboard Review metadata, run artifacts, or browser-visible JSON.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaProvider
cd apps/web && pnpm test -- verticalDramaQc
cd apps/web && pnpm check
```

Run focused pytest only if Python provider payload code changes.
