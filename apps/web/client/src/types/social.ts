import i18next from "i18next";

export type SocialInboxBackendStatus = "open" | "pending" | "closed" | "spam";

export type SocialInboxFilterStatus = "all" | "open" | "pending" | "resolved";

export type SocialInboxDisplayStatus =
  | "open"
  | "pending"
  | "resolved"
  | "archived";

export interface SocialInboxConversationSummary {
  id: number;
  customerDisplayName: string | null;
  customerExternalId: string;
  channelType: string;
  status: string;
  unreadCount: number;
  lastMessagePreview?: string | null;
  lastMessageAt: string | Date | null;
  lastInboundAt: string | Date | null;
  lastOutboundAt: string | Date | null;
  pageId: number;
  pageName: string | null;
  pageStatus: string | null;
}

export interface SocialInboxMessage {
  id: number;
  direction: string;
  senderType: string;
  body: string | null;
  messageType: string;
  sentAt: string | Date | null;
  receivedAt: string | Date | null;
  deliveryStatus: string;
  createdAt: string | Date;
}

export interface SocialInboxConversationContext {
  conversation: SocialInboxConversationSummary & {
    assignedToUserId?: number | null;
    priority?: number | string | null;
    labels?: string[];
    pageProviderPageId?: string | null;
  };
  page: {
    id: number;
    pageName: string | null;
    providerPageId: string;
    status: string;
  };
  recentMessages: SocialInboxMessage[];
}

export interface SocialInboxListResponse {
  items: SocialInboxConversationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SocialDraftSourceDocument {
  content: string;
  score: number;
}

export interface DraftResult {
  draft: string;
  confidence: number;
  autoSent?: boolean;
  approvalId?: number;
  detectedIntent?: string;
  sentMessage?: {
    id: number;
    providerMessageId: string | null;
  };
  sourceDocuments?: SocialDraftSourceDocument[];
}

export interface PageOption {
  id: number;
  label: string;
}

export type SocialAutomationTriggerType =
  | "new_message"
  | "keyword_match"
  | "unread_timeout";
export type SocialAutomationActionMode =
  | "off"
  | "draft_only"
  | "approval_required"
  | "auto_send";
export type SocialAutomationApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface SocialAutomationPageOption {
  id: number;
  label: string;
  status: string;
  pageName: string | null;
  pageCategory: string | null;
  providerPageId: string;
  aiActionMode: SocialAutomationActionMode | string;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
}

export interface SocialAutomationRuleSummary {
  id: number;
  tenantId: string;
  pageId: number | null;
  pageName: string | null;
  providerPageId: string | null;
  name: string;
  isEnabled: boolean;
  triggerType: SocialAutomationTriggerType | string;
  conditions: Record<string, unknown> | null;
  actionMode: SocialAutomationActionMode | string;
  policyConfig: Record<string, unknown> | null;
  createdByUserId: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SocialAutomationApprovalSummary {
  id: number;
  tenantId: string;
  pageId: number;
  pageName: string | null;
  providerPageId: string | null;
  entityType: string;
  entityId: number;
  proposedContent: string | null;
  confidence: number | null;
  status: SocialAutomationApprovalStatus | string;
  requestedBySystem: boolean;
  reviewedByUserId: number | null;
  decisionNote: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SocialAutomationListResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

function getSocialLocale(): string {
  return i18next.resolvedLanguage ?? i18next.language ?? "en";
}

function socialT(key: string, defaultValue: string): string {
  return i18next.t(key, { ns: "social", defaultValue }) as string;
}

export function formatAutomationTriggerType(
  triggerType: string | null | undefined
): string {
  switch (triggerType) {
    case "new_message":
      return socialT("automation.trigger.newMessage", "New message");
    case "keyword_match":
      return socialT("automation.trigger.keywordMatch", "Keyword match");
    case "unread_timeout":
      return socialT("automation.trigger.unreadTimeout", "Unread timeout");
    default:
      return socialT("automation.common.unknown", "Unknown");
  }
}

export function formatAutomationActionMode(
  actionMode: string | null | undefined
): string {
  switch (actionMode) {
    case "off":
      return socialT("automation.actionMode.off", "Off");
    case "draft_only":
      return socialT("automation.actionMode.draftOnly", "Draft only");
    case "approval_required":
      return socialT(
        "automation.actionMode.approvalRequired",
        "Approval required"
      );
    case "auto_send":
      return socialT("automation.actionMode.autoSend", "Auto send");
    default:
      return socialT("automation.actionMode.draftOnly", "Draft only");
  }
}

export function getAutomationActionTone(
  actionMode: string | null | undefined
): string {
  switch (actionMode) {
    case "off":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "draft_only":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "approval_required":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "auto_send":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function formatAutomationApprovalStatus(
  status: string | null | undefined
): string {
  switch (status) {
    case "pending":
      return socialT("automation.approvalStatus.pending", "Pending");
    case "approved":
      return socialT("automation.approvalStatus.approved", "Approved");
    case "rejected":
      return socialT("automation.approvalStatus.rejected", "Rejected");
    case "expired":
      return socialT("automation.approvalStatus.expired", "Expired");
    default:
      return socialT("automation.approvalStatus.pending", "Pending");
  }
}

export function getAutomationApprovalStatusTone(
  status: string | null | undefined
): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "approved":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "expired":
      return "bg-slate-100 text-slate-500 border-slate-200";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

export function mapAutomationApprovalFilterToBackendStatus(
  status: "all" | SocialAutomationApprovalStatus
): SocialAutomationApprovalStatus | undefined {
  if (status === "all") return undefined;
  return status;
}

export type SocialPublishingStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "failed";

export type SocialPublishingFilterStatus = "all" | SocialPublishingStatus;

export interface SocialPublishingPageOption {
  id: number;
  label: string;
  status: string;
  provider: string;
  pageName?: string | null;
  pageCategory?: string | null;
  providerPageId?: string;
  publishingReady?: boolean;
  publishingIssueCode?:
    | "ready"
    | "page_inactive"
    | "publishing_disabled"
    | "missing_page_access"
    | "expired_page_access"
    | "missing_provider_access"
    | "expired_provider_access";
  publishingIssue?: string | null;
}

export function formatPublishingReadiness(
  code: SocialPublishingPageOption["publishingIssueCode"] | null | undefined
): string {
  switch (code) {
    case "ready":
      return socialT("publishing.readyToPublish", "Ready to publish");
    case "page_inactive":
      return socialT("publishing.issues.pageInactive", "Page inactive");
    case "publishing_disabled":
      return socialT(
        "publishing.issues.publishingDisabled",
        "Publishing disabled"
      );
    case "missing_page_access":
      return socialT(
        "publishing.issues.missingPageAccess",
        "Page access missing"
      );
    case "expired_page_access":
      return socialT(
        "publishing.issues.expiredPageAccess",
        "Page access expired"
      );
    case "missing_provider_access":
      return socialT(
        "publishing.issues.missingProviderAccess",
        "Provider access missing"
      );
    case "expired_provider_access":
      return socialT(
        "publishing.issues.expiredProviderAccess",
        "Provider access expired"
      );
    default:
      return socialT("publishing.issues.notReady", "Publishing not ready");
  }
}

export function getPublishingReadinessTone(
  code: SocialPublishingPageOption["publishingIssueCode"] | null | undefined
): string {
  switch (code) {
    case "ready":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "page_inactive":
    case "publishing_disabled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "missing_page_access":
    case "expired_page_access":
    case "missing_provider_access":
    case "expired_provider_access":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export interface SocialPublishingPostSummary {
  id: number;
  pageId: number;
  pageName: string | null;
  provider: string;
  status: SocialPublishingStatus;
  contentText: string | null;
  contentLink: string | null;
  mediaRefs: string[] | null;
  providerPostId: string | null;
  scheduledAt: string | Date | null;
  publishedAt: string | Date | null;
  errorMessage: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SocialPublishingListResponse {
  items: SocialPublishingPostSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function normalizePublishingStatus(
  status: string | null | undefined
): SocialPublishingStatus {
  switch (status) {
    case "scheduled":
    case "published":
    case "failed":
      return status;
    case "draft":
    default:
      return "draft";
  }
}

export function formatPublishingStatus(
  status: string | null | undefined
): string {
  switch (normalizePublishingStatus(status)) {
    case "draft":
      return socialT("publishing.status.draft", "Draft");
    case "scheduled":
      return socialT("publishing.status.scheduled", "Scheduled");
    case "published":
      return socialT("publishing.status.published", "Published");
    case "failed":
      return socialT("publishing.status.failed", "Failed");
  }
}

export function getPublishingStatusTone(
  status: string | null | undefined
): string {
  switch (normalizePublishingStatus(status)) {
    case "draft":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "scheduled":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "published":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-700 border-rose-200";
  }
}

export function mapPublishingFilterToBackendStatus(
  status: SocialPublishingFilterStatus
): SocialPublishingStatus | undefined {
  if (status === "all") return undefined;
  return status;
}

export function normalizeConversationStatus(
  status: string | null | undefined
): SocialInboxDisplayStatus {
  switch (status) {
    case "open":
      return "open";
    case "pending":
      return "pending";
    case "resolved":
    case "closed":
      return "resolved";
    case "archived":
    case "spam":
      return "archived";
    default:
      return "open";
  }
}

export function formatConversationStatus(
  status: string | null | undefined
): string {
  const normalized = normalizeConversationStatus(status);
  switch (normalized) {
    case "open":
      return "Open";
    case "pending":
      return "Pending";
    case "resolved":
      return "Resolved";
    case "archived":
      return "Archived";
  }
}

export function getConversationStatusTone(
  status: string | null | undefined
): string {
  const normalized = normalizeConversationStatus(status);
  switch (normalized) {
    case "open":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "resolved":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "archived":
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

export function getConversationStatusDot(
  status: string | null | undefined
): string {
  const normalized = normalizeConversationStatus(status);
  switch (normalized) {
    case "open":
      return "bg-emerald-500";
    case "pending":
      return "bg-amber-500";
    case "resolved":
      return "bg-slate-400";
    case "archived":
      return "bg-slate-300";
  }
}

export function mapFilterToBackendStatus(
  status: SocialInboxFilterStatus
): SocialInboxBackendStatus | undefined {
  switch (status) {
    case "open":
      return "open";
    case "pending":
      return "pending";
    case "resolved":
      return "closed";
    case "all":
    default:
      return undefined;
  }
}

export function formatRelativeTime(
  isoString: string | Date | null | undefined
): string {
  if (!isoString) return "—";

  const date = isoString instanceof Date ? isoString : new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const absDiffMs = Math.abs(diffMs);

  try {
    const rtf = new Intl.RelativeTimeFormat(getSocialLocale(), {
      numeric: "auto",
    });

    if (absDiffMs < 60_000)
      return rtf.format(Math.round(diffMs / 1_000), "second");
    if (absDiffMs < 3_600_000)
      return rtf.format(Math.round(diffMs / 60_000), "minute");
    if (absDiffMs < 86_400_000)
      return rtf.format(Math.round(diffMs / 3_600_000), "hour");
    if (absDiffMs < 2_592_000_000)
      return rtf.format(Math.round(diffMs / 86_400_000), "day");
    if (absDiffMs < 31_536_000_000)
      return rtf.format(Math.round(diffMs / 2_592_000_000), "month");
    return rtf.format(Math.round(diffMs / 31_536_000_000), "year");
  } catch {
    return date.toLocaleDateString(getSocialLocale());
  }
}

export function truncateText(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}…`;
}

export interface SocialModerationPageOption {
  id: number;
  label: string;
  status: string;
  pageName?: string | null;
  pageCategory?: string | null;
  providerPageId?: string;
}

export type SocialModerationCommentStatus = "visible" | "hidden" | "deleted";

export interface SocialModerationCommentSummary {
  id: number;
  pageId: number;
  pageName: string | null;
  providerCommentId: string | null;
  providerObjectId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  status: SocialModerationCommentStatus;
  lastAction: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SocialModerationListResponse {
  items: SocialModerationCommentSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function normalizeCommentStatus(
  status: string | null | undefined
): SocialModerationCommentStatus {
  switch (status) {
    case "hidden":
    case "deleted":
      return status;
    case "visible":
    default:
      return "visible";
  }
}

export function formatCommentStatus(status: string | null | undefined): string {
  switch (normalizeCommentStatus(status)) {
    case "visible":
      return socialT("moderation.status.visible", "Visible");
    case "hidden":
      return socialT("moderation.status.hidden", "Hidden");
    case "deleted":
      return socialT("moderation.status.deleted", "Deleted");
  }
}

export function getCommentStatusTone(
  status: string | null | undefined
): string {
  switch (normalizeCommentStatus(status)) {
    case "visible":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "hidden":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "deleted":
      return "bg-rose-100 text-rose-700 border-rose-200";
  }
}
