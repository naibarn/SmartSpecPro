/**
 * tRPC client configuration for docker-status
 * Provides type-safe API client for the backend
 */

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../server/routers';

/**
 * Create tRPC React hooks
 * This provides type-safe React hooks for all API routes
 */
export const trpc = createTRPCReact<AppRouter>();
