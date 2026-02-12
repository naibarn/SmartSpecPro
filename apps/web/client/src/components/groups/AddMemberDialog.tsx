import { useState, useEffect, useRef } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
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
import { trpc } from "@/lib/trpc";

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number;
  groupName: string;
}

export function AddMemberDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
}: AddMemberDialogProps) {
  const trpcUtils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<"member" | "admin">(
    "member",
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      setSelectedUserId(null);
      setSelectedRole("member");
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimerRef.current);
  }, [searchQuery]);

  const { data: users, isLoading: isSearching } =
    trpc.groups.searchTenantUsers.useQuery(
      {
        query: debouncedQuery,
        excludeGroupId: groupId,
        limit: 10,
      },
      { enabled: debouncedQuery.length >= 1 },
    );

  const addMutation = trpc.groups.addMember.useMutation({
    onSuccess: () => {
      toast.success("Member added successfully");
      trpcUtils.groups.listMembers.invalidate({ groupId });
      trpcUtils.groups.get.invalidate({ id: groupId });
      setSelectedUserId(null);
      setSearchQuery("");
      setDebouncedQuery("");
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        toast.error("User is already a member of this group");
      } else if (error.message.includes("Maximum")) {
        toast.error("Group member limit reached");
      } else {
        toast.error("Failed to add member. Please try again.");
      }
    },
  });

  function handleAdd() {
    if (!selectedUserId) return;
    addMutation.mutate({
      groupId,
      userId: selectedUserId,
      role: selectedRole,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Search and add users to {groupName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
            {isSearching && debouncedQuery && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isSearching && debouncedQuery && users?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No users found
              </p>
            )}
            {!debouncedQuery && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Type to search for users
              </p>
            )}
            {users?.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedUserId === user.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
                onClick={() => setSelectedUserId(user.id)}
              >
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
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

          <div className="space-y-2">
            <Label>Role</Label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="member-role"
                  value="member"
                  checked={selectedRole === "member"}
                  onChange={() => setSelectedRole("member")}
                  className="accent-primary"
                />
                <span className="text-sm">Member</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="member-role"
                  value="admin"
                  checked={selectedRole === "admin"}
                  onChange={() => setSelectedRole("admin")}
                  className="accent-primary"
                />
                <span className="text-sm">Admin</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedUserId || addMutation.isPending}
          >
            {addMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
