export type MediaTaskArtifactLite = {
  outputIndex?: number | null;
  r2Url?: string | null;
  r2Status?: string | null;
  providerOriginalUrl?: string | null;
  providerStatus?: string | null;
  playbackUrl?: string | null;
  fallbackUrl?: string | null;
  availabilityStatus?: string | null;
  availabilityReason?: string | null;
};

type MediaTaskWithArtifacts = {
  status?: string | null;
  resultUrl?: string | null;
  artifacts?: MediaTaskArtifactLite[] | null;
};

function orderedArtifacts(
  task: MediaTaskWithArtifacts | null | undefined
): MediaTaskArtifactLite[] {
  const artifacts = Array.isArray(task?.artifacts) ? task.artifacts : [];
  return [...artifacts].filter(Boolean).sort(
    (left, right) => (left.outputIndex ?? 0) - (right.outputIndex ?? 0)
  );
}

export function selectMediaTaskPlaybackUrl(
  task: MediaTaskWithArtifacts | null | undefined,
  options?: { allowProviderFallback?: boolean }
): string | null {
  const primary = orderedArtifacts(task)[0];
  if (primary?.r2Status === "ready") return primary.r2Url ?? null;
  if (options?.allowProviderFallback === false) return null;
  if (
    primary &&
    (primary.availabilityStatus === "provider_fallback" ||
      primary.providerStatus === "unknown" ||
      primary.providerStatus === "available")
  ) {
    return (
      primary.playbackUrl ??
      primary.fallbackUrl ??
      primary.providerOriginalUrl ??
      null
    );
  }
  return null;
}

export type MediaTaskArtifactStatus = {
  tone: "ready" | "fallback" | "expired" | "pending" | "missing";
  label: string;
  detail?: string;
};

export function getMediaTaskArtifactStatus(
  task: MediaTaskWithArtifacts | null | undefined,
  isThai = false
): MediaTaskArtifactStatus | null {
  if (!task) return null;
  const primary = orderedArtifacts(task)[0];
  if (!primary) {
    return task.status === "completed"
      ? {
          tone: "pending",
          label: isThai ? "กำลังย้ายเข้า R2" : "Copying to R2",
          detail: isThai
            ? "กำลังเตรียมไฟล์ถาวรสำหรับการเรียกดู"
            : "Preparing durable media for playback",
        }
      : null;
  }
  if (primary.r2Status === "ready") {
    return {
      tone: "ready",
      label: isThai ? "เก็บใน R2 แล้ว" : "Stored in R2",
    };
  }
  if (primary.availabilityStatus === "provider_fallback") {
    return {
      tone: "fallback",
      label: isThai ? "สำรองจาก Provider" : "Provider fallback",
      detail: isThai
        ? "R2 ยังไม่พร้อม จึงใช้ลิงก์ต้นฉบับชั่วคราว"
        : "R2 is not ready; using the original temporary link",
    };
  }
  if (
    primary.providerStatus === "expired" ||
    primary.availabilityStatus === "provider_expired"
  ) {
    return {
      tone: "expired",
      label: isThai ? "ลิงก์ Provider หมดอายุ" : "Provider link expired",
      detail:
        primary.availabilityReason ??
        (isThai
          ? "ไม่สามารถเปิดดูจาก Provider ได้แล้ว"
          : "The Provider link can no longer be viewed"),
    };
  }
  if (primary.availabilityStatus === "tenant_scope_missing") {
    return {
      tone: "missing",
      label: isThai ? "ขาดข้อมูล Tenant จึงยังเปิดดูไม่ได้" : "Tenant scope missing",
      detail:
        primary.availabilityReason ??
        (isThai
          ? "ต้องซ่อมสิทธิ์ Tenant ของงานเก่าก่อนจึงจะย้ายไฟล์เข้า R2 ได้"
          : "Tenant ownership must be repaired before this legacy file can be copied to R2"),
    };
  }
  if (
    primary.r2Status === "missing" ||
    primary.availabilityStatus === "r2_missing"
  ) {
    return {
      tone: "missing",
      label: isThai ? "ไม่พบไฟล์ใน R2" : "R2 object missing",
      ...(primary.availabilityReason
        ? { detail: primary.availabilityReason }
        : {}),
    };
  }
  return {
    tone: "pending",
    label: isThai ? "กำลังย้ายเข้า R2" : "Copying to R2",
    ...(primary.availabilityReason
      ? { detail: primary.availabilityReason }
      : {}),
  };
}
