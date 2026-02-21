import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Wand2,
  Settings,
  Search,
  Loader2,
  Sparkles,
  Image,
  Video,
  Music,
  Code,
  FileText,
  Search as SearchIcon,
  Zap,
  LucideIcon,
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  image: Image,
  video: Video,
  music: Music,
  code: Code,
  'file-text': FileText,
  search: SearchIcon,
  zap: Zap,
  wand2: Wand2,
};

interface SkillSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (skillId: string, hasSchema: boolean) => void;
}

interface SkillWithSchema {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  priority: number;
  hasSchema: boolean;
}

export function SkillSelector({ open, onClose, onSelect }: SkillSelectorProps) {
  const [search, setSearch] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<Record<string, boolean>>({});

  // Fetch visible skills
  const { data: skillsData, isLoading: isLoadingSkills } = trpc.skills.getUserVisibleSkills.useQuery(
    { limit: 100 },
    { enabled: open }
  );

  const utils = trpc.useUtils();

  // Pre-fetch schema info for all skills
  useEffect(() => {
    if (!open || !skillsData?.skills) return;

    const checkSchemas = async () => {
      const status: Record<string, boolean> = {};

      for (const skill of skillsData.skills) {
        try {
          // Use slug instead of id for API call
          const result = await utils.skills.getInputSchema.fetch({ skillId: skill.slug });
          status[skill.slug] = result.hasSchema;
        } catch {
          status[skill.slug] = false;
        }
      }

      setSchemaStatus(status);
    };

    checkSchemas();
  }, [open, skillsData, utils]);

  // Filter and group skills
  const groupedSkills = useMemo(() => {
    if (!skillsData?.skills) return [];

    // Filter by search
    let skills = skillsData.skills.map((skill) => ({
      id: String(skill.id),
      slug: skill.slug,
      name: skill.name,
      description: skill.description || '',
      icon: skill.icon || 'sparkles',
      category: skill.category || 'Other',
      priority: skill.priority || 50,
      hasSchema: schemaStatus[skill.slug] || false,
    }));

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.description.toLowerCase().includes(searchLower)
      );
    }

    // Group by category
    const grouped = skills.reduce((acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = [];
      }
      acc[skill.category].push(skill);
      return acc;
    }, {} as Record<string, SkillWithSchema[]>);

    // Sort categories and skills within each category
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, skills]) => ({
        category,
        skills: skills.sort((a, b) => b.priority - a.priority),
      }));
  }, [skillsData, search, schemaStatus]);

  // Handle skill selection
  const handleSelect = useCallback(
    (skill: SkillWithSchema) => {
      // Use slug instead of id for API calls
      onSelect(skill.slug, skill.hasSchema);
      setSearch('');
      setSelectedSkillId(null);
    },
    [onSelect]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const allSkills = groupedSkills.flatMap((g) => g.skills);
      const currentIndex = selectedSkillId
        ? allSkills.findIndex((s) => s.slug === selectedSkillId)
        : -1;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < allSkills.length - 1) {
            setSelectedSkillId(allSkills[currentIndex + 1].slug);
          } else if (currentIndex === -1 && allSkills.length > 0) {
            setSelectedSkillId(allSkills[0].slug);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            setSelectedSkillId(allSkills[currentIndex - 1].slug);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedSkillId) {
            const skill = allSkills.find((s) => s.slug === selectedSkillId);
            if (skill) {
              handleSelect(skill);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, groupedSkills, selectedSkillId, handleSelect, onClose]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedSkillId(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Select a Skill
          </DialogTitle>
          <DialogDescription>
            Choose a skill to enhance your conversation
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Skills List */}
        <ScrollArea className="flex-1 px-6 min-h-0">
          {isLoadingSkills ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groupedSkills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? (
                <>
                  <p>No skills match &quot;{search}&quot;</p>
                  <p className="text-sm mt-1">Try a different search term</p>
                </>
              ) : (
                <p>No skills available</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {groupedSkills.map(({ category, skills }) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {skills.map((skill) => (
                      <SkillItem
                        key={skill.id}
                        skill={skill}
                        isSelected={selectedSkillId === skill.slug}
                        onClick={() => handleSelect(skill)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer Help */}
        <div className="px-6 py-3 border-t bg-muted/30 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border text-[10px]">Enter</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background rounded border text-[10px]">Esc</kbd>
              Close
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <Settings className="h-3 w-3" />
              Requires form input
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Skill Item Component
interface SkillItemProps {
  skill: SkillWithSchema;
  isSelected: boolean;
  onClick: () => void;
}

function SkillItem({ skill, isSelected, onClick }: SkillItemProps) {
  const Icon = iconMap[skill.icon] || Wand2;

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        'w-full justify-start h-auto py-3 px-3 gap-3',
        isSelected && 'bg-muted'
      )}
    >
      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{skill.name}</span>
          {skill.hasSchema && (
            <Settings className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1">
          {skill.description}
        </p>
      </div>
    </Button>
  );
}
