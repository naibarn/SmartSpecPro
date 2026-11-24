import { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useClipboard } from "@astryxdesign/core/hooks";
import { useLightbox } from "@astryxdesign/core/Lightbox";
import { trpc } from "@/lib/trpc";
import {
  AuthenticatedMediaImage,
  fetchAuthenticatedMedia,
  getAuthenticatedMediaUrl,
} from "@/components/media/AuthenticatedMediaImage";
import type {
  ReferenceManifestItem,
  StagedReviewState,
} from "./StagedCheckpointReviewPanel";

type CaptionSourceOption = {
  value: string;
  label: string;
  sourceType: "product" | "shot";
  referenceIndex?: number;
  shotId?: number;
};

type SocialImageVariant =
  "caption_source" | "character_reference" | "product_reference";

const SOCIAL_IMAGE_VARIANTS: Array<{
  key: SocialImageVariant;
  label: string;
}> = [
  { key: "caption_source", label: "ภาพจากต้นทางของ Caption" },
  { key: "character_reference", label: "ภาพจากตัวละครอ้างอิง" },
  { key: "product_reference", label: "ภาพจากสินค้าอ้างอิง" },
];

const ACTIVE_JOB_STATUSES = new Set([
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
]);

function captionSourceOptions(
  state: StagedReviewState | undefined
): CaptionSourceOption[] {
  const productImages = (state?.referenceManifest ?? [])
    .filter(
      (item: ReferenceManifestItem) =>
        item.active && item.role !== "character" && item.url.trim()
    )
    .map(item => ({
      value: `product:${item.index}`,
      label: `รูปสินค้า · ${item.label?.trim() || `รูปที่ ${item.index}`}`,
      sourceType: "product" as const,
      referenceIndex: item.index,
    }));
  const shotImages = (state?.shots ?? [])
    .filter(
      shot => shot.imageArtifactUrl?.trim() && shot.imageArtifactHash?.trim()
    )
    .map(shot => ({
      value: `shot:${shot.shotId}`,
      label: `ภาพเริ่มต้น · Shot ${shot.shotId}${shot.title ? ` · ${shot.title}` : ""}`,
      sourceType: "shot" as const,
      shotId: shot.shotId,
    }));
  return [...productImages, ...shotImages];
}

export function StagedSocialCaptionComposer(props: {
  runId: string;
  state?: StagedReviewState | null;
  onRefresh: () => void | Promise<unknown>;
}) {
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedImageModel, setSelectedImageModel] = useState("");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<
    "4:5" | "9:16"
  >("4:5");
  const [actionError, setActionError] = useState<string | null>(null);
  const sourceOptions = useMemo(
    () => captionSourceOptions(props.state ?? undefined),
    [props.state?.referenceManifest, props.state?.shots]
  );
  const selectedOption = sourceOptions.find(
    option => option.value === selectedSource
  );
  const caption = props.state?.socialCaption?.caption ?? "";
  const hasCaption = caption.trim().length > 0;
  const referenceManifest = props.state?.referenceManifest ?? [];
  const characterReferenceCount = referenceManifest.filter(
    item => item.active && item.role === "character" && item.url.trim()
  ).length;
  const productReferenceCount = referenceManifest.filter(
    item => item.active && item.role === "product" && item.url.trim()
  ).length;
  const requiredReferenceCount = Math.max(
    1,
    characterReferenceCount,
    productReferenceCount
  );
  const hashtags = (props.state?.socialCaption?.hashtags ?? [])
    .slice(0, 5)
    .map(tag => `#${tag.replace(/^#+/, "")}`)
    .join(" ");
  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = useMemo(
    () =>
      (imageModelsQuery.data?.models ?? []).filter(model => {
        const maxReferences = Number(model.maxReferenceImages ?? 0);
        const ratios = Array.isArray(model.aspectRatios)
          ? model.aspectRatios.filter(
              (ratio): ratio is string => typeof ratio === "string"
            )
          : [];
        return (
          maxReferences >= requiredReferenceCount &&
          ratios.includes(selectedAspectRatio)
        );
      }),
    [imageModelsQuery.data?.models, requiredReferenceCount, selectedAspectRatio]
  );
  const postImages = props.state?.socialCaption?.postImages ?? null;
  const latestPostImagesJob = (props.state?.workerOperations ?? []).find(
    operation => operation.operation === "staged_social_post_images_generation"
  );
  const activePostImageJob =
    (props.state?.workerOperations ?? []).some(
      operation =>
        operation.operation === "staged_social_post_images_generation" &&
        ACTIVE_JOB_STATUSES.has(operation.status)
    ) ||
    (["queued", "running"].includes(postImages?.status ?? "") &&
      (!latestPostImagesJob ||
        ACTIVE_JOB_STATUSES.has(latestPostImagesJob.status)));
  const activeCaptionJob = (props.state?.workerOperations ?? []).some(
    operation =>
      operation.operation === "staged_social_caption_generation" &&
      ACTIVE_JOB_STATUSES.has(operation.status)
  );
  const latestCaptionJob = (props.state?.workerOperations ?? []).find(
    operation => operation.operation === "staged_social_caption_generation"
  );
  const captionClipboard = useClipboard({ announce: "คัดลอก Caption แล้ว" });
  const hashtagClipboard = useClipboard({ announce: "คัดลอก Hashtag แล้ว" });
  const galleryImages = useMemo(
    () =>
      SOCIAL_IMAGE_VARIANTS.flatMap(variant => {
        const image = postImages?.variants[variant.key];
        return image?.status === "completed" && image.imageUrl
          ? [
              {
                key: variant.key,
                label: variant.label,
                src: image.imageUrl,
                alt: `${variant.label} · ${image.sourceLabel || ""}`.trim(),
              },
            ]
          : [];
      }),
    [postImages]
  );
  const lightbox = useLightbox({
    media:
      galleryImages.length > 0
        ? galleryImages.map(image => ({
            src: getAuthenticatedMediaUrl(image.src) ?? image.src,
            alt: image.alt,
            caption: image.label,
          }))
        : [{ src: "", alt: "ภาพสำหรับโพสต์" }],
    hasZoom: true,
  });
  const mutation =
    trpc.marketplaceCapture.generateStagedAutoReviewSocialCaption.useMutation({
      onSuccess: async () => {
        setActionError(null);
        await props.onRefresh();
      },
      onError: (error: { message: string }) => {
        const message = error.message;
        setActionError(
          message === "staged_state_drift"
            ? "ข้อมูลเปลี่ยนระหว่างสร้าง Caption แล้ว กรุณารอรีเฟรชและลองใหม่"
            : message.includes("INSUFFICIENT_CREDITS")
              ? "เครดิตไม่เพียงพอสำหรับสร้าง Caption"
              : message.includes("product_image_unavailable") ||
                  message.includes("shot_image_unavailable")
                ? "ภาพต้นทางไม่พร้อมใช้งานแล้ว กรุณาเลือกภาพใหม่"
                : "ส่งงานสร้าง Caption ไม่สำเร็จ กรุณาลองอีกครั้ง"
        );
      },
    });
  const postImagesMutation =
    trpc.marketplaceCapture.generateStagedAutoReviewSocialPostImages.useMutation(
      {
        onSuccess: async () => {
          setActionError(null);
          await props.onRefresh();
        },
        onError: (error: { message: string }) => {
          const message = error.message;
          setActionError(
            message === "staged_state_drift"
              ? "Caption หรือภาพอ้างอิงเปลี่ยนระหว่างส่งงาน กรุณารีเฟรชแล้วลองใหม่"
              : message.includes("INSUFFICIENT_CREDITS")
                ? "เครดิตไม่เพียงพอสำหรับสร้างภาพโพสต์"
                : message.includes("MODEL_UNAVAILABLE") ||
                    message.includes("ASPECT_RATIO_UNSUPPORTED")
                  ? "โมเดลภาพนี้ไม่พร้อมใช้กับอัตราส่วนที่เลือก กรุณาเลือกโมเดลหรืออัตราส่วนใหม่"
                  : message.includes("REFERENCE_LIMIT")
                    ? "โมเดลที่เลือกไม่รองรับภาพอ้างอิงครบตาม job กรุณาเลือกโมเดลที่รองรับภาพอ้างอิงได้มากขึ้น"
                    : message.includes("in_progress")
                      ? "กำลังสร้างภาพชุดนี้อยู่"
                      : "ส่งงานสร้างภาพโพสต์ไม่สำเร็จ กรุณาลองอีกครั้ง"
          );
        },
      }
    );

  useEffect(() => {
    if (
      selectedSource &&
      sourceOptions.some(option => option.value === selectedSource)
    ) {
      return;
    }
    const saved = props.state?.socialCaption;
    const savedSource = saved
      ? saved.sourceType === "product"
        ? `product:${saved.referenceIndex}`
        : `shot:${saved.shotId}`
      : "";
    setSelectedSource(
      sourceOptions.some(option => option.value === savedSource)
        ? savedSource
        : (sourceOptions[0]?.value ?? "")
    );
  }, [props.state?.socialCaption, selectedSource, sourceOptions]);

  useEffect(() => {
    if (
      selectedImageModel &&
      imageModels.some(model => model.modelId === selectedImageModel)
    ) {
      return;
    }
    setSelectedImageModel(imageModels[0]?.modelId ?? "");
  }, [imageModels, selectedImageModel]);

  if (!props.state) return null;

  const generateCaption = () => {
    if (!selectedOption || !props.state?.stateDigest) return;
    setActionError(null);
    mutation.mutate({
      runId: props.runId,
      sourceType: selectedOption.sourceType,
      ...(selectedOption.sourceType === "product"
        ? { referenceIndex: selectedOption.referenceIndex }
        : { shotId: selectedOption.shotId }),
      expectedStateDigest: props.state.stateDigest,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const generateSocialPostImages = (options?: {
    batchId?: string;
    expectedRequestHash?: string;
    variants?: SocialImageVariant[];
    modelId?: string;
    aspectRatio?: "4:5" | "9:16";
  }) => {
    const modelId = options?.modelId ?? selectedImageModel;
    if (!hasCaption || !props.state?.stateDigest || !modelId) {
      return;
    }
    setActionError(null);
    postImagesMutation.mutate({
      runId: props.runId,
      batchId: options?.batchId ?? crypto.randomUUID(),
      expectedStateDigest: props.state.stateDigest,
      ...(options?.expectedRequestHash
        ? { expectedRequestHash: options.expectedRequestHash }
        : {}),
      requestIdempotencyKey: crypto.randomUUID(),
      modelId,
      aspectRatio: options?.aspectRatio ?? selectedAspectRatio,
      variants: options?.variants ?? [
        "caption_source",
        "character_reference",
        "product_reference",
      ],
    });
  };

  const downloadSocialImage = async (
    imageUrl: string,
    variant: SocialImageVariant
  ) => {
    try {
      const blob = await fetchAuthenticatedMedia(imageUrl);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `smartaihub-social-${variant.replaceAll("_", "-")}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setActionError("ดาวน์โหลดภาพไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={3}>Caption สำหรับโพสต์โซเชียล</Heading>
        <Text type="supporting" color="secondary">
          ส่งรายละเอียดสินค้าและภาพที่เลือกให้ Skill สร้าง Caption พร้อม Hashtag
          ที่ได้รับความนิยมและเกี่ยวข้อง สูงสุด 5 รายการ
        </Text>
        <Selector
          label="ภาพต้นทางสำหรับสร้าง Caption"
          options={sourceOptions.map(option => ({
            value: option.value,
            label: option.label,
          }))}
          value={selectedSource}
          onChange={setSelectedSource}
          placeholder="เลือกภาพสินค้า หรือภาพเริ่มต้นของช็อต"
          hasSearch={sourceOptions.length > 8}
          searchPlaceholder="ค้นหารูปสินค้าหรือช็อต"
          emptyText="ยังไม่มีภาพสินค้า"
          isDisabled={sourceOptions.length === 0 || activeCaptionJob}
          width="100%"
        />
        {sourceOptions.length === 0 ? (
          <Text type="supporting" color="secondary">
            ยังไม่มีภาพสินค้า หรือภาพเริ่มต้นของช็อตที่พร้อมใช้
            กรุณาเพิ่มภาพสินค้า หรือสร้างภาพของช็อตก่อน
          </Text>
        ) : null}
        <HStack hAlign="end" wrap="wrap">
          <Button
            label="สร้าง Caption และ Hashtag"
            variant="primary"
            isLoading={mutation.isPending || activeCaptionJob}
            isDisabled={!selectedOption || !props.state.stateDigest}
            onClick={generateCaption}
          />
        </HStack>
        {activeCaptionJob ? (
          <Text type="supporting" color="secondary">
            Skill กำลังสร้าง Caption — หน้านี้จะอัปเดตผลให้อัตโนมัติ
          </Text>
        ) : latestCaptionJob?.status === "failed" ? (
          <Text type="supporting" color="secondary">
            งานสร้างครั้งก่อนล้มเหลว สามารถกดสร้างใหม่ได้
          </Text>
        ) : null}
        {actionError ? (
          <Text type="supporting" color="primary">
            {actionError}
          </Text>
        ) : null}
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" wrap="wrap">
            <Text type="label">Caption</Text>
            <Button
              label={
                captionClipboard.isCopied ? "คัดลอกแล้ว" : "คัดลอก Caption"
              }
              variant="secondary"
              isDisabled={!caption}
              onClick={() => void captionClipboard.copy(caption)}
            />
          </HStack>
          <TextArea
            label="Caption"
            isLabelHidden
            value={caption}
            rows={4}
            maxLength={2000}
            width="100%"
            isReadOnly
            placeholder="Caption ที่ Skill สร้างจะแสดงที่นี่"
            onChange={() => undefined}
          />
        </VStack>
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" wrap="wrap">
            <Text type="label">Hashtag · ไม่เกิน 5 รายการ</Text>
            <Button
              label={
                hashtagClipboard.isCopied ? "คัดลอกแล้ว" : "คัดลอก Hashtag"
              }
              variant="secondary"
              isDisabled={!hashtags}
              onClick={() => void hashtagClipboard.copy(hashtags)}
            />
          </HStack>
          <TextArea
            label="Hashtag ยอดนิยม · ไม่เกิน 5 รายการ"
            isLabelHidden
            value={hashtags}
            rows={2}
            maxLength={309}
            width="100%"
            isReadOnly
            placeholder="Hashtag ที่ Skill สร้างจะแสดงที่นี่"
            onChange={() => undefined}
          />
        </VStack>
        {props.state.socialCaption?.sourceLabel ? (
          <Text type="supporting" color="secondary">
            สร้างจาก {props.state.socialCaption.sourceLabel}
            {props.state.socialCaption.generatedAt
              ? ` · ${new Date(props.state.socialCaption.generatedAt).toLocaleString("th-TH")}`
              : ""}
          </Text>
        ) : null}
        <VStack gap={3}>
          <Heading level={4}>ภาพสำหรับโพสต์ Facebook · 3 ภาพ</Heading>
          <Text type="supporting" color="secondary">
            ภาพแรกใช้ภาพต้นทางที่เลือกสร้าง Caption
            ส่วนอีกสองภาพดึงตัวละครและสินค้าทั้งหมดที่อ้างอิงใน job
            นี้ให้อัตโนมัติ ระบบสร้างเป็นภาพแนวตั้ง และคิดเครดิต prompt
            ตามการใช้งานจริงพร้อมเครดิตภาพตามโมเดล
          </Text>
          {!hasCaption ? (
            <Banner
              status="warning"
              title="ยังขาด Caption"
              description="กรุณากด “สร้าง Caption และ Hashtag” ด้านบนก่อน แล้วจึงสร้างภาพโพสต์ 3 ภาพได้"
              collapsible={false}
            />
          ) : null}
          <Selector
            label="อัตราส่วนภาพโพสต์"
            options={[
              { value: "4:5", label: "4:5 · แนวตั้งสำหรับฟีด" },
              { value: "9:16", label: "9:16 · แนวตั้งเต็มจอ" },
            ]}
            value={selectedAspectRatio}
            onChange={value => setSelectedAspectRatio(value as "4:5" | "9:16")}
            isDisabled={activePostImageJob}
            width="100%"
          />
          <Selector
            label="โมเดล AI สร้างภาพโพสต์"
            options={imageModels.map(model => ({
              value: model.modelId,
              label: `${model.name} · ${model.provider}`,
            }))}
            value={selectedImageModel}
            onChange={setSelectedImageModel}
            placeholder="เลือกโมเดลสร้างภาพโพสต์"
            emptyText={
              imageModelsQuery.isLoading
                ? "กำลังโหลดโมเดลภาพ"
                : `ไม่มีโมเดลที่รองรับภาพอ้างอิงครบ ${requiredReferenceCount} ภาพและอัตราส่วนแนวตั้ง`
            }
            isLoading={imageModelsQuery.isLoading}
            isDisabled={activePostImageJob || imageModels.length === 0}
            hasSearch={imageModels.length > 8}
            searchPlaceholder="ค้นหาโมเดลสร้างภาพ"
            width="100%"
          />
          {imageModelsQuery.isError ? (
            <Text type="supporting" color="primary">
              โหลดรายการโมเดลภาพไม่สำเร็จ กรุณาลองรีเฟรชหน้า
            </Text>
          ) : null}
          <HStack hAlign="end" wrap="wrap">
            <Button
              label={
                postImages
                  ? "สร้างภาพโพสต์ชุดใหม่ 3 ภาพ"
                  : "สร้างภาพโพสต์ 3 ภาพ"
              }
              variant="secondary"
              isLoading={postImagesMutation.isPending || activePostImageJob}
              isDisabled={
                !hasCaption || !props.state.stateDigest || !selectedImageModel
              }
              onClick={() => generateSocialPostImages()}
            />
          </HStack>
          {activePostImageJob ? (
            <Text type="supporting" color="secondary">
              กำลังสร้างภาพโพสต์ — แต่ละภาพจะแสดงทันทีเมื่อสร้างและบันทึกสำเร็จ
            </Text>
          ) : null}
          {postImages ? (
            <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
              {SOCIAL_IMAGE_VARIANTS.map(variant => {
                const image = postImages.variants[variant.key];
                const galleryIndex = galleryImages.findIndex(
                  galleryImage => galleryImage.key === variant.key
                );
                const previousPostImageJobIsTerminal = Boolean(
                  latestPostImagesJob &&
                  !ACTIVE_JOB_STATUSES.has(latestPostImagesJob.status)
                );
                const canRetry =
                  image?.status === "failed" ||
                  ((image?.status === "pending" ||
                    image?.status === "running") &&
                    previousPostImageJobIsTerminal);
                return (
                  <Card key={variant.key} variant="muted">
                    <VStack gap={2}>
                      <Heading level={5}>{variant.label}</Heading>
                      {image?.status === "completed" && image.imageUrl ? (
                        <>
                          <AuthenticatedMediaImage
                            src={image.imageUrl}
                            alt={`${variant.label} · ${image.sourceLabel}`}
                            {...(galleryIndex >= 0
                              ? lightbox.getTriggerProps(galleryIndex)
                              : {})}
                            style={{
                              aspectRatio:
                                postImages.aspectRatio === "9:16"
                                  ? "9 / 16"
                                  : "4 / 5",
                              borderRadius: "var(--radius-md)",
                              cursor: "zoom-in",
                              objectFit: "contain",
                              width: "100%",
                            }}
                          />
                          <Button
                            label="ขยายภาพ"
                            variant="secondary"
                            onClick={() => lightbox.open(galleryIndex)}
                          />
                        </>
                      ) : (
                        <Text type="supporting" color="secondary">
                          {image?.status === "running" ||
                          image?.status === "pending"
                            ? canRetry
                              ? "งานก่อนหน้าหยุดก่อนสร้างภาพนี้ สามารถลองใหม่ได้"
                              : image.status === "running" &&
                                  image.progress !== null
                                ? `กำลังสร้างภาพนี้ (${image.progress}%)`
                                : "กำลังสร้างภาพนี้"
                            : canRetry
                              ? "สร้างภาพนี้ไม่สำเร็จ สามารถลองใหม่ได้"
                              : "รอสร้างภาพ"}
                        </Text>
                      )}
                      {image?.status === "completed" && image.imageUrl ? (
                        <Button
                          label="ดาวน์โหลดภาพ"
                          variant="secondary"
                          onClick={() =>
                            void downloadSocialImage(
                              image.imageUrl!,
                              variant.key
                            )
                          }
                        />
                      ) : canRetry && !activePostImageJob ? (
                        <Button
                          label="ลองสร้างภาพนี้ใหม่"
                          variant="secondary"
                          isLoading={postImagesMutation.isPending}
                          isDisabled={
                            !postImages.requestHash || !postImages.modelId
                          }
                          onClick={() =>
                            generateSocialPostImages({
                              batchId: postImages.batchId,
                              expectedRequestHash: postImages.requestHash,
                              variants: [variant.key],
                              modelId: postImages.modelId,
                              aspectRatio: postImages.aspectRatio,
                            })
                          }
                        />
                      ) : null}
                    </VStack>
                  </Card>
                );
              })}
            </Grid>
          ) : null}
          {lightbox.element}
        </VStack>
      </VStack>
    </Card>
  );
}
