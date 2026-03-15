/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatHelpDialog } from "../ChatHelpDialog";

describe("ChatHelpDialog", () => {
  it("opens the complete user guide with all sections", () => {
    render(<ChatHelpDialog />);

    fireEvent.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByText("Complete User Guide")).toBeInTheDocument();
    expect(screen.getByText("Chat basics")).toBeInTheDocument();
    expect(screen.getByText("Skills and slash commands")).toBeInTheDocument();
    expect(screen.getByText("Image, video, and audio generation")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Browser Session")).toBeInTheDocument();
  });

  it("includes the agency guide with templates and preview lifecycle", () => {
    render(<ChatHelpDialog />);

    fireEvent.click(screen.getByRole("button", { name: /help/i }));

    // Agency section
    expect(screen.getByText(/Multi-Agent Teams/)).toBeInTheDocument();
    expect(screen.getByText("How to get started")).toBeInTheDocument();

    // Templates
    expect(screen.getByText("Deep Research")).toBeInTheDocument();
    expect(screen.getByText("Storyboard Planner")).toBeInTheDocument();
    expect(screen.getByText("Deck Builder")).toBeInTheDocument();
    expect(screen.getByText("Comparison Agent")).toBeInTheDocument();

    // Preview lifecycle states
    expect(screen.getByText("Preview Ready")).toBeInTheDocument();
    expect(screen.getByText("Committed")).toBeInTheDocument();
    expect(screen.getByText("Save Failed")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();

    // Commit actions table
    expect(screen.getByText("Save to Library")).toBeInTheDocument();
    expect(screen.getByText("Save as Presentation")).toBeInTheDocument();
  });
});
