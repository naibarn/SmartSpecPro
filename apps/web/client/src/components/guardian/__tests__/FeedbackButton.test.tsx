import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", vi.fn()],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import { FeedbackButton } from "../FeedbackButton";

describe("FeedbackButton placement", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("docks to the bottom right by default", () => {
    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open feedback dialog");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
    expect(button.style.top).toBe("");
  });

  it("ignores stored custom positions and docks to the bottom right", () => {
    localStorage.setItem(
      "feedback-button-position",
      JSON.stringify({
        version: 1,
        placement: { mode: "custom", x: 420, y: 240 },
      }),
    );

    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open feedback dialog");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
    expect(button.style.top).toBe("");
    expect(localStorage.getItem("feedback-button-position")).toBeNull();
  });
});
