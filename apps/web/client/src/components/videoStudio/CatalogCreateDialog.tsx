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
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
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
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent data-testid="video-studio-catalog-create-dialog">
        <DialogHeader>
          <DialogTitle>{pickCopy(lang, videoStudioCopy.newFromProduct)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {selectedProduct ? (
            <div
              className="flex items-center gap-3 rounded-lg border border-border p-3"
              data-testid="video-studio-catalog-product-preview"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.productName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedProduct.productName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[selectedProduct.priceCurrent, selectedProduct.currency].filter(Boolean).join(" ") || "-"}
                  {selectedProduct.accessType === "group" ? (
                    <>
                      {" · "}
                      <Badge variant="secondary" className="align-middle text-[10px]">
                        {pickCopy(lang, { th: "แชร์จากกลุ่ม", en: "Shared from group" })}
                      </Badge>
                    </>
                  ) : null}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedProduct(null)}
                aria-label={pickCopy(lang, { th: "เปลี่ยนสินค้า", en: "Change product" })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="video-studio-catalog-product-search">
                {pickCopy(lang, { th: "ค้นหาสินค้า", en: "Search products" })}
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="video-studio-catalog-product-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={pickCopy(lang, {
                    th: "ค้นหาด้วยชื่อสินค้า ร้านค้า หรือแบรนด์...",
                    en: "Search by product name, shop, or brand...",
                  })}
                  className="pl-9"
                />
              </div>

              {productsQuery.isFetching ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {pickCopy(lang, videoStudioCopy.loading)}
                </div>
              ) : productsQuery.isError ? (
                <p className="text-sm text-destructive" data-testid="video-studio-catalog-product-error">
                  {productsQuery.error.message}
                </p>
              ) : products.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {pickCopy(lang, {
                    th: "ไม่พบสินค้าที่เข้าถึงได้ (ของคุณเองหรือแชร์จากกลุ่ม)",
                    en: "No accessible products found (yours or shared from a group)",
                  })}
                </p>
              ) : (
                <div
                  className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2"
                  data-testid="video-studio-catalog-product-results"
                >
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{product.productName}</p>
                        <p className="mt-0.5 truncate text-muted-foreground">
                          {[product.priceCurrent, product.currency].filter(Boolean).join(" ") || "-"}
                          {product.accessType === "group"
                            ? ` · ${pickCopy(lang, { th: "กลุ่ม", en: "Group" })}`
                            : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="video-studio-catalog-name">
              {pickCopy(lang, { th: "ชื่อโปรเจกต์", en: "Project name" })}
            </Label>
            <Input
              id="video-studio-catalog-name"
              value={name || selectedProduct?.productName || ""}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="video-studio-catalog-create-submit"
            disabled={!selectedProduct || createProject.isPending}
            onClick={() =>
              selectedProduct &&
              createProject.mutate({
                studioType: "catalog",
                name: (name || selectedProduct.productName || "Catalog video").slice(0, 200),
                brief: { productId: selectedProduct.id, productName: selectedProduct.productName },
                sourceRefs: { productIds: [selectedProduct.id] },
              })
            }
          >
            {createProject.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {pickCopy(lang, { th: "สร้างโปรเจกต์", en: "Create project" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
