/**
 * @vitest-environment jsdom
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
        approvalState: "approved",
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
        space={featureSpace}
      />
    );

    expect(screen.getByTestId("production-workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Production project title")).toHaveValue("Launch teaser");
    expect(screen.getByLabelText("Production goal")).toHaveValue("Create a short product video using approved evidence only.");
    expect(screen.getByText("Normal moodboard frame")).toBeInTheDocument();
    expect(screen.getByText("Feature 115 product evidence fixture")).toBeInTheDocument();
    expect(screen.getByText("Plan ready for review")).toBeInTheDocument();
    expect(screen.getAllByText("Shots").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nodes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Blockers")).toBeInTheDocument();
    expect(screen.getByText("Credits before confirm")).toBeInTheDocument();
    expect(screen.getByText("Planning does not spend generation provider credits")).toBeInTheDocument();
    expect(screen.getByTestId("production-planning-skill-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Planning skill selector")).toHaveValue("media-production-storyboard-planner");
    expect(screen.getByLabelText("Planning model mode")).toHaveValue("auto");
    expect(screen.getByText("Character / Provider Results")).toBeInTheDocument();
    expect(screen.getAllByText("Gemini Omni cast reference").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Planner/verifier may use LLM credits; Generate requires separate confirmation")).toBeInTheDocument();
    expect(screen.getByText("Live handoff/execution remains flag-gated")).toBeInTheDocument();
    expect(screen.getByTestId("production-execution-status-panel")).toBeInTheDocument();
    expect(screen.getByText("Confirm: required before generation credits are reserved")).toBeInTheDocument();
    expect(screen.getByText("Failure/Retry: retries keep the original attempt id and version guard")).toBeInTheDocument();
    expect(screen.getByTestId("node-config-panel")).toBeInTheDocument();
    expect(screen.getByText("Select a node to edit config.")).toBeInTheDocument();

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

    expect(screen.getAllByRole("button", { name: /start link/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /connect here/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    fireEvent.click(screen.getAllByText("More")[0]);
    fireEvent.click(screen.getByRole("button", { name: /search \/ open/i }));
    fireEvent.click(screen.getByRole("button", { name: /create plan \+ verify/i }));
    fireEvent.click(screen.getByRole("button", { name: /open video shot/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onProjectSearchOpen).toHaveBeenCalledTimes(1);
    expect(onCreateFixturePlan).toHaveBeenCalledTimes(1);
    expect(onOpenVideoShot).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByTestId("production-flow-canvas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open existing project/i }));
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.click(screen.getByRole("button", { name: /create plan \+ verify/i }));
    expect(onProjectSearchOpen).toHaveBeenCalledTimes(1);
    expect(onNewProject).toHaveBeenCalledTimes(1);
    expect(onCreateFixturePlan).toHaveBeenCalledTimes(1);
  });

	  it("keeps deferred node catalog entries visible but disabled", () => {
	    const onAddNode = vi.fn();
	    render(
	      <ProductionFlowCanvas
	        flowNodes={[]}
	        flowEdges={[]}
	        contextAssets={[]}
	        onAddNode={onAddNode}
	      />
	    );

    const finalRender = screen.getAllByRole("button", { name: /final render/i })[0];
	    expect(finalRender).toBeDisabled();
	    expect(screen.getAllByText("Deferred").length).toBeGreaterThan(0);
	    fireEvent.click(finalRender);
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
    fireEvent.click(within(contextAssetBoard).getAllByRole("button", { name: /add to canvas/i })[0]);
    expect(onAssetAddToCanvas).toHaveBeenCalledWith(expect.objectContaining({ id: "asset-normal-1" }));
    expect(onAssetAssignToNode).not.toHaveBeenCalled();

    fireEvent.click(within(contextAssetBoard).getAllByRole("button", { name: /attach to selected node/i })[0]);
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
      />
    );

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

    const planningButton = screen.getByRole("button", { name: /^Planning\.\.\.$/ });
    expect(planningButton).toHaveTextContent("Planning...");
    expect(planningButton).toBeDisabled();
  });
});
