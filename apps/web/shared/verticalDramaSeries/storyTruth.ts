import { z } from "zod";

export const VERTICAL_DRAMA_STORY_TRUTH_VERSION = "vd-story-truth-v1" as const;

export const verticalDramaStoryTruthFactSchema = z.object({
  key: z.string().min(1).max(160),
  value: z.unknown(),
  locked: z.boolean(),
  sourceVersion: z.string().min(1).max(160),
});

export const verticalDramaStoryTruthPackageSchema = z.object({
  contractVersion: z.literal(VERTICAL_DRAMA_STORY_TRUTH_VERSION),
  sourceVersion: z.string().min(1).max(160),
  producerVersion: z.string().min(1).max(160),
  lockedFacts: z.array(verticalDramaStoryTruthFactSchema).max(256),
  projections: z.object({
    story: z.unknown().optional(),
    characters: z.array(z.unknown()).max(128).optional(),
    locations: z.array(z.unknown()).max(128).optional(),
    timeline: z.array(z.unknown()).max(256).optional(),
  }),
});

export type VerticalDramaStoryTruthPackage = z.infer<
  typeof verticalDramaStoryTruthPackageSchema
>;

export type VerticalDramaStoryTruthIssueCode =
  | "stale_source_version"
  | "locked_fact_drift"
  | "speaker_not_in_cast"
  | "timeline_inversion"
  | "missing_continuity_anchor";

export type VerticalDramaStoryTruthIssue = {
  code: VerticalDramaStoryTruthIssueCode;
  severity: "warning" | "blocking";
  path: string;
  message: string;
  repairInstruction: string;
};

function compact(value: unknown, maxChars = 12_000): string {
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value ?? "");
  }
  return serialized.length > maxChars
    ? `${serialized.slice(0, maxChars)}…`
    : serialized;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

/** Build a bounded, immutable input projection. Missing legacy facts stay missing. */
export function buildVerticalDramaStoryTruthPackage(input: {
  sourceVersion: string;
  story?: unknown;
  characters?: unknown[];
  locations?: unknown[];
  timeline?: unknown[];
  lockedKeys?: string[];
}): VerticalDramaStoryTruthPackage {
  const lockedKeys = new Set(input.lockedKeys ?? []);
  const entries: Array<[string, unknown]> = [
    ["story", input.story],
    ["characters", input.characters],
    ["locations", input.locations],
    ["timeline", input.timeline],
  ];
  const lockedFacts = entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value,
      locked: lockedKeys.has(key),
      sourceVersion: input.sourceVersion,
    }));
  return {
    contractVersion: VERTICAL_DRAMA_STORY_TRUTH_VERSION,
    sourceVersion: input.sourceVersion,
    producerVersion: VERTICAL_DRAMA_STORY_TRUTH_VERSION,
    lockedFacts,
    projections: {
      ...(input.story !== undefined ? { story: input.story } : {}),
      ...(input.characters ? { characters: input.characters.slice(0, 128) } : {}),
      ...(input.locations ? { locations: input.locations.slice(0, 128) } : {}),
      ...(input.timeline ? { timeline: input.timeline.slice(0, 256) } : {}),
    },
  };
}

export function renderVerticalDramaStoryTruthPromptBlock(
  truth: VerticalDramaStoryTruthPackage | null | undefined,
): string | null {
  if (!truth) return null;
  const parsed = verticalDramaStoryTruthPackageSchema.safeParse(truth);
  if (!parsed.success) return null;
  return [
    "STORY TRUTH PACKAGE (authoritative input facts; proposals may extend but must not rewrite locked facts):",
    compact({
      contractVersion: parsed.data.contractVersion,
      sourceVersion: parsed.data.sourceVersion,
      producerVersion: parsed.data.producerVersion,
      lockedFacts: parsed.data.lockedFacts,
      projections: parsed.data.projections,
    }),
    "If a fact is missing, preserve the gap as an explicit uncertainty; do not invent a replacement canon.",
  ].join("\n");
}

/** Pure semantic checks for generated JSON; safe to run before persistence. */
export function inspectVerticalDramaStoryTruth(input: {
  truth: VerticalDramaStoryTruthPackage;
  output: unknown;
  expectedSourceVersion: string;
}): VerticalDramaStoryTruthIssue[] {
  const issues: VerticalDramaStoryTruthIssue[] = [];
  if (input.truth.sourceVersion !== input.expectedSourceVersion) {
    issues.push({
      code: "stale_source_version",
      severity: "blocking",
      path: "sourceVersion",
      message: "The generated artifact was based on a stale story-truth source version.",
      repairInstruction: "Rebuild the output from the latest accepted Story Truth Package before persisting it.",
    });
  }

  const outputRecord = record(input.output);
  const outputSourceVersion = outputRecord?.storyTruthSourceVersion;
  if (outputSourceVersion !== undefined && outputSourceVersion !== input.truth.sourceVersion) {
    issues.push({
      code: "stale_source_version",
      severity: "blocking",
      path: "storyTruthSourceVersion",
      message: "The output declares a different Story Truth source version.",
      repairInstruction: "Regenerate using the current source version and keep the version marker unchanged.",
    });
  }

  const lockedFacts = input.truth.lockedFacts.filter(fact => fact.locked);
  for (const fact of lockedFacts) {
    const proposed = outputRecord?.[fact.key];
    if (proposed !== undefined && compact(proposed, 4_000) !== compact(fact.value, 4_000)) {
      issues.push({
        code: "locked_fact_drift",
        severity: "blocking",
        path: fact.key,
        message: `Generated output changed locked fact ${fact.key}.`,
        repairInstruction: `Restore ${fact.key} from the accepted Story Truth Package; do not revise it in a generation pass.`,
      });
    }
  }

  const cast = new Set(stringArray(outputRecord?.cast ?? outputRecord?.characters));
  const speakers = stringArray(outputRecord?.speakers ?? outputRecord?.dialogueSpeakers);
  for (const speaker of speakers) {
    if (cast.size > 0 && !cast.has(speaker)) {
      issues.push({
        code: "speaker_not_in_cast",
        severity: "blocking",
        path: "speakers",
        message: `Speaker ${speaker} is not present in the generated episode cast.`,
        repairInstruction: "Use an approved character key from the cast or remove the unsupported speaker.",
      });
    }
  }

  const timeline = input.truth.projections.timeline;
  const outputTimeline = outputRecord?.timeline;
  if (Array.isArray(timeline) && Array.isArray(outputTimeline)) {
    const expectedOrder = timeline.map(item => record(item)?.episodeNumber).filter(Number.isFinite);
    const actualOrder = outputTimeline.map(item => record(item)?.episodeNumber).filter(Number.isFinite);
    if (expectedOrder.length > 1 && actualOrder.length > 1 && actualOrder.some((value, index) => {
      const expected = expectedOrder[index];
      return typeof expected === "number" && typeof value === "number" && value < expected;
    })) {
      issues.push({
        code: "timeline_inversion",
        severity: "blocking",
        path: "timeline",
        message: "Generated timeline moves an episode backward relative to the canonical order.",
        repairInstruction: "Restore canonical episode order and preserve prior continuity anchors.",
      });
    }
  }

  if (outputRecord && outputRecord.continuityAnchor === undefined && outputRecord.continuity_anchor === undefined) {
    issues.push({
      code: "missing_continuity_anchor",
      severity: "warning",
      path: "continuityAnchor",
      message: "Generated output does not expose a continuity anchor.",
      repairInstruction: "Add a concise continuity-in/continuity-out anchor for the next stage.",
    });
  }
  return issues;
}

export function buildVerticalDramaStoryTruthRepairInstructions(
  issues: VerticalDramaStoryTruthIssue[],
): string[] {
  return issues.map(issue => `${issue.path}: ${issue.repairInstruction}`);
}
