/**
 * Drag-and-drop hardening for the staged final-render overlay-image field —
 * ported from `VerticalDramaSettingsTab.watermark.test.tsx`'s "watermark
 * image drag & drop" coverage (same bug class: the drop handlers used to
 * live on the wrapper only for `dragOver`/`drop`, never cancelled
 * `dragenter`, and never validated size/type before spending an upload
 * round-trip, so a file dropped anywhere in the field could fall through to
 * the browser's default handler and navigate away instead of uploading).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      listQualityPlanningModels: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      listDramaCharactersForPicker: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
    media: {
      getModels: {
        useQuery: () => ({
          data: {
            models: [
              { id: "google-banana-2", name: "Google Banana 2", provider: "google" },
            ],
            defaults: { image: "google-banana-2", video: "veo3/generate-veo-3-video-lite" },
          },
          isLoading: false,
        }),
      },
    },
    verticalDramaSeries: {
      list: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
  },
}));

import { StagedCheckpointReviewPanel } from "../StagedCheckpointReviewPanel";

const baseCheckpoint = {
  checkpointId: "image-prompt:run-1:shot-1:r1",
  kind: "image_prompt",
  shotId: 1,
  state: "awaiting",
  revision: 1,
  contentHash: "prompt-hash",
  estimatedCredits: 3,
  approvedModel: "google-banana-2",
  approvedProvider: "media-provider",
  approvedSafetyVerdict: "passed",
  approvedReferenceManifestHash: "refs-1",
};

// The overlay-image section only mounts once `state.finalRender` is truthy
// (StagedCheckpointReviewPanel.tsx gate ~line 1574) — `jobId` absent means
// the settings form is editable, `jobId` present means it is locked.
function stateFixture(options?: { locked?: boolean }) {
  return {
    stateDigest: "digest-1",
    outputMode: "full_video",
    planRevision: 1,
    planReview: { status: "awaiting", redraftCount: 0 },
    storyPlan: { title: "รีวิวแก้วน้ำ", storySummary: "เรื่องย่อ" },
    shots: [
      {
        shotId: 1,
        title: "เปิดเรื่อง",
        storySummary: "เปิดภาพสินค้า",
        dialogue: "สวัสดี",
        imagePrompt: "สร้างภาพสินค้า",
        videoPrompt: null,
        imageArtifactUrl: null,
        imageArtifactHash: null,
      },
    ],
    checkpoints: [baseCheckpoint],
    finalRender: {
      settings: {
        subtitlePresetId: "classic_box",
        aiDisclosureEnabled: false,
        overlayText: null,
        overlayImage: null,
      },
      jobId: options?.locked ? "render-job-1" : null,
    },
  };
}

function props(options?: { locked?: boolean }) {
  return {
    runId: "run-1",
    state: stateFixture(options),
    onRefresh: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onGeneratePrompt: vi.fn(),
    onGenerateAndDispatch: vi.fn(),
    onRetry: vi.fn(),
    onUploadShotMedia: vi.fn().mockResolvedValue(undefined),
    onSaveRenderSettings: vi.fn(),
    onUploadOverlayImage: vi
      .fn()
      .mockResolvedValue("https://cdn.example.com/overlay/logo.png"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StagedCheckpointReviewPanel — overlay image drag & drop", () => {
  const dropFile = (target: HTMLElement, file: File) => {
    const dataTransfer = {
      files: [file],
      items: [{ kind: "file", type: file.type }],
      types: ["Files"],
      dropEffect: "none",
      getData: () => "",
    };
    fireEvent.drop(target, { dataTransfer });
    return dataTransfer;
  };

  it("cancels dragenter AND dragover on the whole field, sets dropEffect to copy, and keeps the URL input inside the drop target", () => {
    render(<StagedCheckpointReviewPanel {...props()} />);
    const zone = screen.getByTestId("staged-overlay-image-dropzone");
    // The URL input must live INSIDE the drop target — dropping on it was
    // the reported failure.
    expect(zone).toContainElement(
      screen.getByTestId("staged-overlay-image-url")
    );

    for (const eventName of ["dragEnter", "dragOver"] as const) {
      const dataTransfer = { dropEffect: "none", types: ["Files"] };
      const cancelled = !fireEvent[eventName](zone, { dataTransfer });
      expect(cancelled).toBe(true);
      expect(dataTransfer.dropEffect).toBe("copy");
    }
  });

  it("uploads a dropped image file and fills the URL field without calling onSaveRenderSettings", async () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", {
      type: "image/png",
    });
    dropFile(screen.getByTestId("staged-overlay-image-dropzone"), file);

    await vi.waitFor(() =>
      expect(input.onUploadOverlayImage).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: "logo.png", fileType: "image/png" })
      )
    );
    await vi.waitFor(() =>
      expect(
        (screen.getByTestId("staged-overlay-image-url") as HTMLInputElement)
          .value
      ).toBe("https://cdn.example.com/overlay/logo.png")
    );
    expect(input.onSaveRenderSettings).not.toHaveBeenCalled();
  });

  it("rejects a non-image drop with a role=alert error instead of uploading it", async () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    const file = new File(["nope"], "notes.txt", { type: "text/plain" });
    dropFile(screen.getByTestId("staged-overlay-image-dropzone"), file);

    await screen.findByRole("alert");
    expect(input.onUploadOverlayImage).not.toHaveBeenCalled();
  });

  it("rejects a file over the 10MB cap before spending an upload round-trip", async () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    const file = new File([new Uint8Array(1)], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    dropFile(screen.getByTestId("staged-overlay-image-dropzone"), file);

    await screen.findByRole("alert");
    expect(input.onUploadOverlayImage).not.toHaveBeenCalled();
  });

  it("accepts an image URL dragged in from another tab", async () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    fireEvent.drop(screen.getByTestId("staged-overlay-image-dropzone"), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list"],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://cdn.example.com/from-tab.png" : "",
      },
    });
    await vi.waitFor(() =>
      expect(
        (screen.getByTestId("staged-overlay-image-url") as HTMLInputElement)
          .value
      ).toBe("https://cdn.example.com/from-tab.png")
    );
    expect(input.onUploadOverlayImage).not.toHaveBeenCalled();
  });

  it("ignores drops when the render settings are locked (a render job is already queued)", () => {
    const input = props({ locked: true });
    render(<StagedCheckpointReviewPanel {...input} />);
    const file = new File([new Uint8Array([0x89, 0x50])], "logo.png", {
      type: "image/png",
    });
    const dataTransfer = dropFile(
      screen.getByTestId("staged-overlay-image-dropzone"),
      file
    );
    expect(dataTransfer.dropEffect).toBe("none");
    expect(input.onUploadOverlayImage).not.toHaveBeenCalled();
  });
});
