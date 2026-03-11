/**
 * Content Quality Dashboard — Spec 038 Section 10
 *
 * Displays citation coverage, staleness, and content quality KPIs.
 */

import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck, AlertTriangle, BarChart3, RefreshCw } from "lucide-react";

export default function ContentQualityDashboard() {
  const overview = trpc.contentQuality.getOverview.useQuery();
  const bySkill = trpc.contentQuality.getBySkill.useQuery();
  const staleList = trpc.contentQuality.getStaleList.useQuery();
  const refreshMutation = trpc.contentArtifacts.refresh.useMutation({
    onSuccess: () => {
      staleList.refetch();
      overview.refetch();
    },
  });

  const stats = overview.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Content Quality Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Citation coverage, staleness tracking, and quality metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Artifacts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.total_artifacts ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats?.active ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {stats?.stale ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Coverage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats ? `${Math.round(stats.avg_citation_coverage * 100)}%` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Skill Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Coverage by Skill
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bySkill.data && bySkill.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Avg Coverage</TableHead>
                  <TableHead className="text-right">Stale</TableHead>
                  <TableHead className="text-right">Last Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySkill.data.map((row: any) => (
                  <TableRow key={row.skill_slug}>
                    <TableCell className="font-medium">
                      {row.skill_slug}
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">
                      <CoverageBadge value={row.avg_citation_coverage} />
                    </TableCell>
                    <TableCell className="text-right">
                      {row.stale_count > 0 ? (
                        <Badge variant="outline" className="text-amber-600">
                          {row.stale_count}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {row.last_generated
                        ? new Date(row.last_generated).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No content artifacts yet. Generate CMS content using reviewer or article writer skills.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stale Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Stale Content
          </CardTitle>
          <CardDescription>
            Content past its refresh cadence — review and update
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staleList.data && staleList.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Last Verified</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleList.data.map((item: any) => {
                  const overdue = item.nextRefreshAt
                    ? Math.floor(
                        (Date.now() - new Date(item.nextRefreshAt).getTime()) /
                          86400000
                      )
                    : 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.skillSlug}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.outputFormat}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.lastVerifiedAt
                          ? new Date(item.lastVerifiedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={overdue > 14 ? "destructive" : "outline"}
                        >
                          {overdue}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            refreshMutation.mutate({ id: item.id })
                          }
                          disabled={refreshMutation.isPending}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Refresh
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center flex items-center justify-center gap-2">
              <FileCheck className="h-4 w-4 text-green-500" />
              All content is up to date
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoverageBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const variant =
    pct >= 80 ? "default" : pct >= 60 ? "secondary" : "destructive";
  return <Badge variant={variant as "default" | "secondary" | "destructive"}>{pct}%</Badge>;
}
