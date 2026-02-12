import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Wand2,
  Video,
  Code2,
  FileText,
  Search,
  Loader2,
  Settings2,
  Zap,
  Info,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const iconMap: Record<string, React.ElementType> = {
  image: Wand2,
  video: Video,
  code: Code2,
  "file-text": FileText,
  search: Search,
};

type DetectionMode = "ask" | "auto" | "explicit";

interface SkillSettingsProps {
  conversationId: number;
  onClose?: () => void;
}

export function SkillSettings({ conversationId, onClose }: SkillSettingsProps) {
  const [, navigate] = useLocation();
  const [detectionMode, setDetectionMode] = useState<DetectionMode>("auto");
  const [autoDetect, setAutoDetect] = useState(true);
  const [skillStates, setSkillStates] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  // Fetch user's visible skills only
  const { data: visibleData, isLoading: loadingSkills } = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  const skills = visibleData?.skills?.map((s) => ({
    id: String(s.id),
    name: s.name,
    description: s.description ?? "",
    icon: s.icon ?? "sparkles",
    type: s.category,
    models: s.availableModels ?? [],
    defaultModel: s.defaultModel,
    enabledByDefault: s.enabledByDefault,
    creditMultiplier: Number(s.creditMultiplier ?? 1),
    priority: s.priority,
  }));

  // Fetch conversation skill preferences
  const { data: preferences, isLoading: loadingPreferences } = trpc.chat.getSkillPreferences.useQuery({
    conversationId,
  });

  // Fetch conversation to get skill settings
  const { data: conversation } = trpc.chat.getConversation.useQuery({ id: conversationId });

  // Update conversation mutation
  const updateConversationMutation = trpc.chat.updateConversation.useMutation({
    onSuccess: () => {
      utils.chat.getConversation.invalidate({ id: conversationId });
    },
  });

  // Batch update preferences mutation
  const batchUpdateMutation = trpc.chat.batchUpdateSkillPreferences.useMutation({
    onSuccess: () => {
      utils.chat.getSkillPreferences.invalidate({ conversationId });
    },
  });

  // Initialize states from conversation settings
  useEffect(() => {
    if (conversation?.skillSettings) {
      const settings = conversation.skillSettings as {
        autoDetect?: boolean;
        detectionMode?: DetectionMode;
        enabledSkills?: string[];
      };
      setAutoDetect(settings.autoDetect ?? true);
      setDetectionMode(settings.detectionMode ?? "auto");
    }
  }, [conversation]);

  // Initialize skill states from preferences or defaults
  useEffect(() => {
    if (skills && preferences) {
      const states: Record<string, boolean> = {};

      for (const skill of skills) {
        const pref = preferences.find((p) => p.skillId === skill.id);
        if (pref) {
          states[skill.id] = pref.enabled;
        } else {
          states[skill.id] = skill.enabledByDefault;
        }
      }

      setSkillStates(states);
    }
  }, [visibleData, preferences]);

  // Auto-save function
  const autoSave = useCallback(async (
    newAutoDetect: boolean,
    newDetectionMode: DetectionMode,
    newSkillStates: Record<string, boolean>,
  ) => {
    setSaveStatus("saving");
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        skillSettings: {
          autoDetect: newAutoDetect,
          detectionMode: newDetectionMode,
          enabledSkills: Object.entries(newSkillStates)
            .filter(([_, enabled]) => enabled)
            .map(([id]) => id),
        },
      });

      const prefsToUpdate = Object.entries(newSkillStates).map(([skillId, enabled]) => ({
        skillId,
        enabled,
      }));

      await batchUpdateMutation.mutateAsync({
        conversationId,
        preferences: prefsToUpdate,
      });

      setSaveStatus("saved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  }, [conversationId, updateConversationMutation, batchUpdateMutation]);

  const handleSkillToggle = (skillId: string, enabled: boolean) => {
    const newStates = { ...skillStates, [skillId]: enabled };
    setSkillStates(newStates);
    autoSave(autoDetect, detectionMode, newStates);
  };

  const handleAutoDetectToggle = (enabled: boolean) => {
    setAutoDetect(enabled);
    autoSave(enabled, detectionMode, skillStates);
  };

  const handleDetectionModeChange = (mode: DetectionMode) => {
    setDetectionMode(mode);
    autoSave(autoDetect, mode, skillStates);
  };

  const handleResetDefaults = () => {
    if (!skills) return;

    const defaultStates: Record<string, boolean> = {};
    for (const skill of skills) {
      defaultStates[skill.id] = skill.enabledByDefault;
    }
    setSkillStates(defaultStates);
    setAutoDetect(true);
    setDetectionMode("auto");
    autoSave(true, "auto", defaultStates);
  };

  const isLoading = loadingSkills || loadingPreferences;
  const isSaving = saveStatus === "saving";

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Skill Settings</CardTitle>
          </div>
        </div>
        <CardDescription>
          Configure which AI skills are enabled for this conversation
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Auto-detect toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Auto-detect skills</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Automatically detect when to use skills based on your messages
                  </p>
                </div>
                <Switch
                  checked={autoDetect}
                  onCheckedChange={handleAutoDetectToggle}
                />
              </div>

              {/* Detection mode */}
              {autoDetect && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Detection Mode</label>
                  <Select value={detectionMode} onValueChange={(v) => handleDetectionModeChange(v as DetectionMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <div className="flex flex-col">
                          <span>Automatic</span>
                          <span className="text-xs text-muted-foreground">
                            Run skills automatically when detected
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ask">
                        <div className="flex flex-col">
                          <span>Ask First</span>
                          <span className="text-xs text-muted-foreground">
                            Ask before running detected skills
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="explicit">
                        <div className="flex flex-col">
                          <span>Explicit Only</span>
                          <span className="text-xs text-muted-foreground">
                            Only run when using /command syntax
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Skills list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Visible Skills</label>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/settings/skills")}
                    >
                      Browse all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetDefaults}
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {skills?.map((skill) => {
                  const Icon = iconMap[skill.icon] || Wand2;
                  const isEnabled = skillStates[skill.id] ?? skill.enabledByDefault;

                  return (
                    <div
                      key={skill.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                        isEnabled ? "bg-muted/30" : "opacity-60"
                      )}
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{skill.name}</span>
                          {skill.creditMultiplier > 1 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-xs">
                                    {skill.creditMultiplier}x credits
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  This skill uses {skill.creditMultiplier}x the normal credits
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {skill.description}
                        </p>
                        {skill.models && skill.models.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {skill.models.map((model) => (
                              <Badge
                                key={model}
                                variant="secondary"
                                className="text-xs"
                              >
                                {model.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(enabled) => handleSkillToggle(skill.id, enabled)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Command reference */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Quick Commands</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><code>/image</code> - Generate image</div>
                  <div><code>/video</code> - Generate video</div>
                  <div><code>/code</code> - Code assistant</div>
                  <div><code>/analyze</code> - Analyze document</div>
                  <div><code>/search</code> - Web search</div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Auto-save status */}
      {saveStatus !== "idle" && (
        <div className="border-t px-4 py-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-600">Saved</span>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
