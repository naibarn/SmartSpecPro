import { Plus, RotateCcw, Trash2, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VerticalDramaSupportingPresence } from "@shared/verticalDramaSeries/supportingPresence";

type Locale = "th" | "en";

function copy(locale: Locale, th: string, en: string) {
  return locale === "th" ? th : en;
}

function newEntry(index: number): VerticalDramaSupportingPresence {
  return {
    id: `manual-supporting-${Date.now()}-${index}`,
    role: "",
    countMin: 1,
    countMax: 1,
    visibility: "visible",
    action: "",
    evidence: "",
    source: "manual",
    confidence: "high",
    status: "accepted",
  };
}

export interface VerticalDramaSupportingPresenceEditorProps {
  shotNumber: number;
  locale?: Locale;
  entries: VerticalDramaSupportingPresence[];
  customized?: boolean;
  saving?: boolean;
  onSave: (entries: VerticalDramaSupportingPresence[]) => void;
  onReset: () => void;
}

/**
 * Shot-local, text-only people/group override. Keeping this as a replace-all
 * editor makes add/edit/remove/suppress atomic and prevents a stale auto list
 * from being merged back into the user's explicit decision.
 */
export function VerticalDramaSupportingPresenceEditor({
  shotNumber,
  locale = "th",
  entries,
  customized = false,
  saving = false,
  onSave,
  onReset,
}: VerticalDramaSupportingPresenceEditorProps) {
  const [open, setOpen] = React.useState(customized || entries.length > 0);
  const [draft, setDraft] = React.useState(entries);

  React.useEffect(() => {
    setDraft(entries);
    if (customized || entries.length > 0) setOpen(true);
  }, [customized, entries]);

  const update = (
    id: string,
    patch: Partial<VerticalDramaSupportingPresence>
  ) =>
    setDraft(current =>
      current.map(entry => (entry.id === id ? { ...entry, ...patch } : entry))
    );

  const remove = (id: string) =>
    setDraft(current => current.filter(entry => entry.id !== id));

  const add = () => {
    if (draft.length >= 6) return;
    setDraft(current => [...current, newEntry(current.length)]);
    setOpen(true);
  };

  return (
    <section
      className="mt-3 rounded-lg border border-violet-300/70 bg-violet-50/50 p-3 dark:bg-violet-950/20"
      data-testid={`vd-supporting-presence-editor-${shotNumber}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        <Users className="h-4 w-4 text-violet-700 dark:text-violet-300" />
        <span className="text-xs font-semibold text-violet-900 dark:text-violet-100">
          {copy(
            locale,
            "คน/กลุ่มประกอบในช็อตนี้",
            "Supporting people/groups in this shot"
          )}
        </span>
        <Badge
          variant="outline"
          className="border-violet-300 px-1.5 py-0 text-[10px]"
        >
          {copy(locale, "เฉพาะช็อตนี้", "Shot only")}
        </Badge>
        {customized ? (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {copy(locale, "กำหนดเอง", "Custom")}
          </Badge>
        ) : entries.length > 0 ? (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {copy(locale, "ตรวจพบอัตโนมัติ", "Auto-detected")}
          </Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {draft.length}/6
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {copy(
              locale,
              "ระบบจะใส่เฉพาะคนทั่วไปที่มองเห็นจริงในช็อตนี้ ไม่สร้างตัวละครถาวร และคุณเพิ่ม/แก้/ลบหรือปิดรายการได้เอง",
              "Only generic people visibly present in this shot are included. They do not become roster characters, and you can add, edit, remove, or suppress them."
            )}
          </p>

          {draft.map(entry => (
            <div
              key={entry.id}
              className="rounded-md border border-violet-200 bg-background p-2 dark:border-violet-800"
            >
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_72px_72px_120px_auto]">
                <label className="text-[10px] text-muted-foreground">
                  {copy(locale, "บทบาท/กลุ่ม", "Role/group")}
                  <input
                    value={entry.role}
                    onChange={event =>
                      update(entry.id, { role: event.target.value })
                    }
                    placeholder={copy(
                      locale,
                      "เช่น ตำรวจ, ชาวบ้าน",
                      "e.g. police, villagers"
                    )}
                    className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  {copy(locale, "อย่างน้อย", "Min")}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={entry.countMin}
                    onChange={event =>
                      update(entry.id, {
                        countMin: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                    className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  {copy(locale, "ไม่เกิน", "Max")}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={entry.countMax}
                    onChange={event =>
                      update(entry.id, {
                        countMax: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                    className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  {copy(locale, "การปรากฏ", "Visibility")}
                  <select
                    value={entry.visibility}
                    onChange={event =>
                      update(entry.id, {
                        visibility: event.target.value as
                          | "visible"
                          | "background",
                      })
                    }
                    className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="visible">
                      {copy(locale, "เห็นชัด", "Visible")}
                    </option>
                    <option value="background">
                      {copy(locale, "ฉากหลัง", "Background")}
                    </option>
                  </select>
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mt-4 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(entry.id)}
                  aria-label={copy(
                    locale,
                    `ลบ ${entry.role || "รายการ"}`,
                    `Remove ${entry.role || "entry"}`
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <label className="mt-2 block text-[10px] text-muted-foreground">
                {copy(locale, "สิ่งที่กำลังทำในภาพ", "Visible action")}
                <input
                  value={entry.action}
                  onChange={event =>
                    update(entry.id, { action: event.target.value })
                  }
                  placeholder={copy(
                    locale,
                    "เช่น ยืนฟังเหตุการณ์อยู่ด้านหลัง",
                    "e.g. standing and listening in the background"
                  )}
                  className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                />
              </label>
              <label className="mt-2 block text-[10px] text-muted-foreground">
                {copy(
                  locale,
                  "หลักฐานจากบท/ภาพ (ถ้ามี)",
                  "Script/visual evidence (optional)"
                )}
                <input
                  value={entry.evidence ?? ""}
                  onChange={event =>
                    update(entry.id, { evidence: event.target.value })
                  }
                  placeholder={copy(
                    locale,
                    "เช่น บทระบุว่าพาตำรวจเข้ามา",
                    "e.g. the script says police are brought in"
                  )}
                  className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"
                />
              </label>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={add}
              disabled={saving || draft.length >= 6}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {copy(locale, "เพิ่มคน/กลุ่ม", "Add people/group")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onSave(draft)}
              disabled={saving}
            >
              {copy(locale, "บันทึกการแก้ไขช็อตนี้", "Save this shot")}
            </Button>
            {customized ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onReset}
                disabled={saving}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {copy(locale, "คืนค่า auto จากบท", "Restore auto from script")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onSave([])}
                disabled={saving}
              >
                {copy(locale, "ไม่ให้แสดงรายการ auto", "Suppress auto list")}
              </Button>
            )}
            {saving ? (
              <span className="text-[11px] text-muted-foreground">
                {copy(locale, "กำลังบันทึก…", "Saving…")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default VerticalDramaSupportingPresenceEditor;
