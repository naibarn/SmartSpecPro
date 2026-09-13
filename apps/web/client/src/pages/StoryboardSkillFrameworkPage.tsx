import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";

type SkillInput = Record<string, unknown>;
type Model = {
  id: string;
  name: string;
  provider?: string;
  configJson?: unknown;
};

function labelFor(key: string): string {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function parseDialogueDraft(value: string, language: string) {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf(":");
      return separator > 0
        ? {
            speaker: line.slice(0, separator).trim(),
            text: line.slice(separator + 1).trim(),
            language,
          }
        : { speaker: "Narrator", text: line, language };
    })
    .filter(line => line.speaker && line.text);
}

function qualityOptions(model: Model | undefined): string[] {
  const config =
    model?.configJson && typeof model.configJson === "object"
      ? (model.configJson as Record<string, unknown>)
      : {};
  const fields = Array.isArray(config.inputFields)
    ? (config.inputFields as Array<Record<string, unknown>>)
    : [];
  const quality = fields.find(
    field => field.name === "quality" || field.key === "quality"
  );
  return Array.isArray(quality?.options)
    ? quality.options.filter(
        (option): option is string => typeof option === "string"
      )
    : [];
}

export default function StoryboardSkillFrameworkPage() {
  const [, setLocation] = useLocation();
  const { i18n } = useTranslation();
  const isThai = i18n.language.startsWith("th");
  const text = (th: string, en: string) => (isThai ? th : en);
  const skillsQuery =
    trpc.storyboardSkillFramework.listCompatibleSkills.useQuery(undefined, {
      staleTime: 300_000,
    });
  const imageModelsQuery = trpc.media.getModels.useQuery(
    { type: "image" },
    { staleTime: 300_000 }
  );
  const videoModelsQuery = trpc.media.getModels.useQuery(
    { type: "video" },
    { staleTime: 300_000 }
  );
  const charactersQuery =
    trpc.storyboardSkillFramework.getProjectCharacters.useQuery(undefined, {
      staleTime: 60_000,
    });
  const dramaCharactersQuery =
    trpc.storyboardSkillFramework.listDramaCharacterSources.useQuery(
      undefined,
      { staleTime: 60_000 }
    );
  const utils = trpc.useUtils();
  const createDraft = trpc.storyboardSkillFramework.createDraft.useMutation();
  const confirmRun =
    trpc.storyboardSkillFramework.confirmAndStart.useMutation();
  const rebuildProjection =
    trpc.storyboardSkillFramework.rebuildReviewProjection.useMutation();
  const upload = trpc.ai.upload.useMutation();
  const createCharacter =
    trpc.storyboardSkillFramework.createCharacter.useMutation();
  const renameCharacter =
    trpc.storyboardSkillFramework.renameCharacter.useMutation();
  const addCharacterLook =
    trpc.storyboardSkillFramework.addCharacterLook.useMutation();
  const importDramaCharacter =
    trpc.storyboardSkillFramework.importDramaCharacter.useMutation();
  const [tab, setTab] = useState<"story" | "characters">("story");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [storyType, setStoryType] = useState<"mime" | "dialogue" | "hybrid">(
    "mime"
  );
  const [dialogueDraft, setDialogueDraft] = useState("");
  const [totalShots, setTotalShots] = useState(9);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillInputs, setSkillInputs] = useState<SkillInput>({});
  const [imageModelId, setImageModelId] = useState("");
  const [imageQuality, setImageQuality] = useState("");
  const [videoModelId, setVideoModelId] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [draftResult, setDraftResult] = useState<{
    projectId: string;
    runId: string;
    confirmationFingerprint: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );
  const [characterNameDraft, setCharacterNameDraft] = useState("");
  const [lookNameDraft, setLookNameDraft] = useState("");
  const [showDramaPicker, setShowDramaPicker] = useState(false);
  const [selectedDramaSeriesId, setSelectedDramaSeriesId] = useState("");

  const skills = skillsQuery.data ?? [];
  const selectedSkill =
    skills.find(skill => skill.skillId === selectedSkillId) ?? skills[0];
  const imageModels = ((
    imageModelsQuery.data as { models?: Model[] } | undefined
  )?.models ?? []) as Model[];
  const videoModels = ((
    videoModelsQuery.data as { models?: Model[] } | undefined
  )?.models ?? []) as Model[];
  const selectedImageModel = imageModels.find(
    model => model.id === imageModelId
  );
  const qualities = useMemo(
    () => qualityOptions(selectedImageModel),
    [selectedImageModel]
  );
  const properties = (selectedSkill?.inputSchema?.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const orderedFields =
    (selectedSkill?.uiSchema?.["ui:order"] as unknown as
      | string[]
      | undefined) ?? Object.keys(properties);
  const dynamicFields = orderedFields.filter(
    key => properties[key] && !selectedSkill?.parentOwnedFields.includes(key)
  );

  useEffect(() => {
    if (!selectedSkillId && selectedSkill)
      setSelectedSkillId(selectedSkill.skillId);
  }, [selectedSkill, selectedSkillId]);
  useEffect(() => {
    if (!imageModelId && imageModels[0]) setImageModelId(imageModels[0].id);
  }, [imageModelId, imageModels]);
  useEffect(() => {
    if (!videoModelId && videoModels[0]) setVideoModelId(videoModels[0].id);
  }, [videoModelId, videoModels]);
  useEffect(() => {
    if (!selectedDramaSeriesId && dramaCharactersQuery.data?.[0])
      setSelectedDramaSeriesId(dramaCharactersQuery.data[0].seriesId);
  }, [dramaCharactersQuery.data, selectedDramaSeriesId]);

  const setSkillValue = (key: string, value: unknown) =>
    setSkillInputs(current => ({ ...current, [key]: value }));
  const addReferenceAsset = (assetId: string | number | null | undefined) => {
    if (assetId == null) return;
    setReferences(current => {
      const normalized = String(assetId);
      return current.includes(normalized)
        ? current
        : [...current, normalized].slice(0, 5);
    });
  };
  const handleReferences = async (files: FileList | null) => {
    if (!files) return;
    const next = [...files].slice(0, 5 - references.length);
    for (const file of next) {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await upload.mutateAsync({
        fileName: file.name,
        fileType: file.type,
        fileBase64,
      });
      setReferences(current => [...current, result.key].slice(0, 5));
    }
  };
  const buildDraft = () => ({
    title:
      title || text("Skill Framework Storyboard", "Skill Framework Storyboard"),
    idea,
    storyType,
    targetPlatform: "short_video",
    totalShots,
    shotDurationSec: 10,
    outputAspectRatio: "9:16",
    selectedSkillId: selectedSkill?.skillId ?? selectedSkillId,
    selectedSkillVersion: selectedSkill?.version ?? "3.0.0",
    imageModelSelection: {
      modelId: imageModelId,
      ...(imageQuality ? { quality: imageQuality } : {}),
    },
    videoModelSelection: { modelId: videoModelId },
    language: i18n.language,
    productContext: "",
    dialogueLines:
      storyType === "mime"
        ? []
        : parseDialogueDraft(dialogueDraft, i18n.language),
    characterIds: selectedCharacters,
    skillInputs: {
      ...skillInputs,
      character_reference_images: references.map(assetId => ({
        asset_id: assetId,
      })),
    },
  });
  const handleCreateDraft = async () => {
    if (!idea.trim() || !selectedSkill) {
      setMessage(
        text(
          "กรุณากรอกไอเดียและเลือก skill",
          "Enter an idea and choose a skill"
        )
      );
      return;
    }
    setMessage("");
    const result = await createDraft.mutateAsync({
      idempotencyKey: `ui-${crypto.randomUUID()}`,
      draft: buildDraft(),
    });
    setDraftResult({
      projectId: result.projectId,
      runId: result.runId,
      confirmationFingerprint: result.confirmationFingerprint,
    });
    setMessage(
      text(
        "บันทึก draft แล้ว ตรวจสอบสรุปก่อนยืนยันสร้าง",
        "Draft saved. Review the estimate before confirming."
      )
    );
  };
  const handleConfirm = async () => {
    if (!draftResult) return;
    await confirmRun.mutateAsync({
      runId: draftResult.runId,
      confirmationFingerprint: draftResult.confirmationFingerprint,
    });
    const projection = await rebuildProjection.mutateAsync({
      runId: draftResult.runId,
    });
    if (projection.projectionStatus === "ready" && projection.reviewId) {
      setLocation(`/storyboard-review/${projection.reviewId}`);
      return;
    }
    setMessage(
      text(
        "เริ่มคิวสร้าง storyboard แล้ว รอ image worker ทำงานต่อ",
        "Storyboard queued; the image worker will continue the run."
      )
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/storyboard-review")}
              aria-label={text("กลับ", "Back")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
                Skill Framework
              </p>
              <h1 className="text-lg font-bold">
                {text("สร้าง Storyboard ใหม่", "New Storyboard")}
              </h1>
            </div>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {totalShots} {text("ช็อต × 10 วินาที", "shots × 10 sec")}
          </span>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border bg-white shadow-sm">
          <nav
            className="flex border-b px-4 pt-2"
            aria-label={text("ขั้นตอนโปรเจกต์", "Project steps")}
          >
            <button
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "story" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500"}`}
              onClick={() => setTab("story")}
            >
              {text("เรื่องและภาพ", "Story & images")}
            </button>
            <button
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "characters" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500"}`}
              onClick={() => setTab("characters")}
            >
              {text("ตัวละคร", "Characters")}
            </button>
          </nav>
          {tab === "story" ? (
            <div className="space-y-6 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  {text("ชื่อโปรเจกต์", "Project title")}
                  <Input
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder={text(
                      "เช่น ลูกนกกลับบ้าน",
                      "e.g. The Lost Bird"
                    )}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  {text("จำนวนช็อต (2–12)", "Shots (2–12)")}
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    value={totalShots}
                    onChange={event =>
                      setTotalShots(
                        Math.min(
                          12,
                          Math.max(2, Number(event.target.value) || 2)
                        )
                      )
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm font-medium">
                {text("ไอเดียสำหรับวีดีโอ", "Video idea")}
                <Textarea
                  value={idea}
                  onChange={event => setIdea(event.target.value)}
                  rows={5}
                  placeholder={text(
                    "เล่าเรื่องที่ต้องการทำ ทั้งแบบละครใบ้หรือมีบทพูดได้",
                    "Describe the story; mime or dialogue are both supported"
                  )}
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">
                  {text("รูปแบบการเล่าเรื่อง", "Story type")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["mime", "ละครใบ้"],
                      ["dialogue", "มีบทพูด"],
                      ["hybrid", "ผสม"],
                    ] as const
                  ).map(([value, th]) => (
                    <label key={value} className="cursor-pointer">
                      <input
                        className="sr-only"
                        type="radio"
                        name="storyType"
                        checked={storyType === value}
                        onChange={() => setStoryType(value)}
                      />
                      <span
                        className={`inline-flex rounded-full border px-3 py-2 text-sm ${storyType === value ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200"}`}
                      >
                        {isThai ? th : value}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {storyType !== "mime" ? (
                <label className="block space-y-1 text-sm font-medium">
                  {text(
                    "บทพูด (บรรทัดละ Speaker: ข้อความ)",
                    "Dialogue (one Speaker: line per row)"
                  )}
                  <Textarea
                    value={dialogueDraft}
                    onChange={event => setDialogueDraft(event.target.value)}
                    rows={4}
                    placeholder={text(
                      "เด็ก: เราจะช่วยลูกนกกันเถอะ!\nแม่: ระวังนะลูก",
                      "Child: Let's help the bird!\nParent: Be careful."
                    )}
                  />
                </label>
              ) : null}
              <label className="block space-y-1 text-sm font-medium">
                {text("Skill สร้างพรอมต์ตัวละคร", "Character prompt skill")}
                <select
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  value={selectedSkill?.skillId ?? ""}
                  onChange={event => setSelectedSkillId(event.target.value)}
                >
                  {skills.map(skill => (
                    <option key={skill.skillId} value={skill.skillId}>
                      {skill.displayName} · v{skill.version}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSkill ? (
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    <h2 className="text-sm font-bold">
                      {text("ข้อมูลจาก skill", "Skill inputs")}
                    </h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {dynamicFields.map(key => {
                      const schema = properties[key];
                      const uiField =
                        selectedSkill.uiSchema[key] &&
                        typeof selectedSkill.uiSchema[key] === "object"
                          ? (selectedSkill.uiSchema[key] as Record<
                              string,
                              unknown
                            >)
                          : {};
                      const widget = String(uiField["ui:widget"] ?? "");
                      const uiPlaceholder =
                        typeof uiField["ui:placeholder"] === "string"
                          ? uiField["ui:placeholder"]
                          : undefined;
                      const enumValues = Array.isArray(schema.enum)
                        ? schema.enum.filter(
                            (v): v is string => typeof v === "string"
                          )
                        : [];
                      return (
                        <label
                          key={key}
                          className="space-y-1 text-sm font-medium"
                        >
                          {labelFor(key)}
                          {widget === "textarea" ? (
                            <Textarea
                              value={String(
                                skillInputs[key] ?? schema.default ?? ""
                              )}
                              onChange={event =>
                                setSkillValue(key, event.target.value)
                              }
                              placeholder={
                                uiPlaceholder ??
                                (typeof schema.description === "string"
                                  ? schema.description
                                  : "")
                              }
                              rows={3}
                            />
                          ) : enumValues.length ? (
                            <select
                              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              value={String(
                                skillInputs[key] ?? schema.default ?? ""
                              )}
                              onChange={event =>
                                setSkillValue(key, event.target.value)
                              }
                            >
                              <option value="">
                                {text("เลือก", "Select")}
                              </option>
                              {enumValues.map(option => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : schema.type === "integer" ||
                            schema.type === "number" ? (
                            <Input
                              type="number"
                              value={String(
                                skillInputs[key] ?? schema.default ?? ""
                              )}
                              onChange={event =>
                                setSkillValue(key, Number(event.target.value))
                              }
                            />
                          ) : (
                            <Input
                              value={String(
                                skillInputs[key] ?? schema.default ?? ""
                              )}
                              onChange={event =>
                                setSkillValue(key, event.target.value)
                              }
                              placeholder={
                                uiPlaceholder ??
                                (typeof schema.description === "string"
                                  ? schema.description
                                  : "")
                              }
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  {text("โมเดลสร้างรูป", "Image model")}
                  <select
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={imageModelId}
                    onChange={event => {
                      setImageModelId(event.target.value);
                      setImageQuality("");
                    }}
                  >
                    {imageModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name || model.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  {text("โมเดลสร้างวีดีโอ", "Video model")}
                  <select
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={videoModelId}
                    onChange={event => setVideoModelId(event.target.value)}
                  >
                    {videoModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name || model.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {qualities.length > 0 ? (
                <label className="block max-w-sm space-y-1 text-sm font-medium">
                  {text("คุณภาพรูป", "Image quality")}
                  <select
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={imageQuality}
                    onChange={event => setImageQuality(event.target.value)}
                  >
                    <option value="">
                      {text("ค่าเริ่มต้นของโมเดล", "Model default")}
                    </option>
                    {qualities.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block space-y-2 text-sm font-medium">
                {text(
                  "รูปอ้างอิงตัวละคร (เลือกใส่ได้ 0–5 รูป)",
                  "Character references (optional, 0–5 images)"
                )}
                <span className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-slate-500">
                  <Upload className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={references.length >= 5 || upload.isPending}
                    onChange={event =>
                      void handleReferences(event.target.files)
                    }
                  />
                  {upload.isPending
                    ? text("กำลังอัปโหลด...", "Uploading...")
                    : `${references.length}/5`}
                </span>
                {references.length > 0 ? (
                  <ul
                    className="flex flex-wrap gap-2"
                    aria-label={text(
                      "รูปอ้างอิงที่เลือก",
                      "Selected reference images"
                    )}
                  >
                    {references.map((assetId, index) => (
                      <li
                        key={`${assetId}-${index}`}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                      >
                        <span>
                          {text(`รูปที่ ${index + 1}`, `Image ${index + 1}`)}
                        </span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-slate-200"
                          aria-label={text(
                            `ลบรูปที่ ${index + 1}`,
                            `Remove image ${index + 1}`
                          )}
                          onClick={() =>
                            setReferences(current =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index
                              )
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-sky-600" />
                  <h2 className="font-bold">
                    {text("ตัวละครที่บันทึกไว้", "Saved characters")}
                  </h2>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDramaPicker(current => !current)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  {text("นำเข้าจาก Drama Series", "Import from Drama Series")}
                </Button>
              </div>
              <p className="text-sm text-slate-500">
                {text(
                  "ตัวละครจาก library จะถูก snapshot เข้าโปรเจกต์เพื่อรักษาหน้าตาเดิม",
                  "Library characters are snapshotted into the project to preserve identity."
                )}
              </p>
              {showDramaPicker ? (
                <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-end">
                    <label className="space-y-1 text-sm font-medium">
                      {text("เลือก Series", "Choose series")}
                      <select
                        className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                        value={selectedDramaSeriesId}
                        onChange={event =>
                          setSelectedDramaSeriesId(event.target.value)
                        }
                      >
                        <option value="">
                          {text("เลือก Series", "Select a series")}
                        </option>
                        {(dramaCharactersQuery.data ?? []).map(series => (
                          <option key={series.seriesId} value={series.seriesId}>
                            {series.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs leading-5 text-violet-800">
                      {text(
                        "เลือกตัวละครเพื่อ import ภาพ portrait ที่อนุมัติแล้วเข้า Character Library และใช้เป็น reference ให้อัตโนมัติ",
                        "Import an approved portrait into Character Library; it will automatically become a storyboard reference."
                      )}
                    </p>
                  </div>
                  {(() => {
                    const series = (dramaCharactersQuery.data ?? []).find(
                      item => item.seriesId === selectedDramaSeriesId
                    );
                    if (dramaCharactersQuery.isLoading)
                      return (
                        <p className="text-sm text-slate-500">
                          {text("กำลังโหลดตัวละคร...", "Loading characters...")}
                        </p>
                      );
                    if (!series || series.characters.length === 0)
                      return (
                        <p className="text-sm text-slate-500">
                          {text(
                            "ยังไม่มีตัวละครใน Series นี้",
                            "This series has no characters yet."
                          )}
                        </p>
                      );
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {series.characters.map(character => (
                          <article
                            key={character.characterId}
                            className="flex min-w-0 items-center gap-3 rounded-lg border bg-white p-3"
                          >
                            {character.portraitUrl ? (
                              <img
                                src={character.portraitUrl}
                                alt={character.name}
                                className="h-14 w-14 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                                {text("ไม่มีภาพ", "No portrait")}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {character.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {character.characterKey}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                className="mt-2"
                                disabled={importDramaCharacter.isPending}
                                onClick={async () => {
                                  const imported =
                                    await importDramaCharacter.mutateAsync({
                                      seriesId: selectedDramaSeriesId,
                                      characterId: character.characterId,
                                    });
                                  await utils.storyboardSkillFramework.getProjectCharacters.invalidate();
                                  setSelectedCharacters(current =>
                                    current.includes(imported.id)
                                      ? current
                                      : [...current, imported.id]
                                  );
                                  addReferenceAsset(imported.portraitAssetId);
                                  setShowDramaPicker(false);
                                  setMessage(
                                    text(
                                      `นำเข้า ${imported.name} และเพิ่มภาพเป็น reference แล้ว`,
                                      `Imported ${imported.name}; portrait added as a reference.`
                                    )
                                  );
                                }}
                              >
                                {text("นำเข้าและเลือก", "Import & select")}
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                    );
                  })()}
                </section>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {(charactersQuery.data ?? []).map(character => (
                  <div
                    key={character.id}
                    className={`rounded-xl border p-3 ${selectedCharacters.includes(character.id) ? "border-sky-500 bg-sky-50" : ""}`}
                  >
                    <label className="flex items-start">
                      <input
                        type="checkbox"
                        className="mr-2 mt-1"
                        checked={selectedCharacters.includes(character.id)}
                        onChange={() => {
                          const isSelected = selectedCharacters.includes(
                            character.id
                          );
                          setSelectedCharacters(current =>
                            isSelected
                              ? current.filter(id => id !== character.id)
                              : [...current, character.id]
                          );
                          if (!isSelected)
                            addReferenceAsset(character.portraitAssetId);
                          else if (character.portraitAssetId != null)
                            setReferences(current =>
                              current.filter(
                                assetId =>
                                  assetId !== String(character.portraitAssetId)
                              )
                            );
                        }}
                      />{" "}
                      <span className="font-medium">
                        {character.portraitUrl ? (
                          <img
                            src={character.portraitUrl}
                            alt={character.name}
                            className="mr-2 inline-block h-8 w-8 rounded object-cover align-middle"
                          />
                        ) : null}
                        {editingCharacterId === character.id ? (
                          <Input
                            autoFocus
                            value={characterNameDraft}
                            onChange={event =>
                              setCharacterNameDraft(event.target.value)
                            }
                            onBlur={async () => {
                              if (characterNameDraft.trim()) {
                                await renameCharacter.mutateAsync({
                                  characterId: character.id,
                                  name: characterNameDraft,
                                });
                                await utils.storyboardSkillFramework.getProjectCharacters.invalidate();
                              }
                              setEditingCharacterId(null);
                            }}
                          />
                        ) : (
                          character.name
                        )}
                        <span className="mt-1 block text-xs text-slate-500">
                          {character.characterKey}
                        </span>
                      </span>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingCharacterId(character.id);
                          setCharacterNameDraft(character.name);
                        }}
                      >
                        {text("แก้ชื่อ", "Rename")}
                      </Button>
                      <Input
                        className="h-8 w-32 text-xs"
                        placeholder={text("ชื่อลุคใหม่", "New look")}
                        value={
                          editingCharacterId === `look:${character.id}`
                            ? lookNameDraft
                            : ""
                        }
                        onFocus={() => {
                          setEditingCharacterId(`look:${character.id}`);
                          setLookNameDraft("");
                        }}
                        onChange={event => setLookNameDraft(event.target.value)}
                        onKeyDown={async event => {
                          if (event.key === "Enter" && lookNameDraft.trim()) {
                            await addCharacterLook.mutateAsync({
                              characterId: character.id,
                              name: lookNameDraft,
                              look: {},
                            });
                            setLookNameDraft("");
                            setEditingCharacterId(null);
                          }
                        }}
                      />
                      <span className="self-center text-xs text-slate-400">
                        {text(
                          "กด Enter เพื่อเพิ่มลุค",
                          "Press Enter to add look"
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await createCharacter.mutateAsync({});
                  await utils.storyboardSkillFramework.getProjectCharacters.invalidate();
                }}
                disabled={createCharacter.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                {text(
                  "สร้างตัวละครใหม่ (ตั้งชื่ออัตโนมัติ)",
                  "Create character (auto-name)"
                )}
              </Button>
            </div>
          )}
        </div>
        <aside className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold">{text("สรุปและการทำงาน", "Summary")}</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{text("ความยาว", "Duration")}</dt>
              <dd className="font-semibold">{totalShots * 10}s</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{text("รูปภาพ", "Images")}</dt>
              <dd className="font-semibold">{totalShots}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">
                {text("อ้างอิง", "References")}
              </dt>
              <dd className="font-semibold">{references.length}/5</dd>
            </div>
          </dl>
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            {text(
              "ระบบจะสร้าง prompt ของทุกช็อตก่อน แล้วค่อยส่ง generation_request แบบเต็มไปยัง Image Core",
              "Each shot gets a prompt first, then the complete generation_request is handed to Image Core."
            )}
          </p>
          {message ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {message}
            </p>
          ) : null}
          {draftResult ? (
            <Button
              className="w-full"
              onClick={() => void handleConfirm()}
              disabled={confirmRun.isPending}
            >
              {confirmRun.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {text("ยืนยันและเริ่มสร้าง", "Confirm and start")}
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => void handleCreateDraft()}
              disabled={createDraft.isPending || skillsQuery.isLoading}
            >
              {createDraft.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {text("บันทึก draft และดูสรุป", "Save draft and review")}
            </Button>
          )}
        </aside>
      </section>
    </main>
  );
}
