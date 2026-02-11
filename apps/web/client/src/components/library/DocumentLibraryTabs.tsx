import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DocumentScopeTab } from "@/lib/documentManagementUi";

interface DocumentLibraryTabsProps {
  value: DocumentScopeTab;
  onChange: (value: DocumentScopeTab) => void;
}

export default function DocumentLibraryTabs({ value, onChange }: DocumentLibraryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as DocumentScopeTab)}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="my_library">My Library</TabsTrigger>
        <TabsTrigger value="shared_with_me">Shared With Me</TabsTrigger>
        <TabsTrigger value="shared_groups">Shared Groups</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
