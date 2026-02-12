import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Globe,
  Loader2,
  Lock,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

type SortOption = "members" | "recent";

export default function GroupDiscovery() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("members");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: groups, isLoading } = trpc.groups.searchPublic.useQuery(
    {
      query: searchQuery || undefined,
      limit: 20,
      offset: page * 20,
    },
    { enabled: isAuthenticated },
  );

  const trpcUtils = trpc.useUtils();

  const joinMutation = trpc.groups.join.useMutation({
    onSuccess: () => {
      toast.success("Joined group successfully!");
      trpcUtils.groups.searchPublic.invalidate();
      trpcUtils.groups.list.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        toast.error("You are already a member of this group");
      } else {
        toast.error(error.message);
      }
    },
  });

  const requestJoinMutation = trpc.groups.requestJoin.useMutation({
    onSuccess: () => {
      toast.success("Join request sent! Waiting for admin approval.");
      trpcUtils.groups.searchPublic.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        toast.error("You already have a pending request for this group");
      } else {
        toast.error(error.message);
      }
    },
  });

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Client-side sort (API sorts by memberCount desc by default)
  const sortedGroups = groups
    ? [...groups].sort((a, b) => {
        if (sortBy === "recent") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return (b.memberCount ?? 0) - (a.memberCount ?? 0);
      })
    : [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2"
          onClick={() => setLocation("/groups")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Groups
        </Button>
        <div className="flex items-center gap-3">
          <Globe className="h-7 w-7 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Discover Public Groups</h1>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortOption)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="members">Most Members</SelectItem>
            <SelectItem value="recent">Recently Created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Groups Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No public groups found.{" "}
            {searchQuery && "Try a different search term."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedGroups.map((group) => {
              const settings = (group.settings ?? {}) as {
                joinPolicy?: string;
              };
              const policy = settings.joinPolicy ?? "invite_only";

              return (
                <Card key={group.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{group.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                      {group.description || "No description"}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {group.memberCount} members
                      </span>
                      <JoinAction
                        policy={policy}
                        groupId={group.id}
                        onJoin={() =>
                          joinMutation.mutate({ groupId: group.id })
                        }
                        onRequestJoin={() =>
                          requestJoinMutation.mutate({ groupId: group.id })
                        }
                        isPending={
                          joinMutation.isPending ||
                          requestJoinMutation.isPending
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {groups && groups.length === 20 && (
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JoinAction({
  policy,
  groupId,
  onJoin,
  onRequestJoin,
  isPending,
}: {
  policy: string;
  groupId: number;
  onJoin: () => void;
  onRequestJoin: () => void;
  isPending: boolean;
}) {
  switch (policy) {
    case "open":
      return (
        <Button size="sm" onClick={onJoin} disabled={isPending}>
          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Join
        </Button>
      );
    case "request_to_join":
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={onRequestJoin}
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Request Join
        </Button>
      );
    default:
      return (
        <Badge variant="secondary">
          <Lock className="mr-1 h-3 w-3" />
          Invite Only
        </Badge>
      );
  }
}
