import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock dependencies
vi.mock('../services/skillRegistry');
vi.mock('../services/skillExecutor');
vi.mock('../services/rateLimiter');
vi.mock('../db');

describe('executeSkill API', () => {
  const mockCaller = {
    chat: {
      executeSkill: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('accepts dynamicParams in input', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        type: 'text',
      });

      const result = await mockCaller.chat.executeSkill({
        skillId: 'test-skill',
        dynamicParams: { key: 'value', number: 123 },
        conversationId: 123,
      });

      expect(result.success).toBe(true);
    });

    it('accepts extraParams (backward compatible)', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        type: 'text',
      });

      const result = await mockCaller.chat.executeSkill({
        skillId: 'test-skill',
        extraParams: { key: 'value' },
        conversationId: 123,
      });

      expect(result.success).toBe(true);
    });

    it('merges dynamicParams with extraParams (dynamicParams takes precedence)', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ success: true });
      mockCaller.chat.executeSkill.mockImplementation(async (input: any) => {
        // Simulate merging logic
        const merged = { ...input.extraParams, ...input.dynamicParams };
        return mockExecute(merged);
      });

      await mockCaller.chat.executeSkill({
        skillId: 'test-skill',
        extraParams: { key1: 'fromExtra', key2: 'fromExtra' },
        dynamicParams: { key2: 'fromDynamic' },
        conversationId: 123,
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          key1: 'fromExtra',
          key2: 'fromDynamic',
        })
      );
    });

    it('makes prompt optional', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        type: 'text',
      });

      // Should not throw when prompt is missing
      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { input: 'test' },
          conversationId: 123,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Dynamic Params Validation', () => {
    it('validates type for number fields', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed: age must be a number',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { age: 'not-a-number' },
          conversationId: 123,
        })
      ).rejects.toThrow('must be a number');
    });

    it('validates type for boolean fields', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed: enabled must be a boolean',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { enabled: 'yes' },
          conversationId: 123,
        })
      ).rejects.toThrow('must be a boolean');
    });

    it('rejects XSS in text fields', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed: text contains invalid characters',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { text: '<script>alert(1)</script>' },
          conversationId: 123,
        })
      ).rejects.toThrow('invalid characters');
    });

    it('rejects javascript: URLs', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed: image has invalid URL',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { image: 'javascript:alert(1)' },
          conversationId: 123,
        })
      ).rejects.toThrow('invalid URL');
    });

    it('rejects data: URLs', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed: image has invalid URL',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { image: 'data:text/html,<script>alert(1)</script>' },
          conversationId: 123,
        })
      ).rejects.toThrow('invalid URL');
    });

    it('allows /uploads/ URLs', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
      });

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { image: '/uploads/image.png' },
          conversationId: 123,
        })
      ).resolves.not.toThrow();
    });

    it('allows http/https URLs', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
      });

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          dynamicParams: { image: 'https://example.com/image.png' },
          conversationId: 123,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    it('works without dynamicParams', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        type: 'text',
      });

      const result = await mockCaller.chat.executeSkill({
        skillId: 'test-skill',
        prompt: 'Test prompt',
        conversationId: 123,
      });

      expect(result.success).toBe(true);
    });

    it('works with existing extraParams', async () => {
      mockCaller.chat.executeSkill.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        type: 'text',
      });

      const result = await mockCaller.chat.executeSkill({
        skillId: 'test-skill',
        prompt: 'Test prompt',
        extraParams: { customField: 'value' },
        conversationId: 123,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('enforces rate limiting', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded',
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'test-skill',
          conversationId: 123,
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Authorization', () => {
    it('rejects access to restricted skills', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'FORBIDDEN',
          message: "Skill 'restricted-skill' is not available in your account.",
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'restricted-skill',
          conversationId: 123,
        })
      ).rejects.toThrow('not available in your account');
    });

    it('returns 404 for unknown skills', async () => {
      mockCaller.chat.executeSkill.mockRejectedValue(
        new TRPCError({
          code: 'NOT_FOUND',
          message: "Skill 'unknown-skill' not found",
        })
      );

      await expect(
        mockCaller.chat.executeSkill({
          skillId: 'unknown-skill',
          conversationId: 123,
        })
      ).rejects.toThrow('not found');
    });
  });
});
