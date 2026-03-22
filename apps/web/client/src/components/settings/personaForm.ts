import {
  PERSONA_GENDERS,
  PERSONA_TONES,
  buildPersonaApplication,
  type PersonaTemplateDefinition,
} from "./personaTemplates";

export type PersonaAssistantGender = (typeof PERSONA_GENDERS)[number];
export type PersonaTone = (typeof PERSONA_TONES)[number];

export const PERSONA_WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type PersonaWeekdayKey = (typeof PERSONA_WEEKDAY_KEYS)[number];

export interface PersonaWorkingHoursDay {
  startTime: string;
  endTime: string;
}

export interface PersonaWorkingHoursLegacy {
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface PersonaWorkingHoursWeekly {
  timezone: string;
  days: Partial<Record<PersonaWeekdayKey, PersonaWorkingHoursDay>>;
}

export type PersonaWorkingHoursValue =
  | PersonaWorkingHoursLegacy
  | PersonaWorkingHoursWeekly;

export interface PersonaWorkingHoursDayForm extends PersonaWorkingHoursDay {
  enabled: boolean;
}

export interface PersonaWorkingHoursForm {
  enabled: boolean;
  timezone: string;
  days: Record<PersonaWeekdayKey, PersonaWorkingHoursDayForm>;
}

export interface PersonaFormData {
  name: string;
  description: string;
  assistantNickname: string;
  assistantGender: PersonaAssistantGender;
  sourceTemplateIds: string[];
  sourceTemplateLabels: string[];
  sourceTemplateCategories: string[];
  systemPromptPrefix: string;
  tone: PersonaTone;
  language: string;
  restrictions: string[];
  workingHours: PersonaWorkingHoursForm;
}

export interface PersonaMutationFields {
  name: string;
  description: string | null;
  assistantNickname: string | null;
  assistantGender: PersonaAssistantGender;
  sourceTemplateIds: string[];
  sourceTemplateLabels: string[];
  sourceTemplateCategories: string[];
  systemPromptPrefix: string;
  tone: PersonaTone;
  language: string;
  restrictions: string[];
  workingHours: {
    timezone: string;
    days: Partial<Record<PersonaWeekdayKey, PersonaWorkingHoursDay>>;
  } | null;
}

function createDefaultWorkingDay(): PersonaWorkingHoursDayForm {
  return {
    enabled: true,
    startTime: "09:00",
    endTime: "18:00",
  };
}

function createDefaultWorkingHoursDays(): Record<PersonaWeekdayKey, PersonaWorkingHoursDayForm> {
  return {
    monday: createDefaultWorkingDay(),
    tuesday: createDefaultWorkingDay(),
    wednesday: createDefaultWorkingDay(),
    thursday: createDefaultWorkingDay(),
    friday: createDefaultWorkingDay(),
    saturday: {
      enabled: false,
      startTime: "09:00",
      endTime: "18:00",
    },
    sunday: {
      enabled: false,
      startTime: "09:00",
      endTime: "18:00",
    },
  };
}

function isLegacyWorkingHours(
  workingHours: PersonaWorkingHoursValue | null | undefined,
): workingHours is PersonaWorkingHoursLegacy {
  return Boolean(
    workingHours &&
      "startTime" in workingHours &&
      "endTime" in workingHours &&
      "timezone" in workingHours,
  );
}

function createWorkingHoursForm(
  workingHours?: PersonaWorkingHoursValue | null,
): PersonaWorkingHoursForm {
  const timezone = workingHours?.timezone || getDefaultPersonaTimezone();
  const days = createDefaultWorkingHoursDays();

  if (!workingHours) {
    return {
      enabled: false,
      timezone,
      days,
    };
  }

  if (isLegacyWorkingHours(workingHours)) {
    for (const day of PERSONA_WEEKDAY_KEYS) {
      days[day] = {
        enabled: true,
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
      };
    }

    return {
      enabled: true,
      timezone: workingHours.timezone,
      days,
    };
  }

  for (const day of PERSONA_WEEKDAY_KEYS) {
    const workingDay = workingHours.days[day];
    if (workingDay) {
      days[day] = {
        enabled: true,
        startTime: workingDay.startTime,
        endTime: workingDay.endTime,
      };
    } else {
      days[day] = {
        ...days[day],
        enabled: false,
      };
    }
  }

  return {
    enabled: Object.keys(workingHours.days).length > 0,
    timezone,
    days,
  };
}

export function getDefaultPersonaTimezone(): string {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return "UTC";
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function createEmptyPersonaForm(): PersonaFormData {
  return {
    name: "",
    description: "",
    assistantNickname: "",
    assistantGender: "neutral",
    sourceTemplateIds: [],
    sourceTemplateLabels: [],
    sourceTemplateCategories: [],
    systemPromptPrefix: "",
    tone: "friendly",
    language: "auto",
    restrictions: [],
    workingHours: {
      enabled: false,
      timezone: getDefaultPersonaTimezone(),
      days: createDefaultWorkingHoursDays(),
    },
  };
}

export function applyTemplatesToPersonaForm(
  current: PersonaFormData,
  templates: PersonaTemplateDefinition[],
): PersonaFormData {
  const application = buildPersonaApplication(templates);

  return {
    ...current,
    name: application.name,
    description: application.description,
    assistantNickname: application.assistantNickname,
    assistantGender: application.assistantGender,
    sourceTemplateIds: application.sourceTemplateIds,
    sourceTemplateLabels: application.sourceTemplateLabels,
    sourceTemplateCategories: application.sourceTemplateCategories,
    systemPromptPrefix: application.prompt,
    tone: application.tone,
    language: application.language,
    restrictions: [...application.restrictions],
  };
}

export function mapPersonaToForm(persona: {
  name: string;
  description?: string | null;
  assistantNickname?: string | null;
  assistantGender?: PersonaAssistantGender | null;
  sourceTemplateIds?: string[] | null;
  sourceTemplateLabels?: string[] | null;
  sourceTemplateCategories?: string[] | null;
  systemPromptPrefix: string;
  tone?: PersonaTone | null;
  language?: string | null;
  restrictions?: string[] | null;
  workingHours?: PersonaWorkingHoursValue | null;
}): PersonaFormData {
  return {
    name: persona.name,
    description: persona.description || "",
    assistantNickname: persona.assistantNickname || "",
    assistantGender: persona.assistantGender || "neutral",
    sourceTemplateIds: persona.sourceTemplateIds || [],
    sourceTemplateLabels: persona.sourceTemplateLabels || [],
    sourceTemplateCategories: persona.sourceTemplateCategories || [],
    systemPromptPrefix: persona.systemPromptPrefix,
    tone: persona.tone || "friendly",
    language: persona.language || "auto",
    restrictions: persona.restrictions || [],
    workingHours: createWorkingHoursForm(persona.workingHours),
  };
}

export function buildPersonaMutationFields(form: PersonaFormData): PersonaMutationFields {
  const timezone = form.workingHours.timezone.trim() || getDefaultPersonaTimezone();
  const days = PERSONA_WEEKDAY_KEYS.reduce<Partial<Record<PersonaWeekdayKey, PersonaWorkingHoursDay>>>(
    (acc, day) => {
      const workingDay = form.workingHours.days[day];
      if (!workingDay.enabled) return acc;
      acc[day] = {
        startTime: workingDay.startTime,
        endTime: workingDay.endTime,
      };
      return acc;
    },
    {},
  );

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    assistantNickname: form.assistantNickname.trim() || null,
    assistantGender: form.assistantGender,
    sourceTemplateIds: [...form.sourceTemplateIds],
    sourceTemplateLabels: [...form.sourceTemplateLabels],
    sourceTemplateCategories: [...form.sourceTemplateCategories],
    systemPromptPrefix: form.systemPromptPrefix,
    tone: form.tone,
    language: form.language.trim() || "auto",
    restrictions: [...form.restrictions],
    workingHours: form.workingHours.enabled
      ? {
          timezone,
          days,
        }
      : null,
  };
}

const PERSONA_WEEKDAY_LABELS: Record<PersonaWeekdayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function formatDayRange(days: PersonaWeekdayKey[]): string {
  if (days.length === 1) return PERSONA_WEEKDAY_LABELS[days[0]];
  return `${PERSONA_WEEKDAY_LABELS[days[0]]}-${PERSONA_WEEKDAY_LABELS[days[days.length - 1]]}`;
}

export function formatPersonaWorkingHoursSummary(
  workingHours?: PersonaWorkingHoursValue | null,
): string {
  if (!workingHours) return "24/7";
  if (isLegacyWorkingHours(workingHours)) {
    return `Daily ${workingHours.startTime}-${workingHours.endTime} ${workingHours.timezone}`;
  }

  const segments: string[] = [];
  let currentDays: PersonaWeekdayKey[] = [];
  let currentWindow: string | null = null;

  for (const day of PERSONA_WEEKDAY_KEYS) {
    const workingDay = workingHours.days[day];
    const dayWindow = workingDay ? `${workingDay.startTime}-${workingDay.endTime}` : null;
    if (dayWindow && dayWindow === currentWindow) {
      currentDays.push(day);
      continue;
    }

    if (currentWindow && currentDays.length > 0) {
      segments.push(`${formatDayRange(currentDays)} ${currentWindow}`);
    }

    currentDays = dayWindow ? [day] : [];
    currentWindow = dayWindow;
  }

  if (currentWindow && currentDays.length > 0) {
    segments.push(`${formatDayRange(currentDays)} ${currentWindow}`);
  }

  if (segments.length === 0) {
    return `No active days ${workingHours.timezone}`;
  }

  return `${segments.join(", ")} ${workingHours.timezone}`;
}
