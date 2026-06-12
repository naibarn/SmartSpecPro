import crypto from "crypto";
import { COOKIE_NAME, THIRTY_DAYS_MS, TWENTY_FOUR_HOURS_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router, loginProcedure, registerProcedure, verifyEmailProcedure, resetPasswordProcedure } from "./_core/trpc";
import { z } from "zod";
import {
  getGalleryItems,
  getGalleryItemById,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  incrementGalleryViews,
  incrementGalleryLikes,
  incrementGalleryDownloads,
  getGalleryStats,
  getGalleryItemsCount,
  getGalleryAnalytics,
  bulkDeleteGalleryItems,
  bulkUpdateGalleryPublish,
  bulkUpdateGalleryFeatured,
  type GalleryType,
  type AspectRatio
} from "./db";
import { storagePut } from "./storage";
import {
  GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES,
  GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES,
} from "../shared/geminiOmni";
import { nanoid } from "nanoid";
import { creditsRouter } from "./routers/credits";
import { usersRouter } from "./routers/users";
import { packagesRouter } from "./routers/packages";
import { llmProvidersRouter } from "./routers/llmProviders";
import { chatRouter } from "./routers/chat";
import { financeRouter } from "./routers/finance";
import { memoryRouter } from "./routers/memory";
import { mediaRouter } from "./routers/media";
import { mediaProvidersRouter } from "./routers/mediaProviders";
import { mediaProviderAssetsRouter } from "./routers/mediaProviderAssets";
import { mediaProductionRouter } from "./routers/mediaProduction";
import { mediaModelsRouter } from "./routers/mediaModels";
import { voiceAgentsRouter } from "./routers/voiceAgents";
import { skillsRouter } from "./routers/skills";
import { storageSettingsRouter } from "./routers/storageSettings";
import { systemSettingsRouter } from "./routers/systemSettings";
import { scheduledMessagesRouter } from "./routers/scheduledMessages";
import { followsRouter } from "./routers/follows";
import { accountSecurityRouter } from "./routers/accountSecurity";
import { translationRouter } from "./routers/translation";
import { marketplaceRouter } from "./routers/marketplace";
import { marketplaceCaptureRouter } from "./routers/marketplaceCapture";
import { skillRepositoriesRouter } from "./routers/skillRepositories";
import { sttProvidersRouter } from "./routers/sttProviders";
import { multiProviderRouter } from "./routers/multiProvider";
import { queuesRouter } from "./routers/queues";
import { auditRouter } from "./routers/audit";
import { usageRouter } from "./routers/usage";
import { mediaJobsRouter } from "./routers/mediaJobs";
import { videoEditorProjectsRouter } from "./routers/videoEditorProjects";
import { telegramRouter } from "./routers/telegram";
import { workflowRouter } from "./routers/workflow";
import { workflowHealthRouter } from "./routers/workflow-health";
import { approvalsRouter } from "./routers/approvals";
import { libraryRouter } from "./routers/library";
import { libraryOpsRouter } from "./routers/libraryOps";
import { factoryRouter } from "./routers/factory";
import { groupsRouter } from "./routers/groups";
import { googleDriveRouter } from "./routers/googleDrive";
import { oneDriveRouter } from "./routers/oneDrive";
import { metaChannelsRouter } from "./routers/metaChannels";
import { uploadPostRouter } from "./routers/uploadPost";
import { socialPublishingRouter } from "./routers/socialPublishing";
import { socialModerationRouter } from "./routers/socialModeration";
import { socialAutomationRouter } from "./routers/socialAutomation";
import { searchRouter } from "./routers/search";
import { contentComposerRouter } from "./routers/contentComposer";
import { adminOpsRouter } from "./routers/adminOps";
import { automationCopilotRouter } from "./routers/automationCopilot";
import { liveBrowserRouter } from "./routers/liveBrowser";
import { funnelAnalyticsRouter } from "./routers/funnelAnalytics";
import { infrastructureRouter } from "./routers/infrastructure";
import { presentationRouter } from "./routers/presentation";
import { presentationImportRouter } from "./routers/presentationImport";
import { sandboxRouter } from "./routers/sandbox";
import { agencyRouter } from "./routers/agency";
import { personaRouter } from "./routers/persona";
import { artifactRouter } from "./routers/artifact";
import { widgetRouter } from "./routers/widget";
import { webhookTriggersRouter } from "./routers/webhookTriggers";
import { channelRouterRouter } from "./routers/channelRouter";
import { tenantFeatureFlagsRouter } from "./routers/tenantFeatureFlags";
import { agentRegistryRouter } from "./routers/agentRegistry";
import { contentArtifactsRouter } from "./routers/contentArtifacts";
import { contentQualityRouter } from "./routers/contentQuality";
import { apiKeysRouter } from "./routers/apiKeys";
import { helpRouter } from "./routers/help";
import { virtualAdminRouter } from "./routers/virtualAdmin";
import { feedbackRouter } from "./routers/feedback";
import { teamRouter } from "./routers/team";
import { teamRoomRouter } from "./routers/teamRoom";
import { teamRunRouter } from "./routers/teamRun";
import { teamWorkItemRouter } from "./routers/teamWorkItem";
import { workOsRouter } from "./routers/workOs";
import { scopedMemoryRouter } from "./routers/scopedMemory";
import { monitoringRouter } from "./routers/monitoring";
import { mcpServersRouter } from "./routers/mcpServers";
import { hybridOrchestrationRouter } from "./routers/hybridOrchestration";
import { inviteCodeRouter } from "./routers/inviteCode";
import { userApiKeysRouter } from "./routers/userApiKeys";
import { notificationPreferencesRouter } from "./routers/notificationPreferences";
import { alertRulesRouter } from "./routers/alertRules";
import { notificationWebhooksRouter } from "./routers/notificationWebhooks";
import { socialInboxRouter } from "./routers/socialInbox";
import { billingRouter } from "./routers/billing";
import { adminBillingRouter } from "./routers/adminBilling";
import { localAiRouter } from "./routers/localAi";
import { workpackRouter } from "./routers/workpack";
import { roleMonitorRouter } from "./routers/roleMonitor";
import {
  clearPendingTwoFactorCookie,
  readPendingTwoFactorCookie,
  setPendingTwoFactorCookie,
} from "./services/pendingTwoFactor";
import { buildOAuthProviderAvailability } from "./services/oauthProviderAvailability";

// Zod schemas for validation
const strongPasswordSchema = z.string().min(8).refine(
  (pw) => /[A-Z]/.test(pw) && /[0-9]/.test(pw),
  { message: "Password must contain at least one uppercase letter and one digit" }
);
const galleryTypeSchema = z.enum(["image", "video", "website"]);
const aspectRatioSchema = z.enum(["1:1", "9:16", "16:9"]);

const createGalleryItemSchema = z.object({
  type: galleryTypeSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  aspectRatio: aspectRatioSchema,
  fileUrl: z.string().optional(), // Accepts both full URLs and relative paths (e.g., /uploads/...)
  fileKey: z.string().optional(),
  thumbnailUrl: z.string().optional(), // Accepts both full URLs and relative paths
  thumbnailKey: z.string().optional(),
  duration: z.string().optional(),
  demoUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  model: z.string().max(128).optional(),
  isPublished: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  authorName: z.string().optional(),
  authorAvatar: z.string().optional(),
  sortOrder: z.number().default(0),
});

const updateGalleryItemSchema = createGalleryItemSchema.partial();

const galleryFiltersSchema = z.object({
  type: galleryTypeSchema.optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const SMS_RECOVERY_UNAVAILABLE_ERROR =
  "SMS recovery is currently unavailable. Please use email recovery instead.";

async function isSmsRecoveryConfigured(): Promise<boolean> {
  const { getDb } = await import("./db");
  const { systemSettings } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) return false;

  const settings = await db.select().from(systemSettings)
    .where(eq(systemSettings.category, "sms"));

  const map: Record<string, string | null> = {};
  for (const setting of settings) {
    map[setting.key] = setting.value;
  }

  return Boolean(map.provider && map.account_sid && map.auth_token && map.from_number);
}

// AI helpers (streaming chat is served via /api/llm/stream; this router is for uploads)
const aiRouter = router({
  upload: protectedProcedure
    .input(
      z
        .object({
          fileName: z.string().min(1).max(255),
          fileType: z.string().min(1).max(255),
          fileBase64: z.string().min(1),
        })
        .refine(
          (v) => v.fileType.startsWith("image/") || v.fileType.startsWith("video/"),
          { message: "Only image/* or video/* uploads are supported" }
        )
    )
    .mutation(async ({ input, ctx }) => {
      const parts = input.fileBase64.split(",", 2);
      const b64 = parts.length === 2 ? parts[1] : input.fileBase64;
      const buf = Buffer.from(b64, "base64");
      const isVideoUpload = input.fileType.startsWith("video/");
      const max = isVideoUpload ? GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES : GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES;
      if (buf.length > max) {
        const maxMb = Math.round(max / 1024 / 1024);
        throw new Error(`File too large (max ${maxMb}MB)`);
      }

      // Whitelist allowed extensions
      const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "mp4", "webm", "mov", "avi"]);
      const ext = (input.fileName.split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`File extension .${ext} is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`);
      }

      // Validate magic bytes match claimed MIME type
      const magicBytes = buf.slice(0, 12);
      const isValidImage = (
        (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8) || // JPEG
        (magicBytes[0] === 0x89 && magicBytes[1] === 0x50) || // PNG
        (magicBytes[0] === 0x47 && magicBytes[1] === 0x49) || // GIF
        (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46) || // WEBP (RIFF)
        (magicBytes[0] === 0x3C) // SVG (<)
      );
      const isValidVideo = (
        (magicBytes[4] === 0x66 && magicBytes[5] === 0x74 && magicBytes[6] === 0x79 && magicBytes[7] === 0x70) || // MP4/MOV (ftyp)
        (magicBytes[0] === 0x1A && magicBytes[1] === 0x45 && magicBytes[2] === 0xDF && magicBytes[3] === 0xA3) || // WEBM (EBML)
        (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46) // AVI (RIFF)
      );

      if (input.fileType.startsWith("image/") && !isValidImage) {
        throw new Error("File content does not match claimed image type");
      }
      if (input.fileType.startsWith("video/") && !isValidVideo) {
        throw new Error("File content does not match claimed video type");
      }

      const id = nanoid(10);
      const key = `chat/uploads/${ctx.user?.id || "anon"}/${id}-${Date.now()}${ext ? "." + ext : ""}`;

      const { url } = await storagePut(key, buf, input.fileType);
      return { key, url, fileType: input.fileType };
    }),
});

// Gallery routes
const galleryRouter = router({
  // Public: List gallery items (only published, filtered by tenant)
  list: publicProcedure
    .input(galleryFiltersSchema.omit({ isPublished: true }))
    .query(async ({ input, ctx }) => {
      const numericTenantId = ctx.tenantId ? Number.parseInt(ctx.tenantId, 10) : NaN;
      return getGalleryItems({
        ...input,
        isPublished: true, // Only show published items to public
        tenantId: Number.isFinite(numericTenantId) ? numericTenantId : undefined, // Filter by current tenant
      });
    }),

  // Public: Get single gallery item
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const item = await getGalleryItemById(input.id);
      if (!item || !item.isPublished) {
        return null;
      }
      return item;
    }),

  // Public: Increment view count
  view: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await incrementGalleryViews(input.id);
      return { success: true };
    }),

  // Public: Increment like count
  like: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await incrementGalleryLikes(input.id);
      return { success: true };
    }),

  // Public: Increment download count
  download: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await incrementGalleryDownloads(input.id);
      return { success: true };
    }),

  // Admin: List all gallery items (including unpublished, filtered by tenant)
  adminList: adminProcedure
    .input(galleryFiltersSchema)
    .query(async ({ input, ctx }) => {
      const numericTenantId = ctx.tenantId ? Number.parseInt(ctx.tenantId, 10) : NaN;
      return getGalleryItems({
        ...input,
        tenantId: Number.isFinite(numericTenantId) ? numericTenantId : undefined, // Filter by current tenant
      });
    }),

  // Admin: Get single gallery item (including unpublished)
  adminGet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getGalleryItemById(input.id);
    }),

  // Admin: Create gallery item (with tenant association)
  create: adminProcedure
    .input(createGalleryItemSchema)
    .mutation(async ({ input, ctx }) => {
      const numericTenantId = ctx.tenantId ? Number.parseInt(ctx.tenantId, 10) : NaN;
      const id = await createGalleryItem({
        ...input,
        authorId: ctx.user.id,
        tenantId: Number.isFinite(numericTenantId) ? numericTenantId : undefined, // Associate with current tenant
        tags: input.tags || [],
      });
      return { id };
    }),

  // Admin: Update gallery item
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: updateGalleryItemSchema,
    }))
    .mutation(async ({ input }) => {
      await updateGalleryItem(input.id, input.data);
      return { success: true };
    }),

  // Admin: Delete gallery item
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteGalleryItem(input.id);
      return { success: true };
    }),

  // Admin: Get gallery stats
  stats: adminProcedure.query(async () => {
    return getGalleryStats();
  }),

  // Admin: Upload file to S3
  uploadFile: adminProcedure
    .input(z.object({
      fileName: z.string(),
      fileType: z.string(),
      fileBase64: z.string(),
      folder: z.enum(["images", "videos", "thumbnails", "websites"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const { fileName, fileType, fileBase64, folder } = input;

      // Generate unique file key
      const ext = fileName.split('.').pop() || '';
      const uniqueId = nanoid(10);
      const fileKey = `gallery/${folder}/${uniqueId}-${Date.now()}.${ext}`;

      // Convert base64 to buffer
      const buffer = Buffer.from(fileBase64, 'base64');

      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, fileType);

      return {
        fileKey,
        fileUrl: url,
      };
    }),

  // Admin: Import file from external URL and upload to storage
  importFromUrl: adminProcedure
    .input(z.object({
      url: z.string().url(),
      folder: z.enum(["images", "videos", "thumbnails", "websites"]),
    }))
    .mutation(async ({ input }) => {
      const { url, folder } = input;

      try {
        // Fetch the file from external URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }

        // Get content type and determine extension
        const contentType = response.headers.get('content-type') || 'image/png';
        let ext = 'png';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
        else if (contentType.includes('webp')) ext = 'webp';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('mp4')) ext = 'mp4';
        else if (contentType.includes('webm')) ext = 'webm';
        else if (contentType.includes('mp3')) ext = 'mp3';
        else if (contentType.includes('wav')) ext = 'wav';

        // Read response as buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique file key
        const uniqueId = nanoid(10);
        const fileKey = `gallery/${folder}/${uniqueId}-${Date.now()}.${ext}`;

        // Upload to storage
        const { url: permanentUrl } = await storagePut(fileKey, buffer, contentType);

        return {
          fileKey,
          fileUrl: permanentUrl,
          contentType,
        };
      } catch (error) {
        console.error('Failed to import file from URL:', error);
        throw new Error(`Failed to import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

  // Admin: Bulk update sort order
  updateSortOrder: adminProcedure
    .input(z.array(z.object({
      id: z.number(),
      sortOrder: z.number(),
    })))
    .mutation(async ({ input }) => {
      for (const item of input) {
        await updateGalleryItem(item.id, { sortOrder: item.sortOrder });
      }
      return { success: true };
    }),

  // Admin: Toggle publish status
  togglePublish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const item = await getGalleryItemById(input.id);
      if (!item) {
        throw new Error("Item not found");
      }
      await updateGalleryItem(input.id, { isPublished: !item.isPublished });
      return { success: true, isPublished: !item.isPublished };
    }),

  // Admin: Toggle featured status
  toggleFeatured: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const item = await getGalleryItemById(input.id);
      if (!item) {
        throw new Error("Item not found");
      }
      await updateGalleryItem(input.id, { isFeatured: !item.isFeatured });
      return { success: true, isFeatured: !item.isFeatured };
    }),

  // Admin: Bulk delete items
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await bulkDeleteGalleryItems(input.ids);
      return { success: true, count: input.ids.length };
    }),

  // Admin: Bulk publish items
  bulkPublish: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      await bulkUpdateGalleryPublish(input.ids, input.isPublished);
      return { success: true, count: input.ids.length };
    }),

  // Admin: Bulk feature items
  bulkFeature: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), isFeatured: z.boolean() }))
    .mutation(async ({ input }) => {
      await bulkUpdateGalleryFeatured(input.ids, input.isFeatured);
      return { success: true, count: input.ids.length };
    }),

  // Admin: Get items count (for pagination)
  count: adminProcedure
    .input(galleryFiltersSchema.omit({ limit: true, offset: true }))
    .query(async ({ input }) => {
      return getGalleryItemsCount(input);
    }),

  // Admin: Get analytics
  analytics: adminProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
    .query(async ({ input }) => {
      return getGalleryAnalytics(input?.days || 30);
    }),
});


const authRouter = router({
  me: publicProcedure.query(opts => {
    // If no user is authenticated, return null (expected for public procedure)
    if (!opts.ctx.user) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Auth] auth.me called without authenticated user");
      }
      return null;
    }

    // Return user data with all required fields
    const user = opts.ctx.user;
    if (process.env.NODE_ENV !== "production") {
      console.log("[Auth] auth.me returning user:", {
        id: user.id,
        email: user.email,
      });
    }

    return {
      id: user.id,
      email: user.email || '',
      name: user.name || user.email?.split('@')[0] || 'User',
      avatar: user.email ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}` : undefined,
      plan: user.plan || 'free',
      credits: user.credits || 0,
      role: user.role,
      currentTenantId:
        user.currentTenantId !== null && user.currentTenantId !== undefined
          ? String(user.currentTenantId)
          : null,
    };
  }),
  /** Check which OAuth providers are configured (public — no auth required) */
  oauthProviders: publicProcedure.query(async () => {
    const { getDb } = await import("./db");
    const { systemSettings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const values: Record<string, string | null | undefined> = {};

    try {
      const db = await getDb();
      if (db) {
        const rows = await db.select({ key: systemSettings.key, value: systemSettings.value })
          .from(systemSettings)
          .where(eq(systemSettings.category, "oauth"));

        for (const row of rows) {
          values[row.key] = row.value;
        }
      }
    } catch {
      // Fall back to environment variables when DB is unavailable.
    }

    return buildOAuthProviderAvailability(values);
  }),
  getRecoveryCapabilities: publicProcedure.query(async () => {
    const smsEnabled = await isSmsRecoveryConfigured();
    return {
      sms: {
        enabled: smsEnabled,
      },
    };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    // Revoke the session token before clearing the cookie
    const cookieValue = ctx.req.cookies?.[COOKIE_NAME];
    if (cookieValue) {
      try {
        const { sdk } = await import("./_core/sdk");
        const { revokeJti } = await import("./_core/revocation");
        const session = await sdk.verifySession(cookieValue);
        if (session?.jti) {
          await revokeJti(session.jti, Date.now() + THIRTY_DAYS_MS);
        }
      } catch {
        // Best-effort revocation — still clear cookie even if revocation fails
      }
    }

    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    clearPendingTwoFactorCookie(ctx.req, ctx.res);
    return {
      success: true,
    } as const;
  }),
  // Generate access token for cross-domain authentication (Docker Status, etc.)
  generateAccessToken: protectedProcedure.mutation(async ({ ctx }) => {
    const user = ctx.user;
    const { sdk } = await import("./_core/sdk");

    // Create JWT token with 24h expiry for cross-domain access
    const accessToken = await sdk.createSessionToken(
      user.openId || user.email || String(user.id),
      {
        expiresInMs: TWENTY_FOUR_HOURS_MS,
        name: user.name || user.email || 'User'
      }
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email || '',
        name: user.name || user.email?.split('@')[0] || 'User',
        role: user.role
      }
    };
  }),
  // Verify access token (called by Docker Status and other services)
  verifyAccessToken: publicProcedure
    .input(z.object({
      accessToken: z.string()
    }))
    .mutation(async ({ input }) => {
      const { sdk } = await import("./_core/sdk");

      // Verify the JWT token
      const session = await sdk.verifySession(input.accessToken);

      if (!session) {
        throw new Error('Invalid access token');
      }

      // Get user from database
      const { getUserByOpenId, getUserByEmail } = await import("./db");
      let user = await getUserByOpenId(session.openId);

      // If not found by openId, try by email (for email/password login)
      if (!user && session.openId.includes("@")) {
        user = await getUserByEmail(session.openId);
      }

      if (!user) {
        throw new Error('User not found');
      }

      return {
        openId: user.openId || user.email || String(user.id),
        email: user.email || '',
        name: user.name || user.email?.split('@')[0] || 'User',
        role: user.role,
        loginMethod: user.loginMethod
      };
    }),
  login: loginProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail, updateUserRole } = await import("./db");
      const { sdk } = await import("./_core/sdk");
      const { ENV } = await import("./_core/env");
      const bcrypt = await import("bcrypt");

      const user = await getUserByEmail(input.email);

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Block login for widget system accounts (defense-in-depth)
      if (/^widget-system@.+\.internal$/.test(input.email)) {
        throw new Error('Invalid email or password');
      }

      // If user registered with password, verify it
      if (user.password) {
        const valid = await bcrypt.compare(input.password, user.password);
        if (!valid) {
          throw new Error('Invalid email or password');
        }
      }

      // Check if email is verified
      if (user.isDisabled && user.loginMethod === 'email') {
        throw new Error('Please verify your email before logging in');
      }

      // Check if this email should be granted admin role
      const isAdminEmail = input.email.toLowerCase() === ENV.adminEmail.toLowerCase();
      if (isAdminEmail && user.role !== 'admin') {
        await updateUserRole(user.id, 'admin');
      }

      // If 2FA is enabled, don't create session yet — return challenge
      if (user.twoFactorEnabled) {
        await setPendingTwoFactorCookie(ctx.req, ctx.res, {
          email: user.email || input.email,
          openId: user.openId,
          name: user.name || user.email || "",
          provider: "password",
        });

        return {
          success: false,
          requires2FA: true,
          email: user.email,
          hasBackupEmail: !!user.backupEmailVerified && !!user.backupEmail,
          hasPhone: !!user.phoneVerified && !!user.phone,
        };
      }

      // Create session token
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || '',
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      clearPendingTwoFactorCookie(ctx.req, ctx.res);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          currentTenantId:
            user.currentTenantId !== null && user.currentTenantId !== undefined
              ? String(user.currentTenantId)
              : null,
        },
      };
    }),

  register: registerProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      password: strongPasswordSchema,
      company: z.string().max(255).optional(),
      plan: z.enum(['free', 'pro']).default('free'),
      inviteCode: z.string().min(1).max(32).regex(/^[A-Za-z0-9-]+$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const bcrypt = await import("bcrypt");
      const { users, emailVerificationTokens, systemSettings, tenants } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { checkRegistrationAllowed, checkDeviceFraudLimit, processInviteCodeUsage, giveInviteCodeBonuses, getAuthMethodsConfig } = await import("./services/inviteCodeService");

      // Check if email auth method is allowed
      const authMethods = await getAuthMethodsConfig();
      if (!authMethods.email) {
        throw new Error('Email registration is currently disabled');
      }

      // Check registration mode (open vs invite-only)
      const regCheck = await checkRegistrationAllowed(input.inviteCode, ctx.tenantId);
      if (!regCheck.allowed) {
        throw new Error(regCheck.error || 'Registration not allowed');
      }

      // Check device fraud limit
      const fingerprintHash = ctx.req.cookies?.["__fp"] || undefined;
      const ipAddress = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || ctx.req.ip || "unknown";
      const fraudCheck = await checkDeviceFraudLimit(fingerprintHash, ipAddress);
      if (!fraudCheck.allowed) {
        throw new Error(fraudCheck.reason || 'Registration blocked');
      }

      // Check if email already registered with a password
      const existing = await getUserByEmail(input.email);
      if (existing?.password) {
        throw new Error('An account with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(input.password, 12);
      const openId = `local_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

      // Create user (disabled until email verified)
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Read configurable signup bonus from system settings
      let signupBonus = 100;
      try {
        const [bonusSetting] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "registration"), eq(systemSettings.key, "signup_bonus_credits")))
          .limit(1);
        if (bonusSetting?.value) signupBonus = parseInt(bonusSetting.value, 10) || 100;
      } catch { /* use default */ }

      // Get hostname for registeredDomain
      const hostname = ctx.req.hostname || ctx.req.get("host")?.split(":")[0] || "localhost";

      // Auto-assign tenant by domain
      let tenantId: number | null = null;
      try {
        const [autoSetting] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "registration"), eq(systemSettings.key, "auto_assign_tenant")))
          .limit(1);
        const autoAssign = autoSetting?.value !== "false";
        if (autoAssign) {
          const [tenant] = await db.select().from(tenants)
            .where(eq(tenants.primaryDomain, hostname))
            .limit(1);
          if (tenant) tenantId = parseInt(tenant.id, 10) || null;
        }
      } catch { /* skip tenant assignment */ }

      if (existing) {
        // User exists from OAuth but no password — add password
        await db.update(users).set({
          password: passwordHash,
          name: input.name,
          plan: input.plan,
          loginMethod: 'email',
        }).where(eq(users.id, existing.id));
      } else {
        await db.insert(users).values({
          openId,
          email: input.email,
          name: input.name,
          password: passwordHash,
          loginMethod: 'email',
          role: 'user',
          plan: input.plan,
          credits: signupBonus,
          isDisabled: true,
          registeredDomain: hostname,
          ...(tenantId ? { currentTenantId: tenantId } : {}),
          lastSignedIn: new Date(),
        });
      }

      const user = await getUserByEmail(input.email);
      if (!user) throw new Error('Failed to create account');

      // Record device fingerprint for fraud detection (matching OAuth path)
      if (fingerprintHash) {
        try {
          const { recordDeviceFingerprint } = await import("./services/trustScoring");
          await recordDeviceFingerprint(user.id, fingerprintHash);
        } catch (err) {
          console.error("[Register] Failed to record device fingerprint:", err);
        }
      }

      // Process invite code if provided
      if (regCheck.codeId) {
        try {
          const usageResult = await processInviteCodeUsage(regCheck.codeId, user.id);
          if (usageResult.success) {
            await giveInviteCodeBonuses(regCheck.codeId, user.id);
          }
        } catch (err) {
          console.error("[Register] Failed to process invite code:", err);
        }
      }

      // Generate 6-digit verification code
      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await db.insert(emailVerificationTokens).values({
        userId: user.id,
        email: input.email,
        code,
        expiresAt,
      });

      // Send verification email (falls back to console if SMTP not configured)
      const { sendVerificationEmail } = await import("./services/emailService");
      await sendVerificationEmail(input.email, code, input.name);

      return { success: true, email: input.email };
    }),

  verifyEmail: verifyEmailProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { sdk } = await import("./_core/sdk");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Find valid token
      const [token] = await db.select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, input.email),
          eq(emailVerificationTokens.code, input.code),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ))
        .limit(1);

      if (!token) {
        throw new Error('Invalid or expired verification code');
      }

      // Mark token as used
      await db.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));

      // Enable user
      await db.update(users)
        .set({ isDisabled: false })
        .where(eq(users.id, token.userId));

      const user = await getUserByEmail(input.email);
      if (!user) throw new Error('User not found');

      // Create session
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || '',
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          currentTenantId:
            user.currentTenantId !== null && user.currentTenantId !== undefined
              ? String(user.currentTenantId)
              : null,
        },
      };
    }),

  resendVerification: publicProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const user = await getUserByEmail(input.email);
      if (!user) {
        // Don't reveal whether email exists
        return { success: true };
      }

      // Rate limit: check if a code was sent in the last 60 seconds
      const [recent] = await db.select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, input.email),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.createdAt, new Date(Date.now() - 60 * 1000)),
        ))
        .limit(1);

      if (recent) {
        throw new Error('Please wait 60 seconds before requesting a new code');
      }

      // Generate new code
      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(emailVerificationTokens).values({
        userId: user.id,
        email: input.email,
        code,
        expiresAt,
      });

      const { sendVerificationEmail } = await import("./services/emailService");
      await sendVerificationEmail(input.email, code, user.name ?? undefined);

      return { success: true };
    }),

  forgotPassword: resetPasswordProcedure
    .input(z.object({
      email: z.string().optional(),
      phone: z.string().optional(),
      channel: z.enum(["email", "backup_email", "sms"]).default("email"),
    }))
    .mutation(async ({ input }) => {
      if (input.channel === "sms" && !(await isSmsRecoveryConfigured())) {
        throw new Error(SMS_RECOVERY_UNAVAILABLE_ERROR);
      }

      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      let user: any = null;
      let destination = "";
      const channelMap: Record<string, string> = { email: "reset_email", backup_email: "reset_backup", sms: "reset_sms" };
      const tokenChannel = channelMap[input.channel];

      if (input.channel === "sms") {
        if (!input.phone) return { success: true };
        const [found] = await db.select({ id: users.id, name: users.name, password: users.password }).from(users)
          .where(and(eq(users.phone, input.phone), eq(users.phoneVerified, true)))
          .limit(1);
        user = found;
        destination = input.phone;
      } else if (input.channel === "backup_email") {
        if (!input.email) return { success: true };
        const [found] = await db.select({ id: users.id, name: users.name, password: users.password }).from(users)
          .where(and(eq(users.backupEmail, input.email), eq(users.backupEmailVerified, true)))
          .limit(1);
        user = found;
        destination = input.email;
      } else {
        if (!input.email) return { success: true };
        user = await getUserByEmail(input.email);
        destination = input.email;
      }

      if (!user || !user.password) return { success: true };

      // Rate limit
      const [recent] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, destination),
          eq(emailVerificationTokens.channel, tokenChannel),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.createdAt, new Date(Date.now() - 60_000)),
        )).limit(1);

      if (recent) throw new Error('Please wait 60 seconds before requesting a new code');

      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(emailVerificationTokens).values({
        userId: user.id,
        email: destination,
        code,
        channel: tokenChannel,
        expiresAt,
      });

      if (input.channel === "sms") {
        const { sendPasswordResetSms } = await import("./services/smsService");
        await sendPasswordResetSms(destination, code);
      } else {
        const { sendPasswordResetEmail } = await import("./services/emailService");
        await sendPasswordResetEmail(destination, code, user.name ?? undefined);
      }

      return { success: true };
    }),

  verifyResetCode: publicProcedure
    .input(z.object({
      email: z.string().optional(),
      phone: z.string().optional(),
      code: z.string().length(6),
      channel: z.enum(["email", "backup_email", "sms"]).default("email"),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const channelMap: Record<string, string> = { email: "reset_email", backup_email: "reset_backup", sms: "reset_sms" };
      const destination = input.channel === "sms" ? (input.phone || "") : (input.email || "");

      const [token] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, destination),
          eq(emailVerificationTokens.channel, channelMap[input.channel]),
          eq(emailVerificationTokens.code, input.code),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        )).limit(1);

      if (!token) throw new Error('Invalid or expired reset code');

      return { success: true };
    }),

  // ── Recovery contacts (backup email + phone) ──

  getRecoveryInfo: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [user] = await db.select({
      backupEmail: users.backupEmail,
      backupEmailVerified: users.backupEmailVerified,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
    }).from(users).where(eq(users.id, ctx.user.id)).limit(1);

    if (!user) throw new Error("User not found");

    // Mask for display
    const maskEmail = (e: string | null) => {
      if (!e) return null;
      const [local, domain] = e.split("@");
      return `${local.slice(0, 2)}***@${domain}`;
    };
    const maskPhone = (p: string | null) => {
      if (!p) return null;
      return `${p.slice(0, 4)}****${p.slice(-2)}`;
    };

    return {
      backupEmail: maskEmail(user.backupEmail),
      backupEmailVerified: user.backupEmailVerified,
      phone: maskPhone(user.phone),
      phoneVerified: user.phoneVerified,
    };
  }),

  sendBackupEmailCode: protectedProcedure
    .input(z.object({ backupEmail: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Ensure backup != primary
      const [user] = await db.select({ email: users.email }).from(users)
        .where(eq(users.id, ctx.user.id)).limit(1);
      if (user?.email === input.backupEmail) {
        throw new Error("Backup email cannot be the same as primary email");
      }

      // Rate limit
      const [recent] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.userId, ctx.user.id),
          eq(emailVerificationTokens.channel, "backup_email"),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.createdAt, new Date(Date.now() - 60_000)),
        )).limit(1);
      if (recent) throw new Error("Please wait 60 seconds before requesting a new code");

      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(emailVerificationTokens).values({
        userId: ctx.user.id,
        email: input.backupEmail,
        code,
        channel: "backup_email",
        expiresAt,
      });

      const { sendVerificationEmail } = await import("./services/emailService");
      await sendVerificationEmail(input.backupEmail, code);

      return { success: true };
    }),

  verifyBackupEmail: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [token] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.userId, ctx.user.id),
          eq(emailVerificationTokens.channel, "backup_email"),
          eq(emailVerificationTokens.code, input.code),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        )).limit(1);

      if (!token) throw new Error("Invalid or expired verification code");

      await db.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));

      await db.update(users)
        .set({ backupEmail: token.email, backupEmailVerified: true })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  removeBackupEmail: protectedProcedure.mutation(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(users)
      .set({ backupEmail: null, backupEmailVerified: false })
      .where(eq(users.id, ctx.user.id));

    return { success: true };
  }),

  sendPhoneCode: protectedProcedure
    .input(z.object({ phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone number (E.164 format required)") }))
    .mutation(async ({ input, ctx }) => {
      if (!(await isSmsRecoveryConfigured())) {
        throw new Error(SMS_RECOVERY_UNAVAILABLE_ERROR);
      }

      const { getDb } = await import("./db");
      const { emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Rate limit
      const [recent] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.userId, ctx.user.id),
          eq(emailVerificationTokens.channel, "sms"),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.createdAt, new Date(Date.now() - 60_000)),
        )).limit(1);
      if (recent) throw new Error("Please wait 60 seconds before requesting a new code");

      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const [token] = await db.insert(emailVerificationTokens).values({
        userId: ctx.user.id,
        email: input.phone, // store phone in email field for SMS channel
        code,
        channel: "sms",
        expiresAt,
      }).returning({ id: emailVerificationTokens.id });

      const { sendVerificationSms } = await import("./services/smsService");
      const sent = await sendVerificationSms(input.phone, code);
      if (!sent) {
        await db.delete(emailVerificationTokens)
          .where(eq(emailVerificationTokens.id, token.id));
        throw new Error(SMS_RECOVERY_UNAVAILABLE_ERROR);
      }

      return { success: true };
    }),

  verifyPhone: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [token] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.userId, ctx.user.id),
          eq(emailVerificationTokens.channel, "sms"),
          eq(emailVerificationTokens.code, input.code),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        )).limit(1);

      if (!token) throw new Error("Invalid or expired verification code");

      await db.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));

      await db.update(users)
        .set({ phone: token.email, phoneVerified: true })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  removePhone: protectedProcedure.mutation(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(users)
      .set({ phone: null, phoneVerified: false })
      .where(eq(users.id, ctx.user.id));

    return { success: true };
  }),

  // ── Two-Factor Authentication ──────────────────────────────────

  /** Start 2FA setup: generate secret + QR URI + recovery codes */
  setup2FA: protectedProcedure.mutation(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { users, systemSettings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const { generateTotpSecret, generateTotpUri, generateRecoveryCodes, encryptSecret } = await import("./services/totpService");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Read admin 2FA config
    const twoFaSettings = await db.select().from(systemSettings).where(eq(systemSettings.category, "2fa"));
    const cfg: Record<string, string> = {};
    for (const s of twoFaSettings) { if (s.value) cfg[s.key] = s.value; }
    if (cfg.enabled === "false") throw new Error("2FA is disabled by administrator");
    const issuer = cfg.issuer || "SmartAIHub";
    const codesCount = parseInt(cfg.backup_codes_count || "10", 10);

    const [user] = await db.select({ id: users.id, email: users.email, twoFactorEnabled: users.twoFactorEnabled }).from(users).where(eq(users.id, ctx.user.id));
    if (!user) throw new Error("User not found");
    if (user.twoFactorEnabled) throw new Error("2FA is already enabled");

    const secret = generateTotpSecret();
    const uri = generateTotpUri(secret, user.email || "", issuer);
    const codes = generateRecoveryCodes(codesCount);

    // Store encrypted secret + hashed recovery codes temporarily (not yet enabled)
    const bcrypt = await import("bcrypt");
    const hashedCodes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

    await db.update(users)
      .set({ twoFactorSecret: encryptSecret(secret), recoveryCodes: hashedCodes })
      .where(eq(users.id, ctx.user.id));

    return { secret, uri, recoveryCodes: codes };
  }),

  /** Confirm 2FA setup by verifying a TOTP code from the authenticator app */
  confirm2FA: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { decryptSecret, verifyTotp } = await import("./services/totpService");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [user] = await db.select({ id: users.id, twoFactorEnabled: users.twoFactorEnabled, twoFactorSecret: users.twoFactorSecret }).from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.twoFactorSecret) throw new Error("2FA setup not started");
      if (user.twoFactorEnabled) throw new Error("2FA is already enabled");

      const secret = decryptSecret(user.twoFactorSecret);
      if (!verifyTotp(secret, input.code)) throw new Error("Invalid code. Please try again.");

      await db.update(users)
        .set({ twoFactorEnabled: true })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  /** Disable 2FA (requires current TOTP code or recovery code) */
  disable2FA: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { decryptSecret, verifyTotp } = await import("./services/totpService");
      const bcrypt = await import("bcrypt");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [user] = await db.select({ id: users.id, twoFactorEnabled: users.twoFactorEnabled, twoFactorSecret: users.twoFactorSecret, recoveryCodes: users.recoveryCodes }).from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.twoFactorEnabled) throw new Error("2FA is not enabled");

      const secret = decryptSecret(user.twoFactorSecret!);
      let valid = verifyTotp(secret, input.code);

      // Try recovery code if TOTP didn't match
      if (!valid && input.code.includes("-")) {
        const codes = (user.recoveryCodes as string[]) || [];
        for (let i = 0; i < codes.length; i++) {
          if (await bcrypt.compare(input.code, codes[i])) {
            valid = true;
            codes.splice(i, 1);
            await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, ctx.user.id));
            break;
          }
        }
      }

      if (!valid) throw new Error("Invalid code");

      await db.update(users)
        .set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [] })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  /** Regenerate recovery codes (requires TOTP code) */
  regenerateRecoveryCodes: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { users, systemSettings } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { decryptSecret, verifyTotp, generateRecoveryCodes } = await import("./services/totpService");
      const bcrypt = await import("bcrypt");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Read admin config for codes count
      const twoFaSettings = await db.select().from(systemSettings).where(eq(systemSettings.category, "2fa"));
      const cfg: Record<string, string> = {};
      for (const s of twoFaSettings) { if (s.value) cfg[s.key] = s.value; }
      const codesCount = parseInt(cfg.backup_codes_count || "10", 10);

      const [user] = await db.select({ id: users.id, twoFactorEnabled: users.twoFactorEnabled, twoFactorSecret: users.twoFactorSecret }).from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.twoFactorEnabled) throw new Error("2FA is not enabled");

      const secret = decryptSecret(user.twoFactorSecret!);
      if (!verifyTotp(secret, input.code)) throw new Error("Invalid TOTP code");

      const codes = generateRecoveryCodes(codesCount);
      const hashedCodes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

      await db.update(users).set({ recoveryCodes: hashedCodes }).where(eq(users.id, ctx.user.id));

      return { recoveryCodes: codes };
    }),

  /** Get 2FA status for current user */
  get2FAStatus: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { users, systemSettings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin config
    const twoFaSettings = await db.select().from(systemSettings).where(eq(systemSettings.category, "2fa"));
    const cfg: Record<string, string> = {};
    for (const s of twoFaSettings) { if (s.value) cfg[s.key] = s.value; }
    const adminEnabled = cfg.enabled !== "false";
    const enforced = cfg.enforced === "true";

    const [user] = await db.select({
      twoFactorEnabled: users.twoFactorEnabled,
      recoveryCodesCount: users.recoveryCodes,
    }).from(users).where(eq(users.id, ctx.user.id));

    return {
      enabled: user?.twoFactorEnabled || false,
      recoveryCodesRemaining: Array.isArray(user?.recoveryCodesCount) ? (user.recoveryCodesCount as string[]).length : 0,
      adminEnabled,
      enforced,
    };
  }),

  /** Verify 2FA code during login (public — uses pending session token) */
  verify2FA: loginProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { sdk } = await import("./_core/sdk");
      const { decryptSecret, verifyTotp } = await import("./services/totpService");
      const bcrypt = await import("bcrypt");

      const pending = await readPendingTwoFactorCookie(ctx.req);
      if (!pending || pending.email.toLowerCase() !== input.email.toLowerCase()) {
        throw new Error("Your sign-in session expired. Please sign in again.");
      }

      const user = await getUserByEmail(input.email);
      if (
        !user ||
        user.openId !== pending.openId ||
        !user.twoFactorEnabled ||
        !user.twoFactorSecret
      ) {
        throw new Error("Invalid request");
      }

      const secret = decryptSecret(user.twoFactorSecret);
      let valid = verifyTotp(secret, input.code);
      let usedRecoveryCode = false;

      // Try recovery code
      if (!valid && input.code.includes("-")) {
        const codes = (user.recoveryCodes as string[]) || [];
        for (let i = 0; i < codes.length; i++) {
          if (await bcrypt.compare(input.code, codes[i])) {
            valid = true;
            usedRecoveryCode = true;
            codes.splice(i, 1);
            const db = await getDb();
            if (db) {
              await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, user.id));
            }
            break;
          }
        }
      }

      if (!valid) throw new Error("Invalid verification code");

      // Create session
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
      });

      const { getSessionCookieOptions } = await import("./_core/cookies");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      clearPendingTwoFactorCookie(ctx.req, ctx.res);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
        usedRecoveryCode,
        recoveryCodesRemaining: usedRecoveryCode ? ((user.recoveryCodes as string[]).length - 1) : undefined,
      };
    }),

  /** Request 2FA reset via backup email or SMS (when locked out) */
  request2FAReset: publicProcedure
    .input(z.object({
      email: z.string().email(),
      channel: z.enum(["backup_email", "sms"]),
      backupEmail: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.channel === "sms" && !(await isSmsRecoveryConfigured())) {
        throw new Error(SMS_RECOVERY_UNAVAILABLE_ERROR);
      }

      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { emailVerificationTokens } = await import("../drizzle/schema");
      const crypto = await import("crypto");

      const user = await getUserByEmail(input.email);
      if (!user || !user.twoFactorEnabled) {
        // Don't reveal whether user exists
        return { success: true };
      }

      const db = await getDb();
      if (!db) return { success: true };

      const code = crypto.randomInt(100000, 999999).toString();
      const channelKey = input.channel === "backup_email" ? "disable_2fa_email" : "disable_2fa_sms";

      // Validate the recovery channel
      if (input.channel === "backup_email") {
        if (!user.backupEmailVerified || !user.backupEmail) {
          throw new Error("Backup email is not configured or verified");
        }
        if (input.backupEmail && input.backupEmail.toLowerCase() !== user.backupEmail.toLowerCase()) {
          throw new Error("Backup email does not match");
        }
      } else {
        if (!user.phoneVerified || !user.phone) {
          throw new Error("Phone is not configured or verified");
        }
        if (input.phone && input.phone !== user.phone) {
          throw new Error("Phone number does not match");
        }
      }

      // Store verification code
      await db.insert(emailVerificationTokens).values({
        email: input.channel === "sms" ? user.phone! : user.backupEmail!,
        code,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        channel: channelKey,
        userId: user.id,
      });

      // Send code
      if (input.channel === "backup_email") {
        const { sendPasswordResetEmail } = await import("./services/emailService");
        await sendPasswordResetEmail(user.backupEmail!, code, user.name || undefined);
      } else {
        const { sendVerificationSms } = await import("./services/smsService");
        await sendVerificationSms(user.phone!, code);
      }

      return { success: true };
    }),

  /** Confirm 2FA reset with verification code (disables 2FA) */
  confirm2FAReset: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
      channel: z.enum(["backup_email", "sms"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, gt } = await import("drizzle-orm");
      const { sdk } = await import("./_core/sdk");

      const user = await getUserByEmail(input.email);
      if (!user || !user.twoFactorEnabled) throw new Error("Invalid request");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const channelKey = input.channel === "backup_email" ? "disable_2fa_email" : "disable_2fa_sms";
      const contactField = input.channel === "backup_email" ? user.backupEmail! : user.phone!;

      const [token] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, contactField),
          eq(emailVerificationTokens.code, input.code),
          eq(emailVerificationTokens.channel, channelKey),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ))
        .limit(1);

      if (!token) throw new Error("Invalid or expired code");

      // Delete used token
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, token.id));

      // Disable 2FA
      await db.update(users)
        .set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [] })
        .where(eq(users.id, user.id));

      // Create session
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
      });
      const { getSessionCookieOptions } = await import("./_core/cookies");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          currentTenantId:
            user.currentTenantId !== null && user.currentTenantId !== undefined
              ? String(user.currentTenantId)
              : null,
        },
      };
    }),

  resetPassword: resetPasswordProcedure
    .input(z.object({
      email: z.string().optional(),
      phone: z.string().optional(),
      code: z.string().length(6),
      newPassword: strongPasswordSchema,
      channel: z.enum(["email", "backup_email", "sms"]).default("email"),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const bcrypt = await import("bcrypt");
      const { users, emailVerificationTokens } = await import("../drizzle/schema");
      const { eq, and, isNull, gt } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const channelMap: Record<string, string> = { email: "reset_email", backup_email: "reset_backup", sms: "reset_sms" };
      const destination = input.channel === "sms" ? (input.phone || "") : (input.email || "");

      const [token] = await db.select().from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.email, destination),
          eq(emailVerificationTokens.channel, channelMap[input.channel]),
          eq(emailVerificationTokens.code, input.code),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        )).limit(1);

      if (!token) throw new Error('Invalid or expired reset code');

      // Hash new password and update (set passwordChangedAt to invalidate old sessions)
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users)
        .set({ password: passwordHash, passwordChangedAt: new Date() })
        .where(eq(users.id, token.userId));

      await db.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));

      return { success: true };
    }),

  /** Exchange a Python OAuth token for a Node.js session cookie */
  oauthExchangeSession: publicProcedure
    .input(z.object({
      accessToken: z.string().min(1),
      provider: z.enum(['google', 'github']),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getUserByEmail } = await import("./db");
      const { getDb } = await import("./db");
      const { sdk } = await import("./_core/sdk");
      const { getAppRuntimeConfig } = await import("./services/appRuntimeConfig");
      const { users, systemSettings, tenants } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      // 1. Verify the Python OAuth token by calling Python backend
      const runtime = await getAppRuntimeConfig();
      const PYTHON_BACKEND = runtime.pythonBackendUrl;
      let pythonUser: { id: string; email: string; full_name: string | null; is_admin: boolean; email_verified: boolean };

      try {
        const verifyRes = await fetch(`${PYTHON_BACKEND}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${input.accessToken}` },
        });
        if (!verifyRes.ok) {
          throw new Error('Token verification failed');
        }
        pythonUser = await verifyRes.json();
      } catch {
        throw new Error('Invalid or expired OAuth token');
      }

      if (!pythonUser.email) {
        throw new Error('OAuth profile does not include an email address');
      }

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 2. Check if user already exists in Node.js DB
      const existing = await getUserByEmail(pythonUser.email);

      if (existing) {
        // Existing user — block if disabled and email-registered (need email verification)
        if (existing.isDisabled && existing.loginMethod === 'email') {
          throw new Error('Please verify your email before logging in');
        }

        if (existing.twoFactorEnabled) {
          await setPendingTwoFactorCookie(ctx.req, ctx.res, {
            email: existing.email || pythonUser.email,
            openId: existing.openId,
            name: existing.name || existing.email || "",
            provider: input.provider,
          });

          return {
            success: false,
            requires2FA: true,
            email: existing.email,
            hasBackupEmail: !!existing.backupEmailVerified && !!existing.backupEmail,
            hasPhone: !!existing.phoneVerified && !!existing.phone,
          };
        }

        // Create session for existing user
        const token = await sdk.createSessionToken(existing.openId, {
          name: existing.name || existing.email || '',
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        clearPendingTwoFactorCookie(ctx.req, ctx.res);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

        return {
          success: true,
          user: {
            id: existing.id,
            email: existing.email,
            name: existing.name,
            currentTenantId:
              existing.currentTenantId !== null &&
              existing.currentTenantId !== undefined
                ? String(existing.currentTenantId)
                : null,
          },
        };
      }

      // 3. New user — insert into Node.js users table
      const openId = `oauth_${input.provider}_${pythonUser.id}`;

      // Read signup bonus from system settings (same as register)
      let signupBonus = 100;
      try {
        const [bonusSetting] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "registration"), eq(systemSettings.key, "signup_bonus_credits")))
          .limit(1);
        if (bonusSetting?.value) signupBonus = parseInt(bonusSetting.value, 10) || 100;
      } catch { /* use default */ }

      // Auto-assign tenant by domain (same as register)
      const hostname = ctx.req.hostname || ctx.req.get("host")?.split(":")[0] || "localhost";
      let tenantId: number | null = null;
      try {
        const [autoSetting] = await db.select().from(systemSettings)
          .where(and(eq(systemSettings.category, "registration"), eq(systemSettings.key, "auto_assign_tenant")))
          .limit(1);
        const autoAssign = autoSetting?.value !== "false";
        if (autoAssign) {
          const [tenant] = await db.select().from(tenants)
            .where(eq(tenants.primaryDomain, hostname))
            .limit(1);
          if (tenant) tenantId = parseInt(tenant.id, 10) || null;
        }
      } catch { /* skip tenant assignment */ }

      await db.insert(users).values({
        openId,
        email: pythonUser.email,
        name: pythonUser.full_name || pythonUser.email.split('@')[0],
        loginMethod: input.provider,
        role: 'user',
        plan: 'free',
        credits: signupBonus,
        isDisabled: false,
        registeredDomain: hostname,
        ...(tenantId ? { currentTenantId: tenantId } : {}),
        lastSignedIn: new Date(),
      });

      // 4. Create session
      const token = await sdk.createSessionToken(openId, {
        name: pythonUser.full_name || pythonUser.email.split('@')[0],
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      clearPendingTwoFactorCookie(ctx.req, ctx.res);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

      return {
        success: true,
        user: {
          id: 0,
          email: pythonUser.email,
          name: pythonUser.full_name,
          currentTenantId:
            tenantId !== null && tenantId !== undefined
              ? String(tenantId)
              : null,
        },
      };
    }),
});

// Credit management

type AppRouterShape = {
  system: typeof systemRouter;
  billing: typeof billingRouter;
  adminBilling: typeof adminBillingRouter;
  localAi: typeof localAiRouter;
  workpack: typeof workpackRouter;
  roleMonitor: typeof roleMonitorRouter;
  agentRegistry: typeof agentRegistryRouter;
  auth: typeof authRouter;
  credits: typeof creditsRouter;
  users: typeof usersRouter;
  packages: typeof packagesRouter;
  llmProviders: typeof llmProvidersRouter;
  multiProvider: typeof multiProviderRouter;
  mediaProviders: typeof mediaProvidersRouter;
  mediaProviderAssets: typeof mediaProviderAssetsRouter;
  mediaProduction: typeof mediaProductionRouter;
  mediaModels: typeof mediaModelsRouter;
  voiceAgents: typeof voiceAgentsRouter;
  chat: typeof chatRouter;
  finance: typeof financeRouter;
  artifact: typeof artifactRouter;
  widget: typeof widgetRouter;
  webhookTriggers: typeof webhookTriggersRouter;
  channelRouter: typeof channelRouterRouter;
  memory: typeof memoryRouter;
  media: typeof mediaRouter;
  library: typeof libraryRouter;
  presentation: typeof presentationRouter;
  presentationImport: typeof presentationImportRouter;
  libraryOps: typeof libraryOpsRouter;
  groups: typeof groupsRouter;
  factory: typeof factoryRouter;
  googleDrive: typeof googleDriveRouter;
  oneDrive: typeof oneDriveRouter;
  skills: typeof skillsRouter;
  storageSettings: typeof storageSettingsRouter;
  systemSettings: typeof systemSettingsRouter;
  inviteCode: typeof inviteCodeRouter;
  scheduledMessages: typeof scheduledMessagesRouter;
  notificationPreferences: typeof notificationPreferencesRouter;
  alertRules: typeof alertRulesRouter;
  notificationWebhooks: typeof notificationWebhooksRouter;
  follows: typeof followsRouter;
  accountSecurity: typeof accountSecurityRouter;
  translation: typeof translationRouter;
  marketplace: typeof marketplaceRouter;
  marketplaceCapture: typeof marketplaceCaptureRouter;
  skillRepositories: typeof skillRepositoriesRouter;
  sttProviders: typeof sttProvidersRouter;
  queues: typeof queuesRouter;
  infrastructure: typeof infrastructureRouter;
  audit: typeof auditRouter;
  usage: typeof usageRouter;
  mediaJobs: typeof mediaJobsRouter;
  videoEditorProjects: typeof videoEditorProjectsRouter;
  telegram: typeof telegramRouter;
  workflow: typeof workflowRouter;
  workflowHealth: typeof workflowHealthRouter;
  approvals: typeof approvalsRouter;
  sandbox: typeof sandboxRouter;
  agency: typeof agencyRouter;
  ai: typeof aiRouter;
  gallery: typeof galleryRouter;
  search: typeof searchRouter;
  adminOps: typeof adminOpsRouter;
  funnelAnalytics: typeof funnelAnalyticsRouter;
  persona: typeof personaRouter;
  tenantFeatureFlags: typeof tenantFeatureFlagsRouter;
  automationCopilot: typeof automationCopilotRouter;
  liveBrowser: typeof liveBrowserRouter;
  metaChannels: typeof metaChannelsRouter;
  uploadPost: typeof uploadPostRouter;
  socialPublishing: typeof socialPublishingRouter;
  contentComposer: typeof contentComposerRouter;
  socialModeration: typeof socialModerationRouter;
  socialInbox: typeof socialInboxRouter;
  socialAutomation: typeof socialAutomationRouter;
  contentArtifacts: typeof contentArtifactsRouter;
  contentQuality: typeof contentQualityRouter;
  apiKeys: typeof apiKeysRouter;
  userApiKeys: typeof userApiKeysRouter;
  virtualAdmin: typeof virtualAdminRouter;
  feedback: typeof feedbackRouter;
  team: typeof teamRouter;
  teamRoom: typeof teamRoomRouter;
  teamRun: typeof teamRunRouter;
  teamWorkItem: typeof teamWorkItemRouter;
  workOs: typeof workOsRouter;
  scopedMemory: typeof scopedMemoryRouter;
  monitoring: typeof monitoringRouter;
  mcpServers: typeof mcpServersRouter;
  hybridOrchestration: typeof hybridOrchestrationRouter;
  help: typeof helpRouter;
};

const appRouterInternal = router<AppRouterShape>({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  billing: billingRouter,
  adminBilling: adminBillingRouter,
  localAi: localAiRouter,
  workpack: workpackRouter,
  roleMonitor: roleMonitorRouter,
  agentRegistry: agentRegistryRouter,

  auth: authRouter,
  credits: creditsRouter,

  // User management (admin)
  users: usersRouter,

  // Package management (admin)
  packages: packagesRouter,

  // LLM Provider management (admin)
  llmProviders: llmProvidersRouter,
  multiProvider: multiProviderRouter,

  // Media Provider management (admin) - Kie AI, fal.ai, etc.
  mediaProviders: mediaProvidersRouter,
  mediaProviderAssets: mediaProviderAssetsRouter,
  mediaProduction: mediaProductionRouter,

  // Media Models management (admin) - AI models for image/video/audio generation
  mediaModels: mediaModelsRouter,

  // Voice Agent runtime (ElevenLabs ElevenAgents)
  voiceAgents: voiceAgentsRouter,

  // Chat system (conversations, messages, memory)
  chat: chatRouter,
  finance: financeRouter,

  // Canvas / AI Artifacts (versioned, interactive artifacts)
  artifact: artifactRouter,

  // Embeddable chat widget management
  widget: widgetRouter,

  // Inbound webhook trigger management
  webhookTriggers: webhookTriggersRouter,

  // Channel routing rules (F10)
  channelRouter: channelRouterRouter,

  // Memory system (entity memories, summaries, context)
  memory: memoryRouter,

  // Media generation (image, video, audio via Python backend)
  media: mediaRouter,

  // Library domain APIs
  library: libraryRouter,

  // Presentation domain APIs
  presentation: presentationRouter,

  // Presentation import (PPTX + Google Slides)
  presentationImport: presentationImportRouter,

  // Library operations (admin)
  libraryOps: libraryOpsRouter,

  // Groups management (ShareFile feature)
  groups: groupsRouter,

  // Factory workflow/settings API
  factory: factoryRouter,

  // Google Drive integration (OAuth, sync, editing)
  googleDrive: googleDriveRouter,

  // OneDrive integration (OAuth, sync, editing)
  oneDrive: oneDriveRouter,

  // Skills management and prompt enhancement
  skills: skillsRouter,

  // Storage settings management (admin) - R2, S3 configuration
  storageSettings: storageSettingsRouter,

  // System settings management (admin) - Stripe, Invoice configuration
  systemSettings: systemSettingsRouter,

  // Invite code management (admin + user referrals)
  inviteCode: inviteCodeRouter,

  // Scheduled Messages / Chat Alerts
  scheduledMessages: scheduledMessagesRouter,

  // Notification Preferences & Alert Rules
  notificationPreferences: notificationPreferencesRouter,
  alertRules: alertRulesRouter,
  notificationWebhooks: notificationWebhooksRouter,

  // User Follows
  follows: followsRouter,

  // Account Security (admin)
  accountSecurity: accountSecurityRouter,
  translation: translationRouter,
  marketplace: marketplaceRouter,
  marketplaceCapture: marketplaceCaptureRouter,
  skillRepositories: skillRepositoriesRouter,

  // Speech-to-Text provider management (admin)
  sttProviders: sttProvidersRouter,

  // Queue management and monitoring (admin)
  queues: queuesRouter,

  // Infrastructure settings — GCP, Cloud Tasks, task processing mode (admin)
  infrastructure: infrastructureRouter,

  // Audit logging and cost audit (admin)
  audit: auditRouter,

  // Usage analytics (user + admin)
  usage: usageRouter,

  // Media Job processing (FFmpeg pipeline)
  mediaJobs: mediaJobsRouter,

  // Video Editor project persistence
  videoEditorProjects: videoEditorProjectsRouter,

  // Telegram notifications
  telegram: telegramRouter,

  // Workflow engine (LangGraph integration via Python backend)
  workflow: workflowRouter,

  // Workflow health monitoring
  workflowHealth: workflowHealthRouter,

  // Approval Gate operations (proxies to Python backend)
  approvals: approvalsRouter,

  // OpenSandbox integration
  sandbox: sandboxRouter,

  // Agency-Swarm multi-agent system
  agency: agencyRouter,

  ai: aiRouter,

  gallery: galleryRouter,
  search: searchRouter,
  adminOps: adminOpsRouter,
  funnelAnalytics: funnelAnalyticsRouter,
  persona: personaRouter,
  tenantFeatureFlags: tenantFeatureFlagsRouter,
  automationCopilot: automationCopilotRouter,
  liveBrowser: liveBrowserRouter,
  metaChannels: metaChannelsRouter,
  uploadPost: uploadPostRouter,
  socialPublishing: socialPublishingRouter,
  contentComposer: contentComposerRouter,
  socialModeration: socialModerationRouter,
  socialInbox: socialInboxRouter,
  socialAutomation: socialAutomationRouter,
  contentArtifacts: contentArtifactsRouter,
  contentQuality: contentQualityRouter,
  apiKeys: apiKeysRouter,
  userApiKeys: userApiKeysRouter,
  virtualAdmin: virtualAdminRouter,
  feedback: feedbackRouter,

  // Virtual AI Office Orchestrator
  team: teamRouter,
  teamRoom: teamRoomRouter,
  teamRun: teamRunRouter,
  teamWorkItem: teamWorkItemRouter,
  workOs: workOsRouter,
  scopedMemory: scopedMemoryRouter,
  monitoring: monitoringRouter,
  mcpServers: mcpServersRouter,
  hybridOrchestration: hybridOrchestrationRouter,
  help: helpRouter,
});

export type AppRouter = typeof appRouterInternal;
export const appRouter: AppRouter = appRouterInternal;
