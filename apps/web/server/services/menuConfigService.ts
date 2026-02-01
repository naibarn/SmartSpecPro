/**
 * Menu Config Service
 *
 * Manages admin overrides for the shared menu system.
 * Reads from DB and merges with default menu items from @smartspec/shared.
 */

import { getDb } from "../db";
import { menuConfig } from "../../drizzle/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import {
  getVisibleMenuItems,
  type MenuItem,
  type Platform,
  type UserRole,
} from "@smartspec/shared";

export interface MenuOverride {
  menuItemId: string;
  platform: string;
  visible: boolean;
  customLabel?: string | null;
  customIcon?: string | null;
  sortOrder?: number | null;
  tenantId?: number | null;
}

/**
 * Get menu overrides for a specific platform + tenant
 */
export async function getMenuOverrides(
  platform: Platform,
  tenantId?: number
): Promise<MenuOverride[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(menuConfig.platform, platform)];
  if (tenantId != null) {
    // Get both global (null tenant) and tenant-specific overrides
    // Tenant-specific overrides take precedence
    conditions.push(or(isNull(menuConfig.tenantId), eq(menuConfig.tenantId, tenantId))!);
  } else {
    // Only global overrides when no tenant specified
    conditions.push(isNull(menuConfig.tenantId));
  }

  const rows = await db
    .select()
    .from(menuConfig)
    .where(and(...conditions));

  // Tenant-specific overrides take precedence over global ones
  const overrideMap = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    const existing = overrideMap.get(r.menuItemId);
    // Tenant-specific (non-null tenantId) wins over global (null tenantId)
    if (!existing || (r.tenantId != null && existing.tenantId == null)) {
      overrideMap.set(r.menuItemId, r);
    }
  }

  return Array.from(overrideMap.values()).map((r) => ({
    menuItemId: r.menuItemId,
    platform: r.platform,
    visible: r.visible,
    customLabel: r.customLabel,
    customIcon: r.customIcon,
    sortOrder: r.sortOrder,
    tenantId: r.tenantId,
  }));
}

/**
 * Get effective menu items for a user, applying DB overrides on top of defaults
 */
export async function getEffectiveMenuItems(
  platform: Platform,
  role: UserRole,
  tenantId?: number
): Promise<MenuItem[]> {
  // Start with shared defaults
  const defaults = getVisibleMenuItems(platform, role);

  // Load admin overrides
  const overrides = await getMenuOverrides(platform, tenantId);
  if (overrides.length === 0) return defaults;

  const overrideMap = new Map(overrides.map((o) => [o.menuItemId, o]));

  return defaults
    .map((item) => {
      const override = overrideMap.get(item.id);
      if (!override) return item;

      // Apply overrides
      return {
        ...item,
        label: override.customLabel || item.label,
        icon: override.customIcon || item.icon,
        sortOrder: override.sortOrder ?? item.sortOrder,
      };
    })
    .filter((item) => {
      const override = overrideMap.get(item.id);
      return override ? override.visible : true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Set a menu override (upsert)
 */
export async function setMenuOverride(override: MenuOverride): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(menuConfig)
    .values({
      menuItemId: override.menuItemId,
      platform: override.platform,
      visible: override.visible,
      customLabel: override.customLabel,
      customIcon: override.customIcon,
      sortOrder: override.sortOrder,
      tenantId: override.tenantId,
    })
    .onConflictDoUpdate({
      target: [menuConfig.menuItemId, menuConfig.platform],
      set: {
        visible: override.visible,
        customLabel: override.customLabel,
        customIcon: override.customIcon,
        sortOrder: override.sortOrder,
        updatedAt: new Date(),
      },
    });
}

/**
 * Reset all overrides for a platform (restore defaults)
 */
export async function resetMenuOverrides(
  platform: Platform,
  tenantId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const conditions = [eq(menuConfig.platform, platform)];
  if (tenantId != null) {
    conditions.push(eq(menuConfig.tenantId, tenantId));
  }

  await db.delete(menuConfig).where(and(...conditions));
}
