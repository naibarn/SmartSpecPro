export const workpackDomainPackValues = [
  "finance_ops",
  "hr_ops",
  "support_ops",
  "sales_ops",
  "procurement_ops",
  "executive_support",
  "custom",
] as const;

export type WorkpackDomainPack = (typeof workpackDomainPackValues)[number];

export interface WorkpackDomainPackDefinition {
  id: WorkpackDomainPack;
  label: string;
  description: string;
  connectorFamilies: string[];
  browserSkillHints: string[];
  defaultStepTitles: string[];
}

export const WORKPACK_DOMAIN_PACKS: WorkpackDomainPackDefinition[] = [
  {
    id: "finance_ops",
    label: "Finance Ops",
    description: "Invoice, reconciliation, payment verification, and reporting routines.",
    connectorFamilies: ["erp", "spreadsheet", "email"],
    browserSkillHints: ["compare_options", "invoice_reconciliation"],
    defaultStepTitles: [
      "Collect source records",
      "Reconcile line items",
      "Draft exception summary",
      "Publish verified outcome",
    ],
  },
  {
    id: "hr_ops",
    label: "HR Ops",
    description: "Onboarding, policy intake, candidate coordination, and HRIS updates.",
    connectorFamilies: ["hris", "email", "calendar"],
    browserSkillHints: ["account_access", "hr_onboarding"],
    defaultStepTitles: [
      "Intake employee or candidate request",
      "Validate policy and profile data",
      "Coordinate actions across HR systems",
      "Notify stakeholders",
    ],
  },
  {
    id: "support_ops",
    label: "Support Ops",
    description: "Ticket triage, SLA routing, knowledge capture, and follow-up.",
    connectorFamilies: ["helpdesk", "knowledge_base", "chat"],
    browserSkillHints: ["web_research", "ticket_triage"],
    defaultStepTitles: [
      "Classify incoming work",
      "Route or resolve based on playbook",
      "Capture remediation evidence",
      "Close the loop with the requester",
    ],
  },
  {
    id: "sales_ops",
    label: "Sales Ops",
    description: "Lead hygiene, CRM updates, opportunity follow-up, and quote preparation.",
    connectorFamilies: ["crm", "email", "calendar"],
    browserSkillHints: ["crm_update", "general_navigation"],
    defaultStepTitles: [
      "Review inbound signal",
      "Update CRM and account context",
      "Prepare the next best action",
      "Dispatch customer-facing follow-up",
    ],
  },
  {
    id: "procurement_ops",
    label: "Procurement Ops",
    description: "Vendor intake, quote comparison, purchase readiness, and approval routing.",
    connectorFamilies: ["erp", "vendor_portal", "email"],
    browserSkillHints: ["procurement_checkout", "compare_options"],
    defaultStepTitles: [
      "Collect sourcing inputs",
      "Compare supplier options",
      "Prepare approval packet",
      "Commit approved procurement action",
    ],
  },
  {
    id: "executive_support",
    label: "Executive Support",
    description: "Calendar, comms triage, briefing prep, and follow-through for leadership.",
    connectorFamilies: ["calendar", "email", "docs"],
    browserSkillHints: ["account_access", "general_navigation"],
    defaultStepTitles: [
      "Intake executive objective",
      "Collect supporting context",
      "Draft schedule or briefing outputs",
      "Send confirmed follow-up",
    ],
  },
  {
    id: "custom",
    label: "Custom",
    description: "General-purpose operational workpack for processes outside the packaged libraries.",
    connectorFamilies: [],
    browserSkillHints: ["general_navigation"],
    defaultStepTitles: [
      "Collect structured inputs",
      "Plan bounded execution",
      "Run policy-aware steps",
      "Publish outcome and evidence",
    ],
  },
];

const DOMAIN_PACK_MAP = new Map(WORKPACK_DOMAIN_PACKS.map((pack) => [pack.id, pack] as const));

export function getWorkpackDomainPack(
  domainPack: WorkpackDomainPack | null | undefined,
): WorkpackDomainPackDefinition {
  return DOMAIN_PACK_MAP.get(domainPack ?? "custom") ?? DOMAIN_PACK_MAP.get("custom")!;
}

export function inferWorkpackDomainPackFromText(text: string): WorkpackDomainPack {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "custom";

  if (
    normalized.includes("invoice")
    || normalized.includes("reconcile")
    || normalized.includes("payment")
    || normalized.includes("expense")
    || normalized.includes("finance")
  ) {
    return "finance_ops";
  }

  if (
    normalized.includes("candidate")
    || normalized.includes("employee")
    || normalized.includes("onboard")
    || normalized.includes("hr")
    || normalized.includes("policy")
  ) {
    return "hr_ops";
  }

  if (
    normalized.includes("ticket")
    || normalized.includes("support")
    || normalized.includes("sla")
    || normalized.includes("customer issue")
    || normalized.includes("incident")
  ) {
    return "support_ops";
  }

  if (
    normalized.includes("lead")
    || normalized.includes("crm")
    || normalized.includes("sales")
    || normalized.includes("opportunity")
    || normalized.includes("quote")
  ) {
    return "sales_ops";
  }

  if (
    normalized.includes("vendor")
    || normalized.includes("purchase")
    || normalized.includes("rfq")
    || normalized.includes("procurement")
    || normalized.includes("supplier")
  ) {
    return "procurement_ops";
  }

  if (
    normalized.includes("briefing")
    || normalized.includes("calendar")
    || normalized.includes("executive")
    || normalized.includes("leadership")
    || normalized.includes("meeting prep")
  ) {
    return "executive_support";
  }

  return "custom";
}
