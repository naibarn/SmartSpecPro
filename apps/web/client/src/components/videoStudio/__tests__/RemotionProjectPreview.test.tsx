/**
 * RemotionProjectPreview (Feature 133, section-08) — proves the
 * `@remotion/player` `<Player>` mounts the SAME `GenericTemplateComposition`
 * component the server uses for the real render, fed from a compiled
 * `RemotionTemplateConfig`. `@remotion/player` itself renders real
 * video/canvas machinery that jsdom cannot execute, so (matching this
 * codebase's established convention for third-party player/canvas libs) the
 * `<Player>` is mocked to capture the props it was invoked with.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const playerMock = vi.fn(() => <div data-testid="mock-remotion-player" />);

vi.mock("@remotion/player", () => ({
  Player: (props: Record<string, unknown>) => {
    playerMock(props);
    return <div data-testid="mock-remotion-player" />;
  },
}));

import { GenericTemplateComposition } from "../../../../../server/remotion/GenericTemplateComposition";
import { RemotionProjectPreview } from "../RemotionProjectPreview";
import type { RemotionTemplateConfig } from "@shared/remotion/layerTemplateSchemas";

const CONFIG: RemotionTemplateConfig = {
  id: "compiled-1",
  name: "Compiled project",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  layers: [
    {
      id: "layer-1",
      type: "text",
      startFrame: 0,
      durationFrames: 150,
      x: 10,
      y: 10,
      width: 80,
      height: 20,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      content: "Hello",
      fontFamily: "Inter",
      fontSizePx: 48,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "normal",
    },
  ],
};

describe("RemotionProjectPreview", () => {
  beforeEach(() => {
    playerMock.mockClear();
  });

  it("mounts @remotion/player's Player with GenericTemplateComposition and the compiled config as inputProps", () => {
    render(<RemotionProjectPreview config={CONFIG} />);

    expect(screen.getByTestId("video-studio-remotion-preview")).toBeInTheDocument();
    expect(playerMock).toHaveBeenCalledTimes(1);
    const props = playerMock.mock.calls[0][0];
    expect(props.component).toBe(GenericTemplateComposition);
    expect(props.durationInFrames).toBe(150);
    expect(props.fps).toBe(30);
    expect(props.compositionWidth).toBe(1080);
    expect(props.compositionHeight).toBe(1920);
    expect((props.inputProps as RemotionTemplateConfig).layers).toHaveLength(1);
    expect((props.inputProps as RemotionTemplateConfig).id).toBe("compiled-1");
  });

  it("clamps durationInFrames to at least 1", () => {
    render(<RemotionProjectPreview config={{ ...CONFIG, durationInFrames: 0 }} />);
    const props = playerMock.mock.calls[0][0];
    expect(props.durationInFrames).toBe(1);
  });
});
