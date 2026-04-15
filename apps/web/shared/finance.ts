import { z } from "zod";

export const financeTransactionTypeValues = ["income", "expense", "transfer"] as const;
export const financeTransactionStatusValues = ["draft", "confirmed", "voided"] as const;
export const financeDraftStatusValues = ["draft", "confirmed", "expired", "cancelled"] as const;
export const financeRecurringRuleStatusValues = ["active", "paused", "ended"] as const;
export const financeSourceValues = [
  "chat_text",
  "ocr_document",
  "import",
  "api",
  "recurring_rule",
] as const;
export const financeDocumentRoleValues = ["receipt", "transfer_slip", "invoice", "statement", "supporting"] as const;
export const financePaymentInstitutionKindValues = ["bank", "issuer", "other"] as const;
export const financePaymentInstrumentKindValues = ["bank_account", "credit_card", "cash", "unknown"] as const;
export const financePaymentDirectionValues = ["outbound", "inbound", "both", "unknown"] as const;

export const financeTransactionTypeSchema = z.enum(financeTransactionTypeValues);
export const financeTransactionStatusSchema = z.enum(financeTransactionStatusValues);
export const financeDraftStatusSchema = z.enum(financeDraftStatusValues);
export const financeRecurringRuleStatusSchema = z.enum(financeRecurringRuleStatusValues);
export const financeSourceSchema = z.enum(financeSourceValues);
export const financeDocumentRoleSchema = z.enum(financeDocumentRoleValues);
export const financePaymentInstitutionKindSchema = z.enum(financePaymentInstitutionKindValues);
export const financePaymentInstrumentKindSchema = z.enum(financePaymentInstrumentKindValues);
export const financePaymentDirectionSchema = z.enum(financePaymentDirectionValues);

export const financeCounterpartySuggestionSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string().min(1),
  normalizedName: z.string().min(1),
  usageCount: z.number().int().nonnegative(),
  lastSeenAt: z.string().datetime().nullable(),
  aliases: z.array(z.string()),
});

export type FinanceCounterpartySuggestion = z.infer<typeof financeCounterpartySuggestionSchema>;

export const financeEvidenceItemSchema = z.object({
  field: z.string().min(1),
  value: z.string().nullable().optional(),
  snippet: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type FinanceEvidenceItem = z.infer<typeof financeEvidenceItemSchema>;

export const financeSlipMappingPresetSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  label: z.string().min(1),
  matchText: z.string().min(1),
  transactionType: financeTransactionTypeSchema,
  categoryCode: z.string().min(1),
  counterpartyName: z.string().nullable().optional(),
  merchantName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  priority: z.number().int().nonnegative(),
});

export type FinanceSlipMappingPreset = z.infer<typeof financeSlipMappingPresetSchema>;

export const financeSlipMappingPresetCollectionSchema = z.object({
  version: z.number().int().positive().default(1),
  presets: z.array(financeSlipMappingPresetSchema).default([]),
});

export type FinanceSlipMappingPresetCollection = z.infer<typeof financeSlipMappingPresetCollectionSchema>;

export const financePinnedMerchantPresetCollectionSchema = z.object({
  version: z.number().int().positive().default(1),
  presets: z.array(financeSlipMappingPresetSchema).default([]),
});

export type FinancePinnedMerchantPresetCollection = z.infer<typeof financePinnedMerchantPresetCollectionSchema>;

export const DEFAULT_FINANCE_PINNED_MERCHANT_PRESETS: FinanceSlipMappingPreset[] = [];

export const DEFAULT_FINANCE_SLIP_MAPPING_PRESETS: FinanceSlipMappingPreset[] = [
  {
    id: "internal-transfer",
    enabled: true,
    label: "Internal transfer",
    matchText: "โอนเงิน|transfer|transfer slip|bank transfer|ย้ายเงิน|โอนจากบัญชี",
    transactionType: "transfer",
    categoryCode: "transfer.internal",
    counterpartyName: null,
    merchantName: null,
    note: "Internal transfer between bank accounts",
    priority: 110,
  },
  {
    id: "salary-payroll",
    enabled: true,
    label: "Salary / payroll",
    matchText: "เงินเดือน|salary|payroll|เดือนนี้",
    transactionType: "income",
    categoryCode: "income.salary",
    counterpartyName: "Employer",
    merchantName: "Employer",
    note: "Salary or payroll credit",
    priority: 100,
  },
  {
    id: "ride-transport",
    enabled: true,
    label: "Ride / transport",
    matchText: "grab|bolt|taxi|รถไฟฟ้า|mrt|bts|เดินทาง|transport|ride",
    transactionType: "expense",
    categoryCode: "transport",
    counterpartyName: null,
    merchantName: null,
    note: "Transport expense",
    priority: 90,
  },
  {
    id: "food-coffee",
    enabled: true,
    label: "Food / coffee",
    matchText: "coffee|cafe|starbucks|อาหาร|ข้าว|lunch|dinner|restaurant|food",
    transactionType: "expense",
    categoryCode: "food",
    counterpartyName: null,
    merchantName: null,
    note: "Food or beverage expense",
    priority: 80,
  },
  {
    id: "subscription-media",
    enabled: true,
    label: "Subscription / media",
    matchText: "netflix|spotify|subscription|prime|youtube",
    transactionType: "expense",
    categoryCode: "subscription",
    counterpartyName: null,
    merchantName: null,
    note: "Subscription expense",
    priority: 70,
  },
  {
    id: "shopping-online",
    enabled: true,
    label: "Shopping / online seller",
    matchText: "tiktok|shop|shopee|lazada|seller|seller store|merchant",
    transactionType: "expense",
    categoryCode: "shopping.online",
    counterpartyName: null,
    merchantName: null,
    note: "Shopping or marketplace expense",
    priority: 60,
  },
  {
    id: "refund-income",
    enabled: true,
    label: "Refund / return",
    matchText: "refund|คืนเงิน|คืนสินค้า|returned",
    transactionType: "income",
    categoryCode: "income.misc",
    counterpartyName: null,
    merchantName: null,
    note: "Refund or reversal",
    priority: 50,
  },
  {
    id: "freelance-service-income",
    enabled: true,
    label: "Freelance / service income",
    matchText: "freelance|invoice|consulting|service fee|project payment|รับจ้าง|ค่าบริการ|freelancer",
    transactionType: "income",
    categoryCode: "income.freelance",
    counterpartyName: "Client",
    merchantName: "Client",
    note: "Freelance or service income",
    priority: 88,
  },
  {
    id: "rent-housing",
    enabled: true,
    label: "Rent / housing",
    matchText: "rent|lease|housing|condo|apartment|ห้องเช่า|ค่าเช่า|ที่พัก",
    transactionType: "expense",
    categoryCode: "housing.rent",
    counterpartyName: null,
    merchantName: null,
    note: "Rent or housing expense",
    priority: 86,
  },
  {
    id: "utilities-telecom",
    enabled: true,
    label: "Utilities / telecom",
    matchText: "electricity|water|internet|wifi|mobile|phone bill|ค่าไฟ|ค่าน้ำ|อินเทอร์เน็ต|โทรศัพท์|utility",
    transactionType: "expense",
    categoryCode: "utilities",
    counterpartyName: null,
    merchantName: null,
    note: "Utilities or telecom expense",
    priority: 84,
  },
  {
    id: "groceries-supermarket",
    enabled: true,
    label: "Groceries / supermarket",
    matchText: "supermarket|grocery|tesco|lotus|big c|makro|7-11|7 eleven|เซเว่น|ของชำ|groceries",
    transactionType: "expense",
    categoryCode: "groceries",
    counterpartyName: null,
    merchantName: null,
    note: "Groceries or household supplies",
    priority: 76,
  },
  {
    id: "fuel-parking-toll",
    enabled: true,
    label: "Fuel / parking / toll",
    matchText: "fuel|gas|petrol|parking|toll|ทางด่วน|ค่าน้ำมัน|ที่จอดรถ|mrt|bts",
    transactionType: "expense",
    categoryCode: "transport.fuel",
    counterpartyName: null,
    merchantName: null,
    note: "Fuel, parking, or toll expense",
    priority: 74,
  },
  {
    id: "cashback-interest",
    enabled: true,
    label: "Cashback / interest",
    matchText: "cashback|cash back|interest|ดอกเบี้ย|reward|rewards|คืนเงิน",
    transactionType: "income",
    categoryCode: "income.misc",
    counterpartyName: null,
    merchantName: null,
    note: "Cashback or bank interest",
    priority: 54,
  },
];

export interface FinanceSlipPresetSearchInput {
  text: string;
  counterpartyName?: string | null;
  merchantName?: string | null;
  paymentSourceName?: string | null;
  paymentDestinationName?: string | null;
  paymentSourceLabel?: string | null;
  paymentDestinationLabel?: string | null;
  slipReference?: string | null;
  merchantId?: string | null;
}

export interface FinanceSlipPresetMatch {
  preset: FinanceSlipMappingPreset;
  score: number;
}

function normalizeSlipPresetText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function splitSlipPresetMatchers(matchText: string): string[] {
  return matchText
    .split(/[|,\n]/g)
    .map((part) => normalizeSlipPresetText(part))
    .filter((part) => part.length > 0);
}

function buildSlipPresetSearchHaystack(input: FinanceSlipPresetSearchInput): string {
  return normalizeSlipPresetText([
    input.text,
    input.counterpartyName ?? "",
    input.merchantName ?? "",
    input.paymentSourceName ?? "",
    input.paymentDestinationName ?? "",
    input.paymentSourceLabel ?? "",
    input.paymentDestinationLabel ?? "",
    input.slipReference ?? "",
    input.merchantId ?? "",
  ].join(" "));
}

export function rankFinanceSlipMappingPresets(
  input: FinanceSlipPresetSearchInput,
  presets: FinanceSlipMappingPreset[] = DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
): FinanceSlipPresetMatch[] {
  const haystack = buildSlipPresetSearchHaystack(input);
  const matches: FinanceSlipPresetMatch[] = [];

  for (const preset of presets) {
    if (!preset.enabled) {
      continue;
    }

    const matchers = splitSlipPresetMatchers(preset.matchText);
    if (matchers.length === 0) {
      continue;
    }

    let bestScoreForPreset: number | null = null;
    for (const matcher of matchers) {
      const index = haystack.indexOf(matcher);
      if (index < 0) {
        continue;
      }

      const score = (preset.priority * 10_000) + (matcher.length * 100) - index;
      if (bestScoreForPreset === null || score > bestScoreForPreset) {
        bestScoreForPreset = score;
      }
    }

    if (bestScoreForPreset !== null) {
      matches.push({ preset, score: bestScoreForPreset });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function findBestFinanceSlipMappingPreset(
  input: FinanceSlipPresetSearchInput,
  presets: FinanceSlipMappingPreset[] = DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
): FinanceSlipMappingPreset | null {
  return rankFinanceSlipMappingPresets(input, presets)[0]?.preset ?? null;
}

function buildPinnedMerchantPresetCandidates(input: FinanceSlipPresetSearchInput): string[] {
  return [
    input.merchantName ?? "",
    input.counterpartyName ?? "",
    input.paymentSourceName ?? "",
    input.paymentDestinationName ?? "",
    input.paymentSourceLabel ?? "",
    input.paymentDestinationLabel ?? "",
    input.slipReference ?? "",
    input.merchantId ?? "",
    input.text ?? "",
  ]
    .map((candidate) => normalizeSlipPresetText(candidate))
    .filter((candidate) => candidate.length > 0);
}

export function rankFinancePinnedMerchantPresets(
  input: FinanceSlipPresetSearchInput,
  presets: FinanceSlipMappingPreset[] = DEFAULT_FINANCE_PINNED_MERCHANT_PRESETS,
): FinanceSlipPresetMatch[] {
  const candidates = buildPinnedMerchantPresetCandidates(input);
  if (candidates.length === 0) {
    return [];
  }

  const matches: FinanceSlipPresetMatch[] = [];

  for (const preset of presets) {
    if (!preset.enabled) {
      continue;
    }

    const merchantMatchers = [
      preset.merchantName ?? "",
      preset.counterpartyName ?? "",
      ...splitSlipPresetMatchers(preset.matchText),
    ]
      .map((matcher) => normalizeSlipPresetText(matcher))
      .filter((matcher) => matcher.length > 0);

    if (merchantMatchers.length === 0) {
      continue;
    }

    let bestScoreForPreset: number | null = null;
    for (const matcher of merchantMatchers) {
      for (const candidate of candidates) {
        const index = candidate.indexOf(matcher);
        const reverseIndex = matcher.indexOf(candidate);
        if (index < 0 && reverseIndex < 0) {
          continue;
        }

        const exactMatchBoost = candidate === matcher || reverseIndex === 0 ? 1_000_000 : 0;
        const containmentBoost = index >= 0 ? (matcher.length * 200) - index : (candidate.length * 100) - reverseIndex;
        const score = (preset.priority * 10_000) + exactMatchBoost + containmentBoost;
        if (bestScoreForPreset === null || score > bestScoreForPreset) {
          bestScoreForPreset = score;
        }
      }
    }

    if (bestScoreForPreset !== null) {
      matches.push({ preset, score: bestScoreForPreset });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function findBestFinancePinnedMerchantPreset(
  input: FinanceSlipPresetSearchInput,
  presets: FinanceSlipMappingPreset[] = DEFAULT_FINANCE_PINNED_MERCHANT_PRESETS,
): FinanceSlipMappingPreset | null {
  return rankFinancePinnedMerchantPresets(input, presets)[0]?.preset ?? null;
}

function rebuildSlipPresetSummary(
  draft: FinanceStructuredDraft,
  preset: FinanceSlipMappingPreset,
  type: FinanceStructuredDraft["type"],
): string {
  const amount = `${draft.currency} ${Number(draft.amountMinor / 100).toFixed(2)}`;
  const sourceText = draft.paymentSourceLabel
    ?? draft.paymentSourceInstitutionName
    ?? draft.paymentSourceName
    ?? "บัญชีต้นทาง";
  const destinationText = draft.paymentDestinationLabel
    ?? draft.counterpartyName
    ?? draft.merchantName
    ?? draft.paymentDestinationInstitutionName
    ?? draft.paymentDestinationName
    ?? "ผู้รับเงิน";
  const typeLabel = preset.transactionType === "income"
    ? "รับ"
    : preset.transactionType === "transfer"
      ? "โอน"
      : "จ่าย";
  const noteText = preset.note ? ` ${preset.note}` : "";

  if (type === "transfer") {
    return `${typeLabel} ${amount} จาก ${sourceText} ไปยัง ${destinationText}${noteText}`;
  }

  if (type === "income") {
    return `${typeLabel} ${amount} จาก ${destinationText}${noteText}`;
  }

  return `${typeLabel} ${amount} ให้ ${destinationText}${noteText}`;
}

export function applyFinanceSlipMappingPresetToDraft(
  draft: FinanceStructuredDraft,
  preset: FinanceSlipMappingPreset,
): FinanceStructuredDraft {
  const shouldOverrideType = draft.type !== "transfer" || preset.transactionType === "transfer";
  const type = shouldOverrideType ? preset.transactionType : draft.type;
  const categoryCode = preset.categoryCode.trim() || draft.categoryCode;
  const counterpartyName = draft.counterpartyName ?? preset.counterpartyName ?? preset.merchantName ?? null;
  const merchantName = draft.merchantName ?? preset.merchantName ?? preset.counterpartyName ?? counterpartyName;
  const note = draft.note ?? preset.note ?? null;
  const humanReadableSummary = rebuildSlipPresetSummary(
    {
      ...draft,
      type,
      categoryCode,
      counterpartyName,
      merchantName,
      note,
    },
    preset,
    type,
  );

  const evidence = [
    ...(draft.evidence ?? []),
    {
      field: "slipMappingPreset",
      value: preset.label,
      snippet: `matched preset "${preset.label}" on "${preset.matchText}"`,
      confidence: 0.9,
    },
  ];

  return {
    ...draft,
    type,
    categoryCode,
    counterpartyName,
    merchantName,
    note,
    humanReadableSummary,
    evidence,
  };
}

export function applyFinancePinnedMerchantPresetToDraft(
  draft: FinanceStructuredDraft,
  preset: FinanceSlipMappingPreset,
): FinanceStructuredDraft {
  const applied = applyFinanceSlipMappingPresetToDraft(draft, preset);
  return {
    ...applied,
    evidence: [
      ...(applied.evidence ?? []),
      {
        field: "pinnedMerchantPreset",
        value: preset.label,
        snippet: `matched pinned merchant "${preset.merchantName ?? preset.label}" on "${preset.matchText}"`,
        confidence: 0.95,
      },
    ],
  };
}

export const financeStructuredDraftSchema = z.object({
  type: financeTransactionTypeSchema,
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  occurredAt: z.string().datetime(),
  categoryCode: z.string().min(1),
  documentRole: financeDocumentRoleSchema.nullable().optional(),
  counterpartyName: z.string().nullable().optional(),
  merchantName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  humanReadableSummary: z.string().nullable().optional(),
  evidence: z.array(financeEvidenceItemSchema).default([]),
  sourceUrl: z.string().nullable().optional(),
  sourceFileName: z.string().nullable().optional(),
  slipReference: z.string().nullable().optional(),
  merchantId: z.string().nullable().optional(),
  paymentFeeMinor: z.number().int().nonnegative().nullable().optional(),
  paymentMethodKind: financePaymentInstrumentKindSchema.nullable().optional(),
  paymentDirection: financePaymentDirectionSchema.nullable().optional(),
  paymentSourceAccountId: z.number().int().positive().nullable().optional(),
  paymentDestinationAccountId: z.number().int().positive().nullable().optional(),
  paymentSourceLabel: z.string().nullable().optional(),
  paymentDestinationLabel: z.string().nullable().optional(),
  paymentSourceName: z.string().nullable().optional(),
  paymentDestinationName: z.string().nullable().optional(),
  paymentSourceInstitutionName: z.string().nullable().optional(),
  paymentDestinationInstitutionName: z.string().nullable().optional(),
  paymentInstitutionName: z.string().nullable().optional(),
  paymentAccountNickname: z.string().nullable().optional(),
  paymentAccountLast4: z.string().nullable().optional(),
  paymentAccountMaskedIdentifier: z.string().nullable().optional(),
  paymentInstrumentConfidence: z.number().min(0).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  missingFields: z.array(z.string()),
  sourceMessageId: z.number().int().positive().nullable().optional(),
  sourceLibraryItemId: z.number().int().positive().nullable().optional(),
  recurringRuleId: z.number().int().positive().nullable().optional(),
});

export type FinanceStructuredDraft = z.infer<typeof financeStructuredDraftSchema>;

export const financeMonthlySummarySchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  timezone: z.string().min(1),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
  transferMinor: z.number().int(),
  balanceMinor: z.number().int(),
});

export type FinanceMonthlySummary = z.infer<typeof financeMonthlySummarySchema>;
