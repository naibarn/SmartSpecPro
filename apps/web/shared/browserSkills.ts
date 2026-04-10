import { z } from "zod";

export const browserSkillIdValues = [
  "general_navigation",
  "web_research",
  "compare_options",
  "checkout_assistant",
  "account_access",
  "invoice_reconciliation",
  "ticket_triage",
  "crm_update",
  "vendor_comparison",
  "hr_onboarding",
  "contract_review_summary",
  "renewal_follow_up",
  "purchase_order_handling",
  "daily_ops_summary",
  "content_publish_check",
] as const;

export const browserSkillIdSchema = z.enum(browserSkillIdValues);

export type BrowserSkillId = z.infer<typeof browserSkillIdSchema>;
export type BrowserSkillSelectionMode = "auto" | "manual";

export interface BrowserSkillPreset {
  id: BrowserSkillId;
  label: string;
  shortLabel: string;
  description: string;
  guidancePrefix: string;
  prefersWebsiteDiscovery: boolean;
}

export const BROWSER_SKILL_PRESETS: BrowserSkillPreset[] = [
  {
    id: "general_navigation",
    label: "General Browser Task",
    shortLabel: "General",
    description: "Use when the goal is broad and the system should adapt the browsing steps.",
    guidancePrefix:
      "Handle this as a browser task. Infer the best next actions from the user's desired outcome and adapt if the page changes.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "web_research",
    label: "Research And Evidence",
    shortLabel: "Research",
    description: "Find relevant sites, gather evidence, and summarize what matters.",
    guidancePrefix:
      "Handle this as a web research task. Find the most relevant websites, compare trustworthy sources, capture evidence, and keep moving toward the user's requested outcome.",
    prefersWebsiteDiscovery: true,
  },
  {
    id: "compare_options",
    label: "Compare Options",
    shortLabel: "Compare",
    description: "Find candidate sites or listings, compare choices, and recommend the best fit.",
    guidancePrefix:
      "Handle this as a comparison task. Find the right websites or vendors, compare the available options, explain tradeoffs, and continue toward the user's requested result.",
    prefersWebsiteDiscovery: true,
  },
  {
    id: "checkout_assistant",
    label: "Checkout And Booking",
    shortLabel: "Checkout",
    description: "Progress through carts, booking flows, and review gates carefully.",
    guidancePrefix:
      "Handle this as a checkout or booking task. Navigate carefully, verify key details before commitment, and pause cleanly at payment or booking confirmation gates.",
    prefersWebsiteDiscovery: true,
  },
  {
    id: "invoice_reconciliation",
    label: "Invoice Reconciliation",
    shortLabel: "Invoices",
    description: "Collect invoice records, compare values, and stop cleanly at consequence boundaries.",
    guidancePrefix:
      "Handle this as an invoice reconciliation task. Compare records carefully, preserve audit evidence, and fail closed on mismatched financial data.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "ticket_triage",
    label: "Ticket Triage",
    shortLabel: "Tickets",
    description: "Classify support items, gather evidence, and route to the right queue or owner.",
    guidancePrefix:
      "Handle this as a ticket triage task. Classify the issue, gather routing evidence, and stop if confidence is too low to assign safely.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "crm_update",
    label: "CRM Update",
    shortLabel: "CRM",
    description: "Review account context and update bounded CRM records without broad changes.",
    guidancePrefix:
      "Handle this as a CRM update task. Validate the target account, apply only bounded field changes, and keep a clear audit summary.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "vendor_comparison",
    label: "Vendor Comparison",
    shortLabel: "Vendor",
    description: "Compare suppliers, quotes, and requirements before preparing a recommendation.",
    guidancePrefix:
      "Handle this as a vendor comparison task. Compare supplier options, capture tradeoffs, and stop at approval boundaries before commitment.",
    prefersWebsiteDiscovery: true,
  },
  {
    id: "hr_onboarding",
    label: "HR Onboarding",
    shortLabel: "Onboard",
    description: "Coordinate onboarding steps, validate HRIS/profile data, and keep approvals bounded.",
    guidancePrefix:
      "Handle this as an HR onboarding task. Validate employee data, coordinate actions across HR tools, and pause for missing policy confirmation.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "contract_review_summary",
    label: "Contract Review Summary",
    shortLabel: "Contract",
    description: "Read contract materials, extract obligations, and summarize review points.",
    guidancePrefix:
      "Handle this as a contract review summary task. Extract obligations, renewal dates, and legal risks without taking irreversible action.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "renewal_follow_up",
    label: "Renewal Follow-Up",
    shortLabel: "Renewal",
    description: "Review account signals and prepare renewal outreach or escalation paths.",
    guidancePrefix:
      "Handle this as a renewal follow-up task. Confirm account context, prepare the next best outreach, and pause at external communication boundaries when needed.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "purchase_order_handling",
    label: "Purchase Order Handling",
    shortLabel: "PO",
    description: "Prepare purchase order details, validate vendor data, and route for approval.",
    guidancePrefix:
      "Handle this as a purchase order handling task. Validate supplier details, preserve financial evidence, and stop at approval or commit points.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "daily_ops_summary",
    label: "Daily Ops Summary",
    shortLabel: "Ops",
    description: "Collect recurring operational inputs and publish a concise, evidence-backed summary.",
    guidancePrefix:
      "Handle this as a daily operations summary task. Gather the latest operational inputs, summarize anomalies, and keep links to supporting evidence.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "content_publish_check",
    label: "Content Publish Check",
    shortLabel: "Publish",
    description: "Validate publishing checklist items and collect preflight evidence before release.",
    guidancePrefix:
      "Handle this as a content publishing check. Validate readiness, capture missing assets or approvals, and stop if the release checklist is incomplete.",
    prefersWebsiteDiscovery: false,
  },
  {
    id: "account_access",
    label: "Login And Account Flow",
    shortLabel: "Login",
    description: "Guide or continue login, account, and verification flows with takeover-ready behavior.",
    guidancePrefix:
      "Handle this as an account access task. Navigate to the correct login or account area, continue carefully, and expect takeover or extra verification when needed.",
    prefersWebsiteDiscovery: true,
  },
];

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

export function getBrowserSkillPreset(skillId: BrowserSkillId | null | undefined): BrowserSkillPreset {
  return BROWSER_SKILL_PRESETS.find((preset) => preset.id === skillId) ?? BROWSER_SKILL_PRESETS[0];
}

export function inferBrowserSkillId(prompt: string): BrowserSkillId {
  const normalized = normalizePrompt(prompt);
  if (
    normalized.includes("invoice")
    || normalized.includes("reconcile")
    || normalized.includes("ap")
    || normalized.includes("line item")
  ) {
    return "invoice_reconciliation";
  }
  if (
    normalized.includes("ticket")
    || normalized.includes("triage")
    || normalized.includes("sla")
    || normalized.includes("queue")
  ) {
    return "ticket_triage";
  }
  if (
    normalized.includes("crm")
    || normalized.includes("opportunity")
    || normalized.includes("pipeline stage")
    || normalized.includes("account update")
  ) {
    return "crm_update";
  }
  if (
    normalized.includes("vendor")
    || normalized.includes("supplier")
    || normalized.includes("rfq")
    || normalized.includes("quote")
  ) {
    return "vendor_comparison";
  }
  if (
    normalized.includes("onboard")
    || normalized.includes("employee")
    || normalized.includes("hr")
    || normalized.includes("new hire")
  ) {
    return "hr_onboarding";
  }
  if (
    normalized.includes("contract")
    || normalized.includes("clause")
    || normalized.includes("nda")
    || normalized.includes("legal")
  ) {
    return "contract_review_summary";
  }
  if (
    normalized.includes("renewal")
    || normalized.includes("churn")
    || normalized.includes("health score")
  ) {
    return "renewal_follow_up";
  }
  if (
    normalized.includes("purchase order")
    || normalized.includes("po ")
    || normalized.endsWith(" po")
    || normalized.includes("procurement")
  ) {
    return "purchase_order_handling";
  }
  if (
    normalized.includes("ops summary")
    || normalized.includes("daily ops")
    || normalized.includes("handoff")
  ) {
    return "daily_ops_summary";
  }
  if (
    normalized.includes("publish")
    || normalized.includes("editorial")
    || normalized.includes("content checklist")
  ) {
    return "content_publish_check";
  }
  if (
    normalized.includes("login")
    || normalized.includes("sign in")
    || normalized.includes("account")
    || normalized.includes("otp")
    || normalized.includes("2fa")
    || normalized.includes("mfa")
    || normalized.includes("ล็อกอิน")
  ) {
    return "account_access";
  }
  if (
    normalized.includes("checkout")
    || normalized.includes("payment")
    || normalized.includes("book")
    || normalized.includes("booking")
    || normalized.includes("cart")
    || normalized.includes("reserve")
    || normalized.includes("จอง")
    || normalized.includes("ชำระ")
  ) {
    return "checkout_assistant";
  }
  if (
    normalized.includes("compare")
    || normalized.includes("price")
    || normalized.includes("option")
    || normalized.includes("vendor")
    || normalized.includes("hotel")
    || normalized.includes("flight")
    || normalized.includes("ราคา")
    || normalized.includes("เปรียบเทียบ")
  ) {
    return "compare_options";
  }
  if (
    normalized.includes("research")
    || normalized.includes("find")
    || normalized.includes("search")
    || normalized.includes("เว็บ")
    || normalized.includes("website")
    || normalized.includes("หา")
    || normalized.includes("ค้น")
  ) {
    return "web_research";
  }
  return "general_navigation";
}

export function shouldDiscoverWebsitesForPrompt(
  prompt: string,
  skillId?: BrowserSkillId | null,
): boolean {
  const preset = getBrowserSkillPreset(skillId ?? inferBrowserSkillId(prompt));
  return preset.prefersWebsiteDiscovery;
}

export function isComplexBrowserGoal(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  const clauseSignals = [
    " then ",
    " after ",
    " before ",
    " compare ",
    " summarize ",
    " and continue ",
    " แล้ว",
    "จากนั้น",
    "พร้อม",
    "เปรียบเทียบ",
    "สรุป",
  ];
  const matchedClauses = clauseSignals.filter((signal) => normalized.includes(signal)).length;
  const commaCount = (trimmed.match(/[;,]/g) || []).length;
  const longPrompt = trimmed.length >= 140;
  const manyWords = trimmed.split(/\s+/).filter(Boolean).length >= 20;
  return longPrompt || manyWords || matchedClauses >= 2 || commaCount >= 2;
}

export function deriveBrowserSkillSelection(input: {
  draft: string;
  currentSkillId: BrowserSkillId;
  selectionMode: BrowserSkillSelectionMode;
}): {
  skillId: BrowserSkillId;
  selectionMode: BrowserSkillSelectionMode;
} {
  const draft = input.draft.trim();
  if (!draft) {
    return {
      skillId: inferBrowserSkillId(""),
      selectionMode: "auto",
    };
  }
  if (input.selectionMode === "manual") {
    return {
      skillId: input.currentSkillId,
      selectionMode: "manual",
    };
  }
  return {
    skillId: inferBrowserSkillId(draft),
    selectionMode: "auto",
  };
}

export function buildBrowserInstruction(input: {
  goal: string;
  skillId?: BrowserSkillId | null;
}): string {
  const goal = input.goal.trim();
  if (!goal) {
    return "";
  }
  const preset = getBrowserSkillPreset(input.skillId ?? inferBrowserSkillId(goal));
  return `${preset.guidancePrefix}\n\nUser goal: ${goal}`;
}
