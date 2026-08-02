import crypto from "node:crypto";

import { apiAuditEvents } from "../../drizzle/schema";
import { db } from "../db";
import { debugError } from "../_core/logger";

export const VD_SERIES_LOOK_LOCK_CHANGED_EVENT = "vd_series_look_lock_changed" as const;
export const VD_SERIES_LOOK_LOCK_APPLIED_EVENT = "vd_series_look_lock_applied" as const;

export type VdSeriesLookLockAuditEvent =
  | typeof VD_SERIES_LOOK_LOCK_CHANGED_EVENT
  | typeof VD_SERIES_LOOK_LOCK_APPLIED_EVENT;

type CommonAuditParams = {
  tenantId: string;
  userId: number;
  seriesId: number;
};

type ChangedAuditParams = CommonAuditParams & {
  eventType: typeof VD_SERIES_LOOK_LOCK_CHANGED_EVENT;
  mode: "inherit_source" | "genre" | "manual" | "none";
  revision: number;
  outcome: "updated" | "conflict";
};

type AppliedAuditParams = CommonAuditParams & {
  eventType: typeof VD_SERIES_LOOK_LOCK_APPLIED_EVENT;
  path: string;
};

export type RecordSeriesLookLockAuditEventParams =
  | ChangedAuditParams
  | AppliedAuditParams;

/**
 * Records Feature 139 adoption/path coverage without storing prompt fragments.
 * Audit failures are deliberately non-blocking for the underlying mutation or
 * render, matching the existing VD observability posture.
 */
export async function recordSeriesLookLockAuditEvent(
  params: RecordSeriesLookLockAuditEventParams,
): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: params.eventType,
      userId: params.userId,
      endpoint:
        params.eventType === VD_SERIES_LOOK_LOCK_CHANGED_EVENT
          ? "verticalDramaSeries.setSeriesLookLock"
          : `verticalDrama.${params.path}`,
      statusCode:
        params.eventType === VD_SERIES_LOOK_LOCK_CHANGED_EVENT
          ? params.outcome === "updated"
            ? 200
            : 409
          : 200,
      metadata: {
        tenantId: params.tenantId,
        seriesId: params.seriesId,
        ...(params.eventType === VD_SERIES_LOOK_LOCK_CHANGED_EVENT
          ? {
              mode: params.mode,
              revision: params.revision,
              outcome: params.outcome,
            }
          : { path: params.path }),
      },
    });
  } catch (error) {
    debugError(
      params.eventType,
      "Feature 139 audit write failed; continuing without blocking the request",
      error,
    );
  }
}

