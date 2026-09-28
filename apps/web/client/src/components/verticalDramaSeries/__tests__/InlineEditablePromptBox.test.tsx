// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InlineEditablePromptBox } from "../VerticalDramaStoryboardPanel";
import { vdCopy } from "../verticalDramaWorkspaceCopy";

const t = vdCopy("th");

function renderPrompt(prompt: string) {
  return render(
    <InlineEditablePromptBox
      locale="th"
      t={t}
      title="พรอมต์ทดสอบ"
      prompt={prompt}
      emptyLabel="ยังไม่มีพรอมต์"
      isEditing={false}
      draft=""
      onStartEdit={vi.fn()}
      onDraftChange={vi.fn()}
      onSave={vi.fn()}
      onCancelEdit={vi.fn()}
      canSaveFree={false}
      testIdPrefix="test-prompt"
      maxChars={20000}
    />
  );
}

describe("InlineEditablePromptBox prompt disclosure", () => {
  it("caps long prompts at ten preview lines and expands to the full text", () => {
    const prompt = Array.from(
      { length: 12 },
      (_, index) => `line-${index + 1}`
    ).join("\n");
    renderPrompt(prompt);

    const preview = screen.getByTestId("test-prompt-preview");
    const toggle = screen.getByTestId("test-prompt-toggle");

    expect(preview).toHaveStyle({ maxHeight: "12.5rem" });
    expect(preview.textContent).toBe(prompt);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("test-prompt-char-counter")).toHaveTextContent(
      `${prompt.length.toLocaleString()} / 20,000`
    );

    fireEvent.click(toggle);

    expect(preview).not.toHaveStyle({ maxHeight: "12.5rem" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("copies the complete prompt while the preview is collapsed", async () => {
    const prompt = Array.from(
      { length: 12 },
      (_, index) => `copy-line-${index + 1}`
    ).join("\n");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPrompt(prompt);

    fireEvent.click(screen.getByTestId("test-prompt-copy"));

    expect(writeText).toHaveBeenCalledWith(prompt);
  });

  it("keeps an empty prompt collapsed to its header until expanded", () => {
    renderPrompt("");

    const toggle = screen.getByTestId("test-prompt-toggle");
    const content = document.getElementById("test-prompt-content");
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("hidden");

    fireEvent.click(toggle);

    expect(content).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("test-prompt-preview")).toHaveTextContent(
      "ยังไม่มีพรอมต์"
    );
  });
});
