# Contributing to SmartSpecPro

Thank you for your interest in contributing to SmartSpecPro! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- **Rust** 1.70+ (for Tauri backend)
- **Node.js** 18+ (for React frontend)
- **pnpm** (package manager)
- **Docker** (for sandbox environments)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/SmartSpecPro.git
   cd SmartSpecPro
   ```

3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/naibarn/SmartSpecPro.git
   ```

## Development Setup

### Desktop App

```bash
cd desktop-app

# Install dependencies
pnpm install

# Run development server
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

### Python Backend

```bash
cd python-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/changes

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

**Examples:**
```
feat(chat): add streaming support for LLM responses
fix(workspace): resolve database connection leak
docs(api): update command reference documentation
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes** and commit them

3. **Push to your fork**:
   ```bash
   git push origin feature/your-feature
   ```

4. **Open a Pull Request** on GitHub

5. **Fill out the PR template** with:
   - Description of changes
   - Related issues
   - Testing performed
   - Screenshots (if applicable)

6. **Wait for review** and address any feedback

### PR Requirements

- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] No merge conflicts
- [ ] Signed commits (if required)

## Coding Standards

### Rust (Backend)

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `cargo fmt` for formatting
- Use `cargo clippy` for linting
- Handle errors properly (no unwrap in production code)
- Write doc comments for public APIs

```rust
/// Creates a new workspace with the given name.
///
/// # Arguments
///
/// * `name` - The name of the workspace
///
/// # Returns
///
/// Returns `Ok(Workspace)` on success, or an error if creation fails.
///
/// # Examples
///
/// ```
/// let workspace = create_workspace("my-project")?;
/// ```
pub fn create_workspace(name: &str) -> Result<Workspace, Error> {
    // Implementation
}
```

### TypeScript/React (Frontend)

- Use TypeScript strict mode
- Follow [React best practices](https://react.dev/learn)
- Use functional components with hooks
- Avoid `any` type
- Use proper error boundaries

```typescript
interface Props {
  title: string;
  onSubmit: (data: FormData) => Promise<void>;
}

export function MyComponent({ title, onSubmit }: Props): JSX.Element {
  const [loading, setLoading] = useState(false);
  
  // Implementation
}
```

### File Organization

```
src/
├── components/       # Reusable UI components
│   └── feature/      # Feature-specific components
├── pages/            # Page components
├── services/         # API and business logic
├── hooks/            # Custom React hooks
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Testing

### Running Tests

```bash
# Frontend tests
cd desktop-app
pnpm test

# Backend tests (Rust)
cd desktop-app/src-tauri
cargo test

# Python backend tests
cd python-backend
pytest
```

### Writing Tests

- Write unit tests for all new functions
- Write integration tests for API endpoints
- Aim for >80% code coverage
- Use meaningful test names

```typescript
describe('WorkspaceService', () => {
  it('should create a new workspace with valid name', async () => {
    const workspace = await workspaceService.create('test-project');
    expect(workspace.name).toBe('test-project');
  });

  it('should throw error for invalid workspace name', async () => {
    await expect(workspaceService.create('')).rejects.toThrow();
  });
});
```

## Documentation

### Code Documentation

- Add JSDoc comments for TypeScript functions
- Add rustdoc comments for Rust functions
- Update README if adding new features
- Update API documentation for new endpoints

### Updating Documentation

Documentation lives in the `docs/` directory:

```
docs/
├── api/              # API reference
├── guides/           # User guides
├── sprints/          # Sprint planning docs
└── architecture/     # Architecture decisions
```

## Questions?

If you have questions, please:

1. Check existing [Issues](https://github.com/naibarn/SmartSpecPro/issues)
2. Search [Discussions](https://github.com/naibarn/SmartSpecPro/discussions)
3. Open a new Discussion for general questions
4. Open an Issue for bugs or feature requests

Thank you for contributing! 🎉
