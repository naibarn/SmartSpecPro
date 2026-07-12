/**
 * "New blank project" (Motion Studio) create dialog (Feature 133,
 * section-08 §10.2). Just a name + creates the project via
 * `videoProjects.create` (studioType: "motion") — the neutral document
 * itself is initialized on the workspace page's Brief stage (fresh
 * projects have `document: null` until the first `saveDocument`).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export function MotionCreateDialog({
  lang,
  open,
  onOpenChange,
}: {
  lang: VideoStudioLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");

  const createProject = trpc.videoProjects.create.useMutation({
    onSuccess: (project) => {
      onOpenChange(false);
      navigate(`/video-studio/${project.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="video-studio-motion-create-dialog">
        <DialogHeader>
          <DialogTitle>{pickCopy(lang, videoStudioCopy.newBlankProject)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="video-studio-motion-name">
            {pickCopy(lang, { th: "ชื่อโปรเจกต์", en: "Project name" })}
          </Label>
          <Input
            id="video-studio-motion-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={pickCopy(lang, { th: "โปรเจกต์ motion ใหม่", en: "New motion project" })}
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="video-studio-motion-create-submit"
            disabled={!name.trim() || createProject.isPending}
            onClick={() =>
              createProject.mutate({
                studioType: "motion",
                name: name.trim().slice(0, 200),
              })
            }
          >
            {createProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {pickCopy(lang, { th: "สร้างโปรเจกต์", en: "Create project" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
