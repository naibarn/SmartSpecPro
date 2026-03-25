/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Workflow } from "lucide-react";
import type { ReactNode } from "react";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/social/publishing", setLocationMock] as const,
}));

import { SocialPageShell } from "../SocialPageShell";

function renderShell(children: ReactNode = <div>Content</div>) {
  return render(
    <SocialPageShell
      icon={Workflow}
      title="Example"
      description="Example description"
      tone="publishing"
      badge={<span>Badge</span>}
      hero={<div>Hero content</div>}
    >
      {children}
    </SocialPageShell>,
  );
}

describe("SocialPageShell", () => {
  it("renders social workspace navigation and highlights the current page", () => {
    renderShell();

    expect(screen.getByText("Social Workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publishing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publishing/i })).toHaveClass("bg-fuchsia-600");
    expect(screen.getByText("Hero content")).toBeInTheDocument();
  });

  it("navigates when a different social tab is clicked", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /inbox/i }));

    expect(setLocationMock).toHaveBeenCalledWith("/social/inbox");
  });
});
