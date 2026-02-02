import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Search,
  Wand2,
  Image,
  Video,
  Music,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";

export interface Skill {
  id: string;
  name: string;
  description?: string;
  type: string;
  priority?: number;
  isEnabled?: boolean;
}

interface SkillSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: Skill[];
  selectedSkillId: string;
  onSelect: (skillId: string) => void;
  mediaType: "image" | "video" | "audio";
  isLoading?: boolean;
}

export default function SkillSelectorDialog({
  open,
  onOpenChange,
  skills,
  selectedSkillId,
  onSelect,
  mediaType,
  isLoading,
}: SkillSelectorDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Get icon for skill type
  const getTypeIcon = (type: string) => {
    if (type.includes("image")) return <Image className="h-4 w-4" />;
    if (type.includes("video")) return <Video className="h-4 w-4" />;
    if (type.includes("audio")) return <Music className="h-4 w-4" />;
    return <Wand2 className="h-4 w-4" />;
  };

  // Get color for skill type
  const getTypeColor = (type: string) => {
    if (type.includes("image")) return "bg-purple-100 text-purple-700";
    if (type.includes("video")) return "bg-blue-100 text-blue-700";
    if (type.includes("audio")) return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-700";
  };

  // Map media type to skill types
  const typeMap: Record<string, string[]> = {
    image: ["image-generation", "prompt-enhancement"],
    video: ["video-generation", "prompt-enhancement"],
    audio: ["audio-generation", "sound-effects"],
  };
  const matchingTypes = typeMap[mediaType] || [];

  // Filter and sort skills
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description?.toLowerCase().includes(query) ||
          skill.type.toLowerCase().includes(query)
      );
    }

    // Sort: matching type first, then by priority
    return result.sort((a, b) => {
      const aMatches = matchingTypes.includes(a.type) ? 1 : 0;
      const bMatches = matchingTypes.includes(b.type) ? 1 : 0;
      if (aMatches !== bMatches) return bMatches - aMatches;
      return (b.priority || 0) - (a.priority || 0);
    });
  }, [skills, searchQuery, matchingTypes]);

  // Separate matching and other skills
  const matchingSkills = filteredSkills.filter((s) => matchingTypes.includes(s.type));
  const otherSkills = filteredSkills.filter((s) => !matchingTypes.includes(s.type));

  const handleSelect = (skillId: string) => {
    onSelect(skillId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Select Auto Prompt Skill
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {/* Recommended Skills (matching media type) */}
              {matchingSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Recommended for {mediaType}
                  </h4>
                  <div className="grid gap-2">
                    {matchingSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        isSelected={skill.id === selectedSkillId}
                        onSelect={() => handleSelect(skill.id)}
                        getTypeIcon={getTypeIcon}
                        getTypeColor={getTypeColor}
                        isRecommended
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Skills */}
              {otherSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Other Skills
                  </h4>
                  <div className="grid gap-2">
                    {otherSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        isSelected={skill.id === selectedSkillId}
                        onSelect={() => handleSelect(skill.id)}
                        getTypeIcon={getTypeIcon}
                        getTypeColor={getTypeColor}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No results */}
              {filteredSkills.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Wand2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No skills found</p>
                  {searchQuery && (
                    <p className="text-sm mt-1">
                      Try adjusting your search query
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Skill Card Component
interface SkillCardProps {
  skill: Skill;
  isSelected: boolean;
  onSelect: () => void;
  getTypeIcon: (type: string) => React.ReactNode;
  getTypeColor: (type: string) => string;
  isRecommended?: boolean;
}

function SkillCard({
  skill,
  isSelected,
  onSelect,
  getTypeIcon,
  getTypeColor,
  isRecommended,
}: SkillCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
        isSelected
          ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-200"
          : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            isSelected
              ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
              : "bg-gray-100 text-gray-600"
          )}
        >
          {getTypeIcon(skill.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{skill.name}</span>
            {isSelected && (
              <Badge className="bg-purple-500 text-white text-[10px] px-1.5 py-0">
                Selected
              </Badge>
            )}
            {isRecommended && !isSelected && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700">
                Recommended
              </Badge>
            )}
          </div>
          {skill.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {skill.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", getTypeColor(skill.type))}
            >
              {skill.type.replace("-", " ")}
            </Badge>
            {skill.priority !== undefined && skill.priority > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Priority: {skill.priority}
              </Badge>
            )}
          </div>
        </div>

        {/* Check indicator */}
        {isSelected && (
          <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}
