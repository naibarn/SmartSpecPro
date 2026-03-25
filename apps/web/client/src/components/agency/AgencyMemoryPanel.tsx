import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Brain,
  Plus,
  Trash2,
  User,
  Settings2,
  Loader2,
  RefreshCw,
  Shield,
  Lightbulb,
  Target,
  Heart,
  BookOpen,
  MessageCircle,
  Briefcase,
  Globe,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Expanded memory types: general-purpose + domain-specific
const memoryTypeConfig = {
  // General Knowledge
  fact: { icon: BookOpen, label: "Fact", color: "bg-green-500", group: "general" },
  preference: { icon: Heart, label: "Preference", color: "bg-purple-500", group: "general" },
  rule: { icon: Shield, label: "Rule", color: "bg-amber-600", group: "general" },
  goal: { icon: Target, label: "Goal", color: "bg-blue-500", group: "general" },
  insight: { icon: Lightbulb, label: "Insight", color: "bg-yellow-500", group: "general" },
  // People & Context
  user_info: { icon: User, label: "User Info", color: "bg-sky-500", group: "context" },
  relationship: { icon: MessageCircle, label: "Relationship", color: "bg-pink-500", group: "context" },
  context: { icon: Globe, label: "Context", color: "bg-indigo-500", group: "context" },
  // Domain / Work
  process: { icon: Briefcase, label: "Process", color: "bg-orange-500", group: "domain" },
  constraint: { icon: Shield, label: "Constraint", color: "bg-red-500", group: "domain" },
  skill: { icon: Sparkles, label: "Skill", color: "bg-teal-500", group: "domain" },
  reference: { icon: FileText, label: "Reference", color: "bg-gray-500", group: "domain" },
};

type MemoryType = keyof typeof memoryTypeConfig;
const ALL_TYPES = Object.keys(memoryTypeConfig) as MemoryType[];

function confidenceBadge(confidence: number) {
  const pct = Math.round(confidence * 100);
  if (pct >= 80) return <Badge variant="default" className="text-[9px] px-1 py-0 bg-green-600">{pct}%</Badge>;
  if (pct >= 50) return <Badge variant="secondary" className="text-[9px] px-1 py-0">{pct}%</Badge>;
  return <Badge variant="outline" className="text-[9px] px-1 py-0">{pct}%</Badge>;
}

interface AgencyMemoryPanelProps {
  agencyId: string;
  agentNodeId: string;
  onClose?: () => void;
}

export function AgencyMemoryPanel({ agencyId, agentNodeId, onClose }: AgencyMemoryPanelProps) {
  const [selectedType, setSelectedType] = useState<MemoryType | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteMemoryId, setDeleteMemoryId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [newMemory, setNewMemory] = useState({
    memoryType: "fact" as MemoryType,
    content: "",
    confidence: 0.8,
  });

  const utils = trpc.useUtils();

  // Queries
  const memoriesQuery = trpc.agency.listAgentMemories.useQuery({
    agencyId,
    agentNodeId,
    memoryType: selectedType === "all" ? undefined : selectedType,
    page: currentPage,
    pageSize: 20,
  });

  // Mutations
  const addMutation = trpc.agency.addAgentMemory.useMutation({
    onSuccess: () => {
      toast.success("Memory saved");
      setAddDialogOpen(false);
      setNewMemory({ memoryType: "fact", content: "", confidence: 0.8 });
      memoriesQuery.refetch();
    },
    onError: (err) => {
      if (err.message.includes("Duplicate")) {
        toast.error("This memory already exists");
      } else if (err.message.includes("Maximum")) {
        toast.error("Maximum memories reached (100)");
      } else {
        toast.error("Failed to save memory");
      }
    },
  });

  const deleteMutation = trpc.agency.deleteAgentMemory.useMutation({
    onSuccess: () => {
      toast.success("Memory deleted");
      setDeleteMemoryId(null);
      memoriesQuery.refetch();
    },
  });

  const resetMutation = trpc.agency.resetAgentMemories.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deletedCount} memories cleared`);
      setResetDialogOpen(false);
      memoriesQuery.refetch();
    },
  });

  const handleOpenAddDialog = useCallback((open: boolean) => {
    if (open) {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        setNewMemory((prev) => ({ ...prev, content: selection }));
      }
    }
    setAddDialogOpen(open);
  }, []);

  const memories = memoriesQuery.data?.items ?? [];
  const total = memoriesQuery.data?.total ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Agent Memory</span>
          <Badge variant="secondary" className="text-[10px]">{total}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => memoriesQuery.refetch()}
            disabled={memoriesQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", memoriesQuery.isFetching && "animate-spin")} />
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={handleOpenAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Save to Memory
                </DialogTitle>
                <DialogDescription>
                  Save knowledge for this agent to remember across conversations.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Type selector */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={newMemory.memoryType}
                    onValueChange={(v) => setNewMemory((p) => ({ ...p, memoryType: v as MemoryType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">General</div>
                      {ALL_TYPES.filter((t) => memoryTypeConfig[t].group === "general").map((t) => {
                        const cfg = memoryTypeConfig[t];
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={t} value={t}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" /> {cfg.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">People & Context</div>
                      {ALL_TYPES.filter((t) => memoryTypeConfig[t].group === "context").map((t) => {
                        const cfg = memoryTypeConfig[t];
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={t} value={t}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" /> {cfg.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Domain / Work</div>
                      {ALL_TYPES.filter((t) => memoryTypeConfig[t].group === "domain").map((t) => {
                        const cfg = memoryTypeConfig[t];
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={t} value={t}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" /> {cfg.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Content */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Content</label>
                  <Textarea
                    value={newMemory.content}
                    onChange={(e) => setNewMemory((p) => ({ ...p, content: e.target.value }))}
                    placeholder="What should the agent remember?"
                    rows={4}
                    maxLength={5000}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{newMemory.content.length}/5000</p>
                </div>

                {/* Confidence slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Confidence</label>
                    <span className="text-sm text-muted-foreground">
                      {newMemory.confidence >= 0.8 ? "High" : newMemory.confidence >= 0.5 ? "Medium" : "Low"}
                    </span>
                  </div>
                  <Slider
                    value={[newMemory.confidence]}
                    onValueChange={([v]) => setNewMemory((p) => ({ ...p, confidence: v }))}
                    min={0.1}
                    max={1.0}
                    step={0.1}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => addMutation.mutate({
                    agencyId,
                    agentNodeId,
                    memoryType: newMemory.memoryType,
                    content: newMemory.content,
                    confidence: newMemory.confidence,
                  })}
                  disabled={!newMemory.content.trim() || addMutation.isPending}
                >
                  {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Memory
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-3 pt-2">
        <button
          onClick={() => setControlsCollapsed(!controlsCollapsed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {controlsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          {controlsCollapsed ? "Show filters" : "Hide filters"}
        </button>

        {!controlsCollapsed && (
          <div className="mt-2 space-y-2">
            {/* Type filter chips */}
            <div className="flex flex-wrap gap-1">
              <Button
                variant={selectedType === "all" ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => { setSelectedType("all"); setCurrentPage(1); }}
              >
                All
              </Button>
              {ALL_TYPES.map((t) => {
                const cfg = memoryTypeConfig[t];
                const Icon = cfg.icon;
                return (
                  <Button
                    key={t}
                    variant={selectedType === t ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => { setSelectedType(t); setCurrentPage(1); }}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setResetDialogOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Clear All
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Memory list */}
      <ScrollArea className="flex-1 px-3 py-2">
        {memoriesQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No memories yet. The AI will learn about you as you chat.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((m: Record<string, unknown>) => {
              const id = Number(m.id) || 0;
              const mType = String(m.memoryType ?? "fact") as MemoryType;
              const content = String(m.content ?? "");
              const confidence = Number(m.confidence) || 0;
              const useCount = Number(m.useCount) || 0;
              const lastUsedAt = m.lastUsedAt ? String(m.lastUsedAt) : null;
              const cfg = memoryTypeConfig[mType] ?? memoryTypeConfig.fact;
              const Icon = cfg.icon;
              const isExpanded = expandedId === id;
              const isLong = content.length > 120;

              return (
                <div
                  key={id}
                  className="border rounded-lg p-2.5 text-xs space-y-1.5 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => isLong && setExpandedId(isExpanded ? null : id)}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge className={cn("text-[9px] px-1.5 py-0 text-white gap-1", cfg.color)}>
                      <Icon className="h-2.5 w-2.5" />
                      {cfg.label}
                    </Badge>
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {useCount > 0 && `${useCount}x`}
                    </span>
                    {confidenceBadge(confidence)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); setDeleteMemoryId(id); }}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                  <p className={cn("text-slate-700 dark:text-slate-300", !isExpanded && "line-clamp-2")}>
                    {isExpanded ? content : `${content.slice(0, 120)}${isLong ? "..." : ""}`}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {lastUsedAt && <span>Last: {new Date(lastUsedAt).toLocaleDateString()}</span>}
                    {isLong && (
                      <span className="text-primary/70 ml-auto">
                        {isExpanded ? "collapse" : "expand"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              {currentPage}/{Math.ceil(total / 20)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={currentPage * 20 >= total}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={deleteMemoryId !== null} onOpenChange={(open) => !open && setDeleteMemoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              This memory will be removed. The agent will no longer reference it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteMemoryId && deleteMutation.mutate({ memoryId: deleteMemoryId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Memories</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all memories for this agent. The agent will start fresh with no stored knowledge. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => resetMutation.mutate({ agencyId, agentNodeId })}
            >
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
