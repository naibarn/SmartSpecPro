import {
  buildMarketplaceCapabilitySummary,
  createRecordedShopeeMcpProbe,
  discoverMarketplaceFieldCoverage,
  type MarketplaceProbeItem,
  type MarketplaceProbeResult,
} from "../../shared/marketplaceMcpProbeFixture";

export type ShopeeLiveProbeInput = {
  keyword: string;
  region: string;
  locale: string;
  limit: number;
};

export type ShopeeLiveConnectorRuntimeConfig = {
  liveProbeUrl: string;
  liveProbeToken?: string;
  fixtureFallbackEnabled?: boolean;
};

export type ShopeeLiveConnectorReadiness = {
  configured: boolean;
  ready: boolean;
  endpointHost: string | null;
  tokenConfigured: boolean;
  fixtureFallbackEnabled: boolean;
  blockingReason: string | null;
};

export class ShopeeLiveConnectorError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 503) {
    super(message);
    this.name = "ShopeeLiveConnectorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstString(...values: unknown[]): string | null {
  const value = firstValue(...values);
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  const value = firstValue(...values);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeShopeePrice(value: unknown): number | null {
  const price = firstNumber(value);
  if (price === null) return null;
  if (price >= 1_000_000) return Math.round((price / 100000) * 100) / 100;
  return price;
}

function firstBoolean(...values: unknown[]): boolean {
  const value = firstValue(...values);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return false;
}

function firstArrayLength(value: unknown): number | null {
  return Array.isArray(value) ? Number(value[0] || 0) : null;
}

function unwrapItem(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const itemBasic = raw.item_basic;
  const itemData = raw.item_data;
  if (isRecord(itemBasic) && !itemData) {
    return {
      ...raw,
      item_data: {
        ...itemBasic,
        item_card_display_price: {
          price: itemBasic.price,
          original_price: itemBasic.price_before_discount,
          strikethrough_price: itemBasic.price_before_discount,
          discount: itemBasic.raw_discount,
        },
        item_card_display_sold_count: {
          historical_sold_count: itemBasic.historical_sold,
          monthly_sold_count: itemBasic.sold,
        },
        item_rating: {
          rating_star: itemBasic.item_rating ? getPath(itemBasic, "item_rating.rating_star") : itemBasic.rating_star,
          rating_count: itemBasic.item_rating ? getPath(itemBasic, "item_rating.rating_count") : itemBasic.rating_count,
        },
        shop_data: {
          shop_name: itemBasic.shop_name,
        },
        global_brand: {
          display_name: itemBasic.brand,
        },
        shopee_verified: itemBasic.shopee_verified,
      },
      item_card_displayed_asset: {
        name: itemBasic.name,
        image: itemBasic.image,
        images: itemBasic.images,
        sold_count: { text: itemBasic.sold_text },
        rating: { rating_text: itemBasic.rating_star },
        shop_location: itemBasic.shop_location,
        estimated_delivery_time: {
          estimated_delivery_time_text: itemBasic.estimated_delivery_time_text,
        },
      },
      search_item_tracking: {
        merge_rank: raw.merge_rank,
        matched_keywords: raw.matched_keywords,
        relevance_level: raw.relevance_level,
        item_type_str: raw.item_type_str,
      },
    };
  }
  return raw;
}

function extractRawItems(payload: unknown): Record<string, unknown>[] {
  const root = isRecord(payload) ? payload : {};
  const candidateArrays = [
    root.items,
    root.results,
    root.data && isRecord(root.data) ? root.data.items : undefined,
    root.data && isRecord(root.data) ? root.data.results : undefined,
    root.response && isRecord(root.response) ? root.response.items : undefined,
  ];
  const items = candidateArrays.find(Array.isArray);
  if (!Array.isArray(items)) return [];
  return items.map(unwrapItem).filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeLiveItem(raw: Record<string, unknown>, rank: number): MarketplaceProbeItem {
  const price = normalizeShopeePrice(firstValue(
    getPath(raw, "item_data.item_card_display_price.price"),
    getPath(raw, "item_card_displayed_asset.display_price.price"),
    raw.price,
  ));
  const originalPrice = normalizeShopeePrice(firstValue(
    getPath(raw, "item_data.item_card_display_price.original_price"),
    getPath(raw, "item_data.item_card_display_price.strikethrough_price"),
    raw.price_before_discount,
  ));
  const itemId = firstNumber(getPath(raw, "item_data.itemid"), raw.itemid, raw.item_id) ?? 0;
  const shopId = firstNumber(getPath(raw, "item_data.shopid"), raw.shopid, raw.shop_id) ?? 0;
  return {
    rank,
    title: firstString(getPath(raw, "item_card_displayed_asset.name"), raw.name, raw.title) ?? "",
    sellerName: firstString(getPath(raw, "item_data.shop_data.shop_name"), raw.shop_name, raw.sellerName) ?? "",
    brand: firstString(getPath(raw, "item_data.global_brand.display_name"), raw.brand, raw.brandName),
    price: price ?? 0,
    originalPrice,
    discount: firstNumber(getPath(raw, "item_data.item_card_display_price.discount"), raw.raw_discount, raw.discount),
    monthlySoldCount: firstNumber(getPath(raw, "item_data.item_card_display_sold_count.monthly_sold_count"), raw.sold, raw.monthly_sold_count),
    historicalSoldCount: firstNumber(getPath(raw, "item_data.item_card_display_sold_count.historical_sold_count"), raw.historical_sold, raw.historical_sold_count),
    rating: firstNumber(getPath(raw, "item_data.item_rating.rating_star"), raw.rating_star, raw.rating),
    reviewCount: firstNumber(getPath(raw, "item_data.item_rating.rating_count"), raw.review_count) ?? firstArrayLength(getPath(raw, "item_data.item_rating.rating_count")),
    shopeeVerified: firstBoolean(getPath(raw, "item_data.shopee_verified"), raw.shopee_verified, raw.officialStore),
    estimatedDeliveryTimeText: firstString(
      getPath(raw, "item_card_displayed_asset.estimated_delivery_time.estimated_delivery_time_text"),
      raw.estimated_delivery_time_text,
    ),
    image: firstString(getPath(raw, "item_card_displayed_asset.image"), raw.image),
    itemId,
    shopId,
    raw,
  };
}

function looksLikeProbeResult(value: unknown): value is MarketplaceProbeResult {
  return isRecord(value)
    && value.provider === "shopee"
    && Array.isArray(value.items)
    && Array.isArray(value.fieldCoverage)
    && isRecord(value.capabilitySummary);
}

function normalizeLiveProbePayload(payload: unknown, input: ShopeeLiveProbeInput, latencyMs: number): MarketplaceProbeResult {
  const maybeProbe = isRecord(payload) && looksLikeProbeResult(payload.probe) ? payload.probe : payload;
  if (looksLikeProbeResult(maybeProbe)) {
    return {
      ...maybeProbe,
      source: "live_mcp",
      keyword: input.keyword,
      region: input.region,
      locale: input.locale,
      latencyMs,
      capturedAt: new Date().toISOString(),
      sourceCapturedAt: maybeProbe.sourceCapturedAt || new Date().toISOString(),
      notes: [
        ...(Array.isArray(maybeProbe.notes) ? maybeProbe.notes : []),
        "Fetched from configured live Shopee connector endpoint.",
      ],
    };
  }

  const rawItems = extractRawItems(payload).slice(0, input.limit);
  if (!rawItems.length) {
    throw new ShopeeLiveConnectorError(
      "live_connector_empty_response",
      "Live Shopee connector returned no search items for this keyword.",
      502,
    );
  }
  const fieldCoverage = discoverMarketplaceFieldCoverage(rawItems);
  return {
    provider: "shopee",
    source: "live_mcp",
    keyword: input.keyword,
    region: input.region,
    locale: input.locale,
    capturedAt: new Date().toISOString(),
    sourceCapturedAt: new Date().toISOString(),
    capabilityVersion: "shopee-search.live-connector.v1",
    itemCount: rawItems.length,
    latencyMs,
    items: rawItems.map((item, index) => normalizeLiveItem(item, index + 1)),
    fieldCoverage,
    capabilitySummary: buildMarketplaceCapabilitySummary(fieldCoverage),
    notes: ["Fetched from configured live Shopee connector endpoint."],
  };
}

function fixtureFallbackEnabled(config?: ShopeeLiveConnectorRuntimeConfig): boolean {
  if (config?.fixtureFallbackEnabled !== undefined) return config.fixtureFallbackEnabled;
  return process.env.NODE_ENV === "test";
}

export function isShopeeLiveConnectorConfigured(config?: ShopeeLiveConnectorRuntimeConfig): boolean {
  return Boolean((config?.liveProbeUrl || "").trim());
}

export function getShopeeLiveConnectorReadiness(config?: ShopeeLiveConnectorRuntimeConfig): ShopeeLiveConnectorReadiness {
  const endpoint = (config?.liveProbeUrl || "").trim();
  let endpointHost: string | null = null;
  if (endpoint) {
    try {
      endpointHost = new URL(endpoint).host;
    } catch {
      endpointHost = null;
    }
  }
  const configured = Boolean(endpoint && endpointHost);
  return {
    configured,
    ready: configured,
    endpointHost,
    tokenConfigured: Boolean((config?.liveProbeToken || "").trim()),
    fixtureFallbackEnabled: config?.fixtureFallbackEnabled === true,
    blockingReason: configured
      ? null
      : "Shopee MCP live execution endpoint is not attached to this user connection.",
  };
}

export async function fetchShopeeSearchProbe(
  input: ShopeeLiveProbeInput,
  options: { allowRecordedFallback?: boolean; config?: ShopeeLiveConnectorRuntimeConfig } = {},
): Promise<MarketplaceProbeResult> {
  const started = Date.now();
  const endpoint = (options.config?.liveProbeUrl || "").trim();
  const allowRecordedFallback = options.allowRecordedFallback ?? fixtureFallbackEnabled(options.config);
  if (!endpoint) {
    if (allowRecordedFallback) {
      return createRecordedShopeeMcpProbe({ ...input, latencyMs: Date.now() - started });
    }
    throw new ShopeeLiveConnectorError(
      "live_connector_not_configured",
      "Shopee MCP live execution is not attached to this user connection. Reconnect in Settings with a provider flow that returns an executable MCP session, then run Connector Lab live test again.",
    );
  }

  const token = (options.config?.liveProbeToken || "").trim();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ provider: "shopee", ...input }),
    });
  } catch (error) {
    throw new ShopeeLiveConnectorError(
      "live_connector_network_error",
      error instanceof Error ? error.message : "Could not reach the Shopee live connector endpoint.",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : `Shopee live connector returned HTTP ${response.status}.`;
    throw new ShopeeLiveConnectorError("live_connector_http_error", message, response.status >= 500 ? 502 : response.status);
  }
  return normalizeLiveProbePayload(payload, input, Date.now() - started);
}
