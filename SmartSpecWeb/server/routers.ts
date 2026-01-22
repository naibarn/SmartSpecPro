import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
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
import { nanoid } from "nanoid";
import { creditsRouter } from "./routers/credits";
import { usersRouter } from "./routers/users";
import { packagesRouter } from "./routers/packages";
import { llmProvidersRouter } from "./routers/llmProviders";
import { chatRouter } from "./routers/chat";
import { memoryRouter } from "./routers/memory";
import { mediaRouter } from "./routers/media";
import { mediaProvidersRouter } from "./routers/mediaProviders";
import { mediaModelsRouter } from "./routers/mediaModels";

// Zod schemas for validation
const galleryTypeSchema = z.enum(["image", "video", "website"]);
const aspectRatioSchema = z.enum(["1:1", "9:16", "16:9"]);

const createGalleryItemSchema = z.object({
  type: galleryTypeSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  aspectRatio: aspectRatioSchema,
  fileUrl: z.string().url().optional(),
  fileKey: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  thumbnailKey: z.string().optional(),
  duration: z.string().optional(),
  demoUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
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

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => {
      // If no user is authenticated, return null (expected for public procedure)
      if (!opts.ctx.user) {
        console.log("[Auth] auth.me called without authenticated user");
        return null;
      }
      
      // Return user data with all required fields
      const user = opts.ctx.user;
      console.log("[Auth] auth.me returning user:", { id: user.id, email: user.email });
      
      return {
        id: user.id,
        email: user.email || '',
        name: user.name || user.email?.split('@')[0] || 'User',
        avatar: user.email ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}` : undefined,
        plan: user.plan || 'free',
        credits: user.credits || 0,
        role: user.role
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    // Generate access token for cross-domain authentication (Docker Status, etc.)
    generateAccessToken: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      const { sdk } = await import("./_core/sdk");

      // Create JWT token with 1 year expiry (same as session)
      const accessToken = await sdk.createSessionToken(
        user.openId || user.email || String(user.id),
        {
          expiresInMs: ONE_YEAR_MS,
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
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // For demo: Look up user by email and create session
        // In production, add proper password verification
        const { getUserByEmail, upsertUser, updateUserRole } = await import("./db");
        const { sdk } = await import("./_core/sdk");
        const { ENV } = await import("./_core/env");
        
        let user = await getUserByEmail(input.email);
        
        // Check if this email should be granted admin role
        const isAdminEmail = input.email.toLowerCase() === ENV.adminEmail.toLowerCase();
        
        // If user doesn't exist, create a demo account
        if (!user) {
          const openId = `local_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          await upsertUser({
            openId,
            email: input.email,
            name: input.email.split('@')[0],
            loginMethod: 'email',
            lastSignedIn: new Date(),
          });
          user = await getUserByEmail(input.email);
          
          // Grant admin role if this is the admin email
          if (user && isAdminEmail) {
            await updateUserRole(user.id, 'admin');
            user = await getUserByEmail(input.email);
          }
        } else if (isAdminEmail && user.role !== 'admin') {
          // Ensure admin email always has admin role
          await updateUserRole(user.id, 'admin');
          user = await getUserByEmail(input.email);
        }
        
        if (!user) {
          return { success: false, message: 'Failed to create user' };
        }
        
        // Create session token
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name || user.email || '',
        });
        
        // Set cookie with maxAge (critical for cookie persistence across page loads)
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        
        return { success: true, user: { id: user.id, email: user.email, name: user.name } };
      }),
  }),

  // Credit management
  credits: creditsRouter,

  // User management (admin)
  users: usersRouter,

  // Package management (admin)
  packages: packagesRouter,

  // LLM Provider management (admin)
  llmProviders: llmProvidersRouter,

  // Media Provider management (admin) - Kie AI, fal.ai, etc.
  mediaProviders: mediaProvidersRouter,

  // Media Models management (admin) - AI models for image/video/audio generation
  mediaModels: mediaModelsRouter,

  // Chat system (conversations, messages, memory)
  chat: chatRouter,

  // Memory system (entity memories, summaries, context)
  memory: memoryRouter,

  // Media generation (image, video, audio via Python backend)
  media: mediaRouter,

  // AI helpers (streaming chat is served via /api/llm/stream; this router is for uploads)
  ai: router({
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
        const max = 15 * 1024 * 1024;
        if (buf.length > max) throw new Error("File too large (max 15MB)");

        const ext = (input.fileName.split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "");
        const id = nanoid(10);
        const key = `chat/uploads/${ctx.user?.id || "anon"}/${id}-${Date.now()}${ext ? "." + ext : ""}`;

        const { url } = await storagePut(key, buf, input.fileType);
        return { key, url, fileType: input.fileType };
      }),
  }),

  // Gallery routes
  gallery: router({
    // Public: List gallery items (only published)
    list: publicProcedure
      .input(galleryFiltersSchema.omit({ isPublished: true }))
      .query(async ({ input }) => {
        return getGalleryItems({
          ...input,
          isPublished: true, // Only show published items to public
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

    // Admin: List all gallery items (including unpublished)
    adminList: adminProcedure
      .input(galleryFiltersSchema)
      .query(async ({ input }) => {
        return getGalleryItems(input);
      }),

    // Admin: Get single gallery item (including unpublished)
    adminGet: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getGalleryItemById(input.id);
      }),

    // Admin: Create gallery item
    create: adminProcedure
      .input(createGalleryItemSchema)
      .mutation(async ({ input, ctx }) => {
        const id = await createGalleryItem({
          ...input,
          authorId: ctx.user.id,
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
  }),
});

export type AppRouter = typeof appRouter;
