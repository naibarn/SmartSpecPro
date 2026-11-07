import { describe, expect, it } from "vitest";
import {
  clearSpecialTieInEpisodeDraft,
  hasMeaningfulSpecialTieInDraft,
  readSpecialTieInEpisodeDraft,
  specialTieInEpisodeDraftKey,
  writeSpecialTieInEpisodeDraft,
  type SpecialTieInEpisodeDraftValues,
} from "./specialTieInEpisodeDraft";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

const emptyDraft: SpecialTieInEpisodeDraftValues = {
  idea: "",
  presentationStyle: "varied",
  reviewSubjectType: "product",
  storyStructure: "varied",
  referenceType: "product",
  references: [],
  characterIds: [],
  speakerCharacterIds: [],
  durationSeconds: 10,
  dialogueMode: "character_dialogue",
  dialogueBrief: "",
  shotDialogueDrafts: [],
  allowAdditionalCharacters: false,
  lockCharacterReferences: true,
  lockReferenceImages: true,
  imageModelId: "",
  videoModelId: "",
  ideaLlmModelId: "auto",
  productQuery: "",
  selectedProductId: null,
  pendingImageIds: [],
  selectedLocationId: null,
  sceneSuggestions: [],
  sceneChoiceByLabel: {},
  selectedSceneLocationKey: null,
  selectedIdeaId: null,
  selectedMarketplaceIdea: null,
  footageAssetId: null,
  footageFileName: "",
  footageAnalysisJobId: null,
  footagePrepareJobId: null,
  footageTrimStartMs: 0,
  footageTrimEndMs: 0,
  brollAssetId: "",
  brollStartMs: 0,
  brollEndMs: 5000,
  brollSourceInMs: 0,
  brollPlacements: [],
  brollRenderJobId: null,
};

describe("special tie-in episode drafts", () => {
  it("scopes drafts by tenant, user, and series", () => {
    const base = { tenantId: "tenant-a", userId: 7, seriesId: 53 };
    const keys = [
      specialTieInEpisodeDraftKey(base),
      specialTieInEpisodeDraftKey({ ...base, tenantId: "tenant-b" }),
      specialTieInEpisodeDraftKey({ ...base, userId: 8 }),
      specialTieInEpisodeDraftKey({ ...base, seriesId: 54 }),
    ];
    expect(new Set(keys).size).toBe(4);
    expect(specialTieInEpisodeDraftKey({ userId: 7, seriesId: 53 })).toBeNull();
  });

  it("restores a complete useful draft across a page reload", () => {
    const storage = memoryStorage();
    const key = specialTieInEpisodeDraftKey({
      tenantId: "tenant-a",
      userId: 7,
      seriesId: 53,
    });
    const values = {
      ...emptyDraft,
      idea: "Keep this product brief",
      references: [
        {
          mediaAssetId: "media-91",
          source: "marketplace_capture" as const,
          role: "product" as const,
          label: "Product image",
          previewUrl: "https://temporary.example/signed-preview",
          provenance: {
            marketplaceProductId: "12",
            marketplaceImageId: "34",
            signedUrl: "https://temporary.example/signed-provenance",
          },
        },
      ],
      selectedSceneLocationKey: "scene-kitchen",
      selectedIdeaId: "idea-4",
    };

    expect(
      writeSpecialTieInEpisodeDraft(
        key,
        values as unknown as SpecialTieInEpisodeDraftValues,
        storage,
        100_000
      )
    ).toBe(true);
    const storedValues = JSON.parse(storage.getItem(key) ?? "null").values;
    expect(storedValues.references[0]).not.toHaveProperty("previewUrl");
    expect(storedValues.references[0].provenance).not.toHaveProperty(
      "signedUrl"
    );
    expect(storedValues.references[0].provenance).toMatchObject({
      marketplaceProductId: "12",
      marketplaceImageId: "34",
    });
    expect(readSpecialTieInEpisodeDraft(key, storage, 100_001)).toMatchObject({
      savedAt: 100_000,
      values: {
        idea: "Keep this product brief",
        references: [{ mediaAssetId: "media-91" }],
        selectedSceneLocationKey: "scene-kitchen",
        selectedIdeaId: "idea-4",
      },
    });
  });

  it("clears expired or malformed stored drafts instead of restoring them", () => {
    const storage = memoryStorage();
    const key = "draft";
    expect(
      writeSpecialTieInEpisodeDraft(
        key,
        { ...emptyDraft, idea: "expire me" },
        storage,
        1
      )
    ).toBe(true);
    expect(
      readSpecialTieInEpisodeDraft(key, storage, 7 * 24 * 60 * 60 * 1000 + 2)
    ).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, "not-json");
    expect(readSpecialTieInEpisodeDraft(key, storage)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("removes the saved copy when explicitly discarded or the form is empty", () => {
    const storage = memoryStorage();
    const key = "draft";
    expect(hasMeaningfulSpecialTieInDraft(emptyDraft)).toBe(false);
    storage.setItem(key, "existing");
    expect(writeSpecialTieInEpisodeDraft(key, emptyDraft, storage)).toBe(true);
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, "existing");
    clearSpecialTieInEpisodeDraft(key, storage);
    expect(storage.getItem(key)).toBeNull();
  });

  it("does not throw when browser storage is unavailable", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(readSpecialTieInEpisodeDraft("draft", failingStorage)).toBeNull();
    expect(
      writeSpecialTieInEpisodeDraft(
        "draft",
        { ...emptyDraft, idea: "brief" },
        failingStorage
      )
    ).toBe(false);
    expect(() =>
      clearSpecialTieInEpisodeDraft("draft", failingStorage)
    ).not.toThrow();
  });
});
