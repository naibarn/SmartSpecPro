import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5 text-purple-500" />
          Telegram Connections
        </CardTitle>
        <CardDescription>
          Manage linked Telegram accounts across all users in this tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {/* Filters */}
        <div className="flex items-center gap-3 p-4 border-b">
          <label className="text-sm font-medium text-gray-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(0);
            }}
            className="text-sm border rounded-md px-2 py-1.5"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="pending">Pending</option>
            <option value="blocked">Blocked</option>
          </select>
          {data && (
            <span className="text-xs text-muted-foreground ml-auto">
              {data.total} connection{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.connections.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
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
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
          <div className="flex items-center justify-between p-4 border-t">
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
      </CardContent>

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
    </Card>
  );
}
