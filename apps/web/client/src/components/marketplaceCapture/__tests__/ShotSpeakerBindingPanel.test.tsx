import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShotSpeakerBindingPanel } from "../StagedCheckpointReviewPanel";

describe("ShotSpeakerBindingPanel", () => {
  it("explains why a solo narration has no multi-speaker mapping controls", () => {
    render(
      <ShotSpeakerBindingPanel
        shotId={1}
        dialogue="เวลาสระผมให้เด็ก ผมกังวลอยู่สองอย่างเลยครับ"
        soloNarration
        imageUrl="/media/approved-shot.png"
        onSave={vi.fn()}
      />
    );

    expect(
      screen.getByRole("region", { name: "จับคู่ผู้พูดกับคนในภาพช็อตที่ 1" })
    ).toBeTruthy();
    expect(screen.getByText(/โหมดพูดคนเดียว/)).toBeTruthy();
  });
});
