import { useEffect, useState } from "react";
import {
  ImageIcon,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VerticalDramaNewsEvidencePanel } from "./VerticalDramaNewsEvidencePanel";

export function StorySourcesHub({
  lang,
  packId,
  seriesId,
  prompt,
  promptExpansionStale = false,
  onOpenPremise,
  bootstrapError,
  onRetryBootstrap,
}: {
  lang: "th" | "en";
  packId?: number;
  seriesId?: string;
  prompt?: string;
  promptExpansionStale?: boolean;
  onOpenPremise?: () => void;
  bootstrapError?: string | null;
  onRetryBootstrap?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceKind, setSourceKind] = useState<
    | "known_place"
    | "coordinates"
    | "product_snapshot"
    | "software_review"
    | "generated_reference"
    | "documentary_note"
  >("known_place");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isGeneratingReference, setIsGeneratingReference] = useState(false);
  const [uploadingSlotId, setUploadingSlotId] = useState<number | null>(null);
  const [slotDescriptions, setSlotDescriptions] = useState<
    Record<number, string>
  >({});
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [sourceAnalysisJobId, setSourceAnalysisJobId] = useState<string | null>(
    null
  );
  const [sourceSuggestion, setSourceSuggestion] = useState<string | null>(null);
  const [slotPrompts, setSlotPrompts] = useState<Record<number, string>>({});
  const [generatingSlotId, setGeneratingSlotId] = useState<number | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const packQuery = trpc.verticalDramaSeries.getSourcePack.useQuery(
    { packId: packId ?? 0 },
    {
      enabled: Boolean(packId),
      staleTime: 0,
      refetchOnMount: "always",
    }
  );
  const utils = trpc.useUtils();
  const uploadMutation = trpc.ai.upload.useMutation();
  const generateImageMutation = trpc.media.generateImageAsync.useMutation();
  const addAssetMutation =
    trpc.verticalDramaSeries.addSourceAsset.useMutation();
  const registerUploadedSourceMediaMutation =
    trpc.verticalDramaSeries.registerUploadedSourceMedia.useMutation();
  const createGeneratedSourceAssetMutation =
    trpc.verticalDramaSeries.createGeneratedSourceAsset.useMutation();
  const rightsMutation =
    trpc.verticalDramaSeries.setSourceAssetRights.useMutation({
      onSuccess: () =>
        void utils.verticalDramaSeries.getSourcePack.invalidate({ packId }),
      onError: error => toast.error(error.message),
    });
  const saveSlotMutation = trpc.verticalDramaSeries.saveSourceSlot.useMutation({
    onSuccess: () => {
      void utils.verticalDramaSeries.getSourcePack.invalidate({
        packId: packId ?? 0,
      });
    },
    onError: error => toast.error(error.message),
  });
  const generateSourceSlotPromptMutation =
    trpc.verticalDramaSeries.generateSourceSlotPrompt.useMutation({
      onError: error => toast.error(error.message),
    });
  const suggestMutation =
    trpc.verticalDramaSeries.suggestSourceDescription.useMutation({
      onSuccess: data => {
        if ("jobId" in data) {
          setSourceAnalysisJobId(data.jobId);
          setSourceSuggestion(null);
        } else if ((data as { suggestion?: string }).suggestion) {
          setSourceSuggestion((data as { suggestion: string }).suggestion);
        }
      },
      onError: error => toast.error(error.message),
    });
  const interactiveJobStatusProcedure =
    trpc.verticalDramaSeries.getInteractiveJobStatus;
  const sourceAnalysisJobQuery = interactiveJobStatusProcedure?.useQuery(
    {
      jobId: sourceAnalysisJobId ?? "00000000-0000-0000-0000-000000000000",
      scopeKey: `source:${packId ?? 0}:${selectedSlot ?? 0}`,
    },
    {
      enabled: Boolean(sourceAnalysisJobId && packId && selectedSlot),
      refetchInterval: sourceAnalysisJobId ? 2000 : false,
      staleTime: 0,
    }
  ) ?? { data: undefined };
  useEffect(() => {
    const job = sourceAnalysisJobQuery.data;
    if (!job || !sourceAnalysisJobId) return;
    if (job.status === "succeeded") {
      const result = job.result as { suggestion?: string } | undefined;
      setSourceSuggestion(result?.suggestion ?? null);
      setSourceAnalysisJobId(null);
    } else if (job.status === "failed") {
      toast.error(job.error || "Source analysis failed");
      setSourceAnalysisJobId(null);
    }
  }, [sourceAnalysisJobId, sourceAnalysisJobQuery.data]);
  const acceptSuggestionMutation =
    trpc.verticalDramaSeries.acceptSourceDescriptionSuggestion.useMutation({
      onSuccess: () =>
        void utils.verticalDramaSeries.getSourcePack.invalidate({
          packId: packId ?? 0,
        }),
      onError: error => toast.error(error.message),
    });
  const saveSlotDescription = (slot: {
    id: number;
    slotKey: string;
    title: string;
    sourceKind: string;
    required: boolean;
    usagePolicy: string;
    sortOrder: number;
    version: number;
    sourceAssetId: number | null;
    narrativeDescription: string | null;
  }) => {
    saveSlotMutation.mutate({
      packId: packId ?? 0,
      expectedPackVersion: pack?.pack.version ?? 0,
      slotId: slot.id,
      version: slot.version,
      slotKey: slot.slotKey,
      title: slot.title,
      narrativeDescription:
        slotDescriptions[slot.id] ?? slot.narrativeDescription ?? null,
      sourceKind: slot.sourceKind as
        | "known_place"
        | "coordinates"
        | "product_snapshot"
        | "software_review"
        | "upload_image"
        | "upload_video"
        | "generated_reference"
        | "documentary_note"
        | "custom",
      required: slot.required,
      usagePolicy: slot.usagePolicy as
        | "reference"
        | "broll"
        | "insert"
        | "overlay",
      sortOrder: slot.sortOrder,
      sourceAssetId: slot.sourceAssetId,
    });
  };
  const pack = packQuery.data;

  if (!packId) {
    return (
      <div
        className={cn(
          "grid gap-2 rounded-lg border p-4 text-sm",
          bootstrapError
            ? "border-destructive/40 text-destructive"
            : "border-dashed text-muted-foreground"
        )}
      >
        <p>
          {bootstrapError ||
            (lang === "th"
              ? "กำลังเตรียมพื้นที่เรื่องและสื่อประกอบ…"
              : "Preparing Story Sources & Media…")}
        </p>
        {bootstrapError && onRetryBootstrap && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={onRetryBootstrap}
          >
            {lang === "th" ? "ลองเตรียมพื้นที่อีกครั้ง" : "Retry setup"}
          </Button>
        )}
      </div>
    );
  }
  if (packQuery.isError) {
    return (
      <div className="grid gap-2 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        <p>
          {lang === "th"
            ? "โหลดเรื่องและสื่อประกอบไม่สำเร็จ"
            : "Could not load Story Sources & Media"}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void packQuery.refetch()}
        >
          {lang === "th" ? "ลองอีกครั้ง" : "Retry"}
        </Button>
      </div>
    );
  }
  if (packQuery.isLoading || !pack) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {lang === "th" ? "กำลังโหลดแหล่งอ้างอิง…" : "Loading sources…"}
      </div>
    );
  }
  const promptExpansionApplied =
    pack.promptExpansion?.status === "applied" &&
    !promptExpansionStale &&
    (!prompt || pack.promptExpansion.expandedPrompt?.trim() === prompt.trim());
  const profileDefaultKeys = new Set(
    pack.profile.defaultSlots.map(slot => slot.key)
  );
  const visibleSlots = promptExpansionApplied
    ? pack.slots.filter(
        (slot: { slotKey: string; sourceKind: string }) =>
          pack.promptExpansion?.approvedSlotKeys.includes(slot.slotKey) ||
          (slot.sourceKind === "custom" &&
            !profileDefaultKeys.has(slot.slotKey))
      )
    : [];
  const customSlots = visibleSlots.filter(
    (slot: { sourceKind: string }) => slot.sourceKind === "custom"
  );
  type SourcePreviewAsset = {
    id: number;
    title: string;
    sourceKind: string;
    provenanceJson?: unknown;
    provenance?: unknown;
  };
  const attachedImagePreviews: Array<{
    asset: SourcePreviewAsset;
    url: string;
  }> = (pack.assets as SourcePreviewAsset[])
    .map(asset => ({ asset, url: getAssetPreviewUrl(asset) }))
    .filter(
      (item): item is { asset: SourcePreviewAsset; url: string } =>
        Boolean(item.url) && item.asset.sourceKind !== "upload_video"
    );
  if (!promptExpansionApplied) {
    return (
      <section
        className="grid min-w-0 w-full max-w-full gap-3 rounded-xl border border-dashed bg-muted/10 p-4"
        aria-labelledby="vd-source-hub-locked-title"
      >
        <div className="grid gap-1">
          <h3 id="vd-source-hub-locked-title" className="text-sm font-semibold">
            {lang === "th"
              ? "ต้องขยายโจทย์ก่อนเตรียมสื่อ"
              : "Expand the premise before preparing media"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {promptExpansionStale
              ? lang === "th"
                ? "โจทย์ถูกแก้หลังจากสร้างแผนสื่อเดิมแล้ว กรุณาขยายและยืนยันโจทย์ใหม่ เพื่อไม่ให้ slot เก่าปะปนกับเรื่องใหม่"
                : "The premise changed after the previous media plan. Expand and approve it again so old slots do not mix with the new story."
              : lang === "th"
                ? "ระบบยังไม่สร้าง slot เพราะยังไม่รู้ว่าคุณกำลังรีวิวหรือเล่าเรื่องอะไร ให้กด “ขยายโจทย์ด้วย AI” แล้วตรวจผลใน dialog ก่อน"
                : "No slots are created yet because the system does not know what you are reviewing or documenting. Use “Expand premise with AI” and review the dialog first."}
          </p>
        </div>
        {onOpenPremise && (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={onOpenPremise}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {lang === "th" ? "กลับไปขยายโจทย์" : "Go to premise expansion"}
          </Button>
        )}
      </section>
    );
  }
  const addSlot = () => {
    const key = `custom_${Date.now()}`;
    saveSlotMutation.mutate({
      packId: packId ?? 0,
      expectedPackVersion: pack.pack.version,
      slotKey: key,
      title:
        title.trim() || (lang === "th" ? "แหล่งอ้างอิงใหม่" : "New source"),
      narrativeDescription: description.trim() || null,
      sourceKind: "custom",
      required: false,
      usagePolicy: "reference",
      sortOrder: visibleSlots.length,
    });
  };
  const uploadSource = async (
    file: File,
    targetSlot?: {
      id: number;
      slotKey: string;
      title: string;
      sourceKind: string;
      required: boolean;
      usagePolicy: string;
      sortOrder: number;
      version: number;
      narrativeDescription: string | null;
      sourceAssetId: number | null;
    }
  ) => {
    setUploadingSlotId(targetSlot?.id ?? null);
    const uploadKind = file.type.startsWith("video/")
      ? ("upload_video" as const)
      : ("upload_image" as const);
    if (file.size > 100 * 1024 * 1024) {
      setUploadingSlotId(null);
      throw new Error(
        lang === "th"
          ? "ไฟล์ต้องมีขนาดไม่เกิน 100 MB"
          : "Files must be 100 MB or smaller"
      );
    }
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileBase64: dataUrl,
      });
      const durable = await registerUploadedSourceMediaMutation.mutateAsync({
        storageKey: uploaded.key,
        mediaType: uploadKind === "upload_video" ? "video" : "image",
        mimeType: file.type || undefined,
      });
      const created = await addAssetMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: pack.pack.version,
        sourceKind: uploadKind,
        mediaAssetId: durable.mediaAssetId,
        title: file.name,
        description: description.trim() || null,
        provenance: {
          source: "user_upload",
          fileName: file.name,
          uploadedUrl: uploaded.url,
          storageKey: durable.storageKey,
          managed: true,
        },
        clientMutationKey:
          `upload-${file.name}-${file.size}-${file.lastModified}`.slice(0, 128),
        rightsStatus: "pending",
        disclosureStatus: "not_required",
      });
      await saveSlotMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: created.pack.pack.version,
        ...(targetSlot
          ? {
              slotId: targetSlot.id,
              version: targetSlot.version,
              slotKey: targetSlot.slotKey,
              title: targetSlot.title,
              narrativeDescription:
                slotDescriptions[targetSlot.id] ??
                targetSlot.narrativeDescription ??
                (description.trim() || null),
              required: targetSlot.required,
              sortOrder: targetSlot.sortOrder,
            }
          : {
              slotKey: `upload_${Date.now()}`,
              title: title.trim() || file.name,
              narrativeDescription: description.trim() || null,
              required: false,
              sortOrder: visibleSlots.length,
            }),
        sourceKind: uploadKind,
        usagePolicy: targetSlot
          ? uploadKind === "upload_video"
            ? "broll"
            : targetSlot.usagePolicy === "broll" ||
                targetSlot.usagePolicy === "insert" ||
                targetSlot.usagePolicy === "overlay"
              ? targetSlot.usagePolicy
              : "reference"
          : uploadKind === "upload_video"
            ? "broll"
            : "reference",
        sourceAssetId: Number(created.asset.id),
      });
      toast.success(
        targetSlot
          ? lang === "th"
            ? `แนบสื่อเข้ากับ “${targetSlot.title}” แล้ว`
            : `Media attached to “${targetSlot.title}”`
          : lang === "th"
            ? "อัปโหลดและเพิ่มเป็น slot ใหม่แล้ว"
            : "Uploaded and added as a new slot"
      );
      void utils.verticalDramaSeries.getSourcePack.invalidate({ packId });
    } finally {
      setUploadingSlotId(null);
    }
  };
  const generateSlotPrompt = async (slot: {
    id: number;
    slotKey: string;
    title: string;
    narrativeDescription: string | null;
    usagePolicy: string;
    sourceKind: string;
    required: boolean;
  }) => {
    const result = await generateSourceSlotPromptMutation.mutateAsync({
      slot: {
        slotKey: slot.slotKey,
        title: slot.title,
        description:
          slotDescriptions[slot.id] ?? slot.narrativeDescription ?? slot.title,
        semanticRole:
          slot.usagePolicy === "broll"
            ? slot.sourceKind === "upload_video"
              ? "b_roll_footage"
              : "b_roll_still"
            : slot.sourceKind === "known_place" ||
                slot.sourceKind === "coordinates"
              ? "scene_anchor"
              : "reference",
        mediaType: slot.sourceKind === "upload_video" ? "video" : "image",
        required: slot.required,
        evidenceStatus: "illustrative",
      },
      brief: {
        title: slot.title,
        oneLineSummary:
          slotDescriptions[slot.id] ?? slot.narrativeDescription ?? slot.title,
        profile: "documentary",
        angle: "สร้างภาพประกอบให้สอดคล้องกับ slot โดยไม่สร้างข้อเท็จจริงใหม่",
        scope: [slot.title],
        factualClaims: [],
        creativeAssumptions: [
          "ภาพนี้เป็นภาพประกอบและต้องตรวจสิทธิ์ก่อนใช้จริง",
        ],
        exclusions: [
          "ห้ามสร้างโลโก้ ตัวเลข หรือข้อความข้อเท็จจริงที่ไม่ได้ระบุ",
        ],
      },
    });
    setSlotPrompts(previous => ({ ...previous, [slot.id]: result.prompt }));
  };
  const generateSlotImage = async (slot: {
    id: number;
    slotKey: string;
    title: string;
    narrativeDescription: string | null;
    sourceKind: string;
    usagePolicy: string;
    required: boolean;
    sortOrder: number;
    version: number;
    sourceAssetId: number | null;
  }) => {
    const prompt =
      slotPrompts[slot.id] ||
      slotDescriptions[slot.id] ||
      slot.narrativeDescription ||
      slot.title;
    setGeneratingSlotId(slot.id);
    try {
      const task = await generateImageMutation.mutateAsync({
        prompt,
        numImages: 1,
        aspectRatio: "9:16",
        extraParams: {},
        originSurface: "media_studio",
        transport: "gateway_api",
        idempotencyKey: `vd-source-slot-${packId}-${slot.id}-${Date.now()}`,
      });
      const taskId =
        typeof task.taskId === "string"
          ? task.taskId
          : typeof task.id === "string"
            ? task.id
            : undefined;
      if (!taskId)
        throw new Error(
          lang === "th"
            ? "ไม่พบ task ของภาพที่สร้าง"
            : "Generated task could not be verified"
        );
      let resultUrl =
        typeof task.resultUrl === "string" ? task.resultUrl : undefined;
      if (!resultUrl) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const status = await utils.media.getTask.fetch({ taskId });
          if (status.status === "completed") {
            resultUrl =
              typeof status.resultUrl === "string"
                ? status.resultUrl
                : undefined;
            break;
          }
          if (status.status === "failed")
            throw new Error(
              status.errorMessage || "Reference image generation failed"
            );
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
      if (!resultUrl)
        throw new Error(
          lang === "th"
            ? "สร้างภาพไม่สำเร็จ"
            : "Image generation did not return a file"
        );
      const latestPack = (await packQuery.refetch()).data ?? pack;
      const created = await createGeneratedSourceAssetMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: latestPack.pack.version,
        taskId,
        sourceKind: "generated_reference",
        title: slot.title,
        description:
          slotDescriptions[slot.id] ?? slot.narrativeDescription ?? null,
        provenance: { source: "generated_reference", taskId },
        clientMutationKey:
          `generated-slot-${packId}-${slot.id}-${taskId}`.slice(0, 128),
        rightsStatus: "creator_owned",
        disclosureStatus: "not_required",
      });
      await saveSlotMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: created.pack.pack.version,
        slotId: slot.id,
        version: slot.version,
        slotKey: slot.slotKey,
        title: slot.title,
        narrativeDescription:
          slotDescriptions[slot.id] ?? slot.narrativeDescription ?? null,
        sourceKind: slot.sourceKind as
          | "known_place"
          | "coordinates"
          | "product_snapshot"
          | "software_review"
          | "upload_image"
          | "upload_video"
          | "generated_reference"
          | "documentary_note"
          | "custom",
        required: slot.required,
        usagePolicy: slot.usagePolicy as
          | "reference"
          | "broll"
          | "insert"
          | "overlay",
        sortOrder: slot.sortOrder,
        sourceAssetId: Number(created.asset.id),
      });
      toast.success(
        lang === "th"
          ? `สร้างภาพและผูกกับ “${slot.title}” แล้ว`
          : `Generated image attached to “${slot.title}”`
      );
      void utils.verticalDramaSeries.getSourcePack.invalidate({ packId });
    } finally {
      setGeneratingSlotId(null);
    }
  };
  const addReferenceSource = async () => {
    if (!title.trim()) {
      toast.error(
        lang === "th" ? "กรุณาใส่ชื่อแหล่งอ้างอิง" : "Enter a source title"
      );
      return;
    }
    try {
      if (referenceUrl.trim()) {
        await utils.verticalDramaSeries.validateSourceUrl.fetch({
          url: referenceUrl.trim(),
        });
      }
      const created = await addAssetMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: pack.pack.version,
        sourceKind,
        title: title.trim(),
        description: description.trim() || null,
        provenance: {
          source: "creator_reference",
          ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
        },
        clientMutationKey:
          `reference-${sourceKind}-${title.trim()}-${referenceUrl.trim() || Date.now()}`.slice(
            0,
            128
          ),
        rightsStatus: "pending",
        disclosureStatus: "not_required",
      });
      await saveSlotMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: created.pack.pack.version,
        slotKey: `reference_${Date.now()}`,
        title: title.trim(),
        narrativeDescription: description.trim() || null,
        sourceKind,
        required: false,
        usagePolicy:
          sourceKind === "documentary_note" ||
          sourceKind === "generated_reference"
            ? "reference"
            : "broll",
        sourceAssetId: Number(created.asset.id),
        sortOrder: visibleSlots.length,
      });
      setReferenceUrl("");
      void utils.verticalDramaSeries.getSourcePack.invalidate({ packId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "เพิ่มแหล่งอ้างอิงไม่สำเร็จ"
            : "Could not add source reference"
      );
    }
  };
  const generateReferenceImage = async () => {
    if (!title.trim() && !description.trim()) {
      toast.error(
        lang === "th"
          ? "ใส่ชื่อหรือคำอธิบายก่อนสร้างภาพอ้างอิง"
          : "Enter a title or description before generating a reference"
      );
      return;
    }
    setIsGeneratingReference(true);
    try {
      const task = await generateImageMutation.mutateAsync({
        prompt: [title.trim(), description.trim()].filter(Boolean).join(" — "),
        numImages: 1,
        aspectRatio: "9:16",
        extraParams: {},
        originSurface: "media_studio",
        transport: "gateway_api",
        idempotencyKey: `vd-source-ref-${packId}-${Date.now()}`,
      });
      const taskId =
        typeof task.taskId === "string"
          ? task.taskId
          : typeof task.id === "string"
            ? task.id
            : undefined;
      let resultUrl =
        typeof task.resultUrl === "string" ? task.resultUrl : undefined;
      if (!resultUrl && taskId) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const status = await utils.media.getTask.fetch({ taskId });
          if (status.status === "completed") {
            resultUrl =
              typeof status.resultUrl === "string"
                ? status.resultUrl
                : undefined;
            break;
          }
          if (status.status === "failed") {
            throw new Error(
              status.errorMessage || "Reference image generation failed"
            );
          }
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
      if (!resultUrl) {
        throw new Error(
          lang === "th"
            ? "สร้างภาพเสร็จแล้วแต่ไม่พบไฟล์ผลลัพธ์"
            : "Generation completed without a result file"
        );
      }
      if (!taskId) {
        throw new Error(
          lang === "th"
            ? "ไม่สามารถยืนยัน task ของภาพที่สร้างได้ จึงยังไม่บันทึกภาพ"
            : "The generated task could not be verified, so the image was not saved"
        );
      }
      const created = await createGeneratedSourceAssetMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: pack.pack.version,
        taskId,
        sourceKind: "generated_reference",
        title: title.trim() || "Generated reference",
        description: description.trim() || null,
        provenance: {
          source: "generated_reference",
          taskId,
        },
        clientMutationKey: `generated-${packId}-${Date.now()}`,
        rightsStatus: "creator_owned",
        disclosureStatus: "not_required",
      });
      await saveSlotMutation.mutateAsync({
        packId: packId ?? 0,
        expectedPackVersion: created.pack.pack.version,
        slotKey: `generated_${Date.now()}`,
        title: title.trim() || "Generated reference",
        narrativeDescription: description.trim() || null,
        sourceKind: "generated_reference",
        required: false,
        usagePolicy: "reference",
        sourceAssetId: Number(created.asset.id),
        sortOrder: visibleSlots.length,
      });
      toast.success(
        lang === "th"
          ? "สร้างภาพอ้างอิงและเพิ่มลงในเรื่องแล้ว"
          : "Generated reference added to the story"
      );
      void utils.verticalDramaSeries.getSourcePack.invalidate({ packId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setIsGeneratingReference(false);
    }
  };
  const getAssetPreviewUrl = (asset: {
    provenanceJson?: unknown;
    provenance?: unknown;
  }) => {
    const provenance = asset.provenanceJson ?? asset.provenance;
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance)
    ) {
      return null;
    }
    const record = provenance as Record<string, unknown>;
    if (typeof record.storageKey === "string" && record.storageKey.trim()) {
      return `/api/storage/files/${encodeURIComponent(record.storageKey.trim())}`;
    }
    return null;
  };
  return (
    <section
      className="grid min-w-0 w-full max-w-full gap-4 overflow-x-hidden rounded-xl border bg-muted/10 p-4"
      aria-labelledby="vd-source-hub-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="vd-source-hub-title" className="text-sm font-semibold">
            {lang === "th" ? "เรื่องและสื่อประกอบ" : "Story Sources & Media"}
          </h3>
          <p className="max-w-full break-words text-xs text-muted-foreground">
            {lang === "th"
              ? "เตรียมภาพ วิดีโอ ข้อมูล และคำอธิบายก่อนร่างเรื่อง"
              : "Prepare images, videos, facts, and narrative purpose before drafting."}
          </p>
        </div>
        <div
          className="flex min-w-0 max-w-full flex-wrap justify-end gap-1 text-xs"
          aria-live="polite"
          aria-label={
            lang === "th" ? "สถานะเรื่องและสื่อ" : "Story source status"
          }
        >
          <Badge
            variant={
              pack.readiness.textDraftAllowed ? "default" : "destructive"
            }
          >
            {pack.readiness.textDraftAllowed ? "Draft ready" : "Draft blocked"}
          </Badge>
          <Badge variant="outline">
            {pack.readiness.productionRenderAllowed
              ? "Production ready"
              : "Rights pending"}
          </Badge>
        </div>
      </div>
      {pack.profile.profileId === "news_report" && seriesId && (
        <VerticalDramaNewsEvidencePanel
          claims={[]}
          seriesId={seriesId}
          lang={lang}
        />
      )}
      {pack.readiness.blockingItems.length > 0 && (
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {pack.readiness.blockingItems.map(item => (
            <p key={`${item.code}-${item.slotKey}`}>{item.message}</p>
          ))}
        </div>
      )}
      {attachedImagePreviews.length > 0 && (
        <div
          className="grid gap-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20"
          data-testid="vd-source-image-preview-gallery"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {lang === "th"
                  ? "ภาพแนบสำหรับตรวจสอบร่วมกับโจทย์"
                  : "Attached images for premise review"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? `${attachedImagePreviews.length} ภาพ · คลิกภาพเพื่อขยายเต็มจอ`
                  : `${attachedImagePreviews.length} image(s) · click to view full screen`}
              </p>
            </div>
            <ImageIcon className="h-4 w-4 text-sky-700" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {attachedImagePreviews.map(({ asset, url }) => (
              <button
                key={asset.id}
                type="button"
                className="group relative overflow-hidden rounded-md border bg-background text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setSelectedPreview({ url, title: asset.title })}
                aria-label={
                  lang === "th"
                    ? `ขยายภาพ ${asset.title}`
                    : `Open image ${asset.title}`
                }
              >
                <img
                  src={url}
                  alt={asset.title}
                  loading="lazy"
                  className="h-28 w-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[11px] text-white">
                  {asset.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid min-w-0 max-w-full gap-2">
        {visibleSlots.map(
          (slot: {
            id: number;
            slotKey: string;
            title: string;
            sourceKind: string;
            required: boolean;
            usagePolicy: string;
            sortOrder: number;
            version: number;
            narrativeDescription: string | null;
            sourceAssetId: number | null;
          }) => (
            <div
              key={slot.id}
              className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border bg-background p-3 md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]"
            >
              <div className="grid min-w-0 gap-2">
                <p className="max-w-full break-words text-sm font-medium">
                  {slot.title}{" "}
                  {slot.required && <span className="text-destructive">*</span>}
                </p>
                <Textarea
                  aria-label={`${slot.title} narrative description`}
                  value={
                    slotDescriptions[slot.id] ?? slot.narrativeDescription ?? ""
                  }
                  onChange={event =>
                    setSlotDescriptions(previous => ({
                      ...previous,
                      [slot.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    lang === "th"
                      ? "เพิ่มคำอธิบายว่าภาพนี้เล่าอะไร"
                      : "Add what this source should communicate"
                  }
                  rows={2}
                />
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={generateSourceSlotPromptMutation.isPending}
                    onClick={() =>
                      void generateSlotPrompt(slot).catch(error =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not generate prompt"
                        )
                      )
                    }
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    {lang === "th" ? "สร้าง prompt" : "Generate prompt"}
                  </Button>
                  {slotPrompts[slot.id] &&
                    slot.sourceKind !== "upload_video" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={generatingSlotId !== null}
                        onClick={() =>
                          void generateSlotImage(slot).catch(error =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not generate image"
                            )
                          )
                        }
                      >
                        {generatingSlotId === slot.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <ImageIcon className="mr-1 h-3 w-3" />
                        )}
                        {lang === "th"
                          ? "สร้างภาพจาก prompt"
                          : "Generate image"}
                      </Button>
                    )}
                </div>
                {slotPrompts[slot.id] && (
                  <p
                    className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground"
                    aria-label={`${slot.title} generated prompt`}
                  >
                    {slotPrompts[slot.id]}
                  </p>
                )}
              </div>
              <div className="grid min-w-0 content-start gap-2">
                {(() => {
                  const asset = pack.assets.find(
                    (candidate: { id: number }) =>
                      candidate.id === slot.sourceAssetId
                  ) as
                    | {
                        id: number;
                        sourceKind: string;
                        rightsStatus: string;
                        disclosureStatus: string;
                        provenanceJson?: unknown;
                        provenance?: unknown;
                      }
                    | undefined;
                  const previewUrl = asset ? getAssetPreviewUrl(asset) : null;
                  const isVideo = asset?.sourceKind === "upload_video";
                  return (
                    <>
                      {previewUrl ? (
                        isVideo ? (
                          <video
                            className="max-h-36 w-full max-w-full rounded-md border bg-muted object-contain"
                            src={previewUrl}
                            controls
                            preload="metadata"
                            aria-label={slot.title}
                          />
                        ) : (
                          <img
                            className="max-h-36 w-full max-w-full rounded-md border bg-muted object-contain"
                            src={previewUrl}
                            alt={slot.title}
                            loading="lazy"
                          />
                        )
                      ) : (
                        <Badge className="w-fit max-w-full" variant="outline">
                          {slot.sourceAssetId ? (
                            <>
                              {isVideo ? (
                                <Video className="mr-1 h-3 w-3" />
                              ) : (
                                <ImageIcon className="mr-1 h-3 w-3" />
                              )}
                              {lang === "th" ? "แนบสื่อแล้ว" : "Attached"}
                            </>
                          ) : (
                            <>{lang === "th" ? "ยังไม่มีสื่อ" : "No media"}</>
                          )}
                        </Badge>
                      )}
                      <div className="flex min-w-0 flex-wrap gap-1">
                        <label
                          className={cn(
                            "inline-flex min-w-0 max-w-full cursor-pointer items-center rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent",
                            uploadingSlotId !== null &&
                              "pointer-events-none opacity-60"
                          )}
                        >
                          {uploadingSlotId === slot.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-1 h-4 w-4" />
                          )}
                          <span className="truncate">
                            {slot.sourceAssetId
                              ? lang === "th"
                                ? "เปลี่ยนสื่อใน slot นี้"
                                : "Replace media"
                              : lang === "th"
                                ? "แนบภาพ/วิดีโอใน slot นี้"
                                : "Attach image/video"}
                          </span>
                          <input
                            className="sr-only"
                            type="file"
                            accept="image/*,video/*"
                            disabled={uploadingSlotId !== null}
                            onChange={event => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void uploadSource(file, slot).catch(error => {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : lang === "th"
                                        ? "แนบสื่อไม่สำเร็จ"
                                        : "Could not attach media"
                                  );
                                });
                              }
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {slot.sourceAssetId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={
                              saveSlotMutation.isPending ||
                              uploadingSlotId !== null
                            }
                            onClick={() =>
                              saveSlotMutation.mutate({
                                packId: packId ?? 0,
                                expectedPackVersion: pack.pack.version,
                                slotId: slot.id,
                                version: slot.version,
                                slotKey: slot.slotKey,
                                title: slot.title,
                                narrativeDescription:
                                  slotDescriptions[slot.id] ??
                                  slot.narrativeDescription ??
                                  null,
                                sourceKind: slot.sourceKind as
                                  | "known_place"
                                  | "coordinates"
                                  | "product_snapshot"
                                  | "software_review"
                                  | "upload_image"
                                  | "upload_video"
                                  | "generated_reference"
                                  | "documentary_note"
                                  | "custom",
                                required: slot.required,
                                usagePolicy: slot.usagePolicy as
                                  | "reference"
                                  | "broll"
                                  | "insert"
                                  | "overlay",
                                sortOrder: slot.sortOrder,
                                sourceAssetId: null,
                              })
                            }
                          >
                            {lang === "th" ? "ถอดสื่อ" : "Detach"}
                          </Button>
                        )}
                      </div>
                    </>
                  );
                })()}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  disabled={
                    saveSlotMutation.isPending || uploadingSlotId !== null
                  }
                  onClick={() => saveSlotDescription(slot)}
                >
                  <Save className="mr-1 h-3 w-3" />
                  {lang === "th" ? "บันทึก" : "Save"}
                </Button>
                {slot.sourceAssetId && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedSlot(slot.sourceAssetId)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    {(() => {
                      const asset = pack.assets.find(
                        (candidate: { id: number }) =>
                          candidate.id === slot.sourceAssetId
                      ) as
                        | {
                            id: number;
                            rightsStatus: string;
                            disclosureStatus: string;
                          }
                        | undefined;
                      if (!asset) return null;
                      return (
                        <select
                          aria-label={`Rights for ${slot.title}`}
                          className="h-9 min-w-0 w-full max-w-full rounded-md border bg-background px-2 text-xs"
                          value={asset.rightsStatus}
                          disabled={rightsMutation.isPending}
                          onChange={event =>
                            rightsMutation.mutate({
                              packId: packId ?? 0,
                              sourceAssetId: asset.id,
                              expectedPackVersion: pack.pack.version,
                              rightsStatus: event.target.value as
                                | "pending"
                                | "creator_owned"
                                | "licensed"
                                | "restricted"
                                | "rejected",
                              disclosureStatus:
                                event.target.value === "restricted"
                                  ? "shown"
                                  : (asset.disclosureStatus as
                                      | "not_required"
                                      | "required"
                                      | "shown"),
                            })
                          }
                        >
                          <option value="pending">
                            {lang === "th"
                              ? "สิทธิ์: รอตรวจ"
                              : "Rights: pending"}
                          </option>
                          <option value="creator_owned">
                            {lang === "th" ? "สิทธิ์: ของฉัน" : "Rights: owned"}
                          </option>
                          <option value="licensed">
                            {lang === "th"
                              ? "สิทธิ์: ได้รับอนุญาต"
                              : "Rights: licensed"}
                          </option>
                          <option value="restricted">
                            {lang === "th"
                              ? "จำกัด + เปิดเผย"
                              : "Restricted + disclose"}
                          </option>
                          <option value="rejected">
                            {lang === "th" ? "ไม่อนุญาต" : "Rejected"}
                          </option>
                        </select>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )
        )}
        {customSlots.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {lang === "th"
              ? "เพิ่ม slot ได้ไม่จำกัดตามโควตาระบบ"
              : "Add unlimited custom slots within system quotas."}
          </p>
        )}
      </div>
      <div className="grid min-w-0 w-full max-w-full gap-2 overflow-hidden rounded-lg border border-dashed p-3">
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={
            lang === "th"
              ? "ชื่อภาพ/วิดีโอหรือ slot"
              : "Image/video or slot title"
          }
        />
        <Textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={
            lang === "th"
              ? "อยากให้ภาพนี้เล่าอะไร"
              : "What should this source communicate?"
          }
          rows={2}
        />
        <label className="grid gap-1 text-xs font-medium">
          {lang === "th" ? "ประเภทแหล่งอ้างอิง" : "Source type"}
          <select
            className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
            value={sourceKind}
            onChange={event =>
              setSourceKind(event.target.value as typeof sourceKind)
            }
          >
            <option value="known_place">
              {lang === "th" ? "สถานที่ที่รู้จัก" : "Known place"}
            </option>
            <option value="coordinates">
              {lang === "th" ? "พิกัด / แผนที่" : "Coordinates / map"}
            </option>
            <option value="product_snapshot">
              {lang === "th"
                ? "ภาพสินค้า / รายละเอียดสินค้า"
                : "Product snapshot"}
            </option>
            <option value="software_review">
              {lang === "th"
                ? "ซอฟต์แวร์ / หน้าจอระบบ"
                : "Software / interface"}
            </option>
            <option value="generated_reference">
              {lang === "th" ? "ภาพอ้างอิงให้ระบบสร้าง" : "Generated reference"}
            </option>
            <option value="documentary_note">
              {lang === "th" ? "บันทึกสารคดี / ข้อสังเกต" : "Documentary note"}
            </option>
          </select>
        </label>
        {sourceKind === "generated_reference" && (
          <p className="text-xs text-muted-foreground" role="note">
            {lang === "th"
              ? "ภาพนี้ใช้เป็นแนวทางอ้างอิงเท่านั้น ต้องอัปโหลดหรือผูกสื่อที่จัดเก็บในระบบก่อนจึงใช้ในงานผลิตได้"
              : "Generated references guide the story only. Upload or attach managed media before production use."}
          </p>
        )}
        <Input
          value={referenceUrl}
          onChange={event => setReferenceUrl(event.target.value)}
          placeholder={
            lang === "th"
              ? "ลิงก์สถานที่ / Google Maps / สินค้า (ถ้ามี)"
              : "Place, Google Maps, or product URL (optional)"
          }
          inputMode="url"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={addSlot}
            disabled={saveSlotMutation.isPending}
          >
            <Plus className="mr-1 h-4 w-4" />
            {lang === "th" ? "เพิ่ม slot" : "Add slot"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void generateReferenceImage()}
            disabled={
              (!title.trim() && !description.trim()) ||
              isGeneratingReference ||
              generateImageMutation.isPending ||
              addAssetMutation.isPending ||
              saveSlotMutation.isPending
            }
          >
            {isGeneratingReference ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {lang === "th" ? "สร้างภาพอ้างอิง" : "Generate reference"}
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent">
            {uploadMutation.isPending || addAssetMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {lang === "th" ? "อัปโหลดภาพ/วิดีโอ" : "Upload image/video"}
            <input
              className="sr-only"
              type="file"
              accept="image/*,video/*"
              disabled={uploadMutation.isPending || addAssetMutation.isPending}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadSource(file).catch(error => {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : lang === "th"
                          ? "อัปโหลดแหล่งอ้างอิงไม่สำเร็จ"
                          : "Source upload failed"
                    );
                  });
                }
                event.target.value = "";
              }}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void addReferenceSource()}
            disabled={
              !title.trim() ||
              addAssetMutation.isPending ||
              saveSlotMutation.isPending
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            {lang === "th" ? "เพิ่มแหล่งอ้างอิง" : "Add reference"}
          </Button>
          <span className="inline-flex items-center text-xs text-muted-foreground">
            <Video className="mr-1 h-3 w-3" />
            {lang === "th"
              ? "ใช้เป็น B-roll ได้หลังผ่านสิทธิ์"
              : "B-roll after rights approval"}
          </span>
        </div>
        <p className="max-w-full break-words text-xs text-muted-foreground">
          {lang === "th"
            ? "ต้องการแนบไฟล์ให้ slot ที่มีอยู่ ให้กด “แนบภาพ/วิดีโอใน slot นี้” บน slot นั้นโดยตรง การอัปโหลดด้านบนจะสร้าง slot ใหม่"
            : "To attach a file to an existing slot, use its “Attach image/video” button. The upload button above creates a new slot."}
        </p>
      </div>
      {selectedSlot && (
        <div
          className="rounded-md border bg-background p-3 text-xs"
          aria-live="polite"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={suggestMutation.isPending}
            onClick={() =>
              suggestMutation.mutate({
                packId: packId ?? 0,
                sourceAssetId: selectedSlot,
              })
            }
          >
            {suggestMutation.isPending
              ? "…"
              : lang === "th"
                ? "สร้างคำบรรยายแนะนำ"
                : "Generate description"}
          </Button>
          {sourceSuggestion && (
            <div className="mt-2 grid gap-2">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {sourceSuggestion}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  acceptSuggestionMutation.mutate({
                    packId: packId ?? 0,
                    sourceAssetId: selectedSlot,
                    suggestion: sourceSuggestion,
                  })
                }
              >
                {lang === "th" ? "ยอมรับคำแนะนำ" : "Accept suggestion"}
              </Button>
            </div>
          )}
        </div>
      )}
      <Dialog
        open={selectedPreview !== null}
        onOpenChange={open => {
          if (!open) setSelectedPreview(null);
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{selectedPreview?.title}</DialogTitle>
            <DialogDescription>
              {lang === "th"
                ? "ภาพแนบจาก source pack"
                : "Attached source-pack image"}
            </DialogDescription>
          </DialogHeader>
          {selectedPreview && (
            <img
              src={selectedPreview.url}
              alt={selectedPreview.title}
              className="max-h-[75vh] w-full rounded-md border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
