# Section 07: Marketplace CRUD & Developer Verification

**Phase**: 2 - Skill Marketplace
**Estimated Time**: 5-6 days
**Priority**: High
**Dependencies**: Section 06 (Manifest Schema)

---

## Overview

Implement skill marketplace CRUD operations, developer verification workflow, and admin review system. Users can browse/search skills, verified developers can submit skills for review, admins approve/reject submissions.

---

## Goals

- ✅ tRPC routers for skill marketplace (list, search, fork, rate)
- ✅ Developer verification application + admin approval workflow
- ✅ Skill submission + admin review queue
- ✅ React UI for marketplace and admin panel
- ✅ All tests pass

---

## Files to Create/Modify

**Node.js Backend (tRPC)**:
- `apps/web/server/routers/workflowRouter.ts` - Skill CRUD
- `apps/web/server/routers/developerRouter.ts` - Developer verification
- `apps/web/server/services/skillService.ts` - Business logic

**React Frontend**:
- `apps/web/client/src/pages/Marketplace.tsx` - Browse skills
- `apps/web/client/src/pages/SkillDetail.tsx` - Skill detail page
- `apps/web/client/src/components/admin/DeveloperApprovals.tsx` - Admin UI

**Database (Drizzle)**:
- `apps/web/drizzle/schema.ts` - Add verified_developers, skill_ratings tables

---

## Implementation Steps

### Step 1: Create Database Tables

```typescript
// drizzle/schema.ts
export const verifiedDevelopers = pgTable("verified_developers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // pending, approved, rejected
  applicationNotes: text("application_notes"),
  githubUrl: varchar("github_url", { length: 500 }),
  portfolioUrl: varchar("portfolio_url", { length: 500 }),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow()
});

export const skillRatings = pgTable("skill_ratings", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(),
  reviewText: text("review_text"),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  uniqueUserRating: unique().on(table.templateId, table.userId)
}));
```

Run migration: `pnpm db:push`

### Step 2: Create tRPC Routers

```typescript
// server/routers/workflowRouter.ts
export const workflowRouter = router({
  listMarketplace: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
      sort: z.enum(["recent", "popular", "rated"]).default("recent")
    }))
    .query(async ({ input }) => {
      // Query workflow_templates where visibility='marketplace'
    }),

  getSkillDetail: publicProcedure
    .input(z.object({ templateId: z.number() }))
    .query(async ({ input }) => {
      // Fetch skill + ratings + author info
    }),

  forkSkill: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Copy marketplace skill to user's private templates
      // Record in workflow_forks table
    }),

  rateSkill: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      rating: z.number().min(1).max(5),
      reviewText: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      // Insert into skill_ratings
    }),

  submitSkillForReview: protectedProcedure
    .input(z.object({ manifestJson: z.any() }))
    .mutation(async ({ ctx, input }) => {
      // Validate manifest, create workflow_template with status='pending_review'
    })
});
```

### Step 3: Create React UI

```tsx
// client/src/pages/Marketplace.tsx
export function Marketplace() {
  const { data: skills } = trpc.workflow.listMarketplace.useQuery({});

  return (
    <div className="marketplace">
      <SearchBar />
      <FilterPanel />
      <SkillGrid skills={skills} />
    </div>
  );
}

// client/src/pages/SkillDetail.tsx
export function SkillDetail() {
  const { templateId } = useParams();
  const { data: skill } = trpc.workflow.getSkillDetail.useQuery({ templateId });
  const forkMutation = trpc.workflow.forkSkill.useMutation();

  return (
    <div className="skill-detail">
      <SkillHeader skill={skill} />
      <SkillManifest manifest={skill.manifestJson} />
      <RatingsSection ratings={skill.ratings} />
      <Button onClick={() => forkMutation.mutate({ templateId })}>
        Fork to My Skills
      </Button>
    </div>
  );
}
```

---

## Tests

```typescript
// tests/workflowRouter.test.ts
describe("Marketplace", () => {
  test("lists marketplace skills", async () => {
    const skills = await caller.workflow.listMarketplace({});
    expect(skills.length).toBeGreaterThan(0);
  });

  test("forks skill to private", async () => {
    const forked = await caller.workflow.forkSkill({ templateId: 1 });
    expect(forked.visibility).toBe("private");
  });

  test("prevents duplicate forks", async () => {
    await caller.workflow.forkSkill({ templateId: 1 });
    await expect(caller.workflow.forkSkill({ templateId: 1 })).rejects.toThrow("Already forked");
  });
});
```

---

## Completion Checklist

- [ ] Database tables created
- [ ] tRPC routers implemented
- [ ] React UI complete
- [ ] Developer verification workflow works
- [ ] Skill submission + admin review works
- [ ] All tests pass

**Estimated Completion**: 5-6 days
