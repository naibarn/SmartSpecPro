# Orchestra Plan

## Task
Audit the Vertical Drama Series feature (series detail page + wizard + episode
pipeline) against its specs (`specs/feature/131-vertical-drama-series-storyboard-video-flow/`)
and report what's missing/incomplete, covering 6 user-raised points:
1. Overview tab shows story broken out by episode, but a separate "ตอน" (Episodes)
   tab already exists — clarify the intended relationship (merge vs. keep separate)
   per spec, and whether current UI is confusing.
2. What is "ไบเบิล" (Story Bible)? Explain the concept, current implementation
   status, and gaps vs. spec.
3. BUG: characters set in the wizard's Characters step before clicking "create"
   don't appear to carry over to the created series — arrives empty, forcing
   re-entry. Root-cause and fix if scope is small/clear.
4. Are the last 3 Series Detail tabs (Product tie-in, Assets, Settings) fully
   implemented, or still empty placeholders?
5. Is per-episode "generate storyboard" implemented anywhere?
6. Is character reference-image generation implemented anywhere?

## Task Classification
- Scope: medium
- Risk: low (primarily read-only audit; one embedded bug fix only if root cause is small/clear and single-file)
- Affected domains: CMD-1 Frontend (CreateSeriesWizard, VerticalDramaSeriesDetailPage, VerticalDramaEpisodeWorkspace), CMD-2 Backend (verticalDramaSeries router, verticalDramaStoryBible service), specs (section-03, section-10, section-11, spec.md)
- Estimated file count: 10-15 (read-heavy investigation across wizard, detail page tabs, episode workspace, story bible service, contracts, spec sections)
- Chosen route: multi-agent-waves (parallel read-only investigation), bug sub-tree applied to item 3 only if findings confirm a small clear-root-cause bug
- Bug route: partial (item 3 only)
- Classification notes: This is fundamentally an audit/gap-analysis deliverable spanning
  frontend+backend+specs, not new feature construction — 6 largely independent
  investigative questions map cleanly to parallel read-only Explore agents. Only item 3
  (character carryover) may warrant an actual code fix this round, gated on root-cause
  clarity per CLAUDE.md's Debugging Protocol (already used successfully earlier this
  session for the wizard-reset bug). Items 4-6 are expected to reveal large unbuilt
  features (storyboard generation, character image generation) — those get reported with
  status + recommended next steps, not built in this pass, per the Implementation Planning
  Protocol (new feature = requires its own plan + approval).
- dispatch_preference: parallel (claude-code platform, Task tool available)
- planned_agents: 4 Explore/research agents in Wave 1 (grouped by topic affinity), 
  1 potential ssp-debugger/ssp-frontend fix agent in Wave 2 for item 3 only if warranted

## Scope Expansion (2026-07-04, same session) — build out full backlog + new episode-continuation feature

User approved: "ทำตามที่แนะนำ ทำต่อให้ครบ" (implement the recommended backlog fully) plus a new
explicit feature: an "Add episode" action that reads existing episode/bible data and generates
new episodes continuing the same story, repeatable indefinitely.

## Task Classification (revised)
- Scope: large (spans 3 stub tabs + 2 new paid-generation features + 1 new continuation feature,
  10+ files across frontend/backend, touches existing paid-LLM pattern)
- Risk: medium (new paid LLM/credit-gated procedures mirroring existing generateStoryBible pattern;
  no auth/schema changes — all backing tables/services already exist per Wave 1 audit)
- Affected domains: CMD-1 Frontend, CMD-2 Backend
- Chosen route: multi-agent-waves (sequenced, not deep-plan-chain — every backend hook already
  exists per Wave 1 audit findings, this is wiring/completion work with clear existing patterns
  to mirror, not novel architecture)
- Bug route: false

## Additional grounding (found via direct inspection before dispatch)
- `createEpisode` mutation ALREADY EXISTS (apps/web/server/routers/verticalDramaEpisodes.ts:172-238)
  — safe max+1 episode numbering, idempotency key support. The "Add episode" button in
  EpisodesTab (VerticalDramaSeriesDetailPage.tsx:266-271) is currently `disabled` with
  "coming soon" copy — it was never wired to this existing mutation.
- User's ask requires MORE than calling createEpisode directly: a NEW LLM-backed procedure that
  reads bible (mainPlot/seasonArc/tone/refinedCharacters/cliffhangerStyle) + existing episodes,
  generates N continuation episodes via LLM (mirroring generateStoryBible's credit-gated pattern:
  hasEnoughCredits -> selectBestLlmModel -> executeWithFallback -> zod validate -> deductCredits),
  then inserts real episode rows (reusing createEpisode's safe-numbering insert logic) with
  generated content in `script` jsonb — not empty shells.
- Assets ledger tables ALREADY EXIST, unused: `verticalDramaRunArtifacts` (schema.ts:12982,
  per-stage jsonPayload + mediaAssetIds) and `verticalDramaCharacterAssets` (schema.ts:12893,
  approved/qcStatus/checksumSha256). Just need a read procedure + UI, no migration.
- `verticalDramaSeries.updateSeries` and `productTieIn`/`policy` jsonb columns already exist
  (schema.ts:12837-12858) — Settings/Product tabs just need UI + (for productTieIn) an edit path,
  since `updateSeries` today only patches title/status/bible/policy (confirmed by Wave 1 agent-C),
  not productTieIn — needs a small procedure extension.

## Wave plan
- Wave 3 (parallel, contract pre-frozen below): backend agent adds `updateSeriesSettings`-style
  patch support for productTieIn + a new `listSeriesAssets` query; frontend agent replaces the 3
  PlaceholderTab branches with real Settings/Product/Assets tab components consuming them.
- Wave 4: episode-continuation feature (new `generateNextEpisodes` mutation + wire "Add episode"
  button) — backend-heavy, frontend wiring is small (enable button, call mutation, show loading).
- Wave 5: storyboard generation (replace `buildStoryboard` placeholder with real LLM call,
  mirroring generateStoryBible/generateNextEpisodes pattern).
- Wave 6: character reference-image generation (new credit-gated image-generation procedure,
  writes into existing `verticalDramaCharacterAssets` table with `source: "generated"`).
