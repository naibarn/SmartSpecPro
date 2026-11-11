import { useState } from "react";
import { useLocation } from "wouter";
import { AppPage } from "@/components/AppPage";
import { MarketplaceAutoReviewJobNavigator } from "@/components/marketplaceCapture/MarketplaceAutoReviewJobNavigator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const PAGE_SIZE = 50;
const ALL_PRODUCTS = "__all_products__";

export default function MarketplaceAutoReviewJobsPage() {
  const [, setLocation] = useLocation();
  const [selectedProductId, setSelectedProductId] = useState(ALL_PRODUCTS);
  const productsQuery = trpc.marketplaceCapture.listAutoReviewRunProducts.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const jobsQuery = trpc.marketplaceCapture.listAutoReviewRuns.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      cursor: 0,
      productId: selectedProductId === ALL_PRODUCTS ? undefined : selectedProductId,
      summary: true,
    },
    {
      initialCursor: 0,
      getNextPageParam: (lastPage, allPages) =>
        lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      refetchInterval: query => {
        const runs =
          (query.state.data as { pages?: any[][] } | undefined)?.pages?.flat() ?? [];
        return runs.some(run => !TERMINAL_STATUSES.has(String(run?.status)))
          ? 30_000
          : 60_000;
      },
    }
  );
  const runs = jobsQuery.data?.pages.flat() ?? [];

  return (
    <AppPage
      title="Marketplace Auto Review"
      description="รวมงานรีวิวทั้งหมด เรียงจากงานที่สร้างล่าสุด เลือกกรองตามสินค้าและเปิดดูรายละเอียดแต่ละงานได้"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketplace Auto Review" },
      ]}
      toolbar={
        <section className="flex flex-wrap items-center gap-3">
          <Label htmlFor="auto-review-product-filter">กรองตามสินค้า</Label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger id="auto-review-product-filter" className="w-full sm:w-80">
              <SelectValue placeholder="ทุกสินค้า" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PRODUCTS}>ทุกสินค้า</SelectItem>
              {(productsQuery.data ?? []).map(productId => (
                <SelectItem key={productId} value={productId}>
                  {productId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      }
      state="ready"
    >
      <MarketplaceAutoReviewJobNavigator
        runs={runs}
        loading={jobsQuery.isLoading}
        error={jobsQuery.error?.message ?? null}
        allProducts
        hasMore={jobsQuery.hasNextPage}
        loadingMore={jobsQuery.isFetchingNextPage}
        onLoadMore={() => void jobsQuery.fetchNextPage()}
        onOpenRun={runId =>
          setLocation(`/marketplace/auto-review/${encodeURIComponent(runId)}`)
        }
        onCreateNew={() => setLocation("/marketplace-capture")}
        className="min-h-[32rem] w-full"
      />
    </AppPage>
  );
}
