# 🚀 SmartSpecPro

**SmartSpecPro** is a comprehensive, AI-powered Full Stack ecosystem designed for modern software development and specification management. It integrates a powerful Desktop Application, a robust Python Backend, and a versatile Web Interface to provide a seamless experience for developers and system administrators.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-blue.svg)](https://tauri.app/)

---

## 🌟 Key Features

- **AI-Driven Specifications**: Leverage advanced LLMs to generate and manage technical specifications.
- **Full Stack Integration**: Seamless communication between Desktop (Tauri), Web (React), and Backend (FastAPI).
- **Database**: PostgreSQL for all services with Redis caching.
- **Vector Store Capabilities**: Built-in ChromaDB support for RAG (Retrieval-Augmented Generation) features.
- **Admin Management Suite**: Comprehensive scripts for deployment, monitoring, and automated backups.
- **High Test Coverage**: Robust testing suite ensuring system stability and reliability.

---

## 🏗️ System Architecture

SmartSpecPro consists of several interconnected modules:

- **`desktop-app`**: A cross-platform desktop application built with Tauri, React, and TypeScript.
- **`python-backend`**: High-performance FastAPI backend handling business logic and AI integrations.
- **`SmartSpecWeb`**: A modern web interface for collaborative specification management.
- **`control-plane`**: Centralized management service for system orchestration.
- **`docker-status`**: Real-time monitoring for all system containers.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- [Node.js & pnpm](https://nodejs.org/)
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (for desktop app development)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/naibarn/SmartSpecPro.git
   cd SmartSpecPro
   ```

2. **Setup Environment**:
   Copy the example environment file and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

3. **Install Dependencies**:
   ```bash
   cd desktop-app && pnpm install
   ```

---

## 🛠️ Management & Operations

We provide a suite of scripts to manage the entire ecosystem easily:

| Script | Description |
| :--- | :--- |
| `./run-all.sh` | **Start** the entire system (Docker + Desktop App) |
| `./stop-all.sh` | **Stop** all services and clean up resources |
| `./restart-all.sh` | **Restart** the full stack |
| `./status-all.sh` | **Check status** of all services and ports |
| `./deploy-prod.sh` | **Deploy** to production (Build + Test + Start) |

For detailed administrative tasks, please refer to the [Admin Guide](docs/ADMIN_GUIDE.md).

---

## 🧪 Testing

SmartSpecPro maintains high standards for code quality.

```bash
# Run Frontend Tests
cd desktop-app && pnpm vitest run

# Run Backend Tests
cd src-tauri && cargo test
```

Current Test Coverage: **~84%** (Detailed report in [TEST_COVERAGE_REPORT.md](docs/TEST_COVERAGE_REPORT.md))

---

## 🛡️ Security & Backups

- **Automated Backups**: Daily backups for PostgreSQL.
- **Restore Verification**: Weekly automated testing of backup integrity.
- **Monitoring**: Real-time health checks and Discord/Slack alerts via `alert-monitor.sh`.

To setup automated tasks:
```bash
./setup-cron.sh
```

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📞 Contact

Project Link: [https://github.com/naibarn/SmartSpecPro](https://github.com/naibarn/SmartSpecPro)

*Built with ❤️ by the SmartSpecPro Team*
