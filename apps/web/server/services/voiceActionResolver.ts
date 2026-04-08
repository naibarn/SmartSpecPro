type AllowlistedPath = "/chat" | "/teams" | "/notifications";

export type VoiceActionIntent =
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
      requiresConfirmation: true;
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

const READ_NOTIFICATIONS_PATTERNS: RegExp[] = [
  /\b(read|summarize)\s+(?:my\s+)?notifications\b/i,
  /\bwhat\s+are\s+my\s+notifications\b/i,
  /\b(read|summarize)\s+(?:my\s+)?unread\s+notifications\b/i,
  /อ่านข้อความเตือน(?:ให้ที)?/i,
  /อ่านแจ้งเตือน(?:ให้ที)?/i,
  /สรุปแจ้งเตือน(?:ให้ที)?/i,
  /อ่านแจ้งเตือนที่ยังไม่ได้อ่าน/i,
];

const MARK_NOTIFICATIONS_READ_PATTERNS: RegExp[] = [
  /\bmark\s+(?:all\s+)?notifications\s+as\s+read\b/i,
  /\bclear\s+(?:my\s+)?notifications\b/i,
  /อ่านแจ้งเตือนทั้งหมดแล้ว/i,
  /ทำเครื่องหมายแจ้งเตือนว่าอ่านแล้ว/i,
  /เคลียร์แจ้งเตือนทั้งหมด/i,
];

const NAVIGATION_PATTERNS: Array<{
  path: AllowlistedPath;
  pattern: RegExp;
}> = [
  {
    path: "/chat",
    pattern: /\b(open|go to)\s+chat\b|เปิดหน้า\s*chat/i,
  },
  {
    path: "/teams",
    pattern: /\b(open|go to)\s+teams\b|เปิดหน้า\s*teams/i,
  },
  {
    path: "/notifications",
    pattern: /\b(open|go to)\s+notifications\b|เปิดหน้า\s*notifications/i,
  },
];

const OPEN_TEAM_ROOM_PATTERNS: RegExp[] = [
  /\bopen\s+(?:team\s+)?room\b/i,
  /\bgo\s+to\s+(?:team\s+)?room\b/i,
  /เปิดห้อง(?:ทีม)?/i,
  /ไปที่ห้อง(?:ทีม)?/i,
];

const DRAFT_MESSAGE_PATTERNS: RegExp[] = [
  /^\s*(?:draft|write|compose)\s+(?:a\s+)?message\b/i,
  /^\s*(?:ร่าง|เขียน)\s*ข้อความ\b/i,
  /^\s*ฝากข้อความ\b/i,
];

const SUBMIT_CHAT_PATTERNS: Array<{
  label: string;
  useLocation: boolean;
  requiresConfirmation: boolean;
  patterns: RegExp[];
}> = [
  {
    label: "Submit Search With Location Context",
    useLocation: true,
    requiresConfirmation: true,
    patterns: [
      /^(search|find|recommend|suggest).*\b(near me|nearby|around here|around me)\b/i,
      /^(ค้นหา|หา|แนะนำ).*(แถวนี้|ใกล้ฉัน|ใกล้แถวนี้|ละแวกนี้)/i,
    ],
  },
  {
    label: "Submit Reminder Or Schedule",
    useLocation: false,
    requiresConfirmation: true,
    patterns: [
      /^(remind me|schedule|set a reminder|create a reminder)\b/i,
      /^(เตือน|ตั้งเตือน|สร้างเตือน|ตั้งเวลา|schedule)\b/i,
    ],
  },
  {
    label: "Submit Search Or Recommendation",
    useLocation: false,
    requiresConfirmation: false,
    patterns: [
      /^(search|find|look up|recommend|suggest)\b/i,
      /^(ค้นหา|หา|แนะนำ)\b/i,
    ],
  },
  {
    label: "Submit Creation Or Writing Request",
    useLocation: false,
    requiresConfirmation: false,
    patterns: [
      /^(create|generate|draft|write|summarize|explain|analyze)\b/i,
      /^(สร้างภาพ|สร้าง|เขียน|ร่าง|สรุป|อธิบาย|วิเคราะห์)\b/i,
    ],
  },
];

function extractTeamRoomQuery(text: string): {
  teamQuery: string | null;
  roomQuery: string | null;
} | null {
  const trimmed = text.trim();
  const englishRoomFirst =
    trimmed.match(
      /\b(?:open|go to)\s+(?:team\s+)?room\s+(.+?)\s+(?:in|for)\s+team\s+(.+)$/i,
    ) ??
    trimmed.match(/\b(?:open|go to)\s+room\s+(.+?)\s+in\s+(.+)$/i);
  if (englishRoomFirst) {
    return {
      roomQuery: englishRoomFirst[1].trim(),
      teamQuery: englishRoomFirst[2].trim(),
    };
  }

  const englishTeamFirst = trimmed.match(
    /\b(?:open|go to)\s+team\s+(.+?)\s+room\s+(.+)$/i,
  );
  if (englishTeamFirst) {
    return {
      teamQuery: englishTeamFirst[1].trim(),
      roomQuery: englishTeamFirst[2].trim(),
    };
  }

  const thaiTeamAndRoom = trimmed.match(
    /เปิด(?:ห้อง(?:ทีม)?)\s*(.+?)\s*(?:ของทีม|ในทีม)\s*(.+)$/i,
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
    /\b(?:draft|write|compose)\s+(?:a\s+)?message\s+(?:to|for)\s+(.+)$/i,
  );
  if (englishMatch) {
    return englishMatch[1].trim();
  }
  const thaiMatch = trimmed.match(/(?:ร่าง|เขียน|ฝาก)ข้อความ(?:ถึง|หา)\s*(.+)$/i);
  if (thaiMatch) {
    return thaiMatch[1].trim();
  }
  return null;
}

export function resolveVoiceActionIntent(text: string): VoiceActionIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      type: "chat_text",
      text: "",
    };
  }

  if (READ_NOTIFICATIONS_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      type: "read_notifications",
      originalText: trimmed,
      unreadOnly: /\bunread\b|ยังไม่ได้อ่าน/i.test(trimmed),
      urgentOnly: /\burgent\b|important\b|ด่วน|สำคัญ/i.test(trimmed),
    };
  }

  if (MARK_NOTIFICATIONS_READ_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      type: "mark_notifications_read",
      originalText: trimmed,
      requiresConfirmation: true,
    };
  }

  const navigation = NAVIGATION_PATTERNS.find((candidate) =>
    candidate.pattern.test(trimmed),
  );
  if (navigation) {
    return {
      type: "navigate",
      path: navigation.path,
      originalText: trimmed,
    };
  }

  if (OPEN_TEAM_ROOM_PATTERNS.some((pattern) => pattern.test(trimmed))) {
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

  if (DRAFT_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      type: "draft_message",
      text: trimmed,
      targetLabel: extractDraftMessageTarget(trimmed),
      originalText: trimmed,
      requiresConfirmation: true,
    };
  }

  const submitAction = SUBMIT_CHAT_PATTERNS.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(trimmed)),
  );
  if (submitAction) {
    return {
      type: "submit_chat",
      text: trimmed,
      originalText: trimmed,
      useLocation: submitAction.useLocation,
      requiresConfirmation: submitAction.requiresConfirmation,
      actionLabel: submitAction.label,
    };
  }

  return {
    type: "chat_text",
    text: trimmed,
  };
}
