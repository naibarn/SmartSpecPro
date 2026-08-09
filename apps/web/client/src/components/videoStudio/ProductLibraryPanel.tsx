/**
 * Product Library panel (Feature 133, catalog projects) — a right-side
 * companion panel for a Video Studio project created "from a product"
 * (`studioType: "catalog"`, `brief.productId` set by `CatalogCreateDialog`).
 * Three read/edit sections:
 *  1. Product details (name/price/description) — prefers live
 *     `marketplaceCapture.getProduct` data, falls back to the `brief`
 *     snapshot captured at project-creation time if the live query is
 *     loading/erroring (older projects, or a transient network blip).
 *  2. ALL product images with per-image selected-state toggling, persisted
 *     to `video_projects.brief.productImageUrls` via `videoProjects.
 *     updateBrief` (merges into the existing brief object, same pattern as
 *     `BriefPanel.tsx`'s own `updateBrief` call).
 *  3. Prior videos of this product: other Video Studio projects
 *     (`videoProjects.listByProduct`, current project excluded) and prior
 *     Marketplace auto-review runs (`marketplaceCapture.listAutoReviewRuns`).
 *
 * NOTE — Astryx exception: same deliberate, twice-confirmed exception as the
 * rest of `components/videoStudio/*` (see `VideoStudioWorkspacePage.tsx`'s
 * top-of-file docstring / `planning/video-studio-astryx-migration/plan.md`).
 *
 * Per-image mutation guard: `pendingImageUrls` tracks ONLY the image URLs
 * currently being persisted, not a single panel-wide "isPending" flag — a
 * shared pending flag disabling the whole grid is a known repo anti-pattern
 * (memory `project_panel_wide_pending_dead_button`).
 *
 * sourceRefs backfill (real-bug fix): `queueRender(profile: "final")` gates a
 * Catalog Studio project on `sourceRefs.productIds` being non-empty
 * (`VI_MISSING_SOURCE_REFS`), but this panel's `productId` prop — the ONLY
 * place a catalog project's product association is established/displayed
 * post-creation — historically only ever wrote to `brief`, never to
 * `sourceRefs`. A project whose `sourceRefs` is missing/stale (older
 * projects, or any path that set `brief.productId` without also setting
 * `sourceRefs`) could never final-render without delete+recreate. This panel
 * now self-heals: whenever it renders with a `productId` that isn't already
 * present in the project's `sourceRefs.productIds`, it backfills via the
 * dedicated `videoProjects.updateSourceRefs` procedure (kept independent of
 * `updateBrief` — one can fail without rolling back or masking the other).
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Image as ImageIcon, PackageSearch, Check } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";

import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface ProductBriefSnapshot {
  productId?: string;
  productName?: string;
  productDescription?: string | null;
  productImageUrls?: string[];
  productPrice?: string | number | null;
  productCurrency?: string | null;
}

function formatPrice(price: string | number | null | undefined, currency: string | null | undefined): string | null {
  if (price == null || price === "") return null;
  return [price, currency].filter(Boolean).join(" ");
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export function ProductLibraryPanel({
  lang,
  projectId,
  productId,
  brief,
  sourceRefs,
}: {
  lang: VideoStudioLang;
  projectId: number;
  productId: string;
  brief: Record<string, unknown> | null;
  /** Current `video_projects.sourceRefs` — used to detect and backfill a
   * missing/stale `productIds` entry so the render gate stays satisfied. */
  sourceRefs?: { productIds?: string[] } | null;
}) {
  const briefSnapshot = (brief ?? {}) as ProductBriefSnapshot;
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [pendingImageUrls, setPendingImageUrls] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  const productQuery = trpc.marketplaceCapture.getProduct.useQuery({ productId });
  const priorProjectsQuery = trpc.videoProjects.listByProduct.useQuery(
    { productId, limit: 20 },
    { enabled: Boolean(productId) },
  );
  const reviewRunsQuery = trpc.marketplaceCapture.listAutoReviewRuns.useQuery(
    { productId, limit: 10, summary: true },
    { enabled: Boolean(productId) },
  );

  const updateBrief = trpc.videoProjects.updateBrief.useMutation({
    onSuccess: () => {
      utils.videoProjects.get.invalidate({ projectId });
    },
    onError: (error) => toast.error(error.message),
  });

  // sourceRefs backfill — see file docstring. Independent mutation from
  // `updateBrief` above: a failure here must not roll back or suppress the
  // image-selection save, and vice versa. `attemptedProductIdRef` prevents
  // re-firing while the invalidated `get` query round-trips (it only resets
  // when `productId` itself changes, e.g. navigating between projects).
  const attemptedProductIdRef = useRef<string | null>(null);
  const updateSourceRefs = trpc.videoProjects.updateSourceRefs.useMutation({
    onSuccess: () => {
      utils.videoProjects.get.invalidate({ projectId });
    },
  });

  const sourceRefProductIds = sourceRefs?.productIds ?? [];
  const sourceRefsNeedsBackfill = Boolean(productId) && !sourceRefProductIds.includes(productId);

  useEffect(() => {
    if (!sourceRefsNeedsBackfill) {
      attemptedProductIdRef.current = null;
      return;
    }
    if (attemptedProductIdRef.current === productId) return;
    if (updateSourceRefs.isPending) return;
    attemptedProductIdRef.current = productId;
    updateSourceRefs.mutate({
      projectId,
      sourceRefs: { productIds: Array.from(new Set([...sourceRefProductIds, productId])) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRefsNeedsBackfill, productId, projectId]);

  const liveProduct = productQuery.data?.product as
    | { productName?: string; priceCurrent?: unknown; currency?: string | null; descriptionText?: string | null }
    | undefined;
  const liveImages = (productQuery.data?.images ?? []) as Array<{ id: string; url: string }>;

  const usingFallback = !productQuery.isLoading && (productQuery.isError || !productQuery.data);

  const productName = liveProduct?.productName ?? briefSnapshot.productName ?? "";
  const productPriceLabel = usingFallback
    ? formatPrice(briefSnapshot.productPrice, briefSnapshot.productCurrency)
    : formatPrice(
        liveProduct?.priceCurrent as string | number | null | undefined,
        liveProduct?.currency ?? null,
      );
  const productDescription = usingFallback
    ? briefSnapshot.productDescription ?? ""
    : liveProduct?.descriptionText ?? "";

  const selectedImageUrls: string[] = Array.isArray(briefSnapshot.productImageUrls)
    ? briefSnapshot.productImageUrls
    : [];
  const selectedImageUrlSet = new Set(selectedImageUrls);

  const allImages: Array<{ id: string; url: string }> = usingFallback
    ? (briefSnapshot.productImageUrls ?? []).map((url, index) => ({ id: `fallback-${index}`, url }))
    : liveImages;

  function toggleImage(url: string) {
    const nextSelected = selectedImageUrlSet.has(url)
      ? selectedImageUrls.filter((existing) => existing !== url)
      : [...selectedImageUrls, url];

    setPendingImageUrls((prev) => new Set(prev).add(url));
    updateBrief.mutate(
      { projectId, brief: { ...(brief ?? {}), productImageUrls: nextSelected } },
      {
        onSuccess: () => {
          utils.videoProjects.get.invalidate({ projectId });
        },
        onError: (error) => toast.error(error.message),
        onSettled: () => {
          setPendingImageUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        },
      },
    );
  }

  const priorProjects = (priorProjectsQuery.data ?? []).filter((row) => row.id !== projectId);
  const reviewRuns = (reviewRunsQuery.data ?? []) as Array<Record<string, unknown>>;
  const productErrorMessage = productQuery.error?.message;

  return (
    <VStack gap={4} data-testid="video-studio-product-panel" className="min-w-0">
      <Heading level={4}>{pickCopy(lang, videoStudioCopy.productLibraryTitle)}</Heading>

      {updateSourceRefs.isError ? (
        <Banner
          data-testid="product-panel-sourcerefs-error"
          status="error"
          title={pickCopy(lang, videoStudioCopy.productLibrarySourceRefsError)}
          description={updateSourceRefs.error?.message}
          endContent={
            <Button
              variant="ghost"
              size="sm"
              label={pickCopy(lang, videoStudioCopy.retry)}
              onClick={() => {
                attemptedProductIdRef.current = null;
                updateSourceRefs.mutate({
                  projectId,
                  sourceRefs: { productIds: Array.from(new Set([...sourceRefProductIds, productId])) },
                });
              }}
            />
          }
        />
      ) : null}

      {/* Section A — product details */}
      <Card>
        <VStack gap={2}>
          <Text type="label" color="secondary">
            {pickCopy(lang, videoStudioCopy.productLibraryInfoTitle)}
          </Text>

          {productQuery.isLoading ? (
            <VStack gap={2}>
              <Skeleton height={20} width="70%" />
              <Skeleton height={16} width="40%" />
              <Skeleton height={40} width="100%" />
            </VStack>
          ) : (
            <>
              {usingFallback ? (
                <Banner
                  status="warning"
                  title={pickCopy(lang, videoStudioCopy.productLibraryProductInfoFallback)}
                />
              ) : null}

              <Text type="body" weight="bold" maxLines={2} data-testid="product-panel-name">
                {productName || "-"}
              </Text>

              {productPriceLabel ? (
                <HStack gap={1.5} align="center">
                  <Text type="supporting" color="secondary">
                    {pickCopy(lang, videoStudioCopy.productLibraryPrice)}:
                  </Text>
                  <Text type="supporting">{productPriceLabel}</Text>
                </HStack>
              ) : null}

              {productDescription ? (
                <VStack gap={1}>
                  <Text
                    type="supporting"
                    color="secondary"
                    maxLines={isDescriptionExpanded ? 0 : 4}
                    data-testid="product-panel-description"
                  >
                    {productDescription}
                  </Text>
                  {productDescription.length > 160 ? (
                    <button
                      type="button"
                      className="self-start text-xs text-primary underline"
                      onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                    >
                      {pickCopy(
                        lang,
                        isDescriptionExpanded
                          ? videoStudioCopy.showLessDescription
                          : videoStudioCopy.showMoreDescription,
                      )}
                    </button>
                  ) : null}
                </VStack>
              ) : null}

              <Link href={`/marketplace-capture/products/${encodeURIComponent(productId)}`} className="text-xs underline">
                {pickCopy(lang, videoStudioCopy.productLibraryOpenProduct)}
              </Link>
            </>
          )}
        </VStack>
      </Card>

      {/* Section B — product images, selection editable */}
      <Card>
        <VStack gap={2}>
          <HStack gap={2} align="center" justify="between" wrap="wrap">
            <Text type="label" color="secondary">
              {pickCopy(lang, videoStudioCopy.productLibraryImagesTitle)}
            </Text>
            <Text type="supporting" color="secondary" data-testid="product-panel-image-count">
              {pickCopy(lang, videoStudioCopy.productLibraryImagesUsedCount)} {selectedImageUrls.length}/
              {allImages.length}
            </Text>
          </HStack>

          {productQuery.isLoading ? (
            <Grid columns={{ minWidth: 72, max: 4 }} gap={2}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={72} width="100%" radius={2} />
              ))}
            </Grid>
          ) : productQuery.isError && !usingFallback ? (
            <Banner
              status="error"
              title={pickCopy(lang, videoStudioCopy.productLibraryImagesLoadError)}
              description={productErrorMessage}
            />
          ) : allImages.length === 0 ? (
            <EmptyState
              isCompact
              icon={<ImageIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
              title={pickCopy(lang, videoStudioCopy.productLibraryImagesEmpty)}
            />
          ) : (
            <Grid columns={{ minWidth: 72, max: 4 }} gap={2}>
              {allImages.map((image, index) => {
                const isSelected = selectedImageUrlSet.has(image.url);
                const isPending = pendingImageUrls.has(image.url);
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                      isSelected ? "border-primary" : "border-border/60 opacity-60 hover:opacity-100"
                    } ${isPending ? "cursor-wait" : ""}`}
                    data-testid="product-panel-image-toggle"
                    data-selected={isSelected}
                    aria-pressed={isSelected}
                    disabled={usingFallback || isPending}
                    onClick={() => toggleImage(image.url)}
                  >
                    <img
                      src={image.url}
                      alt={pickCopy(lang, { th: `รูปสินค้า ${index + 1}`, en: `Product image ${index + 1}` })}
                      className="h-full w-full object-cover"
                    />
                    {isPending ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Spinner size="sm" />
                      </span>
                    ) : isSelected ? (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </Grid>
          )}
        </VStack>
      </Card>

      {/* Section C — prior videos of this product */}
      <Card>
        <VStack gap={3}>
          <Text type="label" color="secondary">
            {pickCopy(lang, videoStudioCopy.productLibraryVideosTitle)}
          </Text>

          <VStack gap={2}>
            <Text type="supporting" weight="medium">
              {pickCopy(lang, videoStudioCopy.productLibraryPriorProjectsTitle)}
            </Text>
            {priorProjectsQuery.isLoading ? (
              <Skeleton height={48} width="100%" />
            ) : priorProjects.length === 0 ? (
              <Text type="supporting" color="secondary">
                {pickCopy(lang, videoStudioCopy.productLibraryPriorProjectsEmpty)}
              </Text>
            ) : (
              <VStack gap={1.5}>
                {priorProjects.map((row) => (
                  <Link
                    key={row.id}
                    href={`/video-studio/${row.id}`}
                    data-testid="product-panel-prior-project"
                    className="flex items-center gap-2 rounded-lg border border-border/60 p-2 hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                      {row.resultThumbnailUrl ? (
                        <img src={row.resultThumbnailUrl} alt={row.name} className="h-full w-full object-cover" />
                      ) : (
                        <PackageSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Text type="supporting" weight="medium" maxLines={1}>
                        {row.name}
                      </Text>
                      <HStack gap={1} align="center">
                        <Badge variant="neutral" label={row.status} />
                        <Text type="supporting" color="secondary">
                          {formatDate(row.updatedAt)}
                        </Text>
                      </HStack>
                    </div>
                  </Link>
                ))}
              </VStack>
            )}
          </VStack>

          <VStack gap={2}>
            <Text type="supporting" weight="medium">
              {pickCopy(lang, videoStudioCopy.productLibraryReviewRunsTitle)}
            </Text>
            {reviewRunsQuery.isLoading ? (
              <Skeleton height={48} width="100%" />
            ) : reviewRunsQuery.isError ? (
              <Text type="supporting" color="secondary">
                {reviewRunsQuery.error?.message}
              </Text>
            ) : reviewRuns.length === 0 ? (
              <Text type="supporting" color="secondary">
                {pickCopy(lang, videoStudioCopy.productLibraryReviewRunsEmpty)}
              </Text>
            ) : (
              <VStack gap={1.5}>
                {reviewRuns.map((run) => {
                  const runId = String(run.id ?? "");
                  const libraryItemHref =
                    typeof (run.links as Record<string, unknown> | undefined)?.libraryItem === "string"
                      ? ((run.links as Record<string, unknown>).libraryItem as string)
                      : null;
                  return (
                    <div
                      key={runId}
                      data-testid="product-panel-review-run"
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <Badge variant="neutral" label={String(run.status ?? "")} />
                        <Text type="supporting" color="secondary">
                          {formatDate(run.createdAt)}
                        </Text>
                      </div>
                      {libraryItemHref ? (
                        <Link href={libraryItemHref} className="shrink-0 text-xs underline">
                          {pickCopy(lang, { th: "ดูผลลัพธ์", en: "View result" })}
                        </Link>
                      ) : (
                        <Link href={`/marketplace/auto-review/${encodeURIComponent(runId)}`} className="shrink-0 text-xs underline">
                          {pickCopy(lang, { th: "ดูรายละเอียด", en: "View details" })}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </VStack>
      </Card>
    </VStack>
  );
}
