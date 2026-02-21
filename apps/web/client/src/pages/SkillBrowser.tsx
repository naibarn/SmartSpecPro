/**
 * Skill Browser Page
 * Browse permitted skills with search, category filter, pagination.
 * Toggle visibility and auto-trigger per skill.
 * Owners can manage group sharing for their private skills.
 */

import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Search,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Video,
  Code2,
  FileText,
  Globe,
  BarChart3,
  Languages,
  Bot,
  Zap,
  Settings2,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Lock,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const iconMap: Record<string, React.ElementType> = {
  wand2: Wand2,
  sparkles: Sparkles,
  video: Video,
  code2: Code2,
  "file-text": FileText,
  globe: Globe,
  "bar-chart-3": BarChart3,
  languages: Languages,
  bot: Bot,
  zap: Zap,
  settings2: Settings2,
};

const categoryLabels: Record<string, string> = {
  all: "All Categories",
  image_generation: "Image Generation",
  video_generation: "Video Generation",
  audio_generation: "Audio Generation",
  prompt_enhancement: "Prompt Enhancement",
  code_assistant: "Code Assistant",
  document_analysis: "Document Analysis",
  web_search: "Web Search",
  data_analysis: "Data Analysis",
  translation: "Translation",
  summarization: "Summarization",
  chat_assistant: "Chat Assistant",
  automation: "Automation",
  other: "Other",
};

const visibilityConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  public: { label: "Public", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Globe },
  private: { label: "Private", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Lock },
  pending_approval: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: X },
};

function GroupSharingPanel({ skillId }: { skillId: number }) {
  const utils = trpc.useUtils();

  const { data: sharedGroups, isLoading: groupsLoading } = trpc.skills.getSkillGroups.useQuery(
    { skillId },
  );

  const { data: userGroups } = trpc.groups.list.useQuery(
    { scope: "my_groups" } as any,
  );

  const shareWithGroupsMutation = trpc.skills.shareWithGroups.useMutation({
    onSuccess: () => {
      utils.skills.getSkillGroups.invalidate({ skillId });
      toast.success("Group added");
    },
    onError: (err) => toast.error(err.message),
  });

  const unshareGroupMutation = trpc.skills.unshareGroup.useMutation({
    onSuccess: () => {
      utils.skills.getSkillGroups.invalidate({ skillId });
      toast.success("Group removed");
    },
    onError: (err) => toast.error(err.message),
  });

  if (groupsLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading groups...</span>
      </div>
    );
  }

  const availableGroups = (userGroups as any[] | undefined)?.filter(
    (g: any) => !sharedGroups?.some((sg: any) => sg.id === g.id)
  ) ?? [];

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Shared with Groups</span>
      </div>

      {/* Shared groups badges */}
      <div className="flex flex-wrap gap-1.5">
        {sharedGroups && sharedGroups.length > 0 ? (
          sharedGroups.map((group: any) => (
            <Badge
              key={group.id}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-0.5 py-0.5 text-xs"
            >
              <span>{group.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-0.5 hover:bg-destructive/20 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  unshareGroupMutation.mutate({ skillId, groupId: group.id });
                }}
                disabled={unshareGroupMutation.isPending}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground italic">Not shared with any groups</span>
        )}
      </div>

      {/* Add group selector */}
      {availableGroups.length > 0 && (
        <Select
          onValueChange={(groupId) => {
            shareWithGroupsMutation.mutate({
              skillId,
              groupIds: [parseInt(groupId)],
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Add a group..." />
          </SelectTrigger>
          <SelectContent>
            {availableGroups.map((group: any) => (
              <SelectItem key={group.id} value={String(group.id)}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default function SkillBrowser() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedSkillId, setExpandedSkillId] = useState<number | null>(null);

  // Debounce search
  const debounceTimer = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceTimer[0]) clearTimeout(debounceTimer[0]);
      debounceTimer[0] = setTimeout(() => {
        setDebouncedSearch(value);
        setPage(0);
      }, 300);
    },
    [debounceTimer]
  );

  const { data, isLoading } = trpc.skills.browseAllSkills.useQuery(
    {
      search: debouncedSearch || undefined,
      category: category !== "all" ? category : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();

  const toggleVisibility = trpc.skills.toggleSkillVisibility.useMutation({
    onSuccess: () => {
      utils.skills.browseAllSkills.invalidate();
      utils.skills.getUserVisibleSkills.invalidate();
    },
  });

  const toggleAutoTrigger = trpc.skills.toggleAutoTrigger.useMutation({
    onSuccess: () => {
      utils.skills.browseAllSkills.invalidate();
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const deleteOwnMutation = trpc.skills.deleteOwn.useMutation({
    onSuccess: () => {
      utils.skills.browseAllSkills.invalidate();
      utils.skills.getUserVisibleSkills.invalidate();
      toast.success("Skill deleted");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteTarget(null);
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Please log in to manage skills.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div>
              <h1 className="text-xl font-bold">Skill Browser</h1>
              <p className="text-sm text-muted-foreground">
                Browse and manage which skills are visible in your chat
                {data && ` \u2022 ${data.total} skills available`}
              </p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.skills.length ? (
          <div className="text-center py-20 text-muted-foreground">
            No skills found. Try a different search or category.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {data.skills.map((skill: any) => {
                  const Icon = iconMap[skill.icon ?? "sparkles"] || Sparkles;
                  const vis = visibilityConfig[skill.visibility] || visibilityConfig.public;
                  const VisIcon = vis.icon;
                  const isOwner = skill.isOwner;
                  const isExpanded = expandedSkillId === skill.id;

                  return (
                    <motion.div
                      key={skill.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className={`transition-all ${skill.visible ? "border-primary/30 bg-card" : "opacity-60 bg-muted/30"}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`rounded-lg p-2 ${skill.visible ? "bg-primary/10" : "bg-muted"}`}>
                              <Icon className={`h-5 w-5 ${skill.visible ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span className="font-medium text-sm truncate">{skill.name}</span>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {categoryLabels[skill.category] ?? skill.category}
                                </Badge>
                                {/* Visibility badge */}
                                <Badge variant="outline" className={`text-xs shrink-0 ${vis.color}`}>
                                  <VisIcon className="h-2.5 w-2.5 mr-0.5" />
                                  {vis.label}
                                </Badge>
                                {/* Owner badge */}
                                {isOwner && (
                                  <Badge className="text-xs shrink-0 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                                    Mine
                                  </Badge>
                                )}
                              </div>

                              {/* Owner info */}
                              {skill.ownerName && !isOwner && (
                                <p className="text-xs text-muted-foreground mb-1">
                                  by {skill.ownerName}
                                </p>
                              )}

                              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                {skill.description || "No description"}
                              </p>

                              {/* Toggles */}
                              <div className="flex items-center justify-between gap-4">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-2">
                                        {skill.visible ? (
                                          <Eye className="h-3.5 w-3.5 text-primary" />
                                        ) : (
                                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        <span className="text-xs">Visible</span>
                                        <Switch
                                          checked={skill.visible}
                                          onCheckedChange={(checked) => {
                                            toggleVisibility.mutate(
                                              { skillId: skill.id, visible: checked },
                                              {
                                                onSuccess: () => toast.success(checked ? "Skill added to chat" : "Skill hidden from chat"),
                                              }
                                            );
                                          }}
                                          disabled={toggleVisibility.isPending}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {skill.visible ? "Visible in your chat" : "Hidden from your chat"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                {skill.visible && skill.isAutoTrigger && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2">
                                          <Zap className="h-3.5 w-3.5 text-yellow-500" />
                                          <span className="text-xs">Auto</span>
                                          <Switch
                                            checked={skill.autoTriggerEnabled}
                                            onCheckedChange={(checked) => {
                                              toggleAutoTrigger.mutate(
                                                { skillId: skill.id, enabled: checked },
                                                {
                                                  onSuccess: () => toast.success(checked ? "Auto-trigger enabled" : "Auto-trigger disabled"),
                                                }
                                              );
                                            }}
                                            disabled={toggleAutoTrigger.isPending}
                                          />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Auto-detect this skill from your messages
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}

                                {/* Share button for owned private skills */}
                                {isOwner && skill.visibility === "private" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                                        >
                                          <Share2 className="h-3.5 w-3.5 mr-1" />
                                          Share
                                          {isExpanded ? (
                                            <ChevronUp className="h-3 w-3 ml-0.5" />
                                          ) : (
                                            <ChevronDown className="h-3 w-3 ml-0.5" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Manage which groups can use this skill
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}

                                {/* Delete button for owned skills */}
                                {isOwner && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                          onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Delete this skill</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                              {/* Credit multiplier */}
                              {skill.creditMultiplier && Number(skill.creditMultiplier) > 1 && (
                                <Badge variant="secondary" className="text-xs mt-2">
                                  {skill.creditMultiplier}x credits
                                </Badge>
                              )}

                              {/* Expandable group sharing panel */}
                              {isOwner && skill.visibility === "private" && isExpanded && (
                                <GroupSharingPanel skillId={skill.id} />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOwnMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteOwnMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteOwnMutation.mutate({ id: deleteTarget.id });
                }
              }}
            >
              {deleteOwnMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
