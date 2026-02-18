import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings, Edit2, X } from 'lucide-react';

interface SkillInputChipProps {
  skillName: string;
  fieldCount?: number;
  onRestore: () => void;
  onRemove: () => void;
}

export function SkillInputChip({
  skillName,
  fieldCount,
  onRestore,
  onRemove,
}: SkillInputChipProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm mb-3 animate-in fade-in slide-in-from-bottom-2">
      <Settings className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">{skillName}</span>
      {fieldCount !== undefined && (
        <span className="text-muted-foreground text-xs">
          ({fieldCount} fields)
        </span>
      )}
      <div className="flex items-center gap-0.5 ml-1 border-l border-primary/20 pl-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-primary/20"
          onClick={onRestore}
          title="Edit"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-destructive/20 text-destructive"
          onClick={onRemove}
          title="Remove"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default SkillInputChip;
