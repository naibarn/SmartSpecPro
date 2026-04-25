/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getKnowledgeGraphFixture } from "@/test/fixtures/knowledgeVaultFixture";

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
    const graphFixture = getKnowledgeGraphFixture();

    render(
      <KnowledgeGraphView
        activeNote={graphFixture.note}
        outgoing={graphFixture.outgoing}
        backlinks={graphFixture.backlinks}
        sharedTags={graphFixture.sharedTags}
        semanticRelated={graphFixture.semanticRelated}
        onOpenItem={onOpenItem}
      />
    );

    fireEvent.mouseEnter(
      screen.getAllByRole("button", { name: /links to/i })[0],
    );

    expect(screen.getByText(/^Edge preview$/i)).toBeTruthy();
    expect(
      screen.getByText(
        /Desktop Worker With ZeroClaw-OpenClaw-NemoClaw\.md\s*->\s*Graph Setup Checklist\.md/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/explicit markdown or wikilink path/i)
    ).toBeTruthy();

    fireEvent.mouseLeave(
      screen.getAllByRole("button", { name: /links to/i })[0],
    );
    expect(screen.queryByText(/^Edge preview$/i)).toBeNull();

    fireEvent.click(screen.getByTestId("graph-node-201"));
    expect(
      screen.getAllByText("Graph Setup Checklist.md").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("graph-node-201"));
    expect(onOpenItem).toHaveBeenCalledWith(
      graphFixture.outgoing[0].libraryItemId,
      graphFixture.outgoing[0].title,
    );

    expect(screen.getByRole("button", { name: /shared tags/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /hybrid\/vector/i }),
    ).toBeTruthy();
  });
});
