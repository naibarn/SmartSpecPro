import { and, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { systemSettings } from "../../../drizzle/schema";
import { decrypt, encrypt } from "../crypto";

const CATEGORY = "billing_provider";

type SettingDefinition = {
  key: string;
  sensitive?: boolean;
  description: string;
};

const SETTING_DEFS: SettingDefinition[] = [
  { key: "apiBaseUrl", description: "Beam API base URL" },
  { key: "apiKey", sensitive: true, description: "Beam API key" },
  { key: "chargesPath", description: "Charges API path" },
  { key: "paymentLinksPath", description: "Payment Links API path" },
  { key: "chargeStatusPathTemplate", description: "Charge status path template" },
  { key: "paymentLinkStatusPathTemplate", description: "Payment Link status path template" },
  { key: "cancelPathSuffix", description: "Charge cancel suffix" },
  { key: "webhookSecretCurrent", sensitive: true, description: "Webhook secret current" },
  { key: "webhookSecretPrevious", sensitive: true, description: "Webhook secret previous" },
  { key: "paymentMethodSetupPath", description: "Payment method setup API path" },
  { key: "paymentMethodSetupHostedUrlTemplate", description: "Hosted setup URL template" },
  { key: "paymentMethodSetupReturnUrl", description: "Default setup return URL" },
  { key: "paymentMethodSetupCallbackSecretCurrent", sensitive: true, description: "Setup callback secret current" },
  { key: "paymentMethodSetupCallbackSecretPrevious", sensitive: true, description: "Setup callback secret previous" },
];

function maskValue(value: string, sensitive: boolean) {
  if (!value) return "";
  if (!sensitive) return value;
  return "*".repeat(Math.max(8, Math.min(24, value.length)));
}

async function readSettings() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, CATEGORY));
    return new Map(rows.map((row) => [row.key, row]));
  } catch {
    return new Map();
  }
}

export async function getBeamProviderRuntimeConfig() {
  const rows = await readSettings();
  const getValue = (key: string) => {
    const row = rows.get(key);
    if (row?.value) {
      return row.isSensitive ? decrypt(row.value) : row.value;
    }
    return null;
  };

  return {
    apiBaseUrl: getValue("apiBaseUrl"),
    apiKey: getValue("apiKey"),
    chargesPath: getValue("chargesPath") || "/v1/charges",
    paymentLinksPath: getValue("paymentLinksPath") || "/v1/payment_links",
    chargeStatusPathTemplate: getValue("chargeStatusPathTemplate") || "/v1/charges/{id}",
    paymentLinkStatusPathTemplate: getValue("paymentLinkStatusPathTemplate") || "/v1/payment_links/{id}",
    cancelPathSuffix: getValue("cancelPathSuffix") || "/cancel",
    webhookSecretCurrent: getValue("webhookSecretCurrent"),
    webhookSecretPrevious: getValue("webhookSecretPrevious"),
    paymentMethodSetupPath: getValue("paymentMethodSetupPath"),
    paymentMethodSetupHostedUrlTemplate: getValue("paymentMethodSetupHostedUrlTemplate"),
    paymentMethodSetupReturnUrl: getValue("paymentMethodSetupReturnUrl"),
    paymentMethodSetupCallbackSecretCurrent: getValue("paymentMethodSetupCallbackSecretCurrent") || getValue("webhookSecretCurrent"),
    paymentMethodSetupCallbackSecretPrevious: getValue("paymentMethodSetupCallbackSecretPrevious") || getValue("webhookSecretPrevious"),
  };
}

export async function getBeamProviderAdminSettings() {
  const rows = await readSettings();
  const result: Record<string, any> = {};
  for (const def of SETTING_DEFS) {
    const row = rows.get(def.key);
    const decrypted = row?.value ? (row.isSensitive ? decrypt(row.value) : row.value) : "";
    const effectiveValue = decrypted;
    result[def.key] = def.sensitive ? "" : effectiveValue;
    result[`${def.key}Configured`] = Boolean(effectiveValue);
    result[`${def.key}Masked`] = effectiveValue ? maskValue(effectiveValue, Boolean(def.sensitive)) : "";
    result[`${def.key}Source`] = row?.value ? "db" : "none";
  }
  return result;
}

export async function updateBeamProviderAdminSettings(input: Record<string, string | null | undefined>, actorUserId: number) {
  const db = getDb();
  const rows = await readSettings();

  for (const def of SETTING_DEFS) {
    const provided = input[def.key];
    if (provided === undefined) continue;
    const normalized = provided?.trim() ?? "";
    if (!normalized && def.sensitive) {
      continue;
    }
    const existing = rows.get(def.key);
    const storedValue = def.sensitive ? encrypt(normalized) : normalized;
    if (existing) {
      await db
        .update(systemSettings)
        .set({
          value: storedValue,
          isSensitive: Boolean(def.sensitive),
          description: def.description,
          updatedBy: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        category: CATEGORY,
        key: def.key,
        value: storedValue,
        isSensitive: Boolean(def.sensitive),
        description: def.description,
        updatedBy: actorUserId,
      });
    }
  }

  return getBeamProviderAdminSettings();
}

export async function testBeamProviderAdminSettings() {
  const config = await getBeamProviderRuntimeConfig();
  return {
    configured: Boolean(config.apiBaseUrl && config.apiKey),
    setupHostedConfigured: Boolean(config.paymentMethodSetupHostedUrlTemplate),
    setupApiConfigured: Boolean(config.apiBaseUrl && config.apiKey && config.paymentMethodSetupPath),
    webhookConfigured: Boolean(config.webhookSecretCurrent),
    paymentLinkConfigured: Boolean(config.paymentLinksPath && config.paymentLinkStatusPathTemplate),
    missing: [
      !config.apiBaseUrl ? "apiBaseUrl" : null,
      !config.apiKey ? "apiKey" : null,
      !config.webhookSecretCurrent ? "webhookSecretCurrent" : null,
    ].filter(Boolean),
  };
}
