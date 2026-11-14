import { useEffect, useId, useState } from "react";
import { Grid } from "@astryxdesign/core/Grid";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type StagedStoryConceptOption = {
  conceptId: string;
  title: string;
  angle: string;
  storySummary: string;
  dialoguePreview: string;
};

export function StagedStoryConceptPicker(props: {
  options: StagedStoryConceptOption[];
  selectedConceptId?: string | null;
  planRevision: number;
  expectedShotCount?: number | "auto";
  generatedShotCount?: number;
  generationStatus?: "idle" | "generating" | "complete" | "failed";
  disabled?: boolean;
  onApply: (option: StagedStoryConceptOption) => void;
}) {
  const groupId = useId();
  const firstConceptId = props.options[0]?.conceptId ?? "";
  const defaultConceptId = props.options.some(
    option => option.conceptId === props.selectedConceptId
  )
    ? props.selectedConceptId!
    : firstConceptId;
  const [chosenConceptId, setChosenConceptId] = useState(defaultConceptId);

  useEffect(() => {
    setChosenConceptId(defaultConceptId);
  }, [props.planRevision, props.selectedConceptId, firstConceptId]);

  const chosenConcept = props.options.find(
    option => option.conceptId === chosenConceptId
  );
  const currentConceptSelected =
    Boolean(chosenConcept) && chosenConceptId === props.selectedConceptId;
  const expectedShotLabel =
    typeof props.expectedShotCount === "number"
      ? `${props.expectedShotCount} ช็อต`
      : props.expectedShotCount === "auto"
        ? "ครบทุกช็อตตามแผน"
        : "ครบทุกช็อตตามที่ตั้งไว้";
  const generatedShotProgress =
    typeof props.expectedShotCount === "number"
      ? `${props.generatedShotCount ?? 0}/${props.expectedShotCount}`
      : `${props.generatedShotCount ?? 0}`;

  if (props.options.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg border-2 border-sky-300 bg-sky-50 p-3 shadow-sm">
      <header className="rounded-md border border-sky-200 bg-white px-3 py-2">
        <p className="text-sm font-bold text-sky-950">
          เลือก 1 แนวคิดจาก 3 แบบ เพื่อสร้าง Storyboard
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-700">
          ระบบไฮไลต์แนวคิดแนะนำไว้ให้เป็นค่าเริ่มต้น คุณเปลี่ยนไปเลือกแนวอื่นได้
          เมื่อกดปุ่มยืนยัน ระบบจึงจะเริ่มร่างเนื้อหา {expectedShotLabel}
          ยังไม่สร้างภาพหรือวิดีโอในขั้นตอนนี้
        </p>
      </header>

      <RadioGroup
        value={chosenConceptId}
        onValueChange={setChosenConceptId}
        aria-label="เลือกหนึ่งแนวคิดรีวิว"
        className="mt-3"
        disabled={props.disabled || props.generationStatus === "generating"}
      >
        <Grid columns={{ minWidth: 240, max: 3 }} gap={2}>
          {props.options.map((option, index) => {
            const selected = chosenConceptId === option.conceptId;
            const recommended = index === 0;
            const optionId = `${groupId}-concept-${index}`;
            return (
              <label
                key={option.conceptId}
                htmlFor={optionId}
                className={`relative flex cursor-pointer flex-col rounded-lg bg-white p-3 transition-colors ${
                  selected
                    ? "border-2 border-sky-600 bg-sky-50 ring-2 ring-sky-300 shadow-sm"
                    : "border border-slate-300 hover:border-sky-400 hover:bg-sky-50/70"
                } ${props.disabled || props.generationStatus === "generating" ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <span className="flex items-start gap-2">
                  <RadioGroupItem
                    id={optionId}
                    value={option.conceptId}
                    aria-label={`เลือกแนวคิด ${index + 1}: ${option.title}`}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-950">
                        {index + 1}. {option.title}
                      </span>
                      {recommended ? (
                        <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                          แนวคิดแนะนำ · ค่าเริ่มต้น
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="rounded-full bg-sky-700 px-2 py-0.5 text-[10px] font-bold text-white">
                          เลือกอยู่
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-800">
                      {option.angle}
                    </span>
                  </span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-700">
                  {option.storySummary}
                </span>
                <span className="mt-3 block max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-slate-50 p-2.5">
                  <span className="block text-xs font-bold text-slate-900">
                    ตัวอย่างบทสนทนา
                  </span>
                  <span className="mt-1.5 block whitespace-pre-wrap text-xs leading-5 text-slate-700">
                    {option.dialoguePreview}
                  </span>
                </span>
              </label>
            );
          })}
        </Grid>
      </RadioGroup>

      {props.generationStatus === "generating" ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950"
        >
          กำลังร่างเนื้อหา Storyboard {expectedShotLabel} — กรุณารอจนระบบทำครบทุกช็อต
          สถานะจะเปลี่ยนเมื่อเนื้อหาพร้อมให้ตรวจ
        </p>
      ) : null}
      {props.generationStatus === "complete" ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-md border-2 border-emerald-500 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-950"
        >
          ร่างเนื้อหาครบ {generatedShotProgress} ช็อตแล้ว
          ตรวจเนื้อหาและบทพูดด้านล่างก่อนยืนยันขั้นตอนถัดไป
        </p>
      ) : null}
      {props.generationStatus === "failed" ? (
        <p
          role="alert"
          className="mt-3 rounded-md border-2 border-red-400 bg-red-50 px-3 py-3 text-sm font-semibold text-red-950"
        >
          ระบบร่าง Storyboard ไม่สำเร็จ จึงยังไม่มีเนื้อหาครบทุกช็อต
          โปรดตรวจรายละเอียดข้อผิดพลาดในคิวงานก่อนส่งใหม่
        </p>
      ) : null}

      {chosenConcept && !currentConceptSelected ? (
        <footer className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={props.disabled || props.generationStatus === "generating"}
            onClick={() => props.onApply(chosenConcept)}
          >
            {props.generationStatus === "generating"
              ? "กำลังรอ Storyboard..."
              : `ยืนยันแนวคิดนี้และร่าง${expectedShotLabel}`}
          </Button>
          <p className="text-xs text-slate-700">
            ต้องกดยืนยันเพื่อเริ่มงาน ระบบจะแจ้งเมื่อเนื้อหาครบแล้ว
          </p>
        </footer>
      ) : null}
    </section>
  );
}
