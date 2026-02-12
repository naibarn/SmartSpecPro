import type {
  DocumentAccessSource,
  DocumentScopeTab,
} from "./documentManagementUi";

export interface DocumentEditorTab {
  id: number;
  title: string;
  itemType: string;
  accessSource?: DocumentAccessSource;
  openedFromScope?: DocumentScopeTab;
}

export interface UpsertDocumentEditorTabInput {
  id: number;
  title: string;
  itemType: string;
  accessSource?: DocumentAccessSource;
  openedFromScope?: DocumentScopeTab;
}

export function upsertDocumentEditorTab(
  tabs: DocumentEditorTab[],
  nextTab: UpsertDocumentEditorTabInput,
): DocumentEditorTab[] {
  const existingIndex = tabs.findIndex((tab) => tab.id === nextTab.id);
  if (existingIndex === -1) {
    return [...tabs, { ...nextTab }];
  }

  const existing = tabs[existingIndex];
  const mergedTab: DocumentEditorTab = {
    ...existing,
    ...nextTab,
    accessSource: nextTab.accessSource ?? existing.accessSource,
    openedFromScope: nextTab.openedFromScope ?? existing.openedFromScope,
  };

  if (
    existing.title === mergedTab.title &&
    existing.itemType === mergedTab.itemType &&
    existing.accessSource === mergedTab.accessSource &&
    existing.openedFromScope === mergedTab.openedFromScope
  ) {
    return tabs;
  }

  const next = [...tabs];
  next[existingIndex] = mergedTab;
  return next;
}

export interface CloseDocumentEditorTabResult {
  closed: boolean;
  nextTabs: DocumentEditorTab[];
  nextSelectedId: number | null;
}

interface CloseDocumentEditorTabInput {
  tabs: DocumentEditorTab[];
  selectedId: number | null;
  tabId: number;
  isDirty: (tabId: number) => boolean;
  confirmClose: (tab: DocumentEditorTab) => boolean;
}

export function closeDocumentEditorTab(
  input: CloseDocumentEditorTabInput,
): CloseDocumentEditorTabResult {
  const currentIndex = input.tabs.findIndex((tab) => tab.id === input.tabId);
  if (currentIndex === -1) {
    return {
      closed: false,
      nextTabs: input.tabs,
      nextSelectedId: input.selectedId,
    };
  }

  const tab = input.tabs[currentIndex];
  if (input.isDirty(input.tabId) && !input.confirmClose(tab)) {
    return {
      closed: false,
      nextTabs: input.tabs,
      nextSelectedId: input.selectedId,
    };
  }

  const nextTabs = input.tabs.filter((entry) => entry.id !== input.tabId);
  const nextSelectedId = input.selectedId === input.tabId
    ? (nextTabs[currentIndex]?.id ?? nextTabs[currentIndex - 1]?.id ?? null)
    : input.selectedId;

  return {
    closed: true,
    nextTabs,
    nextSelectedId,
  };
}
