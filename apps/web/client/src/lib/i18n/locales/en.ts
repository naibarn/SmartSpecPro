import type { TranslationDictionary } from "../types";

const en: TranslationDictionary = {
  // ── Help dialog chrome ───────────────────────────────────────
  "help.title": "Complete User Guide",
  "help.description":
    "How to use Chat, Skills, Media, Presentations, Auto Skill Detection, Memory, Browser Session, and Agencies.",

  // ── What Chat is best for ────────────────────────────────────
  "help.chatBestFor.title": "What Chat is best for",
  "help.chatBestFor.body":
    "Chat is the fastest place to ask for answers, drafts, brainstorming, prompt building, analysis, and follow-up work. Start here when you want direct interaction with an AI model and only move into Browser Session or Agencies when the task needs a different execution surface.",

  // ── Chat basics ──────────────────────────────────────────────
  "help.chatBasics.title": "Chat basics",
  "help.chatBasics.1":
    "Type a normal message to chat with the selected model.",
  "help.chatBasics.2":
    "Use the model picker at the top of the conversation to switch the active LLM.",
  "help.chatBasics.3":
    "Turn on Brainstorm Mode when you want two models to collaborate before returning a summary.",
  "help.chatBasics.4":
    "Attach files or images when the task depends on source material.",

  // ── Skills ───────────────────────────────────────────────────
  "help.skills.title": "Skills and slash commands",
  "help.skills.1":
    "Type / in the message box to open the slash-command skill menu.",
  "help.skills.2":
    "Open the Skills panel to control which skills are enabled for the current conversation.",
  "help.skills.3":
    "Use skills when you want the assistant to follow a specialized workflow instead of a plain answer.",
  "help.skills.4":
    "If the task is repetitive or domain-specific, prefer a skill over repeating the same instructions manually.",

  // ── Media ────────────────────────────────────────────────────
  "help.media.title": "Image, video, and audio generation",
  "help.media.1":
    "Use Generate Image to seed the prompt with create image: and describe the visual outcome you want.",
  "help.media.2":
    "Use Generate Video to seed the prompt with create video: for motion-focused outputs.",
  "help.media.3":
    "Use Generate Audio when you want voice, music, or sound generation.",
  "help.media.4":
    "Use the prompt-enhance action when you already typed a rough image idea and want the system to improve it first.",
  "help.media.5":
    "You can attach a reference image and ask the model to edit or extend it.",

  // ── Presentation from Chat ───────────────────────────────────
  "help.presentation.title": "Create Presentations from Chat",
  "help.presentation.intro":
    "Type a message that starts with a trigger phrase like \"create presentation\", \"make slides\", or \"build a deck\" followed by your topic. The system auto-generates a full slide deck with AI content and images. Thai trigger phrases are also supported.",
  "help.presentation.triggers.title": "Trigger phrases",
  "help.presentation.triggers.list":
    "create presentation,make slides,generate slides,build a deck",
  "help.presentation.params.title": "Available parameters",
  "help.presentation.params.col.param": "Parameter",
  "help.presentation.params.col.required": "Required",
  "help.presentation.params.col.desc": "Description",
  "help.presentation.params.col.examples": "Examples",
  "help.presentation.params.topic.name": "Topic",
  "help.presentation.params.topic.desc":
    "The subject of your presentation. Appears after the trigger phrase.",
  "help.presentation.params.topic.examples":
    "\"about AI\" / \"about Marketing\"",
  "help.presentation.params.slides.name": "Slide count",
  "help.presentation.params.slides.desc":
    "Number of slides (1–30). Default: 5.",
  "help.presentation.params.slides.examples":
    "\"8 slides\" / \"10 slides\"",
  "help.presentation.params.aspect.name": "Aspect ratio",
  "help.presentation.params.aspect.desc":
    "Canvas size. Default: 16:9 landscape.",
  "help.presentation.params.aspect.examples":
    "\"16:9\" / \"9:16\" / \"landscape\" / \"portrait\"",
  "help.presentation.params.language.name": "Language",
  "help.presentation.params.language.desc":
    "Force a language for the generated content. Default: auto-detect from topic.",
  "help.presentation.params.language.examples":
    "\"in Thai\" / \"in English\"",
  "help.presentation.required": "Required",
  "help.presentation.optional": "Optional",
  "help.presentation.examples.title": "Examples",
  "help.presentation.ex.basic.label": "Basic",
  "help.presentation.ex.basic.cmd":
    "create presentation about Digital Marketing",
  "help.presentation.ex.basic.result":
    "5 slides, 16:9 landscape, auto-detected language",
  "help.presentation.ex.count.label": "With slide count",
  "help.presentation.ex.count.cmd":
    "create presentation about AI in Healthcare 10 slides",
  "help.presentation.ex.count.result": "10 slides, 16:9 landscape",
  "help.presentation.ex.portrait.label": "Portrait (9:16)",
  "help.presentation.ex.portrait.cmd":
    "make slides about Social Media Tips 9:16 portrait",
  "help.presentation.ex.portrait.result": "5 slides, 9:16 portrait",
  "help.presentation.ex.landscape.label": "Landscape (16:9)",
  "help.presentation.ex.landscape.cmd":
    "create presentation about Startup Pitch 8 slides 16:9",
  "help.presentation.ex.landscape.result": "8 slides, 16:9 landscape",
  "help.presentation.ex.lang.label": "With language",
  "help.presentation.ex.lang.cmd":
    "create presentation about Cloud Computing in English 16:9",
  "help.presentation.ex.lang.result": "5 slides, 16:9 landscape, English",
  "help.presentation.ex.full.label": "Full options",
  "help.presentation.ex.full.cmd":
    "build a deck about Child Development 10 slides 9:16 in Thai",
  "help.presentation.ex.full.result": "10 slides, 9:16 portrait, Thai",
  "help.presentation.howItWorks.title": "How it works",
  "help.presentation.howItWorks.1":
    "You send a message with a trigger phrase + topic.",
  "help.presentation.howItWorks.2":
    "The system extracts your topic, slide count, aspect ratio, and language.",
  "help.presentation.howItWorks.3":
    "A new presentation deck is created instantly and you get an editor link.",
  "help.presentation.howItWorks.4":
    "AI generates slide content, layouts, and images in the background.",
  "help.presentation.howItWorks.5":
    "When complete, a notification appears in chat with the final link.",

  // ── Auto Skill Detection ─────────────────────────────────────
  "help.skillDetection.title": "Auto Skill Detection",
  "help.skillDetection.1":
    "The system automatically detects the best skill for your request based on keywords in your message.",
  "help.skillDetection.2":
    "You do not need to select a skill manually — just describe what you want and the system matches the right workflow.",
  "help.skillDetection.3":
    "If auto-detection picks the wrong skill, use the / slash menu to select a specific skill by name.",
  "help.skillDetection.4":
    "Skills with higher priority scores are checked first. Domain-specific keywords improve detection accuracy.",
  "help.skillDetection.tips.title": "Tips for better skill matching",
  "help.skillDetection.tip1.title": "Be specific about the output type",
  "help.skillDetection.tip1.example":
    "\"Write a product review for Nike Air Max\" triggers the product-reviewer skill.",
  "help.skillDetection.tip1.why":
    "Specific nouns help the detector match the right skill.",
  "help.skillDetection.tip2.title": "Include the domain or category",
  "help.skillDetection.tip2.example":
    "\"Create an image prompt for a sunset landscape\" triggers the image-prompt-engineer skill.",
  "help.skillDetection.tip2.why":
    "Domain keywords (image, video, article, review) are strong detection signals.",
  "help.skillDetection.tip3.title": "Use the skill's language naturally",
  "help.skillDetection.tip3.example":
    "\"create presentation about AI\" auto-triggers presentation generation.",
  "help.skillDetection.tip3.why":
    "Both Thai and English trigger phrases are supported.",
  "help.skillDetection.tip4.title":
    "Combine with media generation keywords",
  "help.skillDetection.tip4.example":
    "\"Generate a video of a talking cat using viral style\" triggers the viral-talking-objects skill.",
  "help.skillDetection.tip4.why":
    "Media-type keywords plus style hints guide skill selection.",
  "help.skillDetection.howItWorks.title": "How auto-detection works",
  "help.skillDetection.howItWorks.1":
    "When you send a message, the system scans it for known keyword patterns.",
  "help.skillDetection.howItWorks.2":
    "Each enabled skill has tags and trigger patterns that are scored against your message.",
  "help.skillDetection.howItWorks.3":
    "The skill with the highest confidence score is selected automatically.",
  "help.skillDetection.howItWorks.4":
    "If no skill matches above the confidence threshold, the message goes to the general LLM.",
  "help.skillDetection.howItWorks.5":
    "You can always override by selecting a skill from the / slash menu before sending.",

  // ── Memory ───────────────────────────────────────────────────
  "help.memory.title": "Memory",
  "help.memory.intro":
    "Memory lets the AI remember your preferences, project context, decisions, and important facts across all conversations. Open the Memory panel in the right sidebar to manage everything.",

  "help.memory.what.title": "What Memory stores",
  "help.memory.what.1": "Preferences and style — how you like to work, tools you prefer.",
  "help.memory.what.2": "Project details — tech stack, goals, team names.",
  "help.memory.what.3": "Decisions and plans — what has been decided, milestones, next steps.",
  "help.memory.what.4": "Technical knowledge — frameworks, databases, APIs, architecture patterns.",
  "help.memory.what.5": "Rules — hard constraints the AI must always follow.",

  "help.memory.modes.title": "Memory modes",
  "help.memory.modes.full.name": "Full Memory (default)",
  "help.memory.modes.full.desc": "AI remembers everything: your preferences, project facts, decisions, rules, plus summaries of older conversations.",
  "help.memory.modes.nolong.name": "No Long Memory",
  "help.memory.modes.nolong.desc": "AI sees only recent messages and old summaries. Forgets preferences and project facts. Good for a fresh perspective.",
  "help.memory.modes.off.name": "Memory Off",
  "help.memory.modes.off.desc": "AI sees only the current conversation. Nothing from before. Best for privacy or sensitive topics.",

  "help.memory.types.title": "Memory types",
  "help.memory.types.rule": "Rule — Hard constraints the AI must always follow. Importance 10, never auto-deleted.",
  "help.memory.types.user": "User — Facts about you: role, expertise, name.",
  "help.memory.types.project": "Project — Project name, purpose, tech stack, goals.",
  "help.memory.types.preference": "Preference — How you like to work: tools, coding style, communication.",
  "help.memory.types.technical": "Technical — Frameworks, databases, APIs you use.",
  "help.memory.types.decision": "Decision — Important choices made during work.",
  "help.memory.types.plan": "Plan — Roadmaps, milestones, next steps.",
  "help.memory.types.architecture": "Architecture — System design, module structure, patterns.",
  "help.memory.types.task": "Task — To-do items and action items.",

  "help.memory.auto.title": "Automatic memory",
  "help.memory.auto.1": "The AI automatically extracts facts from your conversations and saves them.",
  "help.memory.auto.2": "Low-importance facts are saved silently. High-importance ones prompt for confirmation.",
  "help.memory.auto.3": "Personal info (emails, passwords, API keys) is automatically filtered out and never saved.",
  "help.memory.auto.4": "Memories last 180 days unless accessed. Rules are never auto-deleted.",

  "help.memory.summary.title": "Auto-summarization and compaction",
  "help.memory.summary.1": "When old messages reach 70% of the model's context window, the AI creates a summary automatically.",
  "help.memory.summary.2": "Summaries capture key decisions, action items, and important context from older messages.",
  "help.memory.summary.3": "When 2+ summaries exist, they are consolidated into one meta-summary to keep context efficient.",
  "help.memory.summary.4": "Use the Compact button to force summarization manually. Use Clear Old to delete memories older than 1/3/6 months.",

  "help.memory.projects.title": "Projects and cross-chat memory",
  "help.memory.projects.1": "Tag conversations with a project name in the Memory panel.",
  "help.memory.projects.2": "All memories created in that project are available in any chat tagged with the same project.",
  "help.memory.projects.3": "Global memories (no project tag) are visible in all your chats.",

  "help.memory.manage.title": "Managing memories",
  "help.memory.manage.1": "Add: Click the + Add button, choose a type, name it, write the content, and set importance (1-10).",
  "help.memory.manage.2": "Delete: Hover over a memory and click the trash icon.",
  "help.memory.manage.3": "Filter: Use the type filter buttons (All, User, Project, Preference, etc.) to find specific memories.",
  "help.memory.manage.4": "Importance: Higher scores (8-10) mean the AI always considers this fact. Lower scores (1-4) are nice-to-know.",

  "help.memory.tips.title": "Tips for better memory",
  "help.memory.tips.1": "Be specific: \"I prefer readable variable names and JSDoc comments\" beats \"I prefer good code\".",
  "help.memory.tips.2": "One fact per memory — makes it easier to update or delete individual items later.",
  "help.memory.tips.3": "Use Rules (importance 10) for hard constraints like \"Always use HTTPS\" or \"Never commit secrets\".",
  "help.memory.tips.4": "Update when things change — delete outdated memories and add new ones.",

  // ── Browser Session ──────────────────────────────────────────
  "help.browser.title": "Browser Session",
  "help.browser.1":
    "Use Browser Session when the task requires live websites, comparison across pages, or a real browser workflow.",
  "help.browser.2":
    "Start Browser Session from Chat, then continue in the live workspace or keep sending quick browser instructions from Chat.",
  "help.browser.3":
    "Browser Session is best for finding websites, navigating pages, comparing options, and pausing for approval-sensitive steps.",

  // ── Agencies ─────────────────────────────────────────────────
  "help.agencies.title": "Agencies — Multi-Agent Teams",
  "help.agencies.1":
    "Agencies are multi-agent teams that work together to complete complex tasks.",
  "help.agencies.2":
    "Each agency has specialized agents (researcher, writer, planner) that collaborate automatically.",
  "help.agencies.3":
    "Access agencies via the Agencies button in the toolbar or the Explore Agencies button on the welcome screen.",
  "help.agencies.4":
    "Agencies produce structured output such as research reports, storyboards, presentation decks, and comparisons.",
  "help.agencies.howToStart.title": "How to get started",
  "help.agencies.howToStart.1":
    "Click Agencies in the Chat toolbar (or Explore Agencies on the welcome screen).",
  "help.agencies.howToStart.2":
    "Browse available agencies or create one from a template (Deep Research, Storyboard Planner, Deck Builder).",
  "help.agencies.howToStart.3":
    "Open an agency and type your request in the Agency Chat.",
  "help.agencies.howToStart.4":
    "The agents work together automatically. When finished, a Preview Card appears.",
  "help.agencies.howToStart.5":
    "Review the preview and click Save to commit it to your Library or Presentation Editor.",
  "help.agencies.templates.title": "Available agency templates",
  "help.agencies.tpl.research.name": "Deep Research",
  "help.agencies.tpl.research.output": "Research Report",
  "help.agencies.tpl.research.example":
    "\"Research AI marketing trends in Southeast Asia 2026\"",
  "help.agencies.tpl.research.desc":
    "Multi-source research with executive summary, key findings, sections, and recommendations.",
  "help.agencies.tpl.storyboard.name": "Storyboard Planner",
  "help.agencies.tpl.storyboard.output": "Video Storyboard",
  "help.agencies.tpl.storyboard.example":
    "\"Create a 60-second product launch storyboard for a fitness app\"",
  "help.agencies.tpl.storyboard.desc":
    "Scene-by-scene video plan with dialogue, camera angles, lighting, and audio/video prompts.",
  "help.agencies.tpl.deck.name": "Deck Builder",
  "help.agencies.tpl.deck.output": "Presentation Deck",
  "help.agencies.tpl.deck.example":
    "\"Build a Q4 earnings presentation with 8 slides\"",
  "help.agencies.tpl.deck.desc":
    "Full slide deck with titles, bullet points, speaker notes, and graphic suggestions. Saves directly to the Presentation Editor.",
  "help.agencies.tpl.comparison.name": "Comparison Agent",
  "help.agencies.tpl.comparison.output": "Comparison Table",
  "help.agencies.tpl.comparison.example":
    "\"Compare 5 hotels in Chiang Mai under 3000 THB/night\"",
  "help.agencies.tpl.comparison.desc":
    "Side-by-side options with pricing, availability, evidence links, and recommendations.",
  "help.agencies.preview.title": "Preview card states",
  "help.agencies.preview.ready": "Preview Ready",
  "help.agencies.preview.ready.desc":
    "The agents finished. Review the preview and decide whether to save.",
  "help.agencies.preview.saving": "Saving...",
  "help.agencies.preview.saving.desc": "Commit is in progress.",
  "help.agencies.preview.committed": "Committed",
  "help.agencies.preview.committed.desc":
    "Saved successfully. For decks you are redirected to the Presentation Editor. For other types a View in Library link appears in the toast.",
  "help.agencies.preview.failed": "Save Failed",
  "help.agencies.preview.failed.desc":
    "Something went wrong. A Retry Save button appears so you can try again.",
  "help.agencies.preview.expired": "Expired",
  "help.agencies.preview.expired.desc":
    "The preview timed out before you saved it. Run the agency again to get a fresh preview.",
  "help.agencies.commit.title": "Save actions by type",
  "help.agencies.commit.col.type": "Preview Type",
  "help.agencies.commit.col.button": "Button Label",
  "help.agencies.commit.col.dest": "Where It Goes",
  "help.agencies.commit.research.type":
    "Research / Storyboard / Comparison",
  "help.agencies.commit.research.button": "Save to Library",
  "help.agencies.commit.research.dest":
    "Library (toast shows View in Library link)",
  "help.agencies.commit.deck.type": "Presentation Deck",
  "help.agencies.commit.deck.button": "Save as Presentation",
  "help.agencies.commit.deck.dest":
    "Redirects to Presentation Editor automatically",
  "help.agencies.other.title": "Other actions",
  "help.agencies.other.1":
    "Click the X button on a Preview Card to dismiss it without saving.",
  "help.agencies.other.2":
    "If the preview fails to load, a red error toast appears. Send the same message again to retry.",
  "help.agencies.other.3":
    "If the save fails, the button changes to Retry Save. Click it to try again.",

  // ── Common use cases ─────────────────────────────────────────
  "help.useCases.title": "Common use cases",
  "help.useCases.1":
    "Ask for a concise answer, then save the final decision to Memory.",
  "help.useCases.2":
    "Use /skills to run a specialized document, code, or research workflow.",
  "help.useCases.3":
    "Generate an image concept, enhance the prompt, then create the final image.",
  "help.useCases.4":
    "Switch to Browser Session when the task moves from planning into live website execution.",
  "help.useCases.5":
    "Use Brainstorm Mode when you want two models to explore alternatives before choosing one.",
  "help.useCases.6":
    "Move to Agencies when the task needs a multi-agent team to produce structured deliverables like reports or decks.",

  // ── Browser Session Help ──────────────────────────────────────
  "bsHelp.title": "Browser Session Help",
  "bsHelp.description":
    "Use Browser Session when you want AI to find websites, browse pages, compare options, and continue working in a live browser for you.",
  "bsHelp.what.title": "What Browser Session does",
  "bsHelp.what.body":
    "You describe the outcome you want. The system can infer a browser skill, discover relevant websites, open a live browser session, and continue working while you supervise or step in only when needed.",
  "bsHelp.quickStart.title": "Quick start",
  "bsHelp.quickStart.1": "Click Start Browser Session from Chat.",
  "bsHelp.quickStart.2": "Describe the result you want in plain English.",
  "bsHelp.quickStart.3":
    "Let the system search for relevant websites and start browsing.",
  "bsHelp.quickStart.4":
    "Open the live session if you want to watch or steer the browser in real time.",
  "bsHelp.quickStart.5":
    "Send follow-up instructions instead of restarting from scratch.",
  "bsHelp.request.title": "How to write a strong request",
  "bsHelp.request.1":
    "Goal: what outcome you want, not every click.",
  "bsHelp.request.2":
    "Constraints: budget, region, dates, brands, must-have filters, or exclusions.",
  "bsHelp.request.3":
    "Output: ask for a shortlist, comparison table, summary, or evidence links.",
  "bsHelp.prompts.title": "Prompt examples",
  "bsHelp.prompts.1":
    "Find the best websites for boutique hotels in Tokyo for April 10-13, 2026, keep the nightly budget under $150, and return the top 3 options with pros and cons.",
  "bsHelp.prompts.2":
    "Research CRM tools for a 10-person sales team, compare pricing and automation features, and recommend the best fit for a low-budget startup.",
  "bsHelp.prompts.3":
    "Find reliable laptop deals for video editing under $1,200, avoid refurbished items, and explain which model offers the best value.",
  "bsHelp.prompts.4":
    "Open the login flow for Service X, take me to the account settings page, and pause when OTP or MFA is required.",
  "bsHelp.prompts.5":
    "Find three event venues in Bangkok for a 100-person workshop, compare package pricing, and note parking and AV support.",
  "bsHelp.prompts.6":
    "Identify the strongest public sources about the new regulation, summarize the practical impact, and include links to the official pages.",
  "bsHelp.running.title": "While the session is running",
  "bsHelp.running.1":
    "Open the live Browser Session to watch the browser in real time.",
  "bsHelp.running.2":
    "Use Send Browser Instruction to adjust the task while the session is running.",
  "bsHelp.running.3":
    "Switch skills if the task changes from research to comparison, booking, or account access.",
  "bsHelp.running.4":
    "If the system pauses for approval, MFA, or payment, take over briefly and then return control.",
  "bsHelp.best.title": "Best practices",
  "bsHelp.best.1":
    "Start with the result you want. Example: \"Find the best three vendors for X and explain the tradeoffs.\"",
  "bsHelp.best.2":
    "Say what to avoid. Example: \"Avoid marketplaces, sponsored listings, and sites with unclear pricing.\"",
  "bsHelp.best.3":
    "Tell the AI when to stop and wait. Example: \"Pause before payment, login confirmation, or OTP.\"",
  "bsHelp.best.4":
    "Ask for structure. Example: \"Return a ranked comparison with pros, cons, and final recommendation.\"",
  "bsHelp.best.5":
    "Use follow-up instructions instead of restarting. Example: \"Narrow to options available in Bangkok only.\"",
  "bsHelp.useCases.title": "Diverse use cases",
  "bsHelp.useCases.1": "Travel planning: find flights, compare hotels, and narrow down the best itinerary.",
  "bsHelp.useCases.2": "Shopping research: compare laptops, phones, cameras, or office equipment across multiple sites.",
  "bsHelp.useCases.3": "Vendor sourcing: find SaaS tools, agencies, or suppliers and summarize pricing and capabilities.",
  "bsHelp.useCases.4": "Real estate scouting: search listings, compare neighborhoods, and flag the strongest candidates.",
  "bsHelp.useCases.5": "Recruiting support: collect candidate pages, portfolio links, and evidence for shortlisting.",
  "bsHelp.useCases.6": "Lead generation: discover relevant company websites and gather structured notes for outreach.",
  "bsHelp.useCases.7": "Market research: identify competitors, pricing patterns, feature positioning, and public messaging.",
  "bsHelp.useCases.8": "Procurement: find distributors or wholesalers and compare minimum order, shipping, and payment options.",
  "bsHelp.useCases.9": "Event planning: discover venues, compare packages, and summarize booking requirements.",
  "bsHelp.useCases.10": "Education research: find courses, compare syllabi, and shortlist providers by schedule and cost.",
  "bsHelp.useCases.11": "Grant or tender research: discover official sources, compare requirements, and summarize deadlines.",
  "bsHelp.useCases.12": "Customer support assistance: navigate product docs or help centers and bring back the exact answer.",
  "bsHelp.useCases.13": "Account workflows: open a service, reach the right settings page, and pause before sensitive actions.",
  "bsHelp.useCases.14": "Booking assistant: prepare a checkout or reservation flow and stop when your confirmation is needed.",
  "bsHelp.useCases.15": "Content sourcing: find primary sources, case studies, or examples to support a report.",
  "bsHelp.useCases.16": "Price monitoring: revisit product pages, capture current price signals, and summarize changes.",
  "bsHelp.useCases.17": "B2B partner discovery: find potential partners in a region and rank them by fit.",
  "bsHelp.useCases.18": "Compliance or policy lookup: locate official pages and summarize the parts relevant to your goal.",
  "bsHelp.pause.title": "When the AI should pause for you",
  "bsHelp.pause.1": "OTP, MFA, or device verification.",
  "bsHelp.pause.2": "Payments, bookings, purchases, or any irreversible action.",
  "bsHelp.pause.3": "Anything sensitive that you want to review before submission.",

  // ── Shared UI labels ─────────────────────────────────────────
  "common.output": "Output",
  "common.example": "Example",
};

export default en;
