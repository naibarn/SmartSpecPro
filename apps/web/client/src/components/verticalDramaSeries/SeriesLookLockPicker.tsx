import { Grid } from "@astryxdesign/core/Grid";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Stack";

import {
  VD_LOOK_LOCK_GENRES,
  getSeriesLookLockGenreIdentity,
  type VdLookLockGenre,
  type VdLookLockMode,
} from "@shared/verticalDramaSeries/seriesLookLock";

export type SeriesLookLockPickerValue = {
  mode: VdLookLockMode;
  genreKey?: VdLookLockGenre;
  /** Whether the look also becomes soft story-facing guidance during drafting. */
  visualNarrativeEnabled?: boolean;
};

const GENRE_LABELS: Record<VdLookLockGenre, { th: string; en: string }> = {
  drama_romance: { th: "ดราม่า / โรแมนติก", en: "Drama / Romance" },
  horror_thriller: { th: "สยองขวัญ / ระทึกขวัญ", en: "Horror / Thriller" },
  sci_fi_cyberpunk: { th: "ไซไฟ / ไซเบอร์พังก์", en: "Sci-fi / Cyberpunk" },
  action_epic: { th: "แอ็กชัน / มหากาพย์", en: "Action / Epic" },
  fantasy_fairytale: { th: "แฟนตาซี / เทพนิยาย", en: "Fantasy / Fairytale" },
  animation_cartoon: { th: "แอนิเมชัน / การ์ตูน", en: "Animation / Cartoon" },
};

export function SeriesLookLockPicker(props: {
  lang: "th" | "en";
  value: SeriesLookLockPickerValue;
  onChange: (value: SeriesLookLockPickerValue) => void;
  hasInheritedLook: boolean;
  isDisabled?: boolean;
}) {
  const options: Array<{
    key: string;
    value: SeriesLookLockPickerValue;
    title: string;
    description: string;
    disabled?: boolean;
  }> = [
    ...(props.value.mode === "manual"
      ? [
          {
            key: "manual",
            value: { mode: "manual" as const },
            title: props.lang === "th" ? "ลุคที่ปรับเอง" : "Custom look",
            description:
              props.lang === "th"
                ? "ลุคแบบกำหนดเองที่บันทึกไว้ กดตัวเลือกอื่นเพื่อเปลี่ยน"
                : "The saved custom look. Choose another option to replace it.",
            disabled: true,
          },
        ]
      : []),
    {
      key: "inherit_source",
      value: { mode: "inherit_source" },
      title: props.lang === "th" ? "ใช้ลุคจากต้นทาง" : "Use source look",
      description: props.hasInheritedLook
        ? props.lang === "th"
          ? "คืนค่าลุคจาก preset หรือซีรีส์ต้นทาง"
          : "Restore the preset or parent-series look"
        : props.lang === "th"
          ? "ยังไม่มีลุคต้นทางให้ใช้"
          : "No source look is available",
      disabled: !props.hasInheritedLook,
    },
    ...VD_LOOK_LOCK_GENRES.map(genreKey => {
      const identity = getSeriesLookLockGenreIdentity(genreKey);
      return {
        key: genreKey,
        value: { mode: "genre" as const, genreKey },
        title: GENRE_LABELS[genreKey][props.lang],
        description: `${identity.palette.join(" · ")} — ${identity.lighting}`,
      };
    }),
    {
      key: "none",
      value: { mode: "none" },
      title: props.lang === "th" ? "ไม่ล็อกลุค" : "No look lock",
      description:
        props.lang === "th"
          ? "ไม่เพิ่มลุคระดับซีรีส์ในการสร้างภาพครั้งถัดไป"
          : "Do not add a series-wide look to future image generations",
    },
  ];

  return (
    <VStack gap={2}>
      <Text type="label">
        {props.lang === "th" ? "ลุคภาพประจำซีรีส์" : "Series visual look"}
      </Text>
      <Text type="supporting" color="secondary">
        {props.lang === "th"
          ? "เลือกก่อนว่าลุคนี้จะมีผลเฉพาะงานภาพ หรือจะช่วย AI วางบรรยากาศและจังหวะความสัมพันธ์ของเรื่องด้วย"
          : "Choose whether this look affects only production images or also helps AI plan story texture and relationship staging."}
      </Text>
      <Grid columns={{ minWidth: 180, max: 3, repeat: "fit" }} gap={2}>
        {options.map(option => {
          const selected =
            props.value.mode === option.value.mode &&
            (option.value.mode !== "genre" ||
              props.value.genreKey === option.value.genreKey);
          return (
            <SelectableCard
              key={option.key}
              label={option.title}
              isSelected={selected}
              isDisabled={props.isDisabled || option.disabled}
              onChange={isSelected =>
                isSelected &&
                props.onChange({
                  ...option.value,
                  ...(props.value.visualNarrativeEnabled !== undefined
                    ? {
                        visualNarrativeEnabled:
                          props.value.visualNarrativeEnabled,
                      }
                    : {}),
                })
              }
              padding={3}
              variant={selected ? "blue" : "default"}
            >
              <VStack gap={1}>
                <Text type="label" weight="semibold">
                  {option.title}
                </Text>
                <Text type="supporting" color="secondary">
                  {option.description}
                </Text>
              </VStack>
            </SelectableCard>
          );
        })}
      </Grid>
      <VStack gap={1}>
        <Text type="label">
          {props.lang === "th"
            ? "การนำลุคไปใช้ตอนคิดเรื่อง"
            : "Use this look during story planning"}
        </Text>
        <Text type="supporting" color="secondary">
          {props.lang === "th"
            ? "เป็นแนวทางเสริมเท่านั้น ไม่สามารถเขียนทับพล็อต ตัวละคร ปม หรือความต่อเนื่องที่ผู้ใช้กำหนด"
            : "This is additive guidance only; it never overrides the premise, characters, plot threads, or continuity."}
        </Text>
        <Grid columns={{ minWidth: 240, max: 2, repeat: "fit" }} gap={2}>
          {[
            {
              key: "story",
              enabled: true,
              title:
                props.lang === "th"
                  ? "ใช้ช่วยคิดเรื่องและงานภาพ"
                  : "Use for story direction and visuals",
              description:
                props.lang === "th"
                  ? "AI จะสกัด Visual Narrative DNA เพื่อช่วยเลือกฉาก อารมณ์ motif และภาษาภาพของความสัมพันธ์ โดยไม่ล็อกพล็อต"
                  : "AI derives Visual Narrative DNA for scene texture, motifs, emotion, and relationship staging without locking the plot.",
            },
            {
              key: "visual-only",
              enabled: false,
              title:
                props.lang === "th"
                  ? "ใช้กับงานภาพเท่านั้น"
                  : "Use for visuals only",
              description:
                props.lang === "th"
                  ? "ลุคจะถูกใช้ตอนสร้างภาพตัวละคร ฉาก และเฟรมเท่านั้น เหมาะกับเรื่องเดิมที่ไม่ต้องการให้วางโครงใหม่"
                  : "The look is used for character, location, and frame generation only; story planning stays unchanged.",
            },
          ].map(option => {
            const selected =
              props.value.visualNarrativeEnabled === option.enabled;
            return (
              <SelectableCard
                key={option.key}
                label={option.title}
                isSelected={selected}
                isDisabled={props.isDisabled || props.value.mode === "none"}
                onChange={isSelected =>
                  isSelected &&
                  props.onChange({
                    ...props.value,
                    visualNarrativeEnabled: option.enabled,
                  })
                }
                padding={3}
                variant={selected ? "blue" : "default"}
              >
                <VStack gap={1}>
                  <Text type="label" weight="semibold">
                    {option.title}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {option.description}
                  </Text>
                </VStack>
              </SelectableCard>
            );
          })}
        </Grid>
        {props.value.mode === "none" && (
          <Text type="supporting" color="secondary">
            {props.lang === "th"
              ? "เลือก look ก่อน จึงจะเปิดการนำไปใช้ตอนคิดเรื่องได้"
              : "Choose a look first to enable story-planning use."}
          </Text>
        )}
      </VStack>
    </VStack>
  );
}
