import { z } from "zod";

export const browserSkillIdValues = [
  "general_navigation",
  "web_research",
  "compare_options",
  "checkout_assistant",
  "account_access",
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
