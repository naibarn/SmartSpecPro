import { describe, it, expect, vi } from "vitest";
import { Sparkles } from "lucide-react";

vi.mock("@smartspec/shared", async () => {
  const actual = await vi.importActual<typeof import("@smartspec/shared")>("@smartspec/shared");
  return {
    ...actual,
    detectPlatform: vi.fn(() => "web"),
  };
});

import { getResolvedMenuItems } from "../useMenuItems";

describe("useMenuItems", () => {
  it("resolves Private Files with the Lock icon instead of the fallback icon", () => {
    const items = getResolvedMenuItems("user", "main");
    const privateFiles = items.find((item) => item.id === "private-files");

    expect(privateFiles).toBeDefined();
    expect(privateFiles?.path).toBe("/document-management?scope=private_vault&sort=updated_desc");
    expect(privateFiles?.IconComponent).not.toBe(Sparkles);
  });

  it("shows Work OS in the admin sidebar for admin users", () => {
    const items = getResolvedMenuItems("admin", "admin");
    const workOs = items.find((item) => item.id === "admin-work-os");

    expect(workOs).toBeDefined();
    expect(workOs?.path).toBe("/admin/work-os");
    expect(workOs?.label).toBe("Work OS");
  });

  it("routes skill revenue to the system report for system admins", () => {
    const items = getResolvedMenuItems("admin", "admin");
    expect(items.find((item) => item.id === "admin-skill-revenue")?.path).toBe("/admin/skill-revenue");
  });

  it("routes tenant admins to the tenant-scoped skill revenue report", () => {
    const items = getResolvedMenuItems("domain_admin", "domain-admin");
    expect(items.find((item) => item.id === "domain-skill-revenue")?.path).toBe("/domain-admin/skill-revenue");
    expect(getResolvedMenuItems("user", "domain-admin").find((item) => item.id === "domain-skill-revenue")).toBeUndefined();
  });

  it("shows Start Work in the main sidebar for regular users", () => {
    const items = getResolvedMenuItems("user", "main");
    const workRequest = items.find((item) => item.id === "work-request");

    expect(workRequest).toBeDefined();
    expect(workRequest?.path).toBe("/work/request");
    expect(workRequest?.label).toBe("Start Work");
  });

  it("shows workpack shortcuts in the main sidebar for regular users", () => {
    const items = getResolvedMenuItems("user", "main");

    expect(items.find((item) => item.id === "workpack-intake")?.path).toBe("/workpacks/intake");
    expect(items.find((item) => item.id === "workpack-discovery")?.path).toBe("/workpacks/discovery");
    expect(items.find((item) => item.id === "workpack-roi")?.path).toBe("/workpacks/roi");
    expect(items.find((item) => item.id === "workpack-exceptions")?.path).toBe("/workpacks/exceptions");
  });

  it("gates Vertical Drama Series on the verticalDramaSeriesDashboardMenu flag", () => {
    // Flag OFF -> the Dashboard menu entry is hidden.
    const hidden = getResolvedMenuItems("user", "main", undefined, {
      verticalDramaSeriesDashboardMenu: false,
    });
    expect(hidden.find((item) => item.id === "vertical-drama-series")).toBeUndefined();

    // Flag ON -> the entry renders with its route + Clapperboard (non-fallback) icon.
    const shown = getResolvedMenuItems("user", "main", undefined, {
      verticalDramaSeriesDashboardMenu: true,
    });
    const entry = shown.find((item) => item.id === "vertical-drama-series");
    expect(entry).toBeDefined();
    expect(entry?.path).toBe("/drama-series");
    expect(entry?.IconComponent).not.toBe(Sparkles);
  });

  it("places Render Jobs directly after Media History in the main sidebar", () => {
    const items = getResolvedMenuItems("user", "main");
    const mediaHistoryIndex = items.findIndex((item) => item.id === "media-history");
    const renderJobsIndex = items.findIndex((item) => item.id === "render-jobs");

    expect(mediaHistoryIndex).toBeGreaterThanOrEqual(0);
    expect(renderJobsIndex).toBe(mediaHistoryIndex + 1);
    expect(items[renderJobsIndex]?.path).toBe("/render-jobs");
  });
});
