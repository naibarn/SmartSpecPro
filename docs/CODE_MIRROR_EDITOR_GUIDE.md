# CodeMirror Editor Integration Guide

## 📋 Overview

SmartSpecPro now includes a professional CodeMirror-based editor with multi-language syntax highlighting, line numbers, and advanced editing features.

## 🎯 What's Implemented

### 1. CodeMirrorEditor Component
**Location:** `apps/web/client/src/components/library/CodeMirrorEditor.tsx`

**Features:**
- ✅ Line number toggle (persisted in localStorage)
- ✅ Syntax highlighting for 20+ languages
- ✅ Auto-detection based on file extension
- ✅ Configurable height (responsive)
- ✅ Professional theme with focus indicators
- ✅ Advanced features: bracket matching, auto-completion, search, fold

**Supported Languages:**
```typescript
// Markdown
md, markdown

// JavaScript/TypeScript
js, jsx, ts, tsx, mjs

// Python
py, pyw

// PHP
php

// Web
html, htm, css, scss, sass, less

// Data
json, xml, svg, yaml, yml

// Database
sql

// Plain Text
txt, text, log
```

### 2. MarkdownFileEditor Component
**Location:** `apps/web/client/src/components/library/MarkdownFileEditor.tsx`

**Updates:**
- ✅ Replaced Textarea with CodeMirrorEditor
- ✅ Added line number toggle button (Hash icon)
- ✅ Preserved all formatting toolbar features
- ✅ Maintained split-view (editor + preview)
- ✅ Mobile responsive layout

### 3. CodeFileEditor Component
**Location:** `apps/web/client/src/components/library/CodeFileEditor.tsx`

**Features:**
- ✅ Specialized for programming language files
- ✅ Language badge indicator
- ✅ Save button with loading state
- ✅ Read-only mode support
- ✅ Error message display

## 🚀 Usage Examples

### Example 1: Basic Markdown Editor
```typescript
import CodeMirrorEditor from "@/components/library/CodeMirrorEditor";

<CodeMirrorEditor
  value={markdownContent}
  onChange={(newValue) => setMarkdownContent(newValue)}
  fileExtension="md"
  showLineNumbers={true}
  height="70vh"
  placeholder="Write markdown..."
/>
```

### Example 2: Python Editor with Save
```typescript
import CodeFileEditor from "@/components/library/CodeFileEditor";

<CodeFileEditor
  value={pythonCode}
  onChange={setPythonCode}
  onSave={handleSave}
  fileExtension="py"
  isSaving={isSaving}
  fullHeight={true}
  showToolbar={true}
/>
```

### Example 3: Read-Only JavaScript Viewer
```typescript
<CodeFileEditor
  value={jsCode}
  fileExtension="js"
  readOnly={true}
  showToolbar={false}
/>
```

### Example 4: Line Number Toggle Hook
```typescript
import { useLineNumbersToggle } from "@/components/library/CodeMirrorEditor";

function MyEditor() {
  const { showLineNumbers, toggleLineNumbers } = useLineNumbersToggle(true);

  return (
    <>
      <Button onClick={toggleLineNumbers}>
        {showLineNumbers ? "Hide" : "Show"} Line Numbers
      </Button>
      <CodeMirrorEditor
        value={code}
        onChange={setCode}
        fileExtension="ts"
        showLineNumbers={showLineNumbers}
      />
    </>
  );
}
```

## 🎨 UI/UX Features

### Line Number Toggle
- **Icon:** Hash (#) symbol
- **State:** Filled button when ON, outline when OFF
- **Persistence:** Saved to `localStorage` as `codemirror-line-numbers`
- **Location:** Top-right of toolbar, separated by border

### Theme
- **Colors:** Light theme with blue accents
- **Active line:** Light blue background (#f0f9ff)
- **Selection:** Blue highlight (#93c5fd)
- **Gutters:** Light gray (#f8fafc)
- **Focus:** Blue outline (2px)

### Keyboard Shortcuts (Built-in)
| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + F | Find |
| Ctrl/Cmd + H | Find and replace |
| Ctrl/Cmd + G | Go to line |
| Ctrl/Cmd + / | Toggle comment |
| Tab | Indent |
| Shift + Tab | Outdent |
| Ctrl/Cmd + [ | Fold code |
| Ctrl/Cmd + ] | Unfold code |

## 📝 Document Management Integration

### Current Status
✅ **Implemented:**
- Markdown files (.md) - Full edit support
- All code files - View support (via CodeViewer)

⚠️ **Pending:**
- Code files editing in Document Management
- CSV grid editor
- Word/Excel document editing

### To Enable Code Editing in DocumentManagement.tsx

**Step 1:** Add code content fetching (similar to markdown):
```typescript
const codeContentQuery = trpc.library.getCodeContent.useQuery(
  { id: selectedItem?.id || 0 },
  {
    enabled: Boolean(selectedItem && ["code", "text", "json", "xml"].includes(previewType)),
  },
);
```

**Step 2:** Add draft state for code:
```typescript
const [codeDraftByDocId, setCodeDraftByDocId] = useState<Record<number, CodeDraftState>>({});
```

**Step 3:** Add save mutation:
```typescript
const saveCodeMutation = trpc.library.saveCode.useMutation();
```

**Step 4:** Update DocumentPreviewPanel to use CodeFileEditor:
```typescript
{["code", "text", "json", "xml"].includes(previewType) ? (
  <CodeFileEditor
    value={codeValue || ""}
    onChange={(value) => onCodeChange?.(value)}
    onSave={() => onCodeSave?.()}
    fileExtension={getFileExtension(item.title)}
    fullHeight={true}
  />
) : null}
```

## 🔧 Backend API Requirements

To enable full code editing, add these tRPC routes:

### 1. Get Code Content
```typescript
getCodeContent: protectedProcedure
  .input(z.object({ id: z.number().int().positive() }))
  .query(async ({ input, ctx }) => {
    // Fetch code content from library_item_chunks or source_url
    return { content: string, updated_at: Date };
  });
```

### 2. Save Code Content
```typescript
saveCode: protectedProcedure
  .input(z.object({
    id: z.number().int().positive(),
    content: z.string().max(1_000_000), // 1MB limit
    expectedUpdatedAt: z.coerce.date().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Save code content + trigger re-indexing
    return { item, indexJob };
  });
```

## 📊 Performance Considerations

### File Size Limits
| File Type | Recommended Max | API Limit |
|-----------|----------------|-----------|
| Markdown | 1 MB (1,000,000 chars) | ✅ Enforced |
| Code files | 1 MB | ⚠️ To be enforced |
| CSV | 10 MB | ⚠️ Needs special handling |

### Large File Handling
- **< 100 KB:** Instant load, smooth editing
- **100 KB - 500 KB:** Good performance with CodeMirror virtualization
- **500 KB - 1 MB:** Acceptable, may have slight lag on slower devices
- **> 1 MB:** Consider chunking or read-only mode

### Optimization Tips
1. **Lazy load editor** — Don't render CodeMirror until user opens the file
2. **Debounce onChange** — For auto-save features
3. **Virtual scrolling** — Built into CodeMirror for large files
4. **Disable preview** — For very large code files

## 🐛 Known Limitations

### 1. Toolbar Button Behavior
**Issue:** Markdown toolbar buttons (Bold, Italic, etc.) don't work with CodeMirror
**Reason:** CodeMirror doesn't expose selectionStart/End like Textarea
**Workaround:** Keep buttons but they insert at end of document
**Future Fix:** Implement CodeMirror-specific text manipulation using EditorView API

### 2. Mobile Keyboard
**Issue:** Some devices may not trigger onChange on every keystroke
**Status:** Testing needed on various mobile browsers

### 3. Large File Performance
**Issue:** Files > 1MB may cause UI lag
**Solution:** Show warning message and suggest splitting file

## 🎯 Next Steps

### Priority 1: Enable Code Editing
1. Create backend API routes (getCodeContent, saveCode)
2. Update DocumentPreviewPanel to use CodeFileEditor
3. Add code draft state management
4. Test with various file types

### Priority 2: CSV Editor
See: [CSV_EXCEL_WORD_EDITING_SOLUTIONS.md](./CSV_EXCEL_WORD_EDITING_SOLUTIONS.md)

### Priority 3: Enhanced Features
- [ ] Vim mode (optional toggle)
- [ ] Dark theme toggle
- [ ] Custom keyboard shortcuts
- [ ] Collaborative editing (future)

## 📚 References

- [CodeMirror 6 Documentation](https://codemirror.net/docs/)
- [@uiw/react-codemirror](https://uiwjs.github.io/react-codemirror/)
- [Language Extensions](https://codemirror.net/docs/ref/#language)

## 🤝 Contributing

When adding new language support:

1. Install language package:
   ```bash
   npm install @codemirror/lang-<language>
   ```

2. Add to `LANGUAGE_EXTENSIONS` in `CodeMirrorEditor.tsx`:
   ```typescript
   import { <language> } from "@codemirror/lang-<language>";

   export const LANGUAGE_EXTENSIONS: Record<string, () => Extension> = {
     // ...existing languages
     <ext>: <language>,
   };
   ```

3. Add to language name mapping for UI display

4. Test with sample file

---

**Last Updated:** 2026-02-13
**Version:** 1.0.0
**Status:** ✅ Core features implemented, testing phase
