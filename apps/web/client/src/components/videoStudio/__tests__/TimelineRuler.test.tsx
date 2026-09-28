/**
 * Feature 143, P1 — `TimelineRuler` tick generation + click-to-seek.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineRuler, tickIntervalMs } from "../TimelineRuler";

describe("tickIntervalMs", () => {
  it("uses 1s ticks above 50 px/sec", () => {
    expect(tickIntervalMs(60)).toBe(1000);
  });
  it("uses 5s ticks between 20 and 50 px/sec", () => {
    expect(tickIntervalMs(30)).toBe(5000);
  });
  it("uses 10s ticks at/below 20 px/sec", () => {
    expect(tickIntervalMs(10)).toBe(10000);
  });
});

describe("TimelineRuler tick rendering at two zoom levels", () => {
  it("renders more visible tick labels at a high zoom (1s interval) than a low zoom (10s interval) over the same duration", () => {
    const onSeek = vi.fn();
    const { unmount } = render(
      <TimelineRuler contentDurationMs={10000} pxPerSecond={100} onSeek={onSeek} />,
    );
    // 100 px/sec > 50 -> 1s ticks -> 11 ticks for 0..10000ms inclusive
    expect(screen.getAllByText(/^0:0\d$/).length).toBeGreaterThanOrEqual(10);
    unmount();

    render(<TimelineRuler contentDurationMs={10000} pxPerSecond={10} onSeek={onSeek} />);
    // 10 px/sec -> 10s ticks -> only 0:00 and 0:10
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("0:10")).toBeInTheDocument();
    expect(screen.queryByText("0:05")).not.toBeInTheDocument();
  });
});

describe("TimelineRuler click-to-seek", () => {
  it("reports the clicked position converted from px to ms via onSeek", () => {
    const onSeek = vi.fn();
    render(<TimelineRuler contentDurationMs={10000} pxPerSecond={100} onSeek={onSeek} />);
    const ruler = screen.getByTestId("vs-timeline-ruler");
    // jsdom getBoundingClientRect defaults to {left: 0, ...}, so clientX IS
    // the local x. 100 px/sec -> pxPerMs = 0.1 -> clientX=250 -> 2500ms.
    fireEvent.click(ruler, { clientX: 250 });
    expect(onSeek).toHaveBeenCalledWith(2500);
  });

  it("clamps the seek position to [0, contentDurationMs]", () => {
    const onSeek = vi.fn();
    render(<TimelineRuler contentDurationMs={1000} pxPerSecond={100} onSeek={onSeek} />);
    const ruler = screen.getByTestId("vs-timeline-ruler");
    fireEvent.click(ruler, { clientX: 999999 });
    expect(onSeek).toHaveBeenCalledWith(1000);
  });
});
