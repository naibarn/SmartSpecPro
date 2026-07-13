/**
 * "New from product" (Catalog Video Studio) create dialog (Feature 133,
 * section-08 §10.2). Browses/searches accessible marketplace products (own +
 * group-shared, via `marketplaceCapture.listProducts` — same procedure and
 * UI pattern already shipped in `CreateSeriesWizard.tsx`'s product tie-in
 * picker, reused rather than reinvented) and lets the user pick one by name
 * instead of typing a raw product id. Then creates the project via
 * `videoProjects.create` (studioType: "catalog") with the selected product's
 * id recorded in `brief` for this UI's own reference AND in
 * `sourceRefs.productIds` (implementation-progress.md gap #1, CLOSED) so
 * `queueRender(profile: "final")`'s claim-validation gate actually resolves
 * `ResolvedCatalogFacts` against this real catalog product.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Image as ImageIcon, Search, SearchX, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from "@astryxdesign/core/Layout";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface PickedProduct {
  id: string;
  productName: string;
  imageUrl?: string | null;
  priceCurrent?: string | number | null;
  currency?: string | null;
  platform?: string | null;
  accessType?: string | null;
}

function ProductThumb({ product, size = 48 }: { product: PickedProduct; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted"
      style={{ width: size, height: size }}
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.productName}
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

export function CatalogCreateDialog({
  lang,
  open,
  onOpenChange,
}: {
  lang: VideoStudioLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<PickedProduct | null>(null);
  const [name, setName] = useState("");

  const productsQuery = trpc.marketplaceCapture.listProducts.useQuery(
    { query: search.trim() || undefined, limit: 24 },
    { enabled: open && !selectedProduct },
  );
  const products = (productsQuery.data ?? []) as PickedProduct[];

  const createProject = trpc.videoProjects.create.useMutation({
    onSuccess: (project) => {
      onOpenChange(false);
      navigate(`/video-studio/${project.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  function resetAndClose(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch("");
      setSelectedProduct(null);
      setName("");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={resetAndClose}
      purpose="form"
      width={640}
      data-testid="video-studio-catalog-create-dialog"
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={pickCopy(lang, videoStudioCopy.newFromProduct)}
            subtitle={pickCopy(lang, {
              th: "เลือกสินค้าจากคลัง (ของคุณเองหรือแชร์จากกลุ่ม) เพื่อสร้างวิดีโอโดยอัตโนมัติ",
              en: "Pick a product from your catalog (yours or shared from a group) to auto-build a video from it.",
            })}
            onOpenChange={resetAndClose}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {selectedProduct ? (
                <div
                  className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
                  data-testid="video-studio-catalog-product-preview"
                >
                  <ProductThumb product={selectedProduct} />
                  <div className="min-w-0 flex-1">
                    <Text type="body" weight="bold" maxLines={1}>
                      {selectedProduct.productName}
                    </Text>
                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Text type="supporting" color="secondary">
                        {[selectedProduct.priceCurrent, selectedProduct.currency]
                          .filter(Boolean)
                          .join(" ") || "-"}
                      </Text>
                      {selectedProduct.accessType === "group" ? (
                        <Badge
                          variant="info"
                          label={pickCopy(lang, { th: "แชร์จากกลุ่ม", en: "Shared from group" })}
                        />
                      ) : null}
                    </HStack>
                  </div>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<X className="h-4 w-4" />}
                    label={pickCopy(lang, { th: "เปลี่ยนสินค้า", en: "Change product" })}
                    onClick={() => setSelectedProduct(null)}
                  />
                </div>
              ) : (
                <VStack gap={2}>
                  <TextInput
                    label={pickCopy(lang, { th: "ค้นหาสินค้า", en: "Search products" })}
                    value={search}
                    onChange={(value) => setSearch(value)}
                    startIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                    placeholder={pickCopy(lang, {
                      th: "ค้นหาด้วยชื่อสินค้า ร้านค้า หรือแบรนด์...",
                      en: "Search by product name, shop, or brand...",
                    })}
                  />

                  {productsQuery.isFetching ? (
                    <HStack gap={2} align="center" justify="center" className="py-8">
                      <Spinner size="sm" />
                      <Text type="body" color="secondary">
                        {pickCopy(lang, videoStudioCopy.loading)}
                      </Text>
                    </HStack>
                  ) : productsQuery.isError ? (
                    <Banner
                      status="error"
                      title={pickCopy(lang, { th: "โหลดรายการสินค้าไม่สำเร็จ", en: "Failed to load products" })}
                      description={productsQuery.error.message}
                      data-testid="video-studio-catalog-product-error"
                    />
                  ) : products.length === 0 ? (
                    <EmptyState
                      isCompact
                      icon={<SearchX className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />}
                      title={pickCopy(lang, {
                        th: "ไม่พบสินค้าที่เข้าถึงได้ (ของคุณเองหรือแชร์จากกลุ่ม)",
                        en: "No accessible products found (yours or shared from a group)",
                      })}
                    />
                  ) : (
                    <>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, {
                          th: `พบ ${products.length} รายการ`,
                          en: `${products.length} result${products.length === 1 ? "" : "s"}`,
                        })}
                      </Text>
                      <div
                        className="max-h-72 overflow-y-auto"
                        data-testid="video-studio-catalog-product-results"
                      >
                        <Grid columns={{ minWidth: 220, max: 2 }} gap={2}>
                          {products.map((product) => (
                            <ClickableCard
                              key={product.id}
                              label={product.productName}
                              padding={3}
                              onClick={() => setSelectedProduct(product)}
                            >
                              <HStack gap={3} align="center">
                                <ProductThumb product={product} />
                                <div className="min-w-0 flex-1">
                                  <Text type="body" weight="medium" maxLines={1}>
                                    {product.productName}
                                  </Text>
                                  <HStack gap={1} align="center" wrap="wrap">
                                    <Text type="supporting" color="secondary">
                                      {[product.priceCurrent, product.currency]
                                        .filter(Boolean)
                                        .join(" ") || "-"}
                                    </Text>
                                    {product.accessType === "group" ? (
                                      <Badge
                                        variant="neutral"
                                        label={pickCopy(lang, { th: "กลุ่ม", en: "Group" })}
                                      />
                                    ) : null}
                                  </HStack>
                                </div>
                              </HStack>
                            </ClickableCard>
                          ))}
                        </Grid>
                      </div>
                    </>
                  )}
                </VStack>
              )}

              <TextInput
                label={pickCopy(lang, { th: "ชื่อโปรเจกต์", en: "Project name" })}
                value={name || selectedProduct?.productName || ""}
                onChange={(value) => setName(value)}
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
                onClick={() => resetAndClose(false)}
              />
              <Button
                type="button"
                variant="primary"
                data-testid="video-studio-catalog-create-submit"
                label={pickCopy(lang, { th: "สร้างโปรเจกต์", en: "Create project" })}
                isDisabled={!selectedProduct}
                isLoading={createProject.isPending}
                onClick={() =>
                  selectedProduct &&
                  createProject.mutate({
                    studioType: "catalog",
                    name: (name || selectedProduct.productName || "Catalog video").slice(0, 200),
                    brief: { productId: selectedProduct.id, productName: selectedProduct.productName },
                    sourceRefs: { productIds: [selectedProduct.id] },
                  })
                }
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
