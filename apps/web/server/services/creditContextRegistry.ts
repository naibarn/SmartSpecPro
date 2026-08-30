import { eq } from "drizzle-orm";
import { conversations, mcpMediaTasks, skillRevenueSettlements, skills, verticalDramaEpisodeRuns, verticalDramaSeries, verticalDramaStoryGenerationRuns, workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  CREDIT_CONTEXT_RESOLVER_VERSION,
  CREDIT_CONTEXT_SOURCE_TYPES,
  CREDIT_CONTEXT_TYPES,
  isCreditContextSourceType,
  normalizeContextSourceId,
  type CreditContextRef,
  type CreditContextScope,
  type CreditContextType,
  type CreditContextSourceType,
  type CreditContextSnapshot,
} from "../../shared/creditContextContracts";

export interface CreditContextSourceResolution {
  tenantId: string;
  ownerUserId: number | null;
  displayName: string | null;
  displayType: string | null;
  sourceRevision?: string | null;
  snapshot?: CreditContextSnapshot | null;
  parent?: CreditContextRef;
  temporaryUnavailable?: boolean;
  ambiguous?: boolean;
}

export interface CreditContextResolverDefinition {
  sourceType: CreditContextSourceType;
  contextTypes: readonly CreditContextType[];
  resolve: (
    ref: CreditContextRef,
    scope: CreditContextScope,
  ) => Promise<CreditContextSourceResolution | null>;
  temporaryUnavailableMeansRetry: boolean;
}

export const CREDIT_CONTEXT_REGISTRY = {
  vertical_drama_series: {
    sourceType: "vertical_drama_series",
    contextTypes: ["series"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const id = Number(normalizeContextSourceId(ref.sourceId));
      if (!Number.isSafeInteger(id)) return null;
      const db = await getDb();
      const [row] = await db
        .select({ id: verticalDramaSeries.id, tenantId: verticalDramaSeries.tenantId, userId: verticalDramaSeries.userId, title: verticalDramaSeries.title })
        .from(verticalDramaSeries)
        .where(eq(verticalDramaSeries.id, id))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || row.userId !== scope.userId) return null;
      return {
        tenantId: row.tenantId,
        ownerUserId: row.userId,
        displayName: row.title,
        displayType: "เรื่อง",
        snapshot: { label: row.title, typeLabel: "เรื่อง", sourceId: String(row.id) },
      };
    },
  },
  conversation: {
    sourceType: "conversation",
    contextTypes: ["conversation"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const id = Number(normalizeContextSourceId(ref.sourceId));
      if (!Number.isSafeInteger(id)) return null;
      const db = await getDb();
      const [row] = await db
        .select({ id: conversations.id, userId: conversations.userId, title: conversations.title })
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1);
      if (!row || row.userId !== scope.userId) return null;
      return {
        tenantId: scope.tenantId,
        ownerUserId: row.userId,
        displayName: row.title,
        displayType: "Conversation",
        snapshot: { label: row.title, typeLabel: "Conversation", sourceId: String(row.id) },
      };
    },
  },
  vertical_drama_story_generation_run: {
    sourceType: "vertical_drama_story_generation_run",
    contextTypes: ["run", "job"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const sourceId = normalizeContextSourceId(ref.sourceId);
      const db = await getDb();
      const [row] = await db
        .select({ id: verticalDramaStoryGenerationRuns.id, runId: verticalDramaStoryGenerationRuns.runId, tenantId: verticalDramaStoryGenerationRuns.tenantId, userId: verticalDramaStoryGenerationRuns.userId, seriesId: verticalDramaStoryGenerationRuns.seriesId, stage: verticalDramaStoryGenerationRuns.stage })
        .from(verticalDramaStoryGenerationRuns)
        .where(eq(verticalDramaStoryGenerationRuns.runId, sourceId))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || row.userId !== scope.userId) return null;
      return {
        tenantId: row.tenantId,
        ownerUserId: row.userId,
        displayName: `Run ${row.runId}`,
        displayType: "Run",
        snapshot: { label: `Run ${row.runId}`, typeLabel: "Run", stageLabel: row.stage, sourceId: row.runId },
        parent: row.seriesId == null ? undefined : { contextType: "series", sourceType: "vertical_drama_series", sourceId: row.seriesId },
      };
    },
  },
  vertical_drama_episode_run: {
    sourceType: "vertical_drama_episode_run",
    contextTypes: ["run", "task"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const id = Number(normalizeContextSourceId(ref.sourceId));
      if (!Number.isSafeInteger(id)) return null;
      const db = await getDb();
      const [row] = await db
        .select({ id: verticalDramaEpisodeRuns.id, tenantId: verticalDramaEpisodeRuns.tenantId, userId: verticalDramaEpisodeRuns.userId, seriesId: verticalDramaEpisodeRuns.seriesId, stage: verticalDramaEpisodeRuns.stage })
        .from(verticalDramaEpisodeRuns)
        .where(eq(verticalDramaEpisodeRuns.id, id))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || row.userId !== scope.userId) return null;
      return {
        tenantId: row.tenantId,
        ownerUserId: row.userId,
        displayName: `Episode run ${row.id}`,
        displayType: "Run",
        snapshot: { label: `Episode run ${row.id}`, typeLabel: "Run", stageLabel: row.stage, sourceId: String(row.id) },
        parent: row.seriesId == null ? undefined : { contextType: "series", sourceType: "vertical_drama_series", sourceId: row.seriesId },
      };
    },
  },
  skill_execution: {
    sourceType: "skill_execution",
    contextTypes: ["skill_execution", "run"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const db = await getDb();
      const [row] = await db.select({ runId: skillRevenueSettlements.runId, tenantId: skillRevenueSettlements.tenantId, userId: skillRevenueSettlements.userId, skillSlug: skillRevenueSettlements.skillSlug, skillName: skills.name })
        .from(skillRevenueSettlements)
        .leftJoin(skills, eq(skills.slug, skillRevenueSettlements.skillSlug))
        .where(eq(skillRevenueSettlements.runId, normalizeContextSourceId(ref.sourceId)))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || row.userId !== scope.userId) return null;
      const label = row.skillName ? `${row.skillName} (${row.runId})` : `Skill run ${row.runId}`;
      return { tenantId: row.tenantId ?? scope.tenantId, ownerUserId: row.userId, displayName: label, displayType: "Skill", snapshot: { label, typeLabel: "Skill", sourceId: row.runId } };
    },
  },
  worker_job: {
    sourceType: "worker_job",
    contextTypes: ["worker_job", "job"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const db = await getDb();
      const [row] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, userId: workerJobs.requestedByUserId, jobType: workerJobs.jobType })
        .from(workerJobs)
        .where(eq(workerJobs.id, normalizeContextSourceId(ref.sourceId)))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || (row.userId !== null && row.userId !== scope.userId)) return null;
      const label = `Worker job: ${row.jobType}`;
      return { tenantId: row.tenantId, ownerUserId: row.userId, displayName: label, displayType: "Worker job", snapshot: { label, typeLabel: "Worker job", sourceId: row.id } };
    },
  },
  media_task: {
    sourceType: "media_task",
    contextTypes: ["media_task", "task"],
    temporaryUnavailableMeansRetry: true,
    resolve: async (ref, scope) => {
      const db = await getDb();
      const [row] = await db.select({ id: mcpMediaTasks.id, tenantId: mcpMediaTasks.tenantId, userId: mcpMediaTasks.userId, mediaType: mcpMediaTasks.mediaType })
        .from(mcpMediaTasks)
        .where(eq(mcpMediaTasks.id, normalizeContextSourceId(ref.sourceId)))
        .limit(1);
      if (!row || row.tenantId !== scope.tenantId || row.userId !== scope.userId) return null;
      const label = `Media task: ${row.mediaType}`;
      return { tenantId: row.tenantId, ownerUserId: row.userId, displayName: label, displayType: "Media task", snapshot: { label, typeLabel: "Media task", sourceId: row.id } };
    },
  },
} satisfies Partial<Record<CreditContextSourceType, CreditContextResolverDefinition>>;

// Keep the registry exhaustive even when a durable source table is not yet
// available. These entries deliberately resolve as unresolved rather than
// pretending an arbitrary identifier is a valid work item.
for (const sourceType of CREDIT_CONTEXT_SOURCE_TYPES) {
  if (!(sourceType in CREDIT_CONTEXT_REGISTRY)) {
    (CREDIT_CONTEXT_REGISTRY as Record<string, CreditContextResolverDefinition>)[sourceType] = {
      sourceType,
      contextTypes: ["job", "task", "run", "skill_execution", "workflow", "media_task", "worker_job"],
      temporaryUnavailableMeansRetry: false,
      resolve: async () => null,
    };
  }
}

export function getCreditContextResolver(
  sourceType: unknown,
): CreditContextResolverDefinition | null {
  return isCreditContextSourceType(sourceType)
    ? (CREDIT_CONTEXT_REGISTRY as unknown as Record<string, CreditContextResolverDefinition>)[sourceType]
    : null;
}

export function isRegisteredCreditContextType(value: unknown): value is CreditContextType {
  return typeof value === "string" && (CREDIT_CONTEXT_TYPES as readonly string[]).includes(value);
}

export function isRegisteredCreditContextSourceType(value: unknown): value is CreditContextSourceType {
  return typeof value === "string" && (CREDIT_CONTEXT_SOURCE_TYPES as readonly string[]).includes(value);
}

export { CREDIT_CONTEXT_RESOLVER_VERSION };
