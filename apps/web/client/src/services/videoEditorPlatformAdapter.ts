export interface VideoEditorPlatformAdapter {
  pickMedia(): Promise<File[]>;
  canRevealLocalFile: false;
  notify(message: string): void;
}

/** Browser implementation deliberately has no Tauri/native imports. */
export function createBrowserVideoEditorPlatformAdapter(): VideoEditorPlatformAdapter {
  return {
    canRevealLocalFile: false,
    async pickMedia() {
      if (typeof document === "undefined") return [];
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "video/*,audio/*,image/*";
      return new Promise<File[]>((resolve) => {
        const finish = () => resolve(Array.from(input.files ?? []));
        input.addEventListener("change", finish, { once: true });
        input.addEventListener("cancel", finish, { once: true });
        input.click();
      });
    },
    notify(message) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("video-editor-notice", { detail: message }));
    },
  };
}
