/**
 * ConvertWithISCDialog
 *
 * Shows the intelligence-skill-creator skill form pre-filled with the current
 * workflow so the user can review/adjust settings before opening in Chat.
 */

import { useLocation } from "wouter";
import { Loader2, Wand2 } from "lucide-react";

import { ChatDynamicSkillForm } from "@/components/chat/skill/ChatDynamicSkillForm";
import { useSkillForm } from "@/components/chat/skill/hooks/useSkillForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SkillInputSchema } from "@/components/media/DynamicSkillForm";
import { trpc } from "@/lib/trpc";

const EMPTY_SCHEMA: SkillInputSchema = {
  title: "",
  sections: [],
  outputMapping: {},
};

interface ConvertWithISCDialogProps {
  open: boolean;
  onClose: () => void;
  /** Saved workflow ID — used to auto-select in the workflow combobox */
  workflowId: number;
  /** Currently selected LLM model ID */
  defaultModel: string;
}

export function ConvertWithISCDialog({
  open,
  onClose,
  workflowId,
  defaultModel,
}: ConvertWithISCDialogProps) {
  const [, setLocation] = useLocation();

  const schemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: "intelligence-skill-creator" },
    { enabled: open, staleTime: 5 * 60 * 1000 },
  );

  const schema =
    (schemaQuery.data?.schema as SkillInputSchema | undefined) ?? EMPTY_SCHEMA;

  // Pass workflowId as a bare numeric string — WorkflowSelectorField detects
  // this format and auto-selects the workflow from the saved-workflows list.
  const { values, setValue } = useSkillForm({
    schema,
    initialValues: {
      mode: "convert_workflow",
      workflow_selector: String(workflowId),
      llm_model_search: defaultModel,
    },
  });

  function handleOpenInChat() {
    sessionStorage.setItem(
      "isc_skill_prefill",
      JSON.stringify({ skillId: "intelligence-skill-creator", values }),
    );
    onClose();
    setLocation("/chat");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] sm:max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            Convert Workflow to Skill
          </DialogTitle>
          <DialogDescription>
            ตั้งค่าการแปลง Workflow เป็น Skill ด้วย Intelligence Skill Creator
            — ปรับแก้ค่าได้ แล้วกด "Open in Chat" เพื่อเริ่มการแปลง
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {schemaQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading skill configuration…
              </span>
            </div>
          ) : schemaQuery.isError ? (
            <p className="py-4 text-center text-sm text-red-500">
              Failed to load skill configuration. Please try again.
            </p>
          ) : (
            <ChatDynamicSkillForm
              schema={schema}
              values={values}
              onChange={(newValues) =>
                Object.entries(newValues).forEach(([k, v]) => setValue(k, v))
              }
              error={null}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleOpenInChat}
            disabled={schemaQuery.isLoading || schemaQuery.isError}
            className="gap-2 bg-purple-600 text-white hover:bg-purple-700"
          >
            <Wand2 className="h-4 w-4" />
            Open in Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
