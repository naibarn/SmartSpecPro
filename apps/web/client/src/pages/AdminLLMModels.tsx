import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Cpu, Layers, ToggleLeft } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiProviderAdmin } from "@/components/admin/MultiProviderAdmin";

export default function AdminLLMModels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [authLoading, setLocation, user]);

  const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const summary = useMemo(() => {
    const groups = Object.values(mappings ?? {});
    const rows = groups.flat();

    return {
      modelGroups: groups.length,
      mappings: rows.length,
      enabled: rows.filter((row) => row.isEnabled).length,
    };
  }, [mappings]);

  if (authLoading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 px-4 py-8 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/admin/llm-providers")}
        className="mb-4 text-gray-600"
      >
        <ChevronLeft className="mr-1 h-5 w-5" />
        Back to LLM Providers
      </Button>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Cpu className="h-8 w-8" />
            LLM Model Configuration
          </h1>
          <p className="mt-2 text-muted-foreground">
            แท็บเริ่มต้นจะแสดง LLM models ทั้งหมดแบบรายการยาวเพื่อให้เปิดหรือปิดได้ทันที และยังมีแท็บ group controls แยกไว้สำหรับจัดการทั้งกลุ่ม
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/admin/llm-providers")}>
          Manage Providers
        </Button>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Models</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Layers className="h-5 w-5" />
              {summary.modelGroups}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Mappings</CardDescription>
            <CardTitle className="text-2xl">{summary.mappings}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enabled Mappings</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl text-green-600">
              <ToggleLeft className="h-5 w-5" />
              {summary.enabled}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model Availability</CardTitle>
          <CardDescription>
            เริ่มจากรายการ models ทั้งหมดก่อน แล้วค่อยสลับไปแท็บ group controls เมื่อต้องการเปิดหรือปิดทั้งกลุ่ม
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading model mappings...</div>
          ) : (
            <MultiProviderAdmin tabs={["mappings"]} defaultTab="mappings" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
