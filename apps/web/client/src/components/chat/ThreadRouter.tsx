/**
 * ThreadRouter — routes to the correct view based on ActiveThreadRef kind.
 *
 * Renders ChatView for chat threads, TeamRoomView for team rooms,
 * and placeholder views for other thread types.
 */

import React from "react";
import type { ActiveThreadRef } from "@/lib/threadRef";
import { TeamRoomView } from "@/components/orchestrator/TeamRoomView";

interface ThreadRouterProps {
  activeThread: ActiveThreadRef | null;
}

export function ThreadRouter({ activeThread }: ThreadRouterProps) {
  if (!activeThread) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Select a conversation or create a new one
      </div>
    );
  }

  switch (activeThread.kind) {
    case "chat":
      // Existing ChatView handles this case
      return null; // Parent component renders ChatView when kind === "chat"

    case "team_room":
      return <TeamRoomView roomId={activeThread.id} />;

    case "agency_conversation":
      return null; // Existing AgencyChat handles this

    case "external_inbox_task":
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <h3 className="text-lg font-medium">Inbox Task</h3>
          <p className="text-sm">Task ID: {activeThread.id}</p>
        </div>
      );

    default:
      return null;
  }
}
