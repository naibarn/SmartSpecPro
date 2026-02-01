# 🚀 SmartSpec Pro - Quick Start Guide

**Version:** 0.1.0  
**Last Updated:** December 29, 2025

---

## 📋 Prerequisites

### Required Software

1. **Node.js** (v18+)
   ```bash
   node --version  # v18.0.0 or higher
   ```

2. **pnpm** (v8+)
   ```bash
   pnpm --version  # v8.0.0 or higher
   ```

3. **Rust** (v1.70+)
   ```bash
   rustc --version  # 1.70.0 or higher
   ```

4. **Python** (v3.8+)
   ```bash
   python3 --version  # 3.8.0 or higher
   ```

5. **Kilo Code CLI** (installed)
   ```bash
   python3 -c "import kilocode; print('OK')"
   ```

---

## 📦 Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd smartspecpro
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Rust dependencies are automatically installed during build
```

---

## 🏃 Running the App

### Development Mode

```bash
# Increase file descriptor limit (Linux/Mac only)
ulimit -n 4096

# Start development server
pnpm tauri dev
```

**Note:** The app will open automatically in a new window.

### Production Build

```bash
# Build for production
pnpm tauri build

# The executable will be in:
# src-tauri/target/release/smartspecpro
```

---

## 🎯 Usage

### 1. Launch the App

```bash
pnpm tauri dev
```

### 2. Select a Workflow

- Browse the workflow list in the left sidebar
- Click on a workflow to select it

### 3. Configure Workflow

- **Spec Path:** Click "Browse" to select your specification file
- **Output Dir:** Click "Browse" to select output directory
- **Config:** (Optional) Add JSON configuration

### 4. Run Workflow

- Click **"▶ Run Workflow"** button
- Watch real-time output in the output viewer
- Wait for completion (✓ or ✗)

### 5. Stop Workflow (if needed)

- Click **"⏹ Stop"** button while workflow is running

---

## 📁 Project Structure

```
smartspecpro/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
│   ├── types/              # TypeScript types
│   ├── App.tsx             # Main app
│   └── main.tsx            # Entry point
├── src-tauri/              # Backend (Rust + Tauri)
│   ├── python/
│   │   └── bridge.py       # Python bridge script
│   ├── src/
│   │   ├── lib.rs          # Tauri commands
│   │   ├── python_bridge.rs # Process manager
│   │   └── main.rs         # Entry point
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── package.json            # Node.js dependencies
└── README.md               # Project documentation
```

---

## 🛠️ Development

### Frontend Development

```bash
# Start Vite dev server only
pnpm dev

# Build frontend only
pnpm build

# Type check
pnpm tsc --noEmit
```

### Backend Development

```bash
# Build Rust backend
cd src-tauri
cargo build

# Run tests
cargo test

# Check code
cargo clippy
```

### Full Stack Development

```bash
# Start both frontend and backend
pnpm tauri dev
```

---

## 🧪 Testing

### Manual Testing

1. **Test Workflow List:**
   - Launch app
   - Verify workflows appear in sidebar
   - Click "Reload" button

2. **Test Workflow Execution:**
   - Select a workflow
   - Fill in all fields
   - Click "Run Workflow"
   - Verify output appears

3. **Test Stop Workflow:**
   - Start a workflow
   - Click "Stop" button
   - Verify workflow stops

### Automated Testing

```bash
# Frontend type check
pnpm tsc --noEmit

# Backend tests
cd src-tauri && cargo test

# Build test
pnpm build && cd src-tauri && cargo build
```

---

## 🐛 Troubleshooting

### Issue: "Too many open files"

**Solution:**
```bash
ulimit -n 4096
```

### Issue: "Python not found"

**Solution:**
```bash
# Make sure Python is in PATH
which python3

# Or set PYTHON_PATH in tauri.conf.json
```

### Issue: "Kilo Code CLI not found"

**Solution:**
```bash
# Install Kilo Code CLI
pip install kilocode

# Verify installation
python3 -c "import kilocode; print('OK')"
```

### Issue: "Build fails"

**Solution:**
```bash
# Clean and rebuild
rm -rf node_modules dist
pnpm install
pnpm build

# Clean Rust build
cd src-tauri
cargo clean
cargo build
```

---

## 📚 Documentation

- [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) - Phase 1 completion report
- [PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md) - Detailed Phase 1 summary
- [PHASE2_PLAN.md](./PHASE2_PLAN.md) - Phase 2 planning document
- [PYTHON_BRIDGE_SPECIFICATION.md](./PYTHON_BRIDGE_SPECIFICATION.md) - Bridge specification
- [README.md](./README.md) - Project overview

---

## 🔗 Resources

### Documentation
- [Tauri Documentation](https://tauri.app/v1/guides/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Rust Documentation](https://doc.rust-lang.org/)

### Tools
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/setup/)
- [pnpm](https://pnpm.io/)
- [Vite](https://vitejs.dev/)

---

## 💬 Support

### Getting Help

1. **Check Documentation:** Read the docs first
2. **Search Issues:** Look for similar issues
3. **Ask Questions:** Create a new issue
4. **Contact Team:** Email support

---

## 🎉 What's Next?

### Phase 2: Config & Workflow Management (3 weeks)

**Features:**
- Visual config editor
- Workflow CRUD operations
- SQLite database
- Validation system

**Start Date:** TBD

See [PHASE2_PLAN.md](./PHASE2_PLAN.md) for details.

---

**Happy Coding! 🚀**
