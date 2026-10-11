import { describe, expect, it } from "vitest";
import { prepareSpec224VisualReferenceInputs } from "./spec224VisualReferenceIntake";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString("base64");
const ref = { id: "screen-1", type: "image", sourceRef: "screen-1", pageHint: "/dashboard", stateHint: "empty", viewport: { width: 1280, height: 800 }, rights: "user_owned", assetReuseAllowed: true };

describe("SPEC-224 visual reference intake", () => {
  it("keeps the legacy no-reference prompt input empty", () => {
    expect(prepareSpec224VisualReferenceInputs({ references: [], files: [] })).toMatchObject({
      files: [],
      manifest: { schemaVersion: "spec224-visual-reference-manifest.v1", references: [], trust: "untrusted-visual-evidence" },
    });
  });

  it("stages screenshot bytes with a tenant-run manifest and reference metadata", () => {
    const result = prepareSpec224VisualReferenceInputs({
      references: [ref],
      files: [{ referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: png }],
      designPreferences: { similarityMode: "high_fidelity", devices: ["desktop"] },
    });
    expect(result.files[0]).toMatchObject({ path: "design-references/ref-1.png", contentBase64: png });
    expect(result.manifest).toMatchObject({
      designPreferences: { similarityMode: "high_fidelity", devices: ["desktop"] },
      references: [{ id: "screen-1", filePath: "design-references/ref-1.png", pageHint: "/dashboard", stateHint: "empty", viewport: { width: 1280, height: 800 }, rights: "user_owned", assetReuseAllowed: true, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }],
    });
  });

  it("rejects mismatched image signatures and third-party asset reuse", () => {
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [ref], files: [{ referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: Buffer.from("not an image").toString("base64") }],
    })).toThrow("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [{ ...ref, rights: "third_party_inspiration" }],
      files: [{ referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: png }],
    })).toThrow();
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [{ ...ref, rights: "unknown", assetReuseAllowed: false }],
      files: [{ referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: png }],
      designPreferences: { similarityMode: "high_fidelity" },
    })).toThrow("SPEC224_VISUAL_REFERENCE_HIGH_FIDELITY_REQUIRES_RIGHTS");
  });

  it("rejects duplicate reference IDs before staging", () => {
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [ref, ref],
      files: [
        { referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: png },
        { referenceId: "screen-2", fileName: "screen-2.png", mimeType: "image/png", contentBase64: png },
      ],
    })).toThrow("SPEC224_VISUAL_REFERENCE_IDS_DUPLICATE");
  });

  it("rejects oversized batches and unsafe file names", () => {
    const large = Buffer.alloc(1024 * 1024 + 1, 0).toString("base64");
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [ref], files: [{ referenceId: "screen-1", fileName: "screen.png", mimeType: "image/png", contentBase64: large }],
    })).toThrow("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
    expect(() => prepareSpec224VisualReferenceInputs({
      references: [ref], files: [{ referenceId: "screen-1", fileName: "../screen.png", mimeType: "image/png", contentBase64: png }],
    })).toThrow("SPEC224_VISUAL_REFERENCE_FILE_INVALID");
  });
});
