# Team Speak To Discord

> A high-performance, feature-rich bridge that seamlessly connects **TeamSpeak 3/5** with **Discord**, enabling bidirectional audio streaming, text chat synchronization, and advanced community management features.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14+-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![TeamSpeak](https://img.shields.io/badge/TeamSpeak-3%2F5-0099E1?logo=teamspeak&logoColor=white)](https://teamspeak.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/3bdelrahmanashraf/Team-Speak-To-Discord/ci.yml?branch=master)](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/actions)
[![Code Style](https://img.shields.io/badge/Code%20Style-Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

---

## Overview

**Team Speak To Discord** is a modern, TypeScript-based bridge that connects TeamSpeak servers with Discord communities. Built upon the foundations of [teamspeak-discord-bridge](https://github.com/c-wagner/teamspeak-discord-bridge) and inspired by [TeamCord](https://github.com/Kleinrotti/TeamCord), this project takes the best ideas from both and adds significant enhancements for reliability, performance, and user experience.

### Key Features

| Category | Features |
|----------|----------|
| **Audio** | Bidirectional Opus audio streaming, adaptive bitrate, noise suppression, voice activity detection |
| **Chat** | Bidirectional text sync, rich embeds, thread support, message editing/deletion sync |
| **Users** | Real-time user presence, role mapping, permission sync, nickname synchronization |
| **Admin** | Web dashboard, audit logs, automated moderation, channel management |
| **Performance** | Connection pooling, automatic reconnection, memory optimization, clustering support |
| **Security** | Encrypted config, rate limiting, audit trails, permission-based commands |

---

## Development Progress

### Overall Status

| Phase | Name | Progress | Tasks | Status |
|-------|------|----------|-------|--------|
| **0** | Foundation & Setup | `▰▰▰▰▰▰▰▰▰▰` **100%** | 8/8 | ✅ **COMPLETE** |
| **1** | TeamSpeak Integration | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/7 | ⏳ Planned |
| **2** | Discord Integration | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/6 | ⏳ Planned |
| **3** | Audio Pipeline | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/7 | ⏳ Planned |
| **4** | Chat Synchronization | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/6 | ⏳ Planned |
| **5** | User & Permission Mgmt | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/7 | ⏳ Planned |
| **6** | Web Dashboard | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/6 | ⏳ Planned |
| **7** | Advanced Features | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/6 | ⏳ Planned |
| **8** | Polish & Release | `▱▱▱▱▱▱▱▱▱▱` **0%** | 0/6 | ⏳ Planned |

**Overall:** `▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱` **11%** (8/53 tasks)

---

## Phase Breakdown

### Phase 0: Foundation & Setup  ✅ **COMPLETE**

| Task | Status |
|------|--------|
| Project structure initialization | ✅ Done |
| TypeScript configuration with strict mode | ✅ Done |
| ESLint + Biome + Prettier setup | ✅ Done |
| GitHub Actions CI/CD pipeline | ✅ Done |
| Docker & Docker Compose configuration | ✅ Done |
| Environment configuration schema (Zod) | ✅ Done |
| Logging infrastructure (Pino) | ✅ Done |
| Error handling & monitoring (Sentry-ready) | ✅ Done |

---

### Phase 1: TeamSpeak Integration  ⏳ **Planned**

| Task | Status |
|------|--------|
| TS3 Query Connection - Stable TCP with auto-reconnect | ⏳ Pending |
| TS5 WebSocket Support - Modern WebSocket-based connection | ⏳ Pending |
| Event System - Comprehensive event handling | ⏳ Pending |
| Channel Management - List, create, move, delete | ⏳ Pending |
| User Management - Client info, groups, permissions, bans | ⏳ Pending |
| File Transfer - Handle TeamSpeak file transfers | ⏳ Pending |
| Permission System - Server group / channel group mapping | ⏳ Pending |

---

### Phase 2: Discord Integration  ⏳ **Planned**

| Task | Status |
|------|--------|
| Bot Setup - Discord.js v14 with gateway intents | ⏳ Pending |
| Slash Commands - Full command registration & handling | ⏳ Pending |
| Voice Connection - Join/leave voice channels, Opus streaming | ⏳ Pending |
| Text Synchronization - Bidirectional message relay with embeds | ⏳ Pending |
| Thread Support - Map TS channels to Discord threads | ⏳ Pending |
| Reaction Roles - Discord reactions → TS server groups | ⏳ Pending |
| Rich Presence - Show TS status in Discord profile | ⏳ Pending |

---

### Phase 3: Audio Pipeline  ⏳ **Planned**

| Task | Status |
|------|--------|
| Opus Encoder/Decoder - High-quality audio processing | ⏳ Pending |
| Voice Activity Detection - Silero VAD integration | ⏳ Pending |
| Noise Suppression - RNNoise / WebRTC NS integration | ⏳ Pending |
| Adaptive Bitrate - Dynamic quality based on network | ⏳ Pending |
| Audio Mixing - Multiple TS clients → single Discord stream | ⏳ Pending |
| Jitter Buffer - Smooth playback under network variance | ⏳ Pending |
| Recording - Optional session recording to disk | ⏳ Pending |

---

### Phase 4: Chat Synchronization  ⏳ **Planned**

| Task | Status |
|------|--------|
| Message Relay - TS chat ↔ Discord channels | ⏳ Pending |
| Rich Formatting - Markdown ↔ TeamSpeak BBCode conversion | ⏳ Pending |
| Embed Support - Links, images, files as Discord embeds | ⏳ Pending |
| Edit/Delete Sync - Keep messages in sync across platforms | ⏳ Pending |
| Mention Mapping - @user in Discord → poke in TS | ⏳ Pending |
| Command Bridge - Execute TS commands from Discord & vice versa | ⏳ Pending |

---

### Phase 5: User & Permission Management  ⏳ **Planned**

| Task | Status |
|------|--------|
| Identity Linking - Link TS unique ID ↔ Discord ID | ⏳ Pending |
| Role Mapping - TS server groups ↔ Discord roles | ⏳ Pending |
| Permission Sync - Channel permissions bidirectional | ⏳ Pending |
| Nickname Sync - TS nickname ↔ Discord display name | ⏳ Pending |
| Avatar Sync - TS avatar → Discord (where possible) | ⏳ Pending |
| Presence Sync - Online/away/dnd status | ⏳ Pending |
| Ban/Kick Sync - Cross-platform moderation | ⏳ Pending |

---

### Phase 6: Web Dashboard  ⏳ **Planned**

| Task | Status |
|------|--------|
| Authentication - Discord OAuth2 + TS admin token | ⏳ Pending |
| Real-time Metrics - Connected users, audio quality, latency | ⏳ Pending |
| Configuration UI - Visual bridge configuration | ⏳ Pending |
| Audit Logs - Searchable action history | ⏳ Pending |
| User Management - Link/unlink accounts, view stats | ⏳ Pending |
| Channel Mapping - Drag-drop TS↔Discord channel mapping | ⏳ Pending |

---

### Phase 7: Advanced Features  ⏳ **Planned**

| Task | Status |
|------|--------|
| Multi-Server Support - Bridge multiple TS servers | ⏳ Pending |
| Clustering - Horizontal scaling with Redis | ⏳ Pending |
| Plugin System - Custom extensions via TypeScript | ⏳ Pending |
| WebRTC Fallback - Browser-based audio for mobile | ⏳ Pending |
| Mobile App Companion - React Native control app | ⏳ Pending |
| AI Moderation - Toxicity detection, auto-moderation | ⏳ Pending |

---

### Phase 8: Polish & Release  ⏳ **Planned**

| Task | Status |
|------|--------|
| Documentation - Complete user & developer docs | ⏳ Pending |
| Installation Wizard - Interactive setup CLI | ⏳ Pending |
| Migration Tool - Import from teamspeak-discord-bridge / TeamCord | ⏳ Pending |
| Performance Benchmarks - Latency, CPU, memory targets | ⏳ Pending |
| Security Audit - Dependency scan, penetration test | ⏳ Pending |
| v1.0 Release - Stable production release | ⏳ Pending |

---

## Architecture

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

## Integration Features

The bridge creates a seamless connection between TeamSpeak and Discord through two primary shared channels:

### Shared Voice Channel
- **Bidirectional Audio Streaming** — Real-time Opus audio flows both directions
- **Multiple TS Clients → Single Discord Stream** — All TeamSpeak users in the linked channel are mixed into one Discord voice channel
- **Voice Activity Detection** — Silero VAD prevents silence transmission
- **Noise Suppression** — RNNoise/WebRTC integration for cleaner audio
- **Adaptive Bitrate** — Quality adjusts dynamically based on network conditions
- **Low Latency** — Target <100ms end-to-end latency

### Shared Text Channel
- **Bidirectional Message Sync** — Messages appear instantly on both platforms
- **Rich Formatting** — Markdown ↔ TeamSpeak BBCode conversion
- **Embed Support** — Links, images, files rendered as Discord embeds
- **Edit/Delete Sync** — Message modifications stay in sync
- **Mention Mapping** — `@user` in Discord triggers TeamSpeak poke
- **Thread Mapping** — TeamSpeak channels map to Discord threads for organization

---

## Web Control Panel

A dedicated web-based administration panel provides full configuration without editing files:

| Feature | Description |
|---------|-------------|
| **Authentication** | Discord OAuth2 + TeamSpeak admin token |
| **Channel Mapping** | Visual drag-and-drop TS ↔ Discord channel linking |
| **User Management** | Link/unlink accounts, view connection stats |
| **Role Mapping** | Map TeamSpeak server groups to Discord roles |
| **Real-time Metrics** | Live audio quality, latency, connected users |
| **Audit Logs** | Searchable history of all administrative actions |
| **Configuration UI** | Visual bridge settings (no file editing needed) |
| **Alerts** | Discord webhook notifications for issues |

**Access:** Available at `http://localhost:3000` (configurable via `WEB_DASHBOARD_PORT`)

---

## Why Docker?

Docker is the recommended deployment method for several key reasons:

| Benefit | Description |
|---------|-------------|
| **Consistency** | Identical environment across dev, staging, and production |
| **Dependency Isolation** | Node.js, Opus, FFmpeg, and system libs bundled — no host conflicts |
| **Easy Updates** | Pull new image, restart container — zero-downtime deployments |
| **Resource Limits** | CPU/memory caps prevent runaway processes |
| **Multi-service** | PostgreSQL, Redis, and bridge in one `docker-compose.yml` |
| **Portability** | Runs on any Linux server, VPS, or cloud provider |
| **Health Checks** | Built-in container health monitoring with auto-restart |
| **Security** | Non-root user, read-only filesystem options, capability dropping |

**Quick Start with Docker:**
```bash
# Clone and configure
git clone https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git
cd Team-Speak-To-Discord
cp config/example.env .env
# Edit .env with your credentials

# Deploy
docker compose up -d --build

# View logs
docker compose logs -f bridge
```

---

## Quick Start

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

## Development

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

## Monitoring & Metrics

The bridge exposes metrics at `/metrics` (Prometheus format):

- `bridge_audio_latency_ms` - End-to-end audio latency
- `bridge_messages_synced_total` - Messages synchronized
- `bridge_users_connected` - Current connected users
- `bridge_uptime_seconds` - Process uptime
- `bridge_memory_bytes` - Memory usage
- `bridge_reconnect_total` - Reconnection attempts

---

## Contributing

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

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- **[teamspeak-discord-bridge](https://github.com/c-wagner/teamspeak-discord-bridge)** - Core bridge architecture inspiration
- **[TeamCord](https://github.com/Kleinrotti/TeamCord)** - Client-side integration reference
- **[Discord.js](https://discord.js.org/)** - Discord API wrapper
- **[node-teamspeak](https://github.com/teamspeak/node-teamspeak)** - TeamSpeak Query library
- **[Opus](https://opus-codec.org/)** - Audio codec
- **[Silero VAD](https://github.com/snakers4/silero-vad)** - Voice activity detection

---

## Support

- **Issues**: [GitHub Issues](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/issues)
- **Discussions**: [GitHub Discussions](https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord/discussions)
- **Discord**: [Community Server](https://discord.gg/teamspeak-discord-bridge)

---

<div align="center">
  <sub>Built by <a href="https://github.com/3bdelrahmanashraf">3bdelrahmanashraf</a></sub>
</div>