export interface VoiceNavigationAction {
  kind: "navigate";
  path: "/chat" | "/teams" | "/notifications";
  label: string;
  patterns: RegExp[];
}

export interface VoiceReadNotificationsAction {
  kind: "read_notifications";
  label: string;
  patterns: RegExp[];
}

export interface VoiceMarkNotificationsReadAction {
  kind: "mark_notifications_read";
  label: string;
  patterns: RegExp[];
}

export interface VoiceSubmitChatAction {
  kind: "submit_chat";
  label: string;
  patterns: RegExp[];
  useLocation?: boolean;
  requiresConfirmation?: boolean;
}

export interface VoiceDraftMessageAction {
  kind: "draft_message";
  label: string;
  patterns: RegExp[];
}

export interface VoiceOpenTeamRoomAction {
  kind: "open_team_room";
  label: string;
  patterns: RegExp[];
}

export const VOICE_NAVIGATION_ACTIONS: VoiceNavigationAction[] = [
  {
    kind: "navigate",
    path: "/chat",
    label: "Open Chat",
    patterns: [/\b(open|go to)\s+chat\b/i, /เปิดหน้า\s*chat/i],
  },
  {
    kind: "navigate",
    path: "/teams",
    label: "Open Teams",
    patterns: [/\b(open|go to)\s+teams\b/i, /เปิดหน้า\s*teams/i],
  },
  {
    kind: "navigate",
    path: "/notifications",
    label: "Open Notifications",
    patterns: [
      /\b(open|go to)\s+notifications\b/i,
      /เปิดหน้า\s*notifications/i,
    ],
  },
];

export const VOICE_OPEN_TEAM_ROOM_ACTIONS: VoiceOpenTeamRoomAction[] = [
  {
    kind: "open_team_room",
    label: "Open Specific Team Room",
    patterns: [
      /\bopen\s+(?:team\s+)?room\b/i,
      /\bgo\s+to\s+(?:team\s+)?room\b/i,
      /เปิดห้อง(?:ทีม)?/i,
      /ไปที่ห้อง(?:ทีม)?/i,
    ],
  },
];

export const VOICE_READ_NOTIFICATIONS_ACTIONS: VoiceReadNotificationsAction[] =
  [
    {
      kind: "read_notifications",
      label: "Read Notifications",
      patterns: [
        /\b(read|summarize)\s+(?:my\s+)?notifications\b/i,
        /\bwhat\s+are\s+my\s+notifications\b/i,
        /\b(read|summarize)\s+(?:my\s+)?unread\s+notifications\b/i,
        /อ่านข้อความเตือน(?:ให้ที)?/i,
        /อ่านแจ้งเตือน(?:ให้ที)?/i,
        /สรุปแจ้งเตือน(?:ให้ที)?/i,
        /อ่านแจ้งเตือนที่ยังไม่ได้อ่าน/i,
      ],
    },
  ];

export const VOICE_MARK_NOTIFICATIONS_READ_ACTIONS: VoiceMarkNotificationsReadAction[] =
  [
    {
      kind: "mark_notifications_read",
      label: "Mark Notifications Read",
      patterns: [
        /\bmark\s+(?:all\s+)?notifications\s+as\s+read\b/i,
        /\bclear\s+(?:my\s+)?notifications\b/i,
        /อ่านแจ้งเตือนทั้งหมดแล้ว/i,
        /ทำเครื่องหมายแจ้งเตือนว่าอ่านแล้ว/i,
        /เคลียร์แจ้งเตือนทั้งหมด/i,
      ],
    },
  ];

export const VOICE_DRAFT_MESSAGE_ACTIONS: VoiceDraftMessageAction[] = [
  {
    kind: "draft_message",
    label: "Draft Message",
    patterns: [
      /^\s*(?:draft|write|compose)\s+(?:a\s+)?message\b/i,
      /^\s*(?:ร่าง|เขียน)\s*ข้อความ\b/i,
      /^\s*ฝากข้อความ\b/i,
    ],
  },
];

export const VOICE_SUBMIT_CHAT_ACTIONS: VoiceSubmitChatAction[] = [
  {
    kind: "submit_chat",
    label: "Submit Search With Location Context",
    useLocation: true,
    requiresConfirmation: true,
    patterns: [
      /^(search|find|recommend|suggest).*\b(near me|nearby|around here|around me)\b/i,
      /^(ค้นหา|หา|แนะนำ).*(แถวนี้|ใกล้ฉัน|ใกล้แถวนี้|ละแวกนี้)/i,
    ],
  },
  {
    kind: "submit_chat",
    label: "Submit Search Or Recommendation",
    patterns: [
      /^(search|find|look up|recommend|suggest)\b/i,
      /^(ค้นหา|หา|แนะนำ)\b/i,
    ],
  },
  {
    kind: "submit_chat",
    label: "Submit Reminder Or Schedule",
    requiresConfirmation: true,
    patterns: [
      /^(remind me|schedule|set a reminder|create a reminder)\b/i,
      /^(เตือน|ตั้งเตือน|สร้างเตือน|ตั้งเวลา|schedule)\b/i,
    ],
  },
  {
    kind: "submit_chat",
    label: "Submit Creation Or Writing Request",
    patterns: [
      /^(create|generate|draft|write|summarize|explain|analyze)\b/i,
      /^(สร้างภาพ|สร้าง|เขียน|ร่าง|สรุป|อธิบาย|วิเคราะห์)\b/i,
    ],
  },
];
