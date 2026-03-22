/**
 * PersonasPanel — Settings tab content for managing AI personas.
 * Rendered inside the main Settings page as the 'personas' tab.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Star,
  Bot,
  Info,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  PERSONA_TEMPLATE_IDEAS,
} from "./personaTemplates";
import { PersonaEditorFields } from "./PersonaEditorFields";
import {
  buildPersonaMutationFields,
  createEmptyPersonaForm,
  formatPersonaWorkingHoursSummary,
  mapPersonaToForm,
  type PersonaFormData,
} from "./personaForm";

// ─── Tone metadata ────────────────────────────────────────────────────────────

const TONE_META: Record<string, { emoji: string; description: string }> = {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function PersonasPanel() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaFormData>(createEmptyPersonaForm());

  const utils = trpc.useUtils();
  const { data: personas, isLoading } = trpc.persona.list.useQuery();

  const createMutation = trpc.persona.create.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      resetForm();
      toast.success("Persona created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.persona.update.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      resetForm();
      toast.success("Persona updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.persona.delete.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      toast.success("Persona deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const setDefaultMutation = trpc.persona.setUserDefault.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      toast.success("Default persona updated");
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setForm(createEmptyPersonaForm());
    setEditingId(null);
    setShowForm(false);
  }

  function handleSubmit() {
    const payload = buildPersonaMutationFields(form);
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        ...payload,
      });
    } else {
      createMutation.mutate({
        ...payload,
        scope: "user",
      });
    }
  }

  function handleEdit(persona: any) {
    setForm(mapPersonaToForm(persona));
    setEditingId(persona.id);
    setShowForm(true);
  }

  const userPersonas = personas?.filter((p) => p.scope === "user") || [];
  const otherPersonas = personas?.filter((p) => p.scope !== "user") || [];

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Personas</h2>
          <p className="text-gray-600">
            Customize how the AI assistant thinks, speaks, and behaves for each context
          </p>
        </div>
        <Button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Persona
        </Button>
      </div>

      {/* ── What is a Persona? callout ────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-blue-800 font-semibold">
          <Info className="w-4 h-4 flex-shrink-0" />
          What is a Persona?
        </div>
        <p className="text-sm text-blue-700 leading-relaxed">
          A persona is a reusable AI behavior template. When you activate a persona before
          starting a conversation, its <strong>System Prompt Prefix</strong> is automatically
          prepended to every request — shaping the AI's role, communication style, scope of
          knowledge, and output format.
        </p>
        <ul className="text-sm text-blue-700 space-y-1 list-none">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🔁</span>
            <span><strong>Reusable</strong> — create once, apply to any conversation.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🎯</span>
            <span><strong>Context-specific</strong> — switch between a Legal Advisor for contracts and a Code Reviewer for pull requests.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">⚡</span>
            <span><strong>Zero overhead</strong> — no need to repeat instructions every session; the persona handles it.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🛡️</span>
            <span><strong>Scoped</strong> — personal personas are private to you; tenant/platform personas are shared by your team.</span>
          </li>
        </ul>
      </div>

      {/* ── Create / Edit Form ────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 space-y-6">
          <PersonaEditorFields
            form={form}
            setForm={setForm}
            editorMode={editingId ? "edit" : "create"}
            analyticsSurface="settings_personas"
            defaultShowAdvanced
          />

          {form.systemPromptPrefix && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                System Prompt Preview
              </label>
              <p className="text-xs text-gray-400 mb-2">
                This is exactly what the AI receives at the start of each conversation when this
                persona is active.
              </p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs whitespace-pre-wrap max-h-40 overflow-auto font-mono border border-gray-700">
                {"[PERSONA START]\n"}
                {form.systemPromptPrefix}
                {"\n[PERSONA END]"}
                {form.restrictions.length > 0 &&
                  "\n\nRestrictions:\n" +
                    form.restrictions.map((r) => `- ${r}`).join("\n")}
              </pre>
            </div>
          )}

          {/* Form actions */}
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-200">
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !form.name ||
                !form.systemPromptPrefix ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {editingId ? "Update Persona" : "Create Persona"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Your Personas ─────────────────────────────────────────────────── */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Your Personas</h3>
        {isLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : userPersonas.length === 0 ? (
          <div className="space-y-4">
            {/* Empty state */}
            <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">No personal personas yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Create your first persona to give the AI a consistent role, voice, and focus for
                specific tasks.
              </p>
              <Button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create your first persona
              </Button>
            </div>

            {/* Inspiration cards */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Lightbulb className="h-3.5 w-3.5" />
                Persona ideas to get you started
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PERSONA_TEMPLATE_IDEAS.map((idea) => (
                  <div
                    key={idea.id}
                    className="p-3 bg-white border border-gray-200 rounded-xl"
                  >
                    <div className="text-2xl mb-1">{idea.icon}</div>
                    <div className="font-medium text-gray-700 text-sm">{idea.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      {idea.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {userPersonas.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                    {p.name}
                    {p.assistantNickname && (
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
                        @{p.assistantNickname}
                      </span>
                    )}
                    {p.tone && (
                      <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                        {TONE_META[p.tone]?.emoji} {p.tone}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                    {p.description || p.systemPromptPrefix.slice(0, 90) + "…"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Working hours: {formatPersonaWorkingHoursSummary(p.workingHours)}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Set as default persona for new conversations"
                    onClick={() => setDefaultMutation.mutate({ personaId: p.id })}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate({ id: p.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Platform & Tenant Personas (read-only) ───────────────────────── */}
      {otherPersonas.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Available Personas</h3>
          <p className="text-xs text-gray-400 mb-3">
            These personas are provided by your organization or the platform. You can select them in
            conversations but cannot edit or delete them.
          </p>
          <div className="space-y-2">
            {otherPersonas.map((p) => (
              <div
                key={p.id}
                className="flex items-center p-4 bg-gray-50 rounded-xl opacity-80"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                    {p.name}
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">
                      {p.scope}
                    </span>
                    {p.tone && (
                      <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                        {TONE_META[p.tone]?.emoji} {p.tone}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                    {p.description || p.systemPromptPrefix.slice(0, 90) + "…"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Working hours: {formatPersonaWorkingHoursSummary(p.workingHours)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
