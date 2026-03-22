import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@server/routers";

let client: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;

function createClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: "/trpc",
        transformer: superjson,
        async fetch(input, init) {
          return fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
}

export function getLibraryUploadClient() {
  if (!client) {
    client = createClient();
  }
  return client;
}

