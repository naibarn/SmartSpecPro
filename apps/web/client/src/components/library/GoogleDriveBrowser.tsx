import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  Cloud,
  Eye,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  kind: "folder" | "file";
  size: number;
  modifiedTime: string | null;
  webViewLink?: string | null;
  thumbnailLink?: string | null;
  iconLink?: string | null;
}

interface DriveFolderBreadcrumb {
  id: string;
  name: string;
}

interface DrivePreviewPayload {
  fileName: string;
  fileType: string;
  fileBase64: string;
  textPreview: string | null;
}

interface GoogleDriveBrowserProps {
  onImportFile: (fileId: string) => Promise<void> | void;
  importingFileId?: string | null;
}

const PAGE_SIZE = 100;

function buildDataUrl(fileType: string, fileBase64: string): string {
  return `data:${fileType};base64,${fileBase64}`;
}

function buildDrivePreviewUrl(item: DriveItem): string {
  const webViewLink = item.webViewLink?.trim();
  if (!webViewLink) {
    return `https://drive.google.com/file/d/${item.id}/preview`;
  }
  if (webViewLink.includes("/view")) {
    return webViewLink.replace("/view", "/preview");
  }
  return webViewLink;
}

export default function GoogleDriveBrowser({ onImportFile, importingFileId }: GoogleDriveBrowserProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [includeAllFiles, setIncludeAllFiles] = useState(false);
  const [folderPath, setFolderPath] = useState<DriveFolderBreadcrumb[]>([{ id: "root", name: "My Drive" }]);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [previewPayload, setPreviewPayload] = useState<DrivePreviewPayload | null>(null);
  const [previewFallbackUrl, setPreviewFallbackUrl] = useState<string | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);

  const statusQuery = trpc.googleDrive.getConnectionStatus.useQuery(undefined, { retry: false });
  const isConnected = statusQuery.data?.status === "connected";
  const currentFolder = folderPath[folderPath.length - 1];
  const currentFolderId = includeAllFiles ? null : (currentFolder?.id || "root");
  const resetKey = useMemo(
    () => `${includeAllFiles ? "all" : currentFolderId}:${debouncedQuery}`,
    [includeAllFiles, currentFolderId, debouncedQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setItems([]);
    setNextPageToken(null);
    setPageToken(undefined);
  }, [resetKey]);

  const listQuery = trpc.googleDrive.listDriveItems.useQuery(
    {
      parentFolderId: currentFolderId,
      includeAllFiles,
      query: debouncedQuery || undefined,
      pageToken,
      pageSize: PAGE_SIZE,
    },
    {
      enabled: isConnected,
    },
  );

  const previewMutation = trpc.googleDrive.getDriveFilePreview.useMutation();

  useEffect(() => {
    if (!listQuery.data) return;
    setNextPageToken(listQuery.data.nextPageToken || null);
    setItems((prev) => {
      if (!pageToken) {
        return listQuery.data.items;
      }
      const byId = new Map<string, DriveItem>();
      for (const item of prev) {
        byId.set(item.id, item);
      }
      for (const item of listQuery.data.items) {
        byId.set(item.id, item);
      }
      return Array.from(byId.values());
    });
  }, [listQuery.data, pageToken]);

  function openFolder(item: DriveItem) {
    if (item.kind !== "folder") return;
    setIncludeAllFiles(false);
    setFolderPath((prev) => [...prev, { id: item.id, name: item.name }]);
  }

  function goToBreadcrumb(index: number) {
    setIncludeAllFiles(false);
    setFolderPath((prev) => prev.slice(0, index + 1));
  }

  async function handlePreview(item: DriveItem) {
    try {
      setPreviewItem(item);
      setPreviewPayload(null);
      setPreviewFallbackUrl(null);
      setPreviewErrorMessage(null);
      setPreviewOpen(true);
      const payload = await previewMutation.mutateAsync({ fileId: item.id });
      setPreviewPayload(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load preview";
      const fallbackUrl = buildDrivePreviewUrl(item);
      setPreviewFallbackUrl(fallbackUrl);
      setPreviewErrorMessage(message);
      toast.warning("Showing Google Drive inline preview instead of local preview.");
    }
  }

  function renderPreviewBody() {
    if (previewMutation.isPending && !previewPayload) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      );
    }

    if (previewFallbackUrl) {
      return (
        <div className="space-y-3">
          {previewErrorMessage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {previewErrorMessage}
            </div>
          ) : null}
          <iframe
            title={`drive-web-preview-${previewItem?.id || "file"}`}
            src={previewFallbackUrl}
            className="h-full w-full rounded-xl border bg-white"
          />
        </div>
      );
    }

    if (!previewPayload) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {previewMutation.error?.message || "Preview is not available for this file yet."}
        </div>
      );
    }

    const normalizedType = previewPayload.fileType.toLowerCase();
    const dataUrl = buildDataUrl(previewPayload.fileType, previewPayload.fileBase64);

    if (normalizedType.startsWith("image/")) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl border bg-slate-50 p-2">
          <img src={dataUrl} alt={previewPayload.fileName} className="h-full w-full rounded-lg object-contain" />
        </div>
      );
    }

    if (normalizedType === "application/pdf") {
      return (
        <iframe
          title={`drive-preview-${previewItem?.id || "file"}`}
          src={dataUrl}
          className="h-full w-full rounded-xl border bg-white"
        />
      );
    }

    if (normalizedType.startsWith("audio/")) {
      return (
        <div className="rounded-xl border bg-slate-50 p-4">
          <audio src={dataUrl} controls className="w-full" />
        </div>
      );
    }

    if (normalizedType.startsWith("video/")) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl border bg-slate-50 p-2">
          <video src={dataUrl} controls className="h-full w-full rounded-lg bg-black object-contain" />
        </div>
      );
    }

    if (previewPayload.textPreview) {
      return (
        <div className="h-full overflow-auto rounded-xl border bg-slate-50 p-4">
          <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800 [overflow-wrap:anywhere]">
            {previewPayload.textPreview}
          </pre>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
        Preview for this file type is limited. You can still import the file to use full Document Management preview.
      </div>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking Google Drive connection...
      </div>
    );
  }

  if (!isConnected) {
    const status = statusQuery.data?.status || "not_connected";
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-amber-900">
          <Cloud className="h-4 w-4" />
          <span className="text-sm font-medium">Google Drive is not connected</span>
        </div>
        <p className="text-xs text-amber-800">
          Current status: <span className="font-semibold">{status}</span>. Connect Google Drive in Settings to browse files from My Drive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={includeAllFiles ? "outline" : "default"}
          className={includeAllFiles ? "" : "bg-emerald-600 hover:bg-emerald-700"}
          onClick={() => setIncludeAllFiles(false)}
        >
          Current Folder
        </Button>
        <Button
          type="button"
          size="sm"
          variant={includeAllFiles ? "default" : "outline"}
          className={includeAllFiles ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          onClick={() => setIncludeAllFiles(true)}
        >
          All Files
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => listQuery.refetch()}
          disabled={listQuery.isFetching}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!includeAllFiles ? (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setFolderPath((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            disabled={folderPath.length <= 1}
            title="Go up one folder"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          {folderPath.map((folder, index) => (
            <button
              type="button"
              key={`${folder.id}-${index}`}
              className="inline-flex items-center text-xs text-slate-700 hover:text-emerald-700"
              onClick={() => goToBreadcrumb(index)}
            >
              {index > 0 ? <ChevronRight className="mr-1 h-3 w-3 text-slate-400" /> : null}
              <span className={index === folderPath.length - 1 ? "font-semibold" : ""}>{folder.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Browsing all files across your My Drive folders.
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={includeAllFiles ? "Search files in all folders..." : "Search in current folder..."}
          className="h-10 rounded-xl border-slate-300 bg-white pl-9"
        />
      </div>

      {listQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {listQuery.error.message || "Failed to load files from Google Drive."}
        </div>
      ) : null}

      <ScrollArea className="h-[460px] rounded-xl border border-slate-200 bg-white p-2">
        {listQuery.isLoading && !items.length ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Drive files...
          </div>
        ) : null}

        {!listQuery.isLoading && !items.length ? (
          <div className="p-4 text-sm text-muted-foreground">
            No files found in this view.
          </div>
        ) : null}

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openFolder(item)}
                disabled={item.kind !== "folder"}
              >
                <div className="flex items-center gap-2">
                  {item.kind === "folder" ? (
                    <Folder className="h-4 w-4 shrink-0 text-amber-600" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <span className="truncate text-sm font-medium text-slate-900">{item.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline" className="text-[10px]">{item.kind}</Badge>
                  <span className="truncate">{item.mimeType}</span>
                  {item.modifiedTime ? (
                    <span>Updated {new Date(item.modifiedTime).toLocaleString()}</span>
                  ) : null}
                </div>
              </button>

              <div className="flex items-center gap-1">
                {item.kind === "folder" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openFolder(item)}
                  >
                    Open
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(item)}
                      disabled={previewMutation.isPending && previewItem?.id === item.id}
                    >
                      {previewMutation.isPending && previewItem?.id === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onImportFile(item.id)}
                      disabled={Boolean(importingFileId)}
                    >
                      {importingFileId === item.id ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        "Import"
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {nextPageToken ? (
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPageToken(nextPageToken || undefined)}
              disabled={listQuery.isFetching}
            >
              {listQuery.isFetching ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        ) : null}
      </ScrollArea>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1200px] flex-col overflow-hidden p-5">
          <DialogHeader className="shrink-0">
            <DialogTitle>{previewItem?.name || "File Preview"}</DialogTitle>
            <DialogDescription>
              Preview from Google Drive before importing to Document Management.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden py-2">
            {renderPreviewBody()}
          </div>

          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </Button>
            {previewItem ? (
              <Button
                type="button"
                onClick={async () => {
                  await onImportFile(previewItem.id);
                }}
                disabled={Boolean(importingFileId)}
              >
                {importingFileId === previewItem.id ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import This File"
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
