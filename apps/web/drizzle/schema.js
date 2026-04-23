"use strict";
var __makeTemplateObject =
  (this && this.__makeTemplateObject) ||
  function (cooked, raw) {
    if (Object.defineProperty) {
      Object.defineProperty(cooked, "raw", { value: raw });
    } else {
      cooked.raw = raw;
    }
    return cooked;
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.userGroups =
  exports.desktopDevices =
  exports.tenants =
  exports.routingRules =
  exports.apiAuditEvents =
  exports.providerUsageLog =
  exports.modelProviderMap =
  exports.llmProviders =
  exports.galleryItems =
  exports.creditPackages =
  exports.creditTransactions =
  exports.users =
  exports.desktopDeviceHealthStatusEnum =
  exports.sandboxFeatureTypeEnum =
  exports.sandboxNetworkActionEnum =
  exports.sandboxArtifactTypeEnum =
  exports.sandboxJobStatusEnum =
  exports.sandboxExecutionModeEnum =
  exports.editSessionStatusEnum =
  exports.indexingModeEnum =
  exports.settlementStatusEnum =
  exports.creditSourceTypeEnum =
  exports.liveBrowserEventTypeEnum =
  exports.liveBrowserActorTypeEnum =
  exports.liveBrowserAssistRequestTypeEnum =
  exports.liveBrowserControlModeEnum =
  exports.liveBrowserSessionStatusEnum =
  exports.liveBrowserSourceTypeEnum =
  exports.browserPageSensitivityEnum =
  exports.browserActionClassEnum =
  exports.browserPolicyDecisionEnum =
  exports.policyActionEnum =
  exports.mediaCallbackDlqStatusEnum =
  exports.mediaCallbackEventStatusEnum =
  exports.dlqItemStatusEnum =
  exports.workflowExecutionStatusEnum =
  exports.skillVisibilityEnum =
  exports.templateStatusEnum =
  exports.workflowStatusEnum =
  exports.apiStyleEnum =
  exports.entityTypeEnum =
  exports.messageRoleEnum =
  exports.aspectRatioEnum =
  exports.contentTypeEnum =
  exports.billingPeriodEnum =
  exports.packageTypeEnum =
  exports.transactionTypeEnum =
  exports.planEnum =
  exports.inviteCodeTypeEnum =
  exports.roleEnum =
    void 0;
exports.presentationAssetLinks =
  exports.presentationSlides =
  exports.presentationDecks =
  exports.financeTransactionDocuments =
  exports.documentExtractions =
  exports.financeTransactions =
  exports.financeDrafts =
  exports.financeRecurringRules =
  exports.financePaymentAccountAliases =
  exports.financePaymentAccounts =
  exports.financePaymentInstitutionAliases =
  exports.financePaymentInstitutions =
  exports.financeCounterpartyAliases =
  exports.financeCounterparties =
  exports.libraryIndexJobs =
  exports.libraryPublicShareLinks =
  exports.libraryPermissions =
  exports.libraryContentVersions =
  exports.libraryChunks =
  exports.libraryLinks =
  exports.libraryItems =
  exports.financePaymentDirectionEnum =
  exports.financePaymentInstrumentKindEnum =
  exports.financePaymentInstitutionKindEnum =
  exports.financeDocumentRoleEnum =
  exports.financeSourceEnum =
  exports.financeRecurringRuleStatusEnum =
  exports.financeDraftStatusEnum =
  exports.financeTransactionStatusEnum =
  exports.financeTransactionTypeEnum =
  exports.libraryIndexJobStatusEnum =
  exports.libraryVisibilityEnum =
  exports.libraryItemStatusEnum =
  exports.mediaCallbackDlq =
  exports.mediaCallbackEvents =
  exports.mediaModels =
  exports.mediaModelTypeEnum =
  exports.mediaProviders =
  exports.mediaProviderTypeEnum =
  exports.skillPreferences =
  exports.entityMemories =
  exports.memoryArchiveMetadata =
  exports.messageChunks =
  exports.conversationSummaries =
  exports.messages =
  exports.conversations =
  exports.tenantPages =
  exports.seoMetadata =
  exports.themePresets =
  exports.groupMembers =
    void 0;
exports.declineCategoryEnum =
  exports.renewalAttemptStatusEnum =
  exports.renewalModeEnum =
  exports.billingPaymentMethodStatusEnum =
  exports.paymentMethodTypeEnum =
  exports.providerPaymentTypeEnum =
  exports.paymentProviderEnum =
  exports.renderedByTypeEnum =
  exports.invoiceDocumentRenderReasonEnum =
  exports.documentLanguageEnum =
  exports.invoiceStatusEnum =
  exports.invoiceTypeEnum =
  exports.invoiceStreamEnum =
  exports.billingSubscriptionSourceEnum =
  exports.billingSubscriptionStatusEnum =
  exports.invoiceConfig =
  exports.roleRecords =
  exports.roleRecordTypeEnum =
  exports.workpackRecords =
  exports.workpackRecordTypeEnum =
  exports.systemSettings =
  exports.desktopInstallerReleases =
  exports.storageSettings =
  exports.storageProviderTypeEnum =
  exports.userSkillVisibility =
  exports.skillComments =
  exports.skillLikes =
  exports.skillPermissions =
  exports.skillContractSnapshots =
  exports.skillImprovementRuns =
  exports.skillImprovementRecommendations =
  exports.skillMaintenanceSchedules =
  exports.skills =
  exports.skillRepositories =
  exports.skillMaintenanceScheduleStatusEnum =
  exports.skillMaintenanceCompatibilityStatusEnum =
  exports.skillMaintenanceRunStatusEnum =
  exports.skillMaintenanceRunTypeEnum =
  exports.skillMaintenanceRiskLevelEnum =
  exports.skillMaintenanceRecommendationStatusEnum =
  exports.skillCategoryEnum =
  exports.userCreditBudgets =
  exports.onedriveEditSessions =
  exports.onedriveSyncState =
  exports.googleDriveEditSessions =
  exports.googleDriveSyncState =
  exports.presentationExports =
  exports.presentationConversionLocks =
  exports.presentationConversionRecords =
  exports.presentationSourceAttachments =
    void 0;
exports.NOTIFICATION_CATEGORIES =
  exports.notificationOccurrences =
  exports.userNotifications =
  exports.userFollows =
  exports.scheduledMessageLogs =
  exports.scheduledMessages =
  exports.followStatusEnum =
  exports.reminderPriorityEnum =
  exports.notificationTypeEnum =
  exports.scheduleStatusEnum =
  exports.contentComposerDrafts =
  exports.blogPosts =
  exports.supportRecoveryCases =
  exports.reconciliationRuns =
  exports.billingEffects =
  exports.notificationDispatches =
  exports.invoiceAuditLogs =
  exports.webhookEvents =
  exports.renewalAttempts =
  exports.paymentAttempts =
  exports.payments =
  exports.invoiceDocuments =
  exports.invoiceLineItems =
  exports.invoices =
  exports.documentNumberSequences =
  exports.taxPolicies =
  exports.billingPaymentMethods =
  exports.sellerProfileRevisions =
  exports.sellerProfiles =
  exports.billingProfiles =
  exports.billingMigrationRuns =
  exports.paymentMethodSetupSessions =
  exports.paymentMethodAuditLogs =
  exports.subscriptionPaymentSettings =
  exports.billingSubscriptions =
  exports.billingEffectTypeEnum =
  exports.billingMigrationRunStatusEnum =
  exports.supportRecoveryResolutionTypeEnum =
  exports.supportRecoveryIssueTypeEnum =
  exports.supportRecoveryCaseStatusEnum =
  exports.reconciliationResultEnum =
  exports.reconciliationTriggerTypeEnum =
  exports.reconciliationEntityTypeEnum =
  exports.webhookProcessingStatusEnum =
  exports.paymentAttemptStatusEnum =
  exports.amountMatchStatusEnum =
  exports.paymentBusinessEffectStatusEnum =
  exports.paymentReconciliationStatusEnum =
  exports.paymentStatusEnum =
  exports.paymentMethodSetupSessionStatusEnum =
    void 0;
exports.agencyAgents =
  exports.agencyImprovementHistory =
  exports.agencyRunFeedback =
  exports.agencyPermissions =
  exports.agencies =
  exports.tenantSandboxPolicies =
  exports.sandboxArtifacts =
  exports.sandboxJobs =
  exports.sandboxProfiles =
  exports.funnelBackfillCheckpoints =
  exports.funnelBackfillRuns =
  exports.reconciliationStatusEnum =
  exports.backfillRunStatusEnum =
  exports.funnelEvents =
  exports.scheduledJobRuns =
  exports.cloudTaskEvents =
  exports.liveBrowserControlTransfers =
  exports.liveBrowserAssistRequests =
  exports.liveBrowserEvents =
  exports.liveBrowserIdempotencyKeys =
  exports.liveBrowserSessions =
  exports.browserPolicyDecisions =
  exports.browserWorkflowEntitlements =
  exports.tenantBrowserPolicyRules =
  exports.tenantBrowserPolicyConfig =
  exports.workflowPolicyRules =
  exports.workflowSecrets =
  exports.workflowAuditEvents =
  exports.workflowCacheMetadata =
  exports.workflowDeadLetterQueue =
  exports.workflowExecutions =
  exports.workflowEventSubscriptions =
  exports.webhookCalls =
  exports.workflowSchedules =
  exports.templateRatings =
  exports.workflowTemplates =
  exports.templateCategories =
  exports.workflowVersions =
  exports.workflows =
  exports.emailVerificationTokens =
  exports.videoEditorProjects =
  exports.menuConfig =
  exports.blockedPatterns =
  exports.deviceFingerprints =
  exports.registrationEvents =
  exports.directMessages =
  exports.escalationPolicies =
  exports.notificationWebhooks =
  exports.alertRules =
  exports.notificationPreferences =
    void 0;
exports.multimodalMemoryVectors =
  exports.multimodalMemoryItems =
  exports.mediaAssetAnalysis =
  exports.mediaAssets =
  exports.automationJobs =
  exports.apiWebhookDeliveries =
  exports.apiWebhookEndpoints =
  exports.publicApiAuditLog =
  exports.apiKeys =
  exports.autoDraftSchedules =
  exports.contentAutomationRuns =
  exports.contentSpecs =
  exports.contentAutomationRunStatusEnum =
  exports.contentSpecStatusEnum =
  exports.contentArtifacts =
  exports.contentArtifactStatusEnum =
  exports.taskStepAttempts =
  exports.taskRuns =
  exports.stepAttemptStatusEnum =
  exports.taskRunStatusEnum =
  exports.automationTemplates =
  exports.channelRoutingRules =
  exports.webhookTriggerLogs =
  exports.webhookTriggers =
  exports.conversationArtifacts =
  exports.chatWidgets =
  exports.channelCredentials =
  exports.channelConnections =
  exports.personaTemplates =
  exports.creatorSettlements =
  exports.telegramUpdates =
  exports.telegramLinkTokens =
  exports.channelMessages =
  exports.conversationChannels =
  exports.telegramConnections =
  exports.agencyRunTraces =
  exports.agencySharedTools =
  exports.agencyAgentGuardrails =
  exports.agencyGuardrails =
  exports.agencyMemoryChunks =
  exports.agencyAgentMemories =
  exports.agencyVersions =
  exports.agencyRunArtifacts =
  exports.agencyConversations =
  exports.agencyCommunicationFlows =
  exports.agencyAgentTools =
  exports.agencyTools =
  exports.agentTemplates =
  exports.agencyTemplates =
  exports.agencySubgraphs =
    void 0;
exports.workItemStatusEnum =
  exports.teamRunExecutionModeEnum =
  exports.teamRunStatusEnum =
  exports.roomMessageVisibilityEnum =
  exports.roomMessageTurnTypeEnum =
  exports.roomMessageRecipientTypeEnum =
  exports.roomMessageSenderTypeEnum =
  exports.roomParticipantTypeEnum =
  exports.teamRoomStatusEnum =
  exports.teamRoomTypeEnum =
  exports.feedbackTicketAttachments =
  exports.feedbackTicketComments =
  exports.feedbackTickets =
  exports.virtualAdminSensorConfig =
  exports.virtualAdminApprovals =
  exports.virtualAdminIncidents =
  exports.ticketResolutionEnum =
  exports.ticketStatusEnum =
  exports.ticketTypeEnum =
  exports.approvalStatusEnum =
  exports.incidentStatusEnum =
  exports.incidentSeverityEnum =
  exports.assistantTeamTemplates =
  exports.assistantProfiles =
  exports.workerJobGrants =
  exports.workerDelegatedSessions =
  exports.workerArtifacts =
  exports.workerJobEvents =
  exports.workerJobs =
  exports.workerHeartbeats =
  exports.workers =
  exports.runtimeProfiles =
  exports.workerPolicies =
  exports.workerResourceProfileEnum =
  exports.workerFileScopeModeEnum =
  exports.workerRuntimeModeEnum =
  exports.workerModeEnum =
  exports.workerJobStatusEnum =
  exports.workerStatusEnum =
  exports.workerRuntimeTypeEnum =
  exports.teamMemberRoleEnum =
  exports.teamMemberKindEnum =
  exports.assistantTeams =
  exports.userOrchestratorProfiles =
  exports.modelSelectionPolicyEnum =
  exports.assistantTeamStatusEnum =
  exports.orchestratorAutonomyLevelEnum =
  exports.orchestratorViewModeEnum =
  exports.multimodalMemoryLinks =
  exports.conversationVisualState =
    void 0;
exports.inviteCodes =
  exports.externalTaskInbox =
  exports.externalTaskSources =
  exports.automationHandoffs =
  exports.trustTierEnum =
  exports.externalTaskStatusEnum =
  exports.handoffApprovalStateEnum =
  exports.handoffStatusEnum =
  exports.systemResourceState =
  exports.interAgentMessages =
  exports.resourceStatusEnum =
  exports.interAgentStatusEnum =
  exports.interAgentPriorityEnum =
  exports.interAgentTargetTypeEnum =
  exports.interAgentSourceTypeEnum =
  exports.interAgentChannelEnum =
  exports.memoryPromotions =
  exports.scopedMemories =
  exports.memorySourceTypeEnum =
  exports.memoryVisibilityEnum =
  exports.memoryKindEnum =
  exports.memoryOwnerTypeEnum =
  exports.orchestratorNotifications =
  exports.runSnapshots =
  exports.agentRunSummaries =
  exports.agentActivityEvents =
  exports.workOsEvents =
  exports.workSlas =
  exports.workOutcomes =
  exports.workExceptions =
  exports.workApprovals =
  exports.workAssignments =
  exports.workCases =
  exports.workRequests =
  exports.workItemEvents =
  exports.teamWorkItems =
  exports.teamRuns =
  exports.teamRoomMessages =
  exports.teamRoomParticipants =
  exports.teamRooms =
  exports.notificationSeverityEnum =
  exports.agentEventCategoryEnum =
  exports.workOsExceptionStatusEnum =
  exports.workOsApprovalStatusEnum =
  exports.workOsSlaBreachStateEnum =
  exports.workOsAssignmentTypeEnum =
  exports.workOsStateEnum =
  exports.workItemApprovalStateEnum =
  exports.workItemRiskClassEnum =
  exports.workItemPriorityEnum =
    void 0;
exports.systemMetricsHistory =
  exports.monitoringAlerts =
  exports.monitoringChecks =
  exports.socialWebhookEventsRaw =
  exports.socialHumanApprovals =
  exports.socialAutomationRules =
  exports.socialCommentActions =
  exports.socialComments =
  exports.socialPosts =
  exports.socialMessages =
  exports.socialConversations =
  exports.socialWebhookSubscriptions =
  exports.socialPages =
  exports.socialProviderConnections =
  exports.uploadPostJobs =
  exports.uploadPostProfiles =
  exports.uploadPostConnections =
  exports.mcpServerAssignments =
  exports.mcpServers =
  exports.userLlmApiKeys =
  exports.inviteCodeUsage =
    void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * pgvector custom column type for 1536-dimension embeddings (OpenAI text-embedding-3-small).
 * Defined early so both agency and scoped memory tables can reuse it.
 */
var vector1536 = (0, pg_core_1.customType)({
  dataType: function () {
    return "vector(1536)";
  },
  toDriver: function (value) {
    return "[".concat(value.join(","), "]");
  },
  fromDriver: function (value) {
    return typeof value === "string" ? JSON.parse(value) : value;
  },
});
/**
 * Enums
 */
exports.roleEnum = (0, pg_core_1.pgEnum)("role", [
  "user",
  "admin",
  "domain_admin",
  "system_agent",
]);
exports.inviteCodeTypeEnum = (0, pg_core_1.pgEnum)("invite_code_type", [
  "admin",
  "user",
]);
exports.planEnum = (0, pg_core_1.pgEnum)("plan", [
  "free",
  "starter",
  "pro",
  "enterprise",
]);
exports.transactionTypeEnum = (0, pg_core_1.pgEnum)("transaction_type", [
  "purchase",
  "usage",
  "bonus",
  "refund",
  "adjustment",
  "subscription",
  "creator_fee",
]);
// Package type: one-time purchase or subscription
exports.packageTypeEnum = (0, pg_core_1.pgEnum)("package_type", [
  "one_time",
  "subscription",
  "agency",
]);
// Billing period for subscription packages
exports.billingPeriodEnum = (0, pg_core_1.pgEnum)("billing_period", [
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
]);
exports.contentTypeEnum = (0, pg_core_1.pgEnum)("content_type", [
  "image",
  "video",
  "website",
]);
exports.aspectRatioEnum = (0, pg_core_1.pgEnum)("aspect_ratio", [
  "1:1",
  "9:16",
  "16:9",
]);
exports.messageRoleEnum = (0, pg_core_1.pgEnum)("message_role", [
  "user",
  "assistant",
  "system",
]);
exports.entityTypeEnum = (0, pg_core_1.pgEnum)("entity_type", [
  "user",
  "project",
  "preference",
  "technical",
  "decision",
  "plan",
  "architecture",
  "component",
  "task",
  "code_knowledge",
  "rule",
  "fact",
  "goal",
  "insight",
  "context",
  "relationship",
  "process",
  "constraint",
  "reference",
  "note",
  "checklist",
  "artifact_note",
  "handoff_note",
  "episode",
]);
// API style for different LLM provider endpoints (OpenCode Zen uses different endpoints per model family)
exports.apiStyleEnum = (0, pg_core_1.pgEnum)("api_style", [
  "chat-completions",
  "responses",
  "messages",
  "gemini",
]);
// Workflow status enum
exports.workflowStatusEnum = (0, pg_core_1.pgEnum)("workflow_status", [
  "draft",
  "compiled",
  "running",
  "completed",
  "failed",
]);
// Template status enum
exports.templateStatusEnum = (0, pg_core_1.pgEnum)("template_status", [
  "draft",
  "pending_review",
  "published",
  "archived",
  "rejected",
]);
// Skill visibility enum
exports.skillVisibilityEnum = (0, pg_core_1.pgEnum)("skill_visibility", [
  "private", // Only owner + assigned groups can use
  "pending_approval", // Owner requested public, awaiting admin approval
  "public", // Admin approved, visible to all tenant users
  "rejected", // Admin rejected public request
]);
// Workflow execution status enum (Section 13)
exports.workflowExecutionStatusEnum = (0, pg_core_1.pgEnum)(
  "workflow_execution_status",
  ["pending", "running", "completed", "failed", "cancelled", "interrupted"]
);
// DLQ item status enum (Section 13)
exports.dlqItemStatusEnum = (0, pg_core_1.pgEnum)("dlq_item_status", [
  "pending",
  "reprocessing",
  "resolved",
  "discarded",
]);
// Media callback reliability enums (Section 01)
exports.mediaCallbackEventStatusEnum = (0, pg_core_1.pgEnum)(
  "media_callback_event_status",
  ["pending", "processing", "retry_pending", "completed", "failed"]
);
exports.mediaCallbackDlqStatusEnum = (0, pg_core_1.pgEnum)(
  "media_callback_dlq_status",
  ["pending", "reprocessed", "discarded"]
);
// Policy action enum (Section 13)
exports.policyActionEnum = (0, pg_core_1.pgEnum)("policy_action", [
  "allow",
  "deny",
  "require_approval",
]);
exports.browserPolicyDecisionEnum = (0, pg_core_1.pgEnum)(
  "browser_policy_decision",
  [
    "allow",
    "allow_with_redaction",
    "require_approval",
    "deny",
    "escalate_for_review",
  ]
);
exports.browserActionClassEnum = (0, pg_core_1.pgEnum)("browser_action_class", [
  "read",
  "draft",
  "commit",
  "restricted",
]);
exports.browserPageSensitivityEnum = (0, pg_core_1.pgEnum)(
  "browser_page_sensitivity",
  [
    "none",
    "auth",
    "financial",
    "admin",
    "sensitive_data",
    "communication",
    "code",
  ]
);
exports.liveBrowserSourceTypeEnum = (0, pg_core_1.pgEnum)(
  "live_browser_source_type",
  ["automation", "workflow", "agency"]
);
exports.liveBrowserSessionStatusEnum = (0, pg_core_1.pgEnum)(
  "live_browser_session_status",
  [
    "created",
    "provisioning",
    "ready",
    "agent_running",
    "waiting_for_human",
    "human_controlling",
    "waiting_for_runtime_recovery",
    "failed_recovery_required",
    "completed",
    "cancelled",
    "failed",
    "expired",
  ]
);
exports.liveBrowserControlModeEnum = (0, pg_core_1.pgEnum)(
  "live_browser_control_mode",
  ["observe", "approve_only", "takeover", "agent_control"]
);
exports.liveBrowserAssistRequestTypeEnum = (0, pg_core_1.pgEnum)(
  "live_browser_assist_request_type",
  ["decision", "field_input", "review_page", "takeover_required"]
);
exports.liveBrowserActorTypeEnum = (0, pg_core_1.pgEnum)(
  "live_browser_actor_type",
  ["agent", "user", "system", "policy"]
);
exports.liveBrowserEventTypeEnum = (0, pg_core_1.pgEnum)(
  "live_browser_event_type",
  [
    "session_created",
    "session_state_changed",
    "stream_ready",
    "frame_updated",
    "url_changed",
    "command_queued",
    "command_started",
    "command_completed",
    "command_failed",
    "assist_requested",
    "assist_resolved",
    "approval_requested",
    "approval_resolved",
    "takeover_started",
    "takeover_lease_expiring",
    "takeover_ended",
    "incident",
    "agent_started",
    "agent_resumed",
    "navigation_completed",
    "session_completed",
    "session_failed",
  ]
);
// Credit source type enum — categorizes what generated a credit transaction
exports.creditSourceTypeEnum = (0, pg_core_1.pgEnum)("credit_source_type", [
  "chat",
  "skill",
  "media_image",
  "media_video",
  "media_audio",
  "indexing",
  "rag",
  "stt",
  "translation",
  "brainstorm",
  "scheduler",
  "admin",
  "agency",
  "creator_revenue",
  "other",
  // ClawFeature additions
  "tts",
  "browser_automation",
  "worker_runtime",
  "widget_chat",
  "webhook_chat",
  "webhook_trigger",
  // Public API (feature 043)
  "api_skill",
  "api_agency",
  "api_job",
  "api_media",
  "api_presentation",
  "api_video_project",
  "api_chat",
  "api_mcp",
]);
// Settlement status for creator revenue sharing
exports.settlementStatusEnum = (0, pg_core_1.pgEnum)("settlement_status", [
  "completed",
  "partial",
  "skipped",
]);
// Google Drive indexing mode enum
exports.indexingModeEnum = (0, pg_core_1.pgEnum)("indexing_mode", [
  "none",
  "selected_folders",
  "all_except",
  "all",
]);
// Google Drive edit session status enum
exports.editSessionStatusEnum = (0, pg_core_1.pgEnum)("edit_session_status", [
  "active",
  "saved_back",
  "discarded",
  "expired",
]);
// OpenSandbox enums
exports.sandboxExecutionModeEnum = (0, pg_core_1.pgEnum)(
  "sandbox_execution_mode",
  ["code", "command", "browser", "file", "media"]
);
exports.sandboxJobStatusEnum = (0, pg_core_1.pgEnum)("sandbox_job_status", [
  "accepted",
  "policy_resolved",
  "queued",
  "provisioning",
  "staging_inputs",
  "executing",
  "collecting_outputs",
  "persisting",
  "completed",
  "failed",
  "timed_out",
  "canceled",
]);
exports.sandboxArtifactTypeEnum = (0, pg_core_1.pgEnum)(
  "sandbox_artifact_type",
  ["primary", "log", "screenshot", "thumbnail", "chunk", "debug"]
);
exports.sandboxNetworkActionEnum = (0, pg_core_1.pgEnum)(
  "sandbox_network_action",
  ["deny", "allow"]
);
exports.sandboxFeatureTypeEnum = (0, pg_core_1.pgEnum)("sandbox_feature_type", [
  "chat",
  "skill",
  "workflow",
  "library",
  "media",
  "presentation",
  "connector",
  "agency",
]);
exports.desktopDeviceHealthStatusEnum = (0, pg_core_1.pgEnum)(
  "desktop_device_health_status",
  ["online", "offline", "unhealthy", "disabled"]
);
/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
exports.users = (0, pg_core_1.pgTable)("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: (0, pg_core_1.varchar)("openId", { length: 64 }).notNull().unique(),
  name: (0, pg_core_1.text)("name"),
  email: (0, pg_core_1.varchar)("email", { length: 320 }),
  /** Password hash for local login (optional, null for OAuth-only users) */
  password: (0, pg_core_1.text)("password"),
  loginMethod: (0, pg_core_1.varchar)("loginMethod", { length: 64 }),
  role: (0, exports.roleEnum)("role").default("user").notNull(),
  /** Domain where user registered (locked, only admin can change) */
  registeredDomain: (0, pg_core_1.varchar)("registeredDomain", { length: 255 }),
  /** Current tenant ID (for quick access) */
  currentTenantId: (0, pg_core_1.integer)("currentTenantId").references(
    function () {
      return exports.tenants.id;
    }
  ),
  /** User's credit balance (in smallest unit, e.g., 1 credit = 100 units for precision) */
  credits: (0, pg_core_1.integer)("credits").default(0).notNull(),
  /** User's subscription plan */
  plan: (0, exports.planEnum)("plan").default("free").notNull(),
  /** Whether user account is disabled (can be managed by domain admin) */
  isDisabled: (0, pg_core_1.boolean)("isDisabled").default(false).notNull(),
  /** Normalized email for duplicate detection (Gmail dots stripped, + aliases removed) */
  normalizedEmail: (0, pg_core_1.varchar)("normalizedEmail", { length: 320 }),
  /** Trust score 0-100, calculated at registration (100 = fully trusted) */
  trustScore: (0, pg_core_1.integer)("trustScore").default(100),
  /** IP address used during registration */
  registrationIp: (0, pg_core_1.varchar)("registrationIp", { length: 45 }),
  /** User preferences (translation language, translation model, etc.) */
  userPreferences: (0, pg_core_1.json)("userPreferences").$type().default({}),
  // Recovery contacts
  backupEmail: (0, pg_core_1.varchar)("backupEmail", { length: 320 }),
  backupEmailVerified: (0, pg_core_1.boolean)("backupEmailVerified")
    .default(false)
    .notNull(),
  phone: (0, pg_core_1.varchar)("phone", { length: 20 }),
  phoneVerified: (0, pg_core_1.boolean)("phoneVerified")
    .default(false)
    .notNull(),
  // Telegram account linking
  telegramChatId: (0, pg_core_1.varchar)("telegramChatId", { length: 64 }),
  telegramUsername: (0, pg_core_1.varchar)("telegramUsername", { length: 64 }),
  telegramVerified: (0, pg_core_1.boolean)("telegramVerified")
    .default(false)
    .notNull(),
  telegramVerifiedAt: (0, pg_core_1.timestamp)("telegramVerifiedAt", {
    withTimezone: true,
  }),
  // Two-Factor Authentication
  twoFactorEnabled: (0, pg_core_1.boolean)("twoFactorEnabled")
    .default(false)
    .notNull(),
  twoFactorSecret: (0, pg_core_1.text)("twoFactorSecret"), // encrypted TOTP secret (base32)
  recoveryCodes: (0, pg_core_1.json)("recoveryCodes").$type().default([]), // bcrypt-hashed one-time codes
  /** Default AI persona for this user */
  defaultPersonaId: (0, pg_core_1.varchar)("defaultPersonaId", {
    length: 36,
  }).references(
    function () {
      return exports.personaTemplates.id;
    },
    { onDelete: "set null" }
  ),
  /** Whether this is a system/virtual user (not a human login) */
  isSystemUser: (0, pg_core_1.boolean)("isSystemUser").default(false),
  /** PDPA/GDPR voice consent: NULL = not consented, timestamp = when consent was given */
  voiceConsentGrantedAt: (0, pg_core_1.timestamp)("voiceConsentGrantedAt", {
    withTimezone: true,
  }),
  /** Invite code used during registration */
  referredByInviteCodeId: (0, pg_core_1.integer)(
    "referredByInviteCodeId"
  ).references(
    function () {
      return exports.inviteCodes.id;
    },
    { onDelete: "set null" }
  ),
  /** Reason for account disable (null = not disabled or no specific reason) */
  disabledReason: (0, pg_core_1.varchar)("disabledReason", { length: 64 }),
  /** Last time user consumed credits (for inactivity detection) */
  lastCreditUsedAt: (0, pg_core_1.timestamp)("lastCreditUsedAt", {
    withTimezone: true,
  }),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSignedIn: (0, pg_core_1.timestamp)("lastSignedIn", { withTimezone: true })
    .defaultNow()
    .notNull(),
  passwordChangedAt: (0, pg_core_1.timestamp)("passwordChangedAt", {
    withTimezone: true,
  }),
});
/**
 * Credit transactions table - tracks all credit movements
 * Used for billing, usage tracking, and audit trail
 */
exports.creditTransactions = (0, pg_core_1.pgTable)(
  "credit_transactions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** User who owns this transaction */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    /** Amount of credits (positive for additions, negative for deductions) */
    amount: (0, pg_core_1.integer)("amount").notNull(),
    /** Transaction type */
    type: (0, exports.transactionTypeEnum)("type").notNull(),
    /** Human-readable description */
    description: (0, pg_core_1.varchar)("description", { length: 512 }),
    /** Additional metadata (model used, tokens, cost, etc.) */
    metadata: (0, pg_core_1.json)("metadata").$type(),
    /** Balance after this transaction */
    balanceAfter: (0, pg_core_1.integer)("balanceAfter").notNull(),
    /** Reference ID for external systems (e.g., Stripe payment ID) */
    referenceId: (0, pg_core_1.varchar)("referenceId", { length: 128 }),
    /** Idempotency key to prevent duplicate charges for the same operation */
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 256 }),
    /** Trace ID linking to providerUsageLog and apiAuditEvents for audit trail */
    traceId: (0, pg_core_1.varchar)("traceId", { length: 32 }),
    /** Conversation this transaction belongs to (nullable — not all transactions come from conversations) */
    conversationId: (0, pg_core_1.integer)("conversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    /** Skill slug used for this transaction (nullable) */
    skillSlug: (0, pg_core_1.varchar)("skillSlug", { length: 128 }),
    /** Source type categorizing what generated this transaction */
    sourceType: (0, exports.creditSourceTypeEnum)("sourceType"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("credit_transactions_idempotency_key_unique")
        .on(t.idempotencyKey)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_1 ||
              (templateObject_1 = __makeTemplateObject(
                ['"idempotencyKey" IS NOT NULL'],
                ['"idempotencyKey" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.index)("credit_transactions_type_created_idx").on(
        t.type,
        t.createdAt
      ),
      (0, pg_core_1.index)("credit_transactions_trace_id_idx").on(t.traceId),
      (0, pg_core_1.index)("credit_transactions_conversation_id_idx").on(
        t.conversationId
      ),
      (0, pg_core_1.index)("credit_transactions_source_type_idx").on(
        t.sourceType
      ),
    ];
  }
);
/**
 * Credit packages available for purchase
 * Supports both one-time purchases and subscription plans with multiple billing periods
 */
exports.creditPackages = (0, pg_core_1.pgTable)("credit_packages", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Package name */
  name: (0, pg_core_1.varchar)("name", { length: 128 }).notNull(),
  /** Package description */
  description: (0, pg_core_1.text)("description"),
  /** Number of credits in package (for one-time) or monthly credits (for subscription) */
  credits: (0, pg_core_1.integer)("credits").notNull(),
  /** Price in USD (stored as numeric for precision) - base monthly price for subscriptions */
  priceUsd: (0, pg_core_1.numeric)("priceUsd", {
    precision: 10,
    scale: 2,
  }).notNull(),
  /** Package type: one_time or subscription */
  packageType: (0, exports.packageTypeEnum)("packageType")
    .default("one_time")
    .notNull(),
  /** Billing period for subscription packages (null for one-time) */
  billingPeriod: (0, exports.billingPeriodEnum)("billingPeriod"),
  /** Discount percentage for non-monthly billing (e.g., 5 for quarterly, 7 for semi-annual, 10 for yearly) */
  discountPercent: (0, pg_core_1.integer)("discountPercent").default(0),
  /** Stripe Price ID for checkout (monthly for subscriptions) */
  stripePriceId: (0, pg_core_1.varchar)("stripePriceId", { length: 128 }),
  /** Stripe Product ID (for managing multiple prices per product) */
  stripeProductId: (0, pg_core_1.varchar)("stripeProductId", { length: 128 }),
  /** Stripe Price IDs for different billing periods (JSON object) */
  stripePriceIds: (0, pg_core_1.json)("stripePriceIds").$type(),
  /** Whether package is active/available */
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  /** Whether this is a featured/popular package */
  isFeatured: (0, pg_core_1.boolean)("isFeatured").default(false).notNull(),
  /** Sort order for display */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Gallery items table - stores images, videos, and website demos
 * Supports 3 content types with different aspect ratios
 */
exports.galleryItems = (0, pg_core_1.pgTable)("gallery_items", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Tenant ID - for multi-tenant isolation */
  tenantId: (0, pg_core_1.integer)("tenantId").references(
    function () {
      return exports.tenants.id;
    },
    { onDelete: "cascade" }
  ),
  /** Content type: image, video, or website */
  type: (0, exports.contentTypeEnum)("type").notNull(),
  /** Title of the gallery item */
  title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
  /** Description of the item */
  description: (0, pg_core_1.text)("description"),
  /** Aspect ratio: 1:1, 9:16, or 16:9 */
  aspectRatio: (0, exports.aspectRatioEnum)("aspectRatio").notNull(),
  /** S3/R2 file key for the main content */
  fileKey: (0, pg_core_1.varchar)("fileKey", { length: 512 }),
  /** Public URL for the main content */
  fileUrl: (0, pg_core_1.varchar)("fileUrl", { length: 1024 }),
  /** S3/R2 file key for thumbnail */
  thumbnailKey: (0, pg_core_1.varchar)("thumbnailKey", { length: 512 }),
  /** Public URL for thumbnail */
  thumbnailUrl: (0, pg_core_1.varchar)("thumbnailUrl", { length: 1024 }),
  /** For videos: duration in format "M:SS" */
  duration: (0, pg_core_1.varchar)("duration", { length: 10 }),
  /** For websites: demo URL (subdomain link) */
  demoUrl: (0, pg_core_1.varchar)("demoUrl", { length: 512 }),
  /** Tags for filtering and SEO (stored as JSON array) */
  tags: (0, pg_core_1.json)("tags").$type(),
  /** AI model used to generate this content */
  model: (0, pg_core_1.varchar)("model", { length: 128 }),
  /** View count */
  views: (0, pg_core_1.integer)("views").default(0).notNull(),
  /** Like count */
  likes: (0, pg_core_1.integer)("likes").default(0).notNull(),
  /** Download count (for images) */
  downloads: (0, pg_core_1.integer)("downloads").default(0).notNull(),
  /** Whether the item is published/visible */
  isPublished: (0, pg_core_1.boolean)("isPublished").default(true).notNull(),
  /** Whether the item is featured */
  isFeatured: (0, pg_core_1.boolean)("isFeatured").default(false).notNull(),
  /** Author/creator user ID */
  authorId: (0, pg_core_1.integer)("authorId").references(function () {
    return exports.users.id;
  }),
  /** Author name (for display, can be custom) */
  authorName: (0, pg_core_1.varchar)("authorName", { length: 255 }),
  /** Author avatar URL */
  authorAvatar: (0, pg_core_1.varchar)("authorAvatar", { length: 512 }),
  /** Sort order for manual ordering */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * LLM Provider configurations
 * Stores API keys and settings for various LLM providers
 */
exports.llmProviders = (0, pg_core_1.pgTable)("llm_providers", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Provider identifier (e.g., openai, anthropic, groq) */
  providerName: (0, pg_core_1.varchar)("providerName", { length: 64 })
    .notNull()
    .unique(),
  /** Display name for UI */
  displayName: (0, pg_core_1.varchar)("displayName", { length: 128 }).notNull(),
  /** Provider description */
  description: (0, pg_core_1.text)("description"),
  /** API base URL */
  baseUrl: (0, pg_core_1.varchar)("baseUrl", { length: 512 }),
  /** Encrypted API key (stored securely) */
  apiKeyEncrypted: (0, pg_core_1.text)("apiKeyEncrypted"),
  /** Whether API key is set (without exposing the key) */
  hasApiKey: (0, pg_core_1.boolean)("hasApiKey").default(false).notNull(),
  /** Default model for this provider */
  defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 128 }),
  /** Available models (JSON array) */
  availableModels: (0, pg_core_1.json)("availableModels").$type(),
  /** Additional configuration */
  configJson: (0, pg_core_1.json)("configJson").$type(),
  /** Whether provider is enabled */
  isEnabled: (0, pg_core_1.boolean)("isEnabled").default(false).notNull(),
  /** Sort order for display */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  /** Provider classification: 'primary', 'secondary', 'fallback' */
  providerType: (0, pg_core_1.varchar)("providerType", { length: 32 })
    .default("primary")
    .notNull(),
  /** Health status managed by circuit breaker, persisted for dashboard and startup seeding */
  healthStatus: (0, pg_core_1.varchar)("healthStatus", { length: 32 })
    .default("healthy")
    .notNull(),
  /** Last time health was evaluated */
  lastHealthCheck: (0, pg_core_1.timestamp)("lastHealthCheck", {
    withTimezone: true,
  }),
  /** Rolling failure count */
  failureCount: (0, pg_core_1.integer)("failureCount").default(0).notNull(),
  /** Rolling success count */
  successCount: (0, pg_core_1.integer)("successCount").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Model-to-provider mapping
 * Maps which providers offer which models, replacing the availableModels JSON approach
 */
exports.modelProviderMap = (0, pg_core_1.pgTable)(
  "model_provider_map",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Canonical model identifier used internally by frontend/routing */
    modelId: (0, pg_core_1.varchar)("modelId", { length: 128 }).notNull(),
    /** Foreign key to llm_providers */
    providerId: (0, pg_core_1.integer)("providerId")
      .notNull()
      .references(function () {
        return exports.llmProviders.id;
      }),
    /** Human-readable display name */
    modelName: (0, pg_core_1.varchar)("modelName", { length: 128 }).notNull(),
    /** Provider-specific model string sent in API requests */
    providerModelId: (0, pg_core_1.varchar)("providerModelId", {
      length: 256,
    }).notNull(),
    /** Historical modelId aliases preserved when duplicate upstream mappings are consolidated */
    legacyModelAliases: (0, pg_core_1.jsonb)("legacyModelAliases")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_2 ||
            (templateObject_2 = __makeTemplateObject(
              ["'[]'::jsonb"],
              ["'[]'::jsonb"]
            ))
        )
      )
      .notNull(),
    /** Cost per 1M input tokens (0 for free) */
    pricingInput: (0, pg_core_1.numeric)("pricingInput", {
      precision: 12,
      scale: 8,
    })
      .default("0")
      .notNull(),
    /** Cost per 1M output tokens (0 for free) */
    pricingOutput: (0, pg_core_1.numeric)("pricingOutput", {
      precision: 12,
      scale: 8,
    })
      .default("0")
      .notNull(),
    /** Whether this model is free to use */
    isFree: (0, pg_core_1.boolean)("isFree").default(false).notNull(),
    /** Maximum context window size */
    contextLength: (0, pg_core_1.integer)("contextLength"),
    // ── Capability metadata (for planner-based model selection) ──
    /** Supports OpenAI Responses API */
    supportsResponses: (0, pg_core_1.boolean)("supportsResponses").default(
      false
    ),
    /** Supports strict schema-constrained final responses */
    supportsStructuredOutputs: (0, pg_core_1.boolean)(
      "supportsStructuredOutputs"
    ).default(false),
    /** Supports valid JSON mode without strict schema adherence */
    supportsJsonMode: (0, pg_core_1.boolean)("supportsJsonMode").default(false),
    /** Supports strict schema validation for tool/function arguments */
    supportsStrictToolSchema: (0, pg_core_1.boolean)(
      "supportsStrictToolSchema"
    ).default(false),
    /** Supports built-in web search */
    supportsWebSearch: (0, pg_core_1.boolean)("supportsWebSearch").default(
      false
    ),
    /** Supports function/tool calling */
    supportsFunctionTools: (0, pg_core_1.boolean)(
      "supportsFunctionTools"
    ).default(false),
    /** Supports code execution sandbox */
    supportsCodeExecution: (0, pg_core_1.boolean)(
      "supportsCodeExecution"
    ).default(false),
    /** Supports computer use / browser automation */
    supportsComputerUse: (0, pg_core_1.boolean)("supportsComputerUse").default(
      false
    ),
    /** Supports background/async processing */
    supportsBackground: (0, pg_core_1.boolean)("supportsBackground").default(
      false
    ),
    /** Supports vision / image input */
    supportsVision: (0, pg_core_1.boolean)("supportsVision").default(false),
    /** Supports thinking/reasoning mode (chain-of-thought) */
    supportsThinking: (0, pg_core_1.boolean)("supportsThinking").default(false),
    /** Whether priority was manually set by admin (locks against auto-reassignment) */
    priorityLocked: (0, pg_core_1.boolean)("priorityLocked").default(false),
    /** Whether this mapping is active */
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    /** Lower = higher priority within this provider */
    priority: (0, pg_core_1.integer)("priority").default(0).notNull(),
    /** API style for endpoint routing (only used for providers like OpenCode Zen with multiple endpoints) */
    apiStyle: (0, exports.apiStyleEnum)("apiStyle")
      .default("chat-completions")
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("model_provider_map_unique").on(
        t.modelId,
        t.providerId
      ),
      (0, pg_core_1.uniqueIndex)("model_provider_map_provider_model_unique").on(
        t.providerId,
        t.providerModelId
      ),
    ];
  }
);
/**
 * Provider usage log
 * Per-request tracking for dashboards and cost reconciliation
 */
exports.providerUsageLog = (0, pg_core_1.pgTable)(
  "provider_usage_log",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    providerId: (0, pg_core_1.integer)("providerId")
      .notNull()
      .references(function () {
        return exports.llmProviders.id;
      }),
    modelUsed: (0, pg_core_1.varchar)("modelUsed", { length: 128 }).notNull(),
    inputTokens: (0, pg_core_1.integer)("inputTokens").default(0).notNull(),
    outputTokens: (0, pg_core_1.integer)("outputTokens").default(0).notNull(),
    /** Provider-reported or calculated cost */
    costUsd: (0, pg_core_1.numeric)("costUsd", { precision: 12, scale: 8 })
      .default("0")
      .notNull(),
    creditsCharged: (0, pg_core_1.integer)("creditsCharged")
      .default(0)
      .notNull(),
    responseTimeMs: (0, pg_core_1.integer)("responseTimeMs"),
    statusCode: (0, pg_core_1.integer)("statusCode"),
    /** Error classification: 'rate_limit', 'timeout', 'server_error' */
    errorType: (0, pg_core_1.varchar)("errorType", { length: 64 }),
    /** Audit trace correlation */
    traceId: (0, pg_core_1.varchar)("traceId", { length: 32 }),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    requestType: (0, pg_core_1.varchar)("requestType", { length: 32 }),
    wasFallback: (0, pg_core_1.boolean)("wasFallback").default(false).notNull(),
    fallbackFromProviderId: (0, pg_core_1.integer)(
      "fallbackFromProviderId"
    ).references(function () {
      return exports.llmProviders.id;
    }),
    /** API key that triggered this LLM usage (nullable) */
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("provider_usage_log_user_created").on(
        t.userId,
        t.createdAt
      ),
      (0, pg_core_1.index)("provider_usage_log_provider_created").on(
        t.providerId,
        t.createdAt
      ),
      (0, pg_core_1.index)("provider_usage_log_trace_id").on(t.traceId),
    ];
  }
);
/**
 * API audit events
 * Structured logging for media/skill/LLM requests with trace correlation
 */
exports.apiAuditEvents = (0, pg_core_1.pgTable)(
  "api_audit_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    traceId: (0, pg_core_1.varchar)("traceId", { length: 32 }).notNull(),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 64 }).notNull(),
    userId: (0, pg_core_1.integer)("userId").references(function () {
      return exports.users.id;
    }),
    endpoint: (0, pg_core_1.varchar)("endpoint", { length: 512 }),
    model: (0, pg_core_1.varchar)("model", { length: 128 }),
    provider: (0, pg_core_1.varchar)("provider", { length: 64 }),
    statusCode: (0, pg_core_1.integer)("statusCode"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    responseTimeMs: (0, pg_core_1.integer)("responseTimeMs"),
    creditsCharged: (0, pg_core_1.integer)("creditsCharged").default(0),
    costUsd: (0, pg_core_1.numeric)("costUsd", { precision: 12, scale: 8 }),
    skillSlug: (0, pg_core_1.varchar)("skillSlug", { length: 100 }),
    mediaType: (0, pg_core_1.varchar)("mediaType", { length: 20 }),
    mediaTaskId: (0, pg_core_1.varchar)("mediaTaskId", { length: 128 }),
    metadata: (0, pg_core_1.json)("metadata"),
    /** Associated sandbox job ID */
    sandboxJobId: (0, pg_core_1.varchar)("sandboxJobId", { length: 36 }),
    /** OpenSandbox container ID for correlation */
    opensandboxId: (0, pg_core_1.varchar)("opensandboxId", { length: 128 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("api_audit_events_trace_id").on(t.traceId),
      (0, pg_core_1.index)("api_audit_events_user_created").on(
        t.userId,
        t.createdAt
      ),
      (0, pg_core_1.index)("api_audit_events_type_created").on(
        t.eventType,
        t.createdAt
      ),
    ];
  }
);
/**
 * Routing rules
 * Admin-configured routing preferences per model pattern
 */
exports.routingRules = (0, pg_core_1.pgTable)("routing_rules", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Glob-style pattern: "*", "kimi-*", or exact model ID */
  modelPattern: (0, pg_core_1.varchar)("modelPattern", {
    length: 128,
  }).notNull(),
  /** Routing strategy: 'cost', 'quality', 'priority' */
  routingMode: (0, pg_core_1.varchar)("routingMode", { length: 32 }).notNull(),
  /** Array of provider IDs for priority mode */
  providerOrder: (0, pg_core_1.json)("providerOrder").$type(),
  /** Maximum fallback attempts */
  maxFallbacks: (0, pg_core_1.integer)("maxFallbacks").default(3).notNull(),
  /** Whether this rule is active */
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Tenants table - White Label Multi-Tenant System
 * Each tenant represents a separate branded instance with its own domain
 */
exports.tenants = (0, pg_core_1.pgTable)("tenants", {
  /** Tenant ID (e.g., "tenant-abc123") */
  id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
  /** Unique slug for URL routing (e.g., "smartspec", "acme-corp") */
  slug: (0, pg_core_1.varchar)("slug", { length: 64 }).notNull().unique(),
  /** Tenant display name */
  name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
  /** Primary domain for this tenant (e.g., "smartspec.ai", "acme.com") */
  primaryDomain: (0, pg_core_1.varchar)("primaryDomain", {
    length: 255,
  }).unique(),
  /** Additional domains (JSON array) for multi-domain support */
  domains: (0, pg_core_1.json)("domains").$type(),
  /** Tenant logo URL */
  logoUrl: (0, pg_core_1.varchar)("logoUrl", { length: 512 }),
  /** Website logo URL (larger logo for public pages header/footer) */
  websiteLogoUrl: (0, pg_core_1.varchar)("websiteLogoUrl", { length: 512 }),
  /** Favicon URL */
  faviconUrl: (0, pg_core_1.varchar)("faviconUrl", { length: 512 }),
  /** Whether tenant is active */
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  /** SEO Configuration for this tenant */
  seoConfig: (0, pg_core_1.json)("seoConfig").$type(),
  /** Theme configuration (colors, fonts, layout) */
  themeConfig: (0, pg_core_1.json)("themeConfig").$type(),
  /** Contact information */
  contactInfo: (0, pg_core_1.json)("contactInfo").$type(),
  /** Settings and feature flags */
  settings: (0, pg_core_1.json)("settings").$type(),
  /** Owner/Admin user ID */
  ownerId: (0, pg_core_1.integer)("ownerId").references(function () {
    return exports.users.id;
  }),
  /** Default AI persona for this tenant */
  defaultPersonaId: (0, pg_core_1.varchar)("defaultPersonaId", {
    length: 36,
  }).references(
    function () {
      return exports.personaTemplates.id;
    },
    { onDelete: "set null" }
  ),
  /** Feature flags for this tenant */
  featureFlags: (0, pg_core_1.json)("featureFlags").$type(),
  /** Tenant status (from Python backend) */
  status: (0, pg_core_1.varchar)("status", { length: 20 })
    .notNull()
    .default("ACTIVE"),
  /** Tenant plan (from Python backend) */
  plan: (0, pg_core_1.varchar)("plan", { length: 20 })
    .notNull()
    .default("FREE"),
  /** Created at (snake_case, from Python backend) */
  created_at: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
exports.desktopDevices = (0, pg_core_1.pgTable)(
  "desktop_devices",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    displayName: (0, pg_core_1.varchar)("displayName", {
      length: 255,
    }).notNull(),
    machineName: (0, pg_core_1.varchar)("machineName", { length: 255 }),
    healthStatus: (0, exports.desktopDeviceHealthStatusEnum)("healthStatus")
      .notNull()
      .default("offline"),
    workerProjectionEnabled: (0, pg_core_1.boolean)("workerProjectionEnabled")
      .notNull()
      .default(false),
    projectedWorkerRuntimeType: (0, pg_core_1.varchar)(
      "projectedWorkerRuntimeType",
      { length: 64 }
    ),
    platform: (0, pg_core_1.jsonb)("platform").$type().notNull().default({}),
    capabilitiesJson: (0, pg_core_1.jsonb)("capabilitiesJson")
      .$type()
      .notNull()
      .default({}),
    healthSummaryJson: (0, pg_core_1.jsonb)("healthSummaryJson")
      .$type()
      .notNull()
      .default({}),
    localRootsJson: (0, pg_core_1.jsonb)("localRootsJson")
      .$type()
      .notNull()
      .default([]),
    packageCachePathsJson: (0, pg_core_1.jsonb)("packageCachePathsJson")
      .$type()
      .notNull()
      .default([]),
    packageSyncStateJson: (0, pg_core_1.jsonb)("packageSyncStateJson")
      .$type()
      .notNull()
      .default({}),
    pendingActionsJson: (0, pg_core_1.jsonb)("pendingActionsJson")
      .$type()
      .notNull()
      .default([]),
    currentWorkspaceProfileJson: (0, pg_core_1.jsonb)(
      "currentWorkspaceProfileJson"
    )
      .$type()
      .notNull()
      .default({}),
    lastRunSummaryJson: (0, pg_core_1.jsonb)("lastRunSummaryJson")
      .$type()
      .notNull()
      .default({}),
    accessState: (0, pg_core_1.varchar)("accessState", { length: 32 })
      .notNull()
      .default("active"),
    policyOverridesJson: (0, pg_core_1.jsonb)("policyOverridesJson")
      .$type()
      .notNull()
      .default({}),
    policyCursor: (0, pg_core_1.varchar)("policyCursor", { length: 128 }),
    policyVersion: (0, pg_core_1.varchar)("policyVersion", { length: 128 }),
    policyExpiresAt: (0, pg_core_1.timestamp)("policyExpiresAt", {
      withTimezone: true,
    }),
    warningFlagsJson: (0, pg_core_1.jsonb)("warningFlagsJson")
      .$type()
      .notNull()
      .default([]),
    enrolledAt: (0, pg_core_1.timestamp)("enrolledAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: (0, pg_core_1.timestamp)("lastSeenAt", { withTimezone: true }),
    disabledAt: (0, pg_core_1.timestamp)("disabledAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  function (t) {
    return {
      tenantDeviceIdx: (0, pg_core_1.index)("desktop_devices_tenant_id_idx").on(
        t.tenantId
      ),
      tenantUserIdx: (0, pg_core_1.index)("desktop_devices_tenant_user_idx").on(
        t.tenantId,
        t.userId
      ),
    };
  }
);
/**
 * User Groups - Custom groups for file sharing and collaboration
 */
exports.userGroups = (0, pg_core_1.pgTable)(
  "user_groups",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 128 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    ownerId: (0, pg_core_1.integer)("owner_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    iconUrl: (0, pg_core_1.text)("icon_url"),
    settings: (0, pg_core_1.json)("settings")
      .$type()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_3 ||
            (templateObject_3 = __makeTemplateObject(
              ['\'{"visibility":"private","joinPolicy":"invite_only"}\'::json'],
              ['\'{"visibility":"private","joinPolicy":"invite_only"}\'::json']
            ))
        )
      ),
    memberCount: (0, pg_core_1.integer)("member_count").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { withTimezone: true }),
  },
  function (t) {
    return [
      // Partial unique index - allows recreating deleted group names (namespace collision fix)
      (0, pg_core_1.uniqueIndex)("user_groups_tenant_name_unique")
        .on(t.tenantId, t.name)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_4 ||
              (templateObject_4 = __makeTemplateObject(
                ["deleted_at IS NULL"],
                ["deleted_at IS NULL"]
              ))
          )
        ),
      // Partial indexes for soft-delete performance
      (0, pg_core_1.index)("user_groups_tenant_idx")
        .on(t.tenantId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_5 ||
              (templateObject_5 = __makeTemplateObject(
                ["deleted_at IS NULL"],
                ["deleted_at IS NULL"]
              ))
          )
        ),
      (0, pg_core_1.index)("user_groups_owner_idx")
        .on(t.ownerId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_6 ||
              (templateObject_6 = __makeTemplateObject(
                ["deleted_at IS NULL"],
                ["deleted_at IS NULL"]
              ))
          )
        ),
      (0, pg_core_1.index)("user_groups_visibility_idx")
        .on(
          t.tenantId,
          (0, drizzle_orm_1.sql)(
            templateObject_7 ||
              (templateObject_7 = __makeTemplateObject(
                ["(settings->>'visibility')"],
                ["(settings->>'visibility')"]
              ))
          )
        )
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_8 ||
              (templateObject_8 = __makeTemplateObject(
                ["deleted_at IS NULL"],
                ["deleted_at IS NULL"]
              ))
          )
        ),
    ];
  }
);
/**
 * Group Members - User membership in groups
 */
exports.groupMembers = (0, pg_core_1.pgTable)(
  "group_members",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    groupId: (0, pg_core_1.integer)("group_id")
      .notNull()
      .references(
        function () {
          return exports.userGroups.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    role: (0, pg_core_1.varchar)("role", { length: 32 })
      .notNull()
      .default("member"), // "admin" | "member"
    addedBy: (0, pg_core_1.integer)("added_by").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    status: (0, pg_core_1.varchar)("status", { length: 32 })
      .notNull()
      .default("active"), // "active" | "pending" | "removed"
    joinedAt: (0, pg_core_1.timestamp)("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    removedAt: (0, pg_core_1.timestamp)("removed_at", { withTimezone: true }),
  },
  function (t) {
    return [
      // One membership per user per group
      (0, pg_core_1.uniqueIndex)("group_members_group_user_unique").on(
        t.groupId,
        t.userId
      ),
      // Partial indexes for active memberships only (huge performance gain)
      (0, pg_core_1.index)("group_members_group_active_idx")
        .on(t.groupId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_9 ||
              (templateObject_9 = __makeTemplateObject(
                ["status = 'active'"],
                ["status = 'active'"]
              ))
          )
        ),
      (0, pg_core_1.index)("group_members_user_active_idx")
        .on(t.userId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_10 ||
              (templateObject_10 = __makeTemplateObject(
                ["status = 'active'"],
                ["status = 'active'"]
              ))
          )
        ),
    ];
  }
);
/**
 * Theme Presets - Pre-built themes for domain admins to select
 * Provides quick styling options without manual configuration
 */
exports.themePresets = (0, pg_core_1.pgTable)("theme_presets", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Unique identifier for the theme preset */
  name: (0, pg_core_1.varchar)("name", { length: 128 }).notNull().unique(),
  /** Display name shown in UI */
  displayName: (0, pg_core_1.varchar)("displayName", { length: 255 }).notNull(),
  /** Description of the theme style */
  description: (0, pg_core_1.text)("description"),
  /** Preview image URL for the theme */
  previewImageUrl: (0, pg_core_1.varchar)("previewImageUrl", { length: 512 }),
  /** Theme configuration (colors, layout, etc.) */
  themeConfig: (0, pg_core_1.json)("themeConfig").$type().notNull(),
  /** Whether this preset is available for selection */
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  /** Whether this is the default theme for new tenants */
  isDefault: (0, pg_core_1.boolean)("isDefault").default(false).notNull(),
  /** Sort order for display */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * SEO Metadata - AI-Optimized SEO for pages and content
 * Supports traditional SEO, AIO (AI-Optimized), and GEO targeting
 */
exports.seoMetadata = (0, pg_core_1.pgTable)("seo_metadata", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Tenant this SEO metadata belongs to */
  tenantId: (0, pg_core_1.integer)("tenantId")
    .notNull()
    .references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
  /** Path or entity this metadata applies to (e.g., "/", "/about", "gallery:123") */
  path: (0, pg_core_1.varchar)("path", { length: 512 }).notNull(),
  /** Page title (Traditional SEO) */
  title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
  /** Meta description (Traditional SEO) */
  description: (0, pg_core_1.text)("description"),
  /** Keywords (Traditional SEO) */
  keywords: (0, pg_core_1.json)("keywords").$type(),
  /** Canonical URL */
  canonicalUrl: (0, pg_core_1.varchar)("canonicalUrl", { length: 512 }),
  /** Open Graph metadata */
  ogMetadata: (0, pg_core_1.json)("ogMetadata").$type(),
  /** Twitter Card metadata */
  twitterMetadata: (0, pg_core_1.json)("twitterMetadata").$type(),
  /** AI-Optimized Content (AIO) - Natural language for LLMs */
  aiContent: (0, pg_core_1.json)("aiContent").$type(),
  /** Structured Data (Schema.org) for rich snippets */
  structuredData: (0, pg_core_1.json)("structuredData").$type(),
  /** GEO targeting information */
  geoData: (0, pg_core_1.json)("geoData").$type(),
  /** Content quality signals for LLMs */
  qualitySignals: (0, pg_core_1.json)("qualitySignals").$type(),
  /** Whether this metadata is active */
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Tenant Pages - Domain-specific page content
 * Each tenant can have completely different content for each page
 */
exports.tenantPages = (0, pg_core_1.pgTable)("tenant_pages", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Tenant this page belongs to */
  tenantId: (0, pg_core_1.integer)("tenantId")
    .notNull()
    .references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
  /** Page identifier (e.g., "home", "about", "features", "pricing") */
  pageKey: (0, pg_core_1.varchar)("pageKey", { length: 64 }).notNull(),
  /** Page title */
  title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
  /** Page slug for URL */
  slug: (0, pg_core_1.varchar)("slug", { length: 255 }).notNull(),
  /** Page content (HTML or Markdown) */
  content: (0, pg_core_1.text)("content"),
  /** Structured content sections (JSON) */
  sections: (0, pg_core_1.json)("sections").$type(),
  /** Page metadata */
  metadata: (0, pg_core_1.json)("metadata").$type(),
  /** Whether page is published */
  isPublished: (0, pg_core_1.boolean)("isPublished").default(false).notNull(),
  /** Sort order for menu */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  /** Show in navigation menu */
  showInMenu: (0, pg_core_1.boolean)("showInMenu").default(true).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Chat Conversations - Multi-chat support with settings
 * Each conversation belongs to a user and can have custom settings
 */
exports.conversations = (0, pg_core_1.pgTable)(
  "conversations",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** User who owns this conversation */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Conversation title (auto-generated or user-set) */
    title: (0, pg_core_1.varchar)("title", { length: 255 })
      .notNull()
      .default("New Chat"),
    /** LLM model to use for this conversation */
    model: (0, pg_core_1.varchar)("model", { length: 100 }).default(
      "gpt-4o-mini"
    ),
    /** Temperature setting (0-2) */
    temperature: (0, pg_core_1.numeric)("temperature", {
      precision: 3,
      scale: 2,
    }).default("0.7"),
    /** Custom system prompt */
    systemPrompt: (0, pg_core_1.text)("systemPrompt"),
    /** Skill settings for this conversation */
    skillSettings: (0, pg_core_1.json)("skillSettings")
      .$type()
      .default({ autoDetect: true, enabledSkills: [], detectionMode: "auto" }),
    /** Whether conversation is archived */
    isArchived: (0, pg_core_1.boolean)("isArchived").default(false).notNull(),
    /** Whether conversation is pinned */
    isPinned: (0, pg_core_1.boolean)("isPinned").default(false).notNull(),
    /** Soft-delete: when moved to trash (auto-purged after 30 days) */
    trashedAt: (0, pg_core_1.timestamp)("trashedAt"),
    /** Total credits used in this conversation */
    totalCreditsUsed: (0, pg_core_1.numeric)("totalCreditsUsed", {
      precision: 12,
      scale: 4,
    }).default("0"),
    /** Total messages count */
    messageCount: (0, pg_core_1.integer)("messageCount").default(0).notNull(),
    /** Project ID for cross-session memory linking */
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }),
    /** Memory mode: full | no_long | off */
    memoryMode: (0, pg_core_1.varchar)("memory_mode", { length: 20 }).default(
      "full"
    ),
    /** Brainstorm partner model (Model B) */
    brainstormPartnerModel: (0, pg_core_1.varchar)("brainstormPartnerModel", {
      length: 100,
    }),
    /** Brainstorm max rounds per session */
    brainstormMaxRounds: (0, pg_core_1.integer)("brainstormMaxRounds").default(
      3
    ),
    /** Default policy for attaching external channels to this conversation */
    defaultChannelPolicy: (0, pg_core_1.varchar)("defaultChannelPolicy", {
      length: 20,
    }).default("allow_attach"),
    /** Tenant this conversation belongs to (for multi-tenant isolation) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** AI persona used for this conversation */
    personaId: (0, pg_core_1.varchar)("personaId", { length: 36 }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    /** Origin: 'web', 'api', 'widget' */
    source: (0, pg_core_1.varchar)("source", { length: 20 }).default("web"),
    /** API key that created this conversation (nullable, no FK) */
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }),
    /** Auto-expire API-created conversations */
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [(0, pg_core_1.index)("idx_conversations_tenant").on(t.tenantId)];
  }
);
/**
 * Chat Messages - Individual messages within a conversation
 * Supports multi-modal content (text, images, videos) and artifacts
 */
exports.messages = (0, pg_core_1.pgTable)(
  "messages",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Conversation this message belongs to */
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    /** Message role: user, assistant, or system */
    role: (0, exports.messageRoleEnum)("role").notNull(),
    /** Message content (text) */
    content: (0, pg_core_1.text)("content").notNull(),
    /** Input tokens used */
    inputTokens: (0, pg_core_1.integer)("inputTokens").default(0),
    /** Output tokens used */
    outputTokens: (0, pg_core_1.integer)("outputTokens").default(0),
    /** Credits used for this message */
    creditsUsed: (0, pg_core_1.numeric)("creditsUsed", {
      precision: 10,
      scale: 4,
    }).default("0"),
    /** Model used for this message */
    modelUsed: (0, pg_core_1.varchar)("modelUsed", { length: 100 }),
    /** Attachments (images, files uploaded by user) */
    attachments: (0, pg_core_1.json)("attachments").$type().default([]),
    /** Artifacts extracted from response (code, markdown, media) */
    artifacts: (0, pg_core_1.json)("artifacts").$type().default([]),
    /** Skill that was used (if any) */
    skillUsed: (0, pg_core_1.varchar)("skillUsed", { length: 100 }),
    /** Arguments passed to the skill */
    skillArgs: (0, pg_core_1.json)("skillArgs").$type(),
    /** Error if message generation failed */
    error: (0, pg_core_1.text)("error"),
    /** Whether message was regenerated */
    isRegenerated: (0, pg_core_1.boolean)("isRegenerated").default(false),
    /** Parent message ID (for regenerated messages) */
    parentMessageId: (0, pg_core_1.integer)("parentMessageId"),
    /** Channel that originated this message (web, telegram, system) */
    sourceChannel: (0, pg_core_1.varchar)("sourceChannel", { length: 20 }),
    /** Connection ID for the originating channel (FK to telegram_connections) */
    sourceConnectionId: (0, pg_core_1.varchar)("sourceConnectionId", {
      length: 36,
    }),
    /** External platform message ID (e.g., Telegram message_id) */
    externalSourceId: (0, pg_core_1.varchar)("externalSourceId", {
      length: 64,
    }),
    /** Trace ID for cost correlation with providerUsageLog */
    traceId: (0, pg_core_1.varchar)("traceId", { length: 32 }),
    /** Authoritative runtime disclosure for reload-safe chat badges */
    runtimeMetadata: (0, pg_core_1.jsonb)("runtimeMetadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("messages_created_at_idx").on(t.createdAt),
      (0, pg_core_1.index)("messages_conversation_created_idx").on(
        t.conversationId,
        t.createdAt
      ),
      (0, pg_core_1.index)("idx_messages_traceid").on(t.traceId),
    ];
  }
);
/**
 * Conversation Summaries - LLM-generated summaries for memory management
 * Used to compress old messages while retaining context
 */
exports.conversationSummaries = (0, pg_core_1.pgTable)(
  "conversation_summaries",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Conversation this summary belongs to */
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    /** The generated summary text */
    summary: (0, pg_core_1.text)("summary").notNull(),
    /** Starting message ID that was summarized */
    messageRangeStart: (0, pg_core_1.integer)("messageRangeStart").notNull(),
    /** Ending message ID that was summarized */
    messageRangeEnd: (0, pg_core_1.integer)("messageRangeEnd").notNull(),
    /** Number of messages summarized */
    messageCount: (0, pg_core_1.integer)("messageCount").notNull(),
    /** Tokens used to generate summary */
    tokensUsed: (0, pg_core_1.integer)("tokensUsed"),
    /** Project ID for cross-session summary sharing */
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }),
    /** Number of risky segments skipped during smart summarization */
    skippedRiskyCount: (0, pg_core_1.integer)("skippedRiskyCount").default(0),
    /** IDs of extracted facts that contributed to the summary */
    extractedFactIds: (0, pg_core_1.text)("extractedFactIds").array(),
    /** Whether this summary was generated from a preserved archive */
    hasRawArchive: (0, pg_core_1.boolean)("hasRawArchive").default(false),
    /** Classification metadata for smart summarization */
    classificationStats: (0, pg_core_1.jsonb)("classificationStats"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
/**
 * Message Chunks - Conversation segments prepared for vector + keyword retrieval
 * Stored separately from messages so async embedding and search can run safely.
 */
exports.messageChunks = (0, pg_core_1.pgTable)(
  "message_chunks",
  {
    id: (0, pg_core_1.text)("id")
      .primaryKey()
      .$defaultFn(function () {
        return crypto.randomUUID();
      }),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    messageRangeStart: (0, pg_core_1.integer)("messageRangeStart").notNull(),
    messageRangeEnd: (0, pg_core_1.integer)("messageRangeEnd").notNull(),
    chunkIndex: (0, pg_core_1.integer)("chunkIndex").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    tokenCount: (0, pg_core_1.integer)("tokenCount").notNull(),
    embedding: vector1536("embedding"),
    projectId: (0, pg_core_1.varchar)("projectId", { length: 100 }),
    personaId: (0, pg_core_1.varchar)("personaId", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("message_chunks_conv_chunk_idx").on(
        t.conversationId,
        t.chunkIndex
      ),
      (0, pg_core_1.index)("message_chunks_tenant_user_idx").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.index)("message_chunks_created_idx").on(t.createdAt),
      (0, pg_core_1.index)("message_chunks_tenant_project_idx").on(
        t.tenantId,
        t.projectId
      ),
    ];
  }
);
/**
 * Memory Archive Metadata - File-backed chat archives for raw conversation preservation.
 */
exports.memoryArchiveMetadata = (0, pg_core_1.pgTable)(
  "memory_archive_metadata",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    archiveDate: (0, pg_core_1.varchar)("archiveDate", {
      length: 10,
    }).notNull(),
    filePath: (0, pg_core_1.text)("filePath").notNull(),
    messageCount: (0, pg_core_1.integer)("messageCount").default(0),
    fileSizeBytes: (0, pg_core_1.integer)("fileSizeBytes").default(0),
    encryptionVersion: (0, pg_core_1.integer)("encryptionVersion").default(1),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("memory_archive_conv_date_idx").on(
        t.conversationId,
        t.archiveDate
      ),
    ];
  }
);
/**
 * Entity Memories - Long-term facts about users, projects, and preferences
 * Persists across conversations and provides personalized context
 */
exports.entityMemories = (0, pg_core_1.pgTable)(
  "entity_memories",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** User this memory belongs to */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Persona scope for this memory; null means shared/legacy memory */
    personaId: (0, pg_core_1.varchar)("personaId", { length: 36 }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    /** Type of entity: user, project, preference, technical */
    entityType: (0, exports.entityTypeEnum)("entityType").notNull(),
    /** Name of the entity (e.g., "SmartSpecPro", "coding style") */
    entityName: (0, pg_core_1.varchar)("entityName", { length: 255 }).notNull(),
    /** Facts about the entity (JSON array of strings) */
    facts: (0, pg_core_1.json)("facts").$type().notNull().default([]),
    /** Source conversation ID (where fact was learned) */
    sourceConversationId: (0, pg_core_1.integer)(
      "sourceConversationId"
    ).references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    /** Project scope — null means global (user-level) memory */
    projectId: (0, pg_core_1.varchar)("projectId", { length: 100 }),
    /** Confidence score (0-1) */
    confidence: (0, pg_core_1.numeric)("confidence", {
      precision: 3,
      scale: 2,
    }).default("0.8"),
    /** Last time this memory was accessed */
    lastAccessedAt: (0, pg_core_1.timestamp)("lastAccessedAt", {
      withTimezone: true,
    }).defaultNow(),
    /** Importance score (1-10) */
    importance: (0, pg_core_1.integer)("importance").default(5),
    /** Source: 'auto', 'manual', 'suggested' */
    source: (0, pg_core_1.varchar)("source", { length: 20 }).default("auto"),
    /** Number of times this memory was reinforced */
    reinforcementCount: (0, pg_core_1.integer)("reinforcementCount").default(1),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("entity_memories_user_persona_idx").on(
        t.userId,
        t.personaId
      ),
    ];
  }
);
/**
 * Skill Preferences - Per-conversation skill settings
 * Allows users to enable/disable specific skills for each conversation
 */
exports.skillPreferences = (0, pg_core_1.pgTable)("skill_preferences", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Conversation this preference belongs to */
  conversationId: (0, pg_core_1.integer)("conversationId")
    .notNull()
    .references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "cascade" }
    ),
  /** Skill identifier */
  skillId: (0, pg_core_1.varchar)("skillId", { length: 100 }).notNull(),
  /** Whether skill is enabled */
  enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
  /** Priority for skill detection (higher = checked first) */
  priority: (0, pg_core_1.integer)("priority").default(0).notNull(),
  /** Custom settings for this skill */
  customSettings: (0, pg_core_1.json)("customSettings").$type(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Media Provider Type Enum
 * Defines the types of media that each provider can generate
 */
exports.mediaProviderTypeEnum = (0, pg_core_1.pgEnum)("media_provider_type", [
  "image",
  "video",
  "audio",
  "multimodal",
]);
/**
 * Media Providers - Configuration for media generation services
 * Stores API keys and settings for providers like Kie AI, fal.ai, etc.
 */
exports.mediaProviders = (0, pg_core_1.pgTable)("media_providers", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Provider identifier (e.g., kie_ai, fal_ai, replicate) */
  providerName: (0, pg_core_1.varchar)("providerName", { length: 64 })
    .notNull()
    .unique(),
  /** Display name for UI */
  displayName: (0, pg_core_1.varchar)("displayName", { length: 128 }).notNull(),
  /** Provider description */
  description: (0, pg_core_1.text)("description"),
  /** Type of media this provider handles */
  providerType: (0, exports.mediaProviderTypeEnum)("providerType")
    .notNull()
    .default("multimodal"),
  /** API base URL */
  baseUrl: (0, pg_core_1.varchar)("baseUrl", { length: 512 }),
  /** Callback URL for async operations (e.g., Kie.ai task completion webhook) */
  callbackUrl: (0, pg_core_1.varchar)("callbackUrl", { length: 512 }),
  /** Encrypted API key (stored securely) */
  apiKeyEncrypted: (0, pg_core_1.text)("apiKeyEncrypted"),
  /** Whether API key is set (without exposing the key) */
  hasApiKey: (0, pg_core_1.boolean)("hasApiKey").default(false).notNull(),
  /** Available models/services (JSON array) */
  availableModels: (0, pg_core_1.json)("availableModels").$type(),
  /** Default model for this provider */
  defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 128 }),
  /** Additional configuration */
  configJson: (0, pg_core_1.json)("configJson").$type(),
  /** Whether provider is enabled */
  isEnabled: (0, pg_core_1.boolean)("isEnabled").default(false).notNull(),
  /** Whether this is the primary provider for its type */
  isPrimary: (0, pg_core_1.boolean)("isPrimary").default(false).notNull(),
  /** Priority order (lower = higher priority, used for failover) */
  priority: (0, pg_core_1.integer)("priority").default(0).notNull(),
  /** Sort order for display */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  /** Last successful connection test */
  lastTestedAt: (0, pg_core_1.timestamp)("lastTestedAt", {
    withTimezone: true,
  }),
  /** Last test result */
  lastTestResult: (0, pg_core_1.json)("lastTestResult").$type(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Media Model Type Enum
 * Defines what type of media this model generates
 */
exports.mediaModelTypeEnum = (0, pg_core_1.pgEnum)("media_model_type", [
  "image",
  "video",
  "audio",
]);
/**
 * Media Models - Configuration for AI generation models
 * Centralized registry of all available models (Nano Banana Pro, Flux, Veo, etc.)
 */
exports.mediaModels = (0, pg_core_1.pgTable)("media_models", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Model identifier (e.g., google-nano-banana-pro, flux-2.0) */
  modelId: (0, pg_core_1.varchar)("modelId", { length: 128 })
    .notNull()
    .unique(),
  /** Display name for UI */
  name: (0, pg_core_1.varchar)("name", { length: 128 }).notNull(),
  /** Model description */
  description: (0, pg_core_1.text)("description"),
  /** Type of media this model generates */
  modelType: (0, exports.mediaModelTypeEnum)("modelType").notNull(),
  /** Provider name (e.g., kie.ai, fal.ai) */
  provider: (0, pg_core_1.varchar)("provider", { length: 64 }).notNull(),
  /** Aliases for natural language detection (JSON array) */
  aliases: (0, pg_core_1.json)("aliases").$type().default([]),
  /** Credit cost per generation */
  creditCost: (0, pg_core_1.integer)("creditCost").notNull().default(10),
  /** Supported aspect ratios (JSON array) */
  aspectRatios: (0, pg_core_1.json)("aspectRatios").$type(),
  /** Supported sizes (JSON array) */
  sizes: (0, pg_core_1.json)("sizes").$type(),
  /** Supported durations for video (JSON array of numbers) */
  durations: (0, pg_core_1.json)("durations").$type(),
  /** Supported voices for audio (JSON array) */
  voices: (0, pg_core_1.json)("voices").$type(),
  /** Additional configuration */
  configJson: (0, pg_core_1.json)("configJson").$type(),
  /** Whether model is enabled */
  isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
  /** Priority for selection (lower = higher priority) */
  priority: (0, pg_core_1.integer)("priority").default(99).notNull(),
  /** Sort order for display */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Durable callback event log for media provider webhooks.
 * Enables idempotent processing and retry scheduling.
 */
exports.mediaCallbackEvents = (0, pg_core_1.pgTable)(
  "media_callback_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    providerName: (0, pg_core_1.varchar)("provider_name", { length: 64 })
      .notNull()
      .default("kie_ai"),
    providerTaskId: (0, pg_core_1.varchar)("provider_task_id", { length: 128 }),
    eventFingerprint: (0, pg_core_1.varchar)("event_fingerprint", {
      length: 64,
    })
      .notNull()
      .unique(),
    payload: (0, pg_core_1.json)("payload").$type().notNull().default({}),
    normalizedStatus: (0, pg_core_1.varchar)("normalized_status", {
      length: 32,
    }),
    resultUrl: (0, pg_core_1.text)("result_url"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    status: (0, exports.mediaCallbackEventStatusEnum)("status")
      .notNull()
      .default("pending"),
    attemptCount: (0, pg_core_1.integer)("attempt_count").notNull().default(0),
    maxAttempts: (0, pg_core_1.integer)("max_attempts").notNull().default(5),
    nextRetryAt: (0, pg_core_1.timestamp)("next_retry_at", {
      withTimezone: true,
    }),
    processedAt: (0, pg_core_1.timestamp)("processed_at", {
      withTimezone: true,
    }),
    /** Associated sandbox job ID (if media was processed in sandbox) */
    sandboxJobId: (0, pg_core_1.varchar)("sandbox_job_id", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("media_callback_events_provider_task_idx").on(
        t.providerTaskId
      ),
      (0, pg_core_1.index)("media_callback_events_status_retry_idx").on(
        t.status,
        t.nextRetryAt
      ),
      (0, pg_core_1.index)("media_callback_events_provider_status_idx").on(
        t.providerTaskId,
        t.status
      ),
      (0, pg_core_1.index)("media_callback_events_tenant_status_retry_idx").on(
        t.tenantId,
        t.status,
        t.nextRetryAt
      ),
    ];
  }
);
/**
 * Media callback dead-letter entries for terminal callback processing failures.
 */
exports.mediaCallbackDlq = (0, pg_core_1.pgTable)(
  "media_callback_dlq",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    eventId: (0, pg_core_1.integer)("event_id").references(
      function () {
        return exports.mediaCallbackEvents.id;
      },
      { onDelete: "set null" }
    ),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    providerName: (0, pg_core_1.varchar)("provider_name", { length: 64 })
      .notNull()
      .default("kie_ai"),
    providerTaskId: (0, pg_core_1.varchar)("provider_task_id", { length: 128 }),
    eventFingerprint: (0, pg_core_1.varchar)("event_fingerprint", {
      length: 64,
    }).notNull(),
    payload: (0, pg_core_1.json)("payload").$type().notNull().default({}),
    errorMessage: (0, pg_core_1.text)("error_message").notNull(),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    status: (0, exports.mediaCallbackDlqStatusEnum)("status")
      .notNull()
      .default("pending"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("media_callback_dlq_event_idx").on(t.eventId),
      (0, pg_core_1.index)("media_callback_dlq_provider_task_idx").on(
        t.providerTaskId
      ),
      (0, pg_core_1.index)("media_callback_dlq_status_idx").on(t.status),
      (0, pg_core_1.index)("media_callback_dlq_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
    ];
  }
);
/**
 * Unified library schema (Section 02)
 * Shared for media/document assets and RAG indexing lifecycle.
 */
exports.libraryItemStatusEnum = (0, pg_core_1.pgEnum)("library_item_status", [
  "draft",
  "ready",
  "indexing",
  "archived",
  "failed",
]);
exports.libraryVisibilityEnum = (0, pg_core_1.pgEnum)("library_visibility", [
  "private",
  "team",
  "public",
]);
exports.libraryIndexJobStatusEnum = (0, pg_core_1.pgEnum)(
  "library_index_job_status",
  ["pending", "processing", "retry_pending", "completed", "failed"]
);
exports.financeTransactionTypeEnum = (0, pg_core_1.pgEnum)(
  "finance_transaction_type",
  ["income", "expense", "transfer"]
);
exports.financeTransactionStatusEnum = (0, pg_core_1.pgEnum)(
  "finance_transaction_status",
  ["draft", "confirmed", "voided"]
);
exports.financeDraftStatusEnum = (0, pg_core_1.pgEnum)("finance_draft_status", [
  "draft",
  "confirmed",
  "expired",
  "cancelled",
]);
exports.financeRecurringRuleStatusEnum = (0, pg_core_1.pgEnum)(
  "finance_recurring_rule_status",
  ["active", "paused", "ended"]
);
exports.financeSourceEnum = (0, pg_core_1.pgEnum)("finance_source", [
  "chat_text",
  "ocr_document",
  "import",
  "api",
  "recurring_rule",
]);
exports.financeDocumentRoleEnum = (0, pg_core_1.pgEnum)(
  "finance_document_role",
  ["receipt", "transfer_slip", "invoice", "statement", "supporting"]
);
exports.financePaymentInstitutionKindEnum = (0, pg_core_1.pgEnum)(
  "finance_payment_institution_kind",
  ["bank", "issuer", "other"]
);
exports.financePaymentInstrumentKindEnum = (0, pg_core_1.pgEnum)(
  "finance_payment_instrument_kind",
  ["bank_account", "credit_card", "cash", "unknown"]
);
exports.financePaymentDirectionEnum = (0, pg_core_1.pgEnum)(
  "finance_payment_direction",
  ["outbound", "inbound", "both", "unknown"]
);
exports.libraryItems = (0, pg_core_1.pgTable)(
  "library_items",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    // null = root-level; non-null = inside a folder (itemType="folder")
    parentId: (0, pg_core_1.integer)("parent_id").references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "cascade" }
    ),
    itemType: (0, pg_core_1.varchar)("item_type", { length: 32 }).notNull(),
    source: (0, pg_core_1.varchar)("source", { length: 64 }).notNull(),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, exports.libraryItemStatusEnum)("status")
      .notNull()
      .default("ready"),
    visibility: (0, exports.libraryVisibilityEnum)("visibility")
      .notNull()
      .default("private"),
    metadata: (0, pg_core_1.json)("metadata").$type().notNull().default({}),
    sourceUrl: (0, pg_core_1.text)("source_url"),
    thumbnailUrl: (0, pg_core_1.text)("thumbnail_url"),
    // Denormalized scope cache for vector DB filtering
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_11 ||
            (templateObject_11 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { withTimezone: true }),
    // Track who deleted the file (for trash UI)
    deletedBy: (0, pg_core_1.integer)("deleted_by").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("library_items_id_tenant_unique").on(
        t.id,
        t.tenantId
      ),
      (0, pg_core_1.index)("library_items_tenant_visibility_status_idx").on(
        t.tenantId,
        t.visibility,
        t.status
      ),
      (0, pg_core_1.index)("library_items_tenant_owner_status_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.status
      ),
      (0, pg_core_1.index)("library_items_tenant_project_idx").on(
        t.tenantId,
        t.projectId
      ),
      (0, pg_core_1.index)("library_items_tenant_owner_project_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.projectId
      ),
      (0, pg_core_1.index)("library_items_source_item_type_idx").on(
        t.source,
        t.itemType
      ),
      (0, pg_core_1.index)("library_items_deleted_at_idx").on(t.deletedAt),
      (0, pg_core_1.index)("library_items_allowed_scopes_gin_idx").using(
        "gin",
        t.allowedScopes
      ),
      (0, pg_core_1.index)("library_items_parent_id_idx").on(t.parentId),
    ];
  }
);
exports.libraryLinks = (0, pg_core_1.pgTable)(
  "library_links",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    linkType: (0, pg_core_1.varchar)("link_type", { length: 64 }).notNull(),
    linkId: (0, pg_core_1.varchar)("link_id", { length: 128 }).notNull(),
    providerTaskId: (0, pg_core_1.varchar)("provider_task_id", { length: 128 }),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("library_links_source_tenant_unique").on(
        t.linkType,
        t.linkId,
        t.tenantId
      ),
      (0, pg_core_1.index)("library_links_item_type_idx").on(
        t.libraryItemId,
        t.linkType
      ),
      (0, pg_core_1.index)("library_links_provider_task_idx").on(
        t.providerTaskId
      ),
    ];
  }
);
exports.libraryChunks = (0, pg_core_1.pgTable)(
  "library_chunks",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }),
    chunkIndex: (0, pg_core_1.integer)("chunk_index").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    contentType: (0, pg_core_1.varchar)("content_type", { length: 32 })
      .notNull()
      .default("text"),
    tokenCount: (0, pg_core_1.integer)("token_count"),
    vectorRefId: (0, pg_core_1.varchar)("vector_ref_id", { length: 128 }),
    vectorIndexName: (0, pg_core_1.varchar)("vector_index_name", {
      length: 128,
    }),
    metadata: (0, pg_core_1.json)("metadata").$type().notNull().default({}),
    // Denormalized scope cache — mirrors parent item's allowed_scopes
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_12 ||
            (templateObject_12 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    // Parent-child chunk support for RAG
    isParent: (0, pg_core_1.boolean)("is_parent").default(false).notNull(),
    parentChunkId: (0, pg_core_1.text)("parent_chunk_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("library_chunks_item_chunk_index_unique").on(
        t.libraryItemId,
        t.chunkIndex
      ),
      (0, pg_core_1.index)("library_chunks_tenant_content_type_idx").on(
        t.tenantId,
        t.contentType
      ),
      (0, pg_core_1.index)("library_chunks_tenant_project_idx").on(
        t.tenantId,
        t.projectId
      ),
      (0, pg_core_1.index)("library_chunks_vector_ref_idx").on(t.vectorRefId),
      (0, pg_core_1.index)("library_chunks_vector_index_name_idx").on(
        t.vectorIndexName
      ),
      (0, pg_core_1.index)("library_chunks_allowed_scopes_gin_idx").using(
        "gin",
        t.allowedScopes
      ),
      (0, pg_core_1.index)("library_chunks_parent_chunk_idx").on(
        t.parentChunkId
      ),
    ];
  }
);
exports.libraryContentVersions = (0, pg_core_1.pgTable)(
  "library_content_versions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    versionNumber: (0, pg_core_1.integer)("version_number").notNull(),
    contentHash: (0, pg_core_1.varchar)("content_hash", {
      length: 64,
    }).notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    contentType: (0, pg_core_1.varchar)("content_type", { length: 32 })
      .notNull()
      .default("markdown_source"),
    contentSizeBytes: (0, pg_core_1.integer)("content_size_bytes").notNull(),
    changeDescription: (0, pg_core_1.text)("change_description"),
    // S3/storage key of archived file for binary file versions (null for markdown versions)
    snapshotObjectKey: (0, pg_core_1.varchar)("snapshot_object_key", {
      length: 512,
    }),
    createdByUserId: (0, pg_core_1.integer)("created_by_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("library_versions_item_version_unique").on(
        t.libraryItemId,
        t.versionNumber
      ),
      (0, pg_core_1.index)("library_versions_item_created_idx").on(
        t.libraryItemId,
        t.createdAt
      ),
      (0, pg_core_1.index)("library_versions_tenant_created_idx").on(
        t.tenantId,
        t.createdAt
      ),
      (0, pg_core_1.index)("library_versions_hash_idx").on(t.contentHash),
    ];
  }
);
exports.libraryPermissions = (0, pg_core_1.pgTable)(
  "library_permissions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    subjectType: (0, pg_core_1.varchar)("subject_type", {
      length: 32,
    }).notNull(),
    subjectId: (0, pg_core_1.varchar)("subject_id", { length: 64 }).notNull(),
    permissionLevel: (0, pg_core_1.varchar)("permission_level", { length: 32 })
      .notNull()
      .default("read"),
    grantedByUserId: (0, pg_core_1.integer)("granted_by_user_id").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("library_permissions_subject_unique").on(
        t.libraryItemId,
        t.subjectType,
        t.subjectId
      ),
      (0, pg_core_1.index)("library_permissions_tenant_subject_idx").on(
        t.tenantId,
        t.subjectType,
        t.subjectId
      ),
      // Optimize group permission lookups
      (0, pg_core_1.index)("library_permissions_group_idx")
        .on(t.subjectId, t.subjectType)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_13 ||
              (templateObject_13 = __makeTemplateObject(
                ["subject_type = 'group'"],
                ["subject_type = 'group'"]
              ))
          )
        ),
    ];
  }
);
exports.libraryPublicShareLinks = (0, pg_core_1.pgTable)(
  "library_public_share_links",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    tokenHash: (0, pg_core_1.varchar)("token_hash", { length: 128 }).notNull(),
    tokenEncrypted: (0, pg_core_1.text)("token_encrypted").notNull(),
    createdByUserId: (0, pg_core_1.integer)("created_by_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }),
    revokedAt: (0, pg_core_1.timestamp)("revoked_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "library_public_share_links_token_hash_unique"
      ).on(t.tokenHash),
      (0, pg_core_1.index)("library_public_share_links_tenant_item_idx").on(
        t.tenantId,
        t.libraryItemId
      ),
      (0, pg_core_1.index)("library_public_share_links_tenant_token_idx").on(
        t.tenantId,
        t.tokenHash
      ),
      (0, pg_core_1.index)("library_public_share_links_item_active_idx").on(
        t.libraryItemId,
        t.revokedAt,
        t.expiresAt
      ),
    ];
  }
);
exports.libraryIndexJobs = (0, pg_core_1.pgTable)(
  "library_index_jobs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }),
    jobType: (0, pg_core_1.varchar)("job_type", { length: 64 }).notNull(),
    status: (0, exports.libraryIndexJobStatusEnum)("status")
      .notNull()
      .default("pending"),
    attemptCount: (0, pg_core_1.integer)("attempt_count").notNull().default(0),
    maxAttempts: (0, pg_core_1.integer)("max_attempts").notNull().default(5),
    runAt: (0, pg_core_1.timestamp)("run_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    nextRetryAt: (0, pg_core_1.timestamp)("next_retry_at", {
      withTimezone: true,
    }),
    lastError: (0, pg_core_1.text)("last_error"),
    startedAt: (0, pg_core_1.timestamp)("started_at", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completed_at", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("library_index_jobs_tenant_status_run_at_idx").on(
        t.tenantId,
        t.status,
        t.runAt
      ),
      (0, pg_core_1.index)("library_index_jobs_tenant_project_idx").on(
        t.tenantId,
        t.projectId
      ),
      (0, pg_core_1.index)("library_index_jobs_status_retry_idx").on(
        t.status,
        t.nextRetryAt
      ),
      (0, pg_core_1.index)("library_index_jobs_item_status_idx").on(
        t.libraryItemId,
        t.status
      ),
    ];
  }
);
exports.financeCounterparties = (0, pg_core_1.pgTable)(
  "finance_counterparties",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    displayName: (0, pg_core_1.text)("display_name").notNull(),
    normalizedName: (0, pg_core_1.varchar)("normalized_name", {
      length: 512,
    }).notNull(),
    usageCount: (0, pg_core_1.integer)("usage_count").notNull().default(0),
    lastSeenAt: (0, pg_core_1.timestamp)("last_seen_at", {
      withTimezone: true,
    }),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_14 ||
            (templateObject_14 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_counterparties_tenant_normalized_unique"
      ).on(t.tenantId, t.projectId, t.ownerUserId, t.normalizedName),
      (0, pg_core_1.index)(
        "finance_counterparties_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)("finance_counterparties_tenant_usage_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.usageCount
      ),
      (0, pg_core_1.index)("finance_counterparties_last_seen_idx").on(
        t.tenantId,
        t.lastSeenAt
      ),
      (0, pg_core_1.index)(
        "finance_counterparties_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financeCounterpartyAliases = (0, pg_core_1.pgTable)(
  "finance_counterparty_aliases",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    counterpartyId: (0, pg_core_1.integer)("counterparty_id")
      .notNull()
      .references(
        function () {
          return exports.financeCounterparties.id;
        },
        { onDelete: "cascade" }
      ),
    aliasName: (0, pg_core_1.text)("alias_name").notNull(),
    normalizedAlias: (0, pg_core_1.varchar)("normalized_alias", {
      length: 512,
    }).notNull(),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_15 ||
            (templateObject_15 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_counterparty_aliases_tenant_normalized_unique"
      ).on(t.tenantId, t.projectId, t.ownerUserId, t.normalizedAlias),
      (0, pg_core_1.index)("finance_counterparty_aliases_counterparty_idx").on(
        t.counterpartyId
      ),
      (0, pg_core_1.index)(
        "finance_counterparty_aliases_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)(
        "finance_counterparty_aliases_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financePaymentInstitutions = (0, pg_core_1.pgTable)(
  "finance_payment_institutions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    kind: (0, exports.financePaymentInstitutionKindEnum)("kind")
      .notNull()
      .default("bank"),
    displayName: (0, pg_core_1.text)("display_name").notNull(),
    normalizedName: (0, pg_core_1.varchar)("normalized_name", {
      length: 512,
    }).notNull(),
    usageCount: (0, pg_core_1.integer)("usage_count").notNull().default(0),
    lastSeenAt: (0, pg_core_1.timestamp)("last_seen_at", {
      withTimezone: true,
    }),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_16 ||
            (templateObject_16 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_payment_institutions_tenant_normalized_unique"
      ).on(t.tenantId, t.projectId, t.ownerUserId, t.kind, t.normalizedName),
      (0, pg_core_1.index)(
        "finance_payment_institutions_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)("finance_payment_institutions_tenant_usage_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.usageCount
      ),
      (0, pg_core_1.index)("finance_payment_institutions_last_seen_idx").on(
        t.tenantId,
        t.lastSeenAt
      ),
      (0, pg_core_1.index)(
        "finance_payment_institutions_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financePaymentInstitutionAliases = (0, pg_core_1.pgTable)(
  "finance_payment_institution_aliases",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    paymentInstitutionId: (0, pg_core_1.integer)("payment_institution_id")
      .notNull()
      .references(
        function () {
          return exports.financePaymentInstitutions.id;
        },
        { onDelete: "cascade" }
      ),
    aliasName: (0, pg_core_1.text)("alias_name").notNull(),
    normalizedAlias: (0, pg_core_1.varchar)("normalized_alias", {
      length: 512,
    }).notNull(),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_17 ||
            (templateObject_17 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_payment_institution_aliases_tenant_normalized_unique"
      ).on(t.tenantId, t.projectId, t.ownerUserId, t.normalizedAlias),
      (0, pg_core_1.index)(
        "finance_payment_institution_aliases_payment_institution_idx"
      ).on(t.paymentInstitutionId),
      (0, pg_core_1.index)(
        "finance_payment_institution_aliases_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)(
        "finance_payment_institution_aliases_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financePaymentAccounts = (0, pg_core_1.pgTable)(
  "finance_payment_accounts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    paymentInstitutionId: (0, pg_core_1.integer)("payment_institution_id")
      .notNull()
      .references(
        function () {
          return exports.financePaymentInstitutions.id;
        },
        { onDelete: "cascade" }
      ),
    kind: (0, exports.financePaymentInstrumentKindEnum)("kind").notNull(),
    nickname: (0, pg_core_1.text)("nickname").notNull(),
    normalizedNickname: (0, pg_core_1.varchar)("normalized_nickname", {
      length: 512,
    }).notNull(),
    last4: (0, pg_core_1.varchar)("last4", { length: 4 }),
    maskedIdentifier: (0, pg_core_1.text)("masked_identifier"),
    usageCount: (0, pg_core_1.integer)("usage_count").notNull().default(0),
    lastSeenAt: (0, pg_core_1.timestamp)("last_seen_at", {
      withTimezone: true,
    }),
    isPrimary: (0, pg_core_1.boolean)("is_primary").notNull().default(false),
    archivedAt: (0, pg_core_1.timestamp)("archived_at", { withTimezone: true }),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_18 ||
            (templateObject_18 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("finance_payment_accounts_tenant_unique").on(
        t.tenantId,
        t.projectId,
        t.ownerUserId,
        t.paymentInstitutionId,
        t.kind,
        t.normalizedNickname
      ),
      (0, pg_core_1.index)(
        "finance_payment_accounts_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)(
        "finance_payment_accounts_payment_institution_idx"
      ).on(t.paymentInstitutionId),
      (0, pg_core_1.index)("finance_payment_accounts_last_seen_idx").on(
        t.tenantId,
        t.lastSeenAt
      ),
      (0, pg_core_1.index)("finance_payment_accounts_usage_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.usageCount
      ),
      (0, pg_core_1.index)("finance_payment_accounts_primary_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.isPrimary
      ),
      (0, pg_core_1.index)(
        "finance_payment_accounts_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financePaymentAccountAliases = (0, pg_core_1.pgTable)(
  "finance_payment_account_aliases",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    paymentAccountId: (0, pg_core_1.integer)("payment_account_id")
      .notNull()
      .references(
        function () {
          return exports.financePaymentAccounts.id;
        },
        { onDelete: "cascade" }
      ),
    aliasName: (0, pg_core_1.text)("alias_name").notNull(),
    normalizedAlias: (0, pg_core_1.varchar)("normalized_alias", {
      length: 512,
    }).notNull(),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_19 ||
            (templateObject_19 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_payment_account_aliases_tenant_normalized_unique"
      ).on(t.tenantId, t.projectId, t.ownerUserId, t.normalizedAlias),
      (0, pg_core_1.index)(
        "finance_payment_account_aliases_payment_account_idx"
      ).on(t.paymentAccountId),
      (0, pg_core_1.index)(
        "finance_payment_account_aliases_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)(
        "finance_payment_account_aliases_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.financeRecurringRules = (0, pg_core_1.pgTable)(
  "finance_recurring_rules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    type: (0, exports.financeTransactionTypeEnum)("type").notNull(),
    amountMinor: (0, pg_core_1.integer)("amount_minor").notNull(),
    currency: (0, pg_core_1.varchar)("currency", { length: 3 })
      .notNull()
      .default("THB"),
    categoryCode: (0, pg_core_1.varchar)("category_code", {
      length: 64,
    }).notNull(),
    counterpartyId: (0, pg_core_1.integer)("counterparty_id").references(
      function () {
        return exports.financeCounterparties.id;
      },
      { onDelete: "set null" }
    ),
    counterpartyName: (0, pg_core_1.text)("counterparty_name"),
    merchantName: (0, pg_core_1.text)("merchant_name"),
    note: (0, pg_core_1.text)("note"),
    rrule: (0, pg_core_1.text)("rrule").notNull(),
    timezone: (0, pg_core_1.varchar)("timezone", { length: 64 })
      .notNull()
      .default("Asia/Bangkok"),
    startDate: (0, pg_core_1.timestamp)("start_date", {
      withTimezone: true,
    }).notNull(),
    endDate: (0, pg_core_1.timestamp)("end_date", { withTimezone: true }),
    nextRunAt: (0, pg_core_1.timestamp)("next_run_at", { withTimezone: true }),
    lastRunAt: (0, pg_core_1.timestamp)("last_run_at", { withTimezone: true }),
    runCount: (0, pg_core_1.integer)("run_count").notNull().default(0),
    autoConfirm: (0, pg_core_1.boolean)("auto_confirm")
      .notNull()
      .default(false),
    status: (0, exports.financeRecurringRuleStatusEnum)("status")
      .notNull()
      .default("active"),
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 256,
    }).notNull(),
    sourceHash: (0, pg_core_1.varchar)("source_hash", { length: 64 }),
    sourceMessageId: (0, pg_core_1.integer)("source_message_id").references(
      function () {
        return exports.messages.id;
      },
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: (0, pg_core_1.integer)(
      "source_library_item_id"
    ).references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "set null" }
    ),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_20 ||
            (templateObject_20 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_recurring_rules_tenant_idempotency_unique"
      ).on(t.tenantId, t.idempotencyKey),
      (0, pg_core_1.index)(
        "finance_recurring_rules_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)(
        "finance_recurring_rules_tenant_status_next_run_idx"
      ).on(t.tenantId, t.status, t.nextRunAt),
      (0, pg_core_1.index)("finance_recurring_rules_source_hash_idx").on(
        t.sourceHash
      ),
      (0, pg_core_1.index)("finance_recurring_rules_counterparty_idx").on(
        t.counterpartyId
      ),
      (0, pg_core_1.index)(
        "finance_recurring_rules_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
      (0, pg_core_1.index)("finance_recurring_rules_source_message_idx").on(
        t.sourceMessageId
      ),
      (0, pg_core_1.index)(
        "finance_recurring_rules_source_library_item_idx"
      ).on(t.sourceLibraryItemId),
      (0, pg_core_1.check)(
        "finance_recurring_rules_amount_minor_positive",
        (0, drizzle_orm_1.sql)(
          templateObject_21 ||
            (templateObject_21 = __makeTemplateObject(
              ["", " > 0"],
              ["", " > 0"]
            )),
          t.amountMinor
        )
      ),
    ];
  }
);
exports.financeDrafts = (0, pg_core_1.pgTable)(
  "finance_drafts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    type: (0, exports.financeTransactionTypeEnum)("type").notNull(),
    status: (0, exports.financeDraftStatusEnum)("status")
      .notNull()
      .default("draft"),
    source: (0, exports.financeSourceEnum)("source").notNull(),
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 256,
    }).notNull(),
    sourceHash: (0, pg_core_1.varchar)("source_hash", { length: 64 }),
    payloadJson: (0, pg_core_1.jsonb)("payload_json")
      .$type()
      .notNull()
      .default({}),
    missingFields: (0, pg_core_1.text)("missing_fields")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_22 ||
            (templateObject_22 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    confidence: (0, pg_core_1.numeric)("confidence", {
      precision: 3,
      scale: 2,
    }),
    needsClarification: (0, pg_core_1.boolean)("needs_clarification")
      .notNull()
      .default(false),
    clarificationPrompt: (0, pg_core_1.text)("clarification_prompt"),
    sourceMessageId: (0, pg_core_1.integer)("source_message_id").references(
      function () {
        return exports.messages.id;
      },
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: (0, pg_core_1.integer)(
      "source_library_item_id"
    ).references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "set null" }
    ),
    recurringRuleId: (0, pg_core_1.integer)("recurring_rule_id").references(
      function () {
        return exports.financeRecurringRules.id;
      },
      { onDelete: "set null" }
    ),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_23 ||
            (templateObject_23 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("finance_drafts_tenant_idempotency_unique").on(
        t.tenantId,
        t.idempotencyKey
      ),
      (0, pg_core_1.index)("finance_drafts_tenant_project_owner_idx").on(
        t.tenantId,
        t.projectId,
        t.ownerUserId
      ),
      (0, pg_core_1.index)("finance_drafts_tenant_status_created_idx").on(
        t.tenantId,
        t.status,
        t.createdAt
      ),
      (0, pg_core_1.index)("finance_drafts_source_hash_idx").on(t.sourceHash),
      (0, pg_core_1.index)("finance_drafts_source_message_idx").on(
        t.sourceMessageId
      ),
      (0, pg_core_1.index)("finance_drafts_source_library_item_idx").on(
        t.sourceLibraryItemId
      ),
      (0, pg_core_1.index)("finance_drafts_recurring_rule_idx").on(
        t.recurringRuleId
      ),
      (0, pg_core_1.index)("finance_drafts_allowed_scopes_gin_idx").using(
        "gin",
        t.allowedScopes
      ),
      (0, pg_core_1.index)("finance_drafts_expires_at_idx").on(t.expiresAt),
    ];
  }
);
exports.financeTransactions = (0, pg_core_1.pgTable)(
  "finance_transactions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    type: (0, exports.financeTransactionTypeEnum)("type").notNull(),
    status: (0, exports.financeTransactionStatusEnum)("status")
      .notNull()
      .default("draft"),
    source: (0, exports.financeSourceEnum)("source").notNull(),
    amountMinor: (0, pg_core_1.integer)("amount_minor").notNull(),
    currency: (0, pg_core_1.varchar)("currency", { length: 3 })
      .notNull()
      .default("THB"),
    occurredAt: (0, pg_core_1.timestamp)("occurred_at", {
      withTimezone: true,
    }).notNull(),
    categoryCode: (0, pg_core_1.varchar)("category_code", {
      length: 64,
    }).notNull(),
    counterpartyId: (0, pg_core_1.integer)("counterparty_id").references(
      function () {
        return exports.financeCounterparties.id;
      },
      { onDelete: "set null" }
    ),
    counterpartyName: (0, pg_core_1.text)("counterparty_name"),
    merchantName: (0, pg_core_1.text)("merchant_name"),
    note: (0, pg_core_1.text)("note"),
    slipReference: (0, pg_core_1.text)("slip_reference"),
    merchantId: (0, pg_core_1.text)("merchant_id"),
    paymentFeeMinor: (0, pg_core_1.integer)("payment_fee_minor"),
    paymentSourceAccountId: (0, pg_core_1.integer)(
      "payment_source_account_id"
    ).references(
      function () {
        return exports.financePaymentAccounts.id;
      },
      { onDelete: "set null" }
    ),
    paymentDestinationAccountId: (0, pg_core_1.integer)(
      "payment_destination_account_id"
    ).references(
      function () {
        return exports.financePaymentAccounts.id;
      },
      { onDelete: "set null" }
    ),
    paymentSourceName: (0, pg_core_1.text)("payment_source_name"),
    paymentDestinationName: (0, pg_core_1.text)("payment_destination_name"),
    paymentMethodKind: (0, exports.financePaymentInstrumentKindEnum)(
      "payment_method_kind"
    )
      .notNull()
      .default("unknown"),
    paymentDirection: (0, exports.financePaymentDirectionEnum)(
      "payment_direction"
    )
      .notNull()
      .default("unknown"),
    paymentInstrumentConfidence: (0, pg_core_1.numeric)(
      "payment_instrument_confidence",
      { precision: 3, scale: 2 }
    ),
    confidence: (0, pg_core_1.numeric)("confidence", {
      precision: 3,
      scale: 2,
    }),
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 256,
    }).notNull(),
    sourceHash: (0, pg_core_1.varchar)("source_hash", { length: 64 }),
    confirmedFromDraftId: (0, pg_core_1.integer)(
      "confirmed_from_draft_id"
    ).references(
      function () {
        return exports.financeDrafts.id;
      },
      { onDelete: "set null" }
    ),
    recurringRuleId: (0, pg_core_1.integer)("recurring_rule_id").references(
      function () {
        return exports.financeRecurringRules.id;
      },
      { onDelete: "set null" }
    ),
    sourceMessageId: (0, pg_core_1.integer)("source_message_id").references(
      function () {
        return exports.messages.id;
      },
      { onDelete: "set null" }
    ),
    sourceLibraryItemId: (0, pg_core_1.integer)(
      "source_library_item_id"
    ).references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "set null" }
    ),
    confirmedAt: (0, pg_core_1.timestamp)("confirmed_at", {
      withTimezone: true,
    }),
    confirmedByUserId: (0, pg_core_1.integer)(
      "confirmed_by_user_id"
    ).references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    voidedAt: (0, pg_core_1.timestamp)("voided_at", { withTimezone: true }),
    voidedByUserId: (0, pg_core_1.integer)("voided_by_user_id").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    voidReason: (0, pg_core_1.text)("void_reason"),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_24 ||
            (templateObject_24 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_transactions_tenant_idempotency_unique"
      ).on(t.tenantId, t.idempotencyKey),
      (0, pg_core_1.uniqueIndex)(
        "finance_transactions_confirmed_from_draft_unique"
      )
        .on(t.confirmedFromDraftId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_25 ||
              (templateObject_25 = __makeTemplateObject(
                ['"confirmed_from_draft_id" IS NOT NULL'],
                ['"confirmed_from_draft_id" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.index)("finance_transactions_tenant_project_owner_idx").on(
        t.tenantId,
        t.projectId,
        t.ownerUserId
      ),
      (0, pg_core_1.index)(
        "finance_transactions_tenant_status_occurred_idx"
      ).on(t.tenantId, t.status, t.occurredAt),
      (0, pg_core_1.index)("finance_transactions_source_hash_idx").on(
        t.sourceHash
      ),
      (0, pg_core_1.index)("finance_transactions_source_message_idx").on(
        t.sourceMessageId
      ),
      (0, pg_core_1.index)("finance_transactions_source_library_item_idx").on(
        t.sourceLibraryItemId
      ),
      (0, pg_core_1.index)("finance_transactions_recurring_rule_idx").on(
        t.recurringRuleId
      ),
      (0, pg_core_1.index)("finance_transactions_counterparty_idx").on(
        t.counterpartyId
      ),
      (0, pg_core_1.index)(
        "finance_transactions_payment_source_account_idx"
      ).on(t.paymentSourceAccountId),
      (0, pg_core_1.index)(
        "finance_transactions_payment_destination_account_idx"
      ).on(t.paymentDestinationAccountId),
      (0, pg_core_1.index)("finance_transactions_payment_method_kind_idx").on(
        t.paymentMethodKind
      ),
      (0, pg_core_1.index)("finance_transactions_allowed_scopes_gin_idx").using(
        "gin",
        t.allowedScopes
      ),
      (0, pg_core_1.index)("finance_transactions_owner_voided_idx").on(
        t.tenantId,
        t.ownerUserId,
        t.voidedAt
      ),
      (0, pg_core_1.check)(
        "finance_transactions_amount_minor_positive",
        (0, drizzle_orm_1.sql)(
          templateObject_26 ||
            (templateObject_26 = __makeTemplateObject(
              ["", " > 0"],
              ["", " > 0"]
            )),
          t.amountMinor
        )
      ),
    ];
  }
);
exports.documentExtractions = (0, pg_core_1.pgTable)(
  "document_extractions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    financeDraftId: (0, pg_core_1.integer)("finance_draft_id").references(
      function () {
        return exports.financeDrafts.id;
      },
      { onDelete: "set null" }
    ),
    source: (0, exports.financeSourceEnum)("source")
      .notNull()
      .default("ocr_document"),
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 256,
    }).notNull(),
    sourceHash: (0, pg_core_1.varchar)("source_hash", { length: 64 }),
    ocrProvider: (0, pg_core_1.varchar)("ocr_provider", {
      length: 64,
    }).notNull(),
    ocrText: (0, pg_core_1.text)("ocr_text").notNull(),
    ocrJson: (0, pg_core_1.jsonb)("ocr_json").$type().notNull().default({}),
    extractedJson: (0, pg_core_1.jsonb)("extracted_json")
      .$type()
      .notNull()
      .default({}),
    confidenceJson: (0, pg_core_1.jsonb)("confidence_json")
      .$type()
      .notNull()
      .default({}),
    mimeType: (0, pg_core_1.varchar)("mime_type", { length: 128 }).notNull(),
    fileHash: (0, pg_core_1.varchar)("file_hash", { length: 64 }).notNull(),
    pageCount: (0, pg_core_1.integer)("page_count").notNull().default(1),
    sourceMessageId: (0, pg_core_1.integer)("source_message_id").references(
      function () {
        return exports.messages.id;
      },
      { onDelete: "set null" }
    ),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_27 ||
            (templateObject_27 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "document_extractions_tenant_idempotency_unique"
      ).on(t.tenantId, t.idempotencyKey),
      (0, pg_core_1.index)("document_extractions_tenant_project_owner_idx").on(
        t.tenantId,
        t.projectId,
        t.ownerUserId
      ),
      (0, pg_core_1.index)("document_extractions_library_item_idx").on(
        t.libraryItemId
      ),
      (0, pg_core_1.index)("document_extractions_finance_draft_idx").on(
        t.financeDraftId
      ),
      (0, pg_core_1.index)("document_extractions_source_hash_idx").on(
        t.sourceHash
      ),
      (0, pg_core_1.index)("document_extractions_source_message_idx").on(
        t.sourceMessageId
      ),
      (0, pg_core_1.index)("document_extractions_file_hash_idx").on(t.fileHash),
      (0, pg_core_1.index)("document_extractions_allowed_scopes_gin_idx").using(
        "gin",
        t.allowedScopes
      ),
      (0, pg_core_1.check)(
        "document_extractions_page_count_positive",
        (0, drizzle_orm_1.sql)(
          templateObject_28 ||
            (templateObject_28 = __makeTemplateObject(
              ["", " > 0"],
              ["", " > 0"]
            )),
          t.pageCount
        )
      ),
    ];
  }
);
exports.financeTransactionDocuments = (0, pg_core_1.pgTable)(
  "finance_transaction_documents",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("project_id", { length: 100 }).notNull(),
    ownerUserId: (0, pg_core_1.integer)("owner_user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    transactionId: (0, pg_core_1.integer)("transaction_id")
      .notNull()
      .references(
        function () {
          return exports.financeTransactions.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    sourceExtractionId: (0, pg_core_1.integer)(
      "source_extraction_id"
    ).references(
      function () {
        return exports.documentExtractions.id;
      },
      { onDelete: "set null" }
    ),
    role: (0, exports.financeDocumentRoleEnum)("role")
      .notNull()
      .default("supporting"),
    note: (0, pg_core_1.text)("note"),
    allowedScopes: (0, pg_core_1.text)("allowed_scopes")
      .array()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_29 ||
            (templateObject_29 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "finance_transaction_documents_link_unique"
      ).on(t.transactionId, t.libraryItemId, t.role),
      (0, pg_core_1.index)(
        "finance_transaction_documents_tenant_project_owner_idx"
      ).on(t.tenantId, t.projectId, t.ownerUserId),
      (0, pg_core_1.index)("finance_transaction_documents_transaction_idx").on(
        t.transactionId
      ),
      (0, pg_core_1.index)("finance_transaction_documents_library_item_idx").on(
        t.libraryItemId
      ),
      (0, pg_core_1.index)(
        "finance_transaction_documents_source_extraction_idx"
      ).on(t.sourceExtractionId),
      (0, pg_core_1.index)(
        "finance_transaction_documents_allowed_scopes_gin_idx"
      ).using("gin", t.allowedScopes),
    ];
  }
);
exports.presentationDecks = (0, pg_core_1.pgTable)(
  "presentation_decks",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    notes: (0, pg_core_1.text)("notes"),
    version: (0, pg_core_1.integer)("version").notNull().default(1),
    slideCount: (0, pg_core_1.integer)("slide_count").notNull().default(0),
    totalAssetBytes: (0, pg_core_1.integer)("total_asset_bytes")
      .notNull()
      .default(0),
    projectAudioTrack: (0, pg_core_1.json)("project_audio_track").$type(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("presentation_decks_library_item_unique").on(
        t.libraryItemId
      ),
      (0, pg_core_1.uniqueIndex)("presentation_decks_id_tenant_unique").on(
        t.id,
        t.tenantId
      ),
      (0, pg_core_1.index)("presentation_decks_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("presentation_decks_tenant_updated_idx").on(
        t.tenantId,
        t.updatedAt
      ),
    ];
  }
);
exports.presentationSlides = (0, pg_core_1.pgTable)(
  "presentation_slides",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    deckId: (0, pg_core_1.integer)("deck_id")
      .notNull()
      .references(
        function () {
          return exports.presentationDecks.id;
        },
        { onDelete: "cascade" }
      ),
    orderIndex: (0, pg_core_1.integer)("order_index").notNull(),
    version: (0, pg_core_1.integer)("version").notNull().default(1),
    title: (0, pg_core_1.varchar)("title", { length: 255 })
      .notNull()
      .default("Slide"),
    slideContent: (0, pg_core_1.json)("slide_content")
      .$type()
      .notNull()
      .default({}),
    audioTrack: (0, pg_core_1.json)("audio_track").$type(),
    notes: (0, pg_core_1.text)("notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("presentation_slides_deck_order_unique").on(
        t.deckId,
        t.orderIndex
      ),
      (0, pg_core_1.uniqueIndex)("presentation_slides_deck_id_unique").on(
        t.deckId,
        t.id
      ),
      (0, pg_core_1.index)("presentation_slides_deck_idx").on(t.deckId),
      (0, pg_core_1.index)("presentation_slides_deck_updated_idx").on(
        t.deckId,
        t.updatedAt
      ),
    ];
  }
);
exports.presentationAssetLinks = (0, pg_core_1.pgTable)(
  "presentation_asset_links",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    deckId: (0, pg_core_1.integer)("deck_id")
      .notNull()
      .references(
        function () {
          return exports.presentationDecks.id;
        },
        { onDelete: "cascade" }
      ),
    slideId: (0, pg_core_1.integer)("slide_id").references(
      function () {
        return exports.presentationSlides.id;
      },
      { onDelete: "set null" }
    ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    byteSize: (0, pg_core_1.integer)("byte_size").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("presentation_asset_links_unique").on(
        t.deckId,
        t.slideId,
        t.libraryItemId
      ),
      (0, pg_core_1.index)("presentation_asset_links_deck_idx").on(t.deckId),
      (0, pg_core_1.index)("presentation_asset_links_slide_idx").on(t.slideId),
      (0, pg_core_1.foreignKey)({
        name: "presentation_asset_links_deck_tenant_fk",
        columns: [t.deckId, t.tenantId],
        foreignColumns: [
          exports.presentationDecks.id,
          exports.presentationDecks.tenantId,
        ],
      }).onDelete("cascade"),
      (0, pg_core_1.foreignKey)({
        name: "presentation_asset_links_library_item_tenant_fk",
        columns: [t.libraryItemId, t.tenantId],
        foreignColumns: [
          exports.libraryItems.id,
          exports.libraryItems.tenantId,
        ],
      }).onDelete("cascade"),
      (0, pg_core_1.foreignKey)({
        name: "presentation_asset_links_slide_deck_fk",
        columns: [t.deckId, t.slideId],
        foreignColumns: [
          exports.presentationSlides.deckId,
          exports.presentationSlides.id,
        ],
      }),
    ];
  }
);
exports.presentationSourceAttachments = (0, pg_core_1.pgTable)(
  "presentation_source_attachments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    deckId: (0, pg_core_1.integer)("deck_id")
      .notNull()
      .references(
        function () {
          return exports.presentationDecks.id;
        },
        { onDelete: "cascade" }
      ),
    sourceLibraryItemId: (0, pg_core_1.integer)(
      "source_library_item_id"
    ).references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "set null" }
    ),
    sourceFormat: (0, pg_core_1.varchar)("source_format", {
      length: 16,
    }).notNull(),
    conversionStatus: (0, pg_core_1.varchar)("conversion_status", {
      length: 32,
    })
      .notNull()
      .default("pending"),
    partialFidelity: (0, pg_core_1.boolean)("partial_fidelity")
      .notNull()
      .default(false),
    fidelityWarnings: (0, pg_core_1.json)("fidelity_warnings")
      .$type()
      .notNull()
      .default([]),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "presentation_source_attachments_deck_unique"
      ).on(t.deckId),
      (0, pg_core_1.index)(
        "presentation_source_attachments_source_item_idx"
      ).on(t.sourceLibraryItemId),
    ];
  }
);
exports.presentationConversionRecords = (0, pg_core_1.pgTable)(
  "presentation_conversion_records",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    // Nullable: no source library item for Google Slides imports
    sourceItemId: (0, pg_core_1.integer)("source_item_id").references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "cascade" }
    ),
    sourceFormat: (0, pg_core_1.varchar)("source_format", {
      length: 16,
    }).notNull(),
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 128,
    }).notNull(),
    // Nullable: set by callback handler after deck creation completes
    deckLibraryItemId: (0, pg_core_1.integer)(
      "deck_library_item_id"
    ).references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "cascade" }
    ),
    // Nullable: set by callback handler after deck creation completes
    deckId: (0, pg_core_1.integer)("deck_id").references(
      function () {
        return exports.presentationDecks.id;
      },
      { onDelete: "cascade" }
    ),
    // job lifecycle tracking
    status: (0, pg_core_1.varchar)("status", { length: 16 })
      .notNull()
      .default("queued"),
    // Values: "queued" | "processing" | "done" | "failed" | "cancelled"
    progress: (0, pg_core_1.integer)("progress").notNull().default(0),
    // Values: 0–100
    // required so the callback handler can construct a PresentationActor
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    // stores Google Slides URL when sourceFormat is "google_slides"
    slidesUrl: (0, pg_core_1.varchar)("slides_url", { length: 2048 }),
    partialFidelity: (0, pg_core_1.boolean)("partial_fidelity")
      .notNull()
      .default(false),
    fidelityWarnings: (0, pg_core_1.json)("fidelity_warnings")
      .$type()
      .notNull()
      .default([]),
    // Nullable: set by callback handler when job fails (surfaces failure reason to frontend)
    error: (0, pg_core_1.text)("error"),
    /** Associated sandbox job ID (if conversion ran in sandbox) */
    sandboxJobId: (0, pg_core_1.varchar)("sandbox_job_id", { length: 36 }),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      // Partial unique index: restricts uniqueness only for PPTX imports that have a real sourceItemId.
      // PostgreSQL allows multiple NULLs in a unique index, so a plain index on
      // (tenantId, sourceItemId) would permit any number of Google Slides rows
      // (all with sourceItemId=NULL). The partial index restricts uniqueness only
      // for PPTX imports that have a real sourceItemId.
      (0, pg_core_1.uniqueIndex)(
        "presentation_conversion_records_source_unique"
      )
        .on(t.tenantId, t.sourceItemId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_30 ||
              (templateObject_30 = __makeTemplateObject(
                ["", " IS NOT NULL"],
                ["", " IS NOT NULL"]
              )),
            t.sourceItemId
          )
        ),
      // Idempotency lookup index
      (0, pg_core_1.index)(
        "presentation_conversion_records_idempotency_idx"
      ).on(t.tenantId, t.sourceItemId, t.idempotencyKey),
      (0, pg_core_1.index)("presentation_conversion_records_expires_at_idx").on(
        t.expiresAt
      ),
      // lookup by userId for ownership queries
      (0, pg_core_1.index)("presentation_conversion_records_user_idx").on(
        t.userId
      ),
    ];
  }
);
exports.presentationConversionLocks = (0, pg_core_1.pgTable)(
  "presentation_conversion_locks",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    sourceItemId: (0, pg_core_1.integer)("source_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    lockToken: (0, pg_core_1.varchar)("lock_token", { length: 64 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "presentation_conversion_locks_source_unique"
      ).on(t.tenantId, t.sourceItemId),
      (0, pg_core_1.index)("presentation_conversion_locks_expires_at_idx").on(
        t.expiresAt
      ),
    ];
  }
);
// ============================================================
// Presentation Export Jobs
// ============================================================
exports.presentationExports = (0, pg_core_1.pgTable)(
  "presentation_exports",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    // FK to deck — cascade delete (export history gone when deck is deleted)
    deckId: (0, pg_core_1.integer)("deck_id")
      .notNull()
      .references(
        function () {
          return exports.presentationDecks.id;
        },
        { onDelete: "cascade" }
      ),
    // FK to user — set null (preserve export audit trail if user is deleted)
    userId: (0, pg_core_1.integer)("user_id").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 }).notNull(),
    // Export parameters
    format: (0, pg_core_1.varchar)("format", { length: 16 }).notNull(), // png | jpg | pdf | mp4
    quality: (0, pg_core_1.varchar)("quality", { length: 12 }), // draft | standard | high
    width: (0, pg_core_1.integer)("width").notNull().default(1920),
    height: (0, pg_core_1.integer)("height").notNull().default(1080),
    fps: (0, pg_core_1.integer)("fps"), // MP4 only; default 30 in Python task
    // Job lifecycle
    status: (0, pg_core_1.varchar)("status", { length: 16 })
      .notNull()
      .default("queued"),
    // queued | processing | done | error | cancelled
    progressPct: (0, pg_core_1.integer)("progress_pct").notNull().default(0), // 0 – 100
    stage: (0, pg_core_1.varchar)("stage", { length: 64 }), // e.g. "rendering", "encoding", "uploading"
    errorMessage: (0, pg_core_1.text)("error_message"),
    // Output
    outputUrl: (0, pg_core_1.text)("output_url"), // 24-hour presigned S3/R2 download URL
    outputStorageKey: (0, pg_core_1.text)("output_storage_key"), // raw S3 key; used to re-presign if expired
    outputBytes: (0, pg_core_1.bigint)("output_bytes", { mode: "number" }),
    // Celery bridge
    celeryTaskId: (0, pg_core_1.varchar)("celery_task_id", { length: 255 }),
    // Deduplication (unique constraint enforced below)
    idempotencyKey: (0, pg_core_1.varchar)("idempotency_key", {
      length: 128,
    }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "presentation_exports_idempotency_key_unique"
      ).on(t.idempotencyKey),
      (0, pg_core_1.index)("presentation_exports_deck_idx").on(t.deckId),
      (0, pg_core_1.index)("presentation_exports_user_idx").on(t.userId),
      (0, pg_core_1.index)("presentation_exports_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("presentation_exports_celery_task_idx").on(
        t.celeryTaskId
      ),
      (0, pg_core_1.index)("presentation_exports_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
    ];
  }
);
// ============================================================
// Google Drive Integration Tables
// ============================================================
/**
 * Stores per-user Google Drive sync configuration and webhook channel tracking.
 * One row per user per tenant.
 */
exports.googleDriveSyncState = (0, pg_core_1.pgTable)(
  "google_drive_sync_state",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    indexingMode: (0, exports.indexingModeEnum)("indexing_mode")
      .notNull()
      .default("none"),
    folderSelections: (0, pg_core_1.jsonb)("folder_selections")
      .$type()
      .default([]),
    fileTypeFilter: (0, pg_core_1.jsonb)("file_type_filter")
      .$type()
      .default([]),
    maxFileSizeBytes: (0, pg_core_1.integer)("max_file_size_bytes").default(
      52428800
    ),
    channelId: (0, pg_core_1.varchar)("channel_id", { length: 128 }),
    resourceId: (0, pg_core_1.varchar)("resource_id", { length: 128 }),
    channelTokenHash: (0, pg_core_1.varchar)("channel_token_hash", {
      length: 128,
    }),
    channelExpiry: (0, pg_core_1.timestamp)("channel_expiry", {
      withTimezone: true,
    }),
    pageToken: (0, pg_core_1.text)("page_token"),
    filesTotal: (0, pg_core_1.integer)("files_total").default(0),
    filesProcessed: (0, pg_core_1.integer)("files_processed").default(0),
    lastSyncAt: (0, pg_core_1.timestamp)("last_sync_at", {
      withTimezone: true,
    }),
    lastError: (0, pg_core_1.text)("last_error"),
    autoSyncEnabled: (0, pg_core_1.boolean)("auto_sync_enabled")
      .default(true)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("gdrive_sync_tenant_user_unique").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.index)("gdrive_sync_channel_id_idx").on(t.channelId),
    ];
  }
);
/**
 * Tracks active editing sessions where a library file has been uploaded
 * to Google Drive for editing in Google Docs/Sheets.
 */
exports.googleDriveEditSessions = (0, pg_core_1.pgTable)(
  "google_drive_edit_sessions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    driveFileId: (0, pg_core_1.varchar)("drive_file_id", {
      length: 128,
    }).notNull(),
    editUrl: (0, pg_core_1.text)("edit_url").notNull(),
    originalSourceUrl: (0, pg_core_1.text)("original_source_url"),
    status: (0, exports.editSessionStatusEnum)("status")
      .notNull()
      .default("active"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("gdrive_edit_tenant_user_status_idx").on(
        t.tenantId,
        t.userId,
        t.status
      ),
      (0, pg_core_1.index)("gdrive_edit_library_item_idx").on(t.libraryItemId),
      (0, pg_core_1.index)("gdrive_edit_expires_at_idx").on(t.expiresAt),
    ];
  }
);
// ============================================================
// OneDrive (Microsoft Graph) Integration Tables
// ============================================================
/**
 * Stores per-user OneDrive sync configuration and subscription tracking.
 * One row per user per tenant. Mirrors google_drive_sync_state but uses
 * Microsoft Graph delta queries + subscriptions instead of Google's
 * Changes API + webhook channels.
 */
exports.onedriveSyncState = (0, pg_core_1.pgTable)(
  "onedrive_sync_state",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    indexingMode: (0, exports.indexingModeEnum)("indexing_mode")
      .notNull()
      .default("none"),
    folderSelections: (0, pg_core_1.jsonb)("folder_selections")
      .$type()
      .default([]),
    fileTypeFilter: (0, pg_core_1.jsonb)("file_type_filter")
      .$type()
      .default([]),
    maxFileSizeBytes: (0, pg_core_1.integer)("max_file_size_bytes").default(
      52428800
    ),
    deltaLink: (0, pg_core_1.text)("delta_link"),
    subscriptionId: (0, pg_core_1.varchar)("subscription_id", { length: 128 }),
    subscriptionExpiry: (0, pg_core_1.timestamp)("subscription_expiry", {
      withTimezone: true,
    }),
    filesTotal: (0, pg_core_1.integer)("files_total").default(0),
    filesProcessed: (0, pg_core_1.integer)("files_processed").default(0),
    lastSyncAt: (0, pg_core_1.timestamp)("last_sync_at", {
      withTimezone: true,
    }),
    lastError: (0, pg_core_1.text)("last_error"),
    autoSyncEnabled: (0, pg_core_1.boolean)("auto_sync_enabled")
      .default(true)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("onedrive_sync_tenant_user_unique").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.index)("onedrive_sync_subscription_id_idx").on(
        t.subscriptionId
      ),
    ];
  }
);
/**
 * Tracks active editing sessions where a library file has been uploaded
 * to OneDrive for editing in Office Online (Word/Excel/PowerPoint).
 */
exports.onedriveEditSessions = (0, pg_core_1.pgTable)(
  "onedrive_edit_sessions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    libraryItemId: (0, pg_core_1.integer)("library_item_id")
      .notNull()
      .references(
        function () {
          return exports.libraryItems.id;
        },
        { onDelete: "cascade" }
      ),
    driveItemId: (0, pg_core_1.varchar)("drive_item_id", {
      length: 256,
    }).notNull(),
    editUrl: (0, pg_core_1.text)("edit_url").notNull(),
    originalSourceUrl: (0, pg_core_1.text)("original_source_url"),
    status: (0, exports.editSessionStatusEnum)("status")
      .notNull()
      .default("active"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("onedrive_edit_tenant_user_status_idx").on(
        t.tenantId,
        t.userId,
        t.status
      ),
      (0, pg_core_1.index)("onedrive_edit_library_item_idx").on(
        t.libraryItemId
      ),
      (0, pg_core_1.index)("onedrive_edit_expires_at_idx").on(t.expiresAt),
    ];
  }
);
/**
 * Per-user monthly credit budget limits.
 * Applies to ALL credit-consuming operations system-wide.
 */
exports.userCreditBudgets = (0, pg_core_1.pgTable)(
  "user_credit_budgets",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    monthlyLimit: (0, pg_core_1.integer)("monthly_limit").notNull(),
    creditsUsedThisMonth: (0, pg_core_1.integer)("credits_used_this_month")
      .notNull()
      .default(0),
    budgetMonthKey: (0, pg_core_1.varchar)("budget_month_key", {
      length: 7,
    }).notNull(),
    alertThresholdPct: (0, pg_core_1.integer)("alert_threshold_pct")
      .notNull()
      .default(80),
    alertSent: (0, pg_core_1.boolean)("alert_sent").notNull().default(false),
    hardCapReached: (0, pg_core_1.boolean)("hard_cap_reached")
      .notNull()
      .default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("user_credit_budgets_tenant_user_unique").on(
        t.tenantId,
        t.userId
      ),
    ];
  }
);
/**
 * Skill Category Enum
 * Categorizes skills for filtering and organization
 */
exports.skillCategoryEnum = (0, pg_core_1.pgEnum)("skill_category", [
  "image_generation", // Generate Images
  "image_prompt_generation", // Create prompts for image generation
  "video_generation", // Generate Video
  "video_prompt_generation", // Create prompts for video generation
  "image_video_generation", // Generate both Image and Video
  "audio_generation", // Generate Text To Speech
  "article_generation", // Generate source articles / presentation drafts
  "product_review", // Product review generation (household, beauty, fashion, etc.)
  "sound_effects", // Generate Sound Effects
  "prompt_enhancement", // Enhance prompts
  "code_assistant", // Code help
  "document_analysis", // Document processing
  "web_search", // Web search
  "data_analysis", // Data analysis
  "translation", // Translation
  "summarization", // Summarization
  "chat_assistant", // General chat
  "automation", // Workflow automation
  "other", // Other
]);
exports.skillMaintenanceRecommendationStatusEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_recommendation_status",
  ["pending_review", "approved", "dismissed", "applied", "blocked", "failed"]
);
exports.skillMaintenanceRiskLevelEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_risk_level",
  ["low", "medium", "high", "critical"]
);
exports.skillMaintenanceRunTypeEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_run_type",
  ["analysis", "apply", "sweep", "verify"]
);
exports.skillMaintenanceRunStatusEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_run_status",
  ["queued", "running", "completed", "failed", "blocked", "canceled"]
);
exports.skillMaintenanceCompatibilityStatusEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_compatibility_status",
  ["unknown", "compatible", "warning", "blocked"]
);
exports.skillMaintenanceScheduleStatusEnum = (0, pg_core_1.pgEnum)(
  "skill_maintenance_schedule_status",
  ["active", "paused", "disabled"]
);
/**
 * Skill Repositories - External Git repos containing skill collections
 * Admin can add repos, fetch/upgrade skills from them
 */
exports.skillRepositories = (0, pg_core_1.pgTable)("skill_repositories", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  name: (0, pg_core_1.varchar)("name", { length: 200 }).notNull(),
  gitUrl: (0, pg_core_1.varchar)("git_url", { length: 500 }).notNull(),
  branch: (0, pg_core_1.varchar)("branch", { length: 100 }).default("main"),
  formatType: (0, pg_core_1.varchar)("format_type", { length: 50 }).default(
    "auto"
  ),
  skillsSubdir: (0, pg_core_1.varchar)("skills_subdir", {
    length: 200,
  }).default("skills"),
  lastFetchedAt: (0, pg_core_1.timestamp)("last_fetched_at", {
    withTimezone: true,
  }),
  lastCommitHash: (0, pg_core_1.varchar)("last_commit_hash", { length: 64 }),
  skillCount: (0, pg_core_1.integer)("skill_count").default(0),
  status: (0, pg_core_1.varchar)("status", { length: 50 })
    .default("pending")
    .notNull(),
  errorMessage: (0, pg_core_1.text)("error_message"),
  createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: (0, pg_core_1.integer)("created_by").references(function () {
    return exports.users.id;
  }),
});
/**
 * Skills - Centralized skill registry for Claude/OpenCode compatibility
 * Each skill maps to a folder structure: skills/<skill_slug>/
 * Contains skill.md, python/, js/, tests/ directories
 */
exports.skills = (0, pg_core_1.pgTable)("skills", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Unique identifier/slug (folder name, e.g., "create-image-prompt") */
  slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull().unique(),
  /** Display name */
  name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
  /** Detailed description */
  description: (0, pg_core_1.text)("description"),
  /** Skill category for filtering */
  category: (0, exports.skillCategoryEnum)("category")
    .notNull()
    .default("other"),
  /** Version string (semantic versioning) */
  version: (0, pg_core_1.varchar)("version", { length: 20 }).default("1.0.0"),
  /** Author name or email */
  author: (0, pg_core_1.varchar)("author", { length: 255 }),
  /** Icon identifier (lucide icon name) */
  icon: (0, pg_core_1.varchar)("icon", { length: 50 }).default("sparkles"),
  /** Tags for additional filtering (JSON array) */
  tags: (0, pg_core_1.json)("tags").$type().default([]),
  /** Folder path relative to skills/ directory */
  folderPath: (0, pg_core_1.varchar)("folderPath", { length: 512 }),
  /** Whether skill can auto-trigger on intent detection */
  isAutoTrigger: (0, pg_core_1.boolean)("isAutoTrigger")
    .default(false)
    .notNull(),
  /** Regex patterns for auto-detection
   * Supports two formats:
   * 1. Legacy: string[] - array of pattern strings
   * 2. New: PatternRule[] - array of objects with pattern, chainTo, label
   * Both can be mixed in the same array for backward compatibility
   */
  triggerPatterns: (0, pg_core_1.json)("triggerPatterns").$type().default([]),
  /** Whether skill is enabled globally */
  isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
  /** Whether skill is enabled by default for new conversations */
  enabledByDefault: (0, pg_core_1.boolean)("enabledByDefault")
    .default(true)
    .notNull(),
  /** Whether skill is visible by default for new users (admin-controlled) */
  visibleByDefault: (0, pg_core_1.boolean)("visibleByDefault")
    .default(true)
    .notNull(),
  /** Credit cost multiplier (1.0 = standard rate) */
  creditMultiplier: (0, pg_core_1.numeric)("creditMultiplier", {
    precision: 5,
    scale: 2,
  }).default("1.0"),
  /** Priority for detection (higher = checked first) */
  priority: (0, pg_core_1.integer)("priority").default(50).notNull(),
  /** Available models for this skill (if media-related) */
  availableModels: (0, pg_core_1.json)("availableModels").$type(),
  /** Default model for this skill */
  defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 128 }),
  /** Canonical routed LLM model id for text-generation skills */
  llmModelId: (0, pg_core_1.varchar)("llmModelId", { length: 128 }),
  /** Preferred provider pin for this skill (optional) */
  preferredProviderId: (0, pg_core_1.integer)("preferredProviderId").references(
    function () {
      return exports.llmProviders.id;
    }
  ),
  /** Enforce provider pin without fallback when true */
  strictProviderPin: (0, pg_core_1.boolean)("strictProviderPin")
    .default(false)
    .notNull(),
  /** Execution mode: llm-only (text response), media-generate (LLM→prompt→media API) */
  executionMode: (0, pg_core_1.varchar)("executionMode", { length: 50 })
    .default("llm-only")
    .notNull(),
  /** Chain to another skill after this skill completes (skill slug) */
  chainTo: (0, pg_core_1.varchar)("chainTo", { length: 100 }),
  /** System prompt override (optional) */
  systemPrompt: (0, pg_core_1.text)("systemPrompt"),
  /** Skill content/instructions from skill.md (cached) */
  skillContent: (0, pg_core_1.text)("skillContent"),
  /** Public-facing marketplace documentation (curated, safe to display) */
  marketplaceContent: (0, pg_core_1.text)("marketplaceContent"),
  /** Knowledgebase content (for imported Custom GPTs) */
  knowledgebase: (0, pg_core_1.text)("knowledgebase"),
  /** Additional configuration */
  configJson: (0, pg_core_1.json)("configJson").$type(),
  /** Import source (manual, folder, zip, custom-gpt) */
  importSource: (0, pg_core_1.varchar)("importSource", { length: 50 }).default(
    "manual"
  ),
  /** Original ZIP file path (if imported from ZIP) */
  importedFromZip: (0, pg_core_1.varchar)("importedFromZip", { length: 512 }),
  /** Repository that this skill was fetched from */
  repositoryId: (0, pg_core_1.integer)("repositoryId").references(function () {
    return exports.skillRepositories.id;
  }),
  /** Original folder name in the repository (e.g. "react-developer") */
  repositorySlug: (0, pg_core_1.varchar)("repositorySlug", { length: 200 }),
  /** MD5 hash of skill.md content for sync/upgrade detection */
  contentHash: (0, pg_core_1.varchar)("contentHash", { length: 64 }),
  /** User who created/imported this skill */
  createdBy: (0, pg_core_1.integer)("createdBy").references(function () {
    return exports.users.id;
  }),
  /** Tenant that owns this skill */
  tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
    function () {
      return exports.tenants.id;
    }
  ),
  /** Skill visibility: private, pending_approval, public, rejected */
  visibility: (0, exports.skillVisibilityEnum)("visibility")
    .default("private")
    .notNull(),
  /** Admin who approved the skill for public visibility */
  approvedBy: (0, pg_core_1.integer)("approvedBy").references(function () {
    return exports.users.id;
  }),
  /** When the skill was approved */
  approvedAt: (0, pg_core_1.timestamp)("approvedAt", { withTimezone: true }),
  /** Reason for rejection (if visibility = 'rejected') */
  rejectionReason: (0, pg_core_1.text)("rejectionReason"),
  /** When an admin set this skill to pending_approval (for admin review queue ordering) */
  requestedPublishAt: (0, pg_core_1.timestamp)("requestedPublishAt", {
    withTimezone: true,
  }),
  /** Sandbox profile slug for skills that require sandbox execution */
  sandboxProfileSlug: (0, pg_core_1.varchar)("sandboxProfileSlug", {
    length: 64,
  }),
  /** Whether this skill needs network access in sandbox */
  requiresNetwork: (0, pg_core_1.boolean)("requiresNetwork"),
  /** Whether this skill needs browser automation in sandbox */
  requiresBrowser: (0, pg_core_1.boolean)("requiresBrowser"),
  /** Maximum runtime for this skill in seconds (overrides profile default) */
  maxRuntimeSeconds: (0, pg_core_1.integer)("maxRuntimeSeconds"),
  /** Maximum input file size in MB (overrides profile default) */
  maxInputMb: (0, pg_core_1.integer)("maxInputMb"),
  /** Capability-first execution policy (parsed from skill.md frontmatter) */
  executionPolicyJson: (0, pg_core_1.json)("executionPolicyJson").$type(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
exports.skillMaintenanceSchedules = (0, pg_core_1.pgTable)(
  "skill_maintenance_schedules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "set null" }
    ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, exports.skillMaintenanceScheduleStatusEnum)("status")
      .notNull()
      .default("active"),
    cronExpression: (0, pg_core_1.varchar)("cronExpression", { length: 128 }),
    timezone: (0, pg_core_1.varchar)("timezone", { length: 64 })
      .notNull()
      .default("UTC"),
    scopeType: (0, pg_core_1.varchar)("scopeType", { length: 50 })
      .notNull()
      .default("all_skills"),
    scopeJson: (0, pg_core_1.jsonb)("scopeJson").$type().notNull().default({}),
    policyJson: (0, pg_core_1.jsonb)("policyJson")
      .$type()
      .notNull()
      .default({}),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    lastRunAt: (0, pg_core_1.timestamp)("lastRunAt", { withTimezone: true }),
    nextRunAt: (0, pg_core_1.timestamp)("nextRunAt", { withTimezone: true }),
    runningAt: (0, pg_core_1.timestamp)("runningAt", { withTimezone: true }),
    lockToken: (0, pg_core_1.varchar)("lockToken", { length: 80 }),
    lockExpiresAt: (0, pg_core_1.timestamp)("lockExpiresAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "skill_maintenance_schedules_status_next_run_idx"
      ).on(t.status, t.nextRunAt),
      (0, pg_core_1.index)("skill_maintenance_schedules_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("skill_maintenance_schedules_lock_expiry_idx").on(
        t.status,
        t.lockExpiresAt
      ),
    ];
  }
);
exports.skillImprovementRecommendations = (0, pg_core_1.pgTable)(
  "skill_improvement_recommendations",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    skillId: (0, pg_core_1.integer)("skillId")
      .notNull()
      .references(
        function () {
          return exports.skills.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "set null" }
    ),
    scheduleId: (0, pg_core_1.integer)("scheduleId").references(
      function () {
        return exports.skillMaintenanceSchedules.id;
      },
      { onDelete: "set null" }
    ),
    recommendationType: (0, pg_core_1.varchar)("recommendationType", {
      length: 100,
    }).notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    summary: (0, pg_core_1.text)("summary"),
    rationale: (0, pg_core_1.text)("rationale"),
    status: (0, exports.skillMaintenanceRecommendationStatusEnum)("status")
      .notNull()
      .default("pending_review"),
    riskLevel: (0, exports.skillMaintenanceRiskLevelEnum)("riskLevel")
      .notNull()
      .default("medium"),
    compatibilityStatus: (0, exports.skillMaintenanceCompatibilityStatusEnum)(
      "compatibilityStatus"
    )
      .notNull()
      .default("unknown"),
    qualityScore: (0, pg_core_1.integer)("qualityScore"),
    confidenceScore: (0, pg_core_1.integer)("confidenceScore"),
    currentRuntime: (0, pg_core_1.varchar)("currentRuntime", { length: 64 }),
    proposedRuntime: (0, pg_core_1.varchar)("proposedRuntime", { length: 64 }),
    proposedAction: (0, pg_core_1.varchar)("proposedAction", { length: 100 }),
    isAutoApplySafe: (0, pg_core_1.boolean)("isAutoApplySafe")
      .notNull()
      .default(false),
    isGenjsCandidate: (0, pg_core_1.boolean)("isGenjsCandidate")
      .notNull()
      .default(false),
    recommendationJson: (0, pg_core_1.jsonb)("recommendationJson")
      .$type()
      .notNull()
      .default({}),
    contractDeltaJson: (0, pg_core_1.jsonb)("contractDeltaJson")
      .$type()
      .notNull()
      .default({}),
    analyzedAt: (0, pg_core_1.timestamp)("analyzedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: (0, pg_core_1.timestamp)("reviewedAt", { withTimezone: true }),
    reviewedBy: (0, pg_core_1.integer)("reviewedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    approvedAt: (0, pg_core_1.timestamp)("approvedAt", { withTimezone: true }),
    approvedBy: (0, pg_core_1.integer)("approvedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    dismissedAt: (0, pg_core_1.timestamp)("dismissedAt", {
      withTimezone: true,
    }),
    dismissedBy: (0, pg_core_1.integer)("dismissedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    appliedAt: (0, pg_core_1.timestamp)("appliedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "skill_improvement_recommendations_skill_status_idx"
      ).on(t.skillId, t.status),
      (0, pg_core_1.index)(
        "skill_improvement_recommendations_status_risk_idx"
      ).on(t.status, t.riskLevel),
      (0, pg_core_1.index)("skill_improvement_recommendations_schedule_idx").on(
        t.scheduleId,
        t.status
      ),
    ];
  }
);
exports.skillImprovementRuns = (0, pg_core_1.pgTable)(
  "skill_improvement_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    skillId: (0, pg_core_1.integer)("skillId").references(
      function () {
        return exports.skills.id;
      },
      { onDelete: "cascade" }
    ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "set null" }
    ),
    scheduleId: (0, pg_core_1.integer)("scheduleId").references(
      function () {
        return exports.skillMaintenanceSchedules.id;
      },
      { onDelete: "set null" }
    ),
    recommendationId: (0, pg_core_1.integer)("recommendationId").references(
      function () {
        return exports.skillImprovementRecommendations.id;
      },
      { onDelete: "set null" }
    ),
    runType: (0, exports.skillMaintenanceRunTypeEnum)("runType").notNull(),
    status: (0, exports.skillMaintenanceRunStatusEnum)("status")
      .notNull()
      .default("queued"),
    triggerSource: (0, pg_core_1.varchar)("triggerSource", { length: 50 })
      .notNull()
      .default("manual"),
    requestedBy: (0, pg_core_1.integer)("requestedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    summary: (0, pg_core_1.text)("summary"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    scopeJson: (0, pg_core_1.jsonb)("scopeJson").$type().notNull().default({}),
    logsJson: (0, pg_core_1.jsonb)("logsJson").$type().notNull().default({}),
    metricsJson: (0, pg_core_1.jsonb)("metricsJson")
      .$type()
      .notNull()
      .default({}),
    verificationJson: (0, pg_core_1.jsonb)("verificationJson")
      .$type()
      .notNull()
      .default({}),
    diffSummaryJson: (0, pg_core_1.jsonb)("diffSummaryJson")
      .$type()
      .notNull()
      .default({}),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    endedAt: (0, pg_core_1.timestamp)("endedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("skill_improvement_runs_skill_created_idx").on(
        t.skillId,
        t.createdAt
      ),
      (0, pg_core_1.index)("skill_improvement_runs_schedule_created_idx").on(
        t.scheduleId,
        t.createdAt
      ),
      (0, pg_core_1.index)(
        "skill_improvement_runs_recommendation_created_idx"
      ).on(t.recommendationId, t.createdAt),
      (0, pg_core_1.index)("skill_improvement_runs_status_created_idx").on(
        t.status,
        t.createdAt
      ),
    ];
  }
);
exports.skillContractSnapshots = (0, pg_core_1.pgTable)(
  "skill_contract_snapshots",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    skillId: (0, pg_core_1.integer)("skillId")
      .notNull()
      .references(
        function () {
          return exports.skills.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "set null" }
    ),
    recommendationId: (0, pg_core_1.integer)("recommendationId").references(
      function () {
        return exports.skillImprovementRecommendations.id;
      },
      { onDelete: "set null" }
    ),
    runId: (0, pg_core_1.integer)("runId").references(
      function () {
        return exports.skillImprovementRuns.id;
      },
      { onDelete: "set null" }
    ),
    snapshotType: (0, pg_core_1.varchar)("snapshotType", { length: 50 })
      .notNull()
      .default("baseline"),
    executionMode: (0, pg_core_1.varchar)("executionMode", { length: 50 }),
    runtimeProfile: (0, pg_core_1.varchar)("runtimeProfile", { length: 64 }),
    manifestPath: (0, pg_core_1.varchar)("manifestPath", { length: 512 }),
    manifestHash: (0, pg_core_1.varchar)("manifestHash", { length: 64 }),
    inputSchemaHash: (0, pg_core_1.varchar)("inputSchemaHash", { length: 64 }),
    outputSchemaHash: (0, pg_core_1.varchar)("outputSchemaHash", {
      length: 64,
    }),
    fixtureHash: (0, pg_core_1.varchar)("fixtureHash", { length: 64 }),
    testsHash: (0, pg_core_1.varchar)("testsHash", { length: 64 }),
    contractHash: (0, pg_core_1.varchar)("contractHash", { length: 64 }),
    schemaSummaryJson: (0, pg_core_1.jsonb)("schemaSummaryJson")
      .$type()
      .notNull()
      .default({}),
    sampleInputsJson: (0, pg_core_1.jsonb)("sampleInputsJson")
      .$type()
      .notNull()
      .default([]),
    sampleOutputsJson: (0, pg_core_1.jsonb)("sampleOutputsJson")
      .$type()
      .notNull()
      .default([]),
    compatibilityNotesJson: (0, pg_core_1.jsonb)("compatibilityNotesJson")
      .$type()
      .notNull()
      .default({}),
    snapshotJson: (0, pg_core_1.jsonb)("snapshotJson")
      .$type()
      .notNull()
      .default({}),
    capturedAt: (0, pg_core_1.timestamp)("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("skill_contract_snapshots_skill_captured_idx").on(
        t.skillId,
        t.capturedAt
      ),
      (0, pg_core_1.index)("skill_contract_snapshots_recommendation_idx").on(
        t.recommendationId
      ),
      (0, pg_core_1.index)("skill_contract_snapshots_run_idx").on(t.runId),
      (0, pg_core_1.index)("skill_contract_snapshots_contract_hash_idx").on(
        t.contractHash
      ),
    ];
  }
);
/**
 * Skill Permissions — controls which groups can use a private skill
 * Simplified model: only group-based access (no per-user or role subjects)
 */
exports.skillPermissions = (0, pg_core_1.pgTable)(
  "skill_permissions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    skillId: (0, pg_core_1.integer)("skillId")
      .notNull()
      .references(
        function () {
          return exports.skills.id;
        },
        { onDelete: "cascade" }
      ),
    groupId: (0, pg_core_1.integer)("groupId")
      .notNull()
      .references(
        function () {
          return exports.userGroups.id;
        },
        { onDelete: "cascade" }
      ),
    grantedByUserId: (0, pg_core_1.integer)("grantedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("skill_permissions_unique").on(
        t.skillId,
        t.groupId
      ),
      (0, pg_core_1.index)("skill_permissions_group_idx").on(t.groupId),
    ];
  }
);
/**
 * Skill Likes — per-user like tracking for marketplace
 */
exports.skillLikes = (0, pg_core_1.pgTable)(
  "skill_likes",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    skillId: (0, pg_core_1.integer)("skillId")
      .notNull()
      .references(
        function () {
          return exports.skills.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("skill_likes_unique").on(t.skillId, t.userId),
    ];
  }
);
/**
 * Skill Comments — flat comments for marketplace skill pages
 */
exports.skillComments = (0, pg_core_1.pgTable)("skill_comments", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  skillId: (0, pg_core_1.integer)("skillId")
    .notNull()
    .references(
      function () {
        return exports.skills.id;
      },
      { onDelete: "cascade" }
    ),
  userId: (0, pg_core_1.integer)("userId")
    .notNull()
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    ),
  content: (0, pg_core_1.text)("content").notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * User Skill Visibility — per-user skill visibility preferences
 * Controls which skills appear in a user's chat panel and slash commands
 */
exports.userSkillVisibility = (0, pg_core_1.pgTable)(
  "user_skill_visibility",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    skillId: (0, pg_core_1.integer)("skillId")
      .notNull()
      .references(
        function () {
          return exports.skills.id;
        },
        { onDelete: "cascade" }
      ),
    visible: (0, pg_core_1.boolean)("visible").default(true).notNull(),
    autoTriggerEnabled: (0, pg_core_1.boolean)("autoTriggerEnabled")
      .default(true)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("user_skill_visibility_unique").on(
        t.userId,
        t.skillId
      ),
    ];
  }
);
/**
 * Storage Provider Type Enum
 * Defines the type of object storage provider
 */
exports.storageProviderTypeEnum = (0, pg_core_1.pgEnum)(
  "storage_provider_type",
  ["r2", "s3", "local"]
);
/**
 * Storage Settings - Configuration for S3-compatible object storage (R2, S3, etc.)
 * Used for storing reference images, generated media, and other files
 * that need to be publicly accessible (e.g., for Kie.ai to download reference images)
 */
exports.storageSettings = (0, pg_core_1.pgTable)("storage_settings", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Setting name/identifier (e.g., "primary", "backup", "development") */
  name: (0, pg_core_1.varchar)("name", { length: 64 }).notNull().unique(),
  /** Display name for UI */
  displayName: (0, pg_core_1.varchar)("displayName", { length: 128 }).notNull(),
  /** Description of this storage configuration */
  description: (0, pg_core_1.text)("description"),
  /** Storage provider type */
  providerType: (0, exports.storageProviderTypeEnum)("providerType")
    .notNull()
    .default("r2"),
  /** S3 Endpoint URL (e.g., https://xxx.r2.cloudflarestorage.com) */
  endpoint: (0, pg_core_1.varchar)("endpoint", { length: 512 }),
  /** S3 Region (e.g., auto for R2, us-east-1 for S3) */
  region: (0, pg_core_1.varchar)("region", { length: 64 }).default("auto"),
  /** Bucket name */
  bucket: (0, pg_core_1.varchar)("bucket", { length: 128 }),
  /** Access Key ID (encrypted) */
  accessKeyIdEncrypted: (0, pg_core_1.text)("accessKeyIdEncrypted"),
  /** Secret Access Key (encrypted) */
  secretAccessKeyEncrypted: (0, pg_core_1.text)("secretAccessKeyEncrypted"),
  /** Whether credentials are configured */
  hasCredentials: (0, pg_core_1.boolean)("hasCredentials")
    .default(false)
    .notNull(),
  /** Public URL prefix for serving files (e.g., https://cdn.example.com or R2 public URL) */
  publicUrlPrefix: (0, pg_core_1.varchar)("publicUrlPrefix", { length: 512 }),
  /** Development Tunnel URL (e.g., cloudflared tunnel URL for local development) */
  devTunnelUrl: (0, pg_core_1.varchar)("devTunnelUrl", { length: 512 }),
  /** Path prefix for uploaded files (e.g., "uploads/" or "media/") */
  pathPrefix: (0, pg_core_1.varchar)("pathPrefix", { length: 128 }).default(
    "uploads/"
  ),
  /** Whether this is the active/primary storage */
  isActive: (0, pg_core_1.boolean)("isActive").default(false).notNull(),
  /** Additional configuration */
  configJson: (0, pg_core_1.json)("configJson").$type(),
  /** Last successful connection test */
  lastTestedAt: (0, pg_core_1.timestamp)("lastTestedAt", {
    withTimezone: true,
  }),
  /** Last test result */
  lastTestResult: (0, pg_core_1.json)("lastTestResult").$type(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
exports.desktopInstallerReleases = (0, pg_core_1.pgTable)(
  "desktop_installer_releases",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    version: (0, pg_core_1.varchar)("version", { length: 64 }).notNull(),
    platform: (0, pg_core_1.text)("platform").notNull(),
    channel: (0, pg_core_1.text)("channel").notNull().default("stable"),
    installerFormat: (0, pg_core_1.text)("installerFormat").notNull(),
    fileName: (0, pg_core_1.varchar)("fileName", { length: 255 }).notNull(),
    contentType: (0, pg_core_1.varchar)("contentType", { length: 255 })
      .notNull()
      .default("application/octet-stream"),
    storageKey: (0, pg_core_1.text)("storageKey").notNull(),
    fileSizeBytes: (0, pg_core_1.bigint)("fileSizeBytes", {
      mode: "number",
    }).notNull(),
    fileSha256: (0, pg_core_1.varchar)("fileSha256", { length: 64 }).notNull(),
    releaseNotes: (0, pg_core_1.text)("releaseNotes"),
    isPublished: (0, pg_core_1.boolean)("isPublished").notNull().default(true),
    publishedAt: (0, pg_core_1.timestamp)("publishedAt", {
      withTimezone: true,
    }),
    uploadedBy: (0, pg_core_1.integer)("uploadedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    uploadedAt: (0, pg_core_1.timestamp)("uploadedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "idx_desktop_installer_releases_platform_published"
      ).on(t.platform, t.isPublished, t.publishedAt),
      (0, pg_core_1.index)("idx_desktop_installer_releases_version").on(
        t.version
      ),
      (0, pg_core_1.uniqueIndex)(
        "desktop_installer_releases_storage_key_unique"
      ).on(t.storageKey),
    ];
  }
);
// ============================================================
// System Settings - Platform-wide configuration
// ============================================================
/**
 * System Settings - Stores platform-wide configuration
 * Used for Stripe settings, Invoice settings, etc.
 */
exports.systemSettings = (0, pg_core_1.pgTable)("system_settings", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Setting category (stripe, invoice, email, etc.) */
  category: (0, pg_core_1.varchar)("category", { length: 64 }).notNull(),
  /** Setting key within the category */
  key: (0, pg_core_1.varchar)("key", { length: 128 }).notNull(),
  /** Setting value (JSON for complex values, string for simple) */
  value: (0, pg_core_1.text)("value"),
  /** JSON value for complex settings */
  valueJson: (0, pg_core_1.json)("valueJson").$type(),
  /** Is this setting sensitive (should be masked in UI) */
  isSensitive: (0, pg_core_1.boolean)("isSensitive").default(false),
  /** Description of this setting */
  description: (0, pg_core_1.text)("description"),
  /** Last updated by user ID */
  updatedBy: (0, pg_core_1.integer)("updatedBy"),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
exports.workpackRecordTypeEnum = (0, pg_core_1.pgEnum)("workpack_record_type", [
  "case_source",
  "playbook",
  "workpack",
  "workpack_version",
  "workpack_run",
  "simulation_run",
  "workpack_exception",
  "benchmark_pack",
  "promotion_record",
  "improvement_proposal",
  "telemetry_event",
  "metric_snapshot",
  "incident_record",
  "schedule_record",
]);
exports.workpackRecords = (0, pg_core_1.pgTable)(
  "workpack_records",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    recordType: (0, exports.workpackRecordTypeEnum)("recordType").notNull(),
    recordId: (0, pg_core_1.varchar)("recordId", { length: 128 }).notNull(),
    workpackId: (0, pg_core_1.varchar)("workpackId", { length: 128 }),
    sortTimestamp: (0, pg_core_1.timestamp)("sortTimestamp", {
      withTimezone: true,
    }),
    payloadJson: (0, pg_core_1.jsonb)("payloadJson")
      .$type()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_31 ||
            (templateObject_31 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "workpack_records_tenant_type_record_unique"
      ).on(t.tenantId, t.recordType, t.recordId),
      (0, pg_core_1.index)("workpack_records_type_record_idx").on(
        t.recordType,
        t.recordId
      ),
      (0, pg_core_1.index)("workpack_records_tenant_type_idx").on(
        t.tenantId,
        t.recordType
      ),
      (0, pg_core_1.index)("workpack_records_tenant_workpack_idx").on(
        t.tenantId,
        t.workpackId
      ),
      (0, pg_core_1.index)("workpack_records_tenant_type_sort_idx").on(
        t.tenantId,
        t.recordType,
        t.sortTimestamp
      ),
    ];
  }
);
exports.roleRecordTypeEnum = (0, pg_core_1.pgEnum)("role_record_type", [
  "role_blueprint",
  "role_agent",
  "role_contract",
  "role_workpack_binding",
  "role_routine",
  "role_routine_run",
  "role_checkpoint",
  "role_message",
  "role_handoff",
  "role_metric_snapshot",
  "role_exception_binding",
  "role_improvement_proposal",
  "role_promotion_gate",
  "role_telemetry_event",
  "role_incident_record",
  "role_routine_queue_item",
  "role_approval_request",
  "role_memory_item",
]);
exports.roleRecords = (0, pg_core_1.pgTable)(
  "role_records",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    recordType: (0, exports.roleRecordTypeEnum)("recordType").notNull(),
    recordId: (0, pg_core_1.varchar)("recordId", { length: 128 }).notNull(),
    roleId: (0, pg_core_1.varchar)("roleId", { length: 128 }),
    routineId: (0, pg_core_1.varchar)("routineId", { length: 128 }),
    routineRunId: (0, pg_core_1.varchar)("routineRunId", { length: 128 }),
    sortTimestamp: (0, pg_core_1.timestamp)("sortTimestamp", {
      withTimezone: true,
    }),
    payloadJson: (0, pg_core_1.jsonb)("payloadJson")
      .$type()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_32 ||
            (templateObject_32 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("role_records_tenant_type_record_unique").on(
        t.tenantId,
        t.recordType,
        t.recordId
      ),
      (0, pg_core_1.index)("role_records_type_record_idx").on(
        t.recordType,
        t.recordId
      ),
      (0, pg_core_1.index)("role_records_tenant_type_idx").on(
        t.tenantId,
        t.recordType
      ),
      (0, pg_core_1.index)("role_records_tenant_role_idx").on(
        t.tenantId,
        t.roleId
      ),
      (0, pg_core_1.index)("role_records_tenant_routine_idx").on(
        t.tenantId,
        t.routineId
      ),
      (0, pg_core_1.index)("role_records_tenant_routine_run_idx").on(
        t.tenantId,
        t.routineRunId
      ),
      (0, pg_core_1.index)("role_records_tenant_type_sort_idx").on(
        t.tenantId,
        t.recordType,
        t.sortTimestamp
      ),
    ];
  }
);
// ============================================================
// Invoice Configuration - Per-tenant or global invoice settings
// ============================================================
/**
 * Invoice Configuration - Customizable invoice headers
 * Supports both global defaults and per-tenant (White Label) customization
 */
exports.invoiceConfig = (0, pg_core_1.pgTable)("invoice_config", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Tenant ID (null for global default) */
  tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
    function () {
      return exports.tenants.id;
    },
    { onDelete: "cascade" }
  ),
  /** Company name on invoice */
  companyName: (0, pg_core_1.varchar)("companyName", { length: 256 }),
  /** Company address lines */
  addressLine1: (0, pg_core_1.varchar)("addressLine1", { length: 256 }),
  addressLine2: (0, pg_core_1.varchar)("addressLine2", { length: 256 }),
  city: (0, pg_core_1.varchar)("city", { length: 128 }),
  state: (0, pg_core_1.varchar)("state", { length: 128 }),
  postalCode: (0, pg_core_1.varchar)("postalCode", { length: 32 }),
  country: (0, pg_core_1.varchar)("country", { length: 128 }),
  /** Tax ID / VAT number */
  taxId: (0, pg_core_1.varchar)("taxId", { length: 64 }),
  /** Company email */
  email: (0, pg_core_1.varchar)("email", { length: 256 }),
  /** Company phone */
  phone: (0, pg_core_1.varchar)("phone", { length: 64 }),
  /** Company website */
  website: (0, pg_core_1.varchar)("website", { length: 256 }),
  /** Logo URL for invoice header */
  logoUrl: (0, pg_core_1.varchar)("logoUrl", { length: 512 }),
  /** Invoice footer text */
  footerText: (0, pg_core_1.text)("footerText"),
  /** Invoice terms and conditions */
  termsText: (0, pg_core_1.text)("termsText"),
  /** Bank details for wire transfer */
  bankDetails: (0, pg_core_1.json)("bankDetails").$type(),
  /** Additional custom fields */
  customFields: (0, pg_core_1.json)("customFields").$type(),
  /** Is this config active */
  isActive: (0, pg_core_1.boolean)("isActive").default(true),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// ============================================================
// Billing Domain — Feature 066
// ============================================================
exports.billingSubscriptionStatusEnum = (0, pg_core_1.pgEnum)(
  "billing_subscription_status",
  ["pending_migration", "active", "past_due", "downgraded_to_free", "canceled"]
);
exports.billingSubscriptionSourceEnum = (0, pg_core_1.pgEnum)(
  "billing_subscription_source",
  ["legacy_backfill", "beam_manual_invoice", "admin_created"]
);
exports.invoiceStreamEnum = (0, pg_core_1.pgEnum)("invoice_stream", [
  "domestic",
  "international",
]);
exports.invoiceTypeEnum = (0, pg_core_1.pgEnum)("invoice_type", [
  "subscription_renewal",
  "topup",
  "manual",
  "replacement",
]);
exports.invoiceStatusEnum = (0, pg_core_1.pgEnum)("invoice_status", [
  "draft",
  "issued",
  "payment_pending",
  "paid",
  "expired",
  "canceled",
  "canceled_overdue",
  "replaced",
]);
exports.documentLanguageEnum = (0, pg_core_1.pgEnum)("document_language", [
  "th",
  "en",
  "bilingual",
]);
exports.invoiceDocumentRenderReasonEnum = (0, pg_core_1.pgEnum)(
  "invoice_document_render_reason",
  [
    "initial_issue",
    "sync_header",
    "language_variant",
    "reissue_render",
    "manual_regeneration",
  ]
);
exports.renderedByTypeEnum = (0, pg_core_1.pgEnum)("rendered_by_type", [
  "system",
  "admin",
  "user",
]);
exports.paymentProviderEnum = (0, pg_core_1.pgEnum)("payment_provider", [
  "beam",
]);
exports.providerPaymentTypeEnum = (0, pg_core_1.pgEnum)(
  "provider_payment_type",
  ["charge", "payment_link"]
);
exports.paymentMethodTypeEnum = (0, pg_core_1.pgEnum)("payment_method_type", [
  "card",
]);
exports.billingPaymentMethodStatusEnum = (0, pg_core_1.pgEnum)(
  "billing_payment_method_status",
  [
    "active",
    "requires_verification",
    "expired",
    "revoked",
    "provider_unavailable",
  ]
);
exports.renewalModeEnum = (0, pg_core_1.pgEnum)("renewal_mode", [
  "manual_invoice",
  "auto_charge",
]);
exports.renewalAttemptStatusEnum = (0, pg_core_1.pgEnum)(
  "renewal_attempt_status",
  [
    "scheduled",
    "charge_in_progress",
    "retry_scheduled",
    "grace_period_active",
    "requires_new_card",
    "manual_fallback_active",
    "paused_dunning",
    "settled",
    "terminal_failure",
    "manual_review_required",
  ]
);
exports.declineCategoryEnum = (0, pg_core_1.pgEnum)("decline_category", [
  "soft_decline",
  "hard_decline",
  "provider_unknown",
  "manual_review_required",
]);
exports.paymentMethodSetupSessionStatusEnum = (0, pg_core_1.pgEnum)(
  "payment_method_setup_session_status",
  ["pending", "confirmed", "abandoned", "failed"]
);
exports.paymentStatusEnum = (0, pg_core_1.pgEnum)("payment_status", [
  "pending_provider_creation",
  "payment_pending",
  "provider_pending_unknown",
  "reconciliation_required",
  "paid",
  "paid_unapplied",
  "paid_recovered",
  "grant_pending_recovery",
  "downgraded_pending_reversal",
  "manual_review_required",
  "expired",
  "expired_internal",
  "canceled",
  "canceled_overdue",
]);
exports.paymentReconciliationStatusEnum = (0, pg_core_1.pgEnum)(
  "payment_reconciliation_status",
  [
    "not_required",
    "pending",
    "in_progress",
    "fixed",
    "manual_review_required",
    "failed",
  ]
);
exports.paymentBusinessEffectStatusEnum = (0, pg_core_1.pgEnum)(
  "payment_business_effect_status",
  ["not_started", "pending", "applied", "reversed", "failed"]
);
exports.amountMatchStatusEnum = (0, pg_core_1.pgEnum)("amount_match_status", [
  "unknown",
  "matched",
  "underpaid",
  "overpaid",
  "currency_mismatch",
  "mismatch",
]);
exports.paymentAttemptStatusEnum = (0, pg_core_1.pgEnum)(
  "payment_attempt_status",
  [
    "pending_provider_creation",
    "provider_pending_unknown",
    "active",
    "paid",
    "expired",
    "expired_internal",
    "canceled",
    "canceled_overdue",
    "reconciliation_required",
  ]
);
exports.webhookProcessingStatusEnum = (0, pg_core_1.pgEnum)(
  "webhook_processing_status",
  [
    "pending",
    "processed",
    "ignored_duplicate",
    "schema_invalid",
    "manual_review_required",
    "failed",
  ]
);
exports.reconciliationEntityTypeEnum = (0, pg_core_1.pgEnum)(
  "reconciliation_entity_type",
  ["payment", "invoice", "subscription"]
);
exports.reconciliationTriggerTypeEnum = (0, pg_core_1.pgEnum)(
  "reconciliation_trigger_type",
  ["webhook", "schedule", "admin", "support_case"]
);
exports.reconciliationResultEnum = (0, pg_core_1.pgEnum)(
  "reconciliation_result",
  ["no_change", "fixed", "manual_review_required", "failed"]
);
exports.supportRecoveryCaseStatusEnum = (0, pg_core_1.pgEnum)(
  "support_recovery_case_status",
  ["open", "in_progress", "waiting_for_customer", "resolved", "closed"]
);
exports.supportRecoveryIssueTypeEnum = (0, pg_core_1.pgEnum)(
  "support_recovery_issue_type",
  [
    "payment_not_applied",
    "wrong_downgrade",
    "amount_mismatch",
    "missing_document",
    "duplicate_charge_review",
    "other",
  ]
);
exports.supportRecoveryResolutionTypeEnum = (0, pg_core_1.pgEnum)(
  "support_recovery_resolution_type",
  [
    "reconciled",
    "manual_mark_paid",
    "reverse_downgrade",
    "invoice_reopened",
    "invoice_replaced",
    "not_billable",
    "other",
  ]
);
exports.billingMigrationRunStatusEnum = (0, pg_core_1.pgEnum)(
  "billing_migration_run_status",
  ["pending", "running", "completed", "completed_with_warnings", "failed"]
);
exports.billingEffectTypeEnum = (0, pg_core_1.pgEnum)("billing_effect_type", [
  "grant_credits",
  "renew_subscription",
  "downgrade_subscription",
  "reverse_downgrade",
]);
exports.billingSubscriptions = (0, pg_core_1.pgTable)(
  "billing_subscriptions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    planCode: (0, pg_core_1.varchar)("planCode", { length: 64 }).notNull(),
    status: (0, exports.billingSubscriptionStatusEnum)("status")
      .notNull()
      .default("pending_migration"),
    source: (0, exports.billingSubscriptionSourceEnum)("source")
      .notNull()
      .default("legacy_backfill"),
    billingPeriod: (0, exports.billingPeriodEnum)("billingPeriod")
      .notNull()
      .default("monthly"),
    renewalMode: (0, exports.renewalModeEnum)("renewalMode")
      .notNull()
      .default("manual_invoice"),
    defaultPaymentMethodId: (0, pg_core_1.integer)(
      "defaultPaymentMethodId"
    ).references(
      function () {
        return exports.billingPaymentMethods.id;
      },
      { onDelete: "set null" }
    ),
    autoRenewEnabled: (0, pg_core_1.boolean)("autoRenewEnabled")
      .notNull()
      .default(false),
    billingAnchorAt: (0, pg_core_1.timestamp)("billingAnchorAt", {
      withTimezone: true,
    }),
    currentPeriodStart: (0, pg_core_1.timestamp)("currentPeriodStart", {
      withTimezone: true,
    }),
    currentPeriodEnd: (0, pg_core_1.timestamp)("currentPeriodEnd", {
      withTimezone: true,
    }),
    nextInvoiceAt: (0, pg_core_1.timestamp)("nextInvoiceAt", {
      withTimezone: true,
    }),
    nextRetryAt: (0, pg_core_1.timestamp)("nextRetryAt", {
      withTimezone: true,
    }),
    graceEndsAt: (0, pg_core_1.timestamp)("graceEndsAt", {
      withTimezone: true,
    }),
    legacyPlanSnapshot: (0, pg_core_1.json)("legacyPlanSnapshot").$type(),
    migratedFromUserPlan: (0, pg_core_1.boolean)("migratedFromUserPlan")
      .notNull()
      .default(false),
    migrationRunId: (0, pg_core_1.integer)("migrationRunId"),
    downgradedAt: (0, pg_core_1.timestamp)("downgradedAt", {
      withTimezone: true,
    }),
    downgradeReason: (0, pg_core_1.varchar)("downgradeReason", { length: 128 }),
    lastRecoveryActionAt: (0, pg_core_1.timestamp)("lastRecoveryActionAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("billing_subscriptions_user_idx").on(t.userId),
      (0, pg_core_1.index)("billing_subscriptions_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
    ];
  }
);
exports.subscriptionPaymentSettings = (0, pg_core_1.pgTable)(
  "subscription_payment_settings",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    subscriptionId: (0, pg_core_1.integer)("subscriptionId")
      .notNull()
      .references(
        function () {
          return exports.billingSubscriptions.id;
        },
        { onDelete: "cascade" }
      ),
    renewalMode: (0, exports.renewalModeEnum)("renewalMode")
      .notNull()
      .default("manual_invoice"),
    defaultPaymentMethodId: (0, pg_core_1.integer)(
      "defaultPaymentMethodId"
    ).references(
      function () {
        return exports.billingPaymentMethods.id;
      },
      { onDelete: "set null" }
    ),
    retryPolicyJson: (0, pg_core_1.json)("retryPolicyJson").$type(),
    dunningPolicyJson: (0, pg_core_1.json)("dunningPolicyJson").$type(),
    autoRenewEnabled: (0, pg_core_1.boolean)("autoRenewEnabled")
      .notNull()
      .default(false),
    consentWithdrawnAt: (0, pg_core_1.timestamp)("consentWithdrawnAt", {
      withTimezone: true,
    }),
    rolloutCohort: (0, pg_core_1.varchar)("rolloutCohort", { length: 128 }),
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "subscription_payment_settings_subscription_unique"
      ).on(t.subscriptionId),
      (0, pg_core_1.index)(
        "subscription_payment_settings_default_method_idx"
      ).on(t.defaultPaymentMethodId),
    ];
  }
);
exports.paymentMethodAuditLogs = (0, pg_core_1.pgTable)(
  "payment_method_audit_logs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    paymentMethodId: (0, pg_core_1.integer)("paymentMethodId")
      .notNull()
      .references(
        function () {
          return exports.billingPaymentMethods.id;
        },
        { onDelete: "cascade" }
      ),
    action: (0, pg_core_1.varchar)("action", { length: 128 }).notNull(),
    actorType: (0, exports.renderedByTypeEnum)("actorType").notNull(),
    actorId: (0, pg_core_1.integer)("actorId"),
    reason: (0, pg_core_1.text)("reason"),
    beforeJson: (0, pg_core_1.json)("beforeJson").$type(),
    afterJson: (0, pg_core_1.json)("afterJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("payment_method_audit_logs_method_idx").on(
        t.paymentMethodId,
        t.createdAt
      ),
    ];
  }
);
exports.paymentMethodSetupSessions = (0, pg_core_1.pgTable)(
  "payment_method_setup_sessions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    provider: (0, exports.paymentProviderEnum)("provider")
      .notNull()
      .default("beam"),
    setupSessionId: (0, pg_core_1.varchar)("setupSessionId", {
      length: 128,
    }).notNull(),
    status: (0, exports.paymentMethodSetupSessionStatusEnum)("status")
      .notNull()
      .default("pending"),
    returnUrl: (0, pg_core_1.varchar)("returnUrl", { length: 2048 }),
    providerCustomerId: (0, pg_core_1.varchar)("providerCustomerId", {
      length: 128,
    }),
    providerPaymentMethodId: (0, pg_core_1.varchar)("providerPaymentMethodId", {
      length: 128,
    }),
    payloadJson: (0, pg_core_1.json)("payloadJson").$type(),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    confirmedAt: (0, pg_core_1.timestamp)("confirmedAt", {
      withTimezone: true,
    }),
    abandonedAt: (0, pg_core_1.timestamp)("abandonedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "payment_method_setup_sessions_setup_unique"
      ).on(t.provider, t.setupSessionId),
      (0, pg_core_1.index)("payment_method_setup_sessions_user_idx").on(
        t.userId,
        t.status,
        t.createdAt
      ),
    ];
  }
);
exports.billingMigrationRuns = (0, pg_core_1.pgTable)(
  "billing_migration_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    status: (0, exports.billingMigrationRunStatusEnum)("status")
      .notNull()
      .default("pending"),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    cutoverReadyAt: (0, pg_core_1.timestamp)("cutoverReadyAt", {
      withTimezone: true,
    }),
    totalCandidates: (0, pg_core_1.integer)("totalCandidates")
      .notNull()
      .default(0),
    migratedCount: (0, pg_core_1.integer)("migratedCount").notNull().default(0),
    skippedCount: (0, pg_core_1.integer)("skippedCount").notNull().default(0),
    ambiguousCount: (0, pg_core_1.integer)("ambiguousCount")
      .notNull()
      .default(0),
    reportJson: (0, pg_core_1.json)("reportJson").$type(),
    notes: (0, pg_core_1.text)("notes"),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
exports.billingProfiles = (0, pg_core_1.pgTable)(
  "billing_profiles",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    legalNameTh: (0, pg_core_1.varchar)("legalNameTh", { length: 256 }),
    legalNameEn: (0, pg_core_1.varchar)("legalNameEn", { length: 256 }),
    taxId: (0, pg_core_1.varchar)("taxId", { length: 64 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 64 }),
    email: (0, pg_core_1.varchar)("email", { length: 256 }),
    addressLine1: (0, pg_core_1.varchar)("addressLine1", { length: 256 }),
    addressLine2: (0, pg_core_1.varchar)("addressLine2", { length: 256 }),
    subdistrict: (0, pg_core_1.varchar)("subdistrict", { length: 128 }),
    district: (0, pg_core_1.varchar)("district", { length: 128 }),
    province: (0, pg_core_1.varchar)("province", { length: 128 }),
    postalCode: (0, pg_core_1.varchar)("postalCode", { length: 32 }),
    country: (0, pg_core_1.varchar)("country", { length: 128 }),
    contactName: (0, pg_core_1.varchar)("contactName", { length: 256 }),
    invoiceNote: (0, pg_core_1.text)("invoiceNote"),
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("billing_profiles_user_unique").on(t.userId),
      (0, pg_core_1.index)("billing_profiles_tenant_idx").on(t.tenantId),
    ];
  }
);
exports.sellerProfiles = (0, pg_core_1.pgTable)(
  "seller_profiles",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    entityNameTh: (0, pg_core_1.varchar)("entityNameTh", { length: 256 }),
    entityNameEn: (0, pg_core_1.varchar)("entityNameEn", { length: 256 }),
    taxId: (0, pg_core_1.varchar)("taxId", { length: 64 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 64 }),
    email: (0, pg_core_1.varchar)("email", { length: 256 }),
    addressLine1: (0, pg_core_1.varchar)("addressLine1", { length: 256 }),
    addressLine2: (0, pg_core_1.varchar)("addressLine2", { length: 256 }),
    subdistrict: (0, pg_core_1.varchar)("subdistrict", { length: 128 }),
    district: (0, pg_core_1.varchar)("district", { length: 128 }),
    province: (0, pg_core_1.varchar)("province", { length: 128 }),
    postalCode: (0, pg_core_1.varchar)("postalCode", { length: 32 }),
    country: (0, pg_core_1.varchar)("country", { length: 128 }),
    signerName: (0, pg_core_1.varchar)("signerName", { length: 256 }),
    signerTitle: (0, pg_core_1.varchar)("signerTitle", { length: 256 }),
    branchType: (0, pg_core_1.varchar)("branchType", { length: 64 }),
    footerNoteTh: (0, pg_core_1.text)("footerNoteTh"),
    footerNoteEn: (0, pg_core_1.text)("footerNoteEn"),
    autoGeneratedDocumentNoteTh: (0, pg_core_1.text)(
      "autoGeneratedDocumentNoteTh"
    ),
    autoGeneratedDocumentNoteEn: (0, pg_core_1.text)(
      "autoGeneratedDocumentNoteEn"
    ),
    logoUrl: (0, pg_core_1.varchar)("logoUrl", { length: 512 }),
    revision: (0, pg_core_1.integer)("revision").notNull().default(1),
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("seller_profiles_tenant_unique")
        .on(t.tenantId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_33 ||
              (templateObject_33 = __makeTemplateObject(
                ['"tenantId" IS NOT NULL'],
                ['"tenantId" IS NOT NULL']
              ))
          )
        ),
    ];
  }
);
exports.sellerProfileRevisions = (0, pg_core_1.pgTable)(
  "seller_profile_revisions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    sellerProfileId: (0, pg_core_1.integer)("sellerProfileId")
      .notNull()
      .references(
        function () {
          return exports.sellerProfiles.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    revision: (0, pg_core_1.integer)("revision").notNull(),
    snapshotJson: (0, pg_core_1.json)("snapshotJson").$type().notNull(),
    diffJson: (0, pg_core_1.json)("diffJson").$type(),
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("seller_profile_revisions_profile_idx").on(
        t.sellerProfileId,
        t.revision
      ),
    ];
  }
);
exports.billingPaymentMethods = (0, pg_core_1.pgTable)(
  "billing_payment_methods",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    provider: (0, exports.paymentProviderEnum)("provider")
      .notNull()
      .default("beam"),
    providerCustomerId: (0, pg_core_1.varchar)("providerCustomerId", {
      length: 128,
    }),
    providerPaymentMethodId: (0, pg_core_1.varchar)("providerPaymentMethodId", {
      length: 128,
    }).notNull(),
    methodType: (0, exports.paymentMethodTypeEnum)("methodType")
      .notNull()
      .default("card"),
    brand: (0, pg_core_1.varchar)("brand", { length: 64 }),
    last4: (0, pg_core_1.varchar)("last4", { length: 8 }),
    expMonth: (0, pg_core_1.integer)("expMonth"),
    expYear: (0, pg_core_1.integer)("expYear"),
    cardholderName: (0, pg_core_1.varchar)("cardholderName", { length: 256 }),
    isDefault: (0, pg_core_1.boolean)("isDefault").notNull().default(false),
    status: (0, exports.billingPaymentMethodStatusEnum)("status")
      .notNull()
      .default("active"),
    autoRenewEligible: (0, pg_core_1.boolean)("autoRenewEligible")
      .notNull()
      .default(false),
    consentVersion: (0, pg_core_1.varchar)("consentVersion", { length: 128 }),
    consentedAt: (0, pg_core_1.timestamp)("consentedAt", {
      withTimezone: true,
    }),
    revokedAt: (0, pg_core_1.timestamp)("revokedAt", { withTimezone: true }),
    metadataJson: (0, pg_core_1.json)("metadataJson").$type(),
    consentSnapshotJson: (0, pg_core_1.json)("consentSnapshotJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "billing_payment_methods_provider_ref_unique"
      ).on(t.provider, t.providerCustomerId, t.providerPaymentMethodId),
      (0, pg_core_1.uniqueIndex)("billing_payment_methods_default_scope_unique")
        .on(t.userId, t.tenantId, t.provider)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_34 ||
              (templateObject_34 = __makeTemplateObject(
                [
                  "\"isDefault\" = true AND \"status\" IN ('active', 'requires_verification')",
                ],
                [
                  "\"isDefault\" = true AND \"status\" IN ('active', 'requires_verification')",
                ]
              ))
          )
        ),
      (0, pg_core_1.index)("billing_payment_methods_user_idx").on(
        t.userId,
        t.createdAt
      ),
      (0, pg_core_1.index)("billing_payment_methods_tenant_idx").on(
        t.tenantId,
        t.userId
      ),
    ];
  }
);
exports.taxPolicies = (0, pg_core_1.pgTable)(
  "tax_policies",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    stream: (0, exports.invoiceStreamEnum)("stream").notNull(),
    taxName: (0, pg_core_1.varchar)("taxName", { length: 128 }).notNull(),
    taxRatePercent: (0, pg_core_1.numeric)("taxRatePercent", {
      precision: 7,
      scale: 4,
    })
      .notNull()
      .default("0"),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").notNull().default(false),
    effectiveFrom: (0, pg_core_1.timestamp)("effectiveFrom", {
      withTimezone: true,
    }).notNull(),
    effectiveTo: (0, pg_core_1.timestamp)("effectiveTo", {
      withTimezone: true,
    }),
    roundingPolicy: (0, pg_core_1.varchar)("roundingPolicy", { length: 64 })
      .notNull()
      .default("half_up_2dp"),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("tax_policies_stream_effective_idx").on(
        t.stream,
        t.effectiveFrom
      ),
      (0, pg_core_1.index)("tax_policies_tenant_stream_idx").on(
        t.tenantId,
        t.stream
      ),
    ];
  }
);
exports.documentNumberSequences = (0, pg_core_1.pgTable)(
  "document_number_sequences",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    stream: (0, exports.invoiceStreamEnum)("stream").notNull(),
    documentType: (0, pg_core_1.varchar)("documentType", { length: 32 })
      .notNull()
      .default("invoice"),
    prefix: (0, pg_core_1.varchar)("prefix", { length: 64 }).notNull(),
    yearMode: (0, pg_core_1.varchar)("yearMode", { length: 32 })
      .notNull()
      .default("gregorian"),
    currentRunningNo: (0, pg_core_1.integer)("currentRunningNo")
      .notNull()
      .default(0),
    isActive: (0, pg_core_1.boolean)("isActive").notNull().default(true),
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("document_number_sequences_scope_unique").on(
        t.tenantId,
        t.stream,
        t.documentType,
        t.prefix
      ),
    ];
  }
);
exports.invoices = (0, pg_core_1.pgTable)(
  "invoices",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    invoiceNumber: (0, pg_core_1.varchar)("invoiceNumber", { length: 64 }),
    invoiceStream: (0, exports.invoiceStreamEnum)("invoiceStream").notNull(),
    taxPolicyId: (0, pg_core_1.integer)("taxPolicyId").references(
      function () {
        return exports.taxPolicies.id;
      },
      { onDelete: "set null" }
    ),
    invoiceType: (0, exports.invoiceTypeEnum)("invoiceType").notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    subscriptionId: (0, pg_core_1.integer)("subscriptionId").references(
      function () {
        return exports.billingSubscriptions.id;
      },
      { onDelete: "set null" }
    ),
    orderId: (0, pg_core_1.varchar)("orderId", { length: 128 }),
    status: (0, exports.invoiceStatusEnum)("status").notNull().default("draft"),
    currency: (0, pg_core_1.varchar)("currency", { length: 16 })
      .notNull()
      .default("THB"),
    subtotal: (0, pg_core_1.numeric)("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    taxAmount: (0, pg_core_1.numeric)("taxAmount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: (0, pg_core_1.numeric)("totalAmount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    issuedAt: (0, pg_core_1.timestamp)("issuedAt", { withTimezone: true }),
    dueAt: (0, pg_core_1.timestamp)("dueAt", { withTimezone: true }),
    paidAt: (0, pg_core_1.timestamp)("paidAt", { withTimezone: true }),
    canceledAt: (0, pg_core_1.timestamp)("canceledAt", { withTimezone: true }),
    cancelReason: (0, pg_core_1.varchar)("cancelReason", { length: 128 }),
    headerVersion: (0, pg_core_1.integer)("headerVersion").notNull().default(1),
    sellerSnapshotJson: (0, pg_core_1.json)("sellerSnapshotJson").$type(),
    buyerSnapshotJson: (0, pg_core_1.json)("buyerSnapshotJson").$type(),
    totalsSnapshotJson: (0, pg_core_1.json)("totalsSnapshotJson").$type(),
    defaultDocumentLanguage: (0, exports.documentLanguageEnum)(
      "defaultDocumentLanguage"
    )
      .notNull()
      .default("th"),
    replacedByInvoiceId: (0, pg_core_1.integer)("replacedByInvoiceId"),
    supersedesInvoiceId: (0, pg_core_1.integer)("supersedesInvoiceId"),
    billingCycleStart: (0, pg_core_1.timestamp)("billingCycleStart", {
      withTimezone: true,
    }),
    billingCycleEnd: (0, pg_core_1.timestamp)("billingCycleEnd", {
      withTimezone: true,
    }),
    documentAccessScope: (0, pg_core_1.varchar)("documentAccessScope", {
      length: 32,
    })
      .notNull()
      .default("owner_or_admin"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("invoices_invoice_number_unique")
        .on(t.invoiceNumber)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_35 ||
              (templateObject_35 = __makeTemplateObject(
                ['"invoiceNumber" IS NOT NULL'],
                ['"invoiceNumber" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.uniqueIndex)("invoices_subscription_cycle_unique")
        .on(
          t.subscriptionId,
          t.billingCycleStart,
          t.billingCycleEnd,
          t.invoiceType
        )
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_36 ||
              (templateObject_36 = __makeTemplateObject(
                [
                  '"subscriptionId" IS NOT NULL AND "supersedesInvoiceId" IS NULL',
                ],
                [
                  '"subscriptionId" IS NOT NULL AND "supersedesInvoiceId" IS NULL',
                ]
              ))
          )
        ),
      (0, pg_core_1.index)("invoices_user_status_idx").on(t.userId, t.status),
      (0, pg_core_1.index)("invoices_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("invoices_subscription_idx").on(t.subscriptionId),
    ];
  }
);
exports.invoiceLineItems = (0, pg_core_1.pgTable)("invoice_line_items", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  invoiceId: (0, pg_core_1.integer)("invoiceId")
    .notNull()
    .references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
  itemType: (0, pg_core_1.varchar)("itemType", { length: 64 }).notNull(),
  description: (0, pg_core_1.text)("description").notNull(),
  quantity: (0, pg_core_1.numeric)("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  unitPrice: (0, pg_core_1.numeric)("unitPrice", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  amount: (0, pg_core_1.numeric)("amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  metadataJson: (0, pg_core_1.json)("metadataJson").$type(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
exports.invoiceDocuments = (0, pg_core_1.pgTable)(
  "invoice_documents",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    invoiceId: (0, pg_core_1.integer)("invoiceId")
      .notNull()
      .references(
        function () {
          return exports.invoices.id;
        },
        { onDelete: "cascade" }
      ),
    documentLanguage: (0, exports.documentLanguageEnum)(
      "documentLanguage"
    ).notNull(),
    documentVersion: (0, pg_core_1.integer)("documentVersion")
      .notNull()
      .default(1),
    templateVersion: (0, pg_core_1.varchar)("templateVersion", { length: 64 }),
    pdfFileUrl: (0, pg_core_1.varchar)("pdfFileUrl", { length: 1024 }),
    renderReason: (0, exports.invoiceDocumentRenderReasonEnum)(
      "renderReason"
    ).notNull(),
    renderedByType: (0, exports.renderedByTypeEnum)("renderedByType")
      .notNull()
      .default("system"),
    renderedById: (0, pg_core_1.integer)("renderedById"),
    isLatestForLanguage: (0, pg_core_1.boolean)("isLatestForLanguage")
      .notNull()
      .default(true),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("invoice_documents_invoice_language_idx").on(
        t.invoiceId,
        t.documentLanguage
      ),
    ];
  }
);
exports.payments = (0, pg_core_1.pgTable)(
  "payments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    invoiceId: (0, pg_core_1.integer)("invoiceId")
      .notNull()
      .references(
        function () {
          return exports.invoices.id;
        },
        { onDelete: "cascade" }
      ),
    paymentMethodId: (0, pg_core_1.integer)("paymentMethodId").references(
      function () {
        return exports.billingPaymentMethods.id;
      },
      { onDelete: "set null" }
    ),
    provider: (0, exports.paymentProviderEnum)("provider")
      .notNull()
      .default("beam"),
    providerPaymentType: (0, exports.providerPaymentTypeEnum)(
      "providerPaymentType"
    )
      .notNull()
      .default("charge"),
    providerPaymentId: (0, pg_core_1.varchar)("providerPaymentId", {
      length: 128,
    }),
    providerReferenceId: (0, pg_core_1.varchar)("providerReferenceId", {
      length: 128,
    }),
    status: (0, exports.paymentStatusEnum)("status")
      .notNull()
      .default("pending_provider_creation"),
    amount: (0, pg_core_1.numeric)("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    currency: (0, pg_core_1.varchar)("currency", { length: 16 })
      .notNull()
      .default("THB"),
    offSession: (0, pg_core_1.boolean)("offSession").notNull().default(false),
    declineCode: (0, pg_core_1.varchar)("declineCode", { length: 128 }),
    declineCategory: (0, exports.declineCategoryEnum)("declineCategory"),
    expectedAmount: (0, pg_core_1.numeric)("expectedAmount", {
      precision: 12,
      scale: 2,
    }),
    expectedCurrency: (0, pg_core_1.varchar)("expectedCurrency", {
      length: 16,
    }),
    settledAmount: (0, pg_core_1.numeric)("settledAmount", {
      precision: 12,
      scale: 2,
    }),
    settledCurrency: (0, pg_core_1.varchar)("settledCurrency", { length: 16 }),
    amountMatchStatus: (0, exports.amountMatchStatusEnum)("amountMatchStatus")
      .notNull()
      .default("unknown"),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    paidAt: (0, pg_core_1.timestamp)("paidAt", { withTimezone: true }),
    rawResponseJson: (0, pg_core_1.json)("rawResponseJson").$type(),
    reconciliationStatus: (0, exports.paymentReconciliationStatusEnum)(
      "reconciliationStatus"
    )
      .notNull()
      .default("not_required"),
    lastReconciledAt: (0, pg_core_1.timestamp)("lastReconciledAt", {
      withTimezone: true,
    }),
    providerStatusLastSeen: (0, pg_core_1.varchar)("providerStatusLastSeen", {
      length: 64,
    }),
    providerEventLastSeenId: (0, pg_core_1.varchar)("providerEventLastSeenId", {
      length: 128,
    }),
    businessEffectStatus: (0, exports.paymentBusinessEffectStatusEnum)(
      "businessEffectStatus"
    )
      .notNull()
      .default("not_started"),
    manualRecoveryRequired: (0, pg_core_1.boolean)("manualRecoveryRequired")
      .notNull()
      .default(false),
    manualRecoveryResolvedAt: (0, pg_core_1.timestamp)(
      "manualRecoveryResolvedAt",
      { withTimezone: true }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("payments_provider_payment_id_unique")
        .on(t.providerPaymentId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_37 ||
              (templateObject_37 = __makeTemplateObject(
                ['"providerPaymentId" IS NOT NULL'],
                ['"providerPaymentId" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.uniqueIndex)("payments_invoice_active_unique")
        .on(t.invoiceId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_38 ||
              (templateObject_38 = __makeTemplateObject(
                [
                  "\"status\" IN ('pending_provider_creation', 'payment_pending', 'provider_pending_unknown', 'reconciliation_required', 'manual_review_required')",
                ],
                [
                  "\"status\" IN ('pending_provider_creation', 'payment_pending', 'provider_pending_unknown', 'reconciliation_required', 'manual_review_required')",
                ]
              ))
          )
        ),
      (0, pg_core_1.index)("payments_invoice_status_idx").on(
        t.invoiceId,
        t.status
      ),
    ];
  }
);
exports.paymentAttempts = (0, pg_core_1.pgTable)(
  "payment_attempts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    paymentId: (0, pg_core_1.integer)("paymentId")
      .notNull()
      .references(
        function () {
          return exports.payments.id;
        },
        { onDelete: "cascade" }
      ),
    attemptNo: (0, pg_core_1.integer)("attemptNo").notNull(),
    status: (0, exports.paymentAttemptStatusEnum)("status")
      .notNull()
      .default("pending_provider_creation"),
    providerPaymentId: (0, pg_core_1.varchar)("providerPaymentId", {
      length: 128,
    }),
    providerReferenceId: (0, pg_core_1.varchar)("providerReferenceId", {
      length: 128,
    }),
    expectedAmount: (0, pg_core_1.numeric)("expectedAmount", {
      precision: 12,
      scale: 2,
    }),
    expectedCurrency: (0, pg_core_1.varchar)("expectedCurrency", {
      length: 16,
    }),
    settledAmount: (0, pg_core_1.numeric)("settledAmount", {
      precision: 12,
      scale: 2,
    }),
    settledCurrency: (0, pg_core_1.varchar)("settledCurrency", { length: 16 }),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    providerPayloadJson: (0, pg_core_1.json)("providerPayloadJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "payment_attempts_payment_attempt_no_unique"
      ).on(t.paymentId, t.attemptNo),
    ];
  }
);
exports.renewalAttempts = (0, pg_core_1.pgTable)(
  "renewal_attempts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    subscriptionId: (0, pg_core_1.integer)("subscriptionId")
      .notNull()
      .references(
        function () {
          return exports.billingSubscriptions.id;
        },
        { onDelete: "cascade" }
      ),
    invoiceId: (0, pg_core_1.integer)("invoiceId").references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
    cycleKey: (0, pg_core_1.varchar)("cycleKey", { length: 128 }).notNull(),
    renewalModeSnapshot: (0, exports.renewalModeEnum)("renewalModeSnapshot")
      .notNull()
      .default("manual_invoice"),
    paymentMethodId: (0, pg_core_1.integer)("paymentMethodId").references(
      function () {
        return exports.billingPaymentMethods.id;
      },
      { onDelete: "set null" }
    ),
    attemptNo: (0, pg_core_1.integer)("attemptNo").notNull().default(1),
    status: (0, exports.renewalAttemptStatusEnum)("status")
      .notNull()
      .default("scheduled"),
    retryClassification: (0, pg_core_1.varchar)("retryClassification", {
      length: 64,
    }),
    scheduledAt: (0, pg_core_1.timestamp)("scheduledAt", {
      withTimezone: true,
    }),
    executedAt: (0, pg_core_1.timestamp)("executedAt", { withTimezone: true }),
    failureCode: (0, pg_core_1.varchar)("failureCode", { length: 128 }),
    failureMessage: (0, pg_core_1.text)("failureMessage"),
    nextRetryAt: (0, pg_core_1.timestamp)("nextRetryAt", {
      withTimezone: true,
    }),
    finalOutcome: (0, pg_core_1.varchar)("finalOutcome", { length: 128 }),
    metadataJson: (0, pg_core_1.json)("metadataJson").$type(),
    supersededByAttemptId: (0, pg_core_1.integer)("supersededByAttemptId"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "renewal_attempts_subscription_cycle_attempt_unique"
      ).on(t.subscriptionId, t.cycleKey, t.attemptNo),
      (0, pg_core_1.uniqueIndex)("renewal_attempts_active_cycle_unique")
        .on(t.subscriptionId, t.cycleKey)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_39 ||
              (templateObject_39 = __makeTemplateObject(
                [
                  "\"status\" IN ('scheduled', 'charge_in_progress', 'retry_scheduled', 'grace_period_active', 'paused_dunning', 'manual_review_required')",
                ],
                [
                  "\"status\" IN ('scheduled', 'charge_in_progress', 'retry_scheduled', 'grace_period_active', 'paused_dunning', 'manual_review_required')",
                ]
              ))
          )
        ),
      (0, pg_core_1.index)("renewal_attempts_invoice_idx").on(t.invoiceId),
      (0, pg_core_1.index)("renewal_attempts_payment_method_idx").on(
        t.paymentMethodId
      ),
    ];
  }
);
exports.webhookEvents = (0, pg_core_1.pgTable)(
  "webhook_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    provider: (0, exports.paymentProviderEnum)("provider")
      .notNull()
      .default("beam"),
    invoiceId: (0, pg_core_1.integer)("invoiceId").references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
    paymentId: (0, pg_core_1.integer)("paymentId").references(
      function () {
        return exports.payments.id;
      },
      { onDelete: "cascade" }
    ),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 128 }).notNull(),
    eventId: (0, pg_core_1.varchar)("eventId", { length: 128 }),
    signatureValid: (0, pg_core_1.boolean)("signatureValid")
      .notNull()
      .default(false),
    payloadJson: (0, pg_core_1.json)("payloadJson").$type(),
    processingStatus: (0, exports.webhookProcessingStatusEnum)(
      "processingStatus"
    )
      .notNull()
      .default("pending"),
    processedAt: (0, pg_core_1.timestamp)("processedAt", {
      withTimezone: true,
    }),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    validatedSecretVersion: (0, pg_core_1.varchar)("validatedSecretVersion", {
      length: 64,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("webhook_events_provider_event_unique")
        .on(t.provider, t.eventId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_40 ||
              (templateObject_40 = __makeTemplateObject(
                ['"eventId" IS NOT NULL'],
                ['"eventId" IS NOT NULL']
              ))
          )
        ),
    ];
  }
);
exports.invoiceAuditLogs = (0, pg_core_1.pgTable)(
  "invoice_audit_logs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    invoiceId: (0, pg_core_1.integer)("invoiceId")
      .notNull()
      .references(
        function () {
          return exports.invoices.id;
        },
        { onDelete: "cascade" }
      ),
    action: (0, pg_core_1.varchar)("action", { length: 128 }).notNull(),
    actorType: (0, exports.renderedByTypeEnum)("actorType").notNull(),
    actorId: (0, pg_core_1.integer)("actorId"),
    reason: (0, pg_core_1.text)("reason"),
    beforeJson: (0, pg_core_1.json)("beforeJson").$type(),
    afterJson: (0, pg_core_1.json)("afterJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("invoice_audit_logs_invoice_idx").on(
        t.invoiceId,
        t.createdAt
      ),
    ];
  }
);
exports.notificationDispatches = (0, pg_core_1.pgTable)(
  "notification_dispatches",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    invoiceId: (0, pg_core_1.integer)("invoiceId").references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
    renewalAttemptId: (0, pg_core_1.integer)("renewalAttemptId").references(
      function () {
        return exports.renewalAttempts.id;
      },
      { onDelete: "set null" }
    ),
    notificationType: (0, pg_core_1.varchar)("notificationType", {
      length: 64,
    }).notNull(),
    channel: (0, pg_core_1.varchar)("channel", { length: 32 }).notNull(),
    dedupeKey: (0, pg_core_1.varchar)("dedupeKey", { length: 256 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 32 })
      .notNull()
      .default("pending"),
    sentAt: (0, pg_core_1.timestamp)("sentAt", { withTimezone: true }),
    suppressedReason: (0, pg_core_1.varchar)("suppressedReason", {
      length: 256,
    }),
    metadataJson: (0, pg_core_1.json)("metadataJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("notification_dispatches_dedupe_unique").on(
        t.dedupeKey
      ),
      (0, pg_core_1.index)("notification_dispatches_invoice_idx").on(
        t.invoiceId,
        t.notificationType
      ),
    ];
  }
);
exports.billingEffects = (0, pg_core_1.pgTable)(
  "billing_effects",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    effectKey: (0, pg_core_1.varchar)("effectKey", { length: 256 }).notNull(),
    effectType: (0, exports.billingEffectTypeEnum)("effectType").notNull(),
    invoiceId: (0, pg_core_1.integer)("invoiceId").references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
    paymentId: (0, pg_core_1.integer)("paymentId").references(
      function () {
        return exports.payments.id;
      },
      { onDelete: "cascade" }
    ),
    subscriptionId: (0, pg_core_1.integer)("subscriptionId").references(
      function () {
        return exports.billingSubscriptions.id;
      },
      { onDelete: "cascade" }
    ),
    metadataJson: (0, pg_core_1.json)("metadataJson").$type(),
    appliedAt: (0, pg_core_1.timestamp)("appliedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("billing_effects_effect_key_unique").on(
        t.effectKey
      ),
    ];
  }
);
exports.reconciliationRuns = (0, pg_core_1.pgTable)(
  "reconciliation_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    entityType: (0, exports.reconciliationEntityTypeEnum)(
      "entityType"
    ).notNull(),
    entityId: (0, pg_core_1.integer)("entityId").notNull(),
    renewalAttemptId: (0, pg_core_1.integer)("renewalAttemptId").references(
      function () {
        return exports.renewalAttempts.id;
      },
      { onDelete: "set null" }
    ),
    triggerType: (0, exports.reconciliationTriggerTypeEnum)(
      "triggerType"
    ).notNull(),
    result: (0, exports.reconciliationResultEnum)("result").notNull(),
    beforeJson: (0, pg_core_1.json)("beforeJson").$type(),
    afterJson: (0, pg_core_1.json)("afterJson").$type(),
    notes: (0, pg_core_1.text)("notes"),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("reconciliation_runs_entity_idx").on(
        t.entityType,
        t.entityId,
        t.createdAt
      ),
    ];
  }
);
exports.supportRecoveryCases = (0, pg_core_1.pgTable)(
  "support_recovery_cases",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    invoiceId: (0, pg_core_1.integer)("invoiceId").references(
      function () {
        return exports.invoices.id;
      },
      { onDelete: "cascade" }
    ),
    paymentId: (0, pg_core_1.integer)("paymentId").references(
      function () {
        return exports.payments.id;
      },
      { onDelete: "cascade" }
    ),
    status: (0, exports.supportRecoveryCaseStatusEnum)("status")
      .notNull()
      .default("open"),
    issueType: (0, exports.supportRecoveryIssueTypeEnum)("issueType").notNull(),
    customerReportedAt: (0, pg_core_1.timestamp)("customerReportedAt", {
      withTimezone: true,
    }),
    assignedAdminId: (0, pg_core_1.integer)("assignedAdminId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    resolutionType: (0, exports.supportRecoveryResolutionTypeEnum)(
      "resolutionType"
    ),
    resolutionNote: (0, pg_core_1.text)("resolutionNote"),
    evidenceJson: (0, pg_core_1.json)("evidenceJson").$type(),
    resolvedAt: (0, pg_core_1.timestamp)("resolvedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("support_recovery_cases_invoice_idx").on(
        t.invoiceId,
        t.status
      ),
      (0, pg_core_1.index)("support_recovery_cases_payment_idx").on(
        t.paymentId,
        t.status
      ),
    ];
  }
);
/**
 * Blog Posts - Multi-tenant blog system
 * Each tenant has its own blog posts with full CRUD support
 */
exports.blogPosts = (0, pg_core_1.pgTable)("blog_posts", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Tenant this post belongs to */
  tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
    .notNull()
    .references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
  /** URL-friendly slug */
  slug: (0, pg_core_1.varchar)("slug", { length: 255 }).notNull(),
  /** Post title */
  title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
  /** Short excerpt/summary */
  excerpt: (0, pg_core_1.text)("excerpt"),
  /** Full post content (HTML) */
  content: (0, pg_core_1.text)("content"),
  /** Cover image URL */
  coverImage: (0, pg_core_1.varchar)("coverImage", { length: 1024 }),
  /** Library attachment IDs from the article composer */
  mediaAttachments: (0, pg_core_1.json)("mediaAttachments").$type(),
  /** Author name */
  author: (0, pg_core_1.varchar)("author", { length: 255 }),
  /** Author avatar URL */
  authorAvatar: (0, pg_core_1.varchar)("authorAvatar", { length: 1024 }),
  /** Category */
  category: (0, pg_core_1.varchar)("category", { length: 100 }),
  /** Tags (JSON array) */
  tags: (0, pg_core_1.json)("tags").$type(),
  /** Estimated read time e.g. "5 min read" */
  readTime: (0, pg_core_1.varchar)("readTime", { length: 50 }),
  /** Whether post is published */
  isPublished: (0, pg_core_1.boolean)("isPublished").default(false).notNull(),
  /** Whether post is featured */
  isFeatured: (0, pg_core_1.boolean)("isFeatured").default(false).notNull(),
  /** SEO metadata */
  metaDescription: (0, pg_core_1.text)("metaDescription"),
  metaKeywords: (0, pg_core_1.varchar)("metaKeywords", { length: 500 }),
  /** Publish date (can be set to future for scheduling) */
  publishedAt: (0, pg_core_1.timestamp)("publishedAt", { withTimezone: true }),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// ============================================================
// Content Composer Drafts — Feature 063
// ============================================================
exports.contentComposerDrafts = (0, pg_core_1.pgTable)(
  "content_composer_drafts",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    topic: (0, pg_core_1.text)("topic").notNull().default(""),
    executionSource: (0, pg_core_1.varchar)("executionSource", { length: 20 }),
    skillId: (0, pg_core_1.varchar)("skillId", { length: 255 }),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 255 }),
    articleBody: (0, pg_core_1.text)("articleBody"),
    requiresWebSearch: (0, pg_core_1.boolean)("requiresWebSearch")
      .notNull()
      .default(false),
    requiresThinking: (0, pg_core_1.boolean)("requiresThinking")
      .notNull()
      .default(false),
    attachmentIds: (0, pg_core_1.json)("attachmentIds")
      .$type()
      .notNull()
      .default([]),
    destinationKind: (0, pg_core_1.varchar)("destinationKind", { length: 20 }),
    docsSubKind: (0, pg_core_1.varchar)("docsSubKind", { length: 20 }),
    docsTargetId: (0, pg_core_1.integer)("docsTargetId"),
    blogTargetId: (0, pg_core_1.integer)("blogTargetId"),
    socialPlatform: (0, pg_core_1.varchar)("socialPlatform", { length: 50 }),
    socialTargetId: (0, pg_core_1.integer)("socialTargetId"),
    socialCaption: (0, pg_core_1.text)("socialCaption"),
    status: (0, pg_core_1.varchar)("status", { length: 30 })
      .notNull()
      .default("draft"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    publishedAt: (0, pg_core_1.timestamp)("publishedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("ccd_tenant_user_status_idx").on(
        t.tenantId,
        t.userId,
        t.status
      ),
      (0, pg_core_1.index)("ccd_tenant_updated_at_idx").on(
        t.tenantId,
        t.updatedAt
      ),
    ];
  }
);
// ============================================================
// Chat Alert — Scheduled Messages System
// ============================================================
exports.scheduleStatusEnum = (0, pg_core_1.pgEnum)("schedule_status", [
  "active",
  "paused",
  "completed",
  "failed",
]);
exports.notificationTypeEnum = (0, pg_core_1.pgEnum)("notification_type", [
  "scheduled_message",
  "follow_request",
  "alert",
  "system",
]);
exports.reminderPriorityEnum = (0, pg_core_1.pgEnum)("reminder_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);
exports.followStatusEnum = (0, pg_core_1.pgEnum)("follow_status", [
  "active",
  "blocked",
]);
/**
 * Scheduled Messages — recurring or one-time scheduled chat prompts
 */
exports.scheduledMessages = (0, pg_core_1.pgTable)(
  "scheduled_messages",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Owner who created the schedule */
    userId: (0, pg_core_1.integer)("userId")
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    /** Conversation to post into (null = create new) */
    conversationId: (0, pg_core_1.integer)("conversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    /** Target user to send to (null = self) */
    targetUserId: (0, pg_core_1.integer)("targetUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    ),
    /** The prompt to send to the LLM */
    prompt: (0, pg_core_1.text)("prompt").notNull(),
    /** Cron expression for recurring (e.g. "0 8 * * *") */
    cronExpression: (0, pg_core_1.varchar)("cronExpression", { length: 100 }),
    /** User's timezone (e.g. "Asia/Bangkok") */
    timezone: (0, pg_core_1.varchar)("timezone", { length: 64 })
      .default("Asia/Bangkok")
      .notNull(),
    /** For one-time schedules */
    scheduledAt: (0, pg_core_1.timestamp)("scheduledAt", {
      withTimezone: true,
    }),
    /** Recurring or one-time */
    isRecurring: (0, pg_core_1.boolean)("isRecurring").default(false).notNull(),
    /** Current status */
    status: (0, exports.scheduleStatusEnum)("status")
      .default("active")
      .notNull(),
    /** LLM model to use */
    modelId: (0, pg_core_1.varchar)("modelId", { length: 128 }),
    /** Dynamic parameters required to execute the assigned skill */
    dynamicParams: (0, pg_core_1.json)("dynamicParams").$type(),
    /** Associated skill */
    skillId: (0, pg_core_1.varchar)("skillId", { length: 100 }).default(
      "chat-alert"
    ),
    /** Simple reminder — skip LLM, just show prompt as-is (0 credits) */
    isSimpleReminder: (0, pg_core_1.boolean)("isSimpleReminder")
      .default(false)
      .notNull(),
    /** Priority level — critical shows full-screen modal */
    priority: (0, exports.reminderPriorityEnum)("priority")
      .default("normal")
      .notNull(),
    /** Send email notification on execution */
    emailNotify: (0, pg_core_1.boolean)("emailNotify").default(true).notNull(),
    /** Human-readable description of the schedule */
    description: (0, pg_core_1.text)("description"),
    /** Last execution time */
    lastRunAt: (0, pg_core_1.timestamp)("lastRunAt", { withTimezone: true }),
    /** Next planned execution */
    nextRunAt: (0, pg_core_1.timestamp)("nextRunAt", { withTimezone: true }),
    /** BullMQ job ID for cancellation */
    bullmqJobId: (0, pg_core_1.varchar)("bullmqJobId", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("scheduled_messages_user_status").on(
        t.userId,
        t.status
      ),
      (0, pg_core_1.index)("scheduled_messages_user_created").on(
        t.userId,
        t.createdAt
      ),
      (0, pg_core_1.index)("scheduled_messages_status").on(t.status),
    ];
  }
);
/**
 * Scheduled Message Logs — execution history
 */
exports.scheduledMessageLogs = (0, pg_core_1.pgTable)(
  "scheduled_message_logs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    scheduledMessageId: (0, pg_core_1.integer)("scheduledMessageId")
      .references(
        function () {
          return exports.scheduledMessages.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    executedAt: (0, pg_core_1.timestamp)("executedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** LLM response content */
    responseContent: (0, pg_core_1.text)("responseContent"),
    /** Credits consumed */
    creditsUsed: (0, pg_core_1.numeric)("creditsUsed", {
      precision: 10,
      scale: 4,
    }).default("0"),
    /** Success or failure */
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .default("success")
      .notNull(),
    /** Error message if failed */
    error: (0, pg_core_1.text)("error"),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("scheduled_message_logs_schedule_id").on(
        t.scheduledMessageId,
        t.executedAt
      ),
    ];
  }
);
/**
 * User Follows — follow relationships between users
 */
exports.userFollows = (0, pg_core_1.pgTable)("user_follows", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  followerId: (0, pg_core_1.integer)("followerId")
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    )
    .notNull(),
  followingId: (0, pg_core_1.integer)("followingId")
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    )
    .notNull(),
  status: (0, exports.followStatusEnum)("status").default("active").notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * User Notifications — in-app notification center
 */
exports.userNotifications = (0, pg_core_1.pgTable)(
  "user_notifications",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    type: (0, exports.notificationTypeEnum)("type").notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    content: (0, pg_core_1.text)("content"),
    /** Link to related conversation */
    conversationId: (0, pg_core_1.integer)("conversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    /** Link to related schedule */
    scheduledMessageId: (0, pg_core_1.integer)("scheduledMessageId").references(
      function () {
        return exports.scheduledMessages.id;
      },
      { onDelete: "set null" }
    ),
    /** Priority — high/critical triggers full-screen modal */
    priority: (0, exports.reminderPriorityEnum)("priority")
      .default("normal")
      .notNull(),
    isRead: (0, pg_core_1.boolean)("isRead").default(false).notNull(),
    /** Structured resource linking — e.g. "media_job", "workflow", "skill", "feedback", "agency", "approval" */
    relatedResourceType: (0, pg_core_1.varchar)("relatedResourceType", {
      length: 50,
    }),
    /** ID of the related resource for direct navigation */
    relatedResourceId: (0, pg_core_1.varchar)("relatedResourceId", {
      length: 200,
    }),
    /** Direct action URL — overrides legacy string matching */
    actionUrl: (0, pg_core_1.text)("actionUrl"),
    /** Action button label */
    actionLabel: (0, pg_core_1.varchar)("actionLabel", { length: 100 }),
    /** Structured metadata: error details, metrics, retry info, related items */
    metadata: (0, pg_core_1.jsonb)("metadata").$type(),
    /** Separate from isRead — user explicitly dismissed */
    isDismissed: (0, pg_core_1.boolean)("isDismissed").default(false).notNull(),
    /** Auto-cleanup after this timestamp */
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    /** Dedup identifier, e.g. "media_job_failure:user_123" */
    groupKey: (0, pg_core_1.varchar)("groupKey", { length: 200 }),
    /** Number of events this notification represents */
    occurrenceCount: (0, pg_core_1.integer)("occurrenceCount")
      .default(1)
      .notNull(),
    /** When first event in group occurred */
    firstOccurredAt: (0, pg_core_1.timestamp)("firstOccurredAt", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    /** When most recent event occurred */
    lastOccurredAt: (0, pg_core_1.timestamp)("lastOccurredAt", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("user_notifications_user_read").on(
        t.userId,
        t.isRead,
        t.createdAt
      ),
      (0, pg_core_1.index)("user_notifications_user_priority").on(
        t.userId,
        t.isRead,
        t.priority
      ),
      (0, pg_core_1.index)("user_notifications_resource").on(
        t.relatedResourceType,
        t.relatedResourceId
      ),
      (0, pg_core_1.uniqueIndex)("idx_notif_dedup_active")
        .on(t.userId, t.groupKey)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_41 ||
              (templateObject_41 = __makeTemplateObject(
                ['"isDismissed" = false AND "groupKey" IS NOT NULL'],
                ['"isDismissed" = false AND "groupKey" IS NOT NULL']
              ))
          )
        ),
    ];
  }
);
/**
 * Notification Occurrences — individual events grouped under a deduped notification
 */
exports.notificationOccurrences = (0, pg_core_1.pgTable)(
  "notification_occurrences",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    notificationId: (0, pg_core_1.integer)("notificationId")
      .references(
        function () {
          return exports.userNotifications.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    content: (0, pg_core_1.text)("content"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    occurredAt: (0, pg_core_1.timestamp)("occurredAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_notif_occurrences_notif_time").on(
        t.notificationId,
        t.occurredAt
      ),
    ];
  }
);
/**
 * Valid notification categories for preference management
 */
exports.NOTIFICATION_CATEGORIES = [
  "system_health",
  "media_jobs",
  "workflow",
  "skill",
  "feedback",
  "agency",
  "follow",
  "scheduled",
  "security",
  "business",
];
/**
 * Notification Preferences — per-user, per-category delivery settings
 */
exports.notificationPreferences = (0, pg_core_1.pgTable)(
  "notification_preferences",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    category: (0, pg_core_1.varchar)("category", { length: 50 }).notNull(),
    inApp: (0, pg_core_1.boolean)("inApp").default(true).notNull(),
    email: (0, pg_core_1.boolean)("email").default(false).notNull(),
    telegram: (0, pg_core_1.boolean)("telegram").default(false).notNull(),
    minSeverity: (0, exports.reminderPriorityEnum)("minSeverity"),
    mutedUntil: (0, pg_core_1.timestamp)("mutedUntil", { withTimezone: true }),
    emailDigestFrequency: (0, pg_core_1.varchar)("emailDigestFrequency", {
      length: 10,
    }),
    emailDigestHour: (0, pg_core_1.integer)("emailDigestHour"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("notification_preferences_user_category").on(
        t.userId,
        t.category
      ),
    ];
  }
);
/**
 * Alert Rules — tenant-scoped metric thresholds that trigger notifications
 */
exports.alertRules = (0, pg_core_1.pgTable)(
  "alert_rules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    metricName: (0, pg_core_1.varchar)("metricName", { length: 100 }).notNull(),
    operator: (0, pg_core_1.varchar)("operator", { length: 10 }).notNull(),
    threshold: (0, pg_core_1.doublePrecision)("threshold").notNull(),
    windowMinutes: (0, pg_core_1.integer)("windowMinutes").default(5).notNull(),
    severity: (0, exports.reminderPriorityEnum)("severity")
      .default("high")
      .notNull(),
    channels: (0, pg_core_1.jsonb)("channels")
      .$type()
      .default(["in_app"])
      .notNull(),
    targetRole: (0, pg_core_1.varchar)("targetRole", { length: 20 }),
    targetUserId: (0, pg_core_1.integer)("targetUserId"),
    cooldownMinutes: (0, pg_core_1.integer)("cooldownMinutes")
      .default(10)
      .notNull(),
    lastTriggeredAt: (0, pg_core_1.timestamp)("lastTriggeredAt", {
      withTimezone: true,
    }),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("alert_rules_tenant_enabled").on(
        t.tenantId,
        t.isEnabled
      ),
    ];
  }
);
/**
 * Notification Webhooks — configurable HTTP endpoints for notification delivery
 */
exports.notificationWebhooks = (0, pg_core_1.pgTable)(
  "notification_webhooks",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    url: (0, pg_core_1.text)("url").notNull(),
    secretEncrypted: (0, pg_core_1.text)("secretEncrypted").notNull(),
    categories: (0, pg_core_1.jsonb)("categories").$type(),
    minSeverity: (0, exports.reminderPriorityEnum)("minSeverity"),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    lastDeliveredAt: (0, pg_core_1.timestamp)("lastDeliveredAt", {
      withTimezone: true,
    }),
    failureCount: (0, pg_core_1.integer)("failureCount").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("notification_webhooks_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("notification_webhooks_user_idx").on(t.userId),
    ];
  }
);
/**
 * Escalation Policies — define escalation paths for unresolved notifications
 */
exports.escalationPolicies = (0, pg_core_1.pgTable)(
  "escalation_policies",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    triggerSeverity: (0, exports.reminderPriorityEnum)(
      "triggerSeverity"
    ).notNull(),
    triggerMinutes: (0, pg_core_1.integer)("triggerMinutes").notNull(),
    escalateToRole: (0, pg_core_1.varchar)("escalateToRole", { length: 20 }),
    escalateToUserId: (0, pg_core_1.integer)("escalateToUserId"),
    escalateChannels: (0, pg_core_1.jsonb)("escalateChannels")
      .$type()
      .notNull(),
    escalateMessage: (0, pg_core_1.text)("escalateMessage"),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("escalation_policies_tenant_enabled").on(
        t.tenantId,
        t.isEnabled
      ),
    ];
  }
);
/**
 * Direct Messages — user-to-user messaging
 * Follow: max 10 messages, Friend (mutual follow): unlimited
 */
exports.directMessages = (0, pg_core_1.pgTable)("direct_messages", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  senderId: (0, pg_core_1.integer)("senderId")
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    )
    .notNull(),
  receiverId: (0, pg_core_1.integer)("receiverId")
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    )
    .notNull(),
  content: (0, pg_core_1.text)("content").notNull(),
  /** Urgent messages show as pop-up alerts */
  isUrgent: (0, pg_core_1.boolean)("isUrgent").default(false).notNull(),
  isRead: (0, pg_core_1.boolean)("isRead").default(false).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// ==================== Account Security ====================
/** Logs every registration attempt for duplicate detection */
exports.registrationEvents = (0, pg_core_1.pgTable)(
  "registration_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId").references(function () {
      return exports.users.id;
    }),
    email: (0, pg_core_1.varchar)("email", { length: 320 }).notNull(),
    normalizedEmail: (0, pg_core_1.varchar)("normalizedEmail", {
      length: 320,
    }).notNull(),
    ipAddress: (0, pg_core_1.varchar)("ipAddress", { length: 45 }).notNull(),
    fingerprintHash: (0, pg_core_1.varchar)("fingerprintHash", { length: 64 }),
    userAgent: (0, pg_core_1.text)("userAgent"),
    loginMethod: (0, pg_core_1.varchar)("loginMethod", { length: 64 }),
    trustScore: (0, pg_core_1.integer)("trustScore"),
    outcome: (0, pg_core_1.varchar)("outcome", { length: 20 }).notNull(), // allowed, flagged, blocked
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("registration_events_created_user_idx").on(
        t.createdAt,
        t.userId
      ),
    ];
  }
);
/** Links browser fingerprint hashes to users */
exports.deviceFingerprints = (0, pg_core_1.pgTable)("device_fingerprints", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  userId: (0, pg_core_1.integer)("userId")
    .notNull()
    .references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    ),
  fingerprintHash: (0, pg_core_1.varchar)("fingerprintHash", {
    length: 64,
  }).notNull(),
  firstSeenAt: (0, pg_core_1.timestamp)("firstSeenAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: (0, pg_core_1.timestamp)("lastSeenAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  seenCount: (0, pg_core_1.integer)("seenCount").default(1).notNull(),
});
/** Admin-managed blocklist for emails, IPs, fingerprints */
exports.blockedPatterns = (0, pg_core_1.pgTable)("blocked_patterns", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  patternType: (0, pg_core_1.varchar)("patternType", { length: 20 }).notNull(), // email_domain, email, ip, fingerprint
  pattern: (0, pg_core_1.varchar)("pattern", { length: 320 }).notNull(),
  reason: (0, pg_core_1.text)("reason"),
  createdBy: (0, pg_core_1.integer)("createdBy").references(function () {
    return exports.users.id;
  }),
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// Menu config — admin overrides per menu item, platform, and tenant
exports.menuConfig = (0, pg_core_1.pgTable)(
  "menu_config",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    menuItemId: (0, pg_core_1.varchar)("menu_item_id", {
      length: 50,
    }).notNull(),
    platform: (0, pg_core_1.varchar)("platform", { length: 10 })
      .notNull()
      .default("web"),
    visible: (0, pg_core_1.boolean)("visible").default(true).notNull(),
    customLabel: (0, pg_core_1.varchar)("custom_label", { length: 100 }),
    customIcon: (0, pg_core_1.varchar)("custom_icon", { length: 50 }),
    sortOrder: (0, pg_core_1.integer)("sort_order"),
    tenantId: (0, pg_core_1.integer)("tenant_id").references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (table) {
    return [
      (0, pg_core_1.uniqueIndex)("menu_config_unique").on(
        table.menuItemId,
        table.platform,
        table.tenantId
      ),
    ];
  }
);
// Video Editor Projects — persistent project storage with auto-save
exports.videoEditorProjects = (0, pg_core_1.pgTable)(
  "video_editor_projects",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 256 }).notNull(),
    projectData: (0, pg_core_1.json)("projectData").notNull(),
    thumbnailUrl: (0, pg_core_1.text)("thumbnailUrl"),
    duration: (0, pg_core_1.numeric)("duration", {
      precision: 10,
      scale: 2,
    }).default("0"),
    resolution: (0, pg_core_1.varchar)("resolution", { length: 20 }),
    trackCount: (0, pg_core_1.integer)("trackCount").default(4),
    clipCount: (0, pg_core_1.integer)("clipCount").default(0),
    version: (0, pg_core_1.varchar)("version", { length: 10 }).default("1.0"),
    isAutoSave: (0, pg_core_1.boolean)("isAutoSave").default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("video_editor_projects_user_idx").on(t.userId),
      (0, pg_core_1.index)("video_editor_projects_updated_idx").on(t.updatedAt),
    ];
  }
);
// Email verification tokens for signup flow
exports.emailVerificationTokens = (0, pg_core_1.pgTable)(
  "email_verification_tokens",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    email: (0, pg_core_1.varchar)("email", { length: 320 }).notNull(),
    code: (0, pg_core_1.varchar)("code", { length: 6 }).notNull(),
    channel: (0, pg_core_1.varchar)("channel", { length: 20 })
      .default("email")
      .notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
    usedAt: (0, pg_core_1.timestamp)("usedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
/**
 * Workflows — User's active workflow drafts
 * Separate from templates. Users edit workflows, then optionally save as template.
 */
exports.workflows = (0, pg_core_1.pgTable)(
  "workflows",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow name */
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    /** Workflow description */
    description: (0, pg_core_1.text)("description"),
    /** Default LLM model to use for this workflow */
    defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 255 }),
    /** ReactFlow state: {nodes: [], edges: [], viewport: {}} */
    workflowJson: (0, pg_core_1.json)("workflowJson").$type().notNull(),
    /** Owner user */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Tenant for multi-tenant isolation */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** Current workflow state */
    status: (0, exports.workflowStatusEnum)("status")
      .default("draft")
      .notNull(),
    /** Last compilation timestamp */
    lastCompiledAt: (0, pg_core_1.timestamp)("lastCompiledAt", {
      withTimezone: true,
    }),
    /** Schema version for forward compatibility */
    schemaVersion: (0, pg_core_1.varchar)("schemaVersion", { length: 10 })
      .default("1.0")
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("workflows_user_idx").on(t.userId),
      (0, pg_core_1.index)("workflows_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("workflows_status_idx").on(t.status),
    ];
  }
);
/**
 * Workflow Versions — Snapshot history for every saved workflow.
 * Auto-created on every workflow.save (with SHA-256 deduplication).
 * Allows users to preview and restore previous states.
 * Max 50 versions per workflow (oldest pruned automatically).
 */
exports.workflowVersions = (0, pg_core_1.pgTable)(
  "workflow_versions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      {
        onDelete: "cascade",
      }
    ),
    versionNumber: (0, pg_core_1.integer)("versionNumber").notNull(),
    workflowJson: (0, pg_core_1.json)("workflowJson").$type().notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 255 }),
    contentHash: (0, pg_core_1.varchar)("contentHash", {
      length: 64,
    }).notNull(),
    changeDescription: (0, pg_core_1.text)("changeDescription"),
    createdByUserId: (0, pg_core_1.integer)("createdByUserId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("wv_workflow_version_unique").on(
        t.workflowId,
        t.versionNumber
      ),
      (0, pg_core_1.index)("wv_workflow_created_idx").on(
        t.workflowId,
        t.createdAt
      ),
      (0, pg_core_1.index)("wv_tenant_created_idx").on(t.tenantId, t.createdAt),
      (0, pg_core_1.index)("wv_content_hash_idx").on(t.contentHash),
    ];
  }
);
/**
 * Template Categories — Hierarchical organization
 */
exports.templateCategories = (0, pg_core_1.pgTable)("template_categories", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  /** Category name */
  name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
  /** URL-safe slug */
  slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull().unique(),
  /** Parent category (null for root categories) */
  parentId: (0, pg_core_1.integer)("parentId").references(function () {
    return exports.templateCategories.id;
  }),
  /** Display order */
  sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Workflow Templates — Marketplace
 * Public templates visible to all, private templates scoped to tenant
 */
exports.workflowTemplates = (0, pg_core_1.pgTable)(
  "workflow_templates",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Template name */
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    /** Template description */
    description: (0, pg_core_1.text)("description"),
    /** Validated ReactFlow state (same structure as workflows.workflowJson) */
    workflowJson: (0, pg_core_1.json)("workflowJson").$type().notNull(),
    /** Template author */
    authorId: (0, pg_core_1.integer)("authorId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Tenant (null for public templates) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** Category */
    categoryId: (0, pg_core_1.integer)("categoryId").references(
      function () {
        return exports.templateCategories.id;
      },
      { onDelete: "set null" }
    ),
    /** Tags for filtering */
    tags: (0, pg_core_1.json)("tags").$type().default([]),
    /** Public visibility */
    isPublic: (0, pg_core_1.boolean)("isPublic").default(false).notNull(),
    /** Featured on marketplace */
    isFeatured: (0, pg_core_1.boolean)("isFeatured").default(false).notNull(),
    /** Publication status */
    status: (0, exports.templateStatusEnum)("status")
      .default("draft")
      .notNull(),
    /** Download counter */
    downloadCount: (0, pg_core_1.integer)("downloadCount").default(0).notNull(),
    /** Version string */
    version: (0, pg_core_1.varchar)("version", { length: 20 })
      .default("1.0")
      .notNull(),
    /** Full-text search vector (auto-generated from name + description) */
    searchVector: (0, pg_core_1.text)("searchVector"), // tsvector in migration SQL
    // --- Feature 017: Gallery columns ---
    /** Pre-generated SVG topology diagram (generated at seed time by workflowSvgGenerator) */
    previewSvg: (0, pg_core_1.text)("previewSvg"),
    /** Industry/sector tags for gallery filtering (e.g. ["E-commerce", "Retail"]) */
    industry: (0, pg_core_1.json)("industry").$type(),
    /** Number of nodes in the workflow (computed from workflowJson.nodes.length at seed time) */
    stepCount: (0, pg_core_1.integer)("stepCount"),
    /** Rough setup effort in minutes (provided in template JSON, displayed in Gallery) */
    estimatedSetupMinutes: (0, pg_core_1.integer)("estimatedSetupMinutes"),
    /**
     * Stable slug identifier for idempotent upserts (e.g. "tpl-001").
     * Used as the ON CONFLICT target in the seeder script.
     * Must be unique across all templates.
     */
    templateKey: (0, pg_core_1.varchar)("templateKey", { length: 50 }).unique(),
    /** When the creator requested gallery publishing */
    requestedPublishAt: (0, pg_core_1.timestamp)("requestedPublishAt", {
      withTimezone: true,
    }),
    /** Admin who approved/rejected the publish request */
    approvedBy: (0, pg_core_1.integer)("approvedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    /** When admin approved the publish request */
    approvedAt: (0, pg_core_1.timestamp)("approvedAt", { withTimezone: true }),
    /** Reason for rejection (shown to creator) */
    rejectionReason: (0, pg_core_1.text)("rejectionReason"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("workflow_templates_author_idx").on(t.authorId),
      (0, pg_core_1.index)("workflow_templates_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("workflow_templates_category_idx").on(t.categoryId),
      (0, pg_core_1.index)("workflow_templates_status_idx").on(t.status),
      // GIN indexes added in migration SQL (can't express in Drizzle directly)
    ];
  }
);
/**
 * Template Ratings — User feedback
 */
exports.templateRatings = (0, pg_core_1.pgTable)(
  "template_ratings",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Template being rated */
    templateId: (0, pg_core_1.integer)("templateId")
      .notNull()
      .references(
        function () {
          return exports.workflowTemplates.id;
        },
        { onDelete: "cascade" }
      ),
    /** User who rated */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Rating value (1-5) */
    rating: (0, pg_core_1.integer)("rating").notNull(),
    /** Optional review text */
    review: (0, pg_core_1.text)("review"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("template_ratings_unique").on(
        t.templateId,
        t.userId
      ),
      (0, pg_core_1.index)("template_ratings_template_idx").on(t.templateId),
    ];
  }
);
/**
 * Workflow Schedules — Cron-based workflow triggers
 */
exports.workflowSchedules = (0, pg_core_1.pgTable)(
  "workflow_schedules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow to execute */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Trigger node ID within the workflow */
    nodeId: (0, pg_core_1.varchar)("nodeId", { length: 36 }).notNull(),
    /** Cron expression (e.g., "0 9 * * 1" for Monday 9am) */
    cronExpression: (0, pg_core_1.varchar)("cronExpression", {
      length: 100,
    }).notNull(),
    /** IANA timezone (e.g., "Asia/Bangkok", "UTC") */
    timezone: (0, pg_core_1.varchar)("timezone", { length: 50 })
      .default("UTC")
      .notNull(),
    /** Last execution timestamp */
    lastRun: (0, pg_core_1.timestamp)("lastRun", { withTimezone: true }),
    /** Next scheduled execution timestamp */
    nextRun: (0, pg_core_1.timestamp)("nextRun", {
      withTimezone: true,
    }).notNull(),
    /** Whether schedule is active */
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("workflow_schedules_workflow_idx").on(t.workflowId),
      (0, pg_core_1.index)("workflow_schedules_next_run_idx").on(t.nextRun),
      (0, pg_core_1.index)("workflow_schedules_active_idx").on(t.isActive),
    ];
  }
);
/**
 * Webhook Calls — Webhook trigger history
 */
exports.webhookCalls = (0, pg_core_1.pgTable)(
  "webhook_calls",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow that was triggered */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Webhook trigger node ID */
    nodeId: (0, pg_core_1.varchar)("nodeId", { length: 36 }).notNull(),
    /** HTTP method used */
    requestMethod: (0, pg_core_1.varchar)("requestMethod", { length: 10 }),
    /** Request body (JSON) */
    requestBody: (0, pg_core_1.json)("requestBody").$type(),
    /** Request headers (JSON) */
    requestHeaders: (0, pg_core_1.json)("requestHeaders").$type(),
    /** Workflow execution ID (if triggered successfully) */
    executionId: (0, pg_core_1.varchar)("executionId", { length: 36 }),
    /** Trigger status */
    status: (0, pg_core_1.varchar)("status", { length: 20 }),
    /** Response sent back to caller */
    response: (0, pg_core_1.json)("response").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("webhook_calls_workflow_node_idx").on(
        t.workflowId,
        t.nodeId
      ),
      (0, pg_core_1.index)("webhook_calls_execution_idx").on(t.executionId),
      (0, pg_core_1.index)("webhook_calls_created_idx").on(t.createdAt),
    ];
  }
);
/**
 * Workflow Event Subscriptions — Event-driven workflow triggers
 */
exports.workflowEventSubscriptions = (0, pg_core_1.pgTable)(
  "workflow_event_subscriptions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow to execute when event occurs */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Event trigger node ID */
    nodeId: (0, pg_core_1.varchar)("nodeId", { length: 36 }).notNull(),
    /** Event type to listen for (e.g., "user.created", "skill.completed") */
    eventType: (0, pg_core_1.varchar)("eventType", { length: 100 }).notNull(),
    /** Optional filter conditions (JSON) */
    filterConditions: (0, pg_core_1.json)("filterConditions").$type(),
    /** Whether subscription is active */
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("workflow_event_subscriptions_workflow_idx").on(
        t.workflowId
      ),
      (0, pg_core_1.index)("workflow_event_subscriptions_event_type_idx").on(
        t.eventType
      ),
      (0, pg_core_1.index)("workflow_event_subscriptions_active_idx").on(
        t.isActive
      ),
    ];
  }
);
/**
 * Workflow Executions — Individual workflow run tracking (Section 13)
 * Each row represents one execution of a workflow (manual, scheduled, webhook, etc.)
 *
 * NOTE: LangGraph checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes,
 * checkpoint_migrations) are auto-created by AsyncPostgresSaver.setup() in the Python backend.
 * Those tables are NOT managed by Drizzle. Do not add them here.
 */
exports.workflowExecutions = (0, pg_core_1.pgTable)(
  "workflow_executions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow definition that was executed */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Tenant for multi-tenant isolation */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** User who triggered the execution */
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    /** Execution status */
    status: (0, exports.workflowExecutionStatusEnum)("status")
      .default("pending")
      .notNull(),
    /** Input data provided to the workflow trigger */
    inputData: (0, pg_core_1.json)("inputData").$type(),
    /** Final output data from the workflow (null if still running or failed) */
    outputData: (0, pg_core_1.json)("outputData").$type(),
    /** When execution started (null if still pending) */
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    /** When execution completed/failed/cancelled */
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    /** Error message if execution failed */
    error: (0, pg_core_1.text)("error"),
    /** Number of nodes executed in this run */
    nodeCount: (0, pg_core_1.integer)("nodeCount").default(0).notNull(),
    /** Total credits consumed by this execution */
    creditsUsed: (0, pg_core_1.integer)("creditsUsed").default(0).notNull(),
    /** LangGraph thread ID for checkpoint correlation (format: "{tenantId}:{executionId}") */
    threadId: (0, pg_core_1.varchar)("threadId", { length: 128 }),
    /** Trigger type that started this execution */
    triggerType: (0, pg_core_1.varchar)("triggerType", { length: 50 }),
    /** Sandbox job IDs used during this workflow execution */
    sandboxJobIds: (0, pg_core_1.jsonb)("sandboxJobIds").$type().default([]),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("workflow_executions_workflow_idx").on(t.workflowId),
      (0, pg_core_1.index)("workflow_executions_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("workflow_executions_user_idx").on(t.userId),
      (0, pg_core_1.index)("workflow_executions_status_idx").on(t.status),
      (0, pg_core_1.index)("workflow_executions_thread_idx").on(t.threadId),
      (0, pg_core_1.index)("workflow_executions_created_idx").on(t.createdAt),
    ];
  }
);
/**
 * Workflow Dead Letter Queue — Failed items for reprocessing (Section 13)
 * Items land here after exhausting retry attempts. Admins can inspect and reprocess.
 */
exports.workflowDeadLetterQueue = (0, pg_core_1.pgTable)(
  "workflow_dead_letter_queue",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow that generated this failure */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Execution run where the failure occurred */
    executionId: (0, pg_core_1.integer)("executionId").references(
      function () {
        return exports.workflowExecutions.id;
      },
      { onDelete: "set null" }
    ),
    /** Node that failed */
    nodeId: (0, pg_core_1.varchar)("nodeId", { length: 36 }).notNull(),
    /** Node type for display/filtering */
    nodeType: (0, pg_core_1.varchar)("nodeType", { length: 100 }),
    /** Input data that caused the failure */
    inputData: (0, pg_core_1.json)("inputData").$type().notNull(),
    /** Error message from the last failure */
    error: (0, pg_core_1.text)("error").notNull(),
    /** Full error stack trace (for debugging) */
    stackTrace: (0, pg_core_1.text)("stackTrace"),
    /** Number of retry attempts before DLQ */
    retryCount: (0, pg_core_1.integer)("retryCount").default(0).notNull(),
    /** DLQ item status */
    status: (0, exports.dlqItemStatusEnum)("status")
      .default("pending")
      .notNull(),
    /** Tenant isolation */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** When the item was reprocessed (null if not yet) */
    reprocessedAt: (0, pg_core_1.timestamp)("reprocessedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("dlq_workflow_idx").on(t.workflowId),
      (0, pg_core_1.index)("dlq_execution_idx").on(t.executionId),
      (0, pg_core_1.index)("dlq_status_idx").on(t.status),
      (0, pg_core_1.index)("dlq_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("dlq_created_idx").on(t.createdAt),
    ];
  }
);
/**
 * Workflow Cache Metadata — Cache statistics and observability (Section 13)
 * Actual cached values live in Redis. This table tracks hit/miss rates per cache key
 * for monitoring, tuning TTLs, and identifying high-value cache entries.
 */
exports.workflowCacheMetadata = (0, pg_core_1.pgTable)(
  "workflow_cache_metadata",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** SHA-256 cache key */
    cacheKey: (0, pg_core_1.varchar)("cacheKey", { length: 64 })
      .notNull()
      .unique(),
    /** Node type that produced this cache entry (e.g., "http_request", "llm_call") */
    nodeType: (0, pg_core_1.varchar)("nodeType", { length: 100 }).notNull(),
    /** Number of cache hits */
    hitCount: (0, pg_core_1.integer)("hitCount").default(0).notNull(),
    /** Last time the cache was hit */
    lastHitAt: (0, pg_core_1.timestamp)("lastHitAt", { withTimezone: true }),
    /** TTL in seconds configured for this cache entry */
    ttlSeconds: (0, pg_core_1.integer)("ttlSeconds").notNull(),
    /** Size of cached value in bytes (for capacity planning) */
    valueSizeBytes: (0, pg_core_1.integer)("valueSizeBytes"),
    /** Tenant isolation (null for shared/global cache entries) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("cache_metadata_node_type_idx").on(t.nodeType),
      (0, pg_core_1.index)("cache_metadata_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("cache_metadata_last_hit_idx").on(t.lastHitAt),
    ];
  }
);
/**
 * Workflow Audit Events — Structured execution audit trail (Section 13)
 * Records who did what, when, with what data for governance and debugging.
 * Complements existing providerUsageLog (LLM-specific) and apiAuditEvents (media-specific).
 */
exports.workflowAuditEvents = (0, pg_core_1.pgTable)(
  "workflow_audit_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Workflow definition */
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    /** Execution run (null for workflow-level events like deploy/publish) */
    executionId: (0, pg_core_1.integer)("executionId").references(
      function () {
        return exports.workflowExecutions.id;
      },
      { onDelete: "set null" }
    ),
    /** Node that generated the event (null for workflow-level events) */
    nodeId: (0, pg_core_1.varchar)("nodeId", { length: 36 }),
    /** Event type (e.g., "node_start", "node_complete", "node_error", "approval_granted",
     *  "approval_rejected", "secret_accessed", "policy_checked", "execution_start",
     *  "execution_complete") */
    eventType: (0, pg_core_1.varchar)("eventType", { length: 50 }).notNull(),
    /** Actor: user who triggered/approved/performed the action */
    actorId: (0, pg_core_1.integer)("actorId").references(function () {
      return exports.users.id;
    }),
    /** Event payload (structured JSON with event-type-specific fields) */
    data: (0, pg_core_1.json)("data").$type(),
    /** Tenant isolation */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** Trace ID for correlation with providerUsageLog and external systems */
    traceId: (0, pg_core_1.varchar)("traceId", { length: 64 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("audit_events_workflow_idx").on(t.workflowId),
      (0, pg_core_1.index)("audit_events_execution_idx").on(t.executionId),
      (0, pg_core_1.index)("audit_events_event_type_idx").on(t.eventType),
      (0, pg_core_1.index)("audit_events_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("audit_events_actor_idx").on(t.actorId),
      (0, pg_core_1.index)("audit_events_trace_idx").on(t.traceId),
      (0, pg_core_1.index)("audit_events_created_idx").on(t.createdAt),
    ];
  }
);
/**
 * Workflow Secrets — Encrypted credential vault (Section 13)
 * Stores encrypted API keys, tokens, and passwords for use by workflow nodes.
 * Values are encrypted with AES-256-GCM using LLM_ENCRYPTION_KEY (same key as crypto.ts).
 *
 * SECURITY: Never log or expose decrypted values. Secret access is recorded in
 * workflow_audit_events with eventType "secret_accessed".
 */
exports.workflowSecrets = (0, pg_core_1.pgTable)(
  "workflow_secrets",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Tenant that owns this secret */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** Human-readable secret name (unique per tenant, e.g., "stripe_api_key", "github_token") */
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    /** AES-256-GCM encrypted value (format: "iv:authTag:ciphertext" hex) */
    encryptedValue: (0, pg_core_1.text)("encryptedValue").notNull(),
    /** Vault backend used for this secret ("internal" = AES-256-GCM, future: "hashicorp", "aws_sm") */
    vaultBackend: (0, pg_core_1.varchar)("vaultBackend", { length: 50 })
      .default("internal")
      .notNull(),
    /** Optional description of what this secret is for */
    description: (0, pg_core_1.text)("description"),
    /** User who created this secret */
    createdBy: (0, pg_core_1.integer)("createdBy").references(function () {
      return exports.users.id;
    }),
    /** User who last updated this secret */
    updatedBy: (0, pg_core_1.integer)("updatedBy").references(function () {
      return exports.users.id;
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("workflow_secrets_tenant_name_unique").on(
        t.tenantId,
        t.name
      ),
      (0, pg_core_1.index)("workflow_secrets_tenant_idx").on(t.tenantId),
    ];
  }
);
/**
 * Workflow Policy Rules — Tenant-configurable governance policies (Section 13)
 * Phase 2 placeholder: Schema defined now to avoid migration during Phase 2.
 * Used by the Policy Gate node to enforce rules like:
 *   - Budget caps per workflow/user
 *   - Tool/API allowlists
 *   - PII redaction requirements
 *   - Required approval for destructive actions
 */
exports.workflowPolicyRules = (0, pg_core_1.pgTable)(
  "workflow_policy_rules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Tenant that owns this rule */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** Rule type (e.g., "budget_cap", "tool_allowlist", "pii_redaction", "action_approval") */
    ruleType: (0, pg_core_1.varchar)("ruleType", { length: 100 }).notNull(),
    /** Condition expression (JSON) that triggers this rule */
    condition: (0, pg_core_1.json)("condition").$type().notNull(),
    /** Action to take when condition matches */
    action: (0, exports.policyActionEnum)("action").notNull(),
    /** Priority (lower number = higher priority, evaluated in order) */
    priority: (0, pg_core_1.integer)("priority").default(100).notNull(),
    /** Whether this rule is active */
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    /** Optional human-readable description of what this rule does */
    description: (0, pg_core_1.text)("description"),
    /** Optional: restrict rule to specific workflow IDs (null = all workflows) */
    workflowIds: (0, pg_core_1.json)("workflowIds").$type(),
    /** User who created this rule */
    createdBy: (0, pg_core_1.integer)("createdBy").references(function () {
      return exports.users.id;
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("policy_rules_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("policy_rules_type_idx").on(t.ruleType),
      (0, pg_core_1.index)("policy_rules_enabled_idx").on(t.enabled),
      (0, pg_core_1.index)("policy_rules_priority_idx").on(t.priority),
    ];
  }
);
exports.tenantBrowserPolicyConfig = (0, pg_core_1.pgTable)(
  "tenant_browser_policy_config",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .unique()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    enforcementMode: (0, pg_core_1.varchar)("enforcementMode", { length: 32 })
      .default("observe")
      .notNull(),
    defaultApprovalTtlSeconds: (0, pg_core_1.integer)(
      "defaultApprovalTtlSeconds"
    )
      .default(300)
      .notNull(),
    reviewCadenceDays: (0, pg_core_1.integer)("reviewCadenceDays")
      .default(90)
      .notNull(),
    killSwitchEnabled: (0, pg_core_1.boolean)("killSwitchEnabled")
      .default(false)
      .notNull(),
    requireTamperEvidence: (0, pg_core_1.boolean)("requireTamperEvidence")
      .default(true)
      .notNull(),
    evidenceRetentionDays: (0, pg_core_1.integer)("evidenceRetentionDays")
      .default(365)
      .notNull(),
    allowedDomains: (0, pg_core_1.jsonb)("allowedDomains")
      .$type()
      .default([])
      .notNull(),
    visionModel: (0, pg_core_1.varchar)("visionModel", { length: 100 })
      .default("gpt-4o")
      .notNull(),
    seededDefault: (0, pg_core_1.boolean)("seededDefault")
      .default(false)
      .notNull(),
    metadata: (0, pg_core_1.jsonb)("metadata")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_42 ||
            (templateObject_42 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("tenant_browser_policy_config_tenant_idx").on(
        t.tenantId
      ),
      (0, pg_core_1.check)(
        "tenant_browser_policy_config_ttl_bounds",
        (0, drizzle_orm_1.sql)(
          templateObject_43 ||
            (templateObject_43 = __makeTemplateObject(
              ["", " >= 60 AND ", " <= 900"],
              ["", " >= 60 AND ", " <= 900"]
            )),
          t.defaultApprovalTtlSeconds,
          t.defaultApprovalTtlSeconds
        )
      ),
    ];
  }
);
exports.tenantBrowserPolicyRules = (0, pg_core_1.pgTable)(
  "tenant_browser_policy_rules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    priority: (0, pg_core_1.integer)("priority").default(100).notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    description: (0, pg_core_1.text)("description"),
    match: (0, pg_core_1.jsonb)("match")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_44 ||
            (templateObject_44 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    thresholds: (0, pg_core_1.jsonb)("thresholds")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_45 ||
            (templateObject_45 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    decision: (0, exports.browserPolicyDecisionEnum)("decision").notNull(),
    reasonCode: (0, pg_core_1.varchar)("reasonCode", { length: 100 }).notNull(),
    actionClass: (0, exports.browserActionClassEnum)("actionClass"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("tenant_browser_policy_rules_tenant_idx").on(
        t.tenantId
      ),
      (0, pg_core_1.index)("tenant_browser_policy_rules_priority_idx").on(
        t.tenantId,
        t.priority
      ),
      (0, pg_core_1.index)("tenant_browser_policy_rules_enabled_idx").on(
        t.tenantId,
        t.enabled
      ),
    ];
  }
);
exports.browserWorkflowEntitlements = (0, pg_core_1.pgTable)(
  "browser_workflow_entitlements",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    workflowId: (0, pg_core_1.integer)("workflowId")
      .notNull()
      .references(
        function () {
          return exports.workflows.id;
        },
        { onDelete: "cascade" }
      ),
    workflowName: (0, pg_core_1.varchar)("workflowName", {
      length: 255,
    }).notNull(),
    businessOwner: (0, pg_core_1.varchar)("businessOwner", { length: 255 }),
    technicalOwner: (0, pg_core_1.varchar)("technicalOwner", { length: 255 }),
    riskRating: (0, pg_core_1.varchar)("riskRating", { length: 32 })
      .default("medium")
      .notNull(),
    allowedCapabilities: (0, pg_core_1.jsonb)("allowedCapabilities")
      .$type()
      .default([])
      .notNull(),
    forbiddenCapabilities: (0, pg_core_1.jsonb)("forbiddenCapabilities")
      .$type()
      .default([])
      .notNull(),
    allowedDataClasses: (0, pg_core_1.jsonb)("allowedDataClasses")
      .$type()
      .default(["public", "internal"])
      .notNull(),
    config: (0, pg_core_1.jsonb)("config")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_46 ||
            (templateObject_46 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    reviewCadenceDays: (0, pg_core_1.integer)("reviewCadenceDays")
      .default(90)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "uq_browser_workflow_entitlements_tenant_workflow"
      ).on(t.tenantId, t.workflowId),
      (0, pg_core_1.index)("browser_workflow_entitlements_tenant_idx").on(
        t.tenantId
      ),
      (0, pg_core_1.index)("browser_workflow_entitlements_workflow_idx").on(
        t.workflowId
      ),
    ];
  }
);
exports.browserPolicyDecisions = (0, pg_core_1.pgTable)(
  "browser_policy_decisions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    traceId: (0, pg_core_1.varchar)("traceId", { length: 64 }),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId").references(function () {
      return exports.users.id;
    }),
    workflowId: (0, pg_core_1.integer)("workflowId"),
    executionId: (0, pg_core_1.varchar)("executionId", { length: 128 }),
    actionType: (0, pg_core_1.varchar)("actionType", { length: 64 }).notNull(),
    actionClass: (0, exports.browserActionClassEnum)("actionClass").notNull(),
    pageSensitivity: (0, exports.browserPageSensitivityEnum)(
      "pageSensitivity"
    ).notNull(),
    decision: (0, exports.browserPolicyDecisionEnum)("decision").notNull(),
    reasonCodes: (0, pg_core_1.jsonb)("reasonCodes")
      .$type()
      .default([])
      .notNull(),
    approvalState: (0, pg_core_1.varchar)("approvalState", {
      length: 32,
    }).notNull(),
    outcome: (0, pg_core_1.varchar)("outcome", { length: 16 }).notNull(),
    evidence: (0, pg_core_1.jsonb)("evidence")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_47 ||
            (templateObject_47 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    previousEventHash: (0, pg_core_1.varchar)("previousEventHash", {
      length: 128,
    }),
    eventHash: (0, pg_core_1.varchar)("eventHash", { length: 128 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("browser_policy_decisions_event_hash_uq").on(
        t.eventHash
      ),
      (0, pg_core_1.index)("browser_policy_decisions_tenant_created_idx").on(
        t.tenantId,
        t.createdAt
      ),
      (0, pg_core_1.index)("browser_policy_decisions_trace_idx").on(t.traceId),
      (0, pg_core_1.index)("browser_policy_decisions_execution_idx").on(
        t.executionId
      ),
      (0, pg_core_1.index)("browser_policy_decisions_decision_idx").on(
        t.decision,
        t.createdAt
      ),
    ];
  }
);
exports.liveBrowserSessions = (0, pg_core_1.pgTable)(
  "live_browser_sessions",
  {
    id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    sourceType: (0, exports.liveBrowserSourceTypeEnum)("sourceType").notNull(),
    sourceId: (0, pg_core_1.varchar)("sourceId", { length: 128 }),
    status: (0, exports.liveBrowserSessionStatusEnum)("status")
      .default("created")
      .notNull(),
    controlMode: (0, exports.liveBrowserControlModeEnum)("controlMode")
      .default("observe")
      .notNull(),
    sessionVersion: (0, pg_core_1.integer)("sessionVersion")
      .default(1)
      .notNull(),
    controllerActorType: (0, exports.liveBrowserActorTypeEnum)(
      "controllerActorType"
    ),
    controllerActorId: (0, pg_core_1.varchar)("controllerActorId", {
      length: 64,
    }),
    controllerConnectionId: (0, pg_core_1.varchar)("controllerConnectionId", {
      length: 128,
    }),
    controllerLeaseExpiresAt: (0, pg_core_1.timestamp)(
      "controllerLeaseExpiresAt",
      { withTimezone: true }
    ),
    runtimeOwnerId: (0, pg_core_1.varchar)("runtimeOwnerId", { length: 128 }),
    runtimeOwnerClaimedAt: (0, pg_core_1.timestamp)("runtimeOwnerClaimedAt", {
      withTimezone: true,
    }),
    pauseReason: (0, pg_core_1.varchar)("pauseReason", { length: 128 }),
    pendingAssistRequestId: (0, pg_core_1.varchar)("pendingAssistRequestId", {
      length: 64,
    }),
    pendingApprovalRequestId: (0, pg_core_1.varchar)(
      "pendingApprovalRequestId",
      { length: 64 }
    ),
    policyContextJson: (0, pg_core_1.jsonb)("policyContextJson")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_48 ||
            (templateObject_48 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    browserContextRef: (0, pg_core_1.jsonb)("browserContextRef")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_49 ||
            (templateObject_49 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    streamRef: (0, pg_core_1.jsonb)("streamRef")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_50 ||
            (templateObject_50 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    activeTabCount: (0, pg_core_1.integer)("activeTabCount")
      .default(1)
      .notNull(),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: (0, pg_core_1.timestamp)("lastActivityAt", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    endedAt: (0, pg_core_1.timestamp)("endedAt", { withTimezone: true }),
    endReason: (0, pg_core_1.varchar)("endReason", { length: 128 }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("live_browser_sessions_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("live_browser_sessions_user_activity_idx").on(
        t.userId,
        t.lastActivityAt
      ),
      (0, pg_core_1.index)("live_browser_sessions_runtime_owner_idx").on(
        t.runtimeOwnerId,
        t.runtimeOwnerClaimedAt
      ),
    ];
  }
);
exports.liveBrowserIdempotencyKeys = (0, pg_core_1.pgTable)(
  "live_browser_idempotency_keys",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    sessionId: (0, pg_core_1.varchar)("sessionId", { length: 64 })
      .notNull()
      .references(
        function () {
          return exports.liveBrowserSessions.id;
        },
        { onDelete: "cascade" }
      ),
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", {
      length: 128,
    }).notNull(),
    commandType: (0, pg_core_1.varchar)("commandType", {
      length: 64,
    }).notNull(),
    responseJson: (0, pg_core_1.jsonb)("responseJson")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_51 ||
            (templateObject_51 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "uq_live_browser_idempotency_keys_session_key"
      ).on(t.sessionId, t.idempotencyKey),
      (0, pg_core_1.index)("live_browser_idempotency_keys_expires_idx").on(
        t.expiresAt
      ),
    ];
  }
);
exports.liveBrowserEvents = (0, pg_core_1.pgTable)(
  "live_browser_events",
  {
    id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
    sessionId: (0, pg_core_1.varchar)("sessionId", { length: 64 })
      .notNull()
      .references(
        function () {
          return exports.liveBrowserSessions.id;
        },
        { onDelete: "cascade" }
      ),
    sessionVersionAt: (0, pg_core_1.integer)("sessionVersionAt").notNull(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    eventType: (0, exports.liveBrowserEventTypeEnum)("eventType").notNull(),
    actorType: (0, exports.liveBrowserActorTypeEnum)("actorType").notNull(),
    actorId: (0, pg_core_1.varchar)("actorId", { length: 64 }),
    payloadJson: (0, pg_core_1.jsonb)("payloadJson")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_52 ||
            (templateObject_52 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    screenshotRef: (0, pg_core_1.varchar)("screenshotRef", { length: 255 }),
    cursor: (0, pg_core_1.varchar)("cursor", { length: 255 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("uq_live_browser_events_session_cursor").on(
        t.sessionId,
        t.cursor
      ),
      (0, pg_core_1.index)("live_browser_events_session_created_idx").on(
        t.sessionId,
        t.createdAt
      ),
      (0, pg_core_1.index)("live_browser_events_session_version_idx").on(
        t.sessionId,
        t.sessionVersionAt
      ),
    ];
  }
);
exports.liveBrowserAssistRequests = (0, pg_core_1.pgTable)(
  "live_browser_assist_requests",
  {
    id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
    sessionId: (0, pg_core_1.varchar)("sessionId", { length: 64 })
      .notNull()
      .references(
        function () {
          return exports.liveBrowserSessions.id;
        },
        { onDelete: "cascade" }
      ),
    sessionVersionAt: (0, pg_core_1.integer)("sessionVersionAt").notNull(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestType: (0, exports.liveBrowserAssistRequestTypeEnum)(
      "requestType"
    ).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 32 })
      .default("pending")
      .notNull(),
    prompt: (0, pg_core_1.text)("prompt").notNull(),
    contextJson: (0, pg_core_1.jsonb)("contextJson")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_53 ||
            (templateObject_53 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    responseJson: (0, pg_core_1.jsonb)("responseJson")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_54 ||
            (templateObject_54 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      )
      .notNull(),
    resolvedSessionVersionAt: (0, pg_core_1.integer)(
      "resolvedSessionVersionAt"
    ),
    requestedAt: (0, pg_core_1.timestamp)("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: (0, pg_core_1.timestamp)("resolvedAt", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "live_browser_assist_requests_session_status_idx"
      ).on(t.sessionId, t.status),
      (0, pg_core_1.index)(
        "live_browser_assist_requests_session_requested_idx"
      ).on(t.sessionId, t.requestedAt),
    ];
  }
);
exports.liveBrowserControlTransfers = (0, pg_core_1.pgTable)(
  "live_browser_control_transfers",
  {
    id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
    sessionId: (0, pg_core_1.varchar)("sessionId", { length: 64 })
      .notNull()
      .references(
        function () {
          return exports.liveBrowserSessions.id;
        },
        { onDelete: "cascade" }
      ),
    sessionVersionAt: (0, pg_core_1.integer)("sessionVersionAt").notNull(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    fromActorType: (0, exports.liveBrowserActorTypeEnum)(
      "fromActorType"
    ).notNull(),
    fromActorId: (0, pg_core_1.varchar)("fromActorId", { length: 64 }),
    toActorType: (0, exports.liveBrowserActorTypeEnum)("toActorType").notNull(),
    toActorId: (0, pg_core_1.varchar)("toActorId", { length: 64 }),
    reason: (0, pg_core_1.varchar)("reason", { length: 128 }).notNull(),
    policyCheckHash: (0, pg_core_1.varchar)("policyCheckHash", { length: 128 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "live_browser_control_transfers_session_created_idx"
      ).on(t.sessionId, t.createdAt),
    ];
  }
);
// Cloud Task Events — Tracks Cloud Tasks execution for observability and DLQ
exports.cloudTaskEvents = (0, pg_core_1.pgTable)(
  "cloud_task_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Cloud Tasks task ID (from X-CloudTasks-TaskName header) */
    taskId: (0, pg_core_1.varchar)("taskId", { length: 512 }).notNull(),
    /** Queue name (e.g., 'media-jobs', 'video-jobs-short') */
    queueName: (0, pg_core_1.varchar)("queueName", { length: 128 }).notNull(),
    /** Application-level job ID (links to media_tasks or other job tables) */
    jobId: (0, pg_core_1.varchar)("jobId", { length: 128 }),
    /** Task status: queued, processing, completed, failed, dead_letter */
    status: (0, pg_core_1.varchar)("status", { length: 32 })
      .notNull()
      .default("queued"),
    /** Number of retry attempts (from X-CloudTasks-TaskRetryCount) */
    attemptCount: (0, pg_core_1.integer)("attemptCount").default(0).notNull(),
    /** Task payload (JSON body sent to the handler) */
    payload: (0, pg_core_1.json)("payload").$type(),
    /** Error message on failure */
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("cloud_task_events_task_id_idx").on(t.taskId),
      (0, pg_core_1.index)("cloud_task_events_status_idx").on(t.status),
      (0, pg_core_1.index)("cloud_task_events_queue_name_idx").on(t.queueName),
      (0, pg_core_1.index)("cloud_task_events_job_id_idx").on(t.jobId),
    ];
  }
);
/**
 * Scheduled Job Runs — Tracks execution history of Celery Beat scheduled tasks.
 * Enables admin monitoring of what ran, when, success/failure, and duration.
 */
exports.scheduledJobRuns = (0, pg_core_1.pgTable)(
  "scheduled_job_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Celery task name (e.g., "agency.purge_expired_memories") */
    taskName: (0, pg_core_1.varchar)("taskName", { length: 200 }).notNull(),
    /** Celery task ID (unique per execution) */
    taskId: (0, pg_core_1.varchar)("taskId", { length: 100 }),
    /** Status: started, success, failure, timeout */
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull(),
    /** When execution started */
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** When execution completed (null if still running) */
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    /** Duration in milliseconds */
    durationMs: (0, pg_core_1.integer)("durationMs"),
    /** Return value or result summary (JSON string, truncated) */
    result: (0, pg_core_1.text)("result"),
    /** Error message if failed */
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    /** Retry attempt number (0 = first attempt) */
    retryCount: (0, pg_core_1.integer)("retryCount").default(0),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("scheduled_job_runs_task_idx").on(
        t.taskName,
        t.startedAt
      ),
      (0, pg_core_1.index)("scheduled_job_runs_status_idx").on(
        t.status,
        t.startedAt
      ),
    ];
  }
);
// Funnel Events — Canonical milestone analytics stream
exports.funnelEvents = (0, pg_core_1.pgTable)(
  "funnel_events",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Tenant scope for analytics isolation and query performance */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    /** Domain scope for domain-admin fallback and attribution compatibility */
    domain: (0, pg_core_1.varchar)("domain", { length: 255 }),
    /** User scope for first-event semantics and per-user drilldown */
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    /** Canonical milestone event name */
    eventName: (0, pg_core_1.varchar)("eventName", { length: 128 }).notNull(),
    /** Canonical UTC timestamp used for all aggregations */
    eventTime: (0, pg_core_1.timestamp)("eventTime", {
      withTimezone: true,
    }).notNull(),
    /** Deterministic dedup key used for insert-once contract */
    eventKey: (0, pg_core_1.varchar)("eventKey", { length: 255 }).notNull(),
    /** Flexible metadata payload for drilldown and export */
    properties: (0, pg_core_1.jsonb)("properties")
      .$type()
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_55 ||
            (templateObject_55 = __makeTemplateObject(
              ["'{}'::jsonb"],
              ["'{}'::jsonb"]
            ))
        )
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("funnel_events_event_key_unique").on(
        t.eventKey
      ),
      (0, pg_core_1.index)("funnel_events_tenant_event_time_idx").on(
        t.tenantId,
        t.eventTime
      ),
      (0, pg_core_1.index)("funnel_events_domain_event_time_idx").on(
        t.domain,
        t.eventTime
      ),
      (0, pg_core_1.index)("funnel_events_name_event_time_idx").on(
        t.eventName,
        t.eventTime
      ),
      (0, pg_core_1.index)("funnel_events_user_name_time_idx").on(
        t.userId,
        t.eventName,
        t.eventTime
      ),
    ];
  }
);
/**
 * Funnel Backfill Run Status
 */
exports.backfillRunStatusEnum = (0, pg_core_1.pgEnum)("backfill_run_status", [
  "running",
  "paused",
  "aborted",
  "completed",
  "failed",
]);
exports.reconciliationStatusEnum = (0, pg_core_1.pgEnum)(
  "reconciliation_status",
  ["pending", "passed", "failed"]
);
/**
 * Funnel Backfill Runs
 * Tracks historical milestone backfill execution with operational controls
 */
exports.funnelBackfillRuns = (0, pg_core_1.pgTable)(
  "funnel_backfill_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Unique run identifier for idempotent resume */
    runId: (0, pg_core_1.varchar)("runId", { length: 64 }).notNull().unique(),
    /** Optional tenant filter (null = all tenants) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** Current execution status */
    status: (0, exports.backfillRunStatusEnum)("status")
      .notNull()
      .default("running"),
    /** Date range to backfill (inclusive) */
    startDate: (0, pg_core_1.timestamp)("startDate", {
      withTimezone: true,
    }).notNull(),
    endDate: (0, pg_core_1.timestamp)("endDate", {
      withTimezone: true,
    }).notNull(),
    /** Source filter: which data source to backfill from */
    sourceFilter: (0, pg_core_1.varchar)("sourceFilter", { length: 128 }),
    /** Batch size for controlled processing */
    batchSize: (0, pg_core_1.integer)("batchSize").notNull().default(1000),
    /** Dry-run mode: compute counts without persisting */
    dryRun: (0, pg_core_1.boolean)("dryRun").notNull().default(false),
    /** Progress counters */
    totalRecordsProcessed: (0, pg_core_1.integer)("totalRecordsProcessed")
      .notNull()
      .default(0),
    totalEventsInserted: (0, pg_core_1.integer)("totalEventsInserted")
      .notNull()
      .default(0),
    /** Reconciliation gate results */
    reconciliationStatus: (0, exports.reconciliationStatusEnum)(
      "reconciliationStatus"
    )
      .notNull()
      .default("pending"),
    reconciliationReport: (0, pg_core_1.jsonb)("reconciliationReport").$type(),
    /** Operator action timestamps */
    startedAt: (0, pg_core_1.timestamp)("startedAt", {
      withTimezone: true,
    }).notNull(),
    pausedAt: (0, pg_core_1.timestamp)("pausedAt", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    abortedAt: (0, pg_core_1.timestamp)("abortedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("funnel_backfill_runs_status_idx").on(t.status),
      (0, pg_core_1.index)("funnel_backfill_runs_tenant_idx").on(t.tenantId),
    ];
  }
);
/**
 * Funnel Backfill Checkpoints
 * Stores resumable position markers within a backfill run
 */
exports.funnelBackfillCheckpoints = (0, pg_core_1.pgTable)(
  "funnel_backfill_checkpoints",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** Reference to parent run */
    runId: (0, pg_core_1.varchar)("runId", { length: 64 })
      .notNull()
      .references(
        function () {
          return exports.funnelBackfillRuns.runId;
        },
        { onDelete: "cascade" }
      ),
    /** Flexible position marker (e.g., {date: "2024-01-15", batch: 5}) */
    checkpointPosition: (0, pg_core_1.jsonb)("checkpointPosition")
      .$type()
      .notNull(),
    /** Progress at this checkpoint */
    recordsProcessed: (0, pg_core_1.integer)("recordsProcessed").notNull(),
    eventsInserted: (0, pg_core_1.integer)("eventsInserted").notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("funnel_backfill_checkpoints_run_idx").on(t.runId),
    ];
  }
);
// ============================================================
// OpenSandbox Tables
// ============================================================
/**
 * Sandbox Profiles -- Reusable runtime configurations for sandbox containers.
 * Each profile defines resource limits, execution mode, and security policies.
 */
exports.sandboxProfiles = (0, pg_core_1.pgTable)("sandbox_profiles", {
  id: (0, pg_core_1.serial)("id").primaryKey(),
  slug: (0, pg_core_1.varchar)("slug", { length: 64 }).notNull().unique(),
  name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
  description: (0, pg_core_1.text)("description"),
  executionMode: (0, exports.sandboxExecutionModeEnum)(
    "executionMode"
  ).notNull(),
  baseImage: (0, pg_core_1.varchar)("baseImage", { length: 512 }).notNull(),
  entrypointTemplate: (0, pg_core_1.text)("entrypointTemplate"),
  cpuLimit: (0, pg_core_1.varchar)("cpuLimit", { length: 16 })
    .default("1000m")
    .notNull(),
  memoryLimitMb: (0, pg_core_1.integer)("memoryLimitMb")
    .default(2048)
    .notNull(),
  ephemeralDiskMb: (0, pg_core_1.integer)("ephemeralDiskMb")
    .default(5120)
    .notNull(),
  timeoutSeconds: (0, pg_core_1.integer)("timeoutSeconds")
    .default(300)
    .notNull(),
  networkDefaultAction: (0, exports.sandboxNetworkActionEnum)(
    "networkDefaultAction"
  )
    .default("deny")
    .notNull(),
  allowBrowser: (0, pg_core_1.boolean)("allowBrowser").default(false).notNull(),
  allowCommand: (0, pg_core_1.boolean)("allowCommand").default(false).notNull(),
  allowCodeInterpreter: (0, pg_core_1.boolean)("allowCodeInterpreter")
    .default(false)
    .notNull(),
  allowFileUpload: (0, pg_core_1.boolean)("allowFileUpload")
    .default(true)
    .notNull(),
  maxInputMb: (0, pg_core_1.integer)("maxInputMb").default(50),
  maxOutputMb: (0, pg_core_1.integer)("maxOutputMb").default(100),
  isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
  version: (0, pg_core_1.integer)("version").default(1).notNull(),
  createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
/**
 * Sandbox Jobs -- Canonical execution records for sandbox operations.
 * Tracks lifecycle from acceptance through execution to completion/failure.
 */
exports.sandboxJobs = (0, pg_core_1.pgTable)(
  "sandbox_jobs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    featureType: (0, exports.sandboxFeatureTypeEnum)("featureType").notNull(),
    featureRefId: (0, pg_core_1.varchar)("featureRefId", { length: 128 }),
    executionMode: (0, exports.sandboxExecutionModeEnum)(
      "executionMode"
    ).notNull(),
    sandboxProfileId: (0, pg_core_1.integer)("sandboxProfileId").references(
      function () {
        return exports.sandboxProfiles.id;
      }
    ),
    opensandboxId: (0, pg_core_1.varchar)("opensandboxId", { length: 128 }),
    status: (0, exports.sandboxJobStatusEnum)("status")
      .default("accepted")
      .notNull(),
    statusReason: (0, pg_core_1.text)("statusReason"),
    imageUri: (0, pg_core_1.varchar)("imageUri", { length: 512 }),
    inputManifestJson: (0, pg_core_1.jsonb)("inputManifestJson").$type(),
    outputManifestJson: (0, pg_core_1.jsonb)("outputManifestJson").$type(),
    stdoutExcerpt: (0, pg_core_1.text)("stdoutExcerpt"),
    stderrExcerpt: (0, pg_core_1.text)("stderrExcerpt"),
    costEstimate: (0, pg_core_1.numeric)("costEstimate", {
      precision: 12,
      scale: 4,
    }),
    costActual: (0, pg_core_1.numeric)("costActual", {
      precision: 12,
      scale: 4,
    }),
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 128 }),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    finishedAt: (0, pg_core_1.timestamp)("finishedAt", { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("sandbox_jobs_idempotency_idx")
        .on(t.tenantId, t.featureType, t.idempotencyKey)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_56 ||
              (templateObject_56 = __makeTemplateObject(
                ["", " IS NOT NULL"],
                ["", " IS NOT NULL"]
              )),
            t.idempotencyKey
          )
        ),
      (0, pg_core_1.index)("sandbox_jobs_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("sandbox_jobs_opensandbox_id_idx").on(
        t.opensandboxId
      ),
      (0, pg_core_1.index)("sandbox_jobs_user_idx").on(t.userId),
      (0, pg_core_1.index)("sandbox_jobs_created_idx").on(t.createdAt),
      (0, pg_core_1.index)("sandbox_jobs_expires_idx").on(t.expiresAt),
    ];
  }
);
/**
 * Sandbox Artifacts -- Output files produced by sandbox jobs.
 * Tracks S3/R2 object keys, types, sizes, and checksums.
 */
exports.sandboxArtifacts = (0, pg_core_1.pgTable)(
  "sandbox_artifacts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    sandboxJobId: (0, pg_core_1.varchar)("sandboxJobId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.sandboxJobs.id;
        },
        { onDelete: "cascade" }
      ),
    artifactType: (0, exports.sandboxArtifactTypeEnum)(
      "artifactType"
    ).notNull(),
    objectKey: (0, pg_core_1.varchar)("objectKey", { length: 512 }).notNull(),
    mimeType: (0, pg_core_1.varchar)("mimeType", { length: 128 }),
    sizeBytes: (0, pg_core_1.bigint)("sizeBytes", { mode: "number" }),
    sha256: (0, pg_core_1.varchar)("sha256", { length: 64 }),
    isPrimary: (0, pg_core_1.boolean)("isPrimary").default(false).notNull(),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("sandbox_artifacts_job_idx").on(t.sandboxJobId),
      (0, pg_core_1.index)("sandbox_artifacts_type_idx").on(t.artifactType),
    ];
  }
);
/**
 * Tenant Sandbox Policies -- Per-tenant sandbox usage limits and configuration.
 * One policy per tenant controlling concurrency, runtime, network, and image access.
 */
exports.tenantSandboxPolicies = (0, pg_core_1.pgTable)(
  "tenant_sandbox_policies",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .unique()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    defaultProfileId: (0, pg_core_1.integer)("defaultProfileId").references(
      function () {
        return exports.sandboxProfiles.id;
      }
    ),
    maxConcurrentSandboxes: (0, pg_core_1.integer)("maxConcurrentSandboxes")
      .default(5)
      .notNull(),
    maxDailyRuntimeSeconds: (0, pg_core_1.integer)("maxDailyRuntimeSeconds")
      .default(36000)
      .notNull(),
    maxSingleJobSeconds: (0, pg_core_1.integer)("maxSingleJobSeconds")
      .default(1800)
      .notNull(),
    defaultNetworkAction: (0, exports.sandboxNetworkActionEnum)(
      "defaultNetworkAction"
    ),
    egressRulesJson: (0, pg_core_1.jsonb)("egressRulesJson").$type(),
    allowedImagesJson: (0, pg_core_1.jsonb)("allowedImagesJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
// ==========================================
// Section 027: Agency-Swarm Integration
// ==========================================
/**
 * Agencies -- Multi-agent orchestration units.
 * Each agency contains a team of AI agents with directional communication flows.
 */
exports.agencies = (0, pg_core_1.pgTable)(
  "agencies",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    sourceTemplateId: (0, pg_core_1.varchar)("sourceTemplateId", {
      length: 36,
    }).references(
      function () {
        return exports.agencyTemplates.id;
      },
      { onDelete: "set null" }
    ),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    systemPrompt: (0, pg_core_1.text)("systemPrompt"),
    creditMultiplier: (0, pg_core_1.numeric)("creditMultiplier", {
      precision: 5,
      scale: 2,
    }).default("1.00"),
    /** Creator fee in credits charged to runner on successful run completion (0 = no fee) */
    creatorFeeCredits: (0, pg_core_1.integer)("creatorFeeCredits")
      .default(0)
      .notNull(),
    /** Platform share percentage of creator fee (default 20% — creator gets 80%) */
    platformSharePct: (0, pg_core_1.integer)("platformSharePct")
      .default(20)
      .notNull(),
    /** Default LLM model for new agents & fallback when agent model is unset */
    defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 100 }),
    maxAgents: (0, pg_core_1.integer)("maxAgents").default(10),
    maxRunTimeSeconds: (0, pg_core_1.integer)("maxRunTimeSeconds").default(600),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .default("draft")
      .notNull(),
    isFallbackSafe: (0, pg_core_1.boolean)("isFallbackSafe")
      .default(false)
      .notNull(),
    isPublished: (0, pg_core_1.boolean)("isPublished").default(false).notNull(),
    /** Visibility: private (owner only), shared (specific groups), public (all tenant users) */
    visibility: (0, pg_core_1.varchar)("visibility", { length: 20 })
      .default("private")
      .notNull(),
    /** Pre-generated SVG topology diagram for marketplace preview */
    previewSvg: (0, pg_core_1.text)("previewSvg"),
    /** Generated phrases used by chat trigger detection */
    triggerPhrases: (0, pg_core_1.jsonb)("triggerPhrases").$type(),
    /** When the creator requested public publishing */
    requestedPublishAt: (0, pg_core_1.timestamp)("requestedPublishAt", {
      withTimezone: true,
    }),
    /** Admin who approved/rejected the publish request */
    approvedBy: (0, pg_core_1.integer)("approvedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    /** When admin approved the publish request */
    approvedAt: (0, pg_core_1.timestamp)("approvedAt", { withTimezone: true }),
    /** Reason for rejection (shown to creator) */
    rejectionReason: (0, pg_core_1.text)("rejectionReason"),
    /** User-defined objective for this agency — used by improvement loop to evaluate results */
    objective: (0, pg_core_1.text)("objective"),
    sharedInstructions: (0, pg_core_1.text)("sharedInstructions"),
    userContext: (0, pg_core_1.jsonb)("userContext").$type(),
    conversationStarters: (0, pg_core_1.jsonb)("conversationStarters").$type(),
    topology: (0, pg_core_1.varchar)("topology", { length: 30 })
      .default("custom")
      .notNull(),
    documentVersion: (0, pg_core_1.integer)("documentVersion")
      .default(1)
      .notNull(),
    defaultEngine: (0, pg_core_1.varchar)("defaultEngine", { length: 30 })
      .default("agency_swarm")
      .notNull(),
    compileMode: (0, pg_core_1.varchar)("compileMode", { length: 30 })
      .default("legacy_agency")
      .notNull(),
    compatibilityMode: (0, pg_core_1.varchar)("compatibilityMode", {
      length: 50,
    })
      .default("preserve_agency_swarm")
      .notNull(),
    cacheConversationStarters: (0, pg_core_1.boolean)(
      "cacheConversationStarters"
    )
      .default(false)
      .notNull(),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agencies_tenant_slug_idx").on(
        t.tenantId,
        t.slug
      ),
      (0, pg_core_1.index)("agencies_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("agencies_created_by_idx").on(t.createdBy),
    ];
  }
);
/**
 * Agency Permissions — controls which groups can access a shared agency.
 * Mirrors the skillPermissions pattern.
 */
exports.agencyPermissions = (0, pg_core_1.pgTable)(
  "agency_permissions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    groupId: (0, pg_core_1.integer)("groupId")
      .notNull()
      .references(
        function () {
          return exports.userGroups.id;
        },
        { onDelete: "cascade" }
      ),
    grantedByUserId: (0, pg_core_1.integer)("grantedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_permissions_unique").on(
        t.agencyId,
        t.groupId
      ),
      (0, pg_core_1.index)("agency_permissions_group_idx").on(t.groupId),
      (0, pg_core_1.index)("agency_permissions_agency_idx").on(t.agencyId),
    ];
  }
);
/**
 * Agency Run Feedback — User ratings and feedback after each agency run.
 * Powers the continuous improvement loop.
 */
exports.agencyRunFeedback = (0, pg_core_1.pgTable)(
  "agency_run_feedback",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    conversationId: (0, pg_core_1.varchar)("conversationId", { length: 36 }),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** 1-5 star rating */
    rating: (0, pg_core_1.integer)("rating").notNull(),
    /** What matched expectations */
    whatWorked: (0, pg_core_1.text)("whatWorked"),
    /** What didn't match expectations */
    whatDidntWork: (0, pg_core_1.text)("whatDidntWork"),
    /** Specific improvement requests */
    improvementRequests: (0, pg_core_1.text)("improvementRequests"),
    /** LLM-generated analysis of this feedback + suggestions */
    advisorAnalysis: (0, pg_core_1.jsonb)("advisorAnalysis").$type(),
    /** Whether advisor suggestions have been applied */
    suggestionsApplied: (0, pg_core_1.boolean)("suggestionsApplied").default(
      false
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_run_feedback_unique").on(
        t.runId,
        t.userId
      ),
      (0, pg_core_1.index)("agency_run_feedback_agency_idx").on(
        t.agencyId,
        t.createdAt
      ),
    ];
  }
);
/**
 * Agency Improvement History — Tracks every improvement applied to an agency.
 * Provides audit trail for the continuous improvement loop.
 */
exports.agencyImprovementHistory = (0, pg_core_1.pgTable)(
  "agency_improvement_history",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    /** What triggered this improvement */
    triggerType: (0, pg_core_1.varchar)("triggerType", {
      length: 30,
    }).notNull(),
    /** Source reference (feedbackId, health_monitor, etc.) */
    triggerRef: (0, pg_core_1.varchar)("triggerRef", { length: 100 }),
    /** What was changed */
    changeType: (0, pg_core_1.varchar)("changeType", { length: 30 }).notNull(),
    /** Which node was affected (null = agency-level) */
    agentNodeId: (0, pg_core_1.text)("agentNodeId"),
    /** Description of the change */
    description: (0, pg_core_1.text)("description").notNull(),
    /** Previous value (for rollback) */
    previousValue: (0, pg_core_1.text)("previousValue"),
    /** New value */
    newValue: (0, pg_core_1.text)("newValue"),
    /** Who approved (null = auto-applied) */
    approvedBy: (0, pg_core_1.integer)("approvedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_improvement_agency_idx").on(
        t.agencyId,
        t.createdAt
      ),
    ];
  }
);
/**
 * Agency Agents -- Individual AI agents within an agency.
 * Each agent has its own model, instructions, and tool set.
 */
exports.agencyAgents = (0, pg_core_1.pgTable)(
  "agency_agents",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    instructions: (0, pg_core_1.text)("instructions"),
    model: (0, pg_core_1.varchar)("model", { length: 100 }),
    modelSettings: (0, pg_core_1.json)("modelSettings").$type(),
    /** Capability-based model selection requirements (null = use manual model field) */
    modelRequirements: (0, pg_core_1.json)("modelRequirements").$type(),
    isEntryPoint: (0, pg_core_1.boolean)("isEntryPoint")
      .default(false)
      .notNull(),
    isOptional: (0, pg_core_1.boolean)("isOptional").default(false).notNull(),
    position: (0, pg_core_1.json)("position").$type(),
    subgraphId: (0, pg_core_1.varchar)("subgraphId", { length: 100 }),
    engineHint: (0, pg_core_1.varchar)("engineHint", { length: 30 }),
    runtimeConfig: (0, pg_core_1.jsonb)("runtimeConfig").$type(),
    nodeType: (0, pg_core_1.varchar)("nodeType", { length: 30 })
      .default("agent")
      .notNull(),
    nodeConfig: (0, pg_core_1.json)("nodeConfig").$type(),
    outputSchema: (0, pg_core_1.jsonb)("outputSchema").$type(),
    examples: (0, pg_core_1.jsonb)("examples").$type(),
    mcpServers: (0, pg_core_1.jsonb)("mcpServers").$type(),
    mcpServerTokensEncrypted: (0, pg_core_1.text)("mcpServerTokensEncrypted"),
    parallelToolCalls: (0, pg_core_1.boolean)("parallelToolCalls")
      .default(true)
      .notNull(),
    maxTurns: (0, pg_core_1.integer)("maxTurns").default(25).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_agents_agency_idx").on(t.agencyId),
      (0, pg_core_1.uniqueIndex)("agency_agents_agency_name_idx").on(
        t.agencyId,
        t.name
      ),
    ];
  }
);
/**
 * Agency Subgraphs -- Hybrid document containers for mixed-engine execution groups.
 */
exports.agencySubgraphs = (0, pg_core_1.pgTable)(
  "agency_subgraphs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    subgraphKey: (0, pg_core_1.varchar)("subgraphKey", {
      length: 100,
    }).notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    engine: (0, pg_core_1.varchar)("engine", { length: 30 })
      .default("agency_swarm")
      .notNull(),
    entryNodeIds: (0, pg_core_1.jsonb)("entryNodeIds")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_57 ||
            (templateObject_57 = __makeTemplateObject(
              ["'[]'::jsonb"],
              ["'[]'::jsonb"]
            ))
        )
      )
      .notNull(),
    exitNodeIds: (0, pg_core_1.jsonb)("exitNodeIds")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_58 ||
            (templateObject_58 = __makeTemplateObject(
              ["'[]'::jsonb"],
              ["'[]'::jsonb"]
            ))
        )
      )
      .notNull(),
    nodeIds: (0, pg_core_1.jsonb)("nodeIds")
      .$type()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_59 ||
            (templateObject_59 = __makeTemplateObject(
              ["'[]'::jsonb"],
              ["'[]'::jsonb"]
            ))
        )
      )
      .notNull(),
    boundaryPolicy: (0, pg_core_1.jsonb)("boundaryPolicy").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_subgraphs_agency_idx").on(t.agencyId),
      (0, pg_core_1.uniqueIndex)("agency_subgraphs_agency_key_idx").on(
        t.agencyId,
        t.subgraphKey
      ),
    ];
  }
);
/**
 * Agency Templates -- Pre-configured multi-agent orchestration templates
 * (e.g. "SEO Team", "Software Development Agency")
 */
exports.agencyTemplates = (0, pg_core_1.pgTable)(
  "agency_templates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    systemPrompt: (0, pg_core_1.text)("systemPrompt"),
    category: (0, pg_core_1.varchar)("category", { length: 64 }).notNull(), // e.g. "Marketing", "Development"
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    /** Tenant that owns this template (F04 security requirement) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** User who created this template */
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    /** Original agency this template was derived from */
    sourceAgencyId: (0, pg_core_1.varchar)("sourceAgencyId", {
      length: 36,
    }).references(
      function () {
        return exports.agencies.id;
      },
      { onDelete: "set null" }
    ),
    /** Template status: draft (needs approval for public), approved, rejected */
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .default("draft")
      .notNull(),
    /** Portable agent definitions (array indices instead of UUIDs) */
    agentDefinitions: (0, pg_core_1.jsonb)("agentDefinitions").$type(),
    /** Portable communication flows (array indices instead of UUIDs) */
    communicationFlows: (0, pg_core_1.jsonb)("communicationFlows").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_templates_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("agency_templates_created_by_idx").on(t.createdBy),
    ];
  }
);
/**
 * Agent Templates -- Pre-configured individual roles
 * (e.g. "CEO", "Copywriter", "Data Analyst")
 *
 * Can be linked to a specific agency_template, or act as a standalone draggable node.
 */
exports.agentTemplates = (0, pg_core_1.pgTable)(
  "agent_templates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyTemplateId: (0, pg_core_1.varchar)("agencyTemplateId", {
      length: 36,
    }).references(
      function () {
        return exports.agencyTemplates.id;
      },
      { onDelete: "cascade" }
    ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    role: (0, pg_core_1.varchar)("role", { length: 100 }).notNull(), // Job title "CEO"
    description: (0, pg_core_1.text)("description"),
    instructions: (0, pg_core_1.text)("instructions"),
    category: (0, pg_core_1.varchar)("category", { length: 64 }).notNull(), // Sidebar category
    icon: (0, pg_core_1.varchar)("icon", { length: 64 }).default("bot"),
    defaultModel: (0, pg_core_1.varchar)("defaultModel", { length: 100 }),
    isEntryPoint: (0, pg_core_1.boolean)("isEntryPoint")
      .default(false)
      .notNull(),
    position: (0, pg_core_1.json)("position").$type(),
    defaultTools: (0, pg_core_1.json)("defaultTools").$type(), // slugs of tools to auto-attach
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agent_templates_agency_tmpl_idx").on(
        t.agencyTemplateId
      ),
      (0, pg_core_1.index)("agent_templates_category_idx").on(t.category),
    ];
  }
);
/**
 * Agency Tools -- Tool definitions available to agency agents.
 */
exports.agencyTools = (0, pg_core_1.pgTable)(
  "agency_tools",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    toolType: (0, pg_core_1.varchar)("toolType", { length: 20 }).notNull(),
    config: (0, pg_core_1.json)("config").$type(),
    riskLevel: (0, pg_core_1.varchar)("riskLevel", { length: 10 })
      .default("low")
      .notNull(),
    requiresApproval: (0, pg_core_1.boolean)("requiresApproval")
      .default(false)
      .notNull(),
    inputSchema: (0, pg_core_1.jsonb)("inputSchema").$type(),
    outputSchema: (0, pg_core_1.jsonb)("outputSchema").$type(),
    httpMethod: (0, pg_core_1.varchar)("httpMethod", { length: 10 }),
    headersEncrypted: (0, pg_core_1.text)("headersEncrypted"),
    retryPolicy: (0, pg_core_1.jsonb)("retryPolicy").$type(),
    icon: (0, pg_core_1.varchar)("icon", { length: 50 }),
    category: (0, pg_core_1.varchar)("category", { length: 50 }),
    version: (0, pg_core_1.integer)("version").default(1).notNull(),
    isExposedAsApi: (0, pg_core_1.boolean)("isExposedAsApi")
      .default(false)
      .notNull(),
    strictSchema: (0, pg_core_1.boolean)("strictSchema")
      .default(false)
      .notNull(),
    oneCallAtATime: (0, pg_core_1.boolean)("oneCallAtATime")
      .default(false)
      .notNull(),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_tools_tenant_idx").on(t.tenantId),
      (0, pg_core_1.uniqueIndex)("agency_tools_tenant_name_idx").on(
        t.tenantId,
        t.name
      ),
    ];
  }
);
/**
 * Agency Agent Tools -- Junction table linking agents to their assigned tools.
 */
exports.agencyAgentTools = (0, pg_core_1.pgTable)(
  "agency_agent_tools",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agentId: (0, pg_core_1.varchar)("agentId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyAgents.id;
        },
        { onDelete: "cascade" }
      ),
    toolId: (0, pg_core_1.varchar)("toolId", { length: 100 }).notNull(),
    toolConfig: (0, pg_core_1.json)("toolConfig").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_agent_tools_agent_tool_idx").on(
        t.agentId,
        t.toolId
      ),
      (0, pg_core_1.index)("agency_agent_tools_tool_idx").on(t.toolId),
    ];
  }
);
/**
 * Agency Communication Flows -- Directional communication links between agents.
 */
exports.agencyCommunicationFlows = (0, pg_core_1.pgTable)(
  "agency_communication_flows",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    fromAgentId: (0, pg_core_1.varchar)("fromAgentId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyAgents.id;
        },
        { onDelete: "cascade" }
      ),
    toAgentId: (0, pg_core_1.varchar)("toAgentId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyAgents.id;
        },
        { onDelete: "cascade" }
      ),
    flowType: (0, pg_core_1.varchar)("flowType", { length: 20 })
      .default("delegation")
      .notNull(),
    flowConfig: (0, pg_core_1.jsonb)("flowConfig").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_comm_flows_agency_idx").on(t.agencyId),
      (0, pg_core_1.uniqueIndex)("agency_comm_flows_unique_idx").on(
        t.agencyId,
        t.fromAgentId,
        t.toAgentId
      ),
    ];
  }
);
/**
 * Agency Conversations -- Chat sessions between a user and an agency.
 */
exports.agencyConversations = (0, pg_core_1.pgTable)(
  "agency_conversations",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    title: (0, pg_core_1.varchar)("title", { length: 255 })
      .default("New Agency Chat")
      .notNull(),
    totalCreditsUsed: (0, pg_core_1.numeric)("totalCreditsUsed", {
      precision: 12,
      scale: 4,
    }).default("0"),
    messageCount: (0, pg_core_1.integer)("messageCount").default(0).notNull(),
    isArchived: (0, pg_core_1.boolean)("isArchived").default(false).notNull(),
    /** Origin: 'web', 'api', 'widget' */
    source: (0, pg_core_1.varchar)("source", { length: 20 }).default("web"),
    /** API key that created this conversation */
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }),
    /** Auto-expire API-created conversations */
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_conversations_agency_user_idx").on(
        t.agencyId,
        t.userId
      ),
      (0, pg_core_1.index)("agency_conversations_user_idx").on(t.userId),
    ];
  }
);
/**
 * Agency Run Artifacts -- run-scoped preview and commit tracking for structured outputs.
 *
 * `runId` points at the Python-owned `agency_runs` table, so it is intentionally
 * stored without a database foreign key in Drizzle.
 */
exports.agencyRunArtifacts = (0, pg_core_1.pgTable)(
  "agency_run_artifacts",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    conversationId: (0, pg_core_1.varchar)("conversationId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyConversations.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    artifactType: (0, pg_core_1.varchar)("artifactType", {
      length: 50,
    }).notNull(),
    intent: (0, pg_core_1.varchar)("intent", { length: 50 }).notNull(),
    state: (0, pg_core_1.varchar)("state", { length: 32 })
      .notNull()
      .default("preview_generated"),
    summary: (0, pg_core_1.text)("summary"),
    payloadJson: (0, pg_core_1.json)("payloadJson").$type(),
    payloadStorageKey: (0, pg_core_1.varchar)("payloadStorageKey", {
      length: 255,
    }),
    provenanceJson: (0, pg_core_1.json)("provenanceJson").$type(),
    commitStatus: (0, pg_core_1.varchar)("commitStatus", { length: 32 })
      .notNull()
      .default("not_committed"),
    commitToken: (0, pg_core_1.varchar)("commitToken", {
      length: 64,
    }).notNull(),
    targetType: (0, pg_core_1.varchar)("targetType", { length: 64 }),
    targetId: (0, pg_core_1.varchar)("targetId", { length: 128 }),
    committedAt: (0, pg_core_1.timestamp)("committedAt", {
      withTimezone: true,
    }),
    expiredAt: (0, pg_core_1.timestamp)("expiredAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_run_artifacts_commit_token_idx").on(
        t.commitToken
      ),
      (0, pg_core_1.index)("agency_run_artifacts_run_idx").on(t.runId),
      (0, pg_core_1.index)("agency_run_artifacts_conversation_idx").on(
        t.conversationId
      ),
      (0, pg_core_1.index)("agency_run_artifacts_tenant_idx").on(t.tenantId),
    ];
  }
);
/**
 * Agency Versions -- Immutable snapshots of an agency graph for version history.
 * Max 50 versions per agency (oldest pruned on insert).
 */
exports.agencyVersions = (0, pg_core_1.pgTable)(
  "agency_versions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    versionNumber: (0, pg_core_1.integer)("versionNumber").notNull(),
    snapshotJson: (0, pg_core_1.json)("snapshotJson").$type().notNull(),
    contentHash: (0, pg_core_1.varchar)("contentHash", {
      length: 64,
    }).notNull(),
    changeDescription: (0, pg_core_1.text)("changeDescription"),
    createdByUserId: (0, pg_core_1.integer)("createdByUserId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("av_agency_version_unique").on(
        t.agencyId,
        t.versionNumber
      ),
      (0, pg_core_1.index)("av_agency_created_idx").on(t.agencyId, t.createdAt),
    ];
  }
);
/**
 * Agency Agent Memories — Long-term learnings extracted from agent runs.
 * Scoped per-user: each user's memories are isolated.
 * Used by Level 3 autonomous agents to improve over time.
 */
exports.agencyAgentMemories = (0, pg_core_1.pgTable)(
  "agency_agent_memories",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    agentNodeId: (0, pg_core_1.text)("agentNodeId").notNull(),
    memoryType: (0, pg_core_1.text)("memoryType").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    contentHash: (0, pg_core_1.text)("contentHash").notNull(),
    sourceRunId: (0, pg_core_1.text)("sourceRunId"),
    confidence: (0, pg_core_1.numeric)("confidence", {
      precision: 4,
      scale: 3,
    }).default("1.000"),
    useCount: (0, pg_core_1.integer)("useCount").default(0).notNull(),
    lastUsedAt: (0, pg_core_1.timestamp)("lastUsedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    embedding: vector1536("embedding"),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agent_memories_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("agent_memories_agency_idx").on(t.agencyId),
      (0, pg_core_1.index)("agent_memories_user_idx").on(t.userId),
      (0, pg_core_1.index)("agent_memories_lookup_idx").on(
        t.tenantId,
        t.agencyId,
        t.agentNodeId,
        t.userId,
        t.isActive
      ),
      (0, pg_core_1.uniqueIndex)("agent_memories_content_hash_idx").on(
        t.tenantId,
        t.agencyId,
        t.agentNodeId,
        t.userId,
        t.contentHash
      ),
    ];
  }
);
/**
 * Agency Memory Chunks — Raw agent output chunks stored for Level 2 fallback retrieval.
 * These rows are short-lived and are cleaned up by a TTL purge job.
 */
exports.agencyMemoryChunks = (0, pg_core_1.pgTable)(
  "agency_memory_chunks",
  {
    id: (0, pg_core_1.text)("id")
      .primaryKey()
      .$defaultFn(function () {
        return crypto.randomUUID();
      }),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    agentNodeId: (0, pg_core_1.text)("agentNodeId").notNull(),
    runId: (0, pg_core_1.text)("runId").notNull(),
    sourceNodeId: (0, pg_core_1.text)("sourceNodeId").notNull(),
    chunkIndex: (0, pg_core_1.integer)("chunkIndex").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    embedding: vector1536("embedding"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("memory_chunks_scope_idx").on(
        t.tenantId,
        t.agencyId,
        t.agentNodeId,
        t.userId
      ),
      (0, pg_core_1.index)("memory_chunks_expires_idx").on(t.expiresAt),
      (0, pg_core_1.index)("memory_chunks_run_idx").on(t.runId, t.sourceNodeId),
    ];
  }
);
/**
 * Agency Guardrails — input/output validation rules for agency agents.
 */
exports.agencyGuardrails = (0, pg_core_1.pgTable)(
  "agency_guardrails",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 10 }).notNull(),
    mode: (0, pg_core_1.varchar)("mode", { length: 10 }).notNull(),
    strategy: (0, pg_core_1.varchar)("strategy", { length: 30 }).notNull(),
    config: (0, pg_core_1.jsonb)("config"),
    validationAttempts: (0, pg_core_1.integer)("validationAttempts")
      .default(1)
      .notNull(),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").default(true).notNull(),
    sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_guardrails_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("agency_guardrails_agency_idx").on(t.agencyId),
      (0, pg_core_1.index)("agency_guardrails_agency_enabled_idx").on(
        t.agencyId,
        t.isEnabled
      ),
    ];
  }
);
/**
 * Agency Agent Guardrails — junction table linking agents to guardrails.
 */
exports.agencyAgentGuardrails = (0, pg_core_1.pgTable)(
  "agency_agent_guardrails",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agentId: (0, pg_core_1.varchar)("agentId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyAgents.id;
        },
        { onDelete: "cascade" }
      ),
    guardrailId: (0, pg_core_1.varchar)("guardrailId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencyGuardrails.id;
        },
        { onDelete: "cascade" }
      ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_agent_guardrails_unique").on(
        t.agentId,
        t.guardrailId
      ),
    ];
  }
);
/**
 * Agency Shared Tools — tools shared across all agents in an agency.
 * toolId is varchar(100) with no FK to allow both builtin string IDs and UUIDs.
 */
exports.agencySharedTools = (0, pg_core_1.pgTable)(
  "agency_shared_tools",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    toolId: (0, pg_core_1.varchar)("toolId", { length: 100 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("agency_shared_tools_unique").on(
        t.agencyId,
        t.toolId
      ),
    ];
  }
);
/**
 * Agency Run Traces — structured execution traces for observability.
 * runId and agencyId are intentionally NOT foreign keys (Python-owned, audit persistence).
 */
exports.agencyRunTraces = (0, pg_core_1.pgTable)(
  "agency_run_traces",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 }).notNull(),
    createdBy: (0, pg_core_1.integer)("createdBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    trace: (0, pg_core_1.jsonb)("trace").notNull(),
    durationMs: (0, pg_core_1.integer)("durationMs"),
    totalTokens: (0, pg_core_1.integer)("totalTokens"),
    totalCost: (0, pg_core_1.numeric)("totalCost", { precision: 10, scale: 6 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agency_run_traces_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("agency_run_traces_run_idx").on(t.runId),
      (0, pg_core_1.index)("agency_run_traces_agency_idx").on(t.agencyId),
      (0, pg_core_1.index)("agency_run_traces_created_idx").on(t.createdAt),
    ];
  }
);
// ─── Chat Bridge Tables ─────────────────────────────────────────────────────
/**
 * Telegram Connections -- Links a SmartSpecPro user to a Telegram account.
 * Replaces the user-level telegramChatId/telegramVerified fields with a
 * proper connection model supporting multiple bots and conversation binding.
 */
exports.telegramConnections = (0, pg_core_1.pgTable)(
  "telegram_connections",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    telegramUserId: (0, pg_core_1.varchar)("telegramUserId", {
      length: 64,
    }).notNull(),
    telegramChatId: (0, pg_core_1.varchar)("telegramChatId", {
      length: 64,
    }).notNull(),
    telegramUsername: (0, pg_core_1.varchar)("telegramUsername", {
      length: 64,
    }),
    botId: (0, pg_core_1.varchar)("botId", { length: 64 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("pending"),
    activeChannelId: (0, pg_core_1.varchar)("activeChannelId", { length: 36 }),
    linkedAt: (0, pg_core_1.timestamp)("linkedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    linkedBy: (0, pg_core_1.varchar)("linkedBy", { length: 20 }).notNull(),
    revokedAt: (0, pg_core_1.timestamp)("revokedAt", { withTimezone: true }),
    revokedBy: (0, pg_core_1.varchar)("revokedBy", { length: 36 }),
    lastSeenAt: (0, pg_core_1.timestamp)("lastSeenAt", { withTimezone: true }),
    metadata: (0, pg_core_1.json)("metadata").$type(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("telegram_connections_bot_user_unique").on(
        t.botId,
        t.telegramUserId
      ),
      (0, pg_core_1.index)("telegram_connections_tenant_user_idx").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.index)("telegram_connections_chat_id_idx").on(
        t.telegramChatId
      ),
    ];
  }
);
/**
 * Conversation Channels -- Maps conversations (chat or agency) to external
 * channel bindings (Telegram, future: LINE, WhatsApp).
 *
 * Uses split FK columns because conversations.id is integer and
 * agencyConversations.id is varchar(36). A CHECK constraint ensures
 * exactly one is set, determined by conversationType.
 */
exports.conversationChannels = (0, pg_core_1.pgTable)(
  "conversation_channels",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    chatConversationId: (0, pg_core_1.integer)("chatConversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "cascade" }
    ),
    agencyConversationId: (0, pg_core_1.varchar)("agencyConversationId", {
      length: 36,
    }).references(
      function () {
        return exports.agencyConversations.id;
      },
      { onDelete: "cascade" }
    ),
    conversationType: (0, pg_core_1.varchar)("conversationType", {
      length: 20,
    }).notNull(),
    channelType: (0, pg_core_1.varchar)("channelType", {
      length: 20,
    }).notNull(),
    channelRefId: (0, pg_core_1.varchar)("channelRefId", { length: 64 }),
    connectionId: (0, pg_core_1.varchar)("connectionId", { length: 36 }),
    isPrimary: (0, pg_core_1.boolean)("isPrimary").default(false).notNull(),
    syncMode: (0, pg_core_1.varchar)("syncMode", { length: 20 })
      .notNull()
      .default("two_way"),
    state: (0, pg_core_1.varchar)("state", { length: 20 })
      .notNull()
      .default("active"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("conversation_channels_chat_unique")
        .on(t.chatConversationId, t.channelType, t.channelRefId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_60 ||
              (templateObject_60 = __makeTemplateObject(
                ['"chatConversationId" IS NOT NULL'],
                ['"chatConversationId" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.uniqueIndex)("conversation_channels_agency_unique")
        .on(t.agencyConversationId, t.channelType, t.channelRefId)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_61 ||
              (templateObject_61 = __makeTemplateObject(
                ['"agencyConversationId" IS NOT NULL'],
                ['"agencyConversationId" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.index)("conversation_channels_tenant_type_idx").on(
        t.tenantId,
        t.channelType
      ),
      (0, pg_core_1.check)(
        "conversation_channels_one_conv_check",
        (0, drizzle_orm_1.sql)(
          templateObject_62 ||
            (templateObject_62 = __makeTemplateObject(
              [
                '\n    ("conversationType" = \'chat\' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)\n    OR\n    ("conversationType" = \'agency\' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)\n  ',
              ],
              [
                '\n    ("conversationType" = \'chat\' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)\n    OR\n    ("conversationType" = \'agency\' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)\n  ',
              ]
            ))
        )
      ),
    ];
  }
);
/**
 * Channel Messages -- Per-channel delivery tracking for outbound messages.
 *
 * messageId is stored as text because it may reference messages.id (integer)
 * or agency_messages.id (bigint). No FK constraint since it spans two tables.
 * messageType determines which source table to query.
 */
exports.channelMessages = (0, pg_core_1.pgTable)(
  "channel_messages",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    conversationChannelId: (0, pg_core_1.varchar)("conversationChannelId", {
      length: 36,
    })
      .notNull()
      .references(
        function () {
          return exports.conversationChannels.id;
        },
        { onDelete: "cascade" }
      ),
    messageId: (0, pg_core_1.text)("messageId").notNull(),
    messageType: (0, pg_core_1.varchar)("messageType", {
      length: 20,
    }).notNull(),
    channelType: (0, pg_core_1.varchar)("channelType", {
      length: 20,
    }).notNull(),
    externalMessageId: (0, pg_core_1.varchar)("externalMessageId", {
      length: 64,
    }),
    externalChatId: (0, pg_core_1.varchar)("externalChatId", { length: 64 }),
    deliveryStatus: (0, pg_core_1.varchar)("deliveryStatus", { length: 20 })
      .notNull()
      .default("pending"),
    attemptCount: (0, pg_core_1.integer)("attemptCount").notNull().default(0),
    lastAttemptAt: (0, pg_core_1.timestamp)("lastAttemptAt", {
      withTimezone: true,
    }),
    deliveredAt: (0, pg_core_1.timestamp)("deliveredAt", {
      withTimezone: true,
    }),
    failureCode: (0, pg_core_1.varchar)("failureCode", { length: 50 }),
    failureReason: (0, pg_core_1.text)("failureReason"),
    metadata: (0, pg_core_1.json)("metadata").$type(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("channel_messages_external_unique").on(
        t.channelType,
        t.externalChatId,
        t.externalMessageId
      ),
      (0, pg_core_1.index)("channel_messages_channel_msg_idx").on(
        t.conversationChannelId,
        t.messageId
      ),
    ];
  }
);
/**
 * Telegram Link Tokens -- Auditable deep-link tokens for connecting
 * Telegram accounts and optionally binding to specific conversations.
 *
 * Uses the same split-ID pattern as conversation_channels for conversation FKs.
 */
exports.telegramLinkTokens = (0, pg_core_1.pgTable)(
  "telegram_link_tokens",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    targetChatConversationId: (0, pg_core_1.integer)(
      "targetChatConversationId"
    ).references(function () {
      return exports.conversations.id;
    }),
    targetAgencyConversationId: (0, pg_core_1.varchar)(
      "targetAgencyConversationId",
      { length: 36 }
    ).references(function () {
      return exports.agencyConversations.id;
    }),
    targetConversationType: (0, pg_core_1.varchar)("targetConversationType", {
      length: 20,
    }),
    purpose: (0, pg_core_1.varchar)("purpose", { length: 20 }).notNull(),
    tokenHash: (0, pg_core_1.varchar)("tokenHash", { length: 128 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
    usedAt: (0, pg_core_1.timestamp)("usedAt", { withTimezone: true }),
    revokedAt: (0, pg_core_1.timestamp)("revokedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: (0, pg_core_1.integer)("createdBy"),
    metadata: (0, pg_core_1.json)("metadata").$type(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("telegram_link_tokens_hash_unique").on(
        t.tokenHash
      ),
      (0, pg_core_1.index)("telegram_link_tokens_tenant_user_purpose_idx").on(
        t.tenantId,
        t.userId,
        t.purpose
      ),
    ];
  }
);
/**
 * Telegram Updates -- Webhook update deduplication and audit log.
 * Stores every inbound Telegram Update ID for dedupe and troubleshooting.
 */
exports.telegramUpdates = (0, pg_core_1.pgTable)(
  "telegram_updates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    botId: (0, pg_core_1.varchar)("botId", { length: 64 }).notNull(),
    updateId: (0, pg_core_1.bigint)("updateId", { mode: "bigint" }).notNull(),
    telegramChatId: (0, pg_core_1.varchar)("telegramChatId", { length: 64 }),
    receivedAt: (0, pg_core_1.timestamp)("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: (0, pg_core_1.timestamp)("processedAt", {
      withTimezone: true,
    }),
    processingStatus: (0, pg_core_1.varchar)("processingStatus", { length: 20 })
      .notNull()
      .default("accepted"),
    errorCode: (0, pg_core_1.varchar)("errorCode", { length: 50 }),
    errorReason: (0, pg_core_1.text)("errorReason"),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("telegram_updates_bot_update_unique").on(
        t.botId,
        t.updateId
      ),
    ];
  }
);
// ==========================================
// Creator Revenue Sharing
// ==========================================
/**
 * Creator Settlements -- Revenue sharing ledger.
 * Tracks every creator fee charged when someone runs another user's agency/workflow/skill.
 * Fee is split between creator (80% default) and platform (20% default).
 */
exports.creatorSettlements = (0, pg_core_1.pgTable)(
  "creator_settlements",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** The run that triggered this settlement */
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    /** Entity type: agency, workflow, or skill */
    entityType: (0, pg_core_1.varchar)("entityType", { length: 20 }).notNull(),
    /** Entity ID (agency.id, workflow.id, or skill.id) */
    entityId: (0, pg_core_1.varchar)("entityId", { length: 36 }).notNull(),
    /** Runner (user who paid the fee) */
    runnerId: (0, pg_core_1.integer)("runnerId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    /** Creator (user who receives the payout) */
    creatorId: (0, pg_core_1.integer)("creatorId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    /** Tenant context */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.tenants.id;
      }),
    /** Total fee configured on the entity */
    totalFee: (0, pg_core_1.integer)("totalFee").notNull(),
    /** Actual amount charged (may be less if runner had insufficient credits) */
    actualCharged: (0, pg_core_1.integer)("actualCharged").notNull(),
    /** Creator's share (actualCharged * (100 - platformSharePct) / 100) */
    creatorShare: (0, pg_core_1.integer)("creatorShare").notNull(),
    /** Platform's share (actualCharged - creatorShare) */
    platformShare: (0, pg_core_1.integer)("platformShare").notNull(),
    /** Platform share percentage at time of settlement (snapshot for audit) */
    platformSharePct: (0, pg_core_1.integer)("platformSharePct").notNull(),
    /** Transaction ID for the runner's deduction */
    debitTransactionId: (0, pg_core_1.integer)("debitTransactionId").references(
      function () {
        return exports.creditTransactions.id;
      }
    ),
    /** Transaction ID for the creator's credit */
    creditTransactionId: (0, pg_core_1.integer)(
      "creditTransactionId"
    ).references(function () {
      return exports.creditTransactions.id;
    }),
    /** Settlement status */
    status: (0, exports.settlementStatusEnum)("status")
      .default("completed")
      .notNull(),
    /** Idempotency key to prevent double settlement */
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 256 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("creator_settlements_idempotency_key_unique")
        .on(t.idempotencyKey)
        .where(
          (0, drizzle_orm_1.sql)(
            templateObject_63 ||
              (templateObject_63 = __makeTemplateObject(
                ['"idempotencyKey" IS NOT NULL'],
                ['"idempotencyKey" IS NOT NULL']
              ))
          )
        ),
      (0, pg_core_1.index)("creator_settlements_creator_idx").on(t.creatorId),
      (0, pg_core_1.index)("creator_settlements_runner_idx").on(t.runnerId),
      (0, pg_core_1.index)("creator_settlements_entity_idx").on(
        t.entityType,
        t.entityId
      ),
      (0, pg_core_1.index)("creator_settlements_run_idx").on(t.runId),
      (0, pg_core_1.index)("creator_settlements_tenant_idx").on(t.tenantId),
    ];
  }
);
// ==========================================
// ClawFeature: Persona Templates
// ==========================================
/**
 * Persona Templates -- AI persona definitions for customizing chat behavior.
 * Scope hierarchy: platform > tenant > user (4-level resolution chain).
 */
exports.personaTemplates = (0, pg_core_1.pgTable)(
  "persona_templates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_64 ||
            (templateObject_64 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    userId: (0, pg_core_1.integer)("userId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "cascade" }
    ),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    assistantNickname: (0, pg_core_1.text)("assistantNickname"),
    assistantGender: (0, pg_core_1.text)("assistantGender").default("neutral"),
    workingHours: (0, pg_core_1.jsonb)("workingHours").$type(),
    sourceTemplateIds: (0, pg_core_1.text)("sourceTemplateIds")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_65 ||
            (templateObject_65 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      )
      .notNull(),
    sourceTemplateLabels: (0, pg_core_1.text)("sourceTemplateLabels")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_66 ||
            (templateObject_66 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      )
      .notNull(),
    sourceTemplateCategories: (0, pg_core_1.text)("sourceTemplateCategories")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_67 ||
            (templateObject_67 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      )
      .notNull(),
    systemPromptPrefix: (0, pg_core_1.text)("systemPromptPrefix").notNull(),
    tone: (0, pg_core_1.text)("tone"),
    language: (0, pg_core_1.text)("language").default("auto"),
    responseStyle: (0, pg_core_1.jsonb)("responseStyle").default({}),
    restrictions: (0, pg_core_1.text)("restrictions")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_68 ||
            (templateObject_68 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    scope: (0, pg_core_1.text)("scope").notNull(),
    isDefault: (0, pg_core_1.boolean)("isDefault").default(false),
    provisionedByBlueprintId: (0, pg_core_1.varchar)(
      "provisionedByBlueprintId",
      { length: 120 }
    ),
    provisionedByBlueprintMemberId: (0, pg_core_1.varchar)(
      "provisionedByBlueprintMemberId",
      { length: 120 }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("persona_templates_tenant_scope_idx").on(
        t.tenantId,
        t.scope
      ),
      (0, pg_core_1.index)("persona_templates_user_idx").on(t.userId),
      (0, pg_core_1.index)("persona_templates_source_template_ids_idx").using(
        "gin",
        t.sourceTemplateIds
      ),
      (0, pg_core_1.index)("persona_templates_blueprint_origin_idx").on(
        t.provisionedByBlueprintId,
        t.provisionedByBlueprintMemberId
      ),
      (0, pg_core_1.check)(
        "persona_templates_assistant_gender_check",
        (0, drizzle_orm_1.sql)(
          templateObject_69 ||
            (templateObject_69 = __makeTemplateObject(
              [
                "\"assistantGender\" IN ('female','male','neutral') OR \"assistantGender\" IS NULL",
              ],
              [
                "\"assistantGender\" IN ('female','male','neutral') OR \"assistantGender\" IS NULL",
              ]
            ))
        )
      ),
      (0, pg_core_1.check)(
        "persona_templates_tone_check",
        (0, drizzle_orm_1.sql)(
          templateObject_70 ||
            (templateObject_70 = __makeTemplateObject(
              [
                "\"tone\" IN ('formal','casual','friendly','technical','creative') OR \"tone\" IS NULL",
              ],
              [
                "\"tone\" IN ('formal','casual','friendly','technical','creative') OR \"tone\" IS NULL",
              ]
            ))
        )
      ),
      (0, pg_core_1.check)(
        "persona_templates_scope_check",
        (0, drizzle_orm_1.sql)(
          templateObject_71 ||
            (templateObject_71 = __makeTemplateObject(
              ["\"scope\" IN ('platform','tenant','user')"],
              ["\"scope\" IN ('platform','tenant','user')"]
            ))
        )
      ),
    ];
  }
);
// ==========================================
// ClawFeature: Channel Infrastructure
// ==========================================
/**
 * Channel Connections -- Generalizes telegramConnections to support
 * multiple channel types (Telegram, WhatsApp, LINE, Slack, Discord).
 */
exports.channelConnections = (0, pg_core_1.pgTable)(
  "channel_connections",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_72 ||
            (templateObject_72 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    channelType: (0, pg_core_1.text)("channelType").notNull(),
    externalUserId: (0, pg_core_1.text)("externalUserId").notNull(),
    externalChatId: (0, pg_core_1.text)("externalChatId"),
    connectionConfig: (0, pg_core_1.jsonb)("connectionConfig").default({}),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    activeChannelId: (0, pg_core_1.varchar)("activeChannelId", { length: 36 }),
    linkedAt: (0, pg_core_1.timestamp)("linkedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    linkedBy: (0, pg_core_1.varchar)("linkedBy", { length: 20 }),
    revokedAt: (0, pg_core_1.timestamp)("revokedAt", { withTimezone: true }),
    revokedBy: (0, pg_core_1.varchar)("revokedBy", { length: 36 }),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "channel_connections_tenant_type_user_unique"
      ).on(t.tenantId, t.channelType, t.externalUserId),
      (0, pg_core_1.index)("channel_connections_tenant_type_status_idx").on(
        t.tenantId,
        t.channelType,
        t.status
      ),
      (0, pg_core_1.index)("channel_connections_tenant_user_idx").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.check)(
        "channel_connections_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_73 ||
            (templateObject_73 = __makeTemplateObject(
              [
                "\"channelType\" IN ('telegram','whatsapp','line','slack','discord')",
              ],
              [
                "\"channelType\" IN ('telegram','whatsapp','line','slack','discord')",
              ]
            ))
        )
      ),
      (0, pg_core_1.check)(
        "channel_connections_status_check",
        (0, drizzle_orm_1.sql)(
          templateObject_74 ||
            (templateObject_74 = __makeTemplateObject(
              ["\"status\" IN ('active','revoked','pending','blocked')"],
              ["\"status\" IN ('active','revoked','pending','blocked')"]
            ))
        )
      ),
    ];
  }
);
/**
 * Channel Credentials -- Admin-configured per-tenant channel secrets
 * (bot tokens, API keys, webhook secrets). Encrypted via crypto.ts.
 */
exports.channelCredentials = (0, pg_core_1.pgTable)(
  "channel_credentials",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_75 ||
            (templateObject_75 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    channelType: (0, pg_core_1.text)("channelType").notNull(),
    credentialsEncrypted: (0, pg_core_1.text)("credentialsEncrypted").notNull(),
    webhookUrl: (0, pg_core_1.text)("webhookUrl"),
    webhookSecretEncrypted: (0, pg_core_1.text)("webhookSecretEncrypted"),
    isActive: (0, pg_core_1.boolean)("isActive").default(true),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("channel_credentials_tenant_type_unique").on(
        t.tenantId,
        t.channelType
      ),
      (0, pg_core_1.check)(
        "channel_credentials_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_76 ||
            (templateObject_76 = __makeTemplateObject(
              [
                "\"channelType\" IN ('telegram','whatsapp','line','slack','discord')",
              ],
              [
                "\"channelType\" IN ('telegram','whatsapp','line','slack','discord')",
              ]
            ))
        )
      ),
    ];
  }
);
// ==========================================
// ClawFeature: Chat Widget & Artifacts
// ==========================================
/**
 * Chat Widgets -- Embeddable chat widget configurations per tenant.
 */
exports.chatWidgets = (0, pg_core_1.pgTable)(
  "chat_widgets",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_77 ||
            (templateObject_77 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.text)("name").notNull(),
    targetType: (0, pg_core_1.text)("targetType"),
    targetAgencyId: (0, pg_core_1.varchar)("targetAgencyId", {
      length: 36,
    }).references(
      function () {
        return exports.agencies.id;
      },
      { onDelete: "set null" }
    ),
    defaultPersonaId: (0, pg_core_1.varchar)("defaultPersonaId", {
      length: 36,
    }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    theme: (0, pg_core_1.jsonb)("theme"),
    allowedOrigins: (0, pg_core_1.text)("allowedOrigins")
      .array()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_78 ||
            (templateObject_78 = __makeTemplateObject(["'{}'"], ["'{}'"]))
        )
      ),
    rateLimitPerMinute: (0, pg_core_1.integer)("rateLimitPerMinute").default(
      10
    ),
    maxConversationLength: (0, pg_core_1.integer)(
      "maxConversationLength"
    ).default(100),
    requireEmail: (0, pg_core_1.boolean)("requireEmail").default(false),
    creditSource: (0, pg_core_1.text)("creditSource"),
    monthlyCreditBudget: (0, pg_core_1.integer)("monthlyCreditBudget"),
    maxCreditsPerVisitorSession: (0, pg_core_1.integer)(
      "maxCreditsPerVisitorSession"
    ).default(50),
    maxCreditsPerVisitorDay: (0, pg_core_1.integer)(
      "maxCreditsPerVisitorDay"
    ).default(100),
    isActive: (0, pg_core_1.boolean)("isActive").default(true),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("chat_widgets_tenant_active_idx").on(
        t.tenantId,
        t.isActive
      ),
      (0, pg_core_1.check)(
        "chat_widgets_target_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_79 ||
            (templateObject_79 = __makeTemplateObject(
              ["\"targetType\" IN ('chat','agency') OR \"targetType\" IS NULL"],
              ["\"targetType\" IN ('chat','agency') OR \"targetType\" IS NULL"]
            ))
        )
      ),
      (0, pg_core_1.check)(
        "chat_widgets_credit_source_check",
        (0, drizzle_orm_1.sql)(
          templateObject_80 ||
            (templateObject_80 = __makeTemplateObject(
              [
                "\"creditSource\" IN ('tenant','visitor') OR \"creditSource\" IS NULL",
              ],
              [
                "\"creditSource\" IN ('tenant','visitor') OR \"creditSource\" IS NULL",
              ]
            ))
        )
      ),
    ];
  }
);
/**
 * Conversation Artifacts -- Versioned AI-generated artifacts
 * (code, charts, tables, React components, HTML) stored per conversation.
 */
exports.conversationArtifacts = (0, pg_core_1.pgTable)(
  "conversation_artifacts",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_81 ||
            (templateObject_81 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    messageId: (0, pg_core_1.integer)("messageId")
      .notNull()
      .references(
        function () {
          return exports.messages.id;
        },
        { onDelete: "cascade" }
      ),
    artifactType: (0, pg_core_1.text)("artifactType").notNull(),
    title: (0, pg_core_1.text)("title"),
    content: (0, pg_core_1.text)("content").notNull(),
    language: (0, pg_core_1.text)("language"),
    version: (0, pg_core_1.integer)("version").default(1),
    parentArtifactId: (0, pg_core_1.varchar)("parentArtifactId", {
      length: 36,
    }).references(
      function () {
        return exports.conversationArtifacts.id;
      },
      { onDelete: "set null" }
    ),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("conversation_artifacts_conversation_idx").on(
        t.conversationId
      ),
      (0, pg_core_1.index)("conversation_artifacts_message_idx").on(
        t.messageId
      ),
      (0, pg_core_1.check)(
        "conversation_artifacts_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_82 ||
            (templateObject_82 = __makeTemplateObject(
              [
                "\"artifactType\" IN ('code','react','chart','table','mermaid','html','markdown','svg')",
              ],
              [
                "\"artifactType\" IN ('code','react','chart','table','mermaid','html','markdown','svg')",
              ]
            ))
        )
      ),
    ];
  }
);
// ==========================================
// ClawFeature: Webhooks & Routing
// ==========================================
/**
 * Webhook Triggers -- Inbound webhook endpoints for external integrations.
 * Auth secrets are AES-256-GCM encrypted via crypto.ts.
 */
exports.webhookTriggers = (0, pg_core_1.pgTable)(
  "webhook_triggers",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_83 ||
            (templateObject_83 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    authType: (0, pg_core_1.text)("authType").notNull().default("token"),
    authSecretEncrypted: (0, pg_core_1.text)("authSecretEncrypted").notNull(),
    targetType: (0, pg_core_1.text)("targetType").notNull(),
    targetConversationId: (0, pg_core_1.integer)(
      "targetConversationId"
    ).references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    targetAgencyId: (0, pg_core_1.varchar)("targetAgencyId", {
      length: 36,
    }).references(
      function () {
        return exports.agencies.id;
      },
      { onDelete: "set null" }
    ),
    targetWorkflowId: (0, pg_core_1.integer)("targetWorkflowId").references(
      function () {
        return exports.workflows.id;
      },
      { onDelete: "set null" }
    ),
    payloadTemplate: (0, pg_core_1.jsonb)("payloadTemplate").default({}),
    rateLimitPerMinute: (0, pg_core_1.integer)("rateLimitPerMinute").default(
      10
    ),
    monthlyTriggerBudget: (0, pg_core_1.integer)("monthlyTriggerBudget"),
    isActive: (0, pg_core_1.boolean)("isActive").default(true),
    totalTriggers: (0, pg_core_1.integer)("totalTriggers").default(0),
    lastTriggeredAt: (0, pg_core_1.timestamp)("lastTriggeredAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("webhook_triggers_tenant_active_idx").on(
        t.tenantId,
        t.isActive
      ),
      (0, pg_core_1.check)(
        "webhook_triggers_auth_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_84 ||
            (templateObject_84 = __makeTemplateObject(
              ["\"authType\" IN ('token','hmac_sha256')"],
              ["\"authType\" IN ('token','hmac_sha256')"]
            ))
        )
      ),
      (0, pg_core_1.check)(
        "webhook_triggers_target_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_85 ||
            (templateObject_85 = __makeTemplateObject(
              ["\"targetType\" IN ('chat','agency','workflow')"],
              ["\"targetType\" IN ('chat','agency','workflow')"]
            ))
        )
      ),
    ];
  }
);
/**
 * Webhook Trigger Logs -- Append-heavy log of webhook invocations.
 */
exports.webhookTriggerLogs = (0, pg_core_1.pgTable)(
  "webhook_trigger_logs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_86 ||
            (templateObject_86 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    triggerId: (0, pg_core_1.varchar)("triggerId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.webhookTriggers.id;
        },
        { onDelete: "cascade" }
      ),
    requestMethod: (0, pg_core_1.text)("requestMethod"),
    requestHeadersSafe: (0, pg_core_1.jsonb)("requestHeadersSafe"),
    requestBodyHash: (0, pg_core_1.varchar)("requestBodyHash", { length: 64 }),
    requestBodySize: (0, pg_core_1.integer)("requestBodySize"),
    extractedVariables: (0, pg_core_1.jsonb)("extractedVariables"),
    sourceIpMasked: (0, pg_core_1.text)("sourceIpMasked"),
    status: (0, pg_core_1.text)("status").notNull(),
    targetExecutionId: (0, pg_core_1.text)("targetExecutionId"),
    creditsConsumed: (0, pg_core_1.numeric)("creditsConsumed", {
      precision: 12,
      scale: 4,
    }).default("0"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    processingTimeMs: (0, pg_core_1.integer)("processingTimeMs"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("webhook_trigger_logs_trigger_created_idx").on(
        t.triggerId,
        t.createdAt
      ),
      (0, pg_core_1.check)(
        "webhook_trigger_logs_status_check",
        (0, drizzle_orm_1.sql)(
          templateObject_87 ||
            (templateObject_87 = __makeTemplateObject(
              [
                "\"status\" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient')",
              ],
              [
                "\"status\" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient')",
              ]
            ))
        )
      ),
    ];
  }
);
/**
 * Channel Routing Rules -- Priority-ordered rules for routing inbound
 * channel messages to agencies, conversations, or workflows.
 */
exports.channelRoutingRules = (0, pg_core_1.pgTable)(
  "channel_routing_rules",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_88 ||
            (templateObject_88 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    priority: (0, pg_core_1.integer)("priority").default(50),
    isActive: (0, pg_core_1.boolean)("isActive").default(true),
    conditions: (0, pg_core_1.jsonb)("conditions").notNull(),
    targetType: (0, pg_core_1.text)("targetType").notNull(),
    targetAgencyId: (0, pg_core_1.varchar)("targetAgencyId", {
      length: 36,
    }).references(
      function () {
        return exports.agencies.id;
      },
      { onDelete: "set null" }
    ),
    targetPersonaId: (0, pg_core_1.varchar)("targetPersonaId", {
      length: 36,
    }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    targetWorkflowId: (0, pg_core_1.integer)("targetWorkflowId").references(
      function () {
        return exports.workflows.id;
      },
      { onDelete: "set null" }
    ),
    totalMatches: (0, pg_core_1.integer)("totalMatches").default(0),
    lastMatchedAt: (0, pg_core_1.timestamp)("lastMatchedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)(
        "channel_routing_rules_tenant_active_priority_idx"
      ).on(t.tenantId, t.isActive, t.priority),
      (0, pg_core_1.check)(
        "channel_routing_rules_target_type_check",
        (0, drizzle_orm_1.sql)(
          templateObject_89 ||
            (templateObject_89 = __makeTemplateObject(
              ["\"targetType\" IN ('agency','chat','workflow')"],
              ["\"targetType\" IN ('agency','chat','workflow')"]
            ))
        )
      ),
    ];
  }
);
// ── Automation Copilot ────────────────────────────────────────────────
exports.automationTemplates = (0, pg_core_1.pgTable)(
  "automation_templates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_90 ||
            (templateObject_90 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    intent: (0, pg_core_1.jsonb)("intent").notNull(),
    scripts: (0, pg_core_1.jsonb)("scripts").notNull(),
    thumbnailUrl: (0, pg_core_1.text)("thumbnail_url"),
    isPublic: (0, pg_core_1.boolean)("is_public").default(false).notNull(),
    usageCount: (0, pg_core_1.integer)("usage_count").default(0).notNull(),
    lastUsedAt: (0, pg_core_1.timestamp)("last_used_at", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("automation_templates_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("automation_templates_public_usage_idx").on(
        t.isPublic,
        t.usageCount
      ),
    ];
  }
);
// ── Task Execution Intelligence (Spec 037 §03) ────────────────────────
exports.taskRunStatusEnum = (0, pg_core_1.pgEnum)("task_run_status", [
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
exports.stepAttemptStatusEnum = (0, pg_core_1.pgEnum)("step_attempt_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
exports.taskRuns = (0, pg_core_1.pgTable)(
  "task_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      }
    ),
    taskType: (0, pg_core_1.varchar)("taskType", { length: 32 }).notNull(),
    sourceType: (0, pg_core_1.varchar)("sourceType", { length: 32 }).notNull(),
    status: (0, exports.taskRunStatusEnum)("status")
      .notNull()
      .default("planned"),
    /** Immutable plan JSON — frozen at creation, never modified */
    planJson: (0, pg_core_1.jsonb)("planJson").notNull(),
    skillSlug: (0, pg_core_1.varchar)("skillSlug", { length: 100 }),
    conversationId: (0, pg_core_1.integer)("conversationId"),
    totalCreditsUsed: (0, pg_core_1.integer)("totalCreditsUsed").default(0),
    /** Artifact routing metadata */
    artifactIntent: (0, pg_core_1.varchar)("artifactIntent", { length: 32 }),
    executionRoute: (0, pg_core_1.varchar)("executionRoute", { length: 32 }),
    routeReason: (0, pg_core_1.text)("routeReason"),
    /** Trace ID for correlation with provider_usage_log */
    traceId: (0, pg_core_1.varchar)("traceId", { length: 64 }),
    /** Linked artifact references */
    presentationDeckId: (0, pg_core_1.integer)("presentationDeckId"),
    artifactMessageId: (0, pg_core_1.integer)("artifactMessageId"),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("task_runs_user_idx").on(t.userId),
      (0, pg_core_1.index)("task_runs_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("task_runs_status_idx").on(t.status),
      (0, pg_core_1.index)("task_runs_created_idx").on(t.createdAt),
    ];
  }
);
exports.taskStepAttempts = (0, pg_core_1.pgTable)(
  "task_step_attempts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    taskRunId: (0, pg_core_1.integer)("taskRunId")
      .notNull()
      .references(
        function () {
          return exports.taskRuns.id;
        },
        { onDelete: "cascade" }
      ),
    attemptIndex: (0, pg_core_1.integer)("attemptIndex").notNull().default(0),
    /** Resolved model snapshot — frozen at attempt start */
    resolvedModelSnapshot: (0, pg_core_1.jsonb)("resolvedModelSnapshot"),
    effectiveModel: (0, pg_core_1.varchar)("effectiveModel", { length: 128 }),
    provider: (0, pg_core_1.varchar)("provider", { length: 128 }),
    strategy: (0, pg_core_1.varchar)("strategy", { length: 32 }),
    inputTokens: (0, pg_core_1.integer)("inputTokens").default(0),
    outputTokens: (0, pg_core_1.integer)("outputTokens").default(0),
    creditsUsed: (0, pg_core_1.integer)("creditsUsed").default(0),
    costUsd: (0, pg_core_1.numeric)("costUsd", {
      precision: 12,
      scale: 8,
    }).default("0"),
    durationMs: (0, pg_core_1.integer)("durationMs"),
    status: (0, exports.stepAttemptStatusEnum)("status")
      .notNull()
      .default("pending"),
    fallbackReason: (0, pg_core_1.text)("fallbackReason"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("task_step_attempts_run_idx").on(t.taskRunId),
      (0, pg_core_1.index)("task_step_attempts_model_idx").on(t.effectiveModel),
    ];
  }
);
// ── Spec 038: Content Artifacts (Citation-Gated Quality) ──────────────
exports.contentArtifactStatusEnum = (0, pg_core_1.pgEnum)(
  "content_artifact_status",
  ["active", "stale", "archived"]
);
exports.contentArtifacts = (0, pg_core_1.pgTable)(
  "content_artifacts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.text)("tenantId").notNull(),
    userId: (0, pg_core_1.integer)("userId").notNull(),
    skillSlug: (0, pg_core_1.text)("skillSlug").notNull(),
    outputFormat: (0, pg_core_1.text)("outputFormat").notNull(),
    contentJson: (0, pg_core_1.jsonb)("contentJson"),
    qualityScore: (0, pg_core_1.jsonb)("qualityScore"),
    lastVerifiedAt: (0, pg_core_1.timestamp)("lastVerifiedAt", {
      withTimezone: true,
    }),
    refreshCadenceDays: (0, pg_core_1.integer)("refreshCadenceDays").default(
      30
    ),
    nextRefreshAt: (0, pg_core_1.timestamp)("nextRefreshAt", {
      withTimezone: true,
    }),
    status: (0, exports.contentArtifactStatusEnum)("status")
      .notNull()
      .default("active"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("content_artifacts_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("content_artifacts_status_idx").on(t.status),
      (0, pg_core_1.index)("content_artifacts_next_refresh_idx").on(
        t.nextRefreshAt
      ),
    ];
  }
);
// ============================================================
// Spec 035: Content Automation Engine — Level 3 Schema (Phase 2 forward-design)
// Tables created in Phase 1 for schema readiness; not yet referenced
// by application code. Will be activated in Phase 2.
// ============================================================
exports.contentSpecStatusEnum = (0, pg_core_1.pgEnum)("content_spec_status", [
  "active",
  "paused",
  "archived",
]);
exports.contentAutomationRunStatusEnum = (0, pg_core_1.pgEnum)(
  "content_automation_run_status",
  ["pending", "running", "completed", "failed", "export_failed"]
);
/**
 * Content Specs — Level 3 Content Automation Engine definitions.
 * One row per user-defined automation spec (recurring or one-time).
 */
exports.contentSpecs = (0, pg_core_1.pgTable)(
  "content_specs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("user_id")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    specData: (0, pg_core_1.jsonb)("spec_data").$type().notNull().default({}),
    status: (0, exports.contentSpecStatusEnum)("status")
      .notNull()
      .default("active"),
    version: (0, pg_core_1.integer)("version").notNull().default(1),
    nextRun: (0, pg_core_1.timestamp)("next_run", { withTimezone: true }),
    lastRun: (0, pg_core_1.timestamp)("last_run", { withTimezone: true }),
    totalRuns: (0, pg_core_1.integer)("total_runs").notNull().default(0),
    totalItemsCreated: (0, pg_core_1.integer)("total_items_created")
      .notNull()
      .default(0),
    consecutiveFailures: (0, pg_core_1.integer)("consecutive_failures")
      .notNull()
      .default(0),
    webhookSecretEncrypted: (0, pg_core_1.text)("webhook_secret_encrypted"),
    dailyCreditLimit: (0, pg_core_1.integer)("daily_credit_limit"),
    monthlyCreditLimit: (0, pg_core_1.integer)("monthly_credit_limit"),
    creditsUsedToday: (0, pg_core_1.integer)("credits_used_today")
      .notNull()
      .default(0),
    creditsUsedMonth: (0, pg_core_1.integer)("credits_used_month")
      .notNull()
      .default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("content_specs_status_next_run_idx").on(
        t.status,
        t.nextRun
      ),
      (0, pg_core_1.index)("content_specs_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("content_specs_user_idx").on(t.userId),
    ];
  }
);
/**
 * Content Automation Runs — execution history for each fired content spec.
 */
exports.contentAutomationRuns = (0, pg_core_1.pgTable)(
  "content_automation_runs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    specId: (0, pg_core_1.integer)("spec_id")
      .notNull()
      .references(
        function () {
          return exports.contentSpecs.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenant_id", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    scheduleItemIndex: (0, pg_core_1.integer)("schedule_item_index")
      .notNull()
      .default(0),
    status: (0, exports.contentAutomationRunStatusEnum)("status")
      .notNull()
      .default("pending"),
    topicsResolved: (0, pg_core_1.jsonb)("topics_resolved").$type().default([]),
    itemsRequested: (0, pg_core_1.integer)("items_requested")
      .notNull()
      .default(0),
    itemsCompleted: (0, pg_core_1.integer)("items_completed")
      .notNull()
      .default(0),
    itemsFailed: (0, pg_core_1.integer)("items_failed").notNull().default(0),
    outputArtifacts: (0, pg_core_1.jsonb)("output_artifacts")
      .$type()
      .default([]),
    exportUrls: (0, pg_core_1.jsonb)("export_urls").$type().default([]),
    itemErrors: (0, pg_core_1.jsonb)("item_errors").$type().default([]),
    creditsUsed: (0, pg_core_1.numeric)("credits_used", {
      precision: 10,
      scale: 4,
    }).default("0"),
    startedAt: (0, pg_core_1.timestamp)("started_at", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completed_at", {
      withTimezone: true,
    }),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("content_automation_runs_spec_created_idx").on(
        t.specId,
        t.createdAt
      ),
      (0, pg_core_1.index)("content_automation_runs_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("content_automation_runs_created_at_idx").on(
        t.createdAt
      ),
      (0, pg_core_1.index)("content_automation_runs_status_idx").on(t.status),
    ];
  }
);
/**
 * Auto Draft Schedules — recurring or one-time auto-draft schedules managed by the Content Automation Engine.
 */
exports.autoDraftSchedules = (0, pg_core_1.pgTable)(
  "auto_draft_schedules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 128 }).notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      )
      .notNull(),
    topicTemplate: (0, pg_core_1.text)("topicTemplate").notNull(),
    scheduleType: (0, pg_core_1.varchar)("scheduleType", {
      length: 20,
    }).notNull(),
    cronExpression: (0, pg_core_1.varchar)("cronExpression", { length: 100 }),
    runAt: (0, pg_core_1.timestamp)("runAt", { withTimezone: true }),
    timezone: (0, pg_core_1.varchar)("timezone", { length: 64 })
      .default("UTC")
      .notNull(),
    draftParams: (0, pg_core_1.jsonb)("draftParams").$type().notNull(),
    notifyEmail: (0, pg_core_1.boolean)("notifyEmail").default(true).notNull(),
    notifyWebhookUrl: (0, pg_core_1.text)("notifyWebhookUrl"),
    webhookSecretEncrypted: (0, pg_core_1.text)("webhookSecretEncrypted"),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .default("active")
      .notNull(),
    nextRun: (0, pg_core_1.timestamp)("nextRun", { withTimezone: true }),
    lastRun: (0, pg_core_1.timestamp)("lastRun", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (table) {
    return [
      (0, pg_core_1.index)("auto_draft_schedules_status_next_run_idx").on(
        table.status,
        table.nextRun
      ),
      (0, pg_core_1.index)("auto_draft_schedules_tenant_idx").on(
        table.tenantId
      ),
      (0, pg_core_1.index)("auto_draft_schedules_user_idx").on(table.userId),
    ];
  }
);
// ─── Public API Tables (Feature 043) ────────────────────────────────────────
/**
 * API Keys — central registry for public API authentication.
 * Keys use sk-ssp_ prefix and HMAC-SHA256 hashing with server pepper.
 */
exports.apiKeys = (0, pg_core_1.pgTable)(
  "api_keys",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.tenants.id;
      }),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    keyPrefix: (0, pg_core_1.varchar)("keyPrefix", { length: 16 }).notNull(),
    keyHash: (0, pg_core_1.varchar)("keyHash", { length: 128 }).notNull(),
    scopes: (0, pg_core_1.json)("scopes").$type().notNull(),
    rateLimit: (0, pg_core_1.integer)("rateLimit").default(60).notNull(),
    creditLimit: (0, pg_core_1.integer)("creditLimit"),
    // Request-count quotas per time window (null = unlimited)
    quotaHourly: (0, pg_core_1.integer)("quotaHourly"),
    quotaDaily: (0, pg_core_1.integer)("quotaDaily"),
    quotaWeekly: (0, pg_core_1.integer)("quotaWeekly"),
    quotaMonthly: (0, pg_core_1.integer)("quotaMonthly"),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    lastUsedAt: (0, pg_core_1.timestamp)("lastUsedAt", { withTimezone: true }),
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    // Admin-managed temporary suspension (separate from permanent revocation)
    isSuspended: (0, pg_core_1.boolean)("isSuspended").default(false).notNull(),
    suspendedReason: (0, pg_core_1.varchar)("suspendedReason", { length: 500 }),
    suspendedAt: (0, pg_core_1.timestamp)("suspendedAt", {
      withTimezone: true,
    }),
    suspendedBy: (0, pg_core_1.integer)("suspendedBy").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("api_keys_key_hash_idx").on(t.keyHash),
      (0, pg_core_1.index)("api_keys_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("api_keys_user_idx").on(t.userId),
    ];
  }
);
/**
 * Public API Audit Log — log table for all API key requests.
 * Separate from apiAuditEvents (media/skill/LLM structured logging).
 * No foreign keys — should not cascade when keys are revoked.
 * 90-day retention enforced by cleanup job.
 */
exports.publicApiAuditLog = (0, pg_core_1.pgTable)(
  "public_api_audit_log",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    userId: (0, pg_core_1.integer)("userId").notNull(),
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }),
    traceId: (0, pg_core_1.varchar)("traceId", { length: 36 }),
    method: (0, pg_core_1.varchar)("method", { length: 10 }).notNull(),
    path: (0, pg_core_1.varchar)("path", { length: 255 }).notNull(),
    statusCode: (0, pg_core_1.integer)("statusCode"),
    creditsUsed: (0, pg_core_1.integer)("creditsUsed").default(0),
    latencyMs: (0, pg_core_1.integer)("latencyMs"),
    ip: (0, pg_core_1.varchar)("ip", { length: 45 }),
    userAgent: (0, pg_core_1.text)("userAgent"),
    requestMeta: (0, pg_core_1.json)("requestMeta").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("public_api_audit_log_tenant_created_idx").on(
        t.tenantId,
        t.createdAt
      ),
      (0, pg_core_1.index)("public_api_audit_log_api_key_idx").on(t.apiKeyId),
      (0, pg_core_1.index)("public_api_audit_log_trace_idx").on(t.traceId),
    ];
  }
);
/**
 * API Webhook Endpoints — outbound webhook registrations.
 */
exports.apiWebhookEndpoints = (0, pg_core_1.pgTable)(
  "api_webhook_endpoints",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.tenants.id;
      }),
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }).references(
      function () {
        return exports.apiKeys.id;
      },
      { onDelete: "set null" }
    ),
    url: (0, pg_core_1.varchar)("url", { length: 2048 }).notNull(),
    secretEncrypted: (0, pg_core_1.text)("secretEncrypted").notNull(),
    events: (0, pg_core_1.json)("events").$type().notNull(),
    retryPolicy: (0, pg_core_1.varchar)("retryPolicy", { length: 20 })
      .default("exponential")
      .notNull(),
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    lastDeliveredAt: (0, pg_core_1.timestamp)("lastDeliveredAt", {
      withTimezone: true,
    }),
    failureCount: (0, pg_core_1.integer)("failureCount").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("api_webhook_endpoints_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("api_webhook_endpoints_api_key_idx").on(t.apiKeyId),
    ];
  }
);
/**
 * API Webhook Deliveries — delivery log with retry tracking.
 */
exports.apiWebhookDeliveries = (0, pg_core_1.pgTable)(
  "api_webhook_deliveries",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    webhookEndpointId: (0, pg_core_1.varchar)("webhookEndpointId", {
      length: 36,
    })
      .notNull()
      .references(
        function () {
          return exports.apiWebhookEndpoints.id;
        },
        { onDelete: "cascade" }
      ),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 50 }).notNull(),
    payload: (0, pg_core_1.json)("payload").$type().notNull(),
    statusCode: (0, pg_core_1.integer)("statusCode"),
    attempt: (0, pg_core_1.integer)("attempt").default(1).notNull(),
    deliveredAt: (0, pg_core_1.timestamp)("deliveredAt", {
      withTimezone: true,
    }),
    error: (0, pg_core_1.text)("error"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
/**
 * Automation Jobs — async job queue records for the Job Automation API.
 */
exports.automationJobs = (0, pg_core_1.pgTable)(
  "automation_jobs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.tenants.id;
      }),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    apiKeyId: (0, pg_core_1.varchar)("apiKeyId", { length: 36 }).notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 50 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .default("pending")
      .notNull(),
    params: (0, pg_core_1.json)("params").$type(),
    result: (0, pg_core_1.json)("result").$type(),
    error: (0, pg_core_1.json)("error").$type(),
    progress: (0, pg_core_1.integer)("progress").default(0).notNull(),
    creditsReserved: (0, pg_core_1.integer)("creditsReserved")
      .default(0)
      .notNull(),
    creditsUsed: (0, pg_core_1.integer)("creditsUsed").default(0).notNull(),
    callbackUrl: (0, pg_core_1.varchar)("callbackUrl", { length: 2048 }),
    callbackSecretEncrypted: (0, pg_core_1.text)("callbackSecretEncrypted"),
    parentJobId: (0, pg_core_1.varchar)("parentJobId", { length: 36 }),
    stepIndex: (0, pg_core_1.integer)("stepIndex"),
    traceId: (0, pg_core_1.varchar)("traceId", { length: 36 }),
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 64 }),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("automation_jobs_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("automation_jobs_api_key_idx").on(t.apiKeyId),
      (0, pg_core_1.uniqueIndex)("automation_jobs_idempotency_idx").on(
        t.tenantId,
        t.idempotencyKey
      ),
      (0, pg_core_1.index)("automation_jobs_parent_idx").on(t.parentJobId),
    ];
  }
);
// =============================================================================
// Feature 044: Multimodal Chat Memory
// =============================================================================
/**
 * pgvector custom column type for 768-dimension embeddings (Gemini text-embedding-004).
 */
var vector = (0, pg_core_1.customType)({
  dataType: function () {
    return "vector(768)";
  },
  toDriver: function (value) {
    return "[".concat(value.join(","), "]");
  },
  fromDriver: function (value) {
    return typeof value === "string" ? JSON.parse(value) : value;
  },
});
/**
 * media_assets — canonical registry for all uploaded images (and other media) tied to chat messages.
 */
exports.mediaAssets = (0, pg_core_1.pgTable)(
  "media_assets",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("projectId", { length: 100 }),
    conversationId: (0, pg_core_1.integer)("conversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    messageId: (0, pg_core_1.integer)("messageId").references(
      function () {
        return exports.messages.id;
      },
      { onDelete: "set null" }
    ),
    sourceType: (0, pg_core_1.varchar)("sourceType", { length: 32 }).default(
      "chat_attachment"
    ),
    status: (0, pg_core_1.varchar)("status", { length: 32 }).default("pending"),
    storageKey: (0, pg_core_1.text)("storageKey").notNull(),
    originalUrl: (0, pg_core_1.text)("originalUrl"),
    thumbnailUrl: (0, pg_core_1.text)("thumbnailUrl"),
    mimeType: (0, pg_core_1.varchar)("mimeType", { length: 100 }).notNull(),
    width: (0, pg_core_1.integer)("width"),
    height: (0, pg_core_1.integer)("height"),
    fileSize: (0, pg_core_1.bigint)("fileSize", { mode: "number" }),
    checksumSha256: (0, pg_core_1.varchar)("checksumSha256", { length: 64 }),
    perceptualHash: (0, pg_core_1.varchar)("perceptualHash", { length: 128 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", {
      withTimezone: true,
    }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", {
      withTimezone: true,
    }).defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("media_assets_user_idx").on(t.userId),
      (0, pg_core_1.index)("media_assets_conversation_idx").on(
        t.conversationId
      ),
      (0, pg_core_1.index)("media_assets_tenant_project_idx").on(
        t.tenantId,
        t.projectId
      ),
      (0, pg_core_1.index)("media_assets_tenant_user_idx").on(
        t.tenantId,
        t.userId
      ),
      (0, pg_core_1.index)("media_assets_checksum_idx").on(t.checksumSha256),
    ];
  }
);
/**
 * media_asset_analysis — vision enrichment results from Gemini Flash structured output.
 */
exports.mediaAssetAnalysis = (0, pg_core_1.pgTable)(
  "media_asset_analysis",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    mediaAssetId: (0, pg_core_1.bigint)("mediaAssetId", { mode: "number" })
      .notNull()
      .references(
        function () {
          return exports.mediaAssets.id;
        },
        { onDelete: "cascade" }
      ),
    provider: (0, pg_core_1.varchar)("provider", { length: 64 }),
    model: (0, pg_core_1.varchar)("model", { length: 128 }),
    shortCaption: (0, pg_core_1.text)("shortCaption"),
    detailedCaption: (0, pg_core_1.text)("detailedCaption"),
    ocrText: (0, pg_core_1.text)("ocrText"),
    objects: (0, pg_core_1.jsonb)("objects"),
    styles: (0, pg_core_1.jsonb)("styles"),
    materials: (0, pg_core_1.jsonb)("materials"),
    colors: (0, pg_core_1.jsonb)("colors"),
    rooms: (0, pg_core_1.jsonb)("rooms"),
    architectureTags: (0, pg_core_1.jsonb)("architectureTags"),
    aestheticScore: (0, pg_core_1.numeric)("aestheticScore", {
      precision: 4,
      scale: 3,
    }),
    safetyLabels: (0, pg_core_1.jsonb)("safetyLabels"),
    extractedJson: (0, pg_core_1.jsonb)("extractedJson"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", {
      withTimezone: true,
    }).defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("media_asset_analysis_asset_idx").on(t.mediaAssetId),
    ];
  }
);
/**
 * multimodal_memory_items — retrievable memory entries bridging images and text.
 */
exports.multimodalMemoryItems = (0, pg_core_1.pgTable)(
  "multimodal_memory_items",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.varchar)("projectId", { length: 100 }),
    conversationId: (0, pg_core_1.integer)("conversationId").references(
      function () {
        return exports.conversations.id;
      },
      { onDelete: "set null" }
    ),
    messageId: (0, pg_core_1.integer)("messageId"),
    mediaAssetId: (0, pg_core_1.bigint)("mediaAssetId", {
      mode: "number",
    }).references(
      function () {
        return exports.mediaAssets.id;
      },
      { onDelete: "cascade" }
    ),
    memoryKind: (0, pg_core_1.varchar)("memoryKind", { length: 32 }),
    title: (0, pg_core_1.text)("title"),
    summary: (0, pg_core_1.text)("summary"),
    searchableText: (0, pg_core_1.text)("searchableText").notNull(),
    sourceRole: (0, pg_core_1.varchar)("sourceRole", { length: 16 }),
    salience: (0, pg_core_1.numeric)("salience").default("0.500"),
    confidence: (0, pg_core_1.numeric)("confidence").default("0.800"),
    lastAccessedAt: (0, pg_core_1.timestamp)("lastAccessedAt", {
      withTimezone: true,
    }),
    accessCount: (0, pg_core_1.integer)("accessCount").default(0),
    createdAt: (0, pg_core_1.timestamp)("createdAt", {
      withTimezone: true,
    }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", {
      withTimezone: true,
    }).defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("multimodal_memory_items_user_project_idx").on(
        t.userId,
        t.projectId
      ),
      (0, pg_core_1.index)("multimodal_memory_items_conversation_idx").on(
        t.conversationId
      ),
      (0, pg_core_1.index)("multimodal_memory_items_asset_idx").on(
        t.mediaAssetId
      ),
    ];
  }
);
/**
 * multimodal_memory_vectors — pgvector embeddings for multimodal retrieval.
 * HNSW index on embedding: CREATE INDEX CONCURRENTLY after backfill
 * CREATE INDEX multimodal_memory_vectors_embedding_idx
 *   ON multimodal_memory_vectors USING hnsw (embedding vector_cosine_ops)
 *   WITH (m = 16, ef_construction = 128);
 */
exports.multimodalMemoryVectors = (0, pg_core_1.pgTable)(
  "multimodal_memory_vectors",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    memoryItemId: (0, pg_core_1.bigint)("memoryItemId", { mode: "number" })
      .notNull()
      .references(
        function () {
          return exports.multimodalMemoryItems.id;
        },
        { onDelete: "cascade" }
      ),
    provider: (0, pg_core_1.varchar)("provider", { length: 64 }).notNull(),
    model: (0, pg_core_1.varchar)("model", { length: 128 }),
    modality: (0, pg_core_1.varchar)("modality", { length: 16 }),
    embedding: vector("embedding").notNull(),
    embeddingVersion: (0, pg_core_1.varchar)("embeddingVersion", {
      length: 32,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", {
      withTimezone: true,
    }).defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("multimodal_memory_vectors_item_idx").on(
        t.memoryItemId
      ),
    ];
  }
);
/**
 * conversation_visual_state — per-conversation working set tracking which images are active/recent.
 */
exports.conversationVisualState = (0, pg_core_1.pgTable)(
  "conversation_visual_state",
  {
    conversationId: (0, pg_core_1.integer)("conversationId")
      .primaryKey()
      .references(
        function () {
          return exports.conversations.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    recentAssetIds: (0, pg_core_1.jsonb)("recentAssetIds").default([]),
    activeAssetIds: (0, pg_core_1.jsonb)("activeAssetIds").default([]),
    comparedAssetIds: (0, pg_core_1.jsonb)("comparedAssetIds").default([]),
    namedSets: (0, pg_core_1.jsonb)("namedSets").default({}),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", {
      withTimezone: true,
    }).defaultNow(),
  }
);
/**
 * multimodal_memory_links — directed relationships between memory items.
 */
exports.multimodalMemoryLinks = (0, pg_core_1.pgTable)(
  "multimodal_memory_links",
  {
    id: (0, pg_core_1.bigserial)("id", { mode: "number" }).primaryKey(),
    fromMemoryItemId: (0, pg_core_1.bigint)("fromMemoryItemId", {
      mode: "number",
    })
      .notNull()
      .references(
        function () {
          return exports.multimodalMemoryItems.id;
        },
        { onDelete: "cascade" }
      ),
    toMemoryItemId: (0, pg_core_1.bigint)("toMemoryItemId", { mode: "number" })
      .notNull()
      .references(
        function () {
          return exports.multimodalMemoryItems.id;
        },
        { onDelete: "cascade" }
      ),
    relationType: (0, pg_core_1.varchar)("relationType", { length: 32 }),
    weight: (0, pg_core_1.numeric)("weight").default("1.000"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", {
      withTimezone: true,
    }).defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("multimodal_memory_links_from_idx").on(
        t.fromMemoryItemId
      ),
      (0, pg_core_1.index)("multimodal_memory_links_to_idx").on(
        t.toMemoryItemId
      ),
      (0, pg_core_1.uniqueIndex)("multimodal_memory_links_unique_idx").on(
        t.fromMemoryItemId,
        t.toMemoryItemId,
        t.relationType
      ),
    ];
  }
);
// ==========================================
// Virtual AI Office Orchestrator — Core Identity
// ==========================================
exports.orchestratorViewModeEnum = (0, pg_core_1.pgEnum)(
  "orchestrator_view_mode",
  ["transparent", "milestone", "summary"]
);
exports.orchestratorAutonomyLevelEnum = (0, pg_core_1.pgEnum)(
  "orchestrator_autonomy_level",
  ["manual", "guided", "autonomous"]
);
exports.assistantTeamStatusEnum = (0, pg_core_1.pgEnum)(
  "assistant_team_status",
  ["active", "archived", "draft"]
);
exports.modelSelectionPolicyEnum = (0, pg_core_1.pgEnum)(
  "model_selection_policy",
  ["fixed", "cost_optimized", "quality_optimized", "auto"]
);
/**
 * user_orchestrator_profiles — per-user orchestration preferences.
 * One row per user storing view mode, autonomy level, and approval policies.
 */
exports.userOrchestratorProfiles = (0, pg_core_1.pgTable)(
  "user_orchestrator_profiles",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_91 ||
            (templateObject_91 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    defaultPersonaId: (0, pg_core_1.varchar)("defaultPersonaId", {
      length: 36,
    }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    orchestratorDisplayName: (0, pg_core_1.varchar)("orchestratorDisplayName", {
      length: 255,
    }),
    preferredViewMode: (0, exports.orchestratorViewModeEnum)(
      "preferredViewMode"
    ).default("transparent"),
    preferredAutonomyLevel: (0, exports.orchestratorAutonomyLevelEnum)(
      "preferredAutonomyLevel"
    ).default("guided"),
    preferredSummaryStyle: (0, pg_core_1.varchar)("preferredSummaryStyle", {
      length: 50,
    }),
    defaultApprovalPolicy: (0, pg_core_1.jsonb)("defaultApprovalPolicy"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("user_orchestrator_profiles_user_idx").on(
        t.userId
      ),
    ];
  }
);
/**
 * assistant_teams — product-facing team definition.
 * Each team wraps exactly one agency and provides orchestration-level config.
 */
exports.assistantTeams = (0, pg_core_1.pgTable)(
  "assistant_teams",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_92 ||
            (templateObject_92 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    ownerUserId: (0, pg_core_1.integer)("ownerUserId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    agencyId: (0, pg_core_1.varchar)("agencyId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.agencies.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    category: (0, pg_core_1.varchar)("category", { length: 100 }),
    teamPersonaOverlay: (0, pg_core_1.jsonb)("teamPersonaOverlay"),
    defaultViewMode: (0, exports.orchestratorViewModeEnum)(
      "defaultViewMode"
    ).default("transparent"),
    defaultSummaryMode: (0, pg_core_1.varchar)("defaultSummaryMode", {
      length: 50,
    }),
    defaultAutonomyLevel: (0, exports.orchestratorAutonomyLevelEnum)(
      "defaultAutonomyLevel"
    ).default("guided"),
    defaultModelId: (0, pg_core_1.varchar)("defaultModelId", { length: 100 }),
    modelBudgetPolicy: (0, pg_core_1.jsonb)("modelBudgetPolicy"),
    memoryPolicyJson: (0, pg_core_1.jsonb)("memoryPolicyJson"),
    artifactPolicyJson: (0, pg_core_1.jsonb)("artifactPolicyJson"),
    status: (0, exports.assistantTeamStatusEnum)("status").default("draft"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("assistant_teams_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("assistant_teams_owner_idx").on(t.ownerUserId),
      (0, pg_core_1.index)("assistant_teams_agency_idx").on(t.agencyId),
    ];
  }
);
exports.teamMemberKindEnum = (0, pg_core_1.pgEnum)("team_member_kind", [
  "assistant",
  "human",
  "external_connector",
]);
exports.teamMemberRoleEnum = (0, pg_core_1.pgEnum)("team_member_role", [
  "orchestrator",
  "researcher",
  "reviewer",
  "publisher",
  "specialist",
]);
exports.workerRuntimeTypeEnum = (0, pg_core_1.pgEnum)("worker_runtime_type", [
  "openclaw_gateway",
  "desktop_zeroclaw_managed",
  "nemoclaw_sandbox",
  "hiclaw_cluster",
  "hermes_agent_gateway",
]);
exports.workerStatusEnum = (0, pg_core_1.pgEnum)("worker_status", [
  "online",
  "offline",
  "unhealthy",
  "disabled",
  "draining",
]);
exports.workerJobStatusEnum = (0, pg_core_1.pgEnum)("worker_job_status", [
  "queued",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "completed",
  "failed",
  "canceled",
  "expired",
]);
exports.workerModeEnum = (0, pg_core_1.pgEnum)("worker_mode", [
  "per_user",
  "shared_department",
  "dedicated_gpu",
  "external_runtime",
]);
exports.workerRuntimeModeEnum = (0, pg_core_1.pgEnum)("worker_runtime_mode", [
  "native_constrained",
  "wsl2_managed",
  "docker_isolated",
  "external_managed",
]);
exports.workerFileScopeModeEnum = (0, pg_core_1.pgEnum)(
  "worker_file_scope_mode",
  ["workspace_scoped", "team_drive", "full_machine"]
);
exports.workerResourceProfileEnum = (0, pg_core_1.pgEnum)(
  "worker_resource_profile",
  [
    "cpu_light",
    "cpu_heavy",
    "gpu_required",
    "large_disk_temp",
    "network_heavy",
    "long_running",
    "sandbox_required",
    "human_observable",
  ]
);
exports.workerPolicies = (0, pg_core_1.pgTable)(
  "worker_policies",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_93 ||
            (templateObject_93 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    rulesJson: (0, pg_core_1.jsonb)("rulesJson").$type().notNull().default({}),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("worker_policies_tenant_name_unique").on(
        t.tenantId,
        t.name
      ),
      (0, pg_core_1.index)("worker_policies_runtime_type_idx").on(
        t.tenantId,
        t.runtimeType
      ),
    ];
  }
);
exports.runtimeProfiles = (0, pg_core_1.pgTable)(
  "runtime_profiles",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_94 ||
            (templateObject_94 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    profileJson: (0, pg_core_1.jsonb)("profileJson")
      .$type()
      .notNull()
      .default({}),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "runtime_profiles_runtime_type_name_unique"
      ).on(t.runtimeType, t.name),
    ];
  }
);
exports.workers = (0, pg_core_1.pgTable)(
  "workers",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_95 ||
            (templateObject_95 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }).references(
      function () {
        return exports.assistantTeams.id;
      },
      { onDelete: "set null" }
    ),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    workerMode: (0, exports.workerModeEnum)("workerMode")
      .notNull()
      .default("external_runtime"),
    machineId: (0, pg_core_1.varchar)("machineId", { length: 255 }),
    machineName: (0, pg_core_1.varchar)("machineName", { length: 255 }),
    displayName: (0, pg_core_1.varchar)("displayName", {
      length: 255,
    }).notNull(),
    status: (0, exports.workerStatusEnum)("status")
      .notNull()
      .default("offline"),
    runtimeVersion: (0, pg_core_1.varchar)("runtimeVersion", {
      length: 100,
    }).notNull(),
    runtimeMode: (0, exports.workerRuntimeModeEnum)("runtimeMode")
      .notNull()
      .default("external_managed"),
    runtimeProfileId: (0, pg_core_1.varchar)("runtimeProfileId", {
      length: 36,
    }).references(
      function () {
        return exports.runtimeProfiles.id;
      },
      { onDelete: "set null" }
    ),
    policyProfileId: (0, pg_core_1.varchar)("policyProfileId", {
      length: 36,
    }).references(
      function () {
        return exports.workerPolicies.id;
      },
      { onDelete: "set null" }
    ),
    externalReference: (0, pg_core_1.varchar)("externalReference", {
      length: 255,
    }).notNull(),
    dashboardUrl: (0, pg_core_1.text)("dashboardUrl"),
    capabilitiesJson: (0, pg_core_1.jsonb)("capabilitiesJson")
      .$type()
      .notNull()
      .default({}),
    hardwareJson: (0, pg_core_1.jsonb)("hardwareJson")
      .$type()
      .notNull()
      .default({}),
    healthSummaryJson: (0, pg_core_1.jsonb)("healthSummaryJson")
      .$type()
      .notNull()
      .default({}),
    warningFlagsJson: (0, pg_core_1.jsonb)("warningFlagsJson")
      .$type()
      .notNull()
      .default([]),
    fileScopeMode: (0, exports.workerFileScopeModeEnum)("fileScopeMode")
      .notNull()
      .default("workspace_scoped"),
    lastSeenAt: (0, pg_core_1.timestamp)("lastSeenAt", { withTimezone: true }),
    registeredByUserId: (0, pg_core_1.integer)("registeredByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("workers_tenant_external_reference_unique").on(
        t.tenantId,
        t.externalReference
      ),
      (0, pg_core_1.index)("workers_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("workers_runtime_type_status_idx").on(
        t.runtimeType,
        t.status
      ),
      (0, pg_core_1.index)("workers_team_status_idx").on(t.teamId, t.status),
    ];
  }
);
exports.workerHeartbeats = (0, pg_core_1.pgTable)(
  "worker_heartbeats",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_96 ||
            (templateObject_96 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    workerId: (0, pg_core_1.varchar)("workerId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workers.id;
        },
        { onDelete: "cascade" }
      ),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    status: (0, exports.workerStatusEnum)("status").notNull(),
    metricsJson: (0, pg_core_1.jsonb)("metricsJson")
      .$type()
      .notNull()
      .default({}),
    warningsJson: (0, pg_core_1.jsonb)("warningsJson")
      .$type()
      .notNull()
      .default([]),
    currentJobCount: (0, pg_core_1.integer)("currentJobCount")
      .notNull()
      .default(0),
    queueDepth: (0, pg_core_1.integer)("queueDepth").notNull().default(0),
    freeDiskBytes: (0, pg_core_1.bigint)("freeDiskBytes", { mode: "number" }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("worker_heartbeats_worker_created_idx").on(
        t.workerId,
        t.createdAt
      ),
      (0, pg_core_1.index)("worker_heartbeats_status_created_idx").on(
        t.status,
        t.createdAt
      ),
    ];
  }
);
exports.workerJobs = (0, pg_core_1.pgTable)(
  "worker_jobs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_97 ||
            (templateObject_97 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }).references(
      function () {
        return exports.assistantTeams.id;
      },
      { onDelete: "set null" }
    ),
    workerId: (0, pg_core_1.varchar)("workerId", { length: 36 }).references(
      function () {
        return exports.workers.id;
      },
      { onDelete: "set null" }
    ),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    workflowRunId: (0, pg_core_1.varchar)("workflowRunId", { length: 36 }),
    requestedByUserId: (0, pg_core_1.integer)("requestedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    requestedByPersonaId: (0, pg_core_1.varchar)("requestedByPersonaId", {
      length: 36,
    }),
    requestedBySystemComponent: (0, pg_core_1.varchar)(
      "requestedBySystemComponent",
      { length: 100 }
    ),
    jobType: (0, pg_core_1.varchar)("jobType", { length: 100 }).notNull(),
    status: (0, exports.workerJobStatusEnum)("status")
      .notNull()
      .default("queued"),
    statusReason: (0, pg_core_1.text)("statusReason"),
    priority: (0, pg_core_1.integer)("priority").notNull().default(0),
    resourceProfile: (0, exports.workerResourceProfileEnum)("resourceProfile")
      .notNull()
      .default("cpu_light"),
    capabilityRequirementsJson: (0, pg_core_1.jsonb)(
      "capabilityRequirementsJson"
    )
      .$type()
      .notNull()
      .default({}),
    inputJson: (0, pg_core_1.jsonb)("inputJson").$type().notNull().default({}),
    instructionsJson: (0, pg_core_1.jsonb)("instructionsJson")
      .$type()
      .notNull()
      .default({}),
    outputJson: (0, pg_core_1.jsonb)("outputJson").$type(),
    failureReason: (0, pg_core_1.text)("failureReason"),
    timeoutSeconds: (0, pg_core_1.integer)("timeoutSeconds")
      .notNull()
      .default(3600),
    retryPolicyJson: (0, pg_core_1.jsonb)("retryPolicyJson")
      .$type()
      .notNull()
      .default({}),
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 128 }),
    leaseOwnerToken: (0, pg_core_1.varchar)("leaseOwnerToken", { length: 128 }),
    leaseExpiresAt: (0, pg_core_1.timestamp)("leaseExpiresAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    finishedAt: (0, pg_core_1.timestamp)("finishedAt", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "worker_jobs_tenant_idempotency_key_unique"
      ).on(t.tenantId, t.idempotencyKey),
      (0, pg_core_1.index)("worker_jobs_tenant_status_priority_idx").on(
        t.tenantId,
        t.status,
        t.priority
      ),
      (0, pg_core_1.index)("worker_jobs_worker_status_idx").on(
        t.workerId,
        t.status
      ),
      (0, pg_core_1.index)("worker_jobs_lease_expires_idx").on(
        t.leaseExpiresAt
      ),
    ];
  }
);
exports.workerJobEvents = (0, pg_core_1.pgTable)(
  "worker_job_events",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_98 ||
            (templateObject_98 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    workerJobId: (0, pg_core_1.varchar)("workerJobId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workerJobs.id;
        },
        { onDelete: "cascade" }
      ),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 100 }).notNull(),
    payloadJson: (0, pg_core_1.jsonb)("payloadJson")
      .$type()
      .notNull()
      .default({}),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("worker_job_events_job_created_idx").on(
        t.workerJobId,
        t.createdAt
      ),
      (0, pg_core_1.index)("worker_job_events_type_created_idx").on(
        t.eventType,
        t.createdAt
      ),
    ];
  }
);
exports.workerArtifacts = (0, pg_core_1.pgTable)(
  "worker_artifacts",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_99 ||
            (templateObject_99 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    workerJobId: (0, pg_core_1.varchar)("workerJobId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workerJobs.id;
        },
        { onDelete: "cascade" }
      ),
    artifactType: (0, pg_core_1.varchar)("artifactType", {
      length: 100,
    }).notNull(),
    storageRef: (0, pg_core_1.varchar)("storageRef", { length: 512 }).notNull(),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson")
      .$type()
      .notNull()
      .default({}),
    publishedItemId: (0, pg_core_1.integer)("publishedItemId").references(
      function () {
        return exports.libraryItems.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("worker_artifacts_job_storage_ref_unique").on(
        t.workerJobId,
        t.storageRef
      ),
      (0, pg_core_1.index)("worker_artifacts_job_type_idx").on(
        t.workerJobId,
        t.artifactType
      ),
      (0, pg_core_1.index)("worker_artifacts_published_item_idx").on(
        t.publishedItemId
      ),
    ];
  }
);
exports.workerDelegatedSessions = (0, pg_core_1.pgTable)(
  "worker_delegated_sessions",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_100 ||
            (templateObject_100 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }).references(
      function () {
        return exports.assistantTeams.id;
      },
      { onDelete: "set null" }
    ),
    workerId: (0, pg_core_1.varchar)("workerId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workers.id;
        },
        { onDelete: "cascade" }
      ),
    workerJobId: (0, pg_core_1.varchar)("workerJobId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workerJobs.id;
        },
        { onDelete: "cascade" }
      ),
    actingUserId: (0, pg_core_1.integer)("actingUserId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    ownerUserId: (0, pg_core_1.integer)("ownerUserId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    runtimeType: (0, exports.workerRuntimeTypeEnum)("runtimeType").notNull(),
    scopeProfile: (0, pg_core_1.varchar)("scopeProfile", {
      length: 100,
    }).notNull(),
    grantedScopesJson: (0, pg_core_1.jsonb)("grantedScopesJson")
      .$type()
      .notNull()
      .default([]),
    manifestJson: (0, pg_core_1.jsonb)("manifestJson")
      .$type()
      .notNull()
      .default({}),
    leaseOwnerToken: (0, pg_core_1.varchar)("leaseOwnerToken", {
      length: 128,
    }).notNull(),
    tokenJti: (0, pg_core_1.varchar)("tokenJti", { length: 128 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
    revokedAt: (0, pg_core_1.timestamp)("revokedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)(
        "worker_delegated_sessions_token_jti_unique"
      ).on(t.tokenJti),
      (0, pg_core_1.index)("worker_delegated_sessions_job_idx").on(
        t.workerJobId,
        t.expiresAt
      ),
      (0, pg_core_1.index)("worker_delegated_sessions_worker_idx").on(
        t.workerId,
        t.expiresAt
      ),
      (0, pg_core_1.index)("worker_delegated_sessions_owner_idx").on(
        t.ownerUserId,
        t.expiresAt
      ),
    ];
  }
);
exports.workerJobGrants = (0, pg_core_1.pgTable)(
  "worker_job_grants",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_101 ||
            (templateObject_101 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    workerJobId: (0, pg_core_1.varchar)("workerJobId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workerJobs.id;
        },
        { onDelete: "cascade" }
      ),
    delegatedSessionId: (0, pg_core_1.varchar)("delegatedSessionId", {
      length: 36,
    }).references(
      function () {
        return exports.workerDelegatedSessions.id;
      },
      { onDelete: "cascade" }
    ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    grantType: (0, pg_core_1.varchar)("grantType", { length: 64 }).notNull(),
    resourceId: (0, pg_core_1.varchar)("resourceId", { length: 255 }),
    resourceScopeJson: (0, pg_core_1.jsonb)("resourceScopeJson")
      .$type()
      .notNull()
      .default({}),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("worker_job_grants_job_type_idx").on(
        t.workerJobId,
        t.grantType
      ),
      (0, pg_core_1.index)("worker_job_grants_session_type_idx").on(
        t.delegatedSessionId,
        t.grantType
      ),
      (0, pg_core_1.index)("worker_job_grants_resource_idx").on(
        t.grantType,
        t.resourceId
      ),
    ];
  }
);
/**
 * assistant_profiles — per-member assistant identity.
 * Wraps one agency_agent + one persona_template, providing orchestration persona.
 *
 * NOTE: The partial unique index for isLead (one lead per team) must be applied
 * via raw SQL migration since Drizzle doesn't support partial unique indexes.
 */
exports.assistantProfiles = (0, pg_core_1.pgTable)(
  "assistant_profiles",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_102 ||
            (templateObject_102 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.assistantTeams.id;
        },
        { onDelete: "cascade" }
      ),
    memberKind: (0, exports.teamMemberKindEnum)("memberKind")
      .notNull()
      .default("assistant"),
    agencyAgentId: (0, pg_core_1.varchar)("agencyAgentId", {
      length: 36,
    }).references(
      function () {
        return exports.agencyAgents.id;
      },
      { onDelete: "cascade" }
    ),
    personaId: (0, pg_core_1.varchar)("personaId", { length: 36 }).references(
      function () {
        return exports.personaTemplates.id;
      },
      { onDelete: "set null" }
    ),
    humanUserId: (0, pg_core_1.integer)("humanUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    externalRef: (0, pg_core_1.varchar)("externalRef", { length: 255 }),
    externalWorkerId: (0, pg_core_1.varchar)("externalWorkerId", {
      length: 36,
    }).references(
      function () {
        return exports.workers.id;
      },
      { onDelete: "set null" }
    ),
    externalConfigJson: (0, pg_core_1.jsonb)("externalConfigJson"),
    displayName: (0, pg_core_1.varchar)("displayName", { length: 255 }),
    nickname: (0, pg_core_1.varchar)("nickname", { length: 100 }),
    roleTitle: (0, pg_core_1.varchar)("roleTitle", { length: 100 }),
    memberRole: (0, exports.teamMemberRoleEnum)("memberRole")
      .default("specialist")
      .notNull(),
    genderStyle: (0, pg_core_1.varchar)("genderStyle", { length: 20 }),
    specialtyTags: (0, pg_core_1.text)("specialtyTags").array(),
    preferredModelId: (0, pg_core_1.varchar)("preferredModelId", {
      length: 100,
    }),
    modelSelectionPolicy: (0, exports.modelSelectionPolicyEnum)(
      "modelSelectionPolicy"
    ).default("auto"),
    toolPolicyJson: (0, pg_core_1.jsonb)("toolPolicyJson"),
    approvalPolicyJson: (0, pg_core_1.jsonb)("approvalPolicyJson"),
    memoryPolicyJson: (0, pg_core_1.jsonb)("memoryPolicyJson"),
    visibilityPolicyJson: (0, pg_core_1.jsonb)("visibilityPolicyJson"),
    preferredLanguage: (0, pg_core_1.varchar)("preferredLanguage", {
      length: 10,
    }),
    sortOrder: (0, pg_core_1.integer)("sortOrder").default(0).notNull(),
    isLead: (0, pg_core_1.boolean)("isLead").default(false).notNull(),
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("assistant_profiles_team_idx").on(t.teamId),
      (0, pg_core_1.index)("assistant_profiles_agent_idx").on(t.agencyAgentId),
      (0, pg_core_1.index)("assistant_profiles_persona_idx").on(t.personaId),
      (0, pg_core_1.index)("assistant_profiles_member_kind_idx").on(
        t.teamId,
        t.memberKind
      ),
      (0, pg_core_1.index)("assistant_profiles_member_role_idx").on(
        t.teamId,
        t.memberRole
      ),
      (0, pg_core_1.index)("assistant_profiles_human_user_idx").on(
        t.humanUserId
      ),
      (0, pg_core_1.index)("assistant_profiles_external_worker_idx").on(
        t.externalWorkerId
      ),
    ];
  }
);
/**
 * assistant_team_templates — reusable team presets.
 * tenantId=null + isSystem=true means platform-wide template.
 */
exports.assistantTeamTemplates = (0, pg_core_1.pgTable)(
  "assistant_team_templates",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_103 ||
            (templateObject_103 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    category: (0, pg_core_1.varchar)("category", { length: 100 }),
    teamConfigJson: (0, pg_core_1.jsonb)("teamConfigJson"),
    memberTemplateJson: (0, pg_core_1.jsonb)("memberTemplateJson"),
    defaultDiscussionMode: (0, pg_core_1.varchar)("defaultDiscussionMode", {
      length: 50,
    }),
    isSystem: (0, pg_core_1.boolean)("isSystem").default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("assistant_team_templates_tenant_idx").on(
        t.tenantId
      ),
    ];
  }
);
// ─── Virtual Admin (System Guardian) ────────────────────────────────────────
exports.incidentSeverityEnum = (0, pg_core_1.pgEnum)("incident_severity", [
  "info",
  "warning",
  "error",
  "critical",
]);
exports.incidentStatusEnum = (0, pg_core_1.pgEnum)("incident_status", [
  "open",
  "acknowledged",
  "resolved",
  "expired",
]);
exports.approvalStatusEnum = (0, pg_core_1.pgEnum)("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
  "execution_failed",
]);
exports.ticketTypeEnum = (0, pg_core_1.pgEnum)("ticket_type", [
  "bug",
  "feature_request",
  "observation",
  "question",
]);
exports.ticketStatusEnum = (0, pg_core_1.pgEnum)("ticket_status", [
  "new",
  "triaged",
  "in_progress",
  "deferred",
  "resolved",
  "duplicate",
  "closed",
]);
exports.ticketResolutionEnum = (0, pg_core_1.pgEnum)("ticket_resolution", [
  "fixed",
  "wont_fix",
  "duplicate",
  "cannot_reproduce",
  "planned",
  "by_design",
]);
exports.virtualAdminIncidents = (0, pg_core_1.pgTable)(
  "virtual_admin_incidents",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      }
    ),
    sensorId: (0, pg_core_1.varchar)("sensorId", { length: 64 }).notNull(),
    ruleId: (0, pg_core_1.varchar)("ruleId", { length: 64 }).notNull(),
    severity: (0, exports.incidentSeverityEnum)("severity").notNull(),
    status: (0, exports.incidentStatusEnum)("status").default("open").notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    message: (0, pg_core_1.text)("message"),
    metricsJson: (0, pg_core_1.json)("metricsJson"),
    actionTaken: (0, pg_core_1.varchar)("actionTaken", { length: 64 }),
    actionResult: (0, pg_core_1.text)("actionResult"),
    resolvedBy: (0, pg_core_1.integer)("resolvedBy").references(function () {
      return exports.users.id;
    }),
    resolvedAt: (0, pg_core_1.timestamp)("resolvedAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("va_incidents_tenant_idx").on(t.tenantId),
      (0, pg_core_1.index)("va_incidents_status_idx").on(t.status),
      (0, pg_core_1.index)("va_incidents_severity_idx").on(t.severity),
      (0, pg_core_1.index)("va_incidents_sensor_idx").on(t.sensorId),
    ];
  }
);
exports.virtualAdminApprovals = (0, pg_core_1.pgTable)(
  "virtual_admin_approvals",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    incidentId: (0, pg_core_1.integer)("incidentId")
      .notNull()
      .references(function () {
        return exports.virtualAdminIncidents.id;
      }),
    actionType: (0, pg_core_1.varchar)("actionType", { length: 64 }).notNull(),
    actionParamsJson: (0, pg_core_1.json)("actionParamsJson"),
    status: (0, exports.approvalStatusEnum)("status")
      .default("pending")
      .notNull(),
    requestedAt: (0, pg_core_1.timestamp)("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: (0, pg_core_1.timestamp)("decidedAt", { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", {
      withTimezone: true,
    }).notNull(),
    decidedBy: (0, pg_core_1.integer)("decidedBy").references(function () {
      return exports.users.id;
    }),
    decisionComment: (0, pg_core_1.text)("decisionComment"),
  }
);
exports.virtualAdminSensorConfig = (0, pg_core_1.pgTable)(
  "virtual_admin_sensor_config",
  {
    id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.tenants.id;
      }),
    sensorId: (0, pg_core_1.varchar)("sensorId", { length: 64 }).notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").default(true).notNull(),
    intervalMs: (0, pg_core_1.integer)("intervalMs"),
    thresholdsJson: (0, pg_core_1.json)("thresholdsJson"),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
exports.feedbackTickets = (0, pg_core_1.pgTable)(
  "feedback_tickets",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      }
    ),
    submittedBy: (0, pg_core_1.integer)("submittedBy").references(function () {
      return exports.users.id;
    }),
    submittedByType: (0, pg_core_1.varchar)("submittedByType", {
      length: 16,
    }).notNull(),
    ticketType: (0, exports.ticketTypeEnum)("ticketType").notNull(),
    priority: (0, exports.reminderPriorityEnum)("priority")
      .default("normal")
      .notNull(),
    severity: (0, pg_core_1.varchar)("severity", { length: 16 }),
    category: (0, pg_core_1.varchar)("category", { length: 64 }),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    stepsToReproduce: (0, pg_core_1.text)("stepsToReproduce"),
    expectedBehavior: (0, pg_core_1.text)("expectedBehavior"),
    actualBehavior: (0, pg_core_1.text)("actualBehavior"),
    contextJson: (0, pg_core_1.json)("contextJson"),
    autoCategory: (0, pg_core_1.varchar)("autoCategory", { length: 64 }),
    autoPriority: (0, pg_core_1.varchar)("autoPriority", { length: 16 }),
    autoSummary: (0, pg_core_1.text)("autoSummary"),
    duplicateOf: (0, pg_core_1.integer)("duplicateOf").references(function () {
      return exports.feedbackTickets.id;
    }),
    relatedIncidentId: (0, pg_core_1.integer)("relatedIncidentId").references(
      function () {
        return exports.virtualAdminIncidents.id;
      }
    ),
    status: (0, exports.ticketStatusEnum)("status").default("new").notNull(),
    assignedTo: (0, pg_core_1.integer)("assignedTo").references(function () {
      return exports.users.id;
    }),
    adminResponse: (0, pg_core_1.text)("adminResponse"),
    resolutionNotes: (0, pg_core_1.text)("resolutionNotes"),
    resolutionType: (0, exports.ticketResolutionEnum)("resolutionType"),
    plannedVersion: (0, pg_core_1.varchar)("plannedVersion", { length: 32 }),
    planningDocUrl: (0, pg_core_1.varchar)("planningDocUrl", { length: 500 }),
    devBranch: (0, pg_core_1.varchar)("devBranch", { length: 100 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    triagedAt: (0, pg_core_1.timestamp)("triagedAt", { withTimezone: true }),
    respondedAt: (0, pg_core_1.timestamp)("respondedAt", {
      withTimezone: true,
    }),
    resolvedAt: (0, pg_core_1.timestamp)("resolvedAt", { withTimezone: true }),
    closedAt: (0, pg_core_1.timestamp)("closedAt", { withTimezone: true }),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("ft_tenant_status_idx").on(t.tenantId, t.status),
      (0, pg_core_1.index)("ft_submitted_by_idx").on(t.submittedBy),
    ];
  }
);
exports.feedbackTicketComments = (0, pg_core_1.pgTable)(
  "feedback_ticket_comments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    ticketId: (0, pg_core_1.integer)("ticketId")
      .notNull()
      .references(
        function () {
          return exports.feedbackTickets.id;
        },
        { onDelete: "cascade" }
      ),
    authorId: (0, pg_core_1.integer)("authorId").references(function () {
      return exports.users.id;
    }),
    authorType: (0, pg_core_1.varchar)("authorType", { length: 16 }).notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    isInternal: (0, pg_core_1.boolean)("isInternal").default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
exports.feedbackTicketAttachments = (0, pg_core_1.pgTable)(
  "feedback_ticket_attachments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    ticketId: (0, pg_core_1.integer)("ticketId")
      .notNull()
      .references(
        function () {
          return exports.feedbackTickets.id;
        },
        { onDelete: "cascade" }
      ),
    fileName: (0, pg_core_1.varchar)("fileName", { length: 255 }).notNull(),
    fileUrl: (0, pg_core_1.varchar)("fileUrl", { length: 500 }).notNull(),
    fileSize: (0, pg_core_1.integer)("fileSize"),
    mimeType: (0, pg_core_1.varchar)("mimeType", { length: 100 }),
    uploadedBy: (0, pg_core_1.integer)("uploadedBy").references(function () {
      return exports.users.id;
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
// ==========================================
// Virtual AI Office Orchestrator — Rooms, Runs, Monitoring (Section 02)
// ==========================================
exports.teamRoomTypeEnum = (0, pg_core_1.pgEnum)("team_room_type", [
  "direct",
  "team",
  "auto_team",
  "job_review",
]);
exports.teamRoomStatusEnum = (0, pg_core_1.pgEnum)("team_room_status", [
  "active",
  "archived",
  "paused",
]);
exports.roomParticipantTypeEnum = (0, pg_core_1.pgEnum)(
  "room_participant_type",
  ["user", "assistant", "observer"]
);
exports.roomMessageSenderTypeEnum = (0, pg_core_1.pgEnum)(
  "room_message_sender_type",
  ["user", "assistant", "system"]
);
exports.roomMessageRecipientTypeEnum = (0, pg_core_1.pgEnum)(
  "room_message_recipient_type",
  ["all", "assistant", "subgroup", "user"]
);
exports.roomMessageTurnTypeEnum = (0, pg_core_1.pgEnum)(
  "room_message_turn_type",
  ["discussion", "handoff", "review", "decision", "execution_update", "summary"]
);
exports.roomMessageVisibilityEnum = (0, pg_core_1.pgEnum)(
  "room_message_visibility",
  ["transparent", "milestone", "summary_only", "private_internal"]
);
exports.teamRunStatusEnum = (0, pg_core_1.pgEnum)("team_run_status", [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "stopped",
]);
exports.teamRunExecutionModeEnum = (0, pg_core_1.pgEnum)(
  "team_run_execution_mode",
  ["team_chat", "auto_team", "review"]
);
exports.workItemStatusEnum = (0, pg_core_1.pgEnum)("work_item_status", [
  "planned",
  "in_progress",
  "in_review",
  "needs_revision",
  "awaiting_approval",
  "completed",
  "failed",
  "blocked",
  "cancelled",
  "superseded",
]);
exports.workItemPriorityEnum = (0, pg_core_1.pgEnum)("work_item_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
exports.workItemRiskClassEnum = (0, pg_core_1.pgEnum)("work_item_risk_class", [
  "low",
  "medium",
  "high",
  "critical",
]);
exports.workItemApprovalStateEnum = (0, pg_core_1.pgEnum)(
  "work_item_approval_state",
  ["not_required", "pending", "approved", "rejected"]
);
exports.workOsStateEnum = (0, pg_core_1.pgEnum)("work_os_state", [
  "new",
  "triaged",
  "planned",
  "in_progress",
  "waiting_for_approval",
  "waiting_for_input",
  "blocked",
  "escalated",
  "completed",
  "cancelled",
  "failed",
]);
exports.workOsAssignmentTypeEnum = (0, pg_core_1.pgEnum)(
  "work_os_assignment_type",
  ["human", "queue", "role", "hybrid"]
);
exports.workOsSlaBreachStateEnum = (0, pg_core_1.pgEnum)(
  "work_os_sla_breach_state",
  ["none", "at_risk", "breached", "resolved"]
);
exports.workOsApprovalStatusEnum = (0, pg_core_1.pgEnum)(
  "work_os_approval_status",
  ["pending", "approved", "rejected", "cancelled"]
);
exports.workOsExceptionStatusEnum = (0, pg_core_1.pgEnum)(
  "work_os_exception_status",
  ["open", "paused", "downgraded", "resolved"]
);
exports.agentEventCategoryEnum = (0, pg_core_1.pgEnum)("agent_event_category", [
  "status_change",
  "communication",
  "tool_use",
  "memory_op",
  "artifact_op",
  "handoff",
  "approval",
  "error",
]);
exports.notificationSeverityEnum = (0, pg_core_1.pgEnum)(
  "notification_severity",
  ["info", "warning", "error", "critical"]
);
/**
 * team_rooms — durable room abstraction for team conversations.
 */
exports.teamRooms = (0, pg_core_1.pgTable)(
  "team_rooms",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_104 ||
            (templateObject_104 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.assistantTeams.id;
        },
        { onDelete: "cascade" }
      ),
    orchestratorUserId: (0, pg_core_1.integer)("orchestratorUserId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    backingAgencyConversationId: (0, pg_core_1.varchar)(
      "backingAgencyConversationId",
      { length: 36 }
    ).references(
      function () {
        return exports.agencyConversations.id;
      },
      { onDelete: "set null" }
    ),
    roomType: (0, exports.teamRoomTypeEnum)("roomType").notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 255 }),
    goalPrompt: (0, pg_core_1.text)("goalPrompt"),
    language: (0, pg_core_1.text)("language").notNull().default("en"),
    projectId: (0, pg_core_1.integer)("projectId"),
    viewMode: (0, pg_core_1.varchar)("viewMode", { length: 30 }).default(
      "transparent"
    ),
    summaryMode: (0, pg_core_1.varchar)("summaryMode", { length: 30 }),
    autonomyLevel: (0, pg_core_1.varchar)("autonomyLevel", { length: 30 }),
    status: (0, exports.teamRoomStatusEnum)("status")
      .notNull()
      .default("active"),
    lastRunId: (0, pg_core_1.varchar)("lastRunId", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("team_rooms_tenant_team_idx").on(
        t.tenantId,
        t.teamId
      ),
      (0, pg_core_1.index)("team_rooms_orchestrator_idx").on(
        t.orchestratorUserId
      ),
    ];
  }
);
/**
 * team_room_participants — explicit participant roster per room.
 * Partial unique indexes prevent same user/assistant from joining twice.
 */
exports.teamRoomParticipants = (0, pg_core_1.pgTable)(
  "team_room_participants",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_105 ||
            (templateObject_105 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRooms.id;
        },
        { onDelete: "cascade" }
      ),
    participantType: (0, exports.roomParticipantTypeEnum)(
      "participantType"
    ).notNull(),
    participantUserId: (0, pg_core_1.integer)("participantUserId").references(
      function () {
        return exports.users.id;
      }
    ),
    participantAssistantId: (0, pg_core_1.varchar)("participantAssistantId", {
      length: 36,
    }).references(function () {
      return exports.assistantProfiles.id;
    }),
    participantLabel: (0, pg_core_1.varchar)("participantLabel", {
      length: 255,
    }),
    roleInRoom: (0, pg_core_1.varchar)("roleInRoom", { length: 100 }),
    isMuted: (0, pg_core_1.boolean)("isMuted").default(false).notNull(),
    canWriteSharedMemory: (0, pg_core_1.boolean)("canWriteSharedMemory")
      .default(true)
      .notNull(),
    lastViewedAt: (0, pg_core_1.timestamp)("lastViewedAt", {
      withTimezone: true,
    }),
    joinedAt: (0, pg_core_1.timestamp)("joinedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("team_room_participants_room_idx").on(t.roomId),
    ];
  }
);
/**
 * team_room_messages — multi-party message store.
 * senderAssistantId required when senderType=assistant (enforced at app level).
 */
exports.teamRoomMessages = (0, pg_core_1.pgTable)(
  "team_room_messages",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_106 ||
            (templateObject_106 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRooms.id;
        },
        { onDelete: "cascade" }
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }),
    senderType: (0, exports.roomMessageSenderTypeEnum)("senderType").notNull(),
    senderUserId: (0, pg_core_1.integer)("senderUserId").references(
      function () {
        return exports.users.id;
      }
    ),
    senderAssistantId: (0, pg_core_1.varchar)("senderAssistantId", {
      length: 36,
    }).references(function () {
      return exports.assistantProfiles.id;
    }),
    recipientType: (0, exports.roomMessageRecipientTypeEnum)("recipientType")
      .notNull()
      .default("all"),
    recipientAssistantId: (0, pg_core_1.varchar)("recipientAssistantId", {
      length: 36,
    }),
    recipientGroupJson: (0, pg_core_1.jsonb)("recipientGroupJson"),
    turnType: (0, exports.roomMessageTurnTypeEnum)("turnType")
      .notNull()
      .default("discussion"),
    visibility: (0, exports.roomMessageVisibilityEnum)("visibility")
      .notNull()
      .default("transparent"),
    content: (0, pg_core_1.text)("content").notNull(),
    summaryContent: (0, pg_core_1.text)("summaryContent"),
    artifactRefsJson: (0, pg_core_1.jsonb)("artifactRefsJson"),
    memoryRefsJson: (0, pg_core_1.jsonb)("memoryRefsJson"),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson").$type(),
    tokenUsageJson: (0, pg_core_1.jsonb)("tokenUsageJson").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("team_room_messages_room_created_idx").on(
        t.roomId,
        t.createdAt
      ),
      (0, pg_core_1.index)("team_room_messages_run_created_idx").on(
        t.runId,
        t.createdAt
      ),
    ];
  }
);
exports.teamRuns = (0, pg_core_1.pgTable)(
  "team_runs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_107 ||
            (templateObject_107 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRooms.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.assistantTeams.id;
      }),
    backingAgencyRunId: (0, pg_core_1.varchar)("backingAgencyRunId", {
      length: 36,
    }),
    initiatedByUserId: (0, pg_core_1.integer)("initiatedByUserId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    executionMode: (0, exports.teamRunExecutionModeEnum)(
      "executionMode"
    ).notNull(),
    objective: (0, pg_core_1.text)("objective"),
    constraintsJson: (0, pg_core_1.jsonb)("constraintsJson"),
    status: (0, exports.teamRunStatusEnum)("status")
      .notNull()
      .default("queued"),
    activeAssistantId: (0, pg_core_1.varchar)("activeAssistantId", {
      length: 36,
    }),
    stopPolicyJson: (0, pg_core_1.jsonb)("stopPolicyJson").$type(),
    approvalPolicyJson: (0, pg_core_1.jsonb)("approvalPolicyJson"),
    budgetSnapshotJson: (0, pg_core_1.jsonb)("budgetSnapshotJson").$type(),
    summaryArtifactId: (0, pg_core_1.varchar)("summaryArtifactId", {
      length: 36,
    }),
    stopReason: (0, pg_core_1.text)("stopReason"),
    startedAt: (0, pg_core_1.timestamp)("startedAt", { withTimezone: true }),
    endedAt: (0, pg_core_1.timestamp)("endedAt", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("team_runs_room_status_idx").on(t.roomId, t.status),
      (0, pg_core_1.index)("team_runs_team_status_idx").on(t.teamId, t.status),
      (0, pg_core_1.index)("team_runs_initiated_by_idx").on(
        t.initiatedByUserId
      ),
    ];
  }
);
/**
 * team_work_items — durable work objects for orchestrated routines and revisions.
 */
exports.teamWorkItems = (0, pg_core_1.pgTable)(
  "team_work_items",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_108 ||
            (templateObject_108 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.assistantTeams.id;
        },
        { onDelete: "cascade" }
      ),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRooms.id;
        },
        { onDelete: "cascade" }
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).references(
      function () {
        return exports.teamRuns.id;
      },
      { onDelete: "set null" }
    ),
    routineId: (0, pg_core_1.varchar)("routineId", { length: 36 }),
    sourceType: (0, pg_core_1.varchar)("sourceType", { length: 50 })
      .notNull()
      .default("manual"),
    sourceRef: (0, pg_core_1.varchar)("sourceRef", { length: 255 }),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    objective: (0, pg_core_1.text)("objective"),
    status: (0, exports.workItemStatusEnum)("status")
      .notNull()
      .default("planned"),
    revisionVersion: (0, pg_core_1.integer)("revisionVersion")
      .notNull()
      .default(1),
    threadRootMessageId: (0, pg_core_1.varchar)("threadRootMessageId", {
      length: 36,
    }),
    activeDraftArtifactId: (0, pg_core_1.varchar)("activeDraftArtifactId", {
      length: 36,
    }),
    priority: (0, exports.workItemPriorityEnum)("priority")
      .notNull()
      .default("normal"),
    riskClass: (0, exports.workItemRiskClassEnum)("riskClass")
      .notNull()
      .default("medium"),
    assignedMemberId: (0, pg_core_1.varchar)("assignedMemberId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    reviewerMemberId: (0, pg_core_1.varchar)("reviewerMemberId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    approverMemberId: (0, pg_core_1.varchar)("approverMemberId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    lockOwnerMemberId: (0, pg_core_1.varchar)("lockOwnerMemberId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    lockExpiresAt: (0, pg_core_1.timestamp)("lockExpiresAt", {
      withTimezone: true,
    }),
    parentWorkItemId: (0, pg_core_1.varchar)("parentWorkItemId", {
      length: 36,
    }),
    supersededByWorkItemId: (0, pg_core_1.varchar)("supersededByWorkItemId", {
      length: 36,
    }),
    artifactRefsJson: (0, pg_core_1.jsonb)("artifactRefsJson"),
    approvalState: (0, exports.workItemApprovalStateEnum)("approvalState")
      .notNull()
      .default("pending"),
    carryOverReason: (0, pg_core_1.text)("carryOverReason"),
    dueAt: (0, pg_core_1.timestamp)("dueAt", { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)("completedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("team_work_items_team_status_idx").on(
        t.teamId,
        t.status,
        t.updatedAt
      ),
      (0, pg_core_1.index)("team_work_items_room_created_idx").on(
        t.roomId,
        t.createdAt
      ),
      (0, pg_core_1.index)("team_work_items_parent_idx").on(t.parentWorkItemId),
      (0, pg_core_1.index)("team_work_items_assigned_status_idx").on(
        t.assignedMemberId,
        t.status
      ),
    ];
  }
);
/**
 * work_item_events — immutable audit trail for revisions, review, approval, and locking.
 */
exports.workItemEvents = (0, pg_core_1.pgTable)(
  "work_item_events",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_109 ||
            (templateObject_109 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    workItemId: (0, pg_core_1.varchar)("workItemId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamWorkItems.id;
        },
        { onDelete: "cascade" }
      ),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRooms.id;
        },
        { onDelete: "cascade" }
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).references(
      function () {
        return exports.teamRuns.id;
      },
      { onDelete: "set null" }
    ),
    actorAssistantId: (0, pg_core_1.varchar)("actorAssistantId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    actorUserId: (0, pg_core_1.integer)("actorUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 50 }).notNull(),
    fromStatus: (0, exports.workItemStatusEnum)("fromStatus"),
    toStatus: (0, exports.workItemStatusEnum)("toStatus"),
    revisionVersion: (0, pg_core_1.integer)("revisionVersion"),
    detailJson: (0, pg_core_1.jsonb)("detailJson"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_item_events_work_item_created_idx").on(
        t.workItemId,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_item_events_room_created_idx").on(
        t.roomId,
        t.createdAt
      ),
    ];
  }
);
/**
 * work_requests — initial intake records for business work.
 */
exports.workRequests = (0, pg_core_1.pgTable)(
  "work_requests",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_110 ||
            (templateObject_110 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.integer)("projectId"),
    sourceType: (0, pg_core_1.varchar)("sourceType", { length: 50 }).notNull(),
    sourceRef: (0, pg_core_1.varchar)("sourceRef", { length: 255 }),
    requesterType: (0, exports.workOsAssignmentTypeEnum)("requesterType")
      .notNull()
      .default("human"),
    requesterId: (0, pg_core_1.varchar)("requesterId", { length: 36 }),
    workType: (0, pg_core_1.varchar)("workType", { length: 100 }),
    businessDomain: (0, pg_core_1.varchar)("businessDomain", { length: 100 }),
    urgency: (0, pg_core_1.varchar)("urgency", { length: 30 })
      .notNull()
      .default("normal"),
    riskLevel: (0, pg_core_1.varchar)("riskLevel", { length: 30 })
      .notNull()
      .default("medium"),
    classificationConfidence: (0, pg_core_1.doublePrecision)(
      "classificationConfidence"
    ),
    defaultOwnerType: (0, exports.workOsAssignmentTypeEnum)("defaultOwnerType"),
    defaultOwnerId: (0, pg_core_1.varchar)("defaultOwnerId", { length: 36 }),
    defaultQueueId: (0, pg_core_1.varchar)("defaultQueueId", { length: 36 }),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    objective: (0, pg_core_1.text)("objective"),
    currentState: (0, exports.workOsStateEnum)("currentState")
      .notNull()
      .default("new"),
    linkedConversationIdsJson: (0, pg_core_1.jsonb)(
      "linkedConversationIdsJson"
    ).$type(),
    linkedWorkpackRunIdsJson: (0, pg_core_1.jsonb)(
      "linkedWorkpackRunIdsJson"
    ).$type(),
    linkedRoleRoutineRunIdsJson: (0, pg_core_1.jsonb)(
      "linkedRoleRoutineRunIdsJson"
    ).$type(),
    linkedCaseId: (0, pg_core_1.varchar)("linkedCaseId", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_requests_tenant_state_idx").on(
        t.tenantId,
        t.currentState,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_requests_tenant_source_idx").on(
        t.tenantId,
        t.sourceType,
        t.createdAt
      ),
    ];
  }
);
/**
 * work_cases — durable business context spanning one or more tasks or runs.
 */
exports.workCases = (0, pg_core_1.pgTable)(
  "work_cases",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_111 ||
            (templateObject_111 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    projectId: (0, pg_core_1.integer)("projectId"),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workRequests.id;
        },
        { onDelete: "cascade" }
      ),
    primaryTaskId: (0, pg_core_1.varchar)("primaryTaskId", {
      length: 36,
    }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    summary: (0, pg_core_1.text)("summary"),
    ownerType: (0, exports.workOsAssignmentTypeEnum)("ownerType"),
    ownerId: (0, pg_core_1.varchar)("ownerId", { length: 36 }),
    priority: (0, exports.workItemPriorityEnum)("priority")
      .notNull()
      .default("normal"),
    riskLevel: (0, pg_core_1.varchar)("riskLevel", { length: 30 })
      .notNull()
      .default("medium"),
    dataClassification: (0, pg_core_1.varchar)("dataClassification", {
      length: 30,
    })
      .notNull()
      .default("internal"),
    currentState: (0, exports.workOsStateEnum)("currentState")
      .notNull()
      .default("new"),
    linkedConversationIdsJson: (0, pg_core_1.jsonb)(
      "linkedConversationIdsJson"
    ).$type(),
    linkedWorkpackRunIdsJson: (0, pg_core_1.jsonb)(
      "linkedWorkpackRunIdsJson"
    ).$type(),
    linkedRoleRoutineRunIdsJson: (0, pg_core_1.jsonb)(
      "linkedRoleRoutineRunIdsJson"
    ).$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_cases_tenant_state_idx").on(
        t.tenantId,
        t.currentState,
        t.updatedAt
      ),
      (0, pg_core_1.index)("work_cases_request_idx").on(t.requestId),
      (0, pg_core_1.index)("work_cases_primary_task_idx").on(t.primaryTaskId),
    ];
  }
);
/**
 * work_assignments — immutable ownership history for work cases and tasks.
 */
exports.workAssignments = (0, pg_core_1.pgTable)(
  "work_assignments",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_112 ||
            (templateObject_112 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workCases.id;
        },
        { onDelete: "cascade" }
      ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    previousOwnerType: (0, exports.workOsAssignmentTypeEnum)(
      "previousOwnerType"
    ),
    previousOwnerId: (0, pg_core_1.varchar)("previousOwnerId", { length: 36 }),
    ownerType: (0, exports.workOsAssignmentTypeEnum)("ownerType").notNull(),
    ownerId: (0, pg_core_1.varchar)("ownerId", { length: 36 }),
    assignmentSource: (0, pg_core_1.varchar)("assignmentSource", { length: 50 })
      .notNull()
      .default("manual"),
    reason: (0, pg_core_1.text)("reason"),
    actorAssistantId: (0, pg_core_1.varchar)("actorAssistantId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    actorUserId: (0, pg_core_1.integer)("actorUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_assignments_case_created_idx").on(
        t.caseId,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_assignments_tenant_owner_idx").on(
        t.tenantId,
        t.ownerType,
        t.ownerId
      ),
      (0, pg_core_1.index)("work_assignments_task_idx").on(t.taskId),
    ];
  }
);
/**
 * work_approvals — work-scoped approval checkpoints.
 */
exports.workApprovals = (0, pg_core_1.pgTable)(
  "work_approvals",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_113 ||
            (templateObject_113 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workCases.id;
        },
        { onDelete: "cascade" }
      ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    approvalTransportId: (0, pg_core_1.varchar)("approvalTransportId", {
      length: 36,
    }),
    approvalStatus: (0, exports.workOsApprovalStatusEnum)("approvalStatus")
      .notNull()
      .default("pending"),
    approverType: (0, exports.workOsAssignmentTypeEnum)("approverType").default(
      "human"
    ),
    approverId: (0, pg_core_1.varchar)("approverId", { length: 36 }),
    comment: (0, pg_core_1.text)("comment"),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson"),
    requestedAt: (0, pg_core_1.timestamp)("requestedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: (0, pg_core_1.timestamp)("respondedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_approvals_case_status_idx").on(
        t.caseId,
        t.approvalStatus,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_approvals_task_idx").on(t.taskId),
    ];
  }
);
/**
 * work_exceptions — escalated policy, availability, or SLA tripwires.
 */
exports.workExceptions = (0, pg_core_1.pgTable)(
  "work_exceptions",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_114 ||
            (templateObject_114 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workCases.id;
        },
        { onDelete: "cascade" }
      ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    exceptionType: (0, pg_core_1.varchar)("exceptionType", {
      length: 100,
    }).notNull(),
    severity: (0, pg_core_1.varchar)("severity", { length: 30 })
      .notNull()
      .default("medium"),
    status: (0, exports.workOsExceptionStatusEnum)("status")
      .notNull()
      .default("open"),
    reason: (0, pg_core_1.text)("reason"),
    ownerType: (0, exports.workOsAssignmentTypeEnum)("ownerType"),
    ownerId: (0, pg_core_1.varchar)("ownerId", { length: 36 }),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: (0, pg_core_1.timestamp)("resolvedAt", { withTimezone: true }),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_exceptions_case_status_idx").on(
        t.caseId,
        t.status,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_exceptions_task_idx").on(t.taskId),
    ];
  }
);
/**
 * work_outcomes — explicit business results for completed work.
 */
exports.workOutcomes = (0, pg_core_1.pgTable)(
  "work_outcomes",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_115 ||
            (templateObject_115 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workCases.id;
        },
        { onDelete: "cascade" }
      ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    disposition: (0, pg_core_1.varchar)("disposition", {
      length: 100,
    }).notNull(),
    resolutionCode: (0, pg_core_1.varchar)("resolutionCode", { length: 100 }),
    customerImpact: (0, pg_core_1.varchar)("customerImpact", { length: 100 }),
    reviewerResult: (0, pg_core_1.varchar)("reviewerResult", { length: 100 }),
    followUpRequired: (0, pg_core_1.boolean)("followUpRequired")
      .default(false)
      .notNull(),
    summary: (0, pg_core_1.text)("summary"),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_outcomes_case_created_idx").on(
        t.caseId,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_outcomes_task_idx").on(t.taskId),
    ];
  }
);
/**
 * work_sla — explicit SLA envelope for routable work.
 */
exports.workSlas = (0, pg_core_1.pgTable)(
  "work_slas",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_116 ||
            (templateObject_116 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.workCases.id;
        },
        { onDelete: "cascade" }
      ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    policyId: (0, pg_core_1.varchar)("policyId", { length: 36 }),
    dueAt: (0, pg_core_1.timestamp)("dueAt", { withTimezone: true }),
    serviceWindowStartAt: (0, pg_core_1.timestamp)("serviceWindowStartAt", {
      withTimezone: true,
    }),
    serviceWindowEndAt: (0, pg_core_1.timestamp)("serviceWindowEndAt", {
      withTimezone: true,
    }),
    urgency: (0, pg_core_1.varchar)("urgency", { length: 30 })
      .notNull()
      .default("normal"),
    breachState: (0, exports.workOsSlaBreachStateEnum)("breachState")
      .notNull()
      .default("none"),
    breachedAt: (0, pg_core_1.timestamp)("breachedAt", { withTimezone: true }),
    escalatedAt: (0, pg_core_1.timestamp)("escalatedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_slas_case_due_idx").on(t.caseId, t.dueAt),
      (0, pg_core_1.index)("work_slas_task_idx").on(t.taskId),
    ];
  }
);
/**
 * work_os_events — append-only event log for request/case/task/approval/exception/outcome transitions.
 */
exports.workOsEvents = (0, pg_core_1.pgTable)(
  "work_os_events",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_117 ||
            (templateObject_117 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    requestId: (0, pg_core_1.varchar)("requestId", { length: 36 }).references(
      function () {
        return exports.workRequests.id;
      },
      { onDelete: "cascade" }
    ),
    caseId: (0, pg_core_1.varchar)("caseId", { length: 36 }).references(
      function () {
        return exports.workCases.id;
      },
      { onDelete: "cascade" }
    ),
    taskId: (0, pg_core_1.varchar)("taskId", { length: 36 }).references(
      function () {
        return exports.teamWorkItems.id;
      },
      { onDelete: "set null" }
    ),
    actorAssistantId: (0, pg_core_1.varchar)("actorAssistantId", {
      length: 36,
    }).references(
      function () {
        return exports.assistantProfiles.id;
      },
      { onDelete: "set null" }
    ),
    actorUserId: (0, pg_core_1.integer)("actorUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 100 }).notNull(),
    fromState: (0, exports.workOsStateEnum)("fromState"),
    toState: (0, exports.workOsStateEnum)("toState"),
    detailJson: (0, pg_core_1.jsonb)("detailJson"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("work_os_events_case_created_idx").on(
        t.caseId,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_os_events_request_created_idx").on(
        t.requestId,
        t.createdAt
      ),
      (0, pg_core_1.index)("work_os_events_task_created_idx").on(
        t.taskId,
        t.createdAt
      ),
    ];
  }
);
/**
 * agent_activity_events — append-only event log for monitoring.
 * No updatedAt by design. No FKs for write performance.
 */
exports.agentActivityEvents = (0, pg_core_1.pgTable)(
  "agent_activity_events",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_118 ||
            (templateObject_118 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }).notNull(),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 }).notNull(),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    assistantId: (0, pg_core_1.varchar)("assistantId", { length: 36 }),
    eventType: (0, pg_core_1.text)("eventType").notNull(),
    eventCategory: (0, exports.agentEventCategoryEnum)(
      "eventCategory"
    ).notNull(),
    visibility: (0, exports.roomMessageVisibilityEnum)("visibility")
      .notNull()
      .default("transparent"),
    summary: (0, pg_core_1.text)("summary"),
    detailJson: (0, pg_core_1.jsonb)("detailJson"),
    tokenUsageSnapshot: (0, pg_core_1.integer)("tokenUsageSnapshot"),
    costSnapshot: (0, pg_core_1.numeric)("costSnapshot", {
      precision: 12,
      scale: 4,
    }),
    durationMs: (0, pg_core_1.integer)("durationMs"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("agent_activity_events_run_created_idx").on(
        t.runId,
        t.createdAt
      ),
      (0, pg_core_1.index)("agent_activity_events_assistant_created_idx").on(
        t.assistantId,
        t.createdAt
      ),
    ];
  }
);
/**
 * agent_run_summaries — per-agent performance summary computed when a run completes.
 */
exports.agentRunSummaries = (0, pg_core_1.pgTable)(
  "agent_run_summaries",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_119 ||
            (templateObject_119 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRuns.id;
        },
        { onDelete: "cascade" }
      ),
    assistantId: (0, pg_core_1.varchar)("assistantId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.assistantProfiles.id;
      }),
    turnCount: (0, pg_core_1.integer)("turnCount").default(0).notNull(),
    totalInputTokens: (0, pg_core_1.integer)("totalInputTokens")
      .default(0)
      .notNull(),
    totalOutputTokens: (0, pg_core_1.integer)("totalOutputTokens")
      .default(0)
      .notNull(),
    totalCostCredits: (0, pg_core_1.numeric)("totalCostCredits", {
      precision: 12,
      scale: 4,
    })
      .default("0")
      .notNull(),
    toolCallCount: (0, pg_core_1.integer)("toolCallCount").default(0).notNull(),
    toolSuccessCount: (0, pg_core_1.integer)("toolSuccessCount")
      .default(0)
      .notNull(),
    toolFailureCount: (0, pg_core_1.integer)("toolFailureCount")
      .default(0)
      .notNull(),
    memoriesRead: (0, pg_core_1.integer)("memoriesRead").default(0).notNull(),
    memoriesWritten: (0, pg_core_1.integer)("memoriesWritten")
      .default(0)
      .notNull(),
    memoriesPromoted: (0, pg_core_1.integer)("memoriesPromoted")
      .default(0)
      .notNull(),
    artifactsCreated: (0, pg_core_1.integer)("artifactsCreated")
      .default(0)
      .notNull(),
    handoffsSent: (0, pg_core_1.integer)("handoffsSent").default(0).notNull(),
    handoffsReceived: (0, pg_core_1.integer)("handoffsReceived")
      .default(0)
      .notNull(),
    errorCount: (0, pg_core_1.integer)("errorCount").default(0).notNull(),
    activeDurationMs: (0, pg_core_1.integer)("activeDurationMs")
      .default(0)
      .notNull(),
    waitDurationMs: (0, pg_core_1.integer)("waitDurationMs")
      .default(0)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [(0, pg_core_1.index)("agent_run_summaries_run_idx").on(t.runId)];
  }
);
/**
 * run_snapshots — periodic state captures during active runs.
 */
exports.runSnapshots = (0, pg_core_1.pgTable)(
  "run_snapshots",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_120 ||
            (templateObject_120 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.teamRuns.id;
        },
        { onDelete: "cascade" }
      ),
    capturedAt: (0, pg_core_1.timestamp)("capturedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    activeAssistantId: (0, pg_core_1.varchar)("activeAssistantId", {
      length: 36,
    }),
    agentStatusesJson: (0, pg_core_1.jsonb)("agentStatusesJson"),
    tokenUsageJson: (0, pg_core_1.jsonb)("tokenUsageJson"),
    costJson: (0, pg_core_1.jsonb)("costJson"),
    artifactCountJson: (0, pg_core_1.jsonb)("artifactCountJson"),
    pendingApprovalsCount: (0, pg_core_1.integer)("pendingApprovalsCount")
      .default(0)
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("run_snapshots_run_captured_idx").on(
        t.runId,
        t.capturedAt
      ),
    ];
  }
);
/**
 * orchestrator_notifications — persistent notification records.
 */
exports.orchestratorNotifications = (0, pg_core_1.pgTable)(
  "orchestrator_notifications",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_121 ||
            (templateObject_121 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(function () {
        return exports.users.id;
      }),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 }),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }),
    notificationType: (0, pg_core_1.text)("notificationType").notNull(),
    severity: (0, exports.notificationSeverityEnum)("severity")
      .notNull()
      .default("info"),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    body: (0, pg_core_1.text)("body"),
    actionUrl: (0, pg_core_1.text)("actionUrl"),
    isRead: (0, pg_core_1.boolean)("isRead").default(false).notNull(),
    isDismissed: (0, pg_core_1.boolean)("isDismissed").default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: (0, pg_core_1.timestamp)("readAt", { withTimezone: true }),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("orchestrator_notifications_user_unread_idx").on(
        t.userId,
        t.isRead,
        t.createdAt
      ),
      (0, pg_core_1.index)("orchestrator_notifications_tenant_created_idx").on(
        t.tenantId,
        t.createdAt
      ),
      (0, pg_core_1.index)("idx_orch_notif_user_created").on(
        t.userId,
        t.createdAt
      ),
    ];
  }
);
// ==========================================
// Virtual AI Office Orchestrator — Scoped Memory (Section 03)
// ==========================================
exports.memoryOwnerTypeEnum = (0, pg_core_1.pgEnum)("memory_owner_type", [
  "user",
  "agent",
  "team",
  "room",
  "project",
  "run",
]);
exports.memoryKindEnum = (0, pg_core_1.pgEnum)("memory_kind", [
  "fact",
  "rule",
  "preference",
  "decision",
  "note",
  "checklist",
  "artifact_note",
  "handoff_note",
  "episode",
]);
exports.memoryVisibilityEnum = (0, pg_core_1.pgEnum)("memory_visibility", [
  "private",
  "shared_team",
  "shared_room",
  "shared_project",
]);
exports.memorySourceTypeEnum = (0, pg_core_1.pgEnum)("memory_source_type", [
  "auto",
  "manual",
  "promoted",
]);
/**
 * scoped_memories — hierarchical memory store with scope isolation.
 * Supports keyword + vector (hybrid) retrieval via pgvector.
 */
exports.scopedMemories = (0, pg_core_1.pgTable)(
  "scoped_memories",
  {
    id: (0, pg_core_1.text)("id")
      .primaryKey()
      .$defaultFn(function () {
        return crypto.randomUUID();
      }),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    ownerType: (0, exports.memoryOwnerTypeEnum)("ownerType").notNull(),
    ownerId: (0, pg_core_1.text)("ownerId").notNull(),
    memoryKind: (0, exports.memoryKindEnum)("memoryKind").notNull(),
    visibility: (0, exports.memoryVisibilityEnum)("visibility")
      .notNull()
      .default("private"),
    sourceType: (0, exports.memorySourceTypeEnum)("sourceType")
      .notNull()
      .default("auto"),
    sourceUserId: (0, pg_core_1.integer)("sourceUserId"),
    sourceAssistantId: (0, pg_core_1.text)("sourceAssistantId"),
    sourceRoomId: (0, pg_core_1.text)("sourceRoomId"),
    projectId: (0, pg_core_1.varchar)("projectId", { length: 100 }),
    title: (0, pg_core_1.text)("title").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    summary: (0, pg_core_1.text)("summary"),
    tags: (0, pg_core_1.text)("tags").array(),
    metadataJson: (0, pg_core_1.jsonb)("metadataJson"),
    embedding: vector1536("embedding"),
    confidence: (0, pg_core_1.numeric)("confidence", {
      precision: 3,
      scale: 2,
    }).default("0.80"),
    importance: (0, pg_core_1.integer)("importance").default(5),
    reinforcementCount: (0, pg_core_1.integer)("reinforcementCount").default(0),
    lastAccessedAt: (0, pg_core_1.timestamp)("lastAccessedAt", {
      withTimezone: true,
    }),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("scoped_memories_owner_created_idx").on(
        t.ownerType,
        t.ownerId,
        t.createdAt
      ),
      (0, pg_core_1.index)("scoped_memories_tenant_kind_idx").on(
        t.tenantId,
        t.memoryKind
      ),
    ];
  }
);
/**
 * memory_promotions — audit trail for scope promotions.
 */
exports.memoryPromotions = (0, pg_core_1.pgTable)(
  "memory_promotions",
  {
    id: (0, pg_core_1.text)("id")
      .primaryKey()
      .$defaultFn(function () {
        return crypto.randomUUID();
      }),
    memoryId: (0, pg_core_1.text)("memoryId")
      .notNull()
      .references(
        function () {
          return exports.scopedMemories.id;
        },
        { onDelete: "cascade" }
      ),
    fromOwnerType: (0, exports.memoryOwnerTypeEnum)("fromOwnerType").notNull(),
    fromOwnerId: (0, pg_core_1.text)("fromOwnerId").notNull(),
    toOwnerType: (0, exports.memoryOwnerTypeEnum)("toOwnerType").notNull(),
    toOwnerId: (0, pg_core_1.text)("toOwnerId").notNull(),
    promotedByUserId: (0, pg_core_1.integer)("promotedByUserId"),
    promotedByAssistantId: (0, pg_core_1.text)("promotedByAssistantId"),
    reason: (0, pg_core_1.text)("reason"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("memory_promotions_memory_idx").on(t.memoryId),
    ];
  }
);
// ==========================================
// Virtual AI Office Orchestrator — Inter-Agent Communication (Section 09)
// ==========================================
exports.interAgentChannelEnum = (0, pg_core_1.pgEnum)("inter_agent_channel", [
  "system_broadcast",
  "system_control",
  "team_escalation",
  "system_direct",
  "system_context",
]);
exports.interAgentSourceTypeEnum = (0, pg_core_1.pgEnum)(
  "inter_agent_source_type",
  ["team", "system", "external"]
);
exports.interAgentTargetTypeEnum = (0, pg_core_1.pgEnum)(
  "inter_agent_target_type",
  ["room", "run", "team", "user", "all_active_runs"]
);
exports.interAgentPriorityEnum = (0, pg_core_1.pgEnum)("inter_agent_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);
exports.interAgentStatusEnum = (0, pg_core_1.pgEnum)("inter_agent_status", [
  "delivered",
  "acknowledged",
]);
exports.resourceStatusEnum = (0, pg_core_1.pgEnum)("resource_status", [
  "healthy",
  "degraded",
  "down",
  "critical",
]);
/**
 * inter_agent_messages — messages between system agents and team agents.
 */
exports.interAgentMessages = (0, pg_core_1.pgTable)(
  "inter_agent_messages",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_122 ||
            (templateObject_122 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    channel: (0, exports.interAgentChannelEnum)("channel").notNull(),
    sourceAgentType: (0, exports.interAgentSourceTypeEnum)(
      "sourceAgentType"
    ).notNull(),
    sourceAgentId: (0, pg_core_1.varchar)("sourceAgentId", {
      length: 100,
    }).notNull(),
    targetType: (0, exports.interAgentTargetTypeEnum)("targetType").notNull(),
    targetId: (0, pg_core_1.varchar)("targetId", { length: 100 }),
    priority: (0, exports.interAgentPriorityEnum)("priority")
      .notNull()
      .default("normal"),
    messageType: (0, pg_core_1.varchar)("messageType", {
      length: 64,
    }).notNull(),
    payload: (0, pg_core_1.jsonb)("payload"),
    displayMessage: (0, pg_core_1.text)("displayMessage"),
    actionRequired: (0, pg_core_1.boolean)("actionRequired")
      .default(false)
      .notNull(),
    status: (0, exports.interAgentStatusEnum)("status")
      .notNull()
      .default("delivered"),
    acknowledgedAt: (0, pg_core_1.timestamp)("acknowledgedAt", {
      withTimezone: true,
    }),
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    relatedIncidentId: (0, pg_core_1.integer)("relatedIncidentId"),
    relatedRunId: (0, pg_core_1.varchar)("relatedRunId", { length: 36 }),
    relatedRoomId: (0, pg_core_1.varchar)("relatedRoomId", { length: 36 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("inter_agent_messages_target_created_idx").on(
        t.targetType,
        t.targetId,
        t.createdAt
      ),
      (0, pg_core_1.index)("inter_agent_messages_incident_idx").on(
        t.relatedIncidentId
      ),
      (0, pg_core_1.index)("inter_agent_messages_run_idx").on(t.relatedRunId),
    ];
  }
);
/**
 * system_resource_state — current health status of system resources.
 */
exports.systemResourceState = (0, pg_core_1.pgTable)("system_resource_state", {
  id: (0, pg_core_1.varchar)("id", { length: 64 }).primaryKey(),
  tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }),
  resourceType: (0, pg_core_1.varchar)("resourceType", {
    length: 32,
  }).notNull(),
  status: (0, exports.resourceStatusEnum)("status").notNull(),
  stateJson: (0, pg_core_1.jsonb)("stateJson"),
  updatedBy: (0, pg_core_1.varchar)("updatedBy", { length: 64 }),
  updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// ==========================================
// Virtual AI Office Orchestrator — Automation Handoffs & External Intake (Section 16)
// ==========================================
exports.handoffStatusEnum = (0, pg_core_1.pgEnum)("handoff_status", [
  "pending",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
]);
exports.handoffApprovalStateEnum = (0, pg_core_1.pgEnum)(
  "handoff_approval_state",
  ["not_required", "pending", "approved", "rejected"]
);
exports.externalTaskStatusEnum = (0, pg_core_1.pgEnum)("external_task_status", [
  "received",
  "awaiting_review",
  "approved",
  "rejected",
  "materialized",
  "failed",
]);
exports.trustTierEnum = (0, pg_core_1.pgEnum)("trust_tier", [
  "untrusted",
  "basic",
  "verified",
  "privileged",
]);
/**
 * automation_handoffs — cross-surface actions initiated by team agents.
 */
exports.automationHandoffs = (0, pg_core_1.pgTable)(
  "automation_handoffs",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_123 ||
            (templateObject_123 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    teamId: (0, pg_core_1.varchar)("teamId", { length: 36 }).notNull(),
    roomId: (0, pg_core_1.varchar)("roomId", { length: 36 }).notNull(),
    runId: (0, pg_core_1.varchar)("runId", { length: 36 }).notNull(),
    assistantId: (0, pg_core_1.varchar)("assistantId", {
      length: 36,
    }).notNull(),
    destinationType: (0, pg_core_1.varchar)("destinationType", {
      length: 50,
    }).notNull(),
    destinationId: (0, pg_core_1.varchar)("destinationId", { length: 100 }),
    idempotencyKey: (0, pg_core_1.varchar)("idempotencyKey", { length: 64 })
      .notNull()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_124 ||
            (templateObject_124 = __makeTemplateObject(
              ["gen_random_uuid()::text"],
              ["gen_random_uuid()::text"]
            ))
        )
      ),
    dispatchTokenHash: (0, pg_core_1.varchar)("dispatchTokenHash", {
      length: 64,
    }),
    callbackNonce: (0, pg_core_1.varchar)("callbackNonce", { length: 64 }),
    callbackDeadlineAt: (0, pg_core_1.timestamp)("callbackDeadlineAt", {
      withTimezone: true,
    }),
    attemptCount: (0, pg_core_1.integer)("attemptCount").notNull().default(0),
    lastAttemptAt: (0, pg_core_1.timestamp)("lastAttemptAt", {
      withTimezone: true,
    }),
    status: (0, exports.handoffStatusEnum)("status")
      .notNull()
      .default("pending"),
    approvalState: (0, exports.handoffApprovalStateEnum)("approvalState")
      .notNull()
      .default("pending"),
    requestPayloadJson: (0, pg_core_1.jsonb)("requestPayloadJson"),
    resultPayloadJson: (0, pg_core_1.jsonb)("resultPayloadJson"),
    approvedByUserId: (0, pg_core_1.integer)("approvedByUserId"),
    errorDetail: (0, pg_core_1.text)("errorDetail"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("automation_handoffs_run_idx").on(t.runId),
      (0, pg_core_1.index)("automation_handoffs_team_idx").on(t.teamId),
      (0, pg_core_1.uniqueIndex)("automation_handoffs_run_idempotency_idx").on(
        t.runId,
        t.idempotencyKey
      ),
    ];
  }
);
/**
 * external_task_sources — registered external systems that can submit tasks.
 */
exports.externalTaskSources = (0, pg_core_1.pgTable)(
  "external_task_sources",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_125 ||
            (templateObject_125 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    sourceType: (0, pg_core_1.varchar)("sourceType", { length: 50 }).notNull(),
    trustTier: (0, exports.trustTierEnum)("trustTier")
      .notNull()
      .default("untrusted"),
    configJson: (0, pg_core_1.jsonb)("configJson"),
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("external_task_sources_tenant_idx").on(t.tenantId),
    ];
  }
);
/**
 * external_task_inbox — incoming tasks from external systems.
 */
exports.externalTaskInbox = (0, pg_core_1.pgTable)(
  "external_task_inbox",
  {
    id: (0, pg_core_1.varchar)("id", { length: 36 })
      .primaryKey()
      .default(
        (0, drizzle_orm_1.sql)(
          templateObject_126 ||
            (templateObject_126 = __makeTemplateObject(
              ["gen_random_uuid()"],
              ["gen_random_uuid()"]
            ))
        )
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).notNull(),
    sourceId: (0, pg_core_1.varchar)("sourceId", { length: 36 })
      .notNull()
      .references(function () {
        return exports.externalTaskSources.id;
      }),
    targetTeamId: (0, pg_core_1.varchar)("targetTeamId", { length: 36 }),
    status: (0, exports.externalTaskStatusEnum)("status")
      .notNull()
      .default("received"),
    priority: (0, pg_core_1.varchar)("priority", { length: 20 }).default(
      "normal"
    ),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    payloadJson: (0, pg_core_1.jsonb)("payloadJson"),
    materializedRoomId: (0, pg_core_1.varchar)("materializedRoomId", {
      length: 36,
    }),
    materializedRunId: (0, pg_core_1.varchar)("materializedRunId", {
      length: 36,
    }),
    reviewedByUserId: (0, pg_core_1.integer)("reviewedByUserId"),
    errorDetail: (0, pg_core_1.text)("errorDetail"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("external_task_inbox_tenant_status_idx").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("external_task_inbox_source_idx").on(t.sourceId),
    ];
  }
);
// ==================== Invite Code System ====================
/** Invite codes for controlled registration (admin-managed and user referral codes) */
exports.inviteCodes = (0, pg_core_1.pgTable)(
  "invite_codes",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** The invite code string (auto-generated or custom) */
    code: (0, pg_core_1.varchar)("code", { length: 32 }).notNull().unique(),
    /** Display label for admin codes (e.g. "โค้ด Facebook", "โค้ด Event") */
    label: (0, pg_core_1.varchar)("label", { length: 128 }),
    /** Code type: admin-created or user-referral */
    type: (0, exports.inviteCodeTypeEnum)("type").notNull(),
    /** Tenant this code belongs to (null = legacy/global) */
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }).references(
      function () {
        return exports.tenants.id;
      },
      { onDelete: "cascade" }
    ),
    /** User who owns/created this code */
    ownerId: (0, pg_core_1.integer)("ownerId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Bonus credits given to the new user who registers with this code */
    bonusCreditsForNewUser: (0, pg_core_1.integer)("bonusCreditsForNewUser")
      .default(0)
      .notNull(),
    /** Bonus credits given to the code owner when someone uses it (user referral) */
    bonusCreditsForOwner: (0, pg_core_1.integer)("bonusCreditsForOwner")
      .default(0)
      .notNull(),
    /** Max number of times this code can be used (null = unlimited) */
    maxUses: (0, pg_core_1.integer)("maxUses"),
    /** Current number of times this code has been used */
    currentUses: (0, pg_core_1.integer)("currentUses").default(0).notNull(),
    /** Expiration date (null = never expires) */
    expiresAt: (0, pg_core_1.timestamp)("expiresAt", { withTimezone: true }),
    /** Whether this code is currently active */
    isActive: (0, pg_core_1.boolean)("isActive").default(true).notNull(),
    /** Admin description/notes */
    description: (0, pg_core_1.text)("description"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("invite_codes_owner_idx").on(t.ownerId),
      (0, pg_core_1.index)("invite_codes_type_active_idx").on(
        t.type,
        t.isActive
      ),
      (0, pg_core_1.index)("invite_codes_tenant_idx").on(t.tenantId),
    ];
  }
);
/** Tracks each use of an invite code */
exports.inviteCodeUsage = (0, pg_core_1.pgTable)(
  "invite_code_usage",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** The invite code that was used */
    inviteCodeId: (0, pg_core_1.integer)("inviteCodeId")
      .notNull()
      .references(
        function () {
          return exports.inviteCodes.id;
        },
        { onDelete: "cascade" }
      ),
    /** The user who registered using this code */
    registeredUserId: (0, pg_core_1.integer)("registeredUserId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    /** Credits given to the registered user */
    creditsGivenToUser: (0, pg_core_1.integer)("creditsGivenToUser")
      .default(0)
      .notNull(),
    /** Credits given to the code owner */
    creditsGivenToOwner: (0, pg_core_1.integer)("creditsGivenToOwner")
      .default(0)
      .notNull(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("invite_code_usage_code_idx").on(t.inviteCodeId),
      (0, pg_core_1.index)("invite_code_usage_user_idx").on(t.registeredUserId),
      (0, pg_core_1.uniqueIndex)("invite_code_usage_code_user_unique").on(
        t.inviteCodeId,
        t.registeredUserId
      ),
    ];
  }
);
/**
 * User LLM API Keys — encrypted storage for user-provided LLM provider keys.
 * Keys are encrypted with AES-256-GCM via crypto.ts (same as llmProviders.apiKeyEncrypted).
 * One key per provider per user, enforced by unique index.
 */
exports.userLlmApiKeys = (0, pg_core_1.pgTable)(
  "user_llm_api_keys",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull(),
    apiKeyEncrypted: (0, pg_core_1.text)("apiKeyEncrypted").notNull(),
    keyHint: (0, pg_core_1.varchar)("keyHint", { length: 8 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("user_llm_api_keys_user_provider_idx").on(
        t.userId,
        t.provider
      ),
      (0, pg_core_1.index)("user_llm_api_keys_user_idx").on(t.userId),
    ];
  }
);
// ==================== MCP Server Registry ====================
/**
 * MCP Server Registry — centralized management of MCP servers per tenant.
 * Replaces per-agent JSONB (agencyAgents.mcpServers) with normalized tables.
 * OAuth tokens stored in dedicated encrypted columns (not JSONB).
 */
exports.mcpServers = (0, pg_core_1.pgTable)(
  "mcp_servers",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    transportType: (0, pg_core_1.varchar)("transport_type", { length: 20 })
      .notNull()
      .default("http"),
    enabled: (0, pg_core_1.boolean)("enabled").notNull().default(true),
    config: (0, pg_core_1.jsonb)("config").notNull().default({}),
    // OAuth tokens in dedicated encrypted columns (CLAUDE.md encryption rules)
    oauthClientId: (0, pg_core_1.text)("oauth_client_id"),
    oauthClientSecretEncrypted: (0, pg_core_1.text)(
      "oauth_client_secret_encrypted"
    ),
    oauthAccessTokenEncrypted: (0, pg_core_1.text)(
      "oauth_access_token_encrypted"
    ),
    oauthRefreshTokenEncrypted: (0, pg_core_1.text)(
      "oauth_refresh_token_encrypted"
    ),
    oauthTokenExpiresAt: (0, pg_core_1.timestamp)("oauth_token_expires_at", {
      withTimezone: true,
    }),
    // Non-secret OAuth metadata only
    oauthConfig: (0, pg_core_1.jsonb)("oauth_config"),
    capabilities: (0, pg_core_1.jsonb)("capabilities").default({ tools: true }),
    toolNamePrefix: (0, pg_core_1.boolean)("tool_name_prefix").default(true),
    maxToolsExposed: (0, pg_core_1.integer)("max_tools_exposed").default(50),
    timeoutSeconds: (0, pg_core_1.integer)("timeout_seconds").default(30),
    endpointPath: (0, pg_core_1.varchar)("endpoint_path", {
      length: 100,
    }).default("/rpc"),
    riskLevel: (0, pg_core_1.varchar)("risk_level", { length: 10 })
      .notNull()
      .default("high"),
    dataClassification: (0, pg_core_1.varchar)("data_classification", {
      length: 20,
    }).default("internal"),
    configHash: (0, pg_core_1.varchar)("config_hash", { length: 64 }),
    approvedAt: (0, pg_core_1.timestamp)("approved_at", { withTimezone: true }),
    approvedBy: (0, pg_core_1.integer)("approved_by").references(function () {
      return exports.users.id;
    }),
    creditPerCall: (0, pg_core_1.numeric)("credit_per_call", {
      precision: 10,
      scale: 2,
    }).default("1.0"),
    lastHealthCheck: (0, pg_core_1.timestamp)("last_health_check", {
      withTimezone: true,
    }),
    healthStatus: (0, pg_core_1.varchar)("health_status", {
      length: 20,
    }).default("unknown"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: (0, pg_core_1.integer)("created_by").references(function () {
      return exports.users.id;
    }),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("mcp_servers_tenant_slug_unique").on(
        t.tenantId,
        t.slug
      ),
      (0, pg_core_1.index)("ix_mcp_servers_tenant").on(t.tenantId),
      (0, pg_core_1.index)("ix_mcp_servers_enabled").on(t.tenantId, t.enabled),
    ];
  }
);
/**
 * MCP Server Assignments — links MCP servers to tenants, agencies, or agents.
 * Supports scoped tool filtering (enable/disable specific tools per assignment).
 */
exports.mcpServerAssignments = (0, pg_core_1.pgTable)(
  "mcp_server_assignments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    mcpServerId: (0, pg_core_1.integer)("mcp_server_id")
      .notNull()
      .references(
        function () {
          return exports.mcpServers.id;
        },
        { onDelete: "cascade" }
      ),
    targetType: (0, pg_core_1.varchar)("target_type", { length: 10 }).notNull(),
    targetId: (0, pg_core_1.varchar)("target_id", { length: 36 }).notNull(),
    enabledToolNames: (0, pg_core_1.text)("enabled_tool_names").array(),
    disabledToolNames: (0, pg_core_1.text)("disabled_tool_names").array(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("mcp_assignments_server_target_unique").on(
        t.mcpServerId,
        t.targetType,
        t.targetId
      ),
      (0, pg_core_1.index)("ix_mcp_assignments_target").on(
        t.targetType,
        t.targetId
      ),
    ];
  }
);
// ==================== Social Channels ====================
exports.uploadPostConnections = (0, pg_core_1.pgTable)(
  "upload_post_connections",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    apiKeyEncrypted: (0, pg_core_1.text)("apiKeyEncrypted").notNull(),
    apiKeyFingerprint: (0, pg_core_1.varchar)("apiKeyFingerprint", {
      length: 128,
    }).notNull(),
    apiKeyHint: (0, pg_core_1.varchar)("apiKeyHint", { length: 12 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("pending"),
    healthStatus: (0, pg_core_1.varchar)("healthStatus", { length: 20 })
      .notNull()
      .default("unknown"),
    disclosureAcceptedAt: (0, pg_core_1.timestamp)("disclosureAcceptedAt", {
      withTimezone: true,
    }),
    disclosurePolicyVersion: (0, pg_core_1.varchar)("disclosurePolicyVersion", {
      length: 32,
    }),
    consentAcknowledgedByUserId: (0, pg_core_1.integer)(
      "consentAcknowledgedByUserId"
    ).references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    handshakeNonce: (0, pg_core_1.varchar)("handshakeNonce", { length: 255 }),
    handshakeNonceExpiresAt: (0, pg_core_1.timestamp)(
      "handshakeNonceExpiresAt",
      { withTimezone: true }
    ),
    lastVerifiedAt: (0, pg_core_1.timestamp)("lastVerifiedAt", {
      withTimezone: true,
    }),
    lastHealthCheckAt: (0, pg_core_1.timestamp)("lastHealthCheckAt", {
      withTimezone: true,
    }),
    quotaRemaining: (0, pg_core_1.integer)("quotaRemaining"),
    quotaLimit: (0, pg_core_1.integer)("quotaLimit"),
    quotaResetAt: (0, pg_core_1.timestamp)("quotaResetAt", {
      withTimezone: true,
    }),
    queueSettings: (0, pg_core_1.jsonb)("queueSettings").$type(),
    metadata: (0, pg_core_1.jsonb)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_upload_post_connections_tenant").on(t.tenantId),
      (0, pg_core_1.index)("idx_upload_post_connections_user").on(t.userId),
      (0, pg_core_1.index)("idx_upload_post_connections_status").on(t.status),
      (0, pg_core_1.uniqueIndex)("idx_upload_post_connections_fingerprint").on(
        t.tenantId,
        t.apiKeyFingerprint
      ),
    ];
  }
);
exports.uploadPostProfiles = (0, pg_core_1.pgTable)(
  "upload_post_profiles",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    connectionId: (0, pg_core_1.integer)("connectionId")
      .notNull()
      .references(
        function () {
          return exports.uploadPostConnections.id;
        },
        { onDelete: "cascade" }
      ),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    platform: (0, pg_core_1.varchar)("platform", { length: 50 }).notNull(),
    platformPageId: (0, pg_core_1.varchar)("platformPageId", {
      length: 255,
    }).notNull(),
    displayName: (0, pg_core_1.varchar)("displayName", { length: 500 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("active"),
    metadata: (0, pg_core_1.jsonb)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_upload_post_profiles_tenant").on(t.tenantId),
      (0, pg_core_1.index)("idx_upload_post_profiles_connection").on(
        t.connectionId
      ),
      (0, pg_core_1.index)("idx_upload_post_profiles_user").on(t.userId),
      (0, pg_core_1.uniqueIndex)("idx_upload_post_profiles_unique").on(
        t.connectionId,
        t.platform,
        t.platformPageId
      ),
    ];
  }
);
exports.uploadPostJobs = (0, pg_core_1.pgTable)(
  "upload_post_jobs",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    connectionId: (0, pg_core_1.integer)("connectionId")
      .notNull()
      .references(
        function () {
          return exports.uploadPostConnections.id;
        },
        { onDelete: "cascade" }
      ),
    profileId: (0, pg_core_1.integer)("profileId").references(
      function () {
        return exports.uploadPostProfiles.id;
      },
      { onDelete: "set null" }
    ),
    platform: (0, pg_core_1.varchar)("platform", { length: 50 }).notNull(),
    queueKey: (0, pg_core_1.varchar)("queueKey", { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("queued"),
    contentText: (0, pg_core_1.text)("contentText"),
    contentLink: (0, pg_core_1.text)("contentLink"),
    mediaRefs: (0, pg_core_1.jsonb)("mediaRefs").$type(),
    scheduledAt: (0, pg_core_1.timestamp)("scheduledAt", {
      withTimezone: true,
    }),
    publishedAt: (0, pg_core_1.timestamp)("publishedAt", {
      withTimezone: true,
    }),
    providerJobId: (0, pg_core_1.varchar)("providerJobId", { length: 255 }),
    platformResults: (0, pg_core_1.jsonb)("platformResults").$type(),
    metadata: (0, pg_core_1.jsonb)("metadata").$type(),
    metadataClearedAt: (0, pg_core_1.timestamp)("metadataClearedAt", {
      withTimezone: true,
    }),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    lastSyncedAt: (0, pg_core_1.timestamp)("lastSyncedAt", {
      withTimezone: true,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_upload_post_jobs_tenant_status").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("idx_upload_post_jobs_connection_status").on(
        t.connectionId,
        t.status
      ),
      (0, pg_core_1.index)("idx_upload_post_jobs_tenant_scheduled").on(
        t.tenantId,
        t.scheduledAt
      ),
      (0, pg_core_1.uniqueIndex)("idx_upload_post_jobs_queue_key").on(
        t.tenantId,
        t.queueKey
      ),
    ];
  }
);
exports.socialProviderConnections = (0, pg_core_1.pgTable)(
  "social_provider_connections",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    userId: (0, pg_core_1.integer)("userId")
      .notNull()
      .references(
        function () {
          return exports.users.id;
        },
        { onDelete: "cascade" }
      ),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull(),
    providerUserId: (0, pg_core_1.varchar)("providerUserId", { length: 255 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("active"),
    grantedScopes: (0, pg_core_1.json)("grantedScopes").$type(),
    encryptedAccessToken: (0, pg_core_1.text)("encryptedAccessToken"),
    encryptedRefreshToken: (0, pg_core_1.text)("encryptedRefreshToken"),
    tokenExpiresAt: (0, pg_core_1.timestamp)("tokenExpiresAt", {
      withTimezone: true,
    }),
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_provider_connections_tenant").on(
        t.tenantId
      ),
      (0, pg_core_1.index)("idx_social_provider_connections_user").on(t.userId),
    ];
  }
);
exports.socialPages = (0, pg_core_1.pgTable)(
  "social_pages",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    connectionId: (0, pg_core_1.integer)("connectionId")
      .notNull()
      .references(
        function () {
          return exports.socialProviderConnections.id;
        },
        { onDelete: "cascade" }
      ),
    providerPageId: (0, pg_core_1.varchar)("providerPageId", {
      length: 255,
    }).notNull(),
    pageName: (0, pg_core_1.varchar)("pageName", { length: 500 }),
    pageCategory: (0, pg_core_1.varchar)("pageCategory", { length: 255 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("active"),
    encryptedPageAccessToken: (0, pg_core_1.text)("encryptedPageAccessToken"),
    tokenExpiresAt: (0, pg_core_1.timestamp)("tokenExpiresAt", {
      withTimezone: true,
    }),
    selectedForInbox: (0, pg_core_1.boolean)("selectedForInbox")
      .notNull()
      .default(true),
    selectedForPublishing: (0, pg_core_1.boolean)("selectedForPublishing")
      .notNull()
      .default(true),
    selectedForModeration: (0, pg_core_1.boolean)("selectedForModeration")
      .notNull()
      .default(false),
    aiActionMode: (0, pg_core_1.varchar)("aiActionMode", { length: 20 })
      .notNull()
      .default("draft_only"),
    autoSendConfidenceThreshold: (0, pg_core_1.doublePrecision)(
      "autoSendConfidenceThreshold"
    )
      .notNull()
      .default(0.95),
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_pages_tenant").on(t.tenantId),
      (0, pg_core_1.index)("idx_social_pages_connection").on(t.connectionId),
    ];
  }
);
exports.socialWebhookSubscriptions = (0, pg_core_1.pgTable)(
  "social_webhook_subscriptions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    subscriptionStatus: (0, pg_core_1.varchar)("subscriptionStatus", {
      length: 20,
    })
      .notNull()
      .default("pending"),
    subscribedFields: (0, pg_core_1.json)("subscribedFields").$type(),
    lastVerifiedAt: (0, pg_core_1.timestamp)("lastVerifiedAt", {
      withTimezone: true,
    }),
    lastDeliveryAt: (0, pg_core_1.timestamp)("lastDeliveryAt", {
      withTimezone: true,
    }),
    lastError: (0, pg_core_1.text)("lastError"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
exports.socialConversations = (0, pg_core_1.pgTable)(
  "social_conversations",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    providerConversationId: (0, pg_core_1.varchar)("providerConversationId", {
      length: 255,
    }),
    channelType: (0, pg_core_1.varchar)("channelType", { length: 50 })
      .notNull()
      .default("messenger"),
    customerExternalId: (0, pg_core_1.varchar)("customerExternalId", {
      length: 255,
    }).notNull(),
    customerDisplayName: (0, pg_core_1.varchar)("customerDisplayName", {
      length: 500,
    }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("open"),
    assignedToUserId: (0, pg_core_1.integer)("assignedToUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    priority: (0, pg_core_1.integer)("priority").notNull().default(0),
    lastMessageAt: (0, pg_core_1.timestamp)("lastMessageAt", {
      withTimezone: true,
    }),
    lastInboundAt: (0, pg_core_1.timestamp)("lastInboundAt", {
      withTimezone: true,
    }),
    lastOutboundAt: (0, pg_core_1.timestamp)("lastOutboundAt", {
      withTimezone: true,
    }),
    unreadCount: (0, pg_core_1.integer)("unreadCount").notNull().default(0),
    labels: (0, pg_core_1.json)("labels").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.uniqueIndex)("idx_social_conversations_page_customer").on(
        t.pageId,
        t.customerExternalId
      ),
      (0, pg_core_1.index)("idx_social_conversations_tenant_page").on(
        t.tenantId,
        t.pageId
      ),
      (0, pg_core_1.index)("idx_social_conversations_status_last_msg").on(
        t.status,
        t.lastMessageAt
      ),
      (0, pg_core_1.index)("idx_social_conversations_tenant_status").on(
        t.tenantId,
        t.status
      ),
    ];
  }
);
exports.socialMessages = (0, pg_core_1.pgTable)(
  "social_messages",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    conversationId: (0, pg_core_1.integer)("conversationId")
      .notNull()
      .references(
        function () {
          return exports.socialConversations.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    providerMessageId: (0, pg_core_1.varchar)("providerMessageId", {
      length: 255,
    }),
    direction: (0, pg_core_1.varchar)("direction", { length: 10 }).notNull(),
    senderType: (0, pg_core_1.varchar)("senderType", { length: 20 }).notNull(),
    senderExternalId: (0, pg_core_1.varchar)("senderExternalId", {
      length: 255,
    }),
    senderUserId: (0, pg_core_1.integer)("senderUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    messageType: (0, pg_core_1.varchar)("messageType", { length: 30 })
      .notNull()
      .default("text"),
    body: (0, pg_core_1.text)("body"),
    payload: (0, pg_core_1.json)("payload").$type(),
    deliveryStatus: (0, pg_core_1.varchar)("deliveryStatus", { length: 20 })
      .notNull()
      .default("sent"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    sentAt: (0, pg_core_1.timestamp)("sentAt", { withTimezone: true }),
    receivedAt: (0, pg_core_1.timestamp)("receivedAt", { withTimezone: true }),
    workflowTriggerStatus: (0, pg_core_1.varchar)("workflowTriggerStatus", {
      length: 20,
    }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_messages_conversation_created").on(
        t.conversationId,
        t.createdAt
      ),
      (0, pg_core_1.uniqueIndex)("idx_social_messages_provider_msg_id").on(
        t.providerMessageId
      ),
    ];
  }
);
exports.socialPosts = (0, pg_core_1.pgTable)(
  "social_posts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    providerPostId: (0, pg_core_1.varchar)("providerPostId", { length: 255 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("draft"),
    contentText: (0, pg_core_1.text)("contentText"),
    contentLink: (0, pg_core_1.text)("contentLink"),
    mediaRefs: (0, pg_core_1.json)("mediaRefs").$type(),
    scheduledAt: (0, pg_core_1.timestamp)("scheduledAt", {
      withTimezone: true,
    }),
    publishedAt: (0, pg_core_1.timestamp)("publishedAt", {
      withTimezone: true,
    }),
    createdByUserId: (0, pg_core_1.integer)("createdByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    approvedByUserId: (0, pg_core_1.integer)("approvedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_posts_tenant_status").on(
        t.tenantId,
        t.status
      ),
      (0, pg_core_1.index)("idx_social_posts_page_scheduled").on(
        t.pageId,
        t.scheduledAt
      ),
    ];
  }
);
exports.socialComments = (0, pg_core_1.pgTable)(
  "social_comments",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    providerCommentId: (0, pg_core_1.varchar)("providerCommentId", {
      length: 255,
    }),
    providerObjectId: (0, pg_core_1.varchar)("providerObjectId", {
      length: 255,
    }),
    parentCommentId: (0, pg_core_1.integer)("parentCommentId").references(
      function () {
        return exports.socialComments.id;
      },
      { onDelete: "set null" }
    ),
    authorExternalId: (0, pg_core_1.varchar)("authorExternalId", {
      length: 255,
    }),
    authorDisplayName: (0, pg_core_1.varchar)("authorDisplayName", {
      length: 500,
    }),
    body: (0, pg_core_1.text)("body"),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("visible"),
    lastAction: (0, pg_core_1.varchar)("lastAction", { length: 20 }),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_comments_page_created").on(
        t.pageId,
        t.createdAt
      ),
      (0, pg_core_1.uniqueIndex)("idx_social_comments_provider_id").on(
        t.providerCommentId
      ),
    ];
  }
);
exports.socialCommentActions = (0, pg_core_1.pgTable)(
  "social_comment_actions",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    commentId: (0, pg_core_1.integer)("commentId")
      .notNull()
      .references(
        function () {
          return exports.socialComments.id;
        },
        { onDelete: "cascade" }
      ),
    actionType: (0, pg_core_1.varchar)("actionType", { length: 20 }).notNull(),
    performedByUserId: (0, pg_core_1.integer)("performedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    performedBySystem: (0, pg_core_1.boolean)("performedBySystem")
      .notNull()
      .default(false),
    providerResult: (0, pg_core_1.json)("providerResult").$type(),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("completed"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);
exports.socialAutomationRules = (0, pg_core_1.pgTable)(
  "social_automation_rules",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId").references(
      function () {
        return exports.socialPages.id;
      },
      { onDelete: "cascade" }
    ),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    isEnabled: (0, pg_core_1.boolean)("isEnabled").notNull().default(false),
    triggerType: (0, pg_core_1.varchar)("triggerType", {
      length: 50,
    }).notNull(),
    conditions: (0, pg_core_1.json)("conditions").$type(),
    actionMode: (0, pg_core_1.varchar)("actionMode", { length: 20 })
      .notNull()
      .default("draft_only"),
    policyConfig: (0, pg_core_1.json)("policyConfig").$type(),
    createdByUserId: (0, pg_core_1.integer)("createdByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_automation_rules_tenant").on(t.tenantId),
    ];
  }
);
exports.socialHumanApprovals = (0, pg_core_1.pgTable)(
  "social_human_approvals",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 })
      .notNull()
      .references(
        function () {
          return exports.tenants.id;
        },
        { onDelete: "cascade" }
      ),
    pageId: (0, pg_core_1.integer)("pageId")
      .notNull()
      .references(
        function () {
          return exports.socialPages.id;
        },
        { onDelete: "cascade" }
      ),
    entityType: (0, pg_core_1.varchar)("entityType", { length: 50 }).notNull(),
    entityId: (0, pg_core_1.integer)("entityId").notNull(),
    proposedContent: (0, pg_core_1.text)("proposedContent"),
    confidence: (0, pg_core_1.doublePrecision)("confidence"),
    status: (0, pg_core_1.varchar)("status", { length: 20 })
      .notNull()
      .default("pending"),
    requestedBySystem: (0, pg_core_1.boolean)("requestedBySystem")
      .notNull()
      .default(true),
    reviewedByUserId: (0, pg_core_1.integer)("reviewedByUserId").references(
      function () {
        return exports.users.id;
      },
      { onDelete: "set null" }
    ),
    decisionNote: (0, pg_core_1.text)("decisionNote"),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_human_approvals_tenant_status").on(
        t.tenantId,
        t.status,
        t.createdAt
      ),
    ];
  }
);
exports.socialWebhookEventsRaw = (0, pg_core_1.pgTable)(
  "social_webhook_events_raw",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    tenantId: (0, pg_core_1.varchar)("tenantId", { length: 36 }),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull(),
    pageId: (0, pg_core_1.integer)("pageId"),
    deliveryId: (0, pg_core_1.varchar)("deliveryId", { length: 255 }).notNull(),
    eventType: (0, pg_core_1.varchar)("eventType", { length: 100 }),
    payload: (0, pg_core_1.json)("payload").$type(),
    headers: (0, pg_core_1.json)("headers").$type(),
    receivedAt: (0, pg_core_1.timestamp)("receivedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processingStatus: (0, pg_core_1.varchar)("processingStatus", { length: 20 })
      .notNull()
      .default("pending"),
    errorMessage: (0, pg_core_1.text)("errorMessage"),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_social_webhook_events_raw_status").on(
        t.processingStatus,
        t.receivedAt
      ),
      (0, pg_core_1.uniqueIndex)(
        "idx_social_webhook_events_raw_provider_delivery"
      ).on(t.provider, t.deliveryId),
    ];
  }
);
// ---------------------------------------------------------------------------
// Monitoring System Tables
// ---------------------------------------------------------------------------
exports.monitoringChecks = (0, pg_core_1.pgTable)(
  "monitoring_checks",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    checkType: (0, pg_core_1.text)("checkType").notNull(), // "health_check" | "crash_monitor" | "celery_health_monitor" | "memory_check"
    status: (0, pg_core_1.text)("status").notNull(), // "ok" | "warning" | "critical" | "error"
    details: (0, pg_core_1.json)("details").$type(),
    alertSent: (0, pg_core_1.boolean)("alertSent").notNull().default(false),
    alertChannel: (0, pg_core_1.text)("alertChannel"), // "slack" | "discord" | "webhook" | "log" | null
    source: (0, pg_core_1.text)("source").notNull(), // "cron_script" | "celery_task" | "guardian"
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_monitoring_checks_check_type").on(t.checkType),
      (0, pg_core_1.index)("idx_monitoring_checks_status").on(t.status),
      (0, pg_core_1.index)("idx_monitoring_checks_created_at").on(t.createdAt),
    ];
  }
);
exports.monitoringAlerts = (0, pg_core_1.pgTable)(
  "monitoring_alerts",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    severity: (0, pg_core_1.text)("severity").notNull(), // "info" | "warning" | "error" | "critical"
    title: (0, pg_core_1.text)("title").notNull(),
    message: (0, pg_core_1.text)("message").notNull(),
    channel: (0, pg_core_1.text)("channel").notNull(), // "slack" | "discord" | "webhook" | "log"
    acknowledged: (0, pg_core_1.boolean)("acknowledged")
      .notNull()
      .default(false),
    acknowledgedBy: (0, pg_core_1.integer)("acknowledgedBy"), // plain int, no FK
    acknowledgedAt: (0, pg_core_1.timestamp)("acknowledgedAt", {
      withTimezone: true,
    }),
    metadata: (0, pg_core_1.json)("metadata").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_monitoring_alerts_severity").on(t.severity),
      (0, pg_core_1.index)("idx_monitoring_alerts_acknowledged").on(
        t.acknowledged
      ),
      (0, pg_core_1.index)("idx_monitoring_alerts_created_at").on(t.createdAt),
    ];
  }
);
exports.systemMetricsHistory = (0, pg_core_1.pgTable)(
  "system_metrics_history",
  {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    memoryUsedMb: (0, pg_core_1.integer)("memoryUsedMb").notNull(),
    memoryTotalMb: (0, pg_core_1.integer)("memoryTotalMb").notNull(),
    memoryPercent: (0, pg_core_1.real)("memoryPercent").notNull(),
    cpuPercent: (0, pg_core_1.real)("cpuPercent"),
    diskUsedGb: (0, pg_core_1.real)("diskUsedGb"),
    diskTotalGb: (0, pg_core_1.real)("diskTotalGb"),
    serviceStatuses: (0, pg_core_1.json)("serviceStatuses").$type(),
    processRestartCounts: (0, pg_core_1.json)("processRestartCounts").$type(),
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function (t) {
    return [
      (0, pg_core_1.index)("idx_system_metrics_history_created_at").on(
        t.createdAt
      ),
    ];
  }
);
var templateObject_1,
  templateObject_2,
  templateObject_3,
  templateObject_4,
  templateObject_5,
  templateObject_6,
  templateObject_7,
  templateObject_8,
  templateObject_9,
  templateObject_10,
  templateObject_11,
  templateObject_12,
  templateObject_13,
  templateObject_14,
  templateObject_15,
  templateObject_16,
  templateObject_17,
  templateObject_18,
  templateObject_19,
  templateObject_20,
  templateObject_21,
  templateObject_22,
  templateObject_23,
  templateObject_24,
  templateObject_25,
  templateObject_26,
  templateObject_27,
  templateObject_28,
  templateObject_29,
  templateObject_30,
  templateObject_31,
  templateObject_32,
  templateObject_33,
  templateObject_34,
  templateObject_35,
  templateObject_36,
  templateObject_37,
  templateObject_38,
  templateObject_39,
  templateObject_40,
  templateObject_41,
  templateObject_42,
  templateObject_43,
  templateObject_44,
  templateObject_45,
  templateObject_46,
  templateObject_47,
  templateObject_48,
  templateObject_49,
  templateObject_50,
  templateObject_51,
  templateObject_52,
  templateObject_53,
  templateObject_54,
  templateObject_55,
  templateObject_56,
  templateObject_57,
  templateObject_58,
  templateObject_59,
  templateObject_60,
  templateObject_61,
  templateObject_62,
  templateObject_63,
  templateObject_64,
  templateObject_65,
  templateObject_66,
  templateObject_67,
  templateObject_68,
  templateObject_69,
  templateObject_70,
  templateObject_71,
  templateObject_72,
  templateObject_73,
  templateObject_74,
  templateObject_75,
  templateObject_76,
  templateObject_77,
  templateObject_78,
  templateObject_79,
  templateObject_80,
  templateObject_81,
  templateObject_82,
  templateObject_83,
  templateObject_84,
  templateObject_85,
  templateObject_86,
  templateObject_87,
  templateObject_88,
  templateObject_89,
  templateObject_90,
  templateObject_91,
  templateObject_92,
  templateObject_93,
  templateObject_94,
  templateObject_95,
  templateObject_96,
  templateObject_97,
  templateObject_98,
  templateObject_99,
  templateObject_100,
  templateObject_101,
  templateObject_102,
  templateObject_103,
  templateObject_104,
  templateObject_105,
  templateObject_106,
  templateObject_107,
  templateObject_108,
  templateObject_109,
  templateObject_110,
  templateObject_111,
  templateObject_112,
  templateObject_113,
  templateObject_114,
  templateObject_115,
  templateObject_116,
  templateObject_117,
  templateObject_118,
  templateObject_119,
  templateObject_120,
  templateObject_121,
  templateObject_122,
  templateObject_123,
  templateObject_124,
  templateObject_125,
  templateObject_126;
