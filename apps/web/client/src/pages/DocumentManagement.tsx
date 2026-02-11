import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { FolderOpen, Search } from "lucide-react";

import DocumentGridList from "@/components/library/DocumentGridList";
import DocumentLibraryTabs from "@/components/library/DocumentLibraryTabs";
import DocumentPreviewPanel from "@/components/library/DocumentPreviewPanel";
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
import { trpc } from "@/lib/trpc";

export default function DocumentManagement() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownError, setMarkdownError] = useState<string | undefined>(undefined);
  const [previewText, setPreviewText] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryState.query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryState.query]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryString = buildDocumentQueryString(queryState);
    window.history.replaceState(
      window.history.state,
      "",
      `${DOCUMENT_MANAGEMENT_ROUTE}?${queryString}`,
    );
  }, [queryState]);

  const listInput = useMemo(() => ({
    scope: queryState.scope,
    sort: queryState.sort,
    query: debouncedQuery || undefined,
    limit: 60,
    offset: 0,
    filters: {
      itemType: queryState.itemType || undefined,
      status: queryState.status as any,
    },
  }), [debouncedQuery, queryState.scope, queryState.sort, queryState.itemType, queryState.status]);

  const { data: documentData, isLoading: listLoading } = trpc.library.listDocuments.useQuery(listInput);
  const documents = (documentData?.results || []) as DocumentLibraryItem[];
  const selectedItem = documents.find((item) => item.id === selectedId) || null;
  const previewType = selectedItem ? resolveDocumentPreviewType(selectedItem) : "fallback";

  const markdownContentQuery = trpc.library.getMarkdownContent.useQuery(
    { id: selectedItem?.id || 0 },
    {
      enabled: Boolean(selectedItem && previewType === "markdown"),
    },
  );

  const saveMarkdownMutation = trpc.library.saveMarkdown.useMutation();

  useEffect(() => {
    if (!documents.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !documents.some((item) => item.id === selectedId)) {
      setSelectedId(documents[0].id);
    }
  }, [documents, selectedId]);

  useEffect(() => {
    if (previewType !== "markdown") {
      setMarkdownError(undefined);
      return;
    }
    if (markdownContentQuery.data) {
      setMarkdownDraft(markdownContentQuery.data.content || "");
    }
  }, [previewType, markdownContentQuery.data]);

  useEffect(() => {
    if (!selectedItem) {
      setPreviewText(undefined);
      return;
    }

    if (!["text", "json", "html"].includes(previewType) || !selectedItem.source_url) {
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

  const uniqueItemTypes = useMemo(
    () => Array.from(new Set(documents.map((item) => item.item_type))).sort(),
    [documents],
  );

  async function handleSaveMarkdown() {
    if (!selectedItem) return;
    try {
      setMarkdownError(undefined);
      const result = await saveMarkdownMutation.mutateAsync({
        id: selectedItem.id,
        content: markdownDraft,
        expectedUpdatedAt: selectedItem.updated_at,
      });
      toast.success("Markdown saved. Re-indexing started.");
      setSelectedId(result.item.id);
      await Promise.all([
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getMarkdownContent.invalidate({ id: selectedItem.id }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save markdown";
      setMarkdownError(message);
      toast.error(message);
    }
  }

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/50 to-cyan-50/40 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Document Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage personal and shared RAG files with preview and markdown editing.
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>

        <DocumentLibraryTabs
          value={queryState.scope}
          onChange={(scope) => setQueryState((prev) => ({ ...prev, scope }))}
        />

        <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search title, tags, metadata..."
                value={queryState.query}
                onChange={(event) => setQueryState((prev) => ({ ...prev, query: event.target.value }))}
              />
            </div>
          </div>
          <Select
            value={queryState.itemType || "all"}
            onValueChange={(value) => setQueryState((prev) => ({ ...prev, itemType: value === "all" ? undefined : value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueItemTypes.map((itemType) => (
                <SelectItem key={itemType} value={itemType}>
                  {itemType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={queryState.sort}
            onValueChange={(value) => setQueryState((prev) => ({ ...prev, sort: value as DocumentQueryState["sort"] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_desc">Newest updated first</SelectItem>
              <SelectItem value="created_desc">Newest created first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div>
            <DocumentGridList
              items={documents}
              selectedId={selectedId}
              isLoading={listLoading}
              emptyMessage="No documents match the selected scope and filters."
              onSelect={(item) => setSelectedId(item.id)}
            />
          </div>
          <div>
            <DocumentPreviewPanel
              item={selectedItem}
              previewType={previewType}
              previewText={previewText}
              markdownValue={markdownDraft}
              markdownUpdatedAt={markdownContentQuery.data?.updated_at || selectedItem?.updated_at}
              markdownError={markdownError}
              isMarkdownSaving={saveMarkdownMutation.isPending}
              onMarkdownChange={setMarkdownDraft}
              onMarkdownSave={handleSaveMarkdown}
            />
            {!selectedItem ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                Select a file from the list to preview and edit.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
