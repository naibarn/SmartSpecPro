import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();
console.log('[Docker Status] Initializing with path:', window.location.pathname);

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Don't redirect in iframe mode - parent will handle authentication
  const isInIframe = window.self !== window.top;
  if (isInIframe) {
    console.error('[Docker Status] Unauthorized in iframe - parent authentication required');
    return;
  }

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Detect if running in iframe under /docker/ path
// Check both current path and if we're embedded (different from parent)
const getApiUrl = () => {
  const path = window.location.pathname;
  console.log('[Docker Status] Current pathname:', path);

  // Check if we're in an iframe and parent has different path
  const isInIframe = window.self !== window.top;
  console.log('[Docker Status] Is in iframe:', isInIframe);

  // If current path is under /docker/ (direct access or iframe src)
  // Check if path starts with /docker or equals /docker or /docker/
  if (path.startsWith('/docker/') || path === '/docker' || path === '/docker/') {
    console.log('[Docker Status] Detected /docker/ path, using /docker/api/trpc');
    return '/docker/api/trpc';
  }

  // If we're in iframe but path is root, check if parent is on /admin/docker-status
  if (isInIframe) {
    try {
      const parentPath = window.parent?.location?.pathname;
      console.log('[Docker Status] Parent pathname:', parentPath);
      if (parentPath?.includes('docker-status') || parentPath?.includes('/docker')) {
        console.log('[Docker Status] Parent on docker page, using /docker/api/trpc');
        return '/docker/api/trpc';
      }
    } catch (e) {
      // Cross-origin iframe - can't access parent location
      // In this case, we're likely embedded, so use /docker/ prefix
      console.log('[Docker Status] Cross-origin iframe, using /docker/api/trpc');
      return '/docker/api/trpc';
    }
  }

  console.log('[Docker Status] Default path, using /api/trpc');
  return '/api/trpc';
};

const apiUrl = getApiUrl();
console.log('[Docker Status] Using API URL:', apiUrl);

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl,
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
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
