/**
 * Admin Ops Dashboard
 *
 * Operational health monitoring with 6 panels:
 * Traffic & Auth, API Health, Jobs, Kie AI, Storage, Security
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Activity,
  Server,
  HardDrive,
  Shield,
  Zap,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import TrafficPanel from "./panels/TrafficPanel";
import ApiHealthPanel from "./panels/ApiHealthPanel";
import JobsHealthPanel from "./panels/JobsHealthPanel";
import KieAiHealthPanel from "./panels/KieAiHealthPanel";
import StoragePanel from "./panels/StoragePanel";
import SecurityPanel from "./panels/SecurityPanel";

export default function AdminOpsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("traffic");
  const [refreshInterval, setRefreshInterval] = useState<number | null>(30000);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const toggleAutoRefresh = () => {
    setRefreshInterval(prev => prev ? null : 30000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Ops Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              System health and operational metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={refreshInterval ? "default" : "secondary"}>
            {refreshInterval ? "Auto-refresh: 30s" : "Paused"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAutoRefresh}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshInterval ? "animate-spin" : ""}`} />
            {refreshInterval ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>

      {/* Tabbed Panels */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="traffic" className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Traffic</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Jobs</span>
          </TabsTrigger>
          <TabsTrigger value="kie" className="flex items-center gap-1">
            <Server className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kie AI</span>
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Storage</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="traffic">
          <TrafficPanel refreshInterval={refreshInterval} />
        </TabsContent>
        <TabsContent value="api">
          <ApiHealthPanel refreshInterval={refreshInterval} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsHealthPanel refreshInterval={refreshInterval} />
        </TabsContent>
        <TabsContent value="kie">
          <KieAiHealthPanel refreshInterval={refreshInterval} />
        </TabsContent>
        <TabsContent value="storage">
          <StoragePanel refreshInterval={refreshInterval} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityPanel refreshInterval={refreshInterval} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
