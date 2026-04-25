/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getKnowledgeGraphFixture,
  getKnowledgeQuickSwitchFixture,
  knowledgeVaultFixture,
} from "@/test/fixtures/knowledgeVaultFixture";

const quickSwitchNotesMock = vi.fn();
const knowledgeInspectorMock = vi.fn();
const getMarkdownContentMock = vi.fn();

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  DialogTitle: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  DialogDescription: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CommandInput: ({ value, onValueChange, ...props }: any) => (
    <input
      {...props}
      value={value}
      onChange={event => onValueChange?.(event.target.value)}
    />
  ),
  CommandList: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  CommandEmpty: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  CommandGroup: ({
    children,
    heading,
    ...props
  }: {
    children: ReactNode;
    heading?: string;
  }) => (
    <div {...props}>
      {heading ? <div>{heading}</div> : null}
      {children}
    </div>
  ),
  CommandItem: ({ children, onSelect, ...props }: any) => (
    <button type="button" {...props} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      quickSwitchNotes: {
        useQuery: (...args: any[]) => quickSwitchNotesMock(...args),
      },
      getKnowledgeInspector: {
        useQuery: (...args: any[]) => knowledgeInspectorMock(...args),
      },
      getMarkdownContent: {
        useQuery: (...args: any[]) => getMarkdownContentMock(...args),
      },
    },
  },
}));

import { KnowledgeQuickSwitcherDialog } from "./KnowledgeQuickSwitcherDialog";

describe("KnowledgeQuickSwitcherDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    quickSwitchNotesMock.mockImplementation(() => ({
      data: getKnowledgeQuickSwitchFixture(),
      isLoading: false,
      error: null,
    }));

    knowledgeInspectorMock.mockImplementation(
      ({ itemId }: { itemId: number }) => ({
        data: getKnowledgeGraphFixture(itemId),
        isLoading: false,
        error: null,
      })
    );

    getMarkdownContentMock.mockImplementation(({ id }: { id: number }) => ({
      data: { content: knowledgeVaultFixture.markdownById[id] ?? "" },
      isLoading: false,
      error: null,
    }));
  });

  it("updates the preview panel when the active result changes and opens the selected note", () => {
    const onOpenChange = vi.fn();
    const onSelectNote = vi.fn();

    render(
      <KnowledgeQuickSwitcherDialog
        open={true}
        onOpenChange={onOpenChange}
        onSelectNote={onSelectNote}
        onCreateNote={vi.fn()}
      />
    );

    const preview = screen.getByTestId("knowledge-quick-switcher-preview");
    expect(
      within(preview).getAllByText(
        knowledgeVaultFixture.activeNote.title,
      ).length,
    ).toBeGreaterThan(0);
    expect(within(preview).getByText(/^Matched context$/i)).toBeTruthy();
    expect(
      within(preview).getAllByText(/zeroclaw openclaw nemoclaw/i).length
    ).toBeGreaterThan(0);
    expect(
      within(preview).getAllByText(
        /navigation-first\/desktop-worker/i,
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/create markdown note/i)).toBeTruthy();

    fireEvent.click(
      within(preview).getByRole("button", { name: /open note/i })
    );

    expect(onSelectNote).toHaveBeenCalledWith({
      libraryItemId: knowledgeVaultFixture.activeNote.libraryItemId,
      title: knowledgeVaultFixture.activeNote.title,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows local neighbors in the preview and lets the user open one directly", () => {
    const onOpenChange = vi.fn();
    const onSelectNote = vi.fn();

    render(
      <KnowledgeQuickSwitcherDialog
        open={true}
        onOpenChange={onOpenChange}
        onSelectNote={onSelectNote}
        onCreateNote={vi.fn()}
      />
    );

    const preview = screen.getByTestId("knowledge-quick-switcher-preview");
    expect(within(preview).getByText(/^Local neighbors$/i)).toBeTruthy();
    expect(within(preview).getByText(/^Hybrid\/vector$/i)).toBeTruthy();
    expect(
      within(preview).getByText(/workspace navigation handbook\.md/i),
    ).toBeTruthy();

    fireEvent.click(
      within(preview).getByRole("button", {
        name: /workspace navigation handbook/i,
      })
    );

    expect(onSelectNote).toHaveBeenCalledWith({
      libraryItemId: 203,
      title: "Workspace Navigation Handbook.md",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
