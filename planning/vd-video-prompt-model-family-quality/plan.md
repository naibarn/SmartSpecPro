# VD Video Prompt: Model-Family-Aware, Vision-Grounded Quality Upgrade

Status: IN PROGRESS — 2026-07-21
Owner: naibarndotcom
Prior art: `planning/vd-video-prompt-skill-first/plan.md` (shipped 2026-07-15)

## Problem statement (user request, 2026-07-21)

Per-shot video prompts must become materially higher quality for cinematic
realistic drama, with 6 requirements:

1. **Skill-first + model-family-aware**: prompt design must fit Grok / Veo /
   Seedance, detected from the episode's currently-selected video model.
2. **Multi-shot supported, HARD 2000-char cap** (absolute). Prioritize camera +
   movement; character detail minimal (identity comes from attached start frame
   + reference images). Use LLM VISION on the actual start-frame image to
   assign dialogue by on-screen position ("คนซ้ายพูด… คนขวาพูด…") — the old
   system frequently attributes lines to the wrong speaker. Multi-shot/camera
   proposals must align with the episode/shot synopsis.
3. **UI badge** showing which family the prompt was generated for
   (Grok/Veo/Seedance/Other) + mismatch warning when the selected model changed.
4. When under 2000 chars, add SFX/ambient sound for realism — NEVER music
   (copyright).
5. Camera movement must be emotionally motivated (per-beat emotion → camera
   grammar); state each speaker's emotion explicitly.
6. Clearly better than the current codebase for cinematic series work.

## Current state (mapped 2026-07-21; SocratiCode unavailable → rg/Read fallback)

- Entry: `verticalDramaEpisodes.generateShotVideoPrompt` (router :13405) serves
  BOTH generate and AI-adjust (`instruction`); split path
  `generateAndPersistSplitShotVideoPrompt` (:6420) when subshots flag +
  speaker-switch plan. Persist into `motionPromptPack.clips[]` (jsonb) at
  :14228-14241 (non-split) and :6714 (split) inside row-locked txn.
- Service `verticalDramaVideoMotionPromptGeneration.ts`:
  `generateVerticalDramaShotVideoPrompt` (:1619) + speaker-switch (:2114).
  Skills `vertical-drama-shot-video-prompt[-subshots]/skill.md` load as system
  prompt (lowercase first; identical SKILL.md twins). Zod
  `shotVideoPromptOutputSchema` (:937) lenient parse + one JSON retry
  (`executeVisionAwareJsonCallWithRetry`, first 2000 / retry 4000 tokens;
  speaker-switch 3000/6000).
- Vision already attached when an enabled LLM has supportsVision: start frame
  (first, unlabeled) + ≤3 labeled character portraits + location ref
  (`buildShotVideoPromptVisionImages` :1008). No structured analysis output, no
  validation → wrong-speaker persists.
- Family: `detectProviderFamily` (veo/openai/gemini_omni/generic) render-time
  only, `void`-ed in generator (:1682). `isGrokVideoFamily` modelRegistry:413.
  No seedance classifier. Client has `detectVideoSegmentPromptDialect`
  (seedance/veo/kling/generic — no grok) in shared/videoSegmentPlanner.
- Caps: `VD_VIDEO_PROMPT_MAX = 2000` (shared contracts :1247) enforced
  server-side post-generation via `ensurePromptWithinLimit`
  (verticalDramaPromptQc.ts:351: refine ≤2 passes → sentence-boundary
  truncation; protects dialogue fragments) at router :14092 and :6628. No
  client maxLength. Render-time formatter may append audio → needs final guard
  check.
- SFX: skill `audio_direction` (SFX+ambient, no music/speech) gated on
  nativeAudioEnabled && supportsNativeAudio; non-split generator concatenates
  "SFX cues: …" into prompt (:1828) BEFORE router cap QC. Native-audio rollout
  flag currently off in tests but live for some tenants (UI shows เสียง block).
- Capabilities already threaded: `resolveVerticalDramaCapabilities`
  (supportsStartFrame, maxReferenceImages, nativeAudioDialogue,
  supportsNativeAudio) at router :14087 + service :1649.
- UI: video prompt card = `InlineEditablePromptBox` (Panel:7346; call site
  :4380-4428); clip view type `VerticalDramaMotionPromptClipView` (Panel:553)
  mirrors `contracts.ts:814-899`; selectedVideoModel in scope Panel:1610; copy
  via VD_COPY en+th key-synced; whole-panel jsdom tests OK.

## Design

### D1. Shared family resolver (facts in TS)
New `apps/web/shared/verticalDramaSeries/videoPromptModelFamily.ts`:
- `type VideoPromptModelFamily = "grok" | "veo" | "seedance" | "other"`
- `resolveVideoPromptTargetFamily({ modelId, name?, provider?, configJson? })`
  — pure string tests over modelId+name+provider(+configJson.kieModelId):
  grok first (`hermes_grok`, `grok-imagine`, `grok video 3`…), then veo, then
  seedance; else other (kling → other).
- `videoPromptFamilySupportsNegativePrompt(family)` → grok:false else true.
- Labels map for UI (Grok/Veo/Seedance/Other).
Used by server generation, persist stamping, and client badge/mismatch — one
source of truth. `detectProviderFamily` (render/routing) untouched.

### D2. Prompt contract additions (REQUESTED — avoid taught-not-wired)
Both user-prompt builders emit a new fact block:
```
TARGET VIDEO MODEL (MANDATORY MODEL-FAMILY SHAPING):
- family: veo | grok | seedance | other
- model: "<display name> (<modelId>)"
- negative_prompt_supported: yes|no
- reference_images_accepted: <n>
(native_audio fact stays as today)
```
Zod schema gains optional lenient `frame_analysis`:
```
frame_analysis?: {
  people?: Array<{ name: string; position: string; note?: string }>,
  position_source?: string   // "image" | "image_prompt_text" (lenient)
}
```
Requested from the skill whenever ≥2 established characters. Persist compact
`frameAnalysis` (name+position) on the clip for debugging/UI future use.

### D3. Skill upgrades (creative core — conductor-authored)
`vertical-drama-shot-video-prompt/skill.md` (+ identical SKILL.md) and
`-subshots` twin pair:
- **MODEL-FAMILY SHAPING — MANDATORY** section: per-family guidance —
  - grok: no negative-prompt channel (all constraints positive in prompt), one
    start frame identity, compact action-first prose, native audio verbatim
    dialogue + strong lip-sync cues.
  - veo: verbatim dialogue + "no subtitles/captions/on-screen text" positive
    statement, rich cinematic vocab (single primary move still), SFX/ambient
    tail allowed, never music.
  - seedance: native multi-shot idiom (sequential cut narration), if
    native_audio=no → no transcript in prompt (mouth movement + emotion only;
    dialogue[] for TTS), skip SFX tail on silent models.
  - other: conservative universal defaults.
- **FRAME ANALYSIS FIRST — MANDATORY (vision)**: with attached image + ≥2
  characters: identify each mapped character's ACTUAL on-screen position
  (left/center/right) using the portraits to tell who-is-who; output
  `frame_analysis`; anchor EVERY speech cue by NAME + POSITION as seen in the
  image; image beats prompt-text on conflict (existing rule 12 strengthened
  into a required, checkable output).
- **CAMERA & EMOTION GRAMMAR — MANDATORY**: beat emotion → camera behavior
  (ordinary talk / flirt / cry / anger / fear / shock…), movement always
  motivated by the emotional beat, speaker emotion named at each speech cue.
- **BUDGET DISCIPLINE**: aim ≤1800; priority when tight: speaker/position +
  lip-sync > camera continuation/primary move > emotion texture > atmosphere >
  SFX tail. SFX/ambient only if it fits; NEVER music/score/lyrics anywhere in
  prompt or audio_direction.
- Subshots: segments must trace the authoritative beat arc; per-segment camera
  follows emotion grammar; family idioms for cuts.

### D4. Server wiring
- Service: build + pass family fact block (both builders); extend zod; extend
  compliance retry to also trigger when (≥2 chars, vision on) and
  frame_analysis missing OR quoted lines lack nearby name+position anchor —
  max ONE extra corrective attempt (reuse :1730 pattern), then accept
  (fail-open) + warning. SFX concat at :1828 becomes budget-aware: only append
  what fits ≤2000, core prompt never sacrificed. Bump non-split first-attempt
  maxTokens 2000→2600 (frame_analysis headroom).
- Router: stamp `promptModelTarget: { family, modelId, modelName, generatedAt }`
  + `frameAnalysis` on the clip at BOTH persist sites; include family in
  mutation return; add pack warning when position validation degraded.
- Formatter: verify final provider request ≤2000 after any render-time
  appends; add trim-appended-tiers-first guard if missing.
- Contracts: clip type + optional `promptModelTarget`/`frameAnalysis` (jsonb —
  NO migration).

### D5. Frontend
- Extend `VerticalDramaMotionPromptClipView`; family badge (outline Badge
  pattern, Panel:7409 slot via new optional prop) at video call site :4388;
  amber mismatch line after :4428 comparing stored family vs
  `resolveVideoPromptTargetFamily(selectedVideoModel)`; only render badge when
  metadata exists (pack-generated legacy prompts show nothing). Copy keys in
  VD_COPY en+th. `maxLength` on the shared textarea (uses existing maxChars).
- Testids: `vd-storyboard-video-prompt-${clipKey}-model-family` / `-model-mismatch`.

## Affected files
- apps/web/shared/verticalDramaSeries/videoPromptModelFamily.ts (new) + contracts.ts
- apps/web/skills/vertical-drama-shot-video-prompt/{skill.md,SKILL.md}
- apps/web/skills/vertical-drama-shot-video-prompt-subshots/{skill.md,SKILL.md}
- apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts
- apps/web/server/routers/verticalDramaEpisodes.ts (persist sites + return)
- apps/web/server/services/verticalDramaVideoPromptFormatter.ts (final cap guard)
- apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx
- apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts
- tests: shared resolver unit; service (fact block per family, frame_analysis
  parse, SFX budget, real-skill-file section assertions per taught-not-wired
  memory); router (metadata persisted both paths); formatter cap; panel jsdom
  (badge + mismatch).

## Risks
- Weak-model JSON compliance (cost policy forbids model change): keep
  frame_analysis OPTIONAL + lenient at parse; validation is fail-open with one
  retry; never block generation.
- Concurrent sessions modify VD files (git status shows many dirty files):
  additive edits only; verify before restart; no restart while agents edit.
- Native-audio rollout flag off ⇒ SFX paths must no-op exactly as today.
- Skill size growth ⇒ keep new sections tight; no removal of shipped rules
  (2026-07-15 silent-beat work must stay intact).
- Legacy clips without metadata ⇒ badge hidden, no false claims.

## Phase 2 — Judged quality loop (user-authorized 2026-07-21)

User authorized upgrading the skill beyond plain SKILL.md, including Python +
OpenAI Agents SDK, CONDITIONAL on an honest assessment that it is genuinely
better. Assessment recorded:
- ADOPT: best-of-N + judge + bounded repair loop — clear quality gain
  (variance reduction; catches wrong-position/speaker, rule breaks, family
  misfit before the user sees the prompt). Consistent with existing premium
  quality-loop patterns in this repo.
- REJECT (for this interactive path): Python/OpenAI-Agents-SDK sidecar — the
  loop needs no SDK-unique capability; LLM calls must stay on the Node LLM
  router (credits, audit logs, OpenRouter-primary policy, vision plumbing);
  a cross-service hop adds latency + failure modes to a click-and-wait
  action. FUTURE: Python+SDK worth revisiting for heavyweight BATCH
  regeneration via Celery.

Design:
- K=2 candidates generated in parallel (candidate B gets a variation
  directive to decorrelate), both through the existing generator.
- TS computes a deterministic FACT SHEET per candidate (chars, over-cap,
  verbatim-line coverage/duplication, name+position anchor presence per
  line, music-term hits, veo subtitle-guard presence, transcript-embedded-
  though-silent violations). Facts only — no creative thresholds in TS.
- NEW judge skill `vertical-drama-video-prompt-judge` (llm-only, vision:
  sees the START FRAME to verify each candidate's frame_analysis/position
  claims): returns `{winner_index, verdict: accept|repair, scores[],
  repair_instruction?}`. Rubric lives in the skill.
- verdict=repair → ONE repair pass on the winner via the existing
  `repair_instruction` mechanism; hard-fact re-check (cap/coverage) decides
  winner-vs-repaired mechanically; never more than 1 repair (cost bound).
- Fail-open: judge failure → candidate A; one candidate failure → survivor.
- Applies to BOTH non-split and speaker-switch paths; default ON for the
  per-shot generate + AI-adjust mutation (paid action), `qualityLoop:
  false` input escape hatch. Persist compact
  `promptQuality: { mode, candidates, verdict, repaired }` on the clip.
- Total ≤4 LLM calls/click (2 gen ∥ + 1 judge + ≤1 repair).

## Out of scope (recorded)
- Pack bulk generator (`vertical-drama-video-motion-prompt-pack`) family
  shaping — per-shot regenerate is the quality path; note for follow-up.
- Multi-model vision retry harness swap (marketplace pattern) — existing
  executeWithFallback + vision-off warning suffice for now.
- Python/OpenAI-Agents-SDK batch regeneration worker (assessment above).

## Verification
1. `pnpm check` (accept pre-existing baseline errors only) + targeted vitest:
   the 4 video-prompt suites + new tests, panel tests.
2. Real-skill-file gate: tests read actual skill.md and assert the new section
   headers + frame_analysis contract exist (both case twins identical).
3. Manual: regenerate shot 3 of series 21 ep 114 → badge shows family of the
   selected model; prompt ≤2000; position-anchored speech cues present.
4. Deploy: `npm run build:deploy`; restart smartspec-web only after all agents
   done (server/*.ts changed).

## Progress
- [x] Discovery (backend + frontend maps)
- [x] Plan written
- [x] Skills authored (conductor) — both skill.md+SKILL.md twins updated
      (v1.1.0 / v2.1.0): FRAME ANALYSIS FIRST + frame_analysis contract,
      MODEL-FAMILY SHAPING (grok/veo/seedance/other), CAMERA & EMOTION
      GRAMMAR, rule-8 budget priority (aim ≤1800), no-music rule
- [x] Shared resolver created (conductor):
      shared/verticalDramaSeries/videoPromptModelFamily.ts
- [x] Backend implementation (ssp-backend) — fact block both builders,
      lenient frame_analysis schema, shared corrective retry (verbatim +
      position anchors, ≤1 extra LLM pass), SFX budget guard, formatter
      final-cap guard (drops audio tail only), promptModelTarget +
      frameAnalysis stamped at both persist sites + mutation return.
      BONUS: fixed pre-existing missing `runVisionAwareJsonAttempt` import
      that silently killed ALL corrective retries since the 07-15 ship.
- [x] Frontend implementation (ssp-frontend) — family badge + amber
      mismatch warning + maxLength cap guard + copy keys (en/th) + 3/3 new
      jsdom tests.
- [x] Wave-1 verification (conductor) — service 45/45, formatter 34/34,
      pack 81/81, resolver 13/13, real-file gate 12/12, stamping router
      tests pass. Router-suite failures (32+8) proven IDENTICAL at clean
      HEAD (pre-existing fixture debt from the fail-closed model guard —
      spawned follow-up task chip); start-frame suite (18/18 at HEAD)
      broken on the working tree by ANOTHER session's in-flight
      tenancy/location hunks — not touched by this work.
- [x] Phase 2: judged quality loop — judge skill authored (conductor) +
      wired (ssp-backend): K=2 parallel candidates, deterministic fact
      sheet, vision judge, ≤1 repair, mechanical hard-fact pick, 4-call
      hard bound, fail-open, qualityLoop:false escape hatch,
      promptQuality persisted at both sites.
- [x] Final verification (conductor, 2026-07-22): 211 tests green across
      7 suites (judged 9/9, shot-prompt 45/45, real-file gate 18/18,
      formatter 34/34, resolver 13/13, badge 3/3, speakerSubShots 8/8,
      pack 81/81); both router stamping tests pass with promptQuality;
      tsc error set byte-identical to baseline (152 pre-existing).
- [x] `npm run build:deploy` — atomic swap done, FRONTEND LIVE.
- [ ] `sudo systemctl restart smartspec-web.service` — REQUIRED for the
      server-side changes (family fact block, judged loop, persistence).
      Conductor's restart attempt was blocked by the permission
      classifier; user must run it. Pre-checked safe: module imports
      cleanly under vitest, tsc baseline unchanged, no migration.
      NOTE: the restart also activates another session's in-flight
      verticalDramaEpisodes.ts tenancy/location hunks already on disk
      (their start-frame router tests fail only on db-mock gaps, not
      runtime logic).
- [x] Memory updated (project_vd_video_prompt_judged_loop.md)
