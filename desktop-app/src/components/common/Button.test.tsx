import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button Component", () => {
  it("renders correctly with children", () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText("Click Me")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    fireEvent.click(screen.getByText("Click Me"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when loading is true", () => {
    render(<Button loading={true}>Click Me</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled={true}>Click Me</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("renders with different variants", () => {
    const { rerender } = render(<Button variant="danger">Danger</Button>);
    let button = screen.getByRole("button");
    expect(button).toHaveClass("bg-red-600");

    rerender(<Button variant="secondary">Secondary</Button>);
    button = screen.getByRole("button");
    expect(button).toHaveClass("bg-gray-700");
  });

  it("renders with icons", () => {
    const icon = <span data-testid="test-icon">🚀</span>;
    render(<Button icon={icon}>With Icon</Button>);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });
});
