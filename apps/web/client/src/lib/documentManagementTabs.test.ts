import { describe, expect, it, vi } from "vitest";

import {
  closeDocumentEditorTab,
  syncDocumentEditorTabsFromDocuments,
  upsertDocumentEditorTab,
  type DocumentEditorTab,
} from "./documentManagementTabs";

describe("documentManagementTabs", () => {
  it("opens and upserts multiple tabs while keeping unique ids", () => {
    const initial: DocumentEditorTab[] = [];
    const withFirst = upsertDocumentEditorTab(initial, {
      id: 11,
      title: "One.md",
      itemType: "md",
      openedFromScope: "my_library",
    });
    const withSecond = upsertDocumentEditorTab(withFirst, {
      id: 22,
      title: "Two.md",
      itemType: "md",
      openedFromScope: "shared_with_me",
    });
    const updatedFirst = upsertDocumentEditorTab(withSecond, {
      id: 11,
      title: "One-renamed.md",
      itemType: "md",
      accessSource: "owner",
    });

    expect(updatedFirst.map((tab) => tab.id)).toEqual([11, 22]);
    expect(updatedFirst[0].title).toBe("One-renamed.md");
  });

  it("keeps tab open when unsaved warning is rejected", () => {
    const tabs: DocumentEditorTab[] = [
      { id: 11, title: "One.md", itemType: "md" },
      { id: 22, title: "Two.md", itemType: "md" },
    ];
    const confirmClose = vi.fn().mockReturnValue(false);

    const result = closeDocumentEditorTab({
      tabs,
      selectedId: 11,
      tabId: 11,
      isDirty: () => true,
      confirmClose,
    });

    expect(result.closed).toBe(false);
    expect(result.nextTabs).toEqual(tabs);
    expect(result.nextSelectedId).toBe(11);
    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it("closes dirty tab when warning is confirmed and picks next tab", () => {
    const tabs: DocumentEditorTab[] = [
      { id: 11, title: "One.md", itemType: "md" },
      { id: 22, title: "Two.md", itemType: "md" },
      { id: 33, title: "Three.md", itemType: "md" },
    ];
    const confirmClose = vi.fn().mockReturnValue(true);

    const result = closeDocumentEditorTab({
      tabs,
      selectedId: 22,
      tabId: 22,
      isDirty: (tabId) => tabId === 22,
      confirmClose,
    });

    expect(result.closed).toBe(true);
    expect(result.nextTabs.map((tab) => tab.id)).toEqual([11, 33]);
    expect(result.nextSelectedId).toBe(33);
  });

  it("keeps selected tab when closing a different tab", () => {
    const tabs: DocumentEditorTab[] = [
      { id: 11, title: "One.md", itemType: "md" },
      { id: 22, title: "Two.md", itemType: "md" },
      { id: 33, title: "Three.md", itemType: "md" },
    ];

    const result = closeDocumentEditorTab({
      tabs,
      selectedId: 33,
      tabId: 11,
      isDirty: () => false,
      confirmClose: () => true,
    });

    expect(result.closed).toBe(true);
    expect(result.nextTabs.map((tab) => tab.id)).toEqual([22, 33]);
    expect(result.nextSelectedId).toBe(33);
  });

  it("keeps the same tab array when document metadata has not changed", () => {
    const tabs: DocumentEditorTab[] = [
      {
        id: 11,
        title: "One.md",
        itemType: "md",
        accessSource: "owner",
        openedFromScope: "my_library",
      },
      {
        id: 22,
        title: "Two.md",
        itemType: "md",
        accessSource: "shared_direct",
        openedFromScope: "shared_with_me",
      },
    ];

    const documents = [
      {
        id: 11,
        title: "One.md",
        item_type: "md",
        access_source: "owner" as const,
      },
      {
        id: 22,
        title: "Two.md",
        item_type: "md",
        access_source: "shared_direct" as const,
      },
    ];

    const nextTabs = syncDocumentEditorTabsFromDocuments(tabs, documents);

    expect(nextTabs).toBe(tabs);
  });

  it("updates only the tabs whose document metadata changed", () => {
    const tabs: DocumentEditorTab[] = [
      {
        id: 11,
        title: "One.md",
        itemType: "md",
        accessSource: "owner",
        openedFromScope: "my_library",
      },
      {
        id: 22,
        title: "Two.md",
        itemType: "md",
        accessSource: "shared_direct",
        openedFromScope: "shared_with_me",
      },
    ];

    const documents = [
      {
        id: 11,
        title: "One (renamed).md",
        item_type: "md",
        access_source: "owner" as const,
      },
      {
        id: 22,
        title: "Two.md",
        item_type: "md",
        access_source: "shared_direct" as const,
      },
    ];

    const nextTabs = syncDocumentEditorTabsFromDocuments(tabs, documents);

    expect(nextTabs).not.toBe(tabs);
    expect(nextTabs[0]).not.toBe(tabs[0]);
    expect(nextTabs[1]).toBe(tabs[1]);
    expect(nextTabs[0].title).toBe("One (renamed).md");
  });
});
