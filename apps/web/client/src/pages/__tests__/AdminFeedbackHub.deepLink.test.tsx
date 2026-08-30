import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseFeedbackTicketId } from "../feedbackHubNavigation";
import { FeedbackLightboxZoomControls } from "../FeedbackLightboxZoomControls";
import {
  clampFeedbackLightboxZoom,
  FEEDBACK_LIGHTBOX_ZOOM_MAX,
  FEEDBACK_LIGHTBOX_ZOOM_MIN,
  FEEDBACK_LIGHTBOX_ZOOM_STEP,
  getFeedbackLightboxImageStyle,
  getFeedbackLightboxZoomPercent,
} from "../feedbackHubZoom";

describe("Admin Feedback Hub deep-link and lightbox contracts", () => {
  it("parses a ticket id from the notification deep-link", () => {
    expect(parseFeedbackTicketId("ticketId=508")).toBe(508);
    expect(parseFeedbackTicketId("source=system&ticketId=508")).toBe(508);
  });

  it("ignores a missing or malformed ticket id", () => {
    expect(parseFeedbackTicketId("")).toBeNull();
    expect(parseFeedbackTicketId("ticketId=not-a-number")).toBeNull();
  });

  it("clamps lightbox zoom to readable bounds", () => {
    expect(
      clampFeedbackLightboxZoom(
        FEEDBACK_LIGHTBOX_ZOOM_MIN - FEEDBACK_LIGHTBOX_ZOOM_STEP
      )
    ).toBe(FEEDBACK_LIGHTBOX_ZOOM_MIN);
    expect(
      clampFeedbackLightboxZoom(
        FEEDBACK_LIGHTBOX_ZOOM_MAX + FEEDBACK_LIGHTBOX_ZOOM_STEP
      )
    ).toBe(FEEDBACK_LIGHTBOX_ZOOM_MAX);
    expect(clampFeedbackLightboxZoom(2.5)).toBe(2.5);
    expect(getFeedbackLightboxZoomPercent(2.5)).toBe(250);
    expect(
      getFeedbackLightboxImageStyle(1, { width: 100, height: 50 })
    ).toBeUndefined();
    expect(
      getFeedbackLightboxImageStyle(1.25, { width: 100, height: 50 })
    ).toEqual({
      width: "125px",
      height: "62.5px",
    });
  });

  it("renders accessible controls and disables zoom at the bounds", () => {
    const onScaleChange = vi.fn();
    const { rerender } = render(
      <FeedbackLightboxZoomControls scale={1} onScaleChange={onScaleChange} />
    );

    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ย่อภาพ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ขยายภาพ" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ขยายภาพ" }));
    expect(onScaleChange).toHaveBeenCalledWith(1.25);

    rerender(
      <FeedbackLightboxZoomControls
        scale={FEEDBACK_LIGHTBOX_ZOOM_MAX}
        onScaleChange={onScaleChange}
      />
    );
    expect(screen.getByText("400%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ขยายภาพ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "รีเซ็ตขนาด" })).toBeEnabled();
  });
});
