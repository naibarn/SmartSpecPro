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
  it("promotes a clicked image to the product hero and keeps angle selection separate", () => {
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

    expect(screen.getByText(/Product Anchor.*Hero หลัก/)).toBeTruthy();
    expect(
      screen.getByText(/ปุ่มภาพมุมเสริมเพื่อเพิ่ม reference/)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /เลือกภาพสินค้า 2 เป็น Product Anchor \/ Hero หลัก/i,
      })
    );
    expect(onPrimaryChange).toHaveBeenCalledWith("side");

    fireEvent.click(
      screen.getByRole("button", { name: "เลือกเป็นภาพมุมเสริม" })
    );
    expect(onToggleSupportingImage).toHaveBeenCalledWith("side");
  });
});
