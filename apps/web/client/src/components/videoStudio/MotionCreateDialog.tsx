/**
 * "New blank project" (Motion Studio) create dialog (Feature 133,
 * section-08 §10.2). Just a name + creates the project via
 * `videoProjects.create` (studioType: "motion") — the neutral document
 * itself is initialized on the workspace page's Brief stage (fresh
 * projects have `document: null` until the first `saveDocument`).
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
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
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      data-testid="video-studio-motion-create-dialog"
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={pickCopy(lang, videoStudioCopy.newBlankProject)}
            subtitle={pickCopy(lang, {
              th: "เริ่มต้นด้วยเอกสารวิดีโอเปล่า แล้วออกแบบฉากและโมชันได้อย่างอิสระ",
              en: "Start from a blank video document and design scenes and motion freely.",
            })}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <TextInput
              label={pickCopy(lang, { th: "ชื่อโปรเจกต์", en: "Project name" })}
              value={name}
              onChange={(value) => setName(value)}
              placeholder={pickCopy(lang, { th: "โปรเจกต์ motion ใหม่", en: "New motion project" })}
            />
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end">
              <Button
                type="button"
                variant="secondary"
                label={pickCopy(lang, videoStudioCopy.cancel)}
                onClick={() => onOpenChange(false)}
              />
              <Button
                type="button"
                variant="primary"
                data-testid="video-studio-motion-create-submit"
                label={pickCopy(lang, { th: "สร้างโปรเจกต์", en: "Create project" })}
                isDisabled={!name.trim()}
                isLoading={createProject.isPending}
                onClick={() =>
                  createProject.mutate({
                    studioType: "motion",
                    name: name.trim().slice(0, 200),
                  })
                }
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
