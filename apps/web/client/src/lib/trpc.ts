/**
 * tRPC client configuration for SmartSpec Web
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@server/routers";

export const trpc = createTRPCReact<AppRouter>();
