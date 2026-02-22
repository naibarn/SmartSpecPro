import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  FilePlus2,
  FileText,
  FolderOpen,
  ImagePlus,
  Info,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Upload,
  Video,
  X,
} from "lucide-react";

import DocumentGridList from "@/components/library/DocumentGridList";
import DocumentLibraryTabs from "@/components/library/DocumentLibraryTabs";
import DocumentPreviewPanel from "@/components/library/DocumentPreviewPanel";
import GoogleDriveBrowser from "@/components/library/GoogleDriveBrowser";
import OneDriveBrowser from "@/components/library/OneDriveBrowser";
import { TrashPanel } from "@/components/library/TrashPanel";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildDocumentQueryString,
  DEFAULT_DOCUMENT_QUERY_STATE,
  DOCUMENT_MANAGEMENT_ROUTE,
  parseDocumentQueryState,
  resolveDocumentPreviewType,
  type DocumentLibraryItem,
  type DocumentQueryState,
} from "@/lib/documentManagementUi";
import { getEditorOpenRouteForItem } from "@/lib/presentationRouting";
import {
  closeDocumentEditorTab,
  upsertDocumentEditorTab,
  type DocumentEditorTab,
} from "@/lib/documentManagementTabs";
import { trpc } from "@/lib/trpc";

interface MarkdownDraftState {
  value: string;
  savedValue: string;
  updatedAt?: string;
}

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1280px)";
const MIN_LIBRARY_PANEL_WIDTH = 320;
const MIN_PREVIEW_PANEL_WIDTH = 320;
const MIN_EDITOR_PANEL_WIDTH = 420;
const COLLAPSED_PANEL_WIDTH = 72;
const RESIZE_HANDLE_WIDTH = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function DocumentManagement() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const editorWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const desktopLayoutRef = useRef<HTMLDivElement | null>(null);
  const activeResizeRef = useRef<{
    panel: "library" | "preview";
    startX: number;
    startLibraryWidth: number;
    startPreviewWidth: number;
    containerWidth: number;
    libraryOpenAtStart: boolean;
    previewOpenAtStart: boolean;
  } | null>(null);

  const [queryState, setQueryState] = useState<DocumentQueryState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_DOCUMENT_QUERY_STATE;
    }
    return {
      ...DEFAULT_DOCUMENT_QUERY_STATE,
      ...parseDocumentQueryState(window.location.search),
    };
  });
  const [debouncedQuery, setDebouncedQuery] = useState(queryState.query);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return parseDocumentQueryState(window.location.search).docId ?? null;
  });
  const [pendingAutoSelectId, setPendingAutoSelectId] = useState<number | null>(null);
  const [provisionalSelectedItem, setProvisionalSelectedItem] = useState<DocumentLibraryItem | null>(null);
  const [markdownDraftByDocId, setMarkdownDraftByDocId] = useState<Record<number, MarkdownDraftState>>({});
  const [markdownError, setMarkdownError] = useState<string | undefined>(undefined);
  const [previewText, setPreviewText] = useState<string | undefined>(undefined);
  const [isLibraryPanelOpen, setIsLibraryPanelOpen] = useState(true);
  const [isMarkdownPreviewPanelOpen, setIsMarkdownPreviewPanelOpen] = useState(true);
  const [isEditorPanelCollapsed, setIsEditorPanelCollapsed] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
  });
  const [libraryPanelWidth, setLibraryPanelWidth] = useState(440);
  const [previewPanelWidth, setPreviewPanelWidth] = useState(430);
  const [importingDriveFileId, setImportingDriveFileId] = useState<string | null>(null);
  const [openEditorTabs, setOpenEditorTabs] = useState<DocumentEditorTab[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const parsed = parseDocumentQueryState(window.location.search);
    if (parsed.viewMode !== "editor" || !parsed.docId) {
      return [];
    }
    return [{
      id: parsed.docId,
      title: `Document ${parsed.docId}`,
      itemType: "document",
    }];
  });
  const isEditorMode = true;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const applyLayout = (matches: boolean) => setIsDesktopLayout(matches);
    applyLayout(media.matches);
    const listener = (event: MediaQueryListEvent) => applyLayout(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    setQueryState((prev) => (
      prev.viewMode === "editor"
        ? prev
        : { ...prev, viewMode: "editor" }
    ));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryState.query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryState.query]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryString = buildDocumentQueryString(queryState);
    const nextUrl = `${DOCUMENT_MANAGEMENT_ROUTE}?${queryString}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl === nextUrl) return;

    const shouldPushHistory = queryState.viewMode === "editor" && Boolean(queryState.docId);
    window.history[shouldPushHistory ? "pushState" : "replaceState"](
      window.history.state,
      "",
      nextUrl,
    );
  }, [queryState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const parsed = {
        ...DEFAULT_DOCUMENT_QUERY_STATE,
        ...parseDocumentQueryState(window.location.search),
      };
      setQueryState(parsed);
      setDebouncedQuery(parsed.query);
      setSelectedId(parsed.docId ?? null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const nextDocId = queryState.viewMode === "editor" ? (selectedId ?? undefined) : undefined;
    setQueryState((prev) => {
      if (prev.docId === nextDocId) {
        return prev;
      }
      return {
        ...prev,
        docId: nextDocId,
      };
    });
  }, [selectedId, queryState.viewMode]);

  const shouldListDocuments = queryState.scope !== "trash" && queryState.scope !== "my_drive" && queryState.scope !== "my_onedrive";
  const listScope = queryState.scope === "trash" || queryState.scope === "my_drive" || queryState.scope === "my_onedrive"
    ? "my_library"
    : queryState.scope;
  const listInput = useMemo(() => ({
    scope: listScope,
    sort: queryState.sort,
    query: debouncedQuery || undefined,
    limit: 50,
    offset: 0,
    filters: {
      itemType: queryState.itemType || undefined,
      status: queryState.status as any,
    },
  }), [debouncedQuery, listScope, queryState.sort, queryState.itemType, queryState.status]);

  const { data: documentData, isLoading: listLoading, error: listError } = trpc.library.listDocuments.useQuery(listInput, {
    enabled: shouldListDocuments,
  });
  const documents = shouldListDocuments
    ? (documentData?.results || []) as DocumentLibraryItem[]
    : [];
  const selectedFromList = selectedId ? (documents.find((item) => item.id === selectedId) || null) : null;
  const selectedNeedsDirectFetch = Boolean(selectedId && !selectedFromList && !provisionalSelectedItem);
  const selectedItemQuery = trpc.library.getItem.useQuery(
    { id: selectedId || 0 },
    { enabled: selectedNeedsDirectFetch },
  );
  const selectedFromQuery = selectedItemQuery.data
    ? toProvisionalDocumentItem(selectedItemQuery.data as any)
    : null;
  const selectedItem = selectedFromList
    || (provisionalSelectedItem && provisionalSelectedItem.id === selectedId ? provisionalSelectedItem : null)
    || selectedFromQuery;
  const previewType = selectedItem ? resolveDocumentPreviewType(selectedItem) : "fallback";
  const selectedMarkdownDraft = selectedItem ? markdownDraftByDocId[selectedItem.id] : undefined;
  const markdownContentQuery = trpc.library.getMarkdownContent.useQuery(
    { id: selectedItem?.id || 0 },
    {
      enabled: Boolean(selectedItem && previewType === "markdown"),
      // Prevent window-focus events (e.g. from screen-capture hotkeys) from
      // overwriting the local draft state with potentially stale server data.
      refetchOnWindowFocus: false,
    },
  );
  const activeMarkdownValue = selectedMarkdownDraft?.value ?? markdownContentQuery.data?.content ?? "";

  const saveMarkdownMutation = trpc.library.saveMarkdown.useMutation();
  const uploadFileMutation = trpc.library.uploadFile.useMutation();
  const createItemMutation = trpc.library.createItem.useMutation();
  const createPresentationDeckMutation = trpc.presentation.createDeck.useMutation();
  const updateItemMutation = trpc.library.updateItem.useMutation();
  const deleteItemMutation = trpc.library.deleteItem.useMutation();
  const importDriveFileMutation = trpc.googleDrive.importDriveFile.useMutation();

  function isEditorTabDirty(tabId: number): boolean {
    const draft = markdownDraftByDocId[tabId];
    if (!draft) return false;
    return draft.value !== draft.savedValue;
  }

  const hasUnsavedTabs = useMemo(
    () => openEditorTabs.some((tab) => isEditorTabDirty(tab.id)),
    [openEditorTabs, markdownDraftByDocId],
  );

  useEffect(() => {
    if (!hasUnsavedTabs || typeof window === "undefined") {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedTabs]);

  function normalizeDateIso(value: unknown): string {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date().toISOString();
  }

  function toProvisionalDocumentItem(item: any): DocumentLibraryItem {
    return {
      id: Number(item?.id),
      item_type: String(item?.itemType ?? item?.item_type ?? "md"),
      title: String(item?.title ?? "Untitled"),
      source: String(item?.source ?? "document_management"),
      source_url: item?.sourceUrl ?? item?.source_url ?? null,
      thumbnail_url: item?.thumbnailUrl ?? item?.thumbnail_url ?? null,
      metadata: (item?.metadata ?? {}) as Record<string, unknown>,
      access_source: "owner",
      status: String(item?.status ?? "ready") as DocumentLibraryItem["status"],
      updated_at: normalizeDateIso(item?.updatedAt ?? item?.updated_at),
      created_at: normalizeDateIso(item?.createdAt ?? item?.created_at),
    };
  }

  function upsertEditorTab(
    item: Pick<DocumentLibraryItem, "id" | "title" | "item_type"> & Partial<Pick<DocumentLibraryItem, "access_source">>,
    options?: { openedFromScope?: DocumentQueryState["scope"] },
  ) {
    setOpenEditorTabs((prev) => upsertDocumentEditorTab(prev, {
        id: item.id,
        title: item.title || `Document ${item.id}`,
        itemType: item.item_type || "document",
        accessSource: item.access_source,
        openedFromScope: options?.openedFromScope,
      }));
  }

  function openEditorTab(
    item: Pick<DocumentLibraryItem, "id" | "title" | "item_type"> & Partial<Pick<DocumentLibraryItem, "access_source">>,
    options?: { scope?: DocumentQueryState["scope"] },
  ) {
    const openTarget = getEditorOpenRouteForItem({
      id: item.id,
      item_type: item.item_type,
    });
    if (openTarget.kind === "presentation") {
      setLocation(openTarget.href);
      return;
    }

    upsertEditorTab(item, { openedFromScope: options?.scope });
    setIsLibraryPanelOpen(true);
    setSelectedId(item.id);
    setQueryState((prev) => ({
      ...prev,
      ...(options?.scope ? { scope: options.scope } : {}),
      viewMode: "editor",
      docId: item.id,
    }));
    window.setTimeout(() => {
      if (typeof window !== "undefined" && window.innerWidth < 1400) {
        editorWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  }

  function activateEditorTab(tabId: number) {
    setSelectedId(tabId);
    setQueryState((prev) => ({
      ...prev,
      viewMode: "editor",
      docId: tabId,
    }));
  }

  function closeEditorTab(tabId: number) {
    const closeResult = closeDocumentEditorTab({
      tabs: openEditorTabs,
      selectedId,
      tabId,
      isDirty: isEditorTabDirty,
      confirmClose: (tab) => window.confirm(`"${tab.title}" has unsaved changes. Close without saving?`),
    });

    if (!closeResult.closed) {
      return;
    }

    setOpenEditorTabs(closeResult.nextTabs);
    setMarkdownDraftByDocId((prev) => {
      if (!prev[tabId]) return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });

    if (selectedId === tabId) {
      setSelectedId(closeResult.nextSelectedId);
      setQueryState((state) => ({
        ...state,
        viewMode: closeResult.nextSelectedId ? "editor" : "library",
        docId: closeResult.nextSelectedId ?? undefined,
      }));
    }
  }

  useEffect(() => {
    if (!documents.length) {
      if (!pendingAutoSelectId && !isEditorMode) {
        setSelectedId(null);
      }
      return;
    }

    if (pendingAutoSelectId) {
      if (documents.some((item) => item.id === pendingAutoSelectId)) {
        setSelectedId(pendingAutoSelectId);
        setPendingAutoSelectId(null);
        setProvisionalSelectedItem(null);
        return;
      }
    }

    if (!selectedId && !isEditorMode) {
      setSelectedId(documents[0].id);
      return;
    }

    if (!isEditorMode && !documents.some((item) => item.id === selectedId)) {
      setSelectedId(documents[0].id);
    }
  }, [documents, selectedId, pendingAutoSelectId, isEditorMode]);

  useEffect(() => {
    if (!isEditorMode || !selectedId) {
      return;
    }
    if (selectedItem) {
      upsertEditorTab(selectedItem);
      return;
    }
    upsertEditorTab({
      id: selectedId,
      title: `Document ${selectedId}`,
      item_type: "document",
    });
  }, [isEditorMode, selectedId, selectedItem]);

  useEffect(() => {
    if (!documents.length) {
      return;
    }
    const byId = new Map(documents.map((item) => [item.id, item]));
      setOpenEditorTabs((prev) => prev.map((tab) => {
        const matched = byId.get(tab.id);
        if (!matched) {
          return tab;
        }
      if (
        tab.title === matched.title &&
        tab.itemType === matched.item_type &&
        tab.accessSource === matched.access_source
      ) {
        return tab;
      }
      return {
        ...tab,
        title: matched.title,
        itemType: matched.item_type,
        accessSource: matched.access_source,
      };
    }));
  }, [documents]);

  function getEditorTabScopeLabel(tab: DocumentEditorTab): string {
    if (tab.accessSource === "owner") return "My Library";
    if (tab.accessSource === "shared_direct") return "Shared With Me";
    if (tab.accessSource === "shared_group") return "My Group";
    if (tab.openedFromScope === "my_drive") return "My Drive";
    if (tab.openedFromScope === "my_onedrive") return "OneDrive";
    if (tab.openedFromScope === "shared_with_me") return "Shared With Me";
    if (tab.openedFromScope === "shared_groups") return "My Group";
    return "My Library";
  }

  function getCurrentScopeLabel(scope: DocumentQueryState["scope"]): string {
    if (scope === "my_drive") return "My Drive";
    if (scope === "my_onedrive") return "OneDrive";
    if (scope === "shared_with_me") return "Shared With Me";
    if (scope === "shared_groups") return "My Group";
    if (scope === "trash") return "Trash";
    return "My Library";
  }

  useEffect(() => {
    if (previewType !== "markdown") {
      setMarkdownError(undefined);
      return;
    }
    if (!selectedItem || !markdownContentQuery.data) {
      return;
    }

    const incomingContent = markdownContentQuery.data.content || "";
    const incomingUpdatedAt = markdownContentQuery.data.updated_at || selectedItem.updated_at;
    const docId = selectedItem.id;

    setMarkdownDraftByDocId((prev) => {
      const current = prev[docId];
      if (!current) {
        return {
          ...prev,
          [docId]: {
            value: incomingContent,
            savedValue: incomingContent,
            updatedAt: incomingUpdatedAt,
          },
        };
      }

      const isDirty = current.value !== current.savedValue;
      if (isDirty) {
        return prev;
      }

      if (current.savedValue === incomingContent && current.updatedAt === incomingUpdatedAt) {
        return prev;
      }

      // Never overwrite a known-good (non-empty) saved draft with empty server
      // data.  This can happen if the server refetches during a transient state
      // (e.g. mid-indexing race) and would silently wipe the local draft.
      if (!incomingContent.trim() && current.savedValue.trim()) {
        return prev;
      }

      return {
        ...prev,
        [docId]: {
          ...current,
          value: incomingContent,
          savedValue: incomingContent,
          updatedAt: incomingUpdatedAt,
        },
      };
    });
  }, [previewType, selectedItem, markdownContentQuery.data]);

  useEffect(() => {
    if (!selectedItem) {
      setPreviewText(undefined);
      return;
    }

    if (!["text", "json", "html", "code", "csv", "xml"].includes(previewType) || !selectedItem.source_url) {
      setPreviewText(undefined);
      return;
    }

    let cancelled = false;
    fetch(selectedItem.source_url)
      .then((response) => response.text())
      .then((text) => {
        if (cancelled) return;
        setPreviewText(text.slice(0, 80_000));
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewText(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [previewType, selectedItem]);

  async function handleSaveMarkdown() {
    if (!selectedItem || previewType !== "markdown") return;
    const selectedItemId = selectedItem.id;
    const draft = markdownDraftByDocId[selectedItemId];
    const contentToSave = draft?.value ?? "";

    // Safety guard: refuse to persist an empty document.  This prevents data
    // loss if an external hotkey (e.g. screen-capture) clears the editor state
    // and a save is somehow triggered before the user notices.
    if (!contentToSave.trim()) {
      toast.error("Cannot save an empty document. Please enter content first.");
      return;
    }
    const expectedUpdatedAt = new Date(draft?.updatedAt ?? selectedItem.updated_at);

    async function applySuccessResult(result: Awaited<ReturnType<typeof saveMarkdownMutation.mutateAsync>>) {
      const updatedItem = toProvisionalDocumentItem(result.item);
      setProvisionalSelectedItem(updatedItem);
      upsertEditorTab(updatedItem);
      setMarkdownDraftByDocId((prev) => ({
        ...prev,
        [updatedItem.id]: {
          value: contentToSave,
          savedValue: contentToSave,
          updatedAt: updatedItem.updated_at,
        },
      }));
      setSelectedId(updatedItem.id);
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getMarkdownContent.invalidate({ id: selectedItemId }),
      ]);
    }

    try {
      setMarkdownError(undefined);
      const result = await saveMarkdownMutation.mutateAsync({
        id: selectedItemId,
        content: contentToSave,
        expectedUpdatedAt,
      });
      toast.success("Markdown saved. Re-indexing started.");
      await applySuccessResult(result);
    } catch (error) {
      // Version conflict from system updates (index job). Retry without version check.
      const isVersionConflict = error instanceof Error && error.message.toLowerCase().includes("version conflict");
      if (isVersionConflict) {
        try {
          const retryResult = await saveMarkdownMutation.mutateAsync({
            id: selectedItemId,
            content: contentToSave,
          });
          toast.success("Markdown saved. Re-indexing started.");
          await applySuccessResult(retryResult);
          return;
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : "Failed to save markdown";
          setMarkdownError(retryMessage);
          toast.error(retryMessage);
          return;
        }
      }
      const message = error instanceof Error ? error.message : "Failed to save markdown";
      setMarkdownError(message);
      toast.error(message);
    }
  }

  async function handleVersionRestore() {
    if (!selectedItem) return;
    // Invalidate markdown content to re-fetch restored version
    await Promise.all([
      trpcUtils.library.getMarkdownContent.invalidate({ id: selectedItem.id }),
      trpcUtils.library.listDocuments.invalidate(),
    ]);
    // Clear draft so it picks up the server content
    setMarkdownDraftByDocId((prev) => {
      const next = { ...prev };
      delete next[selectedItem.id];
      return next;
    });
  }

  async function handleDeleteItem(item: DocumentLibraryItem) {
    try {
      await deleteItemMutation.mutateAsync({ id: item.id });
      toast.success(`"${item.title}" moved to trash.`);
      await trpcUtils.library.listDocuments.invalidate();
      // Close the tab if this item is currently open
      const tabOpen = openEditorTabs.some((t) => t.id === item.id);
      if (tabOpen) {
        closeEditorTab(item.id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to move item to trash",
      );
    }
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImportFromDrive(fileId: string) {
    try {
      setImportingDriveFileId(fileId);
      const result = await importDriveFileMutation.mutateAsync({ fileId });
      const provisionalItem = toProvisionalDocumentItem(result.item as any);

      setMarkdownError(undefined);
      setPendingAutoSelectId(provisionalItem.id);
      setSelectedId(provisionalItem.id);
      setProvisionalSelectedItem(provisionalItem);
      openEditorTab(provisionalItem, { scope: "my_library" });
      setQueryState((prev) => ({
        ...prev,
        scope: "my_library",
      }));

      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: provisionalItem.id }),
      ]);

      toast.success(`Imported "${provisionalItem.title}" from Google Drive.`);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to import file from Google Drive";
      toast.error(message);
    } finally {
      setImportingDriveFileId(null);
    }
  }

  async function handleUploadFile(file: File) {
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await uploadFileMutation.mutateAsync({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileBase64,
        title: file.name,
      });

      toast.success("File uploaded to library. Indexing started.");
      setQueryState((prev) => ({ ...prev, scope: "my_library" }));
      setPendingAutoSelectId(result.item.id);
      setSelectedId(result.item.id);
      setProvisionalSelectedItem(toProvisionalDocumentItem(result.item));
      await trpcUtils.library.listDocuments.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  async function handleCreateNewDocument() {
    try {
      const now = new Date();
      const title = `New Document ${now.toLocaleString()}`;
      const createResult = await createItemMutation.mutateAsync({
        itemType: "md",
        source: "document_management",
        title,
        description: "Markdown document",
        status: "indexing",
        visibility: "private",
        metadata: {
          extension: "md",
          file_type: "text/markdown",
          source_type: "markdown_document",
        },
      });

      const initialContent = `# ${title}\n\n`;
      const saveResult = await saveMarkdownMutation.mutateAsync({
        id: createResult.item.id,
        content: initialContent,
      });

      setMarkdownError(undefined);
      setDebouncedQuery("");
      setQueryState((prev) => ({
        ...prev,
        scope: "my_library",
      }));
      setPendingAutoSelectId(createResult.item.id);
      const provisionalItem = toProvisionalDocumentItem(saveResult.item ?? createResult.item);
      setMarkdownDraftByDocId((prev) => ({
        ...prev,
        [provisionalItem.id]: {
          value: initialContent,
          savedValue: initialContent,
          updatedAt: provisionalItem.updated_at,
        },
      }));
      setProvisionalSelectedItem(provisionalItem);
      openEditorTab(provisionalItem, { scope: "my_library" });
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getMarkdownContent.invalidate({ id: createResult.item.id }),
      ]);
      window.setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      toast.success("New markdown document created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create document");
    }
  }

  async function handleCreateNewPresentation() {
    try {
      const now = new Date();
      const title = `New Presentation ${now.toLocaleString()}`;
      const createResult = await createItemMutation.mutateAsync({
        itemType: "presentation",
        source: "document_management",
        title,
        description: "Presentation deck",
        status: "ready",
        visibility: "private",
        metadata: {
          extension: "presentation",
          source_type: "presentation_document",
        },
      });

      let deckInitialized = true;
      try {
        await createPresentationDeckMutation.mutateAsync({
          libraryItemId: createResult.item.id,
          title: createResult.item.title || title,
        });
      } catch {
        deckInitialized = false;
      }

      setDebouncedQuery("");
      setQueryState((prev) => ({
        ...prev,
        scope: "my_library",
      }));
      setPendingAutoSelectId(createResult.item.id);
      const provisionalItem = toProvisionalDocumentItem(createResult.item);
      setProvisionalSelectedItem(provisionalItem);
      openEditorTab(provisionalItem, { scope: "my_library" });
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: createResult.item.id }),
      ]);
      toast.success(
        deckInitialized
          ? "New presentation created."
          : "New presentation created. Deck will initialize on open.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create presentation");
    }
  }

  async function handleRenameDocument(nextTitle: string) {
    if (!selectedItem) return;

    const title = nextTitle.trim();
    if (!title || title === selectedItem.title) {
      return;
    }

    try {
      const updated = await updateItemMutation.mutateAsync({
        id: selectedItem.id,
        title,
      });
      const provisionalUpdated = toProvisionalDocumentItem(updated);
      setProvisionalSelectedItem(provisionalUpdated);
      upsertEditorTab(provisionalUpdated);
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: selectedItem.id }),
      ]);
      toast.success("Document renamed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename document");
    }
  }

  const isPreviewFullWidth = isPreviewExpanded || (!isLibraryPanelOpen && isEditorPanelCollapsed);

  function stopHorizontalResizeSession() {
    activeResizeRef.current = null;
    if (typeof document !== "undefined") {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }

  function beginHorizontalResize(panel: "library" | "preview", event: ReactMouseEvent<HTMLDivElement>) {
    if (!isDesktopLayout) return;
    const container = desktopLayoutRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    activeResizeRef.current = {
      panel,
      startX: event.clientX,
      startLibraryWidth: libraryPanelWidth,
      startPreviewWidth: previewPanelWidth,
      containerWidth: rect.width,
      libraryOpenAtStart: isLibraryPanelOpen,
      previewOpenAtStart: isMarkdownPreviewPanelOpen,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const session = activeResizeRef.current;
      if (!session || !isDesktopLayout) return;

      const deltaX = event.clientX - session.startX;
      const containerWidth = session.containerWidth;

      if (session.panel === "library") {
        const previewWidth = session.previewOpenAtStart
          ? session.startPreviewWidth
          : COLLAPSED_PANEL_WIDTH;
        const maxLibraryWidth = Math.max(
          MIN_LIBRARY_PANEL_WIDTH,
          containerWidth - previewWidth - MIN_EDITOR_PANEL_WIDTH - RESIZE_HANDLE_WIDTH * 2,
        );
        const nextLibraryWidth = clamp(
          session.startLibraryWidth + deltaX,
          MIN_LIBRARY_PANEL_WIDTH,
          maxLibraryWidth,
        );
        setLibraryPanelWidth(nextLibraryWidth);
        return;
      }

      const libraryWidth = session.libraryOpenAtStart
        ? session.startLibraryWidth
        : COLLAPSED_PANEL_WIDTH;
      const maxPreviewWidth = Math.max(
        MIN_PREVIEW_PANEL_WIDTH,
        containerWidth - libraryWidth - MIN_EDITOR_PANEL_WIDTH - RESIZE_HANDLE_WIDTH * 2,
      );
      const nextPreviewWidth = clamp(
        session.startPreviewWidth - deltaX,
        MIN_PREVIEW_PANEL_WIDTH,
        maxPreviewWidth,
      );
      setPreviewPanelWidth(nextPreviewWidth);
    };

    const handleMouseUp = () => stopHorizontalResizeSession();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", handleMouseUp);
      stopHorizontalResizeSession();
    };
  }, [isDesktopLayout]);

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/50 to-cyan-50/40">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Document Management</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage personal and shared RAG files with preview and markdown editing.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadFileMutation.isPending}
              >
                <ImagePlus className="mr-1 h-4 w-4" />
                Upload Image
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadFileMutation.isPending}
              >
                <Video className="mr-1 h-4 w-4" />
                Upload Video
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadFileMutation.isPending}
              >
                <Upload className="mr-1 h-4 w-4" />
                Upload File
              </Button>
              <Button
                size="sm"
                onClick={handleCreateNewDocument}
                disabled={createItemMutation.isPending || saveMarkdownMutation.isPending}
              >
                <FilePlus2 className="mr-1 h-4 w-4" />
                New Document
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCreateNewPresentation}
                disabled={createItemMutation.isPending || createPresentationDeckMutation.isPending}
              >
                <FilePlus2 className="mr-1 h-4 w-4" />
                New Presentation
              </Button>
            </div>
          </div>
        </div>
      </header>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          await handleUploadFile(file);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          await handleUploadFile(file);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.md,.markdown,.txt,.csv,.json,.html,.htm,.xml,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp3,.wav,.m4a,.ogg"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          await handleUploadFile(file);
        }}
      />

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {/* File Type Support Information Banner */}
        <div className="mb-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
              <Info className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sky-900">
                Total: 70+ file types with native preview!
              </h3>
              <p className="mt-1 text-sm text-sky-800">
                <span className="font-medium">Documents:</span> PDF, Markdown, Word, PowerPoint, Excel, CSV, JSON, XML, HTML
                {" • "}
                <span className="font-medium">Media:</span> Images (PNG, JPG, WebP, SVG), Videos (MP4, WebM, MOV), Audio (MP3, WAV, M4A)
                {" • "}
                <span className="font-medium">Code:</span> JavaScript, TypeScript, Python, Java, C++, Go, Rust, PHP, SQL, YAML
                {" • "}
                and many more...
              </p>
            </div>
          </div>
        </div>

        <div
          ref={desktopLayoutRef}
          className="flex flex-col gap-4 xl:h-[calc(100vh-140px)] xl:flex-row"
        >
          {isLibraryPanelOpen ? (
            <aside
              ref={previewSectionRef}
              className="flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 shadow-md transition-all duration-300 xl:min-h-0 xl:shrink-0"
              style={isDesktopLayout ? { width: `${libraryPanelWidth}px` } : undefined}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-slate-900">Library</div>
                  <div className="text-xs text-slate-500">
                    Browse files and open in editor tabs
                    {" "}({documents.length} items{listLoading ? ", loading..." : ""}{listError ? `, error: ${listError.message}` : ""})
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-slate-300 bg-slate-50 text-[11px]">
                    {getCurrentScopeLabel(queryState.scope)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                    onClick={() => setIsLibraryPanelOpen(false)}
                    title="Collapse library panel"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4">
                <DocumentLibraryTabs
                  value={queryState.scope}
                  onChange={(scope) => setQueryState((prev) => ({ ...prev, scope }))}
                />
              </div>

              {queryState.scope === "trash" ? (
                <div className="min-h-[200px] max-h-[50vh] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
                  <TrashPanel />
                </div>
              ) : queryState.scope === "my_drive" ? (
                <div className="min-h-[200px] max-h-[70vh] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
                  <GoogleDriveBrowser
                    onImportFile={handleImportFromDrive}
                    importingFileId={importingDriveFileId}
                  />
                </div>
              ) : queryState.scope === "my_onedrive" ? (
                <div className="min-h-[200px] max-h-[70vh] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
                  <OneDriveBrowser
                    onImportFile={handleImportFromDrive}
                    importingFileId={importingDriveFileId}
                  />
                </div>
              ) : (
                <>
                  <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-11 rounded-xl border-slate-300 bg-white pl-9"
                        placeholder="Search files..."
                        value={queryState.query}
                        onChange={(event) => setQueryState((prev) => ({ ...prev, query: event.target.value }))}
                      />
                    </div>
                    <Select
                      value={queryState.sort}
                      onValueChange={(value) => setQueryState((prev) => ({ ...prev, sort: value as DocumentQueryState["sort"] }))}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="updated_desc">Newest updated first</SelectItem>
                        <SelectItem value="created_desc">Newest created first</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="overflow-y-auto xl:h-[1000px]">
                    {listError && (
                      <div className="text-sm text-destructive px-4 py-2 mb-2 rounded bg-destructive/10">
                        Failed to load documents: {listError.message}
                      </div>
                    )}
                    <DocumentGridList
                      items={documents}
                      selectedId={selectedId}
                      isLoading={listLoading}
                      className="h-auto"
                      emptyMessage="No documents match the selected scope and filters."
                      onSelect={(item) => {
                        setPendingAutoSelectId(null);
                        setProvisionalSelectedItem(null);
                        openEditorTab(item, { scope: queryState.scope });
                      }}
                      onOpen={(item) => {
                        setPendingAutoSelectId(null);
                        setProvisionalSelectedItem(null);
                        openEditorTab(item, { scope: queryState.scope });
                      }}
                      onDelete={handleDeleteItem}
                    />
                  </div>
                </>
              )}
            </aside>
          ) : (
            <div className="flex items-center justify-center xl:w-[72px] xl:shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                onClick={() => {
                  setIsLibraryPanelOpen(true);
                  setIsPreviewExpanded(false);
                }}
                title="Show library panel"
              >
                <ChevronsRight className="h-6 w-6 text-sky-600" />
              </Button>
            </div>
          )}

          {isLibraryPanelOpen && !isEditorPanelCollapsed && isDesktopLayout ? (
            <div
              className="hidden cursor-col-resize items-stretch justify-center rounded-full transition-colors hover:bg-sky-100 xl:flex"
              style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
              onMouseDown={(event) => beginHorizontalResize("library", event)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize library and editor panels"
            >
              <div className="my-6 w-px rounded-full bg-slate-300" />
            </div>
          ) : null}

          {!isEditorPanelCollapsed ? (
            <section
              ref={editorWorkspaceRef}
              className="min-w-0 flex-1 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-md transition-all duration-300 xl:flex xl:min-h-0 xl:flex-col"
            >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-900">Document Editor</div>
                {hasUnsavedTabs ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                  onClick={() => setIsLibraryPanelOpen((prev) => !prev)}
                  title={isLibraryPanelOpen ? "Hide Library" : "Show Library"}
                >
                  {isLibraryPanelOpen ? (
                    <ChevronsLeft className="h-4 w-4 text-slate-600" />
                  ) : (
                    <ChevronsRight className="h-4 w-4 text-slate-600" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                  onClick={() => setIsMarkdownPreviewPanelOpen((prev) => !prev)}
                  title={isMarkdownPreviewPanelOpen ? "Hide Preview" : "Show Preview"}
                >
                  {isMarkdownPreviewPanelOpen ? (
                    <ChevronsRight className="h-4 w-4 text-slate-600" />
                  ) : (
                    <ChevronsLeft className="h-4 w-4 text-slate-600" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mb-3 flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
              {openEditorTabs.length ? openEditorTabs.map((tab) => {
                const isActive = tab.id === selectedId;
                const isDirty = isEditorTabDirty(tab.id);
                return (
                  <div
                    key={tab.id}
                    className={`flex min-w-[300px] items-center rounded-xl border ${
                      isActive
                        ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                        : "border-slate-200 bg-slate-50/70 text-slate-700"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm"
                      onClick={() => activateEditorTab(tab.id)}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tab.title}</span>
                      {isDirty ? (
                        <span className="shrink-0 text-xs font-semibold text-amber-600">*</span>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={`ml-1 shrink-0 text-[10px] ${
                          isActive ? "border-sky-500/60 bg-white/70 text-sky-800" : "border-slate-300 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {getEditorTabScopeLabel(tab)}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-r-xl px-2.5 py-2.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeEditorTab(tab.id);
                      }}
                      aria-label={`Close ${tab.title}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              }) : (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  No open documents. Open a file from My Library, My Drive, Shared With Me, or My Group.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              <DocumentPreviewPanel
                item={selectedItem}
                previewType={previewType}
                previewText={previewText}
                markdownValue={selectedMarkdownDraft?.value ?? ""}
                markdownUpdatedAt={selectedMarkdownDraft?.updatedAt || markdownContentQuery.data?.updated_at || selectedItem?.updated_at}
                markdownError={markdownError}
                isMarkdownSaving={saveMarkdownMutation.isPending}
                isRenamingTitle={updateItemMutation.isPending}
                markdownFullHeight
                markdownEditorOnly
                documentId={selectedItem?.id}
                onMarkdownChange={(value) => {
                  if (!selectedItem) return;
                  const docId = selectedItem.id;
                  setMarkdownDraftByDocId((prev) => {
                    const current = prev[docId];
                    const fallbackUpdatedAt = selectedItem.updated_at;
                    return {
                      ...prev,
                      [docId]: {
                        value,
                        savedValue: current?.savedValue ?? "",
                        updatedAt: current?.updatedAt ?? fallbackUpdatedAt,
                      },
                    };
                  });
                }}
                onMarkdownSave={handleSaveMarkdown}
                onVersionRestore={handleVersionRestore}
                onRenameTitle={handleRenameDocument}
              />
              {!selectedItem && selectedItemQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading document...
                </div>
              ) : null}
              {!selectedItem && !selectedItemQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderOpen className="h-4 w-4" />
                  No document selected. Open a file from the left library panel.
                </div>
              ) : null}
            </div>
            </section>
          ) : (
            <div className={`flex items-center justify-center ${isPreviewExpanded ? "xl:shrink-0" : "min-w-0 flex-1"}`}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                onClick={() => {
                  setIsEditorPanelCollapsed(false);
                  setIsPreviewExpanded(false);
                }}
                title="Show editor panel"
              >
                <FileText className="h-6 w-6 text-slate-600" />
              </Button>
            </div>
          )}

          {!isEditorPanelCollapsed && isMarkdownPreviewPanelOpen && !isPreviewFullWidth && isDesktopLayout ? (
            <div
              className="hidden cursor-col-resize items-stretch justify-center rounded-full transition-colors hover:bg-cyan-100 xl:flex"
              style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
              onMouseDown={(event) => beginHorizontalResize("preview", event)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and markdown preview panels"
            >
              <div className="my-6 w-px rounded-full bg-slate-300" />
            </div>
          ) : null}

          {isMarkdownPreviewPanelOpen ? (
            <aside className={`space-y-3 rounded-3xl border border-slate-200/80 bg-white p-3 shadow-md transition-all duration-300 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden ${
              isPreviewFullWidth ? "xl:min-w-0 xl:flex-1" : "xl:shrink-0"
            }`}
            style={isDesktopLayout && !isPreviewFullWidth ? { width: `${previewPanelWidth}px` } : undefined}
            >
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isEditorPanelCollapsed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
                      onClick={() => {
                        setIsEditorPanelCollapsed(false);
                        setIsPreviewExpanded(false);
                      }}
                      title="Expand editor panel"
                    >
                      <ChevronsLeft className="h-5 w-5 text-slate-600" />
                    </Button>
                  ) : null}
                  <div>
                    <div className="text-base font-semibold text-slate-900">Markdown Preview</div>
                    <div className="text-xs text-muted-foreground">
                      Live preview for active `.md` document
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full hover:bg-sky-100 transition-colors"
                    onClick={() => {
                      setIsPreviewExpanded(!isPreviewExpanded);
                      if (!isPreviewExpanded) {
                        // Expanding - hide library and editor
                        setIsLibraryPanelOpen(false);
                        setIsEditorPanelCollapsed(true);
                      } else {
                        // Collapsing - restore panels
                        setIsLibraryPanelOpen(true);
                        setIsEditorPanelCollapsed(false);
                      }
                    }}
                    title={isPreviewExpanded ? "Restore layout" : "Expand preview to full width"}
                  >
                    {isPreviewExpanded ? (
                      <Minimize2 className="h-4 w-4 text-sky-700" />
                    ) : (
                      <Maximize2 className="h-4 w-4 text-sky-700" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      setIsMarkdownPreviewPanelOpen(false);
                      setIsPreviewExpanded(false);
                    }}
                    title="Hide markdown preview"
                  >
                    <ChevronsRight className="h-4 w-4 text-slate-600" />
                  </Button>
                </div>
              </div>

              {selectedItem && previewType === "markdown" ? (
                <div className="min-h-[200px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 xl:flex-1 xl:min-h-0">
                  <SafeMarkdown className="md-preview">
                    {activeMarkdownValue || "_Empty markdown file_"}
                  </SafeMarkdown>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
                  Open a markdown file to see live preview here.
                </div>
              )}
            </aside>
          ) : (
            <div className="flex items-center justify-center xl:w-[72px] xl:shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-white to-cyan-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                onClick={() => setIsMarkdownPreviewPanelOpen(true)}
                title="Show markdown preview"
              >
                <ChevronsLeft className="h-6 w-6 text-cyan-600" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
