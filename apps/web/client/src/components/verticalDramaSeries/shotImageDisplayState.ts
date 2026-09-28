export type VerticalDramaShotImageBrowserState =
  | "idle"
  | "loading"
  | "loaded"
  | "error";

export type VerticalDramaShotImageDisplayState =
  | {
      kind: "generating";
      promptReady: boolean;
      taskStatus?: string;
    }
  | {
      kind: "failed";
      failureStage?: "provider" | "sync" | "admission";
      error?: string;
      hasTaskId: boolean;
    }
  | { kind: "asset_loading" }
  | { kind: "asset_load_failed" }
  | { kind: "ready" }
  | { kind: "no_image" };

export function resolveVerticalDramaShotImageDisplayState(input: {
  hasPrompt: boolean;
  hasAsset: boolean;
  imageTask?: {
    pendingTaskId?: string;
    lastTaskId?: string;
    status?:
      | "submitted"
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "expired";
    failureStage?: "provider" | "sync" | "admission";
    error?: string;
  };
  isGenerating?: boolean;
  browserState?: VerticalDramaShotImageBrowserState;
  transientError?: string;
}): VerticalDramaShotImageDisplayState {
  const task = input.imageTask;
  const pending = Boolean(task?.pendingTaskId) || input.isGenerating === true;
  if (pending) {
    return {
      kind: "generating",
      promptReady: input.hasPrompt,
      taskStatus: task?.status,
    };
  }

  // A previous failed/expired task can remain beside an already-approved
  // asset (for example, after a retry or a manual image selection). Once the
  // current asset is present, do not paint that stale task error over the
  // image; keep the browser load state authoritative for what the user sees.
  if (input.hasAsset) {
    if (input.browserState === "error") return { kind: "asset_load_failed" };
    if (input.browserState !== "loaded") return { kind: "asset_loading" };
    return { kind: "ready" };
  }

  const failure = input.transientError || task?.error;
  if (failure || task?.status === "failed" || task?.status === "expired") {
    return {
      kind: "failed",
      failureStage: task?.failureStage,
      error: failure,
      hasTaskId: Boolean(task?.lastTaskId),
    };
  }

  return { kind: "no_image" };
}
