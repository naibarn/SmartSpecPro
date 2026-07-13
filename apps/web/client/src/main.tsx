import * as Sentry from "@sentry/react";
import { assertJsonApiResponse } from "@/lib/apiResponseDiagnostics";
import * as systemErrorMonitor from "@/lib/systemErrorMonitor";
import { trpc } from "@/lib/trpc";
import { getPrivateVaultAccessToken } from "@/lib/privateVault";
import { getProtectedSurfaceAccessToken } from "@/lib/protectedSurface";
import {
  retryDelayMs,
  shouldRetryMutation,
  shouldRetryQuery,
  TRPC_REQUEST_TIMEOUT_MS,
} from "@/lib/requestResilience";
import { parseSampleRate, shouldEnableBrowserSentry } from "@/lib/sentryConfig";
import { getSmartSpecWebEndpoint } from "@/lib/webRuntime";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import { setupAuthInterceptor } from "@/services/authService";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./index.css";
import { i18nReady } from "@/i18n";

const SMARTAIHUB_CLIENT_BUILD_ID = "storyboard-review-duration-hotfix-20260627-2";

if (typeof document !== "undefined") {
  document.documentElement.classList.add("enterprise-theme");
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    __SMARTAIHUB_CLIENT_BUILD_ID__: SMARTAIHUB_CLIENT_BUILD_ID,
  });
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
const RESTCOUNTRIES_FALLBACK_PAYLOAD = [
  {
    name: { common: "Thailand", official: "Kingdom of Thailand" },
    idd: { root: "+6", suffixes: ["6"] },
    flag: "TH",
  },
  {
    name: { common: "United States", official: "United States of America" },
    idd: { root: "+1", suffixes: [""] },
    flag: "US",
  },
  {
    name: { common: "United Kingdom", official: "United Kingdom of Great Britain and Northern Ireland" },
    idd: { root: "+4", suffixes: ["4"] },
    flag: "GB",
  },
];

function isRestCountriesRequest(input: unknown): boolean {
  if (typeof input === "string") return /restcountries\.com\/v3\.1\/all/i.test(input);
  if (input instanceof URL) return /restcountries\.com\/v3\.1\/all/i.test(input.href);
  if (typeof Request !== "undefined" && input instanceof Request) {
    return /restcountries\.com\/v3\.1\/all/i.test(input.url);
  }
  return false;
}

function installNoisyThirdPartyRequestGuards(): void {
  if (typeof window === "undefined") return;

  const fallbackBody = JSON.stringify(RESTCOUNTRIES_FALLBACK_PAYLOAD);

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (isRestCountriesRequest(input)) {
        return Promise.resolve(new Response(fallbackBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
  }

  if (typeof window.XMLHttpRequest === "function") {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      if (isRestCountriesRequest(url)) {
        const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(fallbackBody)}`;
        return originalOpen.call(this, method, dataUrl, async ?? true, username ?? null, password ?? null);
      }
      return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };
  }
}

function summarizeUnknownValue(value: unknown): {
  topKeys?: string[];
  totalKeys: number;
  arrays: number;
  strings: number;
  maxStringLength: number;
  dataUrlStrings: number;
  approximateBytes: number;
} {
  const seen = new WeakSet<object>();
  let totalKeys = 0;
  let arrays = 0;
  let strings = 0;
  let maxStringLength = 0;
  let dataUrlStrings = 0;

  const visit = (current: unknown) => {
    if (typeof current === "string") {
      strings += 1;
      maxStringLength = Math.max(maxStringLength, current.length);
      if (current.startsWith("data:")) dataUrlStrings += 1;
      return;
    }
    if (!current || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      arrays += 1;
      current.forEach(visit);
      return;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    totalKeys += entries.length;
    entries.forEach(([, child]) => visit(child));
  };

  visit(value);
  return {
    topKeys: value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>).slice(0, 30)
      : undefined,
    totalKeys,
    arrays,
    strings,
    maxStringLength,
    dataUrlStrings,
    approximateBytes: (() => {
      try {
        return new Blob([JSON.stringify(value)]).size;
      } catch {
        return 0;
      }
    })(),
  };
}

function summarizeTrpcRequestBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(body) as { json?: Record<string, unknown> };
    const json = parsed?.json;
    if (!json || json.skillId !== "smart-character-creator-pro") {
      return undefined;
    }
    return {
      skillId: json.skillId,
      conversationId: json.conversationId,
      bodyBytes: new Blob([body]).size,
      promptLength: typeof json.prompt === "string" ? json.prompt.length : null,
      dynamicParams: summarizeUnknownValue(json.dynamicParams),
      referenceImageUrls: summarizeUnknownValue(json.referenceImageUrls),
    };
  } catch {
    return undefined;
  }
}

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

function shouldDropNoisyThirdPartyBrowserEvent(event: Sentry.Event): boolean {
  const breadcrumbText = (event.breadcrumbs ?? [])
    .map((crumb) => [
      crumb.category,
      crumb.message,
      crumb.data && typeof crumb.data === "object"
        ? Object.values(crumb.data as Record<string, unknown>).join(" ")
        : "",
    ].join(" "))
    .join(" ");
  const text = [
    event.message,
    event.exception?.values?.map((value) => `${value.type ?? ""} ${value.value ?? ""}`).join(" "),
    event.request?.url,
    event.transaction,
    breadcrumbText,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    /restcountries\.com/i.test(text) ||
    /No 'Access-Control-Allow-Origin' header is present/i.test(text) ||
    /blocked by CORS policy/i.test(text) ||
    /429 \(Too Many Requests\)/i.test(text)
  );
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
  installNoisyThirdPartyRequestGuards();

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
const sentryDenyUrls = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /static\.cloudflareinsights\.com/i,
  /restcountries\.com/i,
  /extension\.js/i,
];
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
      /Loading the script .*static\.cloudflareinsights\.com\/beacon\.min\.js/i,
      /violates the following Content Security Policy directive/i,
    ],
    denyUrls: sentryDenyUrls,
    beforeSend(event) {
      if (shouldDropNoisyThirdPartyBrowserEvent(event)) {
        return null;
      }
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

// System-wide resilience policy: bounded retry-and-wait for transient
// backend unavailability (e.g. a smartspec-web restart) instead of an
// immediate error. See @/lib/requestResilience for the exact fixed policy
// (queries retry any transient/system-class error; mutations retry only a
// pure network-connection failure, never 5xx/timeout, to avoid
// double-charging credits on a write that may have already landed).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: retryDelayMs,
    },
    mutations: {
      retry: shouldRetryMutation,
      retryDelay: retryDelayMs,
    },
  },
});

setupAuthInterceptor();

let isRedirectingToLogin = false;
let authRecheckInFlight: Promise<boolean> | null = null;
let lastUnauthorizedAt = 0;
const debugTrpcFetch =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_TRPC === "1";

const hasActiveSession = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (authRecheckInFlight) return authRecheckInFlight;

  authRecheckInFlight = (async () => {
    try {
      const response = await globalThis.fetch(getSmartSpecWebEndpoint("/trpc/auth.me"), {
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

// Derives a dotted tRPC procedure path (e.g. "media.generate") from a
// @trpc/react-query queryKey/mutationKey, whose first element is the path
// segments array. Returns undefined for shapes that don't match (e.g.
// plain non-tRPC React Query keys) rather than guessing.
function deriveTrpcPathFromKey(key: unknown): string | undefined {
  if (!Array.isArray(key) || key.length === 0) return undefined;
  const pathSegments = key[0];
  if (
    Array.isArray(pathSegments)
    && pathSegments.every(segment => typeof segment === "string")
  ) {
    return pathSegments.join(".");
  }
  return undefined;
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    void redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
    systemErrorMonitor.handleError(
      error,
      deriveTrpcPathFromKey(event.query.queryKey),
    );
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    void redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    systemErrorMonitor.handleError(
      error,
      deriveTrpcPathFromKey(event.mutation.options.mutationKey),
    );
  }
});

const trpcClient = trpc.createClient({
  links: [
    // Use httpLink instead of httpBatchLink to isolate issues
    httpLink({
      url: getSmartSpecWebEndpoint("/trpc"),
      transformer: superjson,
      async fetch(input, init) {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (debugTrpcFetch) {
          console.log("[tRPC Fetch]", {
            requestUrl,
            method: init?.method,
            pageOrigin: globalThis.location?.origin,
            bodySummary: summarizeTrpcRequestBody(init?.body),
          });
        }
      // Bounded request timeout: aborts a truly hung connection after
      // TRPC_REQUEST_TIMEOUT_MS (3 min — generous so long sync operations
      // like LLM/skill/media prompt generation aren't broken). Composed
      // with tRPC's own `init.signal` (used for query cancellation) via a
      // dedicated AbortController: either source aborting the combined
      // controller aborts the fetch, and the timer is always cleared so
      // nothing leaks.
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, TRPC_REQUEST_TIMEOUT_MS);
      const incomingSignal = init?.signal;
      const abortFromIncomingSignal = () => timeoutController.abort();
      if (incomingSignal) {
        if (incomingSignal.aborted) {
          timeoutController.abort();
        } else {
          incomingSignal.addEventListener("abort", abortFromIncomingSignal, {
            once: true,
          });
        }
      }
      try {
        const headers = new Headers(init?.headers || {});
        const privateVaultToken = getPrivateVaultAccessToken();
        if (privateVaultToken) {
          headers.set("x-private-vault-token", privateVaultToken);
        }
        const protectedSurfaceToken = getProtectedSurfaceAccessToken();
        if (protectedSurfaceToken) {
          headers.set("x-protected-surface-token", protectedSurfaceToken);
        }
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
          signal: timeoutController.signal,
        });
          if (!response.ok) {
            try {
              const requestId = response.headers.get("X-Request-ID");
              if (requestId) systemErrorMonitor.noteRequestId(requestId);
            } catch {
              // Diagnostics capture must never break the request path.
            }
          }
          await assertJsonApiResponse(response, requestUrl);
          if (debugTrpcFetch) {
            console.log("[tRPC Response]", {
              requestUrl,
              responseUrl: response.url,
              status: response.status,
              statusText: response.statusText,
              contentType: response.headers.get("content-type"),
            });
          }
          return response;
        } catch (err) {
          console.error("[tRPC Fetch Error]", err);
          throw err;
        } finally {
          clearTimeout(timeoutId);
          incomingSignal?.removeEventListener("abort", abortFromIncomingSignal);
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
