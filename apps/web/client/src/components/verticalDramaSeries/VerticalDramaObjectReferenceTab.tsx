import { useEffect, useState } from "react";
import {
  Archive,
  Box,
  Loader2,
  Pencil,
  Plus,
  Star,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ImageSourcePicker from "@/components/media/ImageSourcePicker";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  VerticalDramaProductTieInTab,
  type VerticalDramaProductTieIn,
} from "@/components/verticalDramaSeries/VerticalDramaProductTieInTab";

type Props = {
  lang: "th" | "en";
  seriesId: string;
  readOnly: boolean;
  productTieIn: VerticalDramaProductTieIn | null | undefined;
  onSaved?: () => void;
};

type ObjectReferenceListItem = {
  id: string;
  name: string;
  description?: string | null;
  canonicalPrompt?: string | null;
  mode: string;
  status: string;
  assets?: Array<{
    id: string;
    label?: string | null;
    mediaAssetUrl?: string | null;
    role?: string;
  }>;
};

export function VerticalDramaObjectReferenceTab({
  lang,
  seriesId,
  readOnly,
  productTieIn,
  onSaved,
}: Props) {
  const isTh = lang === "th";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canonicalPrompt, setCanonicalPrompt] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promptObjectId, setPromptObjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [productEditorOpen, setProductEditorOpen] = useState(
    Boolean(productTieIn?.enabled)
  );
  const [assetUrlsByObject, setAssetUrlsByObject] = useState<
    Record<string, string[]>
  >({});
  const utils = trpc.useUtils();
  const capabilitiesQuery =
    trpc.verticalDramaSeries.objectReferenceCapabilities.useQuery({
      seriesId,
    });
  const objectCatalogEnabled = capabilitiesQuery.data?.objectCatalog === true;
  const objectImageGenerationEnabled =
    capabilitiesQuery.data?.objectImageGeneration === true;
  const objectsQuery = trpc.verticalDramaSeries.listObjectReferences.useQuery({
    seriesId,
  });
  const createObject =
    trpc.verticalDramaSeries.createObjectReference.useMutation();
  const addAsset =
    trpc.verticalDramaSeries.addObjectReferenceAsset.useMutation();
  const resolveAsset =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();
  const archiveObject =
    trpc.verticalDramaSeries.archiveObjectReference.useMutation();
  const updateObject =
    trpc.verticalDramaSeries.updateObjectReference.useMutation();
  const removeAsset =
    trpc.verticalDramaSeries.removeObjectReferenceAsset.useMutation();
  const setCanonicalAsset =
    trpc.verticalDramaSeries.setObjectReferenceCanonicalAsset.useMutation();
  const upload = trpc.ai.upload.useMutation();
  const objectReferences = (objectsQuery.data ??
    []) as ObjectReferenceListItem[];
  const promptPreviewQuery =
    trpc.verticalDramaSeries.previewObjectReferencePrompt.useQuery(
      { objectReferenceId: promptObjectId ?? "" },
      { enabled: objectCatalogEnabled && Boolean(promptObjectId) }
    );
  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = imageModelsQuery.data?.models ?? [];
  const [selectedImageModelId, setSelectedImageModelId] = useState("");
  const [generateObjectId, setGenerateObjectId] = useState<string | null>(null);
  const [generatedObjectId, setGeneratedObjectId] = useState<string | null>(
    null
  );
  const [generationTaskId, setGenerationTaskId] = useState<string | null>(null);
  const generateObjectImage =
    trpc.verticalDramaSeries.generateObjectReferenceImage.useMutation({
      onSuccess: result => {
        setGenerationTaskId(result.taskId);
        setGeneratedObjectId(generateObjectId);
        setGenerateObjectId(null);
        toast.success(
          isTh
            ? `ส่งงานสร้างภาพแล้ว ใช้เครดิต ${result.creditCost ?? 0}`
            : `Image task submitted (${result.creditCost ?? 0} credits)`
        );
      },
      onError: error => toast.error(error.message),
    });
  const applyObjectImage =
    trpc.verticalDramaSeries.applyGeneratedObjectReferenceImage.useMutation({
      onSuccess: async () => {
        setGenerationTaskId(null);
        setGeneratedObjectId(null);
        await utils.verticalDramaSeries.listObjectReferences.invalidate({
          seriesId,
        });
        toast.success(isTh ? "เพิ่มภาพที่สร้างแล้ว" : "Generated image added");
      },
      onError: error => toast.error(error.message),
    });
  const generationTaskQuery = trpc.media.getTask.useQuery(
    { taskId: generationTaskId ?? "" },
    {
      enabled: Boolean(generationTaskId),
      refetchInterval: query =>
        query.state.data?.status === "completed" ||
        query.state.data?.status === "failed"
          ? false
          : 2500,
    }
  );
  useEffect(() => {
    if (!selectedImageModelId && imageModels[0]?.modelId) {
      setSelectedImageModelId(imageModels[0].modelId);
    }
  }, [imageModels, selectedImageModelId]);

  async function uploadFiles(files: FileList | File[]) {
    const urls: string[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(reader.error ?? new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const result = await upload.mutateAsync({
        fileName: file.name,
        fileType: file.type,
        fileBase64: base64,
      });
      urls.push(result.url);
    }
    return urls;
  }

  async function createReference() {
    if (!name.trim() || readOnly || !objectCatalogEnabled) return;
    setBusy(true);
    try {
      const object = await createObject.mutateAsync({
        seriesId,
        name: name.trim(),
        description: description.trim() || undefined,
        canonicalPrompt: canonicalPrompt.trim() || undefined,
        mode: "story_object",
        source: selectedUrls.length ? "uploaded" : "manual",
      });
      for (const [index, url] of selectedUrls.entries()) {
        const resolved = await resolveAsset.mutateAsync({
          seriesId,
          source: "url",
          url,
          mimeType: "image/jpeg",
          fileName: `${name.trim()}.jpg`,
        });
        await addAsset.mutateAsync({
          objectReferenceId: object.id,
          mediaAssetId: resolved.mediaAssetId,
          role: index === 0 ? "canonical" : "alternate",
          source: "uploaded",
        });
      }
      setName("");
      setDescription("");
      setCanonicalPrompt("");
      setSelectedUrls([]);
      await utils.verticalDramaSeries.listObjectReferences.invalidate({
        seriesId,
      });
      toast.success(
        isTh ? "บันทึกวัตถุประกอบฉากแล้ว" : "Object reference saved"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isTh
            ? "บันทึกไม่สำเร็จ"
            : "Save failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function attachAssets(
    objectReferenceId: string,
    objectName: string,
    urls: string[]
  ) {
    try {
      for (const url of urls) {
        const resolved = await resolveAsset.mutateAsync({
          seriesId,
          source: "url",
          url,
          mimeType: "image/jpeg",
          fileName: `${objectName}.jpg`,
        });
        await addAsset.mutateAsync({
          objectReferenceId,
          mediaAssetId: resolved.mediaAssetId,
          role: "alternate",
          source: "library",
        });
      }
      setAssetUrlsByObject(current => ({
        ...current,
        [objectReferenceId]: [],
      }));
      await utils.verticalDramaSeries.listObjectReferences.invalidate({
        seriesId,
      });
      toast.success(isTh ? "เพิ่มภาพอ้างอิงแล้ว" : "Reference image added");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isTh
            ? "เพิ่มภาพไม่สำเร็จ"
            : "Could not add image"
      );
    }
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    await updateObject.mutateAsync({
      objectReferenceId: editingId,
      name: editName.trim(),
      description: editDescription.trim() || null,
    });
    setEditingId(null);
    await utils.verticalDramaSeries.listObjectReferences.invalidate({
      seriesId,
    });
  }

  return (
    <section className="grid w-full min-w-0 gap-6">
      <Card className="w-full overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Box className="h-4 w-4" aria-hidden="true" />
                {isTh
                  ? "วัตถุประกอบฉาก (Object Reference)"
                  : "Object Reference"}
              </CardTitle>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {isTh
                  ? "พื้นที่กลางสำหรับรวมวัตถุสำคัญของเรื่อง ภาพจากเครื่อง Library และสินค้าผูกเรื่อง เพื่อใช้เป็น reference ซ้ำในทุกช็อต"
                  : "A central workspace for story objects, images from your device or Library, and Product tie-ins that can be reused across shots."}
              </p>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    document
                      .getElementById("vd-object-create-form")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    document.getElementById("vd-object-name")?.focus();
                  }}
                  disabled={!objectCatalogEnabled}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {isTh ? "เพิ่มวัตถุ" : "Add object"}
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => setProductEditorOpen(true)}
                  disabled={!objectCatalogEnabled}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {isTh ? "เพิ่มสินค้า" : "Add product"}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        {!objectCatalogEnabled && !capabilitiesQuery.isLoading && (
          <p className="mx-6 mb-5 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            {isTh
              ? "ฟังก์ชันวัตถุประกอบฉากยังไม่เปิดใช้สำหรับ tenant นี้ การสร้าง storyboard ยังทำต่อได้ตามปกติ"
              : "Object Reference is not enabled for this tenant. Storyboard creation continues normally."}
          </p>
        )}
        {!readOnly && objectCatalogEnabled && (
          <CardContent
            id="vd-object-create-form"
            className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]"
          >
            <div className="grid content-start gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="vd-object-name">
                  {isTh ? "ชื่อวัตถุ" : "Object name"}
                </Label>
                <Input
                  id="vd-object-name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder={
                    isTh
                      ? "เช่น กล่องไม้ของคุณปู่"
                      : "e.g. Grandfather's locked wooden box"
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-object-description">
                  {isTh ? "บริบท/คำอธิบาย" : "Context / description"}
                </Label>
                <Textarea
                  id="vd-object-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  rows={2}
                  placeholder={
                    isTh
                      ? "วัตถุนี้มีความสำคัญต่อเรื่องอย่างไร"
                      : "Why this object matters to the story"
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-object-prompt">
                  {isTh
                    ? "รายละเอียดคงที่สำหรับสร้างภาพ"
                    : "Canonical image prompt"}
                </Label>
                <Textarea
                  id="vd-object-prompt"
                  value={canonicalPrompt}
                  onChange={event => setCanonicalPrompt(event.target.value)}
                  rows={3}
                  placeholder={
                    isTh
                      ? "ลักษณะที่ต้องคงเดิม เช่น รูปทรง ลายแกะสลัก สี กลอนล็อก"
                      : "Details that must stay consistent: shape, carving, color, lock"
                  }
                />
              </div>
            </div>
            <ImageSourcePicker
              value={selectedUrls}
              onChange={setSelectedUrls}
              onUpload={uploadFiles}
              maxImages={6}
              label={isTh ? "ภาพอ้างอิงวัตถุ" : "Object reference images"}
              helpText={
                isTh
                  ? "ลากจาก Library หรือฮาร์ดดิสก์มาวางได้ ภาพจะถูกส่งเป็น reference ตอนสร้างภาพ"
                  : "Drop from Library or your hard disk; images are sent as generation references."
              }
              language={lang}
              disabled={busy || upload.isPending}
              dropZone
            />
            <Button
              className="w-fit gap-2 lg:col-span-2"
              onClick={() => void createReference()}
              disabled={!objectCatalogEnabled || busy || !name.trim()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {isTh ? "เพิ่มวัตถุ" : "Add object"}
            </Button>
          </CardContent>
        )}
      </Card>

      <Card className="w-full">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {isTh ? "คลังวัตถุประกอบฉาก" : "Object reference catalog"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isTh
                  ? "เลือกภาพหลักและภาพสำรองเพื่อคุมรูปร่างของวัตถุให้ต่อเนื่อง"
                  : "Use a canonical image and alternates to keep the object consistent."}
              </p>
            </div>
            <Badge variant="outline">
              {objectReferences.length} {isTh ? "รายการ" : "items"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5">
          {objectsQuery.isError && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {isTh
                ? "โหลดคลังวัตถุไม่สำเร็จ แต่การสร้าง storyboard ยังทำต่อได้"
                : "Could not load the object catalog; storyboard creation can continue."}
            </p>
          )}
          {objectReferences.map(object => (
            <Card
              key={object.id}
              className={
                object.status === "archived" ? "w-full opacity-60" : "w-full"
              }
            >
              <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{object.name}</h3>
                    <Badge
                      variant={
                        object.mode === "commercial_tie_in"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {object.mode === "commercial_tie_in"
                        ? isTh
                          ? "Product tie-in"
                          : "Commercial"
                        : isTh
                          ? "วัตถุในเรื่อง"
                          : "Story object"}
                    </Badge>
                  </div>
                  {editingId === object.id ? (
                    <div className="grid max-w-xl gap-2">
                      <Input
                        value={editName}
                        onChange={event => setEditName(event.target.value)}
                        aria-label={isTh ? "ชื่อวัตถุ" : "Object name"}
                      />
                      <Textarea
                        value={editDescription}
                        onChange={event =>
                          setEditDescription(event.target.value)
                        }
                        rows={2}
                        aria-label={
                          isTh ? "คำอธิบายวัตถุ" : "Object description"
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => void saveEdit()}
                        >
                          <Save className="h-4 w-4" aria-hidden="true" />
                          {isTh ? "บันทึก" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          {isTh ? "ยกเลิก" : "Cancel"}
                        </Button>
                      </div>
                    </div>
                  ) : object.description ? (
                    <p className="text-sm text-muted-foreground">
                      {object.description}
                    </p>
                  ) : null}
                  {object.canonicalPrompt && (
                    <p className="text-xs text-muted-foreground">
                      {object.canonicalPrompt}
                    </p>
                  )}
                  {!readOnly && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPromptObjectId(object.id)}
                        disabled={promptPreviewQuery.isFetching}
                      >
                        {isTh
                          ? "สร้าง prompt จากบริบท"
                          : "Build context prompt"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setPromptObjectId(object.id);
                          setGenerateObjectId(object.id);
                        }}
                        disabled={
                          !objectImageGenerationEnabled ||
                          imageModelsQuery.isLoading ||
                          !imageModels.length
                        }
                      >
                        {isTh
                          ? "สร้างภาพวัตถุ (มีค่าใช้จ่าย)"
                          : "Generate object image (paid)"}
                      </Button>
                      {promptObjectId === object.id &&
                        promptPreviewQuery.data && (
                          <p className="basis-full rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                            {promptPreviewQuery.data.prompt}
                          </p>
                        )}
                      {generationTaskId && generatedObjectId === object.id && (
                        <div className="basis-full rounded-md border bg-muted/30 p-2 text-xs">
                          {generationTaskQuery.data?.status === "completed"
                            ? isTh
                              ? "ภาพพร้อมนำเข้าแล้ว"
                              : "Image is ready to import"
                            : generationTaskQuery.data?.status === "failed"
                              ? isTh
                                ? "ผู้ให้บริการสร้างภาพไม่สำเร็จ กดสร้างใหม่ได้"
                                : "Image generation failed; you can retry."
                              : isTh
                                ? "กำลังสร้างภาพ…"
                                : "Generating image…"}
                          {generationTaskQuery.data?.status === "completed" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="ml-2"
                              disabled={applyObjectImage.isPending}
                              onClick={() =>
                                applyObjectImage.mutate({
                                  seriesId,
                                  objectReferenceId: object.id,
                                  taskId: generationTaskId,
                                  role: "alternate",
                                })
                              }
                            >
                              {isTh ? "เพิ่มเข้าคลัง" : "Add to catalog"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(object.assets ?? []).map(asset =>
                      asset.mediaAssetUrl ? (
                        <span key={asset.id} className="relative block">
                          <AuthenticatedMediaImage
                            src={asset.mediaAssetUrl}
                            alt={asset.label || object.name}
                            className="h-20 w-20 rounded-md border object-cover"
                          />
                          {!readOnly && (
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="absolute -right-2 -top-2 h-5 w-5 rounded-full"
                              onClick={async () => {
                                await removeAsset.mutateAsync({
                                  assetId: asset.id,
                                });
                                await utils.verticalDramaSeries.listObjectReferences.invalidate(
                                  { seriesId }
                                );
                              }}
                              aria-label={
                                isTh ? "ลบภาพอ้างอิง" : "Remove reference image"
                              }
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          )}
                          {!readOnly && (
                            <Button
                              type="button"
                              size="icon"
                              variant={
                                asset.role === "canonical"
                                  ? "default"
                                  : "secondary"
                              }
                              className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full"
                              onClick={async () => {
                                await setCanonicalAsset.mutateAsync({
                                  objectReferenceId: object.id,
                                  assetId: asset.id,
                                });
                                await utils.verticalDramaSeries.listObjectReferences.invalidate(
                                  {
                                    seriesId,
                                  }
                                );
                              }}
                              aria-label={
                                isTh
                                  ? "ตั้งเป็นภาพอ้างอิงหลัก"
                                  : "Set as canonical reference"
                              }
                              title={
                                isTh
                                  ? "ตั้งเป็นภาพอ้างอิงหลัก"
                                  : "Set as canonical reference"
                              }
                            >
                              <Star className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          )}
                        </span>
                      ) : null
                    )}
                  </div>
                  {!readOnly && object.status !== "archived" && (
                    <div className="grid gap-2">
                      <ImageSourcePicker
                        value={assetUrlsByObject[object.id] ?? []}
                        onChange={urls => {
                          setAssetUrlsByObject(current => ({
                            ...current,
                            [object.id]: urls,
                          }));
                          if (urls.length > 0)
                            void attachAssets(object.id, object.name, urls);
                        }}
                        onUpload={uploadFiles}
                        maxImages={6}
                        label={isTh ? "เพิ่มภาพอ้างอิง" : "Add reference image"}
                        language={lang}
                        disabled={busy || upload.isPending}
                        dropZone
                      />
                      {editingId !== object.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => {
                            setEditingId(object.id);
                            setEditName(object.name);
                            setEditDescription(object.description ?? "");
                          }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          {isTh ? "แก้ไข" : "Edit"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {!readOnly && object.status !== "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={async () => {
                      await archiveObject.mutateAsync({
                        objectReferenceId: object.id,
                      });
                      await utils.verticalDramaSeries.listObjectReferences.invalidate(
                        { seriesId }
                      );
                    }}
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    {isTh ? "เก็บถาวร" : "Archive"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!objectsQuery.isLoading && objectReferences.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {isTh
                  ? "ยังไม่มีวัตถุประกอบฉาก — เพิ่มภาพกล่อง แหวน หยก หรืออาวุธสำคัญของเรื่องได้ที่ด้านบน"
                  : "No object references yet. Add a box, ring, jade, weapon, or other story-critical object above."}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <section
        id="vd-product-tie-in-editor"
        className="w-full rounded-lg border bg-muted/20 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">
              {isTh ? "สินค้า / Product tie-in" : "Product tie-in"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isTh
                ? "ใช้พื้นที่เดียวกับวัตถุประกอบฉาก และยังคงฟังก์ชัน Marketplace capture กับการตั้งค่าการโฆษณาเดิม"
                : "Use the same central workspace while preserving Marketplace capture and existing advertising settings."}
            </p>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setProductEditorOpen(open => !open)}
              aria-expanded={productEditorOpen}
              aria-controls="vd-product-tie-in-fields"
            >
              {productEditorOpen
                ? isTh
                  ? "ซ่อนการตั้งค่า"
                  : "Hide settings"
                : isTh
                  ? "เพิ่มสินค้า"
                  : "Add product"}
            </Button>
          )}
        </div>
        {productEditorOpen ? (
          <div id="vd-product-tie-in-fields" className="mt-4 w-full">
            <VerticalDramaProductTieInTab
              lang={lang}
              seriesId={seriesId}
              productTieIn={productTieIn}
              readOnly={readOnly}
              onSaved={onSaved}
            />
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed bg-background/60 p-4 text-sm text-muted-foreground">
            {isTh
              ? "ยังไม่มีสินค้าผูกเรื่อง กด “เพิ่มสินค้า” เพื่อเลือกสินค้าจาก Marketplace capture หรือเปิดใช้ Product tie-in เดิม"
              : "No product tie-in is configured. Select “Add product” to choose a Marketplace capture or enable the existing Product tie-in flow."}
          </p>
        )}
      </section>
      <AlertDialog
        open={Boolean(generateObjectId)}
        onOpenChange={open => {
          if (!open && !generateObjectImage.isPending)
            setGenerateObjectId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isTh
                ? "ยืนยันการสร้างภาพวัตถุ"
                : "Confirm object image generation"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTh
                ? "การสร้างภาพจะใช้เครดิตตามโมเดลที่เลือก ภาพจะถูกเก็บเป็นภาพสำรองก่อน และคุณเลือกเป็นภาพหลักได้ภายหลัง"
                : "This action spends credits based on the selected model. The result is added as an alternate asset first; you can make it canonical later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="vd-object-generation-model">
              {isTh ? "โมเดลภาพ" : "Image model"}
            </Label>
            <select
              id="vd-object-generation-model"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={selectedImageModelId}
              onChange={event => setSelectedImageModelId(event.target.value)}
              aria-label={isTh ? "เลือกโมเดลภาพ" : "Choose image model"}
            >
              {imageModels.map(model => (
                <option key={model.modelId} value={model.modelId}>
                  {model.name ?? model.modelId}
                  {model.creditCost != null
                    ? ` — ${model.creditCost} credits`
                    : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {promptObjectId === generateObjectId && promptPreviewQuery.data
                ? promptPreviewQuery.data.prompt
                : isTh
                  ? "กำลังเตรียม prompt จากบริบท…"
                  : "Preparing the context prompt…"}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generateObjectImage.isPending}>
              {isTh ? "ยกเลิก" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                generateObjectImage.isPending ||
                !selectedImageModelId ||
                promptObjectId !== generateObjectId ||
                !promptPreviewQuery.data?.prompt
              }
              onClick={event => {
                event.preventDefault();
                if (!generateObjectId || !promptPreviewQuery.data?.prompt)
                  return;
                generateObjectImage.mutate({
                  seriesId,
                  objectReferenceId: generateObjectId,
                  selectedImageModelId,
                  confirmation: true,
                  idempotencyKey: `object-image:${generateObjectId}:${Date.now()}`,
                });
              }}
            >
              {generateObjectImage.isPending
                ? isTh
                  ? "กำลังส่งงาน…"
                  : "Submitting…"
                : isTh
                  ? "ยืนยันและใช้เครดิต"
                  : "Confirm and spend credits"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
