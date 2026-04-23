import { useMemo, useState } from "react";
import {
  Archive,
  Copy,
  Eye,
  Loader2,
  PackagePlus,
  Play,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import type { DocumentQueryState } from "@/lib/documentManagementUi";
import PublishContextPackDialog from "./PublishContextPackDialog";

type SavedViewsPanelProps = {
  currentQueryState: DocumentQueryState;
  onOpenItem: (itemId: number, title: string) => void;
};

function mapScopeToSavedViewScope(
  scope: DocumentQueryState["scope"],
): "all" | "my_library" | "private_vault" | "shared_with_me" | "shared_groups" {
  if (
    scope === "my_library"
    || scope === "private_vault"
    || scope === "shared_with_me"
    || scope === "shared_groups"
  ) {
    return scope;
  }
  return "all";
}

export function SavedViewsPanel(props: SavedViewsPanelProps) {
  const trpcUtils = trpc.useUtils();
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const listQuery = trpc.library.listSavedViews.useQuery(
    { limit: 20 },
    { refetchOnWindowFocus: false },
  );
  const selectedDetailQuery = trpc.library.getSavedView.useQuery(
    selectedViewId ? { id: selectedViewId } : { id: 0 },
    {
      enabled: selectedViewId != null,
      refetchOnWindowFocus: false,
    },
  );
  const executeQuery = trpc.library.executeSavedView.useQuery(
    selectedViewId
      ? { ref: { id: selectedViewId }, limitOverride: 25 }
      : { ref: { id: 1 }, limitOverride: 25 },
    {
      enabled: selectedViewId != null,
      refetchOnWindowFocus: false,
    },
  );

  const selectedView = selectedDetailQuery.data ?? null;
  const publishSourceView = useMemo(() => {
    if (!selectedView) {
      return null;
    }
    return {
      id: selectedView.id,
      title: selectedView.title,
    };
  }, [selectedView]);

  const createMutation = trpc.library.createSavedView.useMutation({
    onSuccess: async (result) => {
      await trpcUtils.library.listSavedViews.invalidate();
      setCreateTitle("");
      setSelectedViewId(result.id);
      toast.success("Saved view created.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.library.updateSavedView.useMutation({
    onSuccess: async () => {
      await Promise.all([
        trpcUtils.library.listSavedViews.invalidate(),
        selectedViewId
          ? trpcUtils.library.getSavedView.invalidate({ id: selectedViewId })
          : Promise.resolve(),
      ]);
      toast.success("Saved view updated.");
    },
    onError: (error) => toast.error(error.message),
  });
  const archiveMutation = trpc.library.archiveSavedView.useMutation({
    onSuccess: async () => {
      await trpcUtils.library.listSavedViews.invalidate();
      setSelectedViewId(null);
      toast.success("Saved view archived.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createCurrentView = () => {
    const title = createTitle.trim() || "Current Knowledge View";
    createMutation.mutate({
      title,
      description: "Saved from Document Management filters",
      scopeMode: mapScopeToSavedViewScope(props.currentQueryState.scope),
      queryDefinition: {
        query: props.currentQueryState.query.trim() || undefined,
        scope: mapScopeToSavedViewScope(props.currentQueryState.scope),
        sort: props.currentQueryState.sort,
        folderId:
          props.currentQueryState.scope === "my_library"
            ? props.currentQueryState.folderId ?? null
            : undefined,
        filters: {
          itemType: props.currentQueryState.itemType || undefined,
          status: props.currentQueryState.status as
            | "draft"
            | "ready"
            | "indexing"
            | "archived"
            | "failed"
            | undefined,
        },
      },
      presentationDefinition: {
        columns: ["title", "status", "updatedAt"],
        defaultLayout: "table",
      },
    });
  };

  const duplicateSelectedView = () => {
    if (!selectedView) {
      return;
    }
    createMutation.mutate({
      title: `${selectedView.title} Copy`,
      description: selectedView.description ?? undefined,
      visibilityMode: selectedView.visibilityMode,
      scopeMode: selectedView.scopeMode,
      queryDefinition: selectedView.queryDefinition,
      presentationDefinition: selectedView.presentationDefinition,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Saved Views
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Capture repeatable markdown workflows from the current filters.
            </p>
          </div>
          <div className="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-md">
            <Input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Weekly ops review"
            />
            <Button
              type="button"
              onClick={createCurrentView}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save current view
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Available views
          </div>
          <div className="space-y-2">
            {(listQuery.data ?? []).map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => {
                  setSelectedViewId(view.id);
                  setEditTitle(view.title);
                  setEditDescription(view.description ?? "");
                }}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                  selectedViewId === view.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium text-slate-900">
                    {view.title}
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    {view.scopeMode}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {view.description ?? "No description"}
                </div>
              </button>
            ))}
            {!listQuery.isLoading && (listQuery.data ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No saved views yet. Save the current filters to create the first
                reusable knowledge view.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selectedView ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Select a saved view to inspect its server-side result, update its
              metadata, or publish it as a context pack.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Title
                  </label>
                  <Input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Scope
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {selectedView.scopeMode}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Description
                  </label>
                  <Textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    updateMutation.mutate({
                      ref: { id: selectedView.id },
                      title: editTitle.trim() || selectedView.title,
                      description: editDescription.trim() || null,
                    });
                  }}
                  disabled={updateMutation.isPending}
                >
                  Save metadata
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={duplicateSelectedView}
                  disabled={createMutation.isPending}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPublishDialogOpen(true)}
                >
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Publish as Context Pack
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => archiveMutation.mutate({ id: selectedView.id })}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Server-side execution
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Result count comes from the saved query definition, not
                      the current client list.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void trpcUtils.library.executeSavedView.invalidate({
                        ref: { id: selectedView.id },
                        limitOverride: 25,
                      });
                    }}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-900 text-white">
                    {executeQuery.data?.total ?? 0} results
                  </Badge>
                  <Badge variant="outline">server executed</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {(executeQuery.data?.items ?? []).slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => props.onOpenItem(item.id, item.title)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.itemType} • {item.status}
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                  {executeQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing saved view...
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PublishContextPackDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        savedView={publishSourceView}
      />
    </div>
  );
}

export default SavedViewsPanel;
