export interface StoryboardHistoryProductFilter {
  productId: string;
  itemId: string;
  shopId: string;
  sourceUrl: string;
  productName: string;
  runId: string;
}

function compactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function recordFromValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringifyValue(value: unknown, visited = new WeakSet<object>()): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object") return "";
  if (visited.has(value)) return "";
  visited.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item, visited)).join(" ");
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key} ${stringifyValue(item, visited)}`)
    .join(" ");
}

function pushRecord(records: Record<string, unknown>[], value: unknown): void {
  const record = recordFromValue(value);
  if (record) records.push(record);
}

function collectDraftProductContexts(draft: unknown): Record<string, unknown>[] {
  const draftRecord = recordFromValue(draft);
  if (!draftRecord) return [];
  const records: Record<string, unknown>[] = [];
  pushRecord(records, draftRecord.marketplaceContext);
  pushRecord(records, draftRecord.marketplaceProduct);
  pushRecord(records, draftRecord);

  const tasks = Array.isArray(draftRecord.tasks) ? draftRecord.tasks : [];
  for (const taskValue of tasks) {
    const task = recordFromValue(taskValue);
    if (!task) continue;
    pushRecord(records, task.marketplaceProduct);
    const storyboardContext = recordFromValue(task.storyboardContext);
    const storyboardExtraParams = recordFromValue(storyboardContext?.extraParams);
    pushRecord(records, storyboardExtraParams?.marketplaceContext);
    pushRecord(records, storyboardExtraParams);
    const generationExtraParams = recordFromValue(task.generationExtraParams);
    pushRecord(records, generationExtraParams?.marketplaceContext);
    pushRecord(records, generationExtraParams);
  }
  return records;
}

function collectTaskProductContexts(taskValue: unknown): Record<string, unknown>[] {
  const task = recordFromValue(taskValue);
  if (!task) return [];
  const records: Record<string, unknown>[] = [];
  pushRecord(records, task.marketplaceContext);
  pushRecord(records, task.marketplaceProduct);
  pushRecord(records, task.metadata);
  const parameters = recordFromValue(task.parameters);
  const extraParams = recordFromValue(parameters?.extraParams);
  const snakeExtraParams = recordFromValue(parameters?.extra_params);
  pushRecord(records, parameters?.marketplaceContext);
  pushRecord(records, parameters?.marketplaceProduct);
  pushRecord(records, extraParams?.marketplaceContext);
  pushRecord(records, extraParams);
  pushRecord(records, snakeExtraParams?.marketplaceContext);
  pushRecord(records, snakeExtraParams);
  pushRecord(records, parameters);
  const resultData = recordFromValue(task.resultData);
  pushRecord(records, resultData?.marketplaceContext);
  pushRecord(records, resultData?.transportMetadata);
  pushRecord(records, resultData);
  pushRecord(records, task);
  return records;
}

function firstNonEmpty(records: Record<string, unknown>[], keys: string[]): string {
  for (const record of records) {
    for (const key of keys) {
      const text = compactText(record[key]);
      if (text) return text;
    }
  }
  return "";
}

function recordHasExactValue(record: Record<string, unknown>, keys: string[], expected: string): boolean {
  const needle = expected.trim().toLowerCase();
  if (!needle) return false;
  return keys.some((key) => compactText(record[key]).toLowerCase() === needle);
}

export function getStoryboardHistoryProductFilter(draft: unknown): StoryboardHistoryProductFilter | null {
  const contexts = collectDraftProductContexts(draft);
  if (contexts.length === 0) return null;
  const filter: StoryboardHistoryProductFilter = {
    productId: firstNonEmpty(contexts, ["productId", "marketplaceProductId", "product_id", "marketplace_product_id", "__marketplace_product_id"]),
    itemId: firstNonEmpty(contexts, ["itemId", "productItemId", "externalProductId", "product_item_id", "external_product_id"]),
    shopId: firstNonEmpty(contexts, ["shopId", "externalShopId", "productShopId", "product_shop_id", "external_shop_id"]),
    sourceUrl: firstNonEmpty(contexts, ["sourceUrl", "productSourceUrl", "product_source_url"]),
    productName: firstNonEmpty(contexts, ["productName", "productTitle", "title", "product_title"]),
    runId: firstNonEmpty(contexts, ["autoReviewRunId", "marketplaceAutoReviewRunId", "auto_review_run_id", "marketplace_auto_review_run_id", "__auto_review_run_id"]),
  };
  return Object.values(filter).some(Boolean) ? filter : null;
}

export function storyboardHistoryTaskMatchesProduct(task: unknown, filter: StoryboardHistoryProductFilter): boolean {
  const contexts = collectTaskProductContexts(task);
  for (const context of contexts) {
    if (recordHasExactValue(context, ["productId", "marketplaceProductId", "product_id", "marketplace_product_id", "__marketplace_product_id"], filter.productId)) return true;
    if (recordHasExactValue(context, ["itemId", "productItemId", "externalProductId", "product_item_id", "external_product_id"], filter.itemId)) return true;
    if (recordHasExactValue(context, ["shopId", "externalShopId", "productShopId", "product_shop_id", "external_shop_id"], filter.shopId)) return true;
    if (recordHasExactValue(context, ["sourceUrl", "productSourceUrl", "product_source_url"], filter.sourceUrl)) return true;
    if (recordHasExactValue(context, ["autoReviewRunId", "marketplaceAutoReviewRunId", "auto_review_run_id", "marketplace_auto_review_run_id", "__auto_review_run_id"], filter.runId)) return true;
  }

  const text = stringifyValue(task).toLowerCase();
  if (!text) return false;
  const exactNeedles = [filter.productId, filter.itemId, filter.shopId, filter.sourceUrl, filter.runId]
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (exactNeedles.some((needle) => text.includes(needle))) return true;
  const productName = filter.productName.trim().toLowerCase();
  return productName.length >= 8 && text.includes(productName);
}
