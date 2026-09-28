import { canonicalJsonStringify, sha256Hex } from "./artifacts";

export type StoryConsistencySeverity = "warning" | "major";

export type StoryConsistencyFinding = {
  code:
  | "premise_knowledge_contradiction"
  | "secret_visibility_ambiguous"
  | "knowledge_state_leak"
  | "repeated_event_without_cause"
  | "repeated_dialogue";
  severity: StoryConsistencySeverity;
  episodeNumber: number;
  shotNumber?: number;
  message: string;
  repairInstruction: string;
  relatedEpisodeNumbers: number[];
};

export type StoryConsistencyReport = {
  passed: boolean;
  findings: StoryConsistencyFinding[];
  eventFingerprints: Array<{
    fingerprint: string;
    episodeNumber: number;
    shotNumber: number;
  }>;
};

export type StoryConsistencyInput = {
  output: unknown;
  canonicalStory?: unknown;
  protagonistNames?: string[];
  maxFindings?: number;
};

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenText(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) output.push(value.trim());
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, output);
    return output;
  }
  const object = record(value);
  if (object) for (const item of Object.values(object)) flattenText(item, output);
  return output;
}

function episodeList(output: unknown): AnyRecord[] {
  const root = record(output);
  const raw = Array.isArray(output)
    ? output
    : root?.episodeBreakdown ?? root?.episodes ?? [];
  return Array.isArray(raw)
    ? raw.map(record).filter((item): item is AnyRecord => item !== null)
    : [];
}

function episodeNumber(episode: AnyRecord): number {
  const value = Number(episode.episodeNumber ?? episode.episode ?? NaN);
  return Number.isInteger(value) ? value : 0;
}

function shotList(episode: AnyRecord): AnyRecord[] {
  const raw = episode.shotDrafts ?? episode.shots ?? [];
  return Array.isArray(raw)
    ? raw.map(record).filter((item): item is AnyRecord => item !== null)
    : [];
}

function shotNumber(shot: AnyRecord, index: number): number {
  const value = Number(shot.shot_number ?? shot.shotNumber ?? index + 1);
  return Number.isInteger(value) ? value : index + 1;
}

function shotText(shot: AnyRecord): string {
  const lines = shot.dialogue_lines ?? shot.dialogue ?? [];
  return flattenText([
    shot.summary,
    shot.action,
    shot.location,
    shot.location_key,
    shot.characters,
    lines,
  ]).join(" ");
}

function dialogueLines(shot: AnyRecord): string[] {
  const raw = shot.dialogue_lines ?? shot.dialogue ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(line => {
      if (typeof line === "string") return line;
      return text(record(line)?.line);
    })
    .filter(Boolean);
}

function containsAny(value: string, needles: string[]): boolean {
  const normalized = normalize(value);
  return needles.some(needle => normalized.includes(normalize(needle)));
}

function characterNames(shot: AnyRecord): string[] {
  const raw = shot.characters;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(character =>
      typeof character === "string" ? character : text(record(character)?.name)
    )
    .filter(Boolean);
}

function hasExplicitSeparation(shot: AnyRecord, combinedText: string): boolean {
  const metadata = record(shot.visibility) ?? record(shot.disclosure) ?? {};
  if (
    metadata.heardBy &&
    Array.isArray(metadata.heardBy) &&
    metadata.heardBy.length === 0
  )
    return true;
  if (metadata.audible === false || metadata.visible === false) return true;
  return containsAny(combinedText, [
    "ไม่ได้ยิน",
    "ไม่ได้อยู่ในห้อง",
    "อยู่นอกฉาก",
    "คนละห้อง",
    "หลังจากออกไปแล้ว",
    "หลังจากเธอออกไป",
    "แยกฉาก",
  ]);
}

function eventKind(value: string): string | null {
  if (containsAny(value, ["ล้ม", "สะดุด", "หกล้ม", "fall", "trip"])) return "fall";
  if (containsAny(value, ["ช่วยพยุง", "ช่วยเหลือ", "ช่วยคนเจ็บ", "rescue"])) return "rescue";
  if (containsAny(value, ["ขโมยเด็ก", "พาเด็กออก", "ลักพาตัว"])) return "child_removal";
  return null;
}

function eventActor(value: string, names: string[]): string {
  return names.find(name => normalize(value).includes(normalize(name))) ?? "unknown";
}

function findingKey(finding: StoryConsistencyFinding): string {
  return `${finding.code}:${finding.episodeNumber}:${finding.shotNumber ?? 0}:${finding.message}`;
}

export function inspectStoryConsistency(
  input: StoryConsistencyInput
): StoryConsistencyReport {
  const episodes = episodeList(input.output).sort(
    (a, b) => episodeNumber(a) - episodeNumber(b)
  );
  const protagonistNames = new Set<string>([
    ...(input.protagonistNames ?? ["พิมพ์ชนก", "protagonist"]),
  ]);
  const names = new Set<string>(protagonistNames);
  for (const episode of episodes)
    for (const shot of shotList(episode))
      for (const name of characterNames(shot)) names.add(name);

  const findings: StoryConsistencyFinding[] = [];
  const events: Array<{
    fingerprint: string;
    episodeNumber: number;
    shotNumber: number;
    text: string;
    generated: boolean;
  }> = [];
  const dialogueOccurrences = new Map<
    string,
    Array<{ episodeNumber: number; shotNumber: number; generated: boolean }>
  >();

  const canonicalText = flattenText(input.canonicalStory).join(" ");
  const generatedText = flattenText(input.output).join(" ");
  const canonicalSaysUnaware = containsAny(canonicalText, [
    "ขโมยเด็กไปหนึ่งคนโดยไม่รู้ว่ามีแฝดอีกคน",
    "ไม่รู้ว่ามีแฝด",
    "ไม่รู้ว่ามีลูกแฝด",
    "ไม่รู้ว่ามีลูกอีกคน",
    "ไม่รู้ว่ามีลูกคนที่สอง",
    "stole one child without knowing there was another twin",
  ]);
  const generatedCoordinatesTheSecret = containsAny(generatedText, [
    "อีกคนต้องหายไปคืนนี้",
    "ปล่อยให้เธอคิดว่ามีลูกคนเดียวไป",
    "คิดว่ามีลูกคนเดียว",
    "วางแผนพาเด็กอีกคน",
    "วางแผนซ่อนเด็กอีกคน",
    "coordinate the removal",
  ]);
  if (
    canonicalSaysUnaware &&
    generatedCoordinatesTheSecret
  ) {
    findings.push({
      code: "premise_knowledge_contradiction",
      severity: "major",
      episodeNumber: 1,
      message:
        "The canonical premise says the child thief does not know about the twin, but the generated scenes coordinate the removal of the other child.",
      repairInstruction:
        "Choose one canonical knowledge state. Either make the thief unaware and remove coordinated knowledge, or revise the premise so the family knowingly hides the second child; keep the protagonist unaware in both cases.",
      relatedEpisodeNumbers: [1, 2],
    });
  }

  const canonicalRecord = record(input.canonicalStory);
  const baselineEpisodes = episodeList(canonicalRecord?.activeBreakdown);
  for (const episode of baselineEpisodes)
    for (const shot of shotList(episode))
      for (const name of characterNames(shot)) names.add(name);

  for (const episode of episodes) {
    const number = episodeNumber(episode);
    const episodeText = flattenText(episode).join(" ");
    const memory = record(episode.episode_memory ?? episode.episodeMemory);
    const knowledgeChanges = Array.isArray(memory?.knowledge_changes)
      ? memory.knowledge_changes
      : Array.isArray(memory?.knowledgeChanges)
        ? memory.knowledgeChanges
        : [];
    for (const shot of shotList(episode)) {
      const currentShot = shotNumber(shot, shotList(episode).indexOf(shot));
      const currentText = shotText(shot);
      const secret = containsAny(currentText, [
        "อีกคน",
        "มีลูกคนเดียว",
        "แฝด",
        "เด็กอีกคน",
        "หายไปคืนนี้",
        "ขโมยเด็ก",
        "เอาไปได้คนเดียว",
        "พาไปได้คนเดียว",
      ]);
      const protagonistPresent = [...protagonistNames].some(name =>
        normalize(currentText).includes(normalize(name))
      );
      if (secret && protagonistPresent && !hasExplicitSeparation(shot, currentText)) {
        findings.push({
          code: "secret_visibility_ambiguous",
          severity: "major",
          episodeNumber: number,
          shotNumber: currentShot,
          message:
            "A secret about the second child is authored in a shot that also places the protagonist in the scene without proving she cannot hear or see it.",
          repairInstruction:
            "Separate the conversation spatially or temporally, explicitly mark that the protagonist cannot hear/see it, or rewrite the dialogue so the secret is not disclosed in her presence.",
          relatedEpisodeNumbers: [number],
        });
      }

      for (const line of dialogueLines(shot)) {
        const normalizedLine = normalize(line);
        if (normalizedLine.length < 18) continue;
        const occurrences = dialogueOccurrences.get(normalizedLine) ?? [];
        occurrences.push({
          episodeNumber: number,
          shotNumber: currentShot,
          generated: true,
        });
        dialogueOccurrences.set(normalizedLine, occurrences);
      }

      const kind = eventKind(currentText);
      if (kind) {
        const actor = eventActor(currentText, [...names]);
        // A generic action such as "ล้ม" or "ช่วย" is not enough evidence
        // that the same event repeated across episodes. Without a named
        // actor, skip the cross-episode fingerprint to avoid turning benign
        // unrelated actions into repair loops.
        if (actor === "unknown") continue;
        events.push({
          fingerprint: sha256Hex(
            canonicalJsonStringify({ actor, kind })
          ).slice(0, 24),
          episodeNumber: number,
          shotNumber: currentShot,
          text: currentText,
          generated: true,
        });
      }
    }

    for (const change of knowledgeChanges) {
      const changeRecord = record(change);
      const characterKey = text(
        changeRecord?.character_key ?? changeRecord?.characterKey
      );
      const learned = text(changeRecord?.learned ?? changeRecord?.fact);
      if (
        characterKey &&
        learned &&
        containsAny(learned, ["อีกคน", "แฝด", "ลูกคนที่สอง"]) &&
        containsAny(characterKey, [...protagonistNames]) &&
        containsAny(episodeText, ["ไม่รู้ว่ามีแฝด", "ไม่รู้ว่ามีลูกอีกคน"]) &&
        containsAny(episodeText, [
          "เพิ่งรู้ว่ามีแฝด",
          "ได้รู้ว่ามีแฝด",
          "เปิดเผยเรื่องแฝด",
          "ความจริงเรื่องแฝดถูกเปิดเผย",
        ])
      ) {
        findings.push({
          code: "knowledge_state_leak",
          severity: "major",
          episodeNumber: number,
          message: "Episode memory claims the protagonist learns the twin fact while the same season claims she remains unaware.",
          repairInstruction: "Align episode_memory.knowledge_changes with the canonical disclosure episode; do not mark the protagonist as learning the twin fact before the reveal.",
          relatedEpisodeNumbers: [number],
        });
      }
    }
  }

  // Extension runs validate only the newly generated horizon. Index the
  // already-authored breakdown as a read-only baseline so a repeated helper
  // event or copied line across the horizon boundary is still detected.
  // Findings are emitted only for generated occurrences; old content is never
  // re-reported as if it were newly introduced by this run.
  for (const episode of baselineEpisodes) {
    const number = episodeNumber(episode);
    for (const shot of shotList(episode)) {
      const currentShot = shotNumber(shot, shotList(episode).indexOf(shot));
      for (const line of dialogueLines(shot)) {
        const normalizedLine = normalize(line);
        if (normalizedLine.length < 18) continue;
        const occurrences = dialogueOccurrences.get(normalizedLine) ?? [];
        occurrences.push({
          episodeNumber: number,
          shotNumber: currentShot,
          generated: false,
        });
        dialogueOccurrences.set(normalizedLine, occurrences);
      }
      const currentText = shotText(shot);
      const kind = eventKind(currentText);
      if (!kind) continue;
      const actor = eventActor(currentText, [...names]);
      if (actor === "unknown") continue;
      events.push({
        fingerprint: sha256Hex(
          canonicalJsonStringify({ actor, kind })
        ).slice(0, 24),
        episodeNumber: number,
        shotNumber: currentShot,
        text: currentText,
        generated: false,
      });
    }
  }

  const groupedEvents = new Map<string, typeof events>();
  for (const event of events) {
    const group = groupedEvents.get(event.fingerprint) ?? [];
    group.push(event);
    groupedEvents.set(event.fingerprint, group);
  }
  for (const group of groupedEvents.values()) {
    const episodeNumbers = [...new Set(group.map(item => item.episodeNumber))];
    if (episodeNumbers.length < 2) continue;
    const later = group.filter(event => event.generated);
    for (const event of later) {
      const priorEpisodeNumbers = [
        ...new Set(
          group
            .filter(other => other.episodeNumber < event.episodeNumber)
            .map(other => other.episodeNumber)
        ),
      ];
      if (priorEpisodeNumbers.length === 0) continue;
      if (containsAny(event.text, ["ครั้งต่อมา", "ตามหา", "ติดตาม", "ตั้งใจ", "ต่อเนื่อง"])) continue;
      findings.push({
        code: "repeated_event_without_cause",
        severity: "warning",
        episodeNumber: event.episodeNumber,
        shotNumber: event.shotNumber,
        message: `The same ${event.fingerprint} character-event pattern repeats without a stated causal distinction.`,
        repairInstruction: "Give the repeated event a distinct cause and narrative purpose, or replace it with a new action that advances the story.",
        relatedEpisodeNumbers: [
          ...new Set([...priorEpisodeNumbers, event.episodeNumber]),
        ],
      });
    }
  }

  for (const [line, occurrences] of dialogueOccurrences) {
    const episodeNumbers = [...new Set(occurrences.map(item => item.episodeNumber))];
    if (episodeNumbers.length < 2) continue;
    const generatedOccurrences = occurrences.filter(item => item.generated);
    if (generatedOccurrences.length === 0) continue;
    const occurrence = generatedOccurrences[generatedOccurrences.length - 1];
    findings.push({
      code: "repeated_dialogue",
      severity: "warning",
      episodeNumber: occurrence.episodeNumber,
      shotNumber: occurrence.shotNumber,
      message: `A dialogue line is repeated across episodes: ${line}`,
      repairInstruction: "Rewrite the repeated line with a new intention or add a meaningful callback so it is not accidental duplication.",
      relatedEpisodeNumbers: episodeNumbers,
    });
  }

  const uniqueFindings = [...new Map(findings.map(item => [findingKey(item), item])).values()];
  const limited = uniqueFindings.slice(0, input.maxFindings ?? 64);
  return {
    passed: limited.length === 0,
    findings: limited,
    eventFingerprints: events.filter(event => event.generated).map(
      ({ text: _text, generated: _generated, ...event }) => event
    ),
  };
}

export function formatStoryConsistencyRepairInstructions(
  findings: readonly StoryConsistencyFinding[]
): string {
  if (findings.length === 0) return "";
  return [
    "STORY CONSISTENCY REPAIR — apply these findings before returning the draft:",
    ...findings.map(
      finding =>
        `- [${finding.code}] episode ${finding.episodeNumber}${finding.shotNumber ? ` shot ${finding.shotNumber}` : ""}: ${finding.repairInstruction}`
    ),
    "Preserve the approved premise, character identities, episode count, and intended reveal order. Return a complete draft, not a repair report.",
  ].join("\n");
}
