import type {
  LiveBrowserSession,
  LiveBrowserStreamTokenResponse,
} from "@shared/liveBrowser";

export type LiveReconnectState = "connected" | "reconnecting" | "stream_unavailable";
export type LiveBrowserStreamScope = "viewer" | "controller";

const DEFAULT_REFRESH_LEAD_MS = 30_000;
const MIN_REFRESH_DELAY_MS = 5_000;

type RuntimeWithLiveBrowserConfig = typeof globalThis & {
  __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
};

export function getLiveBrowserEmbedBaseUrl(
  override?: string | null,
): string | null {
  const candidate = override
    ?? (globalThis as RuntimeWithLiveBrowserConfig)
      .__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__
    ?? import.meta.env.VITE_LIVE_BROWSER_EMBED_BASE_URL
    ?? "";
  const normalized = String(candidate).trim();
  return normalized.length > 0 ? normalized : null;
}

export function getPreferredLiveBrowserStreamScope(
  session: LiveBrowserSession,
  compactViewport: boolean,
): LiveBrowserStreamScope {
  if (
    !compactViewport
    && session.status === "human_controlling"
    && session.stream?.controllerToken
  ) {
    return "controller";
  }
  return "viewer";
}

export function buildLiveBrowserEmbedUrl(input: {
  baseUrl: string;
  sessionId: string;
  token: string;
  scope: LiveBrowserStreamScope;
  interactive: boolean;
}): string {
  const url = new URL(
    input.baseUrl,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  url.searchParams.set("sessionId", input.sessionId);
  url.searchParams.set("token", input.token);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("mode", input.interactive ? "interactive" : "observe");
  return url.toString();
}

export function resolveLiveBrowserStreamTarget(
  session: LiveBrowserSession,
  options: {
    reconnectState: LiveReconnectState;
    compactViewport: boolean;
    embedBaseUrl?: string | null;
  },
):
  | {
      available: true;
      url: string;
      scope: LiveBrowserStreamScope;
      token: string;
      interactive: boolean;
    }
  | {
      available: false;
      reason: string;
      code:
        | "stream_unavailable"
        | "embed_base_missing"
        | "token_missing";
    } {
  if (options.reconnectState === "stream_unavailable") {
    return {
      available: false,
      code: "stream_unavailable",
      reason: "The live browser stream is currently unavailable. Refresh the session or try reconnecting.",
    };
  }

  const baseUrl = getLiveBrowserEmbedBaseUrl(options.embedBaseUrl);
  if (!baseUrl) {
    return {
      available: false,
      code: "embed_base_missing",
      reason: "Live browser rendering is not configured for this environment.",
    };
  }

  const scope = getPreferredLiveBrowserStreamScope(session, options.compactViewport);
  const interactive = scope === "controller" && !options.compactViewport;
  const token = scope === "controller"
    ? session.stream?.controllerToken
    : session.stream?.viewerToken;

  if (!token) {
    return {
      available: false,
      code: "token_missing",
      reason: interactive
        ? "Interactive control is not ready yet. Wait for takeover to complete or refresh the session."
        : "Observe mode is not ready yet. Refresh the session to request a new stream token.",
    };
  }

  return {
    available: true,
    scope,
    token,
    interactive,
    url: buildLiveBrowserEmbedUrl({
      baseUrl,
      sessionId: session.sessionId,
      token,
      scope,
      interactive,
    }),
  };
}

export function getLiveBrowserStreamRefreshDelayMs(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!expiresAt) {
    return null;
  }

  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    return null;
  }

  const delayMs = expiryMs - nowMs - DEFAULT_REFRESH_LEAD_MS;
  if (delayMs <= 0) {
    return MIN_REFRESH_DELAY_MS;
  }
  return delayMs;
}

export function mergeLiveBrowserStream(
  current: LiveBrowserSession["stream"] | undefined,
  next: LiveBrowserStreamTokenResponse,
): NonNullable<LiveBrowserSession["stream"]> {
  return {
    viewerToken: next.scope === "viewer"
      ? next.token
      : current?.viewerToken,
    controllerToken: next.scope === "controller"
      ? next.token
      : current?.controllerToken,
    expiresAt: next.expiresAt,
    leaseExpiresAt: next.leaseExpiresAt ?? current?.leaseExpiresAt,
  };
}
