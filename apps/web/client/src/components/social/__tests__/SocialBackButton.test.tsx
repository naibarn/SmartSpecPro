/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/social/inbox", setLocationMock] as const,
}));

import { SocialBackButton } from "../SocialBackButton";

describe("SocialBackButton", () => {
  it("navigates back to the dashboard", () => {
    render(<SocialBackButton />);

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

    expect(setLocationMock).toHaveBeenCalledWith("/dashboard");
  });
});
