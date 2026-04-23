/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeVaultOverviewPanel } from "./KnowledgeVaultOverviewPanel";

describe("KnowledgeVaultOverviewPanel", () => {
  it("surfaces primary knowledge actions and policy messaging", () => {
    const onChangeMode = vi.fn();
    const onOpenQuickSwitch = vi.fn();

    render(
      <KnowledgeVaultOverviewPanel
        pending={false}
        enabled={true}
        activeMode="browse"
        blockedReasons={["release_gate_not_ready"]}
        modes={[
          {
            mode: "browse",
            label: "Browse",
            description: "Browse notes",
            enabled: true,
          },
          {
            mode: "related",
            label: "Related",
            description: "Inspect relationships",
            enabled: true,
          },
          {
            mode: "graph",
            label: "Graph",
            description: "Inspect graph",
            enabled: true,
          },
          {
            mode: "memory_packs",
            label: "Memory Packs",
            description: "Curate packs",
            enabled: false,
          },
          {
            mode: "canvas",
            label: "Canvas Boards",
            description: "Inspect boards",
            enabled: true,
          },
        ]}
        quickSwitcherEnabled={true}
        releaseGateStatus="unknown"
        selectedMarkdownTitle="Roadmap.md"
        onChangeMode={onChangeMode}
        onOpenQuickSwitch={onOpenQuickSwitch}
      />
    );

    expect(
      screen.getByText(/turn markdown notes into connected working knowledge/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/some knowledge tools are still limited/i)
    ).toBeTruthy();
    expect(screen.getByText(/release gate: unknown/i)).toBeTruthy();
    expect(screen.getByText(/current note: roadmap\.md/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /quick switch/i }));
    expect(onOpenQuickSwitch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: /related/i })[0]);
    expect(onChangeMode).toHaveBeenCalledWith("related");

    fireEvent.click(screen.getByRole("button", { name: /graph explorer/i }));
    expect(onChangeMode).toHaveBeenCalledWith("graph");

    expect(
      screen.getByText(
        /protected knowledge surfaces are still behind the release gate/i
      )
    ).toBeTruthy();
  });
});
