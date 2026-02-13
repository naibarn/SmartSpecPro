/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SilenceDetectionPanel from "../SilenceDetectionPanel";

describe("SilenceDetectionPanel (trigger mode)", () => {
  it('renders trigger button with "Open Silence Detection" text', () => {
    render(<SilenceDetectionPanel onOpenDialog={() => {}} />);

    expect(screen.getByText("Open Silence Detection")).toBeDefined();
  });

  it("calls onOpenDialog when button is clicked", () => {
    const mockOnOpen = vi.fn();
    render(<SilenceDetectionPanel onOpenDialog={mockOnOpen} />);

    const btn = screen.getByTestId("open-silence-dialog");
    fireEvent.click(btn);

    expect(mockOnOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the title text", () => {
    render(<SilenceDetectionPanel onOpenDialog={() => {}} />);

    expect(screen.getByText("Silence Detection")).toBeDefined();
  });
});
