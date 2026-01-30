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
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

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
      const [tenant] = await dbInstance.select().from(tenants).where(eq(tenants.id, id));

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
      const { slug, name, primaryDomain, domains, logoUrl, websiteLogoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings } = req.body;

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

      // Generate unique tenant ID
      const tenantId = `tenant-${nanoid(8)}`;

      const [tenant] = await dbInstance.insert(tenants).values({
        id: tenantId,
        slug,
        name,
        primaryDomain,
        domains: domains || [],
        logoUrl,
        websiteLogoUrl,
        faviconUrl,
        isActive: isActive !== undefined ? isActive : true,
        themeConfig: themeConfig || {},
        seoConfig: seoConfig || {},
        settings: settings || {},
        ownerId: req.user.id,
        status: 'ACTIVE',
        plan: 'FREE',
        created_at: new Date(),
        createdAt: new Date(),
      } as any).returning();

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
      const { slug, name, primaryDomain, domains, logoUrl, websiteLogoUrl, faviconUrl, isActive, themeConfig, seoConfig, settings } = req.body;

      const dbInstance = await db.instance;

      const [tenant] = await dbInstance.update(tenants)
        .set({
          slug,
          name,
          primaryDomain,
          domains,
          logoUrl,
          websiteLogoUrl,
          faviconUrl,
          isActive,
          themeConfig,
          seoConfig,
          settings,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
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

      await dbInstance.delete(tenants).where(eq(tenants.id, id));

      // Clear tenant cache
      clearTenantCache();

      res.json({ message: 'Tenant deleted successfully' });
    } catch (error) {
      console.error('Error deleting tenant:', error);
      res.status(500).json({ error: 'Failed to delete tenant' });
    }
  });

  // Upload tenant logo or favicon
  app.post('/api/admin/tenants/:id/upload', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { type, fileBase64, fileName, fileType } = req.body;

      // Validate upload type
      if (!['logo', 'website-logo', 'favicon'].includes(type)) {
        return res.status(400).json({ error: 'Type must be "logo", "website-logo", or "favicon"' });
      }

      // Validate file data
      if (!fileBase64 || !fileName || !fileType) {
        return res.status(400).json({ error: 'Missing required fields: fileBase64, fileName, fileType' });
      }

      // Validate file type
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
      if (!allowedMimeTypes.includes(fileType)) {
        return res.status(400).json({ error: 'Invalid file type. Allowed: PNG, JPEG, WebP, SVG, ICO' });
      }

      const dbInstance = await db.instance;

      // Check tenant exists
      const [tenant] = await dbInstance.select().from(tenants).where(eq(tenants.id, id));
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Generate unique file key
      const ext = fileName.split('.').pop() || 'png';
      const uniqueId = nanoid(10);
      const fileKey = `tenants/${id}/${type}/${uniqueId}-${Date.now()}.${ext}`;

      // Convert base64 to buffer
      const parts = fileBase64.split(',', 2);
      const base64Data = parts.length === 2 ? parts[1] : fileBase64;
      const buffer = Buffer.from(base64Data, 'base64');

      // Validate file size (max 10MB for website-logo, 5MB for logo, 1MB for favicon)
      const maxSize = type === 'favicon' ? 1 * 1024 * 1024 : type === 'website-logo' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (buffer.length > maxSize) {
        return res.status(400).json({
          error: `File too large. Max size: ${type === 'favicon' ? '1MB' : type === 'website-logo' ? '10MB' : '5MB'}`
        });
      }

      // Upload to storage
      const { url } = await storagePut(fileKey, buffer, fileType);

      // Update tenant with new URL
      const updateField = type === 'logo' ? { logoUrl: url } : type === 'website-logo' ? { websiteLogoUrl: url } : { faviconUrl: url };
      await dbInstance.update(tenants)
        .set({
          ...updateField,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id));

      // Clear tenant cache
      clearTenantCache();

      res.json({
        success: true,
        url,
        fileKey,
        type,
      });
    } catch (error) {
      console.error('Error uploading tenant asset:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
}
