import type { TenantFeatureFlagKey } from "@shared/featureFlags";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";

export interface TenantFlagInfo {
  key: TenantFeatureFlagKey;
  label: string;
  description: string;
}

export interface TenantFlagGroup {
  title: string;
  icon: string;
  flags: TenantFlagInfo[];
}

export const BASE_TENANT_FLAG_GROUPS: TenantFlagGroup[] = [
  {
    title: "Channels & Social",
    icon: "📡",
    flags: [
      { key: "multiChannel", label: "Multi-Channel Adapters", description: "Telegram, WhatsApp, LINE, Slack, Discord" },
      { key: "chatWidget", label: "Embeddable Chat Widget", description: "Embed chat on external websites" },
      { key: "channelRouter", label: "Channel Routing Rules", description: "Route messages based on rules" },
      { key: "META_CHANNELS_ENABLED", label: "Meta Channels", description: "Facebook/Instagram Pages — inbox, publishing, comments" },
      { key: "UPLOAD_POST_GATEWAY_ENABLED", label: "Upload-Post Gateway", description: "Universal upload-post publishing bridge" },
    ],
  },
  {
    title: "AI Tools & Browser",
    icon: "🌐",
    flags: [
      { key: "browserTool", label: "Browser Automation", description: "AI-controlled web browsing" },
      { key: "liveBrowser", label: "Live Browser", description: "Real-time shared browser sessions" },
      { key: "automationCopilot", label: "Automation Copilot", description: "LLM-driven browser task planner" },
      { key: "chatBrowserSessionEntry", label: "Chat Browser Session", description: "Browser Sessions from Chat" },
      { key: "agencyBrowserSessionUi", label: "Agency Browser Session", description: "Browser nodes in Agency" },
      { key: "workflowBrowserSessionNodes", label: "Workflow Browser Session", description: "Browser nodes in Workflow" },
      { key: "canvas", label: "Canvas / AI Artifacts", description: "Interactive artifact rendering" },
      { key: "voiceChat", label: "Voice Chat Mode", description: "Real-time voice conversation" },
      { key: "voiceAgents", label: "Voice Agents", description: "ElevenLabs ElevenAgents runtime sessions" },
      { key: "localClientLlmMode", label: "Local AI / Client LLM", description: "Gemma 4 on-device chat, voice, OCR assist, and per-session local mode" },
      { key: "personaSystem", label: "AI Persona System", description: "Custom AI personalities" },
    ],
  },
  {
    title: "Agency & Agents",
    icon: "🤖",
    flags: [
      { key: "crossAgency", label: "Cross-Agency Calls", description: "Agents calling other agencies" },
      { key: "agencyCustomTools", label: "Custom Tools", description: "Create custom agency tools" },
      { key: "agencyGuardrails", label: "Guardrails", description: "Safety rules for agent outputs" },
      { key: "agencyStreaming", label: "Streaming Responses", description: "Real-time token streaming" },
      { key: "agencyMcpBridge", label: "MCP Bridge (per-agent)", description: "Inline MCP server on agent nodes" },
      { key: "agencyToolApi", label: "Tool API", description: "Standalone tool execution API" },
      { key: "agencyAgenticModeEnabled", label: "Agentic Mode (L1)", description: "Basic agentic execution with tool use" },
      { key: "agencyReactExecutorEnabled", label: "ReAct Executor (L2)", description: "Reasoning + Acting loop" },
      { key: "agencyAutonomousAgentEnabled", label: "Autonomous Agent (L3)", description: "Self-planning autonomous agents" },
      { key: "agencyLongTermMemoryEnabled", label: "Long-Term Memory", description: "Persistent memory across runs" },
      { key: "agencyHybridAdk", label: "Hybrid ADK Runtime", description: "Compile and run hybrid Agency Swarm + ADK workflows" },
      { key: "agencyHybridAdkKillSwitch", label: "Hybrid ADK Kill Switch", description: "Operationally disable ADK compile/save/run paths" },
      { key: "agentRegistryEnabled", label: "Agent Registry", description: "Registered agent catalog and admin controls" },
    ],
  },
  {
    title: "OpenAI Agents Runtime",
    icon: "🧠",
    flags: [
      { key: "openAiAgentsRuntimeEnabled", label: "Runtime Enabled", description: "Enable the OpenAI Agents runtime bridge" },
      { key: "openAiAgentsRuntimeChatShadow", label: "Chat Shadow", description: "Run Chat through runtime shadow mode" },
      { key: "openAiAgentsRuntimeTeamShadow", label: "Team Shadow", description: "Run team flows through runtime shadow mode" },
      { key: "openAiAgentsRuntimeResponsesShadow", label: "Responses Shadow", description: "Run Responses paths through runtime shadow mode" },
      { key: "openAiAgentsRuntimeSkillShadow", label: "Skill Shadow", description: "Run skill paths through runtime shadow mode" },
      { key: "openAiAgentsRuntimeChatActive", label: "Chat Active", description: "Serve Chat through the runtime" },
      { key: "openAiAgentsRuntimeTeamActive", label: "Team Active", description: "Serve team flows through the runtime" },
      { key: "openAiAgentsRuntimeResponsesActive", label: "Responses Active", description: "Serve Responses paths through the runtime" },
      { key: "openAiAgentsRuntimeSkillActive", label: "Skill Active", description: "Serve skill paths through the runtime" },
      { key: "openAiAgentsRuntimeForceRollback", label: "Force Rollback", description: "Disable active runtime paths immediately" },
    ],
  },
  {
    title: "Agent Experience",
    icon: "✨",
    flags: [
      { key: "agentExperienceLayer", label: "Agent Experience Layer", description: "Enable the canonical Agent Experience adapter layer" },
      { key: "agentExperienceShadowMode", label: "Shadow Mode", description: "Observe adapter behavior without visible UI changes" },
      { key: "agentExperienceAgencyPreview", label: "Agency Preview", description: "Enable gated Agent Experience previews for Agency flows" },
      { key: "agentExperienceTeamPreview", label: "Team Preview", description: "Enable gated Agent Experience previews for Team Room flows" },
      { key: "agentExperienceChatPreview", label: "Chat Preview", description: "Enable gated Agent Experience previews for Chat flows" },
      { key: "agentExperienceRuntypeRenderer", label: "Runtype Renderer Bridge", description: "Enable the optional renderer bridge only after dependency gates pass" },
      { key: "agentExperienceDebugInspector", label: "Debug Inspector", description: "Enable permission-gated redacted diagnostics" },
      { key: "agentExperienceForceRollback", label: "Force Rollback", description: "Disable all Agent Experience behavior immediately" },
      { key: "agentExperienceWebsiteWidget", label: "Website Widget", description: "Reserved future customer widget gate" },
      { key: "agentExperiencePageActions", label: "Page Actions", description: "Reserved future customer page action gate" },
    ],
  },
  {
    title: "Gemini Omni",
    icon: "✨",
    flags: [
      { key: "geminiOmniSuiteEnabled", label: "Gemini Omni Suite", description: "Enable Gemini Omni suite surfaces and tenant rollout controls" },
      { key: "geminiOmniAssetCreationEnabled", label: "Asset Creation", description: "Allow Gemini Omni asset creation flows" },
      { key: "geminiOmniPromptQaEnabled", label: "Prompt QA", description: "Run Gemini Omni prompt QA before generation" },
      { key: "geminiOmniVideoQaEnabled", label: "Video QA", description: "Run Gemini Omni video QA after generation" },
      { key: "geminiOmniAutoLearningEnabled", label: "Auto Learning", description: "Allow Gemini Omni QA learning recommendations" },
    ],
  },
  {
    title: "MCP Server Registry",
    icon: "🔌",
    flags: [
      { key: "mcpServerRegistry", label: "MCP Server Registry", description: "Centralized MCP tool server management" },
      { key: "mcpStdio", label: "MCP stdio Transport", description: "MCP via OpenSandbox containers" },
      { key: "mcpOAuth", label: "MCP OAuth 2.1", description: "OAuth for MCP server connections" },
      { key: "mcpModernProtocolEnabled", label: "Modern MCP protocol", description: "Enable the canonical Streamable HTTP MCP protocol surface" },
      { key: "mcpResourcesEnabled", label: "MCP documentation resources", description: "Allow resources/list and resources/read for public MCP documentation" },
      { key: "mcpOAuthProtectedResourceEnabled", label: "OAuth Protected Resource Metadata", description: "Publish PRM metadata and Bearer resource_metadata challenges" },
      { key: "mcpOAuthAuthorizationServerEnabled", label: "MCP OAuth Authorization Server", description: "Enable first-party OAuth login, consent, token, and JWKS routes" },
      { key: "mcpOAuthDynamicRegistrationEnabled", label: "OAuth dynamic registration", description: "Allow RFC 7591 client registration; keep off unless the client requires it" },
    ],
  },
  {
    title: "MCP Connect",
    icon: "🔌",
    flags: [
      { key: "mcpConnectEnabled", label: "MCP Connect", description: "Master rollout gate for MCP Connect surfaces" },
      { key: "mcpConnectMagnificEnabled", label: "Magnific Provider", description: "Enable Magnific MCP provider access" },
      { key: "mcpConnectHiggsfieldEnabled", label: "Higgsfield Provider", description: "Enable Higgsfield MCP provider access" },
      { key: "mcpConnectGroupSharingEnabled", label: "Group Sharing", description: "Enable group sharing for MCP Connect" },
      { key: "mcpMediaStudioEnabled", label: "Media Studio MCP", description: "Enable MCP transport in Media Studio" },
      { key: "mcpAutoStoryboardReviewEnabled", label: "Auto Storyboard Review MCP", description: "Enable MCP transport for Auto Storyboard Review" },
      { key: "mcpMarketplaceCaptureEnabled", label: "Marketplace Capture MCP", description: "Enable MCP transport for Marketplace Capture" },
      { key: "mcpStoryboardReviewEnabled", label: "Storyboard Review MCP", description: "Enable MCP transport for Storyboard Review" },
      { key: "mcpMediaImageEnabled", label: "MCP Image Generation", description: "Enable MCP-backed image generation assets" },
      { key: "mcpMediaVideoEnabled", label: "MCP Video Generation", description: "Enable MCP-backed video generation assets" },
      { key: "mcpToolSchemaCacheEnabled", label: "Tool Schema Cache", description: "Enable MCP tools/list schema caching" },
      { key: "mcpAutoFallbackToGatewayApiEnabled", label: "Gateway API Fallback", description: "Allow explicit MCP fallback to Gateway API" },
      { key: "mcpProviderCreditsTrackedEnabled", label: "Provider Credit Tracking", description: "Track MCP provider-credit usage" },
    ],
  },
  {
    title: "Marketplace Intelligence",
    icon: "🛒",
    flags: [
      { key: "marketplaceConnectorLabEnabled", label: "Marketplace Connector Lab", description: "Enable Shopee connector authorization and fixture replay discovery UI under Marketplace Capture Intelligence" },
      { key: "marketplaceIntelligenceImportsEnabled", label: "Connector Imports", description: "Allow users to save field samples and marketplace search snapshots from connector output" },
      { key: "marketplaceKeywordDiscoveryEnabled", label: "Keyword Discovery", description: "Enable broad keyword/category clustering, opportunities, and refresh flows" },
      { key: "marketplaceIntelligenceReportsEnabled", label: "Marketplace Reports", description: "Enable deterministic competitive intelligence reports from stored snapshots" },
      { key: "marketplaceReportImageSkillsEnabled", label: "Report Image Skills", description: "Enable report-specific prompt payload generation for image providers" },
      { key: "marketplaceIntelligenceShareableImageEnabled", label: "Shareable Image Exports", description: "Allow shareable image export records for marketplace reports" },
      { key: "marketplaceIntelligenceWatchlistsEnabled", label: "Watchlists", description: "Enable keyword, seller, brand, and SKU monitoring events" },
      { key: "marketplaceIntelligenceMcpWritesEnabled", label: "MCP Writes", description: "Allow MCP tools to write marketplace snapshots, reports, and watchlists into this tenant" },
    ],
  },
  {
    title: "Age Safety",
    icon: "🛡️",
    flags: [
      { key: "ageSafetyPolicyEnabled", label: "Age Safety Policy", description: "Central age-aware safety policy master gate (F128)" },
      { key: "ageSafetyObserveMode", label: "Observe Mode", description: "Audit would-block decisions without blocking" },
      { key: "ageSafetyProfileCompletionGate", label: "Profile Completion Gate", description: "Require DOB/country completion after login" },
      { key: "ageSafetyChatEnforcement", label: "Chat Enforcement", description: "Enforce age policy on chat prompt/output paths" },
      { key: "ageSafetyMediaEnforcement", label: "Media Enforcement", description: "Enforce age policy on media prompt/job paths" },
      { key: "ageSafetyProtectedSurfaceUnlock", label: "Protected Surface Unlock", description: "Security PIN protected-surface unlock" },
      { key: "ageSafetyGeneratedAssetViewerPolicy", label: "Asset Viewer Policy", description: "Viewer-time generated asset policy" },
      { key: "ageSafetyEmergencyChildSafeMode", label: "Emergency Child-Safe Mode", description: "Force child-safe behavior across protected surfaces" },
    ],
  },
  {
    title: "Vertical Drama Series",
    icon: "🎬",
    flags: [
      { key: "verticalDramaSeries", label: "Vertical Drama Series", description: "Master gate for the Vertical Drama Series workspace (F131)" },
      { key: "verticalDramaSeriesDashboardMenu", label: "Dashboard Menu", description: "Show the Vertical Drama Series menu entry" },
      { key: "verticalDramaSeriesSkillChain", label: "Skill Chain", description: "Vertical drama skill-chain execution" },
      { key: "verticalDramaSeriesCharacterStock", label: "Character Stock", description: "Series character stock + visual bible surfaces" },
      { key: "verticalDramaSeriesMemory", label: "Series Memory", description: "Series memory summary/seed surfaces" },
      { key: "verticalDramaSeriesProductTieIn", label: "Product Tie-in", description: "Product tie-in configuration surfaces" },
      { key: "verticalDramaObjectReferences", label: "Object Reference Catalog", description: "Enable the shared story-object and Product tie-in reference catalog" },
      { key: "verticalDramaObjectDetection", label: "Object Detection", description: "Enable advisory detection and review suggestions for story objects" },
      { key: "verticalDramaObjectImageGeneration", label: "Object Image Generation", description: "Enable explicitly confirmed, credit-consuming object image generation" },
      { key: "verticalDramaObjectLegacyBackfill", label: "Object Legacy Backfill", description: "Enable report-first migration of legacy Product tie-in records" },
      { key: "verticalDramaSpecialEpisodes", label: "Special Tie-in Episodes", description: "Show and enable the special product/location/store tie-in episode workflow" },
      { key: "verticalDramaSeriesStartFrames", label: "Start Frames", description: "Start-frame render/plan surfaces" },
      { key: "verticalDramaSeriesFirstLastFrameBridge", label: "First/Last Frame Bridge", description: "First/last frame bridge motion mode" },
      { key: "verticalDramaSeriesStoryboardReviewHandoff", label: "Storyboard Review Handoff", description: "Storyboard Review project handoff" },
      { key: "verticalDramaSeriesProviderRouting", label: "Provider Routing", description: "Provider routing selection for series stages" },
      { key: "verticalDramaSeriesQcRepair", label: "QC + Repair", description: "QC + repair loop surfaces" },
      { key: "verticalDramaSeriesDialogueAudio", label: "Dialogue Audio", description: "Dialogue/audio planning surfaces" },
      { key: "verticalDramaSeriesSubtitles", label: "Subtitles", description: "Subtitle planning surfaces" },
      { key: "verticalDramaSeriesSubShots", label: "Sub-Shots", description: "Opt-in sub-shot decomposition editor" },
      { key: "verticalDramaSeriesSpeechBudget", label: "Speech Budget (density)", description: "Density-first planning + dialogue coverage gates (spec §7.7)" },
      { key: "verticalDramaSeriesArcReplan", label: "Arc Re-plan", description: "Season arc drift detection + re-plan proposals (spec §7.7.3)" },
      { key: "verticalDramaSeriesQualityLoopV2", label: "Quality Loop v2", description: "Scorecard v2 + bounded auto-improve loop (spec §16.1); requires Speech Budget" },
      { key: "verticalDramaSeriesTieInQc", label: "Tie-in QC", description: "Tie-in naturalness QC gates (spec §13.1); requires Speech Budget + Quality Loop v2" },
      { key: "verticalDramaSeriesProductionWizard", label: "Production Wizard", description: "Guided 11-step episode wizard (spec §8.8); requires Quality Loop v2" },
      { key: "verticalDramaSeriesPresetMixV2", label: "Preset Mix v2", description: "Preset visual identity + verifiable blending (spec §8.2.2)" },
      { key: "verticalDramaSeriesLookLock", label: "Series Look Lock", description: "ล็อกลุคภาพหลักของซีรีส์ให้ใช้ร่วมกันทุกตอน (F139)" },
      { key: "verticalDramaMotionContracts", label: "Motion Contracts", description: "กำหนดสัญญาการเคลื่อนไหวรายช็อตแบบมีโครงสร้าง (F137)" },
      { key: "verticalDramaSceneContinuity", label: "Scene Continuity", description: "บันทึกสถานะความต่อเนื่องของฉากเพื่อส่งต่อระหว่างช็อต (F138 P1a)" },
      { key: "verticalDramaSceneContinuityQc", label: "Scene Continuity QC", description: "ตรวจความต่อเนื่องของภาพฉากแบบ advisory โดยไม่บล็อกการสร้าง (F138 P2)" },
      { key: "verticalDramaSceneNeighborAnchors", label: "Scene Neighbor Anchors", description: "ใช้ภาพอ้างอิงจากฉากข้างเคียง โดยต้องเปิด Scene Continuity ก่อน (F138 P1b)" },
      { key: "verticalDramaVideoSafeStartFrames", label: "Video-Safe Start Frames", description: "ตรวจและสร้างเฟรมตั้งต้นที่ปลอดภัยสำหรับวิดีโอ (F137 P2)" },
      { key: "verticalDramaClipIdentityQc", label: "Clip Identity QC", description: "ตรวจ identity ของตัวละครจากเฟรมตัวอย่างหลังวิดีโอเสร็จ (F137 P3)" },
      { key: "verticalDramaSeriesDeepStoryDrafts", label: "Deep Story Drafts", description: "สร้างร่าง 9 ช็อต + บทพูดทุกตอนตั้งแต่รอบเนื้อเรื่องเต็ม (F131T)" },
      { key: "verticalDramaSeriesVoiceChain", label: "Voice Chain", description: "คัดเสียงต่อตัวละคร + สร้างเสียงพูดทั้งตอน + timeline เสียงเข้า assembly (F131U)" },
      { key: "verticalDramaSeriesStoryLock", label: "Story Lock", description: "ล็อกเนื้อเรื่องไว้ที่หน้าภาพรวม — ซ่อม/ปรับระดับตอนแก้ได้เฉพาะการนำเสนอ ไม่แก้เนื้อเรื่อง (F131V)" },
      { key: "verticalDramaSeriesAdBannerOverlay", label: "Ad Banner Overlay", description: "สตูดิโอออกแบบแบนเนอร์โฆษณาซ้อนวิดีโอระดับซีรีส์ — พรีเซ็ตสไตล์/ตำแหน่ง, สร้าง prompt + ภาพ (F131W)" },
      { key: "verticalDramaSeriesFormatProfiles", label: "Format Profiles", description: "โปรไฟล์ความยาวซีรีส์ — ซีรีส์สั้นมาก (≤5 ตอน) ได้กติกาเฉพาะ: บทแน่นทุกตอน, hook 3 วิ, เกณฑ์นักวิจารณ์ตามสัดส่วน (F131X)" },
      { key: "verticalDramaSeriesTieInReplan", label: "Tie-in Replan", description: "เลื่อนสินค้าออกจากตอน → สร้างข้อเสนอย้ายไปตอนอนาคตอัตโนมัติ ผ่านการอนุมัติแผนซีซั่น (F131Y)" },
      { key: "verticalDramaSeriesCharacterRefV2", label: "Character Ref v2", description: "ส่งภาพอ้างอิงตัวละคร 2 ใบ (portrait + sheet) เข้าการสร้างภาพ เพื่อความนิ่งของหน้าตา (F131Z)" },
      { key: "verticalDramaSeriesShareLinks", label: "Share Links", description: "ลิงก์แชร์ซีรีส์แบบอ่านอย่างเดียว มีวันหมดอายุ เพิกถอนได้ (F131AA)" },
      { key: "verticalDramaSeriesTextOverlaySuite", label: "Text Overlay Suite", description: "ข้อความท้ายตอน/ความเดิม/ป้ายชื่อเรื่อง/เลขตอน/แนะนำตัวละคร/การ์ดกลางตอน + ลายน้ำซีรีส์ (F131AB)" },
      { key: "verticalDramaSeriesNativeAudioPrompts", label: "Native Audio Prompts", description: "กำกับเสียง SFX+บรรยากาศในตัวคลิปผ่าน prompt วิดีโอ (โมเดลที่รองรับ) — ไม่มีเสียงพูด/เพลง (F131AC)" },
      { key: "verticalDramaEnhancedVideoPromptUi", label: "Enhanced Prompt UI", description: "Show the isolated Enhanced video-prompt action beside Legacy" },
      { key: "verticalDramaEnhancedVideoPromptJobs", label: "Enhanced Prompt Jobs", description: "Allow Enhanced Agent prompt-authoring jobs after runtime readiness passes" },
      { key: "verticalDramaEnhancedVideoPromptApply", label: "Enhanced Prompt Apply", description: "Allow an explicitly selected Enhanced variant to replace the active prompt" },
      { key: "verticalDramaUserPremise", label: "User Premise", description: "User-defined premise field + premise-primary preset synthesis (spec 132 §4)" },
      { key: "verticalDramaQualityLedgers", label: "Quality Ledgers", description: "Evidence/activation/threat/consequence/thread/world-rule ledgers + story state (spec 132 §5)" },
      { key: "verticalDramaSceneContracts", label: "Scene Contracts", description: "Per-shot scene contracts in drafts + pipeline validation (spec 132 §6)" },
      { key: "verticalDramaMultiPassQc", label: "Multi-Pass QC v3", description: "Dialogue rules v2 + six-pass season critique + scorecard v3 (spec 132 §7-8)" },
      { key: "verticalDramaTargetedRevisionV2", label: "Targeted Revision v2", description: "Shot-scoped revision plan + splice repair (spec 132 §9)" },
      { key: "verticalDramaCharacterProfiles", label: "Character Profiles", description: "Structured personality + speech/voice profiles per character (spec 132 §7.3, §10.1)" },
      { key: "verticalDramaCharacterVisualQuality", label: "Character Visual Quality", description: "Persisted visual bible, expression set, image QC gate, consistency ledger (spec 132 §10.2-10.7)" },
      { key: "verticalDramaContinuityContracts", label: "Continuity Contracts", description: "Causal chain map + hook-to-opening enforcement (spec 132 §8.2)" },
      { key: "verticalDramaAngleGridQuality", label: "Angle Grid Quality", description: "Structured 9-angle camera schema, diversity/coverage rules, best-angle scoring rubric (spec 132 §19)" },
      { key: "verticalDramaRetentionHooks", label: "Retention Hooks", description: "หลักการ hook/open-loop/retention-loop 12 ข้อ — genre-conditional guidance ในบท+ช็อต, scorecard v4 (open loop/retention loop/change cadence), motion energy ช็อตเปิด/ปิดตอน (planning/vertical-drama-retention-hooks)" },
    ],
  },
  {
    title: "Planner & Orchestrator",
    icon: "🎯",
    flags: [
      { key: "taskPlannerEnabled", label: "Task Planner", description: "Active model selection planner" },
      { key: "chatAutoModelSelection", label: "Chat Auto Model Selection", description: "Auto / provider-auto LLM routing in Chat" },
      { key: "taskPlannerAgencyEscalation", label: "Planner Escalation", description: "Escalate to agency for multi-step" },
      { key: "orchestratorEnabled", label: "Workflow Orchestrator", description: "Visual workflow engine" },
      { key: "skillOrchestrator", label: "Skill Orchestrator", description: "Automated skill chaining" },
      { key: "unifiedSkillExecution", label: "Unified Skill Execution", description: "Unified skill pipeline" },
    ],
  },
  {
    title: "Workpacks & Autonomy",
    icon: "🧩",
    flags: [
      { key: "workpacksEnabled", label: "Workpacks", description: "Case intake, playbooks, and reusable workpack execution units" },
      { key: "workpackAutonomousPilot", label: "Autonomous Pilot", description: "Allow evidence-backed autonomous workpack runs for this tenant" },
      { key: "workpackOpsConsole", label: "Ops Console", description: "Expose admin readiness, rollout, and incident controls for workpacks" },
    ],
  },
  {
    title: "Hermes Runtime",
    icon: "🕊️",
    flags: [
      { key: "hermesAgentRuntime", label: "Hermes Runtime", description: "Allow registered Hermes bridge workers for this tenant" },
      { key: "hermesProfileExperience", label: "Hermes Profile Experience", description: "Show Hermes persona and profile summaries in team and admin views" },
      { key: "hermesChannelWorkflowExpansion", label: "Hermes Channel Workflow", description: "Enable Hermes channel companion workflow surfaces" },
      { key: "hermesMemoryContextSync", label: "Hermes Memory Sync", description: "Enable opt-in Hermes memory and context synchronization" },
      { key: "hermesTaskModes", label: "Hermes Task Modes", description: "Show Hermes task-mode summaries and mode mapping" },
      { key: "hermesVisibilitySummaries", label: "Hermes Visibility Summaries", description: "Show Hermes progress and observability summaries" },
    ],
  },
  {
    title: "Integration & API",
    icon: "🔗",
    flags: [
      { key: "responsesApi", label: "Responses API Gateway", description: "OpenAI-compatible proxy" },
      { key: "publicApi", label: "Public API", description: "External API access" },
      { key: "openClawExternalRuntime", label: "OpenClaw External Workers", description: "Allow registered external Claw workers for this tenant" },
      { key: "documentOcrExternalProcessing", label: "Document OCR External Processing", description: "Allow outbound document OCR to external providers (ADE/gateway)" },
      { key: "webhookTriggers", label: "Webhook Triggers", description: "Inbound webhook triggers" },
      { key: "costDisplay", label: "Cost Display", description: "Show per-response costs" },
      { key: "multimodalMemory", label: "Multimodal Memory", description: "Image/audio in memory" },
    ],
  },
  {
    title: "Desktop Host",
    icon: "💻",
    flags: [
      { key: "desktopHostEnabled", label: "Desktop Host", description: "Unified governed Desktop Host control plane" },
      { key: "desktopAdvancedLocalMode", label: "Advanced Local Mode", description: "Step-up local power with explicit tenant opt-in" },
      { key: "desktopPackageSync", label: "Desktop Package Sync", description: "Signed package sync and local materialization" },
      { key: "desktopAgencyRuntime", label: "Desktop Agency Runtime", description: "Agency Swarm runtime on managed desktop" },
      { key: "desktopWorkerProjection", label: "Desktop Worker Projection", description: "Project Desktop Host into the worker fabric" },
      { key: "desktopZeroClawWorker", label: "Desktop + ZeroClaw Managed Runtime", description: "Compatibility rollout for the managed Desktop + ZeroClaw runtime" },
      { key: "nemoClawSecureWorkerPool", label: "NemoClaw Secure Sandbox", description: "Admin-gated secure sandbox runtime family" },
      { key: "hiClawClusterRuntime", label: "HiClaw Collaborative Cluster", description: "Admin-gated collaborative cluster runtime family" },
    ],
  },
  {
    title: "Notifications",
    icon: "🔔",
    flags: [
      { key: "notificationUnifiedCenter", label: "Notification Center", description: "Unified inbox" },
      { key: "notificationPreferencesEnabled", label: "Preferences", description: "User notification settings" },
      { key: "notificationDedupEnabled", label: "Dedup", description: "Suppress duplicates" },
      { key: "notificationEscalationEnabled", label: "Escalation", description: "Escalate unacknowledged" },
      { key: "notificationEmailDelivery", label: "Email Delivery", description: "Notifications via email" },
      { key: "notificationWebhookDelivery", label: "Webhook Delivery", description: "Notifications via webhook" },
    ],
  },
  {
    title: "Media Production & HyperFrames",
    icon: "🎬",
    flags: [
      { key: "mediaProductionDirectorEnabled", label: "Production Director", description: "Media Studio Production/Director command center" },
      { key: "mediaProductionGoalCanvasEnabled", label: "Production Goal Canvas", description: "Visual production goal planning canvas" },
      { key: "mediaProductionStoryboardPlannerEnabled", label: "Storyboard Planner", description: "Production Storyboard Planner skill gate" },
      { key: "mediaProductionPlanVerifierEnabled", label: "Plan Verifier", description: "Production Plan Verifier skill gate" },
      { key: "mediaProductionDualOutputEnabled", label: "Dual Output Projection", description: "Storyboard Review and Video Edit output projections" },
      { key: "mediaProductionAgencyReviewersEnabled", label: "Agency Reviewers", description: "Optional Agency reviewer packs for production plans" },
      { key: "mediaProductionLangGraphBatchEnabled", label: "LangGraph Batch Runtime", description: "Optional checkpointed batch runtime for media production" },
      { key: "marketplaceHyperframesEnabled", label: "Marketplace HyperFrames", description: "Show Auto Storyboard Review HyperFrames controls on Marketplace Product Detail" },
      { key: "marketplaceHyperframesWorkerEnabled", label: "HyperFrames Worker Queue", description: "Allow this tenant to queue HyperFrames preview/render worker jobs" },
      { key: "marketplaceHyperframesLibrarySaveEnabled", label: "HyperFrames Library Save", description: "Allow completed HyperFrames renders to be saved to Library" },
      { key: "marketplaceHyperframesOperatorEnabled", label: "HyperFrames Operator Controls", description: "Allow delegated tenant operators to inspect, replay, and manage HyperFrames renders" },
      { key: "hyperframesWorkerFinalComposite", label: "HyperFrames Final Composite", description: "Worker-only HyperFrames final composite rendering (F92A)" },
      { key: "storyboardPreviewMatchCaptureEnabled", label: "Preview Match Capture", description: "Use browser-captured Storyboard preview output instead of legacy final render" },
      { key: "storyboardPreviewMatchCaptureServerWorkerEnabled", label: "Preview Match Worker", description: "Enable STORYBOARD_PREVIEW_MATCH_CAPTURE_SERVER_WORKER_ENABLED for this tenant" },
      { key: "storyboardPreviewMatchCaptureHighEnabled", label: "Preview Match High Quality", description: "Allow high-quality browser capture jobs" },
      { key: "storyboardClientCaptureExperimentEnabled", label: "Client Capture Experiment", description: "Allow experimental untrusted client-side capture paths" },
      { key: "hermesMediaWorker", label: "Grok via Hermes — Tenant rollout", description: "Tenant rollout gate for Grok image/video generation through the user's own Hermes worker. Platform enablement is also required in Admin Settings → Infrastructure → Tasks. This is NOT the agent-gateway Hermes Runtime." },
      { key: "marketplaceSequentialStoryboard", label: "Storyboard 9 ภาพต่อเนื่อง (Sequential)", description: "เปิดโหมดสร้างรีวิวแบบ 9 ภาพแยก (1 prompt ต่อ 1 ภาพ) พร้อมล็อกสินค้าหลายมุม — Feature 136" },
      { key: "marketplaceReviewEvidenceGuard", label: "Evidence Guard สำหรับรีวิวสินค้า", description: "เปิดการ์ดหลักฐานร่วมทั้งสองโหมด: assembly guard, guardian presence, claim whitelist — Feature 136" },
    ],
  },
  {
    title: "Video Segment Planner",
    icon: "🎞️",
    flags: [
      { key: "videoSegmentPlannerShadow", label: "Segment Planner Shadow", description: "Record video segment planner metadata without changing user flow" },
      { key: "videoSegmentPlannerPerShot", label: "Per-Shot Planning", description: "Enable per-shot segment planner handoff" },
      { key: "videoSegmentPlannerPreview", label: "Segment Preview", description: "Enable backend video segment preview summaries" },
      { key: "videoSegmentPlannerMultiShotBeta", label: "Multi-Shot Beta", description: "Enable tenant/model gated multi-shot video segments" },
    ],
  },
  {
    title: "Presentation Video",
    icon: "🎥",
    flags: [
      { key: "presentationArticleStoryboardVideo", label: "Article Video Project", description: "Convert article pages into a Storyboard Review video project" },
      { key: "presentationArticleStoryboardVideoPreview", label: "Article Video Preview", description: "Show shot, overlay, audio, and credit summary before handoff" },
      { key: "presentationArticleStoryboardVideoOverlay", label: "Video Text Overlay", description: "Persist article title/key text as editable CSS overlay metadata" },
      { key: "presentationArticleStoryboardVideoReferenceFrames", label: "3x3 Reference Frames", description: "Generate and select scene reference frames for video prompts" },
      { key: "presentationArticleStoryboardVideoCharacterReferences", label: "Character References", description: "Attach approved character references separately from scene references" },
      { key: "presentationArticleStoryboardVideoSeedancePrompt", label: "Seedance Prompt Adapter", description: "Use the Seedance multi-shot review skill to write video prompts" },
      { key: "presentationArticleStoryboardVideoVoiceScript", label: "Article Voice Script", description: "Generate storytelling narration or dialogue from article text" },
      { key: "presentationArticleStoryboardVideoUvoiceVoiceover", label: "UVoice Voiceover", description: "Enable UVoice premium as a separate TTS voiceover route" },
      { key: "presentationArticleStoryboardVideoElevenLabsDialogue", label: "ElevenLabs Dialogue", description: "Enable dialogue-capable voice generation when configured" },
      { key: "presentationArticleStoryboardVideoNativeAudio", label: "Native Video Audio", description: "Allow supported video models to generate speech/audio inside video" },
      { key: "presentationArticleStoryboardVideoNativeAudioPromptComposer", label: "Native Audio Prompt Composer", description: "Allow spoken lines to be embedded into native-audio video prompts" },
    ],
  },
];

function humanizeFlagKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getUngroupedTenantFeatureFlagKeys(): TenantFeatureFlagKey[] {
  const grouped = new Set<TenantFeatureFlagKey>(
    BASE_TENANT_FLAG_GROUPS.flatMap((group) => group.flags.map((flag) => flag.key)),
  );

  return (Object.keys(FEATURE_FLAG_DEFAULTS) as TenantFeatureFlagKey[]).filter(
    (key) => !grouped.has(key),
  );
}

export function buildTenantFeatureFlagGroups(): TenantFlagGroup[] {
  const ungroupedKeys = getUngroupedTenantFeatureFlagKeys();
  if (ungroupedKeys.length === 0) {
    return BASE_TENANT_FLAG_GROUPS;
  }

  return [
    ...BASE_TENANT_FLAG_GROUPS,
    {
      title: "Additional Flags",
      icon: "⚙️",
      flags: ungroupedKeys.map((key) => ({
        key,
        label: humanizeFlagKey(key),
        description: `Feature flag: ${key}`,
      })),
    },
  ];
}
