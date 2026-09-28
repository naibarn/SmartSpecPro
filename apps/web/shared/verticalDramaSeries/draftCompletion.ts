import { z } from "zod";
import {
  getVerticalDramaDraftFactValue,
  readVerticalDramaDraftStoryContext,
  readVerticalDramaDraftDiagnostics,
  type VerticalDramaDraftDiagnostic,
} from "./draftStoryContext";
import { readVerticalDramaDraftStoryDesign } from "./draftStoryDesign";
import { evaluateVerticalDramaStoryArchitecture } from "./storyArchitecture";
import { validateVerticalDramaStoryControlSeed } from "./storyControl";
import { inspectVerticalDramaStoryControlConsistency } from "./storyControlConsistency";

export const verticalDramaDraftCompletionStatusSchema = z.enum([
  "incomplete",
  "ready_for_qc",
]);
export type VerticalDramaDraftCompletionStatus = z.infer<
  typeof verticalDramaDraftCompletionStatusSchema
>;

export const verticalDramaDraftCompletionReportSchema = z.object({
  status: verticalDramaDraftCompletionStatusSchema,
  stage: z.enum([
    "building_foundation",
    "composing",
    "completing",
    "validating",
    "ready_for_qc",
  ]),
  repairRound: z.number().int().min(0).max(2),
  missingPaths: z.array(z.string().min(1)).max(64),
  contradictionPaths: z.array(z.string().min(1)).max(64),
  diagnostics: z.array(z.string().min(1)).max(64),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type VerticalDramaDraftCompletionReport = z.infer<
  typeof verticalDramaDraftCompletionReportSchema
>;

const REQUIRED_CONTEXT_FACTS = [
  "targetMarket",
  "storySetting",
  "leadBackground",
  "leadOrigin",
  "spokenDialogue",
  "namingPolicy",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addMissing(missing: string[], path: string, value: unknown): void {
  if (!text(value)) missing.push(path);
}

/**
 * Recover the same creator inputs that influence completion validation after
 * the short-lived Redis composition record has expired. The request snapshot
 * is untrusted legacy data, so only well-typed, non-empty values are used.
 */
export function readVerticalDramaDraftCompletionContext(requestJson: unknown): {
  targetEpisodeCount?: number;
  genre?: string;
  userPremise?: string;
} {
  if (
    !requestJson ||
    typeof requestJson !== "object" ||
    Array.isArray(requestJson)
  ) {
    return {};
  }
  const synthesis = (requestJson as Record<string, unknown>).synthesis;
  if (!synthesis || typeof synthesis !== "object" || Array.isArray(synthesis)) {
    return {};
  }
  const values = synthesis as Record<string, unknown>;
  const targetEpisodeCount = values.targetEpisodeCount;
  const genre = text(values.genreHint);
  const userPremise = text(values.userPremise);
  return {
    ...(typeof targetEpisodeCount === "number" &&
    Number.isInteger(targetEpisodeCount) &&
    targetEpisodeCount > 0
      ? { targetEpisodeCount }
      : {}),
    ...(genre ? { genre } : {}),
    ...(userPremise ? { userPremise } : {}),
  };
}

/**
 * Strict terminal validator for the create-series wizard. Legacy synthesis
 * remains tolerant; only a job marked ready_for_qc may enter Draft QC.
 */
export function inspectVerticalDramaDraftCompleteness(params: {
  draft: Record<string, unknown>;
  targetEpisodeCount?: number;
  genre?: string;
  userPremise?: string;
}): {
  ready: boolean;
  report: Omit<VerticalDramaDraftCompletionReport, "fingerprint">;
  diagnostics: VerticalDramaDraftDiagnostic[];
} {
  // Draft JSON is persisted model/user data at this boundary. Treat malformed
  // legacy payloads as incomplete rather than throwing while reading fields.
  const draft =
    params.draft &&
    typeof params.draft === "object" &&
    !Array.isArray(params.draft)
      ? params.draft
      : {};
  const missing: string[] = [];
  const contradictions: string[] = [];
  const diagnostics: VerticalDramaDraftDiagnostic[] = [];

  for (const key of [
    "title",
    "category",
    "logline",
    "mainPlot",
    "seasonArc",
    "tone",
    "cliffhangerStyle",
    "visualBible",
  ])
    addMissing(missing, key, draft[key]);

  const titleOptions = Array.isArray(draft.titleOptions)
    ? draft.titleOptions.map(text).filter(Boolean)
    : [];
  const distinctTitles = new Set(titleOptions);
  if (
    titleOptions.length < 4 ||
    titleOptions.length > 5 ||
    distinctTitles.size !== titleOptions.length
  ) {
    missing.push("titleOptions");
  }
  if (text(draft.title) && !distinctTitles.has(text(draft.title))) {
    contradictions.push("title");
  }

  const characters = Array.isArray(draft.characters) ? draft.characters : [];
  if (characters.length < 3) missing.push("characters");
  characters.forEach((character, index) => {
    const row =
      character && typeof character === "object" && !Array.isArray(character)
        ? (character as Record<string, unknown>)
        : {};
    for (const key of [
      "name",
      "role",
      "description",
      "occupation",
      "narrativeRole",
      "roleTier",
    ])
      addMissing(missing, `characters[${index}].${key}`, row[key]);
  });

  const locations = Array.isArray(draft.locations) ? draft.locations : [];
  if (locations.length < 3) missing.push("locations");
  locations.forEach((location, index) => {
    const row =
      location && typeof location === "object" && !Array.isArray(location)
        ? (location as Record<string, unknown>)
        : {};
    addMissing(missing, `locations[${index}].name`, row.name);
    addMissing(missing, `locations[${index}].description`, row.description);
  });

  const context = readVerticalDramaDraftStoryContext(draft.storyContext);
  if (!context) {
    missing.push("storyContext");
  } else {
    for (const key of REQUIRED_CONTEXT_FACTS) {
      const fact = context[key];
      addMissing(
        missing,
        `storyContext.${key}.value`,
        getVerticalDramaDraftFactValue(fact)
      );
      if (
        fact?.source === "needs_creator_decision" ||
        fact?.source === "legacy_default"
      ) {
        missing.push(`storyContext.${key}.source`);
      }
      if (fact?.source === "ai_inferred") {
        addMissing(missing, `storyContext.${key}.confidence`, fact.confidence);
        addMissing(missing, `storyContext.${key}.rationale`, fact.rationale);
      }
    }
  }

  const architecture = evaluateVerticalDramaStoryArchitecture({
    contract: draft.storyContract,
    genre: params.genre,
    userPremise: params.userPremise,
    targetEpisodeCount: params.targetEpisodeCount,
  });
  diagnostics.push(
    ...architecture.diagnostics.map(item => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
      messageEn: item.messageEn,
      paths: item.paths,
      repairable: item.repairable,
    }))
  );
  if (!architecture.ready) {
    missing.push(
      ...architecture.diagnostics
        .filter(item => item.severity === "blocking")
        .flatMap(item => item.paths ?? ["storyContract"])
    );
  }

  const creatorSummary = draft.creatorSummary as
    | Record<string, unknown>
    | undefined;
  for (const key of [
    "whatItIsAbout",
    "protagonistAndGoal",
    "conflictAndDiscovery",
    "centralMystery",
  ]) {
    addMissing(missing, `creatorSummary.${key}`, creatorSummary?.[key]);
  }
  const mixRecipe = draft.mixRecipe as Record<string, unknown> | undefined;
  addMissing(missing, "mixRecipe.primaryFlavor", mixRecipe?.primaryFlavor);
  addMissing(missing, "mixRecipe.rationale", mixRecipe?.rationale);

  const design = readVerticalDramaDraftStoryDesign(draft.storyDesign);
  if (!design) missing.push("storyDesign");
  else {
    if (
      params.targetEpisodeCount != null &&
      design.totalEpisodeCount !== params.targetEpisodeCount
    ) {
      missing.push("storyDesign.totalEpisodeCount");
    }
    if (design.pressureThreads.length === 0)
      missing.push("storyDesign.pressureThreads");
    if (design.conflictGuardrails.length === 0)
      missing.push("storyDesign.conflictGuardrails");
    if (design.advantageBeats.length === 0)
      missing.push("storyDesign.advantageBeats");
    if (!design.storyControlSeed) missing.push("storyDesign.storyControlSeed");
  }
  if (design?.storyControlSeed) {
    const names = new Set(
      characters
        .map(row =>
          row && typeof row === "object" && !Array.isArray(row)
            ? text((row as Record<string, unknown>).name)
            : ""
        )
        .filter(Boolean)
    );
    for (const name of design.storyControlSeed.canonicalCharacterKeys) {
      if (!names.has(name))
        contradictions.push(
          `storyDesign.storyControlSeed.canonicalCharacterKeys:${name}`
        );
    }
    const seedValidation = validateVerticalDramaStoryControlSeed(
      design.storyControlSeed,
      { totalEpisodeCount: params.targetEpisodeCount }
    );
    if (!seedValidation.ok) {
      missing.push(
        ...seedValidation.issues.map(
          issue => `storyDesign.storyControlSeed.${issue.path}`
        )
      );
    }
  }
  if (design && params.targetEpisodeCount != null) {
    const totalEpisodeCount = params.targetEpisodeCount;
    if (design.earlyPayoff.episodeWindow.endEpisode > totalEpisodeCount) {
      contradictions.push("storyDesign.earlyPayoff.episodeWindow");
    }
    design.pressureThreads.forEach((thread, index) => {
      if (thread.episodeWindow.endEpisode > totalEpisodeCount) {
        contradictions.push(
          `storyDesign.pressureThreads[${index}].episodeWindow`
        );
      }
    });
    if (
      !design.pressureThreads.some(
        thread => thread.episodeWindow.endEpisode === totalEpisodeCount
      )
    ) {
      missing.push("storyDesign.pressureThreads.terminalDestination");
    }
    if (
      !design.advantageBeats.some(
        beat => beat.episodeNumber === totalEpisodeCount
      )
    ) {
      missing.push("storyDesign.advantageBeats.terminalDestination");
    }
  }
  if (design) {
    const controlConsistency = inspectVerticalDramaStoryControlConsistency({
      storyDesign: design,
      storyArchitecture: draft.storyContract,
      targetEpisodeCount: params.targetEpisodeCount,
    });
    for (const issue of controlConsistency.issues) {
      const issuePath = `storyDesign.${issue.path}`;
      if (
        issue.code === "placeholder_control_text" ||
        issue.code === "duplicate_pressure_thread" ||
        issue.code === "duplicate_advantage_beat"
      ) {
        missing.push(issuePath);
      } else {
        contradictions.push(issuePath);
      }
      diagnostics.push({
        code: `story_control_${issue.code}`,
        severity: "blocking",
        message: issue.message,
        messageEn: issue.message,
        paths: [issuePath],
        repairable: issue.repairable,
      });
    }
  }

  for (const diagnostic of readVerticalDramaDraftDiagnostics(
    draft.diagnostics
  )) {
    if (diagnostic.severity === "blocking" || diagnostic.severity === "error") {
      diagnostics.push(diagnostic);
      if (diagnostic.paths?.length) missing.push(...diagnostic.paths);
      else missing.push(`diagnostics.${diagnostic.code}`);
    }
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueContradictions = [...new Set(contradictions)];
  const ready = uniqueMissing.length === 0 && uniqueContradictions.length === 0;
  return {
    ready,
    report: {
      status: ready ? "ready_for_qc" : "incomplete",
      stage: ready ? "ready_for_qc" : "validating",
      repairRound: 0,
      missingPaths: uniqueMissing,
      contradictionPaths: uniqueContradictions,
      diagnostics: diagnostics.map(item => item.code),
    },
    diagnostics,
  };
}
