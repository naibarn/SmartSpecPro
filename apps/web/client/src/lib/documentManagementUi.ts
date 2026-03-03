export const DOCUMENT_MANAGEMENT_ROUTE = "/document-management";

export type DocumentScopeTab = "my_library" | "my_drive" | "my_onedrive" | "shared_with_me" | "shared_groups" | "trash";
export type DocumentSortOrder = "updated_desc" | "created_desc";
export type DocumentViewMode = "library" | "editor";
export type DocumentAccessSource = "owner" | "shared_direct" | "shared_group";
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
  query: string;
  itemType?: string;
  status?: string;
  docId?: number;
  folderId?: number | null;
}

export const DEFAULT_DOCUMENT_QUERY_STATE: DocumentQueryState = {
  scope: "my_library",
  sort: "updated_desc",
  viewMode: "library",
  query: "",
};

export function parseDocumentQueryState(search: string): DocumentQueryState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const mode = params.get("mode");
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
      scope === "trash" ||
      scope === "my_drive" ||
      scope === "my_onedrive"
        ? scope
        : "my_library",
    sort: sort === "created_desc" ? "created_desc" : "updated_desc",
    viewMode: mode === "editor" ? "editor" : "library",
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
