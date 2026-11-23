import { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useClipboard } from "@astryxdesign/core/hooks";
import { trpc } from "@/lib/trpc";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const sourceOptions = useMemo(
    () => captionSourceOptions(props.state ?? undefined),
    [props.state?.referenceManifest, props.state?.shots]
  );
  const selectedOption = sourceOptions.find(
    option => option.value === selectedSource
  );
  const caption = props.state?.socialCaption?.caption ?? "";
  const hashtags = (props.state?.socialCaption?.hashtags ?? [])
    .slice(0, 5)
    .map(tag => `#${tag.replace(/^#+/, "")}`)
    .join(" ");
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
      </VStack>
    </Card>
  );
}
