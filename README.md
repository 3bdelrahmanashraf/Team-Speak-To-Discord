# Team Speak To Discord 🎮🔊

> A high-performance, feature-rich bridge that seamlessly connects **TeamSpeak 3/5** with **Discord**, enabling bidirectional audio streaming, text chat synchronization, and advanced community management features.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14+-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![TeamSpeak](https://img.shields.io/badge/TeamSpeak-3%2F5-0099E1?logo=teamspeak&logoColor=white)](https://teamspeak.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/3bdelrahmanashraf/Team-Speak-To-Discord/ci.yml?branch=main)](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/actions)
[![Code Style](https://img.shields.io/badge/Code%20Style-Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

---

## 🌟 Overview

**Team Speak To Discord** is a modern, TypeScript-based bridge that connects TeamSpeak servers with Discord communities. Built upon the foundations of [teamspeak-discord-bridge](https://github.com/c-wagner/teamspeak-discord-bridge) and inspired by [TeamCord](https://github.com/Kleinrotti/TeamCord), this project takes the best ideas from both and adds significant enhancements for reliability, performance, and user experience.

### ✨ Key Features

| Category | Features |
|----------|----------|
| **🎵 Audio** | Bidirectional Opus audio streaming, adaptive bitrate, noise suppression, voice activity detection |
| **💬 Chat** | Bidirectional text sync, rich embeds, thread support, message editing/deletion sync |
| **👥 Users** | Real-time user presence, role mapping, permission sync, nickname synchronization |
| **🔧 Admin** | Web dashboard, audit logs, automated moderation, channel management |
| **⚡ Performance** | Connection pooling, automatic reconnection, memory optimization, clustering support |
| **🔒 Security** | Encrypted config, rate limiting, audit trails, permission-based commands |

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   TeamSpeak     │◄───►│   Bridge Core    │◄───►│    Discord      │
│   (TS3/TS5)     │     │  (TypeScript)    │     │    (Bot)        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              ┌─────────┐ ┌───────┐ ┌─────────┐
              │  Audio  │ │ Chat  │ │  User   │
              │ Pipeline│ │ Sync  │ │ Manager │
              └─────────┘ └───────┘ └─────────┘
                    │         │         │
                    └─────────┼─────────┘
                              ▼
                    ┌─────────────────┐
                    │  Config Store   │
                    │  (Encrypted)    │
                    └─────────────────┘
```

---

## 📋 Development Roadmap

### Phase 0: Foundation & Setup ✅
- [x] Project structure initialization
- [x] TypeScript configuration with strict mode
- [x] ESLint + Biome + Prettier setup
- [x] GitHub Actions CI/CD pipeline
- [x] Docker & Docker Compose configuration
- [x] Environment configuration schema (Zod)
- [x] Logging infrastructure (Pino)
- [x] Error handling & monitoring (Sentry-ready)

### Phase 1: TeamSpeak Integration 🔄
- [ ] **TS3 Query Connection** - Stable TCP connection with auto-reconnect
- [ ] **TS5 WebSocket Support** - Modern WebSocket-based connection
- [ ] **Event System** - Comprehensive event handling (join, leave, talk, chat, etc.)
- [ ] **Channel Management** - List, create, move, delete channels
- [ ] **User Management** - Client info, groups, permissions, bans
- [ ] **File Transfer** - Handle TeamSpeak file transfers
- [ ] **Permission System** - Server group / channel group mapping

### Phase 2: Discord Integration 🔄
- [ ] **Bot Setup** - Discord.js v14 with gateway intents
- [ ] **Slash Commands** - Full command registration & handling
- [ ] **Voice Connection** - Join/leave voice channels, Opus streaming
- [ ] **Text Synchronization** - Bidirectional message relay with embeds
- [ ] **Thread Support** - Map TS channels to Discord threads
- [ ] **Reaction Roles** - Discord reactions → TS server groups
- [ ] **Rich Presence** - Show TS status in Discord profile

### Phase 3: Audio Pipeline 🔄
- [ ] **Opus Encoder/Decoder** - High-quality audio processing
- [ ] **Voice Activity Detection** - Silero VAD integration
- [ ] **Noise Suppression** - RNNoise / WebRTC NS integration
- [ ] **Adaptive Bitrate** - Dynamic quality based on network
- [ ] **Audio Mixing** - Multiple TS clients → single Discord stream
- [ ] **Jitter Buffer** - Smooth playback under network variance
- [ ] **Recording** - Optional session recording to disk

### Phase 4: Chat Synchronization 🔄
- [ ] **Message Relay** - TS chat ↔ Discord channels
- [ ] **Rich Formatting** - Markdown ↔ TeamSpeak BBCode conversion
- [ ] **Embed Support** - Links, images, files as Discord embeds
- [ ] **Edit/Delete Sync** - Keep messages in sync across platforms
- [ ] **Mention Mapping** - @user in Discord → poke in TS
- [ ] **Command Bridge** - Execute TS commands from Discord & vice versa
- [ ] **Message Threading** - Organize by TS channel

### Phase 5: User & Permission Management 🔄
- [ ] **Identity Linking** - Link TS unique ID ↔ Discord ID
- [ ] **Role Mapping** - TS server groups ↔ Discord roles
- [ ] **Permission Sync** - Channel permissions bidirectional
- [ ] **Nickname Sync** - TS nickname ↔ Discord display name
- [ ] **Avatar Sync** - TS avatar → Discord (where possible)
- [ ] **Presence Sync** - Online/away/dnd status
- [ ] **Ban/Kick Sync** - Cross-platform moderation

### Phase 6: Web Dashboard 🔄
- [ ] **Authentication** - Discord OAuth2 + TS admin token
- [ ] **Real-time Metrics** - Connected users, audio quality, latency
- [ ] **Configuration UI** - Visual bridge configuration
- [ ] **Audit Logs** - Searchable action history
- [ ] **User Management** - Link/unlink accounts, view stats
- [ ] **Channel Mapping** - Drag-drop TS↔Discord channel mapping
- [ ] **Alerts & Notifications** - Discord webhook alerts

### Phase 7: Advanced Features 🔄
- [ ] **Multi-Server Support** - Bridge multiple TS servers
- [ ] **Clustering** - Horizontal scaling with Redis
- [ ] **Plugin System** - Custom extensions via TypeScript
- [ ] **WebRTC Fallback** - Browser-based audio for mobile
- [ ] **Mobile App Companion** - React Native control app
- [ ] **AI Moderation** - Toxicity detection, auto-moderation
- [ ] **Analytics Export** - Prometheus/Grafana metrics

### Phase 8: Polish & Release 🔄
- [ ] **Documentation** - Complete user & developer docs
- [ ] **Installation Wizard** - Interactive setup CLI
- [ ] **Migration Tool** - Import from teamspeak-discord-bridge / TeamCord
- [ ] **Performance Benchmarks** - Latency, CPU, memory targets
- [ ] **Security Audit** - Dependency scan, penetration test
- [ ] **v1.0 Release** - Stable production release

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ (LTS recommended)
- **TeamSpeak 3/5 Server** with ServerQuery access
- **Discord Bot Token** with privileged intents
- **Docker** (optional, for containerized deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git
cd Team-Speak-To-Discord

# Install dependencies
npm ci

# Copy and configure environment
cp config/example.env .env
# Edit .env with your credentials

# Build the project
npm run build

# Run in development
npm run dev

# Or run with Docker
docker compose up -d
```

### Configuration

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

# TeamSpeak
TS_HOST=your_ts_host
TS_QUERY_PORT=10011
TS_USERNAME=serveradmin
TS_PASSWORD=your_query_password
TS_SERVER_ID=1

# Bridge
BRIDGE_LOG_LEVEL=info
BRIDGE_AUDIO_QUALITY=high
BRIDGE_SYNC_INTERVAL=5000
```

---

## 📁 Project Structure

```
Team-Speak-To-Discord/
├── .github/
│   └── workflows/          # CI/CD pipelines
├── config/
│   ├── example.env         # Environment template
│   ├── schema.ts           # Zod validation schema
│   └── default.json        # Default configuration
├── docs/
│   ├── architecture.md     # Technical architecture
│   ├── api.md              # Plugin API documentation
│   ├── deployment.md       # Deployment guides
│   └── troubleshooting.md  # Common issues
├── scripts/
│   ├── install.ts          # Interactive setup wizard
│   ├── migrate.ts          # Migration from other bridges
│   └── benchmark.ts        # Performance benchmarking
├── src/
│   ├── bot/                # Discord bot entry point
│   │   ├── commands/       # Slash command implementations
│   │   ├── events/         # Discord event handlers
│   │   └── utils/          # Bot-specific utilities
│   ├── bridge/             # Core bridge logic
│   │   ├── audio/          # Audio pipeline (Opus, VAD, NS)
│   │   ├── chat/           # Chat synchronization
│   │   ├── user/           # User & permission management
│   │   └── state/          # Bridge state management
│   ├── teamspeak/          # TeamSpeak client
│   │   ├── ts3/            # TS3 Query implementation
│   │   ├── ts5/            # TS5 WebSocket implementation
│   │   ├── events/         # TS event definitions
│   │   └── parser/         # Response parsing
│   ├── discord/            # Discord client wrapper
│   │   ├── voice/          # Voice connection management
│   │   ├── rest/           # REST API helpers
│   │   └── gateway/        # Gateway event handling
│   └── shared/
│       ├── types/          # Shared TypeScript types
│       ├── utils/          # Common utilities
│       └── config/         # Configuration management
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Test data
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── biome.json
├── .eslintrc.json
└── README.md
```

---

## 🔧 Development

### Commands

```bash
# Development
npm run dev                 # Start with hot reload
npm run build               # Production build
npm run start               # Run production build

# Code Quality
npm run lint                # Run ESLint + Biome
npm run format              # Format with Biome
npm run typecheck           # TypeScript strict check

# Testing
npm run test                # Run all tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:coverage       # Coverage report

# Docker
npm run docker:build        # Build image
npm run docker:run          # Run container
npm run docker:logs         # View logs

# Utilities
npm run install:wizard      # Interactive setup
npm run migrate             # Run migrations
npm run benchmark           # Performance benchmark
```

### Code Style

- **Biome** for formatting & linting (replaces Prettier + ESLint)
- **Strict TypeScript** with `noUncheckedIndexedAccess`
- **Conventional Commits** for commit messages
- **Husky** pre-commit hooks

---

## 🐳 Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  bridge:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - bridge-network

networks:
  bridge-network:
    driver: bridge
```

```bash
# Build and run
docker compose up -d --build

# View logs
docker compose logs -f bridge

# Update
docker compose pull && docker compose up -d
```

---

## 📊 Monitoring & Metrics

The bridge exposes metrics at `/metrics` (Prometheus format):

- `bridge_audio_latency_ms` - End-to-end audio latency
- `bridge_messages_synced_total` - Messages synchronized
- `bridge_users_connected` - Current connected users
- `bridge_uptime_seconds` - Process uptime
- `bridge_memory_bytes` - Memory usage
- `bridge_reconnect_total` - Reconnection attempts

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Make your changes with tests
4. Run quality checks: `npm run lint && npm run typecheck && npm run test`
5. Submit a Pull Request

### Commit Convention

```
feat: add noise suppression to audio pipeline
fix: resolve TS5 reconnection loop
docs: update deployment guide for Kubernetes
perf: optimize Opus encoding buffer allocation
refactor: extract chat sync into separate module
test: add integration tests for user linking
```

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[teamspeak-discord-bridge](https://github.com/c-wagner/teamspeak-discord-bridge)** - Core bridge architecture inspiration
- **[TeamCord](https://github.com/Kleinrotti/TeamCord)** - Client-side integration reference
- **[Discord.js](https://discord.js.org/)** - Discord API wrapper
- **[node-teamspeak](https://github.com/teamspeak/node-teamspeak)** - TeamSpeak Query library
- **[Opus](https://opus-codec.org/)** - Audio codec
- **[Silero VAD](https://github.com/snakers4/silero-vad)** - Voice activity detection

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/issues)
- **Discussions**: [GitHub Discussions](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/discussions)
- **Discord**: [Community Server](https://discord.gg/teamspeak-discord-bridge)

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/3bdelrahmanashraf">3bdelrahmanashraf</a> and contributors</sub>
</div>