/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const quickSwitchResults = [
  {
    libraryItemId: 101,
    title: "Ops Runbook",
    logicalPath: "ops/runbook",
    aliases: ["Runbook"],
    matchType: "exact_title" as const,
    disambiguation: null,
  },
  {
    libraryItemId: 202,
    title: "Release Gate",
    logicalPath: "platform/release-gate",
    aliases: ["Gate"],
    matchType: "fuzzy" as const,
    disambiguation: "Platform",
  },
];

const inspectorById: Record<number, any> = {
  101: {
    note: {
      libraryItemId: 101,
      title: "Ops Runbook",
      logicalPath: "ops/runbook",
      aliases: ["Runbook"],
      tags: ["ops"],
      properties: {},
    },
    outgoing: [
      {
        libraryItemId: 301,
        title: "Escalation Matrix",
        logicalPath: "ops/escalation",
        rawReference: "Escalation Matrix",
      },
    ],
    backlinks: [
      {
        libraryItemId: 302,
        title: "SRE Handbook",
        logicalPath: "ops/sre",
        rawReference: "Ops Runbook",
      },
    ],
    unlinkedMentions: [],
    sharedTags: [],
    semanticRelated: [],
    localGraph: { nodes: [], edges: [{}, {}] },
  },
  202: {
    note: {
      libraryItemId: 202,
      title: "Release Gate",
      logicalPath: "platform/release-gate",
      aliases: ["Gate"],
      tags: ["release", "ops"],
      properties: {},
    },
    outgoing: [
      {
        libraryItemId: 303,
        title: "Rollback Plan",
        logicalPath: "platform/rollback",
        rawReference: "Rollback Plan",
      },
    ],
    backlinks: [
      {
        libraryItemId: 304,
        title: "Launch Checklist",
        logicalPath: "platform/launch",
        rawReference: "Release Gate",
      },
    ],
    unlinkedMentions: [],
    sharedTags: [],
    semanticRelated: [
      {
        libraryItemId: 305,
        title: "Deployment Guardrails",
        logicalPath: "platform/guardrails",
        score: 0.82,
      },
    ],
    localGraph: { nodes: [], edges: [{}, {}, {}] },
  },
};

const markdownById: Record<number, string> = {
  101: `# Ops Runbook

This note explains escalation paths and how operators should respond to incidents.
`,
  202: `# Release Gate

The release gate verifies rollback confidence, migration status, and platform readiness before rollout.

## Checklist

- Verify rollback confidence
- Confirm migration status
`,
};

describe("KnowledgeQuickSwitcherDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    quickSwitchNotesMock.mockImplementation(() => ({
      data: {
        results: quickSwitchResults,
        createSuggestion: null,
      },
      isLoading: false,
      error: null,
    }));

    knowledgeInspectorMock.mockImplementation(
      ({ itemId }: { itemId: number }) => ({
        data: inspectorById[itemId] ?? null,
        isLoading: false,
        error: null,
      })
    );

    getMarkdownContentMock.mockImplementation(({ id }: { id: number }) => ({
      data: { content: markdownById[id] ?? "" },
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
    expect(within(preview).getAllByText("Ops Runbook").length).toBeGreaterThan(
      0
    );

    fireEvent.mouseEnter(
      screen.getByTestId("knowledge-quick-switcher-item-202")
    );

    expect(within(preview).getAllByText("Release Gate").length).toBeGreaterThan(
      0
    );
    expect(within(preview).getByText(/^Matched context$/i)).toBeTruthy();
    expect(
      within(preview).getAllByText(/rollback confidence/i).length
    ).toBeGreaterThan(0);
    expect(
      within(preview).getAllByText(/platform\/release-gate/i).length
    ).toBeGreaterThan(0);

    fireEvent.click(
      within(preview).getByRole("button", { name: /open note/i })
    );

    expect(onSelectNote).toHaveBeenCalledWith({
      libraryItemId: 202,
      title: "Release Gate",
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

    fireEvent.mouseEnter(
      screen.getByTestId("knowledge-quick-switcher-item-202")
    );

    const preview = screen.getByTestId("knowledge-quick-switcher-preview");
    expect(within(preview).getByText(/^Local neighbors$/i)).toBeTruthy();
    expect(within(preview).getByText(/^Hybrid\/vector$/i)).toBeTruthy();
    expect(within(preview).getByText(/^Rollback Plan$/i)).toBeTruthy();

    fireEvent.click(
      within(preview).getByRole("button", { name: /rollback plan/i })
    );

    expect(onSelectNote).toHaveBeenCalledWith({
      libraryItemId: 303,
      title: "Rollback Plan",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
