import {
  listSeriesProfiles,
  projectProfileToLegacy,
  type VdSeriesProfileId,
} from "@shared/verticalDramaSeries/seriesProfile";
import { getSeriesLookLockGenreIdentity } from "@shared/verticalDramaSeries/seriesLookLock";
import { cn } from "@/lib/utils";

function profileVisualSummary(
  profile: ReturnType<typeof listSeriesProfiles>[number],
  lang: "th" | "en"
) {
  const legacyLook = projectProfileToLegacy(
    profile.profileId
  ).legacyLookLockGenreKey;
  if (legacyLook) {
    const identity = getSeriesLookLockGenreIdentity(legacyLook);
    return `${identity.palette.join(" · ")} — ${identity.lighting}`;
  }
  return (
    profile.grounding.requiredObservableCues.slice(0, 2).join(" · ") ||
    (lang === "th" ? "ลุคตามสัญญาของโปรไฟล์" : "Profile visual contract")
  );
}

export function SeriesProfilePicker({
  lang,
  value,
  onChange,
}: {
  lang: "th" | "en";
  value: VdSeriesProfileId;
  onChange: (value: VdSeriesProfileId) => void;
}) {
  const profiles = listSeriesProfiles();
  return (
    <section className="grid gap-2" aria-labelledby="vd-series-profile-label">
      <div>
        <h3 id="vd-series-profile-label" className="text-sm font-semibold">
          {lang === "th" ? "แนวทางซีรีส์ / Series Profile" : "Series Profile"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {lang === "th"
            ? "ตัวเลือกเดียวนี้กำหนดเนื้อหา ลุคภาพ หลักฐาน และขั้นตอนเตรียมสื่อทั้งซีรีส์"
            : "One choice controls content, look, evidence, and source preparation for the series."}
        </p>
      </div>
      <div
        className="grid min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-labelledby="vd-series-profile-label"
      >
        {profiles.map(profile => {
          const selected = profile.profileId === value;
          return (
            <button
              key={profile.profileId}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(profile.profileId)}
              className={cn(
                "min-w-0 max-w-full rounded-lg border p-3 text-left transition-colors [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/10"
                  : "bg-background hover:bg-accent"
              )}
            >
              <span className="block text-sm font-medium">
                {lang === "th" ? profile.title : profile.titleEn}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {profile.sourceGatePolicy === "required"
                  ? lang === "th"
                    ? "ต้องเตรียมเรื่องและสื่อประกอบก่อนร่าง"
                    : "Sources required before drafting"
                  : lang === "th"
                    ? "แหล่งอ้างอิงเป็นตัวเลือก"
                    : "Sources are optional"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {lang === "th" ? "ลุคภาพอัตโนมัติ: " : "Automatic look: "}
                {profileVisualSummary(profile, lang)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
