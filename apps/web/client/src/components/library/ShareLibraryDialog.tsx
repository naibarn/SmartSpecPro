import { useState } from "react";
import { toast } from "sonner";
import { Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

interface ShareLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PermissionLevel = "read" | "write" | "delete";

export default function ShareLibraryDialog({ open, onOpenChange }: ShareLibraryDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("read");

  const { data: groupsData, isLoading: groupsLoading } = trpc.groups.list.useQuery(
    { scope: "my_groups" } as any,
    { enabled: open },
  );

  const groups: Array<{ id: number; name: string }> = Array.isArray((groupsData as any)?.groups)
    ? (groupsData as any).groups
    : Array.isArray(groupsData)
      ? (groupsData as any)
      : [];

  const shareLibrary = trpc.library.shareLibrary.useMutation({
    onSuccess: (result) => {
      toast.success(`Library shared with group — ${result.shared} item(s) granted access.`);
      setSelectedGroupId("");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to share library");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    shareLibrary.mutate({
      groupId: Number(selectedGroupId),
      permissionLevel,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-sky-500" />
            Share Library with Group
          </DialogTitle>
          <DialogDescription>
            All items you own in this library will be shared with the selected group.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-group">Group</Label>
            {groupsLoading ? (
              <p className="text-sm text-muted-foreground">Loading groups…</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You are not a member of any group yet. Create or join a group first.
              </p>
            ) : (
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger id="share-group">
                  <SelectValue placeholder="Select a group…">
                    {selectedGroupId ? (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {groups.find((g) => String(g.id) === selectedGroupId)?.name}
                      </span>
                    ) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-permission">Permission level</Label>
            <Select
              value={permissionLevel}
              onValueChange={(v) => setPermissionLevel(v as PermissionLevel)}
            >
              <SelectTrigger id="share-permission">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read — view only</SelectItem>
                <SelectItem value="write">Write — view & edit</SelectItem>
                <SelectItem value="delete">Delete — full control</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedGroupId("");
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedGroupId || shareLibrary.isPending || groups.length === 0}
            >
              {shareLibrary.isPending ? "Sharing…" : "Share Library"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
