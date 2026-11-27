/**
 * TeamSpeak to Discord Bridge - Main Exports
 */

// TeamSpeak
export * from './teamspeak/index.js';
export * from './teamspeak/ts3/client.js';
export * from './teamspeak/ts5/client.js';
export * from './teamspeak/parser/query.js';
export * from './teamspeak/events/index.js';
export * from './teamspeak/types.js';

// Discord
export * from './discord/index.js';
export * from './discord/client.js';
export * from './discord/types.js';
export * from './discord/commands/ping.js';
export * from './discord/commands/bridge.js';
export * from './discord/commands/link.js';

// Bridge
export * from './bridge/index.js';

// Shared
export * from './shared/config/index.js';
export * from './shared/types/index.js';
export * from './shared/utils/logger.js';
export * from './shared/utils/errors.js';

// Factory functions
import type { TS3QueryConfig } from './teamspeak/types.js';
import type { DiscordConfig } from './discord/types.js';
import { TS3QueryClient } from './teamspeak/ts3/client.js';
import { TS5WebSocketClient } from './teamspeak/ts5/client.js';
import { DiscordClient } from './discord/client.js';
import { createDiscordClient } from './discord/client.js';
import { registerBuiltinCommands } from './discord/index.js';
import { bridgeCore } from './bridge/index.js';

export function createTS3Client(config: TS3QueryConfig): TS3QueryClient {
  return new TS3QueryClient(config);
}

export function createTS5Client(config: import('./teamspeak/types.js').TS5WebSocketConfig): TS5WebSocketClient {
  return new TS5WebSocketClient(config);
}

export function createDiscordClient(config: DiscordConfig): DiscordClient {
  return new DiscordClient(config);
}

export { registerBuiltinCommands, bridgeCore, TS3QueryClient, TS5WebSocketClient, DiscordClient };