# Tiptap Markdown Editor — Usage Guide

## Quick Start

The Tiptap Markdown Editor is integrated into SmartSpecPro's document management system. It provides a rich-text editing experience with markdown as the storage format.

### Using the Editor

The editor is available on any page that uses `UnifiedDocumentSurface`:

```tsx
import UnifiedDocumentSurface from "@/components/editor/UnifiedDocumentSurface";

<UnifiedDocumentSurface
  initialContent="# Hello World"
  onSave={(markdown) => saveToServer(markdown)}
  onContentChange={(markdown) => handleChange(markdown)}
/>
```

### Three Editing Modes

1. **View Mode** — Read-only rich preview (default). Double-click to enter Edit mode.
2. **Edit Mode** — Rich-text WYSIWYG editing with toolbar, slash commands, and media insertion.
3. **Source Mode** — Direct markdown editing with CodeMirror syntax highlighting.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Immediate save |
| `Escape` | Return to View mode |
| `/` | Open slash command menu (in Edit mode) |

### Slash Commands

Type `/` in Edit mode to access:
- Headings (1-4), bullet list, ordered list
- Blockquote, code block, divider
- Image, video, audio insertion
- Table

### Media Support

The editor supports inline media nodes:
- **Images** — Standard markdown `![alt](url)` + custom attributes via data-*
- **Video** — `<video>` HTML tags with poster, caption, and asset tracking
- **Audio** — `<audio>` HTML tags with player controls

Insert via slash commands, toolbar buttons, paste, or drag-and-drop.

## API Reference

### TiptapMarkdownBridge

Core parse/serialize module:

```ts
import { parse, serialize, getDefaultExtensions } from "./TiptapMarkdownBridge";

// Parse markdown to Tiptap JSON document
const doc: JSONContent = parse("# Hello **World**");

// Serialize Tiptap JSON back to markdown
const markdown: string = serialize(doc);

// Get the standard extension set
const extensions: Extension[] = getDefaultExtensions();
```

### Serialization Guard

Detects content loss during markdown round-trips:

```ts
import { checkSerializationIntegrity, countNodes } from "./serialization-guard";

const doc = parse(markdown);
const result = checkSerializationIntegrity(doc);
// result.ok === true → safe to edit in rich-text mode
// result.ok === false → some nodes will be lost; recommend Source Mode

const nodeCount = countNodes(doc); // structural nodes (excludes doc/text)
```

### ConflictResolutionDialog

Optimistic locking UI for concurrent edits:

```tsx
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";

<ConflictResolutionDialog
  open={hasConflict}
  documentTitle="My Document"
  onOverwrite={() => forceSave()}
  onReload={() => refetchContent()}
/>
```

### EditorToolbar

Formatting toolbar with mode switching:

```tsx
import EditorToolbar from "./EditorToolbar";

<EditorToolbar
  editor={editor}
  mode={mode}
  onModeChange={setMode}
  saveStatus={saveStatus}
  onSave={handleSave}
  onInsertMedia={handleMediaInsert}
  onInsertLink={handleLinkInsert}
/>
```

## File Inventory

### Core Components
| File | Purpose |
|------|---------|
| `TiptapMarkdownBridge.ts` | Parse/serialize markdown ↔ Tiptap JSON |
| `TiptapEditor.tsx` | React wrapper for Tiptap editor instance |
| `UnifiedDocumentSurface.tsx` | Main editor container with mode switching, auto-save, conflict resolution |
| `EditorToolbar.tsx` | Formatting toolbar with mode buttons and save status |
| `SourceModePanel.tsx` | CodeMirror wrapper for source mode |
| `ConflictResolutionDialog.tsx` | Optimistic locking conflict UI |

### Extensions
| File | Purpose |
|------|---------|
| `extensions/imageExtension.ts` | Custom image node with data-* attributes |
| `extensions/videoExtension.ts` | Custom video node with poster, caption, assetId |
| `extensions/audioExtension.ts` | Custom audio node with controls |
| `slashCommandExtension.ts` | Slash command trigger and popup |
| `SlashCommandMenu.tsx` | Slash command menu UI with keyboard navigation |

### Utilities
| File | Purpose |
|------|---------|
| `serialization-guard.ts` | Round-trip integrity checker |
| `pasteHandlers.ts` | Clipboard paste processing |
| `dropHandler.ts` | Drag-and-drop file handling |
| `MediaInsertMenu.tsx` | Media library picker for inserting images/video/audio |

### Node Views
| File | Purpose |
|------|---------|
| `nodeviews/ImageNodeView.tsx` | Rich image rendering with overlay controls |
| `nodeviews/VideoNodeView.tsx` | Video player with overlay controls |
| `nodeviews/AudioNodeView.tsx` | Audio player rendering |

### Test Files
| File | Tests |
|------|-------|
| `TiptapMarkdownBridge.test.ts` | 15 parse/serialize/round-trip tests |
| `TiptapEditor.test.tsx` | 6 editor lifecycle tests |
| `UnifiedDocumentSurface.test.tsx` | 14 mode switching/auto-save tests |
| `EditorToolbar.test.tsx` | Toolbar button/mode tests |
| `SlashCommandMenu.test.tsx` | Menu rendering/keyboard navigation tests |
| `ConflictResolutionDialog.test.tsx` | 6 dialog interaction tests |
| `MediaInsertMenu.test.tsx` | 10 media picker tests |
| `serialization-guard.test.ts` | 8 integrity check tests |
| `performance.test.ts` | 5 benchmark tests (3 active, 2 skipped) |
| `hardening.test.tsx` | 9 legacy/accessibility/Thai tests |
