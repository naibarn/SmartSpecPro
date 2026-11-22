import { and, desc, eq, ne, sql } from "drizzle-orm";
import { marketplaceAutoReviewRuns } from "../../drizzle/schema";
import type { getDb } from "../db";
import type {
  StagedStoryArcPlan,
  StagedStoryConceptOption,
} from "./marketplaceAutoReviewStoryArcPlanner";

export type UsedReviewConcept = Pick<
  StagedStoryConceptOption,
  "title" | "angle" | "storySummary"
>;

type ReviewConceptHistoryRow = {
  selectedConceptId: string | null;
  hasStoryboard: boolean;
  staged: boolean;
  stagedSelection: unknown;
  stagedStoryboardSummary?: string | null;
  previousSelections: unknown;
  legacyConceptSet: unknown;
};

function readConcept(value: unknown): UsedReviewConcept | null {
  if (!value || typeof value !== "object") return null;
  const { title, angle, storySummary, rationale } = value as Record<string, unknown>;
  const clean = (text: unknown, maxLength: number) =>
    typeof text === "string"
      ? text.trim().replace(/\s+/gu, " ").slice(0, maxLength)
      : "";
  const concept = {
    title: clean(title, 160),
    angle: clean(angle, 320),
    storySummary: clean(storySummary ?? rationale, 500),
  };
  return concept.angle ? concept : null;
}

export function findConfirmedStagedReviewConcept(
  plan: Pick<StagedStoryArcPlan, "shots" | "selectedConceptId" | "conceptOptions">
): StagedStoryConceptOption | undefined {
  if (
    !plan.selectedConceptId ||
    !plan.shots?.length ||
    !Array.isArray(plan.conceptOptions)
  ) {
    return;
  }
  return plan.conceptOptions.find(option => option?.conceptId === plan.selectedConceptId);
}

function deduplicateConcepts(values: unknown[]): UsedReviewConcept[] {
  const concepts = new Map<string, UsedReviewConcept>();
  for (const value of values) {
    const concept = readConcept(value);
    if (!concept) continue;
    const key = JSON.stringify(concept);
    if (!concepts.has(key)) concepts.set(key, concept);
  }
  return Array.from(concepts.values());
}

export function collectUsedReviewConcepts(rows: ReviewConceptHistoryRow[]): UsedReviewConcept[] {
  return deduplicateConcepts(rows.flatMap(row => {
    if (row.staged) {
      // Some older redrafts dropped the selection ID. The authored storyboard
      // still records the premise that was used.
      const selected = readConcept(row.stagedSelection) ?? {
        angle: row.stagedStoryboardSummary,
      };
      return [
        ...(Array.isArray(row.previousSelections) ? row.previousSelections : []),
        ...(row.hasStoryboard ? [selected] : []),
      ];
    }
    if (!row.hasStoryboard || !row.selectedConceptId) return [];
    const set = row.legacyConceptSet as Record<string, unknown> | null;
    const options = [set?.alternatives, set?.concepts].flatMap(option =>
      Array.isArray(option) ? option : []
    );
    return [options.find(option => option?.conceptId === row.selectedConceptId)];
  }));
}

export function rememberUsedReviewConcept(
  previousSelections: unknown,
  concept: StagedStoryConceptOption | undefined
) {
  return deduplicateConcepts([
    ...(Array.isArray(previousSelections) ? previousSelections : []),
    concept,
  ]);
}

export async function loadUsedReviewConcepts(
  db: Awaited<ReturnType<typeof getDb>>,
  run: Pick<typeof marketplaceAutoReviewRuns.$inferSelect, "id" | "userId" | "tenantId" | "productId">
) {
  if (!run.tenantId) throw new Error("STAGED_STORY_PLAN_OWNER_CONTEXT_REQUIRED");
  const table = marketplaceAutoReviewRuns;
  const metadata = table.metadataJson;
  const plan = sql`(${metadata} #> '{stagedPipeline,plan}')`;
  const rows = await db
    .select({
      selectedConceptId: table.selectedConceptId,
      hasStoryboard: sql<boolean>`case
        when ${plan} is not null then coalesce(
          jsonb_typeof(${plan}->'shots') = 'array' and ${plan}->'shots' <> '[]'::jsonb,
          false
        )
        else ${table.storyboardReviewId} is not null
          or coalesce(${metadata} #>> '{planReview,status}' = 'approved', false)
        end`,
      staged: sql<boolean>`${plan} is not null
        or coalesce(${metadata}->>'planningArchitecture' = 'staged_two_skill_v2', false)`,
      stagedSelection: sql<unknown>`jsonb_path_query_first(
        ${plan}, '$.conceptOptions[*] ? (@.conceptId == $selected)',
        jsonb_build_object('selected', ${plan}->'selectedConceptId')
      )`,
      stagedStoryboardSummary: sql<string | null>`${plan}->>'storySummary'`,
      previousSelections: sql<unknown>`${metadata} #> '{stagedPipeline,usedReviewConcepts}'`,
      legacyConceptSet: sql<unknown>`coalesce(
        ${metadata} #> '{creativePlanning,creativeConceptSet}', ${metadata}->'creativeConceptSet'
      )`,
    })
    .from(table)
    .where(and(
      eq(table.tenantId, run.tenantId),
      eq(table.userId, run.userId),
      eq(table.productId, run.productId),
      ne(table.id, run.id)
    ))
    .orderBy(desc(table.createdAt));
  return collectUsedReviewConcepts(rows);
}

function normalizedText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}\p{Cf}]/gu, "");
}

function sameText(a: string, b: string) {
  const left = normalizedText(a);
  const right = normalizedText(b);
  return left.length > 0 && left === right;
}

// Detect superficial edits to a long angle or synopsis, including Thai, which
// does not require spaces between words. The skill also compares meaning.
function sameIdeaDescription(a: string, b: string) {
  const left = normalizedText(a);
  const right = normalizedText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 40) return false;
  const grams = (value: string) => new Set(
    Array.from({ length: value.length - 3 }, (_, index) => value.slice(index, index + 4))
  );
  const source = grams(left);
  const target = grams(right);
  let shared = 0;
  for (const gram of source) {
    if (target.has(gram)) shared += 1;
  }
  return (2 * shared) / (source.size + target.size) >= 0.88;
}

export function isRepeatedReviewConcept(a: UsedReviewConcept, b: UsedReviewConcept) {
  return sameText(a.title, b.title) ||
    sameIdeaDescription(a.angle, b.angle) ||
    sameIdeaDescription(a.storySummary, b.storySummary || b.angle);
}
