import React from "react";
import { renderHook } from "@testing-library/react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, it, expect } from "vitest";

describe("Tiptap Setup", () => {
  it("useEditor() with immediatelyRender: false returns an Editor instance", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit],
        immediatelyRender: false,
      }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current).toBeDefined();
  });

  it("useEditor() with StarterKit accepts setContent() without error", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit],
        immediatelyRender: false,
      }),
    );
    expect(() => {
      result.current?.commands.setContent("<p>Hello</p>");
    }).not.toThrow();
  });

  it("useEditor() with immediatelyRender: false does not throw in React.StrictMode", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>{children}</React.StrictMode>
    );
    const { result } = renderHook(
      () =>
        useEditor({
          extensions: [StarterKit],
          immediatelyRender: false,
        }),
      { wrapper },
    );
    expect(result.current).not.toBeNull();
  });

  it("editor.getHTML() returns valid HTML after setContent", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit],
        immediatelyRender: false,
      }),
    );
    result.current?.commands.setContent("<p>Hello</p>");
    const html = result.current?.getHTML();
    expect(html).toContain("<p>Hello</p>");
  });

  it("editor.isEditable is false when editable: false is passed", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit],
        immediatelyRender: false,
        editable: false,
      }),
    );
    expect(result.current?.isEditable).toBe(false);
  });

  it("editor.isEditable is true when editable: true is passed", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit],
        immediatelyRender: false,
        editable: true,
      }),
    );
    expect(result.current?.isEditable).toBe(true);
  });

  it("editor CSS file can be imported without errors", async () => {
    await expect(import("../editor.css")).resolves.not.toThrow();
  });
});
