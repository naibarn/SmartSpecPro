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
});
