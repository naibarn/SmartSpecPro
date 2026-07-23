/**
 * Marketplace mandatory text-plan review gate (2026-07-23,
 * planning/marketplace-storyboard-text-gate, commit f997ba1a9).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AutoReviewPlanReviewPanel,
  buildAutoReviewPlanReviewCreditEstimate,
  buildAutoReviewPlanReviewPlanData,
  buildAutoReviewPlanReviewPlanText,
  buildAutoReviewPlanReviewSequentialShotRows,
  buildAutoReviewPlanReviewSettingRows,
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
    isDegradedFallback: false,
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
            {
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "เห็นกระบอกน้ำวางบนโต๊ะ",
              dialogue: "สวัสดีค่ะ",
              durationSeconds: 4,
            },
            {
              shotId: 2,
              purpose: "problem",
              visualSummary: "น้ำหกเปียกกระเป๋า",
              dialogue: "",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "เห็นกระบอกน้ำวางบนโต๊ะ",
              dialogue: "",
              durationSeconds: 4,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "wide shot of the product",
              dialogue: "",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "hook_open",
              visualSummary: "a",
              dialogue: "สวัสดีค่ะ",
              durationSeconds: 4,
            },
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
            {
              shotId: 3,
              purpose: "hook_open",
              visualSummary: "a",
              dialogue: "เดิม",
              durationSeconds: 4,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "a",
              dialogue: "เดิม",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "a",
              dialogue: "เดิม",
              durationSeconds: null,
            },
            {
              shotId: 2,
              purpose: "",
              visualSummary: "b",
              dialogue: "อื่น",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "a",
              dialogue: "เดิม",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "a",
              dialogue: "ใหม่แล้ว",
              durationSeconds: null,
            },
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
            {
              shotId: 2,
              purpose: "problem",
              visualSummary: "wrong material shown",
              dialogue: "",
              durationSeconds: null,
            },
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
            {
              shotId: 1,
              purpose: "",
              visualSummary: "a",
              dialogue: "",
              durationSeconds: null,
            },
            {
              shotId: 5,
              purpose: "",
              visualSummary: "b",
              dialogue: "",
              durationSeconds: null,
            },
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

  it("buildAutoReviewPlanReviewSequentialShotRows reads sequentialStoryboard.shots, sorts by shot_id, and drops malformed entries", () => {
    const rows = buildAutoReviewPlanReviewSequentialShotRows({
      sequentialStoryboard: {
        shots: [
          {
            shot_id: 2,
            purpose: "problem",
            visual_summary: "b",
            dialogue: "d2",
            duration_seconds: 5,
          },
          { shot_id: 0, purpose: "junk" },
          "not-an-object",
          {
            shot_id: 1,
            purpose: "hook_open",
            visual_summary: "a",
            dialogue: "d1",
            duration_seconds: 4,
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
      },
      {
        shotId: 2,
        purpose: "problem",
        visualSummary: "b",
        dialogue: "d2",
        durationSeconds: 5,
      },
    ]);
  });

  it("buildAutoReviewPlanReviewSequentialShotRows resolves to [] for a non-sequential (legacy or absent) run", () => {
    expect(buildAutoReviewPlanReviewSequentialShotRows({})).toEqual([]);
    expect(buildAutoReviewPlanReviewSequentialShotRows(null)).toEqual([]);
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
        sequentialStoryboard: {
          shots: [{ shot_id: 1, purpose: "hook_open" }],
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
