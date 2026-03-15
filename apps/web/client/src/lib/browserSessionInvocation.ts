import type { BrowserSessionOriginSurface } from "@/lib/analytics/browserSessionEvents";

export type BrowserSessionLaunchIntent =
  | "research_in_browser"
  | "continue_in_browser"
  | "review_website_manually";

export interface BrowserSessionLaunchSuggestion {
  suggestionId: string;
  originSurface: Extract<BrowserSessionOriginSurface, "chat" | "agency">;
  sourceId?: string;
  triggerMessage: string;
  launchIntent: BrowserSessionLaunchIntent;
  launchReason: string;
  title: string;
  description: string;
  confirmLabel: string;
  disposition: "suggested";
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

export function detectBrowserSessionLaunchSuggestion(input: {
  message: string;
  originSurface: Extract<BrowserSessionOriginSurface, "chat" | "agency">;
  sourceId?: string;
}): BrowserSessionLaunchSuggestion | null {
  const message = input.message.trim();
  const normalized = normalizeText(message);
  if (!normalized) {
    return null;
  }

  const researchSignals = [
    "research",
    "website",
    "เว็บ",
    "หาในเว็บ",
    "ค้นในเว็บ",
    "compare",
    "price",
    "prices",
    "flight",
    "ticket",
    "hotel",
    "booking",
    "book",
    "fare",
    "travel",
    "โรงแรม",
    "ตั๋ว",
    "เที่ยวบิน",
    "ราคา",
    "เปรียบเทียบ",
    "จอง",
  ];
  const continueSignals = [
    "browser",
    "website",
    "open the site",
    "open website",
    "continue in browser",
    "login",
    "sign in",
    "captcha",
    "checkout",
    "payment",
    "fill the form",
    "เปิดเว็บ",
    "เปิด browser",
    "ล็อกอิน",
    "แคปชา",
    "captcha",
    "ชำระเงิน",
  ];
  const manualReviewSignals = [
    "review website",
    "review page",
    "check website",
    "inspect site",
    "manual review",
    "ดูหน้าเว็บ",
    "ตรวจหน้าเว็บ",
    "รีวิวเว็บ",
  ];

  let launchIntent: BrowserSessionLaunchIntent | null = null;
  let launchReason = "";
  let title = "";
  let description = "";
  let confirmLabel = "Open Browser Session";

  if (researchSignals.some((signal) => normalized.includes(signal))) {
    launchIntent = "research_in_browser";
    launchReason = "This request likely needs multi-step browsing and evidence capture.";
    title = "Research in Browser";
    description = "Launch a Browser Session to compare pages, prices, or options in context.";
    confirmLabel = "Research in Browser";
  } else if (continueSignals.some((signal) => normalized.includes(signal))) {
    launchIntent = "continue_in_browser";
    launchReason = "This request likely needs a live browser for login, checkout, or interactive steps.";
    title = "Continue in Browser";
    description = "Launch a Browser Session so the task can continue on a live web page.";
    confirmLabel = "Continue in Browser";
  } else if (manualReviewSignals.some((signal) => normalized.includes(signal))) {
    launchIntent = "review_website_manually";
    launchReason = "This request likely benefits from direct human review in a live browser.";
    title = "Review Website Manually";
    description = "Open a Browser Session to inspect the site directly before proceeding.";
    confirmLabel = "Review in Browser";
  }

  if (!launchIntent) {
    return null;
  }

  return {
    suggestionId: `${input.originSurface}-${launchIntent}-${normalized.slice(0, 24)}`,
    originSurface: input.originSurface,
    sourceId: input.sourceId,
    triggerMessage: message,
    launchIntent,
    launchReason,
    title,
    description,
    confirmLabel,
    disposition: "suggested",
  };
}
