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

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: (...args: Parameters<typeof actual.useTranslation>) => {
      const result = actual.useTranslation(...args);
      return {
        ...result,
        i18n: {
          ...result.i18n,
          exists: result.i18n.exists ?? vi.fn(() => true),
        },
      };
    },
  };
});

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
  repairSlideFromNote: vi.fn(),
  generateLayoutFromNote: vi.fn(),
  generateLayoutFromDeckNote: vi.fn(),
  generateArticle: vi.fn(),
  prepareSlideBundle: vi.fn(),
  generateSlideDraft: vi.fn(),
  resolvePendingMedia: vi.fn(),
  saveCustomBlock: vi.fn(),
  deleteCustomBlock: vi.fn(),
  updateCustomBlock: vi.fn(),
  trackCustomBlockUse: vi.fn(),
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

function buildSkillCatalog() {
  return [
    {
      id: 101,
      slug: "article-writer",
      name: "Article Writer",
      category: "article_generation",
      executionMode: "llm-only",
    },
    {
      id: 202,
      slug: "modern-editorial-slide",
      name: "Modern Editorial Slide",
      category: "slide_generation",
      executionMode: "llm-only",
    },
  ];
}

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
  customBlocks: [] as any[],
  customBlockPreview: {
    artifactKey: "",
    artifactUrl: "",
    previewHash: "preview-hash-1",
    rendererVersion: "server-svg-v1",
    generatedAt: "2026-03-13T00:00:00.000Z",
    svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280 720\"><rect width=\"1280\" height=\"720\" fill=\"#ffffff\" /><text x=\"120\" y=\"180\" font-size=\"52\" fill=\"#111827\">Canonical Preview</text></svg>",
  } as any,
  sandboxJobStatus: null as any,
  skillCatalog: buildSkillCatalog(),
  mediaGetTaskFetch: vi.fn().mockResolvedValue({
    status: "completed",
    resultUrl: "https://cdn.example.com/generated-asset.png",
  }),
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
        listCustomBlocks: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      media: {
        getTask: {
          fetch: (...args: any[]) => queryState.mediaGetTaskFetch(...args),
        },
      },
    }),
    sandbox: {
      getJobStatus: {
        useQuery: vi.fn(() => ({
          data: queryState.sandboxJobStatus,
          isLoading: false,
          error: null,
        })),
      },
    },
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
      listCustomBlocks: {
        useQuery: vi.fn(() => ({
          data: queryState.customBlocks,
          isLoading: false,
          isError: false,
          error: null,
        })),
      },
      renderCustomBlockPreview: {
        useQuery: vi.fn((input?: any, options?: any) => {
          if (options?.enabled === false || !input?.previewSource) {
            return {
              data: undefined,
              isLoading: false,
              isError: false,
              error: null,
            };
          }
          const firstText = input.previewSource.fallbackElements.find((element: any) => element.type === "text")?.text || "Canonical Preview";
          return {
            data: {
              ...queryState.customBlockPreview,
              svg: `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280 720\"><rect width=\"1280\" height=\"720\" fill=\"#ffffff\" /><text x=\"120\" y=\"180\" font-size=\"52\" fill=\"#111827\">${firstText}</text></svg>`,
            },
            isLoading: false,
            isError: false,
            error: null,
          };
        }),
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
        repairSlideFromNote: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.repairSlideFromNote,
            isPending: false,
          })),
        },
        generateLayoutFromNote: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.generateLayoutFromNote,
            isPending: false,
          })),
        },
        generateLayoutFromDeckNote: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.generateLayoutFromDeckNote,
            isPending: false,
          })),
        },
        generateArticle: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.generateArticle,
            isPending: false,
          })),
        },
        prepareSlideBundle: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.prepareSlideBundle,
            isPending: false,
          })),
        },
        generateSlideDraft: {
          useMutation: vi.fn(() => ({
            mutateAsync: mutationMocks.generateSlideDraft,
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
      saveCustomBlock: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.saveCustomBlock,
          isPending: false,
        })),
      },
      deleteCustomBlock: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.deleteCustomBlock,
          isPending: false,
        })),
      },
      updateCustomBlock: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateCustomBlock,
          isPending: false,
        })),
      },
      trackCustomBlockUse: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.trackCustomBlockUse,
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
      listModelFieldOptions: {
        useQuery: vi.fn(() => ({
          data: { options: [] },
          isLoading: false,
          error: null,
        })),
      },
    },
    skills: {
      list: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
      },
      listFromDb: {
        useQuery: vi.fn(() => ({
          data: queryState.skillCatalog,
          isLoading: false,
          error: null,
        })),
      },
    },
    chat: {
      executeSkill: {
        useMutation: vi.fn(() => ({
          mutateAsync: vi.fn().mockResolvedValue({ success: true, message: "Generated content" }),
          isPending: false,
        })),
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    queryState.sandboxJobStatus = null;
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
    mutationMocks.repairSlideFromNote.mockResolvedValue({
      slide: {
        id: 71,
        version: 4,
        title: "Intro",
        notes: "Saved note",
        slideContent: {
          elements: [
            { id: "repair-title", type: "text", x: 120, y: 80, width: 320, height: 70, text: "Repaired headline", color: "#111827" },
          ],
        },
      },
      warnings: [],
      applied: {
        templateId: "split_right_image",
        stylePresetId: "dark-professional",
        graphicCategory: "Business",
        regeneratedImage: true,
      },
    });
    mutationMocks.generateArticle.mockResolvedValue({
      article: "Generated presentation article",
      sourceLabel: "Article Writer",
      modelId: "gpt-5.4",
    });
    mutationMocks.prepareSlideBundle.mockResolvedValue({
      maxPages: 6,
      plannedImageCount: 8,
      slideSkillLabel: "Modern Editorial Slide",
      imagePrompts: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
        },
        {
          id: "img-2-1",
          pageNumber: 2,
          imageIndex: 1,
          placementRole: "supporting",
          shortLabel: "section visual",
          prompt: "Section image prompt",
        },
      ],
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      modelId: "gpt-5.4",
    });
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 6,
      slideSkillLabel: "Modern Editorial Slide",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    });
    mutationMocks.resolvePendingMedia.mockResolvedValue({
      slide: { id: 71, version: 4 },
      resolvedAssets: [],
      unresolvedAssets: [],
      warnings: [],
    });
    mutationMocks.saveCustomBlock.mockImplementation(async (input: any) => ({
      id: "901",
      label: input.label,
      description: input.description,
      category: "Custom",
      componentId: input.componentId,
      slotBindings: input.slotBindings,
      visibility: input.visibility,
      isPinned: false,
      isTeamFeatured: false,
      usageCount: 0,
      favoriteUserIds: [],
      isFavorite: false,
      ownerUserId: 1,
      canDelete: true,
      canFeature: input.visibility === "team",
      canTransferOwnership: input.visibility === "team",
      savedAt: "2026-03-13T00:00:00.000Z",
      preview: {
        artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
        artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
        previewHash: "hash-1",
        rendererVersion: "server-svg-v1",
        generatedAt: "2026-03-13T00:00:00.000Z",
      },
    }));
    mutationMocks.deleteCustomBlock.mockResolvedValue({ deleted: true });
    mutationMocks.updateCustomBlock.mockImplementation(async (input: any) => ({
      id: input.blockId,
      label: "Intro Block",
      description: "Saved from AI Layout.",
      category: "Custom",
      componentId: "quote-callout",
      slotBindings: [
        { slotId: "quote", type: "text", text: "Saved quote" },
        { slotId: "eyebrow", type: "text", text: "Saved eyebrow" },
        { slotId: "attribution", type: "text", text: "Saved attribution" },
      ],
      visibility: "team",
      isPinned: input.isPinned ?? false,
      isTeamFeatured: input.isTeamFeatured ?? false,
      usageCount: 2,
      favoriteUserIds: input.favorite ? [1] : [],
      isFavorite: Boolean(input.favorite),
      ownerUserId: input.transferToUserId ?? 1,
      canDelete: (input.transferToUserId ?? 1) === 1,
      canFeature: input.transferToUserId === undefined,
      canTransferOwnership: input.transferToUserId === undefined,
      savedAt: "2026-03-13T00:00:00.000Z",
      preview: {
        artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
        artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
        previewHash: "hash-1",
        rendererVersion: "server-svg-v1",
        generatedAt: "2026-03-13T00:00:00.000Z",
      },
    }));
    mutationMocks.trackCustomBlockUse.mockImplementation(async (input: any) => ({
      id: input.blockId,
      label: "Intro Block",
      description: "Saved from AI Layout.",
      category: "Custom",
      componentId: "quote-callout",
      slotBindings: [
        { slotId: "quote", type: "text", text: "Saved quote" },
        { slotId: "eyebrow", type: "text", text: "Saved eyebrow" },
        { slotId: "attribution", type: "text", text: "Saved attribution" },
      ],
      visibility: "team",
      isPinned: false,
      isTeamFeatured: false,
      usageCount: 3,
      lastUsedAt: "2026-03-13T01:00:00.000Z",
      favoriteUserIds: [],
      isFavorite: false,
      ownerUserId: 1,
      canDelete: true,
      canFeature: true,
      canTransferOwnership: true,
      savedAt: "2026-03-13T00:00:00.000Z",
      preview: {
        artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
        artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
        previewHash: "hash-1",
        rendererVersion: "server-svg-v1",
        generatedAt: "2026-03-13T00:00:00.000Z",
      },
    }));
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
    queryState.customBlocks = [];
    queryState.skillCatalog = buildSkillCatalog();
    queryState.mediaGetTaskFetch = vi.fn().mockResolvedValue({
      status: "completed",
      resultUrl: "https://cdn.example.com/generated-asset.png",
    });
    queryState.customBlockPreview = {
      artifactKey: "",
      artifactUrl: "",
      previewHash: "preview-hash-1",
      rendererVersion: "server-svg-v1",
      generatedAt: "2026-03-13T00:00:00.000Z",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280 720\"><rect width=\"1280\" height=\"720\" fill=\"#ffffff\" /><text x=\"120\" y=\"180\" font-size=\"52\" fill=\"#111827\">Canonical Preview</text></svg>",
    };
  });

  it("renders labeled controls for slide and canvas editing", () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /add slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /duplicate slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide down/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add text element/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /header\.saveSlide/i })).toBeInTheDocument();
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

  it("syncs resolved media from persisted slide content even when cached jobs are already gone", () => {
    const cached = {
      elements: [
        { id: "hero-slot", type: "rect", x: 0, y: 0, width: 960, height: 1200, fill: "#d1d5db" },
        { id: "headline", type: "text", x: 80, y: 180, width: 540, height: 120, text: "Headline", color: "#111827" },
      ],
    } as any;
    const persisted = {
      elements: [
        { id: "hero-slot", type: "image", x: 0, y: 0, width: 960, height: 1200, src: "https://cdn.example.com/hero.png", alt: "Hero" },
        { id: "headline", type: "text", x: 80, y: 180, width: 540, height: 120, text: "Headline", color: "#111827" },
      ],
    } as any;

    const merged = mergeResolvedPendingMediaIntoCachedDraft(cached, persisted);

    expect((merged as any).elements[0]).toMatchObject({
      id: "hero-slot",
      type: "image",
      src: "https://cdn.example.com/hero.png",
    });
    expect((merged as any).elements[1]).toMatchObject({
      id: "headline",
      type: "text",
      text: "Headline",
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
      expect(screen.getByRole("button", { name: /header\.saveSlide/i })).toBeInTheDocument();
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

  it("inserts a block preset from the blocks library as a mixed multi-selection", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert process steps block/i }));

    expect(await screen.findByText("Step 01")).toBeInTheDocument();
    expect(screen.getByText("Prepare inputs")).toBeInTheDocument();
    expect(screen.getByText(/mixed object types selected\. property editing is disabled for safety\./i)).toBeInTheDocument();
  });

  it("inserts an editable component block and updates its slots without flattening to loose element selection", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    expect(screen.getByTestId("block-preview-profile-summary")).toBeInTheDocument();
    expect(screen.getByTestId("block-preview-poster-spotlight")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /insert editable profile summary block/i }));

    expect(await screen.findByText(/components on slide/i)).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Profile Summary Name");
    fireEvent.change(nameInput, { target: { value: "Jane Doe" } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
      expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/mixed object types selected\. property editing is disabled for safety\./i)).not.toBeInTheDocument();
  });

  it("inserts poster spotlight blocks through the editable component path", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable poster spotlight block/i }));

    expect(await screen.findByText(/components on slide/i)).toBeInTheDocument();
    expect(screen.getAllByText("Campaign Spotlight").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Poster Spotlight CTA")).toHaveValue("Book a free consult");
  });

  it("shows AI layout telemetry and lets users rebuild the slide with a different recipe", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        { id: "bg-1", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#eff6ff" },
        { id: "img-1", type: "image", x: 740, y: 90, width: 360, height: 520, src: "https://cdn.example.com/hero.png", alt: "Hero", imageFit: "cover" },
        { id: "title-1", type: "text", x: 120, y: 140, width: 440, height: 120, text: "Campaign Spotlight", color: "#111827", fontSize: 52 },
        { id: "body-1", type: "text", x: 120, y: 280, width: 420, height: 140, text: "Priority support\nPremium access\nJoin today", color: "#334155", fontSize: 28 },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-123",
        componentRecipeId: "poster-spotlight",
        mode: "structured_block",
        candidateModes: [
          { mode: "structured_block", score: 8, fitStatus: "fits", reason: "Compact promo copy fits the poster block." },
          { mode: "long_form_block", score: 2, fitStatus: "cramped", reason: "Too little copy for a long-form slide." },
        ],
        fitScore: {
          overall: 0.82,
          density: 0.77,
          readability: 0.84,
          overflowRisk: 0.18,
          status: "fits",
        },
        selectionMode: "heuristic",
        selectionReason: "Poster recipe best matched promo copy.",
        candidateRecipes: [
          { recipeId: "poster-spotlight", score: 9 },
          { recipeId: "quote-callout", score: 4 },
        ],
        sourceTrace: [
          { sourceId: "body-1", sourceType: "paragraph", disposition: "used", targetSlotId: "headline" },
          { sourceId: "body-2", sourceType: "paragraph", disposition: "shortened", targetSlotId: "summary" },
        ],
        fallbackHistory: [
          { step: "retry_compaction", reason: "Balanced compaction tightened the supporting copy.", timestamp: "2026-03-12T09:59:00.000Z" },
        ],
        narrative: {
          title: "Campaign Spotlight",
          body: ["Narrative Quote Line", "Premium access", "Join today"],
          notes: "Original AI notes",
          templateId: "split_right_image",
        },
        generatedAt: "2026-03-12T10:00:00.000Z",
      },
      background: {
        type: "color",
        value: "#dbeafe",
      },
    };

    render(<PresentationEditor />);

    expect(await screen.findByTestId("ai-layout-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ai-layout-mode-summary")).toHaveTextContent("Structured Block");
    expect(screen.getByTestId("ai-layout-fit-summary")).toHaveTextContent("Fit 82%");
    expect(screen.getByTestId("ai-layout-candidate-modes")).toHaveTextContent("Long-Form Block");
    expect(screen.getByTestId("ai-layout-fallback-history")).toHaveTextContent("retry_compaction");
    expect(screen.getByTestId("ai-layout-source-trace-summary")).toHaveTextContent("used 1");
    expect(screen.getByText(/current block layout: poster spotlight/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("AI Layout Block Override"), {
      target: { value: "quote-callout" },
    });
    fireEvent.click(screen.getByRole("button", { name: /rebuild ai layout/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Quote Callout Quote")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Quote Callout Quote")).toHaveValue("Narrative Quote Line");
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringMatching(/applied ai layout/i));
  });

  it("persists AI layout mode overrides and lock state in the editor panel", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        { id: "title-1", type: "text", x: 120, y: 140, width: 440, height: 120, text: "Campaign Spotlight", color: "#111827", fontSize: 52 },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-lock-1",
        componentRecipeId: "poster-spotlight",
        mode: "structured_block",
        selectionMode: "heuristic",
        narrative: {
          title: "Campaign Spotlight",
          body: ["Narrative Quote Line", "Premium access"],
          templateId: "split_right_image",
        },
      },
      background: {
        type: "color",
        value: "#dbeafe",
      },
    };

    render(<PresentationEditor />);

    await screen.findByTestId("ai-layout-panel");
    fireEvent.change(screen.getByLabelText("AI Layout Mode Override"), {
      target: { value: "long_form_block" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("ai-layout-mode-summary")).toHaveTextContent("Long-Form Block");
    });

    fireEvent.click(screen.getByLabelText("Lock AI Layout Mode"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-layout-mode-summary")).toHaveTextContent("Locked");
      expect(screen.getByLabelText("Lock AI Layout Mode")).toBeChecked();
    });
  });

  it("renders live AI preview content and saves rebuilt AI layouts as reusable custom blocks", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        { id: "bg-1", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#eff6ff" },
        { id: "img-1", type: "image", x: 740, y: 90, width: 360, height: 520, src: "https://cdn.example.com/hero.png", alt: "Hero", imageFit: "cover" },
        { id: "title-1", type: "text", x: 120, y: 140, width: 440, height: 120, text: "Campaign Spotlight", color: "#111827", fontSize: 52 },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-234",
        componentRecipeId: "poster-spotlight",
        selectionMode: "heuristic",
        selectionReason: "Poster recipe best matched promo copy.",
        candidateRecipes: [
          { recipeId: "poster-spotlight", score: 9 },
          { recipeId: "quote-callout", score: 4 },
        ],
        narrative: {
          title: "Campaign Spotlight",
          body: ["Narrative Quote Line", "Premium access", "Join today"],
          notes: "Original AI notes",
          templateId: "split_right_image",
        },
        generatedAt: "2026-03-12T10:00:00.000Z",
      },
      background: {
        type: "color",
        value: "#dbeafe",
      },
    };

    render(<PresentationEditor />);

    await screen.findByTestId("ai-layout-panel");
    fireEvent.change(screen.getByLabelText("AI Layout Block Override"), {
      target: { value: "quote-callout" },
    });

    fireEvent.click(screen.getByRole("button", { name: /rebuild ai layout/i }));
    await screen.findByLabelText("Quote Callout Quote");

    fireEvent.click(screen.getByRole("button", { name: /save as my block/i }));
    await waitFor(() => {
      expect(mutationMocks.saveCustomBlock).toHaveBeenCalledWith(expect.objectContaining({
        visibility: "private",
        previewSource: expect.objectContaining({
          canvas: expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
          fallbackElements: expect.any(Array),
          background: { type: "color", value: "#dbeafe" },
        }),
      }));
      expect(toastMocks.success).toHaveBeenCalledWith(expect.stringMatching(/saved custom block/i));
    });

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    expect(await screen.findByText("Intro Block")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /insert editable intro block/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Quote Callout Quote")).toHaveValue("Narrative Quote Line");
    });
  });

  it("opens the AI layout preview in a large modal dialog", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        { id: "title-1", type: "text", x: 120, y: 140, width: 440, height: 120, text: "Campaign Spotlight", color: "#111827", fontSize: 52 },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-999",
        componentRecipeId: "poster-spotlight",
        selectionMode: "heuristic",
        narrative: {
          title: "Campaign Spotlight",
          body: ["Narrative Quote Line", "Premium access"],
          templateId: "split_right_image",
        },
      },
      background: {
        type: "color",
        value: "#dbeafe",
      },
    };

    render(<PresentationEditor />);

    await screen.findByTestId("ai-layout-panel");
    fireEvent.click(screen.getByRole("button", { name: /preview block/i }));

    expect(await screen.findByRole("dialog", { name: /ai layout preview/i })).toBeInTheDocument();
    expect(screen.getByTestId("ai-layout-preview-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("AI Layout Block Override Dialog")).toBeInTheDocument();
  });

  it("shows AI layout controls on later slides by inferring a usable recipe from the current slide", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        buildDeckByItem().slides[0],
        {
          ...buildDeckByItem().slides[1],
          title: "FAQ",
          notes: "## Sleep routine\n- Keep a predictable bedtime\n## Night waking\n- Pause briefly before intervening",
          slideContent: {
            elements: [
              { id: "img-2", type: "image", x: 60, y: 80, width: 520, height: 360, src: "https://cdn.example.com/faq.png", alt: "FAQ", imageFit: "cover" },
              { id: "title-2", type: "text", x: 620, y: 110, width: 520, height: 120, text: "คำถามที่พบบ่อย", color: "#111827", fontSize: 44 },
              { id: "body-2", type: "text", x: 620, y: 250, width: 500, height: 220, text: "เด็กอายุ 4 ถึง 6 เดือนควรนอนกี่ชั่วโมงต่อวัน?\nควรใช้วิธีการเช่นใดเพื่อให้เด็กกลับไปนอนหลับ?", color: "#334155", fontSize: 28 },
            ],
            background: {
              type: "color",
              value: "#f8fafc",
            },
          },
        },
      ],
    } as any;

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /select slide 2/i }));

    expect(await screen.findByTestId("ai-layout-panel")).toBeInTheDocument();
    expect(screen.getByText(/current block layout: process steps/i)).toBeInTheDocument();
    expect(screen.getByLabelText("AI Layout Block Override")).toHaveValue("process-steps");
  });

  it("falls back from stale video recipes when the current slide only has images", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        { id: "img-1", type: "image", x: 740, y: 90, width: 360, height: 520, src: "https://cdn.example.com/hero.png", alt: "Hero", imageFit: "cover" },
        { id: "title-1", type: "text", x: 120, y: 140, width: 440, height: 120, text: "Campaign Spotlight", color: "#111827", fontSize: 52 },
        { id: "body-1", type: "text", x: 120, y: 280, width: 420, height: 140, text: "Priority support\nPremium access\nJoin today", color: "#334155", fontSize: 28 },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-stale-video",
        componentRecipeId: "video-spotlight",
        selectionMode: "heuristic",
        narrative: {
          title: "Campaign Spotlight",
          body: ["Priority support", "Premium access", "Join today"],
          templateId: "split_right_image",
        },
      },
      background: {
        type: "color",
        value: "#dbeafe",
      },
    };

    render(<PresentationEditor />);

    expect(await screen.findByTestId("ai-layout-panel")).toBeInTheDocument();
    expect(screen.getByText(/current block layout: poster spotlight/i)).toBeInTheDocument();
    expect(screen.getByLabelText("AI Layout Block Override")).toHaveValue("poster-spotlight");
  });

  it("tracks usage when inserting a saved custom block and exposes its updated usage badge", async () => {
    queryState.customBlocks = [
      {
        id: "901",
        label: "Intro Block",
        description: "Saved from AI Layout.",
        category: "Custom",
        componentId: "quote-callout",
        slotBindings: [
          { slotId: "quote", type: "text", text: "Saved quote" },
          { slotId: "eyebrow", type: "text", text: "Saved eyebrow" },
          { slotId: "attribution", type: "text", text: "Saved attribution" },
        ],
        visibility: "team",
        isPinned: false,
        isTeamFeatured: false,
        usageCount: 2,
        favoriteUserIds: [],
        isFavorite: false,
        ownerUserId: 1,
        canDelete: true,
        canFeature: true,
        canTransferOwnership: true,
        savedAt: "2026-03-13T00:00:00.000Z",
        preview: {
          artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
          artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
          previewHash: "hash-1",
          rendererVersion: "server-svg-v1",
          generatedAt: "2026-03-13T00:00:00.000Z",
        },
      },
    ];

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    expect(await screen.findByText("Used 2x")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /insert editable intro block/i }));

    await waitFor(() => {
      expect(mutationMocks.trackCustomBlockUse).toHaveBeenCalledWith({ blockId: "901" });
    });

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    expect(await screen.findByText("Used 3x")).toBeInTheDocument();
  });

  it("lets users favorite and pin saved custom blocks from the blocks library", async () => {
    queryState.customBlocks = [
      {
        id: "901",
        label: "Intro Block",
        description: "Saved from AI Layout.",
        category: "Custom",
        componentId: "quote-callout",
        slotBindings: [
          { slotId: "quote", type: "text", text: "Saved quote" },
          { slotId: "eyebrow", type: "text", text: "Saved eyebrow" },
          { slotId: "attribution", type: "text", text: "Saved attribution" },
        ],
        visibility: "team",
        isPinned: false,
        isTeamFeatured: false,
        usageCount: 2,
        favoriteUserIds: [],
        isFavorite: false,
        ownerUserId: 1,
        canDelete: true,
        canFeature: true,
        canTransferOwnership: true,
        savedAt: "2026-03-13T00:00:00.000Z",
        preview: {
          artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
          artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
          previewHash: "hash-1",
          rendererVersion: "server-svg-v1",
          generatedAt: "2026-03-13T00:00:00.000Z",
        },
      },
    ];

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByTestId("favorite-custom-block-901"));

    await waitFor(() => {
      expect(mutationMocks.updateCustomBlock).toHaveBeenCalledWith({
        blockId: "901",
        favorite: true,
      });
      expect(screen.getByText("Favorite")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("pin-custom-block-901"));
    await waitFor(() => {
      expect(mutationMocks.updateCustomBlock).toHaveBeenCalledWith({
        blockId: "901",
        isPinned: true,
      });
      expect(screen.getByText("Pinned")).toBeInTheDocument();
    });
  });

  it("lets owners feature team blocks and transfer ownership from the blocks library", async () => {
    queryState.customBlocks = [
      {
        id: "901",
        label: "Intro Block",
        description: "Saved from AI Layout.",
        category: "Custom",
        componentId: "quote-callout",
        slotBindings: [
          { slotId: "quote", type: "text", text: "Saved quote" },
        ],
        visibility: "team",
        isPinned: false,
        isTeamFeatured: false,
        usageCount: 2,
        favoriteUserIds: [],
        isFavorite: false,
        ownerUserId: 1,
        canDelete: true,
        canFeature: true,
        canTransferOwnership: true,
        savedAt: "2026-03-13T00:00:00.000Z",
        preview: {
          artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
          artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
          previewHash: "hash-1",
          rendererVersion: "server-svg-v1",
          generatedAt: "2026-03-13T00:00:00.000Z",
        },
      },
    ];
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("22");

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByTestId("feature-custom-block-901"));

    await waitFor(() => {
      expect(mutationMocks.updateCustomBlock).toHaveBeenCalledWith({
        blockId: "901",
        isTeamFeatured: true,
      });
      expect(screen.getAllByText("Featured", { selector: "span" }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId("transfer-custom-block-901"));

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalledWith("Transfer block to user ID");
      expect(mutationMocks.updateCustomBlock).toHaveBeenCalledWith({
        blockId: "901",
        transferToUserId: 22,
      });
    });

    promptSpy.mockRestore();
  });

  it("supports crop mode interactions on canvas for image elements", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        {
          id: "img-1",
          type: "image",
          x: 120,
          y: 90,
          width: 420,
          height: 480,
          src: "https://cdn.example.com/hero.png",
          alt: "Hero",
          imageFit: "cover",
          imagePositionX: 50,
          imagePositionY: 50,
          imageZoom: 1,
        },
      ],
    };

    render(<PresentationEditor />);

    const canvasElement = await screen.findByRole("button", { name: /select canvas element 1: hero/i });
    fireEvent.pointerDown(canvasElement, { button: 0, pointerId: 1, clientX: 140, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 140, clientY: 160 });

    fireEvent.click(screen.getByRole("button", { name: /enter crop mode/i }));
    expect(screen.getByTestId("canvas-crop-toolbar")).toBeInTheDocument();
    expect(screen.getByText("Content Mode")).toBeInTheDocument();

    const zoomInput = screen.getByLabelText("Image Crop Zoom") as HTMLInputElement;
    expect(Number(zoomInput.value)).toBeCloseTo(1, 5);

    fireEvent.click(screen.getByLabelText("Zoom In Crop"));
    await waitFor(() => {
      expect(Number((screen.getByLabelText("Image Crop Zoom") as HTMLInputElement).value)).toBeGreaterThan(1);
    });

    const focusXInput = screen.getByLabelText("Image Crop Focus X") as HTMLInputElement;
    expect(Number(focusXInput.value)).toBe(50);

    fireEvent.click(screen.getByLabelText("Move Crop Content Right"));
    await waitFor(() => {
      expect(Number((screen.getByLabelText("Image Crop Focus X") as HTMLInputElement).value)).toBeGreaterThan(50);
    });

    fireEvent.pointerDown(canvasElement, { button: 0, pointerId: 7, clientX: 150, clientY: 170 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 210, clientY: 170 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 210, clientY: 170 });

    await waitFor(() => {
      expect(Number((screen.getByLabelText("Image Crop Focus X") as HTMLInputElement).value)).not.toBe(50);
    });

    fireEvent.click(screen.getByRole("button", { name: /edit frame/i }));
    expect(screen.getByText("Frame Mode")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit content/i }));
    expect(screen.getByText("Content Mode")).toBeInTheDocument();
  });

  it("exposes image opacity in Properties and updates the selected element", async () => {
    queryState.deckByItem.slides[0].slideContent = {
      elements: [
        {
          id: "img-1",
          type: "image",
          x: 120,
          y: 90,
          width: 420,
          height: 480,
          src: "https://cdn.example.com/hero.png",
          alt: "Hero",
          opacity: 1,
        },
      ],
    };

    render(<PresentationEditor />);

    const canvasElement = await screen.findByRole("button", { name: /select canvas element 1: hero/i });
    fireEvent.pointerDown(canvasElement, { button: 0, pointerId: 1, clientX: 140, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 140, clientY: 160 });

    const opacityInput = screen.getByLabelText(/image opacity/i) as HTMLInputElement;
    expect(Number(opacityInput.value)).toBeCloseTo(1, 5);

    fireEvent.change(opacityInput, { target: { value: "0.35" } });

    await waitFor(() => {
      expect(Number((screen.getByLabelText(/image opacity/i) as HTMLInputElement).value)).toBeCloseTo(0.35, 5);
    });
    expect(screen.getByText("35%")).toBeInTheDocument();
  });

  it("supports selecting component slots from canvas overlays and editing them inline", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByTestId("component-slot-overlay-quote"));

    const canvasSlotEditor = await screen.findByTestId("component-slot-canvas-editor");
    expect(canvasSlotEditor).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Canvas Slot Editor Quote"), {
      target: { value: "Canvas overlay update" },
    });

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("Canvas overlay update").length).toBeGreaterThan(1);
      expect(screen.getAllByText("Canvas overlay update").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /close canvas slot editor/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("component-slot-canvas-editor")).not.toBeInTheDocument();
    });
  });

  it("supports resizing an active component slot from the canvas overlay", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByTestId("component-slot-overlay-quote"));

    const getQuoteCanvasObject = () => screen.getByRole("button", {
      name: /lead with one idea per slide and let the visual support the sentence/i,
    }) as HTMLElement;
    const beforeWidth = getQuoteCanvasObject().style.width;

    fireEvent.pointerDown(screen.getByLabelText("Resize Quote slot wider"), {
      pointerId: 24,
      button: 0,
      clientX: 430,
      clientY: 240,
    });
    fireEvent.pointerMove(window, {
      pointerId: 24,
      clientX: 486,
      clientY: 240,
    });
    fireEvent.pointerUp(window, {
      pointerId: 24,
      clientX: 486,
      clientY: 240,
    });

    await waitFor(() => {
      expect(getQuoteCanvasObject().style.width).not.toBe(beforeWidth);
    });
  });

  it("supports picking image slot assets from the canvas overlay library picker", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable profile summary block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByTestId("component-slot-overlay-portrait"));

    const pickerButton = await screen.findByRole("button", {
      name: /use image asset hero image for portrait image/i,
    });
    fireEvent.click(pickerButton);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("https://cdn.example.com/hero.png").length).toBeGreaterThan(1);
      expect(screen.getAllByDisplayValue("Hero Image").length).toBeGreaterThan(0);
    });
  });

  it("supports dragging an image asset from the library onto an image slot overlay", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable profile summary block/i }));
    await screen.findByText(/components on slide/i);

    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));

    const dataTransfer = createDragDataTransfer();
    const draggableAsset = screen.getByRole("button", { name: /drag image hero image to canvas/i });
    const portraitSlotOverlay = screen.getByTestId("component-slot-overlay-portrait");

    fireEvent.dragStart(draggableAsset, { dataTransfer });
    fireEvent.dragOver(portraitSlotOverlay, { dataTransfer });
    fireEvent.drop(portraitSlotOverlay, { dataTransfer });

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("https://cdn.example.com/hero.png").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("Hero Image").length).toBeGreaterThan(0);
    });
  });

  it("supports picking video slot assets from the canvas overlay library picker", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable video spotlight block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByTestId("component-slot-overlay-clip"));

    const pickerButton = await screen.findByRole("button", {
      name: /use video asset teaser clip for video clip/i,
    });
    fireEvent.click(pickerButton);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("https://cdn.example.com/teaser.mp4").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("https://cdn.example.com/teaser-thumb.png").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("Teaser Clip").length).toBeGreaterThan(0);
    });
  });

  it("supports dragging a video asset from the library onto a video slot overlay", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable video spotlight block/i }));
    await screen.findByText(/components on slide/i);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));

    const dataTransfer = createDragDataTransfer();
    const draggableAsset = screen.getByRole("button", { name: /drag video teaser clip to canvas/i });
    const clipSlotOverlay = screen.getByTestId("component-slot-overlay-clip");

    fireEvent.dragStart(draggableAsset, { dataTransfer });
    fireEvent.dragOver(clipSlotOverlay, { dataTransfer });
    fireEvent.drop(clipSlotOverlay, { dataTransfer });

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("https://cdn.example.com/teaser.mp4").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("Teaser Clip").length).toBeGreaterThan(0);
    });
  });

  it("supports picking a video asset into a mixed media slot on Document blocks", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable multi-photo board block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByTestId("component-slot-overlay-hero-photo"));
    const canvasEditor = await screen.findByTestId("component-slot-canvas-editor");
    fireEvent.click(within(canvasEditor).getByRole("button", { name: /use video/i }));

    const pickerButton = await within(canvasEditor).findByRole("button", {
      name: /use video asset teaser clip for hero media/i,
    });
    fireEvent.click(pickerButton);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("https://cdn.example.com/teaser.mp4").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("Teaser Clip").length).toBeGreaterThan(0);
    });
  });

  it("moves and deletes an editable component as one unit from canvas selection", async () => {
    render(<PresentationEditor />);

    const getCanvasObjects = () =>
      Array.from(document.querySelectorAll("[data-canvas-object='true']")) as HTMLElement[];
    const baselineCount = getCanvasObjects().length;

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    const selectComponentButton = screen.getByRole("button", { name: /select component quote callout/i });
    const quoteCanvasObject = screen.getByRole("button", {
      name: /lead with one idea per slide and let the visual support the sentence/i,
    });

    expect(quoteCanvasObject).toBeTruthy();
    expect(getCanvasObjects().length).toBeGreaterThan(baselineCount);
    const beforeLeft = (quoteCanvasObject as HTMLElement).style.left;

    fireEvent.click(selectComponentButton);
    fireEvent.click(within(screen.getByTestId("canvas-transform-handles")).getByRole("button", { name: /move selection right/i }));

    await waitFor(() => {
      expect((screen.getByRole("button", {
        name: /lead with one idea per slide and let the visual support the sentence/i,
      }) as HTMLElement).style.left).not.toBe(beforeLeft);
    });

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(screen.queryByText(/components on slide/i)).not.toBeInTheDocument();
      expect(document.querySelectorAll("[data-canvas-object='true']")).toHaveLength(baselineCount);
    });
  });

  it("detaches an editable component into regular elements for further editing", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable profile summary block/i }));

    await screen.findByText(/components on slide/i);
    const beforeCount = document.querySelectorAll("[data-canvas-object='true']").length;
    expect(beforeCount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /detach component profile summary to elements/i }));

    await waitFor(() => {
      expect(screen.queryByText(/components on slide/i)).not.toBeInTheDocument();
      expect(screen.getByText(/mixed object types selected\. property editing is disabled for safety\./i)).toBeInTheDocument();
    });

    expect(document.querySelectorAll("[data-canvas-object='true']")).toHaveLength(beforeCount);
  });

  it("resizes, rotates, and preserves component geometry across slot edits before duplicating", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByRole("button", { name: /select component quote callout/i }));

    const getQuoteCanvasObject = () => screen.getByRole("button", {
      name: /editorial callout/i,
    }) as HTMLElement;
    const quoteCanvasObject = getQuoteCanvasObject();
    expect(quoteCanvasObject).toBeTruthy();

    const beforeWidth = quoteCanvasObject.style.width;
    const transformHandles = within(screen.getByTestId("canvas-transform-handles"));
    fireEvent.click(transformHandles.getByRole("button", { name: /wider/i }));
    fireEvent.click(transformHandles.getByRole("button", { name: /rotate \+15/i }));

    await waitFor(() => {
      expect(getQuoteCanvasObject().style.width).not.toBe(beforeWidth);
      expect(getQuoteCanvasObject().style.transform).toContain("rotate(15deg)");
    });

    const transformedWidth = getQuoteCanvasObject().style.width;
    const transformedRotation = getQuoteCanvasObject().style.transform;
    fireEvent.change(screen.getByLabelText("Quote Callout Quote"), {
      target: { value: "Updated component quote" },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Updated component quote")).toBeInTheDocument();
      expect(getQuoteCanvasObject().style.width).toBe(transformedWidth);
      expect(getQuoteCanvasObject().style.transform).toBe(transformedRotation);
    });

    fireEvent.click(screen.getByRole("button", { name: /duplicate selection/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /select component quote callout/i })).toHaveLength(2);
    });
  });

  it("supports pointer resize for selected components from the overlay edge handles", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByRole("button", { name: /select component quote callout/i }));

    const getQuoteCanvasObject = () => screen.getByRole("button", {
      name: /editorial callout/i,
    }) as HTMLElement;
    const beforeWidth = getQuoteCanvasObject().style.width;

    fireEvent.pointerDown(screen.getByLabelText("Resize Quote Callout wider"), {
      pointerId: 23,
      button: 0,
      clientX: 620,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 23,
      clientX: 676,
      clientY: 260,
    });
    fireEvent.pointerUp(window, {
      pointerId: 23,
      clientX: 676,
      clientY: 260,
    });

    await waitFor(() => {
      expect(getQuoteCanvasObject().style.width).not.toBe(beforeWidth);
    });
  });

  it("offers automatic fit controls for selected editable components", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByRole("button", { name: /select component quote callout/i }));

    const getQuoteCanvasObject = () => screen.getByRole("button", {
      name: /editorial callout/i,
    }) as HTMLElement;
    const beforeWidth = getQuoteCanvasObject().style.width;
    const transformHandles = within(screen.getByTestId("canvas-transform-handles"));

    expect(transformHandles.getByRole("button", { name: /fit width/i })).toBeInTheDocument();
    fireEvent.click(transformHandles.getByRole("button", { name: /fit width/i }));

    await waitFor(() => {
      expect(getQuoteCanvasObject().style.width).not.toBe(beforeWidth);
    });
  });

  it("lets media slots jump to a raw media element so regenerate controls appear", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable multi-photo board block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByRole("button", { name: /select component multi-photo board/i }));
    fireEvent.click(screen.getByLabelText(/select component slot hero media/i));
    fireEvent.click(screen.getByRole("button", { name: /select raw media element for hero media/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /regenerate image/i })).toBeInTheDocument();
    });
  });

  it("supports copy and paste shortcuts for editable components", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open blocks library/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert editable quote callout block/i }));

    await screen.findByText(/components on slide/i);
    fireEvent.click(screen.getByRole("button", { name: /select component quote callout/i }));

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /select component quote callout/i })).toHaveLength(2);
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

    expect(screen.getByText("Support media clarity: 16%")).toBeInTheDocument();

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
    expect(payload?.supplementalMediaClarityPercent).toBe(16);
  });

  it("sends a selected block layout through Auto Layout payload", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /auto layout slide/i }));

    const autoLayoutDialog = screen.getByRole("dialog", { name: /auto layout/i });
    expect(within(autoLayoutDialog).getByText("Block layout")).toBeInTheDocument();
    const blockLayoutSelect = within(autoLayoutDialog).getAllByRole("combobox")[1];
    fireEvent.click(blockLayoutSelect);
    expect(screen.queryByRole("option", { name: /^hero center$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^split left image$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /^process steps$/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply auto layout/i }));

    await waitFor(() => {
      expect(mutationMocks.relayoutSlide).toHaveBeenCalled();
    });
    const payload = mutationMocks.relayoutSlide.mock.calls.at(-1)?.[0];
    expect(payload?.componentRecipeId).toBe("process-steps");
    expect(payload?.templateId).toBeUndefined();
  });

  it("keeps the Auto Layout dialog block list independent from the AI sidebar category filter", async () => {
    render(<PresentationEditor />);

    const aiLayoutPanel = await screen.findByTestId("ai-layout-panel");
    fireEvent.click(within(aiLayoutPanel).getByRole("button", { name: "Document" }));

    fireEvent.click(screen.getByRole("button", { name: /auto layout slide/i }));
    const autoLayoutDialog = screen.getByRole("dialog", { name: /auto layout/i });
    const blockLayoutSelect = within(autoLayoutDialog).getAllByRole("combobox")[1];
    fireEvent.click(blockLayoutSelect);

    expect(screen.getByRole("option", { name: /^process steps$/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^sectioned explainer$/i })).toBeInTheDocument();
  });

  it("restores the pre-auto-layout canvas state with undo", async () => {
    mutationMocks.relayoutSlide.mockImplementation(async () => {
      queryState.deckByItem = {
        ...queryState.deckByItem,
        slides: queryState.deckByItem.slides.map((slide: any) => (
          slide.id === 71
            ? {
              ...slide,
              version: 4,
              slideContent: {
                elements: [
                  { id: "relayout-title", type: "text", x: 120, y: 80, width: 320, height: 70, text: "Relayout headline", color: "#111827" },
                ],
              },
            }
            : slide
        )),
      };
      return {
        slide: {
          id: 71,
          version: 4,
          slideContent: {
            elements: [
              { id: "relayout-title", type: "text", x: 120, y: 80, width: 320, height: 70, text: "Relayout headline", color: "#111827" },
            ],
          },
        },
        warnings: [],
        applied: {
          templateId: "split_right_image",
          stylePresetId: "dark-professional",
          graphicCategory: "Business",
          reusedImage: false,
        },
      };
    });

    render(<PresentationEditor />);
    expect(screen.getByLabelText("Element x")).toHaveValue(10);

    fireEvent.click(screen.getByRole("button", { name: /auto layout slide/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply auto layout/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(120);
    });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(10);
    });
  });

  it("restores the pre-repair canvas state with undo after generating from the saved note", async () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          ...buildDeckByItem().slides[0],
          notes: "Saved note for repair",
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    mutationMocks.repairSlideFromNote.mockImplementation(async () => {
      queryState.deckByItem = {
        ...queryState.deckByItem,
        slides: queryState.deckByItem.slides.map((slide: any) => (
          slide.id === 71
            ? {
              ...slide,
              version: 4,
              title: "Repaired intro",
              notes: "Saved note for repair",
              slideContent: {
                elements: [
                  { id: "repair-title", type: "text", x: 140, y: 90, width: 340, height: 70, text: "Repaired headline", color: "#111827" },
                ],
              },
            }
            : slide
        )),
      };
      return {
        slide: {
          id: 71,
          version: 4,
          title: "Repaired intro",
          notes: "Saved note for repair",
          slideContent: {
            elements: [
              { id: "repair-title", type: "text", x: 140, y: 90, width: 340, height: 70, text: "Repaired headline", color: "#111827" },
            ],
          },
        },
        warnings: [],
        applied: {
          templateId: "split_right_image",
          stylePresetId: "dark-professional",
          graphicCategory: "Business",
          regeneratedImage: true,
        },
      };
    });

    render(<PresentationEditor />);
    expect(screen.getByLabelText("Element x")).toHaveValue(10);

    fireEvent.click(screen.getByRole("button", { name: /open slide note/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate slide/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(140);
    });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByLabelText("Element x")).toHaveValue(10);
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

  it("auto-advances through all slides and stops after the last one", async () => {
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
          id: 71, deckId: 7, orderIndex: 0, version: 3, title: "Slide A",
          slideContent: { durationMs: 2000, elements: [{ id: "t-a", type: "text", x: 10, y: 10, width: 200, height: 60, text: "A", color: "#000" }] },
          notes: null,
        },
        {
          id: 72, deckId: 7, orderIndex: 1, version: 1, title: "Slide B",
          slideContent: { durationMs: 2000, elements: [{ id: "t-b", type: "text", x: 10, y: 10, width: 200, height: 60, text: "B", color: "#000" }] },
          notes: null,
        },
        {
          id: 73, deckId: 7, orderIndex: 2, version: 1, title: "Slide C",
          slideContent: { durationMs: 2000, elements: [{ id: "t-c", type: "text", x: 10, y: 10, width: 200, height: 60, text: "C", color: "#000" }] },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    });

    // Overlay should be visible, showing slide 1 of 3
    expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    expect(screen.getByText("Slide 1 / 3")).toBeInTheDocument();

    // At 1000ms (halfway through slide A), should still be on slide 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Slide 1 / 3")).toBeInTheDocument();

    // Advance past slide A duration (remaining 1000ms + buffer)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Should now be on slide 2 (NOT skip to slide 3 or close)
    expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    expect(screen.getByText("Slide 2 / 3")).toBeInTheDocument();

    // Advance past slide B duration (2000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // Should now be on slide 3
    expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    expect(screen.getByText("Slide 3 / 3")).toBeInTheDocument();

    // Advance past slide C duration (2000ms) — should close overlay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(screen.queryByTestId("slideshow-preview-overlay")).not.toBeInTheDocument();

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

  it("generates an article in the separate article builder flow and inserts it into presentation note", async () => {
    render(<PresentationEditor />);

    expect(screen.queryByRole("button", { name: "dialog.articleBuilder.generate" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(mutationMocks.generateArticle).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        topic: "Product Pitch",
        preferredLanguage: "en",
        executionSource: "skill",
        skillId: "article-writer",
      }));
    });

    expect(screen.getByDisplayValue("Generated presentation article")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.useAsPresentationNote" }));

    const noteDialog = await screen.findByRole("dialog", { name: /presentation note|dialog\.presentationNote\.title/i });
    const noteTextarea = within(noteDialog).getByDisplayValue("Generated presentation article");
    expect(noteTextarea).toHaveValue("Generated presentation article");

    fireEvent.click(within(noteDialog).getByRole("button", { name: /save note|dialog\.presentationNote\.save/i }));

    await waitFor(() => {
      expect(mutationMocks.updateDeck).toHaveBeenCalledWith({
        deckId: 7,
        expectedVersion: 5,
        notes: "Generated presentation article",
      });
    });
  });

  it("restores article builder progress after closing and reopening the dialog", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.change(screen.getByDisplayValue("Product Pitch"), {
      target: { value: "Resume Sleep Guide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await screen.findByDisplayValue("Generated presentation article");

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.close" }));
    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.getByDisplayValue("Resume Sleep Guide")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Generated presentation article")).toBeInTheDocument();
  });

  it("does not restore stale PPTX preparation jobs after reloading the article builder", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "pptx",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          },
        ],
        generatedSlideDraft: {
          slideJson: JSON.stringify({
            canvas: { ratio: "16:9" },
            slides: [{ elements: [{ kind: "text", text: "Persisted slide" }] }],
          }),
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
          artifactJobId: "job-stale-pptx",
          artifacts: [],
          downloadUrl: null,
        },
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.queryByRole("button", { name: "Preparing PPTX..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" })).toBeInTheDocument();
  });

  it("clears failed PPTX polling state so the dialog does not stay stuck on preparing", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "pptx",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          },
        ],
        generatedSlideDraft: null,
      }),
    );
    queryState.sandboxJobStatus = {
      jobId: "job-pptx-failed",
      status: "failed",
      artifacts: [],
    };
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "Sandbox Slide Builder",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        canvas: { ratio: "16:9" },
        slides: [
          {
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Imported PPTX Slide",
                xPct: 10,
                yPct: 10,
                wPct: 60,
                hPct: 12,
                fontFace: "Inter",
                fontSize: 28,
                color: "#111827",
                align: "left",
                bold: true,
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
      artifactJobId: "job-pptx-failed",
      downloadUrl: null,
      artifacts: [],
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 990 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    const articleBuilderDialog = await screen.findByRole("dialog");
    const comboboxes = within(articleBuilderDialog).getAllByRole("combobox");
    fireEvent.click(comboboxes[1] as HTMLElement);
    fireEvent.click(screen.getByRole("option", { name: "Editorial Layout Planner" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Preparing PPTX..." })).not.toBeInTheDocument();
    });
  });

  it("prepares slide prompts, generates supporting images, and requests slide json from the selected slide skill", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        topic: "Product Pitch",
        slideSkillId: "modern-editorial-slide",
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateImageAsync).toHaveBeenCalledWith(expect.objectContaining({
        prompt: "Cover image prompt",
      }));
    });

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        slideSkillId: "modern-editorial-slide",
        imageAssets: expect.arrayContaining([
          expect.objectContaining({
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          }),
        ]),
      }));
    });

    expect(screen.getByDisplayValue("{\"slides\":[]}")).toBeInTheDocument();
  });

  it("replans the slide bundle while reusing compatible generated images by page slot", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1-old",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Old cover image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1-old",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Old cover image prompt",
            url: "https://cdn.example.com/reused-cover.png",
          },
        ],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    mutationMocks.prepareSlideBundle.mockResolvedValueOnce({
      maxPages: 1,
      plannedImageCount: 1,
      slideSkillLabel: "Modern Editorial Slide",
      imagePrompts: [
        {
          id: "img-1-1-new",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "New cover image prompt",
        },
      ],
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      modelId: "gpt-5.4",
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.getByAltText("Page 1 · cover hero")).toHaveAttribute("src", "https://cdn.example.com/reused-cover.png");

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.prepareBundle" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledWith(expect.objectContaining({
        existingImageAssets: [
          expect.objectContaining({
            id: "img-1-1-old",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            url: "https://cdn.example.com/reused-cover.png",
          }),
        ],
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        imageAssets: [
          expect.objectContaining({
            id: "img-1-1-new",
            pageNumber: 1,
            imageIndex: 1,
            url: "https://cdn.example.com/reused-cover.png",
          }),
        ],
      }));
    });
  });

  it("shows generated image thumbnails and regenerates only missing slots after removing one image", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 2,
          plannedImageCount: 2,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
            {
              id: "img-2-1",
              pageNumber: 2,
              imageIndex: 1,
              placementRole: "supporting",
              shortLabel: "section visual",
              prompt: "Section image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-cover.png",
          },
          {
            id: "img-2-1",
            pageNumber: 2,
            imageIndex: 1,
            placementRole: "supporting",
            shortLabel: "section visual",
            prompt: "Section image prompt",
            url: "https://cdn.example.com/generated-section.png",
          },
        ],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.getByAltText("Page 1 · cover hero")).toBeInTheDocument();
    expect(screen.getByAltText("Page 2 · section visual")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.removeImage" })[1]!);

    await waitFor(() => {
      expect(screen.queryByAltText("Page 2 · section visual")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateMissingImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateImageAsync).toHaveBeenCalledTimes(1);
    });

    expect(mutationMocks.generateImageAsync).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Section image prompt",
    }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        imageAssets: expect.arrayContaining([
          expect.objectContaining({
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-cover.png",
          }),
          expect.objectContaining({
            prompt: "Section image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          }),
        ]),
      }));
    });
  });

  it("allows removing an extra missing image slot from the planner", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 2,
          plannedImageCount: 2,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
            {
              id: "img-2-2",
              pageNumber: 2,
              imageIndex: 2,
              placementRole: "supporting",
              shortLabel: "supporting visual",
              prompt: "Supporting image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-cover.png",
          },
        ],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.getByText("Page 2 · supporting visual")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.removeImageSlot" }).at(-1)!);

    await waitFor(() => {
      expect(screen.queryByText("Page 2 · supporting visual")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        imageAssets: [
          expect.objectContaining({
            id: "img-1-1",
            url: "https://cdn.example.com/generated-cover.png",
          }),
        ],
      }));
    });

    expect(mutationMocks.generateImageAsync).not.toHaveBeenCalled();
  });

  it("shows the actual planned slot count in preflight instead of the archetype default", async () => {
    mutationMocks.prepareSlideBundle.mockResolvedValueOnce({
      maxPages: 1,
      plannedImageCount: 1,
      slideSkillLabel: "Modern Editorial Slide",
      imagePrompts: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
        },
      ],
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      modelId: "gpt-5.4",
      preflightPages: [
        {
          pageNumber: 1,
          titleHint: "Sleep Training Basics",
          compiledText: "Overview: Build a steady bedtime rhythm.",
          pageIntentHint: "strategy_overview",
          preferredArchetype: "title_hero_split",
          forceArchetype: null,
          archetypeMode: "guided",
          recommendedImageCount: 2,
          maxImagesOverride: 2,
          warnings: [],
          structure: {
            paragraphCount: 1,
            bulletCount: 1,
            workflowStepCount: 0,
            timelinePhaseCount: 0,
            sectionCount: 1,
          },
        },
      ],
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(screen.getByText("1 images")).toBeInTheDocument();
    });
  });

  it("can add a slot, assign a history image to it, and send page-level image slot overrides", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
          preflightPages: [
            {
              pageNumber: 1,
              titleHint: "Sleep Training Basics",
              compiledText: "Overview: Build a steady bedtime rhythm.",
              pageIntentHint: "strategy_overview",
              preferredArchetype: "title_hero_split",
              forceArchetype: null,
              archetypeMode: "guided",
              recommendedImageCount: 1,
              maxImagesOverride: 1,
              warnings: [],
              structure: {
                paragraphCount: 1,
                bulletCount: 1,
                workflowStepCount: 0,
                timelinePhaseCount: 0,
                sectionCount: 1,
              },
            },
          ],
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-cover.png",
          },
        ],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.addImageSlot" })[0]!);

    await waitFor(() => {
      expect(screen.getByText("Page 1 · supporting")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.pickSlotImage" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.assetPickerHistory" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.useThisImage" }));

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        pageImagePlanOverrides: [
          {
            pageNumber: 1,
            maxImagesOverride: 2,
          },
        ],
        imageAssets: expect.arrayContaining([
          expect.objectContaining({
            id: "img-1-1",
            url: "https://cdn.example.com/generated-cover.png",
          }),
          expect.objectContaining({
            pageNumber: 1,
            imageIndex: 2,
            url: "https://cdn.example.com/history-hero.png",
          }),
        ]),
      }));
    });
  });

  it("regenerates a single slot without regenerating the whole bundle", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
          preflightPages: [
            {
              pageNumber: 1,
              titleHint: "Sleep Training Basics",
              compiledText: "Overview: Build a steady bedtime rhythm.",
              pageIntentHint: "strategy_overview",
              preferredArchetype: "title_hero_split",
              forceArchetype: null,
              archetypeMode: "guided",
              recommendedImageCount: 1,
              maxImagesOverride: 1,
              warnings: [],
              structure: {
                paragraphCount: 1,
                bulletCount: 1,
                workflowStepCount: 0,
                timelinePhaseCount: 0,
                sectionCount: 1,
              },
            },
          ],
        },
        generatedImages: [],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.regenerateSlot" })[0]!);

    await waitFor(() => {
      expect(mutationMocks.generateImageAsync).toHaveBeenCalledTimes(1);
    });

    expect(mutationMocks.generateImageAsync).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Cover image prompt",
    }));

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 · cover hero")).toHaveAttribute("src", "https://cdn.example.com/generated-asset.png");
    });
  });

  it("shows regenerate actions in skill preflight and regenerates the lead slot without adding a new slot", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
          preflightPages: [
            {
              pageNumber: 1,
              titleHint: "Sleep Training Basics",
              compiledText: "Overview: Build a steady bedtime rhythm.",
              pageIntentHint: "strategy_overview",
              preferredArchetype: "title_hero_split",
              forceArchetype: null,
              archetypeMode: "guided",
              recommendedImageCount: 1,
              maxImagesOverride: 1,
              warnings: [],
              structure: {
                paragraphCount: 1,
                bulletCount: 1,
                workflowStepCount: 0,
                timelinePhaseCount: 0,
                sectionCount: 1,
              },
            },
          ],
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-cover.png",
          },
        ],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));

    expect(screen.getAllByRole("button", { name: "dialog.articleBuilder.regenerateSlot" }).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.regenerateSlot" }).at(-1)!);

    await waitFor(() => {
      expect(mutationMocks.generateImageAsync).toHaveBeenCalledTimes(1);
    });

    expect(mutationMocks.generateImageAsync).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Cover image prompt",
    }));

    expect(screen.queryByText("Page 1 · supporting")).not.toBeInTheDocument();
  });

  it("keeps polling slower slot regeneration tasks until a later completed result arrives", async () => {
    localStorage.setItem(
        "presentation-article-builder-draft:7",
        JSON.stringify({
          topic: "Product Pitch",
          article: "Generated presentation article",
          executionSource: "skill",
          skillId: "article-writer",
          agencyId: "",
          agencyName: "",
          requiresWebSearch: false,
          requiresThinking: false,
          targetImageCount: 8,
          imageModel: "flux-2.0",
          canvasRatio: "16:9",
          advancedMediaOptionsEnabled: false,
          mediaModelExtraParams: {},
          imagePromptContext: "",
          slideSkillId: "modern-editorial-slide",
          slideOutputFormat: "json",
          preparedBundle: {
            maxPages: 1,
            plannedImageCount: 1,
            slideSkillLabel: "Modern Editorial Slide",
            imagePrompts: [
              {
                id: "img-1-1",
                pageNumber: 1,
                imageIndex: 1,
                placementRole: "hero",
                shortLabel: "cover hero",
                prompt: "Cover image prompt",
              },
            ],
            slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
            modelId: "gpt-5.4",
            preflightPages: [
              {
                pageNumber: 1,
                titleHint: "Sleep Training Basics",
                compiledText: "Overview: Build a steady bedtime rhythm.",
                pageIntentHint: "strategy_overview",
                preferredArchetype: "title_hero_split",
                forceArchetype: null,
                archetypeMode: "guided",
                recommendedImageCount: 1,
                maxImagesOverride: 1,
                warnings: [],
                structure: {
                  paragraphCount: 1,
                  bulletCount: 1,
                  workflowStepCount: 0,
                  timelinePhaseCount: 0,
                  sectionCount: 1,
                },
              },
            ],
          },
          generatedImages: [],
          generatedSlideDraft: null,
          slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          slidePayloadEditorDirty: false,
        }),
      );

    mutationMocks.generateImageAsync.mockResolvedValue({
      taskId: "media-task-slow-1",
      status: "queued",
    });
    queryState.mediaGetTaskFetch = vi
      .fn()
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({
        status: "completed",
        resultData: {
          output: {
            url: "https://cdn.example.com/generated-slow-asset.png",
          },
        },
      });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getAllByRole("button", { name: "dialog.articleBuilder.regenerateSlot" })[0]!);

    await waitFor(() => {
      expect(mutationMocks.generateImageAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(queryState.mediaGetTaskFetch).toHaveBeenCalledTimes(3);
    }, { timeout: 10_000 });
    expect(toastMocks.error).not.toHaveBeenCalledWith(expect.stringContaining("timeout"));
  }, 15_000);

  it("sends the edited skill input json override when generating slide json", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledTimes(1);
    });

    const overrideJson = JSON.stringify({
      request: {
        designStyle: "soft-wellness",
        randomizeLayouts: false,
        seed: "sleep-9-pages-20260330-v2",
        content: {
          pages: [
            {
              pageIntentHint: "editorial_cover",
              forceArchetype: "editorial_cover_split",
            },
          ],
        },
      },
    }, null, 2);

    fireEvent.change(screen.getByLabelText("Skill Input JSON"), {
      target: { value: overrideJson },
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        slidePayloadOverrideJson: overrideJson,
      }));
    });
  });

  it("keeps the last valid skill input json when the server returns html instead of json", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );

    mutationMocks.prepareSlideBundle.mockResolvedValueOnce({
      maxPages: 1,
      plannedImageCount: 1,
      slideSkillLabel: "Modern Editorial Slide",
      imagePrompts: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
        },
      ],
      slidePayloadJson: "<!DOCTYPE html><html><body>500</body></html>",
      modelId: "gpt-5.4",
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.prepareBundle" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Skill Input JSON")).toHaveValue("{\"request\":{\"projectTitle\":\"Product Pitch\"}}");
    });
    expect(toastMocks.error).toHaveBeenCalledWith("Skill input JSON response was invalid. Kept the previous valid JSON instead.");
  });

  it("does not send the auto-generated skill input json as an override unless the user edits it", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByLabelText("Skill Input JSON")).toHaveValue("{\"request\":{\"projectTitle\":\"Product Pitch\"}}");

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        slidePayloadOverrideJson: null,
      }));
    });
  });

  it("shows per-page skill preflight details from the prepared slide bundle", async () => {
    mutationMocks.prepareSlideBundle.mockResolvedValueOnce({
      maxPages: 2,
      plannedImageCount: 3,
      slideSkillLabel: "Modern Editorial Slide",
      imagePrompts: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
        },
      ],
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      modelId: "gpt-5.4",
      preflightWarnings: ["Some pages required synthesized structure before sending them to the skill."],
      preflightPages: [
        {
          pageNumber: 1,
          titleHint: "Sleep Training Basics",
          compiledText: "Sleep Training Basics\n\nOverview: Build a steady bedtime rhythm.\n\nKey Points:\n• Keep the room calm",
          pageIntentHint: "strategy_overview",
          preferredArchetype: "executive_summary_dashboard",
          forceArchetype: null,
          archetypeMode: "guided",
          recommendedImageCount: 1,
          maxImagesOverride: 1,
          warnings: ["Synthesized key points from prose because the page did not contain explicit bullets."],
          structure: {
            paragraphCount: 2,
            bulletCount: 0,
            workflowStepCount: 0,
            timelinePhaseCount: 0,
            sectionCount: 1,
          },
        },
      ],
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(screen.getByText("Skill Preflight")).toBeInTheDocument();
    });

    expect(screen.getByText("strategy_overview")).toBeInTheDocument();
    expect(screen.getByText(/Guided: executive_summary_dashboard/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Overview: Build a steady bedtime rhythm/)).toBeInTheDocument();
  });

  it("keeps the selected slide skill and downgrades to JSON import when artifacts are unavailable for that skill", async () => {
    queryState.skillCatalog = [
      ...buildSkillCatalog(),
      {
        id: 303,
        slug: "sandbox-slide-builder",
        name: "Sandbox Slide Builder",
        category: "slide_generation",
        executionMode: "sandbox-command",
      },
    ];
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "pptx",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          },
        ],
        generatedSlideDraft: null,
      }),
    );
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "Sandbox Slide Builder",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        canvas: { ratio: "16:9" },
        theme: { background: "#ffffff" },
        slides: [
          {
            background: "#ffffff",
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Imported PPTX Slide",
                xPct: 10,
                yPct: 10,
                wPct: 60,
                hPct: 12,
                fontFace: "Inter",
                fontSize: 28,
                color: "#111827",
                align: "left",
                bold: true,
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
      artifactJobId: "job-pptx-1",
      downloadUrl: "https://cdn.example.com/generated-deck.pptx",
      artifacts: [
        {
          format: "pptx",
          url: "https://cdn.example.com/generated-deck.pptx",
          key: "generated-deck.pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          isPrimary: true,
        },
      ],
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 901 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        slideSkillId: "modern-editorial-slide",
        outputFormats: ["json"],
      }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "dialog.articleBuilder.insertSlides" })).toBeEnabled();
    });

    expect(mutationMocks.addSlide).not.toHaveBeenCalled();
  });

  it("falls back to JSON import when PPTX is requested but no sandbox slide skill is available", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "pptx",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          },
        ],
        generatedSlideDraft: null,
      }),
    );
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "Modern Editorial Slide",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        canvas: { ratio: "16:9" },
        slides: [
          {
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Fallback JSON Slide",
                xPct: 10,
                yPct: 10,
                wPct: 60,
                hPct: 12,
                fontFace: "Inter",
                fontSize: 28,
                color: "#111827",
                align: "left",
                bold: true,
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 902 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        slideSkillId: "modern-editorial-slide",
        outputFormats: ["json"],
      }));
    });

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps insert disabled when generated slide json contains only empty slides", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [],
        generatedSlideDraft: null,
      }),
    );
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "Modern Editorial Slide",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        slides: [
          {
            title: "Empty slide",
            elements: [],
          },
        ],
      }),
      modelId: "gpt-5.4",
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "dialog.articleBuilder.insertSlides" })).toBeDisabled();
    });

    expect(screen.getByText("Empty slides 1")).toBeInTheDocument();
    expect(screen.getByText(/Debug trace: total slides = 1, importable slides = 0/)).toBeInTheDocument();

    expect(mutationMocks.addSlide).not.toHaveBeenCalled();
  });

  it("lets users generate slide json directly from a prepared manual-only bundle even when no images have been attached yet", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "9:16",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 2,
          plannedImageCount: 2,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [
            {
              id: "img-1-1",
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "cover hero",
              prompt: "Cover image prompt",
            },
            {
              id: "img-2-1",
              pageNumber: 2,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "section hero",
              prompt: "Section image prompt",
            },
          ],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [],
        generatedSlideDraft: null,
        slidePayloadEditorJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
        slidePayloadEditorDirty: false,
      }),
    );
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 2,
      slideSkillLabel: "Modern Editorial Slide",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        canvas: { ratio: "9:16" },
        slides: [
          {
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Manual-only slide",
                xPct: 10,
                yPct: 10,
                wPct: 60,
                hPct: 12,
                fontFace: "Inter",
                fontSize: 28,
                color: "#111827",
                align: "left",
                bold: true,
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 904 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledWith(expect.objectContaining({
        imageAssets: [],
      }));
    });

    expect(mutationMocks.generateImageAsync).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });
  });

  it("automatically imports generated slide json into the current presentation as real slides", async () => {
    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 2,
      slideSkillLabel: "Modern Editorial Slide",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        canvas: { ratio: "16:9" },
        theme: { background: "#ffffff" },
        slides: [
          {
            background: "#f8fafc",
            notes: "Sleep Training Basics\n\nStart with the bedtime routine note.",
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Sleep Training Basics",
                xPct: 10,
                yPct: 8,
                wPct: 50,
                hPct: 10,
                fontFace: "Libre Baskerville",
                fontSize: 28,
                color: "#0f172a",
                align: "left",
                bold: true,
              },
              {
                kind: "image",
                role: "hero",
                source: "https://cdn.example.com/hero.png",
                xPct: 62,
                yPct: 10,
                wPct: 24,
                hPct: 30,
                fit: "cover",
                cornerRadius: 16,
              },
            ],
          },
          {
            background: "FFFFFF",
            notes: "Slide 2\n\nKeep the divider slide note with the generated content.",
            elements: [
              {
                kind: "shape",
                role: "divider",
                shape: "line",
                xPct: 8,
                yPct: 18,
                wPct: 40,
                hPct: 0.2,
                line: "CBD5E1",
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
    });
    mutationMocks.addSlide
      .mockResolvedValueOnce({ id: 801 })
      .mockResolvedValueOnce({ id: 802 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generate" }));

    await waitFor(() => {
      expect(mutationMocks.prepareSlideBundle).toHaveBeenCalledWith(expect.objectContaining({
        deckId: 7,
        topic: "Product Pitch",
        slideSkillId: "modern-editorial-slide",
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateImages" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(2);
    });

    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(1, expect.objectContaining({
      deckId: 7,
      expectedVersion: 5,
      title: "Sleep Training Basics",
      notes: "Sleep Training Basics\n\nStart with the bedtime routine note.",
      slideContent: expect.objectContaining({
        background: { type: "color", value: "#f8fafc" },
        canvas: expect.objectContaining({
          preset: "16:9",
          width: 1280,
          height: 720,
        }),
        elements: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "Sleep Training Basics",
            fontFamily: "Libre Baskerville",
          }),
          expect.objectContaining({
            type: "image",
            src: "https://cdn.example.com/hero.png",
            imageFit: "cover",
            mediaCornerRadius: 16,
          }),
        ]),
      }),
    }));
    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(2, expect.objectContaining({
      deckId: 7,
      expectedVersion: 6,
      title: "Slide 2",
      notes: "Slide 2\n\nKeep the divider slide note with the generated content.",
      slideContent: expect.objectContaining({
        background: { type: "color", value: "#FFFFFF" },
        elements: expect.arrayContaining([
          expect.objectContaining({
            type: "line",
            stroke: "#CBD5E1",
          }),
        ]),
      }),
    }));
  });

  it("falls back to the sandbox JSON artifact when the immediate slide json would import as empty slides", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "pptx",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "Modern Editorial Slide",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [],
        generatedSlideDraft: null,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        canvas: { ratio: "16:9" },
        theme: { background: "#ffffff" },
        slides: [
          {
            background: "#ffffff",
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Artifact-backed Slide",
                xPct: 10,
                yPct: 10,
                wPct: 60,
                hPct: 12,
                fontFace: "Inter",
                fontSize: 28,
                color: "#111827",
                align: "left",
                bold: true,
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "Sandbox Slide Builder",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        slides: [
          {
            title: "Empty Draft Slide",
            elements: [],
          },
        ],
      }),
      modelId: "gpt-5.4",
      artifactJobId: "job-json-artifact-1",
      downloadUrl: "https://cdn.example.com/generated-deck.pptx",
      artifacts: [
        {
          format: "json",
          url: "https://cdn.example.com/manifest.json",
          key: "manifest.json",
          mimeType: "application/json",
          isPrimary: false,
        },
        {
          format: "json",
          url: "https://cdn.example.com/layout-spec.json",
          key: "layout-spec.json",
          mimeType: "application/json",
          isPrimary: false,
        },
        {
          format: "pptx",
          url: "https://cdn.example.com/generated-deck.pptx",
          key: "generated-deck.pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          isPrimary: true,
        },
      ],
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 903 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledTimes(1);
    });

    const insertSlidesButton = await screen.findByRole("button", { name: "dialog.articleBuilder.insertSlides" });
    fireEvent.click(insertSlidesButton);

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledWith(expect.objectContaining({
        title: "Artifact-backed Slide",
      }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/layout-spec.json", { credentials: "omit" });
    await waitFor(() => {
      expect((screen.getByLabelText("dialog.articleBuilder.slideJsonLabel") as HTMLTextAreaElement).value).toContain("Artifact-backed Slide");
    });
    expect(screen.getByText("Payload shown: JSON artifact that was actually imported into this deck.")).toBeInTheDocument();
    expect(screen.getByText(/Imported JSON artifact:/)).toBeInTheDocument();
  });

  it("imports wrapped layoutSpec slide json returned by newer GenJS-style skills", async () => {
    localStorage.setItem(
      "presentation-article-builder-draft:7",
      JSON.stringify({
        topic: "Product Pitch",
        article: "Generated presentation article",
        executionSource: "skill",
        skillId: "article-writer",
        agencyId: "",
        agencyName: "",
        requiresWebSearch: false,
        requiresThinking: false,
        targetImageCount: 8,
        imageModel: "flux-2.0",
        canvasRatio: "16:9",
        advancedMediaOptionsEnabled: false,
        mediaModelExtraParams: {},
        imagePromptContext: "",
        slideSkillId: "modern-editorial-slide",
        slideOutputFormat: "json",
        preparedBundle: {
          maxPages: 1,
          plannedImageCount: 1,
          slideSkillLabel: "GenJS Slide Bundle",
          imagePrompts: [],
          slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
          modelId: "gpt-5.4",
        },
        generatedImages: [
          {
            id: "img-1-1",
            pageNumber: 1,
            imageIndex: 1,
            placementRole: "hero",
            shortLabel: "cover hero",
            prompt: "Cover image prompt",
            url: "https://cdn.example.com/generated-asset.png",
          },
        ],
        generatedSlideDraft: null,
      }),
    );

    mutationMocks.generateSlideDraft.mockResolvedValue({
      maxPages: 1,
      slideSkillLabel: "GenJS Slide Bundle",
      slidePayloadJson: "{\"request\":{\"projectTitle\":\"Product Pitch\"}}",
      slideJson: JSON.stringify({
        normalizedContent: {
          topic: "Product Pitch",
        },
        slidePlan: [
          {
            title: "Wrapped Layout Slide",
          },
        ],
        layoutSpec: {
          canvas: { ratio: "16:9" },
          theme: { background: "#ffffff" },
          slides: [
            {
              background: "#ffffff",
              notes: "Wrapped notes",
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Wrapped Layout Slide",
                  xPct: 10,
                  yPct: 10,
                  wPct: 60,
                  hPct: 12,
                  fontFace: "Inter",
                  fontSize: 28,
                  lineHeight: 1.5,
                  color: "#111827",
                  align: "left",
                  bold: true,
                },
              ],
            },
          ],
        },
      }),
      modelId: "gpt-5.4",
    });
    mutationMocks.addSlide.mockResolvedValueOnce({ id: 903 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: "header.articleBuilder" }));
    fireEvent.click(screen.getByRole("button", { name: "dialog.articleBuilder.generateSlideJson" }));

    await waitFor(() => {
      expect(mutationMocks.generateSlideDraft).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(await screen.findByRole("button", { name: "dialog.articleBuilder.insertSlides" }));
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });

    expect(mutationMocks.addSlide).toHaveBeenCalledWith(expect.objectContaining({
      title: "Wrapped Layout Slide",
      notes: "Wrapped notes",
      slideContent: expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "Wrapped Layout Slide",
            lineHeight: 1.5,
          }),
        ]),
      }),
    }));
  });

  it("allows dragging the presentation note dialog by its header", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open presentation note/i }));

    const dialog = await screen.findByRole("dialog", { name: /presentation note/i });
    const header = within(dialog).getByText("Presentation Note").closest('[data-slot="dialog-header"]');
    expect(header).not.toBeNull();

    fireEvent.mouseDown(header as HTMLElement, { button: 0, clientX: 120, clientY: 140 });
    fireEvent.mouseMove(window, { clientX: 185, clientY: 225 });
    fireEvent.mouseUp(window);

    expect(dialog).toHaveStyle({ transform: "translate(65px, 85px)" });
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

  it("saves a dirty slide note before regenerating the current slide from the note", async () => {
    mutationMocks.updateSlide.mockImplementation(async (input: any) => {
      queryState.deckByItem = {
        ...queryState.deckByItem,
        slides: queryState.deckByItem.slides.map((slide: any) => (
          slide.id === input.slideId
            ? {
              ...slide,
              version: 4,
              notes: input.notes,
            }
            : slide
        )),
      };
      return {};
    });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open slide note/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/write slide-level notes here/i),
      { target: { value: "Saved note for repair" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /save \+ generate/i }));

    await waitFor(() => {
      expect(mutationMocks.updateSlide).toHaveBeenCalledWith(
        expect.objectContaining({
          slideId: 71,
          notes: "Saved note for repair",
        }),
      );
      expect(mutationMocks.repairSlideFromNote).toHaveBeenCalledWith({
        deckId: 7,
        slideId: 71,
        expectedVersion: 4,
      });
    });

    const saveOrder = mutationMocks.updateSlide.mock.invocationCallOrder[0];
    const repairOrder = mutationMocks.repairSlideFromNote.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(repairOrder);
  });

  it("shows progressing repair status updates while generating a slide from the saved note", async () => {
    vi.useFakeTimers();
    queryState.deckByItem = {
      ...queryState.deckByItem,
      slides: queryState.deckByItem.slides.map((slide: any) => (
        slide.id === 71
          ? {
            ...slide,
            notes: "Saved note for repair",
          }
          : slide
      )),
    };

    let resolveRepair: ((value: any) => void) | null = null;
    mutationMocks.repairSlideFromNote.mockImplementation(() => new Promise((resolve) => {
      resolveRepair = resolve;
    }));

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open slide note/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate slide/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mutationMocks.repairSlideFromNote).toHaveBeenCalledWith(expect.objectContaining({
      deckId: 7,
      slideId: 71,
      expectedVersion: expect.any(Number),
    }));

    await act(async () => {
      vi.advanceTimersByTime(3400);
    });

    await act(async () => {
      resolveRepair?.({
        slide: {
          id: 71,
          version: 4,
          title: "Repaired",
          slideContent: {
            elements: [
              { id: "repaired-title", type: "text", x: 80, y: 80, width: 280, height: 70, text: "Repaired", color: "#111827" },
            ],
          },
        },
        warnings: [],
        applied: {
          templateId: "bottom_image_text_top",
          stylePresetId: "dark-professional",
          graphicCategory: "Education",
          regeneratedImage: true,
        },
      });
      await Promise.resolve();
    });

    vi.useRealTimers();
  }, 10000);

  it("allows dragging the slide note dialog by its header", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open slide note/i }));

    const dialog = await screen.findByRole("dialog", { name: /slide note/i });
    const header = within(dialog).getByText("Slide Note").closest('[data-slot="dialog-header"]');
    expect(header).not.toBeNull();

    fireEvent.mouseDown(header as HTMLElement, { button: 0, clientX: 80, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 160 });
    fireEvent.mouseUp(window);

    expect(dialog).toHaveStyle({ transform: "translate(60px, 70px)" });
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

  it("renders component fallback elements on the editor canvas without flattening saved slide content", async () => {
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
            elements: [],
            components: [
              {
                id: "component-1",
                componentId: "hero",
                componentType: "hero",
                definitionRevision: 2,
                slotBindings: [{ slotId: "title", type: "text", text: "Hello component" }],
                fallbackElements: [
                  {
                    id: "component-title",
                    type: "text",
                    x: 20,
                    y: 20,
                    width: 300,
                    height: 60,
                    text: "Hello component",
                    color: "#111827",
                  },
                ],
              },
            ],
          },
          notes: null,
        },
        buildDeckByItem().slides[1],
      ],
    } as any;

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll("[data-canvas-object='true']"))).toHaveLength(1);
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

    expect(screen.getByRole("button", { name: /header\.saveSlide/i })).toBeInTheDocument();
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

  it("does not overwrite the source slide with an empty draft when switching slides quickly", async () => {
    vi.useFakeTimers();
    try {
      let version = 3;
      mutationMocks.updateSlide.mockImplementation(async (input: any) => {
        const nextVersion = ++version;
        queryState.deckByItem = {
          ...queryState.deckByItem,
          slides: queryState.deckByItem.slides.map((slide: any) => (
            slide.id === input.slideId
              ? {
                ...slide,
                version: nextVersion,
                notes: input.notes,
                slideContent: input.slideContent,
              }
              : slide
          )),
        };
        return { version: nextVersion };
      });

      render(<PresentationEditor />);
      expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("button", { name: /select slide 2/i }));
      fireEvent.click(screen.getByRole("button", { name: /select slide 1/i }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await Promise.resolve();
      });

      expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);

      const overwrittenSourceSlide = mutationMocks.updateSlide.mock.calls.some((call) => {
        const input = call[0] as any;
        return input?.slideId === 71
          && Array.isArray(input?.slideContent?.elements)
          && input.slideContent.elements.length === 0;
      });
      expect(overwrittenSourceSlide).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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

    fireEvent.click(screen.getByRole("button", { name: /header\.saveSlide/i }));
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

    fireEvent.click(screen.getByRole("button", { name: /header\.saveSlide/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(3);
    expect(mutationMocks.updateSlide).toHaveBeenLastCalledWith(expect.objectContaining({
      saveMode: "manual",
    }));
    expect(screen.queryByRole("button", { name: /reload latest slide/i })).not.toBeInTheDocument();
  });

  it("cancels a queued autosave when manual save starts first", async () => {
    vi.useFakeTimers();
    try {
      mutationMocks.updateSlide.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { version: 4 };
      });

      render(<PresentationEditor />);

      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.click(screen.getByRole("button", { name: /header\.saveSlide/i }));

      expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
      expect(mutationMocks.updateSlide).toHaveBeenLastCalledWith(expect.objectContaining({
        saveMode: "manual",
      }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(toastMocks.success).toHaveBeenCalledWith("Presentation saved.");
      expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
