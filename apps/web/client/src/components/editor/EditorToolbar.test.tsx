// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditorToolbar from "./EditorToolbar";
import type { EditorToolbarProps } from "./EditorToolbar";

/** Create a mock Editor with chain-command pattern */
function createMockEditor(overrides: Record<string, boolean> = {}) {
  const run = vi.fn();
  const chainMethods: Record<string, any> = {};
  const commandNames = [
    "focus",
    "toggleBold",
    "toggleItalic",
    "toggleUnderline",
    "toggleCode",
    "toggleHeading",
    "toggleBulletList",
    "toggleOrderedList",
    "toggleBlockquote",
    "toggleCodeBlock",
    "setHorizontalRule",
    "undo",
    "redo",
  ];

  for (const name of commandNames) {
    chainMethods[name] = vi.fn().mockReturnValue({ ...chainMethods, run });
  }
  // focus returns chainMethods so chained calls work
  chainMethods.focus = vi.fn().mockReturnValue({ ...chainMethods, run });

  const chain = vi.fn().mockReturnValue(chainMethods);
  const can = vi.fn().mockReturnValue({ chain: () => chainMethods });

  const isActive = vi.fn(
    (name: string, attrs?: Record<string, any>) =>
      overrides[attrs ? `${name}:${JSON.stringify(attrs)}` : name] ?? false,
  );

  return { chain, can, isActive, run, chainMethods };
}

function renderToolbar(props: Partial<EditorToolbarProps> = {}) {
  const mock = createMockEditor(props.editor ? {} : {});
  const defaults: EditorToolbarProps = {
    editor: mock as any,
    mode: "edit",
    onModeChange: vi.fn(),
    saveStatus: "clean",
    onSave: vi.fn(),
    onInsertMedia: vi.fn(),
    onInsertLink: vi.fn(),
    ...props,
  };
  const result = render(<EditorToolbar {...defaults} />);
  return { ...result, mock, props: defaults };
}

describe("EditorToolbar — Mode Switching", () => {
  it("renders mode switcher with View, Edit, Source buttons", () => {
    renderToolbar();
    expect(screen.getByTestId("toolbar-mode-view")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-mode-edit")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-mode-source")).toBeInTheDocument();
  });

  it("View mode hides formatting buttons", () => {
    renderToolbar({ mode: "view" });
    expect(screen.queryByLabelText("Bold")).not.toBeInTheDocument();
  });

  it("Edit mode shows all formatting buttons", () => {
    renderToolbar({ mode: "edit" });
    expect(screen.getByLabelText("Bold")).toBeInTheDocument();
    expect(screen.getByLabelText("Italic")).toBeInTheDocument();
    expect(screen.getByLabelText("Underline")).toBeInTheDocument();
  });

  it("Source mode hides formatting buttons", () => {
    renderToolbar({ mode: "source" });
    expect(screen.queryByLabelText("Bold")).not.toBeInTheDocument();
  });

  it("clicking Edit button calls onModeChange('edit')", () => {
    const { props } = renderToolbar({ mode: "view" });
    fireEvent.click(screen.getByTestId("toolbar-mode-edit"));
    expect(props.onModeChange).toHaveBeenCalledWith("edit");
  });

  it("clicking View button calls onModeChange('view')", () => {
    const { props } = renderToolbar({ mode: "edit" });
    fireEvent.click(screen.getByTestId("toolbar-mode-view"));
    expect(props.onModeChange).toHaveBeenCalledWith("view");
  });

  it("clicking Source button calls onModeChange('source')", () => {
    const { props } = renderToolbar({ mode: "edit" });
    fireEvent.click(screen.getByTestId("toolbar-mode-source"));
    expect(props.onModeChange).toHaveBeenCalledWith("source");
  });

  it("active mode button has aria-pressed=true", () => {
    renderToolbar({ mode: "edit" });
    expect(screen.getByTestId("toolbar-mode-edit")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("toolbar-mode-view")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("EditorToolbar — Formatting Commands", () => {
  it("Bold button calls toggleBold", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(mock.chain).toHaveBeenCalled();
    expect(mock.chainMethods.toggleBold).toHaveBeenCalled();
  });

  it("Italic button calls toggleItalic", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Italic"));
    expect(mock.chainMethods.toggleItalic).toHaveBeenCalled();
  });

  it("Underline button calls toggleUnderline", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Underline"));
    expect(mock.chainMethods.toggleUnderline).toHaveBeenCalled();
  });

  it("Heading 1 button calls toggleHeading level 1", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Heading 1"));
    expect(mock.chainMethods.toggleHeading).toHaveBeenCalledWith({ level: 1 });
  });

  it("Heading 2 button calls toggleHeading level 2", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Heading 2"));
    expect(mock.chainMethods.toggleHeading).toHaveBeenCalledWith({ level: 2 });
  });

  it("Heading 3 button calls toggleHeading level 3", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Heading 3"));
    expect(mock.chainMethods.toggleHeading).toHaveBeenCalledWith({ level: 3 });
  });

  it("Heading 4 button calls toggleHeading level 4", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Heading 4"));
    expect(mock.chainMethods.toggleHeading).toHaveBeenCalledWith({ level: 4 });
  });

  it("Bullet List button calls toggleBulletList", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Bullet List"));
    expect(mock.chainMethods.toggleBulletList).toHaveBeenCalled();
  });

  it("Ordered List button calls toggleOrderedList", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Ordered List"));
    expect(mock.chainMethods.toggleOrderedList).toHaveBeenCalled();
  });

  it("Blockquote button calls toggleBlockquote", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Blockquote"));
    expect(mock.chainMethods.toggleBlockquote).toHaveBeenCalled();
  });

  it("Code button calls toggleCode", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Code"));
    expect(mock.chainMethods.toggleCode).toHaveBeenCalled();
  });

  it("Code Block button calls toggleCodeBlock", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Code Block"));
    expect(mock.chainMethods.toggleCodeBlock).toHaveBeenCalled();
  });

  it("Horizontal Rule button calls setHorizontalRule", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Horizontal Rule"));
    expect(mock.chainMethods.setHorizontalRule).toHaveBeenCalled();
  });

  it("Undo button calls undo", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Undo"));
    expect(mock.chainMethods.undo).toHaveBeenCalled();
  });

  it("Redo button calls redo", () => {
    const { mock } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Redo"));
    expect(mock.chainMethods.redo).toHaveBeenCalled();
  });
});

describe("EditorToolbar — Media & Link", () => {
  it("Insert Image button calls onInsertMedia('image')", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Insert Image"));
    expect(props.onInsertMedia).toHaveBeenCalledWith("image");
  });

  it("Insert Video button calls onInsertMedia('video')", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Insert Video"));
    expect(props.onInsertMedia).toHaveBeenCalledWith("video");
  });

  it("Insert Audio button calls onInsertMedia('audio')", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Insert Audio"));
    expect(props.onInsertMedia).toHaveBeenCalledWith("audio");
  });

  it("Link button calls onInsertLink", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText("Link"));
    expect(props.onInsertLink).toHaveBeenCalled();
  });
});

describe("EditorToolbar — Save", () => {
  it("Save button calls onSave callback", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByTestId("toolbar-save-btn"));
    expect(props.onSave).toHaveBeenCalled();
  });

  it("Save button disabled when isSaving is true", () => {
    renderToolbar({ isSaving: true });
    expect(screen.getByTestId("toolbar-save-btn")).toBeDisabled();
  });

  it('shows "Saving..." when saveStatus is "saving"', () => {
    renderToolbar({ saveStatus: "saving" });
    expect(screen.getByTestId("toolbar-save-status").textContent).toBe(
      "Saving...",
    );
  });

  it('shows "Saved" when saveStatus is "saved"', () => {
    renderToolbar({ saveStatus: "saved" });
    expect(screen.getByTestId("toolbar-save-status").textContent).toBe(
      "Saved",
    );
  });

  it('shows "Unsaved changes" when saveStatus is "dirty"', () => {
    renderToolbar({ saveStatus: "dirty" });
    expect(screen.getByTestId("toolbar-save-status").textContent).toBe(
      "Unsaved changes",
    );
  });

  it("save status hidden when clean", () => {
    renderToolbar({ saveStatus: "clean" });
    expect(screen.getByTestId("toolbar-save-status").textContent).toBe("");
  });
});

describe("EditorToolbar — Accessibility", () => {
  it("toolbar has role=toolbar and aria-label", () => {
    const { container } = renderToolbar();
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveAttribute("aria-label", "Editor toolbar");
  });

  it("all formatting buttons have aria-label attributes", () => {
    renderToolbar({ mode: "edit" });
    const labels = [
      "Bold",
      "Italic",
      "Underline",
      "Code",
      "Link",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Bullet List",
      "Ordered List",
      "Blockquote",
      "Code Block",
      "Horizontal Rule",
      "Undo",
      "Redo",
      "Insert Image",
      "Insert Video",
      "Insert Audio",
    ];
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
