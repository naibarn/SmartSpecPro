# Changelog

All notable changes to SmartSpecPro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Phase 1: Core Features
- **Sprint 1.1: SQLite per Workspace**
  - Workspace database manager with connection pooling
  - WAL mode for concurrent access
  - Automatic schema migrations
  - Data operations for Jobs, Tasks, Chat, Knowledge, Memory

- **Sprint 1.2: LLM Chat Long Memory**
  - Three-tier memory system (short-term, working, long-term)
  - Skills system (/spec, /plan, /debug, /review, /knowledge)
  - OpenRouter integration with 10+ models
  - Context builder with token management

- **Sprint 1.3: OpenCode CLI UI**
  - Terminal-style CLI interface
  - File explorer with search
  - Code editor with syntax highlighting
  - Diff viewer and apply

- **Sprint 1.4: Job & Branch Management**
  - Kanban-style job board
  - Task management with dependencies
  - Git branch integration
  - Job statistics and tracking

- **Sprint 1.5: Performance Optimization**
  - LRU cache implementation
  - Performance metrics collection
  - Memory monitoring
  - Optimization recommendations

#### Phase 2: Non-Dev Friendly
- **Sprint 2.1: Product Template Wizard**
  - 10+ project templates
  - Multi-step wizard UI
  - Project scaffolding
  - Template customization

- **Sprint 2.2: Visual Spec Builder**
  - Drag-and-drop canvas
  - 30+ component types
  - Component library
  - Export to Markdown/JSON

- **Sprint 2.3: Progress Dashboard**
  - Kanban board with drag-and-drop
  - Project metrics and charts
  - Burndown chart
  - Timeline tracking

- **Sprint 2.4: Collaboration Features**
  - Comments with @mentions
  - Review system
  - Real-time notifications
  - Activity feed

#### Phase 3: Advanced Features
- **Sprint 3.1: Plugin System**
  - WASM sandbox runtime
  - Plugin API and SDK
  - Plugin lifecycle management

- **Sprint 3.2: Marketplace**
  - Browse and search marketplace
  - Install/uninstall items
  - Reviews and ratings

- **Sprint 3.3: AI Enhancements**
  - Smart suggestions
  - Code completion
  - Quality analysis
  - Auto-documentation

- **Sprint 3.4: Multi-workspace**
  - Workspace switching
  - Cross-workspace sync
  - Team workspaces

- **Sprint 3.5: Enterprise Features**
  - SSO (SAML, OIDC, Azure AD, Okta)
  - RBAC with roles and permissions
  - Audit logging
  - Compliance (GDPR)

### Security
- Content Security Policy (CSP) enabled
- Auth tokens stored in OS keyring
- API key encryption
- Input validation for all user inputs
- Rate limiting for API calls
- SQL injection prevention
- Command injection prevention
- Path traversal prevention

### Changed
- Migrated auth tokens from localStorage to secure store
- Updated CSP to use wasm-unsafe-eval instead of unsafe-eval

### Fixed
- Fixed potential SQL injection in repository queries
- Fixed command injection vulnerabilities
- Fixed path traversal in template engine

## [0.1.0] - 2026-01-14

### Added
- Initial project structure
- Tauri desktop application scaffold
- React frontend with TypeScript
- Python backend service
- Docker sandbox environments
- Basic workflow execution
- Git integration
- Database management

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 0.1.0 | 2026-01-14 | Initial release with core features |

## Migration Guides

### Upgrading to 0.2.0

When upgrading from 0.1.0 to 0.2.0:

1. **Auth Token Migration**: Your auth tokens will be automatically migrated from localStorage to the secure store on first launch.

2. **API Key Re-entry**: You may need to re-enter your API keys due to the new encryption system.

3. **Database Migration**: The database schema will be automatically upgraded.

## Contributors

Thanks to all contributors who helped make this release possible!

---

[Unreleased]: https://github.com/naibarn/SmartSpecPro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/naibarn/SmartSpecPro/releases/tag/v0.1.0
