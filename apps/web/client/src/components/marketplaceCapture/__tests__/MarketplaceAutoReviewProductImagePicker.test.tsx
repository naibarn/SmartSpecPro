import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceAutoReviewProductImagePicker } from "../MarketplaceAutoReviewProductImagePicker";

const images = [
  {
    id: "hero",
    url: "https://example.com/hero.jpg",
    type: "Hero",
    isHero: true,
  },
  { id: "side", url: "https://example.com/side.jpg", type: "Side" },
];

describe("MarketplaceAutoReviewProductImagePicker", () => {
  it("shows the primary anchor and lets the user select a supporting angle", () => {
    const onToggleSupportingImage = vi.fn();
    const onPrimaryChange = vi.fn();
    render(
      <MarketplaceAutoReviewProductImagePicker
        images={images}
        primaryImageId="hero"
        selectedSupportingImageIds={new Set()}
        angleLabelsByImageId={{}}
        sequentialEnabled
        capacity={{
          modelCap: 4,
          attachedAngles: 1,
          trimmedAngles: [],
          capacityImpossible: false,
        }}
        modelLabel="test-image-model"
        onPrimaryChange={onPrimaryChange}
        onToggleSupportingImage={onToggleSupportingImage}
        onAngleLabelChange={vi.fn()}
      />
    );

    expect(screen.getByText("Product Anchor หลัก")).toBeTruthy();
    expect(
      screen.getByText(/ภาพมุมเสริมที่จะส่งเข้า storyboard นี้โดยเฉพาะ/)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /เลือกภาพสินค้า 2 เป็นภาพมุมเสริม/i })
    );
    expect(onToggleSupportingImage).toHaveBeenCalledWith("side");

    fireEvent.click(
      screen.getByRole("button", { name: "ใช้เป็น Product Anchor หลัก" })
    );
    expect(onPrimaryChange).toHaveBeenCalledWith("side");
  });
});
