import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

import { marketplaceAutoReviewRuns } from "../../drizzle/schema";
import { getDb } from "../db";
import { listPublishingPages } from "./socialPublishingService";

function fail(code: "NOT_FOUND" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}

async function resolveDb() {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "Database not available");
  return db;
}

export async function getMarketplaceAutoReviewFacebookPagePreference(input: {
  tenantId: string;
  userId: number;
  runId: string;
}) {
  const db = await resolveDb();
  const [run] = await db.select({ metadataJson: marketplaceAutoReviewRuns.metadataJson })
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.id, input.runId),
      eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
      eq(marketplaceAutoReviewRuns.userId, input.userId),
    ))
    .limit(1);
  if (!run) fail("NOT_FOUND", "The Auto Review run is unavailable");

  const publishing = run.metadataJson?.facebookPublishing;
  const pageId = Number(publishing && typeof publishing === "object" ? publishing.selectedPageId : NaN);
  return { pageId: Number.isSafeInteger(pageId) && pageId > 0 ? pageId : null };
}

export async function saveMarketplaceAutoReviewFacebookPagePreference(input: {
  tenantId: string;
  userId: number;
  runId: string;
  pageId: number;
}) {
  const db = await resolveDb();
  const [run] = await db.select({ id: marketplaceAutoReviewRuns.id })
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.id, input.runId),
      eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
      eq(marketplaceAutoReviewRuns.userId, input.userId),
    ))
    .limit(1);
  if (!run) fail("NOT_FOUND", "The Auto Review run is unavailable");

  const page = (await listPublishingPages(input.tenantId, input.userId))
    .find(candidate => candidate.id === input.pageId && candidate.provider === "meta");
  if (!page?.publishingReady) {
    fail("PRECONDITION_FAILED", page?.publishingIssue ?? "Select an active Facebook Page with verified publishing permission");
  }

  const [updated] = await db.update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: sql`jsonb_set(
        COALESCE(${marketplaceAutoReviewRuns.metadataJson}, '{}'::jsonb),
        '{facebookPublishing}',
        CASE
          WHEN jsonb_typeof(${marketplaceAutoReviewRuns.metadataJson}->'facebookPublishing') = 'object'
            THEN ${marketplaceAutoReviewRuns.metadataJson}->'facebookPublishing'
          ELSE '{}'::jsonb
        END
          || jsonb_build_object('selectedPageId', ${input.pageId}),
        true
      )`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(marketplaceAutoReviewRuns.id, input.runId),
      eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
      eq(marketplaceAutoReviewRuns.userId, input.userId),
    ))
    .returning({ id: marketplaceAutoReviewRuns.id });
  if (!updated) fail("NOT_FOUND", "The Auto Review run is unavailable");
  return { pageId: input.pageId };
}
