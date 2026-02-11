export const DOCUMENT_MANAGEMENT_ROUTE = "/document-management";

export type DocumentScopeTab = "my_library" | "shared_with_me" | "shared_groups";
export type DocumentSortOrder = "updated_desc" | "created_desc";
export type DocumentAccessSource = "owner" | "shared_direct" | "shared_group";
export type DocumentPreviewType =
  | "markdown"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "json"
  | "html"
  | "fallback";

export interface DocumentLibraryItem {
  id: number;
  item_type: string;
  title: string;
  source: string;
  source_url: string | null;
  metadata?: Record<string, unknown>;
  access_source: DocumentAccessSource;
  status: "draft" | "ready" | "indexing" | "archived" | "failed";
  updated_at: string;
  created_at: string;
}

export interface DocumentQueryState {
  scope: DocumentScopeTab;
  sort: DocumentSortOrder;
  query: string;
  itemType?: string;
  status?: string;
}

export const DEFAULT_DOCUMENT_QUERY_STATE: DocumentQueryState = {
  scope: "my_library",
  sort: "updated_desc",
  query: "",
};

export function parseDocumentQueryState(search: string): DocumentQueryState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const query = params.get("q") || "";
  const itemType = params.get("type") || undefined;
  const status = params.get("status") || undefined;

  return {
    scope: scope === "shared_with_me" || scope === "shared_groups" ? scope : "my_library",
    sort: sort === "created_desc" ? "created_desc" : "updated_desc",
    query,
    itemType,
    status,
  };
}

export function buildDocumentQueryString(state: DocumentQueryState): string {
  const params = new URLSearchParams();
  params.set("scope", state.scope);
  params.set("sort", state.sort);
  if (state.query.trim()) {
    params.set("q", state.query.trim());
  }
  if (state.itemType) {
    params.set("type", state.itemType);
  }
  if (state.status) {
    params.set("status", state.status);
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
  if (ext === "md" || ext === "markdown") return "markdown";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "image"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "mkv", "avi", "video"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "audio"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt", "csv", "log", "text"].includes(ext)) return "text";
  if (ext === "json") return "json";
  if (["html", "htm"].includes(ext)) return "html";
  return "fallback";
}
