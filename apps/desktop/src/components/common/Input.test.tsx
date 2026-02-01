import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "./Input";

describe("Input Component", () => {
  it("renders correctly with label", () => {
    render(<Input label="Username" placeholder="Enter username" />);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter username")).toBeInTheDocument();
  });

  it("handles value changes", () => {
    render(<Input label="Username" />);
    const input = screen.getByLabelText("Username") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "manus" } });
    expect(input.value).toBe("manus");
  });

  it("displays error message and applies error styles", () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("border-red-500");
  });

  it("displays hint message when no error", () => {
    render(<Input label="Password" hint="Min 8 characters" />);
    expect(screen.getByText("Min 8 characters")).toBeInTheDocument();
  });

  it("renders with icons", () => {
    const leftIcon = <span data-testid="left-icon">👤</span>;
    const rightIcon = <span data-testid="right-icon">✅</span>;
    render(<Input leftIcon={leftIcon} rightIcon={rightIcon} />);
    expect(screen.getByTestId("left-icon")).toBeInTheDocument();
    expect(screen.getByTestId("right-icon")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Input label="Disabled" disabled />);
    const input = screen.getByLabelText("Disabled");
    expect(input).toBeDisabled();
  });
});
