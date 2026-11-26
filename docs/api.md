# API Documentation

## Overview

The TeamSpeak to Discord Bridge provides several APIs for integration and extension.

## REST API (Web Dashboard)

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All endpoints require authentication via Discord OAuth2 or API key.

```http
Authorization: Bearer <token>
```

### Endpoints

#### Bridge Status
```http
GET /status
```
**Response:**
```json
{
  "state": "connected",
  "uptime": 3600,
  "components": {
    "teamspeak": "connected",
    "discord": "connected",
    "database": "connected",
    "redis": "connected",
    "audio": "ready"
  },
  "metrics": {
    "connectedTSClients": 15,
    "connectedDiscordUsers": 12,
    "messagesSynced": 1250,
    "audioLatencyMs": 45
  }
}
```

#### Configuration
```http
GET /config
PUT /config
```
**Response (GET):**
```json
{
  "discord": { "guildId": "..." },
  "teamspeak": { "host": "..." },
  "audio": { "quality": "high" },
  "chat": { "syncEnabled": true },
  "user": { "linkEnabled": true }
}
```

#### User Links
```http
GET /users/links
POST /users/links
DELETE /users/links/{id}
```
**POST Body:**
```json
{
  "discordId": "123456789012345678",
  "tsUniqueId": "abcdefghijklmnopqrstuvwxyz123456=",
  "tsDatabaseId": "42",
  "tsNickname": "User123"
}
```

#### Channel Mappings
```http
GET /channels/mappings
POST /channels/mappings
PUT /channels/mappings/{id}
DELETE /channels/mappings/{id}
```
**POST Body:**
```json
{
  "tsChannelId": "123",
  "discordChannelId": "123456789012345678",
  "type": "both",
  "syncMessages": true,
  "syncUsers": true,
  "syncPermissions": true
}
```

#### Role Mappings
```http
GET /roles/mappings
POST /roles/mappings
DELETE /roles/mappings/{id}
```

#### Audit Logs
```http
GET /audit-logs?limit=100&offset=0&action=user.link
```

#### Metrics
```http
GET /metrics
```
Returns Prometheus-format metrics.

---

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### Messages

#### Subscribe to Events
```json
{
  "type": "subscribe",
  "events": ["user.joined", "user.left", "chat.message", "audio.start"]
}
```

#### Event Format
```json
{
  "type": "event",
  "event": "user.joined",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "data": {
    "platform": "teamspeak",
    "client": {
      "clid": "1",
      "nickname": "User123",
      "cid": "5"
    }
  }
}
```

### Event Types

| Event | Description | Data |
|-------|-------------|------|
| `user.joined` | User connected | platform, client/user |
| `user.left` | User disconnected | platform, client/user, reason |
| `user.moved` | User changed channel | platform, client/user, from, to |
| `chat.message` | New message | platform, message, channel |
| `chat.message.edit` | Message edited | platform, old, new |
| `chat.message.delete` | Message deleted | platform, messageId |
| `audio.start` | User started talking | platform, client/user |
| `audio.stop` | User stopped talking | platform, client/user |
| `bridge.state` | Bridge state changed | from, to |
| `health.check` | Health check result | components, metrics |

---

## Plugin API (Future)

### Plugin Structure
```typescript
interface BridgePlugin {
  name: string;
  version: string;
  description: string;
  
  onLoad(bridge: BridgeCore): Promise<void>;
  onUnload(): Promise<void>;
  
  // Optional hooks
  onTSClientConnect?: (client: TSClient) => Promise<void>;
  onTSClientDisconnect?: (client: TSClient) => Promise<void>;
  onDiscordVoiceStateUpdate?: (oldState, newState) => Promise<void>;
  onChatMessage?: (message: ChatMessage) => Promise<void>;
  onAudioPacket?: (packet: AudioPacket) => Promise<AudioPacket>;
}
```

### Example Plugin
```typescript
// plugins/my-plugin.ts
import { BridgePlugin, BridgeCore, TSClient } from '@teamspeak-discord-bridge/api';

export default class MyPlugin implements BridgePlugin {
  name = 'my-plugin';
  version = '1.0.0';
  description = 'Example plugin';
  
  private bridge: BridgeCore;
  
  async onLoad(bridge: BridgeCore) {
    this.bridge = bridge;
    console.log('Plugin loaded');
  }
  
  async onUnload() {
    console.log('Plugin unloaded');
  }
  
  async onTSClientConnect(client: TSClient) {
    console.log(`TS Client connected: ${client.clientNickname}`);
    // Custom logic
  }
}
```

---

## Discord Slash Commands

### User Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/link` | Link TS and Discord accounts | User |
| `/unlink` | Unlink accounts | User |
| `/status` | Show bridge status | User |
| `/ping` | Check latency | User |

### Admin Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/bridge restart` | Restart bridge | Admin |
| `/bridge stop` | Stop bridge | Admin |
| `/bridge config` | Show configuration | Admin |
| `/channel map` | Map TS ↔ Discord channel | Admin |
| `/channel unmap` | Remove channel mapping | Admin |
| `/role map` | Map TS group ↔ Discord role | Admin |
| `/role unmap` | Remove role mapping | Admin |
| `/user list` | List linked users | Admin |
| `/user info` | Show user link details | Admin |
| `/audit` | Show recent audit logs | Admin |

---

## TypeScript API (Internal)

### BridgeCore
```typescript
import { BridgeCore } from '@teamspeak-discord-bridge/bridge';

const bridge = BridgeCore.getInstance();

// Start/stop
await bridge.start();
await bridge.stop();
await bridge.restart();

// State
bridge.getState(); // BridgeState
bridge.isConnected(); // boolean

// Users
bridge.getTSClients(); // TSClient[]
bridge.getDiscordVoiceUsers(); // DiscordVoiceState[]
bridge.getUserLinks(); // UserLink[]

// Channels
bridge.getChannelMappings(); // ChannelMapping[]

// Actions
await bridge.sendTSMessage(targetMode, target, message);
await bridge.sendDiscordMessage(channelId, content);
await bridge.moveTSClient(clid, cid);
await bridge.moveDiscordUser(userId, channelId);

// Events
bridge.on('ts.client.connect', handler);
bridge.on('discord.messageCreate', handler);
bridge.on('chat.message', handler);
bridge.on('audio.start', handler);
```

### Configuration
```typescript
import { getConfig, loadConfig } from '@teamspeak-discord-bridge/config';

const config = getConfig();
// or
loadConfig({ configPath: './custom.json' });

config.discord;      // DiscordConfig
config.teamspeak;    // TeamSpeakConfig
config.audio;        // AudioConfig
config.chat;         // ChatConfig
config.user;         // UserConfig
config.bridge;       // BridgeConfig
config.database;     // DatabaseConfig
config.redis;        // RedisConfig
config.webDashboard; // WebDashboardConfig
```

### Logging
```typescript
import { createLogger, getLogger, log } from '@teamspeak-discord-bridge/utils/logger';

const logger = createLogger('my-module');
logger.info('Message', { key: 'value' });

// Structured logging
log.info(logger, 'User connected', { userId: '123' });
log.errorWithContext(logger, error, { context: 'data' });
log.audit(logger, 'user.link', 'user123', { tsId: 'abc' });
```

### Error Handling
```typescript
import { 
  BridgeError, 
  ConfigurationError, 
  ConnectionError, 
  createErrorFromUnknown,
  isOperationalError 
} from '@teamspeak-discord-bridge/utils/errors';

try {
  await riskyOperation();
} catch (error) {
  const bridgeError = createErrorFromUnknown(error);
  
  if (isOperationalError(bridgeError)) {
    // Handle gracefully
    logger.warn(bridgeError.message, bridgeError.context);
  } else {
    // Critical error
    logger.fatal(bridgeError.message, bridgeError.context);
  }
}
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | - | Discord application ID |
| `DISCORD_GUILD_ID` | Yes | - | Target guild ID |
| `TS_HOST` | Yes | - | TeamSpeak host |
| `TS_QUERY_PORT` | No | 10011 | TeamSpeak Query port |
| `TS_USERNAME` | Yes | - | Query username |
| `TS_PASSWORD` | Yes | - | Query password |
| `TS_SERVER_ID` | No | 1 | Virtual server ID |
| `AUDIO_QUALITY` | No | high | low/medium/high/ultra |
| `DATABASE_URL` | No | localhost | PostgreSQL connection |
| `REDIS_URL` | No | localhost | Redis connection |
| `WEB_DASHBOARD_ENABLED` | No | true | Enable dashboard |
| `BRIDGE_LOG_LEVEL` | No | info | trace/debug/info/warn/error/fatal |

See `config/example.env` for complete list.

---

## Error Codes

See [Troubleshooting Guide](troubleshooting.md#error-reference) for complete error code reference.