/**
 * Tenant-scoped feature flags for gating Claw features.
 *
 * Stored in tenants.featureFlags (JSON column).
 * Most flags default to true — features are enabled by default unless
 * explicitly gated off for rollout or safety.
 */
export interface TenantFeatureFlags {
  multiChannel: boolean; // F01 — Multi-channel adapters
  chatWidget: boolean; // F02 — Embeddable chat widget
  browserTool: boolean; // F03 — Browser automation tool
  canvas: boolean; // F04 — Canvas / AI artifacts
  voiceChat: boolean; // F05 — Voice chat mode
  webhookTriggers: boolean; // F06 — Inbound webhook triggers
  costDisplay: boolean; // F07 — Per-response cost display
  personaSystem: boolean; // F08 — AI persona system
  crossAgency: boolean; // F09 — Cross-agency communication
  channelRouter: boolean; // F10 — Channel routing rules
  automationCopilot: boolean; // F11 — Automation Copilot (LLM-driven browser tasks)
  liveBrowser: boolean; // F12 — Live Browser workspace and gateway
  responsesApi: boolean; // F13 — Responses API gateway (OpenAI-compatible)
  taskPlannerEnabled: boolean; // F14 — Task Planner (active model selection via task execution planner)
  taskPlannerAgencyEscalation: boolean; // F15 — Agency escalation via planner
  chatBrowserSessionEntry: boolean; // F16 — Chat Browser Session entrypoints and reopen flows
  agencyBrowserSessionUi: boolean; // F17 — Agency Builder and Agency Chat Browser Session UI
  workflowBrowserSessionNodes: boolean; // F18 — Workflow collaborative Browser Session nodes
  publicApi: boolean; // F19 — Public API & External Agent Gateway
  multimodalMemory: boolean; // F20 — Multimodal chat memory (image analysis, embedding, retrieval)
  skillOrchestrator: boolean; // F21 — Hybrid Skill Orchestrator (multi-skill routing)
  orchestratorEnabled: boolean; // F22 — Virtual AI Office Orchestrator (team rooms, runs, scoped memory)
  notificationDedupEnabled: boolean; // F23 — Notification deduplication with grouping
  notificationPreferencesEnabled: boolean; // F24 — Per-category notification preferences
  notificationEscalationEnabled: boolean; // F25 — Escalation policies for critical notifications
  notificationUnifiedCenter: boolean; // F26 — Unified notification center admin dashboard
  notificationEmailDelivery: boolean; // F27 — Email delivery channel for notifications
  notificationWebhookDelivery: boolean; // F28 — Webhook delivery channel for notifications
  unifiedSkillExecution: boolean; // F29 — Unified skill execution pipeline (routes chat + team room through single orchestrator)
  agencyCustomTools: boolean; // F30 — Agency custom tool creation & OpenAPI import
  agencyGuardrails: boolean; // F31 — Agency guardrail system
  agencyStreaming: boolean; // F32 — Agency SSE streaming
  agencyMcpBridge: boolean; // F33 — Agency MCP bridge integration
  agencyToolApi: boolean; // F34 — Agency standalone tool API
  agencyAgenticModeEnabled: boolean; // F35 — Agency agentic execution mode (Level 1)
  agencyReactExecutorEnabled: boolean; // F36 — Agency ReAct executor (Level 2)
  agencyAutonomousAgentEnabled: boolean; // F37 — Agency autonomous agent (Level 3)
  agencyLongTermMemoryEnabled: boolean; // F38 — Agency long-term memory (Level 3)
  META_CHANNELS_ENABLED: boolean; // F39 — Meta Channels feature set
  mcpServerRegistry: boolean; // F40 — MCP Server Registry (centralized management)
  mcpStdio: boolean; // F41 — MCP stdio transport (subprocess-based servers)
  mcpOAuth: boolean; // F42 — MCP OAuth 2.1 authentication
  mcpModernProtocolEnabled: boolean; // F146 — modern MCP 2026-07-28 transport
  mcpLegacyCompatibilityEnabled: boolean; // F146 — legacy MCP compatibility transport
  mcpResourcesEnabled: boolean; // F146 — documentation resources/list/read
  mcpGuideToolAliasesEnabled: boolean; // F146 — guide aliases over canonical tools
  mcpOAuthProtectedResourceEnabled: boolean; // F146 — inbound OAuth PRM/challenge metadata
  mcpOAuthAuthorizationServerEnabled: boolean; // F147 — first-party MCP OAuth authorization server
  mcpOAuthDynamicRegistrationEnabled: boolean; // F147 — RFC 7591 client registration
  mcpOAuthCimdEnabled: boolean; // F147 — client ID metadata documents (kept separate from DCR)
  mcpModernStatelessLegacyFallbackEnabled: boolean; // F146 — explicit modern fallback policy
  mcpTasksEnabled: boolean; // F146 — future task vocabulary (not Phase 1)
  mcpSubscriptionsEnabled: boolean; // F146 — future subscription transport (not Phase 1)
  mcpLegacyBroadScopeCompatibilityEnabled: boolean; // F146 — temporary audited legacy scope bridge
  UPLOAD_POST_GATEWAY_ENABLED: boolean; // F43 — Upload-Post Universal Gateway
  chatAutoModelSelection: boolean; // F44 — Chat Auto/Provider-Auto model selection
  localClientLlmMode: boolean; // F45 — Local / Client LLM mode
  openClawExternalRuntime: boolean; // F46 — OpenClaw external worker runtime control plane
  desktopZeroClawWorker: boolean; // F47 — Desktop + ZeroClaw managed worker runtime
  nemoClawSecureWorkerPool: boolean; // F48 — NemoClaw secure worker pools
  hiClawClusterRuntime: boolean; // F49 — HiClaw collaborative cluster runtime
  hermesAgentRuntime: boolean; // F50 — Hermes bridge-backed external runtime foundation
  hermesMediaWorker: boolean; // F135 — Hermes Grok media worker; unrelated to hermesAgentRuntime
  remotionDedicatedExecutorEnabled: boolean; // F145 — standalone Hermes/Remotion executor rollout gate
  marketplaceSequentialStoryboard: boolean; // F136 — sequential 9-image storyboard strategy for Marketplace Auto Review
  marketplaceReviewEvidenceGuard: boolean; // F136 — shared evidence guards (assembly/guardian/claims) for BOTH review modes
  marketplaceStagedSequentialStoryboardV2: boolean; // F141 — staged two-skill storyboard pipeline with mandatory human checkpoints
  marketplaceStagedSequentialStoryboardLiveSmoke: boolean; // F141 — capped live-smoke route for staged storyboard verification
  desktopHostEnabled: boolean; // F51 — Unified Desktop Host control plane
  desktopAdvancedLocalMode: boolean; // F52 — Step-up desktop local power
  desktopPackageSync: boolean; // F53 — Signed desktop package sync and materialization
  desktopAgencyRuntime: boolean; // F54 — Desktop Agency Swarm runtime enablement
  desktopWorkerProjection: boolean; // F55 — Desktop Host projection into worker fabric
  agencyHybridAdk: boolean; // F56 — Hybrid Agency Runtime with Google ADK compile/runtime surfaces
  agencyHybridAdkKillSwitch: boolean; // F57 — Operational kill switch for Agency Hybrid ADK paths
  workpacksEnabled: boolean; // F58 — Autonomous workpack intake, lifecycle, and control-plane surfaces
  workpackAutonomousPilot: boolean; // F59 — Tenant rollout gate for autonomous workpack execution
  workpackOpsConsole: boolean; // F60 — Admin monitoring and readiness controls for workpacks
  documentOcrExternalProcessing: boolean; // F61 — Allow outbound document OCR processing (ADE / gateway)
  hermesProfileExperience: boolean; // F62 — Hermes persona/profile summaries in teams and admin views
  hermesChannelWorkflowExpansion: boolean; // F63 — Hermes channel companion workflow surfaces
  hermesMemoryContextSync: boolean; // F64 — Hermes opt-in memory/context sync surfaces
  hermesTaskModes: boolean; // F65 — Hermes task mode summaries and work-mode mapping
  hermesVisibilitySummaries: boolean; // F66 — Hermes progress and observability summaries
  agentRegistryEnabled: boolean; // F67 — Governed agent registry surface and rollout gates
  openAiAgentsRuntimeEnabled: boolean; // F68 — Shared OpenAI Agents SDK runtime master gate
  openAiAgentsRuntimeChatShadow: boolean; // F69 — Chat shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeTeamShadow: boolean; // F70 — Team shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeChatActive: boolean; // F71 — Chat active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeTeamActive: boolean; // F72 — Team active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeResponsesShadow: boolean; // F73 — Responses shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeResponsesActive: boolean; // F74 — Responses active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeSkillShadow: boolean; // F75 — Shared skill shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeSkillActive: boolean; // F76 — Shared skill active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeForceRollback: boolean; // F77 — Force new runtime selections back to legacy
  voiceAgents: boolean; // F78 — ElevenLabs ElevenAgents Chat runtime and admin surface
  geminiOmniSuiteEnabled: boolean; // F79 — Gemini Omni suite UX and validation
  geminiOmniAssetCreationEnabled: boolean; // F80 — Gemini Omni Character/Audio provider asset creation
  geminiOmniPromptQaEnabled: boolean; // F81 — Gemini Omni pre-generation prompt QA
  geminiOmniVideoQaEnabled: boolean; // F82 — Gemini Omni post-generation video QA
  geminiOmniAutoLearningEnabled: boolean; // F83 — Gemini Omni QA learning recommendations
  mediaProductionDirectorEnabled: boolean; // F84 — Media Studio Production/Director command center
  mediaProductionGoalCanvasEnabled: boolean; // F85 — Visual ProductionGoal planning canvas
  mediaProductionStoryboardPlannerEnabled: boolean; // F86 — Production Storyboard Planner skill gate
  mediaProductionPlanVerifierEnabled: boolean; // F87 — Production Plan Verifier skill gate
  mediaProductionDualOutputEnabled: boolean; // F88 — Storyboard Review and Video Edit output projections
  mediaProductionAgencyReviewersEnabled: boolean; // F89 — Optional Agency reviewer packs
  mediaProductionLangGraphBatchEnabled: boolean; // F90 — Optional LangGraph checkpointed batch runtime
  marketplaceHyperframesEnabled: boolean; // F91 — Marketplace Capture Auto Storyboard Review HyperFrames adapter
  marketplaceHyperframesWorkerEnabled: boolean; // F92 — Tenant-scoped HyperFrames worker queueing
  hyperframesWorkerFinalComposite: boolean; // F92A — Worker-only HyperFrames final composite rendering
  marketplaceHyperframesLibrarySaveEnabled: boolean; // F93 — Save completed HyperFrames renders to Library
  marketplaceHyperframesOperatorEnabled: boolean; // F94 — Delegated HyperFrames operator controls
  storyboardPreviewMatchCaptureEnabled: boolean; // F94A — Preview-match browser capture master gate
  storyboardPreviewMatchCaptureServerWorkerEnabled: boolean; // F94B — Preview-match capture server worker
  storyboardPreviewMatchCaptureHighEnabled: boolean; // F94C — Preview-match capture high-quality output
  storyboardClientCaptureExperimentEnabled: boolean; // F94D — Experimental client capture gate
  marketplaceConnectorLabEnabled: boolean; // F129 — Marketplace Connector Lab and browser authorization discovery UI
  marketplaceIntelligenceImportsEnabled: boolean; // F129A — Persist connector-derived field samples and search snapshots
  marketplaceKeywordDiscoveryEnabled: boolean; // F129B — Keyword/category discovery clustering and refresh
  marketplaceIntelligenceReportsEnabled: boolean; // F129C — Deterministic marketplace intelligence report generation
  marketplaceReportImageSkillsEnabled: boolean; // F129D — Report-specific image prompt skill handoff
  marketplaceIntelligenceShareableImageEnabled: boolean; // F129E — Shareable image export records for marketplace reports
  marketplaceIntelligenceWatchlistsEnabled: boolean; // F129F — Keyword/seller/brand/SKU watchlists and change events
  marketplaceIntelligenceMcpWritesEnabled: boolean; // F129G — MCP write tools for marketplace intelligence ingestion/report creation
  mcpConnectEnabled: boolean; // F95 — MCP Connect master rollout gate
  mcpConnectMagnificEnabled: boolean; // F96 — Magnific MCP provider rollout gate
  mcpConnectHiggsfieldEnabled: boolean; // F97 — Higgsfield MCP provider rollout gate
  mcpConnectGroupSharingEnabled: boolean; // F98 — MCP Connect group sharing rollout gate
  mcpMediaStudioEnabled: boolean; // F99 — Media Studio MCP transport surface gate
  mcpAutoStoryboardReviewEnabled: boolean; // F100 — Auto Storyboard Review MCP transport surface gate
  mcpMarketplaceCaptureEnabled: boolean; // F101 — Marketplace Capture MCP transport surface gate
  mcpStoryboardReviewEnabled: boolean; // F102 — Storyboard Review MCP transport surface gate
  mcpMediaImageEnabled: boolean; // F103 — MCP image generation asset gate
  mcpMediaVideoEnabled: boolean; // F104 — MCP video generation asset gate
  mcpToolSchemaCacheEnabled: boolean; // F105 — MCP tools/list schema cache gate
  mcpAutoFallbackToGatewayApiEnabled: boolean; // F106 — Explicit MCP to Gateway API fallback gate
  mcpProviderCreditsTrackedEnabled: boolean; // F107 — MCP provider-credit usage tracking gate
  videoSegmentPlannerShadow: boolean; // F108 — Video segment planner shadow metadata
  videoSegmentPlannerPerShot: boolean; // F109 — Per-shot segment planner handoff
  videoSegmentPlannerPreview: boolean; // F110 — Backend video segment preview summaries
  videoSegmentPlannerMultiShotBeta: boolean; // F111 — Tenant/model gated multi-shot video segments
  agentExperienceLayer: boolean; // F112 — Agent Experience canonical protocol and adapter layer
  agentExperienceShadowMode: boolean; // F113 — Observe Agent Experience adapters without visible UI changes
  agentExperienceAgencyPreview: boolean; // F114 — Fixture/live-gated Agency Agent Experience preview
  agentExperienceTeamPreview: boolean; // F115 — Fixture/live-gated Team Agent Experience preview
  agentExperienceChatPreview: boolean; // F116 — Fixture/live-gated Chat Agent Experience preview
  agentExperienceRuntypeRenderer: boolean; // F117 — Optional Runtype renderer bridge after dependency gate
  agentExperienceDebugInspector: boolean; // F118 — Permission-gated Agent Experience debug inspector
  agentExperienceForceRollback: boolean; // F119 — Force-disable all Agent Experience behavior
  agentExperienceWebsiteWidget: boolean; // F120 — Future customer website widget gate
  agentExperiencePageActions: boolean; // F121 — Future customer page action tools gate
  presentationArticleStoryboardVideo: boolean; // F127 — Article to Storyboard Review video project output
  presentationArticleStoryboardVideoPreview: boolean; // F127A — Builder preview for article video handoff
  presentationArticleStoryboardVideoOverlay: boolean; // F127B — CSS text overlay metadata for article video shots
  presentationArticleStoryboardVideoReferenceFrames: boolean; // F127C — 3x3 scene reference candidates
  presentationArticleStoryboardVideoCharacterReferences: boolean; // F127D — Character reference image attachments
  presentationArticleStoryboardVideoSeedancePrompt: boolean; // F127E — Seedance multi-shot prompt adapter
  presentationArticleStoryboardVideoVoiceScript: boolean; // F127F — Article storytelling voice script skill
  presentationArticleStoryboardVideoUvoiceVoiceover: boolean; // F127G — UVoice premium voiceover path
  presentationArticleStoryboardVideoElevenLabsDialogue: boolean; // F127H — ElevenLabs dialogue-capable voice route
  presentationArticleStoryboardVideoNativeAudio: boolean; // F127I — Native video speech/audio strategy
  presentationArticleStoryboardVideoNativeAudioPromptComposer: boolean; // F127J — Native-audio video prompt composer
  ageSafetyPolicyEnabled: boolean; // F128 — Central age-aware safety policy master gate
  ageSafetyObserveMode: boolean; // F128A — Audit would-block decisions without blocking
  ageSafetyProfileCompletionGate: boolean; // F128B — Require DOB/country completion after login
  ageSafetyChatEnforcement: boolean; // F128C — Enforce age policy on chat prompt/output paths
  ageSafetyMediaEnforcement: boolean; // F128D — Enforce age policy on media prompt/job paths
  ageSafetyProtectedSurfaceUnlock: boolean; // F128E — Security PIN protected-surface unlock
  ageSafetyGeneratedAssetViewerPolicy: boolean; // F128F — Viewer-time generated asset policy
  ageSafetyEmergencyChildSafeMode: boolean; // F128G — Force child-safe behavior across protected surfaces
  verticalDramaSeries: boolean; // F131 — Vertical Drama Series master gate (Dashboard workspace)
  verticalDramaSeriesDashboardMenu: boolean; // F131A — Gated Dashboard menu entry for Vertical Drama Series
  verticalDramaSeriesSkillChain: boolean; // F131B — Vertical drama skill-chain execution
  verticalDramaSeriesCharacterStock: boolean; // F131C — Series character stock + visual bible surfaces
  verticalDramaSeriesMemory: boolean; // F131D — Series memory summary/seed surfaces
  verticalDramaSeriesProductTieIn: boolean; // F131E — Product tie-in configuration surfaces
  verticalDramaSeriesStartFrames: boolean; // F131F — Start-frame render/plan surfaces
  verticalDramaSeriesFirstLastFrameBridge: boolean; // F131G — First/last frame bridge motion mode
  verticalDramaSeriesStoryboardReviewHandoff: boolean; // F131H — Storyboard Review project handoff
  verticalDramaSeriesProviderRouting: boolean; // F131I — Provider routing selection for series stages
  verticalDramaSeriesQcRepair: boolean; // F131J — QC + repair loop surfaces
  verticalDramaSeriesDialogueAudio: boolean; // F131K — Dialogue/audio planning surfaces
  verticalDramaSeriesSubtitles: boolean; // F131L — Subtitle planning surfaces
  verticalDramaSeriesSubShots: boolean; // F131M — Opt-in sub-shot decomposition editor (fail-closed)
  verticalDramaSeriesSpeechBudget: boolean; // F131N — §7.7 density-first planning + coverage gates (fail-closed)
  verticalDramaSeriesArcReplan: boolean; // F131O — §7.7.3 arc drift detection + re-plan proposals (fail-closed)
  verticalDramaSeriesQualityLoopV2: boolean; // F131P — §16.1 scorecard v2 + bounded auto-improve loop (fail-closed)
  verticalDramaSeriesTieInQc: boolean; // F131Q — §13.1 tie-in naturalness QC gates (fail-closed)
  verticalDramaSeriesProductionWizard: boolean; // F131R — §8.8 guided production wizard (fail-closed)
  verticalDramaSeriesPresetMixV2: boolean; // F131S — §8.2.2 preset visual identity + verifiable blending (fail-closed)
  verticalDramaSeriesLookLock: boolean; // F139 — series-level visual look lock (default-on, tenant opt-out)
  verticalDramaMotionContracts: boolean; // F137 — structured per-shot motion contracts (default-on, tenant opt-out)
  verticalDramaSceneContinuity: boolean; // F138 P1a — persisted scene continuity state (default-on, tenant opt-out)
  verticalDramaSceneContinuityQc: boolean; // F138 P2 — shared advisory frame continuity QC (requires scene continuity; default-on)
  verticalDramaVideoSafeStartFrames: boolean; // F137 P2 — advisory video-safety QC and dual-role start-frame anchors (default-on)
  verticalDramaClipIdentityQc: boolean; // F137 P3 — sampled post-video identity QC (default-on)
  verticalDramaSceneNeighborAnchors: boolean; // F138 P1b — neighboring-scene anchor references; requires scene continuity (default-on)
  verticalDramaSeriesDeepStoryDrafts: boolean; // F131T — deep story drafts: chunked bible-stage 9-shot speakable dialogue drafts for every planned episode (fail-closed)
  verticalDramaSeriesVoiceChain: boolean; // F131U — per-character voice casting, voice catalog + paid preview, whole-episode dialogue TTS batch, audio timeline handoff (fail-closed)
  verticalDramaSeriesStoryLock: boolean; // F131V — story lock: story is finalized on the series Overview; episode-level improve/repair may change EXECUTION only, never story content (mechanically enforced, fail-closed)
  verticalDramaSeriesAdBannerOverlay: boolean; // F131W — ad banner overlay: series-level banner design studio (style/placement presets, prompt + image generation) composited over episode video, separate from in-story product tie-in (fail-closed)
  verticalDramaSeriesFormatProfiles: boolean; // F131X — length-aware format profiles: ultra-short (≤5 ep) / short (6-12) tiers tune deep-draft density prompts, per-episode cold-open hook rule, dramaturgy critic thresholds, premium judge hook floor (fail-closed)
  verticalDramaSeriesTieInReplan: boolean; // F131Y — tie-in defer → real arc replan: tieIn placement field on season-plan items, defer creates a deterministic VD_ARC_TIE_IN_DEFERRED move proposal via the propose→approve→apply chain (fail-closed)
  verticalDramaSeriesCharacterRefV2: boolean; // F131Z — character visual-identity consistency option A: send a SECOND identity-lock reference image per character (the stored character-sheet turnaround/full asset, alongside the primary portrait) into start-frame image generation, zero provider cost (fail-closed)
  verticalDramaSeriesShareLinks: boolean; // F131AA — Collab-lite L1: owner-created, expiring, revocable read-only share links to a whitelisted story-content projection of the series, no account/login required to view (fail-closed)
  verticalDramaSeriesTextOverlaySuite: boolean; // F131AB — Text Overlay Suite: end-card teaser/opener recap/title bumper/episode indicator/character intro cards/mid-episode cards + series watermark, all rendered through the existing ASS subtitle channel + a dedicated top-most watermark overlay input (fail-closed)
  verticalDramaSeriesNativeAudioPrompts: boolean; // F131AC — native audio direction in shot video prompts: SFX cues tied to visible actions (primary) + ambient soundscape (secondary) for video models with supportsNativeAudio; hard rules: no speech/voices, no music — 3-layer audio architecture layer 1 (fail-closed)
  verticalDramaSeriesLineage: boolean; // planning/vd-series-memory-and-lineage/plan.md Part 2 — season 2/sequel + special-edition create modes: parentSeriesId/createMode/seasonNumber/lineage columns, season carry-over planner, clone-on-create cast/location roster (fail-closed; gates the wizard UI + the create/proposeSeasonCarryOver lineage BRANCH only — never the underlying schema read path)
  verticalDramaUserPremise: boolean; // F132A — spec 132 §4 user premise field + premise-primary synthesis (fail-closed)
  verticalDramaQualityLedgers: boolean; // F132B — spec 132 §5 ledgers + story state + deterministic checks (fail-closed)
  verticalDramaSceneContracts: boolean; // F132C — spec 132 §6 scene contracts in drafts/pipeline validation (fail-closed)
  verticalDramaMultiPassQc: boolean; // F132D — spec 132 §7-8 dialogue rules v2 + multi-pass critique + scorecard v3 (fail-closed)
  verticalDramaTargetedRevisionV2: boolean; // F132E — spec 132 §9 shot-scoped revision + revision plan (fail-closed)
  verticalDramaCharacterProfiles: boolean; // F132F — spec 132 §7.3/§10.1 structured personality/speech profiles (fail-closed)
  verticalDramaCharacterVisualQuality: boolean; // F132G — spec 132 §10.2-10.7 persisted bible, expression set, image QC, consistency ledger (fail-closed)
  verticalDramaContinuityContracts: boolean; // F132H — spec 132 §8.2 causal chain / hook-to-opening enforcement (fail-closed)
  verticalDramaAngleGridQuality: boolean; // F132I — spec 132 §19 structured 9-angle schema, diversity/coverage rules, best-angle scoring rubric (fail-closed)
  verticalDramaRetentionHooks: boolean; // planning/vertical-drama-retention-hooks/plan.md — 12-principle hook/open-loop/retention-loop upgrade: genre-conditional retention-loop guidance in script-builder + shotgrid (W1-W3), deterministic retention facts fed to quality-review (W4/W6, scorecard v4/contract_version 4), and hook/retention-ending motion energy in the video-prompt layer (W7) (fail-closed)
  marketplaceRemotionRendererEnabled: boolean; // F132J — planning/remotion-migration/plan.md — Marketplace Auto-Review render engine: opt in to the Remotion renderer instead of HyperFrames (default off, per-tenant rollout). Now redundant since Remotion is the default engine, but left in place for backward compat — harmless if left on.
  marketplaceHyperframesRendererForced: boolean; // F132K — planning/remotion-migration/plan.md §7 (Phase 6) — Marketplace Auto-Review render engine: per-tenant rollback lever that forces HyperFrames even though Remotion is now the default engine (default off, independent of the global RENDERER_ENGINE env var kill-switch)
  videoIntelligencePlatformEnabled: boolean; // F133A — specs/feature/133-content-video-intelligence-platform — Video Intelligence Platform entry point (Catalog/Motion Video Studio routes + videoProjects router gate), default off
  remotionRenderVideoJobEnabled: boolean; // F133B — specs/feature/133-content-video-intelligence-platform §5 — queueRemotionRenderVideoJob dispatch gate (Lane A in-process Remotion render worker), default off
  videoIntelligenceCatalogStudioEnabled: boolean; // F133C — specs/feature/133-content-video-intelligence-platform §10 — Catalog Video Studio surface (product-seeded video projects), default off
  videoIntelligenceMotionStudioEnabled: boolean; // F133-motion — specs/feature/133-content-video-intelligence-platform §10 — Motion Studio surface (blank/template-seeded video projects), default off
}

export type TenantFeatureFlagKey = keyof TenantFeatureFlags;

/**
 * Server-side allowlist of valid feature flag keys.
 * Used for validation — any keys not in this set are stripped before saving.
 */
export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<TenantFeatureFlagKey>([
  "multiChannel",
  "chatWidget",
  "browserTool",
  "canvas",
  "voiceChat",
  "webhookTriggers",
  "costDisplay",
  "personaSystem",
  "crossAgency",
  "channelRouter",
  "automationCopilot",
  "liveBrowser",
  "responsesApi",
  "taskPlannerEnabled",
  "taskPlannerAgencyEscalation",
  "chatBrowserSessionEntry",
  "agencyBrowserSessionUi",
  "workflowBrowserSessionNodes",
  "publicApi",
  "multimodalMemory",
  "skillOrchestrator",
  "orchestratorEnabled",
  "notificationDedupEnabled",
  "notificationPreferencesEnabled",
  "notificationEscalationEnabled",
  "notificationUnifiedCenter",
  "notificationEmailDelivery",
  "notificationWebhookDelivery",
  "unifiedSkillExecution",
  "agencyCustomTools",
  "agencyGuardrails",
  "agencyStreaming",
  "agencyMcpBridge",
  "agencyToolApi",
  "agencyAgenticModeEnabled",
  "agencyReactExecutorEnabled",
  "agencyAutonomousAgentEnabled",
  "agencyLongTermMemoryEnabled",
  "META_CHANNELS_ENABLED",
  "mcpServerRegistry",
  "mcpStdio",
  "mcpOAuth",
  "mcpModernProtocolEnabled",
  "mcpLegacyCompatibilityEnabled",
  "mcpResourcesEnabled",
  "mcpGuideToolAliasesEnabled",
  "mcpOAuthProtectedResourceEnabled",
  "mcpOAuthAuthorizationServerEnabled",
  "mcpOAuthDynamicRegistrationEnabled",
  "mcpOAuthCimdEnabled",
  "mcpModernStatelessLegacyFallbackEnabled",
  "mcpTasksEnabled",
  "mcpSubscriptionsEnabled",
  "mcpLegacyBroadScopeCompatibilityEnabled",
  "UPLOAD_POST_GATEWAY_ENABLED",
  "chatAutoModelSelection",
  "localClientLlmMode",
  "openClawExternalRuntime",
  "desktopZeroClawWorker",
  "nemoClawSecureWorkerPool",
  "hiClawClusterRuntime",
  "hermesAgentRuntime",
  "hermesMediaWorker",
  "remotionDedicatedExecutorEnabled",
  "marketplaceSequentialStoryboard",
  "marketplaceReviewEvidenceGuard",
  "marketplaceStagedSequentialStoryboardV2",
  "marketplaceStagedSequentialStoryboardLiveSmoke",
  "desktopHostEnabled",
  "desktopAdvancedLocalMode",
  "desktopPackageSync",
  "desktopAgencyRuntime",
  "desktopWorkerProjection",
  "agencyHybridAdk",
  "agencyHybridAdkKillSwitch",
  "workpacksEnabled",
  "workpackAutonomousPilot",
  "workpackOpsConsole",
  "documentOcrExternalProcessing",
  "hermesProfileExperience",
  "hermesChannelWorkflowExpansion",
  "hermesMemoryContextSync",
  "hermesTaskModes",
  "hermesVisibilitySummaries",
  "agentRegistryEnabled",
  "openAiAgentsRuntimeEnabled",
  "openAiAgentsRuntimeChatShadow",
  "openAiAgentsRuntimeTeamShadow",
  "openAiAgentsRuntimeChatActive",
  "openAiAgentsRuntimeTeamActive",
  "openAiAgentsRuntimeResponsesShadow",
  "openAiAgentsRuntimeResponsesActive",
  "openAiAgentsRuntimeSkillShadow",
  "openAiAgentsRuntimeSkillActive",
  "openAiAgentsRuntimeForceRollback",
  "voiceAgents",
  "geminiOmniSuiteEnabled",
  "geminiOmniAssetCreationEnabled",
  "geminiOmniPromptQaEnabled",
  "geminiOmniVideoQaEnabled",
  "geminiOmniAutoLearningEnabled",
  "mediaProductionDirectorEnabled",
  "mediaProductionGoalCanvasEnabled",
  "mediaProductionStoryboardPlannerEnabled",
  "mediaProductionPlanVerifierEnabled",
  "mediaProductionDualOutputEnabled",
  "mediaProductionAgencyReviewersEnabled",
  "mediaProductionLangGraphBatchEnabled",
  "marketplaceHyperframesEnabled",
  "marketplaceHyperframesWorkerEnabled",
  "hyperframesWorkerFinalComposite",
  "marketplaceHyperframesLibrarySaveEnabled",
  "marketplaceHyperframesOperatorEnabled",
  "marketplaceRemotionRendererEnabled",
  "marketplaceHyperframesRendererForced",
  "videoIntelligencePlatformEnabled",
  "remotionRenderVideoJobEnabled",
  "videoIntelligenceCatalogStudioEnabled",
  "videoIntelligenceMotionStudioEnabled",
  "storyboardPreviewMatchCaptureEnabled",
  "storyboardPreviewMatchCaptureServerWorkerEnabled",
  "storyboardPreviewMatchCaptureHighEnabled",
  "storyboardClientCaptureExperimentEnabled",
  "marketplaceConnectorLabEnabled",
  "marketplaceIntelligenceImportsEnabled",
  "marketplaceKeywordDiscoveryEnabled",
  "marketplaceIntelligenceReportsEnabled",
  "marketplaceReportImageSkillsEnabled",
  "marketplaceIntelligenceShareableImageEnabled",
  "marketplaceIntelligenceWatchlistsEnabled",
  "marketplaceIntelligenceMcpWritesEnabled",
  "mcpConnectEnabled",
  "mcpConnectMagnificEnabled",
  "mcpConnectHiggsfieldEnabled",
  "mcpConnectGroupSharingEnabled",
  "mcpMediaStudioEnabled",
  "mcpAutoStoryboardReviewEnabled",
  "mcpMarketplaceCaptureEnabled",
  "mcpStoryboardReviewEnabled",
  "mcpMediaImageEnabled",
  "mcpMediaVideoEnabled",
  "mcpToolSchemaCacheEnabled",
  "mcpAutoFallbackToGatewayApiEnabled",
  "mcpProviderCreditsTrackedEnabled",
  "videoSegmentPlannerShadow",
  "videoSegmentPlannerPerShot",
  "videoSegmentPlannerPreview",
  "videoSegmentPlannerMultiShotBeta",
  "agentExperienceLayer",
  "agentExperienceShadowMode",
  "agentExperienceAgencyPreview",
  "agentExperienceTeamPreview",
  "agentExperienceChatPreview",
  "agentExperienceRuntypeRenderer",
  "agentExperienceDebugInspector",
  "agentExperienceForceRollback",
  "agentExperienceWebsiteWidget",
  "agentExperiencePageActions",
  "presentationArticleStoryboardVideo",
  "presentationArticleStoryboardVideoPreview",
  "presentationArticleStoryboardVideoOverlay",
  "presentationArticleStoryboardVideoReferenceFrames",
  "presentationArticleStoryboardVideoCharacterReferences",
  "presentationArticleStoryboardVideoSeedancePrompt",
  "presentationArticleStoryboardVideoVoiceScript",
  "presentationArticleStoryboardVideoUvoiceVoiceover",
  "presentationArticleStoryboardVideoElevenLabsDialogue",
  "presentationArticleStoryboardVideoNativeAudio",
  "presentationArticleStoryboardVideoNativeAudioPromptComposer",
  "ageSafetyPolicyEnabled",
  "ageSafetyObserveMode",
  "ageSafetyProfileCompletionGate",
  "ageSafetyChatEnforcement",
  "ageSafetyMediaEnforcement",
  "ageSafetyProtectedSurfaceUnlock",
  "ageSafetyGeneratedAssetViewerPolicy",
  "ageSafetyEmergencyChildSafeMode",
  "verticalDramaSeries",
  "verticalDramaSeriesDashboardMenu",
  "verticalDramaSeriesSkillChain",
  "verticalDramaSeriesCharacterStock",
  "verticalDramaSeriesMemory",
  "verticalDramaSeriesProductTieIn",
  "verticalDramaSeriesStartFrames",
  "verticalDramaSeriesFirstLastFrameBridge",
  "verticalDramaSeriesStoryboardReviewHandoff",
  "verticalDramaSeriesProviderRouting",
  "verticalDramaSeriesQcRepair",
  "verticalDramaSeriesDialogueAudio",
  "verticalDramaSeriesSubtitles",
  "verticalDramaSeriesSubShots",
  "verticalDramaSeriesSpeechBudget",
  "verticalDramaSeriesArcReplan",
  "verticalDramaSeriesQualityLoopV2",
  "verticalDramaSeriesTieInQc",
  "verticalDramaSeriesProductionWizard",
  "verticalDramaSeriesPresetMixV2",
  "verticalDramaSeriesLookLock",
  "verticalDramaMotionContracts",
  "verticalDramaSceneContinuity",
  "verticalDramaSceneContinuityQc",
  "verticalDramaVideoSafeStartFrames",
  "verticalDramaClipIdentityQc",
  "verticalDramaSceneNeighborAnchors",
  "verticalDramaSeriesDeepStoryDrafts",
  "verticalDramaSeriesVoiceChain",
  "verticalDramaSeriesStoryLock",
  "verticalDramaSeriesAdBannerOverlay",
  "verticalDramaSeriesFormatProfiles",
  "verticalDramaSeriesTieInReplan",
  "verticalDramaSeriesCharacterRefV2",
  "verticalDramaSeriesShareLinks",
  "verticalDramaSeriesTextOverlaySuite",
  "verticalDramaSeriesNativeAudioPrompts",
  "verticalDramaSeriesLineage",
  "verticalDramaUserPremise",
  "verticalDramaQualityLedgers",
  "verticalDramaSceneContracts",
  "verticalDramaMultiPassQc",
  "verticalDramaTargetedRevisionV2",
  "verticalDramaCharacterProfiles",
  "verticalDramaCharacterVisualQuality",
  "verticalDramaContinuityContracts",
  "verticalDramaAngleGridQuality",
  "verticalDramaRetentionHooks",
]);

/**
 * Default values for each feature flag.
 * Most flags default to true, but rollout- or infrastructure-sensitive
 * capabilities can stay false until explicitly enabled per tenant.
 */
export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
  multiChannel: true,
  chatWidget: true,
  browserTool: true,
  canvas: true,
  voiceChat: true,
  webhookTriggers: true,
  costDisplay: true,
  personaSystem: true,
  crossAgency: true,
  channelRouter: true,
  automationCopilot: true,
  liveBrowser: true,
  responsesApi: true,
  taskPlannerEnabled: true,
  taskPlannerAgencyEscalation: true,
  chatBrowserSessionEntry: true,
  agencyBrowserSessionUi: true,
  workflowBrowserSessionNodes: true,
  publicApi: true,
  multimodalMemory: true,
  skillOrchestrator: true,
  orchestratorEnabled: true,
  notificationDedupEnabled: true,
  notificationPreferencesEnabled: true,
  notificationEscalationEnabled: true,
  notificationUnifiedCenter: true,
  notificationEmailDelivery: true,
  notificationWebhookDelivery: true,
  unifiedSkillExecution: true,
  agencyCustomTools: true,
  agencyGuardrails: true,
  agencyStreaming: true,
  agencyMcpBridge: true,
  agencyToolApi: true,
  agencyAgenticModeEnabled: true,
  agencyReactExecutorEnabled: true,
  agencyAutonomousAgentEnabled: true,
  agencyLongTermMemoryEnabled: true,
  META_CHANNELS_ENABLED: true,
  mcpServerRegistry: true,
  mcpStdio: false,  // Requires OpenSandbox — keep disabled by default
  mcpOAuth: false,  // Requires Express callback route — keep disabled until wired
  mcpModernProtocolEnabled: false, // F146 — enable only after modern protocol/security gates
  mcpLegacyCompatibilityEnabled: true, // F146 — preserve deployed clients during migration
  mcpResourcesEnabled: false, // F146 — docs resources require explicit tenant rollout
  mcpGuideToolAliasesEnabled: false, // F146 — aliases require explicit tenant rollout
  mcpOAuthProtectedResourceEnabled: false, // F146 — requires real issuer/JWKS deployment config
  mcpOAuthAuthorizationServerEnabled: false, // F147 — requires asymmetric signing keys and consent routes
  mcpOAuthDynamicRegistrationEnabled: false, // F147 — enable only after redirect validation is deployed
  mcpOAuthCimdEnabled: false, // F147 — optional CIMD is disabled until separately reviewed
  mcpModernStatelessLegacyFallbackEnabled: false, // F146 — no implicit protocol fallback
  mcpTasksEnabled: false, // F146 — tasks are not implemented in Phase 1
  mcpSubscriptionsEnabled: false, // F146 — subscriptions are not implemented in Phase 1
  mcpLegacyBroadScopeCompatibilityEnabled: true, // F146 — temporary compatibility, audit every use
  UPLOAD_POST_GATEWAY_ENABLED: false, // Requires Upload-Post connection + consent flow
  chatAutoModelSelection: true, // Enabled by default; admin can still disable per tenant if needed
  localClientLlmMode: false, // Rollout-gated until local runtime paths are explicitly enabled per tenant
  openClawExternalRuntime: false, // External worker control plane ships disabled until tenant enablement
  desktopZeroClawWorker: false, // Desktop worker host remains tenant-gated until runtime/profile support is ready
  nemoClawSecureWorkerPool: false, // Secure sandbox pools are explicitly admin-gated
  hiClawClusterRuntime: false, // Collaborative cluster runtime is explicitly admin-gated
  hermesAgentRuntime: false, // Hermes bridge-backed runtime stays disabled until rollout and policy surfaces are ready
  hermesMediaWorker: false, // F135 — Hermes Grok media worker stays disabled until rollout is ready (unrelated to hermesAgentRuntime)
  remotionDedicatedExecutorEnabled: false, // F145 — dedicated executor remains dark until native/security proof passes
  marketplaceSequentialStoryboard: false, // F136 — sequential 9-image storyboard strategy stays dark until section rollout completes
  marketplaceReviewEvidenceGuard: false, // F136 — shared evidence guards (assembly/guardian/claims) stay dark until section rollout completes
  marketplaceStagedSequentialStoryboardV2: false, // F141 — staged checkpoint pipeline stays dark until no-spend/live-smoke proof completes
  marketplaceStagedSequentialStoryboardLiveSmoke: false, // F141 — live smoke requires explicit operator enablement
  desktopHostEnabled: false, // Desktop Host control plane rollout is explicit and fail-closed
  desktopAdvancedLocalMode: false, // High-power local mode requires explicit tenant opt-in
  desktopPackageSync: false, // Signed package sync stays disabled until registry/policy is ready
  desktopAgencyRuntime: false, // Desktop agency runtime stays disabled until gateway enforcement lands
  desktopWorkerProjection: false, // Desktop Host only joins worker fabric when explicitly enabled
  agencyHybridAdk: false, // Hybrid Agency Runtime is explicit opt-in while ADK integration remains rollout-gated
  agencyHybridAdkKillSwitch: false, // Kill switch defaults open but stays available for incident response
  workpacksEnabled: true, // Workpack authoring ships on by default for first-party tenants
  workpackAutonomousPilot: false, // Autonomous execution remains rollout-gated until readiness evidence exists
  workpackOpsConsole: true, // Admin monitoring surfaces can render workpack readiness immediately
  documentOcrExternalProcessing: false, // External document OCR stays tenant-gated by default
  hermesProfileExperience: false, // Hermes persona/profile summaries stay rollout-gated until tenant admins opt in
  hermesChannelWorkflowExpansion: false, // Hermes channel workflow expansion stays off until revoke/reauthorize behavior is ready
  hermesMemoryContextSync: false, // Hermes memory/context sync stays off until approval and quarantine semantics are ready
  hermesTaskModes: false, // Hermes task mode summaries stay rollout-gated until operator surfaces are ready
  hermesVisibilitySummaries: false, // Hermes visibility summaries stay admin-gated until rollout evidence exists
  agentRegistryEnabled: false, // Governed registry rollout remains tenant opt-in until staged adoption is ready
  openAiAgentsRuntimeEnabled: false, // Shared OpenAI Agents SDK runtime stays disabled until replay and rollout gates pass
  openAiAgentsRuntimeChatShadow: false, // Chat shadow stays off until adapter and comparison traces are ready
  openAiAgentsRuntimeTeamShadow: false, // Team shadow stays off until plan/ledger parity is verified
  openAiAgentsRuntimeChatActive: false, // Chat active stays off until shadow parity is proven
  openAiAgentsRuntimeTeamActive: false, // Team active stays off until plan execution and review loops are verified
  openAiAgentsRuntimeResponsesShadow: false, // Responses shadow stays off until schema parity is verified
  openAiAgentsRuntimeResponsesActive: false, // Responses active stays off until structured-call parity is verified
  openAiAgentsRuntimeSkillShadow: false, // Shared skill shadow stays off until manifest-driven selection is ready
  openAiAgentsRuntimeSkillActive: false, // Shared skill active stays off until typed caller contracts are proven
  openAiAgentsRuntimeForceRollback: false, // Rollback remains available but disabled by default
  voiceAgents: false, // ElevenAgents runtime stays tenant-gated until security and rollout evidence passes
  geminiOmniSuiteEnabled: false, // Feature 114 ships behind explicit tenant rollout
  geminiOmniAssetCreationEnabled: false, // Provider asset creation stays internal/admin gated first
  geminiOmniPromptQaEnabled: false, // Enable after skill contract verification
  geminiOmniVideoQaEnabled: false, // Enable after post-generation QA loop is wired
  geminiOmniAutoLearningEnabled: false, // Recommendations stay off until sample thresholds exist
  mediaProductionDirectorEnabled: false, // Director stays off until persistence/planner/verifier gates pass
  mediaProductionGoalCanvasEnabled: false, // Planning preview can be enabled separately
  mediaProductionStoryboardPlannerEnabled: false,
  mediaProductionPlanVerifierEnabled: false,
  mediaProductionDualOutputEnabled: false,
  mediaProductionAgencyReviewersEnabled: false,
  mediaProductionLangGraphBatchEnabled: false,
  marketplaceHyperframesEnabled: false,
  marketplaceHyperframesWorkerEnabled: false,
  hyperframesWorkerFinalComposite: false,
  marketplaceHyperframesLibrarySaveEnabled: false,
  marketplaceHyperframesOperatorEnabled: false,
  marketplaceRemotionRendererEnabled: false,
  marketplaceHyperframesRendererForced: false,
  videoIntelligencePlatformEnabled: false,
  remotionRenderVideoJobEnabled: false,
  videoIntelligenceCatalogStudioEnabled: false,
  videoIntelligenceMotionStudioEnabled: false,
  storyboardPreviewMatchCaptureEnabled: false,
  storyboardPreviewMatchCaptureServerWorkerEnabled: false,
  storyboardPreviewMatchCaptureHighEnabled: false,
  storyboardClientCaptureExperimentEnabled: false,
  marketplaceConnectorLabEnabled: false,
  marketplaceIntelligenceImportsEnabled: false,
  marketplaceKeywordDiscoveryEnabled: false,
  marketplaceIntelligenceReportsEnabled: false,
  marketplaceReportImageSkillsEnabled: false,
  marketplaceIntelligenceShareableImageEnabled: false,
  marketplaceIntelligenceWatchlistsEnabled: false,
  marketplaceIntelligenceMcpWritesEnabled: false,
  mcpConnectEnabled: false,
  mcpConnectMagnificEnabled: false,
  mcpConnectHiggsfieldEnabled: false,
  mcpConnectGroupSharingEnabled: false,
  mcpMediaStudioEnabled: false,
  mcpAutoStoryboardReviewEnabled: false,
  mcpMarketplaceCaptureEnabled: false,
  mcpStoryboardReviewEnabled: false,
  mcpMediaImageEnabled: false,
  mcpMediaVideoEnabled: false,
  mcpToolSchemaCacheEnabled: false,
  mcpAutoFallbackToGatewayApiEnabled: false,
  mcpProviderCreditsTrackedEnabled: false,
  videoSegmentPlannerShadow: true,
  videoSegmentPlannerPerShot: true,
  videoSegmentPlannerPreview: false,
  videoSegmentPlannerMultiShotBeta: false,
  agentExperienceLayer: false,
  agentExperienceShadowMode: false,
  agentExperienceAgencyPreview: false,
  agentExperienceTeamPreview: false,
  agentExperienceChatPreview: false,
  agentExperienceRuntypeRenderer: false,
  agentExperienceDebugInspector: false,
  agentExperienceForceRollback: false,
  agentExperienceWebsiteWidget: false,
  agentExperiencePageActions: false,
  presentationArticleStoryboardVideo: false,
  presentationArticleStoryboardVideoPreview: false,
  presentationArticleStoryboardVideoOverlay: false,
  presentationArticleStoryboardVideoReferenceFrames: false,
  presentationArticleStoryboardVideoCharacterReferences: false,
  presentationArticleStoryboardVideoSeedancePrompt: false,
  presentationArticleStoryboardVideoVoiceScript: false,
  presentationArticleStoryboardVideoUvoiceVoiceover: false,
  presentationArticleStoryboardVideoElevenLabsDialogue: false,
  presentationArticleStoryboardVideoNativeAudio: false,
  presentationArticleStoryboardVideoNativeAudioPromptComposer: false,
  ageSafetyPolicyEnabled: false,
  ageSafetyObserveMode: false,
  ageSafetyProfileCompletionGate: false,
  ageSafetyChatEnforcement: false,
  ageSafetyMediaEnforcement: false,
  ageSafetyProtectedSurfaceUnlock: false,
  ageSafetyGeneratedAssetViewerPolicy: false,
  ageSafetyEmergencyChildSafeMode: false,
  // Vertical Drama Series (F131) — unfinished capabilities remain rollout-gated;
  // completed Feature 137/138/139 consistency paths are enabled below.
  verticalDramaSeries: false,
  verticalDramaSeriesDashboardMenu: false,
  verticalDramaSeriesSkillChain: false,
  verticalDramaSeriesCharacterStock: false,
  verticalDramaSeriesMemory: false,
  verticalDramaSeriesProductTieIn: false,
  verticalDramaSeriesStartFrames: false,
  verticalDramaSeriesFirstLastFrameBridge: false,
  verticalDramaSeriesStoryboardReviewHandoff: false,
  verticalDramaSeriesProviderRouting: false,
  verticalDramaSeriesQcRepair: false,
  verticalDramaSeriesDialogueAudio: false,
  verticalDramaSeriesSubtitles: false,
  verticalDramaSeriesSubShots: false,
  verticalDramaSeriesSpeechBudget: false,
  verticalDramaSeriesArcReplan: false,
  verticalDramaSeriesQualityLoopV2: false,
  verticalDramaSeriesTieInQc: false,
  verticalDramaSeriesProductionWizard: false,
  verticalDramaSeriesPresetMixV2: false,
  verticalDramaSeriesLookLock: true,
  verticalDramaMotionContracts: true,
  verticalDramaSceneContinuity: true,
  verticalDramaSceneContinuityQc: true,
  verticalDramaVideoSafeStartFrames: true,
  verticalDramaClipIdentityQc: true,
  verticalDramaSceneNeighborAnchors: true,
  verticalDramaSeriesDeepStoryDrafts: false,
  verticalDramaSeriesVoiceChain: false,
  verticalDramaSeriesStoryLock: false,
  verticalDramaSeriesAdBannerOverlay: false,
  verticalDramaSeriesFormatProfiles: false,
  verticalDramaSeriesTieInReplan: false,
  verticalDramaSeriesCharacterRefV2: false,
  verticalDramaSeriesShareLinks: false,
  verticalDramaSeriesTextOverlaySuite: false,
  verticalDramaSeriesNativeAudioPrompts: true,
  verticalDramaSeriesLineage: false,
  verticalDramaUserPremise: false,
  verticalDramaQualityLedgers: false,
  verticalDramaSceneContracts: false,
  verticalDramaMultiPassQc: false,
  verticalDramaTargetedRevisionV2: false,
  verticalDramaCharacterProfiles: false,
  verticalDramaCharacterVisualQuality: false,
  verticalDramaContinuityContracts: false,
  verticalDramaAngleGridQuality: false,
  verticalDramaRetentionHooks: false,
};

export const AGE_SAFETY_FEATURE_FLAG_KEYS = [
  "ageSafetyPolicyEnabled",
  "ageSafetyObserveMode",
  "ageSafetyProfileCompletionGate",
  "ageSafetyChatEnforcement",
  "ageSafetyMediaEnforcement",
  "ageSafetyProtectedSurfaceUnlock",
  "ageSafetyGeneratedAssetViewerPolicy",
  "ageSafetyEmergencyChildSafeMode",
] as const satisfies readonly TenantFeatureFlagKey[];

export type AgeSafetyFeatureFlagKey = (typeof AGE_SAFETY_FEATURE_FLAG_KEYS)[number];

export function areAgeSafetyFeatureFlagsRegistered(): boolean {
  return AGE_SAFETY_FEATURE_FLAG_KEYS.every(
    (key) => ALLOWED_FEATURE_FLAGS.has(key) && FEATURE_FLAG_DEFAULTS[key] === false,
  );
}

/* -------------------------------------------------------------------------- */
/* Vertical Drama Series feature flags (F131, spec feature 131 §section-03)   */
/* -------------------------------------------------------------------------- */

/**
 * Canonical source-spec flag names for Vertical Drama Series. These are the
 * authoritative names used by permissions, menu state, router guards, and
 * rollout docs. Individual rollout-sensitive flags may still default OFF;
 * the completed 137/138/139 visual-consistency flags are enabled by default.
 */
export const VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS = [
  "verticalDramaSeries",
  "verticalDramaSeriesDashboardMenu",
  "verticalDramaSeriesSkillChain",
  "verticalDramaSeriesCharacterStock",
  "verticalDramaSeriesMemory",
  "verticalDramaSeriesProductTieIn",
  "verticalDramaSeriesStartFrames",
  "verticalDramaSeriesFirstLastFrameBridge",
  "verticalDramaSeriesStoryboardReviewHandoff",
  "verticalDramaSeriesProviderRouting",
  "verticalDramaSeriesQcRepair",
  "verticalDramaSeriesDialogueAudio",
  "verticalDramaSeriesSubtitles",
  "verticalDramaSeriesSubShots",
  "verticalDramaSeriesSpeechBudget",
  "verticalDramaSeriesArcReplan",
  "verticalDramaSeriesQualityLoopV2",
  "verticalDramaSeriesTieInQc",
  "verticalDramaSeriesProductionWizard",
  "verticalDramaSeriesPresetMixV2",
  "verticalDramaSeriesLookLock",
  "verticalDramaMotionContracts",
  "verticalDramaSceneContinuity",
  "verticalDramaSceneContinuityQc",
  "verticalDramaVideoSafeStartFrames",
  "verticalDramaClipIdentityQc",
  "verticalDramaSceneNeighborAnchors",
  "verticalDramaSeriesDeepStoryDrafts",
  "verticalDramaSeriesVoiceChain",
  "verticalDramaSeriesStoryLock",
  "verticalDramaSeriesAdBannerOverlay",
  "verticalDramaSeriesFormatProfiles",
  "verticalDramaSeriesTieInReplan",
  "verticalDramaSeriesCharacterRefV2",
  "verticalDramaSeriesShareLinks",
  "verticalDramaSeriesTextOverlaySuite",
  "verticalDramaSeriesNativeAudioPrompts",
  "verticalDramaSeriesLineage",
] as const satisfies readonly TenantFeatureFlagKey[];

export type VerticalDramaSeriesFeatureFlagKey =
  (typeof VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS)[number];

/** Independent rollout switches shared by Features 137, 138, and 139. */
export const VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS = [
  "verticalDramaSeriesLookLock",
  "verticalDramaMotionContracts",
  "verticalDramaSceneContinuity",
  "verticalDramaSceneContinuityQc",
  "verticalDramaSceneNeighborAnchors",
] as const satisfies readonly TenantFeatureFlagKey[];

export type VerticalDramaVisualConsistencyFlagKey =
  (typeof VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS)[number];

export function areVerticalDramaVisualConsistencyFlagsRegistered(): boolean {
  return VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS.every(
    (key) => ALLOWED_FEATURE_FLAGS.has(key) && typeof FEATURE_FLAG_DEFAULTS[key] === "boolean",
  );
}

export interface ResolvedVerticalDramaVisualConsistencyFlags {
  seriesLookLock: boolean;
  motionContracts: boolean;
  sceneContinuity: boolean;
  sceneContinuityQc: boolean;
  sceneNeighborAnchors: boolean;
  neighborConfigurationInvalid: boolean;
}

/**
 * Resolves the four rollout switches without mutating tenant configuration.
 * Neighbor anchors fail closed unless their Scene Continuity parent is on.
 */
export function resolveVerticalDramaVisualConsistencyFlags(
  flags: Partial<TenantFeatureFlags> | null | undefined,
): ResolvedVerticalDramaVisualConsistencyFlags {
  const sceneContinuity = flags?.verticalDramaSceneContinuity === true;
  const sceneContinuityQc = sceneContinuity && flags?.verticalDramaSceneContinuityQc === true;
  const neighborRequested = flags?.verticalDramaSceneNeighborAnchors === true;

  return {
    seriesLookLock: flags?.verticalDramaSeriesLookLock === true,
    motionContracts: flags?.verticalDramaMotionContracts === true,
    sceneContinuity,
    sceneContinuityQc,
    sceneNeighborAnchors: sceneContinuity && neighborRequested,
    neighborConfigurationInvalid: neighborRequested && !sceneContinuity,
  };
}

/**
 * One-way alias mapping: any legacy/local runtime alias -> its canonical
 * source-spec flag key. This is the single place that reconciles alternative
 * names (e.g. `verticalDramaSeriesEnabled`) so permissions, menu state, router
 * guards, and rollout docs cannot drift from the canonical names. The mapping
 * is one-way (alias -> canonical) only; canonical names never map to aliases.
 */
export const VERTICAL_DRAMA_SERIES_FEATURE_FLAG_ALIASES: Readonly<
  Record<string, VerticalDramaSeriesFeatureFlagKey>
> = {
  // Common "*Enabled" suffix convention seen elsewhere in this file.
  verticalDramaSeriesEnabled: "verticalDramaSeries",
  verticalDramaSeriesMenu: "verticalDramaSeriesDashboardMenu",
  verticalDramaSeriesDashboardMenuEnabled: "verticalDramaSeriesDashboardMenu",
  verticalDramaSeriesSubShotsEnabled: "verticalDramaSeriesSubShots",
};

/**
 * Resolves a canonical Vertical Drama Series flag key from any known alias.
 * Canonical names pass through unchanged; unknown names return `null`.
 */
export function resolveVerticalDramaSeriesFeatureFlagKey(
  name: string,
): VerticalDramaSeriesFeatureFlagKey | null {
  if ((VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS as readonly string[]).includes(name)) {
    return name as VerticalDramaSeriesFeatureFlagKey;
  }
  return VERTICAL_DRAMA_SERIES_FEATURE_FLAG_ALIASES[name] ?? null;
}

/**
 * True when every canonical Vertical Drama Series flag is registered in the
 * allowlist with a boolean default. Defaults are intentionally mixed:
 * completed 137/138/139 consistency paths are on, while unfinished
 * Vertical Drama capabilities remain off.
 */
export function areVerticalDramaSeriesFeatureFlagsRegistered(): boolean {
  return VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS.every(
    (key) => ALLOWED_FEATURE_FLAGS.has(key) && typeof FEATURE_FLAG_DEFAULTS[key] === "boolean",
  );
}

/**
 * Canonical flag names for the Feature 132 Vertical Drama Story & Character
 * Quality Engine (F132A-I; spec
 * `specs/feature/132-vertical-drama-story-character-quality-engine/spec.md`
 * §12, section-01-shared-criteria-and-flags.md). All default OFF
 * (fail-closed) — the entire quality-engine upgrade ships dark until
 * explicitly enabled per tenant. No alias map is needed: no legacy names
 * exist for these flags.
 */
export const VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS = [
  "verticalDramaUserPremise",
  "verticalDramaQualityLedgers",
  "verticalDramaSceneContracts",
  "verticalDramaMultiPassQc",
  "verticalDramaTargetedRevisionV2",
  "verticalDramaCharacterProfiles",
  "verticalDramaCharacterVisualQuality",
  "verticalDramaContinuityContracts",
  "verticalDramaAngleGridQuality",
] as const satisfies readonly TenantFeatureFlagKey[];

export type VerticalDramaQualityEngineFeatureFlagKey =
  (typeof VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS)[number];

/**
 * True when every canonical Feature 132 quality-engine flag is registered in
 * the allowlist and defaults OFF (fail-closed). Used by rollout-safety
 * tests — this is the assertion surface for the flag-default snapshot test
 * (spec §16.5 "Flag-off = current behavior").
 */
export function areVerticalDramaQualityEngineFeatureFlagsRegistered(): boolean {
  return VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS.every(
    (key) => ALLOWED_FEATURE_FLAGS.has(key) && FEATURE_FLAG_DEFAULTS[key] === false,
  );
}

export type HermesRolloutSurface =
  | "disabled"
  | "registration"
  | "bound_dispatch"
  | "delegated_mcp"
  | "channel_companion";

export interface HermesRolloutReadinessInput {
  featureFlags: Pick<TenantFeatureFlags, "hermesAgentRuntime">;
  bridgeCapabilities?: {
    apiServerEnabled?: boolean | null;
    supportsDelegatedHttp?: boolean | null;
    supportsDelegatedMcp?: boolean | null;
    supportsBoundConnector?: boolean | null;
    supportsCallbacks?: boolean | null;
    gatewayPlatforms?: string[] | null;
  };
  remoteEndpointPolicyExceptionId?: string | null;
}

export interface HermesRolloutReadiness {
  parentGateEnabled: boolean;
  surfaces: {
    registration: boolean;
    boundDispatch: boolean;
    delegatedMcp: boolean;
    channelCompanion: boolean;
  };
  highestEnabledSurface: HermesRolloutSurface;
  remoteEndpointPolicy: "loopback_only" | "audited_exception_granted";
}

export function evaluateHermesRolloutReadiness(
  input: HermesRolloutReadinessInput,
): HermesRolloutReadiness {
  const parentGateEnabled = input.featureFlags.hermesAgentRuntime === true;
  const bridgeCapabilities = input.bridgeCapabilities ?? {};
  const sanitizedGatewayPlatforms = Array.isArray(bridgeCapabilities.gatewayPlatforms)
    ? bridgeCapabilities.gatewayPlatforms.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
    : [];

  const registration = parentGateEnabled;
  const boundDispatch = registration
    && bridgeCapabilities.apiServerEnabled === true
    && bridgeCapabilities.supportsDelegatedHttp === true
    && bridgeCapabilities.supportsBoundConnector === true;
  const delegatedMcp = boundDispatch && bridgeCapabilities.supportsDelegatedMcp === true;
  const channelCompanion = boundDispatch
    && bridgeCapabilities.supportsCallbacks === true
    && sanitizedGatewayPlatforms.length > 0;

  const highestEnabledSurface: HermesRolloutSurface = !registration
    ? "disabled"
    : channelCompanion
      ? "channel_companion"
      : delegatedMcp
        ? "delegated_mcp"
        : boundDispatch
          ? "bound_dispatch"
          : "registration";

  return {
    parentGateEnabled,
    surfaces: {
      registration,
      boundDispatch,
      delegatedMcp,
      channelCompanion,
    },
    highestEnabledSurface,
    remoteEndpointPolicy: input.remoteEndpointPolicyExceptionId?.trim()
      ? "audited_exception_granted"
      : "loopback_only",
  };
}

export interface HermesCapabilityRolloutReadiness {
  profileExperience: boolean;
  channelWorkflowExpansion: boolean;
  memoryContextSync: boolean;
  taskModes: boolean;
  visibilitySummaries: boolean;
}

export function evaluateHermesCapabilityRolloutReadiness(
  input: Pick<
    TenantFeatureFlags,
    | "hermesProfileExperience"
    | "hermesChannelWorkflowExpansion"
    | "hermesMemoryContextSync"
    | "hermesTaskModes"
    | "hermesVisibilitySummaries"
  >,
): HermesCapabilityRolloutReadiness {
  return {
    profileExperience: input.hermesProfileExperience === true,
    channelWorkflowExpansion: input.hermesChannelWorkflowExpansion === true,
    memoryContextSync: input.hermesMemoryContextSync === true,
    taskModes: input.hermesTaskModes === true,
    visibilitySummaries: input.hermesVisibilitySummaries === true,
  };
}
