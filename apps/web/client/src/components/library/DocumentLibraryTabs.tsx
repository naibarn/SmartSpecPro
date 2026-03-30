import type { ComponentType } from "react";
import { Cloud, FolderOpen, Lock, Share2, Trash2, Users } from "lucide-react";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";
import type { DocumentScopeTab } from "@/lib/documentManagementUi";

interface DocumentLibraryTabsProps {
  value: DocumentScopeTab;
  onChange: (value: DocumentScopeTab) => void;
}

interface TabDef {
  value: DocumentScopeTab;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  activeClass: string;
  baseClass?: string;
}

const TABS: TabDef[] = [
  {
    value: "my_library",
    labelKey: "documentManagement.scope.myLibrary",
    icon: FolderOpen,
    activeClass: "border-sky-300 bg-sky-50 text-sky-800 shadow-sm",
  },
  {
    value: "private_vault",
    labelKey: "documentManagement.scope.privateFiles",
    icon: Lock,
    activeClass: "border-amber-300 bg-amber-50 text-amber-800 shadow-sm",
  },
  {
    value: "my_drive",
    labelKey: "documentManagement.scope.myDrive",
    icon: Cloud,
    activeClass: "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm",
  },
  {
    value: "my_onedrive",
    labelKey: "documentManagement.scope.oneDrive",
    icon: Cloud,
    activeClass: "border-blue-300 bg-blue-50 text-blue-800 shadow-sm",
  },
  {
    value: "shared_with_me",
    labelKey: "documentManagement.scope.sharedWithMe",
    icon: Share2,
    activeClass: "border-teal-300 bg-teal-50 text-teal-800 shadow-sm",
  },
  {
    value: "shared_groups",
    labelKey: "documentManagement.scope.myGroup",
    icon: Users,
    activeClass: "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm",
  },
  {
    value: "trash",
    labelKey: "documentManagement.scope.trash",
    icon: Trash2,
    activeClass: "border-red-300 bg-red-50 text-red-700 shadow-sm",
    baseClass: "hover:border-red-300 hover:bg-red-50 hover:text-red-700",
  },
];

export default function DocumentLibraryTabs({
  value,
  onChange,
}: DocumentLibraryTabsProps) {
  const { t } = useScopedTranslation("common");

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/75 p-1.5 shadow-sm">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100",
                tab.baseClass,
                isActive && tab.activeClass
              )}
            >
              <Icon className="mr-1 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
