/**
 * ExportAsSkillDialog — Export a sub-graph of agency nodes as a reusable skill definition.
 *
 * Accessible from the AgencyBuilder toolbar when nodes are selected.
 * Generates skill.md, input.schema.json, and registers in skill registry.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package } from "lucide-react";
import type { AgencyNodeData } from "./nodes/types";

interface ExportAsSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNodes: Array<{ id: string; data: AgencyNodeData }>;
  onExport: (config: ExportConfig) => void;
}

interface ExportConfig {
  name: string;
  description: string;
  category: string;
}

const CATEGORIES = [
  { value: "prompt_enhancement", label: "Prompt Enhancement" },
  { value: "image_generation", label: "Image Generation" },
  { value: "video_generation", label: "Video Generation" },
  { value: "audio_generation", label: "Audio Generation" },
  { value: "chat_assistant", label: "Chat Assistant" },
];

export function ExportAsSkillDialog({
  open,
  onOpenChange,
  selectedNodes,
  onExport,
}: ExportAsSkillDialogProps) {
  const entryNode = selectedNodes[0];
  const defaultName = entryNode
    ? entryNode.data.name.toLowerCase().replace(/\s+/g, "-")
    : "exported-skill";

  const defaultDescription = selectedNodes
    .map((n) => n.data.instructions || n.data.description || "")
    .filter(Boolean)
    .join("; ")
    .slice(0, 200);

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [category, setCategory] = useState("prompt_enhancement");

  const handleExport = () => {
    onExport({ name, description, category });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-teal-500" />
            Export as Skill
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Skill Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-skill-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-muted/50 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">
              {selectedNodes.length} node{selectedNodes.length > 1 ? "s" : ""} selected:
              {" "}{selectedNodes.map((n) => n.data.name).join(", ")}
            </p>
          </div>

          <div className="bg-slate-50 rounded-md p-2 border">
            <p className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap">
              {`---\nname: ${name}\ncategory: ${category}\ndescription: |\n  ${description.slice(0, 100)}\n---\n\n# ${name}\n\n${description}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={!name.trim()}>
            Export Skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
