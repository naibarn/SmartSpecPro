import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  BookmarkPlus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  filterRecoverableStoryboardRuns,
  isRecoverableStoryboardRun,
} from "@/lib/storyboardRecovery";
import {
  coerceStoryboardSkillInputValue,
  isNumericStoryboardSkillInput,
} from "@/lib/storyboardSkillInput";
import { useTranslation } from "react-i18next";

type SkillInput = Record<string, unknown>;
type StoryboardIdeaExpansion = {
  projectTitle: string;
  videoIdea: string;
  sceneDetail: string;
  customActivity: string;
  customNotes: string;
  dialogueLines: Array<{ speaker: string; text: string; language: string }>;
};
type Model = {
  id: string;
  name: string;
  provider?: string;
  configJson?: unknown;
};
type LlmModel = {
  id: string;
  name: string;
  provider?: string;
  providerDisplayName?: string;
  isDefault?: boolean;
  isRecommended?: boolean;
  sourceType?: string;
};

const STORYBOARD_IDEA_EXPANSION_LIMIT = 5_000;
const STORYBOARD_RECOVERY_STORAGE_KEY = "storyboard-skill-framework:last-run";

function clearStoredStoryboardRunId(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORYBOARD_RECOVERY_STORAGE_KEY);
  }
}

function labelFor(key: string): string {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function skillInputErrorMessage(
  error: unknown,
  isThai: boolean
): string | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (raw.includes("Dialogue story requires at least one dialogue line")) {
    return isThai
      ? "โหมดมีบทพูดต้องมีบทพูดอย่างน้อย 1 บรรทัด"
      : "Dialogue mode requires at least one dialogue line.";
  }
  const match = raw.match(
    /Skill input is (above maximum|below minimum|too long): ([a-zA-Z0-9_]+)/
  );
  if (!match) return null;
  const field = labelFor(match[2]);
  if (isThai) {
    if (match[1] === "above maximum")
      return `${field} สูงเกินค่าที่รองรับ กรุณาตรวจสอบช่วงอายุหรือค่าที่กรอก`;
    if (match[1] === "below minimum")
      return `${field} ต่ำกว่าค่าขั้นต่ำที่รองรับ`;
    return `${field} ยาวเกินขนาดที่รองรับ`;
  }
  if (match[1] === "above maximum")
    return `${field} is above the supported range. Check the value and try again.`;
  if (match[1] === "below minimum")
    return `${field} is below the supported minimum.`;
  return `${field} is longer than the supported limit.`;
}

function ideaExpansionErrorMessage(
  error: unknown,
  isThai: boolean,
  modelName?: string
): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const modelLabel =
    modelName?.trim() || (isThai ? "LLM ที่เลือก" : "the selected LLM");
  if (/network_error|fetch failed|all providers failed/i.test(raw)) {
    return isThai
      ? `เชื่อมต่อ ${modelLabel} ไม่สำเร็จ กรุณาเลือก LLM อื่นที่มีป้าย “แนะนำ” แล้วลองใหม่`
      : `Could not connect to ${modelLabel}. Choose another LLM marked “Recommended” and try again.`;
  }
  if (/no providers available|no structured llm model/i.test(raw)) {
    return isThai
      ? `${modelLabel} ยังไม่พร้อมใช้งาน กรุณาเลือก LLM อื่น`
      : `${modelLabel} is not available. Choose another LLM and try again.`;
  }
  return isThai
    ? "ขยายไอเดียไม่สำเร็จ กรุณาตรวจสอบ LLM ที่เลือกแล้วลองใหม่อีกครั้ง"
    : "Could not expand the idea. Check the selected LLM and try again.";
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
  const llmModelsQuery = trpc.llmProviders.availableModels.useQuery(undefined, {
    staleTime: 300_000,
  });
  const [draftResult, setDraftResult] = useState<{
    projectId: string;
    runId: string;
    confirmationFingerprint: string;
  } | null>(null);
  const charactersQuery =
    trpc.storyboardSkillFramework.getProjectCharacters.useQuery(
      draftResult?.projectId ? { projectId: draftResult.projectId } : undefined,
      {
        staleTime: 60_000,
      }
    );
  const dramaCharactersQuery =
    trpc.storyboardSkillFramework.listDramaCharacterSources.useQuery(
      undefined,
      { staleTime: 60_000 }
    );
  const utils = trpc.useUtils();
  const createDraft = trpc.storyboardSkillFramework.createDraft.useMutation();
  const expandIdea = trpc.storyboardSkillFramework.expandIdea.useMutation();
  const confirmRun =
    trpc.storyboardSkillFramework.confirmAndStart.useMutation();
  const pauseRun = trpc.storyboardSkillFramework.pause.useMutation();
  const resumeRun = trpc.storyboardSkillFramework.resume.useMutation();
  const retryShots = trpc.storyboardSkillFramework.retryShots.useMutation();
  const cancelRun = trpc.storyboardSkillFramework.cancel.useMutation();
  const upload = trpc.ai.upload.useMutation();
  const createCharacter =
    trpc.storyboardSkillFramework.createCharacter.useMutation();
  const renameCharacter =
    trpc.storyboardSkillFramework.renameCharacter.useMutation();
  const addCharacterLook =
    trpc.storyboardSkillFramework.addCharacterLook.useMutation();
  const importDramaCharacter =
    trpc.storyboardSkillFramework.importDramaCharacter.useMutation();
  const saveShotAsCharacter =
    trpc.storyboardSkillFramework.saveShotAsCharacter.useMutation();
  const bindProjectCharacter =
    trpc.storyboardSkillFramework.bindProjectCharacter.useMutation();
  const unbindProjectCharacter =
    trpc.storyboardSkillFramework.unbindProjectCharacter.useMutation();
  const [tab, setTab] = useState<"story" | "characters">("story");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [expandedIdea, setExpandedIdea] =
    useState<StoryboardIdeaExpansion | null>(null);
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
  const [llmModelId, setLlmModelId] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [selectedCharacterLookIds, setSelectedCharacterLookIds] = useState<
    Record<string, string>
  >({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [recoveryChoice, setRecoveryChoice] = useState<
    "new" | "existing" | null
  >(null);
  const [message, setMessage] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );
  const [characterNameDraft, setCharacterNameDraft] = useState("");
  const [lookNameDraft, setLookNameDraft] = useState("");
  const [showDramaPicker, setShowDramaPicker] = useState(false);
  const [lightboxShotNumber, setLightboxShotNumber] = useState<number | null>(
    null
  );
  const [characterCapture, setCharacterCapture] = useState<{
    runId: string;
    shotNumber: number;
    imageAssetId: number;
    imageUrl: string;
    characterId: string;
    name: string;
    role: "portrait" | "look";
  } | null>(null);
  const [selectedDramaSeriesId, setSelectedDramaSeriesId] = useState("");
  const recoverableRunsQuery = trpc.storyboardSkillFramework.listRuns.useQuery(
    { limit: 20 },
    { staleTime: 10_000, refetchOnMount: "always", refetchOnWindowFocus: true }
  );
  const recoverableRuns = useMemo(
    () => filterRecoverableStoryboardRuns(recoverableRunsQuery.data ?? []),
    [recoverableRunsQuery.data]
  );
  const recoveryDialogOpen =
    recoveryChoice === null &&
    recoverableRunsQuery.isFetched &&
    recoverableRuns.length > 0;
  const activeRunId = draftResult?.runId ?? selectedRunId;
  const runQuery = trpc.storyboardSkillFramework.getRun.useQuery(
    { runId: activeRunId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(activeRunId),
      refetchInterval: query => {
        const status = query.state.data?.status;
        const controlPlaneStatus = query.state.data?.controlPlaneJob?.status;
        const operatorReview =
          query.state.data?.controlPlaneJob?.operatorReviewRequired;
        if (
          status === "succeeded" ||
          status === "failed" ||
          status === "paused" ||
          status === "cancel_requested" ||
          status === "cancelled" ||
          controlPlaneStatus === "succeeded" ||
          controlPlaneStatus === "failed" ||
          controlPlaneStatus === "cancelled" ||
          controlPlaneStatus === "expired" ||
          (controlPlaneStatus === "failed" && operatorReview)
        ) {
          return false;
        }
        return activeRunId ? 2500 : false;
      },
    }
  );
  // React Query may retain the previous result while the active run key
  // changes. Never let that stale result render as the new run's review.
  const activeRun =
    activeRunId && runQuery.data?.id === activeRunId ? runQuery.data : null;
  const activeRunCanMutate = Boolean(
    activeRun && isRecoverableStoryboardRun(activeRun)
  );
  const completedImageShots = useMemo(
    () =>
      (activeRun?.shots ?? []).filter(
        shot =>
          shot.status === "succeeded" &&
          Boolean(shot.imageUrl) &&
          !shot.suppressedResult
      ),
    [activeRun?.shots]
  );
  const lightboxIndex = completedImageShots.findIndex(
    shot => shot.shotNumber === lightboxShotNumber
  );
  const lightboxShot =
    lightboxIndex >= 0 ? completedImageShots[lightboxIndex] : null;
  const moveLightbox = (direction: -1 | 1) => {
    if (completedImageShots.length === 0) return;
    const nextIndex =
      (lightboxIndex + direction + completedImageShots.length) %
      completedImageShots.length;
    setLightboxShotNumber(completedImageShots[nextIndex]?.shotNumber ?? null);
  };
  const openCharacterCapture = (shot: {
    shotNumber: number;
    imageAssetId: number | null;
    imageUrl: string | null;
  }) => {
    if (shot.imageAssetId == null || !shot.imageUrl || !activeRunId) return;
    setCharacterCapture({
      runId: activeRunId,
      shotNumber: shot.shotNumber,
      imageAssetId: shot.imageAssetId,
      imageUrl: shot.imageUrl,
      characterId: "__new__",
      name: "",
      role: "portrait",
    });
  };

  useEffect(() => {
    if (!draftResult?.projectId || !charactersQuery.data) return;
    setSelectedCharacters(
      charactersQuery.data
        .filter(character => character.isBoundToProject)
        .map(character => character.id)
    );
    setSelectedCharacterLookIds(
      Object.fromEntries(
        charactersQuery.data
          .filter(
            character => character.isBoundToProject && character.boundLookId
          )
          .map(character => [character.id, character.boundLookId as string])
      )
    );
  }, [draftResult?.projectId, charactersQuery.data]);

  useEffect(() => {
    if (!activeRunId || !activeRun) return;
    if (["succeeded", "cancelled"].includes(activeRun.status)) {
      clearStoredStoryboardRunId();
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORYBOARD_RECOVERY_STORAGE_KEY, activeRunId);
    }
  }, [activeRunId, activeRun]);

  useEffect(() => {
    if (!recoverableRunsQuery.isFetched || recoveryChoice !== null) return;
    if (recoverableRuns.length === 0) {
      clearStoredStoryboardRunId();
      setRecoveryChoice("new");
    }
  }, [recoverableRunsQuery.isFetched, recoverableRuns.length, recoveryChoice]);

  const showMutationError = (error: unknown) => {
    setMessage(
      text(
        "ทำรายการไม่สำเร็จ กรุณาตรวจสอบสถานะงานหรือลองใหม่",
        "The action failed. Check the job status or try again."
      )
    );
  };

  const skills = skillsQuery.data ?? [];
  const selectedSkill =
    skills.find(skill => skill.skillId === selectedSkillId) ?? skills[0];
  const imageModels = ((
    imageModelsQuery.data as { models?: Model[] } | undefined
  )?.models ?? []) as Model[];
  const videoModels = ((
    videoModelsQuery.data as { models?: Model[] } | undefined
  )?.models ?? []) as Model[];
  const llmModels = useMemo(() => {
    const models = (
      (llmModelsQuery.data as { models?: LlmModel[] } | undefined)?.models ?? []
    ).filter(model => model.sourceType !== "worker_app");
    return [...models].sort((left, right) => {
      const recommendationOrder =
        Number(right.isRecommended === true) -
        Number(left.isRecommended === true);
      if (recommendationOrder !== 0) return recommendationOrder;
      const defaultOrder =
        Number(right.isDefault === true) - Number(left.isDefault === true);
      if (defaultOrder !== 0) return defaultOrder;
      return left.name.localeCompare(right.name);
    });
  }, [llmModelsQuery.data]);
  const recommendedLlmModels = llmModels.filter(
    model => model.isRecommended === true
  );
  const otherLlmModels = llmModels.filter(
    model => model.isRecommended !== true
  );
  const selectedLlmModel = llmModels.find(model => model.id === llmModelId);
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
      string[] | undefined) ?? Object.keys(properties);
  const dynamicFields = orderedFields.filter(
    key => properties[key] && !selectedSkill?.parentOwnedFields.includes(key)
  );

  useEffect(() => {
    if (!selectedSkillId && selectedSkill)
      setSelectedSkillId(selectedSkill.skillId);
  }, [selectedSkill, selectedSkillId]);
  useEffect(() => {
    if (!imageModelId && imageModels[0]) {
      const configuredDefault = imageModelsQuery.data?.defaults?.image;
      setImageModelId(
        imageModels.find(model => model.id === configuredDefault)?.id ??
          imageModels[0].id
      );
    }
  }, [imageModelId, imageModels, imageModelsQuery.data?.defaults?.image]);
  useEffect(() => {
    if (!videoModelId && videoModels[0]) {
      const configuredDefault = videoModelsQuery.data?.defaults?.video;
      setVideoModelId(
        videoModels.find(model => model.id === configuredDefault)?.id ??
          videoModels[0].id
      );
    }
  }, [videoModelId, videoModels, videoModelsQuery.data?.defaults?.video]);
  useEffect(() => {
    if (!llmModelId && llmModels.length > 0) {
      setLlmModelId(
        recommendedLlmModels[0]?.id ??
          llmModels.find(model => model.isDefault === true)?.id ??
          llmModels[0].id
      );
    }
  }, [llmModelId, llmModels, recommendedLlmModels]);
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
      setReferences(current =>
        [
          ...current,
          `/api/storage/files/${encodeURIComponent(result.key)}`,
        ].slice(0, 5)
      );
    }
  };
  const getDraftDialogueLines = () => {
    if (storyType === "mime") return [];
    if (dialogueDraft.trim()) {
      return parseDialogueDraft(dialogueDraft, i18n.language);
    }
    return expandedIdea?.dialogueLines ?? [];
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
    dialogueLines: getDraftDialogueLines(),
    characterIds: selectedCharacters,
    characterLookIds: Object.fromEntries(
      Object.entries(selectedCharacterLookIds).filter(([characterId]) =>
        selectedCharacters.includes(characterId)
      )
    ),
    skillInputs: {
      ...skillInputs,
      character_reference_images: references.map(assetId => ({
        asset_id: assetId,
      })),
    },
  });
  const handleCreateDraft = async () => {
    if (
      activeRunCanMutate &&
      !["succeeded", "cancelled"].includes(activeRun?.status ?? "")
    ) {
      setMessage(
        text(
          "กรุณาซ่อมหรือยกเลิกงานเดิมก่อนสร้าง storyboard ใหม่",
          "Repair or cancel the existing storyboard before creating a new one."
        )
      );
      return;
    }
    if (!idea.trim() || !selectedSkill) {
      setMessage(
        text(
          "กรุณากรอกไอเดียและเลือก skill",
          "Enter an idea and choose a skill"
        )
      );
      return;
    }
    if (storyType !== "mime" && getDraftDialogueLines().length === 0) {
      setMessage(
        text(
          "โหมดมีบทพูดต้องมีบทพูดอย่างน้อย 1 บรรทัด",
          "Dialogue mode requires at least one dialogue line."
        )
      );
      return;
    }
    const invalidNumericField = dynamicFields.find(key => {
      const schema = properties[key];
      const value = skillInputs[key];
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      return (
        (typeof schema.minimum === "number" && value < schema.minimum) ||
        (typeof schema.maximum === "number" && value > schema.maximum)
      );
    });
    if (invalidNumericField) {
      const schema = properties[invalidNumericField];
      setMessage(
        text(
          `${labelFor(invalidNumericField)} ต้องอยู่ในช่วง ${schema.minimum ?? "ไม่จำกัด"}–${schema.maximum ?? "ไม่จำกัด"}`,
          `${labelFor(invalidNumericField)} must be between ${schema.minimum ?? "unbounded"} and ${schema.maximum ?? "unbounded"}`
        )
      );
      return;
    }
    setMessage("");
    try {
      const result = await createDraft.mutateAsync({
        idempotencyKey: `ui-${crypto.randomUUID()}`,
        draft: buildDraft(),
      });
      setDraftResult({
        projectId: result.projectId,
        runId: result.runId,
        confirmationFingerprint: result.confirmationFingerprint,
      });
      setSelectedRunId(result.runId);
      setMessage(
        text(
          "บันทึก draft แล้ว ตรวจสอบสรุปก่อนยืนยันสร้าง",
          "Draft saved. Review the estimate before confirming."
        )
      );
    } catch (error) {
      setMessage(
        skillInputErrorMessage(error, isThai) ??
          text(
            "สร้าง draft ไม่สำเร็จ กรุณาตรวจสอบข้อมูลที่กรอกแล้วลองใหม่",
            "Could not create the draft. Check the inputs and try again."
          )
      );
    }
  };
  const handleExpandIdea = async () => {
    if (!selectedSkill) {
      setMessage(
        text(
          "กรุณาเลือก skill ก่อนขยายไอเดีย",
          "Choose a skill before expanding the idea"
        )
      );
      return;
    }
    const sourceIdea = idea.trim();
    if (!sourceIdea) {
      setMessage(
        text(
          "กรุณาใส่ไอเดียก่อนขยายด้วย AI",
          "Enter an idea before expanding it with AI"
        )
      );
      return;
    }
    if (sourceIdea.length > STORYBOARD_IDEA_EXPANSION_LIMIT) {
      setMessage(
        text(
          `ไอเดียยาวเกิน ${STORYBOARD_IDEA_EXPANSION_LIMIT.toLocaleString()} ตัวอักษร กรุณาย่อก่อนขยาย`,
          `Keep the idea under ${STORYBOARD_IDEA_EXPANSION_LIMIT.toLocaleString()} characters before expanding it`
        )
      );
      return;
    }

    setExpandedIdea(null);
    setMessage("");
    try {
      const result = await expandIdea.mutateAsync({
        idempotencyKey: `storyboard-idea-${crypto.randomUUID()}`,
        roughIdea: sourceIdea,
        language: isThai ? "th" : "en",
        storyType,
        totalShots,
        selectedSkillId: selectedSkill.skillId,
        ...(llmModelId ? { llmModelId } : {}),
      });
      setExpandedIdea({
        projectTitle: result.projectTitle,
        videoIdea: result.videoIdea,
        sceneDetail: result.sceneDetail,
        customActivity: result.customActivity,
        customNotes: result.customNotes,
        dialogueLines: result.dialogueLines,
      });
      setMessage(
        text(
          storyType === "mime"
            ? "ขยายไอเดียแล้ว ตรวจสอบข้อมูลทั้ง 5 หัวข้อก่อนนำไปใช้"
            : "ขยายไอเดียแล้ว รวมบทพูดให้ตรวจสอบก่อนนำไปใช้",
          storyType === "mime"
            ? "Idea expanded. Review all five sections before applying it"
            : "Idea expanded with dialogue. Review the script before applying it"
        )
      );
    } catch (error) {
      setMessage(
        ideaExpansionErrorMessage(error, isThai, selectedLlmModel?.name)
      );
    }
  };
  const handleConfirm = async () => {
    if (!draftResult) return;
    try {
      await confirmRun.mutateAsync({
        runId: draftResult.runId,
        confirmationFingerprint: draftResult.confirmationFingerprint,
      });
      await utils.storyboardSkillFramework.getRun.invalidate({
        runId: draftResult.runId,
      });
      setMessage(
        text(
          "เริ่มคิวสร้าง storyboard แล้ว รอ image worker ทำงานต่อ",
          "Storyboard queued; the image worker will continue the run."
        )
      );
    } catch (error) {
      showMutationError(error);
    }
  };

  const handlePause = async () => {
    if (!activeRunId) return;
    try {
      await pauseRun.mutateAsync({ runId: activeRunId });
      await utils.storyboardSkillFramework.getRun.invalidate({
        runId: activeRunId,
      });
      setMessage(
        text(
          "หยุดไว้แล้ว ผลที่มาช้าจะไม่ถูกนำไปใช้ต่อ",
          "Paused. Late provider results will not be used for continuity."
        )
      );
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleResume = async () => {
    if (!activeRunId) return;
    try {
      await resumeRun.mutateAsync({ runId: activeRunId });
      await utils.storyboardSkillFramework.getRun.invalidate({
        runId: activeRunId,
      });
      setMessage(
        text(
          "ทำต่อจากช็อตแรกที่ยังไม่มีภาพที่ใช้ได้",
          "Resumed from the first shot without a valid image."
        )
      );
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleRetry = async (shotNumbers?: number[]) => {
    if (!activeRunId) return;
    try {
      await retryShots.mutateAsync({ runId: activeRunId, shotNumbers });
      await utils.storyboardSkillFramework.getRun.invalidate({
        runId: activeRunId,
      });
      setMessage(
        text(
          "ส่งช็อตที่เลือกกลับไปซ่อมแล้ว",
          "Selected failed shots were queued for repair."
        )
      );
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleLoadRun = (run: {
    runId: string;
    projectId: string;
    confirmationFingerprint: string;
  }) => {
    setRecoveryChoice("existing");
    setDraftResult(run);
    setSelectedRunId(run.runId);
    setMessage(text("โหลดงานเดิมแล้ว", "Existing storyboard job loaded."));
  };

  const handleStartNewStoryboard = () => {
    clearStoredStoryboardRunId();
    setDraftResult(null);
    setSelectedRunId(null);
    setRecoveryChoice("new");
    setMessage("");
  };

  const handleCancel = async (runId = activeRunId) => {
    if (!runId) return;
    try {
      const result = await cancelRun.mutateAsync({ runId });
      const reviewId =
        typeof result === "object" &&
        result !== null &&
        "reviewId" in result &&
        typeof result.reviewId === "number"
          ? result.reviewId
          : null;
      utils.storyboardSkillFramework.listRuns.setData(
        { limit: 20 },
        current => current?.filter(run => run.runId !== runId) ?? []
      );
      await Promise.all([
        utils.storyboardSkillFramework.getRun.invalidate({ runId }),
        utils.storyboardSkillFramework.listRuns.invalidate({ limit: 20 }),
      ]);
      setMessage(
        text(
          reviewId
            ? "ยกเลิกงานแล้ว ภาพที่สำเร็จถูกเก็บไว้ใน Storyboard และช็อตที่เหลือจะไม่ถูกสร้างซ้ำ"
            : "ยกเลิกงานเดิมแล้ว ตอนนี้สร้าง storyboard ใหม่ได้",
          reviewId
            ? "The job was cancelled. Completed images were kept in Storyboard and remaining shots will not be regenerated."
            : "The existing job was cancelled. You can now create a new storyboard."
        )
      );
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error ?? "");
      if (
        /Job cannot be cancelled in its current state|Job changed while requesting cancellation|Job changed while finalizing cancellation/i.test(
          raw
        )
      ) {
        await Promise.all([
          utils.storyboardSkillFramework.getRun.invalidate({ runId }),
          utils.storyboardSkillFramework.listRuns.invalidate({ limit: 20 }),
        ]);
        setMessage(
          text(
            "งานนี้เปลี่ยนสถานะหรือถูกยกเลิกไปแล้ว ระบบรีเฟรชสถานะล่าสุดให้แล้ว",
            "This job changed state or was already cancelled. The latest status has been refreshed."
          )
        );
        return;
      }
      showMutationError(error);
    }
  };

  const replaceCharacterReference = (
    previousAssetIds: Array<string | number | null | undefined>,
    nextAssetId: string | number | null | undefined
  ) => {
    setReferences(current => {
      const previous = new Set(
        previousAssetIds.filter(value => value != null).map(String)
      );
      const next = current.filter(assetId => !previous.has(assetId));
      if (nextAssetId != null && !next.includes(String(nextAssetId))) {
        // Keep the selected character image in the provider payload even when
        // the user already has five manual references. The newest explicit
        // selection wins; the oldest trailing reference is evicted.
        next.unshift(String(nextAssetId));
      }
      return next.slice(0, 5);
    });
  };

  const handleCharacterToggle = async (character: {
    id: string;
    portraitAssetId: number | null;
    looks?: Array<{ id: string; mediaAssetId: number | null }>;
  }) => {
    const characterAssetIds = [
      character.portraitAssetId,
      ...(character.looks ?? []).map(look => look.mediaAssetId),
    ];
    const isSelected = selectedCharacters.includes(character.id);
    const firstImageBackedLook = character.looks?.find(
      look => look.mediaAssetId != null
    );
    const selectedLookId =
      selectedCharacterLookIds[character.id] ?? firstImageBackedLook?.id;
    const selectedLook = character.looks?.find(
      look => look.id === selectedLookId
    );
    const usableAssetId =
      selectedLook?.mediaAssetId ?? character.portraitAssetId;
    if (!isSelected && usableAssetId == null) {
      setMessage(
        text(
          "ตัวละครนี้ยังไม่มีภาพ ใช้ภาพที่สร้างสำเร็จบันทึกเป็น portrait ก่อน",
          "This character has no usable image. Save a completed shot as its portrait first."
        )
      );
      return;
    }
    try {
      if (draftResult?.projectId) {
        if (activeRun?.status !== "awaiting_confirmation") {
          setMessage(
            text(
              "เลือกตัวละครได้เฉพาะตอนกำลังตรวจสอบ draft ก่อนยืนยันสร้าง",
              "Characters can only be changed while the draft is awaiting confirmation."
            )
          );
          return;
        }
        if (isSelected) {
          await unbindProjectCharacter.mutateAsync({
            projectId: draftResult.projectId,
            characterId: character.id,
          });
          setSelectedCharacters(current =>
            current.filter(id => id !== character.id)
          );
          setSelectedCharacterLookIds(current => {
            const next = { ...current };
            delete next[character.id];
            return next;
          });
          replaceCharacterReference(characterAssetIds, null);
        } else {
          await bindProjectCharacter.mutateAsync({
            projectId: draftResult.projectId,
            characterId: character.id,
            ...(selectedLookId ? { lookId: selectedLookId } : {}),
          });
          setSelectedCharacters(current =>
            current.includes(character.id)
              ? current
              : [...current, character.id]
          );
          if (selectedLookId && selectedLook?.mediaAssetId != null) {
            setSelectedCharacterLookIds(current => ({
              ...current,
              [character.id]: selectedLookId,
            }));
          }
          if (usableAssetId != null)
            replaceCharacterReference([], usableAssetId);
        }
        await Promise.all([
          utils.storyboardSkillFramework.getRun.invalidate({
            runId: draftResult.runId,
          }),
          utils.storyboardSkillFramework.getProjectCharacters.invalidate({
            projectId: draftResult.projectId,
          }),
        ]);
      } else {
        setSelectedCharacters(current =>
          isSelected
            ? current.filter(id => id !== character.id)
            : [...current, character.id]
        );
        if (isSelected) {
          setSelectedCharacterLookIds(current => {
            const next = { ...current };
            delete next[character.id];
            return next;
          });
          replaceCharacterReference(characterAssetIds, null);
        } else if (usableAssetId != null) {
          if (selectedLookId && selectedLook?.mediaAssetId != null) {
            setSelectedCharacterLookIds(current => ({
              ...current,
              [character.id]: selectedLookId,
            }));
          }
          replaceCharacterReference([], usableAssetId);
        }
      }
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleCharacterLookChange = async (
    character: {
      id: string;
      portraitAssetId: number | null;
      looks?: Array<{ id: string; mediaAssetId: number | null }>;
    },
    lookId: string
  ) => {
    const nextLookId = lookId || undefined;
    const selectedLook = character.looks?.find(look => look.id === nextLookId);
    const characterAssetIds = [
      character.portraitAssetId,
      ...(character.looks ?? []).map(look => look.mediaAssetId),
    ];
    if (nextLookId && selectedLook?.mediaAssetId == null) {
      setMessage(
        text(
          "Look นี้ยังไม่มีภาพที่ใช้ได้",
          "This look does not have a usable image yet."
        )
      );
      return;
    }
    if (!nextLookId && character.portraitAssetId == null) {
      setMessage(
        text(
          "ตัวละครนี้ต้องเลือก Look ที่มีภาพ",
          "This character must use a look with an image."
        )
      );
      return;
    }
    const nextAssetId = selectedLook?.mediaAssetId ?? character.portraitAssetId;
    try {
      if (draftResult?.projectId) {
        if (
          activeRun?.status !== "awaiting_confirmation" ||
          !selectedCharacters.includes(character.id)
        ) {
          setMessage(
            text(
              "เลือกภาพอ้างอิงได้ก่อนยืนยันสร้างเท่านั้น",
              "Choose a reference image before confirming the draft."
            )
          );
          return;
        }
        await bindProjectCharacter.mutateAsync({
          projectId: draftResult.projectId,
          characterId: character.id,
          ...(nextLookId ? { lookId: nextLookId } : {}),
        });
        await utils.storyboardSkillFramework.getRun.invalidate({
          runId: draftResult.runId,
        });
      }
      setSelectedCharacterLookIds(current => {
        const next = { ...current };
        if (nextLookId) next[character.id] = nextLookId;
        else delete next[character.id];
        return next;
      });
      replaceCharacterReference(characterAssetIds, nextAssetId);
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleSaveShotAsCharacter = async () => {
    if (!characterCapture) return;
    const isNewCharacter = characterCapture.characterId === "__new__";
    if (isNewCharacter && !characterCapture.name.trim()) {
      setMessage(text("กรุณาระบุชื่อตัวละคร", "Enter a character name."));
      return;
    }
    if (
      !isNewCharacter &&
      characterCapture.role === "look" &&
      !characterCapture.name.trim()
    ) {
      setMessage(text("กรุณาระบุชื่อ Look", "Enter a look name."));
      return;
    }
    try {
      const result = await saveShotAsCharacter.mutateAsync({
        runId: characterCapture.runId,
        shotNumber: characterCapture.shotNumber,
        ...(isNewCharacter
          ? {}
          : { characterId: characterCapture.characterId }),
        ...(isNewCharacter
          ? { characterName: characterCapture.name.trim() }
          : {}),
        role: characterCapture.role,
        ...(characterCapture.role === "look"
          ? { lookName: characterCapture.name.trim() }
          : {}),
      });
      const character = charactersQuery.data?.find(
        item => item.id === result.characterId
      );
      setSelectedCharacters(current =>
        current.includes(result.characterId)
          ? current
          : [...current, result.characterId]
      );
      if (result.role === "look" && result.lookId) {
        setSelectedCharacterLookIds(current => ({
          ...current,
          [result.characterId]: result.lookId as string,
        }));
      } else {
        setSelectedCharacterLookIds(current => {
          const next = { ...current };
          delete next[result.characterId];
          return next;
        });
      }
      replaceCharacterReference(
        [
          character?.portraitAssetId,
          ...(character?.looks ?? []).map(look => look.mediaAssetId),
        ],
        result.mediaAssetId
      );
      if (
        draftResult?.projectId &&
        activeRun?.status === "awaiting_confirmation"
      ) {
        await bindProjectCharacter.mutateAsync({
          projectId: draftResult.projectId,
          characterId: result.characterId,
          ...(result.lookId ? { lookId: result.lookId } : {}),
        });
        await utils.storyboardSkillFramework.getRun.invalidate({
          runId: draftResult.runId,
        });
      }
      await utils.storyboardSkillFramework.getProjectCharacters.invalidate(
        draftResult?.projectId
          ? { projectId: draftResult.projectId }
          : undefined
      );
      setCharacterCapture(null);
      setMessage(
        text(
          result.role === "portrait"
            ? "บันทึกภาพเป็น portrait ของตัวละครแล้ว"
            : "บันทึกภาพเป็น look ของตัวละครแล้ว",
          result.role === "portrait"
            ? "Saved the image as the character portrait."
            : "Saved the image as a character look."
        )
      );
    } catch (error) {
      showMutationError(error);
    }
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
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="storyboard-video-idea"
                    className="text-sm font-medium"
                  >
                    {text("ไอเดียสำหรับวีดีโอ", "Video idea")}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => void handleExpandIdea()}
                    disabled={
                      expandIdea.isPending ||
                      !selectedSkill ||
                      !idea.trim() ||
                      idea.trim().length > STORYBOARD_IDEA_EXPANSION_LIMIT
                    }
                    aria-describedby="storyboard-idea-expansion-help"
                  >
                    {expandIdea.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {expandIdea.isPending
                      ? text("กำลังขยายไอเดีย…", "Expanding idea…")
                      : text("ขยายไอเดียด้วย AI", "Expand idea with AI")}
                  </Button>
                </div>
                <label
                  htmlFor="storyboard-expansion-llm"
                  className="block space-y-1 text-sm font-medium"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {text("LLM สำหรับขยายไอเดีย", "LLM for idea expansion")}
                    {selectedLlmModel?.isRecommended ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {text("แนะนำ", "Recommended")}
                      </span>
                    ) : null}
                  </span>
                  <select
                    id="storyboard-expansion-llm"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={llmModelId}
                    onChange={event => setLlmModelId(event.target.value)}
                    disabled={
                      llmModelsQuery.isLoading || llmModels.length === 0
                    }
                  >
                    {llmModels.length === 0 ? (
                      <option value="">
                        {llmModelsQuery.isLoading
                          ? text("กำลังโหลดรายการ LLM…", "Loading LLM models…")
                          : text(
                              "ใช้โมเดลอัตโนมัติของระบบ",
                              "Use the system automatic model"
                            )}
                      </option>
                    ) : null}
                    {recommendedLlmModels.length > 0 ? (
                      <optgroup
                        label={text("LLM ที่แนะนำ", "Recommended LLMs")}
                      >
                        {recommendedLlmModels.map(model => (
                          <option key={model.id} value={model.id}>
                            ★ {model.name} ·{" "}
                            {model.providerDisplayName ??
                              model.provider ??
                              model.id}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {otherLlmModels.length > 0 ? (
                      <optgroup
                        label={text(
                          "LLM อื่นที่ใช้งานได้",
                          "Other available LLMs"
                        )}
                      >
                        {otherLlmModels.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name} ·{" "}
                            {model.providerDisplayName ??
                              model.provider ??
                              model.id}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <span className="block text-xs font-normal text-slate-500">
                    {text(
                      "ระบบเลือกโมเดลที่มีป้าย แนะนำ เป็นค่าเริ่มต้น คุณเปลี่ยนได้หากผู้ให้บริการเดิมเชื่อมต่อไม่ได้",
                      "A Recommended model is selected by default. Choose another one if the current provider is unavailable."
                    )}
                  </span>
                </label>
                <Textarea
                  id="storyboard-video-idea"
                  value={idea}
                  onChange={event => {
                    setIdea(event.target.value);
                    setExpandedIdea(null);
                  }}
                  rows={5}
                  placeholder={text(
                    "เล่าเรื่องที่ต้องการทำ ทั้งแบบละครใบ้หรือมีบทพูดได้",
                    "Describe the story; mime or dialogue are both supported"
                  )}
                />
                <div
                  id="storyboard-idea-expansion-help"
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
                >
                  <span>
                    {text(
                      "ระบบจะแสดง preview ก่อน คุณเลือกใช้เองได้ และการขยายจะใช้เครดิต",
                      "A preview appears first; you choose whether to apply it. AI expansion uses credits"
                    )}
                  </span>
                  <span
                    className={
                      idea.length > STORYBOARD_IDEA_EXPANSION_LIMIT
                        ? "font-medium text-red-600"
                        : undefined
                    }
                  >
                    {idea.length.toLocaleString()}/
                    {STORYBOARD_IDEA_EXPANSION_LIMIT.toLocaleString()}
                  </span>
                </div>
                {expandedIdea ? (
                  <section
                    className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3"
                    aria-label={text(
                      "preview ไอเดียที่ขยายแล้ว",
                      "Expanded idea preview"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-sky-950">
                        {text(
                          "ข้อมูลไอเดียที่ขยายแล้ว",
                          "Expanded idea fields"
                        )}
                      </h3>
                      <span className="text-xs text-sky-700">
                        {storyType === "mime"
                          ? text(
                              "ครบ 5 หัวข้อ · ตรวจสอบก่อนใช้",
                              "5 sections · Review before applying"
                            )
                          : text(
                              "ครบ 6 หัวข้อ · รวมบทพูด · ตรวจสอบก่อนใช้",
                              "6 sections including dialogue · Review before applying"
                            )}
                      </span>
                    </div>
                    <label className="space-y-1 text-sm font-medium">
                      {text("1. ชื่อโปรเจกต์", "1. Project title")}
                      <Input
                        value={expandedIdea.projectTitle}
                        onChange={event =>
                          setExpandedIdea(current =>
                            current
                              ? { ...current, projectTitle: event.target.value }
                              : current
                          )
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      {text("2. ไอเดียสำหรับวีดีโอ", "2. Video idea")}
                      <Textarea
                        value={expandedIdea.videoIdea}
                        onChange={event =>
                          setExpandedIdea(current =>
                            current
                              ? { ...current, videoIdea: event.target.value }
                              : current
                          )
                        }
                        rows={5}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-medium">
                        {text("3. Scene Detail", "3. Scene Detail")}
                        <Textarea
                          value={expandedIdea.sceneDetail}
                          onChange={event =>
                            setExpandedIdea(current =>
                              current
                                ? {
                                    ...current,
                                    sceneDetail: event.target.value,
                                  }
                                : current
                            )
                          }
                          rows={4}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium">
                        {text("4. Custom Activity", "4. Custom Activity")}
                        <Textarea
                          value={expandedIdea.customActivity}
                          onChange={event =>
                            setExpandedIdea(current =>
                              current
                                ? {
                                    ...current,
                                    customActivity: event.target.value,
                                  }
                                : current
                            )
                          }
                          rows={4}
                        />
                      </label>
                    </div>
                    <label className="space-y-1 text-sm font-medium">
                      {text("5. Custom Notes", "5. Custom Notes")}
                      <Textarea
                        value={expandedIdea.customNotes}
                        onChange={event =>
                          setExpandedIdea(current =>
                            current
                              ? { ...current, customNotes: event.target.value }
                              : current
                          )
                        }
                        rows={5}
                      />
                    </label>
                    {storyType !== "mime" ? (
                      <label className="space-y-1 text-sm font-medium">
                        {text("6. บทพูด", "6. Dialogue")}
                        <Textarea
                          value={expandedIdea.dialogueLines
                            .map(line => `${line.speaker}: ${line.text}`)
                            .join("\n")}
                          onChange={event =>
                            setExpandedIdea(current =>
                              current
                                ? {
                                    ...current,
                                    dialogueLines: parseDialogueDraft(
                                      event.target.value,
                                      i18n.language
                                    ),
                                  }
                                : current
                            )
                          }
                          rows={5}
                          placeholder={text(
                            "ตัวละคร: ข้อความบทพูด",
                            "Character: dialogue line"
                          )}
                        />
                      </label>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedIdea(null)}
                      >
                        {text("ไม่ใช้", "Discard")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (
                            !expandedIdea.projectTitle.trim() ||
                            !expandedIdea.videoIdea.trim() ||
                            !expandedIdea.sceneDetail.trim() ||
                            !expandedIdea.customActivity.trim() ||
                            !expandedIdea.customNotes.trim() ||
                            (storyType !== "mime" &&
                              expandedIdea.dialogueLines.length === 0)
                          )
                            return;
                          if (!title.trim())
                            setTitle(expandedIdea.projectTitle.trim());
                          setIdea(expandedIdea.videoIdea.trim());
                          setSkillInputs(current => ({
                            ...current,
                            ...(properties.scene_detail
                              ? {
                                  scene_detail: expandedIdea.sceneDetail.trim(),
                                }
                              : {}),
                            ...(properties.custom_activity
                              ? {
                                  custom_activity:
                                    expandedIdea.customActivity.trim(),
                                }
                              : {}),
                            ...(properties.custom_notes
                              ? {
                                  custom_notes: expandedIdea.customNotes.trim(),
                                }
                              : {}),
                          }));
                          if (storyType !== "mime") {
                            setDialogueDraft(
                              expandedIdea.dialogueLines
                                .map(line => `${line.speaker}: ${line.text}`)
                                .join("\n")
                            );
                          }
                          setExpandedIdea(null);
                          setMessage(
                            text(
                              storyType === "mime"
                                ? "นำข้อมูลทั้ง 5 หัวข้อไปใส่ในช่องที่ตรงกันแล้ว"
                                : "นำข้อมูลทั้ง 6 หัวข้อ รวมบทพูด ไปใส่ในช่องที่ตรงกันแล้ว",
                              storyType === "mime"
                                ? "All five sections were mapped to their matching fields"
                                : "All six sections, including dialogue, were mapped to the draft"
                            )
                          );
                        }}
                        disabled={
                          !expandedIdea.projectTitle.trim() ||
                          !expandedIdea.videoIdea.trim() ||
                          !expandedIdea.sceneDetail.trim() ||
                          !expandedIdea.customActivity.trim() ||
                          !expandedIdea.customNotes.trim() ||
                          (storyType !== "mime" &&
                            expandedIdea.dialogueLines.length === 0)
                        }
                      >
                        <Check className="mr-2 h-4 w-4" />
                        {text("ใช้ไอเดียนี้", "Use this idea")}
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
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
                  onChange={event => {
                    setSelectedSkillId(event.target.value);
                    setExpandedIdea(null);
                  }}
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
                      const isNumericInput =
                        isNumericStoryboardSkillInput(schema);
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
                          ) : isNumericInput ? (
                            <Input
                              type="number"
                              min={
                                typeof schema.minimum === "number"
                                  ? schema.minimum
                                  : undefined
                              }
                              max={
                                typeof schema.maximum === "number"
                                  ? schema.maximum
                                  : undefined
                              }
                              step={
                                Array.isArray(schema.type) &&
                                schema.type.includes("integer")
                                  ? 1
                                  : undefined
                              }
                              value={String(
                                skillInputs[key] ?? schema.default ?? ""
                              )}
                              onChange={event =>
                                setSkillValue(
                                  key,
                                  coerceStoryboardSkillInputValue(
                                    schema,
                                    event.target.value
                                  )
                                )
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
                          {typeof schema.description === "string" ? (
                            <span className="block text-xs font-normal text-slate-500">
                              {schema.description}
                            </span>
                          ) : null}
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
                  "กดเลือกตัวละครเพื่อใช้เป็นภาพอ้างอิงใน storyboard; ภาพที่สร้างเสร็จแล้วกด ‘บันทึกเป็นตัวละคร’ ได้จากรายการผลลัพธ์",
                  "Select a character to use as a storyboard reference. Completed shots can be saved from the result list."
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
              {charactersQuery.isLoading ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  {text(
                    "กำลังโหลด Character Library...",
                    "Loading Character Library..."
                  )}
                </p>
              ) : null}
              {charactersQuery.isError ? (
                <p
                  role="alert"
                  className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {text(
                    "โหลดตัวละครไม่สำเร็จ ลองรีเฟรชแล้วตรวจสอบอีกครั้ง",
                    "Characters could not be loaded. Refresh and try again."
                  )}
                </p>
              ) : null}
              {!charactersQuery.isLoading &&
              !charactersQuery.isError &&
              (charactersQuery.data ?? []).length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  {text(
                    "ยังไม่มีตัวละครที่ใช้ได้ สร้างตัวละครหรือบันทึกภาพสำเร็จจากผลลัพธ์ก่อน",
                    "No usable characters yet. Create one or save a completed result first."
                  )}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {(charactersQuery.data ?? []).map(character => (
                  <div
                    key={character.id}
                    className={`rounded-xl border p-3 ${selectedCharacters.includes(character.id) ? "border-sky-500 bg-sky-50" : "bg-white"}`}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedCharacters.includes(character.id)}
                        disabled={
                          (character.portraitAssetId == null &&
                            !(character.looks ?? []).some(
                              look => look.mediaAssetId != null
                            )) ||
                          bindProjectCharacter.isPending ||
                          unbindProjectCharacter.isPending
                        }
                        onChange={() => void handleCharacterToggle(character)}
                        aria-label={text(
                          `เลือกตัวละคร ${character.name}`,
                          `Select ${character.name}`
                        )}
                      />{" "}
                      <span className="min-w-0 flex-1 font-medium">
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
                        {character.portraitAssetId == null &&
                        !(character.looks ?? []).some(
                          look => look.mediaAssetId != null
                        ) ? (
                          <span className="mt-1 block text-xs text-amber-700">
                            {text(
                              "ยังไม่มีภาพ ใช้ภาพช็อตที่สร้างสำเร็จบันทึกเป็น Portrait ก่อน",
                              "No usable image yet. Save a completed shot as a portrait first."
                            )}
                          </span>
                        ) : null}
                        {character.isBoundToProject ? (
                          <span className="mt-1 block text-xs font-semibold text-emerald-700">
                            {text(
                              "เลือกใช้ในโปรเจกต์นี้แล้ว",
                              "Selected for this project"
                            )}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {selectedCharacters.includes(character.id) ? (
                      <label className="mt-3 block text-xs font-medium text-slate-600">
                        {text(
                          "ภาพที่จะใช้กับตัวละครนี้",
                          "Image used for this character"
                        )}
                        <select
                          className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm"
                          value={
                            selectedCharacterLookIds[character.id] ??
                            (character.portraitAssetId == null
                              ? (character.looks?.find(
                                  look => look.mediaAssetId != null
                                )?.id ?? "")
                              : "")
                          }
                          onChange={event =>
                            void handleCharacterLookChange(
                              character,
                              event.target.value
                            )
                          }
                          disabled={
                            Boolean(
                              draftResult &&
                              activeRun?.status !== "awaiting_confirmation"
                            ) ||
                            bindProjectCharacter.isPending ||
                            unbindProjectCharacter.isPending
                          }
                        >
                          {character.portraitAssetId != null ? (
                            <option value="">
                              {text("Portrait หลัก", "Main portrait")}
                            </option>
                          ) : null}
                          {(character.looks ?? []).map(look => (
                            <option
                              key={look.id}
                              value={look.id}
                              disabled={look.mediaAssetId == null}
                            >
                              {text("Look: ", "Look: ")}
                              {look.name}
                              {look.mediaAssetId == null
                                ? text(" (ยังไม่มีภาพ)", " (no image)")
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {(character.looks ?? []).length > 0 ? (
                      <div
                        className="mt-3 flex gap-2 overflow-x-auto pb-1"
                        aria-label={text("ลุคของตัวละคร", "Character looks")}
                      >
                        {(character.looks ?? []).map(look => (
                          <div key={look.id} className="shrink-0 text-center">
                            {look.url ? (
                              <img
                                src={look.url}
                                alt={look.name}
                                className="h-12 w-10 rounded object-cover"
                              />
                            ) : (
                              <span className="flex h-12 w-10 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                                {text("ไม่มีภาพ", "No image")}
                              </span>
                            )}
                            <span className="mt-1 block max-w-16 truncate text-[10px] text-slate-500">
                              {look.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                            await utils.storyboardSkillFramework.getProjectCharacters.invalidate(
                              draftResult?.projectId
                                ? { projectId: draftResult.projectId }
                                : undefined
                            );
                            setLookNameDraft("");
                            setEditingCharacterId(null);
                          }
                        }}
                      />
                      <span className="self-center text-xs text-slate-400">
                        {text(
                          "ลุคที่มีภาพให้เลือกจากรายการด้านบน",
                          "Image-backed looks appear above"
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
          <p className="rounded-lg bg-sky-50 p-3 text-xs leading-5 text-sky-800">
            {text(
              "ทุกช็อตจะสร้างเป็นภาพเดี่ยวแนวตั้ง 9:16 เท่านั้น ไม่มี collage, grid หรือหลายภาพในเฟรมเดียว และภาพที่ได้จะถูกใช้เป็น Start Frame สำหรับวีดีโอของช็อตนั้น",
              "Every shot is generated as one single vertical 9:16 image only—never a collage, grid, or multi-panel frame. The image becomes that shot's video Start Frame."
            )}
          </p>
          <Dialog
            open={recoveryDialogOpen}
            onOpenChange={open => {
              if (!open && recoveryChoice === null) {
                handleStartNewStoryboard();
              }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {text(
                    "พบงาน storyboard ที่ยังไม่จบ",
                    "Unfinished storyboard jobs found"
                  )}
                </DialogTitle>
                <DialogDescription>
                  {text(
                    "เลือกให้ชัดเจนว่าจะสร้างงานใหม่ หรือกลับไปดูงานเดิม งานที่ยกเลิกแล้วจะไม่ถูกเสนอให้ซ่อม",
                    "Choose whether to create a new storyboard or continue an existing job. Cancelled jobs are not offered for repair."
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {recoverableRuns.map(run => (
                  <div
                    key={run.runId}
                    className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {run.projectTitle}
                      </p>
                      <p className="text-xs text-slate-500">
                        {run.status} · {run.shots.completed}/{run.shots.total}{" "}
                        {text("ช็อตสำเร็จ", "shots completed")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleLoadRun(run)}
                    >
                      {text("ดูงานนี้", "View job")}
                    </Button>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStartNewStoryboard}
                >
                  {text("สร้าง storyboard ใหม่", "Create new storyboard")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {message ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {message}
            </p>
          ) : null}
          {recoverableRuns.length > 0 ? (
            <section
              className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3"
              aria-label={text(
                "งาน storyboard ที่กู้คืนได้",
                "Recoverable storyboard jobs"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {text("งานที่ยังไม่จบ", "Unfinished jobs")}
                </h3>
                <span className="text-xs text-slate-500">
                  {recoverableRuns.length}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {text(
                  "งานจะไม่หายเมื่อ refresh เลือกโหลดงานเดิมเพื่อทำต่อหรือซ่อมได้",
                  "Jobs remain available after refresh. Load one to continue or repair it."
                )}
              </p>
              <ul className="space-y-2">
                {recoverableRuns.slice(0, 5).map(run => (
                  <li
                    key={run.runId}
                    className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {run.projectTitle}
                      </span>
                      <span className="block text-slate-500">
                        {run.status} · {run.shots.completed}/{run.shots.total}{" "}
                        {text("ช็อต", "shots")}
                      </span>
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          activeRunId === run.runId ? "secondary" : "outline"
                        }
                        onClick={() => handleLoadRun(run)}
                      >
                        {activeRunId === run.runId
                          ? text("เปิดอยู่", "Loaded")
                          : text("โหลด", "Load")}
                      </Button>
                      {!["cancelled", "succeeded"].includes(run.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleCancel(run.runId)}
                          disabled={cancelRun.isPending}
                        >
                          {text("ยกเลิก", "Cancel")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {runQuery.error ? (
            <p
              role="alert"
              className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900"
            >
              {text(
                "ไม่สามารถโหลดสถานะงานล่าสุดได้ ระบบจะลองเชื่อมต่อใหม่อัตโนมัติ",
                "The latest job status could not be loaded. We will retry automatically."
              )}
            </p>
          ) : null}
          {activeRun ? (
            <section
              className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3"
              aria-label={text(
                "ผลการสร้าง storyboard",
                "Storyboard generation review"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {text("ตรวจสอบผลลัพธ์", "Review results")}
                </h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-sky-700">
                  {activeRun.controlPlaneJob?.status ?? activeRun.status}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {text(
                  "สร้างตามลำดับทีละช็อต ภาพที่สำเร็จแล้วจะไม่ถูกสร้างซ้ำ",
                  "Shots run sequentially; valid completed images are never regenerated."
                )}
              </p>
              {activeRun.error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800"
                >
                  <span className="font-semibold">{activeRun.error.code}</span>
                  {activeRun.error.detail || activeRun.error.message
                    ? ` — ${activeRun.error.detail || activeRun.error.message}`
                    : null}
                </p>
              ) : null}
              {activeRun.controlPlaneJob?.operatorReviewRequired ? (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
                >
                  {text(
                    "งานหยุดเพื่อรอการตรวจสอบจากผู้ใช้",
                    "The canonical job is held for operator review."
                  )}
                  {activeRun.controlPlaneJob.operatorReviewReason
                    ? ` — ${activeRun.controlPlaneJob.operatorReviewReason}`
                    : null}
                </p>
              ) : null}
              {activeRun.controlPlaneJob ? (
                <details className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    {text(
                      "รายละเอียดการกู้คืนและ timeline",
                      "Recovery details and timeline"
                    )}
                  </summary>
                  <div className="mt-2 space-y-1 text-slate-600">
                    <p>
                      {text("attempt", "Attempt")}:{" "}
                      {activeRun.controlPlaneJob.attempt}/
                      {activeRun.controlPlaneJob.maxAttempts}
                      {activeRun.controlPlaneJob.errorCode
                        ? ` · ${activeRun.controlPlaneJob.errorCode}`
                        : ""}
                    </p>
                    {activeRun.controlPlaneJob.progressJson?.stage ? (
                      <p>
                        {text("ขั้นตอนล่าสุด", "Last stage")}:{" "}
                        {String(activeRun.controlPlaneJob.progressJson.stage)}
                        {activeRun.controlPlaneJob.progressJson.message
                          ? ` — ${String(activeRun.controlPlaneJob.progressJson.message)}`
                          : ""}
                      </p>
                    ) : null}
                    <ol className="max-h-48 space-y-1 overflow-auto border-t border-slate-100 pt-1">
                      {activeRun.controlPlaneEvents.map(event => (
                        <li
                          key={`${event.eventSequence ?? "na"}-${event.eventType}-${event.createdAt}`}
                        >
                          <span className="font-medium">
                            {event.eventSequence ?? "?"}. {event.eventType}
                          </span>
                          <span className="ml-1 text-slate-400">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              ) : null}
              <ol className="space-y-2">
                {activeRun.shots.map(shot => (
                  <li
                    key={shot.id}
                    className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs"
                  >
                    {shot.status === "succeeded" &&
                    shot.imageUrl &&
                    !shot.suppressedResult ? (
                      <button
                        type="button"
                        className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
                        onClick={() => setLightboxShotNumber(shot.shotNumber)}
                        aria-label={text(
                          `เปิดดูภาพช็อต ${shot.shotNumber}`,
                          `View shot ${shot.shotNumber}`
                        )}
                      >
                        <img
                          src={shot.imageUrl}
                          alt={text(
                            `ภาพช็อต ${shot.shotNumber}`,
                            `Shot ${shot.shotNumber}`
                          )}
                          className="h-10 w-8 rounded object-cover"
                        />
                      </button>
                    ) : (
                      <span className="h-10 w-8 rounded bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {text("ช็อต", "Shot")} {shot.shotNumber} · {shot.beat}
                      </span>
                      <span className="block truncate text-slate-500">
                        {shot.status}
                      </span>
                      {shot.error?.detail || shot.error?.message ? (
                        <span
                          className="block truncate text-rose-700"
                          title={shot.error.detail || shot.error.message}
                        >
                          {shot.error.detail || shot.error.message}
                        </span>
                      ) : null}
                    </span>
                    {shot.status === "succeeded" &&
                    shot.imageUrl &&
                    shot.imageAssetId != null &&
                    !shot.suppressedResult ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openCharacterCapture(shot)}
                        aria-label={text(
                          `บันทึกภาพช็อต ${shot.shotNumber} เป็นตัวละคร`,
                          `Save shot ${shot.shotNumber} as a character`
                        )}
                      >
                        <BookmarkPlus className="mr-1 h-4 w-4" />
                        {text("บันทึกเป็นตัวละคร", "Save as character")}
                      </Button>
                    ) : null}
                    {activeRunCanMutate &&
                    (shot.status === "failed" || shot.status === "partial") ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRetry([shot.shotNumber])}
                      >
                        {shot.error?.class === "unknown"
                          ? text("ยืนยันซ่อม", "Repair explicitly")
                          : text("ซ่อม", "Repair")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
              {activeRun.error?.class === "unknown" ||
              activeRun.shots.some(shot => shot.error?.class === "unknown") ? (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900"
                >
                  {text(
                    "มีผลลัพธ์จาก provider ที่ยังยืนยันไม่ได้ ระบบจะไม่ทำซ้ำอัตโนมัติ ให้กดยืนยันซ่อมช็อตนี้ หรือยกเลิกงานเดิม",
                    "A provider result is ambiguous. It will not retry automatically; explicitly repair this shot or cancel the job."
                  )}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {activeRunCanMutate &&
                (activeRun.status === "paused" ||
                  activeRun.status === "partial") &&
                !activeRun.shots.some(
                  shot => shot.error?.class === "unknown"
                ) &&
                activeRun.error?.class !== "unknown" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleResume()}
                    disabled={resumeRun.isPending}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    {text("ทำต่อ", "Continue")}
                  </Button>
                ) : activeRunCanMutate &&
                  (activeRun.status === "queued" ||
                    activeRun.status === "running") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handlePause()}
                    disabled={pauseRun.isPending}
                  >
                    <X className="mr-1 h-4 w-4" />
                    {text("หยุด", "Stop")}
                  </Button>
                ) : null}
                {activeRunCanMutate &&
                !["succeeded", "cancel_requested", "cancelled"].includes(
                  activeRun.status
                ) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleCancel()}
                    disabled={cancelRun.isPending}
                  >
                    <X className="mr-1 h-4 w-4" />
                    {text("ยกเลิกงานเดิม", "Cancel job")}
                  </Button>
                ) : null}
                {activeRunCanMutate &&
                activeRun.shots.some(
                  shot => shot.status === "failed" || shot.status === "partial"
                ) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRetry()}
                    disabled={retryShots.isPending}
                  >
                    {text("ซ่อมทุกช็อตที่ล้มเหลว", "Repair all failed shots")}
                  </Button>
                ) : null}
              </div>
              <Dialog
                open={Boolean(lightboxShot)}
                onOpenChange={open => {
                  if (!open) setLightboxShotNumber(null);
                }}
              >
                <DialogContent className="max-w-4xl border-slate-700 bg-slate-950 p-3 text-white sm:p-5">
                  <DialogTitle className="sr-only">
                    {lightboxShot
                      ? text(
                          `ภาพตัวอย่างช็อต ${lightboxShot.shotNumber}`,
                          `Shot ${lightboxShot.shotNumber} preview`
                        )
                      : text("ภาพตัวอย่าง", "Image preview")}
                  </DialogTitle>
                  {lightboxShot?.imageUrl ? (
                    <div className="relative flex min-h-[50vh] items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="absolute left-1 z-10 border-slate-600 bg-slate-900/80 text-white hover:bg-slate-800"
                        onClick={() => moveLightbox(-1)}
                        aria-label={text("ภาพก่อนหน้า", "Previous image")}
                        disabled={completedImageShots.length < 2}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <img
                        src={lightboxShot.imageUrl}
                        alt={text(
                          `ภาพช็อต ${lightboxShot.shotNumber}`,
                          `Shot ${lightboxShot.shotNumber}`
                        )}
                        className="max-h-[75vh] max-w-full rounded-lg object-contain"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="absolute right-1 z-10 border-slate-600 bg-slate-900/80 text-white hover:bg-slate-800"
                        onClick={() => moveLightbox(1)}
                        aria-label={text("ภาพถัดไป", "Next image")}
                        disabled={completedImageShots.length < 2}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                      <p className="absolute bottom-1 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-slate-200">
                        {text("ช็อต", "Shot")} {lightboxShot.shotNumber} ·{" "}
                        {lightboxIndex + 1}/{completedImageShots.length}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="absolute bottom-1 right-2"
                        onClick={() => {
                          openCharacterCapture(lightboxShot);
                          setLightboxShotNumber(null);
                        }}
                      >
                        <BookmarkPlus className="mr-1 h-4 w-4" />
                        {text("บันทึกเป็นตัวละคร", "Save as character")}
                      </Button>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>
            </section>
          ) : null}
          {draftResult ? (
            activeRun?.status === "awaiting_confirmation" || !activeRun ? (
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
            ) : ["succeeded", "cancelled"].includes(activeRun?.status ?? "") ? (
              <div className="space-y-2">
                {activeRun.reviewId ? (
                  <Button
                    className="w-full"
                    onClick={() =>
                      setLocation(`/storyboard-review/${activeRun.reviewId}`)
                    }
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {activeRun.status === "cancelled"
                      ? text(
                          "เปิด Storyboard บางส่วน",
                          "Open partial Storyboard"
                        )
                      : text("เปิดในหน้า Storyboard", "Open in Storyboard")}
                  </Button>
                ) : null}
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setDraftResult(null);
                    setSelectedRunId(null);
                    if (typeof window !== "undefined") {
                      window.localStorage.removeItem(
                        STORYBOARD_RECOVERY_STORAGE_KEY
                      );
                    }
                  }}
                >
                  {text("สร้าง storyboard ใหม่", "Create a new storyboard")}
                </Button>
              </div>
            ) : null
          ) : (
            <Button
              className="w-full"
              onClick={() => void handleCreateDraft()}
              disabled={
                createDraft.isPending ||
                expandIdea.isPending ||
                skillsQuery.isLoading
              }
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
      <Dialog
        open={Boolean(characterCapture)}
        onOpenChange={open => {
          if (!open && !saveShotAsCharacter.isPending)
            setCharacterCapture(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {text("บันทึกภาพเป็นตัวละคร", "Save image as character")}
          </DialogTitle>
          {characterCapture ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <img
                  src={characterCapture.imageUrl}
                  alt={text(
                    `ภาพช็อต ${characterCapture.shotNumber}`,
                    `Shot ${characterCapture.shotNumber}`
                  )}
                  className="h-24 w-16 rounded object-cover"
                />
                <p className="text-sm text-slate-600">
                  {text(
                    "ภาพนี้เป็นภาพที่สร้างสำเร็จและตรวจสอบได้แล้ว จึงนำเข้าคลังตัวละครได้",
                    "This completed, verified shot can now be added to the Character Library."
                  )}
                </p>
              </div>
              <label className="block space-y-1 text-sm font-medium">
                {text("บันทึกให้ตัวละคร", "Save to character")}
                <select
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={characterCapture.characterId}
                  onChange={event =>
                    setCharacterCapture(current =>
                      current
                        ? {
                            ...current,
                            characterId: event.target.value,
                            role:
                              event.target.value === "__new__"
                                ? "portrait"
                                : current.role,
                            name: "",
                          }
                        : current
                    )
                  }
                >
                  <option value="__new__">
                    {text("สร้างตัวละครใหม่", "Create a new character")}
                  </option>
                  {(charactersQuery.data ?? []).map(character => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                {text("ประเภทภาพ", "Image role")}
                <select
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={characterCapture.role}
                  disabled={characterCapture.characterId === "__new__"}
                  onChange={event =>
                    setCharacterCapture(current =>
                      current
                        ? {
                            ...current,
                            role: event.target.value as "portrait" | "look",
                            name: "",
                          }
                        : current
                    )
                  }
                >
                  <option value="portrait">
                    {text("Portrait — ภาพหลัก", "Portrait — main image")}
                  </option>
                  <option value="look">
                    {text("Look — ลุคเพิ่มเติม", "Look — additional look")}
                  </option>
                </select>
                {characterCapture.characterId === "__new__" ? (
                  <span className="block text-xs font-normal text-slate-500">
                    {text(
                      "ตัวละครใหม่เริ่มจากภาพหลักก่อน แล้วค่อยเพิ่ม Look ได้ภายหลัง",
                      "A new character starts with a portrait; add looks later."
                    )}
                  </span>
                ) : null}
              </label>
              {characterCapture.characterId === "__new__" ||
              characterCapture.role === "look" ? (
                <label className="block space-y-1 text-sm font-medium">
                  {characterCapture.characterId === "__new__"
                    ? text("ชื่อตัวละคร", "Character name")
                    : text("ชื่อ Look", "Look name")}
                  <Input
                    autoFocus
                    value={characterCapture.name}
                    onChange={event =>
                      setCharacterCapture(current =>
                        current
                          ? { ...current, name: event.target.value }
                          : current
                      )
                    }
                    placeholder={
                      characterCapture.characterId === "__new__"
                        ? text("เช่น เด็กหญิงมะลิ", "e.g. Mali")
                        : text("เช่น ชุดนักเรียน", "e.g. School uniform")
                    }
                    maxLength={160}
                  />
                </label>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCharacterCapture(null)}
                  disabled={saveShotAsCharacter.isPending}
                >
                  {text("ยกเลิก", "Cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveShotAsCharacter()}
                  disabled={
                    saveShotAsCharacter.isPending ||
                    (!characterCapture.name.trim() &&
                      (characterCapture.characterId === "__new__" ||
                        characterCapture.role === "look"))
                  }
                >
                  {saveShotAsCharacter.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                  )}
                  {text("บันทึก", "Save")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
