import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Share2, Users } from "lucide-react";
import type { DocumentScopeTab } from "@/lib/documentManagementUi";

interface DocumentLibraryTabsProps {
  value: DocumentScopeTab;
  onChange: (value: DocumentScopeTab) => void;
}

export default function DocumentLibraryTabs({ value, onChange }: DocumentLibraryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as DocumentScopeTab)}>
      <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <TabsTrigger
          value="my_library"
          className="rounded-xl text-[13px] font-medium text-slate-700 data-[state=active]:border data-[state=active]:border-sky-200 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700 data-[state=active]:shadow-sm"
        >
          <FolderOpen className="mr-1.5 h-4 w-4" />
          My Library
        </TabsTrigger>
        <TabsTrigger
          value="shared_with_me"
          className="rounded-xl text-[13px] font-medium text-slate-700 data-[state=active]:border data-[state=active]:border-teal-200 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-sm"
        >
          <Share2 className="mr-1.5 h-4 w-4" />
          Shared With Me
        </TabsTrigger>
        <TabsTrigger
          value="shared_groups"
          className="rounded-xl text-[13px] font-medium text-slate-700 data-[state=active]:border data-[state=active]:border-indigo-200 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
        >
          <Users className="mr-1.5 h-4 w-4" />
          My Group
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
