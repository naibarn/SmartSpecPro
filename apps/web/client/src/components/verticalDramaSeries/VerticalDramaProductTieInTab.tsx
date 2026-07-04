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
import { ImageIcon, Loader2, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { pickCopy, verticalDramaCopy } from "@/components/verticalDramaSeries/verticalDramaCopy";

/**
 * Loose shape for the `productTieIn` JSON column — wider than the parent
 * page's narrow `{ enabled?: boolean }` typing so we can read/edit the extra
 * fields the wizard already writes (productName/productId/productImageUrl/
 * forbiddenClaims) without unsafe casts at every access site.
 */
export interface VerticalDramaProductTieIn {
  enabled?: boolean;
  productName?: string;
  productId?: string;
  productImageUrl?: string;
  productSource?: string;
  forbiddenClaims?: string[];
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

  useEffect(() => {
    setEnabled(Boolean(productTieIn?.enabled));
    setProductName(productTieIn?.productName ?? "");
    setForbiddenClaims((productTieIn?.forbiddenClaims ?? []).join(", "));
  }, [productTieIn]);

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
    };
    updateMutation.mutate({ seriesId, productTieIn: merged });
  };

  const dirty =
    enabled !== Boolean(productTieIn?.enabled) ||
    productName !== (productTieIn?.productName ?? "") ||
    forbiddenClaims !== (productTieIn?.forbiddenClaims ?? []).join(", ");

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
