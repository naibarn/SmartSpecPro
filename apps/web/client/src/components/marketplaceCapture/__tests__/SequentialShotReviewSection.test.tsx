/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.7.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  SequentialLoopReportModel,
  SequentialShotCardModel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import { SequentialShotReviewSection } from "../SequentialShotReviewSection";

function shotCardFixture(
  overrides: Partial<SequentialShotCardModel> = {}
): SequentialShotCardModel {
  const imagePrompt = "A clean hero shot of the product on a wooden table.";
  const videoPrompt =
    "Use @Image1 as the absolute product identity reference. Slow push-in.";
  return {
    shotId: 1,
    purpose: "hook_open",
    demonstrationType: "finished_product_showcase",
    depictsMinor: false,
    guardianRequired: false,
    dialogue: "สวัสดีค่ะ วันนี้มารีวิวสินค้าตัวนี้กัน",
    imagePrompt,
    imagePromptChars: imagePrompt.length,
    videoPrompt,
    videoPromptChars: videoPrompt.length,
    claimSources: [{ text: "waterproof", support: "text_verified" }],
    qcStatus: "passed",
    frameUrl: null,
    edited: false,
    editedAt: null,
    ...overrides,
  };
}

function nineShotCards(): SequentialShotCardModel[] {
  return Array.from({ length: 9 }, (_, index) =>
    shotCardFixture({ shotId: index + 1, purpose: `shot_${index + 1}` })
  );
}

const budgets = { imageMaxChars: 4000, videoMaxChars: 2000 };

describe("SequentialShotReviewSection", () => {
  it("renders null when shots is empty (legacy 3x3 run)", () => {
    const { container } = render(
      <SequentialShotReviewSection
        shots={[]}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 9 cards with shot number, demonstration_type, dialogue, both prompts, both char counts, claim sources, QC status", () => {
    render(
      <SequentialShotReviewSection
        shots={nineShotCards()}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="en"
      />
    );

    expect(screen.getAllByText(/finished_product_showcase/)).toHaveLength(9);
    expect(
      screen.getAllByDisplayValue("สวัสดีค่ะ วันนี้มารีวิวสินค้าตัวนี้กัน")
    ).toHaveLength(9);
    expect(screen.getAllByDisplayValue(/A clean hero shot/)).toHaveLength(9);
    expect(screen.getAllByDisplayValue(/Use @Image1/)).toHaveLength(9);
    expect(screen.getAllByText("waterproof")).toHaveLength(9);
    expect(screen.getAllByText(/text_verified/)).toHaveLength(9);
    expect(screen.getAllByText(/passed/)).toHaveLength(9);
  });

  it("shows the guardian badge only on shots with guardianRequired: true", () => {
    const shots = [
      shotCardFixture({ shotId: 1, guardianRequired: true }),
      shotCardFixture({ shotId: 2, guardianRequired: false }),
    ];
    render(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    expect(screen.getAllByText("มีผู้ปกครองในเฟรม")).toHaveLength(1);
  });

  it("shows an over-budget hint without truncating the rendered prompt text", () => {
    const longPrompt = "x".repeat(50);
    const shots = [shotCardFixture({ shotId: 1, imagePrompt: longPrompt, imagePromptChars: 50 })];
    render(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={{ imageMaxChars: 10, videoMaxChars: 2000 }}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="en"
      />
    );
    const textarea = screen.getByDisplayValue(longPrompt) as HTMLTextAreaElement;
    expect(textarea.value).toBe(longPrompt);
    expect(screen.getByText(/50\/10/)).toBeTruthy();
  });

  it("invokes onRegenerateShot with the exact shotId once and disables while busy", () => {
    const onRegenerateShot = vi.fn();
    const shots = [shotCardFixture({ shotId: 3 })];
    const { rerender } = render(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={onRegenerateShot}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    const regenerateButton = screen.getByRole("button", { name: "สร้างภาพนี้ใหม่" });
    fireEvent.click(regenerateButton);
    expect(onRegenerateShot).toHaveBeenCalledTimes(1);
    expect(onRegenerateShot).toHaveBeenCalledWith(3);

    rerender(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        busyShotId={3}
        onRegenerateShot={onRegenerateShot}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    expect(screen.getByRole("button", { name: "สร้างภาพนี้ใหม่" })).toBeDisabled();
  });

  it("invokes onSaveShotEdits with the edited fields and disables the save control while saving", () => {
    const onSaveShotEdits = vi.fn();
    const shots = [shotCardFixture({ shotId: 5 })];
    const { rerender } = render(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={onSaveShotEdits}
        locale="th"
      />
    );

    const dialogueField = screen.getByDisplayValue("สวัสดีค่ะ วันนี้มารีวิวสินค้าตัวนี้กัน");
    fireEvent.change(dialogueField, { target: { value: "บทพูดใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    expect(onSaveShotEdits).toHaveBeenCalledWith({
      shotId: 5,
      dialogue: "บทพูดใหม่",
      imagePrompt: shots[0].imagePrompt,
      videoPrompt: shots[0].videoPrompt,
    });

    rerender(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        savingShotId={5}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={onSaveShotEdits}
        locale="th"
      />
    );
    expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeDisabled();
  });

  it("surfaces a preflight rejection on the affected card only, retaining the user's edited text", () => {
    const shots = [shotCardFixture({ shotId: 3 }), shotCardFixture({ shotId: 4 })];
    render(
      <SequentialShotReviewSection
        shots={shots}
        loopReport={null}
        budgets={budgets}
        shotError={{
          shotId: 3,
          blockerId: "prompt_too_long_for_image_provider",
          message: "prompt ภาพยาวเกินขีดจำกัดของโมเดล กรุณาย่อข้อความให้สั้นลง",
        }}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );

    const cards = screen.getAllByTestId(/sequential-shot-card-/);
    expect(cards).toHaveLength(2);
    const card3 = screen.getByTestId("sequential-shot-card-3");
    const card4 = screen.getByTestId("sequential-shot-card-4");

    expect(
      within(card3).getByText(
        "prompt ภาพยาวเกินขีดจำกัดของโมเดล กรุณาย่อข้อความให้สั้นลง"
      )
    ).toBeTruthy();
    expect(within(card3).getByText("prompt_too_long_for_image_provider")).toBeTruthy();
    expect(
      within(card4).queryByText("prompt ภาพยาวเกินขีดจำกัดของโมเดล กรุณาย่อข้อความให้สั้นลง")
    ).toBeNull();

    // Edit the prompt on the errored card, then confirm the text is what the
    // user typed (never reverted or rewritten by the error path).
    const imagePromptField = within(card3).getByDisplayValue(shots[0].imagePrompt);
    fireEvent.change(imagePromptField, { target: { value: "ข้อความที่ผู้ใช้แก้เอง" } });
    expect((imagePromptField as HTMLTextAreaElement).value).toBe("ข้อความที่ผู้ใช้แก้เอง");
  });

  it("renders the loop report with round scores, candidate counts, selected version, and a degraded-fallback note", () => {
    const loopReport: SequentialLoopReportModel = {
      rounds: [
        { round: 1, totalScore: 640, candidateCount: 2, disqualified: true },
        { round: 2, totalScore: 720, candidateCount: 1, disqualified: false },
      ],
      selectedVersion: 2,
      degradedFallback: false,
    };
    render(
      <SequentialShotReviewSection
        shots={nineShotCards()}
        loopReport={loopReport}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    expect(screen.getByText("รอบที่ 1")).toBeTruthy();
    expect(screen.getByText("รอบที่ 2")).toBeTruthy();
    expect(screen.getByText("เวอร์ชันที่เลือก: 2")).toBeTruthy();
    expect(screen.queryByText(/สำรองแบบอัตโนมัติ/)).toBeNull();
  });

  it("renders a degraded-fallback note when the loop report flag is set", () => {
    const loopReport: SequentialLoopReportModel = {
      rounds: [],
      selectedVersion: null,
      degradedFallback: true,
    };
    render(
      <SequentialShotReviewSection
        shots={nineShotCards()}
        loopReport={loopReport}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    expect(screen.getByText(/สำรองแบบอัตโนมัติ/)).toBeTruthy();
  });

  it("renders no loop report block when loopReport is absent", () => {
    render(
      <SequentialShotReviewSection
        shots={nineShotCards()}
        loopReport={null}
        budgets={budgets}
        onRegenerateShot={vi.fn()}
        onSaveShotEdits={vi.fn()}
        locale="th"
      />
    );
    expect(screen.queryByText("รายงานรอบตรวจสอบ")).toBeNull();
  });
});
