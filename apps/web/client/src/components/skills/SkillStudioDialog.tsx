import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type SkillStudioMode = "create" | "improve";
type DesiredVisibility = "private" | "pending_approval" | "public";

export interface SkillStudioSkillOption {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  visibility?: string | null;
  isOwner?: boolean;
  hasLocalFolder?: boolean;
}

interface SkillStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "admin" | "user";
  availableSkills: SkillStudioSkillOption[];
  initialMode?: SkillStudioMode;
  initialTargetSkillId?: number | null;
  onCompleted?: () => void;
}

type TaskState =
  | null
  | { status: "running"; skillId: string; result: null }
  | { status: "done" | "not_found"; skillId: string; result: any };

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function SkillStudioDialog({
  open,
  onOpenChange,
  scope,
  availableSkills,
  initialMode = "create",
  initialTargetSkillId = null,
  onCompleted,
}: SkillStudioDialogProps) {
  const utils = trpc.useUtils();
  const isAdmin = scope === "admin";

  const [mode, setMode] = useState<SkillStudioMode>(initialMode);
  const [targetSkillId, setTargetSkillId] = useState<number | null>(initialTargetSkillId);
  const [newSkillSlug, setNewSkillSlug] = useState("");
  const [brief, setBrief] = useState("");
  const [specText, setSpecText] = useState("");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [cloneFromSkillId, setCloneFromSkillId] = useState<number | null>(null);
  const [referenceSkillIds, setReferenceSkillIds] = useState<number[]>([]);
  const [skillLanguage, setSkillLanguage] = useState<"auto" | "python" | "javascript">("auto");
  const [complexity, setComplexity] = useState<"simple" | "moderate" | "complex">("moderate");
  const [rounds, setRounds] = useState(3);
  const [allowTestExpansion, setAllowTestExpansion] = useState(false);
  const [autoApplyProposal, setAutoApplyProposal] = useState(false);
  const [desiredVisibility, setDesiredVisibility] = useState<DesiredVisibility>(isAdmin ? "public" : "private");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [gatewayMode, setGatewayMode] = useState<"system" | "custom">("system");
  const [llmModelSearch, setLlmModelSearch] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<TaskState>(null);

  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    enabled: open && gatewayMode === "system",
    staleTime: 5 * 60 * 1000,
  });

  const launchMutation = trpc.skills.launchStudioTask.useMutation({
    onError: (error) => {
      toast.error(error.message || "Failed to launch Skill Studio");
    },
  });

  const targetSkill = availableSkills.find((skill) => skill.id === targetSkillId) || null;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTargetSkillId(initialTargetSkillId);
    setNewSkillSlug("");
    setBrief("");
    setSpecText("");
    setSpecFile(null);
    setZipFile(null);
    setCloneFromSkillId(null);
    setReferenceSkillIds([]);
    setSkillLanguage("auto");
    setComplexity("moderate");
    setRounds(3);
    setAllowTestExpansion(false);
    setAutoApplyProposal(false);
    setDesiredVisibility(isAdmin ? "public" : "private");
    setReferenceSearch("");
    setGatewayMode("system");
    setLlmModelSearch("");
    setLlmBaseUrl("");
    setLlmModel("");
    setLlmApiKey("");
    setTaskId(null);
    setTaskState(null);
  }, [initialMode, initialTargetSkillId, isAdmin, open]);

  useEffect(() => {
    if (mode !== "improve" || isAdmin || !targetSkill) return;
    setDesiredVisibility(targetSkill.visibility === "private" ? "private" : "pending_approval");
  }, [isAdmin, mode, targetSkill]);

  useEffect(() => {
    if (!open || !taskId) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const next = await utils.chat.getSkillTaskResult.fetch({ taskId });
        if (cancelled) return;
        setTaskState(next as TaskState);
        if (next.status === "running") {
          timeoutId = window.setTimeout(poll, 3000);
          return;
        }
        onCompleted?.();
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to poll task");
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [open, onCompleted, taskId, utils.chat.getSkillTaskResult]);

  const ownedSkills = useMemo(
    () => availableSkills.filter((skill) => (isAdmin || skill.isOwner) && skill.hasLocalFolder),
    [availableSkills, isAdmin],
  );

  const filteredReferenceSkills = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();
    return availableSkills
      .filter((skill) => skill.id !== targetSkillId)
      .filter((skill) => !cloneFromSkillId || skill.id !== cloneFromSkillId)
      .filter((skill) => {
        if (!query) return true;
        return (
          skill.name.toLowerCase().includes(query) ||
          skill.slug.toLowerCase().includes(query) ||
          String(skill.description || "").toLowerCase().includes(query)
        );
      })
      .slice(0, 12);
  }, [availableSkills, cloneFromSkillId, referenceSearch, targetSkillId]);

  const canSubmit =
    brief.trim().length >= 10 &&
    (mode === "create" || !!targetSkillId) &&
    (gatewayMode === "system"
      ? !!llmModelSearch
      : !!llmBaseUrl.trim() && !!llmModel.trim() && !!llmApiKey.trim()) &&
    !launchMutation.isPending;

  async function handleSubmit() {
    try {
      const specFileContent = specFile ? await readFileAsText(specFile) : undefined;
      const zipBase64 = zipFile ? await readFileAsBase64(zipFile) : undefined;
      const result = await launchMutation.mutateAsync({
        mode,
        brief: brief.trim(),
        targetSkillId: mode === "improve" ? targetSkillId || undefined : undefined,
        newSkillSlug: mode === "create" && newSkillSlug.trim() ? newSkillSlug.trim() : undefined,
        skillLanguage: mode === "create" ? skillLanguage : undefined,
        complexity: mode === "create" ? complexity : undefined,
        rounds: mode === "improve" ? rounds : undefined,
        allowTestExpansion: mode === "improve" ? allowTestExpansion : undefined,
        desiredVisibility,
        autoApplyProposal: mode === "improve" && isAdmin ? autoApplyProposal : undefined,
        specText: specText.trim() || undefined,
        specFileName: specFile?.name,
        specFileContent,
        cloneFromSkillId: cloneFromSkillId || undefined,
        referenceSkillIds: referenceSkillIds.length > 0 ? referenceSkillIds : undefined,
        zipFileName: zipFile?.name,
        zipBase64,
        llmGatewayMode: gatewayMode,
        llmModelSearch: gatewayMode === "system" ? llmModelSearch || undefined : undefined,
        llmBaseUrl: gatewayMode === "custom" ? llmBaseUrl || undefined : undefined,
        llmModel: gatewayMode === "custom" ? llmModel || undefined : undefined,
        llmApiKey: gatewayMode === "custom" ? llmApiKey || undefined : undefined,
      });
      setTaskId(result.taskId);
      setTaskState({ status: "running", skillId: "intelligence-skill-creator", result: null });
      toast.success(mode === "create" ? "Skill Studio started" : "Improvement task started");
    } catch {
      // Handled by mutation callbacks
    }
  }

  function resetTaskState() {
    setTaskId(null);
    setTaskState(null);
  }

  function toggleReferenceSkill(skillId: number) {
    setReferenceSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId].slice(0, 4),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Skill Studio
          </DialogTitle>
          <DialogDescription>
            ใช้ Intelligence Skill Creator เพื่อสร้าง skill ใหม่ หรือปรับปรุง skill เดิมจาก brief, spec และ reference materials
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as SkillStudioMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create new skill</SelectItem>
                  <SelectItem value="improve">Improve existing skill</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "improve" && (
              <div className="space-y-2">
                <Label>Target skill</Label>
                <Select
                  value={targetSkillId ? String(targetSkillId) : undefined}
                  onValueChange={(value) => setTargetSkillId(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a skill to improve" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownedSkills.map((skill) => (
                      <SelectItem key={skill.id} value={String(skill.id)}>
                        {skill.name} ({skill.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="new-skill-slug">New skill slug (optional)</Label>
                <Input
                  id="new-skill-slug"
                  placeholder="my-new-skill"
                  value={newSkillSlug}
                  onChange={(event) => setNewSkillSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                />
              </div>
            )}
          </div>

          {mode === "create" && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={skillLanguage} onValueChange={(value) => setSkillLanguage(value as typeof skillLanguage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Complexity</Label>
                <Select value={complexity} onValueChange={(value) => setComplexity(value as typeof complexity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="complex">Complex</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Visibility after sync</Label>
                <Select value={desiredVisibility} onValueChange={(value) => setDesiredVisibility(value as DesiredVisibility)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    {!isAdmin && <SelectItem value="pending_approval">Submit for admin review</SelectItem>}
                    {isAdmin && <SelectItem value="public">Public now</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {mode === "improve" && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rounds">Improvement rounds</Label>
                <Input
                  id="rounds"
                  type="number"
                  min={1}
                  max={10}
                  value={rounds}
                  onChange={(event) => setRounds(Math.max(1, Math.min(10, Number(event.target.value) || 3)))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label className="block">Allow test expansion</Label>
                  <p className="text-xs text-muted-foreground">Let ISC extend tests when needed</p>
                </div>
                <Switch checked={allowTestExpansion} onCheckedChange={setAllowTestExpansion} />
              </div>
              {isAdmin ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <Label className="block">Auto-apply latest proposal</Label>
                    <p className="text-xs text-muted-foreground">Apply the newest ISC diff immediately after generation</p>
                  </div>
                  <Switch checked={autoApplyProposal} onCheckedChange={setAutoApplyProposal} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>After apply</Label>
                  <Select value={desiredVisibility} onValueChange={(value) => setDesiredVisibility(value as DesiredVisibility)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Keep private</SelectItem>
                      <SelectItem value="pending_approval">Submit to admin review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="brief">What do you want?</Label>
            <Textarea
              id="brief"
              rows={5}
              placeholder={
                mode === "create"
                  ? "Describe the skill, its inputs/outputs, business rules, and examples..."
                  : "Describe the improvements, new features, fixes, or updated behavior you want..."
              }
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-text">Inline spec (optional)</Label>
            <Textarea
              id="spec-text"
              rows={6}
              placeholder="Paste spec.md content or any structured requirements here..."
              value={specText}
              onChange={(event) => setSpecText(event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spec-file">Attach spec.md / text file</Label>
              <Input
                id="spec-file"
                type="file"
                accept=".md,.txt,.json"
                onChange={(event) => setSpecFile(event.target.files?.[0] || null)}
              />
              {specFile && <p className="text-xs text-muted-foreground">Selected: {specFile.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="zip-file">Attach reference skill ZIP</Label>
              <Input
                id="zip-file"
                type="file"
                accept=".zip"
                onChange={(event) => setZipFile(event.target.files?.[0] || null)}
              />
              {zipFile && <p className="text-xs text-muted-foreground">Selected: {zipFile.name}</p>}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Clone from existing skill</Label>
              <Select
                value={cloneFromSkillId ? String(cloneFromSkillId) : "__none__"}
                onValueChange={(value) => setCloneFromSkillId(value === "__none__" ? null : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional baseline skill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No clone baseline</SelectItem>
                  {availableSkills.map((skill) => (
                    <SelectItem key={skill.id} value={String(skill.id)}>
                      {skill.name} ({skill.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference-search">Reference skills</Label>
              <Input
                id="reference-search"
                placeholder="Search accessible skills..."
                value={referenceSearch}
                onChange={(event) => setReferenceSearch(event.target.value)}
              />
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-2">
                {filteredReferenceSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matching skills</p>
                ) : (
                  filteredReferenceSkills.map((skill) => (
                    <label key={skill.id} className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={referenceSkillIds.includes(skill.id)}
                        onCheckedChange={() => toggleReferenceSkill(skill.id)}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {skill.name} <span className="text-muted-foreground">({skill.slug})</span>
                        </div>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {referenceSkillIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {referenceSkillIds.map((id) => {
                    const skill = availableSkills.find((item) => item.id === id);
                    if (!skill) return null;
                    return (
                      <Badge key={id} variant="secondary">
                        {skill.slug}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>LLM gateway</Label>
              <Select value={gatewayMode} onValueChange={(value) => setGatewayMode(value as typeof gatewayMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System gateway</SelectItem>
                  <SelectItem value="custom">Custom endpoint</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {gatewayMode === "system" ? (
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={llmModelSearch} onValueChange={setLlmModelSearch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelsData?.models || []).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} ({model.providerDisplayName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="llm-base-url">Base URL</Label>
                  <Input
                    id="llm-base-url"
                    placeholder="https://api.openai.com/v1"
                    value={llmBaseUrl}
                    onChange={(event) => setLlmBaseUrl(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-model">Model</Label>
                  <Input
                    id="llm-model"
                    placeholder="gpt-4o / claude-sonnet-4-6"
                    value={llmModel}
                    onChange={(event) => setLlmModel(event.target.value)}
                  />
                </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="llm-api-key">API Key</Label>
                    <Input
                      id="llm-api-key"
                      type="password"
                      placeholder="sk-..."
                      value={llmApiKey}
                      onChange={(event) => setLlmApiKey(event.target.value)}
                    />
                  </div>
              </>
            )}
          </div>

          {taskState && (
            <div className="rounded-xl border bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {taskState.status === "running" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  ) : taskState.status === "done" && taskState.result?.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">
                    {taskState.status === "running"
                      ? "Skill Studio is running"
                      : taskState.status === "done" && taskState.result?.success
                        ? "Task completed"
                        : "Task ended with an issue"}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={resetTaskState}>
                  Clear
                </Button>
              </div>
              {taskId && <p className="text-xs text-muted-foreground">Task ID: {taskId}</p>}
              {targetSkill && mode === "improve" && (
                <p className="text-xs text-muted-foreground">Target: {targetSkill.name} ({targetSkill.slug})</p>
              )}
              <div className="rounded-lg bg-white p-3 text-sm whitespace-pre-wrap border">
                {taskState.status === "running"
                  ? "ISC is processing your request. This dialog will keep polling for the result."
                  : taskState.result?.message || taskState.result?.error || "No response returned."}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {launchMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Run Skill Studio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
