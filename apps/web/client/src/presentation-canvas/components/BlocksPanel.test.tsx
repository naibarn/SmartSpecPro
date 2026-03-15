import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { BlocksPanel } from "./BlocksPanel";

describe("BlocksPanel", () => {
  it("renders saved custom blocks and exposes delete actions", () => {
    const onDeleteCustomBlock = vi.fn();
    const onToggleFavoriteCustomBlock = vi.fn();
    const onTogglePinCustomBlock = vi.fn();
    const onToggleTeamFeaturedCustomBlock = vi.fn();
    const onTransferCustomBlockOwner = vi.fn();

    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        onInsertCustomBlock={vi.fn()}
        onDeleteCustomBlock={onDeleteCustomBlock}
        onToggleFavoriteCustomBlock={onToggleFavoriteCustomBlock}
        onTogglePinCustomBlock={onTogglePinCustomBlock}
        onToggleTeamFeaturedCustomBlock={onToggleTeamFeaturedCustomBlock}
        onTransferCustomBlockOwner={onTransferCustomBlockOwner}
        customBlocks={[
          {
            id: "custom-block-1",
            label: "Intro Block",
            description: "Saved from AI Layout.",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 2,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [
              { slotId: "quote", type: "text", text: "Saved quote" },
              { slotId: "eyebrow", type: "text", text: "Saved eyebrow" },
              { slotId: "attribution", type: "text", text: "Saved attribution" },
            ],
            savedAt: "2026-03-13T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/preview.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/preview.svg",
              previewHash: "hash-1",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-13T00:00:00.000Z",
            },
            governanceEvents: [
              {
                eventType: "featured_changed",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T01:00:00.000Z",
                detail: "Block featured for team",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Intro Block").length).toBeGreaterThan(0);
    expect(screen.getByTestId("block-preview-custom-block-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("favorite-custom-block-custom-block-1"));
    expect(onToggleFavoriteCustomBlock).toHaveBeenCalledWith("custom-block-1", true);
    fireEvent.click(screen.getByTestId("pin-custom-block-custom-block-1"));
    expect(onTogglePinCustomBlock).toHaveBeenCalledWith("custom-block-1", true);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("22");
    fireEvent.click(screen.getByTestId("feature-custom-block-custom-block-1"));
    expect(onToggleTeamFeaturedCustomBlock).toHaveBeenCalledWith("custom-block-1", true);
    fireEvent.click(screen.getByTestId("transfer-custom-block-custom-block-1"));
    expect(onTransferCustomBlockOwner).toHaveBeenCalledWith("custom-block-1", 22);
    promptSpy.mockRestore();
    fireEvent.click(screen.getByTestId("delete-custom-block-custom-block-1"));
    expect(onDeleteCustomBlock).toHaveBeenCalledWith("custom-block-1");
    expect(screen.getByTestId("custom-block-governance-custom-block-1")).toHaveTextContent("Block featured for team");
  });

  it("keeps the preset list inside a constrained scroll region", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
      />,
    );

    const scrollArea = screen.getByTestId("blocks-panel-scroll-area");
    expect(scrollArea.className).toContain("h-0");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("flex-1");
  });

  it("includes Document full-page block recipes alongside timeline, infographic, collage, and stat card layouts", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
      />,
    );

    expect(screen.getByText("Timeline Flow")).toBeInTheDocument();
    expect(screen.getByText("Editorial")).toBeInTheDocument();
    expect(screen.getByText("Split Article")).toBeInTheDocument();
    expect(screen.getByText("Profile Sheet")).toBeInTheDocument();
    expect(screen.getByText("Infographic Grid")).toBeInTheDocument();
    expect(screen.getByText("Photo Board")).toBeInTheDocument();
    expect(screen.getByText("Multi-Photo Board")).toBeInTheDocument();
    expect(screen.getByText("Landscape Showcase")).toBeInTheDocument();
    expect(screen.getByText("Stat Cards")).toBeInTheDocument();
  });

  it("shows canvas badges and media-zone overlays for media-heavy Document blocks", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
      />,
    );

    const mediaBoard = screen.getByText("Multi-Photo Board").closest("div.overflow-hidden");
    expect(screen.getAllByText("Portrait Document").length).toBeGreaterThan(0);
    expect(screen.getByText("5 media")).toBeInTheDocument();
    expect(screen.getAllByText("Image / Video").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("block-preview-a4-photo-grid")).getByText("Hero")).toBeInTheDocument();
    expect(within(screen.getByTestId("block-preview-a4-photo-grid")).getAllByText("IMG/VID").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("block-preview-landscape-photo-story")).getByText("1")).toBeInTheDocument();
    expect(mediaBoard).toBeTruthy();
  });

  it("filters blocks by portrait and landscape canvas intent", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
      />,
    );

    fireEvent.click(within(screen.getByRole("group", { name: "Canvas Intent Filters" })).getByRole("button", { name: "Portrait Document" }));
    expect(screen.getByText("Editorial")).toBeInTheDocument();
    expect(screen.queryByText("Landscape Showcase")).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "Canvas Intent Filters" })).getByRole("button", { name: "Landscape 16:9" }));
    expect(screen.getByText("Landscape Showcase")).toBeInTheDocument();
    expect(screen.queryByText("Editorial")).not.toBeInTheDocument();
  });

  it("supports scope and sort controls for reusable block libraries", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        customBlocks={[
          {
            id: "custom-team",
            label: "Team Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: false,
            canTransferOwnership: false,
            ownerUserId: 1,
            isPinned: true,
            isTeamFeatured: false,
            usageCount: 7,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [
              { slotId: "quote", type: "text", text: "Saved quote" },
            ],
            savedAt: "2026-03-13T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/team.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/team.svg",
              previewHash: "hash-team",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-13T00:00:00.000Z",
            },
          },
          {
            id: "custom-mine",
            label: "My Profile",
            category: "Custom",
            visibility: "private",
            canDelete: true,
            canFeature: false,
            canTransferOwnership: false,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 1,
            favoriteUserIds: [1],
            isFavorite: true,
            componentId: "profile-summary",
            slotBindings: [
              { slotId: "headline", type: "text", text: "My Headline" },
            ],
            savedAt: "2026-03-12T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/mine.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/mine.svg",
              previewHash: "hash-mine",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-12T00:00:00.000Z",
            },
          },
        ]}
      />,
    );

    fireEvent.click(within(screen.getByRole("group", { name: "Block Scope" })).getByRole("button", { name: "Team" }));
    expect(screen.getByText("Team Story")).toBeInTheDocument();
    expect(screen.queryByText("My Profile")).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "Block Scope" })).getByRole("button", { name: "Mine" }));
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("Team Story")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort Blocks"), {
      target: { value: "A-Z" },
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Block Scope" })).getByRole("button", { name: "All" }));
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("Team Story")).toBeInTheDocument();
  });

  it("supports governance filters, recent-activity sorting, and expandable activity timelines", () => {
    const onLibraryStateChange = vi.fn();

    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        onLibraryStateChange={onLibraryStateChange}
        customBlocks={[
          {
            id: "custom-featured",
            label: "Featured Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: true,
            usageCount: 2,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Featured quote" }],
            savedAt: "2026-03-10T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/featured.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/featured.svg",
              previewHash: "hash-featured",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-10T00:00:00.000Z",
            },
            governanceEvents: [
              {
                eventType: "featured_changed",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T09:00:00.000Z",
                detail: "Block featured for team",
              },
            ],
          },
          {
            id: "custom-transfer",
            label: "Transferred Story",
            category: "Custom",
            visibility: "team",
            canDelete: false,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 22,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 1,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Transferred quote" }],
            savedAt: "2026-03-12T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/transferred.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/transferred.svg",
              previewHash: "hash-transferred",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-12T00:00:00.000Z",
            },
            governanceEvents: [
              {
                eventType: "ownership_transferred",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T11:00:00.000Z",
                detail: "Ownership transferred to user 22",
              },
              {
                eventType: "featured_changed",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T10:00:00.000Z",
                detail: "Block unfeatured for team",
              },
            ],
          },
        ]}
      />,
    );

    const scrollArea = screen.getByTestId("blocks-panel-scroll-area");
    fireEvent.click(within(screen.getByRole("group", { name: "Governance Filters" })).getByRole("button", { name: "Transferred" }));
    expect(within(scrollArea).getByText("Transferred Story")).toBeInTheDocument();
    expect(within(scrollArea).queryByText("Featured Story")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort Blocks"), {
      target: { value: "Recent Activity" },
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Governance Filters" })).getByRole("button", { name: "Governed" }));

    const labels = screen.getAllByText(/Story$/).map((node) => node.textContent);
    expect(labels.indexOf("Transferred Story")).toBeLessThan(labels.indexOf("Featured Story"));

    fireEvent.click(screen.getByTestId("toggle-governance-timeline-custom-transfer"));
    expect(screen.getByTestId("governance-timeline-custom-transfer")).toHaveTextContent("Ownership transferred to user 22");
    expect(screen.getByTestId("governance-timeline-custom-transfer")).toHaveTextContent("Block unfeatured for team");

    expect(onLibraryStateChange).toHaveBeenLastCalledWith({
      search: "",
      scope: "All",
      activityFilter: "Governed",
      sortOrder: "Recent Activity",
    });
  });

  it("surfaces a team governance feed with event-type filtering across shared presets", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        customBlocks={[
          {
            id: "custom-featured",
            label: "Featured Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: true,
            usageCount: 2,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Featured quote" }],
            savedAt: "2026-03-10T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/featured.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/featured.svg",
              previewHash: "hash-featured",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-10T00:00:00.000Z",
            },
            governanceEvents: [
              {
                eventType: "featured_changed",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T09:00:00.000Z",
                detail: "Block featured for team",
              },
            ],
          },
          {
            id: "custom-transfer",
            label: "Transferred Story",
            category: "Custom",
            visibility: "team",
            canDelete: false,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 22,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 1,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Transferred quote" }],
            savedAt: "2026-03-12T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/transferred.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/transferred.svg",
              previewHash: "hash-transferred",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-12T00:00:00.000Z",
            },
            governanceEvents: [
              {
                eventType: "ownership_transferred",
                actorUserId: 1,
                actorRole: "admin",
                recordedAt: "2026-03-13T11:00:00.000Z",
                detail: "Ownership transferred to user 22",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("team-governance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("team-governance-feed")).toHaveTextContent("Transferred Story");
    expect(screen.getByTestId("team-governance-feed")).toHaveTextContent("Ownership transferred to user 22");
    expect(screen.getByTestId("team-governance-feed")).toHaveTextContent("admin");

    fireEvent.click(within(screen.getByRole("group", { name: "Team Governance Timeline Filters" })).getByRole("button", { name: "Ownership" }));
    expect(screen.getByTestId("team-governance-feed")).toHaveTextContent("Transferred Story");
    expect(screen.getByTestId("team-governance-feed")).not.toHaveTextContent("Featured Story");
  });

  it("prioritizes pinned and favorite custom blocks in featured sorting", () => {
    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        customBlocks={[
          {
            id: "custom-favorite",
            label: "Favorite Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: false,
            canTransferOwnership: false,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 3,
            favoriteUserIds: [1],
            isFavorite: true,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Favorite quote" }],
            savedAt: "2026-03-12T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/favorite.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/favorite.svg",
              previewHash: "hash-favorite",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-12T00:00:00.000Z",
            },
          },
          {
            id: "custom-pinned",
            label: "Pinned Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: false,
            canTransferOwnership: false,
            ownerUserId: 1,
            isPinned: true,
            isTeamFeatured: false,
            usageCount: 1,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Pinned quote" }],
            savedAt: "2026-03-11T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/pinned.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/pinned.svg",
              previewHash: "hash-pinned",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-11T00:00:00.000Z",
            },
          },
        ]}
      />,
    );

    const labels = screen.getAllByText(/Story$/).map((node) => node.textContent);
    expect(labels.indexOf("Pinned Story")).toBeLessThan(labels.indexOf("Favorite Story"));
  });

  it("reports library state changes and supports most-used sorting with team featured priority", () => {
    const onLibraryStateChange = vi.fn();

    render(
      <BlocksPanel
        onInsertPreset={vi.fn()}
        onInsertComponent={vi.fn()}
        onLibraryStateChange={onLibraryStateChange}
        customBlocks={[
          {
            id: "custom-featured",
            label: "Featured Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: true,
            canTransferOwnership: true,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: true,
            usageCount: 2,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Featured quote" }],
            savedAt: "2026-03-12T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/featured.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/featured.svg",
              previewHash: "hash-featured",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-12T00:00:00.000Z",
            },
          },
          {
            id: "custom-used",
            label: "Used Story",
            category: "Custom",
            visibility: "team",
            canDelete: true,
            canFeature: false,
            canTransferOwnership: false,
            ownerUserId: 1,
            isPinned: false,
            isTeamFeatured: false,
            usageCount: 9,
            favoriteUserIds: [],
            isFavorite: false,
            componentId: "quote-callout",
            slotBindings: [{ slotId: "quote", type: "text", text: "Used quote" }],
            savedAt: "2026-03-11T00:00:00.000Z",
            preview: {
              artifactKey: "presentation/custom-block-previews/tenant-1/1/used.svg",
              artifactUrl: "/api/storage/files/presentation/custom-block-previews/tenant-1/1/used.svg",
              previewHash: "hash-used",
              rendererVersion: "server-svg-v1",
              generatedAt: "2026-03-11T00:00:00.000Z",
            },
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search blocks..."), {
      target: { value: "story" },
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Block Scope" })).getByRole("button", { name: "Team" }));
    fireEvent.change(screen.getByLabelText("Sort Blocks"), {
      target: { value: "Most Used" },
    });

    expect(onLibraryStateChange).toHaveBeenLastCalledWith({
      search: "story",
      scope: "Team",
      activityFilter: "All",
      sortOrder: "Most Used",
    });

    const labels = screen.getAllByText(/Story$/).map((node) => node.textContent);
    expect(labels.indexOf("Used Story")).toBeLessThan(labels.indexOf("Featured Story"));
    expect(screen.queryAllByText("Featured", { selector: "span" }).length).toBeGreaterThan(0);
  });
});
