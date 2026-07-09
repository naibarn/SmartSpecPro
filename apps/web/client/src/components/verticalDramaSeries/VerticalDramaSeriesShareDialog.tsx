/**
 * VerticalDramaSeriesShareDialog — the "แชร์ซีรีส์" trigger button + share
 * link management dialog (task #32, Collab-lite L1, F131AA, added
 * 2026-07-09).
 *
 * Self-gating via the `enabled` prop — mirrors
 * `VerticalDramaSeriesDetailPage.tsx`'s `StoryBibleOverviewCard` /
 * `deepDraftsFlagEnabled` convention (the tenant flag is resolved ONCE by
 * the parent page via `useTenantFeatureFlag` and passed down as a plain
 * prop), so this component stays directly unit-testable without mocking
 * `useTenantFeatureFlag` itself. `enabled={false}` (or omitted) renders
 * nothing at all — byte-identical to the button not existing.
 *
 * On create: the raw token/URL is shown exactly ONCE, held only in local
 * React state (never re-fetchable) — same "shown once" pattern as
 * `UserAPIKeysPanel.tsx`'s created-API-key dialog. The full shareable URL is
 * built CLIENT-SIDE (`window.location.origin + "/share/vd/" + token`); the
 * server never hardcodes a domain.
 *
 * Revoke confirm uses a sibling `AlertDialog` with plain `<Button>`s in its
 * footer (not `AlertDialogAction`/`AlertDialogCancel`) — same convention as
 * `VerticalDramaDeleteSeriesDialog.tsx`, which avoids any ambiguity between
 * Radix's built-in auto-dismiss-on-click behavior and this component's own
 * fully-controlled `open` state.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  verticalDramaShareCopy,
  type VerticalDramaShareLang,
} from "./verticalDramaShareCopy";

export interface VerticalDramaSeriesShareDialogProps {
  lang: VerticalDramaShareLang;
  /** Resolved by the parent page via `useTenantFeatureFlag("verticalDramaSeriesShareLinks")`. */
  enabled?: boolean;
  seriesId: string;
}

/**
 * Client-side mirror of `server/services/verticalDramaShareLinks.ts`'s
 * `MAX_ACTIVE_SERIES_SHARE_LINKS` — used ONLY to proactively disable the
 * create button + show a hint before a wasted round-trip. The server is the
 * actual enforcement point regardless (`PRECONDITION_FAILED` on the
 * mutation) — if these two numbers ever drift, the server error still wins,
 * this only affects how early the UI warns.
 */
const MAX_ACTIVE_LINKS = 5;

function formatDateTime(value: Date | string, lang: VerticalDramaShareLang): string {
  return new Date(value).toLocaleString(lang === "th" ? "th-TH" : "en-US");
}

export function VerticalDramaSeriesShareDialog({
  lang,
  enabled = false,
  seriesId,
}: VerticalDramaSeriesShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<7 | 30>(7);
  const [justCreated, setJustCreated] = useState<{ token: string; expiresAt: Date } | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const linksQuery = trpc.verticalDramaSeries.listSeriesShareLinks.useQuery(
    { seriesId },
    { enabled: open && Boolean(seriesId) },
  );

  const createMutation = trpc.verticalDramaSeries.createSeriesShareLink.useMutation({
    onSuccess: (result: { token: string; expiresAt: Date | string }) => {
      setJustCreated({ token: result.token, expiresAt: new Date(result.expiresAt) });
      toast.success(pickCopy(lang, verticalDramaShareCopy.createSuccessToast));
      void utils.verticalDramaSeries.listSeriesShareLinks.invalidate({ seriesId });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaShareCopy.createErrorFallback));
    },
  });

  const revokeMutation = trpc.verticalDramaSeries.revokeSeriesShareLink.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, verticalDramaShareCopy.revokeSuccessToast));
      setRevokeTargetId(null);
      void utils.verticalDramaSeries.listSeriesShareLinks.invalidate({ seriesId });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, verticalDramaShareCopy.revokeErrorFallback));
      setRevokeTargetId(null);
    },
  });

  // Shared by the Dialog's own `onOpenChange` (fires on Radix-driven closes —
  // overlay click, Escape) AND the footer's plain `<Button>` (which does NOT
  // go through Radix's internal open-state machinery, so calling `setOpen`
  // alone there would leave a stale `justCreated` behind on next open).
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setJustCreated(null);
  };

  if (!enabled) return null;

  const links = linksQuery.data?.links ?? [];
  const activeCount = links.filter(link => link.active).length;
  const capReached = activeCount >= MAX_ACTIVE_LINKS;
  const shareUrl = justCreated ? `${window.location.origin}/share/vd/${justCreated.token}` : null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(pickCopy(lang, verticalDramaShareCopy.copiedToast));
    } catch {
      toast.error(pickCopy(lang, verticalDramaShareCopy.copyFailedToast));
    }
  };

  const statusLabel = (link: { active: boolean; revokedAt: Date | string | null }) => {
    if (link.revokedAt) return pickCopy(lang, verticalDramaShareCopy.statusRevoked);
    if (!link.active) return pickCopy(lang, verticalDramaShareCopy.statusExpired);
    return pickCopy(lang, verticalDramaShareCopy.statusActive);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
        data-testid="vd-share-trigger-button"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {pickCopy(lang, verticalDramaShareCopy.triggerButton)}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pickCopy(lang, verticalDramaShareCopy.dialogTitle)}</DialogTitle>
            <DialogDescription>
              {pickCopy(lang, verticalDramaShareCopy.dialogDescription)}
            </DialogDescription>
          </DialogHeader>

          {justCreated ? (
            <div
              className="space-y-2 rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/20"
              data-testid="vd-share-reveal"
            >
              <p className="text-sm font-medium">
                {pickCopy(lang, verticalDramaShareCopy.revealTitle)}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl ?? ""}
                  className="flex-1 truncate rounded border bg-background px-2 py-1 text-xs"
                  data-testid="vd-share-url-input"
                  onFocus={e => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={handleCopy}
                  data-testid="vd-share-copy-button"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {pickCopy(lang, verticalDramaShareCopy.copyButton)}
                </Button>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {pickCopy(lang, verticalDramaShareCopy.revealWarning)}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {pickCopy(lang, verticalDramaShareCopy.expiryLabel)}
                </Label>
                <RadioGroup
                  value={String(expiresInDays)}
                  onValueChange={v => setExpiresInDays(v === "30" ? 30 : 7)}
                  className="mt-1.5 flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="7" id="vd-share-expiry-7" />
                    <Label htmlFor="vd-share-expiry-7" className="font-normal">
                      {pickCopy(lang, verticalDramaShareCopy.expiry7Days)}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="30" id="vd-share-expiry-30" />
                    <Label htmlFor="vd-share-expiry-30" className="font-normal">
                      {pickCopy(lang, verticalDramaShareCopy.expiry30Days)}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {capReached && (
                <p className="text-xs text-destructive" data-testid="vd-share-cap-hint">
                  {pickCopy(lang, verticalDramaShareCopy.capReachedHint)}
                </p>
              )}

              <Button
                type="button"
                className="gap-2"
                disabled={createMutation.isPending || capReached}
                onClick={() => createMutation.mutate({ seriesId, expiresInDays })}
                data-testid="vd-share-create-button"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                )}
                {pickCopy(
                  lang,
                  createMutation.isPending
                    ? verticalDramaShareCopy.creatingButton
                    : verticalDramaShareCopy.createButton,
                )}
              </Button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">
              {pickCopy(lang, verticalDramaShareCopy.listTitle)}
            </p>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="vd-share-list-empty">
                {pickCopy(lang, verticalDramaShareCopy.listEmpty)}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{pickCopy(lang, verticalDramaShareCopy.columnCreatedAt)}</TableHead>
                    <TableHead>{pickCopy(lang, verticalDramaShareCopy.columnExpiresAt)}</TableHead>
                    <TableHead>{pickCopy(lang, verticalDramaShareCopy.columnAccessCount)}</TableHead>
                    <TableHead>{pickCopy(lang, verticalDramaShareCopy.columnStatus)}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map(link => (
                    <TableRow key={link.id} data-testid={`vd-share-link-row-${link.id}`}>
                      <TableCell className="text-xs">{formatDateTime(link.createdAt, lang)}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(link.expiresAt, lang)}</TableCell>
                      <TableCell className="text-xs">{link.accessCount}</TableCell>
                      <TableCell>
                        <Badge variant={link.active ? "default" : "outline"}>{statusLabel(link)}</Badge>
                      </TableCell>
                      <TableCell>
                        {link.active && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setRevokeTargetId(link.id)}
                            data-testid={`vd-share-revoke-button-${link.id}`}
                          >
                            {pickCopy(lang, verticalDramaShareCopy.revokeButton)}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {pickCopy(lang, verticalDramaShareCopy.closeButton)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revokeTargetId}
        onOpenChange={next => {
          if (!next && !revokeMutation.isPending) setRevokeTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pickCopy(lang, verticalDramaShareCopy.revokeConfirmTitle)}</AlertDialogTitle>
            <AlertDialogDescription>
              {pickCopy(lang, verticalDramaShareCopy.revokeConfirmBody)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={revokeMutation.isPending}
              onClick={() => setRevokeTargetId(null)}
            >
              {pickCopy(lang, verticalDramaShareCopy.revokeCancel)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeTargetId) revokeMutation.mutate({ seriesId, linkId: revokeTargetId });
              }}
              data-testid="vd-share-revoke-confirm-button"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pickCopy(lang, verticalDramaShareCopy.revokeConfirmButton)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
