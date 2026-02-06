import type { IEngineAdapter } from "./mediaJobClient";
import type {
  MediaJobSpec,
  MediaJobProgress,
} from "@shared/types/mediaJob";

export class TauriEngineAdapter implements IEngineAdapter {
  async submitJob(spec: MediaJobSpec): Promise<string> {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<string>("submit_media_job", {
      specJson: JSON.stringify(spec),
    });
    return result;
  }

  async getStatus(jobId: string): Promise<MediaJobProgress> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<MediaJobProgress>("get_media_job_status", { jobId });
  }

  async cancelJob(jobId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_media_job", { jobId });
  }

  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void,
  ): () => void {
    let unlisten: (() => void) | null = null;
    let unsubscribedEarly = false;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<MediaJobProgress>("media-job-progress", (event) => {
        if (event.payload.jobId === jobId) {
          callback(event.payload);
        }
      }).then((fn) => {
        if (unsubscribedEarly) {
          // Caller already unsubscribed before listen resolved; clean up now
          fn();
        } else {
          unlisten = fn;
        }
      });
    });

    return () => {
      if (unlisten) {
        unlisten();
      } else {
        // Mark for cleanup when listen resolves
        unsubscribedEarly = true;
      }
    };
  }
}
