/**
 * Coverage for the supplementary reference-frame trigger button + growing
 * row on `VerticalDramaStoryboardPanel` (Phase 6c, `planning/vd-start-frame-
 * reference-mapping/plan.md`). The dialog's own step/gating logic is covered
 * in `VerticalDramaReferenceFrameDialog.test.tsx`; this file covers how the
 * panel surfaces the trigger, gates it at the 10-frame cap, and renders the
 * DISTINCT "เฟรมอ้างอิงที่สร้างไว้" row filtered to `source:
 * "reference_frame"` (design decision (a) in the plan — a separate row from
 * the general `ShotReferenceStrip`, most-recent-first).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: {
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "a prompt",
          requiredCharacterRefs: ["hero"],
        },
      ],
    },
    characterPortraits: {
      hero: {
        characterId: "1",
        name: "พระเอก",
        portraitUrl: "https://cdn/hero.jpg",
      },
    },
    loading: false,
    onGenerateReferenceFramePrompt: vi.fn(),
    onGenerateReferenceFrameImage: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — supplementary reference frames (Phase 6c)", () => {
  it("keeps lazy prompt authoring separate from render-only image generation for every episode type", () => {
    const { rerender } = render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          selectedImageModelId: "image-model",
          onGeneratePromptAndImage: vi.fn(),
          onGenerateStartFrameImage: vi.fn(),
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "",
                canonicalShotSummary: "เด็กกำลังทดลองเล่นของเล่นในห้องนั่งเล่น",
              },
            ],
          },
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-one-click-generate-1")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("vd-generate-image-1")).not.toBeInTheDocument();

    rerender(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          selectedImageModelId: "image-model",
          onGeneratePromptAndImage: vi.fn(),
          onGenerateStartFrameImage: vi.fn(),
          startFramePlan: {
            frames: [{ shotNumber: 1, imagePrompt: "stored prompt" }],
          },
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-one-click-generate-1")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-generate-image-1")).toBeInTheDocument();
  });

  it("shows tie-in dialogue from the canonical shot draft before a clip exists", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          canonicalShotDrafts: [
            {
              shotNumber: 1,
              summary: "เด็กกำลังทดลองเล่นของเล่นในห้องนั่งเล่น",
              dialogueLines: [
                { speaker: "แม่", line: "ลองหมุนชิ้นนี้ดูนะ" },
                { speaker: "ลูก", line: "สนุกมากเลยครับ" },
              ],
            },
          ],
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-canonical-dialogue-1")
    ).toHaveTextContent("แม่: ลองหมุนชิ้นนี้ดูนะ");
    expect(
      screen.getByTestId("vd-storyboard-canonical-dialogue-1")
    ).toHaveTextContent("ลูก: สนุกมากเลยครับ");
  });

  it("keeps the existing shot image visible after character references change", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          assetUrls: { start: { url: "https://cdn/start.jpg" } },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "",
                requiredCharacterRefs: ["hero"],
                approvedMediaAssetId: "start",
                imageStaleReason: "character_references_changed",
              },
            ],
          },
          onGeneratePromptAndImage: vi.fn(),
        }) as any)}
      />
    );

    expect(screen.getByAltText("เฟรมเริ่มต้น ช็อต 1")).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-retained-image-1")
    ).toHaveTextContent("เก็บภาพเดิมไว้");
  });

  it("does not render the generate button when neither callback is wired", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGenerateReferenceFramePrompt: undefined,
          onGenerateReferenceFrameImage: undefined,
        }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-generate-reference-frame-1")
    ).not.toBeInTheDocument();
  });

  it("renders the generate button and opens the dialog on click", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    const button = screen.getByTestId("vd-generate-reference-frame-1");
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(
      screen.getByTestId("vd-reference-frame-dialog-1")
    ).toBeInTheDocument();
    // Default selection seeds from requiredCharacterRefs — the roster
    // checkbox for "hero" starts checked.
    const heroRow = screen.getByTestId("vd-reference-frame-character-1-hero");
    expect(heroRow.querySelector('button[role="checkbox"]')).toHaveAttribute(
      "data-state",
      "checked"
    );
  });

  it("disables the generate button once the shot has 10 linked reference_frame rows", () => {
    const tenFrames = Array.from({ length: 10 }, (_, i) => ({
      referenceId: `ref-${i}`,
      mediaAssetId: `asset-${i}`,
      role: "reference" as const,
      source: "reference_frame" as const,
      sortOrder: i,
      thumbnailUrl: `https://cdn/frame-${i}.jpg`,
    }));
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: { 1: tenFrames },
        }) as any)}
      />
    );
    expect(screen.getByTestId("vd-generate-reference-frame-1")).toBeDisabled();
  });

  it("does not render the generated-frames row when there are no reference_frame entries yet", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    expect(
      screen.queryByTestId("vd-reference-frame-row-1")
    ).not.toBeInTheDocument();
  });

  it("shows the unified Product/Object Reference card for ordinary shots", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          objectReferenceEnabled: true,
          onAddShotReference: vi.fn(),
          onRemoveShotReference: vi.fn(),
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-object-reference-card-1")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-prop-object-reference-strip-1")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-upload-prop-object-reference-1")
    ).toHaveAttribute("aria-label", "เพิ่มสื่ออ้างอิง");
    expect(
      screen
        .getByTestId("vd-storyboard-upload-prop-object-reference-1")
        .querySelector("input")
    ).toHaveAttribute("accept", "image/*");
  });

  it("uses the same wide card and reference list for Product tie-in shots", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onAddShotReference: vi.fn(),
          onAddShotProductReference: vi.fn(),
          onRemoveShotReference: vi.fn(),
          productTieInByShot: { 1: { productName: "สินค้า" } },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "สินค้าอยู่ในฉาก",
                productReferenceAssetIds: ["https://cdn.example/product.png"],
              },
            ],
          },
        }) as any)}
      />
    );

    const card = screen.getByTestId("vd-storyboard-object-reference-card-1");
    expect(card).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-prop-object-reference-strip-1")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-product-tie-in-chip-1")
    ).toBeInTheDocument();
    expect(
      card.querySelectorAll(
        '[data-testid="vd-storyboard-prop-object-reference-strip-1"]'
      )
    ).toHaveLength(1);
  });

  it("renders Product and story-object images in one shared reference collection", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          objectReferenceEnabled: true,
          onAddShotReference: vi.fn(),
          onAddShotProductReference: vi.fn(),
          onRemoveShotReference: vi.fn(),
          productTieInByShot: { 1: { productName: "กล่องสินค้า" } },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "กล่องสำคัญอยู่ในมือเด็ก",
                productReferenceAssetIds: ["https://cdn.example/product.png"],
              },
            ],
          },
          shotReferencesByShot: {
            1: [
              {
                referenceId: "prop-1",
                mediaAssetId: "prop-asset-1",
                role: "reference",
                source: "prop_object",
                sortOrder: 0,
                thumbnailUrl: "https://cdn.example/box.png",
              },
            ],
          },
        }) as any)}
      />
    );

    const card = screen.getByTestId("vd-storyboard-object-reference-card-1");
    const sharedStrip = screen.getByTestId(
      "vd-storyboard-prop-object-reference-strip-1"
    );
    expect(card).toContainElement(sharedStrip);
    expect(
      screen.getByTestId(
        "vd-storyboard-reference-1-product:https://cdn.example/product.png"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-reference-1-prop-1")
    ).toBeInTheDocument();
    expect(
      card.querySelectorAll('[data-testid*="reference-strip-1"]')
    ).toHaveLength(1);
  });

  it("routes a dropped image to the selected Product or Object type", async () => {
    const onAddObjectReference = vi.fn();
    const onAddProductReference = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          objectReferenceEnabled: true,
          onAddShotReference: onAddObjectReference,
          onAddShotProductReference: onAddProductReference,
          onRemoveShotReference: vi.fn(),
          productTieInByShot: { 1: { productName: "กล่องสำคัญ" } },
        }) as any)}
      />
    );

    const sharedStrip = screen.getByTestId(
      "vd-storyboard-prop-object-reference-strip-1"
    );
    const file = new File(["image"], "box.png", { type: "image/png" });
    fireEvent.click(
      screen.getByRole("button", { name: "สินค้า", exact: true })
    );
    fireEvent.drop(sharedStrip, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onAddProductReference).toHaveBeenCalled());
    expect(onAddObjectReference).not.toHaveBeenCalled();
    expect(onAddProductReference).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ source: "upload", mediaType: "image" })
    );
  });

  it("renders only reference_frame-sourced entries (filters out other sources), most-recent first", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: {
            1: [
              {
                referenceId: "gen-1",
                mediaAssetId: "a1",
                role: "reference",
                source: "generated",
                sortOrder: 0,
                thumbnailUrl: "https://cdn/generated.jpg",
              },
              {
                referenceId: "rf-1",
                mediaAssetId: "a2",
                role: "reference",
                source: "reference_frame",
                sortOrder: 1,
                thumbnailUrl: "https://cdn/rf-1.jpg",
              },
              {
                referenceId: "rf-2",
                mediaAssetId: "a3",
                role: "reference",
                source: "reference_frame",
                sortOrder: 2,
                thumbnailUrl: "https://cdn/rf-2.jpg",
              },
            ],
          },
        }) as any)}
      />
    );
    const row = screen.getByTestId("vd-reference-frame-row-1");
    expect(row).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-reference-frame-thumb-1-gen-1")
    ).not.toBeInTheDocument();

    const buttons = row.querySelectorAll("button");
    // Most-recent-first (server persists oldest-first) — rf-2 before rf-1.
    expect(buttons[0].getAttribute("data-testid")).toBe(
      "vd-reference-frame-thumb-1-rf-2"
    );
    expect(buttons[1].getAttribute("data-testid")).toBe(
      "vd-reference-frame-thumb-1-rf-1"
    );
  });

  it("opens the fullscreen lightbox when a generated reference-frame thumbnail is clicked", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          shotReferencesByShot: {
            1: [
              {
                referenceId: "rf-1",
                mediaAssetId: "a2",
                role: "reference",
                source: "reference_frame",
                sortOrder: 1,
                thumbnailUrl: "https://cdn/rf-1.jpg",
              },
            ],
          },
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-reference-frame-thumb-1-rf-1"));
    // ImageLightbox renders the full-size image once opened.
    expect(screen.getByAltText("เฟรมอ้างอิงที่สร้างไว้")).toBeInTheDocument();
  });

  it("renders a clear two-view workflow for a closed-door scene and hides the generic reference flow", () => {
    const onSetShotViewMode = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onGeneratePromptAndImage: vi.fn(),
          onGenerateStartFrameImage: vi.fn(),
          onSetShotViewMode,
          onSetShotBarrierReferenceLocation: vi.fn(),
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "inside prompt",
                requiredCharacterRefs: ["irin"],
                screenCallerCharacterRefs: ["krit"],
                barrierMultiView: {
                  enabled: true,
                  barrierType: "closed_door",
                  relation: "same_establishment_adjacent_spaces",
                  startView: {
                    side: "inside",
                    characterRefs: ["irin"],
                    locationKey: "storage-room",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["krit"],
                    locationKey: "cafe-ground-floor",
                  },
                  dialogueSideMap: { irin: "inside", krit: "outside" },
                  status: "configured",
                },
              },
            ],
          },
          characterPortraits: {
            irin: {
              characterId: "1",
              name: "ไอริณ",
              portraitUrl: "https://cdn/irin.jpg",
            },
            krit: {
              characterId: "2",
              name: "กฤต",
              portraitUrl: "https://cdn/krit.jpg",
            },
          },
          episodeLocations: [
            { locationKey: "storage-room", name: "ห้องเก็บของหลังคาเฟ่" },
            {
              locationKey: "cafe-ground-floor",
              name: "คาเฟ่ไอริณชั้นล่างตึกแถว",
            },
          ],
        }) as any)}
      />
    );

    expect(screen.getByTestId("vd-barrier-multi-view-1")).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-dual-view-assignment-primary-1")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-dual-view-assignment-secondary-1")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-character-ref-edit-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-location-edit-1")
    ).not.toBeInTheDocument();
    expect(screen.getByText("ฉากสนทนาคนละฝั่งประตู")).toBeInTheDocument();
    expect(screen.getByText("เริ่มจากภาพฝั่งในห้อง")).toBeInTheDocument();
    expect(screen.getByTestId("vd-generate-image-1")).toHaveTextContent(
      "สร้างภาพ (AI)"
    );
    expect(screen.getByTestId("vd-barrier-generate-start-1")).toBeEnabled();
    expect(screen.getByTestId("vd-generate-reference-frame-1")).toBeDisabled();
    expect(
      screen.queryByTestId("vd-reference-frame-row-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-screen-caller-section-1")
    ).not.toBeInTheDocument();
  });

  it("edits each Dual View character and location assignment through the persisted contract", () => {
    const onSetShotViewMode = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onSetShotViewMode,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "two locations",
                requiredCharacterRefs: ["irin"],
                barrierMultiView: {
                  enabled: true,
                  scenario: "separate_locations",
                  activationSource: "manual",
                  barrierType: "none",
                  relation: "separate_locations",
                  startView: {
                    side: "inside",
                    characterRefs: ["irin"],
                    locationKey: "storage-room",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["krit"],
                    locationKey: "cafe-ground-floor",
                  },
                  dialogueSideMap: { irin: "inside", krit: "outside" },
                  status: "configured",
                },
              },
            ],
          },
          characterPortraits: {
            irin: {
              characterId: "1",
              name: "ไอริณ",
              portraitUrl: "https://cdn/irin.jpg",
            },
            krit: {
              characterId: "2",
              name: "กฤต",
              portraitUrl: "https://cdn/krit.jpg",
            },
          },
          episodeLocations: [
            { locationKey: "storage-room", name: "ห้องเก็บของ" },
            { locationKey: "cafe-ground-floor", name: "คาเฟ่ชั้นล่าง" },
            { locationKey: "office", name: "สำนักงาน" },
          ],
        }) as any)}
      />
    );

    fireEvent.click(
      screen.getByTestId("vd-dual-view-edit-characters-primary-1")
    );
    expect(screen.getByText("กำหนดตัวละครมุมที่ 1")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("vd-storyboard-character-ref-option-1-krit")
        .querySelector('button[role="checkbox"]')
    ).toBeDisabled();
    fireEvent.click(
      screen.getByTestId(
        "vd-storyboard-character-ref-picker-save-1-dual_primary"
      )
    );
    expect(onSetShotViewMode).toHaveBeenLastCalledWith(1, {
      mode: "dual",
      scenario: "separate_locations",
      primaryCharacterRefs: ["irin"],
      secondaryCharacterRefs: ["krit"],
      primaryLocationKey: "storage-room",
      secondaryLocationKey: "cafe-ground-floor",
    });

    fireEvent.click(
      screen.getByTestId("vd-dual-view-edit-location-secondary-1")
    );
    expect(
      screen.queryByTestId("vd-storyboard-location-picker-default-1")
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId("vd-storyboard-location-picker-option-1-office")
    );
    expect(onSetShotViewMode).toHaveBeenLastCalledWith(1, {
      mode: "dual",
      scenario: "separate_locations",
      primaryCharacterRefs: ["irin"],
      secondaryCharacterRefs: ["krit"],
      primaryLocationKey: "storage-room",
      secondaryLocationKey: "office",
    });
  });

  it("marks the closed-door workflow ready only when both view images are current", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          assetUrls: {
            start: { url: "https://cdn/start.jpg" },
            outside: { url: "https://cdn/outside.jpg" },
          },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "inside prompt",
                requiredCharacterRefs: ["hero"],
                approvedMediaAssetId: "start",
                barrierMultiView: {
                  enabled: true,
                  barrierType: "closed_door",
                  relation: "same_establishment_adjacent_spaces",
                  startView: {
                    side: "inside",
                    characterRefs: ["hero"],
                    locationKey: "inside",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["outside"],
                    locationKey: "outside",
                    referenceFrameAssetId: "outside",
                  },
                  dialogueSideMap: { hero: "inside", outside: "outside" },
                  status: "ready",
                },
              },
            ],
          },
          shotReferencesByShot: {
            1: [
              {
                referenceId: "outside-ref",
                mediaAssetId: "outside",
                role: "barrier_reference",
                source: "reference_frame",
                sortOrder: 0,
                thumbnailUrl: "https://cdn/outside.jpg",
              },
            ],
          },
        }) as any)}
      />
    );

    expect(screen.getByText("พร้อมสร้างวิดีโอ")).toBeInTheDocument();
    expect(screen.getByAltText("ภาพมุมในห้อง")).toBeInTheDocument();
    expect(screen.getByAltText("ภาพมุมหน้าประตู")).toBeInTheDocument();
  });

  it("shows View 2's saved prompt after View 1 and supports free edit, new prompt, or direct render", async () => {
    const onSaveReferenceFramePrompt = vi.fn();
    const onGenerateReferenceFrameImage = vi.fn().mockResolvedValue(true);
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          assetUrls: { start: { url: "https://cdn/start.jpg" } },
          onSaveReferenceFramePrompt,
          onGenerateReferenceFrameImage,
          onGeneratePromptAndImage: vi.fn(),
          onSetShotBarrierReferenceLocation: vi.fn(),
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "inside prompt",
                approvedMediaAssetId: "start",
                requiredCharacterRefs: ["hero"],
                barrierMultiView: {
                  enabled: true,
                  scenario: "physical_barrier",
                  activationSource: "manual",
                  barrierType: "closed_door",
                  relation: "same_establishment_adjacent_spaces",
                  startView: {
                    side: "inside",
                    characterRefs: ["hero"],
                    locationKey: "inside",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["outside"],
                    locationKey: "outside",
                    imagePrompt: "outside saved prompt",
                    negativePrompt: "merged locations",
                  },
                  dialogueSideMap: { hero: "inside", outside: "outside" },
                  status: "start_ready",
                },
              },
            ],
          },
          characterPortraits: {
            hero: {
              characterId: "1",
              name: "ไอริณ",
              portraitUrl: "https://cdn/hero.jpg",
            },
            outside: {
              characterId: "2",
              name: "กฤต",
              portraitUrl: "https://cdn/outside.jpg",
            },
          },
          episodeLocations: [
            { locationKey: "inside", name: "ห้องเก็บของ" },
            { locationKey: "outside", name: "หน้าประตู" },
          ],
        }) as any)}
      />
    );

    const view1Prompt = screen.getByTestId(
      "vd-storyboard-image-prompt-1-char-counter"
    );
    const view2Section = screen.getByTestId(
      "vd-reference-image-prompt-section-1"
    );
    expect(
      view1Prompt.compareDocumentPosition(view2Section) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText("outside saved prompt")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("vd-reference-image-prompt-1-edit-inline")
    );
    fireEvent.change(
      screen.getByTestId("vd-reference-image-prompt-1-textarea"),
      { target: { value: "edited outside prompt" } }
    );
    fireEvent.click(screen.getByTestId("vd-reference-image-prompt-1-save"));
    await waitFor(() =>
      expect(onSaveReferenceFramePrompt).toHaveBeenCalledWith(
        1,
        "edited outside prompt"
      )
    );

    fireEvent.click(
      screen.getByTestId("vd-reference-image-prompt-1-generate-new")
    );
    expect(
      screen.getByTestId("vd-reference-frame-dialog-1")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-reference-frame-cancel-1"));

    fireEvent.click(screen.getByTestId("vd-reference-image-prompt-1-render"));
    fireEvent.click(
      screen.getByTestId(
        "vd-credit-confirm-reference-image-existing-prompt-1-confirm"
      )
    );
    expect(onGenerateReferenceFrameImage).toHaveBeenCalledWith({
      shotNumber: 1,
      prompt: "outside saved prompt",
      negativePrompt: "merged locations",
      characterKeys: ["outside"],
    });
  });

  it("opens image-to-image repair for View 2 with the View 2 image", () => {
    const onOpenRepairImageDialog = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          selectedImageModelId: "google-nano-banana-pro",
          onOpenRepairImageDialog,
          onSubmitRepairImage: vi.fn(),
          repairImageDialogForShot: 1,
          repairImageTargetRole: "barrier_reference",
          assetUrls: {
            start: { url: "https://cdn/start.jpg" },
            outside: { url: "https://cdn/outside.jpg" },
          },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "inside prompt",
                approvedMediaAssetId: "start",
                requiredCharacterRefs: ["hero"],
                barrierMultiView: {
                  enabled: true,
                  barrierType: "closed_door",
                  relation: "same_establishment_adjacent_spaces",
                  startView: {
                    side: "inside",
                    characterRefs: ["hero"],
                    locationKey: "inside",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["outside"],
                    locationKey: "outside",
                    imagePrompt: "outside prompt",
                    referenceFrameAssetId: "outside",
                  },
                  dialogueSideMap: { hero: "inside", outside: "outside" },
                  status: "ready",
                },
              },
            ],
          },
          shotReferencesByShot: {
            1: [
              {
                referenceId: "outside-ref",
                mediaAssetId: "outside",
                role: "barrier_reference",
                source: "reference_frame",
                sortOrder: 0,
                thumbnailUrl: "https://cdn/outside.jpg",
              },
            ],
          },
        }) as any)}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-repair-image-dialog-1")
    ).toBeInTheDocument();
    expect(screen.getByAltText("ก่อน")).toHaveAttribute(
      "src",
      "https://cdn/outside.jpg"
    );
    fireEvent.click(screen.getByTestId("vd-barrier-repair-reference-image-1"));
    expect(onOpenRepairImageDialog).toHaveBeenCalledWith(
      1,
      "barrier_reference"
    );
  });

  it("lets the user override a normal shot into Dual View", () => {
    const onSetShotViewMode = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onSetShotViewMode }) as any)}
      />
    );

    expect(screen.getByTestId("vd-shot-view-mode-single-1")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByTestId("vd-shot-view-mode-dual-1"));
    expect(onSetShotViewMode).toHaveBeenCalledWith(1, { mode: "dual" });
  });

  it("shows communication mode as two explicit choices and converts only when closed door is selected", () => {
    const onSetShotBarrierDialogue = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onSetShotBarrierDialogue,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "phone call",
                requiredCharacterRefs: ["hero"],
                screenCallerCharacterRefs: ["caller"],
              },
            ],
          },
          characterPortraits: {
            hero: {
              characterId: "1",
              name: "พระเอก",
              portraitUrl: "https://cdn/hero.jpg",
            },
            caller: {
              characterId: "2",
              name: "ผู้โทร",
              portraitUrl: "https://cdn/caller.jpg",
            },
          },
        }) as any)}
      />
    );

    const phoneOption = screen.getByTestId("vd-shot-communication-phone-1");
    const closedDoorOption = screen.getByTestId("vd-shot-communication-door-1");
    expect(
      screen.getByRole("radiogroup", { name: "รูปแบบการสื่อสาร" })
    ).toBeInTheDocument();
    expect(phoneOption).toHaveAttribute("aria-checked", "true");
    expect(closedDoorOption).toHaveAttribute("aria-checked", "false");
    expect(
      screen.queryByRole("button", { name: "ใช้เป็นบทสนทนาผ่านประตู" })
    ).not.toBeInTheDocument();

    fireEvent.click(closedDoorOption);
    expect(onSetShotBarrierDialogue).toHaveBeenCalledWith(1, {
      state: "locked",
      cameraSide: "inside",
      visibleCharacterRefs: ["hero"],
      offscreenCharacterRefs: ["caller"],
    });
  });

  it("shows auto-detection evidence and lets the user return to single view", () => {
    const onSetShotViewMode = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onSetShotViewMode,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "remote call",
                requiredCharacterRefs: ["hero"],
                barrierMultiView: {
                  enabled: true,
                  scenario: "remote_call",
                  activationSource: "auto",
                  detection: { confidence: 0.92, reasonCodes: ["remote_call"] },
                  barrierType: "none",
                  relation: "separate_locations",
                  startView: {
                    side: "inside",
                    characterRefs: ["hero"],
                    locationKey: "office",
                  },
                  referenceView: {
                    side: "outside",
                    characterRefs: ["caller"],
                    locationKey: "home",
                  },
                  dialogueSideMap: { hero: "inside", caller: "outside" },
                  status: "configured",
                },
              },
            ],
          },
        }) as any)}
      />
    );

    expect(screen.getByText("AI ตรวจพบ")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("คุยโทรศัพท์คนละสถานที่")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-shot-view-mode-single-1"));
    expect(onSetShotViewMode).toHaveBeenCalledWith(1, { mode: "single" });
  });
});
