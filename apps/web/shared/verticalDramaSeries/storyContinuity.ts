import type { VdEpisodeMemory, VdOpenThread } from "./seriesMemoryState";
import type {
  VerticalDramaStoryControlSeed,
  VerticalDramaStoryControlThread,
} from "./storyControl";

export type VerticalDramaContinuityIssueCode =
  | "duplicate_thread_open"
  | "unregistered_thread_resolution"
  | "thread_resolved_twice"
  | "thread_due_unresolved"
  | "season_thread_unresolved";

export type VerticalDramaContinuityIssue = {
  code: VerticalDramaContinuityIssueCode;
  episodeNumber: number;
  threadId: string;
  message: string;
};

export type VerticalDramaContinuityValidation = {
  ok: boolean;
  issues: VerticalDramaContinuityIssue[];
  openThreads: VdOpenThread[];
};

export type VerticalDramaContinuityQuarantineReason =
  | "unregistered_resolution"
  | "duplicate_resolution"
  | "duplicate_opening";

export type VerticalDramaContinuityQuarantine = {
  episodeNumber: number;
  threadId: string;
  reason: VerticalDramaContinuityQuarantineReason;
  message: string;
};

export type VerticalDramaContinuityNormalization = {
  episodes: VdEpisodeMemory[];
  quarantinedResolutions: VerticalDramaContinuityQuarantine[];
  quarantinedOpenings: VerticalDramaContinuityQuarantine[];
};

/**
 * Select only the persisted episode memories that can causally affect the
 * episode currently being generated. Future episode memories may already be
 * present after a full-season draft, but they must not block an earlier
 * episode's media generation.
 */
export function selectPriorVerticalDramaMemories(
  episodes: ReadonlyArray<VdEpisodeMemory>,
  currentEpisodeNumber: number
): VdEpisodeMemory[] {
  return episodes.filter(
    episode => episode.episodeNumber < currentEpisodeNumber
  );
}

/**
 * Normalize the only lifecycle marker that cannot be safely inferred later:
 * a resolution must refer to a thread that was already opened. LLM output and
 * legacy JSON are allowed to contain unknown IDs, but those IDs must not be
 * allowed to poison every future media gate for the series.
 *
 * The normalizer is deliberately chronological and non-mutating. It keeps
 * valid openings/resolutions intact, allows an opening and resolution in the
 * same episode, and quarantines only untrusted lifecycle markers. A repeated
 * opening is treated as an idempotent continuation marker (the first opening
 * remains authoritative), not as a new lifecycle event. The one explicit
 * metadata correction allowed here is a repeated canonical ID with
 * expectedResolution="season": it reclassifies the original opening as a
 * season carry-over, because the current episode is the only place a repair
 * can authoritatively declare that an old thread continues beyond the season.
 * It never guesses an alias or matches by description.
 */
export function normalizeVerticalDramaContinuityTimeline(
  episodes: ReadonlyArray<VdEpisodeMemory>
): VerticalDramaContinuityNormalization {
  const sorted = episodes
    .map((episode, index) => ({ episode, index }))
    .filter(
      ({ episode }) =>
        episode != null && typeof episode.episodeNumber === "number"
    )
    .sort(
      (a, b) =>
        a.episode.episodeNumber - b.episode.episodeNumber || a.index - b.index
    )
    .map(({ episode }) => episode);

  const opened = new Set<string>();
  const authoritativeOpeningLocation = new Map<
    string,
    { episodeIndex: number; threadIndex: number }
  >();
  const resolved = new Set<string>();
  const quarantinedResolutions: VerticalDramaContinuityQuarantine[] = [];
  const quarantinedOpenings: VerticalDramaContinuityQuarantine[] = [];
  const normalizedEpisodes: VdEpisodeMemory[] = [];
  for (const episode of sorted) {
    const candidateThreadsOpened = (
      Array.isArray(episode.threadsOpened) ? episode.threadsOpened : []
    )
      .filter(
        (thread): thread is VdOpenThread =>
          !!thread &&
          typeof thread === "object" &&
          typeof thread.threadId === "string" &&
          thread.threadId.trim().length > 0
      )
      .map(thread => ({
        ...thread,
        threadId: thread.threadId.trim(),
      }));
    const threadsOpened: VdOpenThread[] = [];
    for (const thread of candidateThreadsOpened) {
      if (opened.has(thread.threadId)) {
        const priorLocation = authoritativeOpeningLocation.get(thread.threadId);
        if (
          !resolved.has(thread.threadId) &&
          thread.expectedResolution === "season" &&
          priorLocation
        ) {
          const priorEpisode = normalizedEpisodes[priorLocation.episodeIndex];
          const priorThread =
            priorEpisode?.threadsOpened?.[priorLocation.threadIndex];
          if (priorEpisode && priorThread) {
            const {
              expectedResolutionEpisode: _priorExpectedResolutionEpisode,
              ...priorThreadWithoutEpisode
            } = priorThread;
            const nextThreadsOpened = [...priorEpisode.threadsOpened];
            nextThreadsOpened[priorLocation.threadIndex] = {
              ...priorThreadWithoutEpisode,
              expectedResolution: "season",
            };
            normalizedEpisodes[priorLocation.episodeIndex] = {
              ...priorEpisode,
              threadsOpened: nextThreadsOpened,
            };
          }
          continue;
        }
        quarantinedOpenings.push({
          episodeNumber: episode.episodeNumber,
          threadId: thread.threadId,
          reason: "duplicate_opening",
          message: `Thread ${thread.threadId} repeated an existing opening in episode ${episode.episodeNumber}; the repeated opening marker was quarantined and the original lifecycle was retained.`,
        });
        continue;
      }
      opened.add(thread.threadId);
      authoritativeOpeningLocation.set(thread.threadId, {
        episodeIndex: normalizedEpisodes.length,
        threadIndex: threadsOpened.length,
      });
      threadsOpened.push(thread);
    }

    const threadsResolved: string[] = [];
    for (const rawThreadId of Array.isArray(episode.threadsResolved)
      ? episode.threadsResolved
      : []) {
      const threadId =
        typeof rawThreadId === "string" ? rawThreadId.trim() : "";
      if (!threadId) continue;
      if (!opened.has(threadId)) {
        quarantinedResolutions.push({
          episodeNumber: episode.episodeNumber,
          threadId,
          reason: "unregistered_resolution",
          message: `Thread ${threadId} was resolved without a registered opening and was quarantined.`,
        });
        continue;
      }
      if (resolved.has(threadId)) {
        quarantinedResolutions.push({
          episodeNumber: episode.episodeNumber,
          threadId,
          reason: "duplicate_resolution",
          message: `Thread ${threadId} was resolved more than once; the duplicate marker was quarantined.`,
        });
        continue;
      }
      threadsResolved.push(threadId);
      resolved.add(threadId);
    }

    normalizedEpisodes.push({
      ...episode,
      threadsOpened,
      threadsResolved,
    });
  }

  return {
    episodes: normalizedEpisodes,
    quarantinedResolutions,
    quarantinedOpenings,
  };
}

export type VerticalDramaStoryControlAuditStatus =
  | "registered"
  | "open"
  | "overdue"
  | "resolved"
  | "needs_review"
  | "legacy_unknown"
  | "missing_opening";

export type VerticalDramaStoryControlAuditThread = {
  threadId: string;
  label: string;
  status: VerticalDramaStoryControlAuditStatus;
  seedStatus: VerticalDramaStoryControlThread["status"] | null;
  scope: VerticalDramaStoryControlThread["scope"] | "legacy_unknown";
  ownerCharacters: string[];
  plantEpisode: number | null;
  payoffWindow: { startEpisode: number; endEpisode: number } | null;
  expectedEvidence: string[];
  resolutionCost: string | null;
  openedEpisode: number | null;
  resolvedEpisode: number | null;
  reason: string;
};

export type VerticalDramaStoryControlAudit = {
  currentEpisode: number;
  threads: VerticalDramaStoryControlAuditThread[];
  counts: Record<VerticalDramaStoryControlAuditStatus, number>;
};

/**
 * Read-only reconciliation view for the UI and audit reports. It never
 * promotes a legacy memory thread into the canonical seed and never marks a
 * thread resolved from text similarity. Missing openings, duplicate lifecycle
 * events, and overdue registered threads remain visible as review states.
 */
export function auditVerticalDramaStoryControl(input: {
  seed?: VerticalDramaStoryControlSeed | null;
  episodes: ReadonlyArray<VdEpisodeMemory>;
  currentEpisode?: number;
}): VerticalDramaStoryControlAudit {
  const episodes = [...input.episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const currentEpisode =
    input.currentEpisode ??
    episodes.at(-1)?.episodeNumber ??
    Math.max(
      0,
      ...(input.seed?.threadCandidates.map(
        thread => thread.payoffWindow.endEpisode
      ) ?? [])
    );
  const openings = new Map<string, { thread: VdOpenThread; episode: number }>();
  const duplicateOpenings = new Set<string>();
  const resolutions = new Map<string, number>();
  const duplicateResolutions = new Set<string>();

  for (const episode of episodes) {
    for (const thread of episode.threadsOpened ?? []) {
      if (!thread?.threadId?.trim()) continue;
      if (openings.has(thread.threadId)) {
        duplicateOpenings.add(thread.threadId);
      } else {
        openings.set(thread.threadId, {
          thread,
          episode: episode.episodeNumber,
        });
      }
    }
    for (const threadId of episode.threadsResolved ?? []) {
      if (!threadId?.trim()) continue;
      if (resolutions.has(threadId)) {
        duplicateResolutions.add(threadId);
      } else {
        resolutions.set(threadId, episode.episodeNumber);
      }
    }
  }

  const seedById = new Map(
    input.seed?.threadCandidates.map(thread => [thread.threadId, thread]) ?? []
  );
  const rows: VerticalDramaStoryControlAuditThread[] = [];
  const pushRow = (
    seedThread: VerticalDramaStoryControlThread | undefined,
    threadId: string
  ) => {
    const opening = openings.get(threadId);
    const resolvedEpisode = resolutions.get(threadId) ?? null;
    const duplicate =
      duplicateOpenings.has(threadId) || duplicateResolutions.has(threadId);
    const seedStatus = seedThread?.status ?? null;
    let status: VerticalDramaStoryControlAuditStatus;
    let reason: string;

    if (!seedThread) {
      status = opening ? "legacy_unknown" : "missing_opening";
      reason = opening
        ? "Memory contains a thread ID that is not registered in the current story-control seed."
        : "A resolution exists without a matching opening record.";
    } else if (duplicate) {
      status = "needs_review";
      reason =
        "The same thread ID has duplicate opening or resolution lifecycle records.";
    } else if (seedStatus === "needs_review") {
      status = "needs_review";
      reason = "The authoring seed itself marked this thread for review.";
    } else if (seedStatus === "legacy_unknown") {
      status = "legacy_unknown";
      reason = "The authoring seed marked this thread as legacy/unknown.";
    } else if (resolvedEpisode != null && opening) {
      status = "resolved";
      reason =
        "The registered thread has a matched opening and resolution episode.";
    } else if (resolvedEpisode != null && !opening) {
      status = "missing_opening";
      reason =
        "The registered thread has a resolution record but no matching opening record.";
    } else if (seedStatus === "resolved") {
      status = "needs_review";
      reason =
        "The seed marks the thread resolved, but episode memory has no matching resolution.";
    } else if (!opening) {
      status = "registered";
      reason =
        "The thread is registered in the seed but has no matched episode-memory opening yet.";
    } else if (currentEpisode > seedThread.payoffWindow.endEpisode) {
      status = "overdue";
      reason = "The thread is open beyond its registered payoff window.";
    } else {
      status = "open";
      reason =
        "The thread has an opening record and remains unresolved within its payoff window.";
    }

    rows.push({
      threadId,
      label: seedThread?.label ?? opening?.thread.description ?? threadId,
      status,
      seedStatus,
      scope: seedThread?.scope ?? "legacy_unknown",
      ownerCharacters: seedThread?.ownerCharacters ?? [],
      plantEpisode: seedThread?.plantEpisode ?? opening?.episode ?? null,
      payoffWindow: seedThread?.payoffWindow ?? null,
      expectedEvidence: seedThread?.expectedEvidence ?? [],
      resolutionCost: seedThread?.resolutionCost ?? null,
      openedEpisode: opening?.episode ?? null,
      resolvedEpisode,
      reason,
    });
  };

  for (const thread of input.seed?.threadCandidates ?? []) {
    pushRow(thread, thread.threadId);
  }
  for (const threadId of new Set([...openings.keys(), ...resolutions.keys()])) {
    if (!seedById.has(threadId)) pushRow(undefined, threadId);
  }

  const counts = {
    registered: 0,
    open: 0,
    overdue: 0,
    resolved: 0,
    needs_review: 0,
    legacy_unknown: 0,
    missing_opening: 0,
  } satisfies Record<VerticalDramaStoryControlAuditStatus, number>;
  for (const row of rows) counts[row.status] += 1;
  return { currentEpisode, threads: rows, counts };
}

/**
 * Deterministic continuity check shared by full-story generation and the
 * episode pipeline. It is intentionally pure: old JSON blobs can be audited
 * without changing them, while new generation can fail before paid media.
 */
export function validateVerticalDramaContinuity(input: {
  episodes: ReadonlyArray<VdEpisodeMemory>;
  /**
   * When supplied, report non-season threads whose declared payoff deadline
   * has already passed. Omitting this preserves the media-gate behaviour for
   * an in-progress season.
   */
  currentEpisodeNumber?: number;
  seasonEndEpisode?: number;
}): VerticalDramaContinuityValidation {
  const episodes = [...input.episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const opened = new Map<string, VdOpenThread>();
  const resolved = new Map<string, number>();
  const issues: VerticalDramaContinuityIssue[] = [];

  for (const episode of episodes) {
    for (const thread of episode.threadsOpened ?? []) {
      const threadId = thread.threadId.trim();
      if (!threadId) continue;
      const prior = opened.get(threadId);
      if (prior && prior.openedEpisode !== thread.openedEpisode) {
        issues.push({
          code: "duplicate_thread_open",
          episodeNumber: episode.episodeNumber,
          threadId,
          message: `Thread ${threadId} was opened again after episode ${prior.openedEpisode}.`,
        });
        continue;
      }
      opened.set(threadId, { ...thread, threadId });
    }

    for (const threadIdRaw of episode.threadsResolved ?? []) {
      const threadId = threadIdRaw.trim();
      if (!threadId) continue;
      if (!opened.has(threadId)) {
        issues.push({
          code: "unregistered_thread_resolution",
          episodeNumber: episode.episodeNumber,
          threadId,
          message: `Thread ${threadId} was resolved without a registered opening.`,
        });
        continue;
      }
      if (resolved.has(threadId)) {
        issues.push({
          code: "thread_resolved_twice",
          episodeNumber: episode.episodeNumber,
          threadId,
          message: `Thread ${threadId} was resolved more than once.`,
        });
        continue;
      }
      resolved.set(threadId, episode.episodeNumber);
    }
  }

  const openThreads = [...opened.values()]
    .filter(thread => !resolved.has(thread.threadId))
    .sort((a, b) => a.openedEpisode - b.openedEpisode);

  const dueThreadIds = new Set<string>();
  if (input.currentEpisodeNumber != null) {
    for (const thread of openThreads) {
      if (
        thread.expectedResolution === "season" ||
        !Number.isInteger(thread.expectedResolutionEpisode) ||
        thread.expectedResolutionEpisode > input.currentEpisodeNumber
      ) {
        continue;
      }
      dueThreadIds.add(thread.threadId);
      issues.push({
        code: "thread_due_unresolved",
        episodeNumber: input.currentEpisodeNumber,
        threadId: thread.threadId,
        message: `Thread ${thread.threadId} was expected to resolve by episode ${thread.expectedResolutionEpisode} but remains open at episode ${input.currentEpisodeNumber}.`,
      });
    }
  }

  if (input.seasonEndEpisode != null) {
    for (const thread of openThreads) {
      if (
        thread.expectedResolution === "season" ||
        dueThreadIds.has(thread.threadId)
      ) {
        continue;
      }
      issues.push({
        code: "season_thread_unresolved",
        episodeNumber: input.seasonEndEpisode,
        threadId: thread.threadId,
        message: `Thread ${thread.threadId} remains open at the season boundary.`,
      });
    }
  }

  return { ok: issues.length === 0, issues, openThreads };
}
