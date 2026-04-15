import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConversationScopeBadgeProps {
  projectId?: string | null;
  className?: string;
}

export function ConversationScopeBadge({
  projectId,
  className,
}: ConversationScopeBadgeProps) {
  if (!projectId) {
    return null;
  }

  const isPersonal = projectId === "personal";

  return (
    <Badge
      variant={isPersonal ? "secondary" : "outline"}
      className={cn("gap-1 text-[10px] font-medium", className)}
      title={isPersonal ? "Personal scope is locked to this user" : projectId}
    >
      {isPersonal ? <Lock className="h-3 w-3" /> : null}
      <span className="truncate">{isPersonal ? "Personal" : projectId}</span>
    </Badge>
  );
}
