import { useState } from "react";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const APPROVABLE_STATUSES = new Set(["scenes", "narration", "motion", "captions"]);
const REVIEWABLE_STATUSES = new Set(["scenes", "narration", "motion", "captions", "qa", "ready"]);

export function StageApprovalBar({
  lang,
  projectId,
  status,
  canApprove = true,
  onChanged,
}: {
  lang: VideoStudioLang;
  projectId: number;
  status: string;
  /** Derived from the persisted document by the workspace page. */
  canApprove?: boolean;
  onChanged: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const approveStage = trpc.videoProjects.approveStage.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, { th: "อนุมัติขั้นตอนแล้ว", en: "Stage approved" }));
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const rejectStage = trpc.videoProjects.rejectStage.useMutation({
    onSuccess: () => {
      setRejectOpen(false);
      setReason("");
      toast.success(pickCopy(lang, { th: "ส่งขั้นตอนกลับแก้ไขแล้ว", en: "Stage sent back" }));
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!REVIEWABLE_STATUSES.has(status)) return null;
  if (APPROVABLE_STATUSES.has(status) && !canApprove) return null;
  const isBusy = approveStage.isPending || rejectStage.isPending;

  return (
    <>
      <Card data-testid="video-studio-stage-approval-bar" padding={3}>
        <VStack gap={2}>
          <HStack justify="between" align="center" wrap="wrap">
            <Text type="body" weight="medium">
              {pickCopy(lang, videoStudioCopy.stageApprovalTitle)}
            </Text>
            <Text type="supporting" color="secondary" data-testid="stage-approval-status">
              {pickCopy(lang, videoStudioCopy.stageApprovalStatus)}: {status}
            </Text>
          </HStack>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.stageApprovalBody)}
          </Text>
          <HStack gap={2} wrap="wrap">
            {APPROVABLE_STATUSES.has(status) ? (
              <Button
                type="button"
                variant="primary"
                data-testid="stage-approval-approve"
                label={pickCopy(lang, videoStudioCopy.stageApprovalApprove)}
                isDisabled={isBusy}
                isLoading={approveStage.isPending}
                onClick={() => approveStage.mutate({ projectId })}
              />
            ) : null}
            <Button
              type="button"
              variant="secondary"
              data-testid="stage-approval-reject"
              label={pickCopy(lang, videoStudioCopy.stageApprovalReject)}
              isDisabled={isBusy}
              onClick={() => setRejectOpen(true)}
            />
          </HStack>
        </VStack>
      </Card>

      <Dialog
        isOpen={rejectOpen}
        onOpenChange={setRejectOpen}
        purpose="form"
        width={520}
        data-testid="stage-approval-reject-dialog"
      >
        <Layout
          height="auto"
          header={
            <DialogHeader
              title={pickCopy(lang, videoStudioCopy.stageApprovalRejectTitle)}
              onOpenChange={setRejectOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <Banner
                  status="warning"
                  title={pickCopy(lang, videoStudioCopy.stageApprovalBody)}
                />
                <TextArea
                  label={pickCopy(lang, videoStudioCopy.stageApprovalReason)}
                  value={reason}
                  rows={4}
                  maxLength={2000}
                  onChange={setReason}
                  data-testid="stage-approval-reason"
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} justify="end">
                <Button
                  type="button"
                  variant="secondary"
                  label={pickCopy(lang, videoStudioCopy.cancel)}
                  onClick={() => setRejectOpen(false)}
                />
                <Button
                  type="button"
                  variant="primary"
                  data-testid="stage-approval-reject-confirm"
                  label={pickCopy(lang, videoStudioCopy.stageApprovalConfirmReject)}
                  isDisabled={isBusy}
                  isLoading={rejectStage.isPending}
                  onClick={() => rejectStage.mutate({ projectId, reason: reason.trim() || undefined })}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
