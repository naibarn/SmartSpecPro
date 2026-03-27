import * as Sentry from "@sentry/react";
import { trpc } from "@/lib/trpc";
import { getPrivateVaultAccessToken } from "@/lib/privateVault";
import { parseSampleRate, shouldEnableBrowserSentry } from "@/lib/sentryConfig";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { i18nReady } from "@/i18n";

if (typeof document !== "undefined") {
  document.documentElement.classList.add("enterprise-theme");
}

const CHUNK_RELOAD_MARKER = "__smartspec_chunk_reload_at__";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const SENTRY_EVENT_DEDUPE_WINDOW_MS = 30_000;
const recentSentryEvents = new Map<string, number>();
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
];

function shouldDropDuplicateSentryEvent(event: Sentry.Event): boolean {
  const exceptionValue = event.exception?.values?.[0]?.value || "";
  const exceptionType = event.exception?.values?.[0]?.type || "";
  const key = [
    event.message || "",
    exceptionType,
    exceptionValue,
    event.transaction || "",
  ]
    .join("|")
    .trim();

  if (!key) {
    return false;
  }

  const now = Date.now();
  const lastSeenAt = recentSentryEvents.get(key);
  recentSentryEvents.set(key, now);
  if (lastSeenAt != null && now - lastSeenAt < SENTRY_EVENT_DEDUPE_WINDOW_MS) {
    return true;
  }

  // Guard against unbounded growth in long-lived tabs
  if (recentSentryEvents.size > 500) {
    for (const [existingKey, seenAt] of recentSentryEvents) {
      if (now - seenAt > SENTRY_EVENT_DEDUPE_WINDOW_MS) {
        recentSentryEvents.delete(existingKey);
      }
    }
  }

  return false;
}

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
  }
  if (typeof error === "string") {
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error));
  }
  return false;
}

function reloadForChunkError(): void {
  if (typeof window === "undefined") return;

  const lastReloadAtRaw = sessionStorage.getItem(CHUNK_RELOAD_MARKER);
  const lastReloadAt = lastReloadAtRaw ? Number(lastReloadAtRaw) : 0;
  const now = Date.now();
  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RELOAD_WINDOW_MS) {
    toast.error("แอปอัปเดตแล้ว แต่ไฟล์หน้าเว็บเก่าค้างอยู่", {
      description: "กรุณา hard refresh (Ctrl+Shift+R) แล้วลองใหม่อีกครั้ง",
      duration: 7000,
    });
    return;
  }

  sessionStorage.setItem(CHUNK_RELOAD_MARKER, String(now));
  window.location.reload();
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (event) => {
      if (!isChunkLoadError(event.error) && !isChunkLoadError(event.message)) return;
      event.preventDefault();
      reloadForChunkError();
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (!isChunkLoadError(event.reason)) return;
    event.preventDefault();
    reloadForChunkError();
  });
}

// Initialize Sentry for frontend error tracking (only when enabled + DSN configured)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentrySampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_SAMPLE_RATE, 0.2);
const sentryTraceSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.02);
const sentryReplaySessionSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE, 0);
const sentryReplayOnErrorSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE, 0.1);
const isSentryEnabled = shouldEnableBrowserSentry({
  enabledFlag: import.meta.env.VITE_SENTRY_ENABLED,
  dsn: sentryDsn,
  mode: import.meta.env.MODE,
  hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
  allowDevFlag: import.meta.env.VITE_SENTRY_ALLOW_DEV,
});

if (isSentryEnabled && sentryDsn) {
  const integrations: any[] = [Sentry.browserTracingIntegration()];
  if (sentryReplaySessionSampleRate > 0 || sentryReplayOnErrorSampleRate > 0) {
    integrations.push(
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: false,
      }),
    );
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || "production",
    release: import.meta.env.VITE_RELEASE || undefined,
    sampleRate: sentrySampleRate,
    tracesSampleRate: sentryTraceSampleRate,
    replaysSessionSampleRate: sentryReplaySessionSampleRate,
    replaysOnErrorSampleRate: sentryReplayOnErrorSampleRate,
    integrations,
    ignoreErrors: [
      "Fullscreen API unavailable",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
    beforeSend(event) {
      if (shouldDropDuplicateSentryEvent(event)) {
        return null;
      }

      const scrubObj = (obj: Record<string, unknown>) => {
        for (const key of Object.keys(obj)) {
          if (/password|token|secret|apiKey/i.test(key)) {
            obj[key] = "[FILTERED]";
          }
        }
      };
      // Scrub breadcrumbs
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data && typeof crumb.data === "object") {
            scrubObj(crumb.data as Record<string, unknown>);
          }
        }
      }
      // Scrub extra data
      if (event.extra && typeof event.extra === "object") {
        scrubObj(event.extra as Record<string, unknown>);
      }
      return event;
    },
  });
}

// Initialize PostHog for product analytics (only when API key is configured)
import { initPostHog } from "@/lib/posthog";
initPostHog();

const queryClient = new QueryClient();

let isRedirectingToLogin = false;
let authRecheckInFlight: Promise<boolean> | null = null;
let lastUnauthorizedAt = 0;

const hasActiveSession = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (authRecheckInFlight) return authRecheckInFlight;

  authRecheckInFlight = (async () => {
    try {
      const response = await globalThis.fetch("/trpc/auth.me", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) return false;

      const payload = await response.json();
      const user = payload?.result?.data?.json;
      return Boolean(user?.id);
    } catch {
      return false;
    } finally {
      authRecheckInFlight = null;
    }
  })();

  return authRecheckInFlight;
};

const redirectToLoginIfUnauthorized = async (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (isRedirectingToLogin) return;

  const now = Date.now();
  if (now - lastUnauthorizedAt < 1000) return;
  lastUnauthorizedAt = now;

  const isUnauthorized =
    error.message === UNAUTHED_ERR_MSG || error.data?.code === "UNAUTHORIZED";
  if (!isUnauthorized) return;

  // Avoid hard redirect on transient API/network blips.
  const sessionAlive = await hasActiveSession();
  if (sessionAlive) return;

  // One quick retry to avoid false logout when backend is briefly unavailable.
  await new Promise(resolve => setTimeout(resolve, 300));
  const sessionAliveRetry = await hasActiveSession();
  if (sessionAliveRetry) return;

  const loginUrl = getLoginUrl();
  const loginPath = new URL(loginUrl, window.location.origin).pathname;
  if (window.location.pathname === loginPath) return;

  isRedirectingToLogin = true;
  toast.error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", {
    description: "Session expired. Redirecting to login...",
    duration: 3000,
  });

  setTimeout(() => {
    window.location.href = loginUrl;
  }, 1500);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    void redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    void redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    // Use httpLink instead of httpBatchLink to isolate issues
    httpLink({
      url: "/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        console.log("[tRPC Fetch]", requestUrl, init?.method);
      try {
        const headers = new Headers(init?.headers || {});
        const privateVaultToken = getPrivateVaultAccessToken();
        if (privateVaultToken) {
          headers.set("x-private-vault-token", privateVaultToken);
        }
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
          console.log("[tRPC Response]", response.status, response.statusText);
          return response;
        } catch (err) {
          console.error("[tRPC Fetch Error]", err);
          throw err;
        }
      },
    }),
  ],
});

// Gate React tree on i18nReady to prevent flash of translation keys on startup.
// The 3-second timeout in i18nReady guarantees the app mounts even if namespace
// loading fails (defined in i18n/index.ts).
i18nReady.then(() => {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  createRoot(rootEl).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
});
