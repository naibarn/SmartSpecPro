import { useState } from "react";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId?: number | null;
  onCreated?: (folderId: number) => void;
}

export default function CreateFolderDialog({
  open,
  onOpenChange,
  parentId,
  onCreated,
}: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const trpcUtils = trpc.useUtils();

  const createFolder = trpc.library.createFolder.useMutation({
    onSuccess: async (result) => {
      toast.success(`Folder "${result.item.title}" created.`);
      await trpcUtils.library.listDocuments.invalidate();
      onCreated?.(result.item.id);
      setName("");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create folder");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createFolder.mutate({ name: trimmed, parentId: parentId ?? null });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-amber-500" />
            New Folder
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              placeholder="e.g. Marketing, Q1 Reports…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setName("");
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createFolder.isPending}
            >
              {createFolder.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
