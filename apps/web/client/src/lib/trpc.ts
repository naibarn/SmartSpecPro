/**
 * tRPC client configuration for SmartAIHub Web
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@server/routers";

type AppTrpcReact = ReturnType<typeof createTRPCReact<AppRouter>>;

export const trpc: AppTrpcReact = createTRPCReact<AppRouter>();
