import { describe, it, expect } from "vitest";
import { getMenuItemsByGroup } from "@smartspec/shared";

describe("Private Files menu entry", () => {
  it("appears in the main menu for web users as a free shared menu item", () => {
    const items = getMenuItemsByGroup("web", "user", "main");
    const item = items.find((menuItem) => menuItem.id === "private-files");

    expect(item).toBeDefined();
    expect(item?.label).toBe("Private Files");
    expect(item?.path).toBe("/document-management?scope=private_vault&sort=updated_desc");
    expect(item?.icon).toBe("Lock");
    expect(item?.parentId).toBe("document-management");
  });

  it("keeps Library in the documents section", () => {
    const items = getMenuItemsByGroup("web", "user", "main");
    const item = items.find((menuItem) => menuItem.id === "document-management");

    expect(item).toBeDefined();
    expect(item?.section).toBe("documents");
  });

  it("exposes workpack entries in the main menu", () => {
    const items = getMenuItemsByGroup("web", "user", "main");

    expect(items.find((menuItem) => menuItem.id === "workpack-intake")?.path).toBe("/workpacks/intake");
    expect(items.find((menuItem) => menuItem.id === "workpack-discovery")?.path).toBe("/workpacks/discovery");
    expect(items.find((menuItem) => menuItem.id === "workpack-roi")?.path).toBe("/workpacks/roi");
    expect(items.find((menuItem) => menuItem.id === "workpack-exceptions")?.path).toBe("/workpacks/exceptions");
  });

  it("exposes storyboard review next to Media Studio in the main menu", () => {
    const items = getMenuItemsByGroup("web", "user", "main");
    const mediaIndex = items.findIndex((menuItem) => menuItem.id === "media");
    const storyboardIndex = items.findIndex((menuItem) => menuItem.id === "storyboard-review");
    const storyboardItem = items[storyboardIndex];

    expect(storyboardItem).toBeDefined();
    expect(storyboardItem?.path).toBe("/storyboard-review");
    expect(storyboardItem?.icon).toBe("Film");
    expect(storyboardIndex).toBeGreaterThan(mediaIndex);
  });
});
