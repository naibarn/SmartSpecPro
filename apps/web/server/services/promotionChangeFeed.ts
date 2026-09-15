export type PromotionChange = {
  sourceWatermark: string;
  tableName: string;
  sourceKey: string;
  operation: "insert" | "update" | "delete";
  rowVersion: string;
  rowJson?: Record<string, unknown>;
  deleteTombstone?: boolean;
};

export interface PromotionChangeFeed {
  readonly mode: "logical_replication" | "ordered_change_feed";
  readBatch(input: { afterWatermark?: string; limit: number }): Promise<{ changes: PromotionChange[]; nextWatermark: string | null }>;
}

/** A timestamp-only poller is not a valid promotion source. */
export function assertPromotionChangeFeed(feed: PromotionChangeFeed): void {
  if (feed.mode !== "logical_replication" && feed.mode !== "ordered_change_feed") {
    throw new Error("PROMOTION_CHANGE_FEED_UNSUPPORTED");
  }
}

export function validateChangeBatch(changes: PromotionChange[], afterWatermark?: string): void {
  if (!Array.isArray(changes)) throw new Error("PROMOTION_CHANGE_INCOMPLETE");
  let previous: string | undefined;
  for (const change of changes) {
    if (!change.tableName || !change.sourceKey || !change.sourceWatermark || !change.rowVersion) {
      throw new Error("PROMOTION_CHANGE_INCOMPLETE");
    }
    if (previous && change.sourceWatermark <= previous) {
      throw new Error("PROMOTION_WATERMARK_NOT_MONOTONIC");
    }
    if (afterWatermark && change.sourceWatermark <= afterWatermark) {
      throw new Error("PROMOTION_WATERMARK_NOT_AFTER_CHECKPOINT");
    }
    if (change.operation === "delete" && change.deleteTombstone !== true) {
      throw new Error("PROMOTION_DELETE_TOMBSTONE_REQUIRED");
    }
    previous = change.sourceWatermark;
  }
}
