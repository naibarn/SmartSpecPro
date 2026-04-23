/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    edges,
    children,
    onNodeClick,
    onNodeDoubleClick,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onPaneClick,
  }: any) => (
    <div data-testid="react-flow-pane" onClick={() => onPaneClick?.()}>
      <div>
        {nodes.map((node: any) => (
          <button
            key={node.id}
            type="button"
            data-testid={`graph-node-${node.id}`}
            onClick={event => {
              event.stopPropagation();
              onNodeClick?.(event, node);
            }}
            onDoubleClick={event => {
              event.stopPropagation();
              onNodeDoubleClick?.(event, node);
            }}
          >
            {node.data?.label ?? node.data?.title ?? node.id}
          </button>
        ))}
      </div>
      <div>
        {edges.map((edge: any) => (
          <button
            key={edge.id}
            type="button"
            data-testid={`graph-edge-${edge.id}`}
            onMouseEnter={event => onEdgeMouseEnter?.(event, edge)}
            onMouseLeave={event => onEdgeMouseLeave?.(event, edge)}
          >
            {edge.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  MarkerType: {
    ArrowClosed: "ArrowClosed",
  },
  BackgroundVariant: {
    Dots: "Dots",
  },
}));

import { KnowledgeGraphView } from "./KnowledgeGraphView";

describe("KnowledgeGraphView", () => {
  it("shows an edge preview on hover and opens a note on second click", () => {
    const onOpenItem = vi.fn();

    render(
      <KnowledgeGraphView
        activeNote={{
          libraryItemId: 1,
          title: "Active Note",
          logicalPath: "workspace/active",
        }}
        outgoing={[
          {
            libraryItemId: 2,
            title: "Target Note",
            logicalPath: "workspace/target",
            rawReference: "Target Note",
            status: "resolved",
          },
        ]}
        backlinks={[
          {
            libraryItemId: 3,
            title: "Backlink Note",
            logicalPath: "workspace/backlink",
            rawReference: "Active Note",
            status: "resolved",
          },
        ]}
        sharedTags={[]}
        semanticRelated={[]}
        onOpenItem={onOpenItem}
      />
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: /links to/i }));

    expect(screen.getByText(/^Edge preview$/i)).toBeTruthy();
    expect(screen.getByText(/Active Note\s*->\s*Target Note/i)).toBeTruthy();
    expect(
      screen.getByText(/explicit markdown or wikilink path/i)
    ).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("button", { name: /links to/i }));
    expect(screen.queryByText(/^Edge preview$/i)).toBeNull();

    fireEvent.click(screen.getByTestId("graph-node-2"));
    expect(screen.getAllByText("Target Note").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("graph-node-2"));
    expect(onOpenItem).toHaveBeenCalledWith(2, "Target Note");
  });
});
