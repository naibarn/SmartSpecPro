import { useLocation } from "wouter";
import { AppPage } from "@/components/AppPage";
import { MarketplaceAutoReviewJobNavigator } from "@/components/marketplaceCapture/MarketplaceAutoReviewJobNavigator";
import { trpc } from "@/lib/trpc";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export default function MarketplaceAutoReviewJobsPage() {
  const [, setLocation] = useLocation();
  const jobsQuery = trpc.marketplaceCapture.listAutoReviewRuns.useQuery(
    { limit: 50, summary: true },
    {
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      refetchInterval: query => {
        const runs = (query.state.data as any[]) ?? [];
        return runs.some(run => !TERMINAL_STATUSES.has(String(run?.status)))
          ? 30_000
          : 60_000;
      },
    }
  );

  return (
    <AppPage
      title="Marketplace Auto Review"
      description="รวมงานรีวิวสินค้าทั้งหมด เปิดงานเดิมเพื่อตรวจต่อ หรือกลับไปยังงานที่ยังค้างอยู่"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketplace Auto Review" },
      ]}
      state="ready"
    >
      <MarketplaceAutoReviewJobNavigator
        runs={(jobsQuery.data as any[]) ?? []}
        loading={jobsQuery.isLoading}
        error={jobsQuery.error?.message ?? null}
        allProducts
        onOpenRun={runId =>
          setLocation(`/marketplace/auto-review/${encodeURIComponent(runId)}`)
        }
        onCreateNew={() => setLocation("/marketplace-capture")}
        className="min-h-[32rem] w-full"
      />
    </AppPage>
  );
}
