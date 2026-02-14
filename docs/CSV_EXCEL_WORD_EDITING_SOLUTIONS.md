# CSV, Excel, and Word Document Editing Solutions

## 📋 Executive Summary

This document analyzes solutions for editing **CSV**, **Excel (.xlsx)**, and **Word (.docx)** files within the SmartSpecPro Document Management system.

## 🎯 Requirements

### User Stories
1. **As a user**, I want to edit CSV files in a **spreadsheet-like grid** with column sorting and filtering
2. **As a user**, I want to edit Excel files (.xlsx, .xls) while **preserving formulas and formatting**
3. **As a user**, I want to edit Word documents (.docx) with **rich text formatting** (bold, italic, headings, lists)

### Technical Constraints
- **Browser-based** — No desktop app downloads
- **Real-time editing** — See changes immediately
- **File size limits** — CSV < 10 MB, Excel < 5 MB, Word < 2 MB
- **Security** — No external service uploads (data privacy)
- **Performance** — Smooth editing on 5-year-old laptops

---

## 1️⃣ CSV Editing Solution

### ✅ Recommended: Dual-Mode CSV Editor

**Strategy:** Offer both **grid view** (for small files) and **code view** (for large files)

### Option A: AG-Grid Community (Grid View) ⭐ **RECOMMENDED**
**Pros:**
- ✅ Free and open-source (MIT license)
- ✅ Excel-like experience (cell editing, copy/paste)
- ✅ High performance (100K+ rows with virtualization)
- ✅ Built-in features: sorting, filtering, column resizing
- ✅ CSV export built-in
- ✅ Keyboard navigation (arrow keys, Enter, Tab)
- ✅ ~700 KB bundle size (reasonable)

**Cons:**
- ❌ Steeper learning curve than simpler alternatives
- ❌ Advanced features (grouping, pivoting) require Enterprise ($$$)

**Implementation:**
```bash
npm install ag-grid-react ag-grid-community
```

```typescript
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

function CSVGridEditor({ csvData, onChange }: Props) {
  const [rowData, setRowData] = useState(parseCSV(csvData));
  const [columnDefs, setColumnDefs] = useState(inferColumns(csvData));

  const onCellValueChanged = (event) => {
    const newData = event.api.getModel().rowsToDisplay.map(row => row.data);
    onChange(serializeToCSV(newData));
  };

  return (
    <div className="ag-theme-alpine" style={{ height: '70vh', width: '100%' }}>
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        onCellValueChanged={onCellValueChanged}
        defaultColDef={{
          editable: true,
          sortable: true,
          filter: true,
          resizable: true,
        }}
      />
    </div>
  );
}
```

**Cost:** Free (Community Edition)
**Bundle Size:** ~700 KB (gzipped)
**Documentation:** https://ag-grid.com/react-data-grid/

### Option B: React Data Grid (Lightweight Alternative)
**Pros:**
- ✅ Lightweight (~200 KB)
- ✅ Simple API
- ✅ Good for small-to-medium CSVs (< 10K rows)

**Cons:**
- ❌ Limited features compared to AG-Grid
- ❌ Performance issues with large datasets

**Implementation:**
```bash
npm install react-data-grid
```

```typescript
import DataGrid from 'react-data-grid';

function CSVEditor({ csvData, onChange }: Props) {
  const [rows, setRows] = useState(parseCSV(csvData));
  const columns = inferColumns(csvData);

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      onRowsChange={(newRows) => {
        setRows(newRows);
        onChange(serializeToCSV(newRows));
      }}
      style={{ height: '70vh' }}
    />
  );
}
```

**Cost:** Free (MIT)
**Bundle Size:** ~200 KB
**Documentation:** https://react-data-grid.org/

### Option C: CodeMirror (Code View) — Already Implemented ✅
**Use Case:** Large CSV files (> 10 MB) or users who prefer text editing

```typescript
<CodeMirrorEditor
  value={csvText}
  onChange={setCsvText}
  fileExtension="csv"
  showLineNumbers={true}
  height="70vh"
/>
```

### 🎯 Final Recommendation: Hybrid Approach

**Implementation Strategy:**
1. **Default:** AG-Grid for files < 5 MB (better UX)
2. **Fallback:** CodeMirror for files > 5 MB (better performance)
3. **Toggle:** Let users switch between Grid and Code view

```typescript
function CSVEditorPanel({ csvData, onChange, fileSize }: Props) {
  const [viewMode, setViewMode] = useState<'grid' | 'code'>(
    fileSize > 5_000_000 ? 'code' : 'grid'
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {fileSize > 5_000_000 && (
            <span className="text-amber-600">
              ⚠️ Large file. Grid view may be slow.
            </span>
          )}
        </div>
        <Button onClick={() => setViewMode(mode => mode === 'grid' ? 'code' : 'grid')}>
          Switch to {viewMode === 'grid' ? 'Code' : 'Grid'} View
        </Button>
      </div>

      {viewMode === 'grid' ? (
        <CSVGridEditor csvData={csvData} onChange={onChange} />
      ) : (
        <CodeMirrorEditor
          value={csvData}
          onChange={onChange}
          fileExtension="csv"
          showLineNumbers={true}
        />
      )}
    </div>
  );
}
```

**Estimated Implementation Time:** 2-3 days
**Bundle Size Impact:** +700 KB (AG-Grid)

---

## 2️⃣ Excel (.xlsx) Editing Solution

### ⚠️ Challenge: Excel is a Complex Binary Format

**Key Issues:**
- **Formulas** — `=SUM(A1:A10)`, `=VLOOKUP(...)` need to be parsed and recalculated
- **Formatting** — Cell colors, borders, fonts, number formats
- **Multiple sheets** — Workbooks can have 10+ sheets
- **Charts** — Embedded graphs and pivot tables
- **Macros** — VBA scripts (security risk if enabled)

### Option A: SheetJS (xlsx) — Client-Side Parsing ⭐ **RECOMMENDED**
**Pros:**
- ✅ Pure JavaScript — No server required
- ✅ Read Excel files fully (formulas, styles, charts)
- ✅ Write Excel files (export feature)
- ✅ Works with AG-Grid or React Data Grid
- ✅ Open-source (Apache 2.0)

**Cons:**
- ❌ ~1 MB bundle size
- ❌ Formula evaluation requires separate library
- ❌ Complex API for advanced features

**Implementation:**
```bash
npm install xlsx
```

```typescript
import * as XLSX from 'xlsx';

function ExcelEditor({ fileUrl, onChange }: Props) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    fetch(fileUrl)
      .then(res => res.arrayBuffer())
      .then(data => {
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbook(wb);
      });
  }, [fileUrl]);

  if (!workbook) return <div>Loading Excel file...</div>;

  const sheetName = workbook.SheetNames[activeSheet];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {workbook.SheetNames.map((name, idx) => (
          <Button
            key={name}
            onClick={() => setActiveSheet(idx)}
            variant={idx === activeSheet ? 'default' : 'outline'}
          >
            {name}
          </Button>
        ))}
      </div>

      <AgGridReact
        rowData={jsonData.slice(1)} // Skip header row
        columnDefs={inferColumnsFromSheet(jsonData[0])}
        onCellValueChanged={(event) => {
          // Update workbook and trigger onChange
          const newWorkbook = updateWorkbook(workbook, activeSheet, event);
          setWorkbook(newWorkbook);
          onChange(newWorkbook);
        }}
      />

      <Button onClick={() => exportToExcel(workbook)}>
        Download Excel File
      </Button>
    </div>
  );
}
```

**Cost:** Free (Apache 2.0)
**Bundle Size:** ~1 MB (gzipped ~400 KB)
**Documentation:** https://docs.sheetjs.com/

### Option B: Luckysheet (Full Excel-Like UI) 🎨 **ADVANCED**
**Pros:**
- ✅ Excel-like interface (ribbons, formulas bar, multiple sheets)
- ✅ Formula support (100+ built-in functions)
- ✅ Rich formatting (colors, borders, fonts)
- ✅ Charts and conditional formatting
- ✅ Free and open-source (MIT)

**Cons:**
- ❌ **HUGE** bundle size (~3-4 MB)
- ❌ Chinese documentation (partial English translation)
- ❌ Less active maintenance (last update 2023)
- ❌ May be overkill for simple editing

**Implementation:**
```bash
npm install luckysheet
```

```typescript
import LuckyExcel from 'luckyexcel';
import 'luckysheet/dist/plugins/css/pluginsCss.css';
import 'luckysheet/dist/css/luckysheet.css';

function ExcelEditorAdvanced({ fileUrl }: Props) {
  useEffect(() => {
    fetch(fileUrl)
      .then(res => res.arrayBuffer())
      .then(data => {
        LuckyExcel.transformExcelToLucky(data, (exportJson) => {
          luckysheet.create({
            container: 'luckysheet',
            data: exportJson.sheets,
            title: exportJson.info.name,
          });
        });
      });
  }, [fileUrl]);

  return <div id="luckysheet" style={{ height: '80vh' }} />;
}
```

**Cost:** Free (MIT)
**Bundle Size:** ~3-4 MB (⚠️ LARGE)
**Documentation:** https://dream-num.github.io/LuckysheetDocs/

### Option C: Google Sheets Embed (External Service) ⚠️
**Pros:**
- ✅ Full Excel compatibility
- ✅ Formulas, charts, collaboration
- ✅ No bundle size impact

**Cons:**
- ❌ **SECURITY RISK** — Uploads files to Google servers
- ❌ Requires Google account
- ❌ Not suitable for sensitive documents

**NOT RECOMMENDED for SmartSpecPro**

### 🎯 Final Recommendation: Read-Only Excel + Edit as CSV

**Strategy:**
1. **Read Excel** using SheetJS → Display in AG-Grid
2. **Edit as CSV** — Convert sheet to CSV, edit, then re-import
3. **Export Excel** using SheetJS

**Rationale:**
- ✅ Maintains formulas on read (view-only)
- ✅ Allows data editing in grid format
- ✅ Avoids complexity of formula re-calculation
- ✅ Reasonable bundle size (~1.7 MB total: AG-Grid + SheetJS)

**User Flow:**
```
1. User uploads Excel file (.xlsx)
2. System parses with SheetJS
3. Display sheets in tabs (read-only with formula preview)
4. Click "Edit Sheet" → Convert active sheet to CSV → Open in AG-Grid
5. User edits data
6. Click "Save" → Update sheet in workbook → Export new .xlsx
```

**Estimated Implementation Time:** 3-5 days
**Bundle Size Impact:** +1.7 MB (AG-Grid + SheetJS)

---

## 3️⃣ Word (.docx) Editing Solution

### ⚠️ Challenge: Word is an Office Open XML Format

**Key Issues:**
- **Rich text** — Bold, italic, underline, colors, fonts
- **Paragraphs** — Headings, bullets, numbering, indents
- **Images** — Embedded pictures
- **Tables** — Complex layouts
- **Styles** — Predefined text styles
- **Binary format** — Not plain text, need XML parsing

### Option A: TipTap (Rich Text Editor) ⭐ **RECOMMENDED**
**Pros:**
- ✅ Modern, extensible WYSIWYG editor
- ✅ Markdown shortcuts (e.g., `**bold**` → **bold**)
- ✅ Customizable toolbar
- ✅ Collaborative editing (with Y.js)
- ✅ Export to HTML
- ✅ ~200 KB bundle size

**Cons:**
- ❌ No native .docx import/export (need library)
- ❌ Some Word features not supported (comments, track changes)

**Implementation:**
```bash
npm install @tiptap/react @tiptap/starter-kit mammoth docx
```

```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import mammoth from 'mammoth'; // .docx → HTML converter
import { Document, Packer, Paragraph, TextRun } from 'docx'; // HTML → .docx converter

function WordEditor({ fileUrl, onChange }: Props) {
  const [initialContent, setInitialContent] = useState('');

  // Load .docx and convert to HTML
  useEffect(() => {
    fetch(fileUrl)
      .then(res => res.arrayBuffer())
      .then(buffer => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then(result => setInitialContent(result.value));
  }, [fileUrl]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
  });

  const exportToDocx = async () => {
    const html = editor?.getHTML() || '';
    const doc = new Document({
      sections: [{
        properties: {},
        children: htmlToDocxParagraphs(html), // Convert HTML to Word paragraphs
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'document.docx');
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Button onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</Button>
        <Button onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</Button>
        <Button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Button>
        <Button onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</Button>
        <Button onClick={exportToDocx}>Export to .docx</Button>
      </div>
      <EditorContent editor={editor} className="prose max-w-none border rounded p-4 min-h-[70vh]" />
    </div>
  );
}
```

**Libraries:**
- **mammoth** — .docx → HTML conversion (~50 KB)
- **docx** — Create .docx from scratch (~150 KB)
- **@tiptap/react** — Rich text editor (~200 KB)

**Cost:** Free (MIT)
**Bundle Size:** ~400 KB total
**Documentation:** https://tiptap.dev/

### Option B: Quill (Simpler WYSIWYG) 📝
**Pros:**
- ✅ Lightweight (~150 KB)
- ✅ Battle-tested (used by many apps)
- ✅ Delta format for efficient updates

**Cons:**
- ❌ Less modern than TipTap
- ❌ Still need mammoth + docx for .docx support
- ❌ Limited extensibility

**Implementation:**
```bash
npm install react-quill mammoth docx
```

```typescript
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

function WordEditorSimple({ fileUrl, onChange }: Props) {
  const [content, setContent] = useState('');

  useEffect(() => {
    fetch(fileUrl)
      .then(res => res.arrayBuffer())
      .then(buffer => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then(result => setContent(result.value));
  }, [fileUrl]);

  return (
    <ReactQuill
      value={content}
      onChange={onChange}
      theme="snow"
      modules={{
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image'],
        ],
      }}
      style={{ height: '70vh' }}
    />
  );
}
```

**Cost:** Free (BSD)
**Bundle Size:** ~300 KB total (Quill + mammoth + docx)
**Documentation:** https://quilljs.com/

### Option C: CKEditor (Professional Grade) 💼
**Pros:**
- ✅ Enterprise-grade editor
- ✅ Excellent Word import/export (premium plugin)
- ✅ Collaboration, comments, track changes

**Cons:**
- ❌ **EXPENSIVE** — $1,990+/year for export plugin
- ❌ Large bundle (~500 KB)
- ❌ Overkill for basic editing

**NOT RECOMMENDED** — Too expensive for this use case

### 🎯 Final Recommendation: TipTap + Mammoth + Docx

**Strategy:**
1. **Import .docx** using Mammoth (preserves basic formatting)
2. **Edit in TipTap** (modern WYSIWYG interface)
3. **Export to .docx** using docx library

**Limitations to Communicate to Users:**
- ⚠️ **Advanced Word features not supported:**
  - Comments and track changes
  - Complex tables (merged cells, nested tables)
  - Page breaks and sections
  - Macros (VBA)
- ✅ **Supported:**
  - Text formatting (bold, italic, underline, colors)
  - Headings (H1-H6)
  - Lists (bullets, numbering)
  - Links
  - Simple images

**Alternative Workflow for Power Users:**
```
1. Download .docx from library
2. Edit in Microsoft Word (desktop app)
3. Re-upload to library (replaces old version)
```

**Estimated Implementation Time:** 4-6 days
**Bundle Size Impact:** +400 KB

---

## 📊 Summary Table

| File Type | Recommended Solution | Bundle Size | Implementation Time | Limitations |
|-----------|---------------------|-------------|-------------------|------------|
| **CSV** | AG-Grid + CodeMirror (hybrid) | +700 KB | 2-3 days | Files > 10 MB may be slow in grid view |
| **Excel (.xlsx)** | SheetJS + AG-Grid (read/edit/export) | +1.7 MB | 3-5 days | Formulas preserved but not re-calculated during edit |
| **Word (.docx)** | TipTap + Mammoth + Docx | +400 KB | 4-6 days | Advanced Word features not supported (comments, track changes) |

**Total Bundle Size Impact:** +2.8 MB (uncompressed), ~1 MB (gzipped)

---

## 🚀 Implementation Priority

### Phase 1 (Week 1-2) — CSV Editing
✅ **High Impact, Low Complexity**
1. Install AG-Grid Community
2. Create `CSVGridEditor.tsx` component
3. Add toggle between Grid and Code view
4. Test with sample CSV files (small and large)

### Phase 2 (Week 3-4) — Excel Viewing
⚠️ **Medium Impact, Medium Complexity**
1. Install SheetJS (xlsx)
2. Create `ExcelViewer.tsx` component (read-only)
3. Display sheets in tabs
4. Show formulas in cells (non-editable)

### Phase 3 (Week 5-6) — Excel Editing
⚠️ **Medium Impact, High Complexity**
1. Integrate AG-Grid with SheetJS
2. Implement "Edit as CSV" workflow
3. Add export to .xlsx functionality
4. Test formula preservation

### Phase 4 (Week 7-9) — Word Editing
⚠️ **Medium Impact, High Complexity**
1. Install TipTap + Mammoth + Docx
2. Create `WordEditor.tsx` component
3. Implement .docx import (mammoth)
4. Implement .docx export (docx library)
5. Test with sample Word documents
6. Document limitations for users

---

## 🧪 Testing Strategy

### CSV Editor Tests
- [ ] Load 1 KB, 100 KB, 1 MB, 10 MB CSV files
- [ ] Edit cells and verify onChange callback
- [ ] Sort columns
- [ ] Filter rows
- [ ] Export edited CSV
- [ ] Switch between Grid and Code view

### Excel Tests
- [ ] Load .xlsx with 1 sheet, 10 sheets
- [ ] View formulas (read-only)
- [ ] Edit sheet as CSV
- [ ] Export to .xlsx and verify file integrity
- [ ] Test with Excel files containing charts (chart should be preserved)

### Word Tests
- [ ] Import .docx with bold, italic, headings, lists
- [ ] Edit text
- [ ] Export to .docx and verify formatting
- [ ] Test with images (should be preserved)
- [ ] Test with complex tables (may lose structure — document as limitation)

---

## 📚 References

### CSV/Excel
- [AG-Grid Documentation](https://ag-grid.com/)
- [SheetJS Documentation](https://docs.sheetjs.com/)
- [React Data Grid](https://react-data-grid.org/)

### Word
- [TipTap Documentation](https://tiptap.dev/)
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js/)
- [docx Library](https://docx.js.org/)

### Alternatives Considered
- [Handsontable](https://handsontable.com/) — Excellent but $$$
- [X-Spreadsheet](https://github.com/myliang/x-spreadsheet) — Lightweight but limited
- [ProseMirror](https://prosemirror.net/) — TipTap is built on this

---

**Last Updated:** 2026-02-13
**Author:** Claude Sonnet 4.5
**Status:** ⚠️ Recommendations provided, implementation pending
