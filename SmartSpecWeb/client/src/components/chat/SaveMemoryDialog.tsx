import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Loader2,
  User,
  FolderGit2,
  Settings2,
  Code2,
  GitBranch,
  Map,
  Building2,
  Puzzle,
  CheckSquare,
  BookOpen,
} from "lucide-react";

const entityTypeConfig = {
  decision: { icon: GitBranch, label: "Decision" },
  plan: { icon: Map, label: "Plan" },
  architecture: { icon: Building2, label: "Architecture" },
  component: { icon: Puzzle, label: "Component" },
  task: { icon: CheckSquare, label: "Task" },
  code_knowledge: { icon: BookOpen, label: "Code Knowledge" },
  user: { icon: User, label: "User" },
  project: { icon: FolderGit2, label: "Project" },
  preference: { icon: Settings2, label: "Preference" },
  technical: { icon: Code2, label: "Technical" },
};

type EntityType = keyof typeof entityTypeConfig;

export interface SaveMemoryInitialData {
  content: string;
  type?: string;
  name?: string;
  importance?: number;
  source?: "manual" | "suggested";
}

interface SaveMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: SaveMemoryInitialData;
  conversationId?: number;
}

export function SaveMemoryDialog({
  open,
  onOpenChange,
  initialData,
  conversationId,
}: SaveMemoryDialogProps) {
  const [entityType, setEntityType] = useState<EntityType>("code_knowledge");
  const [entityName, setEntityName] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(5);
  const [source, setSource] = useState<"manual" | "suggested">("manual");

  const utils = trpc.useUtils();

  useEffect(() => {
    if (initialData && open) {
      setContent(initialData.content || "");
      setEntityType((initialData.type as EntityType) || "code_knowledge");
      setEntityName(initialData.name || "");
      setImportance(initialData.importance || 5);
      setSource(initialData.source || "manual");
    }
  }, [initialData, open]);

  const saveMutation = trpc.memory.upsertEntityMemory.useMutation({
    onSuccess: () => {
      utils.memory.getEntityMemories.invalidate();
      onOpenChange(false);
      // Reset form
      setEntityType("code_knowledge");
      setEntityName("");
      setContent("");
      setImportance(5);
    },
  });

  const handleSave = () => {
    if (!entityName.trim() || !content.trim()) return;

    saveMutation.mutate({
      entityType,
      entityName: entityName.trim(),
      facts: [content.trim()],
      importance,
      source,
      sourceConversationId: conversationId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {source === "suggested" ? "Save to Memory?" : "Save to Memory"}
          </DialogTitle>
          <DialogDescription>
            {source === "suggested"
              ? "Important content detected. Would you like to save it to memory?"
              : "Save selected content as a memory for future reference."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as EntityType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(entityTypeConfig).map(([type, config]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <config.icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g., 'database choice', 'auth flow'"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Importance: {importance}
            </label>
            <Slider
              value={[importance]}
              onValueChange={([v]) => setImportance(v)}
              min={1}
              max={10}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {source === "suggested" ? "Dismiss" : "Cancel"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saveMutation.isPending ||
              !entityName.trim() ||
              !content.trim()
            }
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Memory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
