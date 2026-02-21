import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';

interface SkillCommandButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SkillCommandButton({ onClick, disabled }: SkillCommandButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onClick}
          disabled={disabled}
        >
          <Sparkles className="h-5 w-5" />
          <span className="sr-only">Use Skill</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Use Skill (Ctrl+K)</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default SkillCommandButton;
