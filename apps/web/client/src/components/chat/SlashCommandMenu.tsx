/**
 * SlashCommandMenu - Autocomplete popup for "/" skill commands in chat input
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sparkles, Wand2, Video, Code2, FileText, Globe, BarChart3, Languages, Bot, Zap, Settings2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  wand2: Wand2,
  sparkles: Sparkles,
  video: Video,
  code2: Code2,
  "file-text": FileText,
  globe: Globe,
  "bar-chart-3": BarChart3,
  languages: Languages,
  bot: Bot,
  zap: Zap,
  settings2: Settings2,
};

interface SlashCommandMenuProps {
  filter: string;
  onSelect: (slug: string, name: string) => void;
  onClose: () => void;
  visible: boolean;
}

export function SlashCommandMenu({ filter, onSelect, onClose, visible }: SlashCommandMenuProps) {
  const { data: commands } = trpc.chat.getSlashCommands.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache 5 min
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = commands?.filter((cmd) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      cmd.slug.toLowerCase().includes(q) ||
      cmd.name.toLowerCase().includes(q) ||
      (cmd.description ?? "").toLowerCase().includes(q)
    );
  }) ?? [];

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector("[data-active='true']");
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard handler (attached by parent via onKeyDown forwarding)
  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[selectedIndex]) {
          e.preventDefault();
          onSelect(filtered[selectedIndex].slug, filtered[selectedIndex].name);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [visible, filtered, selectedIndex, onSelect, onClose]);

  const publicSkills = filtered.filter((cmd) => cmd.visibleByDefault !== false);
  const mySkills = filtered.filter((cmd) => cmd.visibleByDefault === false);

  if (!visible || filtered.length === 0) return null;

  const renderItem = (cmd: (typeof filtered)[0], i: number, globalIndex: number) => {
    const Icon = iconMap[cmd.icon ?? "sparkles"] || Sparkles;
    return (
      <button
        key={cmd.slug}
        data-active={globalIndex === selectedIndex}
        className={cn(
          "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors",
          globalIndex === selectedIndex
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        onClick={() => onSelect(cmd.slug, cmd.name)}
        onMouseEnter={() => setSelectedIndex(globalIndex)}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">/{cmd.slug}</span>
          <span className="text-xs text-muted-foreground ml-2 truncate">
            {cmd.name}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-lg border bg-popover shadow-lg z-50"
    >
      <div className="p-1">
        {mySkills.length > 0 && (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              My Skills ({mySkills.length})
            </div>
            {mySkills.map((cmd, i) => renderItem(cmd, i, i))}
            {publicSkills.length > 0 && (
              <div className="my-1 border-t" />
            )}
          </>
        )}
        {publicSkills.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Skills ({publicSkills.length})
            </div>
            {publicSkills.map((cmd, i) =>
              renderItem(cmd, i, mySkills.length + i)
            )}
          </>
        )}
      </div>
    </div>
  );
}
