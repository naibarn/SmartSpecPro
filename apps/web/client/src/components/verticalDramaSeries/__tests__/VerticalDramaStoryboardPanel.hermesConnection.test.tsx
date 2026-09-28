/**
 * @vitest-environment jsdom
 *
 * Feature 135 (Hermes/Grok media worker), section-10 §3.3 — StoryboardPanel
 * prop-contract test: `hermesConnectionId`/`onHermesConnectionChange` render
 * `HermesConnectionPicker` (never `McpConnectionPicker`) when the selected
 * image/video model resolves to hermes transport, and changes propagate
 * through the controlled callback only (no internal persistence).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHermesListConnections, mockMcpListConnections } = vi.hoisted(() => ({
  mockHermesListConnections: vi.fn(),
  mockMcpListConnections: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    hermesConnections: {
      listConnections: { useQuery: mockHermesListConnections },
    },
    mcpConnections: {
      listConnections: { useQuery: mockMcpListConnections },
    },
  },
}));

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const HERMES_MODEL = {
  id: "hermes-grok/grok-imagine-image",
  modelId: "hermes-grok/grok-imagine-image",
  name: "Grok via Hermes",
  type: "image",
  provider: "xai",
  configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
};

const MCP_MODEL = {
  id: "magnific/upscale",
  modelId: "magnific/upscale",
  name: "Magnific",
  type: "image",
  provider: "magnific",
  configJson: { transport: "mcp", mcp: { providerKey: "magnific" } },
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — Hermes connection picker wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders HermesConnectionPicker (not McpConnectionPicker) when the selected image model uses hermes transport", async () => {
    mockHermesListConnections.mockReturnValue({ data: [], isLoading: false });
    const onHermesConnectionChange = vi.fn();

    render(
      <VerticalDramaStoryboardPanel
        {...baseProps({
          imageModels: [HERMES_MODEL],
          selectedImageModelId: HERMES_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          hermesConnectionId: null,
          onHermesConnectionChange,
        })}
      />,
    );

    await waitFor(() => {
      expect(mockHermesListConnections).toHaveBeenCalledWith(
        { assetType: "image" },
        expect.any(Object),
      );
    });
    expect(screen.getAllByText(/บัญชี Grok \(Hermes\)/).length).toBeGreaterThan(0);
    expect(mockMcpListConnections).not.toHaveBeenCalled();
  });

  it("renders McpConnectionPicker (not HermesConnectionPicker) when the selected image model uses mcp transport (regression)", () => {
    mockMcpListConnections.mockReturnValue({ data: [], isLoading: false });

    render(
      <VerticalDramaStoryboardPanel
        {...baseProps({
          imageModels: [MCP_MODEL],
          selectedImageModelId: MCP_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          mcpConnectionId: null,
          onSelectMcpConnection: vi.fn(),
        })}
      />,
    );

    expect(mockHermesListConnections).not.toHaveBeenCalled();
  });

  it("propagates a picked hermes connection through onHermesConnectionChange only (no internal persistence)", async () => {
    mockHermesListConnections.mockReturnValue({
      data: [
        {
          id: "conn-hermes-1",
          scope: "server_personal",
          status: "authorized",
          accountLabel: "My Grok",
          accountHint: null,
          defaultForImage: false,
          defaultForVideo: false,
          assignedWorkerOnline: true,
          capabilitySummary: { imageEnabled: true, videoEnabled: true },
        },
      ],
      isLoading: false,
    });
    const onHermesConnectionChange = vi.fn();

    render(
      <VerticalDramaStoryboardPanel
        {...baseProps({
          imageModels: [HERMES_MODEL],
          selectedImageModelId: HERMES_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          hermesConnectionId: null,
          onHermesConnectionChange,
        })}
      />,
    );

    await waitFor(() => {
      expect(onHermesConnectionChange).toHaveBeenCalledWith("conn-hermes-1");
    });
  });
});
