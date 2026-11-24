import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateCaption: vi.fn(),
  generatePostImages: vi.fn(),
  fetchAuthenticatedMedia: vi.fn(),
  openLightbox: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      generateStagedAutoReviewSocialCaption: {
        useMutation: () => ({
          isPending: false,
          mutate: mocks.generateCaption,
        }),
      },
      generateStagedAutoReviewSocialPostImages: {
        useMutation: () => ({
          isPending: false,
          mutate: mocks.generatePostImages,
        }),
      },
    },
    mediaModels: {
      list: {
        useQuery: () => ({
          data: {
            models: [
              {
                modelId: "image-model-limited",
                name: "Limited Image Model",
                provider: "provider-a",
                maxReferenceImages: 4,
                aspectRatios: ["4:5", "9:16"],
              },
              {
                modelId: "image-model-a",
                name: "Portrait Image Model",
                provider: "provider-a",
                maxReferenceImages: 5,
                aspectRatios: ["4:5", "9:16"],
              },
            ],
          },
          isLoading: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("@astryxdesign/core/hooks", () => ({
  useClipboard: () => ({ isCopied: false, copy: vi.fn() }),
}));

vi.mock("@astryxdesign/core/Lightbox", () => ({
  useLightbox: () => ({
    open: mocks.openLightbox,
    getTriggerProps: (index: number) => ({
      role: "button",
      tabIndex: 0,
      "aria-haspopup": "dialog",
      "data-gallery-index": index,
    }),
    element: null,
  }),
}));

vi.mock("@/components/media/AuthenticatedMediaImage", async importOriginal => {
  const actual =
    await importOriginal<
      typeof import("@/components/media/AuthenticatedMediaImage")
    >();
  return { ...actual, fetchAuthenticatedMedia: mocks.fetchAuthenticatedMedia };
});

import { StagedSocialCaptionComposer } from "../StagedSocialCaptionComposer";

function stateFixture(overrides: Record<string, unknown> = {}) {
  return {
    stateDigest: "state-digest-1",
    planRevision: 1,
    planReview: { status: "approved" },
    shots: [
      {
        shotId: 1,
        title: "Morning routine",
        imageArtifactUrl: "/api/storage/files/shot-1.jpg",
        imageArtifactHash: "shot-hash-1",
      },
    ],
    referenceManifest: [
      {
        index: 1,
        role: "product",
        label: "Daily Cream",
        url: "/api/storage/files/product-1.jpg",
        active: true,
      },
      {
        index: 2,
        role: "character",
        characterName: "Mali",
        label: "Mali portrait",
        url: "/api/storage/files/character-1.jpg",
        active: true,
      },
      {
        index: 3,
        role: "character",
        characterName: "Ani",
        label: "Ani portrait",
        url: "/api/storage/files/character-2.jpg",
        active: true,
      },
      {
        index: 4,
        role: "product",
        label: "Daily Cream detail",
        url: "/api/storage/files/product-2.jpg",
        active: true,
      },
    ],
    ...overrides,
    socialCaption: {
      caption: "ดูแลผิวให้นุ่มชุ่มชื้นในทุกวัน",
      hashtags: ["ดูแลผิว"],
      sourceType: "shot",
      shotId: 1,
      ...((overrides.socialCaption as Record<string, unknown>) ?? {}),
    },
  };
}

describe("StagedSocialCaptionComposer social post images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAuthenticatedMedia.mockResolvedValue(new Blob(["image"]));
  });

  it("queues three variants using job references without asking the user to select them", async () => {
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={stateFixture() as any}
        onRefresh={vi.fn()}
      />
    );

    const generateButton = screen.getByRole("button", {
      name: "สร้างภาพโพสต์ 3 ภาพ",
    });
    await waitFor(() =>
      expect(generateButton).not.toHaveAttribute("aria-disabled", "true")
    );
    expect(
      screen.queryByRole("combobox", { name: "ภาพตัวละครอ้างอิง" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "ภาพสินค้าอ้างอิง" })
    ).not.toBeInTheDocument();
    fireEvent.click(generateButton);

    expect(mocks.generatePostImages).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-social-1",
        expectedStateDigest: "state-digest-1",
        modelId: "image-model-a",
        aspectRatio: "4:5",
        variants: [
          "caption_source",
          "character_reference",
          "product_reference",
        ],
      })
    );
    expect(mocks.generatePostImages.mock.calls[0][0]).not.toHaveProperty(
      "characterReferenceIndex"
    );
    expect(mocks.generatePostImages.mock.calls[0][0]).not.toHaveProperty(
      "productReferenceIndex"
    );
  });

  it("clearly explains that Caption is required before images can be generated", () => {
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={stateFixture({ socialCaption: { caption: "" } }) as any}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("ยังขาด Caption")).toBeInTheDocument();
    expect(
      screen.getByText(
        "กรุณากด “สร้าง Caption และ Hashtag” ด้านบนก่อน แล้วจึงสร้างภาพโพสต์ 3 ภาพได้"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "สร้างภาพโพสต์ 3 ภาพ" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("does not block image creation when a job has no separate character or product refs", async () => {
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={stateFixture({ referenceManifest: [] }) as any}
        onRefresh={vi.fn()}
      />
    );

    const generateButton = screen.getByRole("button", {
      name: "สร้างภาพโพสต์ 3 ภาพ",
    });
    await waitFor(() =>
      expect(generateButton).not.toHaveAttribute("aria-disabled", "true")
    );
    fireEvent.click(generateButton);

    expect(mocks.generatePostImages).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-social-1",
        variants: [
          "caption_source",
          "character_reference",
          "product_reference",
        ],
      })
    );
  });

  it("shows generated variants with accessible lightbox triggers and authenticated download", async () => {
    const state = stateFixture({
      socialCaption: {
        postImages: {
          batchId: "batch-1",
          requestHash: "hash-1",
          modelId: "image-model-a",
          aspectRatio: "4:5",
          status: "completed",
          variants: {
            caption_source: {
              status: "completed",
              imageUrl: "/api/storage/files/caption-source.png",
              sourceLabel: "Shot 1",
            },
            character_reference: {
              status: "completed",
              imageUrl: "/api/storage/files/character.png",
              sourceLabel: "Mali",
            },
            product_reference: {
              status: "completed",
              imageUrl: "/api/storage/files/product.png",
              sourceLabel: "Daily Cream",
            },
          },
        },
      },
    });
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={state as any}
        onRefresh={vi.fn()}
      />
    );

    const image = screen.getByAltText("โฆษณาเล่าเรื่องจากภาพต้นทาง · Shot 1");
    expect(image).toHaveAttribute("role", "button");
    expect(image).toHaveAttribute("data-gallery-index", "0");
    fireEvent.click(screen.getAllByRole("button", { name: "ขยายภาพ" })[0]);
    expect(mocks.openLightbox).toHaveBeenCalledWith(0);
    const download = screen.getAllByRole("button", { name: "ดาวน์โหลดภาพ" })[0];
    fireEvent.click(download);

    await waitFor(() => {
      expect(mocks.fetchAuthenticatedMedia).toHaveBeenCalledWith(
        "/api/storage/files/caption-source.png"
      );
    });
  });

  it("retries only the failed variant and retains the saved batch/model selection", async () => {
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={
          stateFixture({
            socialCaption: {
              postImages: {
                batchId: "batch-1",
                requestHash: "hash-1",
                modelId: "image-model-a",
                aspectRatio: "9:16",
                status: "partial",
                variants: {
                  caption_source: {
                    status: "completed",
                    imageUrl: "/api/storage/files/caption-source.png",
                    sourceLabel: "Shot 1",
                  },
                  character_reference: {
                    status: "failed",
                    imageUrl: null,
                    sourceLabel: "Mali",
                  },
                  product_reference: {
                    status: "completed",
                    imageUrl: "/api/storage/files/product.png",
                    sourceLabel: "Daily Cream",
                  },
                },
              },
            },
          }) as any
        }
        onRefresh={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ลองสร้างภาพนี้ใหม่" }));

    expect(mocks.generatePostImages).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-1",
        expectedRequestHash: "hash-1",
        modelId: "image-model-a",
        aspectRatio: "9:16",
        variants: ["character_reference"],
      })
    );
  });

  it("allows per-image recovery after a worker stops with pending variants", () => {
    render(
      <StagedSocialCaptionComposer
        runId="run-social-1"
        state={
          stateFixture({
            workerOperations: [
              {
                operation: "staged_social_post_images_generation",
                status: "completed",
              },
            ],
            socialCaption: {
              postImages: {
                batchId: "batch-crashed",
                requestHash: "hash-crashed",
                modelId: "image-model-a",
                aspectRatio: "4:5",
                status: "partial",
                variants: {
                  caption_source: {
                    status: "completed",
                    imageUrl: "/api/storage/files/caption-source.png",
                    sourceLabel: "Shot 1",
                  },
                  character_reference: {
                    status: "running",
                    imageUrl: null,
                    sourceLabel: "Mali",
                  },
                  product_reference: {
                    status: "pending",
                    imageUrl: null,
                    sourceLabel: "Daily Cream",
                  },
                },
              },
            },
          }) as any
        }
        onRefresh={vi.fn()}
      />
    );

    const retryButtons = screen.getAllByRole("button", {
      name: "ลองสร้างภาพนี้ใหม่",
    });
    expect(retryButtons).toHaveLength(2);
    fireEvent.click(retryButtons[0]);

    expect(mocks.generatePostImages).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-crashed",
        variants: ["character_reference"],
      })
    );
  });
});
