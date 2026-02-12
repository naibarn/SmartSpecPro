import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Edit,
  Globe,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { AddMemberDialog } from "./AddMemberDialog";
import { CreateGroupDialog } from "./CreateGroupDialog";

export default function GroupDetailPanel() {
  const params = useParams<{ groupId: string }>();
  const groupId = Number(params.groupId);
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const trpcUtils = trpc.useUtils();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  // Auth redirect
  if (!authLoading && !isAuthenticated) {
    setLocation("/login");
    return null;
  }

  // Invalid groupId handling (Fix ISSUE 18)
  if (isNaN(groupId) || groupId <= 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">Invalid group ID.</p>
        <Button variant="link" onClick={() => setLocation("/groups")}>
          Back to Groups
        </Button>
      </div>
    );
  }

  const { data: group, isLoading: groupLoading } = trpc.groups.get.useQuery(
    { id: groupId },
    { enabled: !isNaN(groupId) && groupId > 0 },
  );

  const { data: members, isLoading: membersLoading } =
    trpc.groups.listMembers.useQuery(
      { groupId },
      { enabled: !isNaN(groupId) && groupId > 0 },
    );

  const deleteMutation = trpc.groups.delete.useMutation({
    onSuccess: () => {
      toast.success("Group deleted");
      trpcUtils.groups.list.invalidate();
      setLocation("/groups");
    },
    onError: (error) => toast.error(error.message),
  });

  const leaveMutation = trpc.groups.leave.useMutation({
    onSuccess: () => {
      toast.success("You left the group");
      trpcUtils.groups.list.invalidate();
      setLocation("/groups");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMemberMutation = trpc.groups.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      trpcUtils.groups.listMembers.invalidate({ groupId });
      trpcUtils.groups.get.invalidate({ id: groupId });
    },
    onError: (error) => toast.error(error.message),
  });

  const approveMutation = trpc.groups.approveMember.useMutation({
    onSuccess: () => {
      toast.success("Member approved");
      trpcUtils.groups.listMembers.invalidate({ groupId });
      trpcUtils.groups.get.invalidate({ id: groupId });
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.groups.rejectMember.useMutation({
    onSuccess: () => {
      toast.success("Request rejected");
      trpcUtils.groups.listMembers.invalidate({ groupId });
    },
    onError: (error) => toast.error(error.message),
  });

  if (groupLoading || membersLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="mb-2 h-4 w-64" />
        <Skeleton className="mb-8 h-4 w-96" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">Group not found.</p>
        <Button variant="link" onClick={() => setLocation("/groups")}>
          Back to Groups
        </Button>
      </div>
    );
  }

  const currentUserId = Number(user?.id);
  const isOwner = group.ownerId === currentUserId;
  const isAdmin = group.role === "admin";
  const canManage = isOwner || isAdmin;

  const activeMembers = members?.filter((m) => m.status === "active") ?? [];
  const pendingMembers = members?.filter((m) => m.status === "pending") ?? [];

  const settings = (group.settings ?? {
    visibility: "private",
    joinPolicy: "invite_only",
  }) as {
    visibility: string;
    joinPolicy: string;
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2"
            onClick={() => setLocation("/groups")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Groups
          </Button>
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold">{group.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{group.memberCount} members</span>
                <span>·</span>
                {settings.visibility === "public" ? (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Public
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Private
                  </span>
                )}
                {settings.visibility === "public" && (
                  <>
                    <span>·</span>
                    <JoinPolicyBadge policy={settings.joinPolicy} />
                  </>
                )}
              </div>
            </div>
          </div>
          {group.description && (
            <p className="mt-3 text-sm text-muted-foreground">
              {group.description}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Edit className="mr-1 h-4 w-4" />
              Edit
            </Button>
          )}
          {!isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLeaveConfirmOpen(true)}
            >
              <LogOut className="mr-1 h-4 w-4" />
              Leave
            </Button>
          )}
          {isOwner && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Pending Requests (admin only) */}
      {canManage && pendingMembers.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Pending Requests ({pendingMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {member.userName ?? "Unnamed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.userEmail}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        approveMutation.mutate({
                          groupId,
                          userId: member.userId,
                        })
                      }
                      disabled={approveMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        rejectMutation.mutate({
                          groupId,
                          userId: member.userId,
                        })
                      }
                      disabled={rejectMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Members</CardTitle>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddMemberOpen(true)}
              >
                <UserPlus className="mr-1 h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activeMembers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No active members
            </p>
          ) : (
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {(member.userName ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.userName ?? "Unnamed"}
                        {member.userId === currentUserId && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.userEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        member.role === "admin" ? "default" : "secondary"
                      }
                    >
                      {member.role === "admin"
                        ? member.userId === group.ownerId
                          ? "Owner"
                          : "Admin"
                        : "Member"}
                    </Badge>
                    {canManage &&
                      member.userId !== currentUserId &&
                      member.userId !== group.ownerId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() =>
                            removeMemberMutation.mutate({
                              groupId,
                              userId: member.userId,
                            })
                          }
                          disabled={removeMemberMutation.isPending}
                          aria-label={`Remove ${member.userName}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <CreateGroupDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        groupToEdit={{
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: settings.visibility,
          joinPolicy: settings.joinPolicy,
        }}
      />

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={isAddMemberOpen}
        onOpenChange={setIsAddMemberOpen}
        groupId={groupId}
        groupName={group.name}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{group.name}&quot;? This
              action cannot be undone. All members will be removed and shared
              permissions will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: groupId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Confirmation */}
      <AlertDialog
        open={isLeaveConfirmOpen}
        onOpenChange={setIsLeaveConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave &quot;{group.name}&quot;? You will
              lose access to shared files and permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leaveMutation.mutate({ groupId })}
              disabled={leaveMutation.isPending}
            >
              {leaveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Leave Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function JoinPolicyBadge({ policy }: { policy: string }) {
  switch (policy) {
    case "open":
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
        >
          Open
        </Badge>
      );
    case "request_to_join":
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
        >
          Request to Join
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">Invite Only</Badge>
      );
  }
}
