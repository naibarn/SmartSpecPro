import React, { useState, useEffect, useRef } from "react";
import { Loader2, Search, Users, X } from "lucide-react";
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
import { PermissionBadge } from "./PermissionBadge";
import type { PermissionLevel } from "./PermissionBadge";

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
  const trpcUtils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] =
    useState<SharePermission>("read");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update permission");
      },
    });

  const shares = sharesData?.shares ?? [];
  const hasError = Boolean(sharesError);
  const isMutating =
    shareItemMutation.isPending ||
    removeShareMutation.isPending ||
    updatePermissionMutation.isPending;

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

  function handleRemoveShare(
    subjectType: "user" | "tenant_role" | "group",
    subjectId: string,
    displayName: string,
  ) {
    const confirmed = window.confirm(`Remove access for ${displayName}?`);
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
