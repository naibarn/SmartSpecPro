import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const setLocationMock = vi.fn();
const routeParamsMock = { docId: "42" };
const { toastMocks } = vi.hoisted(() => ({
  toastMocks: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mutationMocks = {
  updateItem: vi.fn(),
  updateDeck: vi.fn(),
  saveAsTemplate: vi.fn(),
  restoreVersion: vi.fn(),
  addSlide: vi.fn(),
  duplicateSlide: vi.fn(),
  deleteSlide: vi.fn(),
  reorderSlides: vi.fn(),
  updateSlide: vi.fn(),
  uploadAndAttachAsset: vi.fn(),
  createDeck: vi.fn(),
  triggerExport: vi.fn(),
  setSlideAudio: vi.fn(),
  setDeckAudio: vi.fn(),
  generateSlideAudioFromNote: vi.fn(),
  relayoutSlide: vi.fn(),
  resolvePendingMedia: vi.fn(),
  generateImageAsync: vi.fn(),
  generateVideoAsync: vi.fn(),
  uploadReference: vi.fn(),
};

function createDragDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ""),
  } as unknown as DataTransfer;
}

function buildDeckByItem() {
  return {
    deck: {
      id: 7,
      libraryItemId: 42,
      version: 5,
      title: "Product Pitch",
      slideCount: 2,
      totalAssetBytes: 0,
      updatedAt: new Date(),
    },
    slides: [
      {
        id: 71,
        deckId: 7,
        orderIndex: 0,
        version: 3,
        title: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
      },
      {
        id: 72,
        deckId: 7,
        orderIndex: 1,
        version: 1,
        title: "Agenda",
        slideContent: { elements: [] },
        notes: null,
      },
    ],
    assets: [],
  };
}

function buildLibraryMediaList() {
  return {
    total: 2,
    limit: 50,
    offset: 0,
    has_more: false,
    scope: "all",
    results: [
      {
        id: 401,
        item_type: "image",
        source: "media_task",
        title: "Hero Image",
        description: null,
        status: "ready",
        visibility: "private",
        source_url: "https://cdn.example.com/hero.png",
        thumbnail_url: "https://cdn.example.com/hero-thumb.png",
        owner_user_id: 1,
        metadata: {},
        access_source: "owner",
        permission_level: "owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 402,
        item_type: "video",
        source: "media_task",
        title: "Teaser Clip",
        description: null,
        status: "ready",
        visibility: "private",
        source_url: "https://cdn.example.com/teaser.mp4",
        thumbnail_url: "https://cdn.example.com/teaser-thumb.png",
        owner_user_id: 1,
        metadata: {},
        access_source: "owner",
        permission_level: "owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

function buildMediaHistoryTasks() {
  return [
    {
      id: "hist-img-1",
      mediaType: "image",
      status: "completed",
      model: "flux-2.0",
      prompt: "History Hero",
      resultUrl: "https://cdn.example.com/history-hero.png",
      resultData: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: "hist-video-1",
      mediaType: "video",
      status: "completed",
      model: "veo-3-1",
      prompt: "History Teaser",
      resultUrl: "https://cdn.example.com/history-teaser.mp4",
      resultData: {
        poster: "https://cdn.example.com/history-teaser-poster.png",
      },
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildPresentationVersions() {
  return [
    {
      id: 501,
      versionNumber: 12,
      contentType: "presentation_slide_snapshot_v1",
      changeDescription: "Manual save: Intro",
      createdAt: new Date().toISOString(),
      createdByUserId: 1,
      snapshot: {
        schemaVersion: "presentation_slide_snapshot_v1",
        deckId: 7,
        libraryItemId: 42,
        slideId: 71,
        slideVersion: 3,
        slideTitle: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
        saveMode: "manual",
        savedAt: new Date().toISOString(),
        savedByUserId: 1,
      },
    },
  ] as any[];
}

function buildImageModelList() {
  return [
    {
      id: "flux-2.0",
      name: "Flux 2.0",
      provider: "fal",
      creditCost: 5,
      configJson: { generateType: "text-to-image" },
    },
  ];
}

function buildVideoModelList(options?: { requireStylePreset?: boolean }) {
  return [
    {
      id: "veo-3-1",
      name: "Veo 3.1",
      provider: "kie.ai",
      creditCost: 50,
      configJson: {
        generateType: "text-to-video",
        inputFields: [
          { key: "scene_prompt", label: "Scene Prompt", type: "text", syncWith: "prompt" },
          { key: "target_aspect_ratio", label: "Target Aspect Ratio", type: "text", syncWith: "aspect_ratio" },
          { key: "quality", label: "Quality", type: "select", default: "pro", options: [{ value: "standard", label: "Standard" }, { value: "pro", label: "Pro" }] },
          ...(options?.requireStylePreset
            ? [{ key: "style_preset", label: "Style Preset", type: "text", required: true }]
            : []),
        ],
      },
    },
    {
      id: "veo-i2v",
      name: "Veo Image-to-Video",
      provider: "kie.ai",
      creditCost: 45,
      configJson: {
        generateType: "image-to-video",
      },
    },
  ];
}

const mediaModelState = {
  imageModels: buildImageModelList(),
  videoModels: buildVideoModelList(),
};

const queryState = {
  libraryItem: {
    id: 42,
    item_type: "presentation",
    itemType: "presentation",
    title: "Product Pitch",
  },
  libraryMediaList: buildLibraryMediaList(),
  itemLoading: false,
  guardLoading: false,
  guard: {
    allowed: true,
    itemId: 42,
    editorRoute: "/presentation-editor/42",
  },
  mediaHistoryTasks: buildMediaHistoryTasks(),
  deckByItem: buildDeckByItem(),
  deckError: null as Error | null,
  presentationVersions: buildPresentationVersions(),
};

vi.mock("wouter", () => ({
  useLocation: () => ["/presentation-editor/42", setLocationMock],
  useRoute: () => [true, routeParamsMock],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      library: {
        getItem: { invalidate: vi.fn().mockResolvedValue(undefined) },
        listDocuments: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      presentation: {
        listVersions: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      media: {
        getTask: {
          fetch: vi.fn().mockResolvedValue({
            status: "completed",
            resultUrl: "https://cdn.example.com/generated-asset.png",
          }),
        },
      },
    }),
    library: {
      getItem: {
        useQuery: vi.fn(() => ({
          data: queryState.libraryItem,
          isLoading: queryState.itemLoading,
          error: null,
        })),
      },
      listDocuments: {
        useQuery: vi.fn((input?: any) => {
          const itemType = input?.filters?.itemType;
          const filteredResults = queryState.libraryMediaList.results.filter((item: any) =>
            itemType ? item.item_type === itemType : true,
          );
          return {
            data: {
              ...queryState.libraryMediaList,
              total: filteredResults.length,
              results: filteredResults,
            },
            isLoading: false,
            error: null,
          };
        }),
      },
      search: {
        useQuery: vi.fn((input?: any) => {
          const itemType = input?.filters?.itemType;
          const query = String(input?.query || "").trim().toLowerCase();
          const filteredByType = queryState.libraryMediaList.results.filter((item: any) =>
            itemType ? item.item_type === itemType : true,
          );
          const filteredByQuery = query
            ? filteredByType.filter((item: any) =>
              `${item.title || ""} ${item.description || ""}`.toLowerCase().includes(query))
            : filteredByType;
          return {
            data: {
              version: "library_search_v1",
              query,
              total: filteredByQuery.length,
              limit: filteredByQuery.length,
              offset: 0,
              has_more: false,
              results: filteredByQuery,
            },
            isLoading: false,
            error: null,
          };
        }),
      },
      updateItem: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateItem,
          isPending: false,
        })),
      },
    },
    ai: {
      upload: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.uploadReference,
          isPending: false,
        })),
      },
    },
    presentation: {
      getSlideshow: {
        useQuery: vi.fn(() => ({
          data: {
            schemaVersion: "presentation_slideshow_v1",
            deckId: 7,
            generatedAt: new Date(),
            slides: [
              { slideId: 71, orderIndex: 0, title: "Intro", durationMs: 3000, transition: "cut" },
              { slideId: 72, orderIndex: 1, title: "Agenda", durationMs: 3000, transition: "fade" },
            ],
          },
          isLoading: false,
          error: null,
        })),
      },
      getExportStatus: {
        useQuery: vi.fn(() => ({
          data: null,
          isLoading: false,
          error: null,
        })),
      },
      getPlayDeck: {
        useQuery: vi.fn(() => ({
          data: null,
          isLoading: false,
          error: null,
          refetch: vi.fn().mockImplementation(async () => ({ data: null })),
        })),
      },
      listVersions: {
        useQuery: vi.fn(() => ({
          data: queryState.presentationVersions,
          isLoading: false,
          error: null,
        })),
      },
      guardEditorOpen: {
        useQuery: vi.fn(() => ({
          data: queryState.guard,
          isLoading: queryState.guardLoading,
          error: null,
        })),
      },
      getDeckByLibraryItem: {
        useQuery: vi.fn(() => ({
          data: queryState.deckByItem,
          isLoading: false,
          error: queryState.deckError,
          refetch: vi.fn().mockImplementation(async () => ({ data: queryState.deckByItem })),
        })),
      },
      availability: {
        useQuery: vi.fn(() => ({
          data: {
            enabled: true,
            aiGenerationEnabled: true,
          },
          isLoading: false,
          error: null,
        })),
      },
      ai: {
        relayoutSlide: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.relayoutSlide,
            isPending: false,
          })),
        },
        resolvePendingMedia: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.resolvePendingMedia,
            isPending: false,
          })),
        },
      },
      addSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.addSlide,
          isPending: false,
        })),
      },
      duplicateSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.duplicateSlide,
          isPending: false,
        })),
      },
      deleteSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.deleteSlide,
          isPending: false,
        })),
      },
      reorderSlides: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.reorderSlides,
          isPending: false,
        })),
      },
      updateSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateSlide,
          isPending: false,
        })),
      },
      uploadAndAttachAsset: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.uploadAndAttachAsset,
          isPending: false,
        })),
      },
      createDeck: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.createDeck,
          isPending: false,
        })),
      },
      updateDeck: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateDeck,
          isPending: false,
        })),
      },
      saveAsTemplate: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.saveAsTemplate,
          isPending: false,
        })),
      },
      restoreVersion: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.restoreVersion,
          isPending: false,
        })),
      },
      triggerExport: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.triggerExport,
          isPending: false,
        })),
      },
      setSlideAudio: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.setSlideAudio,
          isPending: false,
        })),
      },
      setDeckAudio: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.setDeckAudio,
          isPending: false,
        })),
      },
      generateSlideAudioFromNote: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.generateSlideAudioFromNote,
          isPending: false,
        })),
      },
    },
    presentationImport: {
      startImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
      getImportStatus: { useQuery: vi.fn(() => ({ data: null, isLoading: false })) },
      cancelImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
    },
    media: {
      listTasks: {
        useQuery: vi.fn((input?: any) => {
          const mediaType = input?.mediaType;
          const status = input?.status;
          const filteredTasks = queryState.mediaHistoryTasks.filter((task: any) => (
            (!mediaType || task.mediaType === mediaType)
            && (!status || task.status === status)
          ));
          return {
            data: {
              tasks: filteredTasks,
              total: filteredTasks.length,
              limit: filteredTasks.length,
              offset: 0,
            },
            isLoading: false,
            error: null,
          };
        }),
      },
      generateImageAsync: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.generateImageAsync,
          isPending: false,
        })),
      },
      generateVideoAsync: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.generateVideoAsync,
          isPending: false,
        })),
      },
      getModels: {
        useQuery: vi.fn((input?: any) => {
          if (input?.type === "video") {
            return {
              data: {
                models: mediaModelState.videoModels,
                defaults: { image: "flux-2.0", video: "veo-3-1" },
              },
              isLoading: false,
              error: null,
            };
          }
          return {
            data: {
              models: mediaModelState.imageModels,
              defaults: { image: "flux-2.0", video: "veo-3-1" },
            },
            isLoading: false,
            error: null,
          };
        }),
      },
    },
  },
}));

vi.mock("@/components/presentation/ExportDialog", () => ({
  ExportDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="export-dialog-mock">ExportDialog</div> : null,
}));

vi.mock("@/components/presentation/ImportPresentationDialog", () => ({
  ImportPresentationDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-dialog-mock">
      ImportPresentationDialog
      <button onClick={onClose}>Close Import</button>
    </div>
  ),
}));

vi.mock("@/components/presentation/SlideAudioPanel", () => ({
  SlideAudioPanel: ({ slideId, deckId }: { slideId: number | null; deckId: number }) => (
    <div data-testid="slide-audio-panel-mock" data-slide-id={String(slideId)} data-deck-id={String(deckId)}>
      SlideAudioPanel
    </div>
  ),
}));

import PresentationEditor, { mergeResolvedPendingMediaIntoCachedDraft } from "./PresentationEditor";

describe("PresentationEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    mediaModelState.imageModels = buildImageModelList();
    mediaModelState.videoModels = buildVideoModelList();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1200 });
    mutationMocks.addSlide.mockResolvedValue({});
    mutationMocks.updateItem.mockResolvedValue({});
    mutationMocks.updateDeck.mockResolvedValue({});
    mutationMocks.saveAsTemplate.mockResolvedValue({ item: { id: 500, title: "Product Pitch Template" } });
    mutationMocks.restoreVersion.mockResolvedValue({
      restoredSlideId: 71,
      restoredSlideVersion: 4,
      deckVersion: 9,
    });
    mutationMocks.duplicateSlide.mockResolvedValue({});
    mutationMocks.deleteSlide.mockResolvedValue({});
    mutationMocks.reorderSlides.mockResolvedValue({});
    mutationMocks.updateSlide.mockResolvedValue({});
    mutationMocks.uploadAndAttachAsset.mockResolvedValue({
      item: {
        id: 999,
        title: "Uploaded",
        sourceUrl: "https://cdn.example.com/uploaded.png",
        thumbnailUrl: "https://cdn.example.com/uploaded.png",
      },
      billing: { creditsCharged: 4 },
    });
    mutationMocks.createDeck.mockResolvedValue({});
    mutationMocks.triggerExport.mockResolvedValue({
      exportId: 1,
      status: "queued",
      deduped: false,
      message: "Queued",
    });
    mutationMocks.setSlideAudio.mockResolvedValue({});
    mutationMocks.setDeckAudio.mockResolvedValue({});
    mutationMocks.generateSlideAudioFromNote.mockResolvedValue({});
    mutationMocks.relayoutSlide.mockResolvedValue({
      slide: { id: 71, version: 4 },
      warnings: [],
      applied: {
        templateId: "split_right_image",
        stylePresetId: "dark-professional",
        graphicCategory: "Business",
        reusedImage: true,
      },
    });
    mutationMocks.resolvePendingMedia.mockResolvedValue({
      slide: { id: 71, version: 4 },
      resolvedAssets: [],
      unresolvedAssets: [],
      warnings: [],
    });
    mutationMocks.generateImageAsync.mockResolvedValue({
      taskId: "media-task-1",
      status: "queued",
    });
    mutationMocks.generateVideoAsync.mockResolvedValue({
      taskId: "media-video-task-1",
      status: "queued",
    });
    mutationMocks.uploadReference.mockResolvedValue({
      url: "https://cdn.example.com/uploaded-reference.png",
    });
    queryState.guard = {
      allowed: true,
      itemId: 42,
      editorRoute: "/presentation-editor/42",
    };
    queryState.itemLoading = false;
    queryState.guardLoading = false;
    queryState.libraryMediaList = buildLibraryMediaList();
    queryState.mediaHistoryTasks = buildMediaHistoryTasks();
    queryState.deckByItem = buildDeckByItem();
    queryState.deckError = null;
    queryState.presentationVersions = buildPresentationVersions();
  });

  it("renders labeled controls for slide and canvas editing", () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /add slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /duplicate slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide down/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add text element/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play slideshow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^export$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable snap lock/i })).toBeInTheDocument();
    expect(screen.getByTestId("slide-preview-1")).toBeInTheDocument();
    expect(screen.getByTestId("slide-preview-2")).toBeInTheDocument();
    expect(screen.getByText(/save: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/snap: locked/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas Aspect Ratio (Properties)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fit canvas to view/i })).toBeInTheDocument();
  });

  it("shows clear visual-only indicators for slides that hide on-slide text", () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          slideContent: {
            elements: [
              { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero" },
            ],
            visualOnly: true,
          },
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);

    expect(screen.getByText(/slide mode: visual-only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/visual-only slide/i).length).toBeGreaterThan(0);
    expect(screen.getByText("NO TEXT")).toBeInTheDocument();
  });

  it("turns off visual-only mode when the user adds text to the slide", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          slideContent: {
            elements: [
              { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero" },
            ],
            visualOnly: true,
          },
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);

    expect(screen.getByText(/slide mode: visual-only/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add text element/i }));

    await waitFor(() => {
      expect(screen.queryByText(/slide mode: visual-only/i)).not.toBeInTheDocument();
    });
    expect(toastMocks.info).toHaveBeenCalledWith(
      "Visual-only mode was turned off for this slide because you added text.",
    );
  });

  it("turns off visual-only mode when pasted content includes text", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          slideContent: {
            elements: [
              { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero" },
            ],
            visualOnly: true,
          },
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /select slide 2/i }));
    fireEvent.click(screen.getByRole("button", { name: /add text element/i }));
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: /select slide 1/i }));
    expect(screen.getByText(/slide mode: visual-only/i)).toBeInTheDocument();
    toastMocks.info.mockClear();
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      expect(screen.queryByText(/slide mode: visual-only/i)).not.toBeInTheDocument();
    });
    expect(toastMocks.info.mock.calls).toContainEqual([
      "Visual-only mode was turned off for this slide because you pasted text.",
    ]);
  });

  it("renders inline svg previews in the slide list", () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          slideContent: {
            elements: [
              {
                id: "svg-1",
                type: "image",
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
                src: "",
                alt: "graphic",
                svgContent: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='currentColor' /></svg>",
                svgColor: "#22c55e",
              },
            ],
            visualOnly: true,
          },
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);

    expect(screen.getByTestId("slide-preview-inline-svg-1")).toBeInTheDocument();
  });

  it("merges resolved pending media from persisted slide content into cached drafts", () => {
    const cached = {
      elements: [
        { id: "img-slot", type: "rect", x: 0, y: 0, width: 640, height: 360, fill: "#d1d5db" },
        { id: "caption", type: "text", x: 24, y: 300, width: 400, height: 40, text: "Slide preview", color: "#111827" },
      ],
      pendingMediaJobs: [
        {
          id: "pmj-1",
          mediaType: "image",
          mediaTaskId: "task-1",
          targetElementId: "img-slot",
          targetX: 0,
          targetY: 0,
          targetWidth: 640,
          targetHeight: 360,
          status: "pending",
          createdAt: "2026-03-06T00:00:00.000Z",
          lastCheckedAt: "2026-03-06T00:00:00.000Z",
        },
      ],
    } as any;
    const persisted = {
      elements: [
        { id: "img-slot", type: "image", x: 0, y: 0, width: 640, height: 360, src: "https://cdn.example.com/resolved.png", alt: "Resolved" },
        { id: "caption", type: "text", x: 24, y: 300, width: 400, height: 40, text: "Slide preview", color: "#111827" },
      ],
    } as any;

    const merged = mergeResolvedPendingMediaIntoCachedDraft(cached, persisted);

    expect((merged as any).pendingMediaJobs).toBeUndefined();
    expect((merged as any).elements[0]).toMatchObject({
      id: "img-slot",
      type: "image",
      src: "https://cdn.example.com/resolved.png",
    });
    expect((merged as any).elements[1]).toMatchObject({
      id: "caption",
      type: "text",
      text: "Slide preview",
    });
  });

  it("keeps hook order stable when editor transitions from loading to ready", async () => {
    queryState.itemLoading = true;
    const { rerender } = render(<PresentationEditor />);
    expect(screen.getByText(/loading presentation editor/i)).toBeInTheDocument();

    queryState.itemLoading = false;
    queryState.guardLoading = false;
    rerender(<PresentationEditor />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save slide/i })).toBeInTheDocument();
    });
  });

  it("inserts image from library panel into canvas content", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));
    const heroCard = screen.getByText("Hero Image").closest("[role='button']");
    expect(heroCard).toBeTruthy();
    fireEvent.click(within(heroCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Image URL")).toHaveValue("https://cdn.example.com/hero.png");
      expect(screen.getByLabelText("Image Alt Text")).toHaveValue("Hero Image");
      expect(screen.getByLabelText("Image URL")).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Image Alt Text")).toHaveAttribute("readonly");
    });

    expect(screen.getByLabelText("Image Motion Effect")).toHaveValue("none");
    fireEvent.change(screen.getByLabelText("Image Motion Effect"), {
      target: { value: "zoom-in" },
    });
    fireEvent.change(screen.getByLabelText("Image Motion Intensity"), {
      target: { value: "0.6" },
    });
    fireEvent.change(screen.getByLabelText("Image Motion Easing"), {
      target: { value: "linear" },
    });
    fireEvent.change(screen.getByLabelText("Image Motion Timing"), {
      target: { value: "until-slide-end" },
    });
    fireEvent.change(screen.getByLabelText("Image Outro Motion Effect"), {
      target: { value: "pan-right" },
    });
    fireEvent.change(screen.getByLabelText("Image Outro Motion Duration Seconds"), {
      target: { value: "1.5" },
    });

    expect(screen.getByLabelText("Image Motion Effect")).toHaveValue("zoom-in");
    expect(screen.getByLabelText("Image Motion Intensity")).toHaveValue("0.6");
    expect(screen.getByLabelText("Image Motion Easing")).toHaveValue("linear");
    expect(screen.getByLabelText("Image Motion Timing")).toHaveValue("until-slide-end");
    expect(screen.getByLabelText("Image Outro Motion Effect")).toHaveValue("pan-right");
    expect(screen.getByLabelText("Image Outro Motion Duration Seconds")).toHaveValue(1.5);

    fireEvent.click(screen.getByRole("button", { name: /apply image hold then exit motion preset/i }));
    expect(screen.getByLabelText("Image Motion Effect")).toHaveValue("none");
    expect(screen.getByLabelText("Image Outro Motion Effect")).toHaveValue("pan-left");
    expect(screen.getByLabelText("Image Outro Motion Duration Seconds")).toHaveValue(1.5);
  });

  it("inserts image from media history when available", async () => {
    queryState.libraryMediaList = {
      ...buildLibraryMediaList(),
      results: buildLibraryMediaList().results.filter((item: any) => item.item_type !== "image"),
    };
    queryState.mediaHistoryTasks = [
      {
        id: "hist-img-99",
        mediaType: "image",
        status: "completed",
        model: "flux-2.0",
        prompt: "History Only Image",
        resultUrl: "https://cdn.example.com/history-only-image.png",
        resultData: {},
        createdAt: new Date().toISOString(),
      },
    ] as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));
    fireEvent.click(screen.getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Image URL")).toHaveValue("https://cdn.example.com/history-only-image.png");
      expect(screen.getByLabelText("Image Alt Text")).toHaveValue("History Only Image");
    });
  });

  it("shows source badges on asset cards (History/Library/Shared)", async () => {
    queryState.libraryMediaList = {
      ...buildLibraryMediaList(),
      results: [
        {
          ...buildLibraryMediaList().results[0],
          id: 405,
          title: "Shared Hero",
          source_url: "https://cdn.example.com/shared-hero.png",
          thumbnail_url: "https://cdn.example.com/shared-hero-thumb.png",
          access_source: "shared_group",
        },
      ],
    } as any;
    queryState.mediaHistoryTasks = [
      {
        id: "hist-img-100",
        mediaType: "image",
        status: "completed",
        model: "flux-2.0",
        prompt: "History Badge Image",
        resultUrl: "https://cdn.example.com/history-badge-image.png",
        resultData: {},
        createdAt: new Date().toISOString(),
      },
    ] as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));

    const historyCard = screen.getByText("History Badge Image").closest("[role='button']");
    const sharedCard = screen.getByText("Shared Hero").closest("[role='button']");
    expect(historyCard).toBeTruthy();
    expect(sharedCard).toBeTruthy();
    expect(within(historyCard as HTMLElement).getByText("History")).toBeInTheDocument();
    expect(within(sharedCard as HTMLElement).getByText("Shared")).toBeInTheDocument();
  });

  it("applies Auto Layout with watermark payload from library image selection", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /auto layout slide/i }));

    const watermarkTitle = screen.getByText("Watermark");
    const watermarkRow = watermarkTitle.closest("div")?.parentElement as HTMLElement;
    const watermarkSwitch = within(watermarkRow).getByRole("switch");
    fireEvent.click(watermarkSwitch);

    await waitFor(() => {
      expect(screen.getByText("Clarity: 20%")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /apply auto layout/i }));

    await waitFor(() => {
      expect(mutationMocks.relayoutSlide).toHaveBeenCalled();
    });
    const payload = mutationMocks.relayoutSlide.mock.calls[0]?.[0];
    expect(payload?.watermark).toEqual({
      sourceUrl: "https://cdn.example.com/hero.png",
      format: "png",
      clarityPercent: 20,
    });
  });

  it("explains visual-only Auto Layout behavior in the dialog", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          slideContent: {
            elements: [
              { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero" },
            ],
            visualOnly: true,
          },
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /auto layout slide/i }));

    expect(screen.getByText(/visual-only slides keep text hidden during auto layout/i)).toBeInTheDocument();
  });

  it("filters asset cards by source chip", async () => {
    queryState.libraryMediaList = {
      ...buildLibraryMediaList(),
      results: [
        {
          ...buildLibraryMediaList().results[0],
          id: 406,
          title: "Library Hero",
          source_url: "https://cdn.example.com/library-hero.png",
          thumbnail_url: "https://cdn.example.com/library-hero-thumb.png",
          access_source: "owner",
        },
        {
          ...buildLibraryMediaList().results[0],
          id: 407,
          title: "Shared Hero",
          source_url: "https://cdn.example.com/shared-hero.png",
          thumbnail_url: "https://cdn.example.com/shared-hero-thumb.png",
          access_source: "shared_group",
        },
      ],
    } as any;
    queryState.mediaHistoryTasks = [
      {
        id: "hist-img-101",
        mediaType: "image",
        status: "completed",
        model: "flux-2.0",
        prompt: "History Filter Image",
        resultUrl: "https://cdn.example.com/history-filter-image.png",
        resultData: {},
        createdAt: new Date().toISOString(),
      },
    ] as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));

    fireEvent.click(screen.getByRole("button", { name: /filter source history/i }));
    expect(screen.getByText("History Filter Image")).toBeInTheDocument();
    expect(screen.queryByText("Library Hero")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Hero")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filter source shared/i }));
    expect(screen.getByText("Shared Hero")).toBeInTheDocument();
    expect(screen.queryByText("History Filter Image")).not.toBeInTheDocument();
  });

  it("inserts video from library panel into canvas content", async () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function thisPlay(this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      });
    const pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(function thisPause(this: HTMLMediaElement) {
        this.dispatchEvent(new Event("pause"));
      });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video src")).toHaveValue("https://cdn.example.com/teaser.mp4");
      expect(screen.getByLabelText("Video title")).toHaveValue("Teaser Clip");
    });
    expect(screen.getByLabelText("Video Prompt")).toHaveValue("");
    expect(screen.getByLabelText("Video Model")).toBeInTheDocument();
    expect(screen.getByLabelText("Video Fit Mode")).toHaveValue("cover");
    expect(screen.getByLabelText("Video Motion Effect")).toHaveValue("none");
    expect(screen.getByRole("button", { name: /regenerate video/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Video Motion Effect"), {
      target: { value: "pan-right" },
    });
    fireEvent.change(screen.getByLabelText("Video Motion Intensity"), {
      target: { value: "0.75" },
    });
    fireEvent.change(screen.getByLabelText("Video Motion Easing"), {
      target: { value: "linear" },
    });
    fireEvent.change(screen.getByLabelText("Video Motion Timing"), {
      target: { value: "until-slide-end" },
    });
    fireEvent.change(screen.getByLabelText("Video Outro Motion Effect"), {
      target: { value: "zoom-out" },
    });
    fireEvent.change(screen.getByLabelText("Video Outro Motion Duration Seconds"), {
      target: { value: "1.2" },
    });

    expect(screen.getByLabelText("Video Motion Effect")).toHaveValue("pan-right");
    expect(screen.getByLabelText("Video Motion Intensity")).toHaveValue("0.75");
    expect(screen.getByLabelText("Video Motion Easing")).toHaveValue("linear");
    expect(screen.getByLabelText("Video Motion Timing")).toHaveValue("until-slide-end");
    expect(screen.getByLabelText("Video Outro Motion Effect")).toHaveValue("zoom-out");
    expect(screen.getByLabelText("Video Outro Motion Duration Seconds")).toHaveValue(1.2);

    fireEvent.click(screen.getByRole("button", { name: /apply video ken burns in motion preset/i }));
    expect(screen.getByLabelText("Video Motion Effect")).toHaveValue("zoom-in");
    expect(screen.getByLabelText("Video Motion Timing")).toHaveValue("until-slide-end");
    expect(screen.getByLabelText("Video Outro Motion Effect")).toHaveValue("none");

    const playVideoButton = await screen.findByRole("button", { name: /play video element/i });
    fireEvent.click(playVideoButton);
    expect(playSpy).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /pause video element/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pause video element/i }));
    expect(pauseSpy).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /play video element/i })).toBeInTheDocument();

    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it("shows only text-to-video compatible models in video model selector", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Model")).toBeInTheDocument();
    });

    expect(screen.getByRole("option", { name: /veo 3\.1/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /veo image-to-video/i })).not.toBeInTheDocument();
  });

  it("syncs model-mapped prompt/aspect fields into regenerate video payload", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Prompt")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Video Prompt"), {
      target: { value: "A happy baby playing in a colorful room" },
    });

    mutationMocks.generateVideoAsync.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /regenerate video/i }));

    await waitFor(() => {
      expect(mutationMocks.generateVideoAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mutationMocks.generateVideoAsync.mock.calls[0][0];
    expect(payload.prompt).toBe("A happy baby playing in a colorful room");
    expect(payload.extraParams).toMatchObject({
      scene_prompt: "A happy baby playing in a colorful room",
      target_aspect_ratio: payload.aspectRatio,
      quality: "pro",
    });
  });

  it("infers prompt/aspect sync for dynamic fields without explicit syncWith", async () => {
    mediaModelState.videoModels = [
      {
        id: "veo-3-1",
        name: "Veo 3.1",
        provider: "kie.ai",
        creditCost: 50,
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "prompt", label: "Prompt", type: "text" },
            { key: "aspectRatio", label: "Aspect Ratio", type: "select", options: [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }] },
            { key: "quality", label: "Quality", type: "select", default: "standard", options: [{ value: "standard", label: "Standard" }, { value: "pro", label: "Pro" }] },
          ],
        },
      },
    ];
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Prompt")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Video Prompt"), {
      target: { value: "A curious child exploring a playground" },
    });

    mutationMocks.generateVideoAsync.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /regenerate video/i }));

    await waitFor(() => {
      expect(mutationMocks.generateVideoAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mutationMocks.generateVideoAsync.mock.calls[0][0];
    expect(payload.extraParams).toMatchObject({
      prompt: "A curious child exploring a playground",
      aspectRatio: payload.aspectRatio,
      quality: "standard",
    });
  });

  it("hides video model inputs behind advanced mode by default", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Prompt")).toBeInTheDocument();
    });

    expect(screen.queryByText(/model inputs \(veo 3\.1\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Video Advanced Mode"));
    expect(screen.getByText(/model inputs \(veo 3\.1\)/i)).toBeInTheDocument();
  });

  it("syncs standard video aspect ratio and image references into dynamic payload", async () => {
    mediaModelState.videoModels = [
      {
        id: "veo-3-1",
        name: "Veo 3.1",
        provider: "kie.ai",
        creditCost: 50,
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "prompt", label: "Prompt", type: "text" },
            { key: "aspectRatio", label: "Aspect Ratio", type: "text" },
            { key: "imageUrls", label: "Image URLs", type: "image_urls" },
            { key: "quality", label: "Quality", type: "select", default: "standard", options: [{ value: "standard", label: "Standard" }] },
          ],
        },
      },
    ];

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Prompt")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Video Prompt"), {
      target: { value: "A toddler learning to walk on a colorful playground" },
    });
    fireEvent.change(screen.getByLabelText("Video Aspect Ratio"), {
      target: { value: "9:16" },
    });

    const OriginalFileReader = globalThis.FileReader;
    class MockFileReader {
      public result: string | ArrayBuffer | null = "data:image/png;base64,aGVsbG8=";

      public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        if (this.onload) {
          this.onload.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
        }
      }
    }
    // @ts-expect-error test mock
    globalThis.FileReader = MockFileReader;

    const uploadInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"][accept="image/*"][multiple]');
    const referenceUploadInput = uploadInputs[uploadInputs.length - 1];
    expect(referenceUploadInput).toBeTruthy();
    fireEvent.change(referenceUploadInput as HTMLInputElement, {
      target: { files: [new File(["hello"], "reference.png", { type: "image/png" })] },
    });
    await waitFor(() => {
      expect(mutationMocks.uploadReference).toHaveBeenCalledTimes(1);
    });
    globalThis.FileReader = OriginalFileReader;

    mutationMocks.generateVideoAsync.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /regenerate video/i }));

    await waitFor(() => {
      expect(mutationMocks.generateVideoAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mutationMocks.generateVideoAsync.mock.calls[0][0];
    expect(payload.aspectRatio).toBe("9:16");
    expect(payload.referenceImageUrls).toEqual(["https://cdn.example.com/uploaded-reference.png"]);
    expect(payload.extraParams).toMatchObject({
      prompt: "A toddler learning to walk on a colorful playground",
      aspectRatio: "9:16",
      imageUrls: ["https://cdn.example.com/uploaded-reference.png"],
      quality: "standard",
    });
  });

  it("blocks regenerate video when required dynamic model input is missing", async () => {
    mediaModelState.videoModels = buildVideoModelList({ requireStylePreset: true });
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    const teaserCard = screen.getByText("Teaser Clip").closest("[role='button']");
    expect(teaserCard).toBeTruthy();
    fireEvent.click(within(teaserCard as HTMLElement).getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video Prompt")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Video Prompt"), {
      target: { value: "A baby walking in a park" },
    });

    mutationMocks.generateVideoAsync.mockClear();
    toastMocks.error.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /regenerate video/i }));

    await waitFor(() => {
      expect(mutationMocks.generateVideoAsync).not.toHaveBeenCalled();
      expect(toastMocks.error).toHaveBeenCalledWith(expect.stringMatching(/required model inputs/i));
    });
  });

  it("renders fallback video thumbnail in library when thumbnail_url is missing", async () => {
    queryState.libraryMediaList = {
      ...queryState.libraryMediaList,
      results: queryState.libraryMediaList.results.map((item: any) =>
        item.item_type === "video"
          ? { ...item, thumbnail_url: null }
          : item),
    };

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));

    await waitFor(() => {
      expect(screen.getByTestId("asset-video-thumb-402")).toBeInTheDocument();
    });
  });

  it("renders video slide previews using poster or video frame", () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Video Intro",
          slideContent: {
            elements: [{
              id: "v-1",
              type: "video",
              x: 20,
              y: 20,
              width: 360,
              height: 220,
              src: "https://cdn.example.com/slide-video.mp4",
              poster: "https://cdn.example.com/slide-video-poster.png",
              title: "Clip",
              muted: true,
            }],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    expect(screen.getByTestId("slide-preview-media-video-poster-1")).toBeInTheDocument();
  });

  it("opens playable slideshow overlay and supports closing", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close slideshow preview/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("slideshow-preview-overlay")).not.toBeInTheDocument();
    });
  });

  it("shows fullscreen toggle control in slideshow overlay", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /enter fullscreen/i })).toBeInTheDocument();
  });

  it("animates video motion in slideshow overlay without remounting the video node", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 4000,
            elements: [
              {
                id: "vid-motion-1",
                type: "video",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/motion-video.mp4",
                poster: "https://cdn.example.com/motion-video-poster.png",
                title: "Motion clip",
                muted: true,
                mediaMotion: {
                  preset: "pan-right",
                  intensity: 1,
                  easing: "linear",
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });
    expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();

    const videoBefore = screen.getByTestId("readonly-video-vid-motion-1") as HTMLVideoElement;
    const transformBefore = videoBefore.style.transform;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    const videoAfter = screen.getByTestId("readonly-video-vid-motion-1") as HTMLVideoElement;
    expect(videoAfter).toBe(videoBefore);
    expect(videoAfter.style.transform).not.toBe(transformBefore);
    expect(videoAfter.style.transform).toContain("translate(");

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("freezes slideshow media motion on pause and resumes from the same point", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 4000,
            elements: [
              {
                id: "vid-pause-1",
                type: "video",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/pause-video.mp4",
                poster: "https://cdn.example.com/pause-video-poster.png",
                title: "Pause clip",
                muted: true,
                mediaMotion: {
                  preset: "pan-up-right",
                  intensity: 1,
                  easing: "linear",
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const video = screen.getByTestId("readonly-video-vid-pause-1") as HTMLVideoElement;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pause slideshow/i }));
    });
    const transformWhilePaused = video.style.transform;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId("readonly-video-vid-pause-1")).toBe(video);
    expect(video.style.transform).toBe(transformWhilePaused);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resume slideshow/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(video.style.transform).not.toBe(transformWhilePaused);

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("renders inline svg image elements in slideshow overlay instead of placeholder blocks", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            elements: [
              {
                id: "svg-1",
                type: "image",
                x: 120,
                y: 120,
                width: 260,
                height: 180,
                src: "",
                alt: "Inline SVG",
                svgColor: "#22c55e",
                svgContent: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='currentColor' /></svg>",
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    const svgHost = screen.getByTestId("readonly-svg-image-svg-1");
    expect(svgHost.querySelector("svg")).toBeInTheDocument();
  });

  it("animates inline svg image elements in slideshow overlay", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 4000,
            elements: [
              {
                id: "svg-motion-1",
                type: "image",
                x: 120,
                y: 120,
                width: 260,
                height: 180,
                src: "",
                alt: "Inline SVG Motion",
                svgColor: "#22c55e",
                svgContent: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='currentColor' /></svg>",
                mediaMotion: {
                  preset: "pan-down-right",
                  intensity: 1,
                  easing: "linear",
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });
    expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();

    const svgHost = screen.getByTestId("readonly-svg-image-svg-motion-1");
    const transformBefore = svgHost.style.transform;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(svgHost.style.transform).not.toBe(transformBefore);
    expect(svgHost.style.transform).toContain("translate(");

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("animates raster image elements visibly in slideshow overlay for long slides", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 10_000,
            elements: [
              {
                id: "img-motion-1",
                type: "image",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/motion-image.png",
                alt: "Raster motion",
                mediaMotion: {
                  preset: "zoom-in",
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });

    const image = within(screen.getByTestId("slideshow-preview-overlay")).getByAltText("Raster motion") as HTMLImageElement;
    expect(image.style.transform).toBe("translate(0%, 0%) scale(1)");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const scaleMatch = image.style.transform.match(/scale\(([^)]+)\)/);
    expect(scaleMatch).not.toBeNull();
    expect(Number(scaleMatch?.[1] ?? "0")).toBeGreaterThan(1.02);

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("starts outro image motion near the end of the slideshow overlay", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 10_000,
            elements: [
              {
                id: "img-outro-1",
                type: "image",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/motion-image.png",
                alt: "Raster outro motion",
                mediaMotion: {
                  outro: {
                    preset: "pan-left",
                    intensity: 1,
                    easing: "linear",
                    durationMs: 2000,
                  },
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });

    const image = within(screen.getByTestId("slideshow-preview-overlay")).getByAltText("Raster outro motion") as HTMLImageElement;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(image.style.transform).toContain("translate(0%, 0%)");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const translateMatch = image.style.transform.match(/translate\(([-0-9.]+)%\,\s*0%\)/);
    expect(translateMatch).not.toBeNull();
    expect(Number(translateMatch?.[1] ?? "0")).toBeLessThan(-5.5);

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("resets slideshow media motion when jumping to another slide during playback", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => (
        window.setTimeout(() => callback(window.performance.now()), 16) as unknown as number
      ));
    const performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => Date.now());
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle: number) => {
        window.clearTimeout(handle);
      });
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            durationMs: 10_000,
            elements: [
              {
                id: "img-slide-one",
                type: "image",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/slide-one.png",
                alt: "Slide one static",
              },
            ],
          },
          notes: null,
        },
        {
          id: 72,
          deckId: 7,
          orderIndex: 1,
          version: 3,
          title: "Agenda",
          slideContent: {
            durationMs: 10_000,
            elements: [
              {
                id: "img-slide-two",
                type: "image",
                x: 120,
                y: 120,
                width: 320,
                height: 180,
                src: "https://cdn.example.com/slide-two.png",
                alt: "Slide two motion",
                mediaMotion: {
                  preset: "zoom-in",
                },
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });

    const image = within(screen.getByTestId("slideshow-preview-overlay")).getByAltText("Slide two motion") as HTMLImageElement;
    expect(image.style.transform).toBe("translate(0%, 0%) scale(1)");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const scaleMatch = image.style.transform.match(/scale\(([^)]+)\)/);
    expect(scaleMatch).not.toBeNull();
    expect(Number(scaleMatch?.[1] ?? "0")).toBeGreaterThan(1.02);

    requestAnimationFrameSpy.mockRestore();
    performanceNowSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("falls back to svg placeholder tile when inline svg markup is invalid", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Intro",
          slideContent: {
            elements: [
              {
                id: "svg-bad-1",
                type: "image",
                x: 120,
                y: 120,
                width: 260,
                height: 180,
                src: "",
                alt: "Invalid inline SVG",
                svgColor: "#22c55e",
                svgContent: "<div>broken</div>",
              },
            ],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    expect(screen.getByTestId("readonly-svg-placeholder-svg-bad-1")).toBeInTheDocument();
  });

  it("renders presentation saved version history list", () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));
    expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-item-501")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore selected version 12/i })).toBeInTheDocument();
  });

  it("groups versions by slide and shows preview diff for selected version", async () => {
    queryState.presentationVersions = [
      {
        id: 501,
        versionNumber: 12,
        contentType: "presentation_slide_snapshot_v1",
        changeDescription: "Manual save: Intro",
        createdAt: new Date().toISOString(),
        createdByUserId: 1,
        snapshot: {
          schemaVersion: "presentation_slide_snapshot_v1",
          deckId: 7,
          libraryItemId: 42,
          slideId: 71,
          slideVersion: 3,
          slideTitle: "Intro",
          slideContent: {
            elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
          },
          notes: null,
          saveMode: "manual",
          savedAt: new Date().toISOString(),
          savedByUserId: 1,
        },
      },
      {
        id: 502,
        versionNumber: 11,
        contentType: "presentation_slide_snapshot_v1",
        changeDescription: "Manual save: Agenda",
        createdAt: new Date(Date.now() - 60000).toISOString(),
        createdByUserId: 1,
        snapshot: {
          schemaVersion: "presentation_slide_snapshot_v1",
          deckId: 7,
          libraryItemId: 42,
          slideId: 72,
          slideVersion: 1,
          slideTitle: "Agenda",
          slideContent: {
            elements: [{ id: "t-2", type: "text", x: 20, y: 20, width: 240, height: 70, text: "Agenda v1", color: "#111827" }],
          },
          notes: null,
          saveMode: "manual",
          savedAt: new Date(Date.now() - 60000).toISOString(),
          savedByUserId: 1,
        },
      },
    ] as any[];

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));

    expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-group-slide-72")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("presentation-version-item-502"));
    await waitFor(() => {
      expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-diff-summary")).toBeInTheDocument();
    });
  });

  it("restores a selected presentation version from history after confirmation", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore selected version 12/i }));
    expect(mutationMocks.restoreVersion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));
    await waitFor(() => {
      expect(mutationMocks.restoreVersion).toHaveBeenCalledWith({ deckId: 7, versionId: 501 });
    });
  });

  it("exposes standard text styling controls and shape fill/border controls", async () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /apply heading text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply subheading text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply body text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply citation text preset/i })).toBeInTheDocument();
    expect(screen.getByText("Font Family")).toBeInTheDocument();
    expect(screen.getByText("Typography")).toBeInTheDocument();
    expect(screen.getByText("Spacing")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Font Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Content")).toBeInTheDocument();
    expect(screen.getByTitle("Bold")).toBeInTheDocument();
    expect(screen.getByTitle("Italic")).toBeInTheDocument();
    expect(screen.getByTitle("Underline")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add rectangle element/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Rectangle Fill")).toBeInTheDocument();
      expect(screen.getByLabelText("Rectangle Border")).toBeInTheDocument();
      expect(screen.getByLabelText("Rectangle Border Width")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add line element/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Line Fill")).toBeInTheDocument();
      expect(screen.getByLabelText("Line Stroke")).toBeInTheDocument();
      expect(screen.getByLabelText("Line Stroke Width")).toBeInTheDocument();
    });
  });

  it("applies text preset styles with one click", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /apply heading text preset/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Text Font Size")).toHaveValue(64);
      expect(screen.getByTitle("Hello")).toHaveStyle({
        fontWeight: "700",
        fontStyle: "normal",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /apply citation text preset/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Text Font Size")).toHaveValue(26);
      expect(screen.getByTitle("Hello")).toHaveStyle({
        fontWeight: "500",
        fontStyle: "italic",
        textAlign: "right",
      });
    });
  });

  it("wires slide CRUD and reorder controls to typed API bindings", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /duplicate slide/i }));
    await waitFor(() => {
      expect(mutationMocks.duplicateSlide).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /move slide down/i }));
    await waitFor(() => {
      expect(mutationMocks.reorderSlides).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /delete slide/i }));

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
      expect(mutationMocks.duplicateSlide).toHaveBeenCalledTimes(1);
      expect(mutationMocks.reorderSlides).toHaveBeenCalledTimes(1);
      expect(mutationMocks.deleteSlide).toHaveBeenCalled();
    });
  });

  it("supports drag-drop slide reordering from the slides browse panel", async () => {
    render(<PresentationEditor />);

    const dataTransfer = createDragDataTransfer();
    fireEvent.dragStart(screen.getByTestId("slide-preview-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("slide-preview-2"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("slide-preview-2"), { dataTransfer });

    await waitFor(() => {
      expect(mutationMocks.reorderSlides).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        movedSlideId: 71,
        targetIndex: 1,
        expectedVersion: 5,
      }));
    });
  });

  it("opens compact reorder overview from browse hint", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getAllByRole("button", { name: /open reorder slides overview/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /reorder slides overview/i })).toBeInTheDocument();
      expect(screen.getByText("2 slide(s) total")).toBeInTheDocument();
    });
  });

  it("supports drag-drop reordering inside compact reorder overview", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getAllByRole("button", { name: /open reorder slides overview/i })[0]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /reorder slides overview/i })).toBeInTheDocument();
    });

    const dataTransfer = createDragDataTransfer();
    fireEvent.dragStart(screen.getByTestId("reorder-slide-tile-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("reorder-slide-tile-2"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("reorder-slide-tile-2"), { dataTransfer });

    await waitFor(() => {
      expect(mutationMocks.reorderSlides).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        movedSlideId: 71,
        targetIndex: 1,
        expectedVersion: 5,
      }));
    });
  });

  it("applies selected transition to every slide from the slide timing panel", async () => {
    render(<PresentationEditor />);

    fireEvent.change(screen.getByLabelText("Slide Transition"), {
      target: { value: "slide-left" },
    });
    mutationMocks.updateSlide.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /apply transition all slides/i }));

    await waitFor(() => {
      const payloads = mutationMocks.updateSlide.mock.calls.map(([payload]) => payload);
      expect(payloads).toEqual(expect.arrayContaining([
        expect.objectContaining({
          slideId: 71,
          slideContent: expect.objectContaining({ transition: "slide-left" }),
        }),
        expect.objectContaining({
          slideId: 72,
          slideContent: expect.objectContaining({ transition: "slide-left" }),
        }),
      ]));
    });
  });

  it("supports adding slides repeatedly with incremented deck expectedVersion", async () => {
    render(<PresentationEditor />);

    const addSlideButton = screen.getByRole("button", { name: /add slide/i });
    fireEvent.click(addSlideButton);
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(addSlideButton);
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(2);
    });

    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedVersion: 5,
    }));
    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedVersion: 6,
    }));
  });

  it("adds a new slide using the current canvas ratio", async () => {
    render(<PresentationEditor />);

    fireEvent.change(screen.getByLabelText("Canvas Aspect Ratio"), {
      target: { value: "9:16" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-size")).toHaveTextContent("canvas: 720x1280 (9:16)");
    });

    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });

    expect(mutationMocks.addSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideContent: expect.objectContaining({
        canvas: expect.objectContaining({
          preset: "9:16",
          width: 720,
          height: 1280,
        }),
      }),
    }));
  });

  it("shows deterministic wrong-editor recovery CTA when guard blocks", () => {
    queryState.guard = {
      allowed: false,
      itemId: 42,
      itemType: "document",
      errorCode: "PRESENTATION_ITEM_TYPE_MISMATCH",
      message: "Presentation editor only supports itemType=\"presentation\".",
      recoveryCta: {
        label: "Open in Document Management",
        href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=42",
      },
    };

    render(<PresentationEditor />);

    expect(screen.getByText(/wrong editor route/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open in document management/i }),
    ).toBeInTheDocument();
  });

  it("shows deterministic blocked-edit guidance for unsupported legacy payloads", async () => {
    queryState.deckByItem = null as any;
    queryState.deckError = new Error(
      "PRESENTATION_VALIDATION_FAILED: unsupported legacy payload for editable v2 content [PRESENTATION_LEGACY_PAYLOAD_BLOCKED]",
    );

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(screen.getByText(/open read-only and convert this deck before editing/i)).toBeInTheDocument();
    });
  });

  it("Export button is present in toolbar", () => {
    render(<PresentationEditor />);
    expect(screen.getByRole("button", { name: /^export$/i })).toBeInTheDocument();
  });

  it("clicking Export button opens ExportDialog modal", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
    await waitFor(() => {
      expect(screen.getByTestId("export-dialog-mock")).toBeInTheDocument();
    });
  });

  it("Audio tab is present in right properties panel", () => {
    render(<PresentationEditor />);
    expect(screen.getByRole("button", { name: /inspector tab audio/i })).toBeInTheDocument();
  });

  it("Audio tab renders SlideAudioPanel with current deck ID", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /inspector tab audio/i }));
    await waitFor(() => {
      const panel = screen.getByTestId("slide-audio-panel-mock");
      expect(panel).toBeInTheDocument();
      // deckId is 7 per the buildDeckByItem() fixture
      expect(panel).toHaveAttribute("data-deck-id", "7");
    });
  });

  it("Play Mode button is present in toolbar", () => {
    render(<PresentationEditor />);
    expect(screen.getByRole("button", { name: /play mode/i })).toBeInTheDocument();
  });

  it("clicking Play Mode button navigates to /presentation/:itemId/play", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /play mode/i }));
    await waitFor(() => {
      // docId is 42 per the routeParamsMock fixture
      expect(setLocationMock).toHaveBeenCalledWith("/presentation/42/play");
    });
  });

  it("navigates back to Presentation Library from editor header", () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/presentations");
  });

  it("shows project title and supports renaming from header", async () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("heading", { name: /product pitch/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit project name/i }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Pitch V2" } });
    fireEvent.click(screen.getByRole("button", { name: /save project name/i }));

    await waitFor(() => {
      expect(mutationMocks.updateItem).toHaveBeenCalledWith({ id: 42, title: "Pitch V2" });
      expect(mutationMocks.updateDeck).toHaveBeenCalled();
    });
  });

  it("opens presentation note dialog and saves deck notes through updateDeck", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open presentation note/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/write presentation-level notes here/i),
      { target: { value: "Full presentation note" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(mutationMocks.updateDeck).toHaveBeenCalledWith({
        deckId: 7,
        expectedVersion: 5,
        notes: "Full presentation note",
      });
    });
  });

  it("preserves local presentation note draft on conflict and allows explicit overwrite", async () => {
    mutationMocks.updateDeck
      .mockImplementationOnce(async () => {
        queryState.deckByItem = {
          ...buildDeckByItem(),
          deck: {
            ...buildDeckByItem().deck,
            version: 6,
            notes: "Remote note from another session",
          },
        } as any;
        throw new Error("PRESENTATION_VERSION_CONFLICT: expected deck version 5 but latest is 6");
      })
      .mockResolvedValueOnce({});

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open presentation note/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/write presentation-level notes here/i),
      { target: { value: "My local note" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(screen.getByText(/a newer presentation note was saved elsewhere/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("My local note")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /overwrite note/i }));

    await waitFor(() => {
      expect(mutationMocks.updateDeck).toHaveBeenNthCalledWith(2, {
        deckId: 7,
        expectedVersion: 6,
        notes: "My local note",
      });
    });
  });

  it("opens slide note dialog and saves slide notes with the slide payload", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open slide note/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/write slide-level notes here/i),
      { target: { value: "Narration for intro slide" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(mutationMocks.updateSlide).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: 7,
          slideId: 71,
          saveMode: "manual",
          notes: "Narration for intro slide",
        }),
      );
    });
  });

  it("supports saving current presentation as template", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /save to template/i }));

    await waitFor(() => {
      expect(mutationMocks.saveAsTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLibraryItemId: 42 }),
      );
      expect(setLocationMock).toHaveBeenCalledWith("/presentations");
    });
  });

  it("auto-initializes deck when deck is missing", async () => {
    queryState.deckByItem = null as any;
    queryState.deckError = new Error("PRESENTATION_NOT_FOUND: no presentation deck exists for library item 42");

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(mutationMocks.createDeck).toHaveBeenCalledWith({
        libraryItemId: 42,
        title: "Product Pitch",
      });
    });
  });

  it("renders canvas shell stage layers from serialized slide content", () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-shell")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-background")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-content")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-selection-guides")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-interaction-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-content")).toHaveTextContent(/hello/i);
  });

  it("cleans up canvas stage listeners on unmount/remount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<PresentationEditor />);
    unmount();
    render(<PresentationEditor />);

    expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("supports keyboard movement plus undo/redo for selected elements", async () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-transform-handles")).toBeInTheDocument();
    expect(screen.getByLabelText("Element x")).toHaveValue(10);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(11);
    });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(10);
    });

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(11);
    });

    // Redo using KeyZ physical code (non-English layout compatible)
    fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(11);
    });
  });

  it("supports copy/cut/paste hotkeys for selected canvas elements", async () => {
    render(<PresentationEditor />);
    const getCanvasObjects = () =>
      Array.from(document.querySelectorAll("[data-canvas-object='true']"));
    expect(getCanvasObjects()).toHaveLength(1);
    fireEvent.click(getCanvasObjects()[0] as HTMLElement);

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    await waitFor(() => {
      expect(getCanvasObjects()).toHaveLength(2);
    });

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    await waitFor(() => {
      expect(getCanvasObjects()).toHaveLength(1);
    });
  });

  it("supports pointer drag to move selected elements on canvas", async () => {
    render(<PresentationEditor />);
    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });

    expect(screen.getByLabelText("Element x")).toHaveValue(10);
    expect(screen.getByLabelText("Element y")).toHaveValue(10);

    fireEvent.pointerDown(canvasElement, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: 135,
      clientY: 145,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      clientX: 135,
      clientY: 145,
    });

    await waitFor(() => {
      const xInput = screen.getByLabelText("Element x") as HTMLInputElement;
      const yInput = screen.getByLabelText("Element y") as HTMLInputElement;
      expect(Number(xInput.value)).toBeGreaterThan(10);
      expect(Number(yInput.value)).toBeGreaterThan(10);
    });
  });

  it("supports pointer resize via canvas corner handle", async () => {
    render(<PresentationEditor />);
    const resizeHandle = screen.getByLabelText("Resize Selected Element");

    expect(screen.getByLabelText("Element width")).toHaveValue(200);
    expect(screen.getByLabelText("Element height")).toHaveValue(60);

    fireEvent.pointerDown(resizeHandle, {
      pointerId: 2,
      button: 0,
      clientX: 300,
      clientY: 220,
    });
    fireEvent.pointerMove(window, {
      pointerId: 2,
      clientX: 340,
      clientY: 250,
    });
    fireEvent.pointerUp(window, {
      pointerId: 2,
      clientX: 340,
      clientY: 250,
    });

    await waitFor(() => {
      const widthInput = screen.getByLabelText("Element width") as HTMLInputElement;
      const heightInput = screen.getByLabelText("Element height") as HTMLInputElement;
      expect(Number(widthInput.value)).toBeGreaterThan(200);
      expect(Number(heightInput.value)).toBeGreaterThan(60);
    });
  });

  it("updates canvas zoom from toolbar controls", async () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x (0, 0)");
    });

    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("updates canvas zoom from mouse wheel scrolling on workspace", async () => {
    render(<PresentationEditor />);

    const workspace = screen.getByLabelText("Canvas workspace");
    fireEvent.wheel(workspace, { deltaY: -100, clientX: 300, clientY: 260 });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });
  });

  it("allows panning after zooming in on desktop canvas", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const panSurface = screen.getByTestId("canvas-stage-pan-surface");
    fireEvent.pointerDown(panSurface, {
      pointerId: 55,
      button: 0,
      clientX: 320,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 55,
      clientX: 210,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 55,
      clientX: 210,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).not.toHaveTextContent("(0, 0)");
    });
  });

  it("allows middle-mouse panning even when pointer starts on a canvas element", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });
    fireEvent.pointerDown(canvasElement, {
      pointerId: 57,
      button: 1,
      clientX: 320,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 57,
      clientX: 210,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 57,
      clientX: 210,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).not.toHaveTextContent("(0, 0)");
    });
  });

  it("fits viewport back to defaults after zoom/pan", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const panSurface = screen.getByTestId("canvas-stage-pan-surface");
    fireEvent.pointerDown(panSurface, {
      pointerId: 56,
      button: 0,
      clientX: 300,
      clientY: 240,
    });
    fireEvent.pointerMove(window, {
      pointerId: 56,
      clientX: 220,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 56,
      clientX: 220,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.click(screen.getByRole("button", { name: /fit canvas to view/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("supports desktop keyboard shortcuts for zoom in/out and reset", async () => {
    render(<PresentationEditor />);
    expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("supports changing canvas preset ratio from toolbar", async () => {
    render(<PresentationEditor />);
    expect(screen.getByTestId("canvas-stage-size")).toHaveTextContent("canvas: 720x1280 (9:16)");

    fireEvent.change(screen.getByLabelText("Canvas Aspect Ratio"), {
      target: { value: "16:9" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-size")).toHaveTextContent("canvas: 1280x720 (16:9)");
    });
  });

  it("supports rotating selected element from canvas rotate handle", async () => {
    render(<PresentationEditor />);
    const rotateHandle = screen.getByLabelText("Rotate Selected Element");
    expect(screen.getByLabelText("Element Rotation")).toHaveValue(0);

    fireEvent.pointerDown(rotateHandle, {
      pointerId: 77,
      button: 0,
      clientX: 320,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 77,
      clientX: 380,
      clientY: 100,
    });
    fireEvent.pointerUp(window, {
      pointerId: 77,
      clientX: 380,
      clientY: 100,
    });

    await waitFor(() => {
      const rotation = Number((screen.getByLabelText("Element Rotation") as HTMLInputElement).value);
      expect(rotation).toBeGreaterThan(0);
    });
  });

  it("renders mobile pan-safe mode with explicit toggle and viewport gesture updates", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    expect(screen.getByTestId("mobile-quick-actions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand panel/i }));
    fireEvent.click(screen.getByRole("tab", { name: /mobile properties section canvas/i }));
    expect(screen.getByLabelText("Canvas Aspect Ratio (Properties)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit mode/i })).toBeInTheDocument();
    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });
    const initialStyle = canvasElement.getAttribute("style");
    const viewportStatus = screen.getByTestId("canvas-stage-viewport");
    expect(viewportStatus).toHaveTextContent("1.00x");
    expect(screen.getAllByRole("button", { name: /fit canvas to view/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /center canvas view/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /center canvas view/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reset canvas view/i })).toBeDisabled();
    expect(screen.queryByTestId("mobile-selection-controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move selection left/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pan mode/i })).toBeInTheDocument();
      expect(screen.getByTestId("mobile-selection-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /move selection left/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /select canvas element 1/i }).getAttribute("style"))
        .not.toBe(initialStyle);
    });

    fireEvent.click(screen.getByRole("button", { name: /pan mode/i }));
    expect(screen.getByRole("button", { name: /edit mode/i })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-selection-controls")).not.toBeInTheDocument();

    const stageLayer = screen.getByTestId("canvas-stage-layer-content");
    fireEvent.touchStart(stageLayer, {
      touches: [
        { identifier: 1, clientX: 100, clientY: 120 },
        { identifier: 2, clientX: 220, clientY: 120 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 100, clientY: 120 },
        { identifier: 2, clientX: 220, clientY: 120 },
      ],
    });
    fireEvent.touchMove(stageLayer, {
      touches: [
        { identifier: 1, clientX: 80, clientY: 120 },
        { identifier: 2, clientX: 260, clientY: 120 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 80, clientY: 120 },
        { identifier: 2, clientX: 260, clientY: 120 },
      ],
    });
    fireEvent.touchEnd(stageLayer, {
      touches: [],
      changedTouches: [
        { identifier: 1, clientX: 80, clientY: 120 },
        { identifier: 2, clientX: 260, clientY: 120 },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).not.toHaveTextContent("1.00x");
    });

    const centerViewButton = screen.getByRole("button", { name: /center canvas view/i });
    expect(centerViewButton).toBeEnabled();

    const fitViewButton = screen.getByRole("button", { name: /fit canvas to view/i });
    fireEvent.click(fitViewButton);

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("1.00x");
    });
  });

  it("shows version history in mobile bottom sheet versions tab", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("tab", { name: "Versions" }));

    await waitFor(() => {
      expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
    });
  });

  it("supports four-direction mobile nudge controls once edit mode is enabled", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));
    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });
    const initialStyle = canvasElement.getAttribute("style");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pan mode/i })).toBeInTheDocument();
      expect(screen.getByTestId("mobile-selection-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /move selection down/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /select canvas element 1/i }).getAttribute("style"))
        .not.toBe(initialStyle);
    });
  });

  it("lets the user collapse mobile selection controls to reclaim canvas space", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));
    await waitFor(() => {
      expect(screen.getByTestId("mobile-selection-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /toggle selection controls/i }));
    expect(screen.queryByTestId("mobile-selection-controls")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle selection controls/i }));
    expect(screen.getByTestId("mobile-selection-controls")).toBeInTheDocument();
  });

  it("moves secondary toolbar actions into a mobile overflow menu", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /save slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play slideshow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    expect(await screen.findByRole("menuitem", { name: /^import$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^export$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /play mode/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
    });
  });

  it("starts tablet bottom sheet expanded so properties stay accessible", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 820 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("tab", { name: /mobile properties section canvas/i }));
    expect(screen.getByLabelText("Canvas Aspect Ratio (Properties)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
  });

  it("remembers the last mobile bottom sheet tab and expansion state within the session", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    const firstRender = render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
    await waitFor(() => {
      expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
    });

    firstRender.unmount();

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches the mobile bottom sheet back to properties when an element is selected", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
    await waitFor(() => {
      expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /collapse panel/i }));
    expect(screen.getByRole("button", { name: /expand panel/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));

    fireEvent.click(screen.getByRole("button", { name: /select canvas element 1/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Properties" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
    });
  });

  it("organizes mobile properties into element, slide, and canvas sections", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /expand panel/i }));

    expect(screen.getByRole("tab", { name: /mobile properties section element/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /mobile properties section slide/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /mobile properties section canvas/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /mobile properties section slide/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Slide duration seconds")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /mobile properties section canvas/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Canvas Aspect Ratio (Properties)")).toBeInTheDocument();
      expect(screen.queryByLabelText("Slide duration seconds")).not.toBeInTheDocument();
    });
  });

  it("returns mobile properties to the element section when a canvas element is focused", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /expand panel/i }));

    fireEvent.click(screen.getByRole("tab", { name: /mobile properties section slide/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Slide duration seconds")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /select canvas element 1/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /mobile properties section element/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Element x")).toBeInTheDocument();
      expect(screen.queryByLabelText("Slide duration seconds")).not.toBeInTheDocument();
    });
  });

  it("closes the mobile tools drawer after adding an element", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open tools panel/i }));
    const toolsPanel = screen.getByRole("dialog", { name: /editor tools panel/i });
    expect(toolsPanel).toHaveClass("translate-x-0");

    fireEvent.click(within(toolsPanel).getByRole("tab", { name: "Add" }));
    fireEvent.click(within(toolsPanel).getByRole("button", { name: /add text element/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /editor tools panel/i })).toHaveClass("-translate-x-full");
      expect(screen.getByRole("tab", { name: "Properties" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
    });
  });

  it("debounces rapid edits into a single autosave mutation", async () => {
    vi.useFakeTimers();
    let version = 3;
    mutationMocks.updateSlide.mockImplementation(async () => ({ version: ++version }));

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(mutationMocks.updateSlide).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
    expect(mutationMocks.updateSlide).toHaveBeenCalledWith(expect.objectContaining({
      saveMode: "autosave",
    }));
  });

  it("applies cooldown after autosave conflict and suppresses immediate retry", async () => {
    vi.useFakeTimers();
    const conflict = new Error("PRESENTATION_VERSION_CONFLICT: stale");
    mutationMocks.updateSlide
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({ version: 5 });

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(2);
  });

  it("treats manual conflict as saved when latest slide already matches draft content", async () => {
    const conflict = new Error("PRESENTATION_VERSION_CONFLICT: stale-manual");
    (conflict as any).cause = {
      conflictSchemaVersion: "presentation_conflict_v1",
      reasonCode: "SLIDE_VERSION_MISMATCH",
      expectedVersion: 3,
      latestDeckVersion: 6,
      latestSlideVersion: 4,
      deckId: 7,
      slideId: 71,
      saveMode: "manual",
      latestDeck: {
        id: 7,
        version: 6,
        slideCount: 2,
        totalAssetBytes: 0,
        updatedAt: new Date(),
      },
      latestSlide: {
        id: 71,
        deckId: 7,
        orderIndex: 0,
        version: 4,
        title: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
        updatedAt: new Date(),
      },
    };
    mutationMocks.updateSlide.mockRejectedValueOnce(conflict);

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /save slide/i }));
    await waitFor(() => {
      expect(screen.getByText(/save: saved/i)).toBeInTheDocument();
    });

    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /reload latest slide/i })).not.toBeInTheDocument();
  });

  it("continues blocking autosave after repeated conflicts but still lets manual save retry immediately", async () => {
    vi.useFakeTimers();
    mutationMocks.updateSlide
      .mockRejectedValueOnce(new Error("PRESENTATION_VERSION_CONFLICT: stale-1"))
      .mockRejectedValueOnce(new Error("PRESENTATION_VERSION_CONFLICT: stale-2"))
      .mockResolvedValue({ version: 8 });

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /save slide/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(3);
    expect(mutationMocks.updateSlide).toHaveBeenLastCalledWith(expect.objectContaining({
      saveMode: "manual",
    }));
    expect(screen.queryByRole("button", { name: /reload latest slide/i })).not.toBeInTheDocument();
  });

  describe("Import button integration", () => {
    it('renders an "Import" button in the toolbar', () => {
      render(<PresentationEditor />);
      expect(screen.getByRole("button", { name: /^import$/i })).toBeInTheDocument();
    });

    it("opens ImportPresentationDialog when Import button is clicked", async () => {
      render(<PresentationEditor />);
      expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

      await waitFor(() => {
        expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
      });
    });

    it("closes ImportPresentationDialog when onClose is called", async () => {
      render(<PresentationEditor />);

      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
      await waitFor(() => expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /close import/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
      });
    });
  });
});
