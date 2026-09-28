/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ locale: "en", t: (key: string) => key }),
}));

import ModelSelectorDialog, { type MediaModel } from "../ModelSelectorDialog";

const hermesModel: MediaModel = {
  modelId: "hermes-grok/grok-imagine-image",
  name: "Grok Imagine (Hermes)",
  provider: "xai",
  configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
};

const mcpModel: MediaModel = {
  modelId: "magnific/upscale",
  name: "Magnific Upscale",
  provider: "magnific",
  configJson: { transport: "mcp", mcp: { providerKey: "magnific" } },
};

const gatewayModel: MediaModel = {
  modelId: "kie/some-model",
  name: "Kie Model",
  provider: "kie",
  configJson: {},
};

describe("ModelSelectorDialog — Hermes transport badge", () => {
  it("renders a distinct 'Grok via Hermes' badge for a hermes_worker model row", () => {
    render(
      <ModelSelectorDialog
        open
        onOpenChange={vi.fn()}
        models={[hermesModel]}
        selectedModelId=""
        onSelect={vi.fn()}
        mediaType="image"
      />,
    );

    expect(screen.getByText("Grok via Hermes")).toBeDefined();
    // Never bare "Hermes" alone, and never the kie.ai "Grok Imagine" label for
    // this transport.
    expect(screen.queryByText(/^Hermes$/)).toBeNull();
  });

  it("regression: an mcp model row still renders the MCP badge (not the hermes one)", () => {
    render(
      <ModelSelectorDialog
        open
        onOpenChange={vi.fn()}
        models={[mcpModel]}
        selectedModelId=""
        onSelect={vi.fn()}
        mediaType="image"
      />,
    );

    expect(screen.getByText("MCP")).toBeDefined();
    expect(screen.queryByText("Grok via Hermes")).toBeNull();
  });

  it("regression: a gateway model row renders the API badge", () => {
    render(
      <ModelSelectorDialog
        open
        onOpenChange={vi.fn()}
        models={[gatewayModel]}
        selectedModelId=""
        onSelect={vi.fn()}
        mediaType="image"
      />,
    );

    expect(screen.getByText("API")).toBeDefined();
  });

  it("surfaces a failed catalog load with a retry action instead of 'no models'", () => {
    const onRetry = vi.fn();
    render(
      <ModelSelectorDialog
        open
        onOpenChange={vi.fn()}
        models={[]}
        selectedModelId=""
        onSelect={vi.fn()}
        mediaType="image"
        loadError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the model catalog",
    );
    expect(screen.queryByText("No models found")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps cached model rows visible while a background refetch is failing", () => {
    render(
      <ModelSelectorDialog
        open
        onOpenChange={vi.fn()}
        models={[gatewayModel]}
        selectedModelId=""
        onSelect={vi.fn()}
        mediaType="image"
        loadError
      />,
    );

    expect(screen.getByText("Kie Model")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
