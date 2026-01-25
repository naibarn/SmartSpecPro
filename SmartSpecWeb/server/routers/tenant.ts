/**
 * Tenant API Router
 * Endpoints for tenant information and configuration
 */

import type { Express } from "express";
import type { TenantRequest } from "../_core/tenant";
import { getTenantTheme, getTenantSeo, clearTenantCache } from "../_core/tenant";
import { db } from "../db";
import { tenants, tenantPages, themePresets } from "../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { sdk } from "../_core/sdk";

export function registerTenantRoutes(app: Express) {
  // Get current tenant information
  app.get("/api/tenant/current", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const theme = getTenantTheme(req.tenant);
      const seo = getTenantSeo(req.tenant);

      res.json({
        tenant: {
          id: req.tenant.id,
          slug: req.tenant.slug,
          name: req.tenant.name,
          primaryDomain: req.tenant.primaryDomain,
          logoUrl: req.tenant.logoUrl,
          faviconUrl: req.tenant.faviconUrl,
          theme,
          seo,
          settings: req.tenant.settings || {},
          contactInfo: req.tenant.contactInfo || {},
        },
      });
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

      const path = (req.query.path as string) || "/";
      const seo = getTenantSeo(req.tenant);

      // TODO: Query seo_metadata table for path-specific metadata
      // For now, return tenant defaults

      res.json({ seo, path });
    } catch (error) {
      console.error("Error fetching SEO:", error);
      res.status(500).json({ error: "Failed to fetch SEO metadata" });
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
        .where(eq(tenantPages.tenantId, req.tenant.id));

      // Convert to map by pageKey
      const pagesMap = pages.reduce((acc, page) => {
        acc[page.pageKey] = page;
        return acc;
      }, {} as Record<string, any>);

      res.json(pagesMap);
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
            eq(tenantPages.tenantId, req.tenant.id),
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

      res.json(page);
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
            eq(tenantPages.tenantId, req.tenant.id),
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
          tenantId: req.tenant.id,
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
      await dbInstance
        .delete(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId, req.tenant.id),
            eq(tenantPages.pageKey, pageKey)
          )
        );

      res.json({
        success: true,
        message: "Page deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting page:", error);
      res.status(500).json({ error: "Failed to delete page" });
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

      res.json({ presets });
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

      res.json({ preset });
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

      res.json({
        success: true,
        message: `Theme "${preset.displayName}" applied successfully`,
        appliedTheme: preset.themeConfig,
      });
    } catch (error) {
      console.error("Error applying theme preset:", error);
      res.status(500).json({ error: "Failed to apply theme preset" });
    }
  });
}
