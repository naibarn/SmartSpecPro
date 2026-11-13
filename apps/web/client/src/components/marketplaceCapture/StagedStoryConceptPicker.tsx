import { useEffect, useState } from "react";
import { Grid } from "@astryxdesign/core/Grid";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Button } from "@/components/ui/button";

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
  disabled?: boolean;
  onApply: (option: StagedStoryConceptOption) => void;
}) {
  const [chosenConceptId, setChosenConceptId] = useState(
    props.selectedConceptId ?? ""
  );
  useEffect(() => {
    setChosenConceptId(props.selectedConceptId ?? "");
  }, [props.planRevision, props.selectedConceptId]);

  const chosenConcept = props.options.find(
    option => option.conceptId === chosenConceptId
  );
  const currentConceptSelected =
    Boolean(chosenConcept) && chosenConceptId === props.selectedConceptId;

  if (props.options.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
      <p className="text-sm font-semibold text-violet-950">
        เลือกแนวคิดรีวิวจาก 3 แบบ
      </p>
      <p className="mt-1 text-xs leading-5 text-violet-900">
        ระบบใช้ข้อมูลสินค้าและ Product brief มาร่างแนวคิดให้เลือก
        เลือกแนวที่ต้องการเพื่อให้ระบบเขียน Storyboard ฉบับเต็ม
        จากนั้นตรวจและแก้เนื้อหาก่อนยืนยันสร้างภาพหรือวิดีโอ
      </p>
      <Grid columns={{ minWidth: 240, max: 3 }} gap={2}>
        {props.options.map((option, index) => (
          <SelectableCard
            key={option.conceptId}
            label={`แนวคิด ${index + 1}: ${option.title}`}
            isSelected={chosenConceptId === option.conceptId}
            onChange={selected => {
              if (selected) setChosenConceptId(option.conceptId);
            }}
            isDisabled={props.disabled}
            padding={3}
            variant={chosenConceptId === option.conceptId ? "purple" : "muted"}
          >
            <p className="text-sm font-semibold text-slate-900">
              {index + 1}. {option.title}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-700">
              {option.angle}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {option.storySummary}
            </p>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-violet-200 bg-white/80 p-2">
              <p className="text-xs font-semibold text-violet-900">
                บทพูดตัวอย่างของแนวคิดนี้
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {option.dialoguePreview}
              </p>
            </div>
            {option.conceptId === props.selectedConceptId ? (
              <p className="mt-2 text-[11px] font-semibold text-violet-800">
                ใช้กับร่าง Storyboard ที่แสดงด้านล่าง
              </p>
            ) : null}
          </SelectableCard>
        ))}
      </Grid>
      {chosenConcept && !currentConceptSelected ? (
        <footer className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={props.disabled}
            onClick={() => props.onApply(chosenConcept)}
          >
            ใช้แนวคิดนี้และร่าง Storyboard ฉบับเต็ม
          </Button>
          <p className="text-xs text-violet-900">
            ระบบจะสร้างร่างข้อความใหม่ ยังไม่สร้างภาพหรือวิดีโอ
          </p>
        </footer>
      ) : null}
    </section>
  );
}
