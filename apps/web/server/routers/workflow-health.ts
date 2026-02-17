/**
 * Workflow Health Router
 * 
 * Provides health check endpoints for workflow-related integrations.
 * Monitors availability of Python backend services and third-party integrations.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const ENDPOINTS = [
  { path: '/api/v1/workflow/available-models', required: true, name: 'available-models' },
  { path: '/api/v1/workflow/rag-collections', required: true, name: 'rag-collections' },
  { path: '/api/v1/workflow/available-approvers', required: false, name: 'available-approvers' },
  { path: '/api/v1/workflow/image-providers', required: false, name: 'image-providers' },
  { path: '/api/v1/skills', required: true, name: 'skills' },
] as const;

export const workflowHealthRouter = router({
  /**
   * Check all workflow-related endpoints health
   */
  checkEndpoints: protectedProcedure
    .output(z.object({
      endpoints: z.array(z.object({
        name: z.string(),
        path: z.string(),
        required: z.boolean(),
        status: z.enum(['ok', 'error', 'timeout']),
        latency: z.number(),
        statusCode: z.number().optional(),
        message: z.string().optional(),
      })),
      allRequiredOk: z.boolean(),
      timestamp: z.string(),
    }))
    .query(async ({ ctx }) => {
      const pythonBackendUrl = process.env.PYTHON_BACKEND_URL;
      
      if (!pythonBackendUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'PYTHON_BACKEND_URL not configured',
        });
      }

      const results = await Promise.all(
        ENDPOINTS.map(async (ep) => {
          const start = Date.now();
          try {
            const response = await fetch(`${pythonBackendUrl}${ep.path}`, {
              method: 'HEAD',
              headers: { 
                'Authorization': `Bearer ${ctx.token}`,
                'Content-Type': 'application/json',
              },
            });
            
            const latency = Date.now() - start;
            
            return {
              name: ep.name,
              path: ep.path,
              required: ep.required,
              status: response.ok ? 'ok' as const : 'error' as const,
              latency,
              statusCode: response.status,
            };
          } catch (error) {
            const latency = Date.now() - start;
            return {
              name: ep.name,
              path: ep.path,
              required: ep.required,
              status: 'error' as const,
              latency,
              message: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      const allRequiredOk = results
        .filter(r => r.required)
        .every(r => r.status === 'ok');

      return {
        endpoints: results,
        allRequiredOk,
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get detailed health status for a specific endpoint
   */
  checkEndpoint: protectedProcedure
    .input(z.object({ name: z.string() }))
    .output(z.object({
      name: z.string(),
      status: z.enum(['ok', 'error', 'timeout']),
      latency: z.number(),
      details: z.record(z.any()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const pythonBackendUrl = process.env.PYTHON_BACKEND_URL;
      
      if (!pythonBackendUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'PYTHON_BACKEND_URL not configured',
        });
      }

      const endpoint = ENDPOINTS.find(ep => ep.name === input.name);
      
      if (!endpoint) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Endpoint ${input.name} not found`,
        });
      }

      const start = Date.now();
      try {
        const response = await fetch(`${pythonBackendUrl}${endpoint.path}`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${ctx.token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const latency = Date.now() - start;
        const data = response.ok ? await response.json().catch(() => undefined) : undefined;
        
        return {
          name: endpoint.name,
          status: response.ok ? 'ok' as const : 'error' as const,
          latency,
          details: data,
        };
      } catch (error) {
        const latency = Date.now() - start;
        return {
          name: endpoint.name,
          status: 'error' as const,
          latency,
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    }),
});
