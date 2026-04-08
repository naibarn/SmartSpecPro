import "dotenv/config";
import postgres from "postgres";
import { and, asc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { creditTransactions, skills } from "../drizzle/schema";
import {
  inferCreditTransactionSourceType,
  normalizeCreditTransactionSourceType,
  resolveCreditTransactionOriginSurface,
  type CreditTransactionOriginSurface,
  type CreditTransactionSourceInput,
  type CreditTransactionSourceType,
} from "../shared/creditTransactionSource";

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_LIMIT = 10;
const DEFAULT_DATABASE_URL = "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

const MEDIA_STUDIO_ENHANCE_PROMPT_SKILL_CATEGORIES = new Set<string>([
  "video_prompt_generation",
  "image_video_generation",
  "audio_generation",
  "sound_effects",
]);

export interface CreditTransactionBackfillRow extends CreditTransactionSourceInput {
  id: number;
  sourceType?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  skillSlug?: string | null;
  conversationId?: number | null;
  skillCategory?: string | null;
}

export interface CreditTransactionBackfillPatch {
  sourceType?: CreditTransactionSourceType;
  metadata?: Record<string, unknown>;
  reasons: string[];
}

interface BackfillOptions {
  apply: boolean;
  batchSize: number;
  limit: number | null;
  userId: number | null;
  startId: number;
}

function parseIntegerArg(prefix: string): number | null {
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw?.slice(prefix.length).trim();
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptions(): BackfillOptions {
  const batchSize = parseIntegerArg("--batch-size=") ?? DEFAULT_BATCH_SIZE;
  const limit = parseIntegerArg("--limit=");
  const userId = parseIntegerArg("--user-id=");
  const startId = parseIntegerArg("--start-id=") ?? 0;

  return {
    apply: process.argv.includes("--apply"),
    batchSize: batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
    limit: limit && limit > 0 ? limit : null,
    userId: userId && userId > 0 ? userId : null,
    startId: startId > 0 ? startId : 0,
  };
}

function asMetadataRecord(
  metadata: unknown,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Record<string, unknown>) };
}

function normalizeSkillCategory(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function shouldBackfillMediaStudioOrigin(
  row: CreditTransactionBackfillRow,
): boolean {
  if (row.conversationId != null) {
    return false;
  }

  const description = typeof row.description === "string"
    ? row.description.trim().toLowerCase()
    : "";
  const skillCategory = normalizeSkillCategory(row.skillCategory);

  // `executeCustomSkill` is currently wired only from Media Studio.
  if (description.includes("skill execution:")) {
    return true;
  }

  // `enhancePrompt` is shared with chat, so only backfill categories that are
  // Media Studio-specific in current routing. We intentionally skip
  // `image_prompt_generation` because chat can create those rows too.
  if (
    description.includes("auto prompt enhancement")
    && skillCategory
    && MEDIA_STUDIO_ENHANCE_PROMPT_SKILL_CATEGORIES.has(skillCategory)
  ) {
    return true;
  }

  return false;
}

export function buildCreditTransactionBackfillPatch(
  row: CreditTransactionBackfillRow,
): CreditTransactionBackfillPatch | null {
  const reasons: string[] = [];
  const existingSourceType = normalizeCreditTransactionSourceType(row.sourceType);
  const inferredSourceType = inferCreditTransactionSourceType(row);

  let nextSourceType: CreditTransactionSourceType | undefined;
  if (!existingSourceType && inferredSourceType) {
    nextSourceType = inferredSourceType;
    reasons.push(`backfill sourceType=${inferredSourceType}`);
  }

  const metadata = asMetadataRecord(row.metadata);
  let nextOriginSurface: CreditTransactionOriginSurface | null =
    resolveCreditTransactionOriginSurface(row);
  let metadataChanged = false;

  if (nextOriginSurface && metadata.originSurface !== nextOriginSurface) {
    metadata.originSurface = nextOriginSurface;
    metadataChanged = true;
    reasons.push(`normalize originSurface=${nextOriginSurface}`);
  }

  if (!nextOriginSurface && shouldBackfillMediaStudioOrigin(row)) {
    nextOriginSurface = "media_studio";
    metadata.originSurface = nextOriginSurface;
    metadataChanged = true;
    reasons.push("infer originSurface=media_studio");
  }

  if (!nextSourceType && !metadataChanged) {
    return null;
  }

  return {
    ...(nextSourceType ? { sourceType: nextSourceType } : {}),
    ...(metadataChanged ? { metadata } : {}),
    reasons,
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let sourceTypeBackfilled = 0;
  let originNormalized = 0;
  let mediaStudioBackfilled = 0;
  let lastId = options.startId;
  let remaining = options.limit;
  const samples: Array<Record<string, unknown>> = [];

  try {
    while (true) {
      const currentBatchSize = remaining == null
        ? options.batchSize
        : Math.min(options.batchSize, remaining);
      if (currentBatchSize <= 0) {
        break;
      }

      const conditions = [gt(creditTransactions.id, lastId)];
      if (options.userId != null) {
        conditions.push(eq(creditTransactions.userId, options.userId));
      }

      const rows = await db
        .select({
          id: creditTransactions.id,
          sourceType: creditTransactions.sourceType,
          description: creditTransactions.description,
          metadata: creditTransactions.metadata,
          skillSlug: creditTransactions.skillSlug,
          conversationId: creditTransactions.conversationId,
          skillCategory: skills.category,
        })
        .from(creditTransactions)
        .leftJoin(skills, eq(creditTransactions.skillSlug, skills.slug))
        .where(and(...conditions))
        .orderBy(asc(creditTransactions.id))
        .limit(currentBatchSize);

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        lastId = row.id;
        scanned += 1;

        const patch = buildCreditTransactionBackfillPatch(row);
        if (!patch) {
          continue;
        }

        candidates += 1;

        if (patch.sourceType) {
          sourceTypeBackfilled += 1;
        }

        if (patch.metadata && "originSurface" in patch.metadata) {
          if (resolveCreditTransactionOriginSurface(row)) {
            originNormalized += 1;
          } else if (patch.metadata.originSurface === "media_studio") {
            mediaStudioBackfilled += 1;
          }
        }

        if (samples.length < DEFAULT_SAMPLE_LIMIT) {
          samples.push({
            id: row.id,
            currentSourceType: row.sourceType,
            nextSourceType: patch.sourceType ?? row.sourceType,
            currentOriginSurface: resolveCreditTransactionOriginSurface(row),
            nextOriginSurface:
              typeof patch.metadata?.originSurface === "string"
                ? patch.metadata.originSurface
                : resolveCreditTransactionOriginSurface(row),
            skillSlug: row.skillSlug,
            skillCategory: row.skillCategory,
            description: row.description,
            reasons: patch.reasons,
          });
        }

        if (options.apply) {
          const updateSet: Record<string, unknown> = {};
          if (patch.sourceType) {
            updateSet.sourceType = patch.sourceType;
          }
          if (patch.metadata) {
            updateSet.metadata = patch.metadata;
          }

          await db
            .update(creditTransactions)
            .set(updateSet)
            .where(eq(creditTransactions.id, row.id));

          updated += 1;
        }
      }

      if (remaining != null) {
        remaining -= rows.length;
      }
    }
  } finally {
    await client.end();
  }

  const report = {
    mode: options.apply ? "apply" : "dry-run",
    scanned,
    candidates,
    updated,
    sourceTypeBackfilled,
    originNormalized,
    mediaStudioBackfilled,
    nextCursorId: lastId,
    filters: {
      userId: options.userId,
      limit: options.limit,
      batchSize: options.batchSize,
      startId: options.startId,
    },
    samples,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!options.apply) {
    console.log("\n[backfill-credit-transaction-sources] Dry run complete. Re-run with --apply to persist changes.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[backfill-credit-transaction-sources] failed:", error);
    process.exit(1);
  });
}
