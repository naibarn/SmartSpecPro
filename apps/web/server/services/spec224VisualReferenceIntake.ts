import { createHash } from "node:crypto";
import type { z } from "zod";
import { designPreferencesSchema, designVisualReferenceSchema } from "../../shared/designIntelligence";

const MAX_REFERENCES = 6;
const MAX_REFERENCE_BYTES = 1024 * 1024;
type ManifestReference = Record<string, unknown> & { id: string };
const IMAGE_FORMATS = {
  "image/png": { extension: "png", signature: (bytes: Buffer) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", signature: (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/webp": { extension: "webp", signature: (bytes: Buffer) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
} as const;

export type Spec224VisualReferenceFile = {
  referenceId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export function prepareSpec224VisualReferenceInputs(input: {
  references: unknown[];
  files: Spec224VisualReferenceFile[];
  designPreferences?: unknown;
}): {
  files: Array<{ path: string; contentBase64: string }>;
  manifest: {
    schemaVersion: string;
    references: ManifestReference[];
    designPreferences: z.infer<typeof designPreferencesSchema>;
    totalBytes: number;
    trust: string;
    functionalSpecPrecedence: string;
  };
} {
  const rawReferences = input.references ?? [];
  const rawFiles = input.files ?? [];
  if (rawReferences.length > MAX_REFERENCES || rawFiles.length !== rawReferences.length) {
    throw new Error("SPEC224_VISUAL_REFERENCE_COUNT_INVALID");
  }
  const references = rawReferences.map((raw) => {
    const parsed = designVisualReferenceSchema.safeParse(raw);
    if (!parsed.success || parsed.data.type !== "image" || !parsed.data.sourceRef) {
      throw new Error("SPEC224_VISUAL_REFERENCE_INVALID");
    }
    return parsed.data;
  });
  const preferences = designPreferencesSchema.parse(input.designPreferences ?? {});
  if (new Set(references.map((reference) => reference.id)).size !== references.length) {
    throw new Error("SPEC224_VISUAL_REFERENCE_IDS_DUPLICATE");
  }
  if (preferences.similarityMode === "high_fidelity" && references.some((reference) => !["user_owned", "authorized"].includes(reference.rights))) {
    throw new Error("SPEC224_VISUAL_REFERENCE_HIGH_FIDELITY_REQUIRES_RIGHTS");
  }
  const filesById = new Map(rawFiles.map((file) => [file.referenceId, file]));
  if (filesById.size !== rawFiles.length) throw new Error("SPEC224_VISUAL_REFERENCE_FILE_INVALID");

  let totalBytes = 0;
  const stagedFiles: Array<{ path: string; contentBase64: string }> = [];
  const entries: ManifestReference[] = references.map((reference, index) => {
    const file = filesById.get(reference.id);
    if (!file || reference.sourceRef !== reference.id) throw new Error("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
    const format = IMAGE_FORMATS[file.mimeType as keyof typeof IMAGE_FORMATS];
    if (!format || file.fileName.length > 255 || /[\\/\0]/.test(file.fileName)) throw new Error("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES || bytes.toString("base64") !== file.contentBase64 || !format.signature(bytes)) {
      throw new Error("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
    }
    totalBytes += bytes.length;
    const filePath = `design-references/ref-${index + 1}.${format.extension}`;
    stagedFiles.push({ path: filePath, contentBase64: bytes.toString("base64") });
    return {
      ...reference,
      fileName: file.fileName,
      mimeType: file.mimeType,
      filePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
  });
  if (totalBytes > 1536 * 1024) throw new Error("SPEC224_VISUAL_REFERENCE_TOTAL_SIZE_INVALID");
  return {
    files: stagedFiles,
    manifest: {
      schemaVersion: "spec224-visual-reference-manifest.v1",
      references: entries,
      designPreferences: preferences,
      totalBytes,
      trust: "untrusted-visual-evidence",
      functionalSpecPrecedence: "behavior-data-permissions",
    },
  };
}
