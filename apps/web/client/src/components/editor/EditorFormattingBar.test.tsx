// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditorFormattingBar from "./EditorFormattingBar";

function createEditorMock(options?: { tableActive?: boolean }) {
  const tableActive = options?.tableActive ?? false;
  const chain = {
    focus: () => chain,
    undo: vi.fn(() => chain),
    redo: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    setParagraph: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleUnderline: vi.fn(() => chain),
    toggleCode: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    toggleBlockquote: vi.fn(() => chain),
    toggleCodeBlock: vi.fn(() => chain),
    setHorizontalRule: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    addRowBefore: vi.fn(() => chain),
    addRowAfter: vi.fn(() => chain),
    addColumnBefore: vi.fn(() => chain),
    addColumnAfter: vi.fn(() => chain),
    deleteRow: vi.fn(() => chain),
    deleteColumn: vi.fn(() => chain),
    deleteTable: vi.fn(() => chain),
    mergeCells: vi.fn(() => chain),
    splitCell: vi.fn(() => chain),
    toggleHeaderRow: vi.fn(() => chain),
    toggleHeaderColumn: vi.fn(() => chain),
    run: () => true,
    extendMarkRange: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
  };

  return {
    can: () => ({ chain: () => chain }),
    chain: () => chain,
    isActive: vi.fn((name: string) => (name === "table" ? tableActive : false)),
    __chain: chain,
  } as any;
}

describe("EditorFormattingBar", () => {
  it("remembers the last mobile More tab when reopened", async () => {
    render(
      <EditorFormattingBar
        editor={createEditorMock()}
        onInsertLink={vi.fn()}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("tab", { name: "Insert" }));

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Insert" }).getAttribute("aria-selected"),
      ).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Insert" }).getAttribute("aria-selected"),
      ).toBe("true");
    });
  });

  it("exposes table insertion in the toolbar", () => {
    const editor = createEditorMock();
    render(
      <EditorFormattingBar
        editor={editor}
        onInsertLink={vi.fn()}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByTestId("toolbar-insert-table"));

    expect(editor.__chain.insertTable).toHaveBeenCalledWith({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    });
  });

  it("exposes a normal text action in the toolbar", () => {
    const editor = createEditorMock();
    render(
      <EditorFormattingBar
        editor={editor}
        onInsertLink={vi.fn()}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByTestId("toolbar-normal-text"));

    expect(editor.__chain.setParagraph).toHaveBeenCalledTimes(1);
  });

  it("uses the knowledge link picker handler when provided", () => {
    const onInsertKnowledgeLink = vi.fn();
    render(
      <EditorFormattingBar
        editor={createEditorMock()}
        onInsertLink={vi.fn()}
        onInsertKnowledgeLink={onInsertKnowledgeLink}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByTestId("toolbar-knowledge-link"));

    expect(onInsertKnowledgeLink).toHaveBeenCalledTimes(1);
  });

  it("exposes table editing actions when the cursor is inside a table", () => {
    const editor = createEditorMock({ tableActive: true });
    render(
      <EditorFormattingBar
        editor={editor}
        onInsertLink={vi.fn()}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByTestId("toolbar-table-row-above"));
    fireEvent.click(screen.getByTestId("toolbar-table-row-below"));
    fireEvent.click(screen.getByTestId("toolbar-table-col-left"));
    fireEvent.click(screen.getByTestId("toolbar-table-col-right"));
    fireEvent.click(screen.getByTestId("toolbar-table-delete-row"));
    fireEvent.click(screen.getByTestId("toolbar-table-delete-column"));
    fireEvent.click(screen.getByTestId("toolbar-table-delete-table"));

    expect(editor.__chain.addRowBefore).toHaveBeenCalledTimes(1);
    expect(editor.__chain.addRowAfter).toHaveBeenCalledTimes(1);
    expect(editor.__chain.addColumnBefore).toHaveBeenCalledTimes(1);
    expect(editor.__chain.addColumnAfter).toHaveBeenCalledTimes(1);
    expect(editor.__chain.deleteRow).toHaveBeenCalledTimes(1);
    expect(editor.__chain.deleteColumn).toHaveBeenCalledTimes(1);
    expect(editor.__chain.deleteTable).toHaveBeenCalledTimes(1);
  });

  it("exposes advanced table structure actions when the cursor is inside a table", () => {
    const editor = createEditorMock({ tableActive: true });
    render(
      <EditorFormattingBar
        editor={editor}
        onInsertLink={vi.fn()}
        collapseOnMobile
      />,
    );

    fireEvent.click(screen.getByTestId("toolbar-table-merge-cells"));
    fireEvent.click(screen.getByTestId("toolbar-table-split-cell"));
    fireEvent.click(screen.getByTestId("toolbar-table-header-row"));
    fireEvent.click(screen.getByTestId("toolbar-table-header-column"));

    expect(editor.__chain.mergeCells).toHaveBeenCalledTimes(1);
    expect(editor.__chain.splitCell).toHaveBeenCalledTimes(1);
    expect(editor.__chain.toggleHeaderRow).toHaveBeenCalledTimes(1);
    expect(editor.__chain.toggleHeaderColumn).toHaveBeenCalledTimes(1);
  });
});
