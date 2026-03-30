/**
 * Multi-Tenant Middleware
 * Identifies tenant from domain and attaches to request context
 */

import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db";
import { tenants, type Tenant } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";

// Cache for tenant lookups (5 minutes TTL)
const tenantCache = new Map<string, { tenant: Tenant | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface TenantRequest extends Request {
  tenant?: Tenant;
  tenantId?: string;
}

/**
 * Get tenant from cache or database
 */
async function getTenantByDomain(domain: string): Promise<Tenant | null> {
  // Check cache
  const cached = tenantCache.get(domain);
  if (cached && cached.tenant && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tenant;
  }

  // Query database
  const dbInstance = await getDb();
  if (!dbInstance) return null;

  const result = await dbInstance
    .select()
    .from(tenants)
    .where(
      or(
        eq(tenants.primaryDomain, domain),
      )
    )
    .limit(1);

  const tenant = result[0] || null;

  // Also check domains array
  if (!tenant) {
    const allTenants = await dbInstance.select().from(tenants).where(eq(tenants.isActive, true));
    for (const t of allTenants) {
      if (t.domains && Array.isArray(t.domains) && t.domains.includes(domain)) {
        tenantCache.set(domain, { tenant: t, timestamp: Date.now() });
        return t;
      }
    }
  }

  // Cache result
  tenantCache.set(domain, { tenant, timestamp: Date.now() });

  return tenant;
}

/**
 * Clear tenant cache (useful for admin updates)
 */
export function clearTenantCache(domain?: string) {
  if (domain) {
    tenantCache.delete(domain);
  } else {
    tenantCache.clear();
  }
}

/**
 * Tenant middleware - identifies tenant from hostname
 */
export async function tenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Skip tenant detection for static asset requests
    const urlPath = req.path || req.url;
    if (/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ttf|eot|map)(\?.*)?$/.test(urlPath)) {
      return next();
    }

    // Get hostname from request
    const hostname = req.hostname || req.get("host")?.split(":")[0] || "localhost";

    // Skip tenant detection for localhost and trusted internal hostnames
    // Only trust loopback + Docker internal — actual private network access should go through a known domain
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal") {
      // Use default tenant or first tenant for local/private IPs
      const dbInstance = await getDb();
      if (!dbInstance) return next();
      const [defaultTenant] = await dbInstance
        .select()
        .from(tenants)
        .where(eq(tenants.isActive, true))
        .limit(1);

      if (defaultTenant) {
        req.tenant = defaultTenant;
        req.tenantId = defaultTenant.id;
      }

      return next();
    }

    // Lookup tenant by domain
    const tenant = await getTenantByDomain(hostname);

    if (tenant && tenant.isActive) {
      req.tenant = tenant;
      req.tenantId = tenant.id;
    } else {
      // No tenant found or inactive
      return res.status(404).json({
        error: "Tenant not found",
        message: `No active tenant found for domain: ${hostname}`,
      });
    }

    next();
  } catch (error) {
    console.error("[Tenant Middleware] Error:", error);
    next(error);
  }
}

/**
 * Require tenant middleware - ensures tenant is present
 */
export function requireTenant(req: TenantRequest, res: Response, next: NextFunction) {
  if (!req.tenant || !req.tenantId) {
    return res.status(400).json({
      error: "Tenant required",
      message: "This endpoint requires a valid tenant context",
    });
  }
  next();
}

/**
 * Get tenant theme configuration with defaults
 */
export function getTenantTheme(tenant: Tenant) {
  const defaultTheme = {
    primaryColor: "#2563eb",
    secondaryColor: "#06b6d4",
    accentColor: "#14b8a6",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
    fontFamily: "Inter, system-ui, sans-serif",
    headingFont: "Inter, system-ui, sans-serif",
    layout: "modern" as const,
    headerStyle: "blur" as const,
    footerStyle: "detailed" as const,
    buttonStyle: "rounded" as const,
    cardStyle: "elevated" as const,
  };

  return {
    ...defaultTheme,
    ...(tenant.themeConfig || {}),
  };
}

/**
 * Get tenant SEO configuration with defaults
 */
export function getTenantSeo(tenant: Tenant) {
  const defaultSeo = {
    defaultTitle: `${tenant.name} | Skill Marketplace & Workflow Swarms`,
    defaultDescription: `Discover reusable skills, build virtual workflows, and run coordinated swarms across chat, presentation, and video outputs with ${tenant.name}.`,
    defaultKeywords: [
      tenant.name,
      "skill marketplace",
      "virtual workflow",
      "swarm execution",
      "AI orchestration",
      "chat output",
      "presentation output",
      "video output",
    ],
    twitterCard: "summary_large_image" as const,
    aiContext: `${tenant.name} is a skill marketplace platform for building virtual workflows and swarm executions that produce chat, presentation, and video outputs.`,
    aiKeyFacts: [
      `${tenant.name} lets teams publish reusable skills.`,
      `${tenant.name} supports virtual workflow orchestration.`,
      `${tenant.name} can coordinate swarm execution for multiple outputs.`,
    ],
  };

  return {
    ...defaultSeo,
    ...(tenant.seoConfig || {}),
  };
}
