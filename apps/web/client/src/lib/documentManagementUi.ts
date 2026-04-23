export const DOCUMENT_MANAGEMENT_ROUTE = "/document-management";
export const PUBLIC_DOCUMENT_SHARE_ROUTE = "/share";

export type DocumentScopeTab = "my_library" | "private_vault" | "my_drive" | "my_onedrive" | "shared_with_me" | "shared_groups" | "trash";
export type DocumentSortOrder = "updated_desc" | "created_desc";
export type DocumentViewMode = "library" | "editor";
export type DocumentAccessSource = "owner" | "shared_direct" | "shared_group";
export type KnowledgeVaultMode =
  | "browse"
  | "related"
  | "properties"
  | "views"
  | "graph"
  | "canvas"
  | "memory_packs";
export type DocumentPreviewType =
  | "markdown"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "excel"
  | "office"
  | "code"
  | "csv"
  | "json"
  | "text"
  | "html"
  | "xml"
  | "fallback";

export interface DocumentLibraryItem {
  id: number;
  item_type: string;
  title: string;
  description?: string | null;
  source: string;
  source_url: string | null;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown>;
  access_source: DocumentAccessSource;
  status: "draft" | "ready" | "indexing" | "archived" | "failed";
  updated_at: string;
  created_at: string;
  parent_id?: number | null;
}

export interface DocumentQueryState {
  scope: DocumentScopeTab;
  sort: DocumentSortOrder;
  viewMode: DocumentViewMode;
  knowledgeMode: KnowledgeVaultMode;
  query: string;
  itemType?: string;
  status?: string;
  docId?: number;
  folderId?: number | null;
}

export interface KnowledgeVaultSurfaceAvailability {
  quickSwitcher: boolean;
  inspector: boolean;
  savedViews: boolean;
  contextPacks: boolean;
  graph: boolean;
  canvas: boolean;
}

export interface KnowledgeVaultNavigationMode {
  mode: KnowledgeVaultMode;
  label: string;
  description: string;
  enabled: boolean;
}

export const KNOWLEDGE_VAULT_NAVIGATION_MODES: KnowledgeVaultNavigationMode[] = [
  {
    mode: "browse",
    label: "Browse",
    description: "Browse Markdown files and folders.",
    enabled: true,
  },
  {
    mode: "related",
    label: "Related",
    description: "Inspect backlinks, outgoing links, mentions, and local context.",
    enabled: true,
  },
  {
    mode: "properties",
    label: "Fields",
    description: "Explore tags, aliases, and frontmatter-style properties.",
    enabled: true,
  },
  {
    mode: "views",
    label: "Saved Views",
    description: "Open curated saved views for repeatable knowledge workflows.",
    enabled: true,
  },
  {
    mode: "graph",
    label: "Graph",
    description: "Navigate safe visual relationships without expanding runtime context.",
    enabled: true,
  },
  {
    mode: "canvas",
    label: "Canvas Boards",
    description: "Inspect and organize lightweight boards for planning and synthesis.",
    enabled: true,
  },
  {
    mode: "memory_packs",
    label: "Memory Packs",
    description: "Curate approved context packs for agent and skill runtime.",
    enabled: true,
  },
];

export function getKnowledgeVaultNavigationModes(
  availability: KnowledgeVaultSurfaceAvailability,
): KnowledgeVaultNavigationMode[] {
  const modeEnabled: Record<KnowledgeVaultMode, boolean> = {
    browse: true,
    related: availability.inspector,
    properties: availability.inspector,
    views: availability.savedViews,
    graph: availability.graph,
    canvas: availability.canvas,
    memory_packs: availability.contextPacks,
  };

  return KNOWLEDGE_VAULT_NAVIGATION_MODES.map((mode) => ({
    ...mode,
    enabled: mode.enabled && modeEnabled[mode.mode],
  }));
}

export function resolveKnowledgeVaultMode(
  value: string | null | undefined,
  availability: KnowledgeVaultSurfaceAvailability,
): KnowledgeVaultMode {
  const candidate = KNOWLEDGE_VAULT_NAVIGATION_MODES.some(
    (mode) => mode.mode === value,
  )
    ? value as KnowledgeVaultMode
    : "browse";
  const enabledModes = getKnowledgeVaultNavigationModes(availability)
    .filter((mode) => mode.enabled)
    .map((mode) => mode.mode);

  return enabledModes.includes(candidate) ? candidate : "browse";
}

export function getKnowledgeVaultModeQueryParam(
  mode: KnowledgeVaultMode,
): string | null {
  return mode === "browse" ? null : mode;
}

export function toDocumentLibraryItem(item: any): DocumentLibraryItem {
  const normalizeDateIso = (value: unknown): string => {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date().toISOString();
  };

  return {
    id: Number(item?.id ?? item?.item_id),
    item_type: String(item?.itemType ?? item?.item_type ?? "document"),
    title: String(item?.title ?? "Untitled"),
    description: item?.description ?? null,
    source: String(item?.source ?? "document_management"),
    source_url: item?.sourceUrl ?? item?.source_url ?? null,
    thumbnail_url: item?.thumbnailUrl ?? item?.thumbnail_url ?? null,
    metadata: (item?.metadata ?? {}) as Record<string, unknown>,
    access_source: String(item?.access_source ?? "owner") as DocumentAccessSource,
    status: String(item?.status ?? "ready") as DocumentLibraryItem["status"],
    updated_at: normalizeDateIso(item?.updatedAt ?? item?.updated_at),
    created_at: normalizeDateIso(item?.createdAt ?? item?.created_at),
    parent_id: item?.parentId ?? item?.parent_id ?? null,
  };
}

export const DEFAULT_DOCUMENT_QUERY_STATE: DocumentQueryState = {
  scope: "my_library",
  sort: "updated_desc",
  viewMode: "library",
  knowledgeMode: "browse",
  query: "",
};

export function supportsKnowledgeVaultScope(
  scope: DocumentScopeTab,
): boolean {
  return (
    scope === "my_library"
    || scope === "private_vault"
    || scope === "shared_with_me"
    || scope === "shared_groups"
  );
}

export function parseDocumentQueryState(search: string): DocumentQueryState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const mode = params.get("mode");
  const knowledgeMode = params.get("kv");
  const docIdRaw = params.get("doc");
  const folderIdRaw = params.get("folder");
  const query = params.get("q") || "";
  const itemType = params.get("type") || undefined;
  const status = params.get("status") || undefined;
  const docIdParsed = docIdRaw ? Number.parseInt(docIdRaw, 10) : NaN;
  const docId = Number.isFinite(docIdParsed) && docIdParsed > 0 ? docIdParsed : undefined;
  const folderIdParsed = folderIdRaw ? Number.parseInt(folderIdRaw, 10) : NaN;
  const folderId = Number.isFinite(folderIdParsed) && folderIdParsed > 0 ? folderIdParsed : null;

  return {
    scope:
      scope === "shared_with_me" ||
      scope === "shared_groups" ||
      scope === "private_vault" ||
      scope === "trash" ||
      scope === "my_drive" ||
      scope === "my_onedrive"
        ? scope
        : "my_library",
    sort: sort === "created_desc" ? "created_desc" : "updated_desc",
    viewMode: mode === "editor" ? "editor" : "library",
    knowledgeMode:
      knowledgeMode === "related"
      || knowledgeMode === "properties"
      || knowledgeMode === "views"
      || knowledgeMode === "graph"
      || knowledgeMode === "canvas"
      || knowledgeMode === "memory_packs"
        ? knowledgeMode
        : "browse",
    query,
    itemType,
    status,
    docId,
    folderId,
  };
}

export function buildDocumentQueryString(state: DocumentQueryState): string {
  const params = new URLSearchParams();
  params.set("scope", state.scope);
  params.set("sort", state.sort);
  if (state.viewMode === "editor") {
    params.set("mode", "editor");
  }
  const knowledgeMode = getKnowledgeVaultModeQueryParam(state.knowledgeMode);
  if (knowledgeMode) {
    params.set("kv", knowledgeMode);
  }
  if (state.docId && Number.isFinite(state.docId) && state.docId > 0) {
    params.set("doc", String(state.docId));
  }
  if (state.query.trim()) {
    params.set("q", state.query.trim());
  }
  if (state.itemType) {
    params.set("type", state.itemType);
  }
  if (state.status) {
    params.set("status", state.status);
  }
  if (state.folderId != null) {
    params.set("folder", String(state.folderId));
  }
  return params.toString();
}

export function buildDocumentShareUrl(
  state: DocumentQueryState,
  docId: number,
  origin = "",
): string {
  const queryString = buildDocumentQueryString({
    ...state,
    viewMode: "editor",
    docId,
  });

  return `${origin}${DOCUMENT_MANAGEMENT_ROUTE}?${queryString}`;
}

export function buildPublicDocumentShareUrl(token: string, origin = ""): string {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return "";
  }

  return `${origin}${PUBLIC_DOCUMENT_SHARE_ROUTE}/${encodeURIComponent(normalizedToken)}`;
}

export function getDocumentAccessLabel(accessSource: DocumentAccessSource): string {
  switch (accessSource) {
    case "owner":
      return "Owner";
    case "shared_direct":
      return "Shared: Direct";
    case "shared_group":
      return "Shared: Group";
    default:
      return "Shared";
  }
}

export function getMarkdownPreviewFallbackContent(
  item: Pick<DocumentLibraryItem, "metadata"> | null | undefined,
): string {
  const metadata = item?.metadata;
  if (!metadata || Array.isArray(metadata)) {
    return "";
  }

  const extractedText =
    typeof metadata.extracted_text === "string"
      ? metadata.extracted_text
      : typeof metadata.extractedText === "string"
        ? metadata.extractedText
        : "";

  return extractedText.trim().length > 0 ? extractedText : "";
}

function getFileExtension(item: Pick<DocumentLibraryItem, "item_type" | "source_url" | "metadata">): string {
  const metadataExtension = typeof item.metadata?.extension === "string"
    ? item.metadata.extension
    : "";
  if (metadataExtension) {
    return metadataExtension.toLowerCase().replace(/^\./, "");
  }

  const sourceUrl = item.source_url || "";
  if (!sourceUrl) {
    return item.item_type.toLowerCase();
  }

  const withoutQuery = sourceUrl.split("?")[0];
  const parts = withoutQuery.split(".");
  if (parts.length < 2) {
    return item.item_type.toLowerCase();
  }

  return (parts.pop() || "").toLowerCase();
}

export function isMarkdownLibraryItem(item: Pick<DocumentLibraryItem, "item_type" | "source_url" | "metadata">): boolean {
  const ext = getFileExtension(item);
  return ext === "md" || ext === "markdown";
}

export function resolveDocumentPreviewType(
  item: Pick<DocumentLibraryItem, "item_type" | "source_url" | "metadata">,
): DocumentPreviewType {
  const ext = getFileExtension(item);

  // Markdown
  if (ext === "md" || ext === "markdown") return "markdown";

  // Media
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "image"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "mkv", "avi", "video"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "audio"].includes(ext)) return "audio";

  // Documents
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "xlsm", "xlsb", "ods"].includes(ext)) return "excel";
  if (["doc", "docx", "ppt", "pptx", "odt", "odp"].includes(ext)) return "office";

  // Data Formats
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (["xml", "svg"].includes(ext)) return "xml";

  // Code Files
  const codeExtensions = [
    "js", "jsx", "ts", "tsx", "py", "rb", "java", "cpp", "c", "cs", "go", "rs",
    "php", "swift", "kt", "scala", "sql", "sh", "bash", "zsh", "yml", "yaml",
    "css", "scss", "sass", "less", "dockerfile", "makefile", "r", "matlab",
    "lua", "perl", "dart", "graphql", "toml", "ini", "diff", "git", "vue",
    "svelte", "astro", "prisma", "proto"
  ];
  if (codeExtensions.includes(ext)) return "code";

  // Plain Text
  if (["txt", "log", "text"].includes(ext)) return "text";
  if (["html", "htm"].includes(ext)) return "html";

  return "fallback";
}
