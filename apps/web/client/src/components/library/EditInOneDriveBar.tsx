import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Save, Trash2, Loader2, Cloud } from "lucide-react";

interface EditInOneDriveBarProps {
  libraryItemId: number;
}

export function EditInOneDriveBar({ libraryItemId }: EditInOneDriveBarProps) {
  const utils = trpc.useUtils();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const { data: session, isLoading } = trpc.oneDrive.getActiveEditSession.useQuery(
    { libraryItemId },
    { refetchInterval: 30_000 },
  );

  const saveBackMutation = trpc.oneDrive.saveBack.useMutation({
    onSuccess: () => {
      utils.oneDrive.getActiveEditSession.invalidate({ libraryItemId });
    },
  });

  const discardMutation = trpc.oneDrive.discardEditSession.useMutation({
    onSuccess: () => {
      utils.oneDrive.getActiveEditSession.invalidate({ libraryItemId });
      setShowDiscardConfirm(false);
    },
  });

  if (isLoading || !session) return null;

  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10);

  const editorType = session.editUrl.includes("excel")
    ? "Excel Online"
    : session.editUrl.includes("powerpoint")
    ? "PowerPoint Online"
    : "Word Online";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
        <span className="text-sm font-medium text-sky-700 dark:text-sky-300 truncate">
          Editing in {editorType}
        </span>
        <span className="text-xs text-sky-500 dark:text-sky-400">
          {hoursRemaining}h remaining
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => saveBackMutation.mutate({ sessionId: session.id })}
          disabled={saveBackMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saveBackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save back
        </button>

        {showDiscardConfirm ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-600 dark:text-red-400">Discard all changes?</span>
            <button
              onClick={() => discardMutation.mutate({ sessionId: session.id })}
              disabled={discardMutation.isPending}
              className="px-2 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {discardMutation.isPending ? "..." : "Yes"}
            </button>
            <button
              onClick={() => setShowDiscardConfirm(false)}
              className="px-2 py-1 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDiscardConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Trash2 className="w-3 h-3" />
            Discard
          </button>
        )}

        <button
          onClick={() => window.open(session.editUrl, "_blank")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <ExternalLink className="w-3 h-3" />
          Open again
        </button>
      </div>
    </div>
  );
}
