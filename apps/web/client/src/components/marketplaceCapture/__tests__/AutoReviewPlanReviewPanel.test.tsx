/**
 * Marketplace mandatory text-plan review gate (2026-07-23,
 * planning/marketplace-storyboard-text-gate, commit f997ba1a9).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AutoReviewPlanReviewPanel,
  buildAutoReviewPlanReviewCreditEstimate,
  buildAutoReviewPlanReviewPlanData,
  buildAutoReviewPlanReviewPlanText,
  buildAutoReviewPlanReviewPromptBudgets,
  buildAutoReviewPlanReviewPromptCitationChips,
  buildAutoReviewPlanReviewReferenceManifestRows,
  buildAutoReviewPlanReviewSequentialShotRows,
  buildAutoReviewPlanReviewSettingRows,
  extractAutoReviewPlanReviewPromptImageCitations,
  isAutoReviewPlanReviewDegradedPlan,
  type AutoReviewPlanReviewPlanData,
  type AutoReviewPlanReviewState,
} from "../AutoReviewPlanReviewPanel";

const awaitingPlanReview: AutoReviewPlanReviewState = {
  required: true,
  status: "awaiting",
  heldAt: "2026-07-23T12:00:00.000Z",
  redraftCount: 0,
  lastNotes: null,
};

function planFixture(
  overrides: Partial<AutoReviewPlanReviewPlanData> = {}
): AutoReviewPlanReviewPlanData {
  return {
    productDetail: "กระบอกน้ำสแตนเลส 500ml ฝาล็อกกันรั่ว",
    storyboardGuide: "เปิดด้วยปัญหาน้ำรั่วในกระเป๋า แล้วโชว์สินค้าแก้ปัญหา",
    voiceoverScript: "เคยไหมที่น้ำรั่วเปียกกระเป๋า...",
    sequentialShots: [],
    settings: [],
    creditEstimate: null,
    promptBudgets: { imageMaxChars: 4000, videoMaxChars: 2000 },
    referenceManifest: [],
    isDegradedFallback: false,
    ...overrides,
  };
}

/** A minimal but complete sequential shot row fixture — every test that
 *  only cares about a FEW fields spreads `...overrides` over this rather
 *  than repeating all 9 required fields inline. */
function sequentialShotRowFixture(
  overrides: Partial<
    AutoReviewPlanReviewPlanData["sequentialShots"][number]
  > = {}
): AutoReviewPlanReviewPlanData["sequentialShots"][number] {
  return {
    shotId: 1,
    purpose: "",
    visualSummary: "",
    dialogue: "",
    durationSeconds: null,
    startFrameImagePrompt: "",
    startFrameImagePromptChars: 0,
    videoPrompt: "",
    videoPromptChars: 0,
    ...overrides,
  };
}

function requiredProps() {
  return {
    onApprove: vi.fn(),
    onRequestRedraft: vi.fn(),
    onCancelRun: vi.fn(),
  };
}

describe("AutoReviewPlanReviewPanel", () => {
  it("renders nothing when planReview is absent (older runs must not crash)", () => {
    const { container } = render(
      <AutoReviewPlanReviewPanel
        planReview={null}
        plan={null}
        {...requiredProps()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when planReview.status is approved", () => {
    const { container } = render(
      <AutoReviewPlanReviewPanel
        planReview={{ ...awaitingPlanReview, status: "approved" }}
        plan={planFixture()}
        {...requiredProps()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when required is not true even if status says awaiting", () => {
    const { container } = render(
      <AutoReviewPlanReviewPanel
        planReview={{ ...awaitingPlanReview, required: false }}
        plan={planFixture()}
        {...requiredProps()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a loading state while plan is null (heavy fetch in flight) and awaiting is true", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={null}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("Loading the text plan...")).toBeTruthy();
  });

  it("renders a retry button on a load error", () => {
    const onRetryLoadPlan = vi.fn();
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={null}
        planLoadError="Network error"
        onRetryLoadPlan={onRetryLoadPlan}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("Failed to load the text plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryLoadPlan).toHaveBeenCalledTimes(1);
  });

  it("renders the header, explainer, product detail, storyboard guide, and voiceover script when awaiting with a loaded non-sequential plan", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("ตรวจสตอรีบอร์ดข้อความก่อนสร้างภาพ")).toBeTruthy();
    expect(
      screen.getByText(
        "ยังไม่มีการตัดเครดิตสร้างภาพ จนกว่าคุณจะยืนยันแผนข้อความนี้"
      )
    ).toBeTruthy();
    expect(
      screen.getByText("กระบอกน้ำสแตนเลส 500ml ฝาล็อกกันรั่ว")
    ).toBeTruthy();
    expect(
      screen.getByText("เปิดด้วยปัญหาน้ำรั่วในกระเป๋า แล้วโชว์สินค้าแก้ปัญหา")
    ).toBeTruthy();
    expect(screen.getByText("เคยไหมที่น้ำรั่วเปียกกระเป๋า...")).toBeTruthy();
  });

  it("shows the draft badge only when redraftCount > 0, numbered as the CURRENT draft", () => {
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.queryByText(/ร่างที่/)).toBeNull();

    rerender(
      <AutoReviewPlanReviewPanel
        planReview={{ ...awaitingPlanReview, redraftCount: 1 }}
        plan={planFixture()}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("ร่างที่ 2")).toBeTruthy();
  });

  it("renders sequential shot rows (title/purpose, visual summary, dialogue, duration) instead of storyboardGuide/voiceoverScript blocks", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "เห็นกระบอกน้ำวางบนโต๊ะ",
              dialogue: "สวัสดีค่ะ",
              durationSeconds: 4,
            }),
            sequentialShotRowFixture({
              shotId: 2,
              purpose: "problem",
              visualSummary: "น้ำหกเปียกกระเป๋า",
              dialogue: "",
              durationSeconds: null,
            }),
          ],
        })}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.getByTestId("plan-review-shot-1")).toBeTruthy();
    expect(screen.getByTestId("plan-review-shot-2")).toBeTruthy();
    expect(screen.getByText("ช็อตที่ 1")).toBeTruthy();
    expect(screen.getByText(/เห็นกระบอกน้ำวางบนโต๊ะ/)).toBeTruthy();
    expect(screen.getByText(/สวัสดีค่ะ/)).toBeTruthy();
    expect(screen.getByText("4 วินาที")).toBeTruthy();
    // Non-sequential blocks must not render when sequential shots exist.
    expect(
      screen.queryByText("เปิดด้วยปัญหาน้ำรั่วในกระเป๋า แล้วโชว์สินค้าแก้ปัญหา")
    ).toBeNull();
  });

  it("shows the empty-dialogue placeholder instead of hiding the row (e.g. the degraded fallback pack never has dialogue)", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "เห็นกระบอกน้ำวางบนโต๊ะ",
              dialogue: "",
              durationSeconds: 4,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("— No dialogue in this plan —")).toBeTruthy();
  });

  it('labels the visual summary line with an "(EN)" badge and shows the English-content hint once for the shots list', () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              visualSummary: "wide shot of the product",
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("(EN)")).toBeTruthy();
    expect(screen.getByText(/stays in English on purpose/)).toBeTruthy();
  });

  it("renders no pencil edit affordance when onSaveShotDialogue is not provided (an unwired caller stays read-only)", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "a",
              dialogue: "สวัสดีค่ะ",
              durationSeconds: 4,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Edit dialogue for shot 1" })
    ).toBeNull();
  });

  it("edits a shot's dialogue inline and saves via onSaveShotDialogue with the trimmed {shotId, dialogue}", () => {
    const onSaveShotDialogue = vi.fn();
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 3,
              purpose: "hook_open",
              visualSummary: "a",
              dialogue: "เดิม",
              durationSeconds: 4,
            }),
          ],
        })}
        onSaveShotDialogue={onSaveShotDialogue}
        locale="en"
        {...requiredProps()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit dialogue for shot 3" })
    );
    const textarea = screen.getByLabelText(
      "Edit dialogue for shot 3"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("เดิม");

    fireEvent.change(textarea, { target: { value: "  ข้อความใหม่  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save dialogue" }));

    expect(onSaveShotDialogue).toHaveBeenCalledTimes(1);
    expect(onSaveShotDialogue).toHaveBeenCalledWith({
      shotId: 3,
      dialogue: "ข้อความใหม่",
    });
  });

  it("cancels an in-progress dialogue edit without calling onSaveShotDialogue, discarding the draft", () => {
    const onSaveShotDialogue = vi.fn();
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              visualSummary: "a",
              dialogue: "เดิม",
            }),
          ],
        })}
        onSaveShotDialogue={onSaveShotDialogue}
        locale="en"
        {...requiredProps()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit dialogue for shot 1" })
    );
    fireEvent.change(screen.getByLabelText("Edit dialogue for shot 1"), {
      target: { value: "ทิ้งข้อความนี้" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSaveShotDialogue).not.toHaveBeenCalled();
    expect(screen.getByText("เดิม")).toBeTruthy();
    // The pencil button reappears once editing closes and shares the same
    // aria-label as the textarea it opens — assert on the textbox role
    // specifically so this does not false-match the (intentionally)
    // re-rendered pencil button.
    expect(
      screen.queryByRole("textbox", { name: "Edit dialogue for shot 1" })
    ).toBeNull();
  });

  it("disables the save button while dialogueSavingShotId matches this shot, and surfaces a shot-scoped inline error", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              visualSummary: "a",
              dialogue: "เดิม",
            }),
            sequentialShotRowFixture({
              shotId: 2,
              visualSummary: "b",
              dialogue: "อื่น",
            }),
          ],
        })}
        onSaveShotDialogue={vi.fn()}
        dialogueSavingShotId={1}
        dialogueSaveError={{ shotId: 2, message: "Save failed" }}
        locale="en"
        {...requiredProps()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit dialogue for shot 1" })
    );
    expect(screen.getByRole("button", { name: /Save dialogue/ })).toBeDisabled();

    // Shot 2's error is independent of shot 1's saving state.
    fireEvent.click(
      screen.getByRole("button", { name: "Edit dialogue for shot 2" })
    );
    expect(screen.getByText("Save failed")).toBeTruthy();
  });

  it("closes the editor and shows the fresh dialogue once dialogueSavingShotId clears with no error (a successful save)", () => {
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              visualSummary: "a",
              dialogue: "เดิม",
            }),
          ],
        })}
        onSaveShotDialogue={vi.fn()}
        dialogueSavingShotId={1}
        locale="en"
        {...requiredProps()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit dialogue for shot 1" })
    );
    fireEvent.change(screen.getByLabelText("Edit dialogue for shot 1"), {
      target: { value: "ใหม่แล้ว" },
    });

    // Settle with no error + the fresh server text (query invalidation
    // already landed by the time the parent clears the pending id) — the
    // editor closes and shows the updated text.
    rerender(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              visualSummary: "a",
              dialogue: "ใหม่แล้ว",
            }),
          ],
        })}
        onSaveShotDialogue={vi.fn()}
        dialogueSavingShotId={null}
        locale="en"
        {...requiredProps()}
      />
    );
    // Same aria-label collision as the cancel test above — assert on the
    // textbox role so this does not false-match the reappeared pencil button.
    expect(
      screen.queryByRole("textbox", { name: "Edit dialogue for shot 1" })
    ).toBeNull();
    expect(screen.getByText("ใหม่แล้ว")).toBeTruthy();
  });

  it('"Fix this shot\'s visual" opens the redraft-notes box (if closed), prefills "Shot N: ", and focuses the textarea', () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 2,
              purpose: "problem",
              visualSummary: "wrong material shown",
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.queryByPlaceholderText(/Tell us what to fix/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Fix this shot's visual" })
    );

    const textarea = screen.getByPlaceholderText(
      /Tell us what to fix/
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Shot 2: ");
    expect(document.activeElement).toBe(textarea);
  });

  it('appends (not replaces) a second "Fix this shot\'s visual" note for another shot, keeping the first line', () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({ shotId: 1, visualSummary: "a" }),
            sequentialShotRowFixture({ shotId: 5, visualSummary: "b" }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const [fixShot1, fixShot5] = screen.getAllByRole("button", {
      name: "Fix this shot's visual",
    });
    fireEvent.click(fixShot1);
    fireEvent.click(fixShot5);

    const textarea = screen.getByPlaceholderText(
      /Tell us what to fix/
    ) as HTMLTextAreaElement;
    // The trailing space of "Shot 1: " is trimmed before the newline is
    // appended (no dangling whitespace at a line end).
    expect(textarea.value).toBe("Shot 1:\nShot 5: ");
  });

  it("shows the degraded-fallback banner only when plan.isDegradedFallback is true", () => {
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({ isDegradedFallback: false })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.queryByTestId("plan-review-degraded-banner")).toBeNull();

    rerender(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({ isDegradedFallback: true })}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.getByTestId("plan-review-degraded-banner")).toBeTruthy();
    expect(screen.getByText(/แผนนี้เป็นแผนสำรองจากระบบ/)).toBeTruthy();
  });

  it("renders settings rows side-by-side with the plan", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          settings: [
            { key: "reviewTone", label: "Review tone", value: "Warm & honest" },
            {
              key: "qualityMode",
              label: "Quality",
              value: "Balanced (up to 3 rounds/shot)",
            },
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("Your selected settings")).toBeTruthy();
    expect(screen.getByText("Review tone")).toBeTruthy();
    expect(screen.getByText("Warm & honest")).toBeTruthy();
    expect(screen.getByText("Balanced (up to 3 rounds/shot)")).toBeTruthy();
  });

  it("renders the worst-case credit estimate line only when creditEstimate is provided, never inventing one", () => {
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({ creditEstimate: null })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.queryByText(/on the first pass/)).toBeNull();

    rerender(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({ creditEstimate: { typical: 9, worst: 27 } })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(
      screen.getByText(
        "9 images on the first pass · up to 27 if every repair round runs (each round regenerates the whole 9-image set)"
      )
    ).toBeTruthy();
  });

  it("calls onApprove with no args and disables actions while approving", () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={onApprove}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        locale="en"
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm, generate images/ })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);

    rerender(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={onApprove}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        approving
        locale="en"
      />
    );
    expect(
      screen.getByRole("button", { name: /Confirm, generate images/ })
    ).toBeDisabled();
  });

  it("opens the redraft notes box, enforces the 2000-char maxLength, shows a counter, and submits the trimmed notes", () => {
    const onRequestRedraft = vi.fn();
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={onRequestRedraft}
        onCancelRun={vi.fn()}
        locale="en"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI to redraft" }));
    const textarea = screen.getByPlaceholderText(
      /Tell us what to fix/
    ) as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);

    fireEvent.change(textarea, {
      target: { value: "  วัสดุจริงคือพลาสติกแข็ง  " },
    });
    expect(screen.getByText("27/2000 characters")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Submit redraft" }));
    expect(onRequestRedraft).toHaveBeenCalledTimes(1);
    expect(onRequestRedraft).toHaveBeenCalledWith("วัสดุจริงคือพลาสติกแข็ง");
  });

  it("closes and clears the redraft notes box once redraftCount increases (a successful redraft), but keeps it open + the text on a failed attempt", () => {
    const { rerender } = render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        locale="en"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI to redraft" }));
    const textarea = screen.getByPlaceholderText(
      /Tell us what to fix/
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "fix the tone" } });

    // A failed attempt (redraftError set, redraftCount unchanged) must NOT
    // clear what the user typed.
    rerender(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        redraftError="Something went wrong"
        locale="en"
      />
    );
    expect(
      (
        screen.getByPlaceholderText(
          /Tell us what to fix/
        ) as HTMLTextAreaElement
      ).value
    ).toBe("fix the tone");

    // A successful redraft increments redraftCount in the persisted plan —
    // the box closes and the buffer clears.
    rerender(
      <AutoReviewPlanReviewPanel
        planReview={{ ...awaitingPlanReview, redraftCount: 1 }}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        locale="en"
      />
    );
    expect(screen.queryByPlaceholderText(/Tell us what to fix/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Ask AI to redraft" })
    ).toBeTruthy();
  });

  it("calls onCancelRun reusing the page's existing cancel flow, independent of the approve/redraft pending state", () => {
    const onCancelRun = vi.fn();
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={vi.fn()}
        onCancelRun={onCancelRun}
        approving
        locale="en"
      />
    );
    const cancelButton = screen.getByRole("button", {
      name: "Cancel this run",
    });
    expect(cancelButton).not.toBeDisabled();
    fireEvent.click(cancelButton);
    expect(onCancelRun).toHaveBeenCalledTimes(1);
  });

  it("surfaces approveError and redraftError inline", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture()}
        onApprove={vi.fn()}
        onRequestRedraft={vi.fn()}
        onCancelRun={vi.fn()}
        approveError="Run is not awaiting review"
        redraftError="Notes too long"
        locale="en"
      />
    );
    expect(screen.getByText("Run is not awaiting review")).toBeTruthy();
    expect(screen.getByText("Notes too long")).toBeTruthy();
  });

  // One-stop plan-review gate (2026-07-23 user request — "ควรแสดง prompt
  // ในการสร้างภาพไปพร้อม ๆ กันเลย ตรวจสอบรอบเดียวจบ ... เปิดโอกาสให้ตรวจสอบ
  // ความถูกต้องได้"): the two per-shot generation-prompt disclosures, the
  // reference-image legend, and the citation-verification chips/warnings.
  it("renders the two per-shot generation-prompt disclosures collapsed by default and expands each independently to show its prompt text", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt: "A stainless steel bottle on a table.",
              startFrameImagePromptChars: 37,
              videoPrompt: "Slow push-in on the bottle.",
              videoPromptChars: 27,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const shotEl = screen.getByTestId("plan-review-shot-1");
    expect(within(shotEl).getByText("Image prompt (EN)")).toBeTruthy();
    expect(within(shotEl).getByText("Video prompt (EN)")).toBeTruthy();
    expect(within(shotEl).queryByText(/stainless steel bottle/)).toBeNull();
    expect(within(shotEl).queryByText(/Slow push-in/)).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("plan-review-image-prompt-1")).getByRole(
        "button",
        { name: "Show more" }
      )
    );
    expect(within(shotEl).getByText(/stainless steel bottle/)).toBeTruthy();
    // The video block stays collapsed independently of the image block.
    expect(within(shotEl).queryByText(/Slow push-in/)).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("plan-review-video-prompt-1")).getByRole(
        "button",
        { name: "Show more" }
      )
    );
    expect(within(shotEl).getByText(/Slow push-in/)).toBeTruthy();
  });

  it('shows "— No prompt in this plan —" for a shot with no image/video prompt, consistent with the dialogue empty-state', () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [sequentialShotRowFixture({ shotId: 1 })],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const shotEl = screen.getByTestId("plan-review-shot-1");
    fireEvent.click(
      within(screen.getByTestId("plan-review-image-prompt-1")).getByRole(
        "button",
        { name: "Show more" }
      )
    );
    fireEvent.click(
      within(screen.getByTestId("plan-review-video-prompt-1")).getByRole(
        "button",
        { name: "Show more" }
      )
    );
    expect(
      within(shotEl).getAllByText("— No prompt in this plan —")
    ).toHaveLength(2);
  });

  it("shows a red over-budget badge and warning when a shot's prompt exceeds its budget, and a neutral badge when within budget", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt: "short prompt",
              startFrameImagePromptChars: 4500,
              videoPrompt: "short video prompt",
              videoPromptChars: 100,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const shotEl = screen.getByTestId("plan-review-shot-1");
    expect(within(shotEl).getByText("4500/4000 characters")).toBeTruthy();
    expect(within(shotEl).getByText("100/2000 characters")).toBeTruthy();
    expect(
      within(shotEl).getByText(
        'Over the prompt budget — click "Ask AI to redraft" before confirming.'
      )
    ).toBeTruthy();
  });

  it("respects a custom sequentialImagePromptMaxChars budget instead of the 4000 default", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          promptBudgets: { imageMaxChars: 1500, videoMaxChars: 2000 },
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt: "short prompt",
              startFrameImagePromptChars: 1600,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("1600/1500 characters")).toBeTruthy();
  });

  it("shows a green chip for a citation present in the manifest and a red chip + warning for one that is not", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          referenceManifest: [
            { index: 1, role: "primary_product", evidenceOnly: false },
          ],
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt:
                "Use @Image1 as the product and @Image9 as the character.",
              startFrameImagePromptChars: 58,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const citations = screen.getByTestId(
      "plan-review-image-prompt-citations-1"
    );
    const validChip = within(citations).getByText("@Image1");
    const unknownChip = within(citations).getByText("@Image9");
    expect(validChip.getAttribute("data-citation-valid")).toBe("true");
    expect(unknownChip.getAttribute("data-citation-valid")).toBe("false");
    expect(
      screen.getByText(
        "References an @ImageN that is not in the reference list — ask AI to redraft."
      )
    ).toBeTruthy();
  });

  it("shows no citation chips and no unknown-citation warning for a prompt that cites no @ImageN placeholder", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          referenceManifest: [
            { index: 1, role: "primary_product", evidenceOnly: false },
          ],
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt: "A plain prompt with no reference tags.",
              startFrameImagePromptChars: 39,
            }),
          ],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(
      screen.queryByTestId("plan-review-image-prompt-citations-1")
    ).toBeNull();
    expect(screen.queryByText(/is not in the reference list/)).toBeNull();
  });

  it("renders the reference-image legend decoding @ImageN against the run's manifest, including angle + evidence-only labeling", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          referenceManifest: [
            { index: 1, role: "primary_product", evidenceOnly: false },
            {
              index: 2,
              role: "product_angle",
              angleLabel: "back",
              evidenceOnly: false,
            },
            { index: 3, role: "character", evidenceOnly: false },
            { index: 4, role: "environment", evidenceOnly: false },
            {
              index: 5,
              role: "product_angle",
              angleLabel: "package",
              evidenceOnly: true,
            },
          ],
          sequentialShots: [sequentialShotRowFixture({ shotId: 1 })],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    const legend = screen.getByTestId("plan-review-reference-manifest");
    expect(within(legend).getByText("Primary product")).toBeTruthy();
    expect(within(legend).getByText("Product angle (Back)")).toBeTruthy();
    expect(within(legend).getByText("Character")).toBeTruthy();
    expect(within(legend).getByText("Location")).toBeTruthy();
    expect(within(legend).getByText("Product angle (Packaging)")).toBeTruthy();
    expect(
      within(legend).getByText("Evidence only (not attached to the model)")
    ).toBeTruthy();
  });

  it("omits the reference-image legend entirely when the manifest is empty, rather than rendering it blank", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          sequentialShots: [sequentialShotRowFixture({ shotId: 1 })],
        })}
        locale="en"
        {...requiredProps()}
      />
    );
    expect(screen.queryByTestId("plan-review-reference-manifest")).toBeNull();
  });

  it("renders the new prompt disclosures, budget warning, and reference legend in Thai", () => {
    render(
      <AutoReviewPlanReviewPanel
        planReview={awaitingPlanReview}
        plan={planFixture({
          referenceManifest: [
            { index: 1, role: "primary_product", evidenceOnly: false },
          ],
          sequentialShots: [
            sequentialShotRowFixture({
              shotId: 1,
              startFrameImagePrompt: "ใช้ @Image1 เป็นสินค้าหลัก",
              startFrameImagePromptChars: 4500,
            }),
          ],
        })}
        locale="th"
        {...requiredProps()}
      />
    );
    expect(screen.getByText("Prompt ภาพ (EN)")).toBeTruthy();
    expect(screen.getByText("Prompt วิดีโอ (EN)")).toBeTruthy();
    expect(screen.getByText("รายการภาพอ้างอิง (ถอดรหัส @ImageN)")).toBeTruthy();
    expect(screen.getByText("สินค้า (หลัก)")).toBeTruthy();
    expect(
      screen.getByText('เกินงบ prompt — ควรสั่ง "ให้ AI ร่างใหม่" ก่อนยืนยัน')
    ).toBeTruthy();
  });
});

describe("AutoReviewPlanReviewPanel projection helpers", () => {
  it("buildAutoReviewPlanReviewPlanText reads concept.storyboardGuide/voiceoverScript/productDetail and never throws on missing metadata", () => {
    expect(buildAutoReviewPlanReviewPlanText(undefined)).toEqual({
      productDetail: "",
      storyboardGuide: "",
      voiceoverScript: "",
    });
    expect(
      buildAutoReviewPlanReviewPlanText({
        concept: {
          productDetail: "  Product X  ",
          storyboardGuide: "Guide",
          voiceoverScript: "Script",
        },
      })
    ).toEqual({
      productDetail: "Product X",
      storyboardGuide: "Guide",
      voiceoverScript: "Script",
    });
  });

  it("buildAutoReviewPlanReviewSequentialShotRows reads sequentialStoryboard.shots, sorts by shot_id, drops malformed entries, and reads the generation prompts + persisted character counts", () => {
    const rows = buildAutoReviewPlanReviewSequentialShotRows({
      sequentialStoryboard: {
        shots: [
          {
            shot_id: 2,
            purpose: "problem",
            visual_summary: "b",
            dialogue: "d2",
            duration_seconds: 5,
            start_frame_image_prompt: "image prompt two",
            image_prompt_character_count: 17,
            video_prompt: "video prompt two",
            video_prompt_character_count: 16,
          },
          { shot_id: 0, purpose: "junk" },
          "not-an-object",
          {
            shot_id: 1,
            purpose: "hook_open",
            visual_summary: "a",
            dialogue: "d1",
            duration_seconds: 4,
            start_frame_image_prompt: "image prompt one",
            video_prompt: "video prompt one",
            // No persisted character counts — must fall back to `.length`.
          },
        ],
      },
    });
    expect(rows).toEqual([
      {
        shotId: 1,
        purpose: "hook_open",
        visualSummary: "a",
        dialogue: "d1",
        durationSeconds: 4,
        startFrameImagePrompt: "image prompt one",
        startFrameImagePromptChars: "image prompt one".length,
        videoPrompt: "video prompt one",
        videoPromptChars: "video prompt one".length,
      },
      {
        shotId: 2,
        purpose: "problem",
        visualSummary: "b",
        dialogue: "d2",
        durationSeconds: 5,
        startFrameImagePrompt: "image prompt two",
        startFrameImagePromptChars: 17,
        videoPrompt: "video prompt two",
        videoPromptChars: 16,
      },
    ]);
  });

  it("buildAutoReviewPlanReviewSequentialShotRows resolves to [] for a non-sequential (legacy or absent) run", () => {
    expect(buildAutoReviewPlanReviewSequentialShotRows({})).toEqual([]);
    expect(buildAutoReviewPlanReviewSequentialShotRows(null)).toEqual([]);
  });

  it("buildAutoReviewPlanReviewPromptBudgets defaults image to 4000 and video to 2000, honoring a valid sequentialImagePromptMaxChars override", () => {
    expect(buildAutoReviewPlanReviewPromptBudgets({})).toEqual({
      imageMaxChars: 4000,
      videoMaxChars: 2000,
    });
    expect(
      buildAutoReviewPlanReviewPromptBudgets({
        sequentialImagePromptMaxChars: 2500,
      })
    ).toEqual({ imageMaxChars: 2500, videoMaxChars: 2000 });
    // Non-positive/non-finite overrides fall back to the default rather
    // than producing an impossible 0/negative budget.
    expect(
      buildAutoReviewPlanReviewPromptBudgets({
        sequentialImagePromptMaxChars: 0,
      })
    ).toEqual({ imageMaxChars: 4000, videoMaxChars: 2000 });
    expect(
      buildAutoReviewPlanReviewPromptBudgets({
        sequentialImagePromptMaxChars: "not-a-number",
      })
    ).toEqual({ imageMaxChars: 4000, videoMaxChars: 2000 });
  });

  it("buildAutoReviewPlanReviewReferenceManifestRows reads sequentialStoryboard.referenceManifest, sorts by index, and drops malformed entries", () => {
    const rows = buildAutoReviewPlanReviewReferenceManifestRows({
      sequentialStoryboard: {
        referenceManifest: [
          { index: 2, role: "product_angle", angleLabel: "back" },
          { index: 0, role: "junk" },
          "not-an-object",
          { index: 1, role: "primary_product" },
          {
            index: 5,
            role: "product_angle",
            angleLabel: "package",
            evidenceOnly: true,
          },
        ],
      },
    });
    expect(rows).toEqual([
      {
        index: 1,
        role: "primary_product",
        angleLabel: undefined,
        evidenceOnly: false,
      },
      {
        index: 2,
        role: "product_angle",
        angleLabel: "back",
        evidenceOnly: false,
      },
      {
        index: 5,
        role: "product_angle",
        angleLabel: "package",
        evidenceOnly: true,
      },
    ]);
  });

  it("buildAutoReviewPlanReviewReferenceManifestRows resolves to [] for a run with no manifest, never throwing", () => {
    expect(buildAutoReviewPlanReviewReferenceManifestRows({})).toEqual([]);
    expect(buildAutoReviewPlanReviewReferenceManifestRows(null)).toEqual([]);
    expect(buildAutoReviewPlanReviewReferenceManifestRows(undefined)).toEqual(
      []
    );
  });

  it("extractAutoReviewPlanReviewPromptImageCitations scans @ImageN citations in first-seen order, deduplicated, and never throws on empty/malformed input", () => {
    expect(
      extractAutoReviewPlanReviewPromptImageCitations(
        "Use @Image1 as the product. @Image3 is the character. @Image1 again."
      )
    ).toEqual([1, 3]);
    expect(extractAutoReviewPlanReviewPromptImageCitations("")).toEqual([]);
    expect(
      extractAutoReviewPlanReviewPromptImageCitations("no citations here")
    ).toEqual([]);
  });

  it("buildAutoReviewPlanReviewPromptCitationChips marks each citation valid/invalid against the manifest index set", () => {
    const chips = buildAutoReviewPlanReviewPromptCitationChips(
      "Use @Image1 and @Image2 and @Image9.",
      new Set([1, 2])
    );
    expect(chips).toEqual([
      { index: 1, valid: true },
      { index: 2, valid: true },
      { index: 9, valid: false },
    ]);
  });

  it("buildAutoReviewPlanReviewCreditEstimate is sequential-only and derives N from the actual shot count", () => {
    const metadataJson = {
      qualityMode: "balanced",
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          purpose: "x",
        })),
      },
    };
    expect(
      buildAutoReviewPlanReviewCreditEstimate(
        metadataJson,
        "sequential_shot_storyboard"
      )
    ).toEqual({ typical: 9, worst: 27 });

    // fast_draft -> 1 round, premium_strict_qa -> 4 rounds.
    expect(
      buildAutoReviewPlanReviewCreditEstimate(
        { ...metadataJson, qualityMode: "fast_draft" },
        "sequential_shot_storyboard"
      )
    ).toEqual({ typical: 9, worst: 9 });
    expect(
      buildAutoReviewPlanReviewCreditEstimate(
        { ...metadataJson, qualityMode: "premium_strict_qa" },
        "sequential_shot_storyboard"
      )
    ).toEqual({ typical: 9, worst: 36 });
  });

  it("buildAutoReviewPlanReviewCreditEstimate omits (returns null) for non-sequential strategies rather than inventing a multiplier", () => {
    const metadataJson = {
      sequentialStoryboard: { shots: [{ shot_id: 1 }] },
    };
    expect(
      buildAutoReviewPlanReviewCreditEstimate(
        metadataJson,
        "storyboard_3x3_split"
      )
    ).toBeNull();
    expect(
      buildAutoReviewPlanReviewCreditEstimate(
        metadataJson,
        "video_shot_start_stop"
      )
    ).toBeNull();
    expect(
      buildAutoReviewPlanReviewCreditEstimate({}, "sequential_shot_storyboard")
    ).toBeNull();
  });

  it("buildAutoReviewPlanReviewSettingRows includes only fields actually present in metadata, never inventing a value", () => {
    const rows = buildAutoReviewPlanReviewSettingRows(
      {},
      "storyboard_3x3_split",
      "storyboard_images",
      "en"
    );
    // frameStrategy + outputMode are always structurally known even on an
    // otherwise-empty run.
    expect(rows.map(row => row.key)).toEqual(["outputMode", "frameStrategy"]);
  });

  it("buildAutoReviewPlanReviewSettingRows surfaces reviewTone, storytellingStructure, qualityMode, and free-text fields when present", () => {
    const rows = buildAutoReviewPlanReviewSettingRows(
      {
        qualityMode: "premium_strict_qa",
        creativeBrief: "Emphasize the waterproof zipper",
        motionDirection: "slow push-in",
        characterPresenceMode: "every_frame",
        referenceAnchors: {
          reviewTone: "funny_light",
          storytellingStructure: "aida",
        },
        sequentialStoryboard: {
          userInputs: {
            targetAudience: "new parents",
            userRequirements: "keep it under 30s",
            forbiddenClaims: ["cures anything", "100% guaranteed"],
            confirmedAttributes: { material: "hard plastic" },
          },
        },
      },
      "sequential_shot_storyboard",
      "full_video",
      "en"
    );
    const byKey = Object.fromEntries(rows.map(row => [row.key, row.value]));
    expect(byKey.reviewTone).toBe("Light & funny");
    expect(byKey.storytellingStructure).toBe("AIDA");
    expect(byKey.qualityMode).toBe("High QA (up to 4 rounds/shot)");
    expect(byKey.creativeBrief).toBe("Emphasize the waterproof zipper");
    expect(byKey.motionDirection).toBe("slow push-in");
    expect(byKey.characterPresenceMode).toBe("Every frame");
    expect(byKey.targetAudience).toBe("new parents");
    expect(byKey.userRequirements).toBe("keep it under 30s");
    expect(byKey.forbiddenClaims).toBe("cures anything, 100% guaranteed");
    expect(byKey.confirmedAttributes).toBe("material: hard plastic");
  });

  it("buildAutoReviewPlanReviewSettingRows omits characterPresenceMode when it is the default 'auto' (a no-op, not a deliberate choice)", () => {
    const rows = buildAutoReviewPlanReviewSettingRows(
      { characterPresenceMode: "auto" },
      "storyboard_3x3_split",
      "storyboard_images",
      "en"
    );
    expect(rows.some(row => row.key === "characterPresenceMode")).toBe(false);
  });

  it("buildAutoReviewPlanReviewPlanData bundles every projector from one metadataJson", () => {
    const data = buildAutoReviewPlanReviewPlanData(
      {
        qualityMode: "balanced",
        concept: {
          productDetail: "Product facts",
          storyboardGuide: "Guide",
          voiceoverScript: "Script",
        },
        sequentialImagePromptMaxChars: 3000,
        sequentialStoryboard: {
          shots: [{ shot_id: 1, purpose: "hook_open" }],
          referenceManifest: [{ index: 1, role: "primary_product" }],
        },
      },
      "sequential_shot_storyboard",
      "storyboard_images",
      "en"
    );
    expect(data.productDetail).toBe("Product facts");
    expect(data.sequentialShots).toHaveLength(1);
    expect(data.creditEstimate).toEqual({ typical: 1, worst: 3 });
    expect(data.settings.some(row => row.key === "frameStrategy")).toBe(true);
    expect(data.promptBudgets).toEqual({
      imageMaxChars: 3000,
      videoMaxChars: 2000,
    });
    expect(data.referenceManifest).toEqual([
      {
        index: 1,
        role: "primary_product",
        angleLabel: undefined,
        evidenceOnly: false,
      },
    ]);
    expect(data.isDegradedFallback).toBe(false);
  });

  it("isAutoReviewPlanReviewDegradedPlan detects EITHER the degraded flag or a skillVersion containing 'degraded', and never throws on missing metadata", () => {
    expect(isAutoReviewPlanReviewDegradedPlan(undefined)).toBe(false);
    expect(isAutoReviewPlanReviewDegradedPlan(null)).toBe(false);
    expect(isAutoReviewPlanReviewDegradedPlan({})).toBe(false);
    expect(
      isAutoReviewPlanReviewDegradedPlan({
        sequentialStoryboard: { degraded: true },
      })
    ).toBe(true);
    expect(
      isAutoReviewPlanReviewDegradedPlan({
        sequentialStoryboard: { skillVersion: "1.0.0-degraded" },
      })
    ).toBe(true);
    expect(
      isAutoReviewPlanReviewDegradedPlan({
        sequentialStoryboard: { skillVersion: "1.2.0", degraded: false },
      })
    ).toBe(false);
  });

  it("buildAutoReviewPlanReviewPlanData bundles isDegradedFallback from isAutoReviewPlanReviewDegradedPlan", () => {
    const data = buildAutoReviewPlanReviewPlanData(
      { sequentialStoryboard: { degraded: true, shots: [] } },
      "sequential_shot_storyboard",
      "storyboard_images",
      "en"
    );
    expect(data.isDegradedFallback).toBe(true);
  });
});
