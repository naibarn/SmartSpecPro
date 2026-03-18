/**
 * Teams — list + detail view for virtual AI assistant teams.
 *
 * Left: team list with search/filter.
 * Right: selected team's room with TeamRoomView.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useRoute } from "wouter";
import { TeamRoomView } from "@/components/orchestrator/TeamRoomView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  UsersRound,
  Plus,
  Search,
  Loader2,
  Archive,
  MessageSquare,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateRoomState {
  teamId: string;
  goalPrompt: string;
  roomType: "team" | "auto_team" | "direct" | "job_review";
}

export default function Teams() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute("/teams/:teamId");
  const [search, setSearch] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [createRoomDialog, setCreateRoomDialog] = useState<CreateRoomState | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  // Handle URL deep-linking: /teams/:teamId
  useEffect(() => {
    if (routeParams?.teamId && !selectedTeamId) {
      setSelectedTeamId(routeParams.teamId);
    }
  }, [routeParams?.teamId]);

  // Fetch teams
  const { data: teamsData, isLoading: teamsLoading } = trpc.team.list.useQuery();
  const teams = teamsData ?? [];

  // Fetch rooms for selected team
  const { data: teamRooms } = trpc.teamRoom.listByTeam.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId },
  );

  // Create room mutation
  const createRoomMutation = trpc.teamRoom.create.useMutation({
    onSuccess: (data) => {
      setSelectedRoomId(data.id);
      setCreateRoomDialog(null);
      utils.teamRoom.listByTeam.invalidate({ teamId: selectedTeamId! });
    },
  });

  // Archive team mutation
  const archiveMutation = trpc.team.archive.useMutation({
    onSuccess: () => {
      setSelectedTeamId(null);
      setSelectedRoomId(null);
      utils.team.list.invalidate();
    },
  });

  const filteredTeams = teams.filter((t: any) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreateRoom = () => {
    if (!createRoomDialog || !createRoomDialog.goalPrompt.trim()) return;
    createRoomMutation.mutate({
      teamId: createRoomDialog.teamId,
      roomType: createRoomDialog.roomType,
      goalPrompt: createRoomDialog.goalPrompt,
    });
  };

  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId);

  if (authLoading) return null;

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div
        className={cn(
          "flex h-full flex-col border-r bg-background transition-all",
          sidebarOpen ? "w-80" : "w-0 overflow-hidden",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            <h2 className="font-semibold">Teams</h2>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Team list */}
        <ScrollArea className="flex-1">
          {teamsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {search ? "No teams found" : "No teams yet"}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 px-2 py-1">
              {filteredTeams.map((team: any) => (
                <button
                  key={team.id}
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setSelectedRoomId(null);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                    (team.id) === selectedTeamId && "bg-accent",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UsersRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{team.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {team.memberCount ?? 0} members · {team.roomCount ?? 0} rooms
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {sidebarOpen && window.innerWidth < 1024 && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {selectedTeam && (
            <div className="flex flex-1 items-center justify-between">
              <div>
                <h3 className="font-medium">{selectedTeam.name}</h3>
                <p className="text-xs text-muted-foreground">{selectedTeam.description ?? ""}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCreateRoomDialog({
                      teamId: selectedTeam.id,
                      goalPrompt: "",
                      roomType: "team",
                    })
                  }
                >
                  <MessageSquare className="mr-1 h-4 w-4" />
                  New Room
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => archiveMutation.mutate({ teamId: selectedTeam.id })}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {!selectedTeamId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <UsersRound className="h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">Select a team</p>
              <p className="text-sm">Choose a team from the sidebar to view rooms and conversations</p>
            </div>
          ) : selectedRoomId ? (
            <TeamRoomView roomId={selectedRoomId} teamName={selectedTeam?.name} />
          ) : (
            /* Team detail — show rooms */
            <div className="p-6">
              <h3 className="mb-4 text-lg font-medium">
                Rooms in {selectedTeam?.name ?? "Team"}
              </h3>
              {teamRooms && teamRooms.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teamRooms.map((room: any) => (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      className="flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          {room.roomType === "auto_team" ? "Auto Team" : room.roomType}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2 py-0.5 text-xs",
                            room.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600",
                          )}
                        >
                          {room.status ?? "active"}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {room.goalPrompt ?? "No objective set"}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 opacity-30" />
                  <p>No rooms yet</p>
                  <Button
                    onClick={() =>
                      setCreateRoomDialog({
                        teamId: selectedTeamId,
                        goalPrompt: "",
                        roomType: "team",
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Create First Room
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Room Dialog */}
      <Dialog open={!!createRoomDialog} onOpenChange={(open) => !open && setCreateRoomDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team Room</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Room Type</label>
              <Select
                value={createRoomDialog?.roomType ?? "team"}
                onValueChange={(v) =>
                  setCreateRoomDialog((prev) =>
                    prev ? { ...prev, roomType: v as CreateRoomState["roomType"] } : null,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team Chat</SelectItem>
                  <SelectItem value="auto_team">Auto Team</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="job_review">Job Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Objective / Goal</label>
              <Textarea
                placeholder="What should this team room work on?"
                value={createRoomDialog?.goalPrompt ?? ""}
                onChange={(e) =>
                  setCreateRoomDialog((prev) =>
                    prev ? { ...prev, goalPrompt: e.target.value } : null,
                  )
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoomDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRoom}
              disabled={!createRoomDialog?.goalPrompt.trim() || createRoomMutation.isPending}
            >
              {createRoomMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
