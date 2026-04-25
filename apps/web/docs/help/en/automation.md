---
slug: automation
title: Process Automation
description: Automate tasks with AI-powered browser and process automation
icon: Bot
section: advanced
order: 73
pages: ["/automation"]
tags:
  - "automation"
  - "process"
  - "browser"
  - "live session"
  - "copilot"
  - "bot"
  - "rpa"
  - "help"
  - "help/en"
  - "help/automation"
aliases:
  - "automation"
  - "Process Automation"
  - "Process Automation help"
---

# Process Automation

## What is Process Automation?

Process Automation lets you define repeatable, structured tasks that the AI executes step-by-step in a real browser environment. Unlike a one-off Browser Session where you navigate freely, Automation is designed for tasks you want to run consistently — the same process, the same outcome, every time.

Think of it as a personal RPA (robotic process automation) copilot that you describe in plain language rather than code.

## Automation vs. Browser Session

| Feature | Browser Session | Process Automation |
|---|---|---|
| Best for | Open-ended research and exploration | Repeatable structured processes |
| How you start | Describe a goal, AI navigates freely | Describe an outcome, AI plans steps first |
| Repeatability | Ad hoc | Designed to be run multiple times |
| Manual takeover | Available | Available — plus pause points |

## Automation Copilot

The Automation Copilot assists you at every stage of building and running an automation:

- **Planning** — describe the outcome you want in plain language (e.g., "fill in the weekly timesheet on our HR portal"). The Copilot breaks it into discrete steps before executing anything.
- **Review** — you can review and edit the planned steps before the automation starts.
- **Execution** — the Copilot executes each step in order, pausing when it needs human input or confirmation.
- **Adapting** — if a page layout has changed or an unexpected dialog appears, the Copilot tries to adapt and notifies you if it cannot proceed.

## Starting an automation

1. Go to **/automation**.
2. Describe the outcome you want to achieve. Be specific: include the website URL, what data to enter, and what the end state should look like.
3. The Copilot generates a step-by-step plan. Review it and click **Start** when ready.
4. The automation opens in a live browser session and begins executing.

## Live Session (/automation/live/:sessionId)

Once an automation is running, you can watch and interact with it in real time:

- **Live view** — see the browser exactly as the automation sees it.
- **Step progress** — a sidebar shows which step is currently executing and which steps are complete.
- **Pause** — temporarily halt execution. The automation waits for you to resume.
- **Resume** — continue from where it paused.
- **Cancel** — stop the automation entirely and close the browser session.

## Taking over — manual control

Some steps require human input that the AI cannot safely complete on its own — multi-factor authentication codes, payment confirmations, and CAPTCHA challenges are common examples.

When the Copilot reaches a step it cannot complete autonomously:

1. It pauses and sends you a notification.
2. The live view highlights the element requiring your input.
3. You take direct control of the browser, complete the step, and click **Resume** to hand control back.

## Pause points

You can define explicit pause points in the step plan before the automation starts. A pause point tells the Copilot to stop and wait for your approval before continuing to the next step. This is useful for:

- Reviewing data before it is submitted.
- Confirming a purchase or payment.
- Checking the result of a complex form fill before moving on.

## Policy enforcement

Automation runs inside a sandboxed browser environment with configurable safety policies:

- **Allowed domains** — restrict the automation to a specific set of websites.
- **Blocked actions** — prevent certain categories of action (e.g., making purchases, sending emails).
- **Maximum steps** — set a cap on how many steps an automation can execute in one run.

These policies are configured by your domain admin from **Admin → Settings**.

## Use cases

- Filling in recurring forms (timesheets, expense reports, CRM entries)
- Extracting data from web pages into a structured format
- Monitoring a page for changes and triggering an alert
- Automating account management tasks across multiple sites
- End-to-end testing of web applications

## Tips

- **Be specific about outcomes** — "log in to X and download the monthly report as PDF" gives the Copilot more to work with than "get the report".
- **Set pause points for sensitive steps** — any step involving money, form submission, or irreversible actions should have a manual review pause.
- **Test with a single run first** — before scheduling an automation to run repeatedly, watch a full run in the live view to catch unexpected behavior.
- **Use allowed domains** to prevent the automation from navigating to unintended sites.

<!-- knowledge-graph:related:start -->
## Related Help

- [[workflows|Workflows & Automation]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[factory|SaaS Factory]]
- [[webhooks|Webhooks & Integrations]]
- [[work-os|Work OS Guide]]
- [[workflow-editor|Workflow Editor]]
<!-- knowledge-graph:related:end -->
