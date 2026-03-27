import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  connectUploadPostConnection,
  completeUploadPostConnection,
  createUploadPostProfile,
  deleteUploadPostProfile,
  disconnectUploadPostConnection,
  generateUploadPostJwt,
  getUploadPostAnalytics,
  getUploadPostConnection,
  listUploadPostJobs,
  listUploadPostPlatformPages,
  listUploadPostProfiles,
  publishUploadPostNow,
  refreshUploadPostConnection,
  scheduleUploadPostJob,
  syncUploadPostJobStatuses,
  updateUploadPostQueueSettings,
  editUploadPostJob,
} from "../services/uploadPostService";

import {
  UPLOAD_POST_POLICY_VERSION,
  UPLOAD_POST_PLATFORMS,
  type UploadPostPlatform,
  type UploadPostQueueSettings,
} from "../../shared/uploadPost";

const platformSchema = z.enum(UPLOAD_POST_PLATFORMS);

const queueSettingsSchema = z.object({
  enabled: z.boolean(),
  maxPendingJobs: z.number().int().min(1).max(500),
  publishWindowMinutes: z.number().int().min(1).max(240),
  retryWindowMinutes: z.number().int().min(1).max(240),
});

const baseUploadPostProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenantId,
    },
  });
});

const uploadPostProcedure = baseUploadPostProcedure;
const uploadPostRateLimitedProcedure = baseUploadPostProcedure.use(
  createRateLimitMiddleware({
    namespace: "upload-post-management",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  }),
);
const uploadPostPublishRateLimitedProcedure = baseUploadPostProcedure.use(
  createRateLimitMiddleware({
    namespace: "upload-post-publish",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  }),
);

export const uploadPostRouter = router({
  getConnection: uploadPostProcedure.query(async ({ ctx }) => {
    return getUploadPostConnection({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
  }),

  connect: uploadPostRateLimitedProcedure
    .input(z.object({
      apiKey: z.string().trim().min(20).max(500),
      disclosureAccepted: z.literal(true),
      disclosurePolicyVersion: z.string().trim().default(UPLOAD_POST_POLICY_VERSION),
    }))
    .mutation(async ({ ctx, input }) => {
      return connectUploadPostConnection({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        apiKey: input.apiKey,
        disclosureAccepted: input.disclosureAccepted,
        disclosurePolicyVersion: input.disclosurePolicyVersion,
      });
    }),

  refreshConnection: uploadPostRateLimitedProcedure.mutation(async ({ ctx }) => {
    return refreshUploadPostConnection({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
  }),

  disconnect: uploadPostRateLimitedProcedure.mutation(async ({ ctx }) => {
    return disconnectUploadPostConnection({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
  }),

  listProfiles: uploadPostProcedure
    .input(z.object({
      connectionId: z.number().int().positive().optional().nullable(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listUploadPostProfiles({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        connectionId: input?.connectionId ?? null,
      });
    }),

  createProfile: uploadPostRateLimitedProcedure
    .input(z.object({
      platform: platformSchema,
      platformPageId: z.string().trim().min(1).max(255),
      displayName: z.string().trim().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createUploadPostProfile({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        platform: input.platform as UploadPostPlatform,
        platformPageId: input.platformPageId,
        displayName: input.displayName ?? null,
      });
    }),

  deleteProfile: uploadPostRateLimitedProcedure
    .input(z.object({ profileId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteUploadPostProfile({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        profileId: input.profileId,
      });
    }),

  generateJwt: uploadPostRateLimitedProcedure.mutation(async ({ ctx }) => {
    return generateUploadPostJwt({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
  }),

  completeConnection: uploadPostRateLimitedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      nonce: z.string().trim().min(8).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      return completeUploadPostConnection({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        connectionId: input.connectionId,
        nonce: input.nonce,
      });
    }),

  listPlatformPages: uploadPostProcedure
    .input(z.object({
      platform: platformSchema.optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listUploadPostPlatformPages({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        platform: input?.platform,
      });
    }),

  getAnalytics: uploadPostProcedure.query(async ({ ctx }) => {
    return getUploadPostAnalytics({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
  }),

  getQueueSettings: uploadPostProcedure.query(async ({ ctx }) => {
    const connection = await getUploadPostConnection({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
    });
    if (!connection) return null;
    return connection.queueSettings;
  }),

  updateQueueSettings: uploadPostRateLimitedProcedure
    .input(queueSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return updateUploadPostQueueSettings({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        queueSettings: input as UploadPostQueueSettings,
      });
    }),

  publishNow: uploadPostPublishRateLimitedProcedure
    .input(z.object({
      profileId: z.number().int().positive().optional().nullable(),
      platform: platformSchema.optional(),
      contentText: z.string().trim().max(2000).optional().nullable(),
      contentLink: z.string().trim().url().optional().nullable(),
      mediaRefs: z.array(z.string().trim().url()).max(10).optional().nullable(),
      metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return publishUploadPostNow({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        profileId: input.profileId ?? null,
        platform: input.platform,
        contentText: input.contentText ?? null,
        contentLink: input.contentLink ?? null,
        mediaRefs: input.mediaRefs ?? null,
        metadata: input.metadata ?? null,
      });
    }),

  schedulePost: uploadPostPublishRateLimitedProcedure
    .input(z.object({
      profileId: z.number().int().positive().optional().nullable(),
      platform: platformSchema.optional(),
      contentText: z.string().trim().max(2000).optional().nullable(),
      contentLink: z.string().trim().url().optional().nullable(),
      mediaRefs: z.array(z.string().trim().url()).max(10).optional().nullable(),
      scheduledAt: z.string().datetime(),
      metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return scheduleUploadPostJob({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        profileId: input.profileId ?? null,
        platform: input.platform,
        contentText: input.contentText ?? null,
        contentLink: input.contentLink ?? null,
        mediaRefs: input.mediaRefs ?? null,
        scheduledAt: input.scheduledAt,
        metadata: input.metadata ?? null,
      });
    }),

  editJob: uploadPostRateLimitedProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
      contentText: z.string().trim().max(2000).optional().nullable(),
      contentLink: z.string().trim().url().optional().nullable(),
      mediaRefs: z.array(z.string().trim().url()).max(10).optional().nullable(),
      platform: platformSchema.optional(),
      scheduledAt: z.string().datetime().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return editUploadPostJob({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        jobId: input.jobId,
        contentText: input.contentText ?? null,
        contentLink: input.contentLink ?? null,
        mediaRefs: input.mediaRefs ?? null,
        platform: input.platform,
        scheduledAt: input.scheduledAt ?? null,
      });
    }),

  listJobs: uploadPostProcedure
    .input(z.object({
      connectionId: z.number().int().positive().optional().nullable(),
      status: z.string().trim().optional().nullable(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listUploadPostJobs({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        connectionId: input?.connectionId ?? null,
        status: input?.status ?? null,
        cursor: input?.cursor ?? null,
        limit: input?.limit ?? 20,
      });
    }),

  syncJobs: uploadPostRateLimitedProcedure
    .input(z.object({
      connectionId: z.number().int().positive().optional().nullable(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      return syncUploadPostJobStatuses({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        connectionId: input?.connectionId ?? null,
      });
    }),
});
