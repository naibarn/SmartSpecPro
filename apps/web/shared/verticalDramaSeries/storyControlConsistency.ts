import {
  readVerticalDramaDraftStoryDesign,
  type VerticalDramaDraftStoryDesign,
} from "./draftStoryDesign";
import { readVerticalDramaStoryArchitecture } from "./storyArchitecture";

export type VerticalDramaStoryControlConsistencyIssueCode =
  | "duplicate_pressure_thread"
  | "duplicate_advantage_beat"
  | "placeholder_control_text"
  | "romance_window_mismatch"
  | "romance_phase_order"
  | "story_control_seed_drift"
  | "terminal_control_beat_missing"
  | "terminal_advantage_timing";

export interface VerticalDramaStoryControlConsistencyIssue {
  code: VerticalDramaStoryControlConsistencyIssueCode;
  path: string;
  message: string;
  repairable: boolean;
}

export interface VerticalDramaStoryControlConsistencyResult {
  ready: boolean;
  design: VerticalDramaDraftStoryDesign | null;
  issues: VerticalDramaStoryControlConsistencyIssue[];
}

const PLACEHOLDER_PATTERN =
  /(?:\b(?:tbd|todo|placeholder|to be determined|fill(?: in)? later|insert .* here|lorem ipsum|n\/a)\b|\[\s*(?:tbd|todo|placeholder|insert .* here)\s*\]|<\s*(?:tbd|placeholder|text|value)\s*>|(?:ยังไม่กำหนด|ใส่ภายหลัง|รอเติม|ตัวอย่างข้อความ))/i;

const ROMANCE_PHASE_ORDER: Record<string, number> = {
  none: 0,
  friction: 1,
  flirt: 2,
  vulnerability: 3,
  trust_shift: 4,
  sweet: 5,
  rupture: 6,
  reconciliation: 7,
  confession: 8,
  commitment: 9,
  pause: 10,
};

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLocaleLowerCase()
        .replace(/\s+/g, " ")
    : "";
}

function sameWindow(
  left: { startEpisode: number; endEpisode: number },
  right: { startEpisode: number; endEpisode: number },
): boolean {
  return (
    left.startEpisode === right.startEpisode &&
    left.endEpisode === right.endEpisode
  );
}

function overlaps(
  left: { startEpisode: number; endEpisode: number },
  right: { startEpisode: number; endEpisode: number },
): boolean {
  return (
    left.startEpisode <= right.endEpisode &&
    right.startEpisode <= left.endEpisode
  );
}

function addIssue(
  issues: VerticalDramaStoryControlConsistencyIssue[],
  issue: VerticalDramaStoryControlConsistencyIssue,
): void {
  if (
    !issues.some(
      existing => existing.code === issue.code && existing.path === issue.path,
    )
  ) {
    issues.push(issue);
  }
}

function inspectPlaceholders(
  design: VerticalDramaDraftStoryDesign,
  issues: VerticalDramaStoryControlConsistencyIssue[],
): void {
  const check = (value: unknown, path: string) => {
    if (PLACEHOLDER_PATTERN.test(String(value ?? ""))) {
      addIssue(issues, {
        code: "placeholder_control_text",
        path,
        message: `Control text at ${path} is a placeholder and cannot drive episode planning.`,
        repairable: true,
      });
    }
  };

  design.pressureThreads.forEach((thread, index) => {
    check(thread.label, `pressureThreads[${index}].label`);
    check(thread.description, `pressureThreads[${index}].description`);
  });
  design.romanceProgression.forEach((phase, index) => {
    check(phase.purpose, `romanceProgression[${index}].purpose`);
  });
  design.advantageBeats.forEach((beat, index) => {
    check(beat.cost, `advantageBeats[${index}].cost`);
    check(beat.opponentResponse, `advantageBeats[${index}].opponentResponse`);
    check(beat.purpose, `advantageBeats[${index}].purpose`);
  });
}

function inspectDuplicateControls(
  design: VerticalDramaDraftStoryDesign,
  issues: VerticalDramaStoryControlConsistencyIssue[],
): void {
  const threadIds = new Set<string>();
  design.pressureThreads.forEach((thread, index) => {
    const key = normalized(thread.threadId);
    if (threadIds.has(key)) {
      addIssue(issues, {
        code: "duplicate_pressure_thread",
        path: `pressureThreads[${index}].threadId`,
        message: `Pressure thread id is duplicated: ${thread.threadId}.`,
        repairable: true,
      });
    }
    threadIds.add(key);
  });

  const beatFingerprints = new Set<string>();
  design.advantageBeats.forEach((beat, index) => {
    const fingerprint = [
      beat.episodeNumber,
      beat.advantagedSide,
      normalized(beat.cost),
      normalized(beat.opponentResponse),
      normalized(beat.purpose),
    ].join("|");
    if (beatFingerprints.has(fingerprint)) {
      addIssue(issues, {
        code: "duplicate_advantage_beat",
        path: `advantageBeats[${index}]`,
        message: `Advantage beat is duplicated at episode ${beat.episodeNumber}.`,
        repairable: true,
      });
    }
    beatFingerprints.add(fingerprint);
  });
}

function inspectRomanceAlignment(
  design: VerticalDramaDraftStoryDesign,
  architecture: ReturnType<typeof readVerticalDramaStoryArchitecture>,
  targetEpisodeCount: number | undefined,
  issues: VerticalDramaStoryControlConsistencyIssue[],
): void {
  const romanceArc = architecture?.arcBundles.find(arc => arc.id === "romance");
  if (!romanceArc?.episodeWindow) return;

  // A long-form romance is an active season engine, not a short subplot. The
  // canonical repair deliberately stretches it to the configured endpoint;
  // otherwise a valid repair would still be rejected against an old compact
  // arc window.
  const romanceWindow =
    targetEpisodeCount != null && targetEpisodeCount >= 20
      ? { startEpisode: 1, endEpisode: targetEpisodeCount }
      : romanceArc.episodeWindow;
  const romanceThreads = design.pressureThreads.filter(
    thread =>
      thread.category === "romance" ||
      normalized(thread.threadId).includes("romance"),
  );
  if (
    romanceThreads.length > 0 &&
    !romanceThreads.some(thread =>
      overlaps(thread.episodeWindow, romanceWindow) &&
      thread.episodeWindow.endEpisode >= romanceWindow.endEpisode,
    )
  ) {
    addIssue(issues, {
      code: "romance_window_mismatch",
      path: "pressureThreads.romance.episodeWindow",
      message: "Romance pressure threads resolve before the authoritative romance arc destination.",
      repairable: true,
    });
  }

  const phases = design.romanceProgression;
  let previousOrder = -1;
  phases.forEach((phase, index) => {
    const order = ROMANCE_PHASE_ORDER[phase.phase] ?? -1;
    if (order >= 0 && order < previousOrder) {
      addIssue(issues, {
        code: "romance_phase_order",
        path: `romanceProgression[${index}].phase`,
        message: "Romance phases move backwards instead of progressing toward the arc payoff.",
        repairable: true,
      });
    }
    previousOrder = Math.max(previousOrder, order);
    if (!overlaps(phase.episodeWindow, romanceWindow)) {
      addIssue(issues, {
        code: "romance_window_mismatch",
        path: `romanceProgression[${index}].episodeWindow`,
        message: `Romance phase ${phase.phase} does not overlap the authoritative romance arc window.`,
        repairable: true,
      });
    }
  });

  const commitment = phases.find(phase => phase.phase === "commitment");
  if (
    commitment &&
    commitment.episodeWindow.endEpisode < romanceWindow.endEpisode
  ) {
    addIssue(issues, {
      code: "romance_window_mismatch",
      path: "romanceProgression.commitment.episodeWindow",
      message: "Romance commitment ends before the authoritative romance arc payoff.",
      repairable: true,
    });
  }
}

function inspectSeedDrift(
  design: VerticalDramaDraftStoryDesign,
  issues: VerticalDramaStoryControlConsistencyIssue[],
): void {
  const seed = design.storyControlSeed;
  if (!seed) return;

  const designThreadIds = design.pressureThreads.map(thread => thread.threadId).sort();
  const seedThreadIds = seed.threadCandidates.map(thread => thread.threadId).sort();
  if (
    designThreadIds.length !== seedThreadIds.length ||
    designThreadIds.some((id, index) => id !== seedThreadIds[index])
  ) {
    addIssue(issues, {
      code: "story_control_seed_drift",
      path: "storyControlSeed.threadCandidates",
      message: "Story Control Seed thread candidates do not mirror visible pressure threads.",
      repairable: true,
    });
  }

  if (seed.romancePhaseSkeleton.length !== design.romanceProgression.length) {
    addIssue(issues, {
      code: "story_control_seed_drift",
      path: "storyControlSeed.romancePhaseSkeleton",
      message: "Story Control Seed romance phases do not mirror visible romance progression.",
      repairable: true,
    });
  }
  if (seed.advantageIntent.length !== design.advantageBeats.length) {
    addIssue(issues, {
      code: "story_control_seed_drift",
      path: "storyControlSeed.advantageIntent",
      message: "Story Control Seed advantage beats do not mirror visible advantage beats.",
      repairable: true,
    });
  }
}

function inspectAdvantageTiming(
  design: VerticalDramaDraftStoryDesign,
  architecture: ReturnType<typeof readVerticalDramaStoryArchitecture>,
  targetEpisodeCount: number | undefined,
  issues: VerticalDramaStoryControlConsistencyIssue[],
): void {
  if (!targetEpisodeCount || targetEpisodeCount < 20) return;
  const terminalText = [
    architecture?.destination.seasonEndpoint,
    architecture?.destination.longTermEndpoint,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalized)
    .filter(value => value.length >= 12);
  const terminalOnlyPattern =
    /(large[- ]scale|large structure|major project|full[- ]scale deployment|โครงการขนาดใหญ่|โครงสร้างขนาดใหญ่|นำไปใช้กับโครงการ)/i;
  design.advantageBeats.forEach((beat, index) => {
    if (beat.episodeNumber >= targetEpisodeCount) return;
    const text = normalized(
      `${beat.cost} ${beat.opponentResponse} ${beat.purpose ?? ""}`,
    );
    if (
      terminalOnlyPattern.test(text) ||
      terminalText.some(destination => text.includes(destination))
    ) {
      addIssue(issues, {
        code: "terminal_advantage_timing",
        path: `advantageBeats[${index}]`,
        message:
          "A large-project or terminal-destination claim appears before the season endpoint; earlier beats must remain setup, testing, failure, or bounded proof.",
        repairable: true,
      });
    }
  });
}

export function inspectVerticalDramaStoryControlConsistency(params: {
  storyDesign: unknown;
  storyArchitecture?: unknown;
  targetEpisodeCount?: number;
}): VerticalDramaStoryControlConsistencyResult {
  const design = readVerticalDramaDraftStoryDesign(params.storyDesign);
  if (!design) {
    return { ready: false, design: null, issues: [] };
  }
  const architecture = readVerticalDramaStoryArchitecture(
    params.storyArchitecture,
  );
  const issues: VerticalDramaStoryControlConsistencyIssue[] = [];

  if (
    params.targetEpisodeCount != null &&
    design.totalEpisodeCount !== params.targetEpisodeCount
  ) {
    addIssue(issues, {
      code: "terminal_control_beat_missing",
      path: "totalEpisodeCount",
      message: "Story design episode count does not match the configured season.",
      repairable: true,
    });
  }
  if (
    params.targetEpisodeCount != null &&
    !design.advantageBeats.some(
      beat => beat.episodeNumber === params.targetEpisodeCount,
    )
  ) {
    addIssue(issues, {
      code: "terminal_control_beat_missing",
      path: "advantageBeats.terminalDestination",
      message: "Story design has no advantage beat at the terminal episode.",
      repairable: true,
    });
  }

  inspectDuplicateControls(design, issues);
  inspectPlaceholders(design, issues);
  inspectRomanceAlignment(design, architecture, params.targetEpisodeCount, issues);
  inspectAdvantageTiming(
    design,
    architecture,
    params.targetEpisodeCount,
    issues,
  );
  inspectSeedDrift(design, issues);

  return { ready: issues.length === 0, design, issues };
}
