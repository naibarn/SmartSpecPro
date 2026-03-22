---
name: Chat Memory Help Guide - User-Facing Documentation
description: Simple, user-friendly explanations of all memory features for end-user help/docs
type: project
---

# Chat Memory System — Help Guide

## What is Memory?

The AI learns about you as you chat. The **Memory Panel** stores:
- **Your preferences & style** (how you like to work)
- **Project details** (tech stack, goals, names)
- **Decisions & plans** (what you've decided, what's next)
- **Important facts** (domain knowledge, patterns you care about)

This helps the AI give better, more personalized responses in all your conversations.

---

## Memory Panel Overview

The **Memory** panel is in the right sidebar of your chat.

### What You Can Do

**Add a Memory:**
1. Click the **+ Add** button
2. Choose a type (Preference, Project, Rule, etc.)
3. Give it a name (e.g., "coding_style")
4. Write what you want remembered
5. Set importance (1–10, optional)
6. Click **Add Memory**

**Organize by Type:**
- Use the filter buttons (All, User, Project, Preference, etc.) to see specific memories
- Memories are color-coded by type

**Delete a Memory:**
- Hover over a memory → click the trash icon

**See More Details:**
- Click "+" to expand a memory with many facts
- Click on a summary to expand/collapse it

---

## Memory Modes

Choose how much the AI remembers:

### Full Memory (Default)
✅ AI remembers: your preferences, projects, decisions, plans, rules
✅ AI sees: summaries of older conversations + recent chat
✅ Best for: Ongoing projects, consistent preferences

### No Long Memory
✅ AI remembers: only recent conversation + old summaries
❌ AI forgets: your preferences, projects, personal facts
✅ Best for: Fresh perspective, testing ideas without bias

### Memory Off
✅ AI sees: only this conversation
❌ AI forgets: everything from before
✅ Best for: Privacy, totally separate topic, sensitive discussions

**To change:** Click the mode buttons in the Memory Panel

---

## Automatic Memory

The AI automatically learns and saves facts from your conversations.

### What Gets Saved?

The AI looks for:
- **Preferences:** "I prefer TypeScript", "I use React"
- **Projects:** "Working on SmartSpec", "The app is called..."
- **Decisions:** "We decided to use PostgreSQL"
- **Plans:** "Next steps:", "Milestone:", "The plan is..."
- **Technical details:** Frameworks, databases, APIs you mention

### Low-Importance Facts
- Auto-saved silently
- You'll see them in the Memory Panel

### High-Importance Facts
- You'll get a notification suggesting them
- Click to confirm before saving

### What Won't Be Saved
- Personal info (emails, phone numbers, passwords)
- Sensitive data (API keys, tokens, credentials)

---

## Projects & Cross-Chat Memory

### Set a Project

1. In the Memory Panel, find the **Project** section
2. Click **Edit**
3. Type your project name (e.g., "SmartSpec", "Acme Co")
4. Click **Save**

### What It Does

- AI remembers all facts learned in this project across multiple chats
- **New Chat in "SmartSpec"** button appears → start a fresh conversation that remembers all project context

### Global vs Project Memory

| Memory | Visible In | Example |
|--------|-----------|---------|
| **Global** | All your chats | Your coding style, preferred language |
| **Project** | Only chats tagged with that project | SmartSpec architecture, tech decisions |

---

## Summaries & Context Compression

When conversations get long, the AI summarizes old messages to save space.

### How It Works

1. You chat for a while
2. When old messages start taking up 70% of context, AI creates a **Summary**
3. Summary = key points from old messages (decisions, action items, etc.)
4. Old messages are compressed away, but you don't lose context

### What You'll See

- **Summaries section** in Memory Panel (shows summaries created)
- No action needed — it's automatic
- Toast notification: "Auto-compacted: X messages summarized to save context"

### Manual Compact

If you want to force summarization:
1. Click **Compact** button
2. Old messages get summarized immediately
3. Notification shows how many messages were processed

### Clear Old Memories

To delete memories you don't need anymore:
1. Click **Clear Old** button
2. Choose: 1 month / 3 months / 6 months
3. Confirm
4. Old memories deleted (Rules are never deleted)

---

## Memory Consolidation

**Note:** This is automatic, behind-the-scenes.

When summaries pile up (2+ summaries in one chat), the AI merges them into one "meta-summary":
- **Before:** [Summary 1] [Summary 2] [Summary 3]
- **After:** [One consolidated summary]

This keeps context efficient.

**You'll see:** Toast notification "Context consolidated: old summaries merged to optimize memory"

---

## Creating Memories by Type

### Rule
- Something the AI should ALWAYS remember and follow
- Example: "Never use deprecated methods"
- Importance: Always 10 (highest)
- Never auto-deleted

### User
- Facts about you: your role, expertise, name
- Example: "Frontend engineer with 10 years React experience"
- Importance: Default 5

### Project
- Project name, purpose, tech stack
- Example: "SmartSpec is an AI content generation platform using React + Node.js"
- Importance: Default 6

### Preference
- How you like to work: tools, coding style, communication
- Example: "I prefer TypeScript over JavaScript"
- Importance: Default 5

### Technical
- Frameworks, databases, APIs you use
- Example: "Using PostgreSQL 15 for the database"
- Importance: Default 7

### Decision
- Important choices you've made
- Example: "Chose Next.js over Remix for better DX"
- Importance: Default 8 (suggested, not auto-saved)

### Plan
- Roadmaps, milestones, next steps
- Example: "Q1 goal: launch v2.0"
- Importance: Default 9

### Architecture
- System design, module structure, patterns
- Example: "MVC pattern with service layer"
- Importance: Default 9

### Component
- Parts you've built or are building
- Example: "Dashboard component with real-time updates"
- Importance: Default 7

### Task
- To-do items, action items
- Example: "Implement OAuth2 authentication"
- Importance: Default 6

### Code Knowledge
- Code patterns, implementation details you want remembered
- Example: "Always use transactions for data consistency"
- Importance: Default 8

---

## Importance Scores

### What Do They Mean?

**1–4 (Low)**
- Nice to know, but not critical
- Example: "I like dark mode"

**5–7 (Medium)**
- Relevant but not always
- Example: "Working on a React project"

**8–10 (High)**
- Very important, remember always
- Example: "Never use plaintext passwords"
- Importance 10 = "Rules" (never deleted, always included)

### How It Affects AI

Higher importance = AI prioritizes this fact in responses
Lower importance = AI may forget it if context is tight

You can change importance when creating a memory (slider 1–10).

---

## FAQ

### "Will the AI remember my password or API key?"
**No.** Sensitive data is automatically filtered out before saving.

### "How long does the AI remember?"
**Memories last 180 days** (unless you delete them or they're never accessed).
**Rules last forever** (never auto-deleted).

### "Can I share memories with teammates?"
**Not yet.** Memories are private to your account. But you can manually describe shared context in the chat.

### "What if the AI remembers something wrong?"
**Delete it.** Hover over the memory and click the trash icon. The AI won't use it anymore.

### "Can the AI read memories from other conversations?"
**Yes.** Memories created in one chat are available in all your chats (if using "Full Memory" mode).

### "Does memory cost credits?"
**Mostly no.** Basic memory storage is free. But:
- Auto-summarization uses credits (LLM call to summarize old messages)
- You can reduce costs by using "No Long Memory" mode

### "How do I turn memory off completely?"
**Set Memory Mode to "Off"** — the AI will only see your current conversation.

### "What's a 'Rule' and why is it special?"
**Rule** = Important guideline the AI should ALWAYS follow (importance 10)
- Never auto-deleted
- Always included in context
- Example: "Never run untrusted code"

### "Can I edit a memory?"
**Delete and recreate it.** Click trash, then click + Add to create a new one.

---

## Tips for Better Memory

### 1. Be Specific
❌ Bad: "I prefer good code"
✅ Good: "I prefer readable variable names and JSDoc comments"

### 2. One Fact Per Memory
❌ Bad: "I like React and TypeScript and dark mode"
✅ Good: Multiple memories — one for React, one for TypeScript, one for dark mode

### 3. Update When Things Change
If you switch from React to Vue → delete the React memory, add Vue memory

### 4. Use Rules for Hard Constraints
- "Always use HTTPS"
- "Never commit secrets to Git"
- "Always validate user input"

### 5. Set Correct Importance
- Use 8–10 for things the AI should always consider
- Use 1–5 for nice-to-know preferences

### 6. Organize by Project
If you work on multiple projects, tag memories with the project name

---

## Troubleshooting

### "The AI doesn't seem to remember my preferences"
1. Check Memory Mode is set to **Full** (not "Off")
2. Check the memory exists in Memory Panel
3. Try refreshing the page
4. Try creating a new chat

### "I don't want the AI to remember something, but it's already saved"
→ Delete it from the Memory Panel (trash icon)

### "The 'Clear Old' button deleted memories I wanted to keep"
→ Only memories older than your chosen period are deleted. Rules are never deleted.
→ If you need to restore: contact support (check backup logs)

### "The 'Compact' button is grayed out"
→ You need at least 6 unsummarized messages. Keep chatting until there are more.

### "I set a Project but it's not showing memories"
→ Make sure new chats have the same project name. Memories are scoped by exact project ID match.

---

## Best Practices

- **Update regularly** — If context changes, update memories
- **Be precise** — Vague facts are less useful than specific ones
- **Clean up** — Use "Clear Old" occasionally to remove outdated memories
- **Use Rules wisely** — Reserve for truly important constraints
- **Tag with projects** — Makes cross-chat context easier to manage

---

## Need Help?

For questions or issues:
- Check the Memory Panel tooltip (hover over icons)
- Re-read the relevant section above
- Contact support if memory isn't persisting correctly

---

**Last updated:** 2026-03-17
**For:** End users, help docs, support team
