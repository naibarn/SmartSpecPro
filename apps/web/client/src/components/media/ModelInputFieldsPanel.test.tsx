/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelInputFieldsPanel } from "./ModelInputFieldsPanel";
import { trpc } from "@/lib/trpc";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    media: {
      listModelFieldOptions: {
        useQuery: vi.fn(),
      },
    },
  },
}));

describe("ModelInputFieldsPanel", () => {
  beforeEach(() => {
    vi.mocked(trpc.media.listModelFieldOptions.useQuery).mockReturnValue({
      data: { options: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("renders Gemini helper descriptions for synced and editable fields", () => {
    render(
      <ModelInputFieldsPanel
        enabled
        model={{ id: "gemini-tts", name: "Gemini 3.1 Flash TTS" }}
        fields={[
          {
            key: "prompt",
            label: "Prompt",
            type: "text",
            syncWith: "prompt",
            description: "Write dialogue with speaker aliases like Host: and Guest: on separate lines.",
          },
          {
            key: "style_instructions",
            label: "Style Instructions",
            type: "text",
            syncWith: "none",
            description: "Plain text helper content that prepends to the prompt.",
          },
          {
            key: "voice",
            label: "Voice",
            type: "select",
            syncWith: "none",
            description: "Single-speaker voice preset. Ignored when speakers is set.",
            options: [{ value: "Kore", label: "Kore" }],
          },
        ]}
        extraParams={{
          style_instructions: "Speak warmly and slowly.",
          voice: "Kore",
        }}
        promptPreview="Host: Welcome back."
      />,
    );

    expect(screen.getByText(/Write dialogue with speaker aliases/i)).toBeInTheDocument();
    expect(screen.getByText(/Plain text helper content that prepends to the prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Single-speaker voice preset/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Host: Welcome back.")).toBeInTheDocument();
  });

  it("applies numeric min max and step metadata to number inputs", () => {
    render(
      <ModelInputFieldsPanel
        enabled
        model={{ id: "magnific/change-camera", name: "Change Camera" }}
        fields={[
          {
            key: "horizontal_angle",
            label: "Horizontal Angle",
            type: "number",
            syncWith: "none",
            min: 0,
            max: 360,
            step: 1,
          },
        ]}
        extraParams={{ horizontal_angle: 12 }}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Advanced Horizontal Angle");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "360");
    expect(input).toHaveAttribute("step", "1");
  });

  it("uses a persisted searchable option label when provider options have not loaded yet", () => {
    render(
      <ModelInputFieldsPanel
        enabled
        model={{ id: "elevenlabs/text-to-dialogue", name: "ElevenLabs Text to Dialogue" }}
        fields={[
          {
            key: "voice_id",
            label: "Default Voice",
            type: "select",
            syncWith: "none",
            searchable: true,
            options: [{ value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" }],
            optionsSource: { type: "provider_api" },
          },
        ]}
        extraParams={{
          voice_id: "hpp4J3VqNfWAUOOOdIUs",
          voice_id__label: "Bella - Professional, Bright, Warm",
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Advanced Default Voice" }))
      .toHaveTextContent("Bella - Professional, Bright, Warm");
    expect(screen.queryByText("hpp4J3VqNfWAUOOOdIUs")).not.toBeInTheDocument();
  });
});
