import {
  deriveLegacyBeatId,
  fingerprintStoryValue,
  type StoryGenerationRunContract,
  type StoryPlanAlignmentLedger,
  type StoryValidationFinding,
  type StoryValidationReport,
} from "./verticalDramaStoryGenerationContracts";
import { getVerticalDramaQualityCriteriaBundle } from "./verticalDramaQualityCriteria";

export interface StoryGenerationContextPack {
  version: string;
  contractHash: string;
  sourceFingerprint: string;
  targetEpisodes: number[];
  controls: unknown;
  relevantEpisodes: unknown[];
  characters: unknown[];
  locations: unknown[];
  plan: unknown;
  criteriaVersion: number;
  rulePackIds: string[];
}

/** Rehydrates preserved plan fields onto a generated episode candidate before
 * alignment/final-gate validation. Deep generation intentionally returns only
 * new shot fields; the active plan remains the source of title/logline/beats. */
export function mergeStoryPlanFieldsIntoCandidate(
  candidateOutput: unknown[],
  plan: unknown,
): unknown[] {
  const planRecord = plan && typeof plan === "object" && !Array.isArray(plan)
    ? plan as Record<string, unknown>
    : null;
  const planEpisodes = Array.isArray(planRecord?.episodeBreakdown)
    ? planRecord.episodeBreakdown
    : Array.isArray(planRecord?.episodes) ? planRecord.episodes : [];
  const planByEpisode = new Map<number, Record<string, unknown>>();
  for (const episode of planEpisodes) {
    if (!episode || typeof episode !== "object" || Array.isArray(episode)) continue;
    const record = episode as Record<string, unknown>;
    const episodeNumber = Number(record.episodeNumber);
    if (Number.isInteger(episodeNumber)) planByEpisode.set(episodeNumber, record);
  }
  return candidateOutput.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    const record = candidate as Record<string, unknown>;
    const episodeNumber = Number(record.episodeNumber);
    const planned = planByEpisode.get(episodeNumber);
    return planned ? { ...planned, ...record } : candidate;
  });
}

export function buildStoryGenerationContextPack(input: {
  contract: StoryGenerationRunContract;
  draft: Record<string, unknown>;
  plan?: unknown;
  controls?: unknown;
  characters?: unknown[];
  locations?: unknown[];
}): StoryGenerationContextPack {
  const episodes = Array.isArray(input.draft.episodeBreakdown)
    ? input.draft.episodeBreakdown
    : Array.isArray(input.draft.episodes) ? input.draft.episodes : [];
  const relevantEpisodes = episodes.filter((episode) => {
    const number = typeof episode === "object" && episode !== null
      ? Number((episode as { episodeNumber?: unknown }).episodeNumber)
      : NaN;
    return input.contract.targetEpisodes.includes(number);
  });
  const context = {
    version: "vd-story-context-v1",
    contractHash: input.contract.contractHash,
    sourceFingerprint: input.contract.sourceFingerprint,
    targetEpisodes: input.contract.targetEpisodes,
    controls: input.controls ?? null,
    relevantEpisodes,
    characters: input.characters ?? [],
    locations: input.locations ?? [],
    plan: input.plan ?? null,
    criteriaVersion: input.contract.qualityCriteriaVersion,
    rulePackIds: input.contract.rulePackIds,
  };
  const encoded = JSON.stringify(context);
  if (encoded.length <= input.contract.budget.maxContextBytes) return context;
  return {
    ...context,
    relevantEpisodes: relevantEpisodes.slice(-Math.max(1, Math.floor(relevantEpisodes.length / 2))),
    characters: context.characters.slice(0, 32),
    locations: context.locations.slice(0, 32),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readEpisodeNumber(value: unknown): number | null {
  const record = asRecord(value);
  const number = Number(record?.episodeNumber ?? record?.episode ?? NaN);
  return Number.isInteger(number) ? number : null;
}

function readBeats(value: unknown): Array<{ id: string; episodeNumber: number; description: string }> {
  const episode = asRecord(value);
  const episodeNumber = readEpisodeNumber(value);
  if (episodeNumber === null) return [];
  const raw = Array.isArray(episode?.keyBeats)
    ? episode.keyBeats
    : Array.isArray(episode?.beats) ? episode.beats : [];
  return raw.flatMap((beat, index) => {
    if (typeof beat === "string") {
      const description = beat.trim();
      return description
        ? [{
            id: deriveLegacyBeatId(episodeNumber, index, description),
            episodeNumber,
            description,
          }]
        : [];
    }
    const record = asRecord(beat);
    const description = String(record?.description ?? record?.title ?? record?.text ?? "").trim();
    if (!description) return [];
    return [{
      id: typeof record?.beatId === "string" ? record.beatId : typeof record?.id === "string" ? record.id : deriveLegacyBeatId(episodeNumber, index, description),
      episodeNumber,
      description,
    }];
  });
}

export function buildStoryPlanAlignmentLedger(input: {
  plan: unknown;
  output: unknown;
  targetEpisodes?: number[];
}): StoryPlanAlignmentLedger {
  const planRecord = asRecord(input.plan);
  const planEpisodes = Array.isArray(planRecord?.episodeBreakdown)
    ? planRecord.episodeBreakdown
    : Array.isArray(planRecord?.episodes) ? planRecord.episodes : [];
  const targetEpisodes = input.targetEpisodes ? new Set(input.targetEpisodes) : null;
  const plannedKeyBeats = planEpisodes.flatMap((episode) => {
    const episodeNumber = readEpisodeNumber(episode);
    if (episodeNumber === null || (targetEpisodes && !targetEpisodes.has(episodeNumber))) return [];
    return readBeats(episode).map((beat) => ({
      beatId: beat.id,
      episodeNumber,
      description: beat.description,
      allowedEvidenceEpisodes: [episodeNumber],
      required: true,
      deferred: false,
    }));
  });
  const outputEpisodes = Array.isArray(input.output)
    ? input.output
    : asRecord(input.output)?.episodeBreakdown ?? asRecord(input.output)?.episodes ?? [];
  const generated = (Array.isArray(outputEpisodes) ? outputEpisodes : []).flatMap(readBeats);
  const generatedIds = generated.map((beat) => beat.id);
  const plannedIds = plannedKeyBeats.map((beat) => beat.beatId);
  const missingRequiredBeatIds = plannedIds.filter((id) => !generatedIds.includes(id));
  const unexpectedBeatIds = generatedIds.filter((id) => !plannedIds.includes(id));
  return {
    planVersion: fingerprintStoryValue(input.plan).slice(0, 16),
    plannedKeyBeats,
    generatedBeatIds: generatedIds,
    missingRequiredBeatIds,
    unexpectedBeatIds,
    drifted: missingRequiredBeatIds.length > 0 || unexpectedBeatIds.length > 0,
  };
}

export function validateStoryGenerationOutput(input: {
  contract: StoryGenerationRunContract;
  output: unknown;
  plan?: unknown;
  repairRound?: number;
}): StoryValidationReport {
  const findings: StoryValidationFinding[] = [];
  const criteria = getVerticalDramaQualityCriteriaBundle();
  if (criteria.version !== input.contract.qualityCriteriaVersion) {
    findings.push({
      code: "quality.criteria_version_drift",
      severity: "structural",
      message: `Quality criteria changed from ${input.contract.qualityCriteriaVersion} to ${criteria.version}`,
      targetPaths: ["/qualityCriteriaVersion"],
      preservePaths: ["/sourceSnapshot"],
      blocking: true,
      requiresApproval: false,
    });
  }
  const episodes = Array.isArray(input.output)
    ? input.output
    : asRecord(input.output)?.episodeBreakdown ?? asRecord(input.output)?.episodes ?? [];
  const episodeList = Array.isArray(episodes) ? episodes : [];
  const numbers = episodeList.map(readEpisodeNumber);
  if (episodeList.length === 0) {
    findings.push({ code: "structure.empty_output", severity: "structural", message: "Generated story contains no episodes", targetPaths: ["/episodes"], preservePaths: [], blocking: true, requiresApproval: false });
  }
  if (numbers.some((number) => number === null)) {
    findings.push({ code: "structure.invalid_episode_number", severity: "major", message: "Every generated episode must have an integer episode number", targetPaths: ["/episodes/*/episodeNumber"], preservePaths: [], blocking: true, requiresApproval: false });
  }
  const uniqueNumbers = new Set(numbers.filter((number): number is number => number !== null));
  if (uniqueNumbers.size !== episodeList.length) {
    findings.push({ code: "structure.duplicate_episode", severity: "major", message: "Generated episode numbers must be unique", targetPaths: ["/episodes"], preservePaths: [], blocking: true, requiresApproval: false });
  }
  const target = new Set(input.contract.targetEpisodes);
  const missingEpisodes = [...target].filter((episodeNumber) => !uniqueNumbers.has(episodeNumber));
  if (missingEpisodes.length > 0) {
    findings.push({
      code: "structure.missing_episode",
      severity: "structural",
      message: `Generated story is missing requested episode(s): ${missingEpisodes.join(", ")}`,
      targetPaths: missingEpisodes.map((episodeNumber) => `/episodes/${episodeNumber}`),
      preservePaths: ["/sourceSnapshot", "/episodes/*"],
      blocking: true,
      requiresApproval: false,
    });
  }
  if (uniqueNumbers.size > target.size || [...uniqueNumbers].some((number) => !target.has(number))) {
    findings.push({ code: "budget.episode_scope", severity: "major", message: "Generated episodes exceed the admitted scope", targetPaths: ["/episodes"], preservePaths: [], blocking: true, requiresApproval: false });
  }
  if (input.contract.expectedShots !== null) {
    for (const episode of episodeList) {
      const record = asRecord(episode);
      const shotDrafts = record?.shotDrafts;
      if (Array.isArray(shotDrafts) && shotDrafts.length !== input.contract.expectedShots) {
        findings.push({
          code: "structure.shot_count",
          severity: "structural",
          message: `Episode ${readEpisodeNumber(episode) ?? "?"} must contain exactly ${input.contract.expectedShots} shots`,
          targetPaths: [`/episodes/${readEpisodeNumber(episode) ?? "?"}/shotDrafts`],
          preservePaths: ["/episodes/*/keyBeats", "/sourceSnapshot"],
          blocking: true,
          requiresApproval: false,
        });
      }
    }
  }
  const alignment = input.plan === undefined ? null : buildStoryPlanAlignmentLedger({
    plan: input.plan,
    output: input.output,
    targetEpisodes: input.contract.targetEpisodes,
  });
  if (alignment?.drifted) {
    findings.push({
      code: "plan.alignment_drift",
      severity: "structural",
      message: `Generated story is missing ${alignment.missingRequiredBeatIds.length} planned beats or added ${alignment.unexpectedBeatIds.length} unplanned beats`,
      targetPaths: ["/episodes/*/keyBeats"],
      preservePaths: ["/plan"],
      blocking: true,
      requiresApproval: true,
    });
  }
  const targetEpisodeSet = new Set(input.contract.targetEpisodes);
  const outputEpisodeNumbers = [...uniqueNumbers];
  const alignmentEpisodeByBeatId = new Map<string, number>();
  for (const beat of alignment?.plannedKeyBeats ?? []) alignmentEpisodeByBeatId.set(beat.beatId, beat.episodeNumber);
  if (alignment) {
    for (const beat of (Array.isArray(input.output) ? input.output : []).flatMap(readBeats)) {
      alignmentEpisodeByBeatId.set(beat.id, beat.episodeNumber);
    }
  }
  const blockingFindings = findings.filter((finding) => finding.blocking);
  const impactedEpisodes = new Set<number>();
  for (const finding of blockingFindings) {
    const pathEpisodes = finding.targetPaths.flatMap((path) => {
      const matches = [...path.matchAll(/\/episodes\/(\d+)(?:\/|$)/g)];
      return matches.map((match) => Number(match[1]));
    });
    const alignmentEpisodes = finding.code === "plan.alignment_drift"
      ? [
          ...(alignment?.missingRequiredBeatIds ?? []),
          ...(alignment?.unexpectedBeatIds ?? []),
        ].map((beatId) => alignmentEpisodeByBeatId.get(beatId) ?? null)
      : [];
    const findingEpisodes = [...pathEpisodes, ...alignmentEpisodes].filter(
      (episodeNumber): episodeNumber is number => {
        if (typeof episodeNumber !== "number" || !Number.isInteger(episodeNumber)) return false;
        return targetEpisodeSet.has(episodeNumber);
      },
    );
    if (findingEpisodes.length === 0) {
      for (const episodeNumber of input.contract.targetEpisodes) impactedEpisodes.add(episodeNumber);
    } else {
      for (const episodeNumber of findingEpisodes) impactedEpisodes.add(episodeNumber);
    }
  }
  if (impactedEpisodes.size === 0) {
    for (const episodeNumber of outputEpisodeNumbers) {
      if (targetEpisodeSet.has(episodeNumber)) impactedEpisodes.add(episodeNumber);
    }
  }
  return {
    reportVersion: "vd-story-validation-v1",
    contractHash: input.contract.contractHash,
    outputFingerprint: fingerprintStoryValue(input.output),
    criteriaVersion: input.contract.qualityCriteriaVersion,
    passed: findings.every((finding) => !finding.blocking),
    findings,
    alignment,
    impactedEpisodes: [...impactedEpisodes].sort((a, b) => a - b),
    repairRound: input.repairRound ?? 0,
    finalGateEligible: findings.every((finding) => !finding.blocking),
  };
}
