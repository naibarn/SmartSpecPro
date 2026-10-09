/**
 * Pure, in-memory attention policy for SPEC-308.
 *
 * This module consumes only a trusted projection. It deliberately has no
 * notification payload, transport, storage, clock, or UI dependencies.
 */

export const NOTIFICATION_ATTENTION_TIMING = {
  coalesceMs: 2_000,
  desktopBalloonMs: 5_000,
  mobileBalloonMs: 3_000,
  normalCooldownMs: 60_000,
  criticalCooldownMs: 15_000,
  maxSeenKeys: 200,
} as const;

export type TrustedNotificationCategory =
  | "general"
  | "approval"
  | "success"
  | "error"
  | "critical";

export type TrustedNotificationSeverity = "normal" | "critical";
export type AttentionPriority = "normal" | "critical";
export type AttentionStatus =
  | "INITIALIZING"
  | "QUIET"
  | "COALESCING"
  | "BALLOON_VISIBLE"
  | "COOLDOWN"
  | "SUSPENDED"
  | "DISABLED";

/** No user-authored or notification content belongs in this projection. */
export interface AuthorizedNotificationSignal {
  readonly opaqueStableKey: string;
  readonly trustedCategory: TrustedNotificationCategory;
  readonly trustedSeverity: TrustedNotificationSeverity;
  /** Trusted, monotonically increasing projection version within this scope. */
  readonly version: number;
  readonly scopeGeneration: number;
  readonly authorization: "verified";
}

export interface AttentionEpisode {
  readonly priority: AttentionPriority;
  readonly category: TrustedNotificationCategory;
  /** Used only to choose generic singular/grouped copy; never an unread count. */
  readonly grouped: boolean;
  readonly includedNormalArrival: boolean;
  readonly startedAt: number;
}

export interface NotificationAttentionState {
  readonly status: AttentionStatus;
  readonly scopeGeneration: number;
  readonly enabled: boolean;
  readonly baselineComplete: boolean;
  readonly visible: boolean;
  readonly focusWithinBalloon: boolean;
  readonly episode: AttentionEpisode | null;
  /** Absolute monotonic-time deadline for the current state, if any. */
  readonly deadlineAt: number | null;
  /** In-memory dedupe only; never persist or log these opaque keys. */
  readonly seenKeys: readonly string[];
  readonly latestVersion: number;
  readonly normalCooldownUntil: number;
  readonly criticalCooldownUntil: number;
  readonly pausedBalloonRemainingMs: number | null;
  readonly balloonDurationMs: number;
}

export type AttentionState = NotificationAttentionState;

export type AttentionAction =
  | {
      readonly type: "BASELINE";
      readonly signals: readonly AuthorizedNotificationSignal[];
    }
  | {
      readonly type: "HYDRATE";
      readonly signals: readonly AuthorizedNotificationSignal[];
    }
  | {
      readonly type: "REBASE";
      readonly signals: readonly AuthorizedNotificationSignal[];
      readonly scopeGeneration: number;
    }
  | {
      readonly type: "ARRIVAL";
      readonly signal: AuthorizedNotificationSignal;
      readonly source: "live" | "reconnect" | "query";
      readonly now: number;
      readonly viewport: "desktop" | "mobile";
    }
  | {
      readonly type: "NEW_NOTIFICATION";
      readonly signal: AuthorizedNotificationSignal;
      readonly source: "live" | "reconnect" | "query";
      readonly now: number;
      readonly viewport: "desktop" | "mobile";
    }
  | { readonly type: "ADVANCE"; readonly now: number }
  | {
      readonly type: "SET_VISIBLE";
      readonly visible: boolean;
      readonly now: number;
    }
  | { readonly type: "SUSPEND"; readonly now: number }
  | {
      readonly type: "SET_FOCUS_WITHIN_BALLOON";
      readonly focused: boolean;
      readonly now: number;
    }
  | { readonly type: "DISMISS"; readonly now: number }
  | {
      readonly type: "SET_ENABLED";
      readonly enabled: boolean;
      readonly now: number;
    }
  | {
      readonly type: "SET_SCOPE";
      readonly scopeGeneration: number;
      readonly now: number;
    }
  | {
      readonly type: "RESET";
      readonly scopeGeneration: number;
      readonly now: number;
    };

export function createNotificationAttentionState(options: {
  scopeGeneration: number;
  enabled: boolean;
  visible?: boolean;
  viewport?: "desktop" | "mobile";
}): NotificationAttentionState {
  const visible = options.visible ?? true;
  const enabled = options.enabled;
  return {
    status: !enabled ? "DISABLED" : visible ? "INITIALIZING" : "SUSPENDED",
    scopeGeneration: options.scopeGeneration,
    enabled,
    baselineComplete: false,
    visible,
    focusWithinBalloon: false,
    episode: null,
    deadlineAt: null,
    seenKeys: [],
    latestVersion: -1,
    normalCooldownUntil: 0,
    criticalCooldownUntil: 0,
    pausedBalloonRemainingMs: null,
    balloonDurationMs:
      options.viewport === "mobile"
        ? NOTIFICATION_ATTENTION_TIMING.mobileBalloonMs
        : NOTIFICATION_ATTENTION_TIMING.desktopBalloonMs,
  };
}

export const createInitialAttentionState = createNotificationAttentionState;

function isValidSignal(signal: AuthorizedNotificationSignal): boolean {
  return (
    signal.authorization === "verified" &&
    typeof signal.opaqueStableKey === "string" &&
    signal.opaqueStableKey.length > 0 &&
    Number.isSafeInteger(signal.version) &&
    signal.version >= 0 &&
    Number.isSafeInteger(signal.scopeGeneration) &&
    ["general", "approval", "success", "error", "critical"].includes(
      signal.trustedCategory
    ) &&
    ["normal", "critical"].includes(signal.trustedSeverity)
  );
}

function priorityOf(signal: AuthorizedNotificationSignal): AttentionPriority {
  return signal.trustedCategory === "critical" ||
    signal.trustedSeverity === "critical"
    ? "critical"
    : "normal";
}

function addSeen(
  state: NotificationAttentionState,
  signal: AuthorizedNotificationSignal
): Pick<NotificationAttentionState, "seenKeys" | "latestVersion"> {
  if (state.seenKeys.includes(signal.opaqueStableKey)) {
    return {
      seenKeys: state.seenKeys,
      latestVersion: Math.max(state.latestVersion, signal.version),
    };
  }
  // Fail closed at the cap. Evicting an old ID could make a grouped row look
  // like a distinct arrival later in the same scope.
  if (state.seenKeys.length >= NOTIFICATION_ATTENTION_TIMING.maxSeenKeys) {
    return {
      seenKeys: state.seenKeys,
      latestVersion: Math.max(state.latestVersion, signal.version),
    };
  }
  return {
    seenKeys: [...state.seenKeys, signal.opaqueStableKey],
    latestVersion: Math.max(state.latestVersion, signal.version),
  };
}

function cooldownStatus(
  state: NotificationAttentionState,
  now: number
): AttentionStatus {
  return now < state.normalCooldownUntil || now < state.criticalCooldownUntil
    ? "COOLDOWN"
    : "QUIET";
}

function nextCooldownDeadline(
  state: NotificationAttentionState,
  now: number
): number | null {
  const deadlines = [
    state.normalCooldownUntil,
    state.criticalCooldownUntil,
  ].filter(deadline => deadline > now);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

function finishEpisode(
  state: NotificationAttentionState,
  now: number
): NotificationAttentionState {
  const priority = state.episode?.priority ?? "normal";
  const normalCooldownUntil =
    state.episode?.includedNormalArrival || priority === "normal"
      ? Math.max(
          state.normalCooldownUntil,
          now + NOTIFICATION_ATTENTION_TIMING.normalCooldownMs
        )
      : state.normalCooldownUntil;
  const criticalCooldownUntil =
    priority === "critical"
      ? Math.max(
          state.criticalCooldownUntil,
          now + NOTIFICATION_ATTENTION_TIMING.criticalCooldownMs
        )
      : state.criticalCooldownUntil;
  return {
    ...state,
    status: "COOLDOWN",
    episode: null,
    deadlineAt: nextCooldownDeadline(
      { ...state, normalCooldownUntil, criticalCooldownUntil },
      now
    ),
    focusWithinBalloon: false,
    pausedBalloonRemainingMs: null,
    normalCooldownUntil,
    criticalCooldownUntil,
  };
}

function markBaseline(
  state: NotificationAttentionState,
  signals: readonly AuthorizedNotificationSignal[]
): NotificationAttentionState {
  let seenKeys = [...state.seenKeys];
  let latestVersion = state.latestVersion;
  for (const signal of signals) {
    if (
      !isValidSignal(signal) ||
      signal.scopeGeneration !== state.scopeGeneration
    )
      continue;
    latestVersion = Math.max(latestVersion, signal.version);
    if (
      seenKeys.length < NOTIFICATION_ATTENTION_TIMING.maxSeenKeys &&
      !seenKeys.includes(signal.opaqueStableKey)
    ) {
      seenKeys.push(signal.opaqueStableKey);
    }
  }
  return {
    ...state,
    seenKeys,
    latestVersion,
    status: !state.enabled ? "DISABLED" : state.visible ? "QUIET" : "SUSPENDED",
    baselineComplete: true,
    episode: null,
    deadlineAt: null,
    focusWithinBalloon: false,
    pausedBalloonRemainingMs: null,
  };
}

export function reduceNotificationAttention(
  state: NotificationAttentionState,
  action: AttentionAction
): NotificationAttentionState {
  switch (action.type) {
    case "BASELINE":
    case "HYDRATE":
      if (state.baselineComplete) return state;
      return markBaseline(state, action.signals);

    case "REBASE":
      if (action.scopeGeneration !== state.scopeGeneration) return state;
      return markBaseline(state, action.signals);

    case "ARRIVAL":
    case "NEW_NOTIFICATION": {
      const signal = action.signal;
      if (
        !isValidSignal(signal) ||
        signal.scopeGeneration !== state.scopeGeneration ||
        !state.enabled ||
        !state.baselineComplete ||
        state.status === "DISABLED" ||
        state.seenKeys.includes(signal.opaqueStableKey)
      ) {
        // A valid repeated row advances the ordering watermark but never replays.
        if (
          isValidSignal(signal) &&
          signal.scopeGeneration === state.scopeGeneration &&
          state.seenKeys.includes(signal.opaqueStableKey)
        ) {
          return {
            ...state,
            latestVersion: Math.max(state.latestVersion, signal.version),
          };
        }
        return state;
      }

      // Reconnect/query deliveries and out-of-order versions become baseline
      // knowledge only. They cannot be replayed later as a live arrival.
      if (action.source !== "live" || signal.version <= state.latestVersion) {
        return { ...state, ...addSeen(state, signal) };
      }

      const deduped = addSeen(state, signal);
      if (deduped.seenKeys.length === state.seenKeys.length) {
        // At the bounded memory ceiling, keep visuals quiet instead of risking
        // replay of an evicted grouped row.
        const bounded = { ...state, latestVersion: deduped.latestVersion };
        return {
          ...bounded,
          status:
            state.status === "COOLDOWN"
              ? cooldownStatus(bounded, action.now)
              : state.status,
          deadlineAt:
            state.status === "COOLDOWN"
              ? nextCooldownDeadline(bounded, action.now)
              : state.deadlineAt,
        };
      }
      const base = { ...state, ...deduped };
      if (!state.visible || state.status === "SUSPENDED") {
        return {
          ...base,
          status: "SUSPENDED",
          episode: null,
          deadlineAt: null,
        };
      }

      const priority = priorityOf(signal);
      const allowedByCooldown =
        priority === "critical"
          ? action.now >= state.criticalCooldownUntil
          : action.now >= state.normalCooldownUntil;
      if (!allowedByCooldown) {
        return {
          ...base,
          status: cooldownStatus(base, action.now),
          episode: null,
          deadlineAt: nextCooldownDeadline(base, action.now),
        };
      }

      if (state.status === "COALESCING" && state.episode) {
        const episodePriority =
          state.episode.priority === "critical" || priority === "critical"
            ? "critical"
            : "normal";
        return {
          ...base,
          episode: {
            priority: episodePriority,
            category:
              priority === "critical"
                ? signal.trustedCategory
                : state.episode.category,
            grouped: true,
            includedNormalArrival:
              state.episode.includedNormalArrival || priority === "normal",
            startedAt: state.episode.startedAt,
          },
          // A critical signal promotes the episode but does not extend its bound.
        };
      }

      if (state.status === "BALLOON_VISIBLE") {
        return {
          ...base,
          episode: state.episode
            ? {
                ...state.episode,
                priority:
                  state.episode.priority === "critical" ||
                  priority === "critical"
                    ? "critical"
                    : "normal",
                grouped: true,
                includedNormalArrival:
                  state.episode.includedNormalArrival || priority === "normal",
              }
            : null,
        };
      }

      return {
        ...base,
        status: "COALESCING",
        episode: {
          priority,
          category: signal.trustedCategory,
          grouped: false,
          includedNormalArrival: priority === "normal",
          startedAt: action.now,
        },
        deadlineAt: action.now + NOTIFICATION_ATTENTION_TIMING.coalesceMs,
        focusWithinBalloon: false,
        balloonDurationMs:
          action.viewport === "mobile"
            ? NOTIFICATION_ATTENTION_TIMING.mobileBalloonMs
            : NOTIFICATION_ATTENTION_TIMING.desktopBalloonMs,
      };
    }

    case "ADVANCE": {
      if (
        state.status === "COALESCING" &&
        state.deadlineAt !== null &&
        action.now >= state.deadlineAt
      ) {
        return {
          ...state,
          status: "BALLOON_VISIBLE",
          deadlineAt: state.focusWithinBalloon
            ? null
            : action.now + state.balloonDurationMs,
          pausedBalloonRemainingMs: state.focusWithinBalloon
            ? state.balloonDurationMs
            : null,
        };
      }
      if (
        state.status === "BALLOON_VISIBLE" &&
        !state.focusWithinBalloon &&
        state.deadlineAt !== null &&
        action.now >= state.deadlineAt
      ) {
        return finishEpisode(state, action.now);
      }
      if (
        state.status === "COOLDOWN" &&
        state.deadlineAt !== null &&
        action.now >= state.deadlineAt
      ) {
        return {
          ...state,
          status: cooldownStatus(state, action.now),
          deadlineAt: nextCooldownDeadline(state, action.now),
        };
      }
      return state;
    }

    case "SET_VISIBLE": {
      if (action.visible === state.visible) return state;
      if (!action.visible) {
        const dismissed = state.episode
          ? finishEpisode(state, action.now)
          : state;
        return {
          ...dismissed,
          visible: false,
          status: state.enabled ? "SUSPENDED" : "DISABLED",
          episode: null,
          deadlineAt: null,
        };
      }
      if (!state.enabled)
        return { ...state, visible: true, status: "DISABLED" };
      return {
        ...state,
        visible: true,
        status: cooldownStatus(state, action.now),
        episode: null,
        deadlineAt: null,
        focusWithinBalloon: false,
        pausedBalloonRemainingMs: null,
      };
    }

    case "SUSPEND":
      return reduceNotificationAttention(state, {
        type: "SET_VISIBLE",
        visible: false,
        now: action.now,
      });

    case "SET_FOCUS_WITHIN_BALLOON": {
      if (
        state.status !== "BALLOON_VISIBLE" ||
        action.focused === state.focusWithinBalloon
      )
        return state;
      if (action.focused) {
        const remaining =
          state.deadlineAt === null
            ? state.balloonDurationMs
            : Math.max(0, state.deadlineAt - action.now);
        return {
          ...state,
          focusWithinBalloon: true,
          pausedBalloonRemainingMs: remaining,
          deadlineAt: null,
        };
      }
      const remaining =
        state.pausedBalloonRemainingMs ?? state.balloonDurationMs;
      return {
        ...state,
        focusWithinBalloon: false,
        pausedBalloonRemainingMs: null,
        deadlineAt: action.now + remaining,
      };
    }

    case "DISMISS":
      if (!state.episode) return state;
      return finishEpisode(state, action.now);

    case "SET_ENABLED":
      if (action.enabled === state.enabled) return state;
      if (!action.enabled) {
        return {
          ...state,
          enabled: false,
          status: "DISABLED",
          episode: null,
          deadlineAt: null,
          focusWithinBalloon: false,
          pausedBalloonRemainingMs: null,
        };
      }
      return {
        ...state,
        enabled: true,
        status: state.visible
          ? state.baselineComplete
            ? cooldownStatus(state, action.now)
            : "INITIALIZING"
          : "SUSPENDED",
        episode: null,
        deadlineAt: null,
      };

    case "SET_SCOPE":
      if (action.scopeGeneration === state.scopeGeneration) return state;
      return createNotificationAttentionState({
        scopeGeneration: action.scopeGeneration,
        enabled: state.enabled,
        visible: state.visible,
      });

    case "RESET":
      return createNotificationAttentionState({
        scopeGeneration: action.scopeGeneration,
        enabled: state.enabled,
        visible: state.visible,
      });
  }
}
