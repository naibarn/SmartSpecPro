import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { storageSettings } from "../../drizzle/schema";
import { eq, asc, sql } from "drizzle-orm";
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { encrypt, decrypt } from "../services/crypto";
import { invalidateStorageCache } from "../storage";

// Get S3 client for a storage settings configuration
function getS3Client(settings: {
  endpoint?: string | null;
  region?: string | null;
  accessKeyIdEncrypted?: string | null;
  secretAccessKeyEncrypted?: string | null;
  configJson?: { forcePathStyle?: boolean } | null;
}): S3Client | null {
  if (!settings.endpoint || !settings.accessKeyIdEncrypted || !settings.secretAccessKeyEncrypted) {
    return null;
  }

  const accessKeyId = decrypt(settings.accessKeyIdEncrypted);
  const secretAccessKey = decrypt(settings.secretAccessKeyEncrypted);

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region || "auto",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: settings.configJson?.forcePathStyle ?? false,
  });
}

export const storageSettingsRouter = router({
  // Admin: List all storage settings
  list: adminProcedure.query(async () => {
    try {
      const settings = await db
        .select()
        .from(storageSettings)
        .orderBy(asc(storageSettings.name));

      // Don't expose encrypted credentials
      return settings.map((s: (typeof settings)[number]) => ({
        ...s,
        accessKeyIdEncrypted: undefined,
        secretAccessKeyEncrypted: undefined,
      }));
    } catch (error: any) {
      // Table might not exist yet - return empty array
      console.warn("[StorageSettings] List query failed (table may not exist):", error.message);
      return [];
    }
  }),

  // Admin: Get single storage settings
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [setting] = await db
        .select()
        .from(storageSettings)
        .where(eq(storageSettings.id, input.id));

      if (!setting) return null;

      return {
        ...setting,
        accessKeyIdEncrypted: undefined,
        secretAccessKeyEncrypted: undefined,
      };
    }),

  // Admin: Get active storage settings (for use by other services)
  getActive: adminProcedure.query(async () => {
    try {
      const [setting] = await db
        .select()
        .from(storageSettings)
        .where(eq(storageSettings.isActive, true))
        .limit(1);

      if (!setting) return null;

      return {
        ...setting,
        accessKeyIdEncrypted: undefined,
        secretAccessKeyEncrypted: undefined,
      };
    } catch (error: any) {
      console.warn("[StorageSettings] getActive failed:", error.message);
      return null;
    }
  }),

  // Admin: Get stats
  stats: adminProcedure.query(async () => {
    try {
      const all = await db.select().from(storageSettings);

      return {
        total: all.length,
        active: all.filter((s: (typeof all)[number]) => s.isActive).length,
        withCredentials: all.filter((s: (typeof all)[number]) => s.hasCredentials).length,
        byType: {
          r2: all.filter((s: (typeof all)[number]) => s.providerType === "r2").length,
          s3: all.filter((s: (typeof all)[number]) => s.providerType === "s3").length,
          local: all.filter((s: (typeof all)[number]) => s.providerType === "local").length,
        },
      };
    } catch (error: any) {
      return {
        total: 0,
        active: 0,
        withCredentials: 0,
        byType: { r2: 0, s3: 0, local: 0 },
      };
    }
  }),

  // Admin: Create storage settings
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      displayName: z.string().min(1).max(128),
      description: z.string().optional(),
      providerType: z.enum(["r2", "s3", "local"]).default("r2"),
      endpoint: z.string().optional(),
      region: z.string().default("auto"),
      bucket: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
      publicUrlPrefix: z.string().optional(),
      devTunnelUrl: z.string().optional(),
      pathPrefix: z.string().default("uploads/"),
      isActive: z.boolean().default(false),
      configJson: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { accessKeyId, secretAccessKey, ...data } = input;

      // If setting this as active, deactivate others first
      if (data.isActive) {
        await db
          .update(storageSettings)
          .set({ isActive: false, updatedAt: new Date() });
      }

      const [setting] = await db
        .insert(storageSettings)
        .values({
          ...data,
          accessKeyIdEncrypted: accessKeyId ? encrypt(accessKeyId) : null,
          secretAccessKeyEncrypted: secretAccessKey ? encrypt(secretAccessKey) : null,
          hasCredentials: !!(accessKeyId && secretAccessKey),
        })
        .returning();

      invalidateStorageCache();
      return { id: setting.id };
    }),

  // Admin: Update storage settings
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      displayName: z.string().min(1).max(128).optional(),
      description: z.string().nullish(),
      providerType: z.enum(["r2", "s3", "local"]).optional(),
      endpoint: z.string().nullish(),
      region: z.string().nullish(),
      bucket: z.string().nullish(),
      accessKeyId: z.string().optional(), // Only update if provided
      secretAccessKey: z.string().optional(), // Only update if provided
      publicUrlPrefix: z.string().nullish(),
      devTunnelUrl: z.string().nullish(),
      pathPrefix: z.string().optional(),
      isActive: z.boolean().optional(),
      configJson: z.record(z.any()).nullish(),
    }))
    .mutation(async ({ input }) => {
      const { id, accessKeyId, secretAccessKey, ...data } = input;

      // If setting this as active, deactivate others first
      if (data.isActive) {
        await db
          .update(storageSettings)
          .set({ isActive: false, updatedAt: new Date() })
          .where(sql`${storageSettings.id} != ${id}`);
      }

      const updateData: Record<string, any> = {
        ...data,
        updatedAt: new Date(),
      };

      // Only update credentials if provided
      if (accessKeyId !== undefined) {
        updateData.accessKeyIdEncrypted = accessKeyId ? encrypt(accessKeyId) : null;
      }
      if (secretAccessKey !== undefined) {
        updateData.secretAccessKeyEncrypted = secretAccessKey ? encrypt(secretAccessKey) : null;
      }
      if (accessKeyId !== undefined || secretAccessKey !== undefined) {
        // Check if both credentials are now set
        const [current] = await db
          .select()
          .from(storageSettings)
          .where(eq(storageSettings.id, id));

        const hasAccessKey = accessKeyId !== undefined ? !!accessKeyId : !!current?.accessKeyIdEncrypted;
        const hasSecretKey = secretAccessKey !== undefined ? !!secretAccessKey : !!current?.secretAccessKeyEncrypted;
        updateData.hasCredentials = hasAccessKey && hasSecretKey;
      }

      await db
        .update(storageSettings)
        .set(updateData)
        .where(eq(storageSettings.id, id));

      invalidateStorageCache();
      return { success: true };
    }),

  // Admin: Delete storage settings
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .delete(storageSettings)
        .where(eq(storageSettings.id, input.id));

      invalidateStorageCache();
      return { success: true };
    }),

  // Admin: Test connection
  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const startTime = Date.now();

      const [setting] = await db
        .select()
        .from(storageSettings)
        .where(eq(storageSettings.id, input.id));

      if (!setting) {
        return { success: false, message: "Storage settings not found" };
      }

      // For local storage, just return success
      if (setting.providerType === "local") {
        const result = { success: true, message: "Local storage configured", latencyMs: Date.now() - startTime };
        await db
          .update(storageSettings)
          .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
          .where(eq(storageSettings.id, input.id));
        return result;
      }

      // Test S3/R2 connection
      const client = getS3Client(setting);
      if (!client) {
        const result = { success: false, message: "Missing credentials or endpoint" };
        await db
          .update(storageSettings)
          .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
          .where(eq(storageSettings.id, input.id));
        return result;
      }

      try {
        // Try to access the bucket
        await client.send(new HeadBucketCommand({ Bucket: setting.bucket || "" }));

        const latencyMs = Date.now() - startTime;
        const result = { success: true, message: "Connection successful", latencyMs };

        await db
          .update(storageSettings)
          .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
          .where(eq(storageSettings.id, input.id));

        return result;
      } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        // Sanitize error message — S3 SDK errors may expose endpoints/account IDs
        const rawMsg: string = error.message || "Connection failed";
        const safeMsg = rawMsg.includes("AccessDenied")
          ? "Access denied — check credentials and bucket permissions"
          : rawMsg.includes("NoSuchBucket")
            ? "Bucket not found — check the bucket name"
            : rawMsg.includes("ENOTFOUND") || rawMsg.includes("getaddrinfo")
              ? "Endpoint not reachable — check the endpoint URL"
              : rawMsg.includes("ECONNREFUSED")
                ? "Connection refused — check the endpoint URL and port"
                : rawMsg.length > 120
                  ? rawMsg.slice(0, 120) + "…"
                  : rawMsg;
        const result = {
          success: false,
          message: safeMsg,
          latencyMs,
        };

        await db
          .update(storageSettings)
          .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
          .where(eq(storageSettings.id, input.id));

        return result;
      }
    }),

  // Admin: Upload file to storage (for testing or direct uploads)
  uploadFile: adminProcedure
    .input(z.object({
      settingsId: z.number().optional(), // If not provided, use active settings
      fileName: z.string(),
      fileType: z.string(),
      fileBase64: z.string(),
      folder: z.string().default("test"),
    }))
    .mutation(async ({ input }) => {
      const { settingsId, fileName, fileType, fileBase64, folder } = input;

      // Get storage settings
      let setting;
      if (settingsId) {
        [setting] = await db
          .select()
          .from(storageSettings)
          .where(eq(storageSettings.id, settingsId));
      } else {
        [setting] = await db
          .select()
          .from(storageSettings)
          .where(eq(storageSettings.isActive, true))
          .limit(1);
      }

      if (!setting) {
        throw new Error("No storage settings configured");
      }

      if (setting.providerType === "local") {
        // Use local storage (handled by existing storage.ts)
        const { storagePut } = await import("../storage");
        const key = `${setting.pathPrefix || ""}${folder}/${Date.now()}-${fileName}`;
        const buffer = Buffer.from(fileBase64, "base64");
        const { url } = await storagePut(key, buffer, fileType);
        return { key, url };
      }

      // Upload to S3/R2
      const client = getS3Client(setting);
      if (!client) {
        throw new Error("Storage credentials not configured");
      }

      const key = `${setting.pathPrefix || ""}${folder}/${Date.now()}-${fileName}`;
      const buffer = Buffer.from(fileBase64, "base64");

      await client.send(new PutObjectCommand({
        Bucket: setting.bucket || "",
        Key: key,
        Body: buffer,
        ContentType: fileType,
      }));

      // Construct public URL
      let url: string;
      if (setting.publicUrlPrefix) {
        url = `${setting.publicUrlPrefix.replace(/\/$/, "")}/${key}`;
      } else {
        // Default R2/S3 URL format
        url = `${setting.endpoint}/${setting.bucket}/${key}`;
      }

      return { key, url };
    }),

  // Get decrypted credentials for internal use (used by Python backend sync)
  getDecryptedCredentials: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [setting] = await db
        .select()
        .from(storageSettings)
        .where(eq(storageSettings.id, input.id));

      if (!setting) return null;

      return {
        endpoint: setting.endpoint,
        region: setting.region,
        bucket: setting.bucket,
        accessKeyId: setting.accessKeyIdEncrypted ? decrypt(setting.accessKeyIdEncrypted) : null,
        secretAccessKey: setting.secretAccessKeyEncrypted ? decrypt(setting.secretAccessKeyEncrypted) : null,
        publicUrlPrefix: setting.publicUrlPrefix,
        devTunnelUrl: setting.devTunnelUrl,
        pathPrefix: setting.pathPrefix,
        providerType: setting.providerType,
        configJson: setting.configJson,
      };
    }),
});
