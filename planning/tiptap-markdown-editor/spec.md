# Feature 046 — Tiptap Single-Panel Markdown Editor

## Status: SPEC READY — Awaiting Approval

**Created**: 2026-03-18
**Branch**: `codex/feature-046-tiptap-markdown-editor`
**Spec Source**: MartdawnEditor.md (user-provided)

---

## 1. Executive Summary

แทนที่ระบบ Editor ปัจจุบันที่ใช้ **CodeMirror + SafeMarkdown split-panel** (แยก editor กับ preview สองจอ) ด้วย **Tiptap OSS single-panel rich markdown editor** ที่รวม display กับ edit ไว้ใน panel ชุดเดียวกัน

### เป้าหมายหลัก
- ผู้ใช้เห็นเอกสาร render สวยใน pane เดียว (ไม่ต้องเปิด preview อีกจอ)
- คลิก Edit แล้วพิมพ์ตรงที่เห็น (WYSIWYG-like)
- รูปและวิดีโอ render inline ใน editor ได้เลย
- ยังคง serialize/deserialize เป็น Markdown ได้ (backward compatible)
- มี Source Mode fallback สำหรับ power user

---

## 2. Problem Statement

### ปัญหาปัจจุบัน

| ปัญหา | รายละเอียด |
|--------|------------|
| Split-panel ไม่จำเป็น | ผู้ใช้ต้องสลับระหว่าง raw markdown editor + preview panel ซ้ำๆ |
| พื้นที่ถูกแบ่งครึ่ง | หน้าจอถูกกินไปทั้งสองฝั่ง โดยเฉพาะบนจอเล็ก |
| Media จัดการยาก | เวลาแทรกรูปหรือวิดีโอ ต้องสลับดู preview เพื่อเช็คผลลัพธ์ |
| ไม่ทันสมัย | ผู้ใช้คาดหวัง editor แบบ Google Docs / Notion (single pane) |

### ไฟล์ที่เกี่ยวข้อง (Current State)

| Component | Path | Lines | หน้าที่ |
|-----------|------|-------|---------|
| `MarkdownFileEditor` | `apps/web/client/src/components/library/MarkdownFileEditor.tsx` | 937 | Editor หลัก (CodeMirror + preview split) |
| `CodeMirrorEditor` | `apps/web/client/src/components/library/CodeMirrorEditor.tsx` | 415 | CodeMirror 6 wrapper |
| `DocumentPreviewPanel` | `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` | 628 | Preview panel ที่ lazy-load MarkdownFileEditor |
| `SafeMarkdown` | `apps/web/client/src/components/chat/SafeMarkdown.tsx` | 347 | Markdown renderer (streamdown + DOMPurify) |
| `DocumentManagement` | `apps/web/client/src/pages/DocumentManagement.tsx` | 2344+ | หน้า Document Management หลัก (3-panel layout) |

### Dependencies ปัจจุบัน
- `@uiw/react-codemirror` ^4.25.4 — Editor engine
- `@codemirror/lang-markdown` ^6.5.0 — Markdown syntax
- `streamdown` ^1.4.0 — Markdown rendering (client)
- `marked` ^16.4.2 — Markdown parsing (server)
- `dompurify` ^3.3.1 — HTML sanitization

---

## 2.5 Split-Panel Elimination Analysis

การลบ split-panel ต้องแก้ไขที่ **2 ระดับ** — ทั้งใน component และใน page:

### ระดับ 1: MarkdownFileEditor.tsx (Component-level split)

โค้ดที่ต้องลบ/แทนที่:

| Code | Lines | หน้าที่ |
|------|-------|---------|
| `editorCollapsed` / `previewCollapsed` state | 81-82 | ควบคุม panel ซ้าย/ขวา |
| `toggleEditorCollapsed()` / `togglePreviewCollapsed()` | 272-290 | สลับ collapse |
| `PanelLeftClose/Open, PanelRightClose/Open` imports | 20-23 | ไอคอน split buttons |
| Mobile split layout (`md:hidden`) | 820-864 | มือถือ: สลับ editor/preview tabs |
| Desktop split layout (`hidden md:flex`) | 866-933 | Desktop: editor ซ้าย + preview ขวา |

**ข้อสังเกต**: MarkdownFileEditor มี `editorOnly` prop (line 83 `isEditMode`) ที่แสดงโหมด view/edit สลับกัน ซึ่งเป็นพื้นฐานที่ดีสำหรับ single-panel ใหม่

### ระดับ 2: DocumentManagement.tsx (Page-level split)

**สำคัญ**: หน้า DocumentManagement.tsx (2344+ บรรทัด) มี split-panel logic ของตัวเองที่แยกจาก MarkdownFileEditor:

| Code | Lines | หน้าที่ |
|------|-------|---------|
| `isMarkdownPreviewPanelOpen` state | 154 | ควบคุม preview panel ระดับ page |
| `isEditorPanelCollapsed` state | 155 | ควบคุม editor panel collapse |
| `isPreviewExpanded` state | 156 | ขยาย preview เต็มจอ |
| Desktop preview panel (SafeMarkdown) | ~2232-2245 | render markdown preview แยก |
| Mobile `mobileTab === "preview"` | ~1754-1760 | mobile tab ที่ render SafeMarkdown |
| `onEnterEditMode` callback | 2196 | เปิด preview panel เมื่อเข้า edit (desktop only) |
| Resize handle between panels | ~1101-1106 | drag เพื่อปรับขนาด panel |

**ปัจจุบัน**: DocumentManagement ส่ง `markdownEditorOnly={true}` ให้ DocumentPreviewPanel → ทำให้ MarkdownFileEditor ใช้โหมด editorOnly (view/edit toggle) — แต่ page ยังมี SafeMarkdown preview panel แยกอีกชุด

### เป้าหมาย: ลบ split-panel ทั้ง 2 ระดับ

```
Current (3-panel page layout):
┌──────────┬──────────────────────┬────────────────┐
│ Library  │  Editor (CodeMirror) │ Preview        │
│ Browser  │  OR View (Markdown)  │ (SafeMarkdown) │
│          │  [MarkdownFileEditor]│ [Page-level]   │
└──────────┴──────────────────────┴────────────────┘

Target (2-panel page layout):
┌──────────┬─────────────────────────────────────────┐
│ Library  │  Unified Tiptap Editor                  │
│ Browser  │  (View + Edit + Source ใน surface เดียว) │
│          │  [UnifiedDocumentSurface]                │
└──────────┴─────────────────────────────────────────┘
```

**ผลลัพธ์**: Preview panel ขวาสุดถูกยุบรวมเข้ามาใน Tiptap editor — ไม่ต้องมี panel แยกอีกต่อไป

### Code ที่ต้องลบใน DocumentManagement.tsx

- ลบ `isMarkdownPreviewPanelOpen` state + ปุ่ม toggle (PanelRightClose/Open)
- ลบ `isPreviewExpanded` state
- ลบ resize handle ระหว่าง editor กับ preview
- ลบ SafeMarkdown preview panel (desktop)
- ลบ mobile preview tab (`mobileTab === "preview"` rendering SafeMarkdown)
- แก้ `onEnterEditMode` → ไม่ต้องเปิด preview panel อีก (ใช้ inline mode แทน)
- คง `isEditorPanelCollapsed` ไว้ได้ ถ้ายังต้องการ collapse editor panel ทั้งก้อน

---

## 3. Target Architecture

### 3.1 Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  DocumentEditorPage                              │
│  ┌──────────────────────────────────────────────┐│
│  │ DocumentPreviewPanel Outer Header (existing) ││
│  │ [Title/Rename] [Share] [Download] [...]      ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │ UnifiedDocumentSurface                       ││
│  │                                              ││
│  │ ┌──────────────────────────────────────────┐ ││
│  │ │ EditorToolbar                            │ ││
│  │ │ [View│Edit│Source] B I U H1 H2 Link ⋯   │ ││
│  │ └──────────────────────────────────────────┘ ││
│  │                                              ││
│  │ ┌──────────────────────────────────────────┐ ││
│  │ │ TiptapEditor                             │ ││
│  │ │                                          │ ││
│  │ │  # Heading 1                             │ ││
│  │ │                                          │ ││
│  │ │  Paragraph text with **bold** and *ita…  │ ││
│  │ │                                          │ ││
│  │ │  ┌─────────────────────────┐             │ ││
│  │ │  │ 📷 ImageNodeView       │             │ ││
│  │ │  │ [image rendered inline] │             │ ││
│  │ │  │ caption: "…"           │             │ ││
│  │ │  └─────────────────────────┘             │ ││
│  │ │                                          │ ││
│  │ │  ┌─────────────────────────┐             │ ││
│  │ │  │ 🎬 VideoNodeView       │             │ ││
│  │ │  │ [video player inline]   │             │ ││
│  │ │  │ caption: "…"           │             │ ││
│  │ │  └─────────────────────────┘             │ ││
│  │ │                                          │ ││
│  │ │  - bullet list                           │ ││
│  │ │  > blockquote                            │ ││
│  │ │                                          │ ││
│  │ └──────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │ [Source Mode Toggle — CodeMirror fallback]   ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
Load:  DB (markdown string)
       → fetch via tRPC
       → TiptapMarkdownBridge.parse(md)
       → Tiptap ProseMirror document model
       → TiptapEditor renders rich content

Save:  TiptapEditor document model
       → TiptapMarkdownBridge.serialize(doc)
       → Markdown string
       → tRPC mutation → DB

Source Mode:
       → raw CodeMirror editor (existing)
       → direct markdown edit
       → parse back to Tiptap on switch
```

### 3.3 Source of Truth

**Markdown** ยังคงเป็น canonical storage format — ไม่เปลี่ยน database schema

Runtime ใช้ Tiptap document model ภายใน, serialize กลับเป็น Markdown เมื่อ save

---

## 4. Component Design

### 4.1 New Components

```
apps/web/client/src/components/editor/
├── TiptapEditor.tsx              # Main Tiptap editor surface
├── TiptapMarkdownBridge.ts       # Markdown ↔ Tiptap conversion
├── UnifiedDocumentSurface.tsx    # Shell: mode switcher + toolbar + editor + source
├── EditorToolbar.tsx             # Inline toolbar (mode switch, formatting, save status)
├── toolbar/
│   ├── BubbleMenu.tsx            # Context menu on text selection
│   └── MediaInsertMenu.tsx       # Insert image/video/audio menu
├── nodes/
│   ├── ImageNodeView.tsx         # Custom image block (resize, caption, alt)
│   ├── VideoNodeView.tsx         # Custom video block (player, caption)
│   ├── AudioNodeView.tsx         # Custom audio block
│   └── MediaSelectionOverlay.tsx # Selection outline + quick actions
├── extensions/
│   ├── imageExtension.ts         # Tiptap extension for image node
│   ├── videoExtension.ts         # Tiptap extension for video node
│   ├── audioExtension.ts         # Tiptap extension for audio node
│   └── mediaSerializationRules.ts    # Parse/serialize media HTML tags + data-* attrs
└── SourceModePanel.tsx           # Raw markdown editor (reuses CodeMirrorEditor)
```

> **Removed**: `DocumentEditorHeader.tsx` — title/rename/share owned by DocumentPreviewPanel outer header (ดู §4.2)
> **Renamed**: `FloatingToolbar.tsx` → `EditorToolbar.tsx` — เป็น inline toolbar ไม่ใช่ floating

### 4.2 Component Hierarchy

```
DocumentPreviewPanel (existing — modified)
 ├─ [Outer Header — owned by DocumentPreviewPanel]
 │   ├─ Title display/edit (isEditingTitle, rename flow)
 │   ├─ Share dialog, Download button
 │   └─ Replace-file button (non-markdown types only)
 │
 └─ [previewType === "markdown"]
     └─ UnifiedDocumentSurface (NEW — replaces MarkdownFileEditor)
         ├─ EditorToolbar (inline, NOT a separate header)
         │   ├─ Mode switcher: View | Edit | Source
         │   ├─ Save status indicator
         │   ├─ [Edit Mode] Formatting: H1-H4, Bold, Italic, Underline, Code
         │   ├─ [Edit Mode] Block: List, Ordered list, Quote, Code block, Divider
         │   ├─ [Edit Mode] Insert: Image picker, Video picker, Audio picker, Link
         │   ├─ [Edit Mode] Undo/Redo
         │   └─ Actions: Import, Save
         ├─ TiptapEditor (main surface)
         │   ├─ [View Mode] Read-only, no editing chrome
         │   ├─ [Edit Mode] Full editing, inline media
         │   ├─ ImageNodeView (per image block)
         │   ├─ VideoNodeView (per video block)
         │   ├─ AudioNodeView (per audio block)
         │   └─ BubbleMenu (on text selection)
         ├─ SourceModePanel (toggle, reuses CodeMirrorEditor)
         └─ DocumentVersionHistory (reuse existing, moved inside)
```

> **Header Ownership (Review Finding Round 3)**:
>
> `DocumentPreviewPanel` มี outer header ที่จัดการ title editing, rename, share, download อยู่แล้ว
> **ไม่สร้าง `DocumentEditorHeader.tsx` แยก** — ใช้ outer header ของ DocumentPreviewPanel เดิม
> สำหรับ title/rename/share/download เนื่องจาก logic เหล่านี้ (isEditingTitle, onRenameTitle, ShareDialog)
> ซับซ้อนและผูกกับ library item lifecycle
>
> `UnifiedDocumentSurface` มีแค่ **EditorToolbar** (inline) สำหรับ mode switch, formatting,
> save status, import/save actions — ไม่ซ้ำซ้อนกับ outer header
>
> **Version History**: DocumentPreviewPanel ปัจจุบัน suppress version history เมื่อ `previewType === "markdown"`
> (ให้ MarkdownFileEditor จัดการเอง) — pattern นี้คงเดิม: `DocumentVersionHistory` ย้ายเข้าไปใน
> `UnifiedDocumentSurface` แทน

### 4.3 Integration Points

| Integration | How |
|-------------|-----|
| Library media picker | Reuse existing `trpc.library.listDocuments` queries (image/video/audio search) |
| Save/load | Reuse existing `trpc.library.updateItem` / `trpc.library.getMarkdownContent` / `trpc.library.saveMarkdown` |
| Version history | Reuse existing `DocumentVersionHistory` component (ย้ายเข้า UnifiedDocumentSurface) |
| Source mode | Reuse existing `CodeMirrorEditor` component |
| Markdown rendering (fallback) | Reuse existing `SafeMarkdown` for compatibility mode |
| Title/rename/share | Owned by `DocumentPreviewPanel` outer header (ไม่แก้ไข) |

---

## 5. Content Model

### 5.1 Supported Block Types

| Block | Tiptap Extension | Markdown Equivalent |
|-------|-------------------|---------------------|
| paragraph | `Paragraph` (built-in) | plain text |
| heading (1-4) | `Heading` (built-in) | `# ## ### ####` |
| bullet_list | `BulletList` (built-in) | `- item` |
| ordered_list | `OrderedList` (built-in) | `1. item` |
| blockquote | `Blockquote` (built-in) | `> text` |
| code_block | `CodeBlock` (built-in) | ` ```lang ``` ` |
| horizontal_rule | `HorizontalRule` (built-in) | `---` |
| table | `Table` (extension) | GFM table syntax |
| image | **Custom** `ImageExtension` | `![alt](src)` |
| video | **Custom** `VideoExtension` | `<video src="..." controls>` (standard HTML) |
| audio | **Custom** `AudioExtension` | `<audio src="..." controls>` (standard HTML) |

### 5.2 Supported Inline Marks

| Mark | Tiptap Extension | Markdown |
|------|-------------------|----------|
| bold | `Bold` | `**text**` |
| italic | `Italic` | `*text*` |
| strike | `Strike` (via StarterKit) | `~~text~~` |
| underline | `Underline` | `<u>text</u>` (HTML-in-markdown) |
| code | `Code` | `` `code` `` |
| link | `Link` | `[text](url)` |

> **Note**: `strike` มาจาก StarterKit ไม่ต้องติดตั้ง `@tiptap/extension-strike` แยก
> `underline` serialize เป็น HTML `<u>` tag ภายใน markdown — ไม่ใช่ native markdown syntax
> `tiptap-markdown` กับ `html: true` จะ preserve HTML tags เหล่านี้ได้

### 5.3 Image Block Attributes

```typescript
interface ImageNodeAttrs {
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
  width?: number | string;
  height?: number | string;
  assetId?: number;        // library item reference
  alignment?: "left" | "center" | "right";
}
```

### 5.4 Video Block Attributes

```typescript
interface VideoNodeAttrs {
  src: string;
  poster?: string;
  caption?: string;
  mimeType?: string;
  assetId?: number;
  provider?: "upload" | "library";
  controls?: boolean;
}
```

### 5.5 Media Serialization Format

**Images** — standard markdown:
```markdown
![alt text](https://cdn.example.com/image.jpg)
```

**Images with extended attrs** — HTML fallback:
```html
<figure>
  <img src="https://cdn.example.com/image.jpg" alt="alt" width="600" />
  <figcaption>Caption text</figcaption>
</figure>
```

**Videos** — standard HTML `<video>` tag (backward compatible):
```html
<video src="https://cdn.example.com/video.mp4" controls width="100%"></video>
```

> **Note**: เอกสารเก่าอาจมี `style="border-radius:8px;max-width:720px;"` ซึ่ง DOMPurify strip ออก (ไม่อยู่ใน `ALLOWED_ATTR`)
> — ใช้ Tailwind classes `rounded-lg max-w-[720px]` ใน VideoNodeView แทน (ไม่ serialize style attr ลง markdown)

**Videos with extended attrs** — data attributes for metadata:
```html
<video src="https://cdn.example.com/video.mp4" controls width="100%" data-poster="thumb.jpg" data-caption="Demo video" data-asset-id="456"></video>
```

**Audio** — standard HTML with metadata title:
```html
<p><strong>Audio Title</strong></p>
<audio src="https://cdn.example.com/audio.mp3" controls style="width:100%;"></audio>
```

> **Decision Change (Review Finding)**: ใช้ standard HTML `<video>` / `<audio>` tags แทน custom elements `<smart-video>` / `<smart-audio>`
>
> **เหตุผล**: SafeMarkdown ใช้ DOMPurify ที่มี ALLOWED_TAGS รองรับ `video` + `audio` อยู่แล้ว
> แต่ custom elements จะถูก DOMPurify strip ออก → ทำให้ content ที่ถูก render นอก Tiptap (เช่น chat, export) หายไป
>
> **Backward Compatibility**: เอกสารเก่าใช้ `<video src="..." controls>` อยู่แล้ว (ดูจาก `insertVideoFromLibrary()` ใน MarkdownFileEditor.tsx:231)
> Extended attrs (poster, caption, assetId) ใช้ `data-*` attributes ที่ DOMPurify จะ preserve
>
> **Tiptap Extension**: videoExtension.ts จะ parse `<video>` tags + `data-*` attrs เป็น VideoNode
>
> **DOMPurify Fix Required**: `SafeMarkdown.tsx:69` ปัจจุบันตั้ง `ALLOW_DATA_ATTR: false` → `data-*` attributes ทั้งหมดจะถูก strip
>
> **ใช้ `ADD_ATTR` แบบ targeted** (ไม่ใช่ `ALLOW_DATA_ATTR: true` แบบ blanket):
> ```typescript
> DOMPurify.sanitize(html, {
>   ALLOWED_TAGS: [...existing...],
>   ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"],
>   // ALLOW_DATA_ATTR ยังคงเป็น false — เปิดเฉพาะ 3 attrs ที่ต้องการ
> });
> ```
> วิธีนี้ปลอดภัยกว่าการเปิด `ALLOW_DATA_ATTR: true` ทั้งหมด เพราะจำกัดเฉพาะ attributes ที่ระบบใช้จริง
>
> **Note**: `splitByMedia()` ใน SafeMarkdown bypass DOMPurify สำหรับ media tags —
> ต้องตรวจสอบว่า `data-*` attrs ถูก preserve ใน regex extraction path ด้วย

---

## 6. Modes of Operation

### 6.1 View Mode (default)
- เอกสาร render สวยเหมือน preview
- ไม่มี editing chrome (toolbar, cursor)
- Media render inline (images, video players)
- คลิก "Edit" หรือ double-click ที่ content เพื่อเข้า Edit Mode

### 6.2 Edit Mode
- Cursor ปรากฏ, พิมพ์ได้เลย
- EditorToolbar แสดง formatting actions
- BubbleMenu แสดงเมื่อ select text
- Media block clickable → แสดง selection overlay + quick actions
- Auto-save debounce 2 วินาที
- Manual save: Ctrl/Cmd + S

### 6.3 Source Mode
- แสดง raw markdown ใน CodeMirrorEditor (component เดิม)
- สำหรับ power users / debugging / legacy content ที่ parse ไม่ครบ
- เมื่อ switch กลับ Edit Mode → re-parse markdown เป็น Tiptap model

### 6.4 Mode Switching Rules

```
View ─── Edit button / double-click ──→ Edit
Edit ─── View button ──────────────────→ View (auto-save first)
Edit ─── Source toggle ────────────────→ Source (serialize to md first)
Source ── Source toggle ────────────────→ Edit (auto-save first, then parse md to tiptap)
Source ── View button ─────────────────→ View (auto-save first)
```

> **Save on mode exit**: ทุกครั้งที่ออกจาก mode ที่มีการแก้ไข (Edit หรือ Source) ต้อง auto-save ก่อน
> เพื่อป้องกัน data loss เมื่อผู้ใช้แก้ raw markdown ใน Source แล้วกด View โดยไม่ save

### 6.5 Tiptap Loading & Error Fallback

- ขณะ Tiptap กำลัง initialize: แสดง Skeleton loader (ไม่ใช่หน้าว่าง)
- ถ้า `useEditor()` throw error: แสดง error banner + fallback เป็น `SourceModePanel` (CodeMirror)
  → ผู้ใช้ยังแก้ไข raw markdown ได้แม้ Tiptap พัง
- Error boundary ครอบ `TiptapEditor` component — catch errors ไม่ให้ crash ทั้งหน้า

### 6.6 UX Details

- **Focus**: เมื่อ switch View→Edit focus ไปที่ editor content area; Edit→Source focus ไปที่ CodeMirror; Source→View focus ไม่เปลี่ยน
- **Scroll position**: คงตำแหน่ง scroll เมื่อ switch View↔Edit (ProseMirror doc model เดิม); Source mode reset scroll เป็นตำแหน่ง cursor
- **Empty state**: แสดง placeholder text ผ่าน i18n `t("editor.placeholder")` — "Start writing..." / "เริ่มเขียนเนื้อหา..."
- **Editor CSS**: Tiptap `.ProseMirror` div ต้องมี base styles (typography, spacing, list bullets) — สร้างไฟล์ `editor/editor.css` ที่ใช้ Tailwind `@apply` สำหรับ heading sizes, paragraph spacing, code block background เป็นต้น ไม่ conflict กับ global Tailwind เพราะ scope อยู่ภายใต้ `.tiptap-editor` class

---

## 7. Tiptap Extension Stack

### 7.1 NPM Packages Required

```json
{
  "@tiptap/react": "^2.x",
  "@tiptap/starter-kit": "^2.x",
  "@tiptap/extension-image": "^2.x",
  "@tiptap/extension-link": "^2.x",
  "@tiptap/extension-table": "^2.x",
  "@tiptap/extension-table-row": "^2.x",
  "@tiptap/extension-table-cell": "^2.x",
  "@tiptap/extension-table-header": "^2.x",
  "@tiptap/extension-underline": "^2.x",
  "@tiptap/extension-placeholder": "^2.x",
  "tiptap-markdown": "^0.8.x"
}
```

> **`tiptap-markdown`** — community package ที่ช่วย parse/serialize markdown ↔ Tiptap document model
> เป็น bridge หลักที่ลด custom code ได้มาก

### 7.2 Extension Configuration

```typescript
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

// Custom extensions
import { VideoExtension } from "./extensions/videoExtension";
import { AudioExtension } from "./extensions/audioExtension";

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    codeBlock: { HTMLAttributes: { class: "code-block" } },
  }),
  Image.extend({
    // Extended with caption, alignment, assetId attrs
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { class: "editor-link" },
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  Underline,
  Placeholder.configure({
    placeholder: t("editor.placeholder"), // en: "Start writing..." / th: "เริ่มเขียนเนื้อหา..."
  }),
  Markdown.configure({
    html: true,
    transformPastedText: true,
  }),
  VideoExtension,
  AudioExtension,
];
```

> **Notes:**
> - `Strike` mark มาจาก StarterKit แล้ว ไม่ต้องติดตั้ง `@tiptap/extension-strike` แยก
> - `tiptap-markdown` มีข้อจำกัด: ไม่ serialize language tag ใน fenced code blocks (เช่น ` ```python ` จะกลายเป็น ` ``` `) — ต้องเพิ่ม custom code block serializer override ถ้าต้องการ preserve language
> - `tiptap-markdown` table serialization อาจไม่ครบ 100% สำหรับ complex tables — ต้อง test ใน Phase 4
> - ตรวจสอบ `useEditor()` hook กับ React 19 StrictMode ด้วย option `immediatelyRender: false` (Tiptap 2.4+)

---

## 8. Media Handling

### 8.1 Image Insertion Flow

```
User clicks Insert Image
  → MediaInsertMenu opens
  → Tab: "Library" | "Upload"
  → [Library] Search via trpc.library.listDocuments({ itemType: "image" })
  → Click image → insert ImageNode into Tiptap
  → [Upload] Drag & drop / file picker → upload to S3 → insert ImageNode
```

### 8.2 Image Interaction (Edit Mode)

- Click image → selection outline + action bar appears
- Actions: Replace, Edit alt/caption, Align (left/center/right), Remove
- Resize handles (drag corners) — optional Phase 4
- Caption editable inline below image

### 8.3 Video Insertion Flow

```
User clicks Insert Video
  → MediaInsertMenu opens
  → Search via trpc.library.listDocuments({ itemType: "video" })
  → Click video → insert VideoNode
  → VideoNodeView renders <video> player with controls
```

### 8.4 Security Constraints

- Video sources: **only** uploaded files or library assets (trusted origins)
- **NO** arbitrary iframe embeds
- **NO** external URL video embeds (Phase 1)
- All media URLs sanitized via allowlist
- DOMPurify still used for any HTML passthrough

---

## 9. Save Behavior

### 9.1 Auto-save
- Debounce: 2 seconds after last edit
- Status indicator: `Saving...` → `Saved` → `Unsaved changes`
- On error: show banner, allow retry, don't lose content

### 9.2 Manual Save
- `Ctrl/Cmd + S` shortcut
- Save button in header

### 9.3 Serialization Guard

```typescript
function serializeAndValidate(editor: Editor): { markdown: string; warnings: string[] } {
  const markdown = editor.storage.markdown.getMarkdown();
  const warnings: string[] = [];

  // Check for data that might be lost in serialization
  // e.g., complex tables, nested structures
  // ทั้งสอง helpers export จาก TiptapMarkdownBridge.ts:
  // - parseMarkdownToTiptap(md: string) → เรียก tiptap-markdown parse API สร้าง ProseMirror Node
  // - countNodes(doc: Node) → recursively count ProseMirror nodes ใน document tree
  const reparsed = parseMarkdownToTiptap(markdown);
  const originalNodeCount = countNodes(editor.state.doc);
  const reparsedNodeCount = countNodes(reparsed);

  if (reparsedNodeCount < originalNodeCount * 0.9) {
    warnings.push("Some content may be simplified during save");
  }

  return { markdown, warnings };
}
```

---

## 10. Migration Strategy

### 10.1 Backward Compatibility

- **ไม่มี database migration** — เอกสารยังเก็บเป็น markdown string เหมือนเดิม
- เอกสาร markdown เดิมต้อง parse ได้ 100% ใน editor ใหม่
- ถ้า parse ไม่ได้ → fallback เป็น Source Mode อัตโนมัติ

### 10.2 Lazy Migration on Open

```
Open document:
  1. Fetch markdown string
  2. Parse via TiptapMarkdownBridge
  3. If parse success → render in Tiptap editor
  4. If parse has unsupported blocks → show warning + offer Source Mode
  5. User saves → re-serialize (may normalize formatting)
```

### 10.3 Component Migration

| Phase | Action |
|-------|--------|
| Phase 1 | สร้าง `UnifiedDocumentSurface` + `TiptapEditor` เป็น component ใหม่ |
| Phase 2 | เพิ่ม media nodes (image, video, audio) |
| Phase 3 | แทนที่ `MarkdownFileEditor` ใน `DocumentPreviewPanel` + **ลบ page-level split-panel ใน DocumentManagement.tsx** |
| Phase 4 | ลบ split-panel code ที่ไม่ใช้แล้ว, cleanup CodeMirror deps ถ้าไม่ต้องการ |

> **Note**: `CodeMirrorEditor` ยังต้องเก็บไว้สำหรับ Source Mode + CodeFileEditor (non-markdown files)

### 10.4 DocumentManagement.tsx Page-Level Changes

เนื่องจาก DocumentManagement.tsx (2344+ บรรทัด) มี split-panel logic ของตัวเอง จึงต้องแก้ไขเพิ่มเติม:

**ลบ:**
- `isMarkdownPreviewPanelOpen` state + toggle button (PanelRightClose/Open) (line 154)
- `isPreviewExpanded` state + expand button (line 156)
- `isPreviewFullWidth` derived value (line 1082) + ทุก JSX ที่ใช้ค่านี้ (lines ~2215, 2247-2249)
- `previewPanelWidth` state (line 162) + CSS ที่ใช้ค่านี้
- `beginHorizontalResize("preview", ...)` call-site + session initialization ที่ใช้ `previewOpenAtStart` (lines ~1097-1108)
- Desktop: SafeMarkdown preview panel ทางขวา (lines ~2232-2245)
- Mobile: `mobileTab === "preview"` tab ที่ render SafeMarkdown (lines ~1754-1760)
- Resize handle ระหว่าง editor กับ preview panel
- `onEnterEditMode` callback ที่เปิด preview panel (line 2196)

**คง:**
- `isLibraryPanelOpen` — library browser panel ทางซ้ายยังจำเป็น
- `isEditorPanelCollapsed` — ใช้สำหรับ collapse/expand editor panel ทั้งก้อน
- `markdownDraftByDocId` — คงไว้เป็น dirty-state store, ปรับให้ sync กับ Tiptap `onUpdate` callback แทน CodeMirror `onChange`
- `isEditorTabDirty()` (line 375) + callers:
  - `beforeunload` guard (lines 386-396) — เตือนผู้ใช้เมื่อมี unsaved changes
  - Tab-close confirmation dialog (line 1662)
  - Dirty-dot indicator บน editor tabs (line 2116)
  - ทั้ง 3 callers ต้องทำงานได้หลังเปลี่ยน dirty-state source

**แก้:**
- `onEnterEditMode` → **เปลี่ยน contract**: ปัจจุบัน callback นี้เปิด preview panel (`setIsMarkdownPreviewPanelOpen(true)`) ซึ่งจะถูกลบ
  - **Desktop** (line 2196): เปลี่ยนจากเปิด preview panel → เรียก `UnifiedDocumentSurface.enterEditMode()` (ผ่าน ref หรือ prop callback)
  - **Mobile** (line 1730): ปัจจุบันไม่ส่ง `onEnterEditMode` → เพิ่มให้ส่ง callback เดียวกัน (switch `mobileTab` to `"editor"` + enter edit mode)
  - **Signature**: `onEnterEditMode?: () => void` → ไม่เปลี่ยน signature, แค่เปลี่ยน implementation ภายใน
- `markdownDraftByDocId` → **คงไว้** และปรับให้ Tiptap `onUpdate` เขียนค่าเข้า `markdownDraftByDocId[tabId].value` เพื่อให้ `beforeunload` guard + `isEditorTabDirty()` + dirty-dot ยังทำงานได้ (auto-save จะ reset `.savedValue` เมื่อ save สำเร็จ)
- ปรับ layout จาก 3-column → 2-column (library + editor)
- Mobile: ปรับ `mobileTab` type จาก `"library" | "editor" | "preview"` → `"library" | "editor"` (2 tabs)

---

## 11. Implementation Phases

### Phase 1 — Foundation (Priority: HIGH)

**Deliverables:**
- [ ] ติดตั้ง Tiptap packages (`@tiptap/react`, `@tiptap/starter-kit`, `tiptap-markdown`)
- [ ] สร้าง `TiptapEditor.tsx` — basic rich editor surface (with `immediatelyRender: false` for React 19)
- [ ] สร้าง `TiptapMarkdownBridge.ts` — markdown ↔ Tiptap conversion
- [ ] สร้าง `UnifiedDocumentSurface.tsx` — shell component (mode switcher + toolbar + editor + source)
- [ ] สร้าง `EditorToolbar.tsx` — inline toolbar (mode switch, formatting, save status)
- [ ] สร้าง `SourceModePanel.tsx` — reuse CodeMirrorEditor
- [ ] Implement View/Edit/Source mode toggle + save-on-exit rule (§6.4)
- [ ] Implement loading skeleton + error fallback to Source Mode (§6.5)
- [ ] Support basic blocks: heading, paragraph, list, quote, code, table, hr
- [ ] Support inline marks: bold, italic, strike, underline, code, link
- [ ] Auto-save + manual save (Ctrl+S)
- [ ] Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+K)
- [ ] สร้าง `editor.css` — Tiptap `.ProseMirror` base styles (scoped `.tiptap-editor`)

**Estimated files:**
- NEW: 7 files in `components/editor/` (6 components + 1 CSS)
- MODIFIED: `package.json` (add tiptap deps)

### Phase 2 — Media (Priority: HIGH)

**Deliverables:**
- [ ] สร้าง `ImageNodeView.tsx` — custom image block
- [ ] สร้าง `VideoNodeView.tsx` — custom video block
- [ ] สร้าง `AudioNodeView.tsx` — custom audio block
- [ ] สร้าง `MediaInsertMenu.tsx` — picker reusing library search
- [ ] สร้าง `imageExtension.ts`, `videoExtension.ts`, `audioExtension.ts`
- [ ] สร้าง `mediaSerializationRules.ts` — custom serialization rules
- [ ] Image: insert from library, render inline, alt/caption editing
- [ ] Video: insert from library, render player inline, caption
- [ ] Audio: insert from library, render player inline
- [ ] Media selection overlay + quick actions (replace, remove, align)
- [ ] Clipboard image paste (Ctrl+V) → upload + insert ImageNode via `handlePaste`
- [ ] Rich paste handling — `transformPastedHTML` sanitize content จาก Word/Google Docs

**Estimated files:**
- NEW: 7 files in `components/editor/nodes/` + `components/editor/extensions/`

### Phase 3 — Page Integration & Split-Panel Removal (Priority: HIGH)

**Deliverables:**
- [ ] แทนที่ `MarkdownFileEditor` ใน `DocumentPreviewPanel.tsx` ด้วย `UnifiedDocumentSurface` (ใช้ feature flag `tiptapEditorEnabled` เพื่อ toggle ระหว่าง editor เก่า/ใหม่)
- [ ] **ลบ page-level split-panel ใน DocumentManagement.tsx:**
  - [ ] ลบ `isMarkdownPreviewPanelOpen` state + toggle buttons
  - [ ] ลบ `isPreviewExpanded` state
  - [ ] ลบ desktop SafeMarkdown preview panel
  - [ ] ลบ mobile preview tab (`mobileTab === "preview"`)
  - [ ] ลบ resize handle ระหว่าง editor กับ preview
  - [ ] ปรับ layout จาก 3-column → 2-column
  - [ ] ปรับ mobile tabs จาก 3 → 2 tabs
- [ ] แก้ `onEnterEditMode` prop ให้ทำงานทั้ง desktop และ mobile (fix asymmetry)
- [ ] ลบ `isPreviewFullWidth` derived value + JSX ที่อ้างอิง (lines ~1082, 2215, 2247-2249)
- [ ] ลบ `previewPanelWidth` state + `beginHorizontalResize("preview", ...)` branch (lines ~162, 1097-1108)
- [ ] ปรับ `markdownDraftByDocId` dirty-state ให้ sync กับ Tiptap `onUpdate` callback
- [ ] คง `beforeunload` guard (lines 386-396) — ต้องทำงานกับ Tiptap dirty-state tracking
- [ ] แก้ `SafeMarkdown.tsx`:
  - [ ] เพิ่ม `ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"]` ใน DOMPurify config (line 69)
  - [ ] ขยาย `MediaPart` type → เพิ่ม `poster?: string`, `caption?: string`, `assetId?: string`
  - [ ] แก้ `MEDIA_TAG_REGEX` / `splitByMedia()` ให้ extract `data-poster`, `data-caption`, `data-asset-id` จาก `<video>`/`<audio>` tags
  - [ ] ส่ง extracted attrs เป็น props ให้ rendered `<video>`/`<audio>` React elements
- [ ] เพิ่ม i18n keys ใน `en.ts` + `th.ts` สำหรับ editor mode labels, toolbar actions (ระบบรองรับ 2 ภาษา)
- [ ] ลงทะเบียน feature flag `tiptapEditorEnabled` ใน `featureFlags.ts`:
  - [ ] เพิ่ม `tiptapEditorEnabled: boolean; // F23` ใน `TenantFeatureFlags` interface
  - [ ] เพิ่ม `"tiptapEditorEnabled"` ใน `ALLOWED_FEATURE_FLAGS` Set
  - [ ] เพิ่ม `tiptapEditorEnabled: false` ใน `FEATURE_FLAG_DEFAULTS`
- [ ] Verify markdown เก่า (ที่มี `<video>`, `<audio>` tags) parse ได้ถูกต้อง
- [ ] Test concurrent editing protection — auto-save 2s + `expectedUpdatedAt` optimistic lock ต้องไม่ conflict เมื่อเปิด 2 tabs

**Estimated files:**
- MODIFIED: `DocumentPreviewPanel.tsx`, `DocumentManagement.tsx`, `SafeMarkdown.tsx`, `en.ts`, `th.ts`, `featureFlags.ts`

### Phase 4 — Compatibility, Hardening & Polish (Priority: MEDIUM)

**Deliverables:**
- [ ] Serialization round-trip tests (markdown → tiptap → markdown)
- [ ] Legacy content parsing (existing HTML in markdown)
- [ ] Fallback UX: auto-switch to Source Mode ถ้า parse fail
- [ ] DOMPurify integration for pasted HTML content
- [ ] Error boundaries รอบ editor
- [ ] Performance testing กับ document ยาว (>5000 words)
- [ ] Slash command menu (`/` to insert blocks)
- [ ] Drag & drop media from desktop
- [ ] สร้าง `BubbleMenu.tsx` — context menu on text selection
- [ ] Better keyboard flows (Enter/Backspace in lists)
- [ ] Image resize handles
- [ ] Table editing UX improvements
- [ ] Custom code block serializer (preserve language tags เช่น ` ```python `)
- [ ] Accessibility: ARIA labels บน toolbar buttons, keyboard navigation toolbar ↔ editor
- [ ] Thai IME testing — ทดสอบ ProseMirror composition events กับ Thai input methods (Win/macOS/mobile)
- [ ] Undo/redo across mode switches — แสดง warning ว่า undo history จะ reset เมื่อ switch Edit↔Source
- [ ] Maximum document size warning (เช่น >50,000 chars แสดง performance warning)
- [ ] Print / Export — `editor.getHTML()` + `window.print()` หรือ export as PDF

---

## 12. Acceptance Criteria

| # | Criteria | Test Method |
|---|----------|-------------|
| 1 | เปิด markdown document แล้วเห็นใน **pane เดียว** (ไม่มี preview แยก) | Manual: open any .md document |
| 2 | คลิก Edit แล้วพิมพ์ตรงตำแหน่งที่เห็นได้เลย | Manual: click Edit, type text |
| 3 | แทรกรูปจาก library แล้วเห็น inline ทันที | Manual: Insert Image → pick from library |
| 4 | แทรกวิดีโอแล้วเห็น player หรือ placeholder ได้ | Manual: Insert Video → pick from library |
| 5 | Save แล้วเปิดใหม่ → เนื้อหาไม่เปลี่ยน | Automated: serialize → deserialize → compare |
| 6 | เอกสาร markdown เก่าเปิดได้ไม่เสียข้อมูล | Automated: parse existing docs, verify no data loss |
| 7 | หาก parse block แปลกไม่ได้ → fallback เป็น Source Mode | Manual: open doc with exotic HTML |
| 8 | ไม่ต้องเปิด preview panel อีกต่อไป | Manual: verify no split-panel UI |
| 9 | Source Mode แสดง raw markdown ที่แก้ไขได้ | Manual: toggle Source Mode |
| 10 | Ctrl+S save ได้ | Manual: press Ctrl+S in edit mode |
| 11 | Auto-save ทำงาน (2s debounce) | Manual: edit text, wait 3s, check save status |
| 12 | **Desktop**: ไม่มี preview panel แยกทางขวา (2-column layout เท่านั้น) | Manual: open doc on desktop, verify 2 columns |
| 13 | **Mobile**: ไม่มี preview tab แยก (แค่ library + editor tabs) | Manual: open doc on mobile, verify 2 tabs |
| 14 | ไม่มีปุ่ม PanelLeftClose/PanelRightClose ในส่วน editor | Manual: verify no panel collapse buttons |
| 15 | เอกสารเก่าที่มี `<video>` tag parse ได้ถูกต้อง | Automated: load docs with existing `<video>` tags |
| 16 | Ctrl+V วางรูปจาก clipboard → รูปปรากฏใน editor | Manual: copy image, paste in edit mode |
| 17 | Paste จาก Word/Google Docs → content ถูก sanitize ไม่มี junk HTML | Manual: paste rich content, verify clean output |
| 18 | เปิดเอกสารเดียวกัน 2 tabs → auto-save ไม่ conflict | Manual: edit in 2 tabs, verify no data loss |
| 19 | พิมพ์ภาษาไทยได้ปกติ (IME composition ไม่พัง) | Manual: type Thai text in edit mode |
| 20 | Toolbar buttons มี ARIA labels + keyboard navigable | Manual: tab through toolbar, verify screen reader |

---

## 13. Risk Assessment

### 13.1 Markdown Fidelity (Risk: MEDIUM)

**ปัญหา**: การแปลง markdown ↔ rich document อาจทำให้ syntax บาง pattern เปลี่ยนรูป

**แนวทางลดความเสี่ยง:**
- ใช้ `tiptap-markdown` package ที่ community ทดสอบแล้ว
- มี Source Mode เป็น fallback
- สร้าง serialization round-trip tests
- กำหนด canonical format สำหรับ media (custom directives)

### 13.2 Video Security (Risk: LOW)

**ปัญหา**: video embeds จากแหล่งไม่น่าเชื่อถือ

**แนวทางลดความเสี่ยง:**
- Phase 1 รองรับเฉพาะ uploaded video + library assets
- ไม่เปิด arbitrary iframe
- URL sanitization + allowlist

### 13.3 Legacy Content (Risk: MEDIUM)

**ปัญหา**: เอกสารเก่าอาจมี HTML หรือ markdown พิเศษที่ parse ยาก

**แนวทางลดความเสี่ยง:**
- Compatibility mode (Source Mode fallback)
- Lazy migration: ไม่แปลง batch, แปลงตอน open
- เก็บ raw markdown ไว้เสมอ ไม่ overwrite ถ้า parse fail

### 13.4 Bundle Size (Risk: LOW)

**ปัญหา**: Tiptap + extensions เพิ่ม bundle size

**แนวทางลดความเสี่ยง:**
- Lazy-load editor component (เหมือน MarkdownFileEditor ปัจจุบัน)
- Tree-shake unused Tiptap extensions
- ประมาณการ: Tiptap core ~50KB gzipped, acceptable

### 13.5 React 19 Compatibility (Risk: LOW-MEDIUM)

**ปัญหา**: โปรเจกต์ใช้ React 19.x แต่ Tiptap 2.x รองรับ React 18+ อย่างเป็นทางการ — ยังไม่มี official React 19 certification

**แนวทางลดความเสี่ยง:**
- ทดสอบ Tiptap กับ React 19 ใน spike ก่อนเริ่ม Phase 1
- Community reports ส่วนใหญ่ว่าใช้งานได้ดี
- Fallback: ถ้า incompatible จริง → ใช้ `@tiptap/react` beta channel หรือ pin React adapter

### 13.6 DocumentManagement.tsx Complexity (Risk: MEDIUM)

**ปัญหา**: DocumentManagement.tsx มีขนาด 2344+ บรรทัด, มี state management ซับซ้อน (library browser + editor + preview + mobile tabs + resize handles) — การลบ split-panel ต้องแก้ไขหลายจุดพร้อมกัน

**แนวทางลดความเสี่ยง:**
- ทำ Phase 3 (page integration) แยกจาก Phase 1-2 (component สร้างใหม่)
- ใช้ feature flag `tiptapEditorEnabled` ใน `apps/web/shared/featureFlags.ts`, default `false` — set `true` per-tenant ระหว่าง rollout
- Test mobile + desktop layout อย่างละเอียดหลังลบ panel

### 13.7 Rollback Plan (Emergency)

**หาก Tiptap editor มี critical bugs ใน production:**

1. **Rollback ทันที**: เปลี่ยน feature flag `tiptapEditorEnabled` → `false` → ระบบจะ fallback กลับไปใช้ `MarkdownFileEditor` (CodeMirror) ทันที
2. **MarkdownFileEditor.tsx ถูกเก็บไว้** (§14 Preserved) — ไม่ลบจนกว่า Tiptap จะ stable ผ่าน production ≥ 2 สัปดาห์
3. **Data ปลอดภัย**: Storage format ยังเป็น Markdown เหมือนเดิม — ไม่มี migration, editor เก่าอ่าน data ที่ Tiptap เขียนได้ 100%
4. **Trigger rollback เมื่อ**: Tiptap crash >3 ครั้ง/วัน, data loss report, หรือ serialization corruption detected

---

## 14. Files Changed Summary

### New Files (~15 files)
```
apps/web/client/src/components/editor/
├── index.ts                    # Barrel export
├── TiptapEditor.tsx
├── TiptapMarkdownBridge.ts
├── UnifiedDocumentSurface.tsx
├── EditorToolbar.tsx           # Inline toolbar (mode switch, formatting, save)
├── SourceModePanel.tsx
├── toolbar/
│   ├── BubbleMenu.tsx
│   └── MediaInsertMenu.tsx
├── nodes/
│   ├── ImageNodeView.tsx
│   ├── VideoNodeView.tsx
│   ├── AudioNodeView.tsx
│   └── MediaSelectionOverlay.tsx
├── extensions/
│   ├── imageExtension.ts
│   ├── videoExtension.ts
│   ├── audioExtension.ts
│   └── mediaSerializationRules.ts
└── editor.css                   # Tiptap .ProseMirror base styles (scoped under .tiptap-editor)
```

### Modified Files (~7 files)
```
apps/web/client/src/components/library/DocumentPreviewPanel.tsx  # Swap MarkdownFileEditor → UnifiedDocumentSurface
apps/web/client/src/pages/DocumentManagement.tsx                 # ลบ page-level split-panel (3→2 columns, ลบ preview panel)
apps/web/client/src/components/chat/SafeMarkdown.tsx             # เพิ่ม ADD_ATTR สำหรับ data-poster/data-caption/data-asset-id
apps/web/client/src/lib/i18n/locales/en.ts                       # เพิ่ม i18n keys สำหรับ editor modes, toolbar labels
apps/web/client/src/lib/i18n/locales/th.ts                       # เพิ่ม Thai translations สำหรับ editor modes, toolbar labels
apps/web/shared/featureFlags.ts                                  # เพิ่ม tiptapEditorEnabled flag
apps/web/package.json                                            # Add tiptap deps
```

### Preserved Files (NOT deleted)
```
apps/web/client/src/components/library/CodeMirrorEditor.tsx      # Used in Source Mode + CodeFileEditor
apps/web/client/src/components/library/MarkdownFileEditor.tsx    # Keep as fallback, deprecate later
apps/web/client/src/components/chat/SafeMarkdown.tsx             # Still used in chat + other renders
```

---

## 15. QA Test Matrix

| Test Case | Type | Priority |
|-----------|------|----------|
| เปิดเอกสาร markdown ธรรมดา | Manual | P0 |
| เปิดเอกสารที่มี image หลายรูป | Manual | P0 |
| เปิดเอกสารที่มี video block | Manual | P0 |
| Save แล้ว reopen → content ไม่หาย | Automated | P0 |
| สลับ View/Edit/Source mode | Manual | P0 |
| Paste markdown เข้า editor | Manual | P1 |
| ลบ media block | Manual | P1 |
| ย้ายตำแหน่ง media block | Manual | P1 |
| Parse เอกสาร legacy ที่มี html | Automated | P1 |
| Fallback เมื่อ parse ไม่ครบ | Manual | P1 |
| Auto-save ทำงานถูกต้อง | Manual | P1 |
| Keyboard shortcuts (Cmd+B/I/K/S) | Manual | P2 |
| Long document performance (>5000 words) | Automated | P2 |
| Mobile responsive layout | Manual | P2 |
| Ctrl+V paste image จาก clipboard | Manual | P1 |
| Paste จาก Word/Google Docs sanitize ถูกต้อง | Manual | P1 |
| พิมพ์ภาษาไทย (IME composition) | Manual | P1 |
| เปิด 2 tabs edit เอกสารเดียวกัน → ไม่ conflict | Manual | P1 |
| Toolbar มี ARIA labels | Manual | P2 |
| Undo history reset warning เมื่อ switch Edit↔Source | Manual | P2 |
| Document >50,000 chars แสดง warning | Manual | P2 |

---

## 16. Decision Log

| Decision | Rationale |
|----------|-----------|
| ใช้ Tiptap OSS (ไม่ใช่ Tiptap Pro/Cloud) | ฟรี, เพียงพอสำหรับ Phase 1, ไม่ lock-in |
| ใช้ `tiptap-markdown` package | ลดงาน custom serialization, community maintained |
| เก็บ Markdown เป็น storage format | Backward compatible, ไม่ต้อง migrate DB |
| ใช้ standard `<video>` / `<audio>` tags (ไม่ใช่ custom elements) | DOMPurify allowlist รองรับ `video`/`audio` อยู่แล้ว, backward compatible กับเอกสารเก่า, custom elements จะถูก strip |
| ใช้ `data-*` attributes สำหรับ extended media metadata | ใช้ targeted `ADD_ATTR` ใน DOMPurify (ไม่เปิด ALLOW_DATA_ATTR blanket), ปลอดภัยกว่า |
| เก็บ CodeMirrorEditor ไว้ | ยังใช้ใน Source Mode + CodeFileEditor + non-markdown files |
| Explicit toggle (ไม่ใช่ click-to-edit) | ลด accidental edits, เหมาะกับเอกสารที่มี media เยอะ |
| Auto-save 2s debounce | Balance ระหว่างไม่สูญเสียข้อมูล vs ไม่ save บ่อยเกินไป |
| ลบ page-level preview panel ใน DocumentManagement.tsx | ไม่ใช่แค่ component-level — หน้า page มี SafeMarkdown preview แยกที่ต้องลบด้วย |
| Title/rename/share/download คงอยู่ใน DocumentPreviewPanel | ไม่สร้าง DocumentEditorHeader แยก — หลีกเลี่ยง header ownership conflict |
| Save-on-exit ทุกครั้งที่ออกจาก Edit/Source mode | ป้องกัน data loss เมื่อผู้ใช้แก้ raw markdown ใน Source แล้วกด View |
| Tiptap error → fallback เป็น Source Mode | ผู้ใช้ยังแก้ไขได้แม้ Tiptap พัง, ดีกว่าแสดงหน้าว่าง |

---

## 17. Non-Goals (Phase 1-4)

สิ่งที่ไม่รวมอยู่ใน scope ของ spec นี้:

| Item | เหตุผล |
|------|--------|
| Real-time collaboration (multi-user editing) | ต้องการ Tiptap Collab (Pro) + backend infra ที่ซับซ้อน |
| Comments / suggestions / track changes | ต้องการ Tiptap Pro annotations extension |
| Right-side inspector panel (metadata, document outline) | อาจเพิ่มในอนาคต แต่ไม่จำเป็นสำหรับ single-panel migration |
| AI-assisted inline writing (autocomplete, rewrite) | อยู่นอก scope ของ editor migration |
| Video editing ภายใน editor | ใช้ video player เท่านั้น, ไม่มี trim/cut |
| Full WYSIWYG fidelity สำหรับ Markdown edge cases ทุกกรณี | มี Source Mode เป็น fallback |
| Embed provider ทุกเจ้า (YouTube, Vimeo, etc.) | Phase 1 รองรับเฉพาะ uploaded files + library assets |
| Version diffing (visual diff ระหว่าง versions) | ใช้ version restore เท่านั้น |

---

## 18. จุดเพิ่มเติมที่ได้รวมเข้า Phases แล้ว

รายการจากการ review ที่ได้เพิ่มเข้า Phase deliverables:

| Item | เพิ่มเข้า Phase | รายละเอียด |
|------|----------------|------------|
| Clipboard image paste (Ctrl+V) | **Phase 2** | upload + insert ImageNode ผ่าน `handlePaste` |
| Rich paste handling | **Phase 2** | `transformPastedHTML` sanitize จาก Word/Google Docs |
| Concurrent editing protection | **Phase 3** | test auto-save + `expectedUpdatedAt` optimistic lock กับ 2 tabs |
| Accessibility (a11y) | **Phase 4** | ARIA labels, keyboard navigation toolbar ↔ editor |
| Thai IME testing | **Phase 4** | test ProseMirror composition events กับ Thai input |
| Undo/redo mode switch warning | **Phase 4** | แสดง warning ว่า undo history จะ reset เมื่อ switch Edit↔Source |
| Max document size warning | **Phase 4** | warning เมื่อ >50,000 chars |
| Print / Export | **Phase 4** | `editor.getHTML()` + `window.print()` หรือ export as PDF |

### ยังคงเป็น Future (นอก Phase 1-4)

| Item | รายละเอียด |
|------|------------|
| **Document outline / TOC** | heading outline panel จาก `editor.getJSON()` — อาจเพิ่มเป็น right-side inspector panel ในอนาคต |
| **Screen reader announcements** | ประกาศเมื่อ mode เปลี่ยน — ต้องการ live region ARIA implementation |
