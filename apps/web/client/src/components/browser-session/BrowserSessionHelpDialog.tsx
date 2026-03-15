import { useMemo, useState } from "react";
import { HelpCircle, MonitorPlay, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const promptBlueprint = [
  "Goal: what outcome you want, not every click.",
  "Constraints: budget, region, dates, brands, must-have filters, or exclusions.",
  "Output: ask for a shortlist, comparison table, summary, or evidence links.",
];

const bestPractices = [
  "Start with the result you want. Example: \"Find the best three vendors for X and explain the tradeoffs.\"",
  "Say what to avoid. Example: \"Avoid marketplaces, sponsored listings, and sites with unclear pricing.\"",
  "Tell the AI when to stop and wait. Example: \"Pause before payment, login confirmation, or OTP.\"",
  "Ask for structure. Example: \"Return a ranked comparison with pros, cons, and final recommendation.\"",
  "Use follow-up instructions instead of restarting. Example: \"Narrow to options available in Bangkok only.\"",
];

const liveSessionControls = [
  "Open the live Browser Session to watch the browser in real time.",
  "Use Send Browser Instruction to adjust the task while the session is running.",
  "Switch skills if the task changes from research to comparison, booking, or account access.",
  "If the system pauses for approval, MFA, or payment, take over briefly and then return control.",
];

const useCases = [
  "Travel planning: find flights, compare hotels, and narrow down the best itinerary.",
  "Shopping research: compare laptops, phones, cameras, or office equipment across multiple sites.",
  "Vendor sourcing: find SaaS tools, agencies, or suppliers and summarize pricing and capabilities.",
  "Real estate scouting: search listings, compare neighborhoods, and flag the strongest candidates.",
  "Recruiting support: collect candidate pages, portfolio links, and evidence for shortlisting.",
  "Lead generation: discover relevant company websites and gather structured notes for outreach.",
  "Market research: identify competitors, pricing patterns, feature positioning, and public messaging.",
  "Procurement: find distributors or wholesalers and compare minimum order, shipping, and payment options.",
  "Event planning: discover venues, compare packages, and summarize booking requirements.",
  "Education research: find courses, compare syllabi, and shortlist providers by schedule and cost.",
  "Grant or tender research: discover official sources, compare requirements, and summarize deadlines.",
  "Customer support assistance: navigate product docs or help centers and bring back the exact answer.",
  "Account workflows: open a service, reach the right settings page, and pause before sensitive actions.",
  "Booking assistant: prepare a checkout or reservation flow and stop when your confirmation is needed.",
  "Content sourcing: find primary sources, case studies, or examples to support a report.",
  "Price monitoring: revisit product pages, capture current price signals, and summarize changes.",
  "B2B partner discovery: find potential partners in a region and rank them by fit.",
  "Compliance or policy lookup: locate official pages and summarize the parts relevant to your goal.",
];

interface BrowserSessionHelpDialogProps {
  buttonClassName?: string;
  buttonLabel?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link";
}

export function BrowserSessionHelpDialog({
  buttonClassName,
  buttonLabel = "Help",
  buttonSize = "sm",
  buttonVariant = "outline",
}: BrowserSessionHelpDialogProps) {
  const [open, setOpen] = useState(false);

  const examplePrompts = useMemo(
    () => [
      "Find the best websites for boutique hotels in Tokyo for April 10-13, 2026, keep the nightly budget under $150, and return the top 3 options with pros and cons.",
      "Research CRM tools for a 10-person sales team, compare pricing and automation features, and recommend the best fit for a low-budget startup.",
      "Find reliable laptop deals for video editing under $1,200, avoid refurbished items, and explain which model offers the best value.",
      "Open the login flow for Service X, take me to the account settings page, and pause when OTP or MFA is required.",
      "Find three event venues in Bangkok for a 100-person workshop, compare package pricing, and note parking and AV support.",
      "Identify the strongest public sources about the new regulation, summarize the practical impact, and include links to the official pages.",
    ],
    [],
  );

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
            <MonitorPlay className="h-5 w-5 text-cyan-700" />
            Browser Session Help
          </DialogTitle>
          <DialogDescription>
            Use Browser Session when you want AI to find websites, browse pages, compare options, and continue working in a live browser for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm text-slate-700">
          <section className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
            <h3 className="text-sm font-semibold text-slate-900">What Browser Session does</h3>
            <p className="mt-2">
              You describe the outcome you want. The system can infer a browser skill, discover relevant websites, open a live browser session, and continue working while you supervise or step in only when needed.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-700" />
              <h3 className="text-sm font-semibold text-slate-900">Quick start</h3>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Click <span className="font-medium">Start Browser Session</span> from Chat.</li>
              <li>Describe the result you want in plain English.</li>
              <li>Let the system search for relevant websites and start browsing.</li>
              <li>Open the live session if you want to watch or steer the browser in real time.</li>
              <li>Send follow-up instructions instead of restarting from scratch.</li>
            </ol>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">How to write a strong request</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {promptBlueprint.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Prompt examples</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {examplePrompts.map((example) => (
                <div key={example} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {example}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-700" />
              <h3 className="text-sm font-semibold text-slate-900">While the session is running</h3>
            </div>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {liveSessionControls.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Best practices</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {bestPractices.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Diverse use cases</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {useCases.map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-white p-3">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <h3 className="text-sm font-semibold text-slate-900">When the AI should pause for you</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>OTP, MFA, or device verification.</li>
              <li>Payments, bookings, purchases, or any irreversible action.</li>
              <li>Anything sensitive that you want to review before submission.</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
