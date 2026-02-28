import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FolderGit2,
  Settings2,
  Code2,
  Loader2,
  RefreshCw,
  GitBranch,
  Map,
  Building2,
  Puzzle,
  CheckSquare,
  BookOpen,
  Shield,
  Package,
  ToggleLeft,
  Archive,
  MessageSquarePlus,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const entityTypeConfig = {
  rule: { icon: Shield, label: "Rule", color: "bg-amber-600" },
  user: { icon: User, label: "User", color: "bg-blue-500" },
  project: { icon: FolderGit2, label: "Project", color: "bg-green-500" },
  preference: { icon: Settings2, label: "Preference", color: "bg-purple-500" },
  technical: { icon: Code2, label: "Technical", color: "bg-orange-500" },
  decision: { icon: GitBranch, label: "Decision", color: "bg-red-500" },
  plan: { icon: Map, label: "Plan", color: "bg-cyan-500" },
  architecture: { icon: Building2, label: "Architecture", color: "bg-indigo-500" },
  component: { icon: Puzzle, label: "Component", color: "bg-teal-500" },
  task: { icon: CheckSquare, label: "Task", color: "bg-yellow-500" },
  code_knowledge: { icon: BookOpen, label: "Code Knowledge", color: "bg-pink-500" },
};

type EntityType = keyof typeof entityTypeConfig;

function importanceBadge(importance: number) {
  if (importance >= 8) return <Badge variant="destructive" className="text-xs">{importance}</Badge>;
  if (importance >= 5) return <Badge variant="secondary" className="text-xs">{importance}</Badge>;
  return <Badge variant="outline" className="text-xs">{importance}</Badge>;
}

const memoryModeLabels: Record<string, { label: string; desc: string }> = {
  full: { label: "Full Memory", desc: "All tiers active" },
  no_long: { label: "No Long Memory", desc: "Summaries + buffer only" },
  off: { label: "Memory Off", desc: "Raw messages only" },
};

interface MemoryPanelProps {
  onClose?: () => void;
  conversationId?: number | null;
  onNewChatFromProject?: (projectId: string, summary: string) => void;
}

function SummaryItem({ summary: s }: { summary: { id: number; summary: string; messageCount: number; createdAt: string } }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = s.summary.length > 150;
  return (
    <div
      className="text-xs text-muted-foreground bg-muted/50 rounded p-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <span className="text-foreground/70 whitespace-pre-wrap">
        {expanded ? s.summary : `${s.summary.slice(0, 150)}${isLong ? "..." : ""}`}
      </span>
      <div className="mt-1 text-[10px] opacity-60 flex items-center gap-2">
        <span>{s.messageCount} messages</span>
        {isLong && <span className="text-primary/70">{expanded ? "▲ collapse" : "▼ expand"}</span>}
      </div>
    </div>
  );
}

export function MemoryPanel({ onClose, conversationId, onNewChatFromProject }: MemoryPanelProps) {
  const [selectedType, setSelectedType] = useState<EntityType | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearDays, setClearDays] = useState(90);

  // Capture selected text from chat when opening Add Memory dialog
  const handleOpenAddDialog = useCallback((open: boolean) => {
    if (open) {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        setNewMemory((prev) => ({ ...prev, fact: selection }));
      }
    }
    setAddDialogOpen(open);
  }, []);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState<number | null>(null);
  const [expandedMemoryId, setExpandedMemoryId] = useState<number | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  // Form state for adding new memory
  const [newMemory, setNewMemory] = useState({
    entityType: "preference" as EntityType,
    entityName: "",
    fact: "",
    importance: 5,
  });

  const utils = trpc.useUtils();

  // Invalidate all memory data when conversation changes (new chat, switch chat)
  const prevConversationId = useRef(conversationId);
  useEffect(() => {
    if (prevConversationId.current !== conversationId) {
      prevConversationId.current = conversationId;
      utils.memory.getEntityMemories.invalidate();
      utils.memory.getSummaries.invalidate();
      if (conversationId) {
        utils.chat.getConversation.invalidate({ id: conversationId });
      }
    }
  }, [conversationId, utils]);

  // Fetch conversation details for projectId and memoryMode
  const { data: conversation } = trpc.chat.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId }
  );

  // Project ID state (local editable)
  const [editingProjectId, setEditingProjectId] = useState(false);
  const [projectIdInput, setProjectIdInput] = useState("");

  // Fetch memories — scoped by project when conversation has a projectId
  // Don't fetch memories until a conversation exists (new chat = no memories shown)
  const currentProjectId = (conversation as any)?.projectId || "";
  const hasProject = !!currentProjectId;
  const { data: rawMemories, isLoading } = trpc.memory.getEntityMemories.useQuery({
    entityType: selectedType === "all" ? undefined : selectedType,
    limit: 50,
    projectId: currentProjectId || null,
  }, {
    enabled: !!conversationId && hasProject,
  });
  // Only show memories when conversation has a project — no project = empty panel
  const memories = (conversationId && hasProject) ? rawMemories : undefined;

  // Mutations
  const addMemoryMutation = trpc.memory.upsertEntityMemory.useMutation({
    onSuccess: () => {
      utils.memory.getEntityMemories.invalidate();
      setAddDialogOpen(false);
      setNewMemory({ entityType: "preference", entityName: "", fact: "", importance: 5 });
    },
  });

  const deleteMemoryMutation = trpc.memory.deleteEntityMemory.useMutation({
    onSuccess: () => {
      utils.memory.getEntityMemories.invalidate();
      setDeleteDialogOpen(false);
      setMemoryToDelete(null);
    },
  });

  const updateConversationMutation = trpc.chat.updateConversation.useMutation({
    onSuccess: () => {
      if (conversationId) {
        utils.chat.getConversation.invalidate({ id: conversationId });
      }
    },
  });

  const compactMutation = trpc.memory.compactConversation.useMutation();
  const clearOldMutation = trpc.memory.clearOldMemories.useMutation();

  // Fetch summaries for current conversation
  const { data: summaries } = trpc.memory.getSummaries.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId }
  );

  const handleAddMemory = () => {
    if (!newMemory.entityName.trim() || !newMemory.fact.trim()) return;

    addMemoryMutation.mutate({
      entityType: newMemory.entityType,
      entityName: newMemory.entityName.trim(),
      facts: [newMemory.fact.trim()],
      importance: newMemory.importance,
      source: "manual" as const,
    });
  };

  const handleDeleteMemory = (id: number) => {
    setMemoryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (memoryToDelete) {
      deleteMemoryMutation.mutate({ id: memoryToDelete });
    }
  };

  const handleSaveProjectId = () => {
    if (!conversationId) return;
    updateConversationMutation.mutate({
      id: conversationId,
      projectId: projectIdInput.trim() || null,
    });
    setEditingProjectId(false);
    toast.success("Project ID updated");
  };

  const handleMemoryModeChange = (mode: string) => {
    if (!conversationId) return;
    updateConversationMutation.mutate({
      id: conversationId,
      memoryMode: mode as "full" | "no_long" | "off",
    });
    toast.success(`Memory mode: ${memoryModeLabels[mode]?.label || mode}`);
  };

  const handleCompact = async () => {
    if (!conversationId) return;
    try {
      const result = await compactMutation.mutateAsync({ conversationId });
      if (result.compacted) {
        toast.success(`Compacted: ${result.messageCount} messages summarized`);
      } else {
        toast.info("Not enough messages to compact (requires more than 5 messages)");
      }
    } catch {
      toast.error("Failed to compact conversation");
    }
  };

  const handleNewChatFromProject = async () => {
    if (!conversationId || !currentProjectId || !onNewChatFromProject) return;
    try {
      const { summary } = await utils.memory.getConversationSummary.fetch({ conversationId });
      onNewChatFromProject(currentProjectId, summary);
    } catch {
      toast.error("Failed to get conversation summary");
    }
  };

  const handleClearOld = async () => {
    try {
      const result = await clearOldMutation.mutateAsync({ olderThanDays: clearDays });
      utils.memory.getEntityMemories.invalidate();
      setClearDialogOpen(false);
      toast.success(`Deleted ${result.deletedCount} old memories (rules preserved)`);
    } catch {
      toast.error("Failed to clear old memories");
    }
  };

  const currentMemoryMode = (conversation as any)?.memoryMode || "full";

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Memory</CardTitle>
            {currentMemoryMode !== "full" && (
              <Badge variant="outline" className="text-xs">
                {memoryModeLabels[currentMemoryMode]?.label || currentMemoryMode}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => utils.memory.getEntityMemories.invalidate()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={handleOpenAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 h-7 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Memory</DialogTitle>
                  <DialogDescription>
                    Add a fact that the AI should remember about you or your projects.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <Select
                      value={newMemory.entityType}
                      onValueChange={(v) =>
                        setNewMemory({ ...newMemory, entityType: v as EntityType })
                      }
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
                      placeholder="e.g., 'coding style', 'SmartAIHub project'"
                      value={newMemory.entityName}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, entityName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      placeholder="e.g., 'I prefer TypeScript over JavaScript'"
                      value={newMemory.fact}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, fact: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Importance: {newMemory.importance}
                    </label>
                    <Slider
                      value={[newMemory.importance]}
                      onValueChange={([v]) => setNewMemory({ ...newMemory, importance: v })}
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
                  <Button
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddMemory}
                    disabled={
                      addMemoryMutation.isPending ||
                      !newMemory.entityName.trim() ||
                      !newMemory.fact.trim()
                    }
                  >
                    {addMemoryMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Memory
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Facts the AI remembers about you and your projects
        </CardDescription>
      </CardHeader>

      {/* Collapsible Controls Toggle */}
      {conversationId && (
        <div className="px-4 pb-1">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
            onClick={() => setControlsCollapsed(!controlsCollapsed)}
          >
            {controlsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {controlsCollapsed ? "Show controls" : "Hide controls"}
          </button>
        </div>
      )}

      {/* Project & Controls Section */}
      {conversationId && !controlsCollapsed && (
        <div className="px-4 pb-3 space-y-3">
          {/* Project ID */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Project
            </div>
            {editingProjectId ? (
              <div className="flex gap-1.5">
                <Input
                  value={projectIdInput}
                  onChange={(e) => setProjectIdInput(e.target.value)}
                  placeholder="Project name or ID"
                  className="h-7 text-xs"
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveProjectId}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingProjectId(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs">
                  {currentProjectId || <span className="text-muted-foreground italic">Not set</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setProjectIdInput(currentProjectId);
                    setEditingProjectId(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            )}
            {currentProjectId && onNewChatFromProject && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs gap-1 mt-2"
                onClick={handleNewChatFromProject}
              >
                <MessageSquarePlus className="h-3 w-3" />
                New Chat in "{currentProjectId}"
              </Button>
            )}
          </div>

          {/* Memory Mode Toggle */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ToggleLeft className="h-3.5 w-3.5" />
              Memory Mode
            </div>
            <div className="flex gap-1">
              {Object.entries(memoryModeLabels).map(([mode, { label }]) => (
                <Button
                  key={mode}
                  variant={currentMemoryMode === mode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => handleMemoryModeChange(mode)}
                  disabled={updateConversationMutation.isPending}
                >
                  {label.replace(" Memory", "")}
                </Button>
              ))}
            </div>
          </div>

          {/* Actions row */}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1 gap-1"
              onClick={handleCompact}
              disabled={compactMutation.isPending}
            >
              {compactMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
              Compact
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1 gap-1 text-destructive hover:text-destructive"
              onClick={() => setClearDialogOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
              Clear Old
            </Button>
          </div>
        </div>
      )}

      {/* Summaries Section */}
      {conversationId && !controlsCollapsed && summaries && summaries.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Summaries ({summaries.length})
            </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {summaries.map((s) => (
                  <SummaryItem
                    key={s.id}
                    summary={{
                      ...s,
                      createdAt:
                        s.createdAt instanceof Date
                          ? s.createdAt.toISOString()
                          : String(s.createdAt),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
      )}

      <div className="px-4 pb-3">
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={selectedType === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedType("all")}
            className="h-7 text-xs"
          >
            All
          </Button>
          {Object.entries(entityTypeConfig).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <Button
                key={type}
                variant={selectedType === type ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedType(type as EntityType)}
                className="gap-1 h-7 text-xs"
              >
                <Icon className="h-3 w-3" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !memories || memories.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No memories yet. The AI will learn about you as you chat.
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => {
                const config = entityTypeConfig[memory.entityType as EntityType];
                const Icon = config?.icon || Brain;
                const imp = memory.importance ?? 5;
                return (
                  <div
                    key={memory.id}
                    className="group rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "rounded-full p-1",
                            config?.color || "bg-gray-500"
                          )}
                        >
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <span className="font-medium text-sm">
                          {memory.entityName}
                        </span>
                        {importanceBadge(imp)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteMemory(memory.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(expandedMemoryId === memory.id
                        ? memory.facts
                        : memory.facts.slice(0, 3)
                      ).map((fact, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          • {fact}
                        </p>
                      ))}
                      {memory.facts.length > 3 && (
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => setExpandedMemoryId(
                            expandedMemoryId === memory.id ? null : memory.id
                          )}
                        >
                          {expandedMemoryId === memory.id
                            ? "Show less"
                            : `+${memory.facts.length - 3} more facts`}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {config?.label || memory.entityType}
                      </Badge>
                      {memory.entityType === "rule" && (
                        <Badge className="text-xs bg-amber-600 text-white">
                          Always Active
                        </Badge>
                      )}
                      {memory.source && memory.source !== "auto" && (
                        <Badge variant="outline" className="text-xs">
                          {memory.source}
                        </Badge>
                      )}
                      <span>•</span>
                      <span>
                        Reinforced {memory.reinforcementCount}x
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this memory permanently. The AI will no longer
              remember this fact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMemoryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Old Memories Confirmation */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear old memories?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete memories older than the selected period. Rules are never deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={String(clearDays)} onValueChange={(v) => setClearDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">1 month</SelectItem>
                <SelectItem value="90">3 months</SelectItem>
                <SelectItem value="180">6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearOld}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearOldMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Clear Old Memories
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
