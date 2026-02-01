# SmartSpec Desktop App - Build Guide

คู่มือการ build และ development สำหรับ SmartSpec Desktop App

## โครงสร้างโปรเจกต์

```
desktop-app/
├── src/                    # React frontend source
│   ├── components/         # UI components
│   ├── pages/              # Page components
│   ├── services/           # Service layer (Tauri bridge)
│   └── App.tsx             # Main app component
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── lib.rs          # Main Tauri commands
│   │   ├── docker_manager.rs    # Docker management
│   │   ├── workspace_manager.rs # Workspace management
│   │   └── git_workflow.rs      # Git operations
│   ├── python/             # Python scripts (bundled)
│   └── tauri.conf.json     # Tauri configuration
├── sandbox-images/         # Docker sandbox images
│   ├── base/               # Base Ubuntu image
│   ├── nodejs/             # Node.js environment
│   ├── python/             # Python environment
│   ├── golang/             # Go environment
│   ├── rust/               # Rust environment
│   └── fullstack/          # All-in-one environment
├── build.sh                # Main build script
└── package.json            # Node.js dependencies
```

## Prerequisites

### Required

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | 18+ | https://nodejs.org |
| Rust | 1.70+ | https://rustup.rs |
| pnpm | 8+ | `npm install -g pnpm` |

### Optional (for Docker features)

| Tool | Version | Installation |
|------|---------|--------------|
| Docker | 20+ | https://docker.com |
| Docker Compose | 2+ | Included with Docker Desktop |

## Quick Start

### Development Mode

```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri:dev
```

### Production Build

```bash
# Build desktop app only
./build.sh

# Build with Docker images
./build.sh --with-docker

# Build in debug mode
./build.sh --debug
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Vite dev server only |
| `pnpm build` | Build frontend only |
| `pnpm tauri:dev` | Start Tauri in development mode |
| `pnpm tauri:build` | Build Tauri for production |
| `pnpm tauri:build:debug` | Build Tauri in debug mode |
| `pnpm sandbox:setup` | Setup workspace environment |
| `pnpm sandbox:build` | Build Docker sandbox images |
| `pnpm full:build` | Build Docker images + Tauri app |
| `pnpm full:dev` | Build Docker images + Start dev |

## Build Outputs

### macOS

```
src-tauri/target/release/bundle/
├── dmg/
│   └── SmartSpec Pro_0.1.0_aarch64.dmg
└── macos/
    └── SmartSpec Pro.app
```

### Windows

```
src-tauri/target/release/bundle/
├── msi/
│   └── SmartSpec Pro_0.1.0_x64.msi
└── nsis/
    └── SmartSpec Pro_0.1.0_x64-setup.exe
```

### Linux

```
src-tauri/target/release/bundle/
├── deb/
│   └── smartspec-pro_0.1.0_amd64.deb
└── appimage/
    └── smartspec-pro_0.1.0_amd64.AppImage
```

## Docker Sandbox Images

### Build Images

```bash
cd sandbox-images

# Build all images
./build.sh all

# Build specific image
./build.sh nodejs
./build.sh python
./build.sh golang
./build.sh rust
./build.sh fullstack
```

### Available Images

| Image | Size | Description |
|-------|------|-------------|
| `smartspec/sandbox-base` | ~500MB | Ubuntu 22.04 + tools |
| `smartspec/sandbox-nodejs` | ~800MB | Node.js 20 |
| `smartspec/sandbox-python` | ~1.2GB | Python 3.11 |
| `smartspec/sandbox-golang` | ~1GB | Go 1.21 |
| `smartspec/sandbox-rust` | ~2GB | Rust stable |
| `smartspec/sandbox-fullstack` | ~3GB | All languages |

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone repository
git clone https://github.com/naibarn/SmartSpecPro.git
cd SmartSpecPro/desktop-app

# Install dependencies
pnpm install

# Setup Rust dependencies
cd src-tauri
cargo build
cd ..
```

### 2. Start Development

```bash
# Terminal 1: Start Tauri dev
pnpm tauri:dev
```

### 3. Make Changes

- **Frontend**: Edit files in `src/`
- **Backend**: Edit files in `src-tauri/src/`
- Hot reload is enabled for frontend
- Rust changes require restart

### 4. Test

```bash
# Run frontend tests
pnpm test

# Run with coverage
pnpm test:coverage
```

### 5. Build for Production

```bash
./build.sh --release
```

## Troubleshooting

### Tauri CLI not found

```bash
# Install Tauri CLI globally
cargo install tauri-cli

# Or use npx
npx @tauri-apps/cli build
```

### Rust compilation errors

```bash
# Update Rust
rustup update

# Clean and rebuild
cd src-tauri
cargo clean
cargo build
```

### Node modules issues

```bash
# Clear and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Docker permission denied

```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker
```

## Cross-Platform Build

### Build for all platforms (CI/CD)

```yaml
# GitHub Actions example
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - run: pnpm tauri:build
```

### Build for specific target

```bash
# macOS Intel
rustup target add x86_64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin

# macOS Apple Silicon
rustup target add aarch64-apple-darwin
pnpm tauri build --target aarch64-apple-darwin

# Windows
rustup target add x86_64-pc-windows-msvc
pnpm tauri build --target x86_64-pc-windows-msvc

# Linux
rustup target add x86_64-unknown-linux-gnu
pnpm tauri build --target x86_64-unknown-linux-gnu
```

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [React Documentation](https://react.dev/)
- [Rust Documentation](https://doc.rust-lang.org/)
- [Docker Documentation](https://docs.docker.com/)
