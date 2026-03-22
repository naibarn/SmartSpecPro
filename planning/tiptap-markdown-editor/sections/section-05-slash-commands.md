I have all the context needed. Let me now generate the section content.

# Section 05: Slash Command Menu

## Overview

This section creates the `SlashCommandMenu` -- a floating dropdown that appears when the user types `/` at the start of a line or after a paragraph break. It uses the `@tiptap/suggestion` extension to detect the trigger character, filter options by typed query, and insert the chosen block type into the editor. For media options (Image, Video, Audio), selecting them opens the `MediaInsertMenu` (built in section-08) instead of directly inserting a node.

## Dependencies

- **section-01-tiptap-setup**: Tiptap packages must be installed, including `@tiptap/suggestion ^2.x`.
- **section-03-editor-surface**: `TiptapEditor.tsx` must exist and accept extensions. The slash command extension will be included in the Tiptap editor's extension array.
- **section-08-media-insert-menu** (soft dependency): Media slash-command items (Image, Video, Audio) will open the `MediaInsertMenu`. Until section-08 is implemented, these items can log a placeholder action or be no-ops.

## File Locations

All new files go under `apps/web/client/src/components/editor/`:

| File | Purpose |
|------|---------|
| `SlashCommandMenu.tsx` | React component rendering the floating dropdown menu |
| `slashCommandItems.ts` | Menu item definitions (icon, label, i18n key, command) |
| `slashCommandExtension.ts` | Tiptap extension wiring `@tiptap/suggestion` to the menu |
| `SlashCommandMenu.test.tsx` | Tests |

i18n keys are added to:
- `apps/web/client/src/lib/i18n/locales/en.ts`
- `apps/web/client/src/lib/i18n/locales/th.ts`

## Tests (Write First)

Create `apps/web/client/src/components/editor/SlashCommandMenu.test.tsx`:

```
# SlashCommandMenu.test.tsx

# Test: typing "/" at start of empty paragraph shows menu
#   - Mount TiptapEditor with the slash command extension
#   - Simulate inserting "/" character
#   - Assert that the SlashCommandMenu component renders (is visible in DOM)

# Test: typing "/hea" filters to heading options
#   - Trigger the menu with "/"
#   - Continue typing "hea"
#   - Assert only items whose label matches "hea" (Heading 1-4) are visible
#   - Assert non-matching items (e.g., "Bullet List") are not visible

# Test: selecting "Heading 1" inserts h1 block
#   - Trigger menu, select the "Heading 1" item (click or Enter)
#   - Assert the editor content now contains a heading node at level 1
#   - Assert the "/" trigger text is removed (replaced by the heading)

# Test: selecting "Image" opens MediaInsertMenu
#   - Provide an onMediaInsert callback prop
#   - Trigger menu, select "Image"
#   - Assert onMediaInsert is called with mediaType "image"
#   - Assert the slash menu closes

# Test: pressing Escape closes menu
#   - Trigger menu with "/"
#   - Press Escape key
#   - Assert menu is no longer visible

# Test: pressing Enter selects first filtered option
#   - Trigger menu with "/"
#   - Type "div" to filter to "Divider"
#   - Press Enter
#   - Assert a horizontal rule node is inserted

# Test: menu shows correct i18n labels
#   - Mount with English locale
#   - Trigger menu
#   - Assert items show English labels ("Heading 1", "Bullet List", etc.)
```

Note: Testing `@tiptap/suggestion` in jsdom has limitations because ProseMirror relies on DOM measurements for cursor positioning. Tests should focus on the React menu component's behavior (filtering, selection callbacks, keyboard navigation) rather than the floating position logic. You may need to mock the suggestion plugin's `onStart`/`onUpdate`/`onKeyDown`/`onExit` lifecycle and test the menu component in isolation by directly calling those lifecycle handlers.

## Implementation Details

### 1. Slash Command Item Definitions (`slashCommandItems.ts`)

Define a `SlashCommandItem` interface and an array of all available commands:

```typescript
// Signature only -- implement the full list
export interface SlashCommandItem {
  id: string;
  label: string;           // i18n key, e.g. "editor.slash.heading1"
  icon: string;            // Lucide icon name
  description?: string;    // i18n key for short description
  category: "text" | "list" | "block" | "media" | "table";
  command: (props: { editor: Editor; range: Range }) => void;
}

export function getSlashCommandItems(
  onMediaInsert?: (type: "image" | "video" | "audio") => void
): SlashCommandItem[];
```

The items list:

| ID | Label (EN) | Label (TH) | Icon | Category | Command |
|----|-----------|-----------|------|----------|---------|
| `heading1` | Heading 1 | หัวข้อ 1 | `Heading1` | text | `editor.chain().focus().toggleHeading({ level: 1 }).run()` |
| `heading2` | Heading 2 | หัวข้อ 2 | `Heading2` | text | `toggleHeading({ level: 2 })` |
| `heading3` | Heading 3 | หัวข้อ 3 | `Heading3` | text | `toggleHeading({ level: 3 })` |
| `heading4` | Heading 4 | หัวข้อ 4 | `Heading4` | text | `toggleHeading({ level: 4 })` |
| `bulletList` | Bullet List | รายการ | `List` | list | `toggleBulletList()` |
| `orderedList` | Ordered List | รายการลำดับ | `ListOrdered` | list | `toggleOrderedList()` |
| `quote` | Quote | อ้างอิง | `Quote` | block | `toggleBlockquote()` |
| `codeBlock` | Code Block | โค้ด | `Code` | block | `toggleCodeBlock()` |
| `divider` | Divider | เส้นคั่น | `Minus` | block | `setHorizontalRule()` |
| `image` | Image | รูปภาพ | `Image` | media | calls `onMediaInsert("image")` |
| `video` | Video | วิดีโอ | `Video` | media | calls `onMediaInsert("video")` |
| `audio` | Audio | เสียง | `Music2` | media | calls `onMediaInsert("audio")` |
| `table` | Table | ตาราง | `Table` | table | `insertTable({ rows: 3, cols: 3, withHeaderRow: true })` |

Each command function must first delete the trigger range (the `/` character and any typed filter text) before inserting the block. The `@tiptap/suggestion` plugin provides the `range` object representing the trigger text position. Use `editor.chain().focus().deleteRange(range).<command>().run()` to atomically remove the trigger and insert the block.

For media items, the command does not insert a node directly. Instead, it calls the `onMediaInsert` callback (passed down from `UnifiedDocumentSurface`), which opens the `MediaInsertMenu` overlay. The trigger range is still deleted.

### 2. Slash Command Extension (`slashCommandExtension.ts`)

This file creates a Tiptap `Extension` that wraps `@tiptap/suggestion`. The key configuration points:

```typescript
// Signature -- the extension factory
export function createSlashCommandExtension(options: {
  onMediaInsert?: (type: "image" | "video" | "audio") => void;
}): Extension;
```

The suggestion plugin configuration:

- **`char`**: `"/"` -- the trigger character.
- **`startOfLine`**: `false` -- allow triggering after any empty space, not just line start. The `@tiptap/suggestion` plugin handles this. Set to `false` so it also works mid-paragraph after pressing Enter. (The plan says "at the start of a line or after a paragraph" -- the suggestion plugin naturally fires when `/` is typed as the first character of a text node.)
- **`command`**: Receives `{ editor, range, props }` where `props` is the selected `SlashCommandItem`. Calls `props.command({ editor, range })`.
- **`items`**: Returns the filtered items list. The query string (text typed after `/`) is matched against item labels using case-insensitive substring match.
- **`render`**: Returns an object with `onStart`, `onUpdate`, `onKeyDown`, `onExit` lifecycle hooks that control the `SlashCommandMenu` React component.

For the render lifecycle, use a pattern that creates a temporary DOM element, renders the React `SlashCommandMenu` into it using `createRoot`, and positions it using `tippy.js` (already a Tiptap dependency through `@tiptap/extension-floating-menu`) or manual absolute positioning based on the `clientRect` callback.

A simpler approach: use `ReactRenderer` from `@tiptap/react` combined with `tippy.js` for positioning. This is the standard Tiptap pattern for suggestion menus:

```typescript
// Pseudocode for render()
render: () => {
  let component: ReactRenderer;
  let popup: Instance[];

  return {
    onStart(props) {
      component = new ReactRenderer(SlashCommandMenu, {
        props,
        editor: props.editor,
      });
      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props) {
      component.updateProps(props);
      popup[0].setProps({ getReferenceClientRect: props.clientRect });
    },
    onKeyDown(props) {
      if (props.event.key === "Escape") {
        popup[0].hide();
        return true;
      }
      return component.ref?.onKeyDown(props);
    },
    onExit() {
      popup[0].destroy();
      component.destroy();
    },
  };
}
```

Note: `tippy.js` is already available as a transitive dependency of Tiptap. If it is not directly importable, install `tippy.js` as a dev dependency.

### 3. Slash Command Menu Component (`SlashCommandMenu.tsx`)

The React component that renders the floating dropdown.

```typescript
// Component signature
export interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  // Optional ref for keyboard handling
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}
```

Key behaviors:

- **Rendering**: A `<div>` with a scrollable list of items. Each item shows an icon (Lucide component) and a translated label (via the `useTranslation` hook or by receiving pre-translated labels).
- **Keyboard navigation**: Track a `selectedIndex` state. Arrow Up/Down changes the index. Enter triggers `command(items[selectedIndex])`. Escape is handled by the extension's `onKeyDown` (hides the popup).
- **Empty state**: If filtering produces zero results, show a "No results" message.
- **Styling**: Use Tailwind classes. The menu should match the existing UI patterns in the codebase (dark bg, rounded corners, shadow). Look at existing popover/dropdown components for visual consistency.
- **Grouping** (optional but recommended): Group items by `category` with small section headers ("Text", "Lists", "Blocks", "Media", "Table"). This improves scannability.
- **`forwardRef` with `useImperativeHandle`**: Expose the `onKeyDown` method so the extension's render lifecycle can delegate keyboard events to the component.

### 4. i18n Keys

Add the following keys to both `en.ts` and `th.ts`:

```
"editor.slash.heading1": "Heading 1" / "หัวข้อ 1"
"editor.slash.heading2": "Heading 2" / "หัวข้อ 2"
"editor.slash.heading3": "Heading 3" / "หัวข้อ 3"
"editor.slash.heading4": "Heading 4" / "หัวข้อ 4"
"editor.slash.bulletList": "Bullet List" / "รายการ"
"editor.slash.orderedList": "Ordered List" / "รายการลำดับ"
"editor.slash.quote": "Quote" / "อ้างอิง"
"editor.slash.codeBlock": "Code Block" / "โค้ด"
"editor.slash.divider": "Divider" / "เส้นคั่น"
"editor.slash.image": "Image" / "รูปภาพ"
"editor.slash.video": "Video" / "วิดีโอ"
"editor.slash.audio": "Audio" / "เสียง"
"editor.slash.table": "Table" / "ตาราง"
"editor.slash.noResults": "No results" / "ไม่พบรายการ"
```

These keys may have already been partially added by section-04 (toolbar). Check for existing `editor.*` keys before adding duplicates.

### 5. Integration with TiptapEditor

The slash command extension is added to the Tiptap editor's extension array in `TiptapEditor.tsx` (from section-03). The integration point:

```typescript
// In TiptapEditor.tsx, within the useEditor() call:
extensions: [
  StarterKit,
  // ... other extensions ...
  createSlashCommandExtension({
    onMediaInsert: (type) => {
      // This callback is passed down from UnifiedDocumentSurface
      // It opens the MediaInsertMenu (section-08)
      props.onMediaInsert?.(type);
    },
  }),
],
```

The `onMediaInsert` prop flows from `UnifiedDocumentSurface` -> `TiptapEditor` -> `slashCommandExtension` -> individual media command items. Until section-08 is built, this can be a no-op or `console.log`.

### 6. Filtering Logic

Item filtering uses case-insensitive substring matching against the translated label. The `@tiptap/suggestion` plugin provides the query (text typed after `/`) to the `items` callback:

```typescript
items: ({ query }) => {
  const allItems = getSlashCommandItems(options.onMediaInsert);
  if (!query) return allItems;
  const lower = query.toLowerCase();
  return allItems.filter((item) =>
    t(item.label).toLowerCase().includes(lower)
  );
},
```

Note: The `t()` function (i18n translator) must be accessible in the extension factory. One approach is to pass it as a parameter to `createSlashCommandExtension`. Another is to filter on the raw English label as a fallback (since most users will type English commands even in Thai locale). Choose whichever approach is simpler.

## Edge Cases

- **Empty document**: Typing `/` in a completely empty editor should still trigger the menu (the suggestion plugin handles this as "start of a text node").
- **Mid-paragraph**: Typing `/` in the middle of existing text should NOT trigger the menu. The suggestion plugin's default behavior requires a space or start-of-node before the trigger character. Verify this works correctly.
- **Multiple `/` characters**: Typing `//` should not cause double-trigger. The suggestion plugin deactivates the previous suggestion when a new one starts.
- **Thai IME**: Thai input method should not interfere with `/` detection since `/` is an ASCII character that doesn't go through IME composition.

## Acceptance Criteria

1. Typing `/` at the start of an empty line shows a floating dropdown menu below the cursor.
2. The menu lists all 13 block types with correct icons and translated labels.
3. Typing additional characters filters the list in real time.
4. Selecting an item (click or Enter) inserts the corresponding block and removes the `/` trigger text.
5. Arrow keys navigate the menu; Escape dismisses it.
6. Media items (Image, Video, Audio) trigger the `onMediaInsert` callback instead of directly inserting a node.
7. The menu renders correctly in both English and Thai locales.
8. Filtering with no matches shows a "No results" message.