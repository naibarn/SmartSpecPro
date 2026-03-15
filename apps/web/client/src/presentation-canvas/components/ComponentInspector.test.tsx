import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildBuiltInPresentationComponentInstance } from "@/lib/presentationComponentCatalog";
import { PRESENTATION_GROUP_COMPONENT_ID, PRESENTATION_GROUP_COMPONENT_REVISION } from "@/lib/presentationEditorState";
import { DEFAULT_PRESENTATION_CANVAS_SIZE } from "@/presentation-canvas/constants";
import { ComponentInspector } from "./ComponentInspector";

describe("ComponentInspector", () => {
  it("shows ungroup actions for grouped element components", () => {
    const onDetachComponent = vi.fn();

    render(
      <ComponentInspector
        components={[
          {
            id: "component-group-1",
            componentId: PRESENTATION_GROUP_COMPONENT_ID,
            componentType: PRESENTATION_GROUP_COMPONENT_ID,
            definitionRevision: PRESENTATION_GROUP_COMPONENT_REVISION,
            slotBindings: [],
            fallbackElements: [
              { id: "title", type: "text", x: 40, y: 60, width: 240, height: 72, text: "Title", color: "#111827" },
              { id: "card", type: "rect", x: 24, y: 24, width: 320, height: 180, fill: "#dbeafe" },
            ],
          },
        ]}
        selectedComponentId="component-group-1"
        onSelectComponent={vi.fn()}
        onUpdateTextSlot={vi.fn()}
        onUpdateImageSlot={vi.fn()}
        onUpdateVideoSlot={vi.fn()}
        onUpdateListSlot={vi.fn()}
        onDetachComponent={onDetachComponent}
        onDeleteComponent={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Group")).toHaveLength(2);
    expect(screen.getByText(/grouped elements/i)).toBeInTheDocument();
    expect(screen.getByText(/ungroup it to edit the individual elements/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ungroup component group to elements/i }));
    expect(onDetachComponent).toHaveBeenCalledWith("component-group-1");
  });

  it("shows thai and english slot capacity hints for built-in text slots", () => {
    const component = buildBuiltInPresentationComponentInstance("article-focus", {
      canvas: DEFAULT_PRESENTATION_CANVAS_SIZE,
      instanceId: "article-focus-1",
    });

    render(
      <ComponentInspector
        components={[component]}
        selectedComponentId="article-focus-1"
        onSelectComponent={vi.fn()}
        onUpdateTextSlot={vi.fn()}
        onUpdateImageSlot={vi.fn()}
        onUpdateVideoSlot={vi.fn()}
        onUpdateListSlot={vi.fn()}
        onDetachComponent={vi.fn()}
        onDeleteComponent={vi.fn()}
      />,
    );

    expect(screen.getByText(/EN ~800/i)).toBeInTheDocument();
    expect(screen.getByText(/TH ~666/i)).toBeInTheDocument();
    expect(screen.getAllByText(/used \d+\/800/i).length).toBeGreaterThan(0);
  });

  it("exposes both image and video controls for mixed media slots", () => {
    const component = buildBuiltInPresentationComponentInstance("a4-photo-grid", {
      canvas: DEFAULT_PRESENTATION_CANVAS_SIZE,
      instanceId: "a4-photo-grid-1",
    });

    render(
      <ComponentInspector
        components={[component]}
        selectedComponentId="a4-photo-grid-1"
        onSelectComponent={vi.fn()}
        onUpdateTextSlot={vi.fn()}
        onUpdateImageSlot={vi.fn()}
        onUpdateVideoSlot={vi.fn()}
        onUpdateListSlot={vi.fn()}
        onDetachComponent={vi.fn()}
        onDeleteComponent={vi.fn()}
      />,
    );

    const heroMediaPanel = screen.getByText("Hero Media").closest("div.rounded-md");
    expect(heroMediaPanel).toBeTruthy();
    expect(screen.getByLabelText(/multi-photo board hero media image url/i)).toBeInTheDocument();
    fireEvent.click(within(heroMediaPanel as HTMLElement).getByRole("button", { name: /use video/i }));
    expect(screen.getByLabelText(/multi-photo board hero media video url/i)).toBeInTheDocument();
    expect(within(heroMediaPanel as HTMLElement).getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});
