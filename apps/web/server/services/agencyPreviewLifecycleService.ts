import { and, eq, lt, ne, or, isNull } from "drizzle-orm";

import { db } from "../db";
import { agencyRunArtifacts } from "../../drizzle/schema";

type DbClient = typeof db;

export const AGENCY_PREVIEW_RETENTION_DAYS = 7;

export async function expireRunPreviewArtifacts(params: {
  runId: string;
  tenantId: string;
  now?: Date;
  dbClient?: DbClient;
}): Promise<number> {
  const now = params.now ?? new Date();
  const cutoff = new Date(now.getTime() - AGENCY_PREVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const dbClient = params.dbClient ?? db;

  const expiredRows = await dbClient
    .update(agencyRunArtifacts)
    .set({
      state: "expired_preview",
      expiredAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(agencyRunArtifacts.runId, params.runId),
      eq(agencyRunArtifacts.tenantId, params.tenantId),
      ne(agencyRunArtifacts.commitStatus, "committed"),
      lt(agencyRunArtifacts.createdAt, cutoff),
      or(
        eq(agencyRunArtifacts.state, "preview_generated"),
        eq(agencyRunArtifacts.state, "commit_failed"),
        eq(agencyRunArtifacts.state, "commit_pending"),
      ),
      or(
        isNull(agencyRunArtifacts.expiredAt),
        lt(agencyRunArtifacts.expiredAt, now),
      ),
    ))
    .returning({ id: agencyRunArtifacts.id });

  return expiredRows.length;
}

export function recordAgencyPreviewMetric(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.info("[AgencyPreviewMetric]", JSON.stringify({ event, ...payload }));
}
