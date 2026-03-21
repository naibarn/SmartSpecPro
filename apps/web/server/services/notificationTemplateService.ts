/**
 * Notification Template Service
 *
 * i18n template lookup and variable interpolation for notification content.
 * Supports EN and TH locales with fallback chain:
 *   requested locale → "en" → raw key
 *
 * renderNotification() is backward-compatible with the section-10 email stub
 * signature (templateKey, data) while also supporting the section-12 style
 * (templateKey, locale, variables).
 */

// ─── Types ───

export interface TemplateEntry {
  title: string;
  content: string;
}

interface RenderedNotification {
  subject: string;
  body: string;
}

interface TemplateDefinition {
  title: string;
  content: string;
}

type TemplateCatalog = Record<string, TemplateDefinition>;

// ─── Template Catalogs ───

const EN_TEMPLATES: TemplateCatalog = {
  "media_job.completed": {
    title: "Media Job Completed",
    content: "Your {mediaType} generation job completed in {duration}.",
  },
  "media_job.failed": {
    title: "Media Job Failed",
    content: "Your {mediaType} generation job failed: {errorMessage}",
  },
  "workflow.published": {
    title: "Workflow Published",
    content: 'Workflow "{workflowName}" has been published successfully.',
  },
  "workflow.failed": {
    title: "Workflow Failed",
    content: 'Workflow "{workflowName}" failed: {errorMessage}',
  },
  "skill.completed": {
    title: "Skill Completed",
    content: 'Skill "{skillName}" has completed execution.',
  },
  "feedback.received": {
    title: "Feedback Received",
    content: "New feedback received on your {itemType}.",
  },
  "follow.requested": {
    title: "Follow Request",
    content: "{followerName} has requested to follow you.",
  },
  "alert.escalated": {
    title: "Alert Escalated",
    content: 'Alert "{originalTitle}" has been escalated to {escalatedTo}.',
  },
  "alert.system_health": {
    title: "System Health Alert",
    content: "Metric {metricName} reached {value} (threshold: {threshold}).",
  },
  "alert.rate_limit": {
    title: "Rate Limit Hit",
    content: "Rate limit reached for provider {provider}.",
  },
  "notification.digest": {
    title: "Notification Digest",
    content: "You have {count} notifications from the past {period}.",
  },
  "webhook.disabled": {
    title: "Webhook Disabled",
    content: 'Webhook "{webhookName}" has been disabled: {reason}',
  },
};

const TH_TEMPLATES: TemplateCatalog = {
  "media_job.completed": {
    title: "งาน Media เสร็จสมบูรณ์",
    content: "งาน {mediaType} ของคุณเสร็จสมบูรณ์ใน {duration}",
  },
  "media_job.failed": {
    title: "งาน Media ล้มเหลว",
    content: "งาน {mediaType} ของคุณล้มเหลว: {errorMessage}",
  },
  "workflow.published": {
    title: "เวิร์กโฟลว์เผยแพร่แล้ว",
    content: 'เวิร์กโฟลว์ "{workflowName}" เผยแพร่สำเร็จแล้ว',
  },
  "workflow.failed": {
    title: "เวิร์กโฟลว์ล้มเหลว",
    content: 'เวิร์กโฟลว์ "{workflowName}" ล้มเหลว: {errorMessage}',
  },
  "skill.completed": {
    title: "สกิลเสร็จสมบูรณ์",
    content: 'สกิล "{skillName}" ทำงานเสร็จแล้ว',
  },
  "feedback.received": {
    title: "ได้รับฟีดแบ็ก",
    content: "มีฟีดแบ็กใหม่สำหรับ {itemType} ของคุณ",
  },
  "follow.requested": {
    title: "คำขอติดตาม",
    content: "{followerName} ขอติดตามคุณ",
  },
  "alert.escalated": {
    title: "การแจ้งเตือนถูกยกระดับ",
    content: 'การแจ้งเตือน "{originalTitle}" ถูกยกระดับไปที่ {escalatedTo}',
  },
  "alert.system_health": {
    title: "แจ้งเตือนสุขภาพระบบ",
    content: "เมตริก {metricName} ถึง {value} (เกณฑ์: {threshold})",
  },
  "alert.rate_limit": {
    title: "ถึงขีดจำกัดอัตรา",
    content: "ถึงขีดจำกัดอัตราสำหรับผู้ให้บริการ {provider}",
  },
  "notification.digest": {
    title: "สรุปการแจ้งเตือน",
    content: "คุณมี {count} การแจ้งเตือนจาก {period} ที่ผ่านมา",
  },
  "webhook.disabled": {
    title: "เว็บฮุกถูกปิดใช้งาน",
    content: 'เว็บฮุก "{webhookName}" ถูกปิดใช้งาน: {reason}',
  },
};

const LOCALE_MAP: Record<string, TemplateCatalog> = {
  en: EN_TEMPLATES,
  th: TH_TEMPLATES,
};

// ─── Helpers ───

/**
 * Replace {variableName} tokens in a string with provided values.
 * Missing variables are left as literal {variableName}.
 */
function interpolate(
  text: string,
  variables?: Record<string, string>
): string {
  if (!variables) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return key in variables ? variables[key] : match;
  });
}

// ─── Public API ───

/**
 * Look up a template by key and locale, returning interpolated title/content.
 *
 * Fallback chain: requested locale → "en" → raw key.
 * Never throws.
 */
export function renderTemplate(
  templateKey: string,
  locale: string,
  variables?: Record<string, string>
): TemplateEntry {
  // Try requested locale
  const localeCatalog = LOCALE_MAP[locale];
  if (localeCatalog?.[templateKey]) {
    const tmpl = localeCatalog[templateKey];
    return {
      title: interpolate(tmpl.title, variables),
      content: interpolate(tmpl.content, variables),
    };
  }

  // Fallback to English
  if (locale !== "en" && EN_TEMPLATES[templateKey]) {
    const tmpl = EN_TEMPLATES[templateKey];
    return {
      title: interpolate(tmpl.title, variables),
      content: interpolate(tmpl.content, variables),
    };
  }

  // Ultimate fallback: raw key
  return { title: templateKey, content: templateKey };
}

/**
 * Backward-compatible render function used by notificationEmailService (section-10).
 * Accepts (templateKey, data) format with { title, content, locale, count }.
 *
 * Returns { subject, body } for email rendering.
 */
export function renderNotification(
  templateKey: string,
  data: { title?: string; content?: string; locale?: string; count?: number }
): RenderedNotification {
  const locale = data.locale || "en";

  // Digest templates
  if (templateKey === "digest.header") {
    const entry = renderTemplate("notification.digest", locale, {
      count: String(data.count ?? 0),
      period: "day",
    });
    return { subject: entry.title, body: entry.content };
  }
  if (templateKey === "digest.footer") {
    return {
      subject: "",
      body: locale === "th" ? "ดูการแจ้งเตือนทั้งหมด" : "View all notifications",
    };
  }

  // For notification.immediate and other keys — return raw values
  return {
    subject: data.title || "Notification",
    body: data.content || "",
  };
}

/**
 * Returns all known template keys from the English locale catalog.
 */
export function getTemplateKeys(): string[] {
  return Object.keys(EN_TEMPLATES);
}
