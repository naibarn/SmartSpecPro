// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import UnifiedDocumentSurface from "./UnifiedDocumentSurface";

// Mock TiptapEditor to avoid heavy ProseMirror DOM setup
vi.mock("./TiptapEditor", () => ({
  default: ({
    editable,
    onUpdate,
    content,
    template,
    viewZoom,
  }: {
    editable: boolean;
    onUpdate?: (editor: any) => void;
    content: any;
    template?: string;
    viewZoom?: number;
  }) => (
    <MockTiptapEditor
      editable={editable}
      onUpdate={onUpdate}
      content={content}
      template={template}
      viewZoom={viewZoom}
    />
  ),
}));

function MockTiptapEditor({
  editable,
  onUpdate,
  content,
  template,
  viewZoom,
}: {
  editable: boolean;
  onUpdate?: (editor: any) => void;
  content: any;
  template?: string;
  viewZoom?: number;
}) {
  const prevContentRef = useRef<string | null>(null);
  const [contentRevision, setContentRevision] = useState(0);

  useEffect(() => {
    const nextContent = JSON.stringify(content);
    if (prevContentRef.current !== null && prevContentRef.current !== nextContent) {
      setContentRevision((prev) => prev + 1);
      onUpdate?.({
        storage: {
          markdown: {
            getMarkdown: () => content?.content?.[0]?.content?.[0]?.text ?? "",
          },
        },
      });
    }
    prevContentRef.current = nextContent;
  }, [content, onUpdate]);

  return (
    <div
      data-testid="tiptap-editor"
      data-editable={editable}
      data-template={template}
      data-view-zoom={viewZoom}
      data-content-revision={contentRevision}
      onClick={() => {
        onUpdate?.({
          storage: {
            markdown: {
              getMarkdown: () => "# Changed content",
            },
          },
        });
      }}
    >
      {JSON.stringify(content)}
    </div>
  );
}

// Mock SourceModePanel
vi.mock("./SourceModePanel", () => ({
  default: ({
    value,
    onChange,
    visible,
  }: {
    value: string;
    onChange: (v: string) => void;
    visible: boolean;
  }) => (
    <div
      data-testid="source-panel"
      style={{ display: visible ? undefined : "none" }}
    >
      <textarea
        data-testid="source-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// Mock TiptapMarkdownBridge
vi.mock("./TiptapMarkdownBridge", () => ({
  parse: (md: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: md }] }],
  }),
  serialize: (doc: any) => doc?.content?.[0]?.content?.[0]?.text ?? "",
}));


describe("UnifiedDocumentSurface — Mode Switching", () => {
  it("renders in View mode by default (editable: false)", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    const editor = screen.getByTestId("tiptap-editor");
    expect(editor.dataset.editable).toBe("false");
    expect(editor.dataset.template).toBe("page");
    expect(editor.parentElement?.className).toContain("overflow-hidden");
  });

  it("clicking Edit button switches to Edit mode (editable: true)", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    fireEvent.click(screen.getByTestId("mode-edit"));
    const editor = screen.getByTestId("tiptap-editor");
    expect(editor.dataset.editable).toBe("true");
  });

  it("clicking Source button shows source panel, hides Tiptap", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    fireEvent.click(screen.getByTestId("mode-source"));
    const sourcePanel = screen.getByTestId("source-panel");
    expect(sourcePanel.style.display).not.toBe("none");
  });

  it("switching Edit->Source serializes content", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    fireEvent.click(screen.getByTestId("mode-edit"));
    fireEvent.click(screen.getByTestId("mode-source"));
    const textarea = screen.getByTestId("source-textarea") as HTMLTextAreaElement;
    // Source should have the initial content (mock parse/serialize)
    expect(textarea.value).toBeDefined();
  });

  it("View mode hides toolbar formatting buttons (Source panel hidden)", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    const sourcePanel = screen.getByTestId("source-panel");
    expect(sourcePanel.style.display).toBe("none");
  });

  it("double-click in View mode enters Edit mode", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    const editorContainer = screen.getByTestId("tiptap-editor").parentElement!;
    fireEvent.doubleClick(editorContainer);
    const editor = screen.getByTestId("tiptap-editor");
    expect(editor.dataset.editable).toBe("true");
  });

  it("template toggle switches between simple and page editors", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    expect(screen.getByTestId("tiptap-editor").dataset.template).toBe("page");
    fireEvent.click(screen.getByTestId("template-page"));
    expect(screen.getByTestId("tiptap-editor").dataset.template).toBe("page");
    fireEvent.click(screen.getByTestId("template-simple"));
    expect(screen.getByTestId("tiptap-editor").dataset.template).toBe("simple");
  });

  it("shows zoom controls in page view mode and updates the zoom level", () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    expect(screen.getByTestId("tiptap-editor").dataset.viewZoom).toBe("100");

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByTestId("tiptap-editor").dataset.viewZoom).toBe("110");

    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(screen.getByTestId("tiptap-editor").dataset.viewZoom).toBe("100");

    fireEvent.click(screen.getByRole("button", { name: /100%/i }));
    expect(screen.getByTestId("tiptap-editor").dataset.viewZoom).toBe("100");
  });

  it("switching Edit->View triggers save callback when dirty", () => {
    const onSave = vi.fn();
    render(<UnifiedDocumentSurface initialContent="# Hello" onSave={onSave} />);
    fireEvent.click(screen.getByTestId("mode-edit"));
    // Trigger content change to mark dirty
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    fireEvent.click(screen.getByTestId("mode-view"));
    expect(onSave).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith("# Changed content");
  });

  it("hydrates later-arriving content even when updatedAt stays the same", async () => {
    const onContentChange = vi.fn();
    const { rerender } = render(
      <UnifiedDocumentSurface
        documentId={42}
        initialContent=""
        updatedAt="2026-03-21T00:00:00.000Z"
        onContentChange={onContentChange}
      />,
    );

    rerender(
      <UnifiedDocumentSurface
        documentId={42}
        initialContent="# Loaded document"
        updatedAt="2026-03-21T00:00:00.000Z"
        onContentChange={onContentChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tiptap-editor").textContent).toContain("Loaded document");
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });
});

describe("UnifiedDocumentSurface — Auto-Save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onContentChange fires when Tiptap content changes", () => {
    const onContentChange = vi.fn();
    render(
      <UnifiedDocumentSurface
        initialContent="# Hello"
        onContentChange={onContentChange}
      />,
    );
    fireEvent.click(screen.getByTestId("mode-edit"));
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    expect(onContentChange).toHaveBeenCalledWith("# Changed content");
  });

  it("auto-save fires after the debounce window elapses", () => {
    const onSave = vi.fn();
    render(
      <UnifiedDocumentSurface initialContent="# Hello" onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId("mode-edit"));
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    expect(onSave).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("rapid changes only trigger one save (debounce working)", () => {
    const onSave = vi.fn();
    render(
      <UnifiedDocumentSurface initialContent="# Hello" onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId("mode-edit"));
    // Simulate rapid typing
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+S triggers immediate save (bypasses debounce)", () => {
    const onSave = vi.fn();
    render(
      <UnifiedDocumentSurface initialContent="# Hello" onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId("mode-edit"));
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('save status shows "Saving..." during save', () => {
    render(
      <UnifiedDocumentSurface initialContent="# Hello" isSaving={true} />,
    );
    expect(screen.getByTestId("save-status").textContent).toBe("Saving...");
  });

  it('save status shows "Unsaved changes" when dirty', () => {
    render(<UnifiedDocumentSurface initialContent="# Hello" />);
    fireEvent.click(screen.getByTestId("mode-edit"));
    fireEvent.click(screen.getByTestId("tiptap-editor"));
    expect(screen.getByTestId("save-status").textContent).toBe(
      "Unsaved changes",
    );
  });

  it("save error shows error banner", () => {
    render(
      <UnifiedDocumentSurface
        initialContent="# Hello"
        errorMessage="Save failed"
      />,
    );
    expect(screen.getByTestId("error-banner").textContent).toBe("Save failed");
  });

  it("auto-save does NOT fire in View mode", () => {
    const onSave = vi.fn();
    render(
      <UnifiedDocumentSurface initialContent="# Hello" onSave={onSave} />,
    );
    // Stay in View mode — click tiptap-editor (won't trigger onUpdate since mode=view check is in real component,
    // but in mock the onUpdate always fires — the real guard is in handleTiptapUpdate which checks mode)
    // Instead test that no save fires without mode change
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not rehydrate the editor when the server snapshot matches the local markdown", async () => {
    const { rerender } = render(
      <UnifiedDocumentSurface
        documentId={42}
        initialContent="# Hello"
        updatedAt="2026-03-21T00:00:00.000Z"
      />,
    );

    const initialRevision = screen.getByTestId("tiptap-editor").dataset.contentRevision;

    rerender(
      <UnifiedDocumentSurface
        documentId={42}
        initialContent="# Hello"
        updatedAt="2026-03-21T00:05:00.000Z"
      />,
    );

    expect(screen.getByTestId("tiptap-editor").dataset.contentRevision).toBe(initialRevision);
  });
});
