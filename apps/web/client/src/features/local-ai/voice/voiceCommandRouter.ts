import {
  VOICE_DRAFT_MESSAGE_ACTIONS,
  VOICE_MARK_NOTIFICATIONS_READ_ACTIONS,
  VOICE_NAVIGATION_ACTIONS,
  VOICE_OPEN_TEAM_ROOM_ACTIONS,
  VOICE_READ_NOTIFICATIONS_ACTIONS,
  VOICE_SUBMIT_CHAT_ACTIONS,
} from "./voiceActionRegistry";

type AllowlistedPath = "/chat" | "/teams" | "/notifications";

export type ClientVoiceCommandResult =
  | {
      type: "navigate";
      path: AllowlistedPath;
      originalText: string;
    }
  | {
      type: "open_team_room";
      teamQuery: string | null;
      roomQuery: string | null;
      originalText: string;
    }
  | {
      type: "read_notifications";
      originalText: string;
      unreadOnly: boolean;
      urgentOnly: boolean;
    }
  | {
      type: "mark_notifications_read";
      originalText: string;
      requiresConfirmation: true;
    }
  | {
      type: "draft_message";
      text: string;
      targetLabel: string | null;
      originalText: string;
      requiresConfirmation: boolean;
    }
  | {
      type: "submit_chat";
      text: string;
      originalText: string;
      useLocation: boolean;
      requiresConfirmation: boolean;
      actionLabel: string;
    }
  | {
      type: "chat_text";
      text: string;
    };

function extractTeamRoomQuery(text: string): {
  teamQuery: string | null;
  roomQuery: string | null;
} | null {
  const trimmed = text.trim();

  const englishRoomFirst =
    trimmed.match(
      /\b(?:open|go to)\s+(?:team\s+)?room\s+(.+?)\s+(?:in|for)\s+team\s+(.+)$/i
    ) ?? trimmed.match(/\b(?:open|go to)\s+room\s+(.+?)\s+in\s+(.+)$/i);
  if (englishRoomFirst) {
    return {
      roomQuery: englishRoomFirst[1].trim(),
      teamQuery: englishRoomFirst[2].trim(),
    };
  }

  const englishTeamFirst = trimmed.match(
    /\b(?:open|go to)\s+team\s+(.+?)\s+room\s+(.+)$/i
  );
  if (englishTeamFirst) {
    return {
      teamQuery: englishTeamFirst[1].trim(),
      roomQuery: englishTeamFirst[2].trim(),
    };
  }

  const thaiTeamAndRoom = trimmed.match(
    /เปิด(?:ห้อง(?:ทีม)?)\s*(.+?)\s*(?:ของทีม|ในทีม)\s*(.+)$/i
  );
  if (thaiTeamAndRoom) {
    return {
      roomQuery: thaiTeamAndRoom[1].trim(),
      teamQuery: thaiTeamAndRoom[2].trim(),
    };
  }

  const thaiTeamOnly = trimmed.match(/เปิด(?:ห้อง(?:ทีม)?|ทีม)\s*(.+)$/i);
  if (thaiTeamOnly) {
    return {
      teamQuery: null,
      roomQuery: thaiTeamOnly[1].trim(),
    };
  }

  return null;
}

function extractDraftMessageTarget(text: string): string | null {
  const trimmed = text.trim();
  const englishMatch = trimmed.match(
    /\b(?:draft|write|compose)\s+(?:a\s+)?message\s+(?:to|for)\s+(.+)$/i
  );
  if (englishMatch) {
    return englishMatch[1].trim();
  }
  const thaiMatch = trimmed.match(
    /(?:ร่าง|เขียน|ฝาก)ข้อความ(?:ถึง|หา)\s*(.+)$/i
  );
  if (thaiMatch) {
    return thaiMatch[1].trim();
  }
  return null;
}

export function routeVoiceCommand(text: string): ClientVoiceCommandResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      type: "chat_text",
      text: "",
    };
  }

  const readNotificationsAction = VOICE_READ_NOTIFICATIONS_ACTIONS.find(
    candidate => candidate.patterns.some(pattern => pattern.test(trimmed))
  );
  if (readNotificationsAction) {
    return {
      type: "read_notifications",
      originalText: trimmed,
      unreadOnly: /\bunread\b|ยังไม่ได้อ่าน/i.test(trimmed),
      urgentOnly: /\burgent\b|important\b|ด่วน|สำคัญ/i.test(trimmed),
    };
  }

  const markNotificationsReadAction =
    VOICE_MARK_NOTIFICATIONS_READ_ACTIONS.find(candidate =>
      candidate.patterns.some(pattern => pattern.test(trimmed))
    );
  if (markNotificationsReadAction) {
    return {
      type: "mark_notifications_read",
      originalText: trimmed,
      requiresConfirmation: true,
    };
  }

  const action = VOICE_NAVIGATION_ACTIONS.find(candidate =>
    candidate.patterns.some(pattern => pattern.test(trimmed))
  );
  if (action) {
    return {
      type: "navigate",
      path: action.path,
      originalText: trimmed,
    };
  }

  const openTeamRoomAction = VOICE_OPEN_TEAM_ROOM_ACTIONS.find(candidate =>
    candidate.patterns.some(pattern => pattern.test(trimmed))
  );
  if (openTeamRoomAction) {
    const extracted = extractTeamRoomQuery(trimmed);
    if (extracted) {
      return {
        type: "open_team_room",
        teamQuery: extracted.teamQuery,
        roomQuery: extracted.roomQuery,
        originalText: trimmed,
      };
    }
  }

  const draftMessageAction = VOICE_DRAFT_MESSAGE_ACTIONS.find(candidate =>
    candidate.patterns.some(pattern => pattern.test(trimmed))
  );
  if (draftMessageAction) {
    return {
      type: "draft_message",
      text: trimmed,
      targetLabel: extractDraftMessageTarget(trimmed),
      originalText: trimmed,
      requiresConfirmation: true,
    };
  }

  const submitChatAction = VOICE_SUBMIT_CHAT_ACTIONS.find(candidate =>
    candidate.patterns.some(pattern => pattern.test(trimmed))
  );
  if (submitChatAction) {
    return {
      type: "submit_chat",
      text: trimmed,
      originalText: trimmed,
      useLocation: submitChatAction.useLocation === true,
      requiresConfirmation: submitChatAction.requiresConfirmation === true,
      actionLabel: submitChatAction.label,
    };
  }

  return {
    type: "chat_text",
    text: trimmed,
  };
}
