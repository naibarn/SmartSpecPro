import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Plus, ScanSearch, Trash2 } from "lucide-react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@/components/ui/button";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import type {
  VerticalDramaDetectedShotPerson,
  VerticalDramaShotSpeakerSuggestion,
  VerticalDramaSpeakerVisualBinding,
} from "@shared/verticalDramaSeries/speakerVisualBinding";

export interface VerticalDramaShotSpeakerOption {
  speakerLabel: string;
  displayLabel?: string;
  dialogueLines: string[];
}

export function VerticalDramaShotSpeakerBindingEditor({
  shotNumber,
  speakers,
  bindings,
  startFrameImageSrc,
  sourceMediaAssetId,
  detectedPeople = [],
  speakerSuggestions = [],
  detectingPeople = false,
  onDetectPeople,
  locale = "th",
  saving = false,
  disabled = false,
  autoSaveSuggestions = true,
  onSave,
}: {
  shotNumber: number;
  speakers: VerticalDramaShotSpeakerOption[];
  bindings: VerticalDramaSpeakerVisualBinding[];
  startFrameImageSrc?: string;
  sourceMediaAssetId?: string;
  detectedPeople?: VerticalDramaDetectedShotPerson[];
  speakerSuggestions?: VerticalDramaShotSpeakerSuggestion[];
  detectingPeople?: boolean;
  onDetectPeople?: () => void;
  locale?: "th" | "en";
  saving?: boolean;
  disabled?: boolean;
  /** The parent can persist a completed durable-job result before advancing a batch. */
  autoSaveSuggestions?: boolean;
  onSave: (
    bindings: VerticalDramaSpeakerVisualBinding[],
    options?: { automatic?: boolean }
  ) => void;
}) {
  const isEnglish = locale === "en";
  const [draft, setDraft] = useState(bindings);
  const draftRef = useRef(bindings);
  const isDirtyRef = useRef(false);
  const sourceMediaAssetIdRef = useRef(sourceMediaAssetId);
  const lastAppliedSuggestionKeyRef = useRef<string | null>(null);
  const bindingsSignature = JSON.stringify(bindings);
  const speakerSuggestionsSignature = JSON.stringify(speakerSuggestions);

  useEffect(() => {
    const sourceChanged = sourceMediaAssetIdRef.current !== sourceMediaAssetId;
    const nextBindings = (JSON.parse(bindingsSignature) as VerticalDramaSpeakerVisualBinding[]).map(binding =>
      binding.sourceMediaAssetId && binding.sourceMediaAssetId !== sourceMediaAssetId
        ? {
            ...binding,
            visualCue: "",
            personId: undefined,
            boundingBox: undefined,
            sourceMediaAssetId: undefined,
          }
        : binding
    );
    sourceMediaAssetIdRef.current = sourceMediaAssetId;

    // Episode detail is polled while frame jobs are running. Those background
    // refreshes must not replace selections the user has not saved yet.
    const serverMatchesDraft = JSON.stringify(nextBindings) === JSON.stringify(draftRef.current);
    if (sourceChanged || !isDirtyRef.current || serverMatchesDraft) {
      draftRef.current = nextBindings;
      isDirtyRef.current = false;
      setDraft(nextBindings);
    }
  }, [bindingsSignature, sourceMediaAssetId]);

  useEffect(() => {
    const suggestions = JSON.parse(
      speakerSuggestionsSignature
    ) as VerticalDramaShotSpeakerSuggestion[];
    if (!suggestions.length || !sourceMediaAssetId) return;
    const suggestionKey = `${sourceMediaAssetId}:${speakerSuggestionsSignature}`;
    if (lastAppliedSuggestionKeyRef.current === suggestionKey) return;
    lastAppliedSuggestionKeyRef.current = suggestionKey;
    if (isDirtyRef.current) return;

    const next = draftRef.current.slice();
    let changed = false;
    for (const suggestion of suggestions) {
      if (!speakers.some(speaker => speaker.speakerLabel === suggestion.speakerLabel)) continue;
      const person = detectedPeople.find(candidate => candidate.id === suggestion.personId);
      if (!person) continue;
      const existingIndex = next.findIndex(
        binding => binding.speakerLabel === suggestion.speakerLabel
      );
      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        // Keep saved selections and any text the user has already entered.
        if (existing.personId || existing.visualCue.trim()) continue;
        next[existingIndex] = {
          ...existing,
          visualCue: person.appearance,
          personId: person.id,
          boundingBox: person.boundingBox,
          sourceMediaAssetId,
        };
      } else {
        next.push({
          id: `shot-speaker-${Date.now()}-${next.length + 1}`,
          speakerLabel: suggestion.speakerLabel,
          visualCue: person.appearance,
          personId: person.id,
          boundingBox: person.boundingBox,
          sourceMediaAssetId,
        });
      }
      changed = true;
    }
    if (!changed) return;
    isDirtyRef.current = true;
    draftRef.current = next;
    setDraft(next);
    if (autoSaveSuggestions)
      onSave(next.filter(binding => binding.visualCue.trim()), { automatic: true });
  }, [speakerSuggestionsSignature, sourceMediaAssetId, speakers, detectedPeople, autoSaveSuggestions, onSave]);

  const updateDraft = (
    updater: (current: VerticalDramaSpeakerVisualBinding[]) => VerticalDramaSpeakerVisualBinding[]
  ) => {
    isDirtyRef.current = true;
    setDraft(current => {
      const next = updater(current);
      draftRef.current = next;
      return next;
    });
  };

  const setCue = (speakerLabel: string, visualCue: string) => {
    updateDraft(current => {
      const existing = current.find(
        binding => binding.speakerLabel === speakerLabel
      );
      if (existing) {
        return current.map(binding =>
          binding === existing
            ? binding.sourceMediaAssetId && binding.sourceMediaAssetId !== sourceMediaAssetId
              ? { ...binding, visualCue, personId: undefined, boundingBox: undefined, sourceMediaAssetId: undefined }
              : { ...binding, visualCue }
            : binding
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

  const setPerson = (speakerLabel: string, personId: string) => {
    const person = detectedPeople.find(candidate => candidate.id === personId);
    updateDraft(current => {
      const existing = current.find(binding => binding.speakerLabel === speakerLabel);
      if (!person) {
        if (!existing) return current;
        return current.map(binding => binding === existing
          ? {
              ...binding,
              visualCue: binding.sourceMediaAssetId && binding.sourceMediaAssetId !== sourceMediaAssetId ? "" : binding.visualCue,
              personId: undefined,
              boundingBox: undefined,
              sourceMediaAssetId: undefined,
            }
          : binding);
      }
      const next: VerticalDramaSpeakerVisualBinding = {
        id: existing?.id ?? `shot-speaker-${Date.now()}-${current.length + 1}`,
        speakerLabel,
        visualCue: person.appearance,
        personId: person.id,
        boundingBox: person.boundingBox,
        ...(sourceMediaAssetId ? { sourceMediaAssetId } : {}),
      };
      return existing
        ? current.map(binding => binding === existing ? next : binding)
        : [...current, next];
    });
  };

  const addSpeaker = () => {
    if (draft.length >= 12) return;
    const label = `ผู้พูดเพิ่มเติม ${draft.length + 1}`;
    updateDraft(current => [
      ...current,
      {
        id: `shot-speaker-${Date.now()}-${current.length + 1}`,
        speakerLabel: label,
        visualCue: "",
      },
    ]);
  };

  const removeSpeaker = (speakerLabel: string) =>
    updateDraft(current =>
      current.filter(binding => binding.speakerLabel !== speakerLabel)
    );

  const renameSpeaker = (oldLabel: string, speakerLabel: string) =>
    updateDraft(current =>
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
          <strong>{isEnglish ? "Map dialogue speakers to people in this shot" : "จับคู่ผู้พูดกับคนที่เห็นในภาพช็อตนี้"}</strong>
          <small>{isEnglish ? "shot-local" : "เฉพาะช็อตนี้"}</small>
        </HStack>
        <p>
          {isEnglish
            ? "AI detects people and automatically saves confident matches from the approved Start Frame. You can change any selection below. This does not create permanent characters or phone callers."
            : "AI ตรวจจับคนและบันทึกผลจับคู่ที่มั่นใจจาก Start frame ที่อนุมัติให้อัตโนมัติ เปลี่ยนคนที่เลือกได้ด้านล่าง ข้อมูลนี้ไม่เพิ่มตัวละครถาวรและไม่ใช่ Caller โทรศัพท์"}
        </p>
        {bindings.some(binding => binding.sourceMediaAssetId && binding.sourceMediaAssetId !== sourceMediaAssetId) ? (
          <p role="status" className="text-sm text-amber-700">{isEnglish ? "The Start Frame changed. Re-run detection and map speakers to people in the current frame." : "ภาพ Start frame เปลี่ยนแล้ว ให้ตรวจจับและจับคู่คนจากภาพปัจจุบันใหม่"}</p>
        ) : null}
        {onDetectPeople ? (
          <Button type="button" variant="outline" size="sm" onClick={onDetectPeople} disabled={disabled || detectingPeople || !startFrameImageSrc}>
            {detectingPeople ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ScanSearch aria-hidden="true" />}
            {detectingPeople ? (isEnglish ? "Analyzing frame…" : "กำลังตรวจจับคนในภาพ…") : (isEnglish ? "Detect people in image" : "ตรวจจับคนในภาพด้วย AI")}
          </Button>
        ) : null}
        {detectedPeople.length > 0 && startFrameImageSrc ? (
          <figure className="w-full max-w-sm">
            <section className="relative overflow-hidden rounded-md border bg-muted">
              <AuthenticatedMediaImage src={startFrameImageSrc} alt={isEnglish ? "Approved Start Frame with detected people" : "ภาพ Start frame พร้อมกรอบคนที่ตรวจพบ"} className="block h-auto w-full" loading="eager" />
              {detectedPeople.map((person, index) => (
                <span key={person.id} aria-label={`${person.id}: ${person.appearance}`} title={`${person.id}: ${person.appearance}`} className={`pointer-events-none absolute border-2 ${person.confidence < 0.65 ? "border-amber-400 bg-amber-400/10" : "border-cyan-400 bg-cyan-400/10"} text-[10px] font-bold text-white shadow-sm`} style={{ left: `${person.boundingBox.x * 100}%`, top: `${person.boundingBox.y * 100}%`, width: `${person.boundingBox.width * 100}%`, height: `${person.boundingBox.height * 100}%` }}>
                  <span className="absolute left-0 top-0 bg-cyan-700 px-1">{index + 1}</span>
                </span>
              ))}
            </section>
            <figcaption className="mt-1 text-xs text-muted-foreground">{isEnglish ? "AI boxes are approximate. Confirm each mapping below." : "กรอบจาก AI เป็นตำแหน่งโดยประมาณ โปรดยืนยันการจับคู่ด้านล่าง"}</figcaption>
          </figure>
        ) : null}
        {options.length === 0 ? (
          <EmptyState
            isCompact
            title={isEnglish ? "No speakers mapped yet" : "ยังไม่มีผู้พูดในรายการ"}
            description={isEnglish ? "Add a dialogue speaker, then select a detected person or describe them in the frame." : "เพิ่มผู้พูดตามบท แล้วเลือกคนที่ตรวจพบหรือบรรยายลักษณะในภาพ"}
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
                <strong>ผู้พูดตามบท:</strong> {speaker.displayLabel ?? speaker.speakerLabel}
              </p>
            ) : (
              <TextInput
                label="ชื่อผู้พูดตามบท"
                value={speaker.speakerLabel}
                maxLength={120}
                description="กรอกชื่อที่ใช้หน้าบทพูด เช่น นักตรวจผนึก"
                onChange={value => renameSpeaker(speaker.speakerLabel, value)}
                disabled={disabled}
              />
            )}
            {speaker.dialogueLines.length ? (
              <p>{isEnglish ? "Dialogue:" : "บทพูด:"} {speaker.dialogueLines.join(" / ")}</p>
            ) : null}
            {detectedPeople.length > 0 ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium">{isEnglish ? "Person in the image" : "คนที่ตรงกับผู้พูดในภาพ"}</span>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={(speaker as VerticalDramaSpeakerVisualBinding).personId ?? ""} onChange={event => setPerson(speaker.speakerLabel, event.target.value)} disabled={disabled}>
                  <option value="">{isEnglish ? "Select a person or enter a description below" : "เลือกคน หรือระบุลักษณะด้านล่าง"}</option>
                  {detectedPeople.map((person, index) => (
                    <option key={person.id} value={person.id} disabled={draft.some(binding => binding.speakerLabel !== speaker.speakerLabel && binding.personId === person.id)}>
                      {`${index + 1}. ${person.appearance} (${Math.round(person.confidence * 100)}%)`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <TextArea
              label={isEnglish ? "Visual description" : "ลักษณะของคนพูดในภาพเริ่มต้น"}
              description={isEnglish ? "Describe clothing, depth, pose, or a distinctive detail to distinguish this person." : "บอกเสื้อผ้า ตำแหน่งระยะหน้า-หลัง ท่าทาง หรือจุดสังเกต เพื่อแยกจากคนอื่น"}
              value={speaker.visualCue}
              maxLength={240}
              placeholder={isEnglish ? "For example, the man in dark armor at the back on viewer-left" : "เช่น ชายชุดเกราะสีเข้มที่ยืนอยู่ด้านหลังทางซ้าย"}
              onChange={value => setCue(speaker.speakerLabel, value)}
              disabled={disabled}
            />
            {!speakers.some(
              option => option.speakerLabel === speaker.speakerLabel
            ) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeSpeaker(speaker.speakerLabel)}
                disabled={disabled}
              >
                <Trash2 aria-hidden="true" /> {isEnglish ? "Remove" : "ลบ"}
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
            disabled={disabled || draft.length >= 12}
          >
            <Plus aria-hidden="true" /> {isEnglish ? "Add speaker" : "เพิ่มผู้พูด"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onSave(draft.filter(binding => binding.visualCue.trim()))
            }
            disabled={
              disabled ||
              saving ||
              draft.some(
                binding =>
                  !binding.speakerLabel.trim() && binding.visualCue.trim()
              )
            }
          >
            {saving ? (isEnglish ? "Saving…" : "กำลังบันทึก…") : (isEnglish ? "Save speaker mapping" : "บันทึกการระบุผู้พูด")}
          </Button>
          {draft.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                updateDraft(() => []);
                onSave([]);
              }}
              disabled={disabled || saving}
            >
              {isEnglish ? "Clear mappings" : "ล้างรายการ"}
            </Button>
          ) : null}
        </HStack>
      </VStack>
    </section>
  );
}
