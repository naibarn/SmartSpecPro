/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeNoteSpotlight } from "./KnowledgeNoteSpotlight";

describe("KnowledgeNoteSpotlight", () => {
  it("shows note-level knowledge signals and quick actions", () => {
    const onChangeMode = vi.fn();
    const onOpenQuickSwitch = vi.fn();

    render(
      <KnowledgeNoteSpotlight
        title="Architecture.md"
        logicalPath="product/architecture"
        aliases={["System Overview"]}
        tags={["platform"]}
        backlinksCount={4}
        outgoingCount={3}
        mentionCount={2}
        graphEdgeCount={5}
        isLoading={false}
        quickSwitcherEnabled={true}
        inspectorEnabled={true}
        graphEnabled={true}
        contextPacksEnabled={false}
        blockedReasons={["release_gate_not_ready"]}
        onChangeMode={onChangeMode}
        onOpenQuickSwitch={onOpenQuickSwitch}
      />,
    );

    expect(screen.getByText(/knowledge note/i)).toBeTruthy();
    expect(screen.getByText("Architecture.md")).toBeTruthy();
    expect(screen.getByText("product/architecture")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /related notes/i }));
    expect(onChangeMode).toHaveBeenCalledWith("related");

    fireEvent.click(screen.getByRole("button", { name: /graph/i }));
    expect(onChangeMode).toHaveBeenCalledWith("graph");

    expect(screen.getByRole("button", { name: /memory packs/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /quick switch/i }));
    expect(onOpenQuickSwitch).toHaveBeenCalledTimes(1);
  });
});
