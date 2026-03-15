import { z } from "zod";

export const agencyComparisonIntentValues = [
  "ticket_comparison",
  "hotel_comparison",
  "shortlist",
] as const;

export const agencyComparisonKindValues = [
  "ticket",
  "hotel",
  "shortlist",
  "research",
] as const;

export const agencyComparisonAvailabilityStateValues = [
  "available",
  "limited",
  "sold_out",
  "waitlist",
  "unknown",
] as const;

export const agencyComparisonIntentSchema = z.enum(agencyComparisonIntentValues);
export const agencyComparisonKindSchema = z.enum(agencyComparisonKindValues);
export const agencyComparisonAvailabilityStateSchema = z.enum(
  agencyComparisonAvailabilityStateValues,
);

export const agencyComparisonEvidenceSchema = z.object({
  label: z.string().min(1).max(255),
  url: z.string().min(1).max(2000).nullable().optional(),
  snippet: z.string().min(1).max(2000).nullable().optional(),
  sourceId: z.string().min(1).max(255).nullable().optional(),
}).strict();

export const agencyComparisonOptionSchema = z.object({
  optionId: z.string().min(1).max(255).nullable().optional(),
  vendor: z.string().min(1).max(255),
  optionTitle: z.string().min(1).max(500),
  optionUrl: z.string().min(1).max(2000).nullable().optional(),
  price: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().min(1).max(16).nullable().optional(),
  priceLabel: z.string().min(1).max(255).nullable().optional(),
  distance: z.number().finite().nonnegative().nullable().optional(),
  distanceUnit: z.enum(["m", "km", "mi"]).nullable().optional(),
  distanceLabel: z.string().min(1).max(255).nullable().optional(),
  locationSummary: z.string().min(1).max(255).nullable().optional(),
  availabilityState: agencyComparisonAvailabilityStateSchema.default("unknown"),
  refundable: z.boolean().nullable().optional(),
  bookingLink: z.string().min(1).max(2000).nullable().optional(),
  notes: z.string().min(1).max(2000).nullable().optional(),
  capturedAt: z.string().min(1).max(255).nullable().optional(),
  evidence: z.array(agencyComparisonEvidenceSchema).default([]),
}).strict();

export const agencyComparisonPayloadSchema = z.object({
  comparisonKind: agencyComparisonKindSchema,
  title: z.string().min(1).max(255),
  summary: z.string().min(1).max(4000).nullable().optional(),
  locationSummary: z.string().min(1).max(255).nullable().optional(),
  comparedAt: z.string().min(1).max(255).nullable().optional(),
  sortHint: z.string().min(1).max(255).nullable().optional(),
  recommendations: z.array(z.string().min(1).max(500)).default([]),
  options: z.array(agencyComparisonOptionSchema).min(1).max(100),
}).strict();

export type AgencyComparisonIntent = z.infer<typeof agencyComparisonIntentSchema>;
export type AgencyComparisonKind = z.infer<typeof agencyComparisonKindSchema>;
export type AgencyComparisonPayload = z.infer<typeof agencyComparisonPayloadSchema>;
export type AgencyComparisonOption = z.infer<typeof agencyComparisonOptionSchema>;
export type AgencyComparisonEvidence = z.infer<typeof agencyComparisonEvidenceSchema>;

const availabilityAliasMap: Record<string, AgencyComparisonOption["availabilityState"]> = {
  available: "available",
  available_now: "available",
  open: "available",
  in_stock: "available",
  limited: "limited",
  few_left: "limited",
  low_inventory: "limited",
  sold_out: "sold_out",
  unavailable: "sold_out",
  not_available: "sold_out",
  waitlist: "waitlist",
  wait_list: "waitlist",
  unknown: "unknown",
};

const distanceUnitAliasMap = {
  m: "m",
  meter: "m",
  meters: "m",
  km: "km",
  kilometer: "km",
  kilometers: "km",
  mi: "mi",
  mile: "mi",
  miles: "mi",
} satisfies Record<string, "m" | "km" | "mi">;

const comparisonKindAliasMap = {
  research: "research",
  research_report: "research",
  ticket: "ticket",
  ticket_comparison: "ticket",
  hotel: "hotel",
  hotel_comparison: "hotel",
  shortlist: "shortlist",
} satisfies Record<string, AgencyComparisonKind>;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const normalized = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function readFirstBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "refundable"].includes(normalized)) return true;
      if (["false", "no", "non_refundable", "non-refundable"].includes(normalized)) return false;
    }
  }
  return null;
}

function normalizeAvailabilityState(value: unknown): AgencyComparisonOption["availabilityState"] {
  if (typeof value !== "string") return "unknown";
  return availabilityAliasMap[value.trim().toLowerCase()] ?? "unknown";
}

function normalizeDistanceUnit(value: string | null): "m" | "km" | "mi" | undefined {
  if (!value) return undefined;
  return distanceUnitAliasMap[value.trim().toLowerCase() as keyof typeof distanceUnitAliasMap];
}

function normalizeComparisonKind(
  value: string | null,
  fallbackKind?: AgencyComparisonKind | null,
): AgencyComparisonKind {
  if (value) {
    const normalized = comparisonKindAliasMap[value.trim().toLowerCase() as keyof typeof comparisonKindAliasMap];
    if (normalized) return normalized;
  }
  return fallbackKind ?? "research";
}

function normalizeEvidenceEntry(value: unknown): AgencyComparisonEvidence | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { label: trimmed };
  }

  const record = toRecord(value);
  const label = readFirstString(record, ["label", "title", "name", "sourceTitle"]);
  if (!label) return null;

  return agencyComparisonEvidenceSchema.parse({
    label,
    url: readFirstString(record, ["url", "sourceUrl", "source_url"]),
    snippet: readFirstString(record, ["snippet", "summary", "supportSummary", "support_summary"]),
    sourceId: readFirstString(record, ["sourceId", "source_id", "documentId", "document_id"]),
  });
}

function normalizeOption(
  value: unknown,
): AgencyComparisonOption | null {
  const record = toRecord(value);
  const vendor = readFirstString(record, ["vendor", "provider", "merchant", "brand"]);
  const optionTitle = readFirstString(record, ["optionTitle", "option_title", "title", "name"]);
  if (!vendor || !optionTitle) {
    return null;
  }

  const evidence = Array.isArray(record.evidence)
    ? record.evidence
      .map((entry) => normalizeEvidenceEntry(entry))
      .filter((entry): entry is AgencyComparisonEvidence => entry !== null)
    : [];

  return agencyComparisonOptionSchema.parse({
    optionId: readFirstString(record, ["optionId", "option_id", "id"]),
    vendor,
    optionTitle,
    optionUrl: readFirstString(record, ["optionUrl", "option_url", "url"]),
    price: readFirstNumber(record, ["price", "priceAmount", "price_amount", "amount"]),
    currency: readFirstString(record, ["currency", "currencyCode", "currency_code"]),
    priceLabel: readFirstString(record, ["priceLabel", "price_label", "displayPrice", "display_price"]),
    distance: readFirstNumber(record, ["distance", "distanceMeters", "distance_meters", "distanceValue", "distance_value"]),
    distanceUnit: normalizeDistanceUnit(readFirstString(record, ["distanceUnit", "distance_unit", "distanceUnits", "distance_units"])),
    distanceLabel: readFirstString(record, ["distanceLabel", "distance_label"]),
    locationSummary: readFirstString(record, ["locationSummary", "location_summary", "location"]),
    availabilityState: normalizeAvailabilityState(
      record.availabilityState ?? record.availability_state ?? record.availability,
    ),
    refundable: readFirstBoolean(record, ["refundable", "isRefundable", "is_refundable"]),
    bookingLink: readFirstString(record, ["bookingLink", "booking_link", "deepLink", "deep_link"]),
    notes: readFirstString(record, ["notes", "note"]),
    capturedAt: readFirstString(record, ["capturedAt", "captured_at"]),
    evidence,
  });
}

export function comparisonKindFromIntent(intent: string | null | undefined): AgencyComparisonKind | null {
  switch (intent) {
    case "research_report":
      return "research";
    case "ticket_comparison":
      return "ticket";
    case "hotel_comparison":
      return "hotel";
    case "shortlist":
      return "shortlist";
    default:
      return null;
  }
}

export function normalizeAgencyComparisonPayload(
  value: unknown,
  fallbackKind?: AgencyComparisonKind | null,
): AgencyComparisonPayload | null {
  const record = toRecord(value);
  const optionsSource = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.rows)
      ? record.rows
      : Array.isArray(record.items)
        ? record.items
        : [];
  const options = optionsSource
    .map((entry) => normalizeOption(entry))
    .filter((entry): entry is AgencyComparisonOption => entry !== null);

  const title = readFirstString(record, ["title", "comparisonTitle", "comparison_title"]);
  const comparisonKind = readFirstString(record, ["comparisonKind", "comparison_kind"]);

  if (!title || options.length === 0) {
    return null;
  }

  return agencyComparisonPayloadSchema.parse({
    comparisonKind: normalizeComparisonKind(comparisonKind, fallbackKind),
    title,
    summary: readFirstString(record, ["summary", "executiveSummary", "executive_summary"]),
    locationSummary: readFirstString(record, ["locationSummary", "location_summary"]),
    comparedAt: readFirstString(record, ["comparedAt", "compared_at", "capturedAt", "captured_at"]),
    sortHint: readFirstString(record, ["sortHint", "sort_hint"]),
    recommendations: Array.isArray(record.recommendations)
      ? record.recommendations.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    options,
  });
}
