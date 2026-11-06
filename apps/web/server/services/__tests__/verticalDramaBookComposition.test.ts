import { describe, expect, it, vi } from "vitest";

const { mockResolveSelection, mockCalculateCredits } = vi.hoisted(() => ({
  mockResolveSelection: vi.fn(),
  mockCalculateCredits: vi.fn(),
}));

vi.mock("../chatModelSelection", () => ({
  resolveStructuredAutoChatModelSelection: mockResolveSelection,
}));
vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: mockCalculateCredits,
  createCreditReservation: vi.fn(),
  refundReservation: vi.fn(),
}));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../callLLMStructured", () => ({ callLLMStructured: vi.fn() }));

import { estimateVerticalDramaBookCompositionCredits } from "../verticalDramaBookComposition";

describe("estimateVerticalDramaBookCompositionCredits", () => {
  it("quotes the selected model with two attempts and price-drift headroom", async () => {
    mockResolveSelection.mockResolvedValue({ resolvedModelId: "provider/model" });
    mockCalculateCredits.mockResolvedValue(12);

    await expect(estimateVerticalDramaBookCompositionCredits({
      chapterCount: 3,
      maxInputBytesPerChapter: 90_000,
    })).resolves.toEqual({ modelId: "provider/model", preferredProviderId: null, estimatedCredits: 144 });
    expect(mockCalculateCredits).toHaveBeenCalledWith(90_000, 7000, "provider/model", undefined);
  });
});
