import { SocialBackgroundError, type SocialBackgroundActionInput, type SocialProviderAdapter } from "../providerRegistry";
import { loadPage, publishPost, readComments, readInbox, replyComment, sendReply } from "../providerActions";

export const META_SOCIAL_PROVIDER_ADAPTER: SocialProviderAdapter = {
  providerId: "meta",
  label: "Meta",
  summary: "Background Meta actions for inbox, publishing, moderation, and approvals.",
  actions: ["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"],
  status: "available",
  async execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>> {
    const page = await loadPage(input.tenantId, input.pageId);
    if (page.status !== "active") {
      throw new SocialBackgroundError(409, "Page is not active");
    }
    if (input.action === "read_inbox" || input.action === "send_reply") {
      if (!page.selectedForInbox) {
        throw new SocialBackgroundError(403, "Page is not enabled for inbox actions");
      }
    }
    if (input.action === "publish_post") {
      if (!page.selectedForPublishing) {
        throw new SocialBackgroundError(403, "Page is not enabled for publishing");
      }
    }
    if (input.action === "read_comments" || input.action === "reply_comment") {
      if (!page.selectedForModeration) {
        throw new SocialBackgroundError(403, "Page is not enabled for moderation");
      }
    }

    switch (input.action) {
      case "read_inbox":
        return readInbox(input.tenantId, page);
      case "send_reply":
        return sendReply(input.tenantId, page, input.conversationId, input.messageBody);
      case "publish_post":
        return publishPost(page, input.contentText, input.contentLink, input.mediaRefs);
      case "read_comments":
        return readComments(page);
      case "reply_comment":
        return replyComment(input.tenantId, page, input.commentId, input.messageBody);
    }
  },
};
