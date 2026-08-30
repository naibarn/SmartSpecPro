/**
 * Uploads a PPTX file to the Library. The normal path uses the shared direct
 * R2 uploader; the callback remains as a legacy compatibility path for older
 * callers/tests.
 *
 * Separated from the component so it can be easily mocked in tests.
 *
 * Progress starts at 10%; the normal R2 path reports raw PUT progress and
 * reaches 100% after Library finalize. The callback path retains the legacy
 * FileReader/Base64 phases for compatibility.
 *
 * Throws DOMException("Aborted", "AbortError") when `signal` fires.
 * Throws Error with a descriptive message on other failures.
 */

export type UploadPptxInput = {
  fileName: string;
  fileType: string;
  fileBase64: string;
  title?: string;
  visibility?: string;
};

/**
 * Minimal interface for the library upload callback.
 * The tRPC `library.uploadFile.mutateAsync` satisfies this at runtime.
 * Cast with `as unknown as UploadPptxMutateAsync` at the call site to satisfy
 * TypeScript without widening to `any`.
 */
export type UploadPptxMutateAsync = (
  input: UploadPptxInput
) => Promise<{ item: { id: number } }>;

export async function uploadPptxFile(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  mutateAsync?: UploadPptxMutateAsync
): Promise<{ libraryItemId: number }> {
  onProgress(10);

  if (!mutateAsync) {
    const { uploadLibraryFileDirect } =
      await import("@/services/libraryUploadClient");
    const result = await uploadLibraryFileDirect(file, {
      title: file.name.replace(/\.pptx$/i, ""),
      visibility: "private",
      onProgress: pct => onProgress(Math.max(10, pct)),
      signal,
    });
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    onProgress(100);
    return { libraryItemId: Number(result?.item?.id ?? 0) };
  }

  const base64 = await readFileAsBase64(file, signal);

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  onProgress(50);

  const input: UploadPptxInput = {
    fileName: file.name,
    fileType:
      file.type ||
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    fileBase64: base64,
    title: file.name.replace(/\.pptx$/i, ""),
    visibility: "private",
  };

  const result = await mutateAsync(input);

  onProgress(100);
  return { libraryItemId: result.item.id };
}

function readFileAsBase64(file: File, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    signal.addEventListener(
      "abort",
      () => {
        reader.abort();
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );

    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve(base64 ?? "");
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
