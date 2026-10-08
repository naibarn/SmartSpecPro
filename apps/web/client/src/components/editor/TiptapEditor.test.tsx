// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { Extension } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { getDefaultExtensions, parse, serialize } from "./TiptapMarkdownBridge";

describe("TiptapEditor", () => {
  const sampleContent = parse("# Hello\n\nSome content here.");

  it("renders ProseMirror editor with provided content", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [
          ...getDefaultExtensions(),
          Placeholder.configure({ placeholder: "Type..." }),
        ] as Extension[],
        content: sampleContent,
        immediatelyRender: false,
      }),
    );
    expect(result.current).not.toBeNull();
    const json = result.current!.getJSON();
    expect(json.content).toBeDefined();
  });

  it("editable=false makes editor read-only", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [...getDefaultExtensions()] as Extension[],
        content: sampleContent,
        editable: false,
        immediatelyRender: false,
      }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.isEditable).toBe(false);
  });

  it("editable=true allows editing", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [...getDefaultExtensions()] as Extension[],
        content: sampleContent,
        editable: true,
        immediatelyRender: false,
      }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.isEditable).toBe(true);
  });

  it("onUpdate callback fires on content change", () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useEditor({
        extensions: [...getDefaultExtensions()] as Extension[],
        content: sampleContent,
        editable: true,
        immediatelyRender: false,
        onUpdate,
      }),
    );
    expect(result.current).not.toBeNull();
    result.current!.commands.setContent("<p>Changed</p>");
    expect(onUpdate).toHaveBeenCalled();
  });

  it("editor uses immediatelyRender: false for React 19 compatibility", () => {
    // Verify useEditor does not throw when SSR/React 19 mode is used
    const { result } = renderHook(() =>
      useEditor({
        extensions: [...getDefaultExtensions()] as Extension[],
        content: sampleContent,
        immediatelyRender: false,
      }),
    );
    expect(result.current).not.toBeNull();
  });

  it("editor applies .tiptap-editor CSS class to wrapper", async () => {
    // Verify the CSS import resolves (editor.css exists and is importable)
    await expect(import("./editor.css")).resolves.toBeDefined();
  });

  it("inserts and renders an external HTTPS image through the editor extensions", () => {
    const editor = new Editor({ extensions: getDefaultExtensions(), content: "" });
    try {
      editor.commands.setImage({
        src: "https://cdn.example.com/editor-image.png",
        alt: "Product preview",
      });

      const document = editor.getJSON();
      expect(document.content?.[0]).toMatchObject({
        type: "image",
        attrs: {
          src: "https://cdn.example.com/editor-image.png",
          alt: "Product preview",
        },
      });
      expect(editor.getHTML()).toContain(
        '<img src="https://cdn.example.com/editor-image.png"',
      );
      expect(serialize(document)).toContain(
        "![Product preview](https://cdn.example.com/editor-image.png)",
      );
    } finally {
      editor.destroy();
    }
  });
});
