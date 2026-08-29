import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  canAddSpecialReferences,
  toggleBoundedSelection,
} from "@/lib/specialTieInUi";
import {
  specialTieInInputSchema,
  SPECIAL_TIE_IN_DURATIONS_SECONDS,
} from "@shared/verticalDramaSeries/specialTieInContracts";

type ReferenceType = "product" | "location" | "store" | "mixed";
type Reference = {
  mediaAssetId: string;
  source: "upload" | "marketplace_capture" | "series_asset";
  label?: string;
  provenance?: Record<string, unknown>;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function SpecialTieInEpisodeDialog({
  lang,
  seriesId,
  open,
  onOpenChange,
  onCreated,
}: {
  lang: "th" | "en";
  seriesId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (episodeId: string) => void;
}) {
  const [idea, setIdea] = useState("");
  const [referenceType, setReferenceType] = useState<ReferenceType>("product");
  const [references, setReferences] = useState<Reference[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [speakerCharacterIds, setSpeakerCharacterIds] = useState<string[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [dialogueMode, setDialogueMode] = useState<
    "none" | "character_dialogue"
  >("none");
  const [dialogueBrief, setDialogueBrief] = useState("");
  const [allowAdditionalCharacters, setAllowAdditionalCharacters] =
    useState(false);
  const [lockCharacterReferences, setLockCharacterReferences] = useState(true);
  const [lockReferenceImages, setLockReferenceImages] = useState(true);
  const [imageModelId, setImageModelId] = useState("");
  const [videoModelId, setVideoModelId] = useState("");
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [pendingImageIds, setPendingImageIds] = useState<string[]>([]);

  const charactersQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: open }
  );
  const modelsQuery =
    trpc.verticalDramaEpisodes.listSpecialTieInModels.useQuery(
      {
        durationSeconds: durationSeconds as 8 | 10 | 12 | 15 | 20 | 24 | 30,
        dialogueMode,
        referenceImageCount: Math.max(1, references.length),
      },
      { enabled: open }
    );
  const productsQuery = trpc.marketplaceCapture.listProducts.useQuery(
    {
      limit: 20,
      query: productQuery.trim() || undefined,
      ownerOnly: false,
      platform: "all",
      sortMode: "updated",
    },
    { enabled: open && marketplaceOpen }
  );
  const imagesQuery = trpc.marketplaceCapture.listProductImages.useQuery(
    {
      productId: selectedProductId,
      limit: 30,
      ownerOnly: false,
      platform: "all",
    },
    { enabled: open && marketplaceOpen && Boolean(selectedProductId) }
  );
  const uploadMutation = trpc.ai.upload.useMutation();
  const registerUploadMutation =
    trpc.verticalDramaSeries.registerUploadedSourceMedia.useMutation();
  const materializeMutation =
    trpc.verticalDramaEpisodes.materializeSpecialMarketplaceImage.useMutation();
  const createMutation =
    trpc.verticalDramaEpisodes.createSpecialTieInEpisode.useMutation();

  const characters = (charactersQuery.data?.characters ??
    charactersQuery.data ??
    []) as Array<{
    id: string | number;
    name?: string;
    characterName?: string;
  }>;
  const products = Array.isArray(productsQuery.data)
    ? productsQuery.data
    : (productsQuery.data?.items ?? []);
  const productImages = imagesQuery.data?.images ?? [];
  const imageModels = modelsQuery.data?.imageModels ?? [];
  const videoModels = modelsQuery.data?.videoModels ?? [];
  const canSubmit =
    idea.trim().length > 0 &&
    idea.trim().length <= 5000 &&
    references.length >= 1 &&
    references.length <= 3 &&
    Boolean(imageModelId && videoModelId) &&
    !(
      dialogueMode === "character_dialogue" && speakerCharacterIds.length === 0
    );

  useEffect(() => {
    if (!imageModels.some(model => model.modelId === imageModelId))
      setImageModelId(imageModels[0]?.modelId ?? "");
    if (!videoModels.some(model => model.modelId === videoModelId))
      setVideoModelId(videoModels[0]?.modelId ?? "");
  }, [imageModelId, videoModelId, imageModels, videoModels]);

  const selectedCharacters = useMemo(
    () => new Set(characterIds),
    [characterIds]
  );
  const toggleCharacter = (id: string) => {
    setCharacterIds(current => {
      if (current.includes(id)) {
        setSpeakerCharacterIds(speakers =>
          speakers.filter(speaker => speaker !== id)
        );
        return current.filter(value => value !== id);
      }
      return toggleBoundedSelection(current, id, 4);
    });
  };

  const uploadReference = async (file: File) => {
    if (!file.type.startsWith("image/"))
      throw new Error(
        lang === "th" ? "รองรับเฉพาะไฟล์ภาพ" : "Only image files are supported"
      );
    if (!canAddSpecialReferences(references.length))
      throw new Error(
        lang === "th"
          ? "เลือกภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "Choose up to 3 reference images"
      );
    const uploaded = await uploadMutation.mutateAsync({
      fileName: file.name,
      fileType: file.type,
      fileBase64: await readAsDataUrl(file),
    });
    const managed = await registerUploadMutation.mutateAsync({
      storageKey: uploaded.key,
      mediaType: "image",
      mimeType: file.type,
    });
    setReferences(current => [
      ...current,
      {
        mediaAssetId: String(managed.mediaAssetId),
        source: "upload",
        label: file.name,
        provenance: { source: "user_upload", managed: true },
      },
    ]);
  };

  const confirmMarketplaceImages = async () => {
    if (!selectedProductId || pendingImageIds.length === 0) return;
    if (!canAddSpecialReferences(references.length, pendingImageIds.length)) {
      toast.error(
        lang === "th"
          ? "รวมภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "The total number of references cannot exceed 3"
      );
      return;
    }
    try {
      const added: Reference[] = [];
      for (const imageId of pendingImageIds) {
        const result = await materializeMutation.mutateAsync({
          seriesId,
          productId: selectedProductId,
          imageId,
        });
        added.push({
          mediaAssetId: result.mediaAssetId,
          source: "marketplace_capture",
          label: result.label,
          provenance: result.provenance,
        });
      }
      setReferences(current => [...current, ...added]);
      setPendingImageIds([]);
      setMarketplaceOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "เพิ่มภาพจาก Marketplace ไม่สำเร็จ"
            : "Could not add Marketplace images"
      );
    }
  };

  const submit = async () => {
    const parsed = specialTieInInputSchema.safeParse({
      schemaVersion: 1,
      idea,
      referenceType,
      referenceImages: references,
      characterIds,
      durationSeconds,
      aspectRatio: "9:16",
      imageModelId,
      videoModelId,
      dialogueMode,
      dialogueBrief: dialogueBrief.trim() || undefined,
      speakerCharacterIds,
      allowAdditionalCharacters,
      lockCharacterReferences,
      lockReferenceImages,
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          (lang === "th"
            ? "กรอกข้อมูลให้ครบถ้วน"
            : "Complete the required fields")
      );
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        seriesId,
        createIntentId: crypto.randomUUID(),
        input: parsed.data,
      });
      toast.success(
        lang === "th"
          ? "สร้างตอนพิเศษแล้ว ระบบกำลังสร้าง prompt"
          : "Special episode created; prompts are being generated"
      );
      onOpenChange(false);
      onCreated?.(String(result.episodeId));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "สร้างตอนพิเศษไม่สำเร็จ"
            : "Could not create special episode"
      );
    }
  };

  const reset = () => {
    setIdea("");
    setReferences([]);
    setCharacterIds([]);
    setSpeakerCharacterIds([]);
    setDialogueMode("none");
    setDialogueBrief("");
    setImageModelId("");
    setVideoModelId("");
    setMarketplaceOpen(false);
    setPendingImageIds([]);
    setSelectedProductId(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lang === "th"
              ? "สร้างตอนพิเศษ Tie-in"
              : "Create special tie-in episode"}
          </DialogTitle>
          <DialogDescription>
            {lang === "th"
              ? "ใช้สำหรับสินค้า สถานที่ หรือร้านค้า ระบบจะสร้าง prompt ภาพเริ่มต้นและวิดีโอให้อัตโนมัติ โดยไม่ดึงเนื้อเรื่องจากภาพรวม"
              : "For product, location, or store tie-ins. Prompts for start frames and video are generated automatically without using the normal Overview story."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="special-tie-in-idea">
              {lang === "th" ? "ไอเดียหรือโจทย์" : "Idea or brief"}
            </Label>
            <Textarea
              id="special-tie-in-idea"
              value={idea}
              onChange={event => setIdea(event.target.value)}
              maxLength={5000}
              rows={6}
              placeholder={
                lang === "th"
                  ? "อธิบายสิ่งที่ต้องการให้เกิดขึ้นในตอนพิเศษ…"
                  : "Describe what should happen in the special episode…"
              }
            />
            <p className="text-right text-xs text-muted-foreground">
              {idea.length}/5000
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              {lang === "th" ? "ประเภทสิ่งอ้างอิง" : "Reference type"}
            </Label>
            <Select
              value={referenceType}
              onValueChange={value => setReferenceType(value as ReferenceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">
                  {lang === "th" ? "สินค้า" : "Product"}
                </SelectItem>
                <SelectItem value="location">
                  {lang === "th" ? "สถานที่" : "Location"}
                </SelectItem>
                <SelectItem value="store">
                  {lang === "th" ? "ร้านค้า" : "Store"}
                </SelectItem>
                <SelectItem value="mixed">
                  {lang === "th" ? "ผสม" : "Mixed"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            className="space-y-2"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file)
                void uploadReference(file).catch(error =>
                  toast.error(
                    error instanceof Error ? error.message : "Upload failed"
                  )
                );
            }}
          >
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              {lang === "th"
                ? "ลากภาพมาวางที่นี่ หรือเลือกจากเครื่อง/Marketplace Capture"
                : "Drop an image here, or choose from your device/Marketplace Capture"}
            </p>
            <div className="flex items-center justify-between">
              <Label>
                {lang === "th"
                  ? "ภาพสินค้า/สถานที่/ร้านค้า"
                  : "Product/location/store images"}
              </Label>
              <Badge variant="outline">{references.length}/3</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {references.map(reference => (
                <div
                  key={reference.mediaAssetId}
                  className="flex items-center justify-between rounded-md border p-2 text-xs"
                >
                  <span className="truncate">
                    {reference.label ?? reference.source}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setReferences(current =>
                        current.filter(
                          item => item.mediaAssetId !== reference.mediaAssetId
                        )
                      )
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  references.length >= 3 ||
                  uploadMutation.isPending ||
                  registerUploadMutation.isPending
                }
                onClick={() =>
                  document.getElementById("special-tie-in-upload")?.click()
                }
              >
                <Upload className="mr-2 h-4 w-4" />
                {lang === "th"
                  ? "ลาก/เลือกภาพจากเครื่อง"
                  : "Drop/choose upload"}
              </Button>
              <input
                id="special-tie-in-upload"
                className="hidden"
                type="file"
                accept="image/*"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file)
                    void uploadReference(file).catch(error =>
                      toast.error(
                        error instanceof Error ? error.message : "Upload failed"
                      )
                    );
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={references.length >= 3}
                onClick={() => setMarketplaceOpen(true)}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                {lang === "th"
                  ? "เลือกจาก Marketplace Capture"
                  : "Choose from Marketplace Capture"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {lang === "th"
                ? "ตัวละครจากซีรีย์ (เลือกได้สูงสุด 4 คน)"
                : "Series characters (up to 4)"}
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {characters.map(character => {
                const id = String(character.id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedCharacters.has(id)}
                      onCheckedChange={() => toggleCharacter(id)}
                    />
                    <span>
                      {character.name ?? character.characterName ?? id}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                {lang === "th" ? "ความยาวต่อช็อต" : "Duration per shot"}
              </Label>
              <Select
                value={String(durationSeconds)}
                onValueChange={value => setDurationSeconds(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIAL_TIE_IN_DURATIONS_SECONDS.map(value => (
                    <SelectItem key={value} value={String(value)}>
                      {value} {lang === "th" ? "วินาที" : "seconds"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === "th" ? "โหมดบทพูด" : "Dialogue mode"}</Label>
              <Select
                value={dialogueMode}
                onValueChange={value => {
                  const next = value as "none" | "character_dialogue";
                  setDialogueMode(next);
                  if (next === "none") setSpeakerCharacterIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {lang === "th" ? "ไม่มีบทพูด" : "No dialogue"}
                  </SelectItem>
                  <SelectItem value="character_dialogue">
                    {lang === "th" ? "ให้ตัวละครพูด" : "Character dialogue"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {dialogueMode === "character_dialogue" ? (
            <div className="space-y-2">
              <Label>
                {lang === "th"
                  ? "ผู้พูด (เลือกได้สูงสุด 3 คน)"
                  : "Speakers (up to 3)"}
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {characters
                  .filter(character =>
                    selectedCharacters.has(String(character.id))
                  )
                  .map(character => {
                    const id = String(character.id);
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-2 rounded-md border p-2 text-sm"
                      >
                        <Checkbox
                          checked={speakerCharacterIds.includes(id)}
                          onCheckedChange={checked =>
                            setSpeakerCharacterIds(current =>
                              checked
                                ? toggleBoundedSelection(current, id, 3)
                                : current.filter(value => value !== id)
                            )
                          }
                        />
                        <span>
                          {character.name ?? character.characterName ?? id}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <Textarea
                value={dialogueBrief}
                onChange={event => setDialogueBrief(event.target.value)}
                maxLength={3000}
                rows={3}
                placeholder={
                  lang === "th"
                    ? "แนวทางบทพูด (ไม่บังคับ)…"
                    : "Dialogue guidance (optional)…"
                }
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                {lang === "th"
                  ? "Model สร้างภาพ (เฉพาะตอนนี้)"
                  : "Image model (episode only)"}
              </Label>
              <Select value={imageModelId} onValueChange={setImageModelId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {imageModels.map(model => (
                    <SelectItem key={model.modelId} value={model.modelId}>
                      {model.label ?? model.modelId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {lang === "th"
                  ? "Model สร้างวิดีโอ (เฉพาะตอนนี้)"
                  : "Video model (episode only)"}
              </Label>
              <Select value={videoModelId} onValueChange={setVideoModelId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {videoModels.map(model => (
                    <SelectItem key={model.modelId} value={model.modelId}>
                      {model.label ?? model.modelId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allowAdditionalCharacters}
                onCheckedChange={value =>
                  setAllowAdditionalCharacters(Boolean(value))
                }
              />
              {lang === "th"
                ? "อนุญาตตัวละคร/ตัวประกอบเพิ่ม"
                : "Allow extra characters"}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={lockCharacterReferences}
                onCheckedChange={value =>
                  setLockCharacterReferences(Boolean(value))
                }
              />
              {lang === "th" ? "ล็อกภาพคน" : "Lock people"}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={lockReferenceImages}
                onCheckedChange={value =>
                  setLockReferenceImages(Boolean(value))
                }
              />
              {lang === "th" ? "ล็อกภาพอ้างอิง" : "Lock references"}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => void submit()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {lang === "th"
              ? "สร้างตอนพิเศษและ Prompt"
              : "Create episode & prompts"}
          </Button>
        </DialogFooter>

        <Dialog open={marketplaceOpen} onOpenChange={setMarketplaceOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {lang === "th"
                  ? "เลือกภาพจาก Marketplace Capture"
                  : "Choose Marketplace Capture images"}
              </DialogTitle>
              <DialogDescription>
                {lang === "th"
                  ? "ค้นหาสินค้า เลือกรายการ แล้วเลือกภาพที่ต้องการ ระบบจะนำเข้าเป็น managed media ให้เอง"
                  : "Search a product, open it, then choose exact images. They are imported as managed media."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={productQuery}
                  onChange={event => setProductQuery(event.target.value)}
                  placeholder={
                    lang === "th" ? "ค้นหารายการสินค้า…" : "Search products…"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void productsQuery.refetch()}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((product: any) => (
                  <Button
                    key={product.id}
                    type="button"
                    variant={
                      selectedProductId === product.id ? "secondary" : "outline"
                    }
                    className="h-auto justify-start p-2 text-left"
                    onClick={() => {
                      setSelectedProductId(String(product.id));
                      setPendingImageIds([]);
                    }}
                  >
                    <span className="truncate">
                      {product.productName ?? product.name ?? product.id}
                    </span>
                  </Button>
                ))}
              </div>
              {selectedProductId ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {productImages.map((image: any) => {
                    const selected = pendingImageIds.includes(String(image.id));
                    return (
                      <button
                        key={image.id}
                        type="button"
                        className={`overflow-hidden rounded-md border text-left ${selected ? "ring-2 ring-primary" : ""}`}
                        onClick={() =>
                          setPendingImageIds(current =>
                            selected
                              ? current.filter(id => id !== String(image.id))
                              : current.length >= 3 - references.length
                                ? current
                                : [...current, String(image.id)]
                          )
                        }
                      >
                        <img
                          src={image.url}
                          alt={image.imageType ?? "Marketplace image"}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="block truncate p-1 text-xs">
                          {image.imageType ?? "image"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lang === "th"
                    ? "เลือกรายการสินค้าเพื่อดูภาพ"
                    : "Choose a product to view its images"}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMarketplaceOpen(false)}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={
                  pendingImageIds.length === 0 || materializeMutation.isPending
                }
                onClick={() => void confirmMarketplaceImages()}
              >
                {materializeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {lang === "th" ? "เพิ่มภาพที่เลือก" : "Add selected images"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
