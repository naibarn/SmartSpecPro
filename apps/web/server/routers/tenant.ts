/**
 * Tenant API Router
 * Endpoints for tenant information and configuration
 */

import type { Express } from "express";
import type { TenantRequest } from "../_core/tenant";
import { getTenantTheme, getTenantSeo, clearTenantCache } from "../_core/tenant";
import { db } from "../db";
import { tenants, tenantPages, themePresets, seoMetadata } from "../../drizzle/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { sanitizeBrandingDeep } from "../services/brandingSanitizer";
import { SmartAiHubContentManifestSchema } from "../../shared/smartaihubContentManifest";
import { importSmartAiHubContentManifest } from "../services/smartaihubContentImport";
import { buildSmartAiHubRelatedLinks } from "../../shared/smartaihubDiscovery";
import { pingSmartAiHubSearchEngines } from "../services/sitemapPing";

function isVideoMediaUrl(url: string): boolean {
  const value = url.trim().toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/.test(value) || value.includes("video");
}

function buildTenantPagePath(pageKey: string, slug: string): string {
  if (pageKey === "home" || slug === "home") {
    return "/";
  }

  if (pageKey.startsWith("docs-")) {
    return `/docs/${slug.replace(/^\/+/, "")}`;
  }

  return `/${slug.replace(/^\/+/, "")}`;
}

export function registerTenantRoutes(app: Express) {
  // Get current tenant information
  app.get("/api/tenant/current", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const theme = getTenantTheme(req.tenant);
      const seo = getTenantSeo(req.tenant);

      res.json(sanitizeBrandingDeep({
        tenant: {
          id: req.tenant.id,
          slug: req.tenant.slug,
          name: req.tenant.name,
          primaryDomain: req.tenant.primaryDomain,
          logoUrl: req.tenant.logoUrl,
          websiteLogoUrl: req.tenant.websiteLogoUrl,
          faviconUrl: req.tenant.faviconUrl,
          theme,
          seo,
          settings: req.tenant.settings || {},
          contactInfo: req.tenant.contactInfo || {},
          featureFlags: (req.tenant.featureFlags as Record<string, boolean> | null) ?? {},
        },
      }));
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ error: "Failed to fetch tenant information" });
    }
  });

  // Get tenant theme only
  app.get("/api/tenant/theme", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const theme = getTenantTheme(req.tenant);
      res.json({ theme });
    } catch (error) {
      console.error("Error fetching theme:", error);
      res.status(500).json({ error: "Failed to fetch theme" });
    }
  });

  // Get tenant SEO metadata for a specific path
  app.get("/api/tenant/seo", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const rawPath = (req.query.path as string) || "/";
      const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      const normalizedPath = path.length > 1 ? path.replace(/\/+$/, "") : "/";
      const seoDefaults = getTenantSeo(req.tenant);

      const dbInstance = await db.instance;
      const [metadata] = await dbInstance
        .select()
        .from(seoMetadata)
        .where(
          and(
            eq(seoMetadata.tenantId, Number(req.tenant.id)),
            eq(seoMetadata.path, normalizedPath)
          )
        )
        .limit(1);

      const seo = {
        ...seoDefaults,
        defaultTitle: metadata?.title || seoDefaults.defaultTitle,
        defaultDescription: metadata?.description || seoDefaults.defaultDescription,
        defaultKeywords: metadata?.keywords || seoDefaults.defaultKeywords,
        ogImage: metadata?.ogMetadata?.image || seoDefaults.ogImage,
        twitterCard: metadata?.twitterMetadata?.card || seoDefaults.twitterCard,
        aiContext: metadata?.aiContent?.context || seoDefaults.aiContext,
        aiKeyFacts: metadata?.aiContent?.keyFacts || seoDefaults.aiKeyFacts,
        structuredData: metadata?.structuredData || seoDefaults.structuredData,
      };

      res.json(sanitizeBrandingDeep({
        seo,
        metadata: metadata || null,
        path: normalizedPath,
        relatedLinks: buildSmartAiHubRelatedLinks(normalizedPath, metadata?.title || seoDefaults.defaultTitle, metadata?.keywords || seoDefaults.defaultKeywords || []),
      }));
    } catch (error) {
      console.error("Error fetching SEO:", error);
      res.status(500).json({ error: "Failed to fetch SEO metadata" });
    }
  });

  // Import content manifest for the current tenant (domain admin only)
  app.post("/api/tenant/content-manifest/import", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can import content" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only import content for your own domain" });
      }

      const parsed = SmartAiHubContentManifestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid content manifest",
          details: parsed.error.flatten(),
        });
      }

      const dbInstance = await db.instance;
      const tenantDomain = req.tenant.primaryDomain || parsed.data.tenantDomain || "smartaihub.app";
      const result = await importSmartAiHubContentManifest(dbInstance, parsed.data, tenantDomain);
      clearTenantCache();
      void pingSmartAiHubSearchEngines(tenantDomain).catch(() => {});

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error("Error importing content manifest:", error);
      res.status(500).json({ error: "Failed to import content manifest" });
    }
  });

  // Update tenant theme (domain admin only)
  app.put("/api/tenant/theme", async (req: TenantRequest, res) => {
    try {
      // Authenticate user
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is domain admin or admin
      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can update theme" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Domain admins can only update their own domain
      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only update your own domain's theme" });
      }

      const { themeConfig } = req.body;

      if (!themeConfig) {
        return res.status(400).json({ error: "themeConfig is required" });
      }

      // Validate themeConfig values to prevent CSS injection
      const validColor = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+))?\s*\)|transparent|inherit|currentColor)$/i;
      const validFontFamily = /^[a-zA-Z0-9\s,'"-]+$/;
      const validCssValue = /^[a-zA-Z0-9\s#.,%()\-]+$/;

      function validateThemeValues(obj: any, depth = 0): boolean {
        if (depth > 5) return false; // prevent deep nesting attacks
        if (typeof obj !== "object" || obj === null) {
          if (typeof obj === "string") {
            // Block script injection, url(), expression(), etc.
            if (/(?:javascript|expression|url\s*\(|@import|<script|<\/script)/i.test(obj)) {
              return false;
            }
            return obj.length <= 200; // reasonable max length
          }
          return typeof obj === "number" || typeof obj === "boolean";
        }
        for (const val of Object.values(obj)) {
          if (!validateThemeValues(val, depth + 1)) return false;
        }
        return true;
      }

      if (!validateThemeValues(themeConfig)) {
        return res.status(400).json({ error: "Invalid theme configuration values" });
      }

      // Update tenant theme
      const dbInstance = await db.instance;
      await dbInstance
        .update(tenants)
        .set({
          themeConfig,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, req.tenant.id));

      // Clear cache
      clearTenantCache();

      res.json({
        success: true,
        message: "Theme updated successfully",
      });
    } catch (error) {
      console.error("Error updating theme:", error);
      res.status(500).json({ error: "Failed to update theme" });
    }
  });

  // Get all pages for current tenant
  app.get("/api/tenant/pages", async (req: TenantRequest, res) => {
    try {
      // Authenticate user
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is domain admin or admin
      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can view pages" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Domain admins can only view their own domain
      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only view your own domain's pages" });
      }

      // Fetch all pages for this tenant
      const dbInstance = await db.instance;
      const pages = await dbInstance
        .select()
        .from(tenantPages)
        .where(eq(tenantPages.tenantId as any, req.tenant.id as any));

      // Convert to map by pageKey
      const pagesMap = pages.reduce((acc, page) => {
        acc[page.pageKey] = page;
        return acc;
      }, {} as Record<string, any>);

      res.json(sanitizeBrandingDeep(pagesMap));
    } catch (error) {
      console.error("Error fetching pages:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  // Get specific page for current tenant
  app.get("/api/tenant/pages/:pageKey", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const { pageKey } = req.params;

      // Fetch page
      const dbInstance = await db.instance;
      const [page] = await dbInstance
        .select()
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageKey)
          )
        );

      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      // Public pages should be published
      if (!page.isPublished) {
        // Check if user is authenticated and is domain admin
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
          return res.status(404).json({ error: "Page not found" });
        }
      }

      res.json(sanitizeBrandingDeep(page));
    } catch (error) {
      console.error("Error fetching page:", error);
      res.status(500).json({ error: "Failed to fetch page" });
    }
  });

  // Save or update page (domain admin only)
  app.post("/api/tenant/pages", async (req: TenantRequest, res) => {
    try {
      // Authenticate user
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is domain admin or admin
      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can update pages" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Domain admins can only update their own domain
      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only update your own domain's pages" });
      }

      const pageData = req.body;

      if (!pageData.pageKey) {
        return res.status(400).json({ error: "pageKey is required" });
      }

      const dbInstance = await db.instance;

      // Check if page exists
      const [existingPage] = await dbInstance
        .select()
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageData.pageKey)
          )
        );

      if (existingPage) {
        // Update existing page
        await dbInstance
          .update(tenantPages)
          .set({
            title: pageData.title,
            slug: pageData.slug,
            content: pageData.content,
            sections: pageData.sections,
            metadata: pageData.metadata,
            isPublished: pageData.isPublished,
            showInMenu: pageData.showInMenu,
            sortOrder: pageData.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(tenantPages.id, existingPage.id));
      } else {
        // Create new page
        await dbInstance.insert(tenantPages).values({
          tenantId: req.tenant.id as any,
          pageKey: pageData.pageKey,
          title: pageData.title,
          slug: pageData.slug,
          content: pageData.content,
          sections: pageData.sections,
          metadata: pageData.metadata,
          isPublished: pageData.isPublished || false,
          showInMenu: pageData.showInMenu !== undefined ? pageData.showInMenu : true,
          sortOrder: pageData.sortOrder || 0,
        });
      }

      res.json({
        success: true,
        message: "Page saved successfully",
      });
    } catch (error) {
      console.error("Error saving page:", error);
      res.status(500).json({ error: "Failed to save page" });
    }
  });

  // Attach generated media to a tenant page (domain admin only)
  app.post("/api/tenant/pages/:pageKey/attach-media", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can update pages" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only update your own domain's pages" });
      }

      const { pageKey } = req.params;
      const { mediaUrl } = req.body as { mediaUrl?: string; mediaType?: string };
      if (!mediaUrl || !mediaUrl.trim()) {
        return res.status(400).json({ error: "mediaUrl is required" });
      }

      const normalizedUrl = mediaUrl.trim();
      const dbInstance = await db.instance;
      const [existingPage] = await dbInstance
        .select()
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageKey)
          )
        )
        .limit(1);

      if (!existingPage) {
        return res.status(404).json({ error: "Page not found" });
      }

      const metadata = (existingPage.metadata || {}) as Record<string, any>;
      const customMeta = { ...(metadata.customMeta || {}) };
      customMeta.heroMediaUrl = normalizedUrl;
      customMeta.heroMediaType = isVideoMediaUrl(normalizedUrl) ? "video" : "image";

      const nextMetadata = {
        ...metadata,
        customMeta,
        ...(isVideoMediaUrl(normalizedUrl) ? {} : { ogImage: normalizedUrl }),
      };

      await dbInstance
        .update(tenantPages)
        .set({
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(tenantPages.id, existingPage.id));

      const pagePath = buildTenantPagePath(existingPage.pageKey, existingPage.slug);

      const [existingSeo] = await dbInstance
        .select()
        .from(seoMetadata)
        .where(
          and(
            eq(seoMetadata.tenantId, Number(req.tenant.id)),
            eq(seoMetadata.path, pagePath)
          )
        )
        .limit(1);

      if (existingSeo && !isVideoMediaUrl(normalizedUrl)) {
        await dbInstance
          .update(seoMetadata)
          .set({
            ogMetadata: {
              ...(existingSeo.ogMetadata || {}),
              image: normalizedUrl,
            },
            twitterMetadata: {
              ...(existingSeo.twitterMetadata || {}),
              image: normalizedUrl,
            },
            updatedAt: new Date(),
          })
          .where(eq(seoMetadata.id, existingSeo.id));
      }

      clearTenantCache();
      res.json({
        success: true,
        message: "Media attached to page",
        page: {
          pageKey: existingPage.pageKey,
          slug: existingPage.slug,
          mediaUrl: normalizedUrl,
        },
      });
    } catch (error) {
      console.error("Error attaching media to page:", error);
      res.status(500).json({ error: "Failed to attach media to page" });
    }
  });

  // Delete page (domain admin only)
  app.delete("/api/tenant/pages/:pageKey", async (req: TenantRequest, res) => {
    try {
      // Authenticate user
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is domain admin or admin
      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can delete pages" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const { pageKey } = req.params;

      const dbInstance = await db.instance;
      const [existingPage] = await dbInstance
        .select({ id: tenantPages.id, slug: tenantPages.slug, pageKey: tenantPages.pageKey })
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageKey)
          )
        )
        .limit(1);

      if (existingPage) {
        await dbInstance
          .delete(seoMetadata)
          .where(
            and(
              eq(seoMetadata.tenantId, Number(req.tenant.id)),
              eq(seoMetadata.path, buildTenantPagePath(existingPage.pageKey, existingPage.slug))
            )
          );
      }

      await dbInstance
        .delete(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageKey)
          )
        );

      clearTenantCache();
      res.json({
        success: true,
        message: "Page deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting page:", error);
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  // Bulk delete pages (domain admin only)
  app.delete("/api/tenant/pages/bulk-delete", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can delete pages" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only delete your own domain's pages" });
      }

      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids
            .map((value: unknown) => Number.parseInt(String(value), 10))
            .filter((value: number) => Number.isInteger(value) && value > 0)
        : [];

      if (ids.length === 0) {
        return res.status(400).json({ error: "ids is required" });
      }

      const dbInstance = await db.instance;
      const pages = await dbInstance
        .select({ id: tenantPages.id, slug: tenantPages.slug, pageKey: tenantPages.pageKey })
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            inArray(tenantPages.id, ids)
          )
        );

      if (pages.length > 0) {
        await dbInstance
          .delete(seoMetadata)
          .where(
            and(
              eq(seoMetadata.tenantId, Number(req.tenant.id)),
              inArray(
                seoMetadata.path,
                pages.map((page) => buildTenantPagePath(page.pageKey, page.slug))
              )
            )
          );
      }

      await dbInstance
        .delete(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            inArray(tenantPages.id, pages.map((page) => page.id))
          )
        );

      clearTenantCache();
      res.json({
        success: true,
        message: "Pages deleted successfully",
        deletedIds: pages.map((page) => page.id),
      });
    } catch (error) {
      console.error("Error bulk deleting pages:", error);
      res.status(500).json({ error: "Failed to delete pages" });
    }
  });

  // Get published page content for current tenant (public, no auth)
  app.get("/api/tenant/public-pages/:pageKey", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const { pageKey } = req.params;

      const dbInstance = await db.instance;
      const [page] = await dbInstance
        .select()
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId as any, req.tenant.id as any),
            eq(tenantPages.pageKey, pageKey)
          )
        );

      if (!page || !page.isPublished) {
        return res.status(404).json({ error: "Page not found" });
      }

      res.json(sanitizeBrandingDeep(page));
    } catch (error) {
      console.error("Error fetching public page:", error);
      res.status(500).json({ error: "Failed to fetch page" });
    }
  });

  // Get all available theme presets (public)
  app.get("/api/tenant/theme-presets", async (req, res) => {
    try {
      const dbInstance = await db.instance;
      const presets = await dbInstance
        .select()
        .from(themePresets)
        .where(eq(themePresets.isActive, true))
        .orderBy(asc(themePresets.sortOrder));

      res.json(sanitizeBrandingDeep({ presets }));
    } catch (error) {
      console.error("Error fetching theme presets:", error);
      res.status(500).json({ error: "Failed to fetch theme presets" });
    }
  });

  // Get a single theme preset by ID
  app.get("/api/tenant/theme-presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const dbInstance = await db.instance;
      const [preset] = await dbInstance
        .select()
        .from(themePresets)
        .where(eq(themePresets.id, parseInt(id)));

      if (!preset) {
        return res.status(404).json({ error: "Theme preset not found" });
      }

      res.json(sanitizeBrandingDeep({ preset }));
    } catch (error) {
      console.error("Error fetching theme preset:", error);
      res.status(500).json({ error: "Failed to fetch theme preset" });
    }
  });

  // Apply theme preset to tenant (domain admin only)
  app.post("/api/tenant/apply-preset", async (req: TenantRequest, res) => {
    try {
      // Authenticate user
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is domain admin or admin
      if (user.role !== "domain_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only domain admins can apply theme presets" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Domain admins can only update their own domain
      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "You can only update your own domain's theme" });
      }

      const { presetId } = req.body;

      if (!presetId) {
        return res.status(400).json({ error: "presetId is required" });
      }

      const dbInstance = await db.instance;

      // Get the preset
      const [preset] = await dbInstance
        .select()
        .from(themePresets)
        .where(eq(themePresets.id, presetId));

      if (!preset) {
        return res.status(404).json({ error: "Theme preset not found" });
      }

      if (!preset.isActive) {
        return res.status(400).json({ error: "This theme preset is not available" });
      }

      // Apply the preset's theme config to the tenant
      await dbInstance
        .update(tenants)
        .set({
          themeConfig: preset.themeConfig,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, req.tenant.id));

      // Clear cache
      clearTenantCache();

      res.json(sanitizeBrandingDeep({
        success: true,
        message: `Theme "${preset.displayName}" applied successfully`,
        appliedTheme: preset.themeConfig,
      }));
    } catch (error) {
      console.error("Error applying theme preset:", error);
      res.status(500).json({ error: "Failed to apply theme preset" });
    }
  });
}
