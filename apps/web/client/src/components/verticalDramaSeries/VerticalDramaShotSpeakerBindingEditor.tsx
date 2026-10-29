import { useEffect, useState } from "react";
import { Mic, Plus, Trash2 } from "lucide-react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@/components/ui/button";
import type { VerticalDramaSpeakerVisualBinding } from "@shared/verticalDramaSeries/speakerVisualBinding";

export interface VerticalDramaShotSpeakerOption {
  speakerLabel: string;
  dialogueLines: string[];
}

export function VerticalDramaShotSpeakerBindingEditor({
  shotNumber,
  speakers,
  bindings,
  saving = false,
  onSave,
}: {
  shotNumber: number;
  speakers: VerticalDramaShotSpeakerOption[];
  bindings: VerticalDramaSpeakerVisualBinding[];
  saving?: boolean;
  onSave: (bindings: VerticalDramaSpeakerVisualBinding[]) => void;
}) {
  const [draft, setDraft] = useState(bindings);

  useEffect(() => {
    setDraft(bindings);
  }, [bindings]);

  const setCue = (speakerLabel: string, visualCue: string) => {
    setDraft(current => {
      const existing = current.find(
        binding => binding.speakerLabel === speakerLabel
      );
      if (existing) {
        return current.map(binding =>
          binding === existing ? { ...binding, visualCue } : binding
        );
      }
      return [
        ...current,
        {
          id: `shot-speaker-${Date.now()}-${current.length + 1}`,
          speakerLabel,
          visualCue,
        },
      ];
    });
  };

  const addSpeaker = () => {
    if (draft.length >= 6) return;
    const label = `ผู้พูดเพิ่มเติม ${draft.length + 1}`;
    setDraft(current => [
      ...current,
      {
        id: `shot-speaker-${Date.now()}-${current.length + 1}`,
        speakerLabel: label,
        visualCue: "",
      },
    ]);
  };

  const removeSpeaker = (speakerLabel: string) =>
    setDraft(current =>
      current.filter(binding => binding.speakerLabel !== speakerLabel)
    );

  const renameSpeaker = (oldLabel: string, speakerLabel: string) =>
    setDraft(current =>
      current.map(binding =>
        binding.speakerLabel === oldLabel
          ? { ...binding, speakerLabel }
          : binding
      )
    );

  const options = [
    ...speakers
      .filter(
        speaker =>
          !draft.some(
            binding =>
              binding.speakerLabel.trim().toLocaleLowerCase() ===
              speaker.speakerLabel.trim().toLocaleLowerCase()
          )
      )
      .map(speaker => ({ ...speaker, visualCue: "" })),
    ...draft
      .filter(
        binding =>
          !speakers.some(
            speaker =>
              speaker.speakerLabel.trim().toLocaleLowerCase() ===
              binding.speakerLabel.trim().toLocaleLowerCase()
          )
      )
      .map(binding => ({ ...binding, dialogueLines: [] })),
    ...speakers.flatMap(speaker =>
      draft
        .filter(
          binding =>
            binding.speakerLabel.trim().toLocaleLowerCase() ===
            speaker.speakerLabel.trim().toLocaleLowerCase()
        )
        .map(binding => ({ ...speaker, ...binding }))
    ),
  ];

  return (
    <section data-testid={`vd-speaker-binding-${shotNumber}`}>
      <VStack gap={3}>
        <HStack gap={2}>
          <Mic aria-hidden="true" />
          <strong>ผู้พูดที่เห็นในภาพ แต่ไม่มีตัวละครอ้างอิง</strong>
          <small>เฉพาะช็อตนี้</small>
        </HStack>
        <p>
          ระบุชื่อผู้พูดตามบทและลักษณะของคนที่เห็นในภาพเริ่มต้น
          เพื่อให้ Video Prompt ผูกเสียงกับคนในภาพและสั่งให้ขยับปากตอนพูด
          ข้อมูลนี้ไม่เพิ่มลงคลังตัวละคร และไม่ใช่ Caller ทางโทรศัพท์ด้านล่าง
        </p>
        {options.length === 0 ? (
          <EmptyState
            isCompact
            title="ยังไม่มีผู้พูดในรายการ"
            description="กด “เพิ่มผู้พูด” แล้วกรอกชื่อให้ตรงกับบท เช่น นักตรวจผนึก จากนั้นระบุว่าคนนี้อยู่ตรงไหนหรือแต่งตัวอย่างไรในภาพ"
          />
        ) : null}
        {options.map((speaker, index) => (
          <article
            key={
              (speaker as VerticalDramaSpeakerVisualBinding).id ??
              `speaker-${speaker.speakerLabel}-${index}`
            }
          >
            {speakers.some(
              option => option.speakerLabel === speaker.speakerLabel
            ) ? (
              <p>
                <strong>ผู้พูดตามบท:</strong> {speaker.speakerLabel}
              </p>
            ) : (
              <TextInput
                label="ชื่อผู้พูดตามบท"
                value={speaker.speakerLabel}
                maxLength={120}
                description="กรอกชื่อที่ใช้หน้าบทพูด เช่น นักตรวจผนึก"
                onChange={value => renameSpeaker(speaker.speakerLabel, value)}
              />
            )}
            {speaker.dialogueLines.length ? (
              <p>บทพูด: {speaker.dialogueLines.join(" / ")}</p>
            ) : null}
            <TextArea
              label="ลักษณะของคนพูดในภาพเริ่มต้น"
              description="บอกตำแหน่ง เสื้อผ้า หรือจุดสังเกต เพื่อแยกจากตัวละครอื่นในภาพ"
              value={speaker.visualCue}
              maxLength={240}
              placeholder="เช่น ชายชุดเกราะสีเข้มที่ยืนอยู่ด้านหลังทางซ้าย"
              onChange={value => setCue(speaker.speakerLabel, value)}
            />
            {!speakers.some(
              option => option.speakerLabel === speaker.speakerLabel
            ) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeSpeaker(speaker.speakerLabel)}
              >
                <Trash2 aria-hidden="true" /> ลบ
              </Button>
            ) : null}
          </article>
        ))}
        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSpeaker}
            disabled={draft.length >= 6}
          >
            <Plus aria-hidden="true" /> เพิ่มผู้พูด
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onSave(draft.filter(binding => binding.visualCue.trim()))
            }
            disabled={
              saving ||
              draft.some(
                binding =>
                  !binding.speakerLabel.trim() && binding.visualCue.trim()
              )
            }
          >
            {saving ? "กำลังบันทึก…" : "บันทึกการระบุผู้พูด"}
          </Button>
          {draft.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft([]);
                onSave([]);
              }}
              disabled={saving}
            >
              ล้างรายการ
            </Button>
          ) : null}
        </HStack>
      </VStack>
    </section>
  );
}
