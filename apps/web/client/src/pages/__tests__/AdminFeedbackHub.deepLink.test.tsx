import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  parseFeedbackTicketId,
  pinSelectedFeedbackTicket,
  sortFeedbackTicketsNewestFirst,
} from "../feedbackHubNavigation";
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

  it("keeps the notification target visible at the top of the queue", () => {
    const tickets = [
      { id: 605, createdAt: "2026-09-18T12:34:00.000Z", isRead: false },
      { id: 603, createdAt: "2026-09-18T09:16:00.000Z", isRead: false },
      { id: 606, createdAt: "2026-09-19T12:45:00.000Z", isRead: true },
    ];

    const ordered = pinSelectedFeedbackTicket(
      sortFeedbackTicketsNewestFirst(tickets),
      606,
    );

    expect(ordered.map(ticket => ticket.id)).toEqual([606, 605, 603]);
  });

  it("sorts read and unread tickets by newest creation time when no ticket is selected", () => {
    const ordered = sortFeedbackTicketsNewestFirst([
      { id: 603, createdAt: "2026-09-18T09:16:00.000Z", isRead: false },
      { id: 606, createdAt: "2026-09-19T12:45:00.000Z", isRead: true },
    ]);

    expect(ordered.map(ticket => ticket.id)).toEqual([606, 603]);
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
    expect(getFeedbackLightboxImageStyle(0.25, { width: 8000, height: 12000 }))
      .toEqual({ width: "25%", height: "auto", maxHeight: "calc((100dvh - 8rem) * 0.25)" });
    expect(clampFeedbackLightboxZoom(2.5)).toBe(2.5);
    expect(getFeedbackLightboxZoomPercent(2.5)).toBe(250);
    expect(
      getFeedbackLightboxImageStyle(1, { width: 100, height: 50 })
    ).toEqual({ width: "100%", height: "auto", maxHeight: "calc((100dvh - 8rem) * 1)" });
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
    expect(screen.getByRole("button", { name: "ย่อภาพ" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ย่อภาพ" }));
    expect(onScaleChange).toHaveBeenCalledWith(0.75);
    expect(screen.getByRole("button", { name: "ขยายภาพ" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ขยายภาพ" }));
    expect(onScaleChange).toHaveBeenCalledWith(1.25);

    rerender(
      <FeedbackLightboxZoomControls
        scale={FEEDBACK_LIGHTBOX_ZOOM_MAX}
        onScaleChange={onScaleChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "รีเซ็ตขนาด" }));
    expect(onScaleChange).toHaveBeenCalledWith(1);
    expect(screen.getByText("400%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ขยายภาพ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "รีเซ็ตขนาด" })).toBeEnabled();
    rerender(<FeedbackLightboxZoomControls scale={0.25} onScaleChange={onScaleChange} />);
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ย่อภาพ" })).toBeDisabled();
  });
});
