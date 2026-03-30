import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Users, ChevronLeft, ChevronRight, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  active: { className: "bg-green-100 text-green-700 border-green-200", label: "Active" },
  revoked: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Revoked" },
  pending: { className: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
  blocked: { className: "bg-red-100 text-red-700 border-red-200", label: "Blocked" },
};

const LIMIT = 20;

export default function TelegramConnectionsPanel() {
  const [statusFilter, setStatusFilter] = useState<"active" | "revoked" | "pending" | "blocked" | "">("");
  const [page, setPage] = useState(0);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; username: string | null } | null>(null);

  const { data, isLoading, refetch } = trpc.telegram.adminListConnections.useQuery({
    status: (statusFilter || undefined) as "active" | "revoked" | "pending" | "blocked" | undefined,
    limit: LIMIT,
    offset: page * LIMIT,
  });

  const revokeMutation = trpc.telegram.adminRevokeConnection.useMutation({
    onSuccess: () => {
      toast.success("Connection revoked");
      refetch();
      setRevokeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <DashboardCard
      title="Telegram Connections"
      description="Manage linked Telegram accounts across all users in this tenant."
      leading={<Users className="h-5 w-5 text-sky-500" />}
      trailing={data ? (
        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {data.total} connection{data.total !== 1 ? "s" : ""}
        </Badge>
      ) : null}
      bodyClassName="p-0"
    >
      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4 sm:px-6">
        <label className="text-sm font-medium text-slate-600">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(0);
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {/* Table */}
      <div className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.connections.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No Telegram connections found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Telegram</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.connections.map((conn) => {
                const badge = STATUS_BADGE[conn.status] ?? STATUS_BADGE.pending;
                return (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{conn.userName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{conn.userEmail ?? `User #${conn.userId}`}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {conn.telegramUsername ? `@${conn.telegramUsername}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(conn.linkedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {conn.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setRevokeTarget({ id: conn.id, username: conn.telegramUsername })}
                        >
                          <ShieldX className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200/80 pt-4">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Telegram Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect{" "}
              {revokeTarget?.username ? `@${revokeTarget.username}` : "this user"} from
              Telegram and unbind all their conversation bridges. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => revokeTarget && revokeMutation.mutate({ connectionId: revokeTarget.id })}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardCard>
  );
}
