export interface MediaTaskForLibraryUI {
  id: string;
  status?: string | null;
  resultUrl?: string | null;
}

export interface AddToLibraryResultLike {
  itemId: number;
  created: boolean;
  indexJob: {
    status: string;
    created: boolean;
  };
  taskStatus: string;
}

export type TaskLibraryActionState = "idle" | "adding" | "added" | "error";

export interface TaskLibraryUIState {
  action: TaskLibraryActionState;
  itemId?: number;
  status?: string;
  created?: boolean;
  message?: string;
}

export interface LibrarySearchResultItem {
  item_id: number;
  item_type: string;
  title: string;
  thumbnail_url: string | null;
  status: string;
  source: string;
  provider_name: string | null;
  model_name: string | null;
}

export function isMediaTaskEligibleForLibraryAdd(task: MediaTaskForLibraryUI): boolean {
  if (task.status !== "completed") {
    return false;
  }

  return Boolean(task.resultUrl && task.resultUrl.trim().length > 0);
}

export function normalizeLibraryStatusFromJobStatus(jobStatus?: string | null): string {
  switch ((jobStatus || "").toLowerCase()) {
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "pending":
    case "processing":
    case "retry_pending":
      return "indexing";
    default:
      return "indexing";
  }
}

export function buildTaskLibraryStateFromAddResult(result: AddToLibraryResultLike): TaskLibraryUIState {
  return {
    action: "added",
    itemId: result.itemId,
    created: result.created,
    status: normalizeLibraryStatusFromJobStatus(result.indexJob.status),
  };
}

export function buildTaskLibraryErrorState(error: unknown): TaskLibraryUIState {
  const message = getAddToLibraryErrorMessage(error);
  return {
    action: "error",
    status: "failed",
    message,
  };
}

export function getAddToLibrarySuccessMessage(result: AddToLibraryResultLike): string {
  if (result.created) {
    return "Added to library. Indexing started.";
  }

  if (result.indexJob.created) {
    return "Already in library. Re-indexing started.";
  }

  return "Already in library.";
}

export function getAddToLibraryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Failed to add to library: ${error.message}`;
  }

  return "Failed to add to library";
}

export function getLibraryStatusMeta(status?: string | null): {
  label: string;
  className: string;
  retryable: boolean;
} {
  switch ((status || "").toLowerCase()) {
    case "ready":
      return {
        label: "Ready",
        className: "bg-emerald-100 text-emerald-800",
        retryable: false,
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-red-100 text-red-700",
        retryable: true,
      };
    case "indexing":
      return {
        label: "Indexing",
        className: "bg-amber-100 text-amber-800",
        retryable: false,
      };
    case "archived":
      return {
        label: "Archived",
        className: "bg-slate-100 text-slate-700",
        retryable: false,
      };
    default:
      return {
        label: "Not Added",
        className: "bg-slate-100 text-slate-700",
        retryable: false,
      };
  }
}

export function selectLibrarySearchItem(
  results: LibrarySearchResultItem[],
  itemId: number,
  onSelect: (item: LibrarySearchResultItem) => void,
): boolean {
  const selected = results.find((item) => item.item_id === itemId);
  if (!selected) {
    return false;
  }

  onSelect(selected);
  return true;
}
