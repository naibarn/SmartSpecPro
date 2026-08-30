import { createTRPCClient, httpLink } from "@trpc/client";
import type { TRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@server/routers";

let client: TRPCClient<AppRouter> | null = null;

function createClient(): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: "/trpc",
        transformer: superjson,
        async fetch(input, init) {
          return fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
}

export function getLibraryUploadClient(): TRPCClient<AppRouter> {
  if (!client) {
    client = createClient();
  }
  return client;
}

const MAX_LIBRARY_UPLOAD_BYTES = 50 * 1024 * 1024;

type LibraryUploadOptions = {
  title?: string;
  visibility?: "private" | "team" | "public";
  projectId?: string | null;
  parentId?: number | null;
  metadata?: Record<string, unknown>;
  changeDescription?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

function readFileAsBase64(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Library upload cancelled"));
      return;
    }
    const reader = new FileReader();
    const abortRead = () => {
      reader.abort();
      reject(new Error("Library upload cancelled"));
    };
    signal?.addEventListener("abort", abortRead, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abortRead);
    reader.onload = () => {
      cleanup();
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

function uploadToPresignedUrl(
  file: File,
  uploadUrl: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Library upload cancelled"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(
      () => {
        xhr.abort();
        reject(new Error("Direct library upload timed out"));
      },
      30 * 60 * 1000
    );
    const abortUpload = () => xhr.abort();
    signal?.addEventListener("abort", abortUpload, { once: true });
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortUpload);
    };
    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        cleanup();
        resolve();
      } else {
        cleanup();
        reject(new Error(`Direct library upload failed (${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("Network error during direct library upload"));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new Error("Library upload cancelled"));
    });
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader(
      "Content-Type",
      (file.type || "application/octet-stream").toLowerCase()
    );
    xhr.send(file);
  });
}

export async function uploadLibraryFileDirect(
  file: File,
  options: LibraryUploadOptions = {}
): Promise<any> {
  if (file.size > MAX_LIBRARY_UPLOAD_BYTES) {
    throw new Error("File too large (max 50 MB)");
  }

  const trpc = getLibraryUploadClient();
  const contentType = (file.type || "application/octet-stream").toLowerCase();
  const init = (await trpc.library.directUploadInit.mutate({
    fileName: file.name,
    fileType: contentType,
    fileSizeBytes: file.size,
    operation: "create",
  })) as any;

  if (init.method === "legacy_base64") {
    return trpc.library.uploadFile.mutate({
      fileName: file.name,
      fileType: contentType,
      fileBase64: await readFileAsBase64(file, options.signal),
      title: options.title ?? file.name,
      visibility: options.visibility,
      projectId: options.projectId,
      parentId: options.parentId,
      metadata: options.metadata,
    });
  }

  options.onProgress?.(0);
  try {
    await uploadToPresignedUrl(
      file,
      init.uploadUrl,
      options.onProgress,
      options.signal
    );
    return await trpc.library.directUploadComplete.mutate({
      uploadToken: init.uploadToken,
      title: options.title ?? file.name,
      visibility: options.visibility,
      projectId: options.projectId,
      parentId: options.parentId,
      metadata: options.metadata,
    });
  } catch (error) {
    await trpc.library.directUploadAbort
      .mutate({ uploadToken: init.uploadToken })
      .catch(() => undefined);
    throw error;
  }
}

export async function replaceLibraryFileDirect(
  file: File,
  itemId: number,
  options: Pick<
    LibraryUploadOptions,
    "changeDescription" | "metadata" | "onProgress"
  > = {}
): Promise<any> {
  if (file.size > MAX_LIBRARY_UPLOAD_BYTES) {
    throw new Error("File too large (max 50 MB)");
  }

  const trpc = getLibraryUploadClient();
  const contentType = (file.type || "application/octet-stream").toLowerCase();
  const init = (await trpc.library.directUploadInit.mutate({
    fileName: file.name,
    fileType: contentType,
    fileSizeBytes: file.size,
    operation: "replace",
    itemId,
  })) as any;

  if (init.method === "legacy_base64") {
    return trpc.library.replaceFile.mutate({
      itemId,
      fileName: file.name,
      fileType: contentType,
      fileBase64: await readFileAsBase64(file, options.signal),
      changeDescription: options.changeDescription,
      metadata: options.metadata,
    });
  }

  options.onProgress?.(0);
  try {
    await uploadToPresignedUrl(
      file,
      init.uploadUrl,
      options.onProgress,
      options.signal
    );
    return await trpc.library.directUploadComplete.mutate({
      uploadToken: init.uploadToken,
      changeDescription: options.changeDescription,
      metadata: options.metadata,
    });
  } catch (error) {
    await trpc.library.directUploadAbort
      .mutate({ uploadToken: init.uploadToken })
      .catch(() => undefined);
    throw error;
  }
}
