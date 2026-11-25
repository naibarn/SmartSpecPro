import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
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
const ALL_SERIES = "__all_series__";

export default function MarketplaceAutoReviewJobsPage() {
  const [, setLocation] = useLocation();
  const [selectedProductId, setSelectedProductId] = useState(ALL_PRODUCTS);
  const [selectedSeriesId, setSelectedSeriesId] = useState(ALL_SERIES);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const productsQuery = trpc.marketplaceCapture.listAutoReviewRunProducts.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const seriesQuery = trpc.marketplaceCapture.listAutoReviewRunSeries.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const jobsQuery = trpc.marketplaceCapture.listAutoReviewRuns.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      cursor: 0,
      productId: selectedProductId === ALL_PRODUCTS ? undefined : selectedProductId,
      seriesId: selectedSeriesId === ALL_SERIES ? undefined : selectedSeriesId,
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
  const deleteRunMutation =
    trpc.marketplaceCapture.deleteAutoReviewRun.useMutation({
      onSuccess: async () => {
        toast.success("ลบ Job แล้ว");
        void jobsQuery.refetch();
        void productsQuery.refetch();
        const refreshedSeries = await seriesQuery.refetch();
        if (
          refreshedSeries.data &&
          selectedSeriesId !== ALL_SERIES &&
          !refreshedSeries.data.some(
            series => series.seriesId === selectedSeriesId
          )
        ) {
          setSelectedSeriesId(ALL_SERIES);
        }
      },
      onError: error => toast.error(`ลบ Job ไม่สำเร็จ: ${error.message}`),
      onSettled: () => setDeletingRunId(null),
    });
  const handleDeleteRun = (runId: string) => {
    setDeletingRunId(runId);
    deleteRunMutation.mutate({ runId });
  };

  return (
    <AppPage
      title="Marketplace Auto Review"
      description="รวมงานรีวิวทั้งหมด เรียงจากงานที่สร้างล่าสุด เลือกกรองตามสินค้าและซีรีส์ แล้วเปิดดูรายละเอียดแต่ละงานได้"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketplace Auto Review" },
      ]}
      toolbar={
        <section className="flex flex-wrap items-center gap-3">
          <section className="flex flex-col gap-1">
            <Label htmlFor="auto-review-product-filter">กรองตามสินค้า</Label>
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
            >
              <SelectTrigger
                id="auto-review-product-filter"
                className="w-full sm:w-80"
              >
                <SelectValue placeholder="ทุกสินค้า" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PRODUCTS}>ทุกสินค้า</SelectItem>
                {(productsQuery.data ?? []).map(product => (
                  <SelectItem key={product.productId} value={product.productId}>
                    {product.productName
                      ? `${product.productName} · ${product.productId}`
                      : product.productId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
          <section className="flex flex-col gap-1">
            <Label htmlFor="auto-review-series-filter">กรองตามซีรีส์</Label>
            <Select
              value={selectedSeriesId}
              onValueChange={setSelectedSeriesId}
            >
              <SelectTrigger
                id="auto-review-series-filter"
                className="w-full sm:w-80"
              >
                <SelectValue placeholder="ทุกซีรีส์" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SERIES}>ทุกซีรีส์</SelectItem>
                {(seriesQuery.data ?? []).map(series => (
                  <SelectItem key={series.seriesId} value={series.seriesId}>
                    {series.seriesName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        </section>
      }
      state="ready"
    >
      <section className="mb-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm text-slate-700 shadow-sm">
        <h2 className="font-semibold text-violet-950">
          หน้านี้ใช้ค้นหาและเลือกงาน
        </h2>
        <p className="mt-1 leading-6">
          งานใหม่อยู่บนสุด เลือกกรองตามสินค้าและซีรีส์ได้ กดการ์ดงานเพื่อเปิด
          Job Workbench และใช้ปุ่มถังขยะเพื่อลบ Job ที่มีปัญหา
        </p>
      </section>
      <MarketplaceAutoReviewJobNavigator
        runs={runs}
        loading={jobsQuery.isLoading}
        error={jobsQuery.error?.message ?? null}
        allProducts
        appearance="light"
        largeProductThumbnails
        openRunsInNewTab
        productOptions={productsQuery.data ?? []}
        hasMore={jobsQuery.hasNextPage}
        loadingMore={jobsQuery.isFetchingNextPage}
        onLoadMore={() => void jobsQuery.fetchNextPage()}
        onMediaLoadError={() => void jobsQuery.refetch()}
        onDeleteRun={handleDeleteRun}
        deletingRunId={deletingRunId}
        onOpenRun={runId =>
          setLocation(`/marketplace/auto-review/${encodeURIComponent(runId)}`)
        }
        onCreateNew={() => setLocation("/marketplace-capture")}
        className="min-h-[32rem] w-full"
      />
    </AppPage>
  );
}
