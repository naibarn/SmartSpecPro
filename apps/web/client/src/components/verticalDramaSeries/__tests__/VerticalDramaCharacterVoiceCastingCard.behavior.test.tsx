import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaCharacterVoiceCastingCard } from "@/components/verticalDramaSeries/VerticalDramaCharacterVoiceCastingCard";
import type { VerticalDramaVoiceCatalogEntry } from "@shared/verticalDramaSeries/voiceCasting";

const voices: VerticalDramaVoiceCatalogEntry[] = [
  { voiceModelId: "uvoice/tts", voiceId: "th-porche", label: "th - ปอร์เช่ (Adult)", language: "th", ageTag: "Adult" },
  { voiceModelId: "uvoice/tts", voiceId: "en-mike", label: "en - Mike (Adult)", language: "en", ageTag: "Adult" },
];

describe("VerticalDramaCharacterVoiceCastingCard", () => {
  it("shows the uncast placeholder chip when no voice is configured", () => {
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.getByTestId("vd-voice-casting-chip")).toHaveTextContent("ยังไม่กำหนดเสียง");
    expect(screen.getByTestId("vd-voice-casting-preview-cta")).toBeDisabled();
    expect(screen.getByTestId("vd-voice-casting-clear-cta")).toBeDisabled();
  });

  it("shows the cast voice's label + locked-at timestamp when configured", () => {
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{
          voiceModelId: "uvoice/tts",
          voiceId: "th-porche",
          voiceLabel: "th - ปอร์เช่ (Adult)",
          lockedAt: "2026-07-08T14:05:00.000Z",
        }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.getByTestId("vd-voice-casting-chip")).toHaveTextContent("th - ปอร์เช่ (Adult)");
    expect(screen.getByTestId("vd-voice-casting-locked-at")).toHaveTextContent("ล็อกเมื่อ 2026-07-08 14:05");
    expect(screen.getByTestId("vd-voice-casting-preview-cta")).not.toBeDisabled();
  });

  it("opens the picker dialog, filters by search, and calls onCast on select", () => {
    const onCast = vi.fn();
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        onCast={onCast}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("vd-voice-casting-select-cta"));
    expect(screen.getByTestId("vd-voice-casting-dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("vd-voice-casting-search"), { target: { value: "Mike" } });
    expect(screen.queryByTestId("vd-voice-casting-option-uvoice/tts-th-porche")).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-voice-casting-option-uvoice/tts-en-mike")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-voice-casting-option-uvoice/tts-en-mike"));
    expect(onCast).toHaveBeenCalledWith(voices[1]);
    expect(screen.queryByTestId("vd-voice-casting-dialog")).not.toBeInTheDocument();
  });

  it("requires confirmation before calling onPreview (paid action)", () => {
    const onPreview = vi.fn();
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={onPreview}
      />,
    );
    fireEvent.click(screen.getByTestId("vd-voice-casting-preview-cta"));
    expect(onPreview).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-voice-casting-preview-confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-voice-casting-preview-confirm-submit"));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("calls onClear directly (no confirm step) when the clear button is clicked", () => {
    const onClear = vi.fn();
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={onClear}
        onPreview={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("vd-voice-casting-clear-cta"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders the inline audio player only once a preview URL is available", () => {
    const { rerender } = render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("vd-voice-casting-preview-player")).not.toBeInTheDocument();

    rerender(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
        previewAudioUrl="https://example.com/preview.mp3"
      />,
    );
    const player = screen.getByTestId("vd-voice-casting-preview-player");
    expect(player).toHaveAttribute("src", "https://example.com/preview.mp3");
    expect(player).toHaveAccessibleName();
  });

  it("shows the resolved preview credit cost as small muted text once available (debt-item-2)", () => {
    const { rerender } = render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("vd-voice-casting-preview-credit-cost")).not.toBeInTheDocument();

    rerender(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
        previewCreditCost={3}
      />,
    );
    expect(screen.getByTestId("vd-voice-casting-preview-credit-cost")).toHaveTextContent(
      "ใช้ไป 3 เครดิต",
    );
  });

  it("shows the English preview credit cost text when lang is en", () => {
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="en"
        characterName="Hero"
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
        previewCreditCost={1}
      />,
    );
    expect(screen.getByTestId("vd-voice-casting-preview-credit-cost")).toHaveTextContent(
      "Cost: 1 credit",
    );
  });

  it("hides every mutating control when readOnly (archived series)", () => {
    render(
      <VerticalDramaCharacterVoiceCastingCard
        lang="th"
        characterName="นางเอก"
        readOnly
        voices={voices}
        voiceConfig={{ voiceModelId: "uvoice/tts", voiceId: "th-porche" }}
        onCast={vi.fn()}
        onClear={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("vd-voice-casting-select-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-voice-casting-preview-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-voice-casting-clear-cta")).not.toBeInTheDocument();
    // The read-only chip is still shown — this is informational, not a mutation.
    expect(screen.getByTestId("vd-voice-casting-chip")).toBeInTheDocument();
  });
});
