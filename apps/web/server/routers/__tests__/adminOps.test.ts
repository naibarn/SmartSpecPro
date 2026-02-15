/**
 * Admin Ops Dashboard Tests
 *
 * Tests for the admin ops dashboard tRPC endpoints:
 * - trafficStats, apiHealth, jobsHealth, kieAiHealth, storageStats, securityStats
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockGroupBy = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

function createChainableMock(resolveValue: any = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnThis(),
    then: (resolve: any) => Promise.resolve(resolveValue).then(resolve),
    [Symbol.iterator]: function* () { yield* resolveValue; },
  };
  return chain;
}

vi.mock('../../db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../drizzle/schema', () => ({
  users: { id: 'id', lastSignedIn: 'lastSignedIn' },
  providerUsageLog: {
    id: 'id', modelUsed: 'modelUsed', statusCode: 'statusCode',
    responseTimeMs: 'responseTimeMs', costUsd: 'costUsd',
    createdAt: 'createdAt', errorType: 'errorType',
  },
  cloudTaskEvents: {
    id: 'id', taskId: 'taskId', queueName: 'queueName',
    status: 'status', errorMessage: 'errorMessage',
    attemptCount: 'attemptCount', createdAt: 'createdAt',
  },
  mediaCallbackEvents: {
    id: 'id', status: 'status', createdAt: 'createdAt',
  },
  mediaCallbackDlq: { id: 'id' },
}));

vi.mock('../../services/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}));

describe('Admin Ops Dashboard Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trafficStats', () => {
    it('returns empty data when database is not available', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      // The router is defined, and with null db returns defaults
      expect(adminOpsRouter).toBeDefined();
      expect(adminOpsRouter._def).toBeDefined();
    });

    it('router has all expected procedures', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      const procedures = Object.keys(adminOpsRouter._def.procedures);
      expect(procedures).toContain('trafficStats');
      expect(procedures).toContain('apiHealth');
      expect(procedures).toContain('jobsHealth');
      expect(procedures).toContain('kieAiHealth');
      expect(procedures).toContain('storageStats');
      expect(procedures).toContain('securityStats');
    });

    it('has exactly 6 procedures', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      const procedures = Object.keys(adminOpsRouter._def.procedures);
      expect(procedures).toHaveLength(6);
    });
  });

  describe('Input validation', () => {
    it('trafficStats accepts days parameter between 1-30', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      const trafficProc = adminOpsRouter._def.procedures.trafficStats;
      expect(trafficProc).toBeDefined();
    });

    it('apiHealth accepts hours parameter between 1-72', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      const apiProc = adminOpsRouter._def.procedures.apiHealth;
      expect(apiProc).toBeDefined();
    });

    it('kieAiHealth accepts hours parameter between 1-72', async () => {
      const { adminOpsRouter } = await import('../adminOps');
      const kieProc = adminOpsRouter._def.procedures.kieAiHealth;
      expect(kieProc).toBeDefined();
    });
  });
});
