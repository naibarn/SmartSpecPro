# Interview Transcript — Tiptap Single-Panel Markdown Editor

## Q1: Rollout Strategy

**Q**: Phase 3 จะแทนที่ editor เก่าด้วย Tiptap — ต้องการให้ rollout ทีละ tenant (feature flag) หรือ switch ทั้งระบบพร้อมกัน?

**A**: Switch ทั้งระบบ

**Impact**: ไม่ต้องใช้ feature flag `tiptapEditorEnabled` สำหรับ per-tenant rollout แต่ยังคงเก็บ MarkdownFileEditor ไว้เป็น fallback code path กรณี emergency revert (git revert)

## Q2: Concurrent Edit Conflict UX

**Q**: เมื่อผู้ใช้เปิด 2 tabs แก้ไขเอกสารเดียวกัน + auto-save conflict (expectedUpdatedAt mismatch) ควรจัดการอย่างไร?

**A**: แจ้งเตือน + ให้เลือก overwrite หรือ reload

**Impact**: ต้องสร้าง conflict resolution dialog ที่ catch `LibraryMarkdownVersionConflictError` จาก `saveMarkdown` mutation → แสดง 2 ปุ่ม: "บันทึกทับ" (force save without expectedUpdatedAt) หรือ "โหลดใหม่" (re-fetch + re-render)

## Q3: Document Size

**Q**: ขนาดเอกสาร markdown ที่ใหญ่ที่สุดในระบบปัจจุบันประมาณเท่าไหร่?

**A**: บาง doc 5,000-20,000 คำ

**Impact**: ต้อง test ProseMirror performance กับ document 20,000 คำ (ประมาณ 100,000+ chars) Performance benchmark: editor ต้อง responsive (<100ms input latency) กับ doc ขนาดนี้

## Q4: Slash Command Priority

**Q**: Slash command menu (พิมพ์ / เพื่อแทรก block) ต้องการใน Phase ไหน?

**A**: Phase 1 เลย

**Impact**: Slash command menu ย้ายจาก Phase 4 → Phase 1 เป็น core UX ไม่ใช่ polish ต้องเพิ่ม Tiptap suggestion extension + slash command component ใน Phase 1

## Q5: Drag & Drop Priority

**Q**: Drag & drop media จาก desktop เข้า editor ต้องการตั้งแต่ Phase ไหน?

**A**: Phase 2 (พร้อม media)

**Impact**: Drag-drop ย้ายจาก Phase 4 → Phase 2 ต้อง implement file drop handler + auto-upload + insert node ใน Phase 2 media deliverables

---

## Auto-Decisions (Technical — decided without asking)

| Decision | Rationale |
|----------|-----------|
| Use `tiptap-markdown` (third-party) not `@tiptap/markdown` (official) | Spec already references `editor.storage.markdown.getMarkdown()` API; third-party is stable and proven |
| Use Vitest for all tests (not Jest) | Matches existing test setup in `vitest.config.ts` |
| Use Tailwind `@apply` for editor CSS (not CSS modules) | Matches project convention — no CSS modules used anywhere |
| Conflict dialog reuses existing AlertDialog from Radix UI | Matches UI pattern in DocumentPreviewPanel (replace-file confirmation) |
| `handlePaste` for clipboard images, `transformPastedHTML` for rich paste | Standard ProseMirror pattern, confirmed in research |
| Keep `markdownDraftByDocId` + sync from Tiptap `onUpdate` | Preserves existing dirty-state infrastructure (beforeunload, dirty-dot, tab-close) |
| Rollback via git revert (not feature flag) | User chose switch-all; MarkdownFileEditor.tsx preserved as code-level fallback |
