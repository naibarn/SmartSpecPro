export type LegacyQuotaWindow = "hourly" | "daily" | "weekly" | "monthly";
export type LegacyQuotaCounter = {
  apiKeyId: string;
  window: LegacyQuotaWindow;
  periodKey: string;
  requestCount: number;
  ttlSeconds: number;
};
export type LegacyQuotaWarning = {
  apiKeyId: string;
  window: LegacyQuotaWindow;
  periodKey: string;
};
export type QuotaImportRow = LegacyQuotaCounter & {
  tenantId: string;
  warned: boolean;
  expiresAt: Date;
};

export type QuotaReconciliationResult = {
  missingRows: number;
  lowerCounters: number;
  missingWarnings: number;
  tenantMismatches: number;
};

/**
 * Verify that PostgreSQL contains at least the Redis snapshot state after an
 * import. Higher PostgreSQL counters and PostgreSQL-only rows are preserved.
 */
export function reconcileLegacyQuotaSnapshot(input: {
  expectedRows: QuotaImportRow[];
  postgresRows: Array<{
    apiKeyId: string;
    tenantId: string;
    window: LegacyQuotaWindow;
    periodKey: string;
    requestCount: number;
    warned: boolean;
  }>;
}): QuotaReconciliationResult {
  const actualByIdentity = new Map(
    input.postgresRows.map(row => [
      `${row.apiKeyId}:${row.window}:${row.periodKey}`,
      row,
    ])
  );
  let missingRows = 0;
  let lowerCounters = 0;
  let missingWarnings = 0;
  let tenantMismatches = 0;
  for (const expected of input.expectedRows) {
    const identity = `${expected.apiKeyId}:${expected.window}:${expected.periodKey}`;
    const actual = actualByIdentity.get(identity);
    if (!actual) {
      missingRows++;
      continue;
    }
    if (actual.tenantId !== expected.tenantId) tenantMismatches++;
    if (actual.requestCount < expected.requestCount) lowerCounters++;
    if (expected.warned && !actual.warned) missingWarnings++;
  }
  return { missingRows, lowerCounters, missingWarnings, tenantMismatches };
}

const windowCode: Record<string, LegacyQuotaWindow> = {
  h: "hourly",
  d: "daily",
  w: "weekly",
  m: "monthly",
};
const codeForWindow = Object.fromEntries(
  Object.entries(windowCode).map(([code, window]) => [window, code])
) as Record<LegacyQuotaWindow, string>;

export function currentQuotaPeriod(
  window: LegacyQuotaWindow,
  now: Date
): string {
  if (window === "hourly") return String(Math.floor(now.getTime() / 3_600_000));
  if (window === "daily") return now.toISOString().slice(0, 10);
  if (window === "monthly") return now.toISOString().slice(0, 7);
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.ceil((dayOfYear + jan1.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function parseLegacyKey(
  key: string,
  kind: "counter" | "warning"
): { apiKeyId: string; window: LegacyQuotaWindow; periodKey: string } | null {
  const prefix = kind === "counter" ? "quota:apikey:" : "quota:warn:";
  if (!key.startsWith(prefix)) return null;
  const parts = key.slice(prefix.length).split(":");
  if (parts.length !== 3 || !parts[0] || !windowCode[parts[1]] || !parts[2]) {
    return null;
  }
  return {
    apiKeyId: parts[0],
    window: windowCode[parts[1]],
    periodKey: parts[2],
  };
}

export function buildLegacyQuotaImportPlan(input: {
  counterKeys: Array<{ key: string; value: string | null; ttlSeconds: number }>;
  warningKeys: Array<{ key: string; value: string | null }>;
  tenantByApiKeyId: Map<string, string>;
  now: Date;
}): {
  rows: QuotaImportRow[];
  malformedKeys: number;
  staleCounters: number;
  orphanWarnings: number;
  unknownApiKeys: number;
} {
  const rows: QuotaImportRow[] = [];
  let malformedKeys = 0;
  let staleCounters = 0;
  let orphanWarnings = 0;
  let unknownApiKeys = 0;
  const warningIdentities = new Set<string>();
  for (const item of input.warningKeys) {
    if (item.value !== "1") continue;
    const parsed = parseLegacyKey(item.key, "warning");
    if (!parsed) {
      malformedKeys++;
      continue;
    }
    if (parsed.periodKey !== currentQuotaPeriod(parsed.window, input.now))
      continue;
    warningIdentities.add(
      `${parsed.apiKeyId}:${parsed.window}:${parsed.periodKey}`
    );
  }

  const seen = new Set<string>();
  for (const item of input.counterKeys) {
    const parsed = parseLegacyKey(item.key, "counter");
    if (
      !parsed ||
      item.value === null ||
      !Number.isSafeInteger(Number(item.value)) ||
      Number(item.value) < 1
    ) {
      malformedKeys++;
      continue;
    }
    if (parsed.periodKey !== currentQuotaPeriod(parsed.window, input.now)) {
      staleCounters++;
      continue;
    }
    const identity = `${parsed.apiKeyId}:${parsed.window}:${parsed.periodKey}`;
    if (seen.has(identity)) {
      malformedKeys++;
      continue;
    }
    seen.add(identity);
    const tenantId = input.tenantByApiKeyId.get(parsed.apiKeyId);
    if (!tenantId) {
      unknownApiKeys++;
      continue;
    }
    const warned = warningIdentities.delete(identity);
    const fallbackTtl =
      parsed.window === "hourly"
        ? 7200
        : parsed.window === "daily"
          ? 172800
          : parsed.window === "weekly"
            ? 691200
            : 2764800;
    const ttlSeconds = item.ttlSeconds > 0 ? item.ttlSeconds : fallbackTtl;
    rows.push({
      ...parsed,
      tenantId,
      requestCount: Number(item.value),
      ttlSeconds,
      warned,
      expiresAt: new Date(input.now.getTime() + ttlSeconds * 1000),
    });
  }
  orphanWarnings = warningIdentities.size;
  return { rows, malformedKeys, staleCounters, orphanWarnings, unknownApiKeys };
}

export function legacyCounterKey(
  apiKeyId: string,
  window: LegacyQuotaWindow,
  periodKey: string
): string {
  return `quota:apikey:${apiKeyId}:${codeForWindow[window]}:${periodKey}`;
}

export function legacyWarningKey(
  apiKeyId: string,
  window: LegacyQuotaWindow,
  periodKey: string
): string {
  return `quota:warn:${apiKeyId}:${codeForWindow[window]}:${periodKey}`;
}
