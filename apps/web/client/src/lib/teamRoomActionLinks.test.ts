import { describe, expect, it } from "vitest";

import {
  extractTeamRoomActionLinks,
  stripStandaloneTeamRoomActionLinks,
} from "./teamRoomActionLinks";

describe("teamRoomActionLinks", () => {
  it("extracts and classifies Team Room action links", () => {
    const content = [
      "งานนี้กำลังรอคน approve อยู่",
      "",
      "[Review approval in Team Room](/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root)",
      "[Reply in Team Room](/teams/team-1?roomId=room-1&workItemId=work-2&messageId=msg-2&composeReply=1)",
      "[Open Team Room](/teams/team-1?roomId=room-1&workItemId=work-3)",
    ].join("\n");

    expect(extractTeamRoomActionLinks(content)).toEqual([
      {
        label: "Review approval in Team Room",
        href: "/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root",
        kind: "approval",
      },
      {
        label: "Reply in Team Room",
        href: "/teams/team-1?roomId=room-1&workItemId=work-2&messageId=msg-2&composeReply=1",
        kind: "reply",
      },
      {
        label: "Open Team Room",
        href: "/teams/team-1?roomId=room-1&workItemId=work-3",
        kind: "open",
      },
    ]);
  });

  it("supports workflow-board links and strips workflow helper lines", () => {
    const content = [
      "เปิดบอร์ดงานของ persona นี้ได้จากลิงก์ด้านล่าง",
      "",
      "Markdown workflow link: [Open Workflow Board](/teams/team-1?roomId=room-1&workItemId=work-1&panel=workflow)",
    ].join("\n");

    expect(extractTeamRoomActionLinks(content)).toEqual([
      {
        label: "Open Workflow Board",
        href: "/teams/team-1?roomId=room-1&workItemId=work-1&panel=workflow",
        kind: "workflow",
      },
    ]);

    expect(stripStandaloneTeamRoomActionLinks(content)).toBe("เปิดบอร์ดงานของ persona นี้ได้จากลิงก์ด้านล่าง");
  });

  it("removes standalone Team Room action-link lines but keeps normal text", () => {
    const content = [
      "อัปเดตล่าสุดของงานนี้พร้อมแล้ว",
      "",
      "Markdown action link: [Review approval in Team Room](/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root)",
      "",
      "ยังต้องตรวจ final wording อีกครั้ง",
    ].join("\n");

    expect(stripStandaloneTeamRoomActionLinks(content)).toBe([
      "อัปเดตล่าสุดของงานนี้พร้อมแล้ว",
      "",
      "ยังต้องตรวจ final wording อีกครั้ง",
    ].join("\n"));
  });
});
