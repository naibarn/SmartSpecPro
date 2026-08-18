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

  const failure = input.transientError || task?.error;
  if (failure || task?.status === "failed" || task?.status === "expired") {
    return {
      kind: "failed",
      failureStage: task?.failureStage,
      error: failure,
      hasTaskId: Boolean(task?.lastTaskId),
    };
  }

  if (!input.hasAsset) return { kind: "no_image" };
  if (input.browserState === "error") return { kind: "asset_load_failed" };
  if (input.browserState !== "loaded") return { kind: "asset_loading" };
  return { kind: "ready" };
}
