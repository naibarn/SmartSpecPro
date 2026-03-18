/**
 * CreationMenu — dropdown for creating new conversations.
 *
 * Options: New Chat, New Team Room, New Auto Session, New Inbox Task.
 */

import React from "react";
import type { ActiveThreadRef } from "@/lib/threadRef";

interface CreationMenuProps {
  onCreateChat: () => void;
  onCreateTeamRoom: (teamId: string) => void;
  className?: string;
}

export function CreationMenu({ onCreateChat, onCreateTeamRoom, className }: CreationMenuProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <button
        onClick={onCreateChat}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      >
        <span className="text-lg">💬</span>
        New Chat
      </button>
      <button
        onClick={() => onCreateTeamRoom("")}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      >
        <span className="text-lg">👥</span>
        New Team Room
      </button>
    </div>
  );
}
