import { createTRPCClient, httpLink } from "@trpc/client";
import type { TRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@server/routers";

let client: TRPCClient<AppRouter> | null = null;

function createClient(): TRPCClient<AppRouter> {
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

export function getLibraryUploadClient(): TRPCClient<AppRouter> {
  if (!client) {
    client = createClient();
  }
  return client;
}
