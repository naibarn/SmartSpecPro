import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Globe, Loader2, Plus, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { DashboardCard } from "@/components/dashboard";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

type TabScope = "my_groups" | "member_of" | "public";

export default function GroupManagement() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<TabScope>("my_groups");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: myGroups, isLoading: myLoading } = trpc.groups.list.useQuery(
    { scope: "my_groups" },
    { enabled: isAuthenticated && selectedTab === "my_groups" },
  );

  const { data: memberOfGroups, isLoading: memberLoading } =
    trpc.groups.list.useQuery(
      { scope: "member_of" },
      { enabled: isAuthenticated && selectedTab === "member_of" },
    );

  const { data: publicGroups, isLoading: publicLoading } =
    trpc.groups.searchPublic.useQuery(
      { query: searchQuery || undefined, limit: 20 },
      { enabled: isAuthenticated && selectedTab === "public" },
    );

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function getActiveData() {
    switch (selectedTab) {
      case "my_groups":
        return { groups: myGroups, loading: myLoading };
      case "member_of":
        return { groups: memberOfGroups, loading: memberLoading };
      case "public":
        return { groups: publicGroups, loading: publicLoading };
    }
  }

  const { groups: currentGroups, loading: currentLoading } = getActiveData();

  function getEmptyMessage() {
    switch (selectedTab) {
      case "my_groups":
        return "You haven't created any groups yet. Create your first group to get started.";
      case "member_of":
        return "You're not a member of any groups yet. Join public groups or wait for an invitation.";
      case "public":
        return "No public groups found. Try a different search term.";
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Groups</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage & discover groups
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/groups/discover")}
              >
                <Globe className="mr-1 h-4 w-4" />
                Discover
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Create Group
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <Tabs
          value={selectedTab}
          onValueChange={(v) => setSelectedTab(v as TabScope)}
        >
          <TabsList>
            <TabsTrigger value="my_groups">My Groups</TabsTrigger>
            <TabsTrigger value="member_of">Member Of</TabsTrigger>
            <TabsTrigger value="public">Public Groups</TabsTrigger>
          </TabsList>

          {selectedTab === "public" && (
            <div className="mt-4 max-w-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search public groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          <TabsContent value={selectedTab} className="mt-4">
            {currentLoading ? (
              <GroupGridSkeleton />
            ) : !currentGroups || currentGroups.length === 0 ? (
              <EmptyState message={getEmptyMessage()} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {currentGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onClick={() => setLocation(`/groups/${group.id}`)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <CreateGroupDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

interface GroupCardGroup {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  settings?: unknown;
}

function GroupCard({
  group,
  onClick,
}: {
  group: GroupCardGroup;
  onClick: () => void;
}) {
  const settings = (group.settings ?? {}) as {
    visibility?: string;
    joinPolicy?: string;
  };

  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <DashboardCard
        className="h-full cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
        title={
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{group.name}</span>
          </span>
        }
        description={group.description || "No description"}
        trailing={
          settings.visibility === "public" ? (
            <Badge variant="secondary" className="text-xs">
              Public
            </Badge>
          ) : null
        }
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{group.memberCount} members</span>
        </div>
      </DashboardCard>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
      <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function GroupGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <DashboardCard key={i} title={<Skeleton className="h-5 w-32" />}>
          <Skeleton className="mb-3 h-4 w-full" />
          <Skeleton className="h-3 w-20" />
        </DashboardCard>
      ))}
    </div>
  );
}
