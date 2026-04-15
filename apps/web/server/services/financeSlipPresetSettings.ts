import { and, eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import {
  DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
  applyFinanceSlipMappingPresetToDraft,
  financeSlipMappingPresetCollectionSchema,
  findBestFinanceSlipMappingPreset,
  type FinanceSlipMappingPreset,
  type FinanceStructuredDraft,
} from "../../shared/finance";
import { getDb } from "../db";

const CATEGORY = "finance" as const;
const KEY_SLIP_MAPPING_PRESETS = "slip_mapping_presets";
const CACHE_TTL_MS = 30_000;

type SettingsRow = {
  key: string;
  value: string | null;
  valueJson: unknown | null;
  isSensitive: boolean | null;
};

let cachedPresets: FinanceSlipMappingPreset[] | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<FinanceSlipMappingPreset[]> | null = null;

function parsePresetCollection(raw: SettingsRow | undefined): FinanceSlipMappingPreset[] {
  if (!raw) {
    return [];
  }

  const candidates: unknown[] = [];
  if (typeof raw.value === "string" && raw.value.trim()) {
    try {
      candidates.push(JSON.parse(raw.value));
    } catch {
      // fall through to valueJson
    }
  }
  if (raw.valueJson && typeof raw.valueJson === "object") {
    candidates.push(raw.valueJson);
  }

  for (const candidate of candidates) {
    const parsed = financeSlipMappingPresetCollectionSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data.presets;
    }
  }

  return [];
}

function loadPresetFromRow(row?: SettingsRow): FinanceSlipMappingPreset[] {
  const parsed = parsePresetCollection(row);
  return parsed.length > 0 ? parsed : DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
}

async function loadFinanceSlipMappingPresets(): Promise<FinanceSlipMappingPreset[]> {
  try {
    const db = await getDb();
    if (!db) {
      return DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
    }

    const [row] = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        valueJson: systemSettings.valueJson,
        isSensitive: systemSettings.isSensitive,
      })
      .from(systemSettings)
      .where(and(
        eq(systemSettings.category, CATEGORY),
        eq(systemSettings.key, KEY_SLIP_MAPPING_PRESETS),
      ))
      .limit(1);

    return loadPresetFromRow(row as SettingsRow | undefined);
  } catch {
    return DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
  }
}

export async function getFinanceSlipMappingPresets(): Promise<FinanceSlipMappingPreset[]> {
  const now = Date.now();
  if (cachedPresets && now < cacheExpiresAt) {
    return cachedPresets;
  }

  if (!refreshPromise) {
    refreshPromise = loadFinanceSlipMappingPresets()
      .then((presets) => {
        cachedPresets = presets;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return presets;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function getFinanceSlipMappingPresetsSnapshot(): FinanceSlipMappingPreset[] {
  return cachedPresets ?? DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
}

export function clearFinanceSlipMappingPresetCache(): void {
  cachedPresets = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}

export function applyFinanceSlipMappingPresetsToDraft(
  draft: FinanceStructuredDraft,
  text: string,
  presets: FinanceSlipMappingPreset[] = getFinanceSlipMappingPresetsSnapshot(),
): FinanceStructuredDraft {
  const matchedPreset = findBestFinanceSlipMappingPreset({
    text,
    counterpartyName: draft.counterpartyName ?? null,
    merchantName: draft.merchantName ?? null,
    paymentSourceName: draft.paymentSourceName ?? null,
    paymentDestinationName: draft.paymentDestinationName ?? null,
    paymentSourceLabel: draft.paymentSourceLabel ?? null,
    paymentDestinationLabel: draft.paymentDestinationLabel ?? null,
    slipReference: draft.slipReference ?? null,
    merchantId: draft.merchantId ?? null,
  }, presets);
  if (!matchedPreset) {
    return draft;
  }
  return applyFinanceSlipMappingPresetToDraft(draft, matchedPreset);
}

export async function applyFinanceSlipMappingPresetsToDraftAsync(
  draft: FinanceStructuredDraft,
  text: string,
): Promise<FinanceStructuredDraft> {
  return applyFinanceSlipMappingPresetsToDraft(draft, text, await getFinanceSlipMappingPresets());
}
