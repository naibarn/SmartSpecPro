import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaProductionWizard,
  type VdWizardPerShotDialoguePreviewShot,
} from "@/components/verticalDramaSeries/VerticalDramaProductionWizard";
import {
  VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS,
  type VerticalDramaProductionWizardStep,
} from "@shared/verticalDramaSeries/productionWizard";

function makeStep(
  overrides: Partial<VerticalDramaProductionWizardStep> &
    Pick<VerticalDramaProductionWizardStep, "stepId">
): VerticalDramaProductionWizardStep {
  return {
    status: "passed",
    primaryAction: "none",
    sourceStages: [],
    blockingReasons: [],
    repairable: false,
    creditSpending: "none",
    evidence: [],
    ...overrides,
  };
}

function makeAllSteps(
  overrides: Partial<
    Record<string, Partial<VerticalDramaProductionWizardStep>>
  > = {}
): VerticalDramaProductionWizardStep[] {
  return VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS.map(stepId =>
    makeStep({ stepId, ...(overrides[stepId] ?? {}) })
  );
}

/**
 * Cast helper for `perShotDialoguePreview` hand fixtures (2026-07-08 W9-B) —
 * that field is NOT YET part of the shared `VerticalDramaProductionWizardStep`
 * contract (see `VerticalDramaProductionWizard.tsx`'s own header comment for
 * why), so a plain object literal can't carry it without this. The generic
 * `T` return type (inferred from the spread, never a fixed type annotation
 * on the object literal itself) is what lets TypeScript accept the extra
 * property here — same pattern the component's own `readPerShotDialogue
 * Preview` documents from the READING side.
 */
function withDialoguePreview<T extends VerticalDramaProductionWizardStep>(
  step: T,
  preview: VdWizardPerShotDialoguePreviewShot[]
): T {
  return { ...step, perShotDialoguePreview: preview };
}

describe("VerticalDramaProductionWizard", () => {
  it("renders exactly one primary CTA — for the active step only", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "ready",
        primaryAction: "generate_script",
        creditSpending: "llm",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
        onPrimaryAction={vi.fn()}
      />
    );
    // Desktop panel + mobile accordion both render — but only ONE step's
    // detail (the active one) ever shows a primary-cta button, in each.
    expect(
      screen.getAllByTestId("vd-wizard-primary-cta-episode_script")
    ).toHaveLength(2);
  });

  it("shows step status as TEXT (never color-only)", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "needs_repair",
        primaryAction: "generate_script",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
      />
    );
    expect(screen.getAllByText("ต้องซ่อมก่อน").length).toBeGreaterThan(0);
  });

  it("renders blocking reasons as mapped one-line sentences", () => {
    const steps = makeAllSteps({
      storyboard_shots: {
        status: "locked",
        blockingReasons: ["VD_WIZARD_SCRIPT_MISSING"],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(screen.getAllByText("ยังไม่ได้สร้างบทตอน").length).toBeGreaterThan(
      0
    );
  });

  it("2026-07-08 fix: renders the episode_script speech-coverage evidence row as localized Thai numbers, never the raw ScriptSpeechCoverageStatus enum", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "needs_repair",
        primaryAction: "generate_script",
        creditSpending: "llm",
        evidence: [
          {
            label: "Speech coverage",
            value: "0.0s / target 34.8-40.8s",
            severity: "error",
            scriptCoverage: {
              status: "underfilled_error",
              estimatedSpeechSeconds: 0,
              targetSpeechSecondsMin: 34.8,
              targetSpeechSecondsMax: 40.8,
            },
          },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
      />
    );
    // Real Thai numbers ARE rendered...
    expect(
      screen.getAllByText("บทพูดรวม 0.0 วิ จากเป้า 35-41 วิ").length
    ).toBeGreaterThan(0);
    // ...and the raw enum string is never rendered anywhere.
    expect(screen.queryByText("underfilled_error")).not.toBeInTheDocument();
    expect(screen.queryByText(/underfilled_error/)).not.toBeInTheDocument();
  });

  it("2026-07-08 fix: no_dialogue_data renders the dedicated grandfathering warning sentence, not the raw enum", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "passed",
        primaryAction: "none",
        evidence: [
          {
            label: "Speech coverage",
            value: "36.8s / target 34.8-40.8s",
            severity: "warning",
            scriptCoverage: {
              status: "no_dialogue_data",
              estimatedSpeechSeconds: 36.8,
              targetSpeechSecondsMin: 34.8,
              targetSpeechSecondsMax: 40.8,
            },
          },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    // 2026-07-08 W9-B plain-language sweep reworded this sentence (dropped
    // "ฝังบีต"/"ระบบวัดความหนาแน่น" jargon) — same meaning, plainer words.
    expect(
      screen.getAllByText(
        "บทนี้เป็นบทเก่าที่ยังไม่มีข้อมูลบทพูดละเอียดพอ — สร้างบทตอนใหม่เพื่อดูตัวเลขบทพูดที่แม่นยำ"
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/no_dialogue_data/)).not.toBeInTheDocument();
  });

  it("renders a plain evidence row's label/value verbatim when it has no scriptCoverage payload (unaffected by the 2026-07-08 fix)", () => {
    const steps = makeAllSteps({
      storyboard_shots: {
        status: "passed",
        evidence: [{ label: "Storyboard", value: "9 shots generated" }],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(screen.getAllByText("Storyboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9 shots generated").length).toBeGreaterThan(0);
  });

  it("shows the credit-spend chip using the verbatim 'ใช้เครดิต' string for a paid active step", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "ready",
        primaryAction: "generate_script",
        creditSpending: "llm",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-credit-chip-episode_script")[0]
        .textContent
    ).toBe("ใช้เครดิต");
  });

  it("requires a paid-confirm step before dispatching onPrimaryAction for a credit-spending step", () => {
    const onPrimaryAction = vi.fn();
    const steps = makeAllSteps({
      episode_script: {
        status: "ready",
        primaryAction: "generate_script",
        creditSpending: "llm",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
        onPrimaryAction={onPrimaryAction}
      />
    );
    // Two rendered instances exist (mobile accordion + desktop panel), each
    // with its OWN independent confirm state — interact with whichever
    // renders first; only THAT instance shows its confirm block.
    const [button] = screen.getAllByTestId(
      "vd-wizard-primary-cta-episode_script"
    );
    fireEvent.click(button);
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-wizard-paid-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-wizard-paid-confirm-submit"));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("dispatches immediately (no confirm) for a free (creditSpending 'none') step", () => {
    const onPrimaryAction = vi.fn();
    const steps = makeAllSteps({
      dialogue_qc: {
        status: "blocked",
        primaryAction: "repair_dialogue",
        creditSpending: "none",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="dialogue_qc"
        steps={steps}
        primaryCta="repair_dialogue"
        onPrimaryAction={onPrimaryAction}
      />
    );
    const buttons = screen.getAllByTestId("vd-wizard-primary-cta-dialogue_qc");
    fireEvent.click(buttons[0]);
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("vd-wizard-paid-confirm")
    ).not.toBeInTheDocument();
  });

  it("calls onViewStepDetails with the clicked step id from the desktop stepper bubble (available for every step, not just the active/expanded one)", () => {
    const onViewStepDetails = vi.fn();
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        onViewStepDetails={onViewStepDetails}
      />
    );
    fireEvent.click(screen.getByTestId("vd-wizard-step-storyboard_shots"));
    expect(onViewStepDetails).toHaveBeenCalledWith("storyboard_shots");
  });

  it("calls onViewStepDetails from the active step's 'ดูรายละเอียด' secondary link", () => {
    const onViewStepDetails = vi.fn();
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        onViewStepDetails={onViewStepDetails}
      />
    );
    const [link] = screen.getAllByTestId(
      "vd-wizard-view-details-episode_script"
    );
    fireEvent.click(link);
    expect(onViewStepDetails).toHaveBeenCalledWith("episode_script");
  });

  it("announces the pending state via the aria-live region", () => {
    const steps = makeAllSteps({
      episode_script: { status: "ready", primaryAction: "generate_script" },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
        primaryActionPending
      />
    );
    expect(screen.getByTestId("vd-wizard-live-region").textContent).toBe(
      "กำลังทำงาน"
    );
  });

  it("uses the caller-formatted loopCtaLabel for the run_quality_improve_loop action", () => {
    const steps = makeAllSteps({
      script_qc: {
        status: "needs_repair",
        primaryAction: "run_quality_improve_loop",
        creditSpending: "llm",
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="script_qc"
        steps={steps}
        primaryCta="run_quality_improve_loop"
        loopCtaLabel="ปรับอัตโนมัติ (สูงสุด 2 รอบ, ~40 เครดิต)"
      />
    );
    expect(
      screen.getAllByText("ปรับอัตโนมัติ (สูงสุด 2 รอบ, ~40 เครดิต)").length
    ).toBeGreaterThan(0);
  });

  it("renders every step in both the mobile accordion and the desktop stepper", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    for (const step of steps) {
      expect(
        screen.getByTestId(`vd-wizard-accordion-item-${step.stepId}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`vd-wizard-step-${step.stepId}`)
      ).toBeInTheDocument();
    }
  });

  it("marks the active step with aria-current='step' on the desktop stepper bubble", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getByTestId("vd-wizard-step-storyboard_shots")
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByTestId("vd-wizard-step-episode_script")
    ).not.toHaveAttribute("aria-current");
  });
});

describe("VerticalDramaProductionWizard — criteria transparency (2026-07-08 wave)", () => {
  it("renders the criteria checklist with an icon + explicit pass/fail text per criterion (owner confusion #2)", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "passed",
        passState: "passed_with_warnings",
        criteria: [
          { id: "script_exists", passed: true },
          { id: "coverage_at_least_minimum", passed: true, detail: "36.8" },
          {
            id: "coverage_in_recommended_band",
            passed: false,
            detail: "36.8/35-44",
          },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-criteria-episode_script").length
    ).toBeGreaterThan(0);
    const failingCriterionRows = screen.getAllByTestId(
      "vd-wizard-criterion-coverage_in_recommended_band"
    );
    expect(failingCriterionRows[0].textContent).toContain(
      "บทพูดอยู่ในช่วงที่แนะนำ"
    );
    expect(failingCriterionRows[0].textContent).toContain("ไม่ผ่าน");
    expect(failingCriterionRows[0].textContent).toContain("36.8/35-44");
    // The machine id itself is never rendered as visible text.
    expect(failingCriterionRows[0].textContent).not.toContain(
      "coverage_in_recommended_band"
    );
  });

  it("does not render a criteria section when a step has no criteria (e.g. shot_repair)", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="shot_repair"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-criteria-shot_repair")
    ).not.toBeInTheDocument();
  });

  it("renders the out-of-scope note line pointing to the later step (owner confusions #1 and #3)", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "passed",
        outOfScopeNotes: [
          { id: "dialogue_later_step", laterStepId: "dialogue_audio" },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const notes = screen.getAllByTestId(
      "vd-wizard-out-of-scope-episode_script"
    );
    expect(notes[0].textContent).toContain("สิ่งที่ยังไม่ตรวจในขั้นนี้");
    expect(notes[0].textContent).toContain("บทพูดรายช็อต");
    expect(notes[0].textContent).toContain("บทพูด/เสียง");
  });

  it("shows 'ผ่านแบบมีคำเตือน' (not the plain 'ผ่านแล้ว') on the stepper bubble for a passed_with_warnings step", () => {
    const steps = makeAllSteps({
      storyboard_shots: {
        status: "passed",
        passState: "passed_with_warnings",
        criteria: [{ id: "shots_9", passed: false, detail: "7" }],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const bubble = screen.getByTestId("vd-wizard-step-storyboard_shots");
    expect(bubble.textContent).toContain("ผ่านแบบมีคำเตือน");
    expect(bubble.textContent).not.toContain("ผ่านแล้ว");
  });

  it("a clean passed step (no passState override) still shows the plain 'ผ่านแล้ว' label", () => {
    const steps = makeAllSteps({
      storyboard_shots: { status: "passed", passState: "passed" },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getByTestId("vd-wizard-step-storyboard_shots").textContent
    ).toContain("ผ่านแล้ว");
  });

  it("leak-fix sweep: scorecardOverall/loopState/evidenceId evidence rows render fully localized text, never raw English labels or enum values", () => {
    const steps = makeAllSteps({
      script_qc: {
        status: "needs_repair",
        primaryAction: "run_quality_improve_loop",
        evidence: [
          {
            label: "Scorecard overall",
            value: "3 / 4",
            severity: "error",
            scorecardOverall: { overall: 3, minOverall: 4 },
          },
          {
            label: "Auto-improve loop",
            value: "not_run",
            loopState: "not_run",
          },
          {
            label: "Storyboard",
            value: "Required before quality review",
            severity: "warning",
            evidenceId: "script_qc_needs_storyboard",
          },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="script_qc"
        steps={steps}
        primaryCta="run_quality_improve_loop"
      />
    );
    const evidence = screen.getAllByTestId("vd-wizard-evidence-script_qc")[0];
    expect(evidence.textContent).toContain("คะแนนรวม 3/5 (เกณฑ์ 4)");
    expect(evidence.textContent).toContain("ยังไม่เคยรันปรับอัตโนมัติ");
    expect(evidence.textContent).toContain("ต้องมีก่อนตรวจคุณภาพ");
    // None of the raw English/enum source strings ever reach the DOM.
    expect(evidence.textContent).not.toContain("not_run");
    expect(evidence.textContent).not.toContain("Scorecard overall");
    expect(evidence.textContent).not.toContain("Auto-improve loop");
    expect(evidence.textContent).not.toContain(
      "Required before quality review"
    );
  });
});

/**
 * 2026-07-08/W9-A landed the content-completeness criteria + `"incomplete"`
 * pass state FOR REAL mid-task (owner directive, section-12 "Pass
 * Semantics — Content Completeness", spec §14.1 rule 6b) — every fixture
 * below uses the REAL criterion ids / pass-state values directly (no
 * forward-compat casts needed for these two pieces).
 */
describe("VerticalDramaProductionWizard — content completeness (2026-07-08/W9-A)", () => {
  it("renders plain-Thai labels for all 7 new content-completeness criteria", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "passed",
        passState: "failed",
        criteria: [
          { id: "script_exists", passed: true },
          { id: "dialogue_every_shot", passed: false, detail: "7/9" },
          { id: "no_shot_over_length", passed: true, detail: "9/9" },
          { id: "no_long_silence", passed: true, detail: "9/9" },
          { id: "all_lines_speakable", passed: null },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const criteria = screen.getAllByTestId(
      "vd-wizard-criteria-episode_script"
    )[0];
    expect(criteria.textContent).toContain("ทุกช็อตมีบทพูด");
    expect(criteria.textContent).toContain("7/9");
    expect(criteria.textContent).toContain("ไม่มีช็อตที่บทยาวเกินเวลา");
    expect(criteria.textContent).toContain("ไม่มีช่วงเงียบนานเกินไป");
    expect(criteria.textContent).toContain("ทุกประโยคอ่านออกเสียงได้จริง");
    // Machine ids are never rendered as visible text.
    expect(criteria.textContent).not.toContain("dialogue_every_shot");
  });

  it("renders plain-Thai labels for storyboard's image/video-prompt criteria and script_qc's unresolved-repairs criterion", () => {
    const steps = makeAllSteps({
      storyboard_shots: {
        status: "passed",
        criteria: [
          { id: "image_prompts_all_shots", passed: true, detail: "9/9" },
        ],
      },
      script_qc: {
        status: "passed",
        criteria: [{ id: "no_unresolved_recommended_repairs", passed: false }],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-criteria-storyboard_shots")[0]
        .textContent
    ).toContain("ทุกช็อตมีคำสั่งสร้างภาพ");
  });

  it("shows 'ต้องซ่อมก่อน' (never a plain 'ผ่านแล้ว') when status is passed but passState is failed — episode_script/script_qc's completeness-override combination", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "passed",
        passState: "failed",
        criteria: [
          { id: "script_exists", passed: true },
          { id: "dialogue_every_shot", passed: false, detail: "7/9" },
        ],
        outOfScopeNotes: [],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const bubble = screen.getByTestId("vd-wizard-step-episode_script");
    expect(bubble.textContent).toContain("ต้องซ่อมก่อน");
    expect(bubble.textContent).not.toContain("ผ่านแล้ว");
    const accordionItem = screen.getByTestId(
      "vd-wizard-accordion-item-episode_script"
    );
    expect(accordionItem.textContent).toContain("ต้องซ่อมก่อน");
    const headline = screen.getAllByTestId(
      "vd-wizard-incomplete-headline-episode_script"
    )[0];
    expect(headline.textContent).toContain("ขั้นนี้ยังไม่ครบ — เหลือ:");
    expect(headline.textContent).toContain("ทุกช็อตมีบทพูด");
  });

  it("shows 'ยังไม่ครบ' (a distinct state from 'ต้องซ่อมก่อน') for storyboard_shots' passState: incomplete combination, with the out-of-scope pointer to the producing step", () => {
    const steps = makeAllSteps({
      storyboard_shots: {
        status: "passed",
        passState: "incomplete",
        criteria: [
          { id: "shots_9", passed: true, detail: "9" },
          { id: "video_prompts_all_shots", passed: false },
        ],
        outOfScopeNotes: [
          { id: "prompts_later_step", laterStepId: "video_prompts" },
        ],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    const bubble = screen.getByTestId("vd-wizard-step-storyboard_shots");
    expect(bubble.textContent).toContain("ยังไม่ครบ");
    expect(bubble.textContent).not.toContain("ผ่านแล้ว");
    expect(bubble.textContent).not.toContain("ต้องซ่อมก่อน");
    const headline = screen.getAllByTestId(
      "vd-wizard-incomplete-headline-storyboard_shots"
    )[0];
    expect(headline.textContent).toContain("ขั้นนี้ยังไม่ครบ — เหลือ:");
    expect(headline.textContent).toContain("ทุกช็อตมีคำสั่งสร้างวิดีโอ");
    const note = screen.getAllByTestId(
      "vd-wizard-out-of-scope-storyboard_shots"
    )[0];
    expect(note.textContent).toContain("จะทำที่ขั้น 'พรอมต์วิดีโอ'");
  });

  it("does not show the incomplete headline for a clean passed step with no completeness gap", () => {
    const steps = makeAllSteps({
      storyboard_shots: { status: "passed", passState: "passed" },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-incomplete-headline-storyboard_shots")
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("vd-wizard-step-storyboard_shots").textContent
    ).toContain("ผ่านแล้ว");
  });

  it("missing-field byte-identical: a hand-built fixture with no passState at all never shows the completeness headline or altered status text", () => {
    const steps = makeAllSteps({ storyboard_shots: { status: "passed" } });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-incomplete-headline-storyboard_shots")
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("vd-wizard-step-storyboard_shots").textContent
    ).toContain("ผ่านแล้ว");
  });

  it("a genuinely needs_repair step still shows 'ต้องซ่อมก่อน' via its pre-existing status-driven path (unaffected by the new passState override branch)", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "needs_repair",
        passState: "failed",
        primaryAction: "generate_script",
        blockingReasons: ["VD_WIZARD_SCRIPT_UNDERFILLED"],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
      />
    );
    expect(
      screen.getByTestId("vd-wizard-step-episode_script").textContent
    ).toContain("ต้องซ่อมก่อน");
  });
});

describe("VerticalDramaProductionWizard — per-shot dialogue viewer (2026-07-08 W9-B, owner directive: 'show the ACTUAL dialogue, not just seconds')", () => {
  it("renders nothing extra when perShotDialoguePreview is absent — existing behavior unchanged", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-episode_script")
    ).not.toBeInTheDocument();
  });

  it("renders nothing extra when perShotDialoguePreview is an empty array", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], []);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-episode_script")
    ).not.toBeInTheDocument();
  });

  it("renders an expandable 'บทพูดจริงรายช็อต' section with a 'ช็อต N' header and the verbatim 'ผู้พูด: ข้อความ' line when present", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      {
        shotNumber: 1,
        lines: [{ speaker: "หนูนา", line: "ไม่เอาน่า อย่าทำแบบนี้เลย" }],
      },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const section = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-episode_script"
    )[0];
    expect(section.textContent).toContain("บทพูดจริงรายช็อต");
    const shotRow = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-shot-1"
    )[0];
    expect(shotRow.textContent).toContain("ช็อต 1");
    const lineRow = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-line-1-0"
    )[0];
    expect(lineRow.textContent).toBe("หนูนา: ไม่เอาน่า อย่าทำแบบนี้เลย");
  });

  it("shows the 'ไม่มีบทพูด' badge and a placeholder line for a shot flagged silent", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 2, lines: [], silent: true },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-no-dialogue-2")[0]
        .textContent
    ).toBe("ไม่มีบทพูด");
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-2")[0].textContent
    ).toContain("ช็อตนี้ยังไม่มีบทพูด");
  });

  it("belt-and-suspenders: shows the 'ไม่มีบทพูด' badge for an objectively empty lines array even when 'silent' is not set", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 3, lines: [] },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-no-dialogue-3")[0]
    ).toBeInTheDocument();
  });

  it("shows the 'ยาวเกินช็อต' badge when overLength is true", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      {
        shotNumber: 4,
        lines: [{ speaker: "A", line: "บทยาวมาก" }],
        overLength: true,
      },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-over-length-4")[0]
        .textContent
    ).toBe("ยาวเกินช็อต");
  });

  it("shows the 'มีสัญลักษณ์ที่อ่านไม่ได้' badge when the forward-compat unspeakableSymbols flag is set", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      {
        shotNumber: 5,
        lines: [{ speaker: "A", line: "หนูนา สะดุ้ง ไม่เอาน่า" }],
        unspeakableSymbols: true,
      },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-unspeakable-5")[0]
        .textContent
    ).toBe("มีสัญลักษณ์ที่อ่านไม่ได้");
  });

  it("truncates a very long line with a keyboard-accessible 'แสดงทั้งหมด'/'ย่อ' expand toggle", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    const longLine = "บทพูดยาวมาก ".repeat(20);
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 6, lines: [{ speaker: "A", line: longLine }] },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    const toggle = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-line-6-0-toggle"
    )[0];
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.textContent).toBe("แสดงทั้งหมด");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.textContent).toBe("ย่อ");
  });

  it("does not show an expand toggle for a short line", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 7, lines: [{ speaker: "A", line: "สั้นๆ" }] },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-line-7-0-toggle")
    ).not.toBeInTheDocument();
  });

  it("renders one row per shot for a multi-shot preview, each independently", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 1, lines: [{ speaker: "A", line: "หนึ่ง" }] },
      { shotNumber: 2, lines: [{ speaker: "B", line: "สอง" }] },
      { shotNumber: 3, lines: [], silent: true },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-1")[0].textContent
    ).toContain("หนึ่ง");
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-2")[0].textContent
    ).toContain("สอง");
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-3")[0].textContent
    ).toContain("ไม่มีบทพูด");
  });
});

describe("VerticalDramaProductionWizard — perShotDialoguePreview PROP wiring (2026-07-08 W9-C: connects getEpisodeDetail's real top-level field to the viewer above)", () => {
  it("renders the viewer straight from the top-level prop (not the step-field fallback) with a speaker/line/overLength/silent fixture", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        perShotDialoguePreview={[
          {
            shotNumber: 1,
            lines: [{ speaker: "หนูนา", line: "ไม่เอาน่า อย่าทำแบบนี้เลย" }],
            overLength: true,
            silent: false,
          },
          { shotNumber: 2, lines: [], overLength: false, silent: true },
        ]}
      />
    );
    const section = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-episode_script"
    )[0];
    expect(section.textContent).toContain("บทพูดจริงรายช็อต");
    const lineRow = screen.getAllByTestId(
      "vd-wizard-dialogue-preview-line-1-0"
    )[0];
    expect(lineRow.textContent).toBe("หนูนา: ไม่เอาน่า อย่าทำแบบนี้เลย");
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-over-length-1")[0]
        .textContent
    ).toBe("ยาวเกินช็อต");
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-badge-no-dialogue-2")[0]
        .textContent
    ).toBe("ไม่มีบทพูด");
  });

  it("the prop wins over the legacy step-field fallback when both are present", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    const idx = steps.findIndex(s => s.stepId === "episode_script");
    // Stashed directly on the step (the pre-W9-C fallback path) — must be
    // shadowed entirely once the real prop is also supplied.
    steps[idx] = withDialoguePreview(steps[idx], [
      { shotNumber: 9, lines: [{ speaker: "เก่า", line: "ข้อความเก่า" }] },
    ]);
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        perShotDialoguePreview={[
          { shotNumber: 1, lines: [{ speaker: "ใหม่", line: "ข้อความใหม่" }] },
        ]}
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-1")[0].textContent
    ).toContain("ข้อความใหม่");
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-shot-9")
    ).not.toBeInTheDocument();
  });

  it("does not apply the prop to a step other than episode_script — the field is episode-wide but this viewer is episode_script-only", () => {
    const steps = makeAllSteps({ storyboard_shots: { status: "passed" } });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
        perShotDialoguePreview={[
          { shotNumber: 1, lines: [{ speaker: "A", line: "ทดสอบ" }] },
        ]}
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-storyboard_shots")
    ).not.toBeInTheDocument();
  });

  it("an undefined prop falls back to existing behavior (unchanged) — flags-off byte-identical", () => {
    const steps = makeAllSteps({ episode_script: { status: "passed" } });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        perShotDialoguePreview={undefined}
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-dialogue-preview-episode_script")
    ).not.toBeInTheDocument();
  });
});

describe("VerticalDramaProductionWizard — W11.6 Story Lock", () => {
  it("shows the muted story-lock note on episode_script when storyLockEnabled is true", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
        storyLockEnabled
      />
    );
    // Desktop panel + mobile accordion (mirrors the primary-CTA test's own convention).
    expect(
      screen.getAllByTestId("vd-wizard-story-lock-note-episode_script")
    ).toHaveLength(2);
    expect(
      screen.getAllByText("เนื้อเรื่องล็อกตามแผนซีซั่น — แก้เนื้อเรื่องที่หน้าภาพรวม").length
    ).toBeGreaterThan(0);
  });

  it("shows the muted story-lock note on script_qc when storyLockEnabled is true", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="script_qc"
        steps={steps}
        primaryCta="none"
        storyLockEnabled
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-story-lock-note-script_qc")
    ).toHaveLength(2);
  });

  it("never shows the note on any other step, even when storyLockEnabled is true", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="storyboard_shots"
        steps={steps}
        primaryCta="none"
        storyLockEnabled
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-story-lock-note-storyboard_shots")
    ).not.toBeInTheDocument();
  });

  it("never shows the note when storyLockEnabled is false or omitted (byte-identical)", () => {
    const steps = makeAllSteps();
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="none"
      />
    );
    expect(
      screen.queryByTestId("vd-wizard-story-lock-note-episode_script")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("เนื้อเรื่องล็อกตามแผนซีซั่น — แก้เนื้อเรื่องที่หน้าภาพรวม")
    ).not.toBeInTheDocument();
  });

  it("does not change blocking reasons / criteria rendering for episode_script (additive-only note)", () => {
    const steps = makeAllSteps({
      episode_script: {
        status: "needs_repair",
        blockingReasons: ["VD_WIZARD_SCRIPT_UNDERFILLED"],
      },
    });
    render(
      <VerticalDramaProductionWizard
        locale="th"
        activeStepId="episode_script"
        steps={steps}
        primaryCta="generate_script"
        storyLockEnabled
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-blocking-reasons-episode_script").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId("vd-wizard-story-lock-note-episode_script").length
    ).toBeGreaterThan(0);
  });
});
