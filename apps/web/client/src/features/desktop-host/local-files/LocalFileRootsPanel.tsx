import type {
  DesktopLocalRoot,
  DesktopManagedAction,
  DesktopWorkspaceProfile,
} from "@shared/desktopHost";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function LocalFileRootsPanel(props: {
  roots: DesktopLocalRoot[];
  workspaceProfile?: DesktopWorkspaceProfile | null;
  pendingActions?: DesktopManagedAction[];
  onRequestAction?: (
    rootId: string,
    actionType: "reindex_root" | "purge_root_derived_store" | "revoke_root",
  ) => Promise<void> | void;
  actionInFlightKey?: string | null;
}) {
  const {
    roots,
    workspaceProfile,
    pendingActions = [],
    onRequestAction,
    actionInFlightKey = null,
  } = props;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Managed Local Roots</h3>
        <p className="text-xs text-slate-500">
          Desktop-managed roots replace raw whole-disk discovery in managed mode.
        </p>
      </header>
      <div className="space-y-3">
        {roots.length > 0 ? roots.map((root) => (
          <div
            key={root.rootId}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{root.name}</div>
                  <div className="text-xs text-slate-500">{root.absolutePath}</div>
                </div>
                <span className="text-xs font-medium text-slate-600">
                  {root.deniedByDefault ? "Blocked by default" : root.writebackMode}
                </span>
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {root.indexingEnabled ? "Indexing enabled" : "Indexing paused"}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {root.previewEnabled ? "Preview enabled" : "Preview disabled"}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {root.vectorIndexEnabled ? "Vectors enabled" : "Vectors disabled"}
                  </Badge>
                  {pendingActions
                    .filter((action) => action.rootId === root.rootId)
                    .map((action) => (
                      <Badge
                        key={action.actionId}
                        variant="outline"
                        className="border-amber-200 bg-white text-amber-700"
                      >
                        {action.actionType.replace(/_/g, " ")}
                      </Badge>
                    ))}
                </div>
              </div>
              {root.denialReason && (
                <div className="text-xs text-amber-700">{root.denialReason}</div>
              )}
              {onRequestAction && !root.deniedByDefault && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionInFlightKey === `${root.rootId}:reindex_root`}
                    onClick={() => void onRequestAction(root.rootId, "reindex_root")}
                  >
                    {actionInFlightKey === `${root.rootId}:reindex_root` ? "Queueing..." : "Reindex"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionInFlightKey === `${root.rootId}:purge_root_derived_store`}
                    onClick={() => void onRequestAction(root.rootId, "purge_root_derived_store")}
                  >
                    {actionInFlightKey === `${root.rootId}:purge_root_derived_store`
                      ? "Queueing..."
                      : "Purge derived data"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                    disabled={actionInFlightKey === `${root.rootId}:revoke_root`}
                    onClick={() => void onRequestAction(root.rootId, "revoke_root")}
                  >
                    {actionInFlightKey === `${root.rootId}:revoke_root` ? "Queueing..." : "Revoke root"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
            No managed roots registered yet. Desktop Host prompts for explicit root consent before
            local indexing or retrieval starts.
          </div>
        )}
      </div>
      {workspaceProfile && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Workspace profile: {workspaceProfile.profileName} / {workspaceProfile.networkClass}
        </div>
      )}
    </section>
  );
}
