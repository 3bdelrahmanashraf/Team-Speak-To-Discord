/**
 * Discord Module
 * Main entry point for Discord.js v14 integration
 */

export * from './types.js';
export * from './client.js';
export * from './commands/ping.js';
export * from './commands/bridge.js';
export * from './commands/link.js';

// ========================================================================
// Factory Functions
// ========================================================================

import type { DiscordConfig } from './types.js';
import { DiscordClient } from './client.js';

export function createDiscordClient(config: DiscordConfig): DiscordClient {
  return new DiscordClient(config);
}

// ========================================================================
// Command Registration
// ========================================================================

import { pingCommand } from './commands/ping.js';
import { bridgeCommand } from './commands/bridge.js';
import { linkCommand } from './commands/link.js';
import { threadCommand } from './commands/thread.js';
import { reactionRoleCommand } from './commands/reactionrole.js';

export const builtinCommands = [pingCommand, bridgeCommand, linkCommand, threadCommand, reactionRoleCommand];

/**
 * Register all built-in commands with a DiscordClient instance
 */
export function registerBuiltinCommands(client: DiscordClient): void {
  for (const command of builtinCommands) {
    client.registerCommand(command);
  }
}