/**
 * ExportAsSkillDialog — Export a sub-graph of agency nodes as a reusable skill definition.
 *
 * Accessible from the AgencyBuilder toolbar when nodes are selected.
 * Generates skill.md, input.schema.json, and registers in skill registry.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package } from "lucide-react";
import { toast } from "sonner";
import type { AgencyNodeData } from "./nodes/types";

interface ExportAsSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNodes: Array<{ id: string; data: AgencyNodeData }>;
  selectedEdges: Array<{ id: string; source: string; target: string; flowType?: string | null }>;
  onExport: (config: ExportConfig & { edgeIds: string[] }) => void;
  initialName?: string;
  initialDescription?: string;
  initialCategory?: string;
  sourceLink?: string | null;
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
  { value: "audio_prompt_generation", label: "Create Prompt for Audio Generation" },
  { value: "chat_assistant", label: "Chat Assistant" },
];

export function ExportAsSkillDialog({
  open,
  onOpenChange,
  selectedNodes,
  selectedEdges,
  onExport,
  initialName,
  initialDescription,
  initialCategory,
  sourceLink,
}: ExportAsSkillDialogProps) {
  const entryNode = selectedNodes[0];
  const selectedNodesKey = selectedNodes.map((node) => node.id).join(",");
  const selectedEdgesKey = selectedEdges.map((edge) => edge.id).join(",");
  const defaultName = entryNode
    ? entryNode.data.name.toLowerCase().replace(/\s+/g, "-")
    : "exported-skill";
  const resolvedInitialName = initialName?.trim() || defaultName;
  const resolvedInitialDescription = initialDescription?.trim() || selectedNodes
    .map((n) => n.data.instructions || n.data.description || "")
    .filter(Boolean)
    .join("; ")
    .slice(0, 200);
  const resolvedInitialCategory = initialCategory || "prompt_enhancement";

  const [name, setName] = useState(resolvedInitialName);
  const [description, setDescription] = useState(resolvedInitialDescription);
  const [category, setCategory] = useState(resolvedInitialCategory);
  const [includedEdgeIds, setIncludedEdgeIds] = useState<string[]>(selectedEdges.map((edge) => edge.id));
  const handleCopySourceLink = useCallback(async () => {
    if (!sourceLink) return;
    try {
      await navigator.clipboard.writeText(sourceLink);
      toast.success("Source link copied.");
    } catch {
      toast.error("Failed to copy source link");
    }
  }, [sourceLink]);

  useEffect(() => {
    if (!open) return;
    setName(resolvedInitialName);
    setDescription(resolvedInitialDescription);
    setCategory(resolvedInitialCategory);
    setIncludedEdgeIds(selectedEdges.map((edge) => edge.id));
  }, [open, resolvedInitialCategory, resolvedInitialDescription, resolvedInitialName, selectedEdgesKey, selectedNodesKey]);

  const handleExport = () => {
    onExport({ name, description, category, edgeIds: includedEdgeIds });
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

          {sourceLink && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Source link</p>
                <p className="truncate text-[11px] text-slate-600">{sourceLink}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleCopySourceLink}>
                Copy source link
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Included edges</Label>
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {selectedEdges.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No internal edges selected.</p>
              ) : selectedEdges.map((edge) => (
                <label key={edge.id} className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={includedEdgeIds.includes(edge.id)}
                    onCheckedChange={(checked) => {
                      setIncludedEdgeIds((current) =>
                        checked
                          ? current.includes(edge.id) ? current : [...current, edge.id]
                          : current.filter((id) => id !== edge.id),
                      );
                    }}
                  />
                  <span className="leading-5">
                    {edge.source} → {edge.target}
                    {edge.flowType ? <span className="text-muted-foreground"> ({edge.flowType})</span> : null}
                  </span>
                </label>
              ))}
            </div>
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
