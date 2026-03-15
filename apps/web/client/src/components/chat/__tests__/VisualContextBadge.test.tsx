import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisualContextBadge } from "../VisualContextBadge";

describe("VisualContextBadge", () => {
  it("shows correct image count", () => {
    render(<VisualContextBadge count={3} />);
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  it("is hidden when count is 0", () => {
    const { container } = render(<VisualContextBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows singular label for count=1", () => {
    render(<VisualContextBadge count={1} />);
    expect(screen.getByText(/1 image/i)).toBeTruthy();
  });

  it("shows plural label for count=3", () => {
    render(<VisualContextBadge count={3} />);
    expect(screen.getByText(/3 images/i)).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<VisualContextBadge count={2} onClick={onClick} />);
    screen.getByText(/2 images/i).click();
    expect(onClick).toHaveBeenCalled();
  });
});
