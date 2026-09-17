import { useEffect, useMemo, type Dispatch } from "react";
import { Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ComposerAction } from "../composerReducer";

export interface SkillSelectorProps {
  skillId: string | null;
  dispatch: Dispatch<ComposerAction>;
  className?: string;
}

export function SkillSelector({
  skillId,
  dispatch,
  className,
}: SkillSelectorProps) {
  const skillsQuery = trpc.skills.listFromDb.useQuery({
    enabledOnly: true,
    limit: 100,
  });

  const filteredSkills = useMemo(
    () =>
      (skillsQuery.data ?? []).filter((skill: any) =>
        ["chat_assistant", "prompt_enhancement"].includes(
          String(skill.category ?? "")
        )
      ),
    [skillsQuery.data]
  );

  useEffect(() => {
    if (skillId) return;
    if (skillsQuery.isLoading || filteredSkills.length === 0) return;
    dispatch({ type: "SET_SKILL", payload: String(filteredSkills[0].id) });
  }, [dispatch, filteredSkills, skillId, skillsQuery.isLoading]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-cyan-600" />
          Article Skill
        </div>
        <div>
          <div className="text-sm font-medium">Article Skill</div>
          <Select
            value={skillId ?? ""}
            onValueChange={value =>
              dispatch({ type: "SET_SKILL", payload: value || null })
            }
            disabled={skillsQuery.isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  skillsQuery.isLoading ? "Loading skills…" : "Choose a skill"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {filteredSkills.map((skill: any) => (
                <SelectItem key={skill.id} value={String(skill.id)}>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate">{skill.name}</span>
                    {skill.category && (
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {skill.category}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
