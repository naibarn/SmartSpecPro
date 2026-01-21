/**
 * Tenant API Router
 * Endpoints for tenant information and configuration
 */

import type { Express } from "express";
import type { TenantRequest } from "../_core/tenant";
import { getTenantTheme, getTenantSeo, clearTenantCache } from "../_core/tenant";
import { db } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
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
}
