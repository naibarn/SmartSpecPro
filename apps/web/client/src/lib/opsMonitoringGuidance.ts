import type { Locale } from "@/lib/i18n/types";

type OpsGuideKind =
  | "monitoring_stale"
  | "alert_backlog"
  | "services"
  | "resources"
  | "audit"
  | "orchestration"
  | "generic";

export type OpsIncidentGuidanceInput = {
  locale: Locale;
  title?: string | null;
  message?: string | null;
  category?: string | null;
  signal?: string | null;
  recommendation?: string | null;
  groupKey?: string | null;
  severity?: string | null;
};

export type OpsIncidentGuidance = {
  kind: OpsGuideKind;
  headline: string;
  summary: string;
  impactLabel: string;
  impactBody: string;
  checkNowLabel: string;
  checkNow: string[];
  confirmFixedLabel: string;
  confirmFixed: string[];
  faqLabel: string;
  faqItems: Array<{ question: string; answer: string }>;
  technicalLabel: string;
  helpLabel: string;
  helpTopicSlug: string;
  helpHref: string;
  monitoringActionLabel: string;
  dismissLabel: string;
  reminderLabel: string;
};

function inferGuideKind(input: OpsIncidentGuidanceInput): OpsGuideKind {
  const haystack = [
    input.groupKey ?? "",
    input.title ?? "",
    input.message ?? "",
    input.signal ?? "",
    input.category ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("monitoring_stale") || haystack.includes("signal is stale") || haystack.includes("last check")) {
    return "monitoring_stale";
  }
  if (haystack.includes("alert_backlog") || haystack.includes("unacknowledged") || haystack.includes("pending acknowledgement")) {
    return "alert_backlog";
  }
  if ((input.category ?? "").toLowerCase() === "services") {
    return "services";
  }
  if ((input.category ?? "").toLowerCase() === "resources") {
    return "resources";
  }
  if ((input.category ?? "").toLowerCase() === "audit") {
    return "audit";
  }
  if ((input.category ?? "").toLowerCase() === "orchestration") {
    return "orchestration";
  }
  return "generic";
}

function localizedShared(locale: Locale) {
  if (locale === "th") {
    return {
      impactLabel: "ทำไมต้องรีบตรวจสอบ",
      checkNowLabel: "ตรวจสอบทันที",
      confirmFixedLabel: "ยืนยันว่าอาการหายจริง",
      faqLabel: "คำถามที่พบบ่อย",
      technicalLabel: "สัญญาณเชิงเทคนิค",
      helpLabel: "เปิดคู่มือการตรวจสอบ",
      monitoringActionLabel: "เปิดหน้า Monitoring",
      dismissLabel: "ปิด",
      reminderLabel: "การแจ้งเตือนระบบ",
    } satisfies Omit<OpsIncidentGuidance, "kind" | "headline" | "summary" | "impactBody" | "checkNow" | "confirmFixed" | "faqItems" | "helpTopicSlug" | "helpHref">;
  }

  return {
    impactLabel: "Why This Needs Attention",
    checkNowLabel: "Check Now",
    confirmFixedLabel: "Confirm It Is Actually Fixed",
    faqLabel: "Quick FAQ",
    technicalLabel: "Technical Signal",
    helpLabel: "Open Investigation Guide",
    monitoringActionLabel: "Open Monitoring",
    dismissLabel: "Dismiss",
    reminderLabel: "System Reminder",
  } satisfies Omit<OpsIncidentGuidance, "kind" | "headline" | "summary" | "impactBody" | "checkNow" | "confirmFixed" | "faqItems" | "helpTopicSlug" | "helpHref">;
}

export function getOpsIncidentGuidance(input: OpsIncidentGuidanceInput): OpsIncidentGuidance {
  const kind = inferGuideKind(input);
  const shared = localizedShared(input.locale);
  const helpTopicSlug = "admin-monitoring-incident-response";

  if (input.locale === "th") {
    switch (kind) {
      case "monitoring_stale":
        return {
          kind,
          ...shared,
          headline: "ข้อมูล monitoring ไม่อัปเดตตามรอบ",
          summary: "ระบบตรวจสุขภาพไม่ได้ส่งข้อมูลใหม่เข้ามาตามเวลาปกติ จึงมีความเสี่ยงว่าการ์ด service, metrics และสถานะบางส่วนเป็นข้อมูลเก่า ไม่ใช่สภาพปัจจุบัน",
          impactBody: "ถ้าเกิด incident ใหม่ตอนนี้ ทีมอาจตัดสินใจจากข้อมูลเก่า ทำให้พลาดต้นเหตุจริงหรือรับรู้การล่มช้ากว่าที่ควร",
          checkNow: [
            "เปิดแท็บ Checks แล้วดูว่า check ล่าสุดหยุดตั้งแต่เมื่อไร และมาจาก source ใด",
            "กด Force Fresh Check เพื่อยืนยันว่ายังเก็บ snapshot ใหม่ได้หรือไม่",
            "ถ้า fresh check ไม่เข้า ให้ตรวจ scheduler, collector หรือ service ที่เขียน monitoring rows",
          ],
          confirmFixed: [
            "ต้องเห็น Last check เปลี่ยนเป็นเวลาปัจจุบัน ไม่ใช่หลายชั่วโมงก่อนหน้า",
            "ต้องมี check ใหม่และถ้าเคยมี alert ค้าง ต้องเห็น alert/notification วงจรกลับมาทำงาน",
            "ค่อยปิด incident หลัง service cards และ anomalies สะท้อนข้อมูลใหม่แล้ว",
          ],
          faqItems: [
            {
              question: "กด Force Fresh Check แล้วควรคาดหวังอะไร",
              answer: "ระบบควรบันทึก check ใหม่ทันที ถ้ายังไม่เข้า แปลว่าปัญหาไม่ได้อยู่ที่ UI แต่เป็น pipeline หรือ backend ที่เก็บ monitoring",
            },
            {
              question: "สถานะ Unknown หรือ Stale ต่างกันอย่างไร",
              answer: "Stale คือมีข้อมูลเก่าแต่ไม่สด ส่วน Unknown คือไม่มี structured status ที่ใช้สรุป service นั้นอย่างชัดเจน",
            },
            {
              question: "ควร acknowledge เลยไหม",
              answer: "ควร acknowledge เมื่อมี owner รับเรื่องแล้ว และเริ่มตรวจว่า pipeline monitoring ฟื้นจริง ไม่ใช่แค่กดรับทราบ",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      case "alert_backlog":
        return {
          kind,
          ...shared,
          headline: "มี critical alerts ค้างและยังไม่มีคนรับเรื่อง",
          summary: "ระบบยังมี alert ระดับสูงที่เปิดค้างอยู่หลายรายการ การแจ้งเตือนถูกสร้างแล้วแต่ยังไม่มีการ triage หรือ acknowledgement ที่ชัดเจน",
          impactBody: "ถ้าไม่แยกให้ได้ว่า alert ไหนคือต้นเหตุจริง ทีมจะเสียเวลาไล่ตามอาการซ้ำ และอาจปล่อยให้ failure เดิมลุกลามโดยไม่มี owner",
          checkNow: [
            "เปิด Alert Inbox ของ incident นี้ แล้วแยก alert ซ้ำออกจาก failure แรกที่เป็นต้นเหตุ",
            "กำหนด owner ทันที พร้อมใส่ action note ว่าตรวจอะไรไปแล้ว",
            "ถ้า monitoring stale พร้อมกัน ให้ฟื้น monitoring ก่อนเพื่อไม่ให้ triage จากข้อมูลไม่ครบ",
          ],
          confirmFixed: [
            "จำนวน open alerts ของ incident ต้องลดลงหรือถูก acknowledge พร้อม note ที่ชัดเจน",
            "Latest operator update ควรบอกว่าใครรับเรื่องและกำลังทำอะไรอยู่",
            "ถ้า alert เดิมยังยิงต่อเนื่อง ให้เปิด incident ไว้จน rate ลดลงจริง",
          ],
          faqItems: [
            {
              question: "ทำไม alert backlog ถึงเป็น critical แม้ server ยังไม่ล่ม",
              answer: "เพราะแปลว่าระบบเตือนเริ่มส่งสัญญาณแล้ว แต่กระบวนการรับเรื่องยังไม่ทัน ทำให้เสี่ยงพลาดช่วงก่อนล่มจริง",
            },
            {
              question: "ควร acknowledge ทุก alert ทีเดียวไหม",
              answer: "ไม่ควร กรณีที่มีหลาย alert ควรระบุ owner และ note ให้รู้ว่า root cause คืออะไร ไม่ใช่ปิดเงียบทั้งก้อน",
            },
            {
              question: "ถ้ามีหลาย admin ควรทำอย่างไร",
              answer: "ใช้ Assign / Handoff เพื่อชี้ owner คนเดียว แล้วให้คนอื่นอัปเดตผ่าน operator log เพื่อลดความซ้ำซ้อน",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      case "services":
        return {
          kind,
          ...shared,
          headline: "มีสัญญาณผิดปกติระดับ service runtime",
          summary: "หนึ่งหรือหลาย service อาจกำลัง degraded, unhealthy, restart ถี่ หรือข้อมูล health ไม่เสถียร",
          impactBody: "ถ้า service หลักเริ่มผิดปกติแต่ยังไม่ถึงขั้นล่ม การแก้ก่อนจะช่วยลด downtime และลดผลกระทบต่อผู้ใช้ได้มาก",
          checkNow: [
            "ดู service cards, restart patterns และ alert evidence ของ incident นี้พร้อมกัน",
            "ตรวจว่าเป็นปัญหาเฉพาะ service เดียว หรือเป็นผลจาก dependency ด้านล่าง เช่น database หรือ queue",
            "ถ้าต้อง restart ให้บันทึกไว้ใน operator log ว่าทำกับ service ใดและเพราะอะไร",
          ],
          confirmFixed: [
            "service status ควรกลับเป็น running/healthy หรืออย่างน้อยไม่ restart ต่อเนื่อง",
            "alert ใหม่จาก service เดิมต้องหยุดยิงซ้ำ",
            "owner ควรบันทึกสิ่งที่ตรวจพบและการแก้ที่ทำไปแล้วก่อน resolve",
          ],
          faqItems: [
            {
              question: "ควรเริ่มจาก service card หรือ alert list ก่อน",
              answer: "เริ่มจาก incident summary เพื่อจับภาพรวม แล้วเปิด alert list เพื่อดู evidence ที่ยืนยันว่า service ไหนเป็นตัวเริ่มปัญหา",
            },
            {
              question: "ถ้า service card ยังขึ้น stale ล่ะ",
              answer: "ให้กด Force Fresh Check ก่อน เพราะอาจเป็นข้อมูลเก่าและทำให้ตีความผิดว่า service ยังเสียอยู่",
            },
            {
              question: "เมื่อไรจึงควร mark resolved",
              answer: "เมื่อ service กลับมานิ่งและไม่มี alert ใหม่ยิงต่อเนื่อง ไม่ใช่ทันทีหลัง restart ครั้งเดียว",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      case "resources":
        return {
          kind,
          ...shared,
          headline: "ทรัพยากรเครื่องกำลังตึงตัวก่อนเกิดล่ม",
          summary: "CPU, memory, disk หรือ restart pressure เริ่มขึ้นสูงกว่าปกติ จนอาจส่งผลกับ latency และความเสถียรของ service",
          impactBody: "ถ้าปล่อยจน resource อิ่มจริง ระบบอาจช้าลงมาก, งานค้าง, worker ตาย หรือ service หลักล่มตามมา",
          checkNow: [
            "เปิด Metrics แล้วดูแนวโน้ม CPU, memory, disk และ restart ช่วงล่าสุด",
            "แยกให้ได้ว่าปัญหาเกิดจาก process เดียว, queue backlog หรือทั้งเครื่องกำลังตึงพร้อมกัน",
            "ตัดสินใจล่วงหน้าว่าจะแก้ด้วย restart, scale, drain งาน หรือชะลอ workload",
          ],
          confirmFixed: [
            "กราฟทรัพยากรต้องกลับลงจากจุดวิกฤต ไม่ใช่เด้งลงชั่วคราวแล้วขึ้นใหม่",
            "service ที่ได้รับผลกระทบต้องหยุด restart หรือ latency spike",
            "มี note ระบุว่าทำ relief action อะไร และต้องติดตามต่ออีกหรือไม่",
          ],
          faqItems: [
            {
              question: "memory สูงอย่างเดียวต้องรีบไหม",
              answer: "ถ้าสูงต่อเนื่องและเริ่มมี restart, slow response หรือ queue lag ควรรีบ เพราะเป็นสัญญาณก่อนล่มได้",
            },
            {
              question: "disk pressure เชื่อมกับ alert อื่นอย่างไร",
              answer: "disk ตึงอาจทำให้ log เขียนไม่ได้, database ช้า, หรือ background jobs พัง จึงควรดูร่วมกับ service และ queue",
            },
            {
              question: "ควร resolve หลัง resource ลงทันทีไหม",
              answer: "ควรรอดูว่าระบบกลับมานิ่งพอสมควรและไม่มี alert ซ้ำรอบใหม่ก่อน",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      case "audit":
        return {
          kind,
          ...shared,
          headline: "คุณภาพ request หรือ provider health กำลังเสื่อม",
          summary: "ระบบพบ error spike, latency spike หรือคุณภาพผลลัพธ์ลดลงใน provider/model/endpoint บางส่วน",
          impactBody: "แม้ service จะยัง up อยู่ แต่ผู้ใช้จะเริ่มได้รับงานช้า ตอบผิด หรือ fallback ถี่ขึ้น ซึ่งเป็นปัญหาที่ต้องหยุดก่อนกระทบวงกว้าง",
          checkNow: [
            "ดูว่า error spike ผูกกับ provider, model หรือ endpoint ใด",
            "เทียบ latency และ failure rate กับช่วงก่อนหน้าเพื่อประเมินว่าต้อง fail over หรือไม่",
            "ถ้ามี fallback/retry เพิ่มขึ้น ให้ดูว่าเป็นการช่วยพยุงระบบหรือกำลังซ่อนปัญหาใหญ่กว่า",
          ],
          confirmFixed: [
            "อัตรา error และ latency ต้องกลับเข้าเกณฑ์ที่นิ่งขึ้น",
            "request quality หรือ success rate ต้องไม่แย่ลงต่อเนื่อง",
            "หากมีการสลับ provider/model ควรบันทึกเหตุผลและผลลัพธ์ไว้ใน incident log",
          ],
          faqItems: [
            {
              question: "ทำไมไม่มี service ล่มแต่ยังขึ้น critical",
              answer: "เพราะผู้ใช้ยังอาจได้รับผลลัพธ์แย่หรือช้าผิดปกติ ซึ่งเป็น operational incident ได้แม้ตัว service ยังตอบอยู่",
            },
            {
              question: "ควร fail over ทันทีไหม",
              answer: "ให้ดูทั้ง latency, error rate และคุณภาพผลลัพธ์ร่วมกันก่อน ถ้าเสื่อมต่อเนื่องจึงค่อยสลับ",
            },
            {
              question: "ควรตรวจจากหน้าไหนต่อ",
              answer: "เริ่มจาก alert inbox และ incident summary แล้วค่อยเปิด audit/orchestration logs หากต้องการหลักฐานเชิงลึก",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      case "orchestration":
        return {
          kind,
          ...shared,
          headline: "เส้นทาง automation หรือ orchestration เริ่มผิดรูป",
          summary: "ระบบพบ fallback, classification drift, queue lag หรือพฤติกรรม worker ที่บอกว่ากระบวนการอัตโนมัติอาจกำลังติดขัด",
          impactBody: "ถ้าไม่แก้ตั้งแต่ตอนนี้ งานอัตโนมัติจะค่อย ๆ ค้างสะสม จนกลายเป็น backlog และกระทบงานปลายทางจำนวนมาก",
          checkNow: [
            "ดู incident summary ร่วมกับ queue pressure และ orchestration alerts",
            "ตรวจว่าปัญหาเกิดที่ classifier, fallback path, worker consumption หรือ external dependency",
            "หากมีการ reroute/manual retry ให้บันทึกไว้ใน operator log เพื่อไม่ให้ทีมอื่นทำซ้ำ",
          ],
          confirmFixed: [
            "queue backlog และ fallback signal ต้องลดลงจริง",
            "worker ต้องกลับมาประมวลผลได้ต่อเนื่องโดยไม่เกิด stall รอบใหม่",
            "ค่อย resolve เมื่อ flow หลักกลับมานิ่ง ไม่ใช่แค่ manual retry ผ่านครั้งเดียว",
          ],
          faqItems: [
            {
              question: "ทำไม orchestration risk ถึงควรดูคู่กับ queue",
              answer: "เพราะ automation ที่ผิดรูปมักทำให้งานสะสมใน queue จนกลายเป็นปัญหาด้าน capacity ตามมา",
            },
            {
              question: "fallback เยอะหมายความว่าอะไร",
              answer: "มักแปลว่าเส้นทางหลักมีปัญหา หรือ classifier ตัดสินใจผิดบ่อยขึ้น จึงต้องตรวจทั้ง logic และ downstream service",
            },
            {
              question: "ควรปิด incident เมื่อ manual workaround ใช้ได้ไหม",
              answer: "ยังไม่ควร ถ้าเส้นทางอัตโนมัติหลักยังไม่เสถียร ต้องบันทึกไว้ว่า workaround คืออะไรและระบบหลักหายจริงหรือยัง",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
      default:
        return {
          kind,
          ...shared,
          headline: "พบ incident ที่ควรตรวจสอบเพิ่มเติม",
          summary: "ระบบตรวจพบสัญญาณผิดปกติที่อาจลุกลามได้ หากไม่มี owner หรือการตรวจเชิงรุก",
          impactBody: "การรับรู้เร็วและบันทึก action note ชัดเจนจะช่วยลดเวลาหาต้นเหตุและป้องกันการล่มเงียบ",
          checkNow: [
            "อ่าน incident summary และ alert evidence เพื่อจับว่าต้นเหตุอาจอยู่ส่วนใด",
            "กำหนด owner และบันทึก action note ทันทีที่เริ่มตรวจ",
            "เปิด checks, alerts หรือ metrics ตามสัญญาณที่ incident ระบุไว้",
          ],
          confirmFixed: [
            "อัปเดต operator log ให้ชัดว่าเกิดอะไรขึ้นและทำอะไรไปแล้ว",
            "ดูว่า open alerts ลดลงและไม่มีสัญญาณซ้ำในช่วงติดตาม",
            "ปิด incident เมื่อหลักฐานยืนยันว่าระบบกลับมานิ่งจริง",
          ],
          faqItems: [
            {
              question: "ถ้ายังไม่แน่ใจว่าปัญหาอยู่ตรงไหนควรเริ่มอย่างไร",
              answer: "เริ่มจาก incident summary, open alerts และ last check เพื่อแยกก่อนว่าเป็นปัญหา monitoring, service, resource หรือ automation",
            },
            {
              question: "ต้องใส่ note ทุกครั้งไหม",
              answer: "ควรใส่ เพราะช่วยให้คนถัดไปเห็นว่าตรวจอะไรไปแล้วและลดการทำงานซ้ำ",
            },
            {
              question: "ควร resolve เมื่อไร",
              answer: "เมื่อมีหลักฐานว่าปัญหาหายจริงและไม่มีสัญญาณกลับมาในช่วงสังเกตอาการ",
            },
          ],
          helpTopicSlug,
          helpHref: `/help/${helpTopicSlug}`,
        };
    }
  }

  switch (kind) {
    case "monitoring_stale":
      return {
        kind,
        ...shared,
        headline: "Monitoring data has stopped updating on schedule",
        summary: "The health monitoring pipeline has not produced fresh rows on time, so service cards, metrics, and alert context may already be stale rather than live runtime truth.",
        impactBody: "If a real incident starts now, the team can lose precious time by triaging from outdated evidence instead of the current system state.",
        checkNow: [
          "Open Checks and confirm when the last monitoring row landed and which source produced it.",
          "Use Force Fresh Check to verify whether the runtime can still capture a new snapshot right now.",
          "If no fresh row appears, investigate the collector, scheduler, or backend path that writes monitoring rows.",
        ],
        confirmFixed: [
          "Last check should move to the current time rather than staying hours behind.",
          "A new check row should exist and alert delivery should resume if it was previously stalled.",
          "Close the incident only after service cards and anomalies reflect fresh data again.",
        ],
        faqItems: [
          {
            question: "What should happen after Force Fresh Check",
            answer: "You should see a new monitoring row immediately. If that still fails, the problem is in the monitoring pipeline or backend, not in the page UI.",
          },
          {
            question: "What is the difference between Unknown and Stale",
            answer: "Stale means there is old data but it is no longer fresh. Unknown means the latest data does not contain enough structured service status to classify the service confidently.",
          },
          {
            question: "Should I acknowledge this right away",
            answer: "Acknowledge it once someone owns the investigation and is actively restoring the monitoring pipeline, not just to silence the alert.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    case "alert_backlog":
      return {
        kind,
        ...shared,
        headline: "Critical alerts are piling up without clear ownership",
        summary: "High-severity alerts were raised, but the incident still lacks clear triage and acknowledgement, so duplicates can hide the first real failure.",
        impactBody: "Without an owner and a written triage path, the team can waste time chasing repeated symptoms while the original failure silently compounds.",
        checkNow: [
          "Open the incident alert inbox and separate duplicate symptoms from the first likely root-cause alert.",
          "Assign an owner immediately and add an action note describing what is being checked now.",
          "If monitoring is stale too, restore monitoring first so the team is not triaging blind.",
        ],
        confirmFixed: [
          "Open alert count should drop or be acknowledged with a real owner and note.",
          "Latest operator update should clearly show who owns the incident and what changed.",
          "Keep the incident open if the same alert pattern is still firing repeatedly.",
        ],
        faqItems: [
          {
            question: "Why is alert backlog critical if the server is not down yet",
            answer: "Because the system has already warned you, but the response loop is lagging. That is exactly when early intervention matters most.",
          },
          {
            question: "Should I acknowledge every alert at once",
            answer: "No. Use acknowledgement to show ownership and progress, not to wipe the inbox without explaining the root cause.",
          },
          {
            question: "How should multiple admins coordinate",
            answer: "Use Assign / Handoff to keep one current owner and let everyone else add notes in the operator log instead of duplicating work.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    case "services":
      return {
        kind,
        ...shared,
        headline: "A service runtime issue is emerging",
        summary: "One or more services may be degraded, unhealthy, restarting too often, or reporting unstable health data.",
        impactBody: "Catching this before a full outage helps reduce downtime, contain blast radius, and keep user-facing features available.",
        checkNow: [
          "Review service cards, restart patterns, and grouped alert evidence together.",
          "Decide whether the fault is isolated to one service or caused by a shared dependency such as the database, queue, or cache.",
          "If you restart something, record exactly which service changed and why in the operator log.",
        ],
        confirmFixed: [
          "Service status should return to running or healthy and stop restarting repeatedly.",
          "The same service-level alert pattern should stop firing again and again.",
          "Record the fix and remaining watch items before marking the incident resolved.",
        ],
        faqItems: [
          {
            question: "Should I start from the service card or the alert list",
            answer: "Start from the incident summary for context, then inspect the alert list for the concrete evidence that points to the failing service.",
          },
          {
            question: "What if the service card is still stale",
            answer: "Run Force Fresh Check first because stale service cards can make a healthy service look unhealthy or vice versa.",
          },
          {
            question: "When is it safe to resolve the incident",
            answer: "After the service is stable again and new alerts stop repeating, not immediately after a single restart.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    case "resources":
      return {
        kind,
        ...shared,
        headline: "Host resources are approaching a risky threshold",
        summary: "CPU, memory, disk, or restart pressure is rising enough to threaten service latency and runtime stability before a visible outage.",
        impactBody: "If the node saturates, services can slow down, workers can stall, jobs can pile up, and a hard failure can follow quickly.",
        checkNow: [
          "Open Metrics and inspect CPU, memory, disk, and restart trends over the latest period.",
          "Determine whether the pressure is isolated to one process, a queue backlog, or the whole node.",
          "Choose the relief action now: restart, scale, drain work, or reduce load before saturation turns into downtime.",
        ],
        confirmFixed: [
          "Resource graphs should come down from the danger zone and stay lower, not bounce for a minute and spike again.",
          "Affected services should stop restarting or showing latency spikes.",
          "Document the relief action and whether further follow-up is still needed.",
        ],
        faqItems: [
          {
            question: "Is high memory alone urgent",
            answer: "It becomes urgent when it stays high and starts affecting restarts, slow responses, or queue lag. That is often the pre-failure phase.",
          },
          {
            question: "How can disk pressure relate to other alerts",
            answer: "Disk pressure can break logging, slow databases, and damage background job stability, so you should read it together with service and queue signals.",
          },
          {
            question: "Should I resolve this as soon as the graph drops",
            answer: "Wait until the system stays stable and the alert pattern does not immediately return.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    case "audit":
      return {
        kind,
        ...shared,
        headline: "Provider health or request quality is degrading",
        summary: "The system is seeing an error spike, latency spike, or quality regression around a provider, model, or endpoint.",
        impactBody: "Even if services still respond, users can receive slower, weaker, or failed outputs, which is an operational incident worth stopping early.",
        checkNow: [
          "Identify which provider, model, or endpoint the spike is tied to.",
          "Compare recent latency and failure rate against the prior steady period before deciding to fail over.",
          "If fallback or retry volume is rising, decide whether it is stabilizing the system or hiding a deeper failure.",
        ],
        confirmFixed: [
          "Error rate and latency should settle back into a stable range.",
          "Success rate or output quality should stop degrading.",
          "If you switched providers or models, record why and what improved.",
        ],
        faqItems: [
          {
            question: "Why can this be critical when the service is still up",
            answer: "Because user outcomes can already be degraded even while the service still returns responses.",
          },
          {
            question: "Should I fail over immediately",
            answer: "Use the combination of latency, error rate, and output quality to decide. A brief spike is different from a sustained degradation.",
          },
          {
            question: "Where should I look next for deeper evidence",
            answer: "Start from the incident summary and alert inbox, then drill into audit or orchestration logs if you need deeper proof.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    case "orchestration":
      return {
        kind,
        ...shared,
        headline: "Automation flow is drifting before backlog explodes",
        summary: "Fallbacks, classification drift, queue lag, or worker behavior suggest the orchestration path is starting to misbehave.",
        impactBody: "If this continues, automated work will quietly accumulate until queues clog and downstream features miss their expected completion windows.",
        checkNow: [
          "Read the incident summary together with queue pressure and orchestration evidence.",
          "Decide whether the fault sits in the classifier, fallback path, worker consumption, or an external dependency.",
          "If you retry or reroute manually, log it so the next admin understands the temporary workaround.",
        ],
        confirmFixed: [
          "Queue backlog and fallback signals should trend down for real.",
          "Workers should process continuously again without another stall cycle.",
          "Resolve the incident only when the main automated path is stable, not just after one successful manual retry.",
        ],
        faqItems: [
          {
            question: "Why should I read orchestration risk together with queue health",
            answer: "Because automation drift often turns into queue accumulation, and queue pressure is usually the next visible symptom.",
          },
          {
            question: "What does heavy fallback usually mean",
            answer: "It often means the primary path is failing or classification quality is slipping, so you should inspect both logic and downstream dependencies.",
          },
          {
            question: "Can I resolve after a manual workaround succeeds once",
            answer: "Not yet. The core automation path still needs to be stable, and the workaround should be documented clearly.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
    default:
      return {
        kind,
        ...shared,
        headline: "An operational incident needs investigation",
        summary: "The system detected abnormal behavior that can get worse if nobody owns the triage path and records what was checked.",
        impactBody: "Early acknowledgement plus a written action note helps the next admin move faster and prevents silent incident drift.",
        checkNow: [
          "Read the incident summary and grouped alerts to narrow down where the fault likely lives.",
          "Assign an owner and write an action note as soon as triage begins.",
          "Open checks, alerts, or metrics based on the signal attached to the incident.",
        ],
        confirmFixed: [
          "Update the operator log with what was found and what changed.",
          "Watch for open alerts to drop and for the signal to stop repeating.",
          "Resolve only after evidence shows the system has stabilized again.",
        ],
        faqItems: [
          {
            question: "Where should I start if I do not know the root cause yet",
            answer: "Start from the incident summary, open alerts, and last-check timing to decide whether the first problem is monitoring, service runtime, resources, or automation.",
          },
          {
            question: "Do I really need to leave a note every time",
            answer: "Yes. Notes make the response chain concrete and stop the next admin from repeating the same checks blindly.",
          },
          {
            question: "When should I mark the incident resolved",
            answer: "When the evidence shows recovery is real and the signal does not quickly come back.",
          },
        ],
        helpTopicSlug,
        helpHref: `/help/${helpTopicSlug}`,
      };
  }
}
