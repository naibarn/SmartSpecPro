/**
 * Notification Template Service (stub)
 *
 * Provides localized rendering for notification emails.
 * Full implementation arrives in section-12 (templates & retention).
 * This stub returns raw content with minimal formatting.
 */

interface RenderedNotification {
  subject: string;
  body: string;
}

/**
 * Render notification content using the template system.
 * @param templateKey - Template identifier (e.g. "notification.immediate", "digest.header")
 * @param data - Template data including title, content, locale
 */
export function renderNotification(
  templateKey: string,
  data: { title?: string; content?: string; locale?: string; count?: number },
): RenderedNotification {
  // Stub: return raw content. Section-12 replaces with full localization.
  if (templateKey === "digest.header") {
    return {
      subject:
        data.locale === "th"
          ? "สรุปการแจ้งเตือน"
          : "Notification Digest",
      body:
        data.locale === "th"
          ? `คุณมี ${data.count ?? 0} การแจ้งเตือนที่ยังไม่ได้อ่าน`
          : `You have ${data.count ?? 0} unread notifications`,
    };
  }
  if (templateKey === "digest.footer") {
    return {
      subject: "",
      body:
        data.locale === "th"
          ? "ดูการแจ้งเตือนทั้งหมด"
          : "View all notifications",
    };
  }
  return {
    subject: data.title || "Notification",
    body: data.content || "",
  };
}
