/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key === "sidebar.personalProject" ? "Personal" : "Project" }),
}));

import { ConversationScopeBadge } from "../ConversationScopeBadge";

describe("ConversationScopeBadge", () => {
  it("renders a locked personal badge for personal chats", () => {
    render(<ConversationScopeBadge projectId="personal" />);

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByTitle("Personal")).toBeInTheDocument();
  });

  it("uses the authorized display name and never exposes an internal project id", () => {
    render(<ConversationScopeBadge projectId="project-42" />);

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByTitle("Project")).toBeInTheDocument();
    expect(screen.queryByText("project-42")).not.toBeInTheDocument();
  });

  it("shows a canonical project name when available", () => {
    render(<ConversationScopeBadge projectId="project-42" projectTitle="SmartAIHub Core" />);

    expect(screen.getByText("SmartAIHub Core")).toBeInTheDocument();
    expect(screen.getByTitle("SmartAIHub Core")).toBeInTheDocument();
  });
});
