import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

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
          const response = await globalThis.fetch(input, {
            ...(init ?? {}),
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

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
