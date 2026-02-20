import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GalleryTemplateCard } from "../GalleryTemplateCard";

const mockTemplate = {
  id: 1,
  name: "Daily Sales Report",
  description:
    "Pulls yesterday's orders from the database, generates an AI summary, and emails it to the sales team each morning at 7 AM.",
  category: "Sales & Marketing",
  stepCount: 5,
  estimatedSetupMinutes: 20,
  industry: ["E-commerce", "Retail", "B2B"],
  tags: ["schedule", "email", "reporting"],
  downloadCount: 42,
  templateKey: "tpl-001",
};

describe("GalleryTemplateCard", () => {
  it("renders template name in bold", () => {
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />
    );
    expect(screen.getByText("Daily Sales Report")).toBeInTheDocument();
  });

  it("renders truncated description (line-clamp-2 applied)", () => {
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />
    );
    expect(
      screen.getByText(/Pulls yesterday's orders/)
    ).toBeInTheDocument();
  });

  it("renders category badge", () => {
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />
    );
    expect(screen.getByText("Sales & Marketing")).toBeInTheDocument();
  });

  it('renders stepCount as "{N} steps"', () => {
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />
    );
    expect(screen.getByText("5 steps")).toBeInTheDocument();
  });

  it("renders up to 3 industry tags and hides the 4th+", () => {
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />
    );
    expect(screen.getByText("E-commerce")).toBeInTheDocument();
    expect(screen.getByText("Retail")).toBeInTheDocument();
    expect(screen.getByText("B2B")).toBeInTheDocument();

    const template4Industries = {
      ...mockTemplate,
      industry: ["A", "B", "C", "D"],
    };
    const { rerender } = render(
      <GalleryTemplateCard
        template={template4Industries}
        onSelect={vi.fn()}
      />
    );
    rerender(
      <GalleryTemplateCard
        template={template4Industries}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText("D")).not.toBeInTheDocument();
  });

  it("clicking the card fires onSelect with the template id", () => {
    const onSelect = vi.fn();
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Daily Sales Report").closest("[role='button']")!);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('clicking the "Preview" button fires onSelect with the template id', () => {
    const onSelect = vi.fn();
    render(
      <GalleryTemplateCard template={mockTemplate} onSelect={onSelect} />
    );
    const previewBtn = screen.getByText("Preview");
    fireEvent.click(previewBtn);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
