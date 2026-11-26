# Architecture Documentation

## Overview

This document describes the technical architecture of the TeamSpeak to Discord Bridge.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TeamSpeak to Discord Bridge                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │  TeamSpeak   │    │   Bridge     │    │   Discord    │                 │
│  │   Client     │◄──►│    Core      │◄──►│   Client     │                 │
│  └──────────────┘    └──────────────┘    └──────────────┘                 │
│         │                   │                    │                          │
│         ▼                   ▼                    ▼                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │  TS3 Query   │    │  Audio       │    │  Gateway     │                 │
│  │  / TS5 WS    │    │  Pipeline    │    │  / REST API  │                 │
│  └──────────────┘    └──────────────┘    └──────────────┘                 │
│                                                                             │
│         │                   │                    │                          │
│         └───────────────────┼────────────────────┘                          │
│                             ▼                                               │
│                    ┌──────────────┐                                         │
│                    │  State &     │                                         │
│                    │  Config      │                                         │
│                    │  Manager     │                                         │
│                    └──────────────┘                                         │
│                             │                                               │
│              ┌──────────────┼──────────────┐                               │
│              ▼              ▼              ▼                               │
│       ┌──────────┐  ┌──────────┐    ┌──────────┐                         │
│       │ Database │  │  Redis   │    │  Metrics │                         │
│       │ (Postgres)│  │ (Cache)  │    │Prometheus│                         │
│       └──────────┘  └──────────┘    └──────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Bridge Core (`src/bridge/`)
Central orchestration module that coordinates all components.

**Responsibilities:**
- Component lifecycle management
- Event routing between TeamSpeak and Discord
- State management (connections, users, channels)
- Health monitoring
- Configuration management

**Key Classes:**
- `BridgeCore` - Main orchestrator
- `StateManager` - Persistent state handling
- `EventRouter` - Cross-platform event translation

### 2. TeamSpeak Client (`src/teamspeak/`)
Handles all TeamSpeak communication.

**Sub-modules:**
- `ts3/` - TeamSpeak 3 Query protocol (TCP)
- `ts5/` - TeamSpeak 5 WebSocket protocol
- `events/` - Event definitions and handlers
- `parser/` - Response parsing utilities

**Protocols Supported:**
- TeamSpeak 3 ServerQuery (raw TCP, SSH)
- TeamSpeak 5 WebSocket API

**Key Features:**
- Automatic reconnection with exponential backoff
- Event streaming (client connect/disconnect/move/talk/chat)
- Channel and user management
- Permission system interaction
- File transfer support

### 3. Discord Client (`src/discord/`)
Wrapper around Discord.js with bridge-specific functionality.

**Sub-modules:**
- `voice/` - Voice connection management
- `rest/` - REST API helpers
- `gateway/` - Gateway event handling

**Features:**
- Slash command registration
- Voice channel join/leave
- Opus audio streaming
- Message synchronization
- Thread management
- Reaction role handling

### 4. Audio Pipeline (`src/bridge/audio/`)
High-performance audio processing pipeline.

**Components:**
- `OpusEncoder` - Encode PCM to Opus
- `OpusDecoder` - Decode Opus to PCM
- `VoiceActivityDetector` - Silero VAD integration
- `NoiseSuppressor` - RNNoise/WebRTC NS integration
- `JitterBuffer` - Smooth playback
- `AdaptiveBitrate` - Dynamic quality adjustment

**Audio Flow:**
```
TeamSpeak Client → Decoder → VAD → Noise Suppression → Mixer → Encoder → Discord Voice
Discord Voice → Decoder → VAD → Noise Suppression → Mixer → Encoder → TeamSpeak Client
```

**Configuration Options:**
- Quality presets (low/medium/high/ultra)
- Sample rate: 48kHz (Discord standard)
- Frame size: 960 samples (20ms)
- VAD threshold: 0.5 (configurable)
- Noise suppression level: 0-3

### 5. Chat Synchronization (`src/bridge/chat/`)
Bidirectional message synchronization.

**Features:**
- Message relay with formatting conversion
- Markdown ↔ TeamSpeak BBCode
- Embed support (links, images, files)
- Edit/delete synchronization
- Mention mapping (@user → poke)
- Command bridging
- Thread/channel mapping

**Message Flow:**
```
TS Chat → Parser → Formatter → Channel Mapper → Discord Channel
Discord Message → Parser → Formatter → Channel Mapper → TS Channel
```

### 6. User Manager (`src/bridge/user/`)
User identity and permission management.

**Features:**
- Identity linking (TS Unique ID ↔ Discord ID)
- Role mapping (TS Server Groups ↔ Discord Roles)
- Permission synchronization
- Nickname/avatar synchronization
- Presence status synchronization
- Ban/kick synchronization

**Data Model:**
```typescript
interface UserLink {
  id: string;
  discordId: string;
  tsUniqueId: string;
  tsDatabaseId: string;
  linkedAt: Date;
  active: boolean;
}
```

### 7. Web Dashboard (`src/dashboard/`)
Optional web-based management interface.

**Tech Stack:**
- Fastify (backend)
- React/Vue (frontend - future)
- WebSocket for real-time updates
- Discord OAuth2 authentication

**Features:**
- Real-time metrics
- Configuration UI
- User management
- Channel mapping
- Audit logs
- Alerts

## Data Flow

### Connection Establishment
```
1. Bridge starts
2. Load configuration
3. Initialize TeamSpeak client
   - Connect to Query port
   - Authenticate
   - Register for events
4. Initialize Discord client
   - Login with bot token
   - Register slash commands
   - Connect to gateway
5. Initialize audio pipeline
6. Initialize chat sync
7. Initialize user manager
8. Load persistent state
9. Start health checks
10. Bridge ready
```

### Audio Streaming (TS → Discord)
```
1. TS client starts talking
2. TS event: client.talk (start)
3. Bridge requests audio stream from TS
4. Audio frames received via UDP/TCP
5. Decode Opus → PCM
6. VAD processes frames
7. Noise suppression applied
8. Mix with other speakers
9. Encode PCM → Opus
10. Send to Discord voice connection
11. Discord plays audio
```

### Message Synchronization (TS → Discord)
```
1. TS chat message received
2. Parse message (BBCode → Markdown)
3. Find channel mapping
4. Format for Discord (embed, mentions)
5. Send to Discord channel
6. Store message ID mapping
```

## Database Schema

### Core Tables

```sql
-- User identity links
CREATE TABLE user_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id VARCHAR(255) NOT NULL UNIQUE,
  ts_unique_id VARCHAR(255) NOT NULL UNIQUE,
  ts_database_id VARCHAR(255),
  ts_nickname VARCHAR(255),
  discord_username VARCHAR(255),
  linked_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP,
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

-- Channel mappings
CREATE TABLE channel_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts_channel_id VARCHAR(255) NOT NULL,
  discord_channel_id VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'voice', 'text', 'both'
  sync_messages BOOLEAN DEFAULT true,
  sync_users BOOLEAN DEFAULT true,
  sync_permissions BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true,
  UNIQUE(ts_channel_id, discord_channel_id)
);

-- Role mappings
CREATE TABLE role_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts_server_group_id VARCHAR(255) NOT NULL,
  discord_role_id VARCHAR(255) NOT NULL,
  ts_group_name VARCHAR(255),
  discord_role_name VARCHAR(255),
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  user_id VARCHAR(255),
  platform VARCHAR(20), -- 'teamspeak', 'discord', 'bridge'
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bridge state
CREATE TABLE bridge_state (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration

### Environment Variables

All configuration is managed via environment variables with Zod validation.

**Required:**
- `DISCORD_TOKEN` - Bot token
- `DISCORD_CLIENT_ID` - Application ID
- `DISCORD_GUILD_ID` - Target guild
- `TS_HOST` - TeamSpeak host
- `TS_QUERY_PORT` - Query port (default: 10011)
- `TS_USERNAME` - Query username
- `TS_PASSWORD` - Query password

**Optional:**
- Audio quality, VAD, noise suppression
- Database/Redis URLs
- Web dashboard settings
- Logging level

### Configuration Schema

See `src/config/schema.ts` for complete schema definition.

## Deployment Architecture

### Single Instance
```
┌─────────────┐
│   Bridge    │
└─────────────┘
```

### Horizontal Scaling (Future)
```
                    ┌─────────────┐
                    │  Load       │
                    │  Balancer   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     ┌─────────┐      ┌─────────┐      ┌─────────┐
     │ Bridge  │      │ Bridge  │      │ Bridge  │
     │  #1     │      │  #2     │      │  #3     │
     └────┬────┘      └────┬────┘      └────┬────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    ┌─────────────┐
                    │   Redis     │
                    │  (Pub/Sub)  │
                    └─────────────┘
```

### Docker Deployment
```yaml
services:
  bridge:
    build: .
    replicas: 1  # Increase for scaling
    depends_on:
      - postgres
      - redis
  postgres:
    image: postgres:16
  redis:
    image: redis:7
```

## Security Considerations

1. **Encrypted Configuration** - Sensitive config encrypted at rest
2. **Rate Limiting** - API rate limiting on all endpoints
3. **Audit Logging** - All administrative actions logged
4. **Permission Validation** - Cross-platform permission checks
5. **Secure Communication** - TLS for all external connections
6. **Token Management** - Secure token storage and rotation

## Monitoring & Observability

### Metrics (Prometheus)
- `bridge_audio_latency_ms` - Audio latency
- `bridge_messages_synced_total` - Messages synced
- `bridge_users_connected` - Active users
- `bridge_uptime_seconds` - Uptime
- `bridge_memory_bytes` - Memory usage
- `bridge_reconnect_total` - Reconnection attempts

### Logging
- Structured JSON logging (Pino)
- Log levels: trace, debug, info, warn, error, fatal
- Correlation IDs for request tracing
- Audit logs for security events

### Health Checks
- `/health` endpoint for liveness/readiness
- Component-level health checks
- Database connectivity
- External service connectivity

## Future Extensibility

### Plugin System
- TypeScript-based plugin API
- Hook into bridge events
- Custom commands
- Custom audio processors
- Custom message formatters

### Protocol Support
- Matrix bridge
- Slack bridge
- IRC bridge
- Mumble bridge