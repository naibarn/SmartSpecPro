import React, { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import CodeMirror, { EditorView, ReactCodeMirrorProps, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { php } from "@codemirror/lang-php";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { undo as cmUndo, redo as cmRedo } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { drawSelection } from "@codemirror/view";

/**
 * Supported file extensions and their corresponding CodeMirror language extensions
 */
export const LANGUAGE_EXTENSIONS: Record<string, () => Extension> = {
  // Markdown
  md: markdown,
  markdown: markdown,

  // JavaScript/TypeScript
  js: () => javascript({ jsx: false, typescript: false }),
  jsx: () => javascript({ jsx: true, typescript: false }),
  ts: () => javascript({ jsx: false, typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  mjs: () => javascript({ jsx: false, typescript: false }),

  // Python
  py: python,
  pyw: python,

  // PHP
  php: php,

  // Web
  html: html,
  htm: html,
  css: css,
  scss: css,
  sass: css,
  less: css,

  // Data formats
  json: json,
  xml: xml,
  svg: xml,
  yaml: yaml,
  yml: yaml,

  // SQL
  sql: sql,

  // Plain text (no highlighting)
  txt: () => [],
  text: () => [],
  log: () => [],
};

/**
 * Detect language extension from file extension
 */
export function detectLanguageExtension(fileExtension: string | undefined): Extension[] {
  if (!fileExtension) {
    return [];
  }

  const normalized = fileExtension.toLowerCase().replace(/^\./, "");
  const extensionFn = LANGUAGE_EXTENSIONS[normalized];

  if (extensionFn) {
    return [extensionFn()];
  }

  return [];
}

/**
 * Get human-readable language name from file extension
 */
export function getLanguageName(fileExtension: string | undefined): string {
  if (!fileExtension) {
    return "Plain Text";
  }

  const normalized = fileExtension.toLowerCase().replace(/^\./, "");

  const languageMap: Record<string, string> = {
    md: "Markdown",
    markdown: "Markdown",
    js: "JavaScript",
    jsx: "JavaScript (JSX)",
    ts: "TypeScript",
    tsx: "TypeScript (TSX)",
    mjs: "JavaScript (Module)",
    py: "Python",
    pyw: "Python",
    php: "PHP",
    html: "HTML",
    htm: "HTML",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "Less",
    json: "JSON",
    xml: "XML",
    svg: "SVG",
    yaml: "YAML",
    yml: "YAML",
    sql: "SQL",
    txt: "Plain Text",
    text: "Plain Text",
    log: "Log",
  };

  return languageMap[normalized] || "Plain Text";
}

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileExtension?: string;
  showLineNumbers?: boolean;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface CodeMirrorEditorMethods {
  insertText: (text: string) => void;
  wrapSelection: (before: string, after: string, defaultText?: string) => void;
  replaceSelection: (text: string) => void;
  getSelection: () => string;
  undo: () => void;
  redo: () => void;
}

/**
 * CodeMirror-based code editor with syntax highlighting and line numbers
 */
const CodeMirrorEditor = forwardRef<CodeMirrorEditorMethods, CodeMirrorEditorProps>(({
  value,
  onChange,
  fileExtension,
  showLineNumbers = true,
  height = "70vh",
  minHeight,
  maxHeight,
  placeholder = "Start typing...",
  disabled = false,
  className = "",
}, ref: React.Ref<CodeMirrorEditorMethods>) => {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [internalShowLineNumbers, setInternalShowLineNumbers] = useState(() => {
    if (typeof window === "undefined") {
      return showLineNumbers;
    }
    const stored = localStorage.getItem("codemirror-line-numbers");
    return stored !== null ? stored === "true" : showLineNumbers;
  });

  // Sync internal state with prop
  useEffect(() => {
    setInternalShowLineNumbers(showLineNumbers);
  }, [showLineNumbers]);

  // Save to localStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("codemirror-line-numbers", String(internalShowLineNumbers));
    }
  }, [internalShowLineNumbers]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      const view = editorRef.current?.view;
      if (!view) return;

      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    },
    wrapSelection: (before: string, after: string, defaultText = "") => {
      const view = editorRef.current?.view;
      if (!view) return;

      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to) || defaultText;
      const newText = `${before}${selectedText}${after}`;

      view.dispatch({
        changes: { from, to, insert: newText },
        selection: { anchor: from + before.length, head: from + before.length + selectedText.length },
      });
    },
    replaceSelection: (text: string) => {
      const view = editorRef.current?.view;
      if (!view) return;

      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    },
    getSelection: () => {
      const view = editorRef.current?.view;
      if (!view) return "";

      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
    undo: () => {
      const view = editorRef.current?.view;
      if (!view) return;
      cmUndo(view);
    },
    redo: () => {
      const view = editorRef.current?.view;
      if (!view) return;
      cmRedo(view);
    },
  }));

  const extensions = useMemo(() => {
    const languageExt = detectLanguageExtension(fileExtension);
    // Add editable extension
    const editableExt = disabled ? [EditorView.editable.of(false)] : [];
    // Add base theme for selection colors (higher specificity than regular theme)
    const selectionTheme = EditorView.baseTheme({
      "&light .cm-selectionBackground": {
        backgroundColor: "#3b82f6 !important",
      },
      "&light.cm-focused .cm-selectionBackground": {
        backgroundColor: "#3b82f6 !important",
      },
      "&light .cm-line::selection": {
        backgroundColor: "#3b82f6 !important",
        color: "#ffffff !important",
      },
      "&light .cm-content ::selection": {
        backgroundColor: "#3b82f6 !important",
        color: "#ffffff !important",
      },
      "&light ::selection": {
        backgroundColor: "#3b82f6 !important",
        color: "#ffffff !important",
      },
    });
    return [...languageExt, ...editableExt, drawSelection(), selectionTheme];
  }, [fileExtension, disabled]);

  const editorOptions: ReactCodeMirrorProps["basicSetup"] = useMemo(
    () => ({
      lineNumbers: internalShowLineNumbers,
      highlightActiveLineGutter: internalShowLineNumbers,
      highlightActiveLine: true,
      foldGutter: true,
      dropCursor: true,
      allowMultipleSelections: true,
      indentOnInput: true,
      bracketMatching: true,
      closeBrackets: true,
      autocompletion: true,
      rectangularSelection: true,
      crosshairCursor: true,
      highlightSelectionMatches: true,
      closeBracketsKeymap: true,
      searchKeymap: true,
      foldKeymap: true,
      completionKeymap: true,
      lintKeymap: true,
    }),
    [internalShowLineNumbers]
  );

  const theme = useMemo(
    () =>
      EditorView.theme({
        "&": {
          height: height || "auto",
          minHeight: minHeight || "320px",
          maxHeight: maxHeight || "none",
          fontSize: "14px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "0.375rem",
        },
        ".cm-scroller": {
          fontFamily: '"Fira Code", "JetBrains Mono", "Courier New", monospace',
          lineHeight: "1.6",
        },
        ".cm-gutters": {
          backgroundColor: "#f8fafc",
          color: "#64748b",
          border: "none",
          borderRight: "1px solid #e2e8f0",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "#e0f2fe",
          color: "#0c4a6e",
        },
        ".cm-activeLine": {
          backgroundColor: "#f0f9ff",
        },
        ".cm-selectionBackground": {
          backgroundColor: "#3b82f6",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "#3b82f6",
        },
        ".cm-content ::selection": {
          backgroundColor: "#3b82f6",
          color: "#ffffff",
        },
        ".cm-line ::selection": {
          backgroundColor: "#3b82f6",
          color: "#ffffff",
        },
        "::selection": {
          backgroundColor: "#3b82f6",
          color: "#ffffff",
        },
        ".cm-selectionMatch": {
          backgroundColor: "#fef08a !important", // Yellow-200 for search matches
        },
        ".cm-content": {
          caretColor: "#2563eb",
          padding: "8px 0",
        },
        ".cm-line": {
          padding: "0 8px",
        },
        "&.cm-focused": {
          outline: "2px solid #3b82f6",
          outlineOffset: "2px",
        },
      }),
    [height, minHeight, maxHeight]
  );

  return (
    <div className={className}>
      <style>{`
        .cm-editor .cm-selectionBackground {
          background-color: #3b82f6 !important;
        }
        .cm-editor.cm-focused .cm-selectionBackground {
          background-color: #3b82f6 !important;
        }
        .cm-editor .cm-line::selection {
          background-color: #3b82f6 !important;
          color: #ffffff !important;
        }
        .cm-editor .cm-content ::selection {
          background-color: #3b82f6 !important;
          color: #ffffff !important;
        }
        .cm-editor ::selection {
          background-color: #3b82f6 !important;
          color: #ffffff !important;
        }
      `}</style>
      <CodeMirror
        ref={editorRef}
        value={value}
        height={height}
        extensions={[...extensions, theme]}
        onChange={(val) => onChange(val)}
        placeholder={placeholder}
        editable={!disabled}
        basicSetup={editorOptions}
      />
    </div>
  );
});

CodeMirrorEditor.displayName = "CodeMirrorEditor";

export default CodeMirrorEditor;

/**
 * Export toggle function for external use
 */
export function useLineNumbersToggle(initialValue = true) {
  const [showLineNumbers, setShowLineNumbers] = useState(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    const stored = localStorage.getItem("codemirror-line-numbers");
    return stored !== null ? stored === "true" : initialValue;
  });

  const toggleLineNumbers = () => {
    setShowLineNumbers((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("codemirror-line-numbers", String(next));
      }
      return next;
    });
  };

  return { showLineNumbers, toggleLineNumbers, setShowLineNumbers };
}
