import React, { useState, useEffect, useRef } from "react";
import { ExternalLink, Loader2, Search, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import { CopyLinkButton } from "./CopyLinkButton";
import { PermissionBadge } from "./PermissionBadge";
import type { PermissionLevel } from "./PermissionBadge";
import { buildPublicDocumentShareUrl } from "@/lib/documentManagementUi";

interface ShareDialogProps {
  itemId: number;
  itemTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

type SharePermission = "read" | "write" | "delete";

export function ShareDialog({
  itemId,
  itemTitle,
  isOpen,
  onClose,
}: ShareDialogProps) {
  const { confirm } = useConfirm();
  const trpcUtils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] =
    useState<SharePermission>("read");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const publicShareQuery = trpc.library.getPublicShareLink.useQuery(
    { itemId },
    { enabled: isOpen && itemId > 0 },
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setDebouncedQuery("");
      setSelectedUserId(null);
      setSelectedUserName("");
      setSelectedGroupId("");
      setSelectedPermission("read");
    }
  }, [isOpen]);

  // Debounce user search
  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimerRef.current);
  }, [searchQuery]);

  // Queries
  const { data: sharesData, isLoading: isLoadingShares, error: sharesError } =
    trpc.library.getItemShares.useQuery(
      { itemId },
      { enabled: isOpen && itemId > 0 },
    );

  const { data: groups, isLoading: isLoadingGroups } = trpc.groups.list.useQuery(
    { scope: "all" },
    { enabled: isOpen },
  );

  const { data: userResults, isLoading: isSearchingUsers } =
    trpc.groups.searchTenantUsers.useQuery(
      { query: debouncedQuery, limit: 10 },
      { enabled: debouncedQuery.length >= 2 },
    );

  // Mutations
  const shareItemMutation = trpc.library.shareItem.useMutation({
    onSuccess: () => {
      toast.success("Share added");
      trpcUtils.library.getItemShares.invalidate({ itemId });
      trpcUtils.library.listDocuments.invalidate();
      setSelectedUserId(null);
      setSelectedUserName("");
      setSelectedGroupId("");
      setSearchQuery("");
      setDebouncedQuery("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add share");
    },
  });

  const removeShareMutation = trpc.library.removeShare.useMutation({
    onSuccess: () => {
      toast.success("Share removed");
      trpcUtils.library.getItemShares.invalidate({ itemId });
      trpcUtils.library.listDocuments.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove share");
    },
  });

  const updatePermissionMutation =
    trpc.library.updateSharePermission.useMutation({
      onSuccess: () => {
        toast.success("Permission updated");
        trpcUtils.library.getItemShares.invalidate({ itemId });
        trpcUtils.library.listDocuments.invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update permission");
      },
    });

  const createPublicShareMutation = trpc.library.createPublicShareLink.useMutation({
    onSuccess: async () => {
      toast.success("Public link created");
      await trpcUtils.library.getPublicShareLink.invalidate({ itemId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create public link");
    },
  });

  const revokePublicShareMutation = trpc.library.revokePublicShareLink.useMutation({
    onSuccess: async () => {
      toast.success("Public link revoked");
      await trpcUtils.library.getPublicShareLink.invalidate({ itemId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke public link");
    },
  });

  const shares = sharesData?.shares ?? [];
  const hasError = Boolean(sharesError);
  const isMutating =
    shareItemMutation.isPending ||
    removeShareMutation.isPending ||
    updatePermissionMutation.isPending ||
    createPublicShareMutation.isPending ||
    revokePublicShareMutation.isPending;
  const publicShareUrl = publicShareQuery.data?.link?.token && publicShareQuery.data.link.itemId === itemId
    ? buildPublicDocumentShareUrl(
        publicShareQuery.data.link.token,
        typeof window !== "undefined" ? window.location.origin : "",
      )
    : "";
  const canManagePublicShare = publicShareQuery.data?.canManage ?? false;
  const hasPublicShare = Boolean(publicShareQuery.data?.link?.token && publicShareQuery.data.link.itemId === itemId);

  function handleAddShare() {
    if (selectedGroupId) {
      shareItemMutation.mutate({
        itemId,
        subjectType: "group",
        subjectId: selectedGroupId,
        permissionLevel: selectedPermission,
      });
    } else if (selectedUserId) {
      shareItemMutation.mutate({
        itemId,
        subjectType: "user",
        subjectId: String(selectedUserId),
        permissionLevel: selectedPermission,
      });
    }
  }

  async function handleRemoveShare(
    subjectType: "user" | "tenant_role" | "group",
    subjectId: string,
    displayName: string,
  ) {
    const confirmed = await confirm({
      title: `Remove access for ${displayName}?`,
      tone: "danger",
      confirmText: "Remove",
    });
    if (!confirmed) return;
    removeShareMutation.mutate({ itemId, subjectType, subjectId });
  }

  function handleUpdatePermission(
    subjectType: "user" | "tenant_role" | "group",
    subjectId: string,
    permissionLevel: SharePermission,
  ) {
    updatePermissionMutation.mutate({
      itemId,
      subjectType,
      subjectId,
      permissionLevel,
    });
  }

  function selectUser(userId: number, userName: string) {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setSelectedGroupId("");
  }

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedUserId(null);
    setSelectedUserName("");
    setSearchQuery("");
    setDebouncedQuery("");
  }

  const canAdd = selectedUserId !== null || selectedGroupId !== "";

  function getShareDisplayName(share: (typeof shares)[0]) {
    if (share.subjectType === "user") {
      return share.userName ?? `User #${share.subjectId}`;
    }
    if (share.subjectType === "group") {
      return share.groupName ?? `Group #${share.subjectId}`;
    }
    return share.roleName ?? share.subjectId;
  }

  function getShareIcon(share: (typeof shares)[0]) {
    if (share.subjectType === "group") {
      return <Users className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {(share.userName ?? share.subjectId).charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Share{itemTitle ? ` "${itemTitle}"` : ""}
          </DialogTitle>
          <DialogDescription>
            Add people or groups and manage access
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Public link</p>
                <p className="mt-1 text-sm text-sky-900/80">
                  {canManagePublicShare
                    ? "Create a read-only link that opens the file without requiring sign-in."
                    : "Only users who can manage this file can create or revoke a public link."}
                </p>
              </div>
              <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm">
                {hasPublicShare ? "Active" : "Inactive"}
              </div>
            </div>

            {hasPublicShare ? (
              <div className="mt-4 space-y-3">
                <Input value={publicShareUrl} readOnly aria-label="Public share link" />
                {publicShareQuery.data?.link?.expiresAt ? (
                  <p className="text-xs text-sky-800/80">
                    Expires {new Date(publicShareQuery.data.link.expiresAt).toLocaleString()}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton shareUrl={publicShareUrl} />
                  <Button asChild variant="outline" className="gap-2">
                    <a href={publicShareUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </Button>
                  {canManagePublicShare ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => revokePublicShareMutation.mutate({ itemId })}
                      disabled={revokePublicShareMutation.isPending}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : canManagePublicShare ? (
              <div className="mt-4">
                <Button
                  type="button"
                  onClick={() => createPublicShareMutation.mutate({ itemId })}
                  disabled={createPublicShareMutation.isPending}
                >
                  Create public link
                </Button>
              </div>
            ) : null}
          </div>

          {hasError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load shares. Please try again.
            </div>
          )}

          {/* User search */}
          <div className="space-y-2">
            <Label>Search for people</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedGroupId("");
                }}
                className="pl-9"
                aria-label="Search for users to share with"
              />
            </div>

            {/* User search results */}
            {debouncedQuery.length >= 2 && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-1">
                {isSearchingUsers && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!isSearchingUsers && userResults?.length === 0 && (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No users found
                  </p>
                )}
                {userResults?.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selectedUserId === user.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => {
                      const displayName = user.name || user.email || "User";
                      selectUser(user.id, displayName);
                    }}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {user.name ?? "Unnamed"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedUserId && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-1.5 text-sm">
                <span className="font-medium">{selectedUserName}</span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedUserId(null);
                    setSelectedUserName("");
                  }}
                  aria-label="Clear user selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Group selection */}
          <div className="space-y-2">
            <Label>Or select a group</Label>
            <Select
              value={selectedGroupId}
              onValueChange={selectGroup}
            >
              <SelectTrigger aria-label="Select group to share with">
                <SelectValue placeholder="Select group..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingGroups && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {groups?.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      <span>{group.name}</span>
                    </div>
                  </SelectItem>
                ))}
                {!isLoadingGroups && (!groups || groups.length === 0) && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No groups available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Permission selector + Add button */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>Permission level</Label>
              <Select
                value={selectedPermission}
                onValueChange={(v) =>
                  setSelectedPermission(v as SharePermission)
                }
              >
                <SelectTrigger aria-label="Permission level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Can Edit</SelectItem>
                  <SelectItem value="delete">Can Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddShare}
              disabled={!canAdd || isMutating || hasError}
            >
              {shareItemMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              Add
            </Button>
          </div>

          {/* Current shares */}
          <div className="space-y-2">
            <Label>Who has access</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
              {isLoadingShares && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoadingShares && shares.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No shares yet
                </p>
              )}
              {shares.map((share) => {
                const isOwner = share.permissionLevel === "owner";
                return (
                  <div
                    key={`${share.subjectType}-${share.subjectId}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    {getShareIcon(share)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {getShareDisplayName(share)}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {share.subjectType === "group"
                          ? "Group"
                          : share.subjectType === "user"
                            ? "User"
                            : share.subjectType}
                      </p>
                    </div>

                    {isOwner ? (
                      <PermissionBadge level="owner" />
                    ) : (
                      <Select
                        value={share.permissionLevel}
                        onValueChange={(v) =>
                          handleUpdatePermission(
                            share.subjectType as "user" | "tenant_role" | "group",
                            share.subjectId,
                            v as SharePermission,
                          )
                        }
                      >
                        <SelectTrigger
                          className="h-7 w-28"
                          aria-label={`Permission for ${getShareDisplayName(share)}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read Only</SelectItem>
                          <SelectItem value="write">Can Edit</SelectItem>
                          <SelectItem value="delete">Can Delete</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {isOwner ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled
                        aria-label="Cannot remove owner"
                        title="Cannot remove owner"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          handleRemoveShare(
                            share.subjectType as "user" | "tenant_role" | "group",
                            share.subjectId,
                            getShareDisplayName(share),
                          )
                        }
                        disabled={isMutating}
                        aria-label={`Remove access for ${getShareDisplayName(share)}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMutating}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
