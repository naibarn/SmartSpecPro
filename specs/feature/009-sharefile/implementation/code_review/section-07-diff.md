diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index f2f5b4a..6f049eb 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -57,6 +57,9 @@ import MediaStudio from "./pages/MediaStudio";
 import Credits from "./pages/Credits";
 import MediaHistory from "./pages/MediaHistory";
 import DocumentManagement from "./pages/DocumentManagement";
+import GroupManagement from "./pages/GroupManagement";
+import GroupDiscovery from "./pages/GroupDiscovery";
+import GroupDetailPanel from "./components/groups/GroupDetailPanel";
 import Settings from "./pages/Settings";
 import SkillBrowser from "./pages/SkillBrowser";
 import DockerRedirect from "./pages/DockerRedirect";
@@ -132,6 +135,9 @@ function Router() {
       <Route path="/usage" component={UsageAnalytics} />
       <Route path="/tasks" component={TaskQueueMonitor} />
       <Route path="/media-history" component={MediaHistory} />
+      <Route path="/groups" component={GroupManagement} />
+      <Route path="/groups/discover" component={GroupDiscovery} />
+      <Route path="/groups/:groupId" component={GroupDetailPanel} />
       <Route path="/document-management" component={DocumentManagement} />
       <Route path="/settings" component={Settings} />
       <Route path="/settings/skills" component={SkillBrowser} />
diff --git a/apps/web/client/src/components/groups/AddMemberDialog.test.ts b/apps/web/client/src/components/groups/AddMemberDialog.test.ts
new file mode 100644
index 0000000..34cc2cf
--- /dev/null
+++ b/apps/web/client/src/components/groups/AddMemberDialog.test.ts
@@ -0,0 +1,13 @@
+import { describe, it } from "vitest";
+
+// Section 07: AddMemberDialog component tests
+// Component tests require jsdom environment which is not configured.
+// These stubs document expected behavior; full integration tests in section-11.
+
+describe("AddMemberDialog", () => {
+  it.todo("debounces user search (300ms delay)");
+  it.todo("excludes users already in group");
+  it.todo("renders user names and emails in results");
+  it.todo("selects role (Member/Admin) via radio buttons");
+  it.todo("calls addMember mutation on 'Add' button click");
+});
diff --git a/apps/web/client/src/components/groups/AddMemberDialog.tsx b/apps/web/client/src/components/groups/AddMemberDialog.tsx
new file mode 100644
index 0000000..469e4f7
--- /dev/null
+++ b/apps/web/client/src/components/groups/AddMemberDialog.tsx
@@ -0,0 +1,207 @@
+import { useState, useEffect, useRef } from "react";
+import { Loader2, Search, UserPlus } from "lucide-react";
+import { toast } from "sonner";
+
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import { trpc } from "@/lib/trpc";
+
+interface AddMemberDialogProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  groupId: number;
+  groupName: string;
+}
+
+export function AddMemberDialog({
+  open,
+  onOpenChange,
+  groupId,
+  groupName,
+}: AddMemberDialogProps) {
+  const trpcUtils = trpc.useUtils();
+  const [searchQuery, setSearchQuery] = useState("");
+  const [debouncedQuery, setDebouncedQuery] = useState("");
+  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
+  const [selectedRole, setSelectedRole] = useState<"member" | "admin">(
+    "member",
+  );
+  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
+
+  useEffect(() => {
+    if (!open) {
+      setSearchQuery("");
+      setDebouncedQuery("");
+      setSelectedUserId(null);
+      setSelectedRole("member");
+    }
+  }, [open]);
+
+  useEffect(() => {
+    clearTimeout(debounceTimerRef.current);
+    debounceTimerRef.current = setTimeout(() => {
+      setDebouncedQuery(searchQuery);
+    }, 300);
+    return () => clearTimeout(debounceTimerRef.current);
+  }, [searchQuery]);
+
+  const { data: users, isLoading: isSearching } =
+    trpc.groups.searchTenantUsers.useQuery(
+      {
+        query: debouncedQuery,
+        excludeGroupId: groupId,
+        limit: 10,
+      },
+      { enabled: debouncedQuery.length >= 1 },
+    );
+
+  const addMutation = trpc.groups.addMember.useMutation({
+    onSuccess: () => {
+      toast.success("Member added successfully");
+      trpcUtils.groups.listMembers.invalidate({ groupId });
+      trpcUtils.groups.get.invalidate({ id: groupId });
+      setSelectedUserId(null);
+      setSearchQuery("");
+      setDebouncedQuery("");
+    },
+    onError: (error) => {
+      if (error.data?.code === "CONFLICT") {
+        toast.error("User is already a member of this group");
+      } else if (error.message.includes("Maximum")) {
+        toast.error("Group member limit reached");
+      } else {
+        toast.error("Failed to add member. Please try again.");
+      }
+    },
+  });
+
+  function handleAdd() {
+    if (!selectedUserId) return;
+    addMutation.mutate({
+      groupId,
+      userId: selectedUserId,
+      role: selectedRole,
+    });
+  }
+
+  return (
+    <Dialog open={open} onOpenChange={onOpenChange}>
+      <DialogContent className="sm:max-w-[425px]">
+        <DialogHeader>
+          <DialogTitle>Add Member</DialogTitle>
+          <DialogDescription>
+            Search and add users to {groupName}
+          </DialogDescription>
+        </DialogHeader>
+
+        <div className="space-y-4">
+          <div className="relative">
+            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+            <Input
+              placeholder="Search by name or email..."
+              value={searchQuery}
+              onChange={(e) => setSearchQuery(e.target.value)}
+              className="pl-9"
+            />
+          </div>
+
+          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
+            {isSearching && debouncedQuery && (
+              <div className="flex items-center justify-center py-4">
+                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
+              </div>
+            )}
+            {!isSearching && debouncedQuery && users?.length === 0 && (
+              <p className="py-4 text-center text-sm text-muted-foreground">
+                No users found
+              </p>
+            )}
+            {!debouncedQuery && (
+              <p className="py-4 text-center text-sm text-muted-foreground">
+                Type to search for users
+              </p>
+            )}
+            {users?.map((user) => (
+              <button
+                key={user.id}
+                type="button"
+                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
+                  selectedUserId === user.id
+                    ? "bg-primary/10 text-primary"
+                    : "hover:bg-muted"
+                }`}
+                onClick={() => setSelectedUserId(user.id)}
+              >
+                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
+                <div className="min-w-0 flex-1">
+                  <p className="truncate font-medium">
+                    {user.name ?? "Unnamed"}
+                  </p>
+                  <p className="truncate text-xs text-muted-foreground">
+                    {user.email}
+                  </p>
+                </div>
+              </button>
+            ))}
+          </div>
+
+          <div className="space-y-2">
+            <Label>Role</Label>
+            <div className="flex gap-4">
+              <label className="flex cursor-pointer items-center gap-2">
+                <input
+                  type="radio"
+                  name="member-role"
+                  value="member"
+                  checked={selectedRole === "member"}
+                  onChange={() => setSelectedRole("member")}
+                  className="accent-primary"
+                />
+                <span className="text-sm">Member</span>
+              </label>
+              <label className="flex cursor-pointer items-center gap-2">
+                <input
+                  type="radio"
+                  name="member-role"
+                  value="admin"
+                  checked={selectedRole === "admin"}
+                  onChange={() => setSelectedRole("admin")}
+                  className="accent-primary"
+                />
+                <span className="text-sm">Admin</span>
+              </label>
+            </div>
+          </div>
+        </div>
+
+        <DialogFooter>
+          <Button
+            variant="outline"
+            onClick={() => onOpenChange(false)}
+            disabled={addMutation.isPending}
+          >
+            Cancel
+          </Button>
+          <Button
+            onClick={handleAdd}
+            disabled={!selectedUserId || addMutation.isPending}
+          >
+            {addMutation.isPending && (
+              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+            )}
+            Add Member
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/groups/CreateGroupDialog.test.ts b/apps/web/client/src/components/groups/CreateGroupDialog.test.ts
new file mode 100644
index 0000000..6ad9ac1
--- /dev/null
+++ b/apps/web/client/src/components/groups/CreateGroupDialog.test.ts
@@ -0,0 +1,15 @@
+import { describe, it } from "vitest";
+
+// Section 07: CreateGroupDialog component tests
+// Component tests require jsdom environment which is not configured.
+// These stubs document expected behavior; full integration tests in section-11.
+
+describe("CreateGroupDialog", () => {
+  it.todo("validates required name field");
+  it.todo("enforces max 128 chars for name");
+  it.todo("enforces max 512 chars for description");
+  it.todo("shows 'Join Policy' options only when visibility = 'public'");
+  it.todo("calls create mutation on submit");
+  it.todo("calls update mutation on submit (edit mode)");
+  it.todo("shows error on duplicate group name");
+});
diff --git a/apps/web/client/src/components/groups/CreateGroupDialog.tsx b/apps/web/client/src/components/groups/CreateGroupDialog.tsx
new file mode 100644
index 0000000..e2be3ad
--- /dev/null
+++ b/apps/web/client/src/components/groups/CreateGroupDialog.tsx
@@ -0,0 +1,272 @@
+import { useState, useEffect } from "react";
+import { Loader2 } from "lucide-react";
+import { toast } from "sonner";
+
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import { Textarea } from "@/components/ui/textarea";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { trpc } from "@/lib/trpc";
+
+interface CreateGroupDialogProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  groupToEdit?: {
+    id: number;
+    name: string;
+    description?: string | null;
+    visibility: string;
+    joinPolicy?: string;
+  };
+}
+
+export function CreateGroupDialog({
+  open,
+  onOpenChange,
+  groupToEdit,
+}: CreateGroupDialogProps) {
+  const isEditMode = !!groupToEdit;
+  const trpcUtils = trpc.useUtils();
+
+  const [name, setName] = useState("");
+  const [description, setDescription] = useState("");
+  const [visibility, setVisibility] = useState<"private" | "public">("private");
+  const [joinPolicy, setJoinPolicy] = useState<
+    "invite_only" | "request_to_join" | "open"
+  >("invite_only");
+  const [nameError, setNameError] = useState("");
+  const [descError, setDescError] = useState("");
+
+  useEffect(() => {
+    if (open && groupToEdit) {
+      setName(groupToEdit.name);
+      setDescription(groupToEdit.description ?? "");
+      setVisibility(
+        groupToEdit.visibility === "public" ? "public" : "private",
+      );
+      setJoinPolicy(
+        (groupToEdit.joinPolicy as typeof joinPolicy) ?? "invite_only",
+      );
+    } else if (open) {
+      setName("");
+      setDescription("");
+      setVisibility("private");
+      setJoinPolicy("invite_only");
+    }
+    setNameError("");
+    setDescError("");
+  }, [open, groupToEdit]);
+
+  const createMutation = trpc.groups.create.useMutation({
+    onSuccess: () => {
+      toast.success("Group created successfully");
+      trpcUtils.groups.list.invalidate();
+      onOpenChange(false);
+    },
+    onError: (error) => {
+      if (error.message.includes("already exists") || error.data?.code === "CONFLICT") {
+        setNameError("A group with this name already exists");
+      } else if (error.message.includes("maximum")) {
+        toast.error("You've reached the maximum of 50 groups");
+      } else {
+        toast.error("Failed to create group. Please try again.");
+      }
+    },
+  });
+
+  const updateMutation = trpc.groups.update.useMutation({
+    onSuccess: () => {
+      toast.success("Group updated successfully");
+      trpcUtils.groups.list.invalidate();
+      trpcUtils.groups.get.invalidate();
+      onOpenChange(false);
+    },
+    onError: (error) => {
+      if (error.message.includes("already exists") || error.data?.code === "CONFLICT") {
+        setNameError("A group with this name already exists");
+      } else {
+        toast.error("Failed to update group. Please try again.");
+      }
+    },
+  });
+
+  const isPending = createMutation.isPending || updateMutation.isPending;
+
+  function validate(): boolean {
+    let valid = true;
+    setNameError("");
+    setDescError("");
+
+    if (!name.trim()) {
+      setNameError("Group name is required");
+      valid = false;
+    } else if (name.length > 128) {
+      setNameError("Group name must be 128 characters or less");
+      valid = false;
+    }
+
+    if (description.length > 512) {
+      setDescError("Description must be 512 characters or less");
+      valid = false;
+    }
+
+    return valid;
+  }
+
+  function handleSubmit(e: React.FormEvent) {
+    e.preventDefault();
+    if (!validate()) return;
+
+    const payload = {
+      name: name.trim(),
+      description: description.trim() || undefined,
+      visibility,
+      joinPolicy: visibility === "public" ? joinPolicy : "invite_only",
+    };
+
+    if (isEditMode && groupToEdit) {
+      updateMutation.mutate({ id: groupToEdit.id, ...payload });
+    } else {
+      createMutation.mutate(payload);
+    }
+  }
+
+  return (
+    <Dialog open={open} onOpenChange={onOpenChange}>
+      <DialogContent className="sm:max-w-[425px]">
+        <DialogHeader>
+          <DialogTitle>
+            {isEditMode ? "Edit Group" : "Create New Group"}
+          </DialogTitle>
+          <DialogDescription>
+            {isEditMode
+              ? "Update your group settings."
+              : "Create a group to collaborate with others."}
+          </DialogDescription>
+        </DialogHeader>
+        <form onSubmit={handleSubmit} className="space-y-4">
+          <div className="space-y-2">
+            <Label htmlFor="group-name">Name *</Label>
+            <Input
+              id="group-name"
+              placeholder="Enter group name"
+              value={name}
+              onChange={(e) => {
+                setName(e.target.value);
+                setNameError("");
+              }}
+              maxLength={128}
+              aria-invalid={!!nameError}
+              aria-describedby={nameError ? "name-error" : undefined}
+            />
+            {nameError && (
+              <p id="name-error" className="text-sm text-destructive">
+                {nameError}
+              </p>
+            )}
+          </div>
+
+          <div className="space-y-2">
+            <Label htmlFor="group-desc">Description</Label>
+            <Textarea
+              id="group-desc"
+              placeholder="What is this group about?"
+              value={description}
+              onChange={(e) => {
+                setDescription(e.target.value);
+                setDescError("");
+              }}
+              maxLength={512}
+              rows={3}
+              aria-invalid={!!descError}
+              aria-describedby={descError ? "desc-error" : undefined}
+            />
+            {descError && (
+              <p id="desc-error" className="text-sm text-destructive">
+                {descError}
+              </p>
+            )}
+            <p className="text-xs text-muted-foreground">
+              {description.length}/512
+            </p>
+          </div>
+
+          <div className="space-y-2">
+            <Label>Visibility</Label>
+            <Select
+              value={visibility}
+              onValueChange={(v) =>
+                setVisibility(v as "private" | "public")
+              }
+            >
+              <SelectTrigger>
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="private">Private</SelectItem>
+                <SelectItem value="public">Public</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          {visibility === "public" && (
+            <div className="space-y-2">
+              <Label>Join Policy</Label>
+              <Select
+                value={joinPolicy}
+                onValueChange={(v) =>
+                  setJoinPolicy(
+                    v as "invite_only" | "request_to_join" | "open",
+                  )
+                }
+              >
+                <SelectTrigger>
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="invite_only">Invite Only</SelectItem>
+                  <SelectItem value="request_to_join">
+                    Request to Join
+                  </SelectItem>
+                  <SelectItem value="open">Open</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+          )}
+
+          <DialogFooter>
+            <Button
+              type="button"
+              variant="outline"
+              onClick={() => onOpenChange(false)}
+              disabled={isPending}
+            >
+              Cancel
+            </Button>
+            <Button type="submit" disabled={isPending}>
+              {isPending && (
+                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+              )}
+              {isEditMode ? "Save Changes" : "Create Group"}
+            </Button>
+          </DialogFooter>
+        </form>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/groups/GroupDetailPanel.test.ts b/apps/web/client/src/components/groups/GroupDetailPanel.test.ts
new file mode 100644
index 0000000..389ec95
--- /dev/null
+++ b/apps/web/client/src/components/groups/GroupDetailPanel.test.ts
@@ -0,0 +1,19 @@
+import { describe, it } from "vitest";
+
+// Section 07: GroupDetailPanel component tests
+// Component tests require jsdom environment which is not configured.
+// These stubs document expected behavior; full integration tests in section-11.
+
+describe("GroupDetailPanel", () => {
+  it.todo("renders group name, icon, member count");
+  it.todo("shows 'Edit' button only for owner/admin");
+  it.todo("shows 'Delete Group' button only for owner");
+  it.todo("shows 'Leave Group' button only for members (not owner)");
+  it.todo("shows pending join requests section only for admins");
+  it.todo("renders member list with roles");
+  it.todo("calls removeMember mutation on remove action");
+  it.todo("calls leave mutation on 'Leave Group' button click");
+  it.todo("calls delete mutation on 'Delete Group' button click");
+  it.todo("calls approveMember mutation on approve action");
+  it.todo("calls rejectMember mutation on reject action");
+});
diff --git a/apps/web/client/src/components/groups/GroupDetailPanel.tsx b/apps/web/client/src/components/groups/GroupDetailPanel.tsx
new file mode 100644
index 0000000..b0277ea
--- /dev/null
+++ b/apps/web/client/src/components/groups/GroupDetailPanel.tsx
@@ -0,0 +1,471 @@
+import { useState } from "react";
+import { useParams, useLocation } from "wouter";
+import {
+  ArrowLeft,
+  Edit,
+  Globe,
+  Loader2,
+  Lock,
+  LogOut,
+  ShieldCheck,
+  Trash2,
+  UserPlus,
+  Users,
+  X,
+} from "lucide-react";
+import { toast } from "sonner";
+
+import {
+  AlertDialog,
+  AlertDialogAction,
+  AlertDialogCancel,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from "@/components/ui/alert-dialog";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Skeleton } from "@/components/ui/skeleton";
+import { useAuth } from "@/contexts/AuthContext";
+import { trpc } from "@/lib/trpc";
+import { AddMemberDialog } from "./AddMemberDialog";
+import { CreateGroupDialog } from "./CreateGroupDialog";
+
+export default function GroupDetailPanel() {
+  const params = useParams<{ groupId: string }>();
+  const groupId = Number(params.groupId);
+  const [, setLocation] = useLocation();
+  const { user } = useAuth();
+  const trpcUtils = trpc.useUtils();
+
+  const [isEditOpen, setIsEditOpen] = useState(false);
+  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
+  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
+  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
+
+  const { data: group, isLoading: groupLoading } = trpc.groups.get.useQuery(
+    { id: groupId },
+    { enabled: !isNaN(groupId) && groupId > 0 },
+  );
+
+  const { data: members, isLoading: membersLoading } =
+    trpc.groups.listMembers.useQuery(
+      { groupId },
+      { enabled: !isNaN(groupId) && groupId > 0 },
+    );
+
+  const deleteMutation = trpc.groups.delete.useMutation({
+    onSuccess: () => {
+      toast.success("Group deleted");
+      trpcUtils.groups.list.invalidate();
+      setLocation("/groups");
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  const leaveMutation = trpc.groups.leave.useMutation({
+    onSuccess: () => {
+      toast.success("You left the group");
+      trpcUtils.groups.list.invalidate();
+      setLocation("/groups");
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  const removeMemberMutation = trpc.groups.removeMember.useMutation({
+    onSuccess: () => {
+      toast.success("Member removed");
+      trpcUtils.groups.listMembers.invalidate({ groupId });
+      trpcUtils.groups.get.invalidate({ id: groupId });
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  const approveMutation = trpc.groups.approveMember.useMutation({
+    onSuccess: () => {
+      toast.success("Member approved");
+      trpcUtils.groups.listMembers.invalidate({ groupId });
+      trpcUtils.groups.get.invalidate({ id: groupId });
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  const rejectMutation = trpc.groups.rejectMember.useMutation({
+    onSuccess: () => {
+      toast.success("Request rejected");
+      trpcUtils.groups.listMembers.invalidate({ groupId });
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  if (groupLoading || membersLoading) {
+    return (
+      <div className="container mx-auto max-w-3xl px-4 py-8">
+        <Skeleton className="mb-4 h-8 w-48" />
+        <Skeleton className="mb-2 h-4 w-64" />
+        <Skeleton className="mb-8 h-4 w-96" />
+        <Skeleton className="h-48 w-full" />
+      </div>
+    );
+  }
+
+  if (!group) {
+    return (
+      <div className="container mx-auto max-w-3xl px-4 py-8">
+        <p className="text-muted-foreground">Group not found.</p>
+        <Button variant="link" onClick={() => setLocation("/groups")}>
+          Back to Groups
+        </Button>
+      </div>
+    );
+  }
+
+  const currentUserId = Number(user?.id);
+  const isOwner = group.ownerId === currentUserId;
+  const isAdmin = group.role === "admin";
+  const canManage = isOwner || isAdmin;
+
+  const activeMembers = members?.filter((m) => m.status === "active") ?? [];
+  const pendingMembers = members?.filter((m) => m.status === "pending") ?? [];
+
+  const settings = group.settings as {
+    visibility: string;
+    joinPolicy: string;
+  };
+
+  return (
+    <div className="container mx-auto max-w-3xl px-4 py-8">
+      {/* Header */}
+      <div className="mb-6 flex items-start justify-between">
+        <div>
+          <Button
+            variant="ghost"
+            size="sm"
+            className="mb-2"
+            onClick={() => setLocation("/groups")}
+          >
+            <ArrowLeft className="mr-1 h-4 w-4" />
+            Back to Groups
+          </Button>
+          <div className="flex items-center gap-3">
+            <Users className="h-8 w-8 text-muted-foreground" />
+            <div>
+              <h1 className="text-2xl font-bold">{group.name}</h1>
+              <div className="flex items-center gap-2 text-sm text-muted-foreground">
+                <span>{group.memberCount} members</span>
+                <span>·</span>
+                {settings.visibility === "public" ? (
+                  <span className="flex items-center gap-1">
+                    <Globe className="h-3 w-3" /> Public
+                  </span>
+                ) : (
+                  <span className="flex items-center gap-1">
+                    <Lock className="h-3 w-3" /> Private
+                  </span>
+                )}
+                {settings.visibility === "public" && (
+                  <>
+                    <span>·</span>
+                    <JoinPolicyBadge policy={settings.joinPolicy} />
+                  </>
+                )}
+              </div>
+            </div>
+          </div>
+          {group.description && (
+            <p className="mt-3 text-sm text-muted-foreground">
+              {group.description}
+            </p>
+          )}
+        </div>
+
+        <div className="flex gap-2">
+          {canManage && (
+            <Button
+              variant="outline"
+              size="sm"
+              onClick={() => setIsEditOpen(true)}
+            >
+              <Edit className="mr-1 h-4 w-4" />
+              Edit
+            </Button>
+          )}
+          {!isOwner && (
+            <Button
+              variant="outline"
+              size="sm"
+              onClick={() => setIsLeaveConfirmOpen(true)}
+            >
+              <LogOut className="mr-1 h-4 w-4" />
+              Leave
+            </Button>
+          )}
+          {isOwner && (
+            <Button
+              variant="destructive"
+              size="sm"
+              onClick={() => setIsDeleteConfirmOpen(true)}
+            >
+              <Trash2 className="mr-1 h-4 w-4" />
+              Delete
+            </Button>
+          )}
+        </div>
+      </div>
+
+      {/* Pending Requests (admin only) */}
+      {canManage && pendingMembers.length > 0 && (
+        <Card className="mb-6">
+          <CardHeader className="pb-3">
+            <CardTitle className="flex items-center gap-2 text-base">
+              <ShieldCheck className="h-4 w-4" />
+              Pending Requests ({pendingMembers.length})
+            </CardTitle>
+          </CardHeader>
+          <CardContent>
+            <div className="space-y-2">
+              {pendingMembers.map((member) => (
+                <div
+                  key={member.userId}
+                  className="flex items-center justify-between rounded-md border px-3 py-2"
+                >
+                  <div>
+                    <p className="text-sm font-medium">
+                      {member.userName ?? "Unnamed"}
+                    </p>
+                    <p className="text-xs text-muted-foreground">
+                      {member.userEmail}
+                    </p>
+                  </div>
+                  <div className="flex gap-2">
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      onClick={() =>
+                        approveMutation.mutate({
+                          groupId,
+                          userId: member.userId,
+                        })
+                      }
+                      disabled={approveMutation.isPending}
+                    >
+                      Approve
+                    </Button>
+                    <Button
+                      size="sm"
+                      variant="ghost"
+                      onClick={() =>
+                        rejectMutation.mutate({
+                          groupId,
+                          userId: member.userId,
+                        })
+                      }
+                      disabled={rejectMutation.isPending}
+                    >
+                      Reject
+                    </Button>
+                  </div>
+                </div>
+              ))}
+            </div>
+          </CardContent>
+        </Card>
+      )}
+
+      {/* Members List */}
+      <Card>
+        <CardHeader className="pb-3">
+          <div className="flex items-center justify-between">
+            <CardTitle className="text-base">Members</CardTitle>
+            {canManage && (
+              <Button
+                size="sm"
+                variant="outline"
+                onClick={() => setIsAddMemberOpen(true)}
+              >
+                <UserPlus className="mr-1 h-4 w-4" />
+                Add Member
+              </Button>
+            )}
+          </div>
+        </CardHeader>
+        <CardContent>
+          {activeMembers.length === 0 ? (
+            <p className="py-4 text-center text-sm text-muted-foreground">
+              No active members
+            </p>
+          ) : (
+            <div className="space-y-2">
+              {activeMembers.map((member) => (
+                <div
+                  key={member.userId}
+                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
+                >
+                  <div className="flex items-center gap-3">
+                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
+                      {(member.userName ?? "?")[0]?.toUpperCase()}
+                    </div>
+                    <div>
+                      <p className="text-sm font-medium">
+                        {member.userName ?? "Unnamed"}
+                        {member.userId === currentUserId && (
+                          <span className="ml-1 text-xs text-muted-foreground">
+                            (You)
+                          </span>
+                        )}
+                      </p>
+                      <p className="text-xs text-muted-foreground">
+                        {member.userEmail}
+                      </p>
+                    </div>
+                  </div>
+                  <div className="flex items-center gap-2">
+                    <Badge
+                      variant={
+                        member.role === "admin" ? "default" : "secondary"
+                      }
+                    >
+                      {member.role === "admin"
+                        ? member.userId === group.ownerId
+                          ? "Owner"
+                          : "Admin"
+                        : "Member"}
+                    </Badge>
+                    {canManage &&
+                      member.userId !== currentUserId &&
+                      member.userId !== group.ownerId && (
+                        <Button
+                          variant="ghost"
+                          size="sm"
+                          className="h-7 w-7 p-0"
+                          onClick={() =>
+                            removeMemberMutation.mutate({
+                              groupId,
+                              userId: member.userId,
+                            })
+                          }
+                          disabled={removeMemberMutation.isPending}
+                          aria-label={`Remove ${member.userName}`}
+                        >
+                          <X className="h-4 w-4" />
+                        </Button>
+                      )}
+                  </div>
+                </div>
+              ))}
+            </div>
+          )}
+        </CardContent>
+      </Card>
+
+      {/* Edit Dialog */}
+      <CreateGroupDialog
+        open={isEditOpen}
+        onOpenChange={setIsEditOpen}
+        groupToEdit={{
+          id: group.id,
+          name: group.name,
+          description: group.description,
+          visibility: settings.visibility,
+          joinPolicy: settings.joinPolicy,
+        }}
+      />
+
+      {/* Add Member Dialog */}
+      <AddMemberDialog
+        open={isAddMemberOpen}
+        onOpenChange={setIsAddMemberOpen}
+        groupId={groupId}
+        groupName={group.name}
+      />
+
+      {/* Delete Confirmation */}
+      <AlertDialog
+        open={isDeleteConfirmOpen}
+        onOpenChange={setIsDeleteConfirmOpen}
+      >
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Delete Group</AlertDialogTitle>
+            <AlertDialogDescription>
+              Are you sure you want to delete &quot;{group.name}&quot;? This
+              action cannot be undone. All members will be removed and shared
+              permissions will be revoked.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Cancel</AlertDialogCancel>
+            <AlertDialogAction
+              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
+              onClick={() => deleteMutation.mutate({ id: groupId })}
+              disabled={deleteMutation.isPending}
+            >
+              {deleteMutation.isPending && (
+                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+              )}
+              Delete Group
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+
+      {/* Leave Confirmation */}
+      <AlertDialog
+        open={isLeaveConfirmOpen}
+        onOpenChange={setIsLeaveConfirmOpen}
+      >
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Leave Group</AlertDialogTitle>
+            <AlertDialogDescription>
+              Are you sure you want to leave &quot;{group.name}&quot;? You will
+              lose access to shared files and permissions.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Cancel</AlertDialogCancel>
+            <AlertDialogAction
+              onClick={() => leaveMutation.mutate({ groupId })}
+              disabled={leaveMutation.isPending}
+            >
+              {leaveMutation.isPending && (
+                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+              )}
+              Leave Group
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+    </div>
+  );
+}
+
+function JoinPolicyBadge({ policy }: { policy: string }) {
+  switch (policy) {
+    case "open":
+      return (
+        <Badge
+          variant="secondary"
+          className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
+        >
+          Open
+        </Badge>
+      );
+    case "request_to_join":
+      return (
+        <Badge
+          variant="secondary"
+          className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
+        >
+          Request to Join
+        </Badge>
+      );
+    default:
+      return (
+        <Badge variant="secondary">Invite Only</Badge>
+      );
+  }
+}
diff --git a/apps/web/client/src/pages/GroupDiscovery.test.ts b/apps/web/client/src/pages/GroupDiscovery.test.ts
new file mode 100644
index 0000000..f04d539
--- /dev/null
+++ b/apps/web/client/src/pages/GroupDiscovery.test.ts
@@ -0,0 +1,15 @@
+import { describe, it } from "vitest";
+
+// Section 07: GroupDiscovery page tests
+// Component tests require jsdom environment which is not configured.
+// These stubs document expected behavior; full integration tests in section-11.
+
+describe("GroupDiscovery", () => {
+  it.todo("searches public groups with query input");
+  it.todo("filters groups by sort option (member count, created date)");
+  it.todo("shows 'Join' button for open groups");
+  it.todo("shows 'Request Join' button for request-to-join groups");
+  it.todo("shows 'Invite Only' badge for invite-only groups (no button)");
+  it.todo("calls join mutation on 'Join' button click");
+  it.todo("calls requestJoin mutation on 'Request Join' button click");
+});
diff --git a/apps/web/client/src/pages/GroupDiscovery.tsx b/apps/web/client/src/pages/GroupDiscovery.tsx
new file mode 100644
index 0000000..4fd3025
--- /dev/null
+++ b/apps/web/client/src/pages/GroupDiscovery.tsx
@@ -0,0 +1,286 @@
+import { useState, useEffect } from "react";
+import { useLocation } from "wouter";
+import {
+  ArrowLeft,
+  Globe,
+  Loader2,
+  Lock,
+  Search,
+  Users,
+} from "lucide-react";
+import { toast } from "sonner";
+
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Input } from "@/components/ui/input";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Skeleton } from "@/components/ui/skeleton";
+import { useAuth } from "@/contexts/AuthContext";
+import { trpc } from "@/lib/trpc";
+
+type SortOption = "members" | "recent";
+
+export default function GroupDiscovery() {
+  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
+  const [, setLocation] = useLocation();
+  const [searchQuery, setSearchQuery] = useState("");
+  const [sortBy, setSortBy] = useState<SortOption>("members");
+  const [page, setPage] = useState(0);
+
+  useEffect(() => {
+    if (!authLoading && !isAuthenticated) {
+      setLocation("/login");
+    }
+  }, [authLoading, isAuthenticated, setLocation]);
+
+  const { data: groups, isLoading } = trpc.groups.searchPublic.useQuery(
+    {
+      query: searchQuery || undefined,
+      limit: 20,
+      offset: page * 20,
+    },
+    { enabled: isAuthenticated },
+  );
+
+  const joinMutation = trpc.groups.join.useMutation({
+    onSuccess: () => {
+      toast.success("Joined group successfully!");
+      trpcUtils.groups.searchPublic.invalidate();
+      trpcUtils.groups.list.invalidate();
+    },
+    onError: (error) => {
+      if (error.data?.code === "CONFLICT") {
+        toast.error("You are already a member of this group");
+      } else {
+        toast.error(error.message);
+      }
+    },
+  });
+
+  const requestJoinMutation = trpc.groups.requestJoin.useMutation({
+    onSuccess: () => {
+      toast.success("Join request sent! Waiting for admin approval.");
+      trpcUtils.groups.searchPublic.invalidate();
+    },
+    onError: (error) => {
+      if (error.data?.code === "CONFLICT") {
+        toast.error("You already have a pending request for this group");
+      } else {
+        toast.error(error.message);
+      }
+    },
+  });
+
+  const trpcUtils = trpc.useUtils();
+
+  if (authLoading || !isAuthenticated || !user) {
+    return (
+      <div className="flex items-center justify-center py-20">
+        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  // Client-side sort (API sorts by memberCount desc by default)
+  const sortedGroups = groups
+    ? [...groups].sort((a, b) => {
+        if (sortBy === "recent") {
+          return (
+            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
+          );
+        }
+        return (b.memberCount ?? 0) - (a.memberCount ?? 0);
+      })
+    : [];
+
+  return (
+    <div className="container mx-auto max-w-5xl px-4 py-8">
+      {/* Header */}
+      <div className="mb-6">
+        <Button
+          variant="ghost"
+          size="sm"
+          className="mb-2"
+          onClick={() => setLocation("/groups")}
+        >
+          <ArrowLeft className="mr-1 h-4 w-4" />
+          Back to Groups
+        </Button>
+        <div className="flex items-center gap-3">
+          <Globe className="h-7 w-7 text-muted-foreground" />
+          <h1 className="text-2xl font-bold">Discover Public Groups</h1>
+        </div>
+      </div>
+
+      {/* Search & Sort */}
+      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
+        <div className="relative flex-1 max-w-md">
+          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+          <Input
+            placeholder="Search groups..."
+            value={searchQuery}
+            onChange={(e) => {
+              setSearchQuery(e.target.value);
+              setPage(0);
+            }}
+            className="pl-9"
+          />
+        </div>
+        <Select
+          value={sortBy}
+          onValueChange={(v) => setSortBy(v as SortOption)}
+        >
+          <SelectTrigger className="w-[180px]">
+            <SelectValue placeholder="Sort by" />
+          </SelectTrigger>
+          <SelectContent>
+            <SelectItem value="members">Most Members</SelectItem>
+            <SelectItem value="recent">Recently Created</SelectItem>
+          </SelectContent>
+        </Select>
+      </div>
+
+      {/* Groups Grid */}
+      {isLoading ? (
+        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
+          {Array.from({ length: 6 }).map((_, i) => (
+            <Card key={i}>
+              <CardHeader className="pb-2">
+                <Skeleton className="h-5 w-32" />
+              </CardHeader>
+              <CardContent>
+                <Skeleton className="mb-3 h-4 w-full" />
+                <Skeleton className="h-8 w-20" />
+              </CardContent>
+            </Card>
+          ))}
+        </div>
+      ) : sortedGroups.length === 0 ? (
+        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
+          <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
+          <p className="text-sm text-muted-foreground">
+            No public groups found.{" "}
+            {searchQuery && "Try a different search term."}
+          </p>
+        </div>
+      ) : (
+        <>
+          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
+            {sortedGroups.map((group) => {
+              const settings = (group.settings ?? {}) as {
+                joinPolicy?: string;
+              };
+              const policy = settings.joinPolicy ?? "invite_only";
+
+              return (
+                <Card key={group.id}>
+                  <CardHeader className="pb-2">
+                    <CardTitle className="flex items-center gap-2 text-base">
+                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
+                      <span className="truncate">{group.name}</span>
+                    </CardTitle>
+                  </CardHeader>
+                  <CardContent>
+                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
+                      {group.description || "No description"}
+                    </p>
+                    <div className="flex items-center justify-between">
+                      <span className="text-xs text-muted-foreground">
+                        {group.memberCount} members
+                      </span>
+                      <JoinAction
+                        policy={policy}
+                        groupId={group.id}
+                        onJoin={() =>
+                          joinMutation.mutate({ groupId: group.id })
+                        }
+                        onRequestJoin={() =>
+                          requestJoinMutation.mutate({ groupId: group.id })
+                        }
+                        isPending={
+                          joinMutation.isPending ||
+                          requestJoinMutation.isPending
+                        }
+                      />
+                    </div>
+                  </CardContent>
+                </Card>
+              );
+            })}
+          </div>
+
+          {/* Pagination */}
+          {groups && groups.length === 20 && (
+            <div className="mt-6 flex justify-center gap-2">
+              <Button
+                variant="outline"
+                size="sm"
+                disabled={page === 0}
+                onClick={() => setPage((p) => Math.max(0, p - 1))}
+              >
+                Previous
+              </Button>
+              <Button
+                variant="outline"
+                size="sm"
+                onClick={() => setPage((p) => p + 1)}
+              >
+                Next
+              </Button>
+            </div>
+          )}
+        </>
+      )}
+    </div>
+  );
+}
+
+function JoinAction({
+  policy,
+  groupId,
+  onJoin,
+  onRequestJoin,
+  isPending,
+}: {
+  policy: string;
+  groupId: number;
+  onJoin: () => void;
+  onRequestJoin: () => void;
+  isPending: boolean;
+}) {
+  switch (policy) {
+    case "open":
+      return (
+        <Button size="sm" onClick={onJoin} disabled={isPending}>
+          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
+          Join
+        </Button>
+      );
+    case "request_to_join":
+      return (
+        <Button
+          size="sm"
+          variant="outline"
+          onClick={onRequestJoin}
+          disabled={isPending}
+        >
+          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
+          Request Join
+        </Button>
+      );
+    default:
+      return (
+        <Badge variant="secondary">
+          <Lock className="mr-1 h-3 w-3" />
+          Invite Only
+        </Badge>
+      );
+  }
+}
diff --git a/apps/web/client/src/pages/GroupManagement.test.ts b/apps/web/client/src/pages/GroupManagement.test.ts
new file mode 100644
index 0000000..e87ed40
--- /dev/null
+++ b/apps/web/client/src/pages/GroupManagement.test.ts
@@ -0,0 +1,26 @@
+import { describe, it } from "vitest";
+
+// Section 07: GroupManagement page tests
+// Component tests require jsdom environment which is not configured.
+// These stubs document expected behavior; full integration tests in section-11.
+
+describe("GroupManagement", () => {
+  it.todo("renders 'My Groups' tab with user's owned groups");
+  it.todo("renders 'Member Of' tab with user's memberships");
+  it.todo("renders 'Public Groups' tab with searchable public groups");
+  it.todo("opens CreateGroupDialog on 'Create Group' button click");
+  it.todo("navigates to GroupDetailPanel on group card click");
+  it.todo("shows empty state when no groups exist");
+});
+
+describe("GroupManagement routing", () => {
+  it.todo("/groups route renders GroupManagement component");
+  it.todo("/groups/discover route renders GroupDiscovery component");
+  it.todo("/groups/:groupId route renders GroupDetailPanel component");
+  it.todo("routes require authentication (redirects to login if not authenticated)");
+});
+
+describe("GroupManagement navigation", () => {
+  it.todo("Groups link appears in sidebar navigation");
+  it.todo("Groups link routes to /groups correctly");
+});
diff --git a/apps/web/client/src/pages/GroupManagement.tsx b/apps/web/client/src/pages/GroupManagement.tsx
new file mode 100644
index 0000000..ebdf73c
--- /dev/null
+++ b/apps/web/client/src/pages/GroupManagement.tsx
@@ -0,0 +1,228 @@
+import { useState, useEffect } from "react";
+import { useLocation } from "wouter";
+import { Globe, Loader2, Plus, Search, Users } from "lucide-react";
+
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Input } from "@/components/ui/input";
+import { Skeleton } from "@/components/ui/skeleton";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
+import { useAuth } from "@/contexts/AuthContext";
+import { trpc } from "@/lib/trpc";
+
+type TabScope = "my_groups" | "member_of" | "public";
+
+export default function GroupManagement() {
+  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
+  const [, setLocation] = useLocation();
+  const [selectedTab, setSelectedTab] = useState<TabScope>("my_groups");
+  const [searchQuery, setSearchQuery] = useState("");
+  const [isCreateOpen, setIsCreateOpen] = useState(false);
+
+  useEffect(() => {
+    if (!authLoading && !isAuthenticated) {
+      setLocation("/login");
+    }
+  }, [authLoading, isAuthenticated, setLocation]);
+
+  const { data: myGroups, isLoading: myLoading } = trpc.groups.list.useQuery(
+    { scope: "my_groups" },
+    { enabled: isAuthenticated && selectedTab === "my_groups" },
+  );
+
+  const { data: memberOfGroups, isLoading: memberLoading } =
+    trpc.groups.list.useQuery(
+      { scope: "member_of" },
+      { enabled: isAuthenticated && selectedTab === "member_of" },
+    );
+
+  const { data: publicGroups, isLoading: publicLoading } =
+    trpc.groups.searchPublic.useQuery(
+      { query: searchQuery || undefined, limit: 20 },
+      { enabled: isAuthenticated && selectedTab === "public" },
+    );
+
+  if (authLoading || !isAuthenticated || !user) {
+    return (
+      <div className="flex items-center justify-center py-20">
+        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  function getActiveData() {
+    switch (selectedTab) {
+      case "my_groups":
+        return { groups: myGroups, loading: myLoading };
+      case "member_of":
+        return { groups: memberOfGroups, loading: memberLoading };
+      case "public":
+        return { groups: publicGroups, loading: publicLoading };
+    }
+  }
+
+  const { groups: currentGroups, loading: currentLoading } = getActiveData();
+
+  function getEmptyMessage() {
+    switch (selectedTab) {
+      case "my_groups":
+        return "You haven't created any groups yet. Create your first group to get started.";
+      case "member_of":
+        return "You're not a member of any groups yet. Join public groups or wait for an invitation.";
+      case "public":
+        return "No public groups found. Try a different search term.";
+    }
+  }
+
+  return (
+    <div className="container mx-auto max-w-5xl px-4 py-8">
+      {/* Header */}
+      <div className="mb-6 flex items-center justify-between">
+        <div className="flex items-center gap-3">
+          <Users className="h-7 w-7 text-muted-foreground" />
+          <h1 className="text-2xl font-bold">Groups</h1>
+        </div>
+        <div className="flex items-center gap-2">
+          <Button
+            variant="outline"
+            size="sm"
+            onClick={() => setLocation("/groups/discover")}
+          >
+            <Globe className="mr-1 h-4 w-4" />
+            Discover
+          </Button>
+          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
+            <Plus className="mr-1 h-4 w-4" />
+            Create Group
+          </Button>
+        </div>
+      </div>
+
+      <Tabs
+        value={selectedTab}
+        onValueChange={(v) => setSelectedTab(v as TabScope)}
+      >
+        <TabsList>
+          <TabsTrigger value="my_groups">My Groups</TabsTrigger>
+          <TabsTrigger value="member_of">Member Of</TabsTrigger>
+          <TabsTrigger value="public">Public Groups</TabsTrigger>
+        </TabsList>
+
+        {selectedTab === "public" && (
+          <div className="mt-4 max-w-sm">
+            <div className="relative">
+              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+              <Input
+                placeholder="Search public groups..."
+                value={searchQuery}
+                onChange={(e) => setSearchQuery(e.target.value)}
+                className="pl-9"
+              />
+            </div>
+          </div>
+        )}
+
+        <TabsContent value={selectedTab} className="mt-4">
+          {currentLoading ? (
+            <GroupGridSkeleton />
+          ) : !currentGroups || currentGroups.length === 0 ? (
+            <EmptyState message={getEmptyMessage()} />
+          ) : (
+            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
+              {currentGroups.map((group) => (
+                <GroupCard
+                  key={group.id}
+                  group={group}
+                  onClick={() => setLocation(`/groups/${group.id}`)}
+                />
+              ))}
+            </div>
+          )}
+        </TabsContent>
+      </Tabs>
+
+      <CreateGroupDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
+    </div>
+  );
+}
+
+interface GroupCardGroup {
+  id: number;
+  name: string;
+  description: string | null;
+  memberCount: number;
+  settings?: unknown;
+}
+
+function GroupCard({
+  group,
+  onClick,
+}: {
+  group: GroupCardGroup;
+  onClick: () => void;
+}) {
+  const settings = (group.settings ?? {}) as {
+    visibility?: string;
+    joinPolicy?: string;
+  };
+
+  return (
+    <Card
+      className="cursor-pointer transition-shadow hover:shadow-md"
+      onClick={onClick}
+    >
+      <CardHeader className="pb-2">
+        <CardTitle className="flex items-center gap-2 text-base">
+          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
+          <span className="truncate">{group.name}</span>
+        </CardTitle>
+      </CardHeader>
+      <CardContent>
+        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
+          {group.description || "No description"}
+        </p>
+        <div className="flex items-center gap-2">
+          <span className="text-xs text-muted-foreground">
+            {group.memberCount} members
+          </span>
+          {settings.visibility === "public" && (
+            <Badge variant="secondary" className="text-xs">
+              Public
+            </Badge>
+          )}
+        </div>
+      </CardContent>
+    </Card>
+  );
+}
+
+function EmptyState({ message }: { message: string }) {
+  return (
+    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
+      <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
+      <p className="max-w-sm text-center text-sm text-muted-foreground">
+        {message}
+      </p>
+    </div>
+  );
+}
+
+function GroupGridSkeleton() {
+  return (
+    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
+      {Array.from({ length: 6 }).map((_, i) => (
+        <Card key={i}>
+          <CardHeader className="pb-2">
+            <Skeleton className="h-5 w-32" />
+          </CardHeader>
+          <CardContent>
+            <Skeleton className="mb-3 h-4 w-full" />
+            <Skeleton className="h-3 w-20" />
+          </CardContent>
+        </Card>
+      ))}
+    </div>
+  );
+}
diff --git a/apps/web/server/routers/groups.ts b/apps/web/server/routers/groups.ts
index a1c1324..83bc70b 100644
--- a/apps/web/server/routers/groups.ts
+++ b/apps/web/server/routers/groups.ts
@@ -6,6 +6,7 @@ import { resolveTenantIdVarchar } from "../services/tenantContext";
 import {
   createUserGroup,
   getUserGroups,
+  getGroupMembers,
   addGroupMember,
   removeGroupMember,
   deleteUserGroup,
@@ -16,6 +17,7 @@ import {
   approveJoinRequest,
   rejectJoinRequest,
   searchPublicGroups,
+  searchTenantUsers,
   type GroupsActor,
 } from "../services/groupsService";
 
@@ -135,6 +137,32 @@ export const groupsRouter = router({
       );
     }),
 
+  listMembers: protectedProcedure
+    .input(z.object({ groupId: z.number().positive() }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+      return getGroupMembers(input.groupId, actor);
+    }),
+
+  searchTenantUsers: protectedProcedure
+    .input(
+      z.object({
+        query: z.string().min(1).max(100),
+        excludeGroupId: z.number().positive().optional(),
+        limit: z.number().min(1).max(20).default(10),
+      })
+    )
+    .query(async ({ ctx, input }) => {
+      const tenantId = resolveGroupsTenantId(ctx);
+      return searchTenantUsers(
+        input.query,
+        tenantId,
+        input.excludeGroupId,
+        input.limit,
+      );
+    }),
+
   // ── Mutations ──
 
   create: protectedProcedure
diff --git a/apps/web/server/services/groupsService.ts b/apps/web/server/services/groupsService.ts
index 4f90afa..9258f55 100644
--- a/apps/web/server/services/groupsService.ts
+++ b/apps/web/server/services/groupsService.ts
@@ -906,6 +906,102 @@ export async function requestJoinGroup(
   return { success: true };
 }
 
+export interface GroupMemberDetail {
+  userId: number;
+  userName: string | null;
+  userEmail: string | null;
+  role: GroupMemberRole;
+  status: string;
+  joinedAt: Date;
+}
+
+export async function getGroupMembers(
+  groupId: number,
+  actor: GroupsActor,
+  dbClient?: DbClient,
+): Promise<GroupMemberDetail[]> {
+  const db = await resolveDb(dbClient);
+  const tenantId = normalizeTenantId(actor.tenantId);
+  const group = await getGroupForTenant(db, groupId, tenantId);
+  if (!group) {
+    throw new TRPCError({
+      code: "NOT_FOUND",
+      message: "Group not found",
+    });
+  }
+
+  const rows = await db
+    .select({
+      userId: groupMembers.userId,
+      userName: users.name,
+      userEmail: users.email,
+      role: groupMembers.role,
+      status: groupMembers.status,
+      joinedAt: groupMembers.joinedAt,
+    })
+    .from(groupMembers)
+    .innerJoin(users, eq(users.id, groupMembers.userId))
+    .where(and(
+      eq(groupMembers.groupId, groupId),
+      or(
+        eq(groupMembers.status, "active"),
+        eq(groupMembers.status, "pending"),
+      ),
+    ))
+    .orderBy(asc(groupMembers.role), asc(users.name));
+
+  return rows.map((r) => ({
+    ...r,
+    role: mapRole(r.role),
+  }));
+}
+
+export async function searchTenantUsers(
+  query: string,
+  tenantId: GroupsTenantId,
+  excludeGroupId: number | undefined,
+  limit: number,
+  dbClient?: DbClient,
+) {
+  const db = await resolveDb(dbClient);
+  const normalizedTenantId = normalizeTenantId(tenantId);
+  const searchPattern = `%${query.trim()}%`;
+
+  const conditions: SQL[] = [
+    or(
+      ilike(users.name, searchPattern),
+      ilike(users.email, searchPattern),
+    )!,
+  ];
+
+  // Filter to users in the same tenant (by registeredDomain or currentTenantId)
+  // Using currentTenantId for tenant scoping
+  conditions.push(sql`${users.currentTenantId}::text = ${normalizedTenantId}`);
+
+  if (excludeGroupId) {
+    // Exclude users already in the group
+    conditions.push(
+      sql`${users.id} NOT IN (
+        SELECT ${groupMembers.userId} FROM ${groupMembers}
+        WHERE ${groupMembers.groupId} = ${excludeGroupId}
+          AND ${groupMembers.status} IN ('active', 'pending')
+      )`,
+    );
+  }
+
+  const rows = await db
+    .select({
+      id: users.id,
+      name: users.name,
+      email: users.email,
+    })
+    .from(users)
+    .where(and(...conditions))
+    .limit(Math.min(limit, 20));
+
+  return rows;
+}
+
 export async function searchPublicGroups(
   input: SearchPublicGroupsInput,
   actor: GroupsActor,
diff --git a/packages/shared/src/constants/menu.ts b/packages/shared/src/constants/menu.ts
index 69c99af..609e572 100644
--- a/packages/shared/src/constants/menu.ts
+++ b/packages/shared/src/constants/menu.ts
@@ -28,6 +28,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'workflows',     label: 'Workflows',      labelTh: 'เวิร์กโฟลว์',    icon: 'GitBranch',       path: '/workflows',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.5 },
   { id: 'media-history', label: 'Media History',  labelTh: 'ประวัติมีเดีย',  icon: 'Clock',           path: '/media-history',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 4 },
   { id: 'document-management', label: 'Document Management', labelTh: 'จัดการเอกสาร', icon: 'FileText', path: '/document-management', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.2 },
+  { id: 'groups',              label: 'Groups',              labelTh: 'กลุ่ม',          icon: 'Users',    path: '/groups',              platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.3 },
   { id: 'factory',       label: 'SaaS Factory',   labelTh: 'โรงงาน',        icon: 'Factory',         path: '/factory',        platforms: ['web', 'desktop'], group: 'main', sortOrder: 5 },
   { id: 'terminal',      label: 'Terminal',        labelTh: 'เทอร์มินัล',    icon: 'Terminal',        path: '/terminal',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 6 },
   { id: 'kilo',          label: 'CLI',             labelTh: 'CLI',           icon: 'Terminal',        path: '/kilo',           platforms: ['web', 'desktop'], group: 'main', sortOrder: 7 },
