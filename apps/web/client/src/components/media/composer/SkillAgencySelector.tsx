import { useEffect, useMemo, useState, type Dispatch } from "react";
import { Bot, Sparkles, AlertCircle } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgencyPickerModal } from "@/components/agency/AgencyPickerModal";
import { cn } from "@/lib/utils";
import type { ComposerAction } from "../composerReducer";

const COMPLEXITY_KEYWORDS = [
  "research",
  "compare",
  "analyze",
  "comprehensive",
  "multi-step",
  "in-depth",
  "detailed",
  "review",
  "versus",
  "vs",
  "pros and cons",
];

function isComplexTopic(topic: string): boolean {
  if (topic.length > 150) return true;
  const lower = topic.toLowerCase();
  return COMPLEXITY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface SkillAgencySelectorProps {
  executionSource: "skill" | "agency";
  skillId: string | null;
  agencyId: string | null;
  agencyName: string | null;
  topic: string;
  dispatch: Dispatch<ComposerAction>;
  className?: string;
}

export function SkillAgencySelector({
  executionSource,
  skillId,
  agencyId,
  agencyName,
  topic,
  dispatch,
  className,
}: SkillAgencySelectorProps) {
  const { user } = useAuth();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [agencyModalOpen, setAgencyModalOpen] = useState(false);
  const skillsQuery = trpc.skills.listFromDb.useQuery({ enabledOnly: true, limit: 100 });

  const filteredSkills = useMemo(
    () => (skillsQuery.data ?? []).filter((skill: any) => ["chat_assistant", "prompt_enhancement"].includes(String(skill.category ?? ""))),
    [skillsQuery.data],
  );

  useEffect(() => {
    if (executionSource !== "skill") return;
    if (skillId) return;
    if (skillsQuery.isLoading || filteredSkills.length === 0) return;
    dispatch({ type: "SET_SKILL", payload: String(filteredSkills[0].id) });
  }, [dispatch, executionSource, filteredSkills, skillId, skillsQuery.isLoading]);

  const showBanner = executionSource === "skill" && isComplexTopic(topic) && !bannerDismissed;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-cyan-600" />
          Execution Source
        </div>
        <RadioGroup
          value={executionSource}
          onValueChange={(value) => dispatch({ type: "SET_EXECUTION_SOURCE", payload: value as "skill" | "agency" })}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { value: "skill", label: "Skill" },
            { value: "agency", label: "Agency" },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-3 rounded-xl border p-3">
              <RadioGroupItem value={option.value} />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {executionSource === "skill" && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Article Skill</div>
          <Select
            value={skillId ?? ""}
            onValueChange={(value) => dispatch({ type: "SET_SKILL", payload: value || null })}
            disabled={skillsQuery.isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={skillsQuery.isLoading ? "Loading skills…" : "Choose a skill"} />
            </SelectTrigger>
            <SelectContent>
              {filteredSkills.map((skill: any) => (
                <SelectItem key={skill.id} value={String(skill.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{skill.name}</span>
                    {skill.category && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {skill.category}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {executionSource === "agency" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Agency</div>
            <Button variant="outline" size="sm" onClick={() => setAgencyModalOpen(true)}>
              <Bot className="mr-2 h-4 w-4" />
              {agencyId ? "Change Agency" : "Pick Agency"}
            </Button>
          </div>
          {agencyId ? (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-slate-900">{agencyName ?? agencyId}</div>
                <Badge variant="default" className="bg-cyan-600 text-white">Ready</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Selected agency will orchestrate the article generation in composer mode.
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No agency selected yet.</p>
          )}
        </div>
      )}

      {showBanner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700" />
              <div>
                <p className="font-medium text-amber-900">This topic looks complex.</p>
                <p className="text-amber-800">Consider switching to an agency before generating the article.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  dispatch({ type: "SET_EXECUTION_SOURCE", payload: "agency" });
                  setAgencyModalOpen(true);
                }}
              >
                Switch
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBannerDismissed(true)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <AgencyPickerModal
        open={agencyModalOpen}
        onClose={() => setAgencyModalOpen(false)}
        currentUserId={user?.id ?? null}
        requireRunnable
        onSelect={(agency) => {
          dispatch({ type: "SET_AGENCY", payload: { id: agency.id, name: agency.name } });
          setAgencyModalOpen(false);
        }}
      />
    </div>
  );
}
