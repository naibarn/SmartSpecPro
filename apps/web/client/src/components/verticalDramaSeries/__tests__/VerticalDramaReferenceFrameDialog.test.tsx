/**
 * Coverage for `VerticalDramaReferenceFrameDialog` (Phase 6c, `planning/vd-
 * start-frame-reference-mapping/plan.md`) — the two-step "select characters
 * + type a directive -> review/confirm the authored prompt -> render" flow.
 * Mocks `@/components/ui/dialog` to a plain always-rendered wrapper (same
 * convention as `ExportAsSkillDialog.test.tsx`) so the component's own step
 * gating/state logic is exercised deterministically without depending on
 * Radix's portal/open-animation internals.
 */
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? createElement("div", null, children) : null,
  DialogContent: ({ children, ...rest }: any) =>
    createElement("div", rest, children),
  DialogDescription: ({ children }: any) => createElement("p", null, children),
  DialogFooter: ({ children }: any) => createElement("div", null, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) => createElement("h2", null, children),
}));

import { VerticalDramaReferenceFrameDialog } from "@/components/verticalDramaSeries/VerticalDramaReferenceFrameDialog";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    open: true,
    onOpenChange: vi.fn(),
    shotNumber: 3,
    characterOptions: [
      { key: "hero", name: "พระเอก", portraitUrl: "https://cdn/hero.jpg" },
      { key: "villain", name: "ผู้ร้าย", portraitUrl: null },
    ],
    defaultSelectedKeys: ["hero"],
    existingCount: 0,
    onGeneratePrompt: vi.fn(),
    onConfirmRender: vi.fn(),
    ...overrides,
  };
}

function checkboxFor(testId: string): HTMLElement {
  const row = screen.getByTestId(testId);
  const box = row.querySelector('button[role="checkbox"]');
  if (!box) throw new Error(`No checkbox found inside ${testId}`);
  return box as HTMLElement;
}

async function confirmPaidAction(testId: string): Promise<void> {
  const confirm = await screen.findByTestId(`${testId}-confirm`);
  fireEvent.click(confirm);
}

describe("VerticalDramaReferenceFrameDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds checkboxes from defaultSelectedKeys and disables a character with no portrait", () => {
    render(createElement(VerticalDramaReferenceFrameDialog, baseProps() as any));

    expect(checkboxFor("vd-reference-frame-character-3-hero")).toHaveAttribute(
      "data-state",
      "checked"
    );
    expect(
      checkboxFor("vd-reference-frame-character-3-villain")
    ).toHaveAttribute("data-state", "unchecked");
    expect(
      checkboxFor("vd-reference-frame-character-3-villain")
    ).toBeDisabled();
  });

  it("disables 'generate prompt' until at least one character is selected AND the instruction is non-empty", () => {
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ defaultSelectedKeys: [] }) as any
      )
    );

    const generateButton = screen.getByTestId(
      "vd-reference-frame-generate-prompt-3"
    );
    expect(generateButton).toBeDisabled();

    // Character selected, no instruction yet — still disabled.
    fireEvent.click(checkboxFor("vd-reference-frame-character-3-hero"));
    expect(generateButton).toBeDisabled();

    // Instruction typed too — now enabled.
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "ไอริณโอบกอดภาคิน" },
    });
    expect(generateButton).not.toBeDisabled();
  });

  it("disables 'generate prompt' once the shot is at the 10-frame cap, regardless of selection", () => {
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ existingCount: 10 }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "some directive" },
    });
    expect(
      screen.getByTestId("vd-reference-frame-generate-prompt-3")
    ).toBeDisabled();
    expect(screen.getByText("ช็อตนี้มีเฟรมอ้างอิงครบ 10 ภาพแล้ว — ลบภาพเก่าก่อนสร้างใหม่")).toBeInTheDocument();
  });

  it("calls onGeneratePrompt with the selected characterKeys + trimmed instruction, then shows the editable prompt review step", async () => {
    const onGeneratePrompt = vi.fn().mockResolvedValue({
      prompt: "a generated prompt",
      negativePrompt: "blurry",
      creditsUsed: 5,
      model: "some-model",
      characterKeys: ["hero"],
    });
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ onGeneratePrompt }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "  ไอริณโอบกอดภาคิน  " },
    });
    fireEvent.click(screen.getByTestId("vd-reference-frame-generate-prompt-3"));
    await confirmPaidAction("vd-credit-confirm-reference-frame-prompt-3");

    expect(onGeneratePrompt).toHaveBeenCalledWith({
      shotNumber: 3,
      characterKeys: ["hero"],
      instruction: "ไอริณโอบกอดภาคิน",
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("vd-reference-frame-prompt-3")
      ).toHaveValue("a generated prompt");
    });
    expect(
      screen.getByTestId("vd-reference-frame-negative-prompt-3")
    ).toHaveValue("blurry");
    expect(
      screen.getByTestId("vd-reference-frame-confirm-render-3")
    ).toBeInTheDocument();
  });

  it("stays on the selection step when onGeneratePrompt resolves null (already-toasted failure)", async () => {
    const onGeneratePrompt = vi.fn().mockResolvedValue(null);
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ onGeneratePrompt }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "directive" },
    });
    fireEvent.click(screen.getByTestId("vd-reference-frame-generate-prompt-3"));
    await confirmPaidAction("vd-credit-confirm-reference-frame-prompt-3");

    await waitFor(() => expect(onGeneratePrompt).toHaveBeenCalled());
    expect(
      screen.queryByTestId("vd-reference-frame-confirm-render-3")
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("vd-reference-frame-instruction-3")
    ).toBeInTheDocument();
  });

  it("'back to selection' returns to step 1 without discarding the instruction", async () => {
    const onGeneratePrompt = vi.fn().mockResolvedValue({
      prompt: "a generated prompt",
      negativePrompt: "",
      creditsUsed: 3,
      model: "some-model",
      characterKeys: ["hero"],
    });
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ onGeneratePrompt }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "directive" },
    });
    fireEvent.click(screen.getByTestId("vd-reference-frame-generate-prompt-3"));
    await confirmPaidAction("vd-credit-confirm-reference-frame-prompt-3");
    await waitFor(() =>
      expect(
        screen.getByTestId("vd-reference-frame-confirm-render-3")
      ).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("vd-reference-frame-back-3"));
    expect(
      screen.getByTestId("vd-reference-frame-instruction-3")
    ).toHaveValue("directive");
  });

  it("confirming render calls onConfirmRender with the (possibly edited) prompt, and closes the dialog only on success", async () => {
    const onGeneratePrompt = vi.fn().mockResolvedValue({
      prompt: "original prompt",
      negativePrompt: "",
      creditsUsed: 3,
      model: "some-model",
      characterKeys: ["hero"],
    });
    const onOpenChange = vi.fn();
    const onConfirmRender = vi.fn().mockResolvedValue(true);
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ onGeneratePrompt, onConfirmRender, onOpenChange }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "directive" },
    });
    fireEvent.click(screen.getByTestId("vd-reference-frame-generate-prompt-3"));
    await confirmPaidAction("vd-credit-confirm-reference-frame-prompt-3");
    await waitFor(() =>
      expect(
        screen.getByTestId("vd-reference-frame-prompt-3")
      ).toBeInTheDocument()
    );

    // User edits the prompt before confirming.
    fireEvent.change(screen.getByTestId("vd-reference-frame-prompt-3"), {
      target: { value: "edited prompt" },
    });
    fireEvent.click(
      screen.getByTestId("vd-reference-frame-confirm-render-3")
    );
    await confirmPaidAction("vd-credit-confirm-reference-frame-image-3");

    await waitFor(() =>
      expect(onConfirmRender).toHaveBeenCalledWith({
        shotNumber: 3,
        prompt: "edited prompt",
        negativePrompt: undefined,
        characterKeys: ["hero"],
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the dialog open (review step) when onConfirmRender resolves false", async () => {
    const onGeneratePrompt = vi.fn().mockResolvedValue({
      prompt: "original prompt",
      negativePrompt: "",
      creditsUsed: 3,
      model: "some-model",
      characterKeys: ["hero"],
    });
    const onOpenChange = vi.fn();
    const onConfirmRender = vi.fn().mockResolvedValue(false);
    render(
      createElement(
        VerticalDramaReferenceFrameDialog,
        baseProps({ onGeneratePrompt, onConfirmRender, onOpenChange }) as any
      )
    );
    fireEvent.change(screen.getByTestId("vd-reference-frame-instruction-3"), {
      target: { value: "directive" },
    });
    fireEvent.click(screen.getByTestId("vd-reference-frame-generate-prompt-3"));
    await confirmPaidAction("vd-credit-confirm-reference-frame-prompt-3");
    await waitFor(() =>
      expect(
        screen.getByTestId("vd-reference-frame-prompt-3")
      ).toBeInTheDocument()
    );

    fireEvent.click(
      screen.getByTestId("vd-reference-frame-confirm-render-3")
    );
    await confirmPaidAction("vd-credit-confirm-reference-frame-image-3");
    await waitFor(() => expect(onConfirmRender).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(
      screen.getByTestId("vd-reference-frame-prompt-3")
    ).toBeInTheDocument();
  });
});
