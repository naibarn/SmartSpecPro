/**
 * Admin Tenants Router
 * CRUD operations for tenant management (admin only)
 */

import type { Express } from "express";
import { db } from "../db";
import { tenants, users, type InsertTenant } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { clearTenantCache } from "../_core/tenant";

// Middleware to check admin role
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const user = await sdk.authenticateRequest(req).catch(() => null);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dbInstance = await db.instance;
    const [dbUser] = await dbInstance.select().from(users).where(eq(users.id, user.id));

    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.user = dbUser;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export function registerAdminTenantsRoutes(app: Express) {
  // Get all tenants
  app.get('/api/admin/tenants', requireAdmin, async (req, res) => {
    try {
      const dbInstance = await db.instance;
      const allTenants = await dbInstance.select().from(tenants);

      res.json({ tenants: allTenants });
    } catch (error) {
      console.error('Error fetching tenants:', error);
      res.status(500).json({ error: 'Failed to fetch tenants' });
    }
  });

  // Get single tenant
  app.get('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const dbInstance = await db.instance;
      const [tenant] = await dbInstance.select().from(tenants).where(eq(tenants.id, parseInt(id)));

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      res.json({ tenant });
    } catch (error) {
      console.error('Error fetching tenant:', error);
      res.status(500).json({ error: 'Failed to fetch tenant' });
    }
  });

  // Create tenant
  app.post('/api/admin/tenants', requireAdmin, async (req, res) => {
    try {
      const { slug, name, primaryDomain, domains, logoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings } = req.body;

      if (!slug || !name || !primaryDomain) {
        return res.status(400).json({ error: 'Missing required fields: slug, name, primaryDomain' });
      }

      const dbInstance = await db.instance;

      // Check for duplicate slug or domain
      const existing = await dbInstance.select().from(tenants)
        .where(eq(tenants.slug, slug));

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Tenant with this slug already exists' });
      }

      const [tenant] = await dbInstance.insert(tenants).values({
        slug,
        name,
        primaryDomain,
        domains: domains || [],
        logoUrl,
        faviconUrl,
        isActive: isActive !== undefined ? isActive : true,
        themeConfig: themeConfig || {},
        seoConfig: seoConfig || {},
        settings: settings || {},
        ownerId: req.user.id,
      }).returning();

      // Clear tenant cache
      clearTenantCache();

      res.status(201).json({ tenant });
    } catch (error) {
      console.error('Error creating tenant:', error);
      res.status(500).json({ error: 'Failed to create tenant' });
    }
  });

  // Update tenant
  app.put('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { slug, name, primaryDomain, domains, logoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings } = req.body;

      const dbInstance = await db.instance;

      const [tenant] = await dbInstance.update(tenants)
        .set({
          slug,
          name,
          primaryDomain,
          domains,
          logoUrl,
          faviconUrl,
          isActive,
          themeConfig,
          seoConfig,
          settings,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, parseInt(id)))
        .returning();

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Clear tenant cache
      clearTenantCache();

      res.json({ tenant });
    } catch (error) {
      console.error('Error updating tenant:', error);
      res.status(500).json({ error: 'Failed to update tenant' });
    }
  });

  // Delete tenant
  app.delete('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const dbInstance = await db.instance;

      await dbInstance.delete(tenants).where(eq(tenants.id, parseInt(id)));

      // Clear tenant cache
      clearTenantCache();

      res.json({ message: 'Tenant deleted successfully' });
    } catch (error) {
      console.error('Error deleting tenant:', error);
      res.status(500).json({ error: 'Failed to delete tenant' });
    }
  });
}
