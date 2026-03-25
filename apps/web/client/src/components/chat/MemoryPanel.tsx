import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Target,
  Lightbulb,
  Globe,
  Heart,
  MessageCircle,
  Briefcase,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Edit2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const entityTypeConfig = {
  // General
  fact: { icon: BookOpen, label: "Fact", color: "bg-green-600" },
  rule: { icon: Shield, label: "Rule", color: "bg-amber-600" },
  preference: { icon: Heart, label: "Preference", color: "bg-purple-500" },
  goal: { icon: Target, label: "Goal", color: "bg-blue-500" },
  insight: { icon: Lightbulb, label: "Insight", color: "bg-yellow-500" },
  // People & Context
  user: { icon: User, label: "User", color: "bg-sky-500" },
  project: { icon: FolderGit2, label: "Project", color: "bg-green-500" },
  relationship: { icon: MessageCircle, label: "Relationship", color: "bg-pink-500" },
  context: { icon: Globe, label: "Context", color: "bg-indigo-500" },
  // Domain / Work
  decision: { icon: GitBranch, label: "Decision", color: "bg-red-500" },
  plan: { icon: Map, label: "Plan", color: "bg-cyan-500" },
  process: { icon: Briefcase, label: "Process", color: "bg-orange-500" },
  constraint: { icon: Shield, label: "Constraint", color: "bg-red-600" },
  reference: { icon: FileText, label: "Reference", color: "bg-gray-500" },
  note: { icon: FileText, label: "Note", color: "bg-gray-500" },
  checklist: { icon: CheckSquare, label: "Checklist", color: "bg-yellow-500" },
  artifact_note: { icon: Package, label: "Artifact", color: "bg-orange-500" },
  handoff_note: { icon: Briefcase, label: "Handoff", color: "bg-indigo-500" },
  episode: { icon: MessageCircle, label: "Episode", color: "bg-slate-500" },
  // Technical
  technical: { icon: Code2, label: "Technical", color: "bg-orange-600" },
  architecture: { icon: Building2, label: "Architecture", color: "bg-indigo-600" },
  component: { icon: Puzzle, label: "Component", color: "bg-teal-500" },
  task: { icon: CheckSquare, label: "Task", color: "bg-yellow-600" },
  code_knowledge: { icon: Sparkles, label: "Code Knowledge", color: "bg-pink-500" },
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

function SummaryItem({
  summary: s,
  onDelete,
}: {
  summary: {
    id: number;
    summary: string;
    messageCount: number;
    createdAt: string;
    skippedRiskyCount?: number;
    extractedFactIds?: string[];
    hasRawArchive?: boolean;
    classificationStats?: unknown;
  };
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = s.summary.length > 150;
  const summaryKindLabel =
    s.hasRawArchive ||
    (typeof s.skippedRiskyCount === "number" && s.skippedRiskyCount > 0) ||
    (Array.isArray(s.extractedFactIds) && s.extractedFactIds.length > 0)
      ? "smart summarize"
      : "manual compact";
  return (
    <div
      className="relative text-xs text-muted-foreground bg-muted/50 rounded p-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={() => isLong && setExpanded(!expanded)}
    >
      {onDelete && (
        <button
          type="button"
          className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-background/80"
          title="Delete summary"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      <span className="text-foreground/70 whitespace-pre-wrap">
        {expanded ? s.summary : `${s.summary.slice(0, 150)}${isLong ? "..." : ""}`}
      </span>
      <div className="mt-1 text-[10px] opacity-60 flex items-center gap-2">
        <span>{s.messageCount} messages</span>
        <Badge variant="outline" className="text-[10px]">
          {summaryKindLabel}
        </Badge>
        {typeof s.skippedRiskyCount === "number" && s.skippedRiskyCount > 0 && (
          <span>{s.skippedRiskyCount} risky skipped</span>
        )}
        {Array.isArray(s.extractedFactIds) && s.extractedFactIds.length > 0 && (
          <span>{s.extractedFactIds.length} facts</span>
        )}
        {s.hasRawArchive && <span>raw archive</span>}
        {isLong && <span className="text-primary/70">{expanded ? "▲ collapse" : "▼ expand"}</span>}
      </div>
    </div>
  );
}

type MemoryDisplayItem = {
  displayId: string;
  source: "entity" | "scoped";
  rawId: number | string;
  title: string;
  contentLines: string[];
  typeLabel: string;
  typeKey: string;
  importance: number;
  reinforcementCount: number;
  lastAccessedAt: string | null;
  createdAt: string | null;
  originBadge: "auto" | "manual";
  sourceType: string;
  kind: string;
};

function safeDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEntityMemory(memory: any): MemoryDisplayItem {
  const typeKey = memory.entityType as string;
  const cfg = entityTypeConfig[typeKey as keyof typeof entityTypeConfig];
  return {
    displayId: `entity-${memory.id}`,
    source: "entity",
    rawId: memory.id,
    title: memory.entityName,
    contentLines: Array.isArray(memory.facts) ? memory.facts : [],
    typeLabel: cfg?.label || typeKey,
    typeKey,
    importance: memory.importance ?? 5,
    reinforcementCount: memory.reinforcementCount ?? 0,
    lastAccessedAt: safeDate(memory.lastAccessedAt),
    createdAt: safeDate(memory.createdAt),
    originBadge: memory.source === "manual" ? "manual" : "auto",
    sourceType: memory.source ?? "auto",
    kind: typeKey,
  };
}

function normalizeScopedMemory(memory: any): MemoryDisplayItem {
  const typeKey = String(memory.memoryKind || "fact");
  const cfg = entityTypeConfig[typeKey as keyof typeof entityTypeConfig];
  return {
    displayId: `scoped-${memory.id}`,
    source: "scoped",
    rawId: memory.id,
    title: memory.title,
    contentLines: memory.content ? [memory.content] : [],
    typeLabel: cfg?.label || typeKey,
    typeKey,
    importance: memory.importance ?? 5,
    reinforcementCount: memory.reinforcementCount ?? 0,
    lastAccessedAt: safeDate(memory.lastAccessedAt),
    createdAt: safeDate(memory.createdAt),
    originBadge: memory.sourceType === "manual" ? "manual" : "auto",
    sourceType: memory.sourceType ?? "auto",
    kind: typeKey,
  };
}

function mergeMemoryDisplays(
  entityMemories: any[] = [],
  scopedMemories: any[] = [],
  selectedType: string = "all",
): MemoryDisplayItem[] {
  const all = [
    ...entityMemories.map(normalizeEntityMemory),
    ...scopedMemories.map(normalizeScopedMemory),
  ];

  const filtered = selectedType === "all"
    ? all
    : all.filter((memory) => memory.kind === selectedType || memory.typeKey === selectedType);

  return filtered.sort((a, b) => {
    if (a.kind === "rule" && b.kind !== "rule") return -1;
    if (b.kind === "rule" && a.kind !== "rule") return 1;
    const aTime = a.lastAccessedAt || a.createdAt || "";
    const bTime = b.lastAccessedAt || b.createdAt || "";
    return bTime.localeCompare(aTime);
  });
}

export function MemoryPanel({ onClose, conversationId, onNewChatFromProject }: MemoryPanelProps) {
  const { t } = useTranslation("chat");
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<EntityType | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearDays, setClearDays] = useState(90);
  const [summaryDeleteDialogOpen, setSummaryDeleteDialogOpen] = useState(false);
  const [summaryToDelete, setSummaryToDelete] = useState<number | null>(null);
  const [scopedSelectionMode, setScopedSelectionMode] = useState(false);
  const [selectedScopedMemoryIds, setSelectedScopedMemoryIds] = useState<string[]>([]);
  const [bulkImportanceInProgress, setBulkImportanceInProgress] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  const [memorySearchResult, setMemorySearchResult] = useState<{
    l1Results: Array<{
      memory: {
        id: string;
        title: string;
        content: string;
        memoryKind: string;
        sourceType: string;
        ownerType?: string;
        ownerId?: string;
      };
      score: number;
      matchType: "keyword" | "vector" | "hybrid";
    }>;
    l2Results: Array<{
      chunk: {
        id: string | number;
        content: string;
        tokenCount?: number | null;
      };
      score: number;
      matchType: "keyword" | "vector" | "hybrid";
    }>;
    l1Count: number;
    l2Triggered: boolean;
  } | null>(null);
  const [memorySearchTouched, setMemorySearchTouched] = useState(false);
  const [memorySearchError, setMemorySearchError] = useState<string | null>(null);

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
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | number | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const bulkDeleteInProgressRef = useRef(false);

  // Form state for adding new memory
  const [newMemory, setNewMemory] = useState({
    entityType: "preference" as EntityType,
    entityName: "",
    fact: "",
    importance: 5,
  });
  const [editMemory, setEditMemory] = useState({
    memoryId: "",
    title: "",
    content: "",
    importance: 5,
  });

  const utils = trpc.useUtils();
  const currentUserId = Number(user?.id || 0);

  // Invalidate all memory data when conversation changes (new chat, switch chat)
  const prevConversationId = useRef(conversationId);
  useEffect(() => {
    if (prevConversationId.current !== conversationId) {
      prevConversationId.current = conversationId;
      utils.memory.getEntityMemories.invalidate();
      utils.memory.getSummaries.invalidate();
      utils.scopedMemory.list.invalidate();
      setScopedSelectionMode(false);
      setSelectedScopedMemoryIds([]);
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
    entityType: selectedType === "all" ? undefined : (selectedType as any),
    limit: 50,
    projectId: currentProjectId || null,
  }, {
    enabled: !!conversationId && hasProject,
  });
  const { data: scopedMemories, isLoading: scopedLoading } = trpc.scopedMemory.list.useQuery(
    { limit: 50 },
    { enabled: !!conversationId && Number.isFinite(currentUserId) && currentUserId > 0 },
  );
  // Only show memories when conversation has a project — no project = empty panel
  const memories = (conversationId && hasProject) ? rawMemories : undefined;
  const mergedMemories = useMemo(
    () => mergeMemoryDisplays(memories ?? [], scopedMemories ?? [], selectedType),
    [memories, scopedMemories, selectedType],
  );

  useEffect(() => {
    setSelectedScopedMemoryIds([]);
  }, [selectedType]);

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

  const deleteScopedMemoryMutation = trpc.scopedMemory.delete.useMutation({
    onSuccess: () => {
      utils.scopedMemory.list.invalidate();
      if (!bulkDeleteInProgressRef.current) {
        toast.success("Scoped memory deleted");
      }
    },
  });

  const bulkDeleteScopedMemoryMutation = trpc.scopedMemory.bulkDelete.useMutation({
    onSuccess: () => {
      utils.scopedMemory.list.invalidate();
      setSelectedScopedMemoryIds([]);
      setScopedSelectionMode(false);
      toast.success("Selected scoped memories deleted");
    },
  });

  const updateScopedMemoryMutation = trpc.scopedMemory.update.useMutation({
    onSuccess: () => {
      utils.scopedMemory.list.invalidate();
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
  const deleteSummaryMutation = trpc.memory.deleteSummary.useMutation({
    onSuccess: () => {
      utils.memory.getSummaries.invalidate();
      setSummaryDeleteDialogOpen(false);
      setSummaryToDelete(null);
      toast.success("Summary deleted");
    },
  });
  const searchMemoryContextQuery = trpc.memory.searchMemoryContext.useQuery(
    {
      conversationId: conversationId ?? undefined,
      query: memorySearchQuery.trim() || "__empty__",
      topK: 10,
    },
    { enabled: false },
  );

  // Fetch summaries for current conversation
  const { data: summaries } = trpc.memory.getSummaries.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId }
  );

  const handleAddMemory = () => {
    if (!newMemory.entityName.trim() || !newMemory.fact.trim()) return;

    addMemoryMutation.mutate({
      entityType: newMemory.entityType as any,
      entityName: newMemory.entityName.trim(),
      facts: [newMemory.fact.trim()],
      importance: newMemory.importance,
      source: "manual" as const,
    });
  };

  const openEditScopedMemory = (memory: MemoryDisplayItem) => {
    setEditMemory({
      memoryId: String(memory.rawId),
      title: memory.title,
      content: memory.contentLines.join("\n"),
      importance: memory.importance,
    });
    setEditDialogOpen(true);
  };

  const handleEditScopedMemory = () => {
    if (!editMemory.memoryId.trim() || !editMemory.title.trim() || !editMemory.content.trim()) {
      return;
    }

    updateScopedMemoryMutation.mutate(
      {
        memoryId: editMemory.memoryId,
        title: editMemory.title.trim(),
        content: editMemory.content.trim(),
        importance: editMemory.importance,
      },
      {
        onSuccess: () => {
          toast.success("Scoped memory updated");
          setEditDialogOpen(false);
          setEditMemory({ memoryId: "", title: "", content: "", importance: 5 });
        },
      },
    );
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

  const handleDeleteSummary = (summaryId: number) => {
    setSummaryToDelete(summaryId);
    setSummaryDeleteDialogOpen(true);
  };

  const confirmDeleteSummary = () => {
    if (conversationId && summaryToDelete) {
      deleteSummaryMutation.mutate({
        conversationId,
        summaryId: summaryToDelete,
      });
    }
  };

  const visibleScopedMemoryIds = useMemo(
    () =>
      mergedMemories
        .filter((memory) => memory.source === "scoped")
        .map((memory) => String(memory.rawId)),
    [mergedMemories],
  );

  const selectedScopedMemoryCount = selectedScopedMemoryIds.length;
  const allVisibleScopedSelected =
    visibleScopedMemoryIds.length > 0 &&
    visibleScopedMemoryIds.every((id) => selectedScopedMemoryIds.includes(id));

  const toggleScopedSelectionMode = () => {
    setScopedSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedScopedMemoryIds([]);
      }
      return next;
    });
  };

  const toggleScopedMemorySelection = (memoryId: string) => {
    setSelectedScopedMemoryIds((prev) =>
      prev.includes(memoryId) ? prev.filter((id) => id !== memoryId) : [...prev, memoryId],
    );
  };

  const toggleSelectVisibleScopedMemories = () => {
    if (allVisibleScopedSelected) {
      setSelectedScopedMemoryIds([]);
    } else {
      setSelectedScopedMemoryIds(visibleScopedMemoryIds);
    }
  };

  const bulkDeleteSelectedScopedMemories = async () => {
    if (selectedScopedMemoryIds.length === 0) return;

    try {
      bulkDeleteInProgressRef.current = true;
      await bulkDeleteScopedMemoryMutation.mutateAsync({
        memoryIds: selectedScopedMemoryIds,
      });
      setSelectedScopedMemoryIds([]);
      setScopedSelectionMode(false);
    } catch {
      toast.error("Failed to delete selected scoped memories");
    } finally {
      bulkDeleteInProgressRef.current = false;
    }
  };

  const updateSelectedScopedMemoryImportance = async (delta: number) => {
    if (selectedScopedMemoryIds.length === 0) return;

    const selectedScopedMemories = mergedMemories.filter(
      (memory) => memory.source === "scoped" && selectedScopedMemoryIds.includes(String(memory.rawId)),
    );
    if (selectedScopedMemories.length === 0) return;

    try {
      setBulkImportanceInProgress(true);
      await Promise.all(
        selectedScopedMemories.map((memory) =>
          updateScopedMemoryMutation.mutateAsync({
            memoryId: String(memory.rawId),
            importance: Math.min(10, Math.max(1, memory.importance + delta)),
          }),
        ),
      );
      toast.success(`Updated ${selectedScopedMemories.length} scoped memories`);
    } catch {
      toast.error("Failed to update selected scoped memories");
    } finally {
      setBulkImportanceInProgress(false);
    }
  };

  const updateVisibleScopedMemoryImportance = async (delta: number) => {
    if (visibleScopedMemoryIds.length === 0) return;

    const visibleScopedMemories = mergedMemories.filter(
      (memory) => memory.source === "scoped" && visibleScopedMemoryIds.includes(String(memory.rawId)),
    );
    if (visibleScopedMemories.length === 0) return;

    try {
      setBulkImportanceInProgress(true);
      await Promise.all(
        visibleScopedMemories.map((memory) =>
          updateScopedMemoryMutation.mutateAsync({
            memoryId: String(memory.rawId),
            importance: Math.min(10, Math.max(1, memory.importance + delta)),
          }),
        ),
      );
      toast.success(`Updated ${visibleScopedMemories.length} visible scoped memories`);
    } catch {
      toast.error("Failed to update visible scoped memories");
    } finally {
      setBulkImportanceInProgress(false);
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
        // Refresh memories and summaries to show new data immediately
        utils.scopedMemory.list.invalidate();
        utils.memory.getSummaries.invalidate();
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

  const handleSearchMemoryContext = async () => {
    const query = memorySearchQuery.trim();
    if (!conversationId || !query) return;

    setMemorySearchTouched(true);
    setMemorySearchError(null);

    try {
      const result = await searchMemoryContextQuery.refetch();
      setMemorySearchResult(result.data ?? null);
    } catch {
      setMemorySearchResult(null);
      setMemorySearchError("Search failed. Please try again.");
      toast.error("Failed to search memory context");
    }
  };

  const handleClearOld = async () => {
    try {
      const result = await clearOldMutation.mutateAsync({ olderThanDays: clearDays });
      utils.memory.getEntityMemories.invalidate();
      utils.scopedMemory.list.invalidate();
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
            <CardTitle className="text-lg">{t("memory.title")}</CardTitle>
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
              onClick={() => {
                utils.memory.getEntityMemories.invalidate();
                utils.scopedMemory.list.invalidate();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={handleOpenAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 h-7 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  {t("memory.addMemory")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("memory.addMemory")}</DialogTitle>
                  <DialogDescription>
                    {t("memory.addMemoryDesc")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("memory.typeLabel")}</label>
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
                    <label className="text-sm font-medium">{t("memory.nameLabel")}</label>
                    <Input
                      placeholder={t("memory.namePlaceholder")}
                      value={newMemory.entityName}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, entityName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("memory.contentLabel")}</label>
                    <Textarea
                      placeholder={t("memory.contentPlaceholder")}
                      value={newMemory.fact}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, fact: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("memory.importanceLabel", { value: newMemory.importance })}
                    </label>
                    <Slider
                      value={[newMemory.importance]}
                      onValueChange={([v]) => setNewMemory({ ...newMemory, importance: v })}
                      min={1}
                      max={10}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("memory.importanceLow")}</span>
                      <span>{t("memory.importanceHigh")}</span>
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

          {/* Memory Search */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Search Context
            </div>
            <div className="flex gap-1.5">
              <Input
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                placeholder="Search memories or recent chat chunks"
                className="h-7 text-xs"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchMemoryContext();
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3 gap-1"
                onClick={() => void handleSearchMemoryContext()}
                disabled={
                  searchMemoryContextQuery.isFetching ||
                  !conversationId ||
                  !memorySearchQuery.trim()
                }
              >
                {searchMemoryContextQuery.isFetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Search className="h-3 w-3" />
                )}
                Search
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Searches scoped memories first, then falls back to recent message chunks when needed.
            </p>
            {memorySearchError && (
              <div className="text-[11px] text-destructive">{memorySearchError}</div>
            )}
            {memorySearchTouched && memorySearchResult && (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>{memorySearchResult.l1Count} memory matches</span>
                  {memorySearchResult.l2Triggered && <span>• chunk fallback enabled</span>}
                </div>
                {memorySearchResult.l1Results.length === 0 && memorySearchResult.l2Results.length === 0 ? (
                  <div className="text-muted-foreground">No matching memory context found.</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {memorySearchResult.l1Results.map((result) => (
                      <div key={`l1-${result.memory.id}`} className="rounded border bg-muted/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{result.memory.title}</span>
                          <Badge variant="outline" className="text-[10px]">
                            L1 {result.matchType}
                          </Badge>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {result.memory.content}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>score {result.score.toFixed(2)}</span>
                          <span>kind {result.memory.memoryKind}</span>
                          {result.memory.sourceType && <span>source {result.memory.sourceType}</span>}
                        </div>
                      </div>
                    ))}
                    {memorySearchResult.l2Results.map((result) => (
                      <div key={`l2-${result.chunk.id}`} className="rounded border bg-muted/30 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">Chunk {result.chunk.id}</span>
                          <Badge variant="outline" className="text-[10px]">
                            L2 {result.matchType}
                          </Badge>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {result.chunk.content}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>score {result.score.toFixed(2)}</span>
                          {typeof result.chunk.tokenCount === "number" && (
                            <span>tokens {result.chunk.tokenCount}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
          {scopedMemories && scopedMemories.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <Button
                variant={scopedSelectionMode ? "secondary" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={toggleScopedSelectionMode}
              >
                {scopedSelectionMode ? "Exit Select" : "Select Scoped"}
              </Button>
              {scopedSelectionMode && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={toggleSelectVisibleScopedMemories}
                  >
                    {allVisibleScopedSelected ? "Clear All Visible" : "Select All Visible"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => updateSelectedScopedMemoryImportance(1)}
                    disabled={selectedScopedMemoryCount === 0 || bulkImportanceInProgress}
                  >
                    <ArrowUp className="h-3 w-3" />
                    Promote Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => updateSelectedScopedMemoryImportance(-1)}
                    disabled={selectedScopedMemoryCount === 0 || bulkImportanceInProgress}
                  >
                    <ArrowDown className="h-3 w-3" />
                    Demote Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => updateVisibleScopedMemoryImportance(1)}
                    disabled={visibleScopedMemoryIds.length === 0 || bulkImportanceInProgress}
                  >
                    <ArrowUp className="h-3 w-3" />
                    Promote All Visible
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => updateVisibleScopedMemoryImportance(-1)}
                    disabled={visibleScopedMemoryIds.length === 0 || bulkImportanceInProgress}
                  >
                    <ArrowDown className="h-3 w-3" />
                    Demote All Visible
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={bulkDeleteSelectedScopedMemories}
                    disabled={selectedScopedMemoryCount === 0 || bulkDeleteScopedMemoryMutation.isPending}
                  >
                    {bulkDeleteScopedMemoryMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete Selected ({selectedScopedMemoryCount})
                  </Button>
                </>
              )}
            </div>
          )}
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
                    onDelete={() => handleDeleteSummary(s.id)}
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
          {isLoading || scopedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mergedMemories.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No memories yet. The AI will learn about you as you chat.
            </div>
          ) : (
            <div className="space-y-3">
              {mergedMemories.map((memory) => {
                const config = entityTypeConfig[memory.typeKey as keyof typeof entityTypeConfig];
                const Icon = config?.icon || Brain;
                const isScopedSelected = selectedScopedMemoryIds.includes(String(memory.rawId));
                return (
                  <div
                    key={memory.displayId}
                    className="group rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {memory.source === "scoped" && scopedSelectionMode && (
                          <Checkbox
                            checked={isScopedSelected}
                            onCheckedChange={() => toggleScopedMemorySelection(String(memory.rawId))}
                            aria-label={`Select ${memory.title}`}
                          />
                        )}
                        <div
                          className={cn(
                            "rounded-full p-1",
                            config?.color || "bg-gray-500"
                          )}
                        >
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <span className="font-medium text-sm">
                          {memory.title}
                        </span>
                        {importanceBadge(memory.importance)}
                        <Badge variant="outline" className="text-[10px]">
                          {memory.originBadge}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {memory.source === "scoped" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Increase importance"
                              onClick={() =>
                                updateScopedMemoryMutation.mutate({
                                  memoryId: String(memory.rawId),
                                  importance: Math.min(10, memory.importance + 1),
                                })
                              }
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Decrease importance"
                              onClick={() =>
                                updateScopedMemoryMutation.mutate({
                                  memoryId: String(memory.rawId),
                                  importance: Math.max(1, memory.importance - 1),
                                })
                              }
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit scoped memory"
                              onClick={() => openEditScopedMemory(memory)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={memory.source === "scoped" ? "Delete scoped memory" : "Delete memory"}
                          onClick={() =>
                            memory.source === "scoped"
                              ? deleteScopedMemoryMutation.mutate({ memoryId: String(memory.rawId) })
                              : handleDeleteMemory(Number(memory.rawId))
                          }
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(expandedMemoryId === memory.displayId
                        ? memory.contentLines
                        : memory.contentLines.slice(0, 3)
                      ).map((fact, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          • {fact}
                        </p>
                      ))}
                      {memory.contentLines.length > 3 && (
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => setExpandedMemoryId(
                            expandedMemoryId === memory.displayId ? null : memory.displayId
                          )}
                        >
                          {expandedMemoryId === memory.displayId
                            ? "Show less"
                            : `+${memory.contentLines.length - 3} more facts`}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {memory.typeLabel}
                      </Badge>
                      {memory.kind === "rule" && (
                        <Badge className="text-xs bg-amber-600 text-white">
                          Always Active
                        </Badge>
                      )}
                      {memory.sourceType && memory.sourceType !== "auto" && (
                        <Badge variant="outline" className="text-xs">
                          {memory.sourceType}
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

      <AlertDialog open={summaryDeleteDialogOpen} onOpenChange={setSummaryDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete summary?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected summary from the conversation history. The underlying messages stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSummary}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSummaryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Scoped Memory</DialogTitle>
            <DialogDescription>
              Update the title, content, or importance for this scoped memory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={editMemory.title}
                onChange={(e) => setEditMemory((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Memory title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={editMemory.content}
                onChange={(e) => setEditMemory((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Memory content"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Importance: {editMemory.importance}
              </label>
              <Slider
                value={[editMemory.importance]}
                onValueChange={([v]) => setEditMemory((prev) => ({ ...prev, importance: v }))}
                min={1}
                max={10}
                step={1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditScopedMemory}
              disabled={
                updateScopedMemoryMutation.isPending ||
                !editMemory.title.trim() ||
                !editMemory.content.trim()
              }
            >
              {updateScopedMemoryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
