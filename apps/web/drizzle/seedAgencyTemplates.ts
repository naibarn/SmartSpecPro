/**
 * Seed script for baseline Agency and Agent templates.
 *
 * Usage: npx tsx apps/web/drizzle/seedAgencyTemplates.ts
 */
import { getDb } from "../server/db";
import { agencyTemplates, agentTemplates } from "./schema";
import { v4 as uuidv4 } from "uuid";

export async function seedAgencyTemplates(): Promise<void> {
    const db = await getDb();
    if (!db) {
        console.warn("[Seed] Database not available");
        return;
    }

    // 1. Create Base Agent Roles (Floating templates, not attached to any Agency Template)
    // These will populate the drag-and-drop Sidebar

    const baseRoles = [
        {
            id: "tmpl-agent-ceo",
            name: "Manager",
            role: "CEO / Manager",
            description: "Coordinates tasks, plans strategy, and delegates to other agents.",
            instructions: "You are the manager. Break down the user's request into smaller tasks and delegate them to your team members. Do not do the work yourself if a team member is better suited.",
            category: "Management",
            icon: "briefcase",
            isEntryPoint: true,
        },
        {
            id: "tmpl-agent-copywriter",
            name: "Copywriter",
            role: "Content Writer",
            description: "Writes engaging content, blog posts, and social media copy.",
            instructions: "You are an expert copywriter. Write clear, engaging, and persuasive content based on the instructions provided. Maintain the requested tone at all times.",
            category: "Marketing",
            icon: "pen-tool",
            isEntryPoint: false,
        },
        {
            id: "tmpl-agent-developer",
            name: "Developer",
            role: "Software Engineer",
            description: "Writes code, debugging, and systems architecture.",
            instructions: "You are a senior software engineer. Write clean, maintainable, and efficient code. Always explain your technical decisions.",
            category: "Engineering",
            icon: "code",
            isEntryPoint: false,
        },
        {
            id: "tmpl-agent-analyst",
            name: "Data Analyst",
            role: "Data Analyst",
            description: "Analyzes datasets, creates reports, and interprets metrics.",
            instructions: "You are a data analyst. When provided with data, analyze it thoroughly, identify trends, and provide actionable insights in a clear format.",
            category: "Research",
            icon: "bar-chart",
            isEntryPoint: false,
        },
        {
            id: "tmpl-agent-va",
            name: "Virtual Assistant",
            role: "Assistant",
            description: "Handles routine tasks, scheduling, and general inquiries.",
            instructions: "You are a helpful and polite virtual assistant. Assist the user with their daily tasks accurately and efficiently.",
            category: "Support",
            icon: "calendar",
            isEntryPoint: true,
        }
    ];

    for (const role of baseRoles) {
        await db
            .insert(agentTemplates)
            .values(role)
            .onConflictDoUpdate({
                target: agentTemplates.id,
                set: role
            });
    }

    // 2. Create Pre-configured Agency Templates (1-Click deployments)

    const agencySeoId = "tmpl-agency-seo";
    const agencyEcommerceId = "tmpl-agency-ecommerce";

    const agencyTemplatesData = [
        {
            id: agencySeoId,
            name: "SEO Content Team",
            description: "A complete team to research keywords and write SEO-optimized blog posts.",
            systemPrompt: "You are an SEO Content Agency. Your goal is to produce high-ranking articles.",
            category: "Marketing",
            isActive: true,
        },
        {
            id: agencyEcommerceId,
            name: "E-Commerce Support",
            description: "Customer support pipeline that routes tickets and answers product questions.",
            systemPrompt: "You are an E-Commerce Support Agency.",
            category: "Support",
            isActive: true,
        }
    ];

    for (const template of agencyTemplatesData) {
        await db
            .insert(agencyTemplates)
            .values(template)
            .onConflictDoUpdate({
                target: agencyTemplates.id,
                set: template
            });
    }

    // Add linked agents for the SEO Team template
    const seoAgents = [
        {
            id: `tmpl-agent-seo-manager`,
            agencyTemplateId: agencySeoId,
            name: "SEO Manager",
            role: "Manager",
            description: "Plans the content strategy and assigns keywords.",
            instructions: "You are the SEO Manager. Receive topics from the user and assign the keyword research to the Researcher, then assign writing to the Writer.",
            category: "Marketing",
            icon: "briefcase",
            isEntryPoint: true,
            position: { x: 250, y: 100 },
        },
        {
            id: `tmpl-agent-seo-researcher`,
            agencyTemplateId: agencySeoId,
            name: "Keyword Researcher",
            role: "Researcher",
            description: "Finds the best keywords using web search.",
            instructions: "You are a Keyword Researcher. Find high-volume, low-competition keywords for the requested topic.",
            category: "Marketing",
            icon: "search",
            isEntryPoint: false,
            position: { x: 100, y: 300 },
        },
        {
            id: `tmpl-agent-seo-writer`,
            agencyTemplateId: agencySeoId,
            name: "SEO Writer",
            role: "Content Writer",
            description: "Writes the final article incorporating the keywords.",
            instructions: "You are an SEO Writer. Use the keywords provided by the researcher to write a comprehensive, engaging article.",
            category: "Marketing",
            icon: "pen-tool",
            isEntryPoint: false,
            position: { x: 400, y: 300 },
        }
    ];

    for (const agent of seoAgents) {
        await db
            .insert(agentTemplates)
            .values(agent)
            .onConflictDoUpdate({
                target: agentTemplates.id,
                set: agent
            });
    }

    console.log(`[Seed] Agency templates seeded successfully!`);
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedAgencyTemplates()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("[Seed] Failed:", err);
            process.exit(1);
        });
}
