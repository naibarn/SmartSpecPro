/**
 * @vitest-environment jsdom
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductionSpace } from "@shared/mediaProduction";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: ({
      nodes,
      edges,
      children,
      zoomOnScroll,
      panOnScroll,
      preventScrolling,
    }: {
      nodes: Array<{ id: string; data?: { label?: string } }>;
      edges: Array<{ id: string; source: string; target: string }>;
      children?: React.ReactNode;
      zoomOnScroll?: boolean;
      panOnScroll?: boolean;
      preventScrolling?: boolean;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "react-flow-canvas",
          "data-node-count": String(nodes.length),
          "data-edge-count": String(edges.length),
          "data-zoom-on-scroll": String(zoomOnScroll),
          "data-pan-on-scroll": String(panOnScroll),
          "data-prevent-scrolling": String(preventScrolling),
        },
        [
          React.createElement(
            "ol",
            { key: "nodes", "aria-label": "Production nodes" },
            nodes.map(node =>
              React.createElement(
                "li",
                { key: node.id },
                node.data?.label ?? node.id
              )
            )
          ),
          React.createElement(
            "ol",
            { key: "edges", "aria-label": "Production dependencies" },
            edges.map(edge =>
              React.createElement(
                "li",
                { key: edge.id },
                `${edge.source}->${edge.target}`
              )
            )
          ),
          children,
        ]
      ),
    Background: () =>
      React.createElement("div", { "data-testid": "react-flow-background" }),
    Controls: () =>
      React.createElement("div", { "data-testid": "react-flow-controls" }),
    MiniMap: () =>
      React.createElement("div", { "data-testid": "react-flow-minimap" }),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReactFlow: () => ({
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    }),
    useUpdateNodeInternals: () => vi.fn(),
  };
});

import { ProductionFlowCanvas } from "./components/ProductionFlowCanvas";
import { ProductionWorkspace } from "./components/ProductionWorkspace";
import { ProductEvidenceTray } from "./components/ProductEvidenceTray";
import { VideoShotWorkspace } from "./components/VideoShotWorkspace";

const featureSpace: ProductionSpace = {
  schemaVersion: "1.0.0",
  productionRunId: "run-feature-116",
  version: 7,
  status: "plan_ready_for_review",
  brief: {
    title: "Launch teaser",
    summary: "Create a short product video using approved evidence only.",
    goalType: "video",
    audience: "founders",
    platform: "shorts",
    durationSeconds: 30,
    constraints: { aspectRatio: "9:16", language: "en" },
  },
  contextAssets: [
    {
      id: "asset-normal-1",
      kind: "reference_image",
      title: "Normal moodboard frame",
      source: "asset-library",
    },
	    {
	      id: "asset-product-evidence-1",
	      kind: "marketplace_product",
	      title: "Feature 115 product evidence fixture",
	      source: "feature-115-product-evidence",
	      provenance: { feature: 115, claimIds: ["claim-speed"] },
	    },
	    {
	      id: "character-provider-1",
	      kind: "character_asset",
	      title: "Gemini Omni cast reference",
	      source: "gemini-omni-character-provider",
	      zone: "cast",
	    },
	  ],
  productEvidenceManifest: {
    manifestId: "manifest-115",
    status: "ready",
    requiredClaimIds: ["claim-speed"],
    warnings: [],
    products: [
      {
        id: "product-1",
        productId: "sku-1",
        title: "Evidence-backed product",
        sku: "SKU-001",
        approvalState: "approved",
        productTruth: {
          platform: "shopee",
          brand: "Smart Brand",
          shopName: "Official Shop",
          itemId: "SKU-001",
          sourceUrl: "https://marketplace.example/product/sku-001",
          price: { current: "1290", currency: "THB" },
          performanceSignals: { ratingScore: "4.8", soldCountText: "ขายแล้ว 2.3k" },
          supportingInsights: {
            source: "marketplace_capture_local_or_server_ai",
            usagePolicy: { mode: "optional_supporting_context" },
            availableTypes: ["product_brief", "video_brief", "storytelling_handoff"],
            summary: {
              shortSummary: "Local AI summary from the marketplace product page.",
              sellingPoints: ["Foldable and space saving"],
              hooks: ["Tiny room, cleaner setup"],
            },
            videoBrief: {
              title: "30s room refresh story",
            },
            storytelling: {
              readiness: "ready_with_warnings",
              claims: [{ text: "Space saving", status: "supported", evidenceIds: ["evidence-1"] }],
            },
          },
        },
        claimEvidence: [
          {
            claimId: "claim-speed",
            evidenceIds: ["evidence-1"],
            status: "approved",
          },
        ],
      },
    ],
  },
  shots: [
    {
      id: "shot-1",
      title: "Hook",
      order: 1,
      durationSeconds: 8,
      nodeIds: ["image-node", "video-node", "tts-node"],
      status: "ready",
    },
  ],
  flowNodes: [
    {
      id: "image-node",
      kind: "image",
      title: "Image config node",
      status: "ready",
      position: { x: 0, y: 0 },
      configSnapshot: {
        snapshotId: "snap-image",
        version: 1,
        toolSurface: "image",
        adapter: "image",
        config: { prompt: "Evidence-backed product hero" },
        configHash: "image-hash",
      },
      outputRefs: [
        {
          outputRefId: "out-image",
          nodeId: "image-node",
          kind: "image",
          url: "https://example.test/image.png",
        },
      ],
    },
    {
      id: "video-node",
      kind: "video",
      title: "Video config node",
      status: "warning",
      position: { x: 220, y: 0 },
      readinessIssues: ["Needs human review before generation"],
      configSnapshot: {
        snapshotId: "snap-video",
        version: 1,
        toolSurface: "video",
        adapter: "video",
        config: { durationSeconds: 8 },
        configHash: "video-hash",
      },
    },
    {
      id: "tts-node",
      kind: "tts",
      title: "Basic TTS node",
      status: "ready",
      position: { x: 440, y: 0 },
      configSnapshot: {
        snapshotId: "snap-tts",
        version: 1,
        toolSurface: "audio",
        adapter: "tts",
        config: { voice: "default" },
        configHash: "tts-hash",
      },
    },
    {
      id: "handoff-node",
      kind: "video_edit",
      title: "Video Edit handoff preview",
      status: "disabled",
      position: { x: 660, y: 0 },
    },
  ],
	  flowEdges: [
    {
      id: "image-video",
      source: "image-node",
      target: "video-node",
      kind: "dependency",
    },
    {
      id: "video-tts",
      source: "video-node",
      target: "tts-node",
      kind: "reference",
    },
    {
      id: "tts-handoff",
      source: "tts-node",
      target: "handoff-node",
      kind: "handoff",
    },
	  ],
	  planningSelection: {
	    skillId: "media-production-storyboard-planner",
	    skillSlug: "media-production-storyboard-planner",
	    skillTitle: "Media Production Storyboard Planner",
	    tags: ["production_planning", "storyboard_planning"],
	    modelMode: "auto",
	    compatibility: "compatible",
	    contextPack: {
	      packId: "pack-1",
	      goalHash: "hash-1",
	      assetCount: 3,
	      productEvidenceStatus: "ready",
	      shotCount: 1,
	      desiredTargets: ["storyboard_review", "video_edit"],
	      capabilityIds: ["image", "video", "tts"],
	    },
	  },
	  featureFlags: { liveHandoff: false },
	};

const featureSpaceWithMatchableProduct: ProductionSpace = {
  ...featureSpace,
  contextAssets: [
    ...featureSpace.contextAssets,
    {
      id: "product-asset-match",
      kind: "product_image",
      title: "Evidence-backed product",
      source: "feature-115-marketplace",
      assetId: "product-1",
    },
  ],
};

const featureSpaceTwoShots: ProductionSpace = {
  ...featureSpace,
  shots: [
    ...featureSpace.shots,
    {
      id: "shot-2",
      title: "Proof",
      order: 2,
      durationSeconds: 5,
      nodeIds: [],
      status: "ready",
    },
  ],
};

describe("Feature 116 Production Director deterministic evidence gate", () => {
  it("renders the production canvas, fixture assets, safeguards, and controls", () => {
    const onSave = vi.fn();
    const onCreateFixturePlan = vi.fn();
    const onProjectSearchOpen = vi.fn();
    const onOpenVideoShot = vi.fn();
    const onStoryboardReferenceSkillChange = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={onSave}
        onProjectSearchOpen={onProjectSearchOpen}
        onCreateFixturePlan={onCreateFixturePlan}
        onOpenVideoShot={onOpenVideoShot}
        onAssetAssignToNode={vi.fn()}
        onAssetAddToCanvas={vi.fn()}
        storyboardReferenceSkillId="furniture-reference-storyboard"
        storyboardReferenceSkillOptions={[
          { id: "furniture-reference-storyboard", label: "Furniture Reference Storyboard" },
          { id: "cosmatic-reference-storyboard", label: "Cosmatic Reference Storyboard" },
        ]}
        onStoryboardReferenceSkillChange={onStoryboardReferenceSkillChange}
        space={featureSpace}
      />
    );

    expect(screen.getByTestId("production-workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Production project title")).toHaveValue("Launch teaser");
    expect(screen.getByLabelText("Production goal")).toHaveValue("Create a short product video using approved evidence only.");
    expect(screen.getAllByText("Normal moodboard frame").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Feature 115 product evidence fixture").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Plan ready for review")).toBeInTheDocument();
    expect(screen.getAllByText("Shots").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nodes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Blockers")).toBeInTheDocument();
    expect(screen.getByText("Credits before confirm")).toBeInTheDocument();
    expect(screen.getByText("Planning does not spend generation provider credits")).toBeInTheDocument();
    expect(screen.getByTestId("production-planning-skill-panel")).toBeInTheDocument();
    expect(screen.getByTestId("production-planning-attachment-dropzone")).toHaveTextContent("Planning attachments");
    expect(screen.getByTestId("production-planning-attachment-dropzone")).toHaveTextContent("3/10");
    expect(screen.getByTestId("production-planning-attachment-list")).toHaveTextContent("Normal moodboard frame");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("Smart Brand");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("Official Shop");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("1290");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("https://marketplace.example/product/sku-001");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("AI insight");
    expect(screen.getByTestId("product-evidence-tray")).toHaveTextContent("Local AI summary from the marketplace product page.");
    expect(screen.getByRole("button", { name: /product details/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Planning skill selector")).toHaveValue("media-production-storyboard-planner");
    expect(screen.getByLabelText("Planning model mode")).toHaveValue("auto");
    expect(screen.getByLabelText("Start/stop image prompt skill")).toHaveValue("furniture-reference-storyboard");
    expect(screen.getByText("Character / Provider Results")).toBeInTheDocument();
    expect(screen.getAllByText("Gemini Omni cast reference").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Planner/verifier may use LLM credits; Generate requires separate confirmation")).toBeInTheDocument();
    expect(screen.getByText("Live handoff/execution remains flag-gated")).toBeInTheDocument();
    expect(screen.getByTestId("production-execution-status-panel")).toBeInTheDocument();
    expect(screen.getByText("Confirm: required before generation credits are reserved")).toBeInTheDocument();
    expect(screen.getByText("Failure/Retry: retries keep the original attempt id and version guard")).toBeInTheDocument();
    expect(screen.getByTestId("node-config-panel")).toBeInTheDocument();

    const canvas = screen.getByTestId("react-flow-canvas");
    expect(canvas).toHaveAttribute("data-node-count", "4");
    expect(canvas).toHaveAttribute("data-edge-count", "3");
    expect(canvas).toHaveAttribute("data-zoom-on-scroll", "false");
    expect(canvas).toHaveAttribute("data-pan-on-scroll", "false");
    expect(canvas).toHaveAttribute("data-prevent-scrolling", "false");
    expect(within(canvas).getByText("Image config node")).toBeInTheDocument();
    expect(within(canvas).getByText("Video config node")).toBeInTheDocument();
    expect(within(canvas).getByText("Basic TTS node")).toBeInTheDocument();
    expect(within(canvas).getByText("tts-node->handoff-node")).toBeInTheDocument();

    expect(screen.getByTestId("production-node-list-fallback")).toHaveTextContent("Image config node");

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    fireEvent.click(screen.getAllByText("More")[0]);
    fireEvent.click(screen.getByRole("button", { name: /search \/ open/i }));
    fireEvent.click(screen.getByRole("button", { name: /plan \/ suggest 4 concepts/i }));
    fireEvent.click(screen.getByRole("button", { name: /open video shot/i }));
    fireEvent.change(screen.getByLabelText("Start/stop image prompt skill"), { target: { value: "cosmatic-reference-storyboard" } });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onProjectSearchOpen).toHaveBeenCalledTimes(1);
    expect(onCreateFixturePlan).toHaveBeenCalledTimes(1);
    expect(onOpenVideoShot).toHaveBeenCalledTimes(1);
    expect(onStoryboardReferenceSkillChange).toHaveBeenCalledWith("cosmatic-reference-storyboard");
  });

  it("accepts typed right-panel media drops as planning attachments without creating canvas nodes", () => {
    const onAddPlanningAsset = vi.fn();
    const droppedAsset = {
      id: "right-panel-character-1",
      kind: "character_asset",
      title: "Hero character reference",
      url: "https://cdn.example.test/hero.png",
      thumbnailUrl: "https://cdn.example.test/hero.png",
      source: "library-right-panel",
      zone: "cast",
      role: "character_reference",
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onAddPlanningAsset={onAddPlanningAsset}
        onAssetAddToCanvas={vi.fn()}
        space={featureSpace}
      />
    );

    fireEvent.drop(screen.getByTestId("production-planning-attachment-dropzone"), {
      dataTransfer: {
        getData: (type: string) => type === "application/x-production-asset-json" ? JSON.stringify(droppedAsset) : "",
        dropEffect: "copy",
      },
    });

    expect(onAddPlanningAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: "right-panel-character-1",
      kind: "character_asset",
      zone: "cast",
    }));
  });

  it("normalizes dropped planning images by the explicit role lane", () => {
    const onAddPlanningAsset = vi.fn();
    const genericImage = {
      id: "right-panel-generic-image",
      kind: "reference_image",
      title: "Generic uploaded image",
      url: "https://cdn.example.test/generic.png",
      thumbnailUrl: "https://cdn.example.test/generic.png",
      source: "library-right-panel",
      role: "visual_reference",
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onAddPlanningAsset={onAddPlanningAsset}
        onAssetAddToCanvas={vi.fn()}
        space={featureSpace}
      />
    );

    fireEvent.drop(screen.getByTestId("production-planning-attachment-dropzone-products"), {
      dataTransfer: {
        getData: (type: string) => type === "application/x-production-asset-json" ? JSON.stringify(genericImage) : "",
        dropEffect: "copy",
      },
    });
    fireEvent.drop(screen.getByTestId("production-planning-attachment-dropzone-scene_mood"), {
      dataTransfer: {
        getData: (type: string) => type === "application/x-production-asset-json" ? JSON.stringify({ ...genericImage, id: "right-panel-scene-image" }) : "",
        dropEffect: "copy",
      },
    });

    expect(onAddPlanningAsset).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: "right-panel-generic-image",
      kind: "product_image",
      zone: "products",
      role: "product_reference",
    }));
    expect(onAddPlanningAsset).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: "right-panel-scene-image",
      kind: "reference_image",
      zone: "scene_mood",
      role: "environment_reference",
    }));
  });

  it("removes planning attachments from the attachment list", () => {
    const onRemovePlanningAsset = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onAddPlanningAsset={vi.fn()}
        onRemovePlanningAsset={onRemovePlanningAsset}
        onAssetAddToCanvas={vi.fn()}
        space={featureSpace}
      />
    );

    fireEvent.click(screen.getByTestId("production-planning-attachment-remove-asset-normal-1"));

    expect(onRemovePlanningAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: "asset-normal-1",
      title: "Normal moodboard frame",
    }));
  });

  it("shows the story concept wizard before generating a fresh workflow", () => {
    const onSelectStoryConcept = vi.fn();
    const onConfirmStoryConceptPlan = vi.fn();
    const onRegenerateStoryConcepts = vi.fn();
    const onGenerateStoryConceptInfographic = vi.fn();
    const onStoryboardClipDurationSecondsChange = vi.fn();
    const onBriefChange = vi.fn();
    const storyOption = {
      id: "problem-solution",
      title: "Fast Problem-Solution",
      angle: "Lead with the pain point, then show product proof.",
      audience: "Marketplace shoppers",
      painPoint: "Unsure whether the product fits the room.",
      hook: "Tiny room, cleaner setup",
      sellingPoints: ["Foldable", "Space saving"],
      objectionsTrust: ["Use verified product evidence only"],
      useCase: "Small bedroom organization",
      conceptDetails: "Product name: Compact shelf. Summarized product details: foldable shelf for small bedrooms. Target audience: marketplace shoppers. Problem: unsure whether the product fits the room. Selling points: foldable and space saving.",
      sceneTimeline: [
        { timeRange: "0-3s", title: "Hook", detail: "Open with the cramped room problem." },
        { timeRange: "3-12s", title: "Problem", detail: "Show the before context." },
        { timeRange: "12-23s", title: "Demo", detail: "Show the product in use." },
        { timeRange: "23-30s", title: "CTA", detail: "Invite product detail review." },
      ],
      risks: ["Claims must stay grounded."],
      sourceSignals: ["Marketplace AI insight available"],
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onSelectStoryConcept={onSelectStoryConcept}
        onConfirmStoryConceptPlan={onConfirmStoryConceptPlan}
        onRegenerateStoryConcepts={onRegenerateStoryConcepts}
        onGenerateStoryConceptInfographic={onGenerateStoryConceptInfographic}
        onBriefChange={onBriefChange}
        generationDefaults={{ imageModelId: "image-default", videoModelId: "video-default", imageModelSource: "project_default", videoModelSource: "project_default" }}
        imageModelOptions={[{ modelId: "image-default", name: "Default Image Model", provider: "test", isDefault: true }]}
        videoModelOptions={[{ modelId: "video-default", name: "Default Video Model", provider: "test", isDefault: true }]}
        planningModelMode="manual"
        selectedPlanningModel="vision-thinking-model"
        planningModelOptions={[{ modelId: "vision-thinking-model", name: "Vision Thinking Model", provider: "test", supportsThinking: true, supportsVision: true, contextLength: 1_000_000 }]}
        storyboardClipDurationSeconds={10}
        storyboardClipDurationOptions={[5, 6, 8, 9, 10, 12, 15]}
        onStoryboardClipDurationSecondsChange={onStoryboardClipDurationSecondsChange}
        storyConceptWizard={{
          status: "options_ready",
          selectedId: "problem-solution",
          options: [
            storyOption,
            { ...storyOption, id: "proof-trust", title: "Proof-Led Review" },
            { ...storyOption, id: "lifestyle-use-case", title: "Lifestyle Use Case" },
            { ...storyOption, id: "hook-demo-cta", title: "Hook, Demo, CTA" },
          ],
          contextSummary: "Choose one concept before generating a fresh workflow.",
        }}
        space={featureSpace}
      />
    );

    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Choose a story concept before workflow generation");
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Fast Problem-Solution");
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("30s timeline");
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Concept and details");
    expect(screen.getAllByDisplayValue(/Product name: Compact shelf/i)).toHaveLength(4);
    expect(screen.getByLabelText("Planning model")).toHaveValue("vision-thinking-model");
    expect(screen.getByLabelText("Default image generation model")).toHaveValue("image-default");
    expect(screen.getByLabelText("Default video generation model")).toHaveValue("video-default");
    expect(screen.getByLabelText("Duration seconds")).toHaveValue("30");
    expect(screen.getByLabelText("Storyboard seconds per video")).toHaveValue("10");
    expect(screen.getByLabelText("Seconds per storyboard video")).toHaveValue("10");
    expect(screen.getByRole("option", { name: "5s / video (6 videos)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "6s / video (5 videos)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "9s / video (4 videos)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "12s / video (3 videos)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "15s / video (2 videos)" })).toBeInTheDocument();
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("3 videos/shots from 30s total ÷ 10s");
    fireEvent.change(screen.getByLabelText("Duration seconds"), { target: { value: "56" } });
    expect(onBriefChange).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 56 }));
    fireEvent.change(screen.getByLabelText("Seconds per storyboard video"), { target: { value: "8" } });
    expect(onStoryboardClipDurationSecondsChange).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByRole("button", { name: /regenerate 4 concepts/i }));
    expect(onRegenerateStoryConcepts).toHaveBeenCalledWith();
    fireEvent.click(within(screen.getByTestId("production-story-option-proof-trust")).getByRole("button", { name: /^regenerate$/i }));
    expect(onRegenerateStoryConcepts).toHaveBeenCalledWith("proof-trust");
    fireEvent.click(within(screen.getByTestId("production-story-option-proof-trust")).getByRole("button", { name: /infographic/i }));
    expect(onGenerateStoryConceptInfographic).toHaveBeenCalledWith("proof-trust");
    fireEvent.click(within(screen.getByTestId("production-story-option-proof-trust")).getByRole("button", { name: /fullscreen preview/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Proof-Led Review");
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    fireEvent.click(within(screen.getByTestId("production-story-option-proof-trust")).getByRole("button", { name: /select concept/i }));
    expect(onSelectStoryConcept).toHaveBeenCalledWith("proof-trust");
    fireEvent.click(screen.getByRole("button", { name: /generate workflow from this concept/i }));
    expect(onConfirmStoryConceptPlan).toHaveBeenCalledWith("problem-solution");
  });

  it("shows story concept options after a production project exists", () => {
    const storyOption = {
      id: "problem-solution",
      title: "Fast Problem-Solution",
      angle: "Lead with the pain point, then show product proof.",
      audience: "Marketplace shoppers",
      painPoint: "Unsure whether the product fits the room.",
      hook: "Tiny room, cleaner setup",
      sellingPoints: ["Foldable", "Space saving"],
      objectionsTrust: ["Use verified product evidence only"],
      useCase: "Small bedroom organization",
      sceneTimeline: [
        { timeRange: "0-3s", title: "Hook", detail: "Open with the cramped room problem." },
        { timeRange: "3-12s", title: "Problem", detail: "Show the before context." },
        { timeRange: "12-23s", title: "Demo", detail: "Show the product in use." },
        { timeRange: "23-30s", title: "CTA", detail: "Invite product detail review." },
      ],
      risks: [],
      sourceSignals: ["Marketplace AI insight available"],
    };
    const emptySpace: ProductionSpace = {
      schemaVersion: "1.0.0",
      productionRunId: "fixture",
      version: 1,
      status: "draft",
      brief: { summary: "" },
      contextAssets: [],
      shots: [],
      flowNodes: [],
      flowEdges: [],
    };

    render(
      <ProductionWorkspace
        title=""
        status="draft"
        summary=""
        productionRunId="fixture"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        storyConceptWizard={{
          status: "options_ready",
          selectedId: "problem-solution",
          options: [
            storyOption,
            { ...storyOption, id: "proof-trust", title: "Proof-Led Review" },
            { ...storyOption, id: "quick-demo", title: "Quick Demo" },
            { ...storyOption, id: "use-case-moment", title: "Use Case Moment" },
          ],
        }}
        space={emptySpace}
      />
    );

    expect(screen.queryByTestId("production-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Choose a story concept before workflow generation");
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Storyboard");
    expect(screen.getByTestId("production-story-wizard")).toHaveTextContent("Proof-Led Review");
  });

  it("keeps infographic task state visible while queued or failed", () => {
    const storyOption = {
      id: "problem-solution",
      title: "Fast Problem-Solution",
      angle: "Lead with the pain point, then show product proof.",
      audience: "Marketplace shoppers",
      painPoint: "Unsure whether the product fits the room.",
      hook: "Tiny room, cleaner setup",
      sellingPoints: ["Foldable", "Space saving"],
      objectionsTrust: ["Use verified product evidence only"],
      useCase: "Small bedroom organization",
      sceneTimeline: [
        { timeRange: "0-3s", title: "Hook", detail: "Open with the cramped room problem." },
        { timeRange: "3-12s", title: "Problem", detail: "Show the before context." },
        { timeRange: "12-23s", title: "Demo", detail: "Show the product in use." },
        { timeRange: "23-30s", title: "CTA", detail: "Invite product detail review." },
      ],
      risks: [],
      sourceSignals: ["Marketplace AI insight available"],
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        storyConceptWizard={{
          status: "options_ready",
          selectedId: "problem-solution",
          options: [
            {
              ...storyOption,
              infographicStatus: "queued",
              infographicTaskId: "task-long-running-123",
              infographicBackendTaskId: "backend-123",
            },
            {
              ...storyOption,
              id: "proof-trust",
              title: "Proof-Led Review",
              infographicStatus: "failed",
              infographicTaskId: "task-failed-456",
              infographicError: "Provider marked the task as failed",
            },
            { ...storyOption, id: "quick-demo", title: "Quick Demo" },
            { ...storyOption, id: "use-case-moment", title: "Use Case Moment" },
          ],
        }}
        space={featureSpace}
      />
    );

    expect(within(screen.getByTestId("production-story-option-problem-solution")).getByText(/queued/i)).toBeInTheDocument();
    expect(screen.getByText("Task task-long-running-123")).toBeInTheDocument();
    expect(screen.getByText("Provider marked the task as failed")).toBeInTheDocument();
  });

  it("auto-selects the first actionable node and exposes readable canvas controls", async () => {
    const onSelectNode = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onSelectNode={onSelectNode}
        space={featureSpace}
      />
    );

    await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith("image-node"));
    expect(screen.getByTestId("production-node-detail-panel")).toHaveTextContent("Image config node");
    expect(screen.getByRole("button", { name: /readable/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /focus/i })).toBeEnabled();
  });

  it("separates planning, workflow, and canvas display modes", () => {
    const storyOption = {
      id: "problem-solution",
      title: "Fast Problem-Solution",
      angle: "Lead with the pain point, then show product proof.",
      audience: "Marketplace shoppers",
      painPoint: "Unsure whether the product fits the room.",
      hook: "Tiny room, cleaner setup",
      sellingPoints: ["Foldable", "Space saving"],
      objectionsTrust: ["Use verified product evidence only"],
      useCase: "Small bedroom organization",
      sceneTimeline: [
        { timeRange: "0-3s", title: "Hook", detail: "Open with the cramped room problem." },
      ],
      risks: ["Claims must stay grounded."],
      sourceSignals: ["Marketplace AI insight available"],
    };
    const baseProps = {
      title: "Launch teaser",
      status: "plan_ready_for_review",
      summary: "Create a short product video using approved evidence only.",
      productionRunId: "run-feature-116",
      onTitleChange: vi.fn(),
      onSummaryChange: vi.fn(),
      onSave: vi.fn(),
      onCreateFixturePlan: vi.fn(),
      onOpenVideoShot: vi.fn(),
      space: featureSpace,
      storyConceptWizard: {
        status: "options_ready" as const,
        selectedId: "problem-solution",
        options: [storyOption],
        contextSummary: "Choose one concept before generating a fresh workflow.",
      },
    };

    const planningRender = render(<ProductionWorkspace {...baseProps} displayMode="planning" />);
    expect(screen.getByTestId("production-planning-skill-panel")).toBeInTheDocument();
    expect(screen.getByTestId("production-story-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("production-journey-stepper")).not.toBeInTheDocument();
    expect(screen.queryByTestId("react-flow-canvas")).not.toBeInTheDocument();
    planningRender.unmount();

    const workflowRender = render(<ProductionWorkspace {...baseProps} displayMode="workflow" />);
    expect(screen.getByTestId("production-journey-stepper")).toBeInTheDocument();
    expect(screen.queryByTestId("production-story-wizard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("production-planning-skill-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("react-flow-canvas")).not.toBeInTheDocument();
    workflowRender.unmount();

    render(<ProductionWorkspace {...baseProps} displayMode="canvas" />);
    expect(screen.getByTestId("production-workspace-canvas-embed")).toBeInTheDocument();
    expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("production-journey-stepper")).not.toBeInTheDocument();
    expect(screen.queryByTestId("production-planning-skill-panel")).not.toBeInTheDocument();
  });

  it("shows a focused no-project state before the canvas workspace is ready", () => {
    const onCreateFixturePlan = vi.fn();
    const onProjectSearchOpen = vi.fn();
    const onNewProject = vi.fn();
    const emptySpace: ProductionSpace = {
      ...featureSpace,
      productionRunId: "draft",
      brief: { summary: "" },
      contextAssets: [],
      productEvidenceManifest: undefined,
      shots: [],
      flowNodes: [],
      flowEdges: [],
    };

    render(
      <ProductionWorkspace
        title=""
        status="idle"
        summary=""
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onProjectSearchOpen={onProjectSearchOpen}
        onNewProject={onNewProject}
        onCreateFixturePlan={onCreateFixturePlan}
        onOpenVideoShot={() => {}}
        space={emptySpace}
      />
    );

    expect(screen.getByTestId("production-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("production-flow-canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Production project title")).toBeDisabled();
    expect(screen.getByLabelText("Production goal")).toBeDisabled();
    expect(screen.getByRole("button", { name: /open or create a project first/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /open existing project/i }));
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(onProjectSearchOpen).toHaveBeenCalledTimes(1);
    expect(onNewProject).toHaveBeenCalledTimes(1);
    expect(onCreateFixturePlan).not.toHaveBeenCalled();
  });

  it("emits the selected image generation model instead of bouncing to the previous option", () => {
    const onGenerationDefaultChange = vi.fn();
    render(
      <ProductionWorkspace
        title="Model switch"
        status="idle"
        summary="Validate model selector"
        productionRunId="run-model-switch"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        generationDefaults={{ imageModelId: "gpt-image-2-text-to-image", imageModelSource: "project_default" }}
        imageModelOptions={[
          { modelId: "gpt-image-2-text-to-image", name: "GPT Image 2 Text-to-Image", provider: "kie.ai" },
          { modelId: "google-banana-2", name: "Google Banana 2", provider: "kie.ai" },
          { modelId: "nano-banana-pro-flash", name: "Nano Banana Pro Flash", provider: "magnific" },
        ]}
        videoModelOptions={[]}
        onGenerationDefaultChange={onGenerationDefaultChange}
        space={featureSpace}
      />
    );

    const imageModelSelect = screen.getByLabelText("Default image generation model");
    expect(imageModelSelect).toHaveValue("gpt-image-2-text-to-image");
    fireEvent.change(imageModelSelect, { target: { value: "google-banana-2" } });
    expect(onGenerationDefaultChange).toHaveBeenCalledWith({
      imageModelId: "google-banana-2",
      imageModelSource: "project_default",
    });
  });

  it("keeps deferred node catalog entries visible as unavailable roadmap items", () => {
    const onAddNode = vi.fn();
    render(
      <ProductionFlowCanvas
        flowNodes={[]}
        flowEdges={[]}
        contextAssets={[]}
        onAddNode={onAddNode}
      />
    );

    expect(screen.queryByRole("button", { name: /final render/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText(/unavailable yet/i)[0]);
    expect(screen.getAllByText(/final render/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not available/i).length).toBeGreaterThan(0);
    expect(onAddNode).not.toHaveBeenCalled();
  });

  it("covers list-fallback dependency linking, duplicate-edge warnings, and valid reconnect", () => {
    const onConnectNodes = vi.fn();
    const onInvalidEdge = vi.fn();
    const onSelectNode = vi.fn();
    const onConfigureNode = vi.fn();
    const onDeleteNode = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-node"
        onSelectNode={onSelectNode}
        onConfigureNode={onConfigureNode}
        onDeleteNode={onDeleteNode}
        onConnectNodes={onConnectNodes}
        onInvalidEdge={onInvalidEdge}
        space={featureSpace}
      />
    );

    const list = screen.getByTestId("production-node-list-fallback");
    const startButtons = within(list).getAllByRole("button", { name: /start link/i });
    const connectButtons = within(list).getAllByRole("button", { name: /connect here/i });

    fireEvent.click(within(list).getByRole("button", { name: /open node image config node/i }));
    expect(onSelectNode).toHaveBeenCalledWith("image-node");
    fireEvent.click(within(list).getByRole("button", { name: /configure node image config node/i }));
    expect(onConfigureNode).toHaveBeenCalledWith("image-node");
    fireEvent.click(within(list).getByRole("button", { name: /delete node image config node/i }));
    expect(onDeleteNode).toHaveBeenCalledWith("image-node");

    fireEvent.click(startButtons[0]); // source: image-node
    fireEvent.click(connectButtons[1]); // invalid duplicate to video-node

    expect(screen.getByText("This edge already exists.")).toBeInTheDocument();
    expect(onInvalidEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "duplicate_edge",
        source: "image-node",
        target: "video-node",
      })
    );

    fireEvent.click(connectButtons[2]); // valid link to tts-node
    expect(onConnectNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "image-node-tts-node",
        source: "image-node",
        target: "tts-node",
        kind: "dependency",
      })
    );
    expect(screen.queryByText("This edge already exists.")).not.toBeInTheDocument();
  });

  it("asks before resetting the canvas and deletes every node only after confirmation", () => {
    const onDeleteNode = vi.fn();
    const onResetCanvas = vi.fn();
    const onSelectNode = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <ProductionFlowCanvas
        flowNodes={featureSpace.flowNodes}
        flowEdges={featureSpace.flowEdges}
        contextAssets={featureSpace.contextAssets}
        selectedNodeId="image-node"
        onDeleteNode={onDeleteNode}
        onResetCanvas={onResetCanvas}
        onSelectNode={onSelectNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /reset canvas/i }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Remove all 4 nodes"));
    expect(onDeleteNode).not.toHaveBeenCalled();
    expect(onResetCanvas).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /reset canvas/i }));
    expect(onResetCanvas).toHaveBeenCalledTimes(1);
    expect(onDeleteNode).not.toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith(null);

    confirmSpy.mockRestore();
  });

  it("deletes the selected canvas node with the Delete key", () => {
    const onDeleteNode = vi.fn();
    const onSelectNode = vi.fn();

    render(
      <ProductionFlowCanvas
        flowNodes={featureSpace.flowNodes}
        flowEdges={featureSpace.flowEdges}
        contextAssets={featureSpace.contextAssets}
        selectedNodeId="image-node"
        onDeleteNode={onDeleteNode}
        onSelectNode={onSelectNode}
      />
    );

    fireEvent.keyDown(window, { key: "Delete" });
    expect(onDeleteNode).toHaveBeenCalledWith("image-node");
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("shows direct tab links on each canvas node for image, video, and audio surfaces", () => {
    const onConfigureNode = vi.fn();

    render(
      <ProductionFlowCanvas
        flowNodes={featureSpace.flowNodes}
        flowEdges={featureSpace.flowEdges}
        contextAssets={featureSpace.contextAssets}
        onConfigureNode={onConfigureNode}
      />
    );

    const canvas = screen.getByTestId("react-flow-canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: /open image tab image config node/i }));
    fireEvent.click(within(canvas).getByRole("button", { name: /open video tab video config node/i }));
    fireEvent.click(within(canvas).getByRole("button", { name: /open audio tab basic tts node/i }));

    expect(onConfigureNode).toHaveBeenCalledWith("image-node");
    expect(onConfigureNode).toHaveBeenCalledWith("video-node");
    expect(onConfigureNode).toHaveBeenCalledWith("tts-node");
  });

  it("separates run-this-node, run-all, and cancellation controls", () => {
    const onRunNode = vi.fn();
    const onRunBatch = vi.fn();
    const onCancelExecution = vi.fn();
    const onCancelNodeExecution = vi.fn();
    const onOpenNodeOutput = vi.fn();

    const { rerender } = render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-node"
        onRunNode={onRunNode}
        onRunBatch={onRunBatch}
        onCancelExecution={onCancelExecution}
        onCancelNodeExecution={onCancelNodeExecution}
        onOpenNodeOutput={onOpenNodeOutput}
        space={featureSpace}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /view output/i })[0]);
    expect(onOpenNodeOutput).toHaveBeenCalledWith("image-node", "out-image");

    fireEvent.click(screen.getAllByRole("button", { name: /run this node/i })[0]);
    expect(onRunNode).toHaveBeenCalledWith("image-node");

    fireEvent.click(screen.getByRole("button", { name: /generate ready nodes/i }));
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /cancel running work/i })).toBeDisabled();

    const runningSpace: ProductionSpace = {
      ...featureSpace,
      flowNodes: featureSpace.flowNodes.map((node) => node.id === "image-node" ? { ...node, status: "running" } : node),
      actionAttempts: [
        {
          attemptId: "attempt-image-node",
          kind: "generate",
          scope: "node",
          status: "running",
          nodeIds: ["image-node"],
          shotIds: ["shot-1"],
          idempotencyKey: "attempt-key",
          expectedSpaceVersion: 7,
          creditEstimate: 4,
          creditReserved: 4,
          creditSpent: 0,
          creditRefunded: 0,
          mediaTaskIds: ["media-task-1"],
          providerTaskIds: ["provider-task-1"],
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:00.000Z",
        },
      ],
    };

    rerender(
      <ProductionWorkspace
        title="Launch teaser"
        status="final_generating"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-node"
        onRunNode={onRunNode}
        onRunBatch={onRunBatch}
        onCancelExecution={onCancelExecution}
        onCancelNodeExecution={onCancelNodeExecution}
        space={runningSpace}
      />
    );

    expect(screen.getByRole("button", { name: /generate ready nodes/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /cancel running work/i }));
    expect(onCancelExecution).toHaveBeenCalledWith("attempt-image-node");

    fireEvent.click(screen.getAllByRole("button", { name: /cancel node/i })[0]);
    expect(onCancelNodeExecution).toHaveBeenCalledWith("image-node");
  });

  it("shows prompt-node outputs, attached media details, and regenerate controls in-node", () => {
    const onRunNode = vi.fn();
    const onOpenNodeOutput = vi.fn();
    const promptSpace: ProductionSpace = {
      ...featureSpace,
      flowNodes: [
        {
          id: "image-prompt-node",
          kind: "prompt_packaging",
          title: "Image prompt agent",
          status: "completed",
          position: { x: 0, y: 0 },
          referenceInputs: [
            {
              id: "asset-scene-1",
              kind: "reference_image",
              title: "Bedroom scene reference",
              source: "asset-library",
              thumbnailUrl: "https://example.test/scene-thumb.jpg",
              url: "https://example.test/scene.jpg",
            },
          ],
          metadata: {
            objective: "Prepare an image generation prompt for the selected shot.",
            expectedOutput: "image prompt ready for downstream generation.",
          },
          outputRefs: [
            {
              outputRefId: "out-image-prompt",
              nodeId: "image-prompt-node",
              kind: "manifest",
              metadata: {
                text: "IMAGE PROMPT\nHero product in a calm bedroom, faithful to product evidence.",
                generatedPrompt: "Hero product in a calm bedroom, faithful to product evidence.",
              },
            },
          ],
        },
        {
          id: "image-generate-node",
          kind: "image_generate",
          title: "Image generate output",
          status: "ready",
          position: { x: 260, y: 0 },
          configSnapshot: {
            snapshotId: "snap-image-generate",
            version: 1,
            toolSurface: "image",
            adapter: "image",
            config: { prompt: "Hero product in a calm bedroom" },
            configHash: "image-generate-hash",
          },
        },
      ],
      flowEdges: [
        {
          id: "prompt-to-image",
          source: "image-prompt-node",
          target: "image-generate-node",
          kind: "dependency",
        },
      ],
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-prompt-node"
        onRunNode={onRunNode}
        onOpenNodeOutput={onOpenNodeOutput}
        space={promptSpace}
      />
    );

    expect(screen.getByTestId("production-next-action-compact")).toHaveTextContent(/output is ready to review/i);
    expect(screen.getByTestId("production-next-action")).toHaveTextContent(/output is ready to review/i);
    expect(screen.getByTestId("production-node-detail-panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prompt/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /references/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /outputs/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /run log/i })).toBeInTheDocument();
    expect(screen.getAllByText(/node work/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/feeds/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /run only node image prompt agent/i })[0]);
    expect(onRunNode).toHaveBeenCalledWith("image-prompt-node");
    expect(screen.getAllByText("Regenerate")[0]).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /details/i })[0]);
    expect(screen.getAllByText(/prepare an image generation prompt/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/image prompt ready for downstream generation/i)[0]).toBeInTheDocument();
    expect(screen.getByText("Attached media")).toBeInTheDocument();
    expect(screen.getByText("Bedroom scene reference")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /output/i })[0]);
    expect(onOpenNodeOutput).toHaveBeenCalledWith("image-prompt-node", "out-image-prompt");
  });

  it("surfaces node retry controls for failed configured nodes", () => {
    const onRetryNode = vi.fn();
    const failedSpace: ProductionSpace = {
      ...featureSpace,
      flowNodes: featureSpace.flowNodes.map((node) => node.id === "video-node" ? { ...node, status: "failed", readinessIssues: [] } : node),
    };

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="video-node"
        onRetryNode={onRetryNode}
        space={failedSpace}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0]);
    expect(onRetryNode).toHaveBeenCalledWith("video-node");
  });

  it("disables node execution until a supported node has a ready config snapshot", () => {
    const onRunNode = vi.fn();
    const spaceWithDraftNode: ProductionSpace = {
      ...featureSpace,
      flowNodes: [
        ...featureSpace.flowNodes,
        {
          id: "draft-image",
          kind: "image",
          title: "Draft image node",
          status: "draft",
          position: { x: 880, y: 0 },
        },
      ],
    };

    const { rerender } = render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="draft-image"
        onRunNode={onRunNode}
        space={spaceWithDraftNode}
      />
    );

    expect(screen.getAllByRole("button", { name: /run this node/i })[0]).toBeDisabled();

    rerender(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="video-node"
        onRunNode={onRunNode}
        space={featureSpace}
      />
    );

    expect(screen.getAllByRole("button", { name: /run this node/i })[0]).toBeDisabled();
  });

  it("exposes approved downstream handoff actions in the main production workspace", () => {
    const onSendStoryboardReview = vi.fn();
    const onSendVideoEdit = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        onSendStoryboardReview={onSendStoryboardReview}
        onSendVideoEdit={onSendVideoEdit}
        space={featureSpace}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /send to storyboard review/i }));
    fireEvent.click(screen.getByRole("button", { name: /open in video edit/i }));
    expect(onSendStoryboardReview).toHaveBeenCalledTimes(1);
    expect(onSendVideoEdit).toHaveBeenCalledTimes(1);
  });

  it("captures Node Config Save-to-Node behavior and JSON validation guards", () => {
    const onSaveNodeConfig = vi.fn();
    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="video-node"
        onSaveNodeConfig={onSaveNodeConfig}
        space={featureSpace}
      />
    );

    fireEvent.change(screen.getByLabelText("Config JSON"), { target: { value: "{invalid-json" } });
    fireEvent.click(screen.getByRole("button", { name: /save to node/i }));
    expect(screen.getByText(/(Expected property name|Unexpected token).*JSON/i)).toBeInTheDocument();
    expect(onSaveNodeConfig).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Node title"), {
      target: { value: "Updated video node" },
    });
    fireEvent.change(screen.getByLabelText("Config JSON"), { target: { value: "{\"durationSeconds\":12}" } });
    fireEvent.change(screen.getByLabelText("Adapter"), { target: { value: "video" } });
    fireEvent.click(screen.getByRole("button", { name: /save to node/i }));

    expect(onSaveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "video-node",
        title: "Updated video node",
        adapter: "video",
        toolSurface: "video",
        config: { durationSeconds: 12 },
        manuallyEdited: true,
      })
    );
  });

  it("covers production workspace state placeholders with action callbacks", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        workspaceViewState="loading"
      />
    );
    expect(screen.getByTestId("production-workspace-state-loading")).toBeInTheDocument();

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        workspaceViewState="error"
        workspaceStateMessage="workspace load failed"
        workspaceStatePrimaryLabel="Retry workspace"
        onWorkspacePrimaryAction={onPrimary}
      />
    );
    expect(screen.getByTestId("production-workspace-state-error")).toBeInTheDocument();
    expect(screen.getByText("workspace load failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry workspace/i }));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        workspaceViewState="conflict"
        workspaceStateMessage="stale workspace"
        workspaceStatePrimaryLabel="Reload latest"
        workspaceStateSecondaryLabel="Save as draft"
        onWorkspacePrimaryAction={onPrimary}
        onWorkspaceSecondaryAction={onSecondary}
      />
    );
    expect(screen.getByTestId("production-workspace-state-conflict")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload latest/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reload latest/i }));
    expect(onPrimary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /save as draft/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    expect(onSecondary).toHaveBeenCalledTimes(1);

    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        workspaceViewState="feature_disabled"
        workspaceStateMessage="feature guard is active"
        workspaceStatePrimaryLabel="Open feature controls"
        onWorkspacePrimaryAction={onPrimary}
      />
    );
    expect(screen.getByTestId("production-workspace-state-disabled")).toBeInTheDocument();
    expect(screen.getByText("feature guard is active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open feature controls/i }));
    expect(onPrimary).toHaveBeenCalledTimes(3);
  });

  it("captures context-asset and product-evidence attachment states", () => {
    const onAssetAssignToNode = vi.fn();
    const onAssetAddToCanvas = vi.fn();

    const renderResult = render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-node"
        onAssetAssignToNode={onAssetAssignToNode}
        onAssetAddToCanvas={onAssetAddToCanvas}
        space={featureSpace}
      />
    );

    const contextAssetBoard = screen.getByTestId("context-asset-board");
    expect(within(contextAssetBoard).getByText("Normal moodboard frame")).toBeInTheDocument();
    fireEvent.click(within(contextAssetBoard).getAllByRole("button", { name: /use as scene/i })[0]);
    expect(onAssetAddToCanvas).toHaveBeenCalledWith(expect.objectContaining({ id: "asset-normal-1" }));
    expect(onAssetAssignToNode).not.toHaveBeenCalled();

    expect(within(contextAssetBoard).getByText(/current destination: image config node/i)).toBeInTheDocument();
    fireEvent.click(within(contextAssetBoard).getAllByTestId("context-asset-attach-selected-node")[0]);
    expect(onAssetAssignToNode).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: expect.objectContaining({ id: "asset-normal-1" }),
        nodeId: "image-node",
      })
    );

    const disabledEvidenceButton = within(screen.getByTestId("product-evidence-tray")).getAllByRole("button", { name: /add to node/i })[0];
    expect(disabledEvidenceButton).toBeDisabled();

    renderResult.rerender(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={() => {}}
        onOpenVideoShot={() => {}}
        selectedNodeId="image-node"
        onAssetAssignToNode={onAssetAssignToNode}
        onAssetAddToCanvas={onAssetAddToCanvas}
        space={featureSpaceWithMatchableProduct}
      />
    );
    const enabledEvidenceButton = within(screen.getByTestId("product-evidence-tray")).getByRole("button", { name: /add to node/i });
    fireEvent.click(enabledEvidenceButton);
    expect(onAssetAssignToNode).toHaveBeenLastCalledWith(
      expect.objectContaining({
        asset: expect.objectContaining({ id: "product-asset-match" }),
        nodeId: "image-node",
      })
    );
  });

  it("captures no-shot Video Shot workspace state and returns to production", () => {
    const onBackToProduction = vi.fn();
    const noShotsSpace: ProductionSpace = {
      ...featureSpace,
      shots: [],
      flowNodes: [],
      flowEdges: [],
    };

    render(
      <VideoShotWorkspace
        space={noShotsSpace}
        selectedShotId={null}
        onBackToProduction={onBackToProduction}
      />
    );

    expect(screen.getByText("No shots yet.")).toBeInTheDocument();
    expect(screen.getByText("No shot selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to production/i }));
    expect(onBackToProduction).toHaveBeenCalledTimes(1);
  });

  it("captures Video Shot edit actions for save/duplicate/split/lock", () => {
    const onSaveShot = vi.fn();
    const onDuplicateShot = vi.fn();
    const onSplitShot = vi.fn();
    const onToggleShotLock = vi.fn();
    const onSelectShot = vi.fn();
    const onDeleteShot = vi.fn();
    const onReorderShot = vi.fn();
    const onMergeShot = vi.fn();
    const onOpenShot = vi.fn();
    const onConfigureShot = vi.fn();
    const onUpdateStoryboardPrompt = vi.fn();
    const onStoryboardReferenceSkillChange = vi.fn();
    const onGenerateShotReferencePrompt = vi.fn();
    const onGenerateShotStoryboardGridImage = vi.fn();
    const onOpenShotStoryboardGridSplit = vi.fn();
    const onAssignShotMediaSlot = vi.fn();
    const onGenerateShotVideo = vi.fn();

    render(
      <VideoShotWorkspace
        space={featureSpaceTwoShots}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
        onSaveShot={onSaveShot}
        onDuplicateShot={onDuplicateShot}
        onSplitShot={onSplitShot}
        onSelectShot={onSelectShot}
        onToggleShotLock={onToggleShotLock}
        onDeleteShot={onDeleteShot}
        onReorderShot={onReorderShot}
        onMergeShot={onMergeShot}
        onOpenShot={onOpenShot}
        onConfigureShot={onConfigureShot}
        onUpdateStoryboardPrompt={onUpdateStoryboardPrompt}
        storyboardReferenceSkillId="furniture-reference-storyboard"
        storyboardReferenceSkillOptions={[
          { id: "furniture-reference-storyboard", label: "Furniture Reference Storyboard" },
          { id: "cosmatic-reference-storyboard", label: "Cosmatic Reference Storyboard" },
        ]}
        onStoryboardReferenceSkillChange={onStoryboardReferenceSkillChange}
        onGenerateShotReferencePrompt={onGenerateShotReferencePrompt}
        onGenerateShotStoryboardGridImage={onGenerateShotStoryboardGridImage}
        onOpenShotStoryboardGridSplit={onOpenShotStoryboardGridSplit}
        onAssignShotMediaSlot={onAssignShotMediaSlot}
        onGenerateShotVideo={onGenerateShotVideo}
      />
    );

    expect(screen.getByTestId("video-shot-storyboard-cards")).toHaveTextContent("Full storyboard prompt cards");
    fireEvent.change(screen.getByLabelText("3x3 storyboard image prompt skill"), { target: { value: "cosmatic-reference-storyboard" } });
    expect(onStoryboardReferenceSkillChange).toHaveBeenCalledWith("cosmatic-reference-storyboard");
	    expect(screen.getByTestId("video-shot-storyboard-card-shot-1")).toHaveTextContent("Drop a video here");
	    expect(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).queryByLabelText("Image prompt")).not.toBeInTheDocument();
	    expect(screen.getByLabelText("Video prompt speech mode")).toHaveValue("none");
	    expect(screen.getByLabelText("Video prompt tone")).toHaveValue("sales");
	    fireEvent.change(screen.getByLabelText("Video prompt speech mode"), { target: { value: "th" } });
	    fireEvent.change(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByLabelText("3x3 storyboard image prompt"), { target: { value: "Updated reference prompt for card" } });
    fireEvent.click(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByRole("button", { name: /save this card/i }));
    expect(onUpdateStoryboardPrompt).toHaveBeenCalledWith("shot-1", expect.objectContaining({ referenceStoryboardPrompt: "Updated reference prompt for card", storyboardGridPrompt: "Updated reference prompt for card" }));
    fireEvent.click(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByRole("button", { name: /generate 3x3 image/i }));
    expect(onGenerateShotStoryboardGridImage).toHaveBeenCalledWith("shot-1", "furniture-reference-storyboard", expect.objectContaining({ referenceStoryboardPrompt: "Updated reference prompt for card" }));
    fireEvent.click(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByRole("button", { name: /generate video/i }));
	    expect(onGenerateShotVideo).toHaveBeenCalledWith("shot-1", "furniture-reference-storyboard", expect.any(Object));
	    fireEvent.click(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByRole("button", { name: /skill prompt/i }));
	    expect(onGenerateShotReferencePrompt).toHaveBeenCalledWith("shot-1", "furniture-reference-storyboard", expect.objectContaining({
	      promptSpeechMode: "th",
	      promptSpeechLanguage: "Thai",
	      promptIncludeSound: false,
	      promptTone: "sales",
	      referenceStoryboardPrompt: "Updated reference prompt for card",
	    }));

    expect(screen.getByText("Hook")).toBeInTheDocument();
    expect(screen.getByText("Image config node")).toBeInTheDocument();
    expect(screen.getByText("Video config node")).toBeInTheDocument();
    expect(screen.getByText("Basic TTS node")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Shot title"), { target: { value: "Hook updated" } });
    fireEvent.click(screen.getByRole("button", { name: /save shot/i }));
    expect(onSaveShot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "shot-1",
        title: "Hook updated",
        status: "ready",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /duplicate/i }));
    expect(onDuplicateShot).toHaveBeenCalledWith("shot-1");
    fireEvent.click(screen.getByRole("button", { name: /split/i }));
    expect(onSplitShot).toHaveBeenCalledWith("shot-1");
    fireEvent.click(screen.getAllByRole("button", { name: /^Open$/i })[0]);
    expect(onOpenShot).toHaveBeenCalledWith("shot-1");
    expect(onSelectShot).toHaveBeenCalledWith("shot-1");
    fireEvent.click(screen.getByTestId("video-shot-list-item-shot-2"));
    expect(onSelectShot).toHaveBeenCalledWith("shot-2");
    fireEvent.click(screen.getAllByRole("button", { name: /^Configure$/i })[0]);
    expect(onConfigureShot).toHaveBeenCalledWith("shot-1");
    fireEvent.click(screen.getAllByRole("button", { name: /^Delete$/i })[0]);
    expect(onDeleteShot).toHaveBeenCalledWith("shot-1");
    fireEvent.click(screen.getAllByRole("button", { name: /^Move down$/i })[0]);
    expect(onReorderShot).toHaveBeenLastCalledWith("shot-1", "down");
    fireEvent.click(screen.getAllByRole("button", { name: /^Move up$/i })[1]);
    expect(onReorderShot).toHaveBeenCalledWith("shot-2", "up");
    fireEvent.click(screen.getAllByRole("button", { name: /^Merge next$/i })[0]);
    expect(onMergeShot).toHaveBeenCalledWith("shot-1", "shot-2");

    fireEvent.click(screen.getByRole("button", { name: /^Lock$/i }));
    expect(onToggleShotLock).toHaveBeenCalledWith("shot-1", true);
    expect(screen.getByRole("button", { name: /save shot/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /split/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    expect(onToggleShotLock).toHaveBeenCalledWith("shot-1", false);
  });

  it("assigns split storyboard frames and generated videos by drag and drop", async () => {
    const onAssignShotMediaSlot = vi.fn();
    const spaceWithGridFrames: ProductionSpace = {
      ...featureSpaceTwoShots,
      flowNodes: [
        ...featureSpaceTwoShots.flowNodes,
        {
          id: "storyboard-card",
          kind: "storyboard_planning" as const,
          title: "Storyboard prompt card",
          status: "ready" as const,
          position: { x: 0, y: 0 },
          metadata: {
            storyboardPrompts: [
              {
                shotId: "shot-1",
                order: 1,
                title: "Hook",
                storyboardGridPrompt: "Grid prompt",
                storyboardGridImageUrl: "https://example.test/storyboard-grid.jpg",
                storyboardGridImageResolution: "4K",
                storyboardGridFrames: [
                  { index: 0, row: 0, col: 0, url: "https://example.test/frame-1.jpg", name: "Frame 1" },
                ],
              },
            ],
          },
        },
      ],
    };
    const createDataTransfer = (files: File[] = []) => {
      const store = new Map<string, string>();
      return {
        effectAllowed: "",
        dropEffect: "",
        files,
        setData: vi.fn((type: string, value: string) => store.set(type, value)),
        getData: vi.fn((type: string) => store.get(type) ?? ""),
      };
    };
    const onUploadShotMediaFile = vi.fn(async () => ({
      url: "https://example.test/uploaded-shot.mp4",
      mediaType: "video" as const,
      name: "uploaded-shot.mp4",
      source: "uploaded_file",
    }));

    render(
      <VideoShotWorkspace
        space={spaceWithGridFrames}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
        onAssignShotMediaSlot={onAssignShotMediaSlot}
        onUploadShotMediaFile={onUploadShotMediaFile}
      />
    );

    const card = screen.getByTestId("video-shot-storyboard-card-shot-1");
	    const frameTransfer = createDataTransfer();
	    fireEvent.dragStart(within(card).getByTitle("Drag frame 1"), { dataTransfer: frameTransfer });
	    fireEvent.drop(within(card).getByTestId("story-card-shot-1-start-frame"), { dataTransfer: frameTransfer });
	    expect(onAssignShotMediaSlot).toHaveBeenCalledWith("shot-1", "start", expect.objectContaining({
	      url: "https://example.test/frame-1.jpg",
	      mediaType: "image",
	      source: "storyboard_grid_frame",
	    }));

	    const referenceTransfer = createDataTransfer();
	    referenceTransfer.setData("application/x-production-asset-json", JSON.stringify({
	      id: "asset-reference-image",
	      kind: "reference_image",
	      title: "Reference asset",
	      url: "https://cdn.example.test/reference-asset",
	    }));
	    fireEvent.drop(within(card).getByTestId("story-card-shot-1-reference-image"), { dataTransfer: referenceTransfer });
	    expect(onAssignShotMediaSlot).toHaveBeenCalledWith("shot-1", "reference", expect.objectContaining({
	      url: "https://cdn.example.test/reference-asset",
	      mediaType: "image",
	      name: "Reference asset",
	      source: "production_asset",
	    }));

	    const stopTransfer = createDataTransfer();
	    stopTransfer.setData("text/x-smartspec-media-type", "image");
	    stopTransfer.setData("text/plain", "https://cdn.example.test/stop-frame");
	    fireEvent.drop(within(card).getByTestId("story-card-shot-1-stop-frame"), { dataTransfer: stopTransfer });
	    expect(onAssignShotMediaSlot).toHaveBeenCalledWith("shot-1", "stop", expect.objectContaining({
	      url: "https://cdn.example.test/stop-frame",
	      mediaType: "image",
	    }));

	    const videoTransfer = createDataTransfer();
	    videoTransfer.setData("application/x-smartspec-media-type", "video");
	    videoTransfer.setData("text/plain", "https://example.test/generated-shot.mp4");
	    fireEvent.drop(within(card).getByTestId("story-card-shot-1-video"), { dataTransfer: videoTransfer });
    expect(onAssignShotMediaSlot).toHaveBeenCalledWith("shot-1", "video", expect.objectContaining({
      url: "https://example.test/generated-shot.mp4",
	      mediaType: "video",
	    }));

    const mp4File = new File(["video-bytes"], "uploaded-shot.mp4", { type: "video/mp4" });
    const mp4Transfer = createDataTransfer([mp4File]);
    fireEvent.drop(within(card).getByTestId("story-card-shot-1-video"), { dataTransfer: mp4Transfer });
    await waitFor(() => {
      expect(onUploadShotMediaFile).toHaveBeenCalledWith(mp4File, "shot-1", "video");
      expect(onAssignShotMediaSlot).toHaveBeenCalledWith("shot-1", "video", expect.objectContaining({
        url: "https://example.test/uploaded-shot.mp4",
        mediaType: "video",
        source: "uploaded_file",
      }));
    });
	  });

  it("exposes combine videos action for ready Video Shot clips", () => {
    const onCompoundShotVideos = vi.fn();
    const spaceWithShotVideos: ProductionSpace = {
      ...featureSpaceTwoShots,
      flowNodes: [
        ...featureSpaceTwoShots.flowNodes,
        {
          id: "storyboard-card",
          kind: "storyboard_planning" as const,
          title: "Storyboard prompt card",
          status: "ready" as const,
          position: { x: 0, y: 0 },
          metadata: {
            storyboardPrompts: [
              { shotId: "shot-1", order: 1, title: "Hook", videoUrl: "https://example.test/shot-1.mp4" },
              { shotId: "shot-2", order: 2, title: "Proof", videoUrl: "https://example.test/shot-2.mp4" },
            ],
          },
        },
      ],
    };

    render(
      <VideoShotWorkspace
        space={spaceWithShotVideos}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
        onCompoundShotVideos={onCompoundShotVideos}
      />
    );

    const combineButton = screen.getByRole("button", { name: /combine videos \(2\)/i });
    expect(combineButton).toBeEnabled();
    fireEvent.click(combineButton);
    expect(onCompoundShotVideos).toHaveBeenCalledTimes(1);
  });

  it("renders assigned media slot URLs over older generated node outputs", () => {
    const spaceWithAssignedSlots: ProductionSpace = {
      ...featureSpaceTwoShots,
      shots: [
        {
          ...featureSpaceTwoShots.shots[0],
          nodeIds: [
            ...(featureSpaceTwoShots.shots[0]?.nodeIds ?? []),
            "shot-1-reference-image",
            "shot-1-start-frame",
            "shot-1-stop-frame",
            "shot-1-video-output",
          ],
        },
        ...featureSpaceTwoShots.shots.slice(1),
      ],
      flowNodes: [
        ...featureSpaceTwoShots.flowNodes,
        {
          id: "shot-1-reference-image",
          kind: "image" as const,
          title: "Old reference image",
          status: "completed" as const,
          shotId: "shot-1",
          position: { x: 0, y: 0 },
          metadata: { frameRole: "reference" },
          outputRefs: [{ outputRefId: "old-reference", nodeId: "shot-1-reference-image", kind: "image", url: "https://cdn.example.test/old-reference.png", metadata: { frameRole: "reference" } }],
        },
        {
          id: "shot-1-start-frame",
          kind: "image" as const,
          title: "Old start frame",
          status: "completed" as const,
          shotId: "shot-1",
          position: { x: 0, y: 0 },
          metadata: { frameRole: "start" },
          outputRefs: [{ outputRefId: "old-start", nodeId: "shot-1-start-frame", kind: "image", url: "https://cdn.example.test/old-start.png", metadata: { frameRole: "start" } }],
        },
        {
          id: "shot-1-stop-frame",
          kind: "image" as const,
          title: "Old stop frame",
          status: "completed" as const,
          shotId: "shot-1",
          position: { x: 0, y: 0 },
          metadata: { frameRole: "stop" },
          outputRefs: [{ outputRefId: "old-stop", nodeId: "shot-1-stop-frame", kind: "image", url: "https://cdn.example.test/old-stop.png", metadata: { frameRole: "stop" } }],
        },
        {
          id: "shot-1-video-output",
          kind: "video" as const,
          title: "Old shot video",
          status: "completed" as const,
          shotId: "shot-1",
          position: { x: 0, y: 0 },
          outputRefs: [{ outputRefId: "old-video", nodeId: "shot-1-video-output", kind: "video", url: "https://cdn.example.test/old-video.mp4" }],
        },
        {
          id: "storyboard-card",
          kind: "storyboard_planning" as const,
          title: "Storyboard prompt card",
          status: "ready" as const,
          position: { x: 0, y: 0 },
          metadata: {
            storyboardPrompts: [
              {
                shotId: "shot-1",
                order: 1,
                title: "Hook",
                referenceImageUrl: "https://cdn.example.test/manual-reference.png",
                startFrameUrl: "https://cdn.example.test/manual-start.png",
                stopFrameUrl: "https://cdn.example.test/manual-stop.png",
                videoUrl: "https://cdn.example.test/manual-video.mp4",
              },
            ],
          },
        },
      ],
    };

    render(
      <VideoShotWorkspace
        space={spaceWithAssignedSlots}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
      />
    );

    const card = screen.getByTestId("video-shot-storyboard-card-shot-1");
    expect(within(card).getByTestId("story-card-shot-1-reference-image").querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.test/manual-reference.png");
    expect(within(card).getByTestId("story-card-shot-1-start-frame").querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.test/manual-start.png");
    expect(within(card).getByTestId("story-card-shot-1-stop-frame").querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.test/manual-stop.png");
    expect(within(card).getByTestId("story-card-shot-1-video").querySelector("video")?.getAttribute("src")).toBe("https://cdn.example.test/manual-video.mp4");
  });

	  it("keeps generated storyboard media scoped to the correct shot across three shots", () => {
    const threeShotSpace: ProductionSpace = {
      ...featureSpace,
      shots: [
        { id: "shot-1", title: "Hook", order: 1, durationSeconds: 8, nodeIds: ["shot-1-group", "shot-1-reference-image"], status: "ready" },
        { id: "shot-2", title: "Problem", order: 2, durationSeconds: 8, nodeIds: ["shot-2-group", "shot-2-reference-image"], status: "ready" },
        { id: "shot-3", title: "Solution", order: 3, durationSeconds: 8, nodeIds: ["shot-3-group", "shot-3-reference-image"], status: "ready" },
      ],
      flowNodes: [
        {
          id: "storyboard-card",
          kind: "storyboard_planning",
          title: "Storyboard",
          status: "ready",
          position: { x: 0, y: 0 },
          configSnapshot: {
            snapshotId: "storyboard-snap",
            version: 1,
            toolSurface: "production",
            adapter: "storyboard",
            config: {
              storyboardPrompts: [
                { shotId: "shot-1", order: 1, title: "Hook", referenceStoryboardPrompt: "Prompt 1" },
                { shotId: "shot-2", order: 2, title: "Problem", referenceStoryboardPrompt: "Prompt 2" },
                { shotId: "shot-3", order: 3, title: "Solution", referenceStoryboardPrompt: "Prompt 3" },
              ],
            },
            configHash: "storyboard-hash",
          },
        },
        ...["shot-1", "shot-2", "shot-3"].flatMap((shotId, index) => [
          {
            id: `${shotId}-group`,
            kind: "video_shot" as const,
            title: `Shot ${index + 1}`,
            status: "ready" as const,
            shotId,
            position: { x: 100, y: index * 100 },
          },
          {
            id: `${shotId}-reference-image`,
            kind: "image_generate" as const,
            title: `Shot ${index + 1} reference`,
            status: "completed" as const,
            shotId,
            position: { x: 200, y: index * 100 },
            outputRefs: [
              {
                outputRefId: `out-${shotId}-reference`,
                nodeId: `${shotId}-reference-image`,
                kind: "image" as const,
                url: `https://example.test/${shotId}-reference.png`,
                thumbnailUrl: `https://example.test/${shotId}-reference-thumb.png`,
                metadata: { frameRole: "reference" },
              },
            ],
            configSnapshot: {
              snapshotId: `${shotId}-reference-snap`,
              version: 1,
              toolSurface: "image" as const,
              adapter: "image",
              config: { frameRole: "reference" },
              configHash: `${shotId}-reference-hash`,
            },
          },
        ]),
      ],
      flowEdges: [],
    };

    render(
      <VideoShotWorkspace
        space={threeShotSpace}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
      />
    );

    for (const shotId of ["shot-1", "shot-2", "shot-3"]) {
      const card = screen.getByTestId(`video-shot-storyboard-card-${shotId}`);
      const image = within(card)
        .getByTestId(`story-card-${shotId}-reference-image`)
        .querySelector("img");
      expect(image).toHaveAttribute("src", `https://example.test/${shotId}-reference.png`);
      for (const otherShotId of ["shot-1", "shot-2", "shot-3"].filter((id) => id !== shotId)) {
        expect(card.innerHTML).not.toContain(`https://example.test/${otherShotId}-reference.png`);
      }
    }
  });

  it("deduplicates shot reference images restored from product evidence and context assets", () => {
    const duplicateUrl = "https://example.test/reference-product.png";
    const spaceWithDuplicateReference: ProductionSpace = {
      ...featureSpace,
      contextAssets: [
        {
          id: "right-panel-product-reference",
          kind: "marketplace_product",
          title: "Product reference from context",
          source: "right-panel",
          url: duplicateUrl,
          thumbnailUrl: duplicateUrl,
          zone: "products",
        },
        {
          id: "scene-reference",
          kind: "reference_image",
          title: "Scene reference",
          source: "library",
          url: "https://example.test/scene.png",
          thumbnailUrl: "https://example.test/scene.png",
          zone: "scene_mood",
        },
      ],
      productEvidenceManifest: {
        ...featureSpace.productEvidenceManifest!,
        products: [
          {
            ...featureSpace.productEvidenceManifest!.products[0],
            id: "right-panel-product-reference",
            imageUrl: duplicateUrl,
          },
        ],
      },
    };

    render(
      <VideoShotWorkspace
        space={spaceWithDuplicateReference}
        selectedShotId="shot-1"
        onBackToProduction={() => {}}
      />,
    );

    expect(within(screen.getByTestId("video-shot-storyboard-card-shot-1")).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Shot references").parentElement).toHaveTextContent("2");
  });

  it("captures ProductEvidenceTray role/claim/evidence controls", () => {
    const onSetProductRole = vi.fn();
    const onSetClaimStatus = vi.fn();
    const onOpenEvidence = vi.fn();
    const onRemoveEvidenceFromClaim = vi.fn();
    const onAddProductAsset = vi.fn();

    render(
      <ProductEvidenceTray
        manifest={featureSpaceWithMatchableProduct.productEvidenceManifest}
        contextAssets={featureSpaceWithMatchableProduct.contextAssets}
        selectedNodeId="image-node"
        locale="en"
        onSetProductRole={onSetProductRole}
        onSetClaimStatus={onSetClaimStatus}
        onOpenEvidence={onOpenEvidence}
        onRemoveEvidenceFromClaim={onRemoveEvidenceFromClaim}
        onAddProductAsset={onAddProductAsset}
      />,
    );

    fireEvent.change(screen.getByLabelText("set role for Evidence-backed product"), { target: { value: "hero" } });
    expect(onSetProductRole).toHaveBeenCalledWith("product-1", "hero");

    fireEvent.change(screen.getByLabelText("set claim status claim-speed"), { target: { value: "blocked" } });
    expect(onSetClaimStatus).toHaveBeenCalledWith("product-1", "claim-speed", "blocked");

    fireEvent.click(screen.getByRole("button", { name: /^Open$/i }));
    expect(onOpenEvidence).toHaveBeenCalledWith("evidence-1");

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    expect(onRemoveEvidenceFromClaim).toHaveBeenCalledWith("product-1", "claim-speed", "evidence-1");

    fireEvent.click(screen.getByRole("button", { name: /add to node/i }));
    expect(onAddProductAsset).toHaveBeenCalledWith(expect.objectContaining({ id: "product-asset-match" }), "image-node");
  });

  it("renders the Video Shot workspace with selected shot child-node contracts and back navigation", () => {
    const onBackToProduction = vi.fn();

    render(
      <VideoShotWorkspace
        space={featureSpace}
        selectedShotId="shot-1"
        onBackToProduction={onBackToProduction}
      />
    );

    expect(screen.getByTestId("video-shot-workspace")).toBeInTheDocument();
    expect(screen.getByText("Image config node")).toBeInTheDocument();
    expect(screen.getByText("Video config node")).toBeInTheDocument();
    expect(screen.getByText("Basic TTS node")).toBeInTheDocument();
    expect(screen.getByText("image")).toBeInTheDocument();
    expect(screen.getByText("video")).toBeInTheDocument();
    expect(screen.getByText("tts")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to production/i }));
    expect(onBackToProduction).toHaveBeenCalledTimes(1);
  });

  it("captures ProductionFlowCanvas empty and fallback list states", () => {
    render(
      <ProductionFlowCanvas
        flowNodes={[]}
        flowEdges={[]}
        contextAssets={[]}
      />
    );

    expect(screen.getByText("No nodes yet. Use the drawer to add the first node.")).toBeInTheDocument();
    expect(screen.getByText("No nodes to list.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /start link/i })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /connect here/i })).toHaveLength(0);
  });

  it("keeps the documented evidence command wired to this deterministic gate", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(testDir, "../../../../../..");
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "apps/web/package.json"), "utf8")
    );
    const evidence = fs.readFileSync(
      path.join(
        repoRoot,
        "specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md"
      ),
      "utf8"
    );
    const usage = fs.readFileSync(
      path.join(
        repoRoot,
        "specs/feature/116-production-director-node-canvas/implementation/usage.md"
      ),
      "utf8"
    );
    const mediaStudioSource = fs.readFileSync(
      path.join(repoRoot, "apps/web/client/src/pages/MediaStudio.tsx"),
      "utf8"
    );

    expect(packageJson.scripts["e2e:production-director"]).toBe(
      "JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run client/src/features/media-production/production-director.e2e.test.tsx"
    );
    expect(evidence).toContain(
      "npm --prefix apps/web run e2e:production-director"
    );
    expect(evidence).toContain("Vitest/jsdom deterministic evidence");
    expect(usage).toContain(
      "npm --prefix apps/web run e2e:production-director"
    );
    expect(mediaStudioSource).toContain("normalizeTaskMediaUrl(run.thumbnailUrl)");
    expect(mediaStudioSource).toContain("window.confirm(");
  });

  it("covers planning state action gating without browser automation", () => {
    render(
      <ProductionWorkspace
        title="Launch teaser"
        status="plan_ready_for_review"
        summary="Create a short product video using approved evidence only."
        productionRunId="run-feature-116"
        onTitleChange={() => {}}
        onSummaryChange={() => {}}
        onSave={() => {}}
        onCreateFixturePlan={vi.fn()}
        onOpenVideoShot={() => {}}
        isPlanning
      />
    );

    const planningButton = screen.getByRole("button", { name: /^Preparing\.\.\.$/ });
    expect(planningButton).toHaveTextContent("Preparing...");
    expect(planningButton).toBeDisabled();
  });
});
