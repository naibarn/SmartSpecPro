import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Layers3,
  Lightbulb,
  RotateCcw,
  Search,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  PERSONA_GENDERS,
  PERSONA_TEMPLATE_CATEGORIES,
  PERSONA_TEMPLATES,
  type PersonaTemplateDefinition,
} from "./personaTemplates";
import {
  PERSONA_WEEKDAY_KEYS,
  applyTemplatesToPersonaForm,
  formatPersonaWorkingHoursSummary,
  type PersonaAssistantGender,
  type PersonaFormData,
  type PersonaTone,
} from "./personaForm";
import { trackPersonaTemplateApplied } from "@/lib/analytics/personaEvents";

const WEEKDAY_LABELS: Record<(typeof PERSONA_WEEKDAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const TONE_META: Record<PersonaTone, { emoji: string; description: string }> = {
  formal: {
    emoji: "🎩",
    description:
      "Precise, professional language. No slang or contractions. Ideal for legal, financial, medical, or executive communications.",
  },
  casual: {
    emoji: "😊",
    description:
      "Relaxed, conversational style. Uses contractions and informal phrasing. Great for day-to-day assistance and quick answers.",
  },
  friendly: {
    emoji: "🤝",
    description:
      "Warm, encouraging, and approachable. Balances professionalism with a human touch. Good for onboarding, support, and general help.",
  },
  technical: {
    emoji: "🔧",
    description:
      "Uses exact technical terminology, code snippets, and step-by-step detail. Best for developers, engineers, and data analysts.",
  },
  creative: {
    emoji: "🎨",
    description:
      "Expressive, imaginative, and unconventional. May use metaphors, storytelling, and vivid language. Ideal for writing and brainstorming.",
  },
};

interface PersonaEditorFieldsProps {
  form: PersonaFormData;
  setForm: Dispatch<SetStateAction<PersonaFormData>>;
  editorMode: "create" | "edit";
  analyticsSurface: "settings_personas" | "teams_personas";
  defaultShowTemplates?: boolean;
  defaultShowAdvanced?: boolean;
  requireTemplate?: boolean;
  requireName?: boolean;
}

export function PersonaEditorFields({
  form,
  setForm,
  editorMode,
  analyticsSurface,
  defaultShowTemplates = false,
  defaultShowAdvanced = true,
  requireTemplate = false,
  requireName = true,
}: PersonaEditorFieldsProps) {
  const [showTemplates, setShowTemplates] = useState(defaultShowTemplates);
  const [showToneInfo, setShowToneInfo] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  type PersonaTemplateCategory = (typeof PERSONA_TEMPLATE_CATEGORIES)[number];
  const [activeTemplateCategory, setActiveTemplateCategory] =
    useState<PersonaTemplateCategory>("All");
  const [mixMode, setMixMode] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [newRestriction, setNewRestriction] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(defaultShowAdvanced);

  const visibleTemplates = PERSONA_TEMPLATES.filter((template) => {
    const matchesCategory =
      activeTemplateCategory === "All" || template.category === activeTemplateCategory;
    const normalizedQuery = templateQuery.trim().toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [template.label, template.description, template.category].join(" ").toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });

  const selectedTemplateSummary =
    form.sourceTemplateLabels.length > 0
      ? form.sourceTemplateLabels.join(", ")
      : "No template selected";

  function updateForm<K extends keyof PersonaFormData>(key: K, value: PersonaFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyTemplateApplication(templates: PersonaTemplateDefinition[]) {
    const nextForm = applyTemplatesToPersonaForm(form, templates);
    setForm(nextForm);
    trackPersonaTemplateApplied({
      templateIds: nextForm.sourceTemplateIds,
      templateLabels: nextForm.sourceTemplateLabels,
      templateCategories: nextForm.sourceTemplateCategories,
      templateCount: nextForm.sourceTemplateIds.length,
      applyMode: nextForm.sourceTemplateIds.length > 1 ? "mixed" : "single",
      editorMode,
      surface: analyticsSurface,
    });
    setShowTemplates(false);
    setMixMode(false);
    setSelectedTemplateIds([]);
  }

  function applyTemplate(template: PersonaTemplateDefinition) {
    applyTemplateApplication([template]);
  }

  function toggleTemplateSelection(templateId: string) {
    setSelectedTemplateIds((current) => {
      if (current.includes(templateId)) {
        return current.filter((id) => id !== templateId);
      }
      if (current.length >= 3) {
        toast.error("You can mix up to 3 templates at once");
        return current;
      }
      return [...current, templateId];
    });
  }

  function applyMixedTemplates() {
    const selectedTemplates = PERSONA_TEMPLATES.filter((template) =>
      selectedTemplateIds.includes(template.id),
    );
    if (selectedTemplates.length < 2) {
      toast.error("Select at least 2 templates to create a mixed persona");
      return;
    }
    applyTemplateApplication(selectedTemplates);
  }

  function addRestriction() {
    if (!newRestriction.trim()) return;
    if (form.restrictions.length >= 20) return;

    updateForm("restrictions", [...form.restrictions, newRestriction.trim()]);
    setNewRestriction("");
  }

  function removeRestriction(index: number) {
    updateForm(
      "restrictions",
      form.restrictions.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {editorMode === "edit" ? "Edit Persona" : "New Persona"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose a template, set the persona name, nickname, gender style, tone, and optionally define working hours.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTemplates((value) => !value)}
          className="gap-1"
        >
          <Wand2 className="h-4 w-4" />
          Templates
          {showTemplates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {showTemplates && (
        <div className="rounded-xl border bg-background p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed Quick-Start Templates - Click to Load Into Form
          </p>
          <p className="text-xs text-muted-foreground">
            {PERSONA_TEMPLATES.length} templates covering engineering, legal, research,
            finance, marketing, operations, healthcare, education, and more.
          </p>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={templateQuery}
                onChange={(event) => setTemplateQuery(event.target.value)}
                placeholder="Search by role, industry, or use case"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={mixMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMixMode((current) => {
                    const next = !current;
                    if (!next) setSelectedTemplateIds([]);
                    return next;
                  });
                }}
              >
                <Layers3 className="mr-1 h-4 w-4" />
                Mix templates
              </Button>
              {selectedTemplateIds.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTemplateIds([])}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERSONA_TEMPLATE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveTemplateCategory(category)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  activeTemplateCategory === category
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          {mixMode && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-relaxed text-primary">
                Mix up to 3 templates for multi-role personas. The selected template origins are kept for later analysis.
              </div>
              <Button
                type="button"
                size="sm"
                onClick={applyMixedTemplates}
                disabled={selectedTemplateIds.length < 2}
              >
                Apply combined template ({selectedTemplateIds.length}/3)
              </Button>
            </div>
          )}
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visibleTemplates.map((template) => {
                const isSelected = selectedTemplateIds.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => (mixMode ? toggleTemplateSelection(template.id) : applyTemplate(template))}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="text-base leading-none">{template.icon}</span>
                      <span>{template.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{template.description}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {template.category}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {template.tone}
                      </span>
                      {isSelected && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                          selected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {visibleTemplates.length === 0 && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No templates match this search/filter yet. Try another keyword or switch category.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Template: <span className="font-medium text-foreground">{selectedTemplateSummary}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Name {requireName ? <span className="text-destructive">*</span> : null}</Label>
          <Input
            value={form.name}
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="e.g. Legal Advisor, Code Reviewer"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            A short label you'll recognize in the persona picker.
          </p>
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            placeholder="Short summary of what this persona is for"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>AI Nickname</Label>
          <Input
            value={form.assistantNickname}
            onChange={(event) => updateForm("assistantNickname", event.target.value)}
            placeholder="e.g. น้องเจน, Coach Max, Analyst Aom"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Used as the AI's self-introduction name.
          </p>
        </div>
        <div>
          <Label>Gender Style</Label>
          <Select
            value={form.assistantGender}
            onValueChange={(value) => updateForm("assistantGender", value as PersonaAssistantGender)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSONA_GENDERS.map((gender) => (
                <SelectItem key={gender} value={gender}>
                  <span className="capitalize">{gender}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Shapes self-reference and Thai politeness style.
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label>Tone</Label>
          <button
            type="button"
            onClick={() => setShowToneInfo((current) => !current)}
            className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
          >
            <Info className="h-3 w-3" />
            {showToneInfo ? "Hide details" : "What do these mean?"}
          </button>
        </div>
        <Select value={form.tone} onValueChange={(value) => updateForm("tone", value as PersonaTone)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TONE_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <span>{meta.emoji}</span>
                  <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showToneInfo && (
          <div className="mt-2 space-y-1.5 rounded-xl border bg-background p-3">
            {Object.entries(TONE_META).map(([key, meta]) => (
              <div
                key={key}
                className={`flex items-start gap-2 rounded-lg p-2 text-xs ${form.tone === key ? "bg-primary/5" : ""}`}
              >
                <span className="mt-0.5 text-sm leading-none">{meta.emoji}</span>
                <div>
                  <span className="font-semibold capitalize text-foreground">{key}:</span>{" "}
                  <span className="text-muted-foreground">{meta.description}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Working Hours</p>
            <p className="text-xs text-muted-foreground">
              Leave this off to make the persona available 24/7. Turn it on to define working days and time windows for future automation.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.workingHours.enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  workingHours: {
                    ...prev.workingHours,
                    enabled: event.target.checked,
                  },
                }))
              }
            />
            Use working hours
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Current availability:{" "}
          <span className="font-medium text-foreground">
            {formatPersonaWorkingHoursSummary(
              form.workingHours.enabled
                ? {
                    timezone: form.workingHours.timezone,
                    days: PERSONA_WEEKDAY_KEYS.reduce((acc, day) => {
                      const workingDay = form.workingHours.days[day];
                      if (!workingDay.enabled) return acc;
                      acc[day] = {
                        startTime: workingDay.startTime,
                        endTime: workingDay.endTime,
                      };
                      return acc;
                    }, {} as Partial<Record<(typeof PERSONA_WEEKDAY_KEYS)[number], {
                      startTime: string;
                      endTime: string;
                    }>>),
                  }
                : null,
            )}
          </span>
        </p>
        {form.workingHours.enabled && (
          <div className="mt-3 space-y-4">
            <div>
              <Label>Timezone</Label>
              <Input
                value={form.workingHours.timezone}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workingHours: {
                      ...prev.workingHours,
                      timezone: event.target.value,
                    },
                  }))
                }
                placeholder="e.g. Asia/Bangkok"
                className="mt-1"
              />
            </div>
            <div className="space-y-3">
              {PERSONA_WEEKDAY_KEYS.map((day) => {
                const workingDay = form.workingHours.days[day];
                return (
                  <div
                    key={day}
                    className="grid gap-3 rounded-xl border border-border/60 bg-background/80 p-3 md:grid-cols-[140px_110px_minmax(0,1fr)_minmax(0,1fr)] md:items-center"
                  >
                    <div className="font-medium text-sm text-foreground">
                      {WEEKDAY_LABELS[day]}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={workingDay.enabled}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            workingHours: {
                              ...prev.workingHours,
                              days: {
                                ...prev.workingHours.days,
                                [day]: {
                                  ...prev.workingHours.days[day],
                                  enabled: event.target.checked,
                                },
                              },
                            },
                          }))
                        }
                      />
                      Working
                    </label>
                    <div>
                      <Label className="text-xs">{WEEKDAY_LABELS[day]} Start</Label>
                      <Input
                        type="time"
                        value={workingDay.startTime}
                        disabled={!workingDay.enabled}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            workingHours: {
                              ...prev.workingHours,
                              days: {
                                ...prev.workingHours.days,
                                [day]: {
                                  ...prev.workingHours.days[day],
                                  startTime: event.target.value,
                                },
                              },
                            },
                          }))
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{WEEKDAY_LABELS[day]} End</Label>
                      <Input
                        type="time"
                        value={workingDay.endTime}
                        disabled={!workingDay.enabled}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            workingHours: {
                              ...prev.workingHours,
                              days: {
                                ...prev.workingHours.days,
                                [day]: {
                                  ...prev.workingHours.days[day],
                                  endTime: event.target.value,
                                },
                              },
                            },
                          }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Advanced Prompt Settings</p>
            <p className="text-xs text-muted-foreground">
              Optional. Use this when you want to tweak the generated template prompt or add extra restrictions.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? "Hide" : "Show"}
          </Button>
        </div>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div>
              <Label>
                System Prompt Prefix <span className="text-destructive">*</span>
              </Label>
              <div className="mb-2 mt-2 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <div className="flex items-center gap-1 font-semibold">
                  <Lightbulb className="h-3.5 w-3.5" />
                  How this field works
                </div>
                <p>
                  This text is injected at the start of the system prompt for every conversation
                  that uses this persona.
                </p>
              </div>
              <Textarea
                value={form.systemPromptPrefix}
                onChange={(event) => updateForm("systemPromptPrefix", event.target.value)}
                rows={7}
                maxLength={2000}
                className="mt-1 font-mono text-sm"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Use bullet points and clear structure — the AI follows formatting cues in the prompt.
                </p>
                <p className={`text-xs font-mono ${form.systemPromptPrefix.length > 1800 ? "text-orange-500" : "text-muted-foreground"}`}>
                  {form.systemPromptPrefix.length}/2000
                </p>
              </div>
            </div>

            <div>
              <Label>Response Language</Label>
              <Input
                value={form.language}
                onChange={(event) => updateForm("language", event.target.value)}
                placeholder="auto"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use <span className="font-medium">auto</span> to match the user's language, or enter a specific language code such as <span className="font-mono">en</span> or <span className="font-mono">th</span>.
              </p>
            </div>

            <div>
              <Label>Restrictions</Label>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">
                Hard rules the AI must follow regardless of what the user asks.
              </p>
              <div className="mb-2 flex gap-2">
                <Input
                  value={newRestriction}
                  onChange={(event) => setNewRestriction(event.target.value)}
                  placeholder='e.g. "Do not provide specific legal advice"'
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addRestriction();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRestriction}
                  disabled={!newRestriction.trim() || form.restrictions.length >= 20}
                >
                  Add
                </Button>
              </div>
              {form.restrictions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.restrictions.map((restriction, index) => (
                    <button
                      key={`${restriction}-${index}`}
                      type="button"
                      onClick={() => removeRestriction(index)}
                      className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      {restriction} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
