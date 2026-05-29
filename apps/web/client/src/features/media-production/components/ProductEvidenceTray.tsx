import { AlertCircle, AlertTriangle, CheckCircle2, Copy, ExternalLink, PackageCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ProductionEvidenceStatus,
  ProductionProductEvidenceManifest,
  ProductionReferenceInput,
} from "@shared/mediaProduction";
import { evidenceStatusLabel } from "./displayLabels";
import type { ProductionLocale } from "./types";

interface ProductEvidenceTrayPropsBase {
  manifest?: ProductionProductEvidenceManifest;
  contextAssets: ProductionReferenceInput[];
  selectedNodeId?: string | null;
  locale?: ProductionLocale;
  onAddProductAsset?: (asset: ProductionReferenceInput, nodeId?: string | null) => void;
  onSetProductRole?: (productId: string, nextRole: string | null) => void;
  onSetClaimStatus?: (productId: string, claimId: string, nextStatus: ProductionEvidenceStatus) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onRemoveEvidenceFromClaim?: (productId: string, claimId: string, evidenceId: string) => void;
}

export type ProductEvidenceTrayProps = ProductEvidenceTrayPropsBase;

function evidenceTone(status?: string) {
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-700";
  if (status === "needs_review" || status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function evidenceIcon(status?: string) {
  if (status === "blocked") return ShieldAlert;
  if (status === "needs_review" || status === "warning") return AlertTriangle;
  return CheckCircle2;
}

const roleOptions = [
  "hero",
  "detail",
  "use_case",
  "review",
  "comparison",
  "background",
  "packshot",
  "label_close_up",
  "texture_detail",
  "before_after",
  "cta_end_card",
] as const;

const evidenceStatusOptions: ProductionEvidenceStatus[] = ["approved", "needs_review", "blocked"];

function normalizeRoleValue(role: string | null | undefined): string {
  return role && role.trim() ? role : "__none__";
}

function productTruthValue(productTruth: Record<string, unknown> | undefined, path: string): string {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, productTruth);
  return value == null ? "" : String(value);
}

function productTruthArray(productTruth: Record<string, unknown> | undefined, path: string): string[] {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, productTruth);
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function ProductEvidenceTray({
  manifest,
  contextAssets,
  selectedNodeId,
  locale,
  onAddProductAsset,
  onSetProductRole,
  onSetClaimStatus,
  onOpenEvidence,
  onRemoveEvidenceFromClaim,
}: ProductEvidenceTrayProps) {
  const isThai = locale === "th";
  const productAssets = contextAssets.filter((asset) => asset.kind === "product_image" || asset.kind === "marketplace_product");

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden rounded-lg border bg-white p-3" data-testid="product-evidence-tray">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <PackageCheck className="h-4 w-4 text-emerald-600" />
          {isThai ? "Product Evidence" : "Product Evidence"}
        </div>
        <Badge variant="outline" className={evidenceTone(manifest?.status)}>
          {evidenceStatusLabel(manifest?.status ?? "not_loaded", locale)}
        </Badge>
      </div>

      {manifest?.warnings?.length ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {manifest.warnings[0]}
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 gap-2">
        {manifest?.products?.length ? (
          manifest.products.map((product) => {
            const Icon = evidenceIcon(product.approvalState);
            const matchingAsset =
              productAssets.find((asset) => asset.assetId === product.id || asset.id === product.id) ??
              productAssets.find((asset) => asset.title === product.title);
            const roleValue = normalizeRoleValue(product.role);
            const productTruth = product.productTruth as Record<string, unknown> | undefined;
            const productDetailChips = [
              productTruthValue(productTruth, "platform"),
              productTruthValue(productTruth, "brand"),
              productTruthValue(productTruth, "shopName"),
              productTruthValue(productTruth, "itemId"),
              productTruthValue(productTruth, "price.current"),
              productTruthValue(productTruth, "performanceSignals.ratingScore"),
              productTruthValue(productTruth, "performanceSignals.soldCountText"),
            ].filter(Boolean);
            const productDetailId = productTruthValue(productTruth, "productId") || product.productId;
            const affiliateUrl = productTruthValue(productTruth, "affiliateUrl");
            const supportingInsightTypes = productTruthArray(productTruth, "supportingInsights.availableTypes");
            const supportingSummary = productTruthValue(productTruth, "supportingInsights.summary.shortSummary");
            const supportingHook = productTruthArray(productTruth, "supportingInsights.summary.hooks")[0];
            const videoBriefTitle = productTruthValue(productTruth, "supportingInsights.videoBrief.title");

            return (
              <div key={product.id} className="min-w-0 rounded border bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">{product.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className={evidenceTone(product.approvalState)}>
                        {evidenceStatusLabel(product.approvalState ?? "needs_review", locale)}
                      </Badge>
                      {product.sku ? <Badge variant="outline">{product.sku}</Badge> : null}
                      <Badge variant="outline">{product.claimEvidence.length} claims</Badge>
                    </div>
                    {productDetailChips.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {productDetailChips.slice(0, 7).map((chip) => (
                          <Badge key={chip} variant="outline" className="max-w-full truncate bg-white text-[10px]">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {productTruthValue(productTruth, "sourceUrl") ? (
                      <div className="mt-2 truncate text-[11px] text-muted-foreground">
                        {productTruthValue(productTruth, "sourceUrl")}
                      </div>
                    ) : null}
                    {affiliateUrl ? (
                      <div className="mt-2 flex min-w-0 items-center gap-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                        <span className="truncate">{affiliateUrl}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 gap-1 bg-white text-[11px]"
                          onClick={() => navigator.clipboard?.writeText(affiliateUrl)}
                        >
                          <Copy className="h-3 w-3" />
                          {isThai ? "คัดลอก" : "Copy"}
                        </Button>
                      </div>
                    ) : null}
                    {supportingInsightTypes.length ? (
                      <div className="mt-2 rounded border border-sky-100 bg-sky-50 p-2 text-[11px] text-slate-700">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="bg-white text-[10px] text-sky-700">
                            {isThai ? "AI insight เสริม" : "Optional AI insight"}
                          </Badge>
                          {supportingInsightTypes.slice(0, 3).map((type) => (
                            <Badge key={type} variant="outline" className="bg-white text-[10px]">
                              {type}
                            </Badge>
                          ))}
                        </div>
                        {supportingSummary || supportingHook || videoBriefTitle ? (
                          <div className="mt-1 line-clamp-2">
                            {supportingSummary || supportingHook || videoBriefTitle}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[10px] text-slate-500">
                          {isThai
                            ? "ใช้ช่วยคิด hook/story ได้ แต่ไม่แทน product truth"
                            : "Can inform hooks/story, but never replaces product truth."}
                        </div>
                      </div>
                    ) : null}
                    {productDetailId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 gap-1 bg-white text-xs"
                        onClick={() => window.open(`/marketplace-capture/products/${encodeURIComponent(productDetailId)}`, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {isThai ? "รายละเอียดสินค้าในระบบ" : "Product details"}
                      </Button>
                    ) : null}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {isThai ? "บทบาทสินค้า" : "Product role"}
                    </div>
                  {onSetProductRole ? (
                      <select
                        aria-label={isThai ? `set role for ${product.title}` : `set role for ${product.title}`}
                        className="mt-1 h-8 max-w-full rounded border bg-background px-2 text-xs"
                        value={roleValue}
                          onChange={(event) => onSetProductRole(product.id, event.target.value === "__none__" ? null : event.target.value)}
                      >
                        <option value="__none__">{isThai ? "ไม่กำหนดบทบาท" : "No role"}</option>
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-1 text-xs text-slate-700">
                        {isThai ? "บทบาท: " : "Role: "}
                        {product.role ?? (isThai ? "ไม่ระบุ" : "not assigned")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-xs font-medium">{isThai ? "Claim / Evidence" : "Claim / Evidence"}</div>
                  {product.claimEvidence.length ? (
                    product.claimEvidence.map((claim) => (
                      <div key={claim.claimId} className="min-w-0 rounded border border-slate-200 bg-white p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{claim.claimId}</span>
                          <Badge variant="outline" className={evidenceTone(claim.status)}>
                            {evidenceStatusLabel(claim.status, locale)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {isThai ? `ความเสี่ยง: ${claim.riskLevel ?? "unknown"}` : `Risk: ${claim.riskLevel ?? "unknown"}`}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            disabled={!onSetClaimStatus}
                            className="h-8 max-w-full rounded border bg-background px-2 text-xs"
                            value={claim.status}
                            onChange={(event) =>
                              onSetClaimStatus?.(product.id, claim.claimId, event.target.value as ProductionEvidenceStatus)
                            }
                            aria-label={isThai ? `set status for claim ${claim.claimId}` : `set claim status ${claim.claimId}`}
                          >
                            {evidenceStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {evidenceStatusLabel(status, locale)}
                              </option>
                            ))}
                          </select>
                          {claim.evidenceIds.length ? (
                            claim.evidenceIds.map((evidenceId) => (
                              <span
                                key={`${claim.claimId}-${evidenceId}`}
                                className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs"
                              >
                                <Badge variant="outline" className="border-transparent bg-transparent text-xs">
                                  {evidenceId}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onOpenEvidence?.(evidenceId)}
                                  disabled={!onOpenEvidence}
                                >
                                  <AlertCircle className="mr-1 h-3 w-3" />
                                  {isThai ? "ดู" : "Open"}
                                </Button>
                                {onRemoveEvidenceFromClaim ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRemoveEvidenceFromClaim(product.id, claim.claimId, evidenceId)}
                                  >
                                    {isThai ? "เอาออก" : "Remove"}
                                  </Button>
                                ) : null}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {isThai ? "ยังไม่มี evidence สำหรับ claim นี้" : "No evidence linked to this claim."}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground">{isThai ? "ยังไม่มี claim ใน product นี้" : "No claims for this product."}</div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={!matchingAsset}
                  onClick={() => {
                    if (matchingAsset) onAddProductAsset?.(matchingAsset, selectedNodeId);
                  }}
                >
                  {isThai ? "เพิ่มเข้า node" : "Add to node"}
                </Button>
              </div>
            );
          })
        ) : productAssets.length ? (
          <div className="grid gap-2">
            <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
              {isThai
                ? "พบ asset ที่เป็นสินค้าแล้ว กดเพิ่มเข้า node เพื่อใช้เป็นหลักฐานสินค้า หรือเลือก node ก่อนเพื่อผูกเข้ากับ workflow ที่ต้องใช้ภาพสินค้า"
                : "Product assets are available. Add one to a node as product evidence, or select a node first to bind it to the workflow step that needs product imagery."}
            </div>
            {productAssets.map((asset) => (
              <Button
                key={asset.id}
                type="button"
                variant="outline"
                className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                onClick={() => onAddProductAsset?.(asset, selectedNodeId)}
              >
                <PackageCheck className="mr-2 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{asset.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {asset.role ?? (isThai ? "หลักฐานสินค้า" : "product evidence")}
                    {asset.sku ? ` · ${asset.sku}` : ""}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
            <div className="font-medium text-slate-700">
              {isThai ? "ยังไม่มีหลักฐานสินค้า" : "No product evidence yet"}
            </div>
            <div className="mt-1 text-xs leading-5">
              {isThai
                ? "เพิ่มรูปสินค้าจาก Marketplace หรือเลือก asset ประเภทสินค้าใน Context Assets แล้วกด “ใช้เป็นสินค้า” เพื่อให้ระบบรู้ว่าภาพใดคือสินค้าและใช้ตรวจ claim ได้"
                : "Add product images from Marketplace, or choose a product asset in Context Assets and click “Use as product” so the system knows what evidence supports product claims."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
