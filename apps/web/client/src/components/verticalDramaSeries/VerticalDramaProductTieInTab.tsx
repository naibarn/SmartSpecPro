/**
 * VerticalDramaProductTieInTab (spec feature 131, section-10/11 — Series
 * detail "Product tie-in" tab).
 *
 * Reads/edits the series' `productTieIn` JSON blob. Field names/shape mirror
 * the Create-Series Wizard's product-tie-in step (`CreateSeriesWizard.tsx`,
 * step "product"): `enabled`, `productName`, `productId`, `productImageUrl`,
 * `forbiddenClaims` (string[]). Saves via `updateSeries({ productTieIn })`,
 * merging edits into the existing object so unrelated keys (e.g.
 * `productSource`) are preserved rather than dropped.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, ImageIcon, Link2, Loader2, Save, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { pickCopy, verticalDramaCopy } from "@/components/verticalDramaSeries/verticalDramaCopy";

/**
 * Loose shape for the `productTieIn` JSON column — wider than the parent
 * page's narrow `{ enabled?: boolean }` typing so we can read/edit the extra
 * fields the wizard already writes (productName/productId/productImageUrl/
 * forbiddenClaims) without unsafe casts at every access site.
 *
 * `marketplaceCaptureId` and `videoNarrationCaption` are ADDITIVE fields for
 * linking this series' product tie-in to an existing Marketplace-capture
 * session (`marketplaceCapture` router/tables) and for a free-text narration
 * caption used when writing the video's story/genre tie-in — both are
 * merge-patched the same way as the existing fields, so no backend/schema
 * change is required.
 */
export interface VerticalDramaProductTieIn {
  enabled?: boolean;
  productName?: string;
  productId?: string;
  productImageUrl?: string;
  productSource?: string;
  forbiddenClaims?: string[];
  /** Links to an existing `marketplace_capture_sessions.id` (see marketplaceCapture router). */
  marketplaceCaptureId?: string;
  /** Free-text caption describing how the product ties into the story/genre, for video narration. */
  videoNarrationCaption?: string;
  [key: string]: unknown;
}

export interface VerticalDramaProductTieInTabProps {
  lang: "th" | "en";
  seriesId: string;
  productTieIn: VerticalDramaProductTieIn | null | undefined;
  readOnly: boolean;
  onSaved?: () => void;
}

export function VerticalDramaProductTieInTab({
  lang,
  seriesId,
  productTieIn,
  readOnly,
  onSaved,
}: VerticalDramaProductTieInTabProps) {
  const [enabled, setEnabled] = useState(Boolean(productTieIn?.enabled));
  const [productName, setProductName] = useState(productTieIn?.productName ?? "");
  const [forbiddenClaims, setForbiddenClaims] = useState(
    (productTieIn?.forbiddenClaims ?? []).join(", "),
  );
  const [marketplaceCaptureId, setMarketplaceCaptureId] = useState(
    productTieIn?.marketplaceCaptureId ?? "",
  );
  const [videoNarrationCaption, setVideoNarrationCaption] = useState(
    productTieIn?.videoNarrationCaption ?? "",
  );

  useEffect(() => {
    setEnabled(Boolean(productTieIn?.enabled));
    setProductName(productTieIn?.productName ?? "");
    setForbiddenClaims((productTieIn?.forbiddenClaims ?? []).join(", "));
    setMarketplaceCaptureId(productTieIn?.marketplaceCaptureId ?? "");
    setVideoNarrationCaption(productTieIn?.videoNarrationCaption ?? "");
  }, [productTieIn]);

  // Populates the "link marketplace capture" picker.
  const capturesQuery = trpc.marketplaceCapture.listCaptures.useQuery({ limit: 50 });

  // Once linked, fetch the storytelling-ready handoff (product name + curated
  // images) for this capture rather than the raw capture record. The
  // procedure's return type is a loose `Record<string, unknown>` jsonb blob
  // (it may come from either a synced insight row or the basic-handoff
  // builder), so we narrow to the fields this UI actually reads.
  const handoffQuery = trpc.marketplaceCapture.getStorytellingHandoff.useQuery(
    { captureId: marketplaceCaptureId },
    { enabled: Boolean(marketplaceCaptureId) },
  );
  const handoff = handoffQuery.data as
    | { productName?: string; selectedImages?: { url: string; role?: string }[] }
    | undefined;

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "บันทึกสินค้าผูกเรื่องแล้ว" : "Product tie-in saved");
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message || (lang === "th" ? "บันทึกสินค้าผูกเรื่องไม่สำเร็จ" : "Failed to save product tie-in"),
      );
    },
  });

  const handleSave = () => {
    const merged: VerticalDramaProductTieIn = {
      ...(productTieIn ?? {}),
      enabled,
      productName: productName.trim() || undefined,
      forbiddenClaims: forbiddenClaims
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      marketplaceCaptureId: marketplaceCaptureId || undefined,
      videoNarrationCaption: videoNarrationCaption.trim() || undefined,
    };
    updateMutation.mutate({ seriesId, productTieIn: merged });
  };

  const dirty =
    enabled !== Boolean(productTieIn?.enabled) ||
    productName !== (productTieIn?.productName ?? "") ||
    forbiddenClaims !== (productTieIn?.forbiddenClaims ?? []).join(", ") ||
    marketplaceCaptureId !== (productTieIn?.marketplaceCaptureId ?? "") ||
    videoNarrationCaption !== (productTieIn?.videoNarrationCaption ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pickCopy(lang, verticalDramaCopy.productTieIn)}</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-md gap-4">
        {readOnly && (
          <Badge variant="outline" className="w-fit">
            {pickCopy(lang, verticalDramaCopy.readOnly)}
          </Badge>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id="product-tie-in-enabled"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
            disabled={readOnly || updateMutation.isPending}
          />
          <Label htmlFor="product-tie-in-enabled" className="text-sm font-medium">
            {lang === "th" ? "เปิดใช้สินค้าผูกเรื่อง (Product tie-in)" : "Enable product tie-in"}
          </Label>
        </div>

        {enabled && (
          <>
            {productTieIn?.productImageUrl && (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                <img
                  src={productTieIn.productImageUrl}
                  alt={productName || "Product"}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="product-tie-in-name" className="text-xs font-medium text-muted-foreground">
                {lang === "th" ? "ชื่อสินค้า" : "Product name"}
              </Label>
              <Input
                id="product-tie-in-name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                disabled={readOnly || updateMutation.isPending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="product-tie-in-forbidden-claims"
                className="text-xs font-medium text-muted-foreground"
              >
                {lang === "th" ? "ข้อความต้องห้าม (คั่นด้วยจุลภาค)" : "Forbidden claims (comma-separated)"}
              </Label>
              <Input
                id="product-tie-in-forbidden-claims"
                value={forbiddenClaims}
                onChange={(e) => setForbiddenClaims(e.target.value)}
                disabled={readOnly || updateMutation.isPending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="product-tie-in-marketplace-capture"
                className="text-xs font-medium text-muted-foreground"
              >
                {lang === "th" ? "เชื่อมกับ Marketplace capture" : "Link marketplace capture"}
              </Label>

              {marketplaceCaptureId ? (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">
                        {handoff?.productName ||
                          (lang === "th" ? "กำลังโหลด…" : "Loading…")}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={readOnly || updateMutation.isPending}
                      onClick={() => setMarketplaceCaptureId("")}
                      aria-label={lang === "th" ? "ยกเลิกการเชื่อม" : "Unlink"}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>

                  {handoffQuery.isLoading && (
                    <p className="text-xs text-muted-foreground">
                      {lang === "th" ? "กำลังโหลดข้อมูล…" : "Loading capture details…"}
                    </p>
                  )}

                  {Array.isArray(handoff?.selectedImages) &&
                    handoff.selectedImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {handoff.selectedImages
                          .slice(0, 4)
                          .map((img, idx: number) => (
                            <div
                              key={`${img.url}-${idx}`}
                              className="flex aspect-square items-center justify-center overflow-hidden rounded border bg-muted"
                            >
                              <img
                                src={img.url}
                                alt={img.role || "Product"}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                      </div>
                    )}

                  <a
                    href={`/marketplace-capture/captures/${marketplaceCaptureId}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {lang === "th" ? "ดูหน้า Marketplace capture" : "View marketplace capture page"}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <Select
                  value={marketplaceCaptureId}
                  onValueChange={(v) => setMarketplaceCaptureId(v)}
                  disabled={readOnly || updateMutation.isPending || capturesQuery.isLoading}
                >
                  <SelectTrigger
                    id="product-tie-in-marketplace-capture"
                    aria-label={lang === "th" ? "เชื่อมกับ Marketplace capture" : "Link marketplace capture"}
                  >
                    <SelectValue
                      placeholder={
                        capturesQuery.isLoading
                          ? lang === "th"
                            ? "กำลังโหลด…"
                            : "Loading…"
                          : lang === "th"
                            ? "เลือก capture ที่จับไว้"
                            : "Select a saved capture"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(capturesQuery.data ?? []).map((capture: { id: string; pageTitle?: string | null; platform?: string }) => (
                      <SelectItem key={capture.id} value={capture.id}>
                        {capture.pageTitle || capture.id}
                        {capture.platform ? ` (${capture.platform})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="product-tie-in-video-narration-caption"
                className="text-xs font-medium text-muted-foreground"
              >
                {lang === "th"
                  ? "คำบรรยายสำหรับเล่าเรื่องในวิดีโอ"
                  : "Video narration caption"}
              </Label>
              <Textarea
                id="product-tie-in-video-narration-caption"
                value={videoNarrationCaption}
                onChange={(e) => setVideoNarrationCaption(e.target.value)}
                disabled={readOnly || updateMutation.isPending}
                rows={4}
                placeholder={
                  lang === "th"
                    ? "อธิบายว่าสินค้านี้เชื่อมโยงกับเนื้อเรื่อง/แนวเรื่องอย่างไร สำหรับใช้เล่าเรื่องในวิดีโอ"
                    : "Describe how this product ties into the story/genre, for use in video narration"
                }
              />
            </div>
          </>
        )}

        {!enabled && !productTieIn?.enabled && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {lang === "th"
              ? "ยังไม่ได้ผูกสินค้ากับซีรีย์นี้"
              : "No product is tied to this series yet."}
          </p>
        )}

        {!readOnly && (
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !dirty}
            className="w-fit gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {updateMutation.isPending
              ? lang === "th"
                ? "กำลังบันทึก…"
                : "Saving…"
              : lang === "th"
                ? "บันทึก"
                : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
