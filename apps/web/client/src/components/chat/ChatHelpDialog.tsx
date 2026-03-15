import { useState } from "react";
import {
  Bot,
  Brain,
  FileText,
  Film,
  HelpCircle,
  ImagePlus,
  Layers,
  MonitorPlay,
  Presentation,
  ReceiptText,
  Save,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/* ─── Chat basics ────────────────────────────────────────────── */

const chatBasics = [
  "Type a normal message to chat with the selected model.",
  "Use the model picker at the top of the conversation to switch the active LLM.",
  "Turn on Brainstorm Mode when you want two models to collaborate before returning a summary.",
  "Attach files or images when the task depends on source material.",
];

const skillUsage = [
  "Type / in the message box to open the slash-command skill menu.",
  "Open the Skills panel to control which skills are enabled for the current conversation.",
  "Use skills when you want the assistant to follow a specialized workflow instead of a plain answer.",
  "If the task is repetitive or domain-specific, prefer a skill over repeating the same instructions manually.",
];

const mediaUsage = [
  "Use Generate Image to seed the prompt with create image: and describe the visual outcome you want.",
  "Use Generate Video to seed the prompt with create video: for motion-focused outputs.",
  "Use Generate Audio when you want voice, music, or sound generation.",
  "Use the prompt-enhance action when you already typed a rough image idea and want the system to improve it first.",
  "You can attach a reference image and ask the model to edit or extend it.",
];

const memoryUsage = [
  "Open Memory to review saved facts, preferences, summaries, and project-linked context.",
  "Use Save to Memory when a message contains something worth reusing later.",
  "Memory is conversation-aware and can carry project context across follow-up chats.",
  "Use Memory when you want the assistant to remember stable preferences instead of repeating them every time.",
];

const browserSessionUsage = [
  "Use Browser Session when the task requires live websites, comparison across pages, or a real browser workflow.",
  "Start Browser Session from Chat, then continue in the live workspace or keep sending quick browser instructions from Chat.",
  "Browser Session is best for finding websites, navigating pages, comparing options, and pausing for approval-sensitive steps.",
];

/* ─── Agency guide ───────────────────────────────────────────── */

const agencyOverview = [
  "Agencies are multi-agent teams that work together to complete complex tasks.",
  "Each agency has specialized agents (researcher, writer, planner) that collaborate automatically.",
  "Access agencies via the Agencies button in the toolbar or the Explore Agencies button on the welcome screen.",
  "Agencies produce structured output such as research reports, storyboards, presentation decks, and comparisons.",
];

const agencyTemplates = [
  {
    name: "Deep Research",
    icon: FileText,
    output: "Research Report",
    example: "\"Research AI marketing trends in Southeast Asia 2026\"",
    description: "Multi-source research with executive summary, key findings, sections, and recommendations.",
  },
  {
    name: "Storyboard Planner",
    icon: Film,
    output: "Video Storyboard",
    example: "\"Create a 60-second product launch storyboard for a fitness app\"",
    description: "Scene-by-scene video plan with dialogue, camera angles, lighting, and audio/video prompts.",
  },
  {
    name: "Deck Builder",
    icon: Presentation,
    output: "Presentation Deck",
    example: "\"Build a Q4 earnings presentation with 8 slides\"",
    description: "Full slide deck with titles, bullet points, speaker notes, and graphic suggestions. Saves directly to the Presentation Editor.",
  },
  {
    name: "Comparison Agent",
    icon: ReceiptText,
    output: "Comparison Table",
    example: "\"Compare 5 hotels in Chiang Mai under 3000 THB/night\"",
    description: "Side-by-side options with pricing, availability, evidence links, and recommendations.",
  },
];

const agencyPreviewLifecycle = [
  { state: "Preview Ready", color: "bg-blue-100 text-blue-800", description: "The agents finished. Review the preview and decide whether to save." },
  { state: "Saving...", color: "bg-slate-100 text-slate-700", description: "Commit is in progress." },
  { state: "Committed", color: "bg-green-100 text-green-800", description: "Saved successfully. For decks you are redirected to the Presentation Editor. For other types a View in Library link appears in the toast." },
  { state: "Save Failed", color: "bg-red-100 text-red-800", description: "Something went wrong. A Retry Save button appears so you can try again." },
  { state: "Expired", color: "bg-amber-100 text-amber-800", description: "The preview timed out before you saved it. Run the agency again to get a fresh preview." },
];

const agencyCommitActions = [
  { type: "Research / Storyboard / Comparison", button: "Save to Library", destination: "Library (toast shows View in Library link)" },
  { type: "Presentation Deck", button: "Save as Presentation", destination: "Redirects to Presentation Editor automatically" },
];

/* ─── Common use cases ───────────────────────────────────────── */

const useCases = [
  "Ask for a concise answer, then save the final decision to Memory.",
  "Use /skills to run a specialized document, code, or research workflow.",
  "Generate an image concept, enhance the prompt, then create the final image.",
  "Switch to Browser Session when the task moves from planning into live website execution.",
  "Use Brainstorm Mode when you want two models to explore alternatives before choosing one.",
  "Move to Agencies when the task needs a multi-agent team to produce structured deliverables like reports or decks.",
];

/* ─── Component ──────────────────────────────────────────────── */

interface ChatHelpDialogProps {
  buttonClassName?: string;
  buttonLabel?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link";
}

export function ChatHelpDialog({
  buttonClassName,
  buttonLabel = "Help",
  buttonSize = "sm",
  buttonVariant = "ghost",
}: ChatHelpDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Complete User Guide
          </DialogTitle>
          <DialogDescription>
            How to use Chat, Skills, Media, Memory, Browser Session, and
            Agencies with preview and commit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm text-slate-700">
          {/* ── What Chat is best for ── */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              What Chat is best for
            </h3>
            <p className="mt-2">
              Chat is the fastest place to ask for answers, drafts,
              brainstorming, prompt building, analysis, and follow-up work.
              Start here when you want direct interaction with an AI model
              and only move into Browser Session or Agencies when the task
              needs a different execution surface.
            </p>
          </section>

          {/* ── Chat basics ── */}
          <HelpSection title="Chat basics">
            <BulletList items={chatBasics} />
          </HelpSection>

          {/* ── Skills ── */}
          <HelpSection title="Skills and slash commands" icon={Wand2}>
            <BulletList items={skillUsage} />
          </HelpSection>

          {/* ── Media ── */}
          <HelpSection title="Image, video, and audio generation" icon={ImagePlus}>
            <BulletList items={mediaUsage} />
          </HelpSection>

          {/* ── Memory ── */}
          <HelpSection title="Memory" icon={Brain}>
            <BulletList items={memoryUsage} />
          </HelpSection>

          {/* ── Browser Session ── */}
          <HelpSection title="Browser Session" icon={MonitorPlay}>
            <BulletList items={browserSessionUsage} />
          </HelpSection>

          <Separator />

          {/* ── Agencies ── */}
          <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-700" />
              <h3 className="text-base font-semibold text-slate-900">
                Agencies &mdash; Multi-Agent Teams
              </h3>
            </div>

            <BulletList items={agencyOverview} />

            {/* Getting started */}
            <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                How to get started
              </h4>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  Click <strong>Agencies</strong> in the Chat toolbar (or{" "}
                  <strong>Explore Agencies</strong> on the welcome screen).
                </li>
                <li>
                  Browse available agencies or create one from a template
                  (Deep Research, Storyboard Planner, Deck Builder).
                </li>
                <li>
                  Open an agency and type your request in the Agency Chat.
                </li>
                <li>
                  The agents work together automatically. When finished, a{" "}
                  <strong>Preview Card</strong> appears.
                </li>
                <li>
                  Review the preview and click <strong>Save</strong> to
                  commit it to your Library or Presentation Editor.
                </li>
              </ol>
            </div>

            {/* Templates */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Available agency templates
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {agencyTemplates.map((t) => (
                  <div
                    key={t.name}
                    className="rounded-lg border bg-white p-3 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <t.icon className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-slate-900">
                        {t.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{t.description}</p>
                    <p className="text-xs italic text-slate-400">
                      Example: {t.example}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      Output: {t.output}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview lifecycle */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Preview card states
              </h4>
              <div className="space-y-1.5">
                {agencyPreviewLifecycle.map((s) => (
                  <div
                    key={s.state}
                    className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2"
                  >
                    <Badge
                      className={`shrink-0 text-[10px] ${s.color}`}
                    >
                      {s.state}
                    </Badge>
                    <span className="text-xs text-slate-600">
                      {s.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Commit actions */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Save actions by type
              </h4>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        Preview Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        Button Label
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        Where It Goes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencyCommitActions.map((a) => (
                      <tr key={a.type} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{a.type}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            <Save className="h-3 w-3" />
                            {a.button}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {a.destination}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dismiss & error */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Other actions
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                <li>
                  Click the <strong>X</strong> button on a Preview Card to
                  dismiss it without saving.
                </li>
                <li>
                  If the preview fails to load, a red error toast appears.
                  Send the same message again to retry.
                </li>
                <li>
                  If the save fails, the button changes to{" "}
                  <strong>Retry Save</strong>. Click it to try again.
                </li>
              </ul>
            </div>
          </section>

          {/* ── Common use cases ── */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Common use cases
            </h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {useCases.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function HelpSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
