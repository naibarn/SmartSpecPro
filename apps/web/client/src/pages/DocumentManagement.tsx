import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Home,
  ImagePlus,
  Info,
  Lock,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
  Video,
  X,
  Loader2,
} from "lucide-react";

import DocumentGridList from "@/components/library/DocumentGridList";
import ContextPackManager from "@/components/library/ContextPackManager";
import DocumentLibraryTabs from "@/components/library/DocumentLibraryTabs";
import KnowledgeNoteSpotlight from "@/components/library/KnowledgeNoteSpotlight";
import DocumentPreviewPanel from "@/components/library/DocumentPreviewPanel";
import GoogleDriveBrowser from "@/components/library/GoogleDriveBrowser";
import KnowledgeCanvasPanel from "@/components/library/KnowledgeCanvasPanel";
import KnowledgeGraphView from "@/components/library/KnowledgeGraphView";
import KnowledgeInspectorPanel from "@/components/library/KnowledgeInspectorPanel";
import KnowledgeQuickSwitcherDialog from "@/components/library/KnowledgeQuickSwitcherDialog";
import KnowledgeVaultOverviewPanel from "@/components/library/KnowledgeVaultOverviewPanel";
import OneDriveBrowser from "@/components/library/OneDriveBrowser";
import PropertyCatalogPanel from "@/components/library/PropertyCatalogPanel";
import SavedViewsPanel from "@/components/library/SavedViewsPanel";
import { TrashPanel } from "@/components/library/TrashPanel";
import CreateFolderDialog from "@/components/library/CreateFolderDialog";
import ShareLibraryDialog from "@/components/library/ShareLibraryDialog";
import { LocaleToggle } from "@/components/LocaleToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { getLibraryItemProcessingMeta } from "@/lib/libraryUi";
import { cn } from "@/lib/utils";
import {
  buildDocumentQueryString,
  DEFAULT_DOCUMENT_QUERY_STATE,
  DOCUMENT_MANAGEMENT_ROUTE,
  getKnowledgeVaultNavigationModes,
  getMarkdownPreviewFallbackContent,
  resolveKnowledgeVaultMode,
  parseDocumentQueryState,
  resolveDocumentPreviewType,
  buildPublicDocumentShareUrl,
  supportsKnowledgeVaultScope,
  isMarkdownLibraryItem,
  toDocumentLibraryItem,
  type DocumentLibraryItem,
  type DocumentQueryState,
  type KnowledgeVaultMode,
} from "@/lib/documentManagementUi";
import {
  getPrivateVaultAccessToken,
  setPrivateVaultAccessToken,
} from "@/lib/privateVault";
import { getAcceptString } from "@/components/editor/uploadMedia";
import { getEditorOpenRouteForItem } from "@/lib/presentationRouting";
import {
  matchesWikiLinkReference,
  normalizeWikiLinkToken,
} from "@/lib/wikiLink";
import {
  closeDocumentEditorTab,
  syncDocumentEditorTabsFromDocuments,
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
const MIN_EDITOR_PANEL_WIDTH = 420;
const MIN_KNOWLEDGE_PANEL_WIDTH = 320;
const COLLAPSED_PANEL_WIDTH = 72;
const RESIZE_HANDLE_WIDTH = 8;
const KNOWLEDGE_MINI_PANEL_STORAGE_KEY = "document-management-knowledge-mini-panel";
const KNOWLEDGE_MINI_PANEL_STORAGE_VERSION = 1;
const KNOWLEDGE_MINI_PANEL_DEFAULT_WIDTH = 520;
const KNOWLEDGE_MINI_PANEL_DEFAULT_HEIGHT = 640;
const KNOWLEDGE_MINI_PANEL_MIN_WIDTH = 280;
const KNOWLEDGE_MINI_PANEL_MIN_HEIGHT = 180;
const KNOWLEDGE_MINI_PANEL_MAX_WIDTH = 1320;
const KNOWLEDGE_MINI_PANEL_MAX_HEIGHT = 1040;
const KNOWLEDGE_MINI_PANEL_MARGIN = 16;
const KNOWLEDGE_MINI_PANEL_SNAP_THRESHOLD = 24;
const KNOWLEDGE_MINI_PANEL_HEADER_HEIGHT = 56;
const KNOWLEDGE_MINI_PANEL_COLLAPSED_HEIGHT = 56;
const KNOWLEDGE_MINI_PANEL_DRAG_THRESHOLD = 4;
const MARKDOWN_SYNC_POLL_INTERVAL_MS = 15_000;
const QUICK_MEDIA_FILTERS = [
  { value: "all", labelKey: "documentManagement.fileType.all" },
  { value: "image", labelKey: "documentManagement.fileType.image" },
  { value: "video", labelKey: "documentManagement.fileType.video" },
] as const;
const KNOWLEDGE_VAULT_UI_SURFACES = [
  "quickSwitcher",
  "inspector",
  "savedViews",
  "contextPacks",
  "graph",
  "canvas",
] as const;
const KNOWLEDGE_VAULT_NOTE_SURFACES = [
  "quickSwitcher",
  "inspector",
  "graph",
  "contextPacks",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapKnowledgeMiniPanelPosition(
  position: KnowledgeMiniPanelPosition,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): KnowledgeMiniPanelPosition {
  const maxX = Math.max(
    KNOWLEDGE_MINI_PANEL_MARGIN,
    viewportWidth - panelWidth - KNOWLEDGE_MINI_PANEL_MARGIN,
  );
  const maxY = Math.max(
    KNOWLEDGE_MINI_PANEL_MARGIN,
    viewportHeight - panelHeight - KNOWLEDGE_MINI_PANEL_MARGIN,
  );
  const snapLeft = Math.abs(position.x - KNOWLEDGE_MINI_PANEL_MARGIN) <= KNOWLEDGE_MINI_PANEL_SNAP_THRESHOLD;
  const snapTop = Math.abs(position.y - KNOWLEDGE_MINI_PANEL_MARGIN) <= KNOWLEDGE_MINI_PANEL_SNAP_THRESHOLD;
  const snapRight = Math.abs(position.x - maxX) <= KNOWLEDGE_MINI_PANEL_SNAP_THRESHOLD;
  const snapBottom = Math.abs(position.y - maxY) <= KNOWLEDGE_MINI_PANEL_SNAP_THRESHOLD;

  return {
    x: clamp(
      snapLeft ? KNOWLEDGE_MINI_PANEL_MARGIN : snapRight ? maxX : position.x,
      KNOWLEDGE_MINI_PANEL_MARGIN,
      maxX,
    ),
    y: clamp(
      snapTop ? KNOWLEDGE_MINI_PANEL_MARGIN : snapBottom ? maxY : position.y,
      KNOWLEDGE_MINI_PANEL_MARGIN,
      maxY,
    ),
  };
}

type KnowledgeMiniPanelPosition = {
  x: number;
  y: number;
};

type KnowledgeMiniPanelSize = {
  width: number;
  height: number;
};

type KnowledgeMiniPanelState = {
  position: KnowledgeMiniPanelPosition;
  size: KnowledgeMiniPanelSize;
  collapsed: boolean;
};

type KnowledgeMiniPanelStorage = {
  version: number;
  state: KnowledgeMiniPanelState;
};

type KnowledgeMiniPanelInteraction =
  | {
      kind: "move";
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
      startX: number;
      startY: number;
      originWidth: number;
      originHeight: number;
      moved: boolean;
    };

function getDefaultKnowledgeMiniPanelState(
  viewportWidth = 1280,
  viewportHeight = 800,
): KnowledgeMiniPanelState {
  const width = Math.min(KNOWLEDGE_MINI_PANEL_DEFAULT_WIDTH, viewportWidth - KNOWLEDGE_MINI_PANEL_MARGIN * 2);
  const height = Math.min(KNOWLEDGE_MINI_PANEL_DEFAULT_HEIGHT, viewportHeight - KNOWLEDGE_MINI_PANEL_MARGIN * 2);
  return {
    position: {
      x: clamp(
        viewportWidth - width - KNOWLEDGE_MINI_PANEL_MARGIN,
        KNOWLEDGE_MINI_PANEL_MARGIN,
        Math.max(KNOWLEDGE_MINI_PANEL_MARGIN, viewportWidth - width - KNOWLEDGE_MINI_PANEL_MARGIN),
      ),
      y: clamp(
        92,
        KNOWLEDGE_MINI_PANEL_MARGIN,
        Math.max(KNOWLEDGE_MINI_PANEL_MARGIN, viewportHeight - height - KNOWLEDGE_MINI_PANEL_MARGIN),
      ),
    },
    size: {
      width,
      height,
    },
    collapsed: false,
  };
}

function normalizeKnowledgeMiniPanelState(
  state: KnowledgeMiniPanelState,
  viewportWidth: number,
  viewportHeight: number,
): KnowledgeMiniPanelState {
  const width = clamp(
    state.size.width,
    KNOWLEDGE_MINI_PANEL_MIN_WIDTH,
    Math.min(KNOWLEDGE_MINI_PANEL_MAX_WIDTH, Math.max(KNOWLEDGE_MINI_PANEL_MIN_WIDTH, viewportWidth - KNOWLEDGE_MINI_PANEL_MARGIN * 2)),
  );
  const height = clamp(
    state.size.height,
    KNOWLEDGE_MINI_PANEL_MIN_HEIGHT,
    Math.min(KNOWLEDGE_MINI_PANEL_MAX_HEIGHT, Math.max(KNOWLEDGE_MINI_PANEL_MIN_HEIGHT, viewportHeight - KNOWLEDGE_MINI_PANEL_MARGIN * 2)),
  );
  return {
    position: {
      x: clamp(
        state.position.x,
        KNOWLEDGE_MINI_PANEL_MARGIN,
        Math.max(KNOWLEDGE_MINI_PANEL_MARGIN, viewportWidth - width - KNOWLEDGE_MINI_PANEL_MARGIN),
      ),
      y: clamp(
        state.position.y,
        KNOWLEDGE_MINI_PANEL_MARGIN,
        Math.max(KNOWLEDGE_MINI_PANEL_MARGIN, viewportHeight - height - KNOWLEDGE_MINI_PANEL_MARGIN),
      ),
    },
    size: {
      width,
      height,
    },
    collapsed: state.collapsed,
  };
}

function getInitialKnowledgeMiniPanelState(): KnowledgeMiniPanelState {
  if (typeof window === "undefined") {
    return getDefaultKnowledgeMiniPanelState();
  }

  const defaultState = getDefaultKnowledgeMiniPanelState(window.innerWidth, window.innerHeight);

  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_MINI_PANEL_STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    const parsed = JSON.parse(raw) as Partial<KnowledgeMiniPanelStorage>;
    if (parsed.version !== KNOWLEDGE_MINI_PANEL_STORAGE_VERSION) {
      return defaultState;
    }

    const nextState = parsed.state;
    if (
      !nextState ||
      typeof nextState.position?.x !== "number" ||
      typeof nextState.position?.y !== "number" ||
      typeof nextState.size?.width !== "number" ||
      typeof nextState.size?.height !== "number" ||
      typeof nextState.collapsed !== "boolean"
    ) {
      return defaultState;
    }

    return normalizeKnowledgeMiniPanelState(
      nextState,
      window.innerWidth,
      window.innerHeight,
    );
  } catch {
    return defaultState;
  }
}

export default function DocumentManagement() {
  const { t } = useScopedTranslation("common");
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [realWorldOcrMode, setRealWorldOcrMode] = useState(false);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const editorWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const desktopLayoutRef = useRef<HTMLDivElement | null>(null);
  const activeResizeRef = useRef<{
    panel: "library" | "knowledge";
    startX: number;
    startWidth: number;
    containerWidth: number;
    libraryOpenAtStart: boolean;
    knowledgeOpenAtStart: boolean;
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
  const [pendingAutoSelectId, setPendingAutoSelectId] = useState<number | null>(
    null
  );
  const [provisionalSelectedItem, setProvisionalSelectedItem] =
    useState<DocumentLibraryItem | null>(null);
  const [markdownDraftByDocId, setMarkdownDraftByDocId] = useState<
    Record<number, MarkdownDraftState>
  >({});
  const [markdownError, setMarkdownError] = useState<string | undefined>(
    undefined
  );
  const [previewText, setPreviewText] = useState<string | undefined>(undefined);
  const [isLibraryPanelOpen, setIsLibraryPanelOpen] = useState(true);
  const [isKnowledgePanelOpen, setIsKnowledgePanelOpen] = useState(true);
  const [isEditorPanelCollapsed, setIsEditorPanelCollapsed] = useState(false);
  const [knowledgeMiniPanelState, setKnowledgeMiniPanelState] = useState<KnowledgeMiniPanelState>(
    () => getInitialKnowledgeMiniPanelState(),
  );
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
  });
  const [libraryPanelWidth, setLibraryPanelWidth] = useState(440);
  const [knowledgePanelWidth, setKnowledgePanelWidth] = useState(360);
  const [importingDriveFileId, setImportingDriveFileId] = useState<
    string | null
  >(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [trackedUploadIds, setTrackedUploadIds] = useState<number[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(
    new Set()
  );
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isShareLibraryOpen, setIsShareLibraryOpen] = useState(false);
  const [isReindexConfirmOpen, setIsReindexConfirmOpen] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [mobileTab, setMobileTab] = useState<
    "library" | "knowledge" | "editor"
  >("library");
  const [isKnowledgeQuickSwitcherOpen, setIsKnowledgeQuickSwitcherOpen] =
    useState(false);
  const [isLibraryHeaderCollapsed, setIsLibraryHeaderCollapsed] =
    useState(false);
  const [privateVaultUnlockPin, setPrivateVaultUnlockPin] = useState("");
  const [privateVaultToken, setPrivateVaultTokenState] = useState<
    string | null
  >(() => getPrivateVaultAccessToken());
  const [openEditorTabs, setOpenEditorTabs] = useState<DocumentEditorTab[]>(
    () => {
      if (typeof window === "undefined") {
        return [];
      }
      const parsed = parseDocumentQueryState(window.location.search);
      if (parsed.viewMode !== "editor" || !parsed.docId) {
        return [];
      }
      return [
        {
          id: parsed.docId,
          title: `Document ${parsed.docId}`,
          itemType: "document",
        },
      ];
    }
  );
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
    setQueryState(prev =>
      prev.viewMode === "editor" ? prev : { ...prev, viewMode: "editor" }
    );
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

    const shouldPushHistory =
      queryState.viewMode === "editor" && Boolean(queryState.docId);
    window.history[shouldPushHistory ? "pushState" : "replaceState"](
      window.history.state,
      "",
      nextUrl
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
    const nextDocId =
      queryState.viewMode === "editor" ? (selectedId ?? undefined) : undefined;
    setQueryState(prev => {
      if (prev.docId === nextDocId) {
        return prev;
      }
      return {
        ...prev,
        docId: nextDocId,
      };
    });
  }, [selectedId, queryState.viewMode]);

  const { data: privateVaultPrefs, isLoading: privateVaultPrefsLoading } =
    trpc.users.getPreferences.useQuery(undefined, {
      enabled: isAuthenticated,
    });
  const knowledgeVaultPolicyQuery =
    trpc.library.getKnowledgeVaultPolicy.useQuery(undefined, {
      enabled: isAuthenticated,
      refetchOnWindowFocus: false,
    });
  const privateVaultConfigured = Boolean(
    privateVaultPrefs?.privateVault?.enabled
  );
  const privateVaultQueryBlocked =
    queryState.scope === "private_vault" &&
    (!privateVaultConfigured || !privateVaultToken);
  const shouldListDocuments =
    queryState.scope !== "trash" &&
    queryState.scope !== "my_drive" &&
    queryState.scope !== "my_onedrive" &&
    !privateVaultQueryBlocked;
  const listScope =
    queryState.scope === "trash" ||
    queryState.scope === "my_drive" ||
    queryState.scope === "my_onedrive"
      ? "my_library"
      : queryState.scope;
  const listFolderId =
    listScope === "my_library" ? (queryState.folderId ?? null) : undefined;
  const searchFolderId =
    listScope === "my_library" && debouncedQuery.length === 0
      ? (queryState.folderId ?? null)
      : undefined;
  const knowledgeVaultScopeSupported = supportsKnowledgeVaultScope(
    queryState.scope
  );
  const knowledgeVaultPolicyPending =
    knowledgeVaultScopeSupported &&
    !knowledgeVaultPolicyQuery.data &&
    !knowledgeVaultPolicyQuery.error;
  const knowledgeVaultAvailability = useMemo(
    () => ({
      quickSwitcher:
        knowledgeVaultPolicyQuery.data?.surfaces.quickSwitcher ?? false,
      inspector: knowledgeVaultPolicyQuery.data?.surfaces.inspector ?? false,
      savedViews: knowledgeVaultPolicyQuery.data?.surfaces.savedViews ?? false,
      contextPacks:
        knowledgeVaultPolicyQuery.data?.surfaces.contextPacks ?? false,
      graph: knowledgeVaultPolicyQuery.data?.surfaces.graph ?? false,
      canvas: knowledgeVaultPolicyQuery.data?.surfaces.canvas ?? false,
    }),
    [knowledgeVaultPolicyQuery.data]
  );
  const requestedKnowledgeVaultMode = knowledgeVaultScopeSupported
    ? queryState.knowledgeMode
    : "browse";
  const knowledgeVaultMode = knowledgeVaultPolicyPending
    ? requestedKnowledgeVaultMode
    : resolveKnowledgeVaultMode(
        requestedKnowledgeVaultMode,
        knowledgeVaultAvailability
      );
  const knowledgeVaultModes = getKnowledgeVaultNavigationModes(
    knowledgeVaultAvailability
  );
  const showKnowledgeVaultNavigation =
    knowledgeVaultScopeSupported &&
    knowledgeVaultPolicyQuery.data?.enabled === true;
  const knowledgeVaultBlockedReasons = useMemo(() => {
    if (!knowledgeVaultPolicyQuery.data) {
      return [];
    }
    const nextReasons = new Set<string>();
    KNOWLEDGE_VAULT_UI_SURFACES.forEach(surface => {
      if (!knowledgeVaultPolicyQuery.data?.surfaces[surface]) {
        (knowledgeVaultPolicyQuery.data?.surfaceReasons[surface] ?? []).forEach(
          reason => nextReasons.add(reason)
        );
      }
    });
    return Array.from(nextReasons);
  }, [knowledgeVaultPolicyQuery.data]);
  const selectedNoteBlockedReasons = useMemo(() => {
    if (!knowledgeVaultPolicyQuery.data) {
      return [];
    }
    const nextReasons = new Set<string>();
    KNOWLEDGE_VAULT_NOTE_SURFACES.forEach(surface => {
      if (!knowledgeVaultPolicyQuery.data?.surfaces[surface]) {
        (knowledgeVaultPolicyQuery.data?.surfaceReasons[surface] ?? []).forEach(
          reason => nextReasons.add(reason)
        );
      }
    });
    return Array.from(nextReasons);
  }, [knowledgeVaultPolicyQuery.data]);

  useEffect(() => {
    setQueryState(prev => {
      if (prev.knowledgeMode === knowledgeVaultMode) {
        return prev;
      }
      if (knowledgeVaultScopeSupported && knowledgeVaultPolicyPending) {
        return prev;
      }
      return {
        ...prev,
        knowledgeMode: knowledgeVaultMode,
      };
    });
  }, [
    knowledgeVaultMode,
    knowledgeVaultPolicyPending,
    knowledgeVaultScopeSupported,
  ]);

  const listInput = useMemo(
    () => ({
      scope: listScope,
      sort: queryState.sort,
      query: undefined,
      limit: 50,
      offset: 0,
      filters: {
        itemType: queryState.itemType || undefined,
        status: queryState.status as any,
      },
      folderId: listFolderId,
    }),
    [
      listScope,
      queryState.sort,
      queryState.itemType,
      queryState.status,
      queryState.folderId,
    ]
  );

  const {
    data: documentData,
    isLoading: listLoading,
    error: listError,
  } = trpc.library.listDocuments.useQuery(listInput, {
    enabled: shouldListDocuments && debouncedQuery.length === 0,
  });
  const {
    data: semanticDocumentData,
    isLoading: semanticListLoading,
    error: semanticListError,
  } = trpc.library.search.useQuery(
    {
      query: debouncedQuery || undefined,
      scope: listScope,
      limit: 50,
      offset: 0,
      filters: {
        itemType: queryState.itemType || undefined,
        status: queryState.status as any,
      },
      folderId: searchFolderId,
    },
    {
      enabled: shouldListDocuments && debouncedQuery.length > 0,
    }
  );
  // uploadStatusById must be declared BEFORE rawDocuments and selectedItem, which both use it.
  // Declaring it after (as it was originally at line ~366) caused a Temporal Dead Zone error
  // in the production Vite bundle: the minifier hoists the `let Tt` declaration but the
  // assignment (useMemo) came after the first usage at rawDocuments.map().
  const uploadStatusIds = useMemo(
    () => Array.from(new Set(trackedUploadIds)).slice(0, 25),
    [trackedUploadIds]
  );
  const uploadStatusQuery = trpc.library.getUploadStatus.useQuery(
    { ids: uploadStatusIds.length > 0 ? uploadStatusIds : [1] },
    {
      enabled: uploadStatusIds.length > 0,
      refetchInterval: 1500,
    }
  );
  const uploadStatusById = useMemo(
    () =>
      new Map(
        (uploadStatusQuery.data || []).map(entry => [entry.itemId, entry])
      ),
    [uploadStatusQuery.data]
  );
  const activeDocumentLoading =
    debouncedQuery.length > 0 ? semanticListLoading : listLoading;
  const activeDocumentError = semanticListError ?? listError;
  const privateVaultAccessError =
    queryState.scope === "private_vault"
      ? (semanticListError ?? listError)
      : null;
  const privateVaultNeedsSetup =
    queryState.scope === "private_vault" && !privateVaultConfigured;
  const privateVaultActionLocked =
    queryState.scope === "private_vault" &&
    (!privateVaultConfigured ||
      !privateVaultToken ||
      Boolean(privateVaultAccessError));
  const rawDocuments = shouldListDocuments
    ? debouncedQuery.length > 0
      ? (semanticDocumentData?.results || []).map(item =>
          toDocumentLibraryItem(item)
        )
      : ((documentData?.results || []) as DocumentLibraryItem[])
    : [];
  const documents = rawDocuments.map(item => {
    const uploadStatus = uploadStatusById.get(item.id);
    return uploadStatus ? toProvisionalDocumentItem(uploadStatus.item) : item;
  });
  const selectedFromList = selectedId
    ? documents.find(item => item.id === selectedId) || null
    : null;
  const selectedNeedsDirectFetch = Boolean(
    selectedId && !selectedFromList && !provisionalSelectedItem
  );
  const selectedItemQuery = trpc.library.getItem.useQuery(
    { id: selectedId || 0 },
    { enabled: selectedNeedsDirectFetch && !privateVaultQueryBlocked }
  );
  const selectedFromQuery = selectedItemQuery.data
    ? toProvisionalDocumentItem(selectedItemQuery.data as any)
    : null;
  const selectedItemBase =
    selectedFromList ||
    (provisionalSelectedItem && provisionalSelectedItem.id === selectedId
      ? provisionalSelectedItem
      : null) ||
    selectedFromQuery;
  const selectedItem =
    selectedItemBase && uploadStatusById.has(selectedItemBase.id)
      ? toProvisionalDocumentItem(
          uploadStatusById.get(selectedItemBase.id)?.item
        )
      : selectedItemBase;
  const previewType = selectedItem
    ? resolveDocumentPreviewType(selectedItem)
    : "fallback";
  const selectedMarkdownItem =
    selectedItem && isMarkdownLibraryItem(selectedItem) ? selectedItem : null;
  const autoOpenedKnowledgeNoteIdRef = useRef<number | null>(null);
  const knowledgeMiniPanelInteractionRef = useRef<KnowledgeMiniPanelInteraction | null>(null);
  const selectedMarkdownDraft = selectedItem
    ? markdownDraftByDocId[selectedItem.id]
    : undefined;
  const selectedMarkdownDraftIsDirty = Boolean(
    selectedMarkdownDraft &&
    selectedMarkdownDraft.value !== selectedMarkdownDraft.savedValue
  );
  const markdownContentQuery = trpc.library.getMarkdownContent.useQuery(
    { id: selectedItem?.id || 0 },
    {
      enabled: Boolean(selectedItem && previewType === "markdown"),
      // Poll only when the local draft is clean so we can pick up external
      // edits without fighting the user's current typing session.
      refetchInterval:
        previewType === "markdown" && !selectedMarkdownDraftIsDirty
          ? MARKDOWN_SYNC_POLL_INTERVAL_MS
          : false,
      // Prevent window-focus events (e.g. from screen-capture hotkeys) from
      // overwriting the local draft state with potentially stale server data.
      refetchOnWindowFocus: false,
    }
  );
  const selectedMarkdownValue =
    selectedMarkdownDraft &&
    (selectedMarkdownDraftIsDirty ||
      selectedMarkdownDraft.value.trim().length > 0)
      ? selectedMarkdownDraft.value
      : markdownContentQuery.data?.content ||
        getMarkdownPreviewFallbackContent(selectedItem);
  const selectedMarkdownUpdatedAt =
    selectedMarkdownDraft?.updatedAt ||
    markdownContentQuery.data?.updated_at ||
    selectedItem?.updated_at;
  const selectedKnowledgeInspectorQuery =
    trpc.library.getKnowledgeInspector.useQuery(
      selectedMarkdownItem && knowledgeVaultAvailability.inspector
        ? { itemId: selectedMarkdownItem.id, localGraphLimit: 16 }
        : { itemId: 0, localGraphLimit: 16 },
      {
        enabled: Boolean(
          selectedMarkdownItem && knowledgeVaultAvailability.inspector
        ),
        refetchOnWindowFocus: false,
      }
    );
  const selectedKnowledgeSummary = selectedKnowledgeInspectorQuery.data
    ? {
        logicalPath: selectedKnowledgeInspectorQuery.data.note.logicalPath,
        aliases: selectedKnowledgeInspectorQuery.data.note.aliases,
        tags: selectedKnowledgeInspectorQuery.data.note.tags,
        backlinksCount: selectedKnowledgeInspectorQuery.data.backlinks.length,
        outgoingCount: selectedKnowledgeInspectorQuery.data.outgoing.length,
        mentionCount:
          selectedKnowledgeInspectorQuery.data.unlinkedMentions.length,
        graphEdgeCount:
          selectedKnowledgeInspectorQuery.data.localGraph.edges.length,
        sharedTagsCount: selectedKnowledgeInspectorQuery.data.sharedTags.length,
        semanticRelatedCount:
          selectedKnowledgeInspectorQuery.data.semanticRelated.length,
      }
    : null;
  const selectedKnowledgeBacklinks =
    selectedKnowledgeInspectorQuery.data?.backlinks ?? [];

  const setKnowledgeMiniPanelCollapsedState = useCallback(
    (collapsed: boolean) => {
      if (typeof window === "undefined") {
        setKnowledgeMiniPanelState(prev => ({
          ...prev,
          collapsed,
        }));
        return;
      }

      setKnowledgeMiniPanelState(prev =>
        normalizeKnowledgeMiniPanelState(
          {
            ...prev,
            collapsed,
          },
          window.innerWidth,
          window.innerHeight,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const noteId = selectedMarkdownItem?.id ?? null;
    if (!noteId || !knowledgeVaultScopeSupported || !knowledgeVaultAvailability.graph) {
      autoOpenedKnowledgeNoteIdRef.current = null;
      return;
    }

    if (autoOpenedKnowledgeNoteIdRef.current === noteId) {
      return;
    }

    autoOpenedKnowledgeNoteIdRef.current = noteId;
    setIsKnowledgePanelOpen(true);
    setKnowledgeMiniPanelCollapsedState(false);
    if (!isDesktopLayout) {
      setMobileTab("knowledge");
    }
    setQueryState(prev =>
      prev.knowledgeMode === "graph"
        ? prev
        : {
            ...prev,
            knowledgeMode: "graph",
          }
    );
  }, [isDesktopLayout, knowledgeVaultAvailability.graph, knowledgeVaultScopeSupported, selectedMarkdownItem?.id, setKnowledgeMiniPanelCollapsedState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const payload: KnowledgeMiniPanelStorage = {
        version: KNOWLEDGE_MINI_PANEL_STORAGE_VERSION,
        state: knowledgeMiniPanelState,
      };
      window.localStorage.setItem(
        KNOWLEDGE_MINI_PANEL_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Ignore storage failures in private mode / restricted environments.
    }
  }, [knowledgeMiniPanelState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setKnowledgeMiniPanelState(prev =>
        normalizeKnowledgeMiniPanelState(
          prev,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = knowledgeMiniPanelInteractionRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;

      if (!current.moved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < KNOWLEDGE_MINI_PANEL_DRAG_THRESHOLD) {
          return;
        }
        current.moved = true;
      }

      event.preventDefault();

      if (current.kind === "move") {
        setKnowledgeMiniPanelState(prev =>
          normalizeKnowledgeMiniPanelState(
            {
              ...prev,
              position: {
                ...snapKnowledgeMiniPanelPosition(
                  {
                    x: current.originX + deltaX,
                    y: current.originY + deltaY,
                  },
                  prev.collapsed
                    ? Math.min(320, prev.size.width)
                    : prev.size.width,
                  prev.collapsed
                    ? KNOWLEDGE_MINI_PANEL_COLLAPSED_HEIGHT
                    : prev.size.height,
                  window.innerWidth,
                  window.innerHeight,
                ),
              },
            },
            window.innerWidth,
            window.innerHeight,
          ),
        );
        return;
      }

      setKnowledgeMiniPanelState(prev =>
        normalizeKnowledgeMiniPanelState(
          {
            ...prev,
            size: {
              width: current.originWidth + deltaX,
              height: current.originHeight + deltaY,
            },
          },
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = knowledgeMiniPanelInteractionRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }

      knowledgeMiniPanelInteractionRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const saveMarkdownMutation = trpc.library.saveMarkdown.useMutation();
  const uploadFileMutation = trpc.library.uploadFile.useMutation();
  const replaceFileMutation = trpc.library.replaceFile.useMutation();
  const createItemMutation = trpc.library.createItem.useMutation();
  const unlockPrivateVaultMutation = trpc.users.unlockPrivateVault.useMutation({
    onSuccess: result => {
      setPrivateVaultAccessToken(String(result.token));
      setPrivateVaultTokenState(String(result.token));
      setPrivateVaultUnlockPin("");
      toast.success("Private Files unlocked");
      void trpcUtils.library.listDocuments.invalidate();
      void trpcUtils.library.search.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const createPresentationDeckMutation =
    trpc.presentation.createDeck.useMutation();
  const updateItemMutation = trpc.library.updateItem.useMutation();
  const deleteItemMutation = trpc.library.deleteItem.useMutation();
  const deleteItemsMutation = trpc.library.deleteItems.useMutation();
  const importDriveFileMutation =
    trpc.googleDrive.importDriveFile.useMutation();
  const triggerReindexMutation = trpc.systemSettings.triggerReindex.useMutation(
    {
      onSuccess: (data: any) => {
        if (data?.status === "started" || data?.status === "already_running") {
          toast.success(data?.message || "Reindex job started");
          setIsReindexing(true);
        } else {
          toast.error(data?.message || "Failed to trigger reindex");
        }
      },
      onError: (err: any) => toast.error(`Reindex failed: ${err.message}`),
    }
  );
  const { data: reindexStatus } = trpc.systemSettings.getReindexStatus.useQuery(
    undefined,
    {
      enabled: isAdmin,
      refetchInterval: isReindexing ? 5000 : false,
    }
  );
  const reindexResult = reindexStatus?.result as
    | Record<string, any>
    | null
    | undefined;
  const reindexExpectedJobs = Number(
    reindexResult?.expected_enqueued_jobs ??
      reindexResult?.enqueued_jobs ??
      reindexResult?.total_jobs ??
      0
  );
  const reindexCompletedJobs = Number(reindexResult?.completed_jobs ?? 0);
  const selectedPreviewPanelKey = `${selectedItem?.id ?? selectedId ?? "empty"}:${previewType}:${queryState.scope}`;
  const { data: selectedPublicShareLink } =
    trpc.library.getPublicShareLink.useQuery(
      { itemId: selectedItem?.id ?? 0 },
      { enabled: Boolean(selectedItem?.id) }
    );
  const selectedShareUrl =
    selectedPublicShareLink?.link?.token &&
    selectedPublicShareLink.link.itemId === selectedItem?.id
      ? buildPublicDocumentShareUrl(
          selectedPublicShareLink.link.token,
          typeof window !== "undefined" ? window.location.origin : ""
        )
      : undefined;

  // Folder path / breadcrumb (only when inside a folder)
  const currentFolderId = queryState.folderId ?? null;
  const folderPathQuery = trpc.library.getFolderPath.useQuery(
    { folderId: currentFolderId! },
    { enabled: currentFolderId != null }
  );
  const folderPath = folderPathQuery.data ?? [];
  const currentFolderName =
    folderPath.length > 0
      ? (folderPath[folderPath.length - 1]?.title ?? null)
      : null;

  useEffect(() => {
    if (!reindexStatus) return;
    if (reindexStatus.status === "running") {
      if (!isReindexing) {
        setIsReindexing(true);
      }
      return;
    }
    if (reindexStatus.status === "completed") {
      if (isReindexing) {
        toast.success("Reindex completed successfully");
        trpcUtils.library.listDocuments.invalidate();
      }
      setIsReindexing(false);
      return;
    }
    if (reindexStatus.status === "completed_with_errors") {
      if (isReindexing) {
        toast.warning(
          "Reindex completed with some errors — open Admin Settings for vector health details"
        );
        trpcUtils.library.listDocuments.invalidate();
      }
      setIsReindexing(false);
      return;
    }
    if (reindexStatus.status === "failed") {
      if (isReindexing) {
        toast.error("Reindex failed — please check server logs");
      }
      setIsReindexing(false);
      return;
    }
    if (reindexStatus.status === "idle") {
      setIsReindexing(false);
    }
  }, [isReindexing, reindexStatus, trpcUtils.library.listDocuments]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncVaultToken = () =>
      setPrivateVaultTokenState(getPrivateVaultAccessToken());
    syncVaultToken();
    window.addEventListener("storage", syncVaultToken);
    return () => window.removeEventListener("storage", syncVaultToken);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !knowledgeVaultAvailability.quickSwitcher
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsKnowledgeQuickSwitcherOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [knowledgeVaultAvailability.quickSwitcher]);

  async function handleConfirmReindex() {
    setIsReindexConfirmOpen(false);
    await triggerReindexMutation.mutateAsync();
  }

  function isEditorTabDirty(tabId: number): boolean {
    const draft = markdownDraftByDocId[tabId];
    if (!draft) return false;
    return draft.value !== draft.savedValue;
  }

  const hasUnsavedTabs = useMemo(
    () => openEditorTabs.some(tab => isEditorTabDirty(tab.id)),
    [openEditorTabs, markdownDraftByDocId]
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

  useEffect(() => {
    if (!uploadStatusQuery.data?.length) {
      return;
    }

    const activeIds = new Set(
      uploadStatusQuery.data
        .filter(
          entry => !["ready", "failed", "quarantined"].includes(entry.stage)
        )
        .map(entry => entry.itemId)
    );

    setTrackedUploadIds(prev => {
      const next = prev.filter(id => activeIds.has(id));
      if (
        next.length === prev.length &&
        next.every((id, index) => id === prev[index])
      ) {
        return prev;
      }
      return next;
    });
  }, [uploadStatusQuery.data]);

  function toProvisionalDocumentItem(item: any): DocumentLibraryItem {
    return toDocumentLibraryItem(item);
  }

  function upsertEditorTab(
    item: Pick<DocumentLibraryItem, "id" | "title" | "item_type"> &
      Partial<Pick<DocumentLibraryItem, "access_source">>,
    options?: { openedFromScope?: DocumentQueryState["scope"] }
  ) {
    setOpenEditorTabs(prev =>
      upsertDocumentEditorTab(prev, {
        id: item.id,
        title: item.title || `Document ${item.id}`,
        itemType: item.item_type || "document",
        accessSource: item.access_source,
        openedFromScope: options?.openedFromScope,
      })
    );
  }

  function openEditorTab(
    item: Pick<DocumentLibraryItem, "id" | "title" | "item_type"> &
      Partial<Pick<DocumentLibraryItem, "access_source">>,
    options?: { scope?: DocumentQueryState["scope"] }
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
    setQueryState(prev => ({
      ...prev,
      ...(options?.scope ? { scope: options.scope } : {}),
      viewMode: "editor",
      docId: item.id,
    }));
    if (!isDesktopLayout) {
      setMobileTab("editor");
    }
    window.setTimeout(() => {
      if (typeof window !== "undefined" && window.innerWidth < 1400) {
        editorWorkspaceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 0);
  }

  function activateEditorTab(tabId: number) {
    setSelectedId(tabId);
    setQueryState(prev => ({
      ...prev,
      viewMode: "editor",
      docId: tabId,
    }));
    if (!isDesktopLayout) {
      setMobileTab("editor");
    }
  }

  function closeEditorTab(tabId: number) {
    const closeResult = closeDocumentEditorTab({
      tabs: openEditorTabs,
      selectedId,
      tabId,
      isDirty: isEditorTabDirty,
      confirmClose: tab =>
        window.confirm(
          `"${tab.title}" has unsaved changes. Close without saving?`
        ),
    });

    if (!closeResult.closed) {
      return;
    }

    setOpenEditorTabs(closeResult.nextTabs);
    setMarkdownDraftByDocId(prev => {
      if (!prev[tabId]) return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });

    if (selectedId === tabId) {
      setSelectedId(closeResult.nextSelectedId);
      setQueryState(state => ({
        ...state,
        viewMode: closeResult.nextSelectedId ? "editor" : "library",
        docId: closeResult.nextSelectedId ?? undefined,
      }));
    }
  }

  useEffect(() => {
    if (!documents.length) {
      if (!pendingAutoSelectId && !isEditorMode) {
        setSelectedId(prev => (prev === null ? prev : null));
      }
      return;
    }

    if (pendingAutoSelectId) {
      if (documents.some(item => item.id === pendingAutoSelectId)) {
        setSelectedId(prev =>
          prev === pendingAutoSelectId ? prev : pendingAutoSelectId
        );
        setPendingAutoSelectId(null);
        setProvisionalSelectedItem(null);
        return;
      }
    }

    setSelectedId(prev => {
      if (prev && documents.some(item => item.id === prev)) return prev;
      if (isEditorMode) return prev;
      return documents[0].id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, pendingAutoSelectId, isEditorMode]);

  useEffect(() => {
    if (!isEditorMode || !selectedId) {
      return;
    }
    if (selectedItem) {
      upsertEditorTab(
        selectedItem,
        isPrivateVaultDocument(selectedItem)
          ? { openedFromScope: "private_vault" }
          : undefined
      );
      return;
    }
    upsertEditorTab(
      {
        id: selectedId,
        title: `Document ${selectedId}`,
        item_type: "document",
      },
      queryState.scope === "private_vault"
        ? { openedFromScope: "private_vault" }
        : undefined
    );
  }, [
    isEditorMode,
    selectedId,
    selectedItem?.id,
    selectedItem?.title,
    selectedItem?.item_type,
    selectedItem?.access_source,
    selectedItem?.metadata,
    queryState.scope,
  ]);

  useEffect(() => {
    if (!documents.length) {
      return;
    }
    setOpenEditorTabs(prev =>
      syncDocumentEditorTabsFromDocuments(prev, documents)
    );
  }, [documents]);

  function getEditorTabScopeLabel(tab: DocumentEditorTab): string {
    if (tab.openedFromScope === "private_vault")
      return t("documentManagement.scope.privateFiles");
    if (tab.accessSource === "owner")
      return t("documentManagement.scope.myLibrary");
    if (tab.accessSource === "shared_direct")
      return t("documentManagement.scope.sharedWithMe");
    if (tab.accessSource === "shared_group")
      return t("documentManagement.scope.myGroup");
    if (tab.openedFromScope === "my_drive")
      return t("documentManagement.scope.myDrive");
    if (tab.openedFromScope === "my_onedrive")
      return t("documentManagement.scope.oneDrive");
    if (tab.openedFromScope === "shared_with_me")
      return t("documentManagement.scope.sharedWithMe");
    if (tab.openedFromScope === "shared_groups")
      return t("documentManagement.scope.myGroup");
    return t("documentManagement.scope.myLibrary");
  }

  function getCurrentScopeLabel(scope: DocumentQueryState["scope"]): string {
    if (scope === "private_vault")
      return t("documentManagement.scope.privateFiles");
    if (scope === "my_drive") return t("documentManagement.scope.myDrive");
    if (scope === "my_onedrive") return t("documentManagement.scope.oneDrive");
    if (scope === "shared_with_me")
      return t("documentManagement.scope.sharedWithMe");
    if (scope === "shared_groups") return t("documentManagement.scope.myGroup");
    if (scope === "trash") return t("documentManagement.scope.trash");
    return t("documentManagement.scope.myLibrary");
  }

  function isPrivateVaultDocument(
    item: Pick<DocumentLibraryItem, "metadata"> | null | undefined
  ): boolean {
    return Boolean(
      item?.metadata?.private_vault === true ||
      item?.metadata?.privateVault === true ||
      item?.metadata?.vault === true
    );
  }

  function handleScopeChange(scope: DocumentQueryState["scope"]) {
    setQueryState(prev => ({
      ...prev,
      scope,
      knowledgeMode: supportsKnowledgeVaultScope(scope)
        ? prev.knowledgeMode
        : "browse",
      folderId: scope === "my_library" ? prev.folderId : null,
    }));
  }

  function handleKnowledgeModeChange(mode: KnowledgeVaultMode) {
    if (mode !== "browse") {
      setIsKnowledgePanelOpen(true);
      setKnowledgeMiniPanelCollapsedState(false);
    }
    if (!isDesktopLayout && mode !== "browse") {
      setMobileTab("knowledge");
    }
    setQueryState(prev => ({
      ...prev,
      knowledgeMode: mode,
    }));
  }

  function openKnowledgeItem(itemId: number, title: string) {
    const matchedItem =
      documents.find(item => item.id === itemId) ??
      ({
        id: itemId,
        title,
        item_type: "md",
      } as Pick<DocumentLibraryItem, "id" | "title" | "item_type">);

    setPendingAutoSelectId(null);
    setProvisionalSelectedItem(null);
    openEditorTab(matchedItem, { scope: queryState.scope });
  }

  async function handleCopyCurrentNoteWikilink() {
    if (
      !selectedMarkdownItem ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }

    const logicalPath =
      selectedKnowledgeSummary?.logicalPath ??
      (typeof selectedMarkdownItem.metadata?.logical_path === "string"
        ? selectedMarkdownItem.metadata.logical_path
        : null);
    const baseReference = logicalPath
      ? logicalPath
      : selectedMarkdownItem.title.replace(/\.(md|markdown)$/i, "").trim();

    try {
      await navigator.clipboard.writeText(`[[${baseReference}]]`);
      toast.success("Wikilink copied");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to copy wikilink"
      );
    }
  }

  async function handleOpenWikiLink(reference: string) {
    const normalizedReference = normalizeWikiLinkToken(reference);
    if (!normalizedReference) {
      return;
    }

    const localMatch = documents.find(
      item =>
        isMarkdownLibraryItem(item) &&
        matchesWikiLinkReference(normalizedReference, {
          title: item.title,
          logicalPath:
            typeof item.metadata?.logical_path === "string"
              ? item.metadata.logical_path
              : null,
        })
    );

    if (localMatch) {
      openEditorTab(localMatch, {
        scope: isPrivateVaultDocument(localMatch)
          ? "private_vault"
          : queryState.scope,
      });
      return;
    }

    try {
      const result = await trpcUtils.library.quickSwitchNotes.fetch({
        query: normalizedReference,
        limit: 12,
      });
      const matchedNote =
        result.results.find(entry =>
          matchesWikiLinkReference(normalizedReference, {
            title: entry.title,
            logicalPath: entry.logicalPath,
          })
        ) ?? result.results[0];

      if (!matchedNote) {
        toast.error(`Linked note "${normalizedReference}" was not found.`);
        return;
      }

      openKnowledgeItem(matchedNote.libraryItemId, matchedNote.title);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to open linked note"
      );
    }
  }

  function renderKnowledgeVaultNavigation() {
    if (!knowledgeVaultScopeSupported) {
      return null;
    }

    return (
      <KnowledgeVaultOverviewPanel
        pending={knowledgeVaultPolicyPending}
        enabled={Boolean(knowledgeVaultPolicyQuery.data?.enabled)}
        activeMode={knowledgeVaultMode}
        blockedReasons={knowledgeVaultBlockedReasons}
        modes={knowledgeVaultModes}
        quickSwitcherEnabled={knowledgeVaultAvailability.quickSwitcher}
        releaseGateStatus={knowledgeVaultPolicyQuery.data?.releaseGateStatus}
        selectedMarkdownTitle={selectedMarkdownItem?.title ?? null}
        compact={isDesktopLayout ? isKnowledgePanelOpen : true}
        onChangeMode={handleKnowledgeModeChange}
        onOpenQuickSwitch={() => setIsKnowledgeQuickSwitcherOpen(true)}
      />
    );
  }

  function renderKnowledgeVaultContent() {
    switch (knowledgeVaultMode) {
      case "related":
        return (
          <KnowledgeInspectorPanel
            selectedItem={selectedItem}
            onOpenItem={openKnowledgeItem}
            onBrowseNotes={() => handleKnowledgeModeChange("browse")}
            onOpenQuickSwitch={
              knowledgeVaultAvailability.quickSwitcher
                ? () => setIsKnowledgeQuickSwitcherOpen(true)
                : undefined
            }
          />
        );
      case "graph":
        return (
          <KnowledgeInspectorPanel
            selectedItem={selectedItem}
            onOpenItem={openKnowledgeItem}
            focus="graph"
            onBrowseNotes={() => handleKnowledgeModeChange("browse")}
            onOpenQuickSwitch={
              knowledgeVaultAvailability.quickSwitcher
                ? () => setIsKnowledgeQuickSwitcherOpen(true)
                : undefined
            }
          />
        );
      case "properties":
        return <PropertyCatalogPanel />;
      case "views":
        return (
          <SavedViewsPanel
            currentQueryState={queryState}
            onOpenItem={openKnowledgeItem}
          />
        );
      case "memory_packs":
        return (
          <ContextPackManager
            selectedItemIds={Array.from(selectedItemIds)}
            onOpenItem={openKnowledgeItem}
          />
        );
      case "canvas":
        return (
          <KnowledgeCanvasPanel
            selectedNote={
              selectedMarkdownItem
                ? {
                    libraryItemId: selectedMarkdownItem.id,
                    title: selectedMarkdownItem.title,
                    logicalPath:
                      selectedKnowledgeSummary?.logicalPath ??
                      (typeof selectedMarkdownItem.metadata?.logical_path ===
                      "string"
                        ? selectedMarkdownItem.metadata.logical_path
                        : null),
                  }
                : null
            }
            onOpenBoard={openKnowledgeItem}
          />
        );
      default:
        return null;
    }
  }

  function renderKnowledgeNoteSpotlight(compactOverride?: boolean) {
    if (!knowledgeVaultScopeSupported || !selectedItem) {
      return null;
    }

    const compact = compactOverride ?? (isDesktopLayout ? isKnowledgePanelOpen : true);

    if (!selectedMarkdownItem) {
      return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 shadow-sm">
          <div>
            Knowledge Vault actions light up on Markdown notes. Open an `md`
            file or use Quick switch to jump into connected note workflows.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {knowledgeVaultAvailability.quickSwitcher ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsKnowledgeQuickSwitcherOpen(true)}
              >
                <Search className="mr-2 h-4 w-4" />
                Quick switch
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleKnowledgeModeChange("browse")}
            >
              Browse notes
            </Button>
          </div>
        </div>
      );
    }

    const errorMessage = selectedKnowledgeInspectorQuery.error
      ? "Knowledge note details are temporarily unavailable. You can keep editing and try Quick switch again in a moment."
      : !knowledgeVaultPolicyPending && !knowledgeVaultPolicyQuery.data?.enabled
        ? "Knowledge Vault is still locked for this workspace."
        : !knowledgeVaultAvailability.inspector
          ? "Inspector details are still limited in the current rollout."
          : null;
    const selectedLogicalPathFromMetadata =
      typeof selectedMarkdownItem.metadata?.logical_path === "string"
        ? selectedMarkdownItem.metadata.logical_path
        : null;

    return (
      <KnowledgeNoteSpotlight
        title={selectedMarkdownItem.title}
        logicalPath={
          selectedKnowledgeSummary?.logicalPath ??
          selectedLogicalPathFromMetadata ??
          null
        }
        aliases={selectedKnowledgeSummary?.aliases ?? []}
        tags={selectedKnowledgeSummary?.tags ?? []}
        backlinksCount={selectedKnowledgeSummary?.backlinksCount}
        outgoingCount={selectedKnowledgeSummary?.outgoingCount}
        mentionCount={selectedKnowledgeSummary?.mentionCount}
        graphEdgeCount={selectedKnowledgeSummary?.graphEdgeCount}
        sharedTagsCount={selectedKnowledgeSummary?.sharedTagsCount}
        semanticRelatedCount={selectedKnowledgeSummary?.semanticRelatedCount}
        isLoading={selectedKnowledgeInspectorQuery.isLoading}
        errorMessage={errorMessage}
        quickSwitcherEnabled={knowledgeVaultAvailability.quickSwitcher}
        inspectorEnabled={knowledgeVaultAvailability.inspector}
        graphEnabled={knowledgeVaultAvailability.graph}
        contextPacksEnabled={knowledgeVaultAvailability.contextPacks}
        blockedReasons={selectedNoteBlockedReasons}
        compact={compact}
        onChangeMode={handleKnowledgeModeChange}
        onOpenQuickSwitch={() => setIsKnowledgeQuickSwitcherOpen(true)}
        onCopyWikiLink={handleCopyCurrentNoteWikilink}
      />
    );
  }

  function renderKnowledgeMiniPanel() {
    if (!isDesktopLayout || !knowledgeVaultScopeSupported || !selectedMarkdownItem) {
      return null;
    }

    const inspector = selectedKnowledgeInspectorQuery.data;
    const renderMiniPanelBody = () => {
      if (knowledgeVaultMode !== "graph") {
        return renderKnowledgeNoteSpotlight(true);
      }

      if (selectedKnowledgeInspectorQuery.isLoading || !inspector) {
        return (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading graph
          </div>
        );
      }

      if (selectedKnowledgeInspectorQuery.error) {
        return (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Knowledge graph is temporarily unavailable for this note.
          </div>
        );
      }

      return (
        <KnowledgeGraphView
          compact
          fillAvailable
          activeNote={inspector.note}
          outgoing={inspector.outgoing}
          backlinks={inspector.backlinks}
          sharedTags={inspector.sharedTags}
          semanticRelated={inspector.semanticRelated}
          onOpenItem={openKnowledgeItem}
        />
      );
    };

    const panelWidth = knowledgeMiniPanelState.size.width;
    const panelHeight = knowledgeMiniPanelState.collapsed
      ? KNOWLEDGE_MINI_PANEL_COLLAPSED_HEIGHT
      : knowledgeMiniPanelState.size.height;
    const collapsedWidth = Math.min(320, panelWidth);
    const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      knowledgeMiniPanelInteractionRef.current = {
        kind: "move",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: knowledgeMiniPanelState.position.x,
        originY: knowledgeMiniPanelState.position.y,
        moved: false,
      };
    };

    const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || knowledgeMiniPanelState.collapsed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      knowledgeMiniPanelInteractionRef.current = {
        kind: "resize",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originWidth: knowledgeMiniPanelState.size.width,
        originHeight: knowledgeMiniPanelState.size.height,
        moved: false,
      };
    };

    const toggleCollapsed = () => {
      setKnowledgeMiniPanelCollapsedState(
        !knowledgeMiniPanelState.collapsed,
      );
    };

    return (
      <div
        className="fixed z-30 pointer-events-auto"
        style={{
          left: knowledgeMiniPanelState.position.x,
          top: knowledgeMiniPanelState.position.y,
          width: knowledgeMiniPanelState.collapsed ? collapsedWidth : panelWidth,
          height: panelHeight,
        }}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white/95 shadow-xl backdrop-blur">
          <div className="flex items-stretch justify-between gap-2 border-b border-sky-100 px-3 py-2.5">
            <div
              className="flex min-w-0 flex-1 items-center gap-2 pr-2 cursor-move"
              onPointerDown={beginMove}
              style={{ touchAction: "none" }}
              role="presentation"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 shadow-sm">
                <GitBranch className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                  Virtual graph
                </div>
                <div className="truncate text-sm font-semibold text-slate-900">
                  {selectedMarkdownItem.title}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-sky-50"
                onClick={toggleCollapsed}
                title={
                  knowledgeMiniPanelState.collapsed
                    ? "Expand virtual graph"
                    : "Collapse virtual graph"
                }
              >
                {knowledgeMiniPanelState.collapsed ? (
                  <ChevronsRight className="h-4 w-4 text-sky-700" />
                ) : (
                  <ChevronsLeft className="h-4 w-4 text-sky-700" />
                )}
              </Button>
            </div>
          </div>

          {!knowledgeMiniPanelState.collapsed ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {renderMiniPanelBody()}
              </div>
              <div
                className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-tl-2xl bg-transparent"
                onPointerDown={beginResize}
                style={{ touchAction: "none" }}
                title="Resize virtual graph"
                aria-hidden="true"
              >
                <div className="absolute bottom-1 right-1 h-3 w-3 rounded-br-2xl border-r-2 border-b-2 border-sky-300" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderKnowledgeVaultBrowseState() {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-600 shadow-sm">
        <div className="font-medium text-slate-900">
          Browse mode keeps files on the left and knowledge tools on the right.
        </div>
        <div className="mt-2 leading-6">
          Open a markdown note, then jump into backlinks, graph, memory packs,
          tags, and saved views without squeezing the file list.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {knowledgeVaultAvailability.quickSwitcher ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsKnowledgeQuickSwitcherOpen(true)}
            >
              <Search className="mr-2 h-4 w-4" />
              Quick switch
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleKnowledgeModeChange("related")}
            disabled={!knowledgeVaultAvailability.inspector}
          >
            Related notes
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleKnowledgeModeChange("graph")}
            disabled={!knowledgeVaultAvailability.graph}
          >
            Graph explorer
          </Button>
        </div>
      </div>
    );
  }

  function renderPrivateVaultGate() {
    if (privateVaultPrefsLoading) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("documentManagement.privateVault.loadingSettings")}
          </div>
        </div>
      );
    }

    if (!privateVaultConfigured) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5 shadow-sm">
          <div className="max-w-xl rounded-2xl border border-amber-200 bg-white/90 p-5 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("documentManagement.privateVault.notSetupTitle")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t("documentManagement.privateVault.notSetupDescription")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setLocation("/settings?tab=privateVault")}>
                {t("documentManagement.privateVault.goToSettings")}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleScopeChange("my_library")}
              >
                {t("documentManagement.backToLibrary")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5 shadow-sm">
        <div className="max-w-xl rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-slate-900">
                {t("documentManagement.privateVault.lockedTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {t("documentManagement.privateVault.lockedDescription")}
              </p>
              {privateVaultAccessError ? (
                <p className="mt-2 text-sm font-medium text-red-700">
                  {privateVaultAccessError.message ||
                    t("documentManagement.privateVault.invalidToken")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              inputMode="numeric"
              placeholder={t("documentManagement.privateVault.pinCode")}
              value={privateVaultUnlockPin}
              onChange={event =>
                setPrivateVaultUnlockPin(event.target.value.replace(/\s+/g, ""))
              }
              className="flex-1"
            />
            <Button
              onClick={() => {
                const pin = privateVaultUnlockPin.trim();
                if (!pin) {
                  toast.error(t("documentManagement.privateVault.enterPin"));
                  return;
                }
                unlockPrivateVaultMutation.mutate({ pin });
              }}
              disabled={
                unlockPrivateVaultMutation.isPending ||
                !privateVaultUnlockPin.trim()
              }
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {unlockPrivateVaultMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {t("documentManagement.privateVault.unlock")}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/settings?tab=privateVault")}
            >
              {t("documentManagement.privateVault.managePin")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleScopeChange("my_library")}
            >
              {t("documentManagement.backToLibrary")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (previewType !== "markdown") {
      setMarkdownError(undefined);
      return;
    }
    if (!selectedItem || !markdownContentQuery.data) {
      return;
    }

    // While a markdown save is in flight, keep the local draft as the source
    // of truth.  The item will often flip to `indexing` immediately after save,
    // which triggers refetches.  Without this guard, a transient stale/empty
    // payload can overwrite the editor before the save has fully settled.
    if (saveMarkdownMutation.isPending) {
      return;
    }

    const incomingContent = markdownContentQuery.data.content || "";
    const incomingUpdatedAt =
      markdownContentQuery.data.updated_at || selectedItem.updated_at;
    const docId = selectedItem.id;

    setMarkdownDraftByDocId(prev => {
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

      if (
        current.savedValue === incomingContent &&
        current.updatedAt === incomingUpdatedAt
      ) {
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
  }, [
    previewType,
    selectedItem?.id,
    selectedItem?.updated_at,
    markdownContentQuery.data,
  ]);

  useEffect(() => {
    if (!selectedItem) {
      setPreviewText(undefined);
      return;
    }

    if (
      !["text", "json", "html", "code", "csv", "xml"].includes(previewType) ||
      !selectedItem.source_url
    ) {
      setPreviewText(undefined);
      return;
    }

    let cancelled = false;
    fetch(selectedItem.source_url)
      .then(response => response.text())
      .then(text => {
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
  }, [previewType, selectedItem?.id, selectedItem?.source_url]);

  async function handleSaveMarkdown(contentOverride?: string) {
    if (!selectedItem || previewType !== "markdown") return;
    const selectedItemId = selectedItem.id;
    const draft = markdownDraftByDocId[selectedItemId];
    const contentToSave = (contentOverride ?? draft?.value ?? "").replace(
      /\r\n/g,
      "\n"
    );

    // Safety guard: refuse to persist an empty document.  This prevents data
    // loss if an external hotkey (e.g. screen-capture) clears the editor state
    // and a save is somehow triggered before the user notices.
    if (!contentToSave.trim()) {
      toast.error("Cannot save an empty document. Please enter content first.");
      return;
    }
    const expectedUpdatedAt = new Date(
      draft?.updatedAt ?? selectedItem.updated_at
    );

    async function applySuccessResult(
      result: Awaited<ReturnType<typeof saveMarkdownMutation.mutateAsync>>
    ) {
      const updatedItem = toProvisionalDocumentItem(result.item);
      setProvisionalSelectedItem(updatedItem);
      upsertEditorTab(
        updatedItem,
        isPrivateVaultDocument(updatedItem)
          ? { openedFromScope: "private_vault" }
          : undefined
      );
      setMarkdownDraftByDocId(prev => ({
        ...prev,
        [updatedItem.id]: {
          value: contentToSave,
          savedValue: contentToSave,
          updatedAt: updatedItem.updated_at,
        },
      }));
      setSelectedId(updatedItem.id);
      // The editor already has the newest content locally after autosave, so
      // we do not refetch the same markdown snapshot here. That avoids a
      // redundant server round-trip that can re-trigger editor hydration and
      // disturb the cursor.
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
      const isVersionConflict =
        error instanceof Error &&
        error.message.toLowerCase().includes("version conflict");
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
          const retryMessage =
            retryError instanceof Error
              ? retryError.message
              : "Failed to save markdown";
          setMarkdownError(retryMessage);
          toast.error(retryMessage);
          return;
        }
      }
      const message =
        error instanceof Error ? error.message : "Failed to save markdown";
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
    setMarkdownDraftByDocId(prev => {
      const next = { ...prev };
      delete next[selectedItem.id];
      return next;
    });
  }

  async function handleReplaceFile(file: File, changeDescription?: string) {
    if (!selectedItem) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50 MB)");
      throw new Error("File too large");
    }
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await replaceFileMutation.mutateAsync({
        itemId: selectedItem.id,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileBase64,
        changeDescription,
      });
      setTrackedUploadIds(prev =>
        Array.from(new Set([...prev, result.item.id]))
      );
      toast.success(
        "New version uploaded. Parsing and indexing are now running."
      );
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: selectedItem.id }),
        trpcUtils.library.getVersionHistory.invalidate({
          itemId: selectedItem.id,
        }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to replace file"
      );
      throw error; // re-throw so the dialog stays open on failure
    }
  }

  async function handleDeleteItem(item: DocumentLibraryItem) {
    try {
      await deleteItemMutation.mutateAsync({ id: item.id });
      toast.success(`"${item.title}" moved to trash.`);
      await trpcUtils.library.listDocuments.invalidate();
      // Close the tab if this item is currently open
      const tabOpen = openEditorTabs.some(t => t.id === item.id);
      if (tabOpen) {
        closeEditorTab(item.id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to move item to trash"
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
      setQueryState(prev => ({
        ...prev,
        scope: "my_library",
      }));

      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: provisionalItem.id }),
      ]);

      toast.success(`Imported "${provisionalItem.title}" from Google Drive.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to import file from Google Drive";
      toast.error(message);
    } finally {
      setImportingDriveFileId(null);
    }
  }

  function handleFolderOpen(item: DocumentLibraryItem) {
    setSelectedItemIds(new Set());
    setSelectedId(null);
    setQueryState(prev => ({
      ...prev,
      folderId: item.id,
      scope: "my_library",
      docId: undefined,
    }));
  }

  function navigateToFolder(folderId: number | null) {
    setSelectedItemIds(new Set());
    setSelectedId(null);
    setQueryState(prev => ({ ...prev, folderId, docId: undefined }));
  }

  async function handleDeleteItemWithFolderCheck(item: DocumentLibraryItem) {
    if (item.item_type === "folder") {
      // Check child count before deleting folder
      try {
        const result = await trpcUtils.client.library.getFolderChildCount.query(
          { folderId: item.id }
        );
        if (result.count > 0) {
          const confirmed = window.confirm(
            `The folder "${item.title}" contains ${result.count} item(s). Deleting this folder will also move all its contents to trash. Continue?`
          );
          if (!confirmed) return;
        }
      } catch {
        // fall through — let the delete proceed
      }
    }
    handleDeleteItem(item);
  }

  async function handleBatchDelete() {
    if (selectedItemIds.size === 0) return;
    const confirmed = window.confirm(
      `Move ${selectedItemIds.size} item(s) to trash?`
    );
    if (!confirmed) return;

    try {
      const result = await deleteItemsMutation.mutateAsync({
        ids: Array.from(selectedItemIds),
      });
      toast.success(`${result.deleted} item(s) moved to trash.`);
      setSelectedItemIds(new Set());
      await trpcUtils.library.listDocuments.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch delete failed");
    }
  }

  async function handleUploadFiles(
    files: File[],
    metadata?: Record<string, unknown>
  ) {
    if (files.length === 0) return;
    if (queryState.scope === "private_vault" && privateVaultActionLocked) {
      toast.error(t("documentManagement.privateVault.unlockBeforeUpload"));
      return;
    }
    setUploadingCount(n => n + files.length);
    const effectiveMetadata = {
      ...(metadata ?? {}),
      ...(queryState.scope === "private_vault" ? { private_vault: true } : {}),
    };

    const results = await Promise.allSettled(
      files.map(async file => {
        try {
          const fileBase64 = await fileToBase64(file);
          return await uploadFileMutation.mutateAsync({
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileBase64,
            title: file.name,
            parentId: currentFolderId,
            visibility:
              queryState.scope === "private_vault" ? "private" : undefined,
            metadata: effectiveMetadata,
          });
        } finally {
          setUploadingCount(n => Math.max(0, n - 1));
        }
      })
    );

    const succeeded = results.filter(
      (
        r
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof uploadFileMutation.mutateAsync>>
      > => r.status === "fulfilled"
    );
    const failedCount = results.length - succeeded.length;

    if (succeeded.length > 0) {
      if (failedCount === 0) {
        toast.success(
          succeeded.length === 1
            ? "File uploaded. Processing and indexing are now running."
            : `${succeeded.length} files uploaded. Processing and indexing are now running.`
        );
      } else {
        toast.warning(
          `${succeeded.length} file(s) uploaded, ${failedCount} failed.`
        );
      }
      setTrackedUploadIds(prev =>
        Array.from(
          new Set([...prev, ...succeeded.map(entry => entry.value.item.id)])
        )
      );
      setQueryState(prev => ({
        ...prev,
        scope:
          queryState.scope === "private_vault" ? "private_vault" : "my_library",
      }));
      if (files.length === 1) {
        const result = succeeded[0].value;
        setPendingAutoSelectId(result.item.id);
        setSelectedId(result.item.id);
        setProvisionalSelectedItem(toProvisionalDocumentItem(result.item));
      }
      await trpcUtils.library.listDocuments.invalidate();
    } else {
      const firstRejected = results[0] as PromiseRejectedResult;
      toast.error(
        firstRejected.reason instanceof Error
          ? firstRejected.reason.message
          : "Upload failed"
      );
    }
  }

  async function handleCreateNewDocument(customTitle?: string) {
    if (queryState.scope === "private_vault" && privateVaultActionLocked) {
      toast.error(
        t("documentManagement.privateVault.unlockBeforeCreateDocument")
      );
      return;
    }
    try {
      const now = new Date();
      const title =
        customTitle?.trim() || `New Document ${now.toLocaleString()}`;
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
          ...(queryState.scope === "private_vault"
            ? { private_vault: true }
            : {}),
        },
      });

      const initialContent = `# ${title}\n\n`;
      const saveResult = await saveMarkdownMutation.mutateAsync({
        id: createResult.item.id,
        content: initialContent,
      });

      setMarkdownError(undefined);
      setDebouncedQuery("");
      setQueryState(prev => ({
        ...prev,
        scope:
          queryState.scope === "private_vault" ? "private_vault" : "my_library",
      }));
      setPendingAutoSelectId(createResult.item.id);
      const provisionalItem = toProvisionalDocumentItem(
        saveResult.item ?? createResult.item
      );
      setMarkdownDraftByDocId(prev => ({
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
        trpcUtils.library.getMarkdownContent.invalidate({
          id: createResult.item.id,
        }),
      ]);
      window.setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      toast.success("New markdown document created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create document"
      );
    }
  }

  async function handleCreateNewPresentation() {
    if (queryState.scope === "private_vault" && privateVaultActionLocked) {
      toast.error(
        t("documentManagement.privateVault.unlockBeforeCreatePresentation")
      );
      return;
    }
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
          ...(queryState.scope === "private_vault"
            ? { private_vault: true }
            : {}),
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
      setQueryState(prev => ({
        ...prev,
        scope:
          queryState.scope === "private_vault" ? "private_vault" : "my_library",
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
          : "New presentation created. Deck will initialize on open."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create presentation"
      );
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
      upsertEditorTab(
        provisionalUpdated,
        isPrivateVaultDocument(provisionalUpdated)
          ? { openedFromScope: "private_vault" }
          : undefined
      );
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: selectedItem.id }),
      ]);
      toast.success("Document renamed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename document"
      );
    }
  }

  function stopHorizontalResizeSession() {
    activeResizeRef.current = null;
    if (typeof document !== "undefined") {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }

  function beginHorizontalResize(
    event: ReactMouseEvent<HTMLDivElement>,
    panel: "library" | "knowledge"
  ) {
    if (!isDesktopLayout) return;
    const container = desktopLayoutRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    activeResizeRef.current = {
      panel,
      startX: event.clientX,
      startWidth: panel === "library" ? libraryPanelWidth : knowledgePanelWidth,
      containerWidth: rect.width,
      libraryOpenAtStart: isLibraryPanelOpen,
      knowledgeOpenAtStart: isKnowledgePanelOpen,
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
      const reservedHandleCount =
        Number(session.libraryOpenAtStart) +
        Number(session.knowledgeOpenAtStart);
      const reservedLibraryWidth = session.libraryOpenAtStart
        ? libraryPanelWidth
        : 0;
      const reservedKnowledgeWidth = session.knowledgeOpenAtStart
        ? knowledgePanelWidth
        : 0;

      if (session.panel === "library") {
        const maxLibraryWidth = Math.max(
          MIN_LIBRARY_PANEL_WIDTH,
          containerWidth -
            MIN_EDITOR_PANEL_WIDTH -
            (session.knowledgeOpenAtStart ? reservedKnowledgeWidth : 0) -
            reservedHandleCount * RESIZE_HANDLE_WIDTH
        );
        const nextLibraryWidth = clamp(
          session.startWidth + deltaX,
          MIN_LIBRARY_PANEL_WIDTH,
          maxLibraryWidth
        );
        setLibraryPanelWidth(nextLibraryWidth);
        return;
      }

      const maxKnowledgeWidth = Math.max(
        MIN_KNOWLEDGE_PANEL_WIDTH,
        containerWidth -
          MIN_EDITOR_PANEL_WIDTH -
          (session.libraryOpenAtStart ? reservedLibraryWidth : 0) -
          reservedHandleCount * RESIZE_HANDLE_WIDTH
      );
      const nextKnowledgeWidth = clamp(
        session.startWidth - deltaX,
        MIN_KNOWLEDGE_PANEL_WIDTH,
        maxKnowledgeWidth
      );
      setKnowledgePanelWidth(nextKnowledgeWidth);
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

  const uploadEntries = (uploadStatusQuery.data || []).map(entry => ({
    ...entry,
    ui: getLibraryItemProcessingMeta({
      status: entry.item.status,
      metadata: entry.item.metadata,
    }),
  }));
  const hasActiveUploadEntries = uploadEntries.length > 0;

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-gradient-to-br from-slate-50 via-sky-50/50 to-cyan-50/40",
        isDesktopLayout ? "min-h-screen" : "flex h-dvh flex-col overflow-hidden"
      )}
    >
      <header className="sticky top-0 z-10 shrink-0 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("back")}
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-bold truncate">
                    {t("documentManagement.title")}
                  </h1>
                  <p className="hidden sm:block text-xs text-muted-foreground">
                    {t("documentManagement.subtitle")}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile: single + dropdown for all actions */}
            <div className="flex sm:hidden items-center gap-2">
              <LocaleToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="h-4 w-4" />
                    {t("documentManagement.add")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingCount > 0 || privateVaultActionLocked}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.uploadImage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setRealWorldOcrMode(prev => !prev)}
                  >
                    <Info className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.ocrMode")}:{" "}
                    {realWorldOcrMode
                      ? t("documentManagement.on")
                      : t("documentManagement.off")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploadingCount > 0 || privateVaultActionLocked}
                  >
                    <Video className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.uploadVideo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => audioInputRef.current?.click()}
                    disabled={uploadingCount > 0 || privateVaultActionLocked}
                  >
                    <Music2 className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.uploadAudio")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingCount > 0 || privateVaultActionLocked}
                  >
                    <Upload className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.uploadFile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void handleCreateNewDocument();
                    }}
                    disabled={
                      createItemMutation.isPending ||
                      saveMarkdownMutation.isPending ||
                      privateVaultActionLocked
                    }
                  >
                    <FilePlus2 className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.newDocument")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleCreateNewPresentation}
                    disabled={
                      createItemMutation.isPending ||
                      createPresentationDeckMutation.isPending ||
                      privateVaultActionLocked
                    }
                  >
                    <FilePlus2 className="mr-2 h-4 w-4" />{" "}
                    {t("documentManagement.newPresentation")}
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <DropdownMenuItem
                      onClick={() => setIsReindexConfirmOpen(true)}
                      disabled={
                        triggerReindexMutation.isPending || isReindexing
                      }
                    >
                      <RefreshCw
                        className={cn(
                          "mr-2 h-4 w-4",
                          isReindexing && "animate-spin"
                        )}
                      />
                      {isReindexing && reindexExpectedJobs > 0
                        ? t("documentManagement.reindexProgress", {
                            completed: reindexCompletedJobs,
                            total: reindexExpectedJobs,
                          })
                        : isReindexing
                          ? t("documentManagement.reindexing")
                          : t("documentManagement.reindexLibrary")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Tablet / desktop: full button row */}
            <div className="hidden sm:flex flex-wrap items-center gap-2">
              <LocaleToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingCount > 0 || privateVaultActionLocked}
              >
                <ImagePlus className="mr-1 h-4 w-4" />
                {t("documentManagement.uploadImage")}
              </Button>
              <Button
                variant={realWorldOcrMode ? "default" : "outline"}
                size="sm"
                onClick={() => setRealWorldOcrMode(prev => !prev)}
              >
                <Info className="mr-1 h-4 w-4" />
                {t("documentManagement.ocrMode")}{" "}
                {realWorldOcrMode
                  ? t("documentManagement.on")
                  : t("documentManagement.off")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingCount > 0 || privateVaultActionLocked}
              >
                <Video className="mr-1 h-4 w-4" />
                {t("documentManagement.uploadVideo")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => audioInputRef.current?.click()}
                disabled={uploadingCount > 0 || privateVaultActionLocked}
              >
                <Music2 className="mr-1 h-4 w-4" />
                {t("documentManagement.uploadAudio")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCount > 0 || privateVaultActionLocked}
              >
                <Upload className="mr-1 h-4 w-4" />
                {t("documentManagement.uploadFile")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void handleCreateNewDocument();
                }}
                disabled={
                  createItemMutation.isPending ||
                  saveMarkdownMutation.isPending ||
                  privateVaultActionLocked
                }
              >
                <FilePlus2 className="mr-1 h-4 w-4" />
                {t("documentManagement.newDocument")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCreateNewPresentation}
                disabled={
                  createItemMutation.isPending ||
                  createPresentationDeckMutation.isPending ||
                  privateVaultActionLocked
                }
              >
                <FilePlus2 className="mr-1 h-4 w-4" />
                {t("documentManagement.newPresentation")}
              </Button>
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsReindexConfirmOpen(true)}
                  disabled={triggerReindexMutation.isPending || isReindexing}
                >
                  <RefreshCw
                    className={cn(
                      "mr-1 h-4 w-4",
                      isReindexing && "animate-spin"
                    )}
                  />
                  {isReindexing && reindexExpectedJobs > 0
                    ? t("documentManagement.reindexProgress", {
                        completed: reindexCompletedJobs,
                        total: reindexExpectedJobs,
                      })
                    : isReindexing
                      ? t("documentManagement.reindexing")
                      : t("documentManagement.reindex")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t("documentManagement.ocrModeHelp")}
          </div>
        </div>
      </header>

      {hasActiveUploadEntries ? (
        <div className="border-b bg-white/80 px-4 py-3 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Upload className="h-4 w-4" />
              {t("documentManagement.uploadPipeline")}
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {uploadEntries.map(entry => (
                <div
                  key={entry.itemId}
                  className="rounded-xl border bg-slate-50/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {entry.item.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {entry.stageMessage ||
                          entry.ui.detail ||
                          t("documentManagement.processingUpload")}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge className={entry.ui.className}>
                        {entry.ui.label}
                      </Badge>
                      {entry.searchQuality === "metadata_only" ? (
                        <Badge variant="outline">
                          {t("documentManagement.metadataSearch")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {entry.indexJobStatus ||
                  entry.parserStatus ||
                  entry.parseError ||
                  entry.warnings.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                      {entry.indexJobStatus ? (
                        <span>
                          {t("documentManagement.index")}:{" "}
                          {entry.indexJobStatus}
                        </span>
                      ) : null}
                      {entry.parserStatus ? (
                        <span>
                          {t("documentManagement.parser")}: {entry.parserStatus}
                        </span>
                      ) : null}
                      {entry.extractor ? (
                        <span>
                          {t("documentManagement.extractor")}: {entry.extractor}
                        </span>
                      ) : null}
                      {entry.parseError ? (
                        <span className="text-red-700">{entry.parseError}</span>
                      ) : null}
                      {!entry.parseError && entry.warnings[0] ? (
                        <span>{entry.warnings[0]}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleUploadFiles(
            files,
            realWorldOcrMode ? { analysis_profile: "document_ocr" } : undefined
          );
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={async event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleUploadFiles(files);
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={async event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleUploadFiles(files);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptString("file")}
        multiple
        className="hidden"
        onChange={async event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleUploadFiles(files);
        }}
      />

      <CreateFolderDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        parentId={currentFolderId}
        onCreated={folderId => {
          // Optionally navigate into the new folder
        }}
      />

      <ShareLibraryDialog
        open={isShareLibraryOpen}
        onOpenChange={setIsShareLibraryOpen}
        folderId={currentFolderId}
        folderName={currentFolderName}
      />

      <AlertDialog
        open={isReindexConfirmOpen}
        onOpenChange={setIsReindexConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("documentManagement.reindexDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("documentManagement.reindexDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={triggerReindexMutation.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void handleConfirmReindex();
              }}
              disabled={triggerReindexMutation.isPending}
            >
              {triggerReindexMutation.isPending
                ? t("documentManagement.starting")
                : t("documentManagement.startReindex")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KnowledgeQuickSwitcherDialog
        open={isKnowledgeQuickSwitcherOpen}
        onOpenChange={setIsKnowledgeQuickSwitcherOpen}
        onSelectNote={({ libraryItemId, title }) =>
          openKnowledgeItem(libraryItemId, title)
        }
        onCreateNote={title => handleCreateNewDocument(title)}
      />

      <main
        className={cn(
          isDesktopLayout
            ? "px-4 py-6 sm:px-6 lg:px-8"
            : "flex-1 min-h-0 overflow-hidden px-3 pt-3 pb-14"
        )}
      >
        {/* File Type Support Information Banner — desktop only */}
        <div className="mb-3 hidden xl:block rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
              <Info className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-sky-900">
                {t("documentManagement.previewBannerTitle")}
              </h3>
              <p className="truncate text-xs text-sky-800">
                {t("documentManagement.previewBannerSubtitle")}
              </p>
            </div>
          </div>
        </div>
        {/* ── MOBILE / TABLET LAYOUT (< 1280px) ── */}
        {!isDesktopLayout && (
          <div className="flex h-full min-h-0 flex-col">
            {mobileTab === "library" && (
              <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white shadow-md overflow-hidden">
                <button
                  type="button"
                  className="shrink-0 flex w-full items-center justify-between border-b px-3 py-2.5 text-left"
                  onClick={() => setIsLibraryHeaderCollapsed(p => !p)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {t("documentManagement.libraryPanelTitle")}
                    </span>
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-300 bg-slate-50 text-[11px]"
                    >
                      {getCurrentScopeLabel(queryState.scope)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-white text-[11px] text-slate-500"
                    >
                      {t("documentManagement.itemsCount", {
                        count: documents.length,
                      })}
                    </Badge>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-slate-400 transition-transform duration-200",
                      isLibraryHeaderCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </button>
                {!isLibraryHeaderCollapsed && (
                  <div className="shrink-0 border-b px-3 pb-2 pt-2">
                    <DocumentLibraryTabs
                      value={queryState.scope}
                      onChange={handleScopeChange}
                    />
                  </div>
                )}
                {queryState.scope === "private_vault" ? (
                  renderPrivateVaultGate()
                ) : queryState.scope === "trash" ? (
                  <div className="flex-1 overflow-y-auto p-3">
                    <TrashPanel />
                  </div>
                ) : queryState.scope === "my_drive" ? (
                  <div className="flex-1 overflow-y-auto p-3">
                    <GoogleDriveBrowser
                      onImportFile={handleImportFromDrive}
                      importingFileId={importingDriveFileId}
                    />
                  </div>
                ) : queryState.scope === "my_onedrive" ? (
                  <div className="flex-1 overflow-y-auto p-3">
                    <OneDriveBrowser
                      onImportFile={handleImportFromDrive}
                      importingFileId={importingDriveFileId}
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 gap-2">
                    {/* Mobile folder breadcrumb + toolbar */}
                    {queryState.scope === "my_library" && (
                      <div className="shrink-0 space-y-1.5">
                        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-600">
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100"
                            onClick={() => navigateToFolder(null)}
                          >
                            <Home className="h-3 w-3" />
                            <span>
                              {t("documentManagement.scope.myLibrary")}
                            </span>
                          </button>
                          {folderPath.map((seg, idx) => (
                            <span
                              key={seg.id}
                              className="flex items-center gap-1"
                            >
                              <ChevronRight className="h-3 w-3 text-slate-400" />
                              <button
                                type="button"
                                className={cn(
                                  "truncate max-w-[100px] rounded px-1 py-0.5 hover:bg-slate-100",
                                  idx === folderPath.length - 1 &&
                                    "font-semibold text-slate-900"
                                )}
                                onClick={() => navigateToFolder(seg.id)}
                              >
                                {seg.title}
                              </button>
                            </span>
                          ))}
                        </nav>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-lg px-2 text-xs"
                            onClick={() => setIsCreateFolderOpen(true)}
                          >
                            <FolderPlus className="h-3 w-3" />
                            {t("documentManagement.newFolder")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-lg px-2 text-xs"
                            onClick={() => setIsShareLibraryOpen(true)}
                            disabled={currentFolderId == null}
                            title={
                              currentFolderId == null
                                ? t("documentManagement.openFolderToShare")
                                : undefined
                            }
                          >
                            <Share2 className="h-3 w-3" />
                            {t("documentManagement.shareFolder")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Mobile batch-delete bar */}
                    {selectedItemIds.size > 0 && (
                      <div className="shrink-0 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
                        <span className="text-xs font-medium text-red-700">
                          {t("documentManagement.selectedCount", {
                            count: selectedItemIds.size,
                          })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => setSelectedItemIds(new Set())}
                          >
                            {t("clear")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 gap-1 text-xs"
                            onClick={handleBatchDelete}
                            disabled={deleteItemsMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                            {t("documentManagement.scope.trash")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {knowledgeVaultScopeSupported ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-3.5 py-3.5 text-left shadow-sm"
                        onClick={() => setMobileTab("knowledge")}
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          Open Knowledge workspace
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">
                          Explore graph, backlinks, shared tags, semantic
                          related notes, and memory packs for markdown notes.
                        </div>
                        {selectedMarkdownItem ? (
                          <div className="mt-2 inline-flex max-w-full rounded-full border border-sky-200 bg-white/80 px-2.5 py-1 text-[11px] text-sky-700">
                            <span className="truncate">
                              Current note: {selectedMarkdownItem.title}
                            </span>
                          </div>
                        ) : null}
                      </button>
                    ) : null}

                    <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 shadow-sm">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="relative sm:col-span-2">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="h-9 rounded-xl border-slate-300 bg-white pl-9"
                            placeholder={t("documentManagement.searchFiles")}
                            value={queryState.query}
                            onChange={event =>
                              setQueryState(prev => ({
                                ...prev,
                                query: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <Select
                          value={queryState.sort}
                          onValueChange={value =>
                            setQueryState(prev => ({
                              ...prev,
                              sort: value as DocumentQueryState["sort"],
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 rounded-xl border-slate-300 bg-white text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="updated_desc">
                              {t("documentManagement.sort.updatedDesc")}
                            </SelectItem>
                            <SelectItem value="created_desc">
                              {t("documentManagement.sort.createdDesc")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={queryState.itemType ?? "all"}
                          onValueChange={value =>
                            setQueryState(prev => ({
                              ...prev,
                              itemType: value === "all" ? undefined : value,
                            }))
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-9 rounded-xl border-slate-300 bg-white text-xs",
                              queryState.itemType &&
                                "border-sky-400 bg-sky-50 text-sky-700"
                            )}
                          >
                            <SelectValue
                              placeholder={t(
                                "documentManagement.fileType.allTypes"
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {t("documentManagement.fileType.allTypes")}
                            </SelectItem>
                            <SelectItem value="image">
                              {t("documentManagement.fileType.image")}
                            </SelectItem>
                            <SelectItem value="video">
                              {t("documentManagement.fileType.video")}
                            </SelectItem>
                            <SelectItem value="audio">
                              {t("documentManagement.fileType.audio")}
                            </SelectItem>
                            <SelectItem value="md">
                              {t("documentManagement.fileType.markdown")}
                            </SelectItem>
                            <SelectItem value="document">
                              {t("documentManagement.fileType.document")}
                            </SelectItem>
                            <SelectItem value="spreadsheet">
                              {t("documentManagement.fileType.spreadsheet")}
                            </SelectItem>
                            <SelectItem value="presentation">
                              {t("documentManagement.fileType.presentation")}
                            </SelectItem>
                            <SelectItem value="pdf">
                              {t("documentManagement.fileType.pdf")}
                            </SelectItem>
                            <SelectItem value="text">
                              {t("documentManagement.fileType.text")}
                            </SelectItem>
                            <SelectItem value="file">
                              {t("documentManagement.fileType.other")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {QUICK_MEDIA_FILTERS.map(filter => {
                          const isActive =
                            (queryState.itemType ?? "all") === filter.value;
                          return (
                            <button
                              key={filter.value}
                              type="button"
                              className={cn(
                                "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                                "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100",
                                isActive &&
                                  "border-sky-400 bg-sky-50 text-sky-700"
                              )}
                              onClick={() =>
                                setQueryState(prev => ({
                                  ...prev,
                                  itemType:
                                    filter.value === "all"
                                      ? undefined
                                      : filter.value,
                                }))
                              }
                            >
                              {t(filter.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                      {activeDocumentError && (
                        <div className="mb-2 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          Failed to load: {activeDocumentError.message}
                        </div>
                      )}
                      <DocumentGridList
                        items={documents}
                        selectedId={selectedId}
                        isLoading={activeDocumentLoading}
                        className="flex-1 min-h-0"
                        emptyMessage={
                          currentFolderId
                            ? t("documentManagement.emptyFolder")
                            : t("documentManagement.noDocumentsMatch")
                        }
                        onSelect={item => {
                          setPendingAutoSelectId(null);
                          setProvisionalSelectedItem(null);
                          openEditorTab(item, { scope: queryState.scope });
                        }}
                        onOpen={item => {
                          setPendingAutoSelectId(null);
                          setProvisionalSelectedItem(null);
                          openEditorTab(item, { scope: queryState.scope });
                        }}
                        onDelete={handleDeleteItemWithFolderCheck}
                        onFolderOpen={handleFolderOpen}
                        selectedIds={selectedItemIds}
                        onSelectionChange={setSelectedItemIds}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {mobileTab === "knowledge" && (
              <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/70 shadow-md">
                <div className="sticky top-0 z-10 shrink-0 border-b bg-white/95 px-3 pt-3 pb-3 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                        onClick={() => setMobileTab("library")}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t("documentManagement.libraryPanelTitle")}
                      </button>
                      <span className="text-sm font-semibold text-slate-900">
                        Knowledge
                      </span>
                    </div>
                    {selectedMarkdownItem ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                      >
                        Markdown note
                      </Badge>
                    ) : null}
                  </div>
                  {selectedMarkdownItem ? (
                    <div className="mt-2 max-w-full text-sm font-medium text-slate-900">
                      <span className="line-clamp-2">
                        {selectedMarkdownItem.title}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {knowledgeVaultAvailability.quickSwitcher ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full"
                        onClick={() => setIsKnowledgeQuickSwitcherOpen(true)}
                      >
                        <Search className="mr-2 h-3.5 w-3.5" />
                        Quick switch
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => handleKnowledgeModeChange("graph")}
                      disabled={!knowledgeVaultAvailability.graph}
                    >
                      <GitBranch className="mr-2 h-3.5 w-3.5" />
                      Graph
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => setMobileTab("editor")}
                    >
                      <FileText className="mr-2 h-3.5 w-3.5" />
                      Open editor
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                  {renderKnowledgeVaultNavigation()}
                  {renderKnowledgeNoteSpotlight()}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2.5">
                    {showKnowledgeVaultNavigation ? (
                      renderKnowledgeVaultContent()
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">
                        Knowledge tools are not available for this scope yet.
                        Open a markdown note in your library to continue.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {mobileTab === "editor" && (
              <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white shadow-md overflow-hidden">
                <div className="shrink-0 flex items-center justify-between border-b px-3 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      onClick={() => setMobileTab("library")}
                      title={t("documentManagement.backToLibrary")}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t("documentManagement.libraryPanelTitle")}
                    </button>
                    <span className="text-sm font-semibold text-slate-900">
                      {t("documentManagement.editorTitle")}
                    </span>
                  </div>
                  {hasUnsavedTabs ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {t("documentManagement.unsavedChanges")}
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 flex gap-2 overflow-x-auto border-b px-3 py-2">
                  {openEditorTabs.length ? (
                    openEditorTabs.map(tab => {
                      const isActive = tab.id === selectedId;
                      const isDirty = isEditorTabDirty(tab.id);
                      return (
                        <div
                          key={tab.id}
                          className={`flex min-w-[160px] shrink-0 items-center rounded-xl border ${
                            isActive
                              ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                              : "border-slate-200 bg-slate-50/70 text-slate-700"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
                            onClick={() => activateEditorTab(tab.id)}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate text-xs">
                              {tab.title}
                            </span>
                            {isDirty ? (
                              <span className="shrink-0 text-xs font-semibold text-amber-600">
                                *
                              </span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            className="rounded-r-xl px-2 py-2 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                            onClick={event => {
                              event.stopPropagation();
                              closeEditorTab(tab.id);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      {t("documentManagement.openFromLibraryTab")}
                    </div>
                  )}
                </div>
                <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2">
                  {renderKnowledgeNoteSpotlight()}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <DocumentPreviewPanel
                      key={selectedPreviewPanelKey}
                      item={selectedItem}
                      previewType={previewType}
                      previewText={previewText}
                      initialEditorTemplate="page"
                      markdownValue={selectedMarkdownValue}
                      markdownUpdatedAt={selectedMarkdownUpdatedAt}
                      markdownError={markdownError}
                      isMarkdownSaving={saveMarkdownMutation.isPending}
                      isRenamingTitle={updateItemMutation.isPending}
                      documentId={selectedItem?.id}
                      shareUrl={selectedShareUrl}
                      onMarkdownChange={value => {
                        if (!selectedItem) return;
                        const docId = selectedItem.id;
                        setMarkdownDraftByDocId(prev => {
                          const current = prev[docId];
                          const fallbackUpdatedAt = selectedItem.updated_at;
                          return {
                            ...prev,
                            [docId]: {
                              value,
                              savedValue: current?.savedValue ?? "",
                              updatedAt:
                                current?.updatedAt ?? fallbackUpdatedAt,
                            },
                          };
                        });
                      }}
                      onMarkdownSave={handleSaveMarkdown}
                      onVersionRestore={handleVersionRestore}
                      onRenameTitle={handleRenameDocument}
                      onReplaceFile={
                        previewType !== "markdown"
                          ? handleReplaceFile
                          : undefined
                      }
                      isReplacingFile={replaceFileMutation.isPending}
                      onOpenWikiLink={handleOpenWikiLink}
                      knowledgeBacklinks={selectedKnowledgeBacklinks}
                      onOpenKnowledgeItem={openKnowledgeItem}
                    />
                    {!selectedItem && selectedItemQuery.isLoading ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        {t("documentManagement.loadingDocument")}
                      </div>
                    ) : null}
                    {!selectedItem && !selectedItemQuery.isLoading ? (
                      <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                        <FolderOpen className="h-4 w-4" />
                        {t("documentManagement.openFromLibraryTab")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── DESKTOP LAYOUT (≥ 1280px) — unchanged ── */}
        {isDesktopLayout && (
          <div
            ref={desktopLayoutRef}
            className="flex flex-col gap-4 xl:h-[calc(100vh-140px)] xl:min-h-0 xl:flex-row"
          >
            {isLibraryPanelOpen ? (
              <aside
                ref={previewSectionRef}
                className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 shadow-md transition-all duration-300 xl:shrink-0"
                style={
                  isDesktopLayout
                    ? { width: `${libraryPanelWidth}px` }
                    : undefined
                }
              >
                <button
                  type="button"
                  className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setIsLibraryHeaderCollapsed(p => !p)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-slate-900">
                        {t("documentManagement.libraryPanelTitle")}
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-300 bg-slate-50 text-[11px]"
                      >
                        {getCurrentScopeLabel(queryState.scope)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-200 bg-white text-[11px] text-slate-500"
                      >
                        {t("documentManagement.itemsCount", {
                          count: documents.length,
                        })}
                      </Badge>
                    </div>
                    {activeDocumentLoading || activeDocumentError ? (
                      <div className="text-xs text-slate-500">
                        {activeDocumentLoading
                          ? t("loading")
                          : `${t("error")}: ${activeDocumentError?.message}`}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-slate-400 transition-transform duration-200",
                        isLibraryHeaderCollapsed ? "-rotate-90" : "rotate-0"
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                      onClick={e => {
                        e.stopPropagation();
                        setIsLibraryPanelOpen(false);
                      }}
                      title={t("documentManagement.hideLibrary")}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </button>

                {!isLibraryHeaderCollapsed && (
                  <div className="mb-4">
                    <DocumentLibraryTabs
                      value={queryState.scope}
                      onChange={handleScopeChange}
                    />
                  </div>
                )}

                {queryState.scope === "private_vault" ? (
                  renderPrivateVaultGate()
                ) : queryState.scope === "trash" ? (
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
                    {/* Folder breadcrumb + toolbar */}
                    {queryState.scope === "my_library" && (
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/75 px-3 py-2">
                        {/* Breadcrumb */}
                        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-slate-600">
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => navigateToFolder(null)}
                          >
                            <Home className="h-3.5 w-3.5" />
                            <span>
                              {t("documentManagement.scope.myLibrary")}
                            </span>
                          </button>
                          {folderPath.map((seg, idx) => (
                            <span
                              key={seg.id}
                              className="flex items-center gap-1"
                            >
                              <ChevronRight className="h-3 w-3 text-slate-400" />
                              <button
                                type="button"
                                className={cn(
                                  "truncate rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900",
                                  idx === folderPath.length - 1 &&
                                    "font-semibold text-slate-900"
                                )}
                                onClick={() => navigateToFolder(seg.id)}
                              >
                                {seg.title}
                              </button>
                            </span>
                          ))}
                        </nav>
                        {/* Folder action buttons */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                            onClick={() => setIsCreateFolderOpen(true)}
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                            {t("documentManagement.newFolder")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                            onClick={() => setIsShareLibraryOpen(true)}
                            disabled={currentFolderId == null}
                            title={
                              currentFolderId == null
                                ? t("documentManagement.openFolderToShare")
                                : undefined
                            }
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            {t("documentManagement.shareFolder")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Batch-delete bar */}
                    {selectedItemIds.size > 0 && (
                      <div className="mb-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <span className="text-sm font-medium text-red-700">
                          {t("documentManagement.selectedCount", {
                            count: selectedItemIds.size,
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-slate-600"
                            onClick={() => setSelectedItemIds(new Set())}
                          >
                            {t("clear")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 gap-1.5 text-xs"
                            onClick={handleBatchDelete}
                            disabled={deleteItemsMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("documentManagement.moveToTrash")}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="relative sm:col-span-2">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="h-9 rounded-xl border-slate-300 bg-white pl-9"
                            placeholder={t("documentManagement.searchFiles")}
                            value={queryState.query}
                            onChange={event =>
                              setQueryState(prev => ({
                                ...prev,
                                query: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <Select
                          value={queryState.sort}
                          onValueChange={value =>
                            setQueryState(prev => ({
                              ...prev,
                              sort: value as DocumentQueryState["sort"],
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 rounded-xl border-slate-300 bg-white text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="updated_desc">
                              {t("documentManagement.sort.updatedDesc")}
                            </SelectItem>
                            <SelectItem value="created_desc">
                              {t("documentManagement.sort.createdDesc")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={queryState.itemType ?? "all"}
                          onValueChange={value =>
                            setQueryState(prev => ({
                              ...prev,
                              itemType: value === "all" ? undefined : value,
                            }))
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-9 rounded-xl border-slate-300 bg-white text-xs",
                              queryState.itemType &&
                                "border-sky-400 bg-sky-50 text-sky-700"
                            )}
                          >
                            <SelectValue
                              placeholder={t(
                                "documentManagement.fileType.allTypes"
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {t("documentManagement.fileType.allTypes")}
                            </SelectItem>
                            <SelectItem value="image">
                              {t("documentManagement.fileType.image")}
                            </SelectItem>
                            <SelectItem value="video">
                              {t("documentManagement.fileType.video")}
                            </SelectItem>
                            <SelectItem value="audio">
                              {t("documentManagement.fileType.audio")}
                            </SelectItem>
                            <SelectItem value="md">
                              {t("documentManagement.fileType.markdown")}
                            </SelectItem>
                            <SelectItem value="document">
                              {t("documentManagement.fileType.document")}
                            </SelectItem>
                            <SelectItem value="spreadsheet">
                              {t("documentManagement.fileType.spreadsheet")}
                            </SelectItem>
                            <SelectItem value="presentation">
                              {t("documentManagement.fileType.presentation")}
                            </SelectItem>
                            <SelectItem value="pdf">
                              {t("documentManagement.fileType.pdf")}
                            </SelectItem>
                            <SelectItem value="text">
                              {t("documentManagement.fileType.text")}
                            </SelectItem>
                            <SelectItem value="file">
                              {t("documentManagement.fileType.other")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {QUICK_MEDIA_FILTERS.map(filter => {
                          const isActive =
                            (queryState.itemType ?? "all") === filter.value;
                          return (
                            <button
                              key={filter.value}
                              type="button"
                              className={cn(
                                "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                                "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100",
                                isActive &&
                                  "border-sky-400 bg-sky-50 text-sky-700"
                              )}
                              onClick={() =>
                                setQueryState(prev => ({
                                  ...prev,
                                  itemType:
                                    filter.value === "all"
                                      ? undefined
                                      : filter.value,
                                }))
                              }
                            >
                              {t(filter.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {renderKnowledgeMiniPanel()}
                      {activeDocumentError && (
                        <div className="text-sm text-destructive px-4 py-2 mb-2 rounded bg-destructive/10">
                          Failed to load documents:{" "}
                          {activeDocumentError.message}
                        </div>
                      )}
                      <DocumentGridList
                        items={documents}
                        selectedId={selectedId}
                        isLoading={activeDocumentLoading}
                        className="flex-1 min-h-0"
                        emptyMessage={
                          currentFolderId
                            ? t("documentManagement.emptyFolder")
                            : t("documentManagement.noDocumentsMatch")
                        }
                        onSelect={item => {
                          setPendingAutoSelectId(null);
                          setProvisionalSelectedItem(null);
                          openEditorTab(item, { scope: queryState.scope });
                        }}
                        onOpen={item => {
                          setPendingAutoSelectId(null);
                          setProvisionalSelectedItem(null);
                          openEditorTab(item, { scope: queryState.scope });
                        }}
                        onDelete={handleDeleteItemWithFolderCheck}
                        onFolderOpen={handleFolderOpen}
                        selectedIds={selectedItemIds}
                        onSelectionChange={setSelectedItemIds}
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
                  onClick={() => setIsLibraryPanelOpen(true)}
                  title={t("documentManagement.showLibrary")}
                >
                  <ChevronsRight className="h-6 w-6 text-sky-600" />
                </Button>
              </div>
            )}

            {isLibraryPanelOpen &&
            !isEditorPanelCollapsed &&
            isDesktopLayout ? (
              <div
                className="hidden cursor-col-resize items-stretch justify-center rounded-full transition-colors hover:bg-sky-100 xl:flex"
                style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
                onMouseDown={event => beginHorizontalResize(event, "library")}
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
                    <div className="text-base font-semibold text-slate-900">
                      {t("documentManagement.editorTitle")}
                    </div>
                    {hasUnsavedTabs ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                        {t("documentManagement.unsavedChanges")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                      onClick={() => setIsLibraryPanelOpen(prev => !prev)}
                      title={
                        isLibraryPanelOpen
                          ? t("documentManagement.hideLibrary")
                          : t("documentManagement.showLibrary")
                      }
                    >
                      {isLibraryPanelOpen ? (
                        <ChevronsLeft className="h-4 w-4 text-slate-600" />
                      ) : (
                        <ChevronsRight className="h-4 w-4 text-slate-600" />
                      )}
                    </Button>
                    {knowledgeVaultScopeSupported ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                        onClick={() => setIsKnowledgePanelOpen(prev => !prev)}
                        title={
                          isKnowledgePanelOpen
                            ? "Hide Knowledge Vault"
                            : "Show Knowledge Vault"
                        }
                      >
                        <GitBranch className="h-4 w-4 text-slate-600" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mb-3 flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
                  {openEditorTabs.length ? (
                    openEditorTabs.map(tab => {
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
                              <span className="shrink-0 text-xs font-semibold text-amber-600">
                                *
                              </span>
                            ) : null}
                            <Badge
                              variant="outline"
                              className={`ml-1 shrink-0 text-[10px] ${
                                isActive
                                  ? "border-sky-500/60 bg-white/70 text-sky-800"
                                  : "border-slate-300 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {getEditorTabScopeLabel(tab)}
                            </Badge>
                          </button>
                          <button
                            type="button"
                            className="rounded-r-xl px-2.5 py-2.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                            onClick={event => {
                              event.stopPropagation();
                              closeEditorTab(tab.id);
                            }}
                            aria-label={`Close ${tab.title}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      {t("documentManagement.noOpenDocuments")}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
                    <DocumentPreviewPanel
                      key={selectedPreviewPanelKey}
                      item={selectedItem}
                      previewType={previewType}
                      previewText={previewText}
                      initialEditorTemplate="page"
                      markdownValue={selectedMarkdownValue}
                      markdownUpdatedAt={selectedMarkdownUpdatedAt}
                      markdownError={markdownError}
                      isMarkdownSaving={saveMarkdownMutation.isPending}
                      isRenamingTitle={updateItemMutation.isPending}
                      documentId={selectedItem?.id}
                      shareUrl={selectedShareUrl}
                      onMarkdownChange={value => {
                        if (!selectedItem) return;
                        const docId = selectedItem.id;
                        setMarkdownDraftByDocId(prev => {
                          const current = prev[docId];
                          const fallbackUpdatedAt = selectedItem.updated_at;
                          return {
                            ...prev,
                            [docId]: {
                              value,
                              savedValue: current?.savedValue ?? "",
                              updatedAt:
                                current?.updatedAt ?? fallbackUpdatedAt,
                            },
                          };
                        });
                      }}
                      onMarkdownSave={handleSaveMarkdown}
                      onVersionRestore={handleVersionRestore}
                      onEnterEditMode={() => {
                        /* No-op: preview panel removed in S10; surface manages mode internally */
                      }}
                      onRenameTitle={handleRenameDocument}
                      onReplaceFile={
                        previewType !== "markdown"
                          ? handleReplaceFile
                          : undefined
                      }
                      isReplacingFile={replaceFileMutation.isPending}
                      onOpenWikiLink={handleOpenWikiLink}
                      knowledgeBacklinks={selectedKnowledgeBacklinks}
                      onOpenKnowledgeItem={openKnowledgeItem}
                    />
                    {!selectedItem && selectedItemQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">
                        {t("documentManagement.loadingDocument")}
                      </div>
                    ) : null}
                    {!selectedItem && !selectedItemQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FolderOpen className="h-4 w-4" />
                        {t("documentManagement.noDocumentSelected")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : (
              <div className="flex min-w-0 flex-1 items-center justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                  onClick={() => setIsEditorPanelCollapsed(false)}
                  title={t("documentManagement.showEditor")}
                >
                  <FileText className="h-6 w-6 text-slate-600" />
                </Button>
              </div>
            )}

            {knowledgeVaultScopeSupported &&
            isKnowledgePanelOpen &&
            isDesktopLayout ? (
              <div
                className="hidden cursor-col-resize items-stretch justify-center rounded-full transition-colors hover:bg-sky-100 xl:flex"
                style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
                onMouseDown={event => beginHorizontalResize(event, "knowledge")}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize editor and knowledge panels"
              >
                <div className="my-6 w-px rounded-full bg-slate-300" />
              </div>
            ) : null}

            {knowledgeVaultScopeSupported ? (
              isKnowledgePanelOpen ? (
                <aside
                  className="flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 shadow-md transition-all duration-300 xl:min-h-0 xl:shrink-0"
                  style={
                    isDesktopLayout
                      ? { width: `${knowledgePanelWidth}px` }
                      : undefined
                  }
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                          <GitBranch className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-slate-900">
                            Knowledge Vault
                          </div>
                          <div className="text-xs text-slate-500">
                            Backlinks, graph, tags, memory packs, and reviewed
                            note context.
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors"
                      onClick={() => setIsKnowledgePanelOpen(false)}
                      title="Collapse Knowledge Vault"
                    >
                      <ChevronsRight className="h-4 w-4 text-slate-600" />
                    </Button>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {knowledgeVaultAvailability.quickSwitcher ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full"
                        onClick={() => setIsKnowledgeQuickSwitcherOpen(true)}
                      >
                        <Search className="mr-2 h-3.5 w-3.5" />
                        Quick switch
                      </Button>
                    ) : null}
                    {selectedMarkdownItem ? (
                      <Badge
                        variant="outline"
                        className="max-w-full rounded-full border-sky-200 bg-sky-50 text-sky-700"
                        title={selectedMarkdownItem.title}
                      >
                        <span className="truncate">
                          {selectedMarkdownItem.title}
                        </span>
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {renderKnowledgeNoteSpotlight()}
                      {renderKnowledgeVaultNavigation()}
                      {showKnowledgeVaultNavigation ? (
                        knowledgeVaultMode === "browse" ? (
                          renderKnowledgeVaultBrowseState()
                        ) : (
                          renderKnowledgeVaultContent()
                        )
                      ) : (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500 shadow-sm">
                          Knowledge tools are not available for this scope yet.
                          Open a markdown note in your library to continue.
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              ) : (
                <div className="flex items-center justify-center xl:w-[72px] xl:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                    onClick={() => setIsKnowledgePanelOpen(true)}
                    title="Show Knowledge Vault"
                  >
                    <GitBranch className="h-6 w-6 text-sky-600" />
                  </Button>
                </div>
              )
            ) : null}
          </div>
        )}{" "}
        {/* end isDesktopLayout */}
      </main>

      {/* ── MOBILE / TABLET BOTTOM TAB BAR ── */}
      {!isDesktopLayout && (
        <div className="fixed bottom-0 left-0 right-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 border-t bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md">
          {(
            [
              {
                tab: "library",
                Icon: FolderOpen,
                label: t("documentManagement.libraryPanelTitle"),
              },
              ...(knowledgeVaultScopeSupported
                ? [
                    {
                      tab: "knowledge",
                      Icon: GitBranch,
                      label: "Knowledge",
                    } as const,
                  ]
                : []),
              {
                tab: "editor",
                Icon: FileText,
                label: t("documentManagement.editorTitle"),
              },
            ] as const
          ).map(({ tab, Icon, label }) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                mobileTab === tab
                  ? "text-sky-600"
                  : "text-slate-500 hover:text-slate-700"
              )}
              onClick={() => setMobileTab(tab)}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
