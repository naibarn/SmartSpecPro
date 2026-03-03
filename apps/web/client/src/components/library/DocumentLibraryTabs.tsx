import type { ComponentType } from "react";
import { Cloud, FolderOpen, Share2, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentScopeTab } from "@/lib/documentManagementUi";

interface DocumentLibraryTabsProps {
  value: DocumentScopeTab;
  onChange: (value: DocumentScopeTab) => void;
}

interface TabDef {
  value: DocumentScopeTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  activeClass: string;
  baseClass?: string;
}

const TABS: TabDef[] = [
  {
    value: "my_library",
    label: "My Library",
    icon: FolderOpen,
    activeClass: "border-sky-300 bg-sky-50 text-sky-800 shadow-sm",
  },
  {
    value: "my_drive",
    label: "My Drive",
    icon: Cloud,
    activeClass: "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm",
  },
  {
    value: "my_onedrive",
    label: "OneDrive",
    icon: Cloud,
    activeClass: "border-blue-300 bg-blue-50 text-blue-800 shadow-sm",
  },
  {
    value: "shared_with_me",
    label: "Shared With Me",
    icon: Share2,
    activeClass: "border-teal-300 bg-teal-50 text-teal-800 shadow-sm",
  },
  {
    value: "shared_groups",
    label: "My Group",
    icon: Users,
    activeClass: "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm",
  },
  {
    value: "trash",
    label: "Trash",
    icon: Trash2,
    activeClass: "border-red-300 bg-red-50 text-red-700 shadow-sm",
    baseClass: "hover:border-red-300 hover:bg-red-50 hover:text-red-700",
  },
];

export default function DocumentLibraryTabs({ value, onChange }: DocumentLibraryTabsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-medium transition-colors",
                "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100",
                tab.baseClass,
                isActive && tab.activeClass,
              )}
            >
              <Icon className="mr-1 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
