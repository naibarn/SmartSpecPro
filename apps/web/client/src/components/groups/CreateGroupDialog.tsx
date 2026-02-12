import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupToEdit?: {
    id: number;
    name: string;
    description?: string | null;
    visibility: string;
    joinPolicy?: string;
  };
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  groupToEdit,
}: CreateGroupDialogProps) {
  const isEditMode = !!groupToEdit;
  const trpcUtils = trpc.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<
    "invite_only" | "request_to_join" | "open"
  >("invite_only");
  const [nameError, setNameError] = useState("");
  const [descError, setDescError] = useState("");

  useEffect(() => {
    if (open && groupToEdit) {
      setName(groupToEdit.name);
      setDescription(groupToEdit.description ?? "");
      setVisibility(
        groupToEdit.visibility === "public" ? "public" : "private",
      );
      setJoinPolicy(
        (groupToEdit.joinPolicy as typeof joinPolicy) ?? "invite_only",
      );
    } else if (open) {
      setName("");
      setDescription("");
      setVisibility("private");
      setJoinPolicy("invite_only");
    }
    setNameError("");
    setDescError("");
  }, [open, groupToEdit]);

  const createMutation = trpc.groups.create.useMutation({
    onSuccess: () => {
      toast.success("Group created successfully");
      trpcUtils.groups.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.message.includes("already exists") || error.data?.code === "CONFLICT") {
        setNameError("A group with this name already exists");
      } else if (error.message.includes("maximum")) {
        toast.error("You've reached the maximum of 50 groups");
      } else {
        toast.error("Failed to create group. Please try again.");
      }
    },
  });

  const updateMutation = trpc.groups.update.useMutation({
    onSuccess: () => {
      toast.success("Group updated successfully");
      trpcUtils.groups.list.invalidate();
      trpcUtils.groups.get.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.message.includes("already exists") || error.data?.code === "CONFLICT") {
        setNameError("A group with this name already exists");
      } else {
        toast.error("Failed to update group. Please try again.");
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function validate(): boolean {
    let valid = true;
    setNameError("");
    setDescError("");

    if (!name.trim()) {
      setNameError("Group name is required");
      valid = false;
    } else if (name.length > 128) {
      setNameError("Group name must be 128 characters or less");
      valid = false;
    }

    if (description.length > 512) {
      setDescError("Description must be 512 characters or less");
      valid = false;
    }

    return valid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      visibility,
      joinPolicy: visibility === "public" ? joinPolicy : "invite_only",
    };

    if (isEditMode && groupToEdit) {
      updateMutation.mutate({ id: groupToEdit.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Group" : "Create New Group"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update your group settings."
              : "Create a group to collaborate with others."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Name *</Label>
            <Input
              id="group-name"
              placeholder="Enter group name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              maxLength={128}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
            />
            {nameError && (
              <p id="name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-desc">Description</Label>
            <Textarea
              id="group-desc"
              placeholder="What is this group about?"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescError("");
              }}
              maxLength={512}
              rows={3}
              aria-invalid={!!descError}
              aria-describedby={descError ? "desc-error" : undefined}
            />
            {descError && (
              <p id="desc-error" className="text-sm text-destructive">
                {descError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {description.length}/512
            </p>
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) =>
                setVisibility(v as "private" | "public")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visibility === "public" && (
            <div className="space-y-2">
              <Label>Join Policy</Label>
              <Select
                value={joinPolicy}
                onValueChange={(v) =>
                  setJoinPolicy(
                    v as "invite_only" | "request_to_join" | "open",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite_only">Invite Only</SelectItem>
                  <SelectItem value="request_to_join">
                    Request to Join
                  </SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditMode ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
