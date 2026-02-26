/**
 * Reads a PPTX file as a Base64 string and uploads it to the library
 * via the provided tRPC `mutateAsync` callback.
 *
 * Separated from the component so it can be easily mocked in tests.
 *
 * Progress phases:
 *   10%  – FileReader started
 *   50%  – Base64 read complete, upload starting
 *  100%  – Upload complete
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
  input: UploadPptxInput,
) => Promise<{ item: { id: number } }>;

export async function uploadPptxFile(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  mutateAsync: UploadPptxMutateAsync,
): Promise<{ libraryItemId: number }> {
  onProgress(10);

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
      { once: true },
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
