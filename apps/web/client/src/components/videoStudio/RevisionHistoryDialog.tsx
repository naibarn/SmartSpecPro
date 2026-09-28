/**
 * Revision History dialog (Feature 133) — surfaces `videoProjects.
 * listRevisions`, which (before this task) had zero production client
 * callers even though `videoProjects.restoreRevision` was already called
 * from `QaPanel.tsx` (a per-QA-round revert). Users could restore a
 * revision they stumbled into via QA, but had no way to browse or restore
 * ANY revision otherwise — this dialog is that missing entry point.
 *
 * Deliberately NOT a section inside `ProductLibraryPanel.tsx` (that panel is
 * product-specific and catalog-studio-only; revision history applies to
 * every studio type). Standalone component, opened as a modal `Dialog` from
 * a header button in `VideoStudioWorkspacePage.tsx` — same `Dialog` +
 * `DialogHeader` + `Layout` shell `CatalogCreateDialog.tsx` already
 * established for this codebase's Video Studio Astryx dialogs.
 *
 * Restore reuses the SAME "reset baseRevision + refetch the project" pattern
 * every other mutating panel in this workspace uses after a job/save
 * completes (`onDocumentSaved` passed down from `VideoStudioWorkspacePage`),
 * so a restore is indistinguishable from a manual save/repair from the
 * draft-document state machine's point of view.
 *
 * NOTE — Astryx exception: same deliberate, twice-confirmed exception as the
 * rest of `components/videoStudio/*` (see `VideoStudioWorkspacePage.tsx`'s
 * top-of-file docstring / `planning/video-studio-astryx-migration/plan.md`).
 */
import { useState } from "react";
import { History } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";

import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface RevisionRow {
  revision: number;
  reason: string | null;
  createdAt: string | Date | null;
}

function formatDateTime(value: unknown, lang: VideoStudioLang): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function RevisionHistoryDialog({
  lang,
  projectId,
  isOpen,
  onOpenChange,
  onRestored,
}: {
  lang: VideoStudioLang;
  projectId: number;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Called after a successful restore so the caller can reset its
   * `baseRevision`/draft state and refetch the project (same pattern used
   * after every other stage panel's save/job completes). */
  onRestored: () => void;
}) {
  const [confirmTarget, setConfirmTarget] = useState<RevisionRow | null>(null);
  const utils = trpc.useUtils();

  const revisionsQuery = trpc.videoProjects.listRevisions.useQuery(
    { projectId },
    { enabled: isOpen },
  );
  const revisions = (revisionsQuery.data ?? []) as RevisionRow[];

  const restoreRevision = trpc.videoProjects.restoreRevision.useMutation({
    onSuccess: () => {
      setConfirmTarget(null);
      utils.videoProjects.listRevisions.invalidate({ projectId });
      toast.success(pickCopy(lang, videoStudioCopy.revisionHistoryRestoreSuccess));
      onRestored();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        purpose="info"
        width={560}
        data-testid="video-studio-revision-history-dialog"
      >
        <Layout
          height="auto"
          header={
            <DialogHeader
              title={pickCopy(lang, videoStudioCopy.revisionHistoryTitle)}
              subtitle={pickCopy(lang, videoStudioCopy.revisionHistorySubtitle)}
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                {revisionsQuery.isLoading ? (
                  <VStack gap={2}>
                    <Skeleton height={56} width="100%" />
                    <Skeleton height={56} width="100%" />
                    <Skeleton height={56} width="100%" />
                  </VStack>
                ) : revisionsQuery.isError ? (
                  <Banner
                    status="error"
                    title={pickCopy(lang, videoStudioCopy.revisionHistoryLoadError)}
                    description={revisionsQuery.error?.message}
                  />
                ) : revisions.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<History className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                    title={pickCopy(lang, videoStudioCopy.revisionHistoryEmpty)}
                  />
                ) : (
                  <VStack gap={2}>
                    {revisions.map((row) => (
                      <Card key={row.revision} data-testid="revision-history-item" padding={3}>
                        <HStack gap={2} align="center" justify="between" wrap="wrap">
                          <VStack gap={0.5}>
                            <HStack gap={1.5} align="center">
                              <Badge
                                variant="neutral"
                                label={`${pickCopy(lang, videoStudioCopy.revisionHistoryRevisionLabel)} ${row.revision}`}
                              />
                              <Text type="supporting" color="secondary">
                                {formatDateTime(row.createdAt, lang)}
                              </Text>
                            </HStack>
                            {row.reason ? (
                              <Text type="supporting" color="secondary">
                                {row.reason}
                              </Text>
                            ) : null}
                          </VStack>
                          <Button
                            variant="secondary"
                            size="sm"
                            label={pickCopy(lang, videoStudioCopy.revisionHistoryRestore)}
                            onClick={() => setConfirmTarget(row)}
                          />
                        </HStack>
                      </Card>
                    ))}
                  </VStack>
                )}
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={confirmTarget != null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={pickCopy(lang, videoStudioCopy.revisionHistoryRestoreConfirmTitle)}
        description={pickCopy(lang, videoStudioCopy.revisionHistoryRestoreConfirmBody)}
        actionLabel={pickCopy(lang, videoStudioCopy.revisionHistoryRestore)}
        actionVariant="destructive"
        isActionLoading={restoreRevision.isPending}
        data-testid="revision-restore-confirm"
        onAction={() => {
          if (confirmTarget) {
            restoreRevision.mutate({ projectId, revision: confirmTarget.revision });
          }
        }}
      />
    </>
  );
}
