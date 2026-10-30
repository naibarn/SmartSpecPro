import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

interface ConversationScopeBadgeProps {
  projectId?: string | null;
  projectTitle?: string | null;
  className?: string;
}

export function ConversationScopeBadge({
  projectId,
  projectTitle,
  className,
}: ConversationScopeBadgeProps) {
  const { t } = useScopedTranslation("chat");
  if (!projectId) {
    return null;
  }

  const isPersonal = projectId === "personal";

  return (
    <Badge
      variant={isPersonal ? "secondary" : "outline"}
      className={cn("gap-1 text-[10px] font-medium", className)}
      title={isPersonal ? t("sidebar.personalProject") : projectTitle || t("sidebar.projectLabel")}
    >
      {isPersonal ? <Lock className="h-3 w-3" /> : null}
      <span className="truncate">{isPersonal ? t("sidebar.personalProject") : projectTitle || t("sidebar.projectLabel")}</span>
    </Badge>
  );
}
