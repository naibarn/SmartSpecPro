# Phase 2: Non-Dev Friendly

**Duration:** 4-8 สัปดาห์  
**Goal:** ทำให้ผู้ใช้ที่ไม่ใช่ developer สามารถใช้งาน SmartSpecPro ได้  
**Dependencies:** Phase 1 Complete  

---

## 🎯 Phase Goal

Phase 2 มุ่งเน้นการทำให้ SmartSpecPro เข้าถึงได้ง่ายสำหรับ:
- **Product Managers** - สร้าง spec และติดตาม progress
- **Designers** - ทำงานร่วมกับ dev โดยไม่ต้องเขียน code
- **Business Analysts** - กำหนด requirements และ review
- **Non-technical founders** - สร้าง MVP จาก idea

---

## 📋 Sprints Overview

| Sprint | ชื่อ | Duration | Focus |
|--------|------|----------|-------|
| 2.1 | Product Template Wizard | 2 สัปดาห์ | Template selection & scaffolding |
| 2.2 | Visual Spec Builder | 2 สัปดาห์ | No-code spec creation |
| 2.3 | Progress Dashboard | 1.5 สัปดาห์ | Project tracking & visualization |
| 2.4 | Collaboration Features | 1.5 สัปดาห์ | Team collaboration |

**รวม Phase 2:** 7 สัปดาห์

---

## 🏗️ Architecture Changes

### New Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 2 COMPONENTS                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  TEMPLATE ENGINE                                                             ││
│  │  • Template registry                                                         ││
│  │  • Variable substitution                                                     ││
│  │  • File scaffolding                                                          ││
│  │  • Post-generation hooks                                                     ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  VISUAL SPEC BUILDER                                                         ││
│  │  • Drag-and-drop UI                                                          ││
│  │  • Component library                                                         ││
│  │  • Flow diagrams                                                             ││
│  │  • Spec generation                                                           ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  PROGRESS TRACKER                                                            ││
│  │  • Task visualization                                                        ││
│  │  • Timeline view                                                             ││
│  │  • Burndown charts                                                           ││
│  │  • Status reports                                                            ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  COLLABORATION HUB                                                           ││
│  │  • Comments & discussions                                                    ││
│  │  • Review workflow                                                           ││
│  │  • Notifications                                                             ││
│  │  • Activity feed                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### User Journey (Non-Dev)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         NON-DEV USER JOURNEY                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │   SELECT     │     │   DESCRIBE   │     │   REVIEW     │     │   TRACK      │
    │   TEMPLATE   │ ──► │   FEATURES   │ ──► │   SPEC       │ ──► │   PROGRESS   │
    │              │     │              │     │              │     │              │
    │ • SaaS       │     │ • Visual     │     │ • AI-gen     │     │ • Dashboard  │
    │ • E-commerce │     │   builder    │     │   spec       │     │ • Timeline   │
    │ • Mobile app │     │ • Templates  │     │ • Edit/      │     │ • Reports    │
    │ • API        │     │ • Examples   │     │   approve    │     │ • Alerts     │
    └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
           │                    │                    │                    │
           ▼                    ▼                    ▼                    ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │                              AI AGENT                                         │
    │                                                                               │
    │  • Understand requirements                                                    │
    │  • Generate code                                                              │
    │  • Run tests                                                                  │
    │  • Deploy                                                                     │
    └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Time to first project | < 5 minutes |
| Spec creation time | < 30 minutes |
| User satisfaction (non-dev) | > 4.0/5.0 |
| Template usage rate | > 70% |
| Feature completion rate | > 80% |

---

## 🔗 Dependencies

### From Phase 1
- ✅ SQLite per Workspace
- ✅ Memory & Knowledge system
- ✅ OpenCode CLI UI
- ✅ Job & Branch Management
- ✅ Performance Optimization

### External
- Template library (curated)
- UI component library (shadcn/ui)
- Diagram library (React Flow)
- Chart library (Recharts)

---

## 📁 File Structure

```
desktop-app/
├── src/
│   ├── pages/
│   │   ├── TemplateWizard/
│   │   │   ├── TemplateWizard.tsx
│   │   │   ├── TemplateSelector.tsx
│   │   │   ├── ConfigurationForm.tsx
│   │   │   └── PreviewPanel.tsx
│   │   ├── SpecBuilder/
│   │   │   ├── SpecBuilder.tsx
│   │   │   ├── VisualCanvas.tsx
│   │   │   ├── ComponentPalette.tsx
│   │   │   └── SpecPreview.tsx
│   │   ├── ProgressDashboard/
│   │   │   ├── ProgressDashboard.tsx
│   │   │   ├── TaskBoard.tsx
│   │   │   ├── Timeline.tsx
│   │   │   └── Charts.tsx
│   │   └── Collaboration/
│   │       ├── Comments.tsx
│   │       ├── Reviews.tsx
│   │       └── ActivityFeed.tsx
│   ├── services/
│   │   ├── templateService.ts
│   │   ├── specBuilderService.ts
│   │   ├── progressService.ts
│   │   └── collaborationService.ts
│   └── components/
│       ├── templates/
│       ├── spec-builder/
│       ├── progress/
│       └── collaboration/
├── src-tauri/
│   └── src/
│       ├── template_engine.rs
│       ├── spec_generator.rs
│       ├── progress_tracker.rs
│       └── collaboration.rs
└── templates/
    ├── saas/
    ├── ecommerce/
    ├── mobile/
    └── api/
```

---

## 🚀 Sprint Details

ดูรายละเอียดแต่ละ Sprint:
- [Sprint 2.1: Product Template Wizard](./SPRINT_2.1_PRODUCT_TEMPLATE_WIZARD.md)
- [Sprint 2.2: Visual Spec Builder](./SPRINT_2.2_VISUAL_SPEC_BUILDER.md)
- [Sprint 2.3: Progress Dashboard](./SPRINT_2.3_PROGRESS_DASHBOARD.md)
- [Sprint 2.4: Collaboration Features](./SPRINT_2.4_COLLABORATION_FEATURES.md)


---

## 🏁 Phase 2 Deliverables

### Sprint 2.1: Product Template Wizard
- Template Registry (Rust backend)
- Template Generator with Handlebars
- Wizard UI (React)
- 3+ starter templates (SaaS, E-commerce, API)
- Quick Start Guide

### Sprint 2.2: Visual Spec Builder
- Component Registry (20+ components)
- Visual Canvas with React Flow
- Drag-and-drop functionality
- Property Editor
- Spec Generator (Markdown + Tasks)

### Sprint 2.3: Progress Dashboard
- Task Board (Kanban)
- Timeline View (Gantt-style)
- Charts (Burndown, Velocity, Distribution)
- Report Generator
- Activity Feed

### Sprint 2.4: Collaboration Features
- Comments & Discussions (threaded)
- Review Workflow
- Notification Center
- Team Presence
- Real-time Updates

---

## 📈 Phase 2 Timeline

```
Week 1-2:   Sprint 2.1 - Product Template Wizard
Week 3-4:   Sprint 2.2 - Visual Spec Builder
Week 5-6:   Sprint 2.3 - Progress Dashboard
Week 6-7:   Sprint 2.4 - Collaboration Features
```

---

## 🔗 Integration with Phase 1

Phase 2 ใช้ประโยชน์จาก Phase 1:

| Phase 1 Feature | Phase 2 Usage |
|-----------------|---------------|
| SQLite per Workspace | เก็บ templates, specs, comments, reviews |
| Memory System | เก็บ generated specs เป็น knowledge |
| Job & Branch | เชื่อมต่อ tasks กับ jobs |
| Performance | ใช้ optimizations ที่ทำไว้ |

---

## 🎯 Next Phase Preview

**Phase 3: Advanced Features** (8-10 สัปดาห์)

| Sprint | Feature | Focus |
|--------|---------|-------|
| 3.1 | Plugin System | Extensibility |
| 3.2 | Marketplace | Template & Plugin sharing |
| 3.3 | AI Enhancements | Smarter suggestions |
| 3.4 | Multi-workspace | Team workspaces |
| 3.5 | Enterprise Features | SSO, Audit, Compliance |
