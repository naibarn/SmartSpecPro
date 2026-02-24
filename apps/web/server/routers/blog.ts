/**
 * Blog API Router
 * CRUD endpoints for tenant-specific blog posts
 */

import type { Express } from "express";
import type { TenantRequest } from "../_core/tenant";
import { db } from "../db";
import { blogPosts } from "../../drizzle/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import sanitizeHtml from "sanitize-html";
import { sanitizeBrandingDeep } from "../services/brandingSanitizer";

/** Server-side HTML sanitization for blog content using sanitize-html */
function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img", "figure", "figcaption", "details", "summary",
      "mark", "del", "ins", "sub", "sup", "hr",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height", "loading"],
      a: ["href", "target", "rel", "title"],
      "*": ["class", "id"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    disallowedTagsMode: "discard",
  });
}

export function registerBlogRoutes(app: Express) {
  // ===== PUBLIC ENDPOINTS =====

  // List published blog posts for current tenant
  app.get("/api/blog/posts", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.json({ posts: [] });
      }

      const dbInstance = await db.instance;
      const posts = await dbInstance
        .select({
          id: blogPosts.id,
          slug: blogPosts.slug,
          title: blogPosts.title,
          excerpt: blogPosts.excerpt,
          coverImage: blogPosts.coverImage,
          author: blogPosts.author,
          authorAvatar: blogPosts.authorAvatar,
          category: blogPosts.category,
          tags: blogPosts.tags,
          readTime: blogPosts.readTime,
          isFeatured: blogPosts.isFeatured,
          publishedAt: blogPosts.publishedAt,
          createdAt: blogPosts.createdAt,
        })
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.tenantId, req.tenant.id),
            eq(blogPosts.isPublished, true)
          )
        )
        .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt));

      res.json(sanitizeBrandingDeep({ posts }));
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ error: "Failed to fetch blog posts" });
    }
  });

  // Get single published blog post by slug
  app.get("/api/blog/posts/:slug", async (req: TenantRequest, res) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({ error: "Post not found" });
      }

      const { slug } = req.params;
      const dbInstance = await db.instance;
      const [post] = await dbInstance
        .select()
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.tenantId, req.tenant.id),
            eq(blogPosts.slug, slug),
            eq(blogPosts.isPublished, true)
          )
        )
        .limit(1);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      res.json(sanitizeBrandingDeep({ post }));
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  });

  // ===== ADMIN ENDPOINTS =====

  // List all blog posts (including drafts) for admin
  app.get("/api/admin/blog/posts", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "Access denied" });
      }

      const dbInstance = await db.instance;
      const posts = await dbInstance
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.tenantId, req.tenant.id))
        .orderBy(desc(blogPosts.updatedAt));

      res.json(sanitizeBrandingDeep({ posts }));
    } catch (error) {
      console.error("Error fetching admin blog posts:", error);
      res.status(500).json({ error: "Failed to fetch blog posts" });
    }
  });

  // Get single blog post for admin (including drafts)
  app.get("/api/admin/blog/posts/:id", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const { id } = req.params;
      const dbInstance = await db.instance;
      const [post] = await dbInstance
        .select()
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.id, parseInt(id)),
            eq(blogPosts.tenantId, req.tenant.id)
          )
        )
        .limit(1);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      res.json(sanitizeBrandingDeep({ post }));
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  });

  // Create blog post
  app.post("/api/admin/blog/posts", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = req.body;
      if (!data.title) {
        return res.status(400).json({ error: "Title is required" });
      }

      // Auto-generate slug if not provided
      const slug = data.slug || data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const dbInstance = await db.instance;
      const [post] = await dbInstance
        .insert(blogPosts)
        .values({
          tenantId: req.tenant.id,
          slug,
          title: data.title,
          excerpt: data.excerpt || null,
          content: data.content ? sanitizeBlogHtml(data.content) : null,
          coverImage: data.coverImage || null,
          author: data.author || user.name || 'Admin',
          authorAvatar: data.authorAvatar || null,
          category: data.category || null,
          tags: data.tags || [],
          readTime: data.readTime || null,
          isPublished: data.isPublished || false,
          isFeatured: data.isFeatured || false,
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          publishedAt: data.isPublished ? new Date() : null,
        })
        .returning();

      res.json(sanitizeBrandingDeep({ post, message: "Post created successfully" }));
    } catch (error) {
      console.error("Error creating blog post:", error);
      res.status(500).json({ error: "Failed to create blog post" });
    }
  });

  // Update blog post
  app.put("/api/admin/blog/posts/:id", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;
      const data = req.body;

      const dbInstance = await db.instance;

      // Verify post belongs to this tenant
      const [existing] = await dbInstance
        .select()
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.id, parseInt(id)),
            eq(blogPosts.tenantId, req.tenant.id)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Post not found" });
      }

      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      // Only update provided fields
      if (data.title !== undefined) updateData.title = data.title;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
      if (data.content !== undefined) updateData.content = data.content ? sanitizeBlogHtml(data.content) : data.content;
      if (data.coverImage !== undefined) updateData.coverImage = data.coverImage;
      if (data.author !== undefined) updateData.author = data.author;
      if (data.authorAvatar !== undefined) updateData.authorAvatar = data.authorAvatar;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.readTime !== undefined) updateData.readTime = data.readTime;
      if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
      if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription;
      if (data.metaKeywords !== undefined) updateData.metaKeywords = data.metaKeywords;

      if (data.isPublished !== undefined) {
        updateData.isPublished = data.isPublished;
        if (data.isPublished && !existing.publishedAt) {
          updateData.publishedAt = new Date();
        }
      }

      const [post] = await dbInstance
        .update(blogPosts)
        .set(updateData)
        .where(eq(blogPosts.id, parseInt(id)))
        .returning();

      res.json(sanitizeBrandingDeep({ post, message: "Post updated successfully" }));
    } catch (error) {
      console.error("Error updating blog post:", error);
      res.status(500).json({ error: "Failed to update blog post" });
    }
  });

  // Delete blog post
  app.delete("/api/admin/blog/posts/:id", async (req: TenantRequest, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (user.role === "domain_admin" && user.registeredDomain !== req.tenant.primaryDomain) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;
      const dbInstance = await db.instance;

      await dbInstance
        .delete(blogPosts)
        .where(
          and(
            eq(blogPosts.id, parseInt(id)),
            eq(blogPosts.tenantId, req.tenant.id)
          )
        );

      res.json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ error: "Failed to delete blog post" });
    }
  });
}
