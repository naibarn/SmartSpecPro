/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeNoteSpotlight } from "./KnowledgeNoteSpotlight";
import { knowledgeVaultFixture } from "@/test/fixtures/knowledgeVaultFixture";

describe("KnowledgeNoteSpotlight", () => {
  it("shows note-level knowledge signals and quick actions", () => {
    const onChangeMode = vi.fn();
    const onOpenQuickSwitch = vi.fn();
    const onCopyWikiLink = vi.fn();

    render(
      <KnowledgeNoteSpotlight
        title={knowledgeVaultFixture.activeNote.title}
        logicalPath={knowledgeVaultFixture.activeNote.logicalPath}
        aliases={knowledgeVaultFixture.activeNote.aliases}
        tags={knowledgeVaultFixture.activeNote.tags}
        backlinksCount={knowledgeVaultFixture.inspector.backlinks.length}
        outgoingCount={knowledgeVaultFixture.inspector.outgoing.length}
        mentionCount={knowledgeVaultFixture.inspector.unlinkedMentions.length}
        graphEdgeCount={knowledgeVaultFixture.inspector.localGraph.edges.length}
        sharedTagsCount={knowledgeVaultFixture.inspector.sharedTags.length}
        semanticRelatedCount={
          knowledgeVaultFixture.inspector.semanticRelated.length
        }
        isLoading={false}
        quickSwitcherEnabled={true}
        inspectorEnabled={true}
        graphEnabled={true}
        contextPacksEnabled={true}
        blockedReasons={[]}
        onChangeMode={onChangeMode}
        onOpenQuickSwitch={onOpenQuickSwitch}
        onCopyWikiLink={onCopyWikiLink}
      />,
    );

    expect(screen.getByText(/knowledge note/i)).toBeTruthy();
    expect(screen.getByText(knowledgeVaultFixture.activeNote.title)).toBeTruthy();
    expect(
      screen.getByText(knowledgeVaultFixture.activeNote.logicalPath!),
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        String(knowledgeVaultFixture.inspector.backlinks.length),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        String(knowledgeVaultFixture.inspector.outgoing.length),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        String(knowledgeVaultFixture.inspector.unlinkedMentions.length),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        String(knowledgeVaultFixture.inspector.localGraph.edges.length),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/shared-tag neighbors/i)).toBeTruthy();
    expect(screen.getByText(/hybrid\/vector related/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy wikilink/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /related notes/i }));
    expect(onChangeMode).toHaveBeenCalledWith("related");

    fireEvent.click(screen.getByRole("button", { name: /graph/i }));
    expect(onChangeMode).toHaveBeenCalledWith("graph");

    expect(screen.getByRole("button", { name: /memory packs/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /quick switch/i }));
    expect(onOpenQuickSwitch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /copy wikilink/i }));
    expect(onCopyWikiLink).toHaveBeenCalledTimes(1);
  });
});
