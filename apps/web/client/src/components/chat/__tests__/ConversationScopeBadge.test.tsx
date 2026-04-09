/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationScopeBadge } from "../ConversationScopeBadge";

describe("ConversationScopeBadge", () => {
  it("renders a locked personal badge for personal chats", () => {
    render(<ConversationScopeBadge projectId="personal" />);

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByTitle("Personal scope is locked to this user")).toBeInTheDocument();
  });

  it("renders the project id for work chats", () => {
    render(<ConversationScopeBadge projectId="project-42" />);

    expect(screen.getByText("project-42")).toBeInTheDocument();
    expect(screen.getByTitle("project-42")).toBeInTheDocument();
  });
});
