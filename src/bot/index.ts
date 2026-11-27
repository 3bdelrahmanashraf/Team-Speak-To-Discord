/**
 * TeamSpeak to Discord Bridge - Main Entry Point
 * Initializes and runs the bridge application
 */

import { loadConfig, getConfig } from '../shared/config/index.js';
import { createLogger } from '../shared/utils/logger.js';
import { BridgeError, ConfigurationError, isOperationalError } from '../shared/utils/errors.js';
import { createTS3Client, createTS5Client, createDiscordClient, registerBuiltinCommands, TS3QueryClient, DiscordClient } from '../index.js';
import { bridgeCore } from '../bridge/index.js';
import { tsEventEmitter } from '../teamspeak/events/index.js';

// Initialize logger early
const logger = createLogger('bot:main');

// Global bridge instance for commands
declare global {
  var bridgeInstance: {
    teamspeak: TS3QueryClient;
    discord: DiscordClient;
    bridgeCore: ReturnType<typeof bridgeCore>;
  };
}

async function main(): Promise<void> {
  let tsClient: TS3QueryClient | null = null;
  let dcClient: DiscordClient | null = null;

  try {
    logger.info('Starting TeamSpeak to Discord Bridge...');

    // Load and validate configuration
    const config = loadConfig();
    logger.info('Configuration loaded', {
      environment: config.environment,
      discordGuild: config.discord.guildId,
      teamspeakHost: config.teamspeak.host,
    });

    // Log startup info
    logger.info('Bridge starting', {
      version: process.env.npm_package_version || '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    });

    // =======================================================================
    // Initialize TeamSpeak Client
    // =======================================================================
    logger.info('Initializing TeamSpeak client...');
    tsClient = createTS3Client({
      host: config.teamspeak.host,
      queryPort: config.teamspeak.queryPort,
      username: config.teamspeak.username,
      password: config.teamspeak.password,
      serverId: config.teamspeak.serverId,
      nickname: config.teamspeak.nickname,
      reconnectInterval: config.teamspeak.reconnectInterval,
      maxReconnectAttempts: config.teamspeak.maxReconnectAttempts,
    });

    // Forward TS events to bridge core
    tsEventEmitter.on('client:connect', (event) => bridgeCore.emit('ts:client:connect', event));
    tsEventEmitter.on('client:disconnect', (event) => bridgeCore.emit('ts:client:disconnect', event));
    tsEventEmitter.on('client:move', (event) => bridgeCore.emit('ts:client:move', event));
    tsEventEmitter.on('client:talk', (event) => bridgeCore.emit('ts:client:talk', event));
    tsEventEmitter.on('chat:message', (event) => bridgeCore.emit('ts:chat:message', event));

    await tsClient.connect();
    logger.info('TeamSpeak client connected');

    // =======================================================================
    // Initialize Discord Client
    // =======================================================================
    logger.info('Initializing Discord client...');
    dcClient = createDiscordClient({
      token: config.discord.token,
      clientId: config.discord.clientId,
      guildId: config.discord.guildId,
      intents: config.discord.intents,
    });

    // Register built-in commands
    registerBuiltinCommands(dcClient as any);

    // Forward Discord events to bridge core
    dcClient.on('messageCreate', (message) => bridgeCore.emit('discord:messageCreate', message));
    dcClient.on('messageUpdate', (oldMsg, newMsg) => bridgeCore.emit('discord:messageUpdate', oldMsg, newMsg));
    dcClient.on('messageDelete', (message) => bridgeCore.emit('discord:messageDelete', message));
    dcClient.on('voiceStateUpdate', (oldState, newState) => bridgeCore.emit('discord:voiceStateUpdate', oldState, newState));
    dcClient.on('reactionAdd', (reaction, user) => bridgeCore.emit('discord:reactionAdd', reaction, user));
    dcClient.on('reactionRemove', (reaction, user) => bridgeCore.emit('discord:reactionRemove', reaction, user));
    dcClient.on('threadCreate', (thread) => bridgeCore.emit('discord:threadCreate', thread));
    dcClient.on('threadUpdate', (oldThread, newThread) => bridgeCore.emit('discord:threadUpdate', oldThread, newThread));
    dcClient.on('threadDelete', (thread) => bridgeCore.emit('discord:threadDelete', thread));
    dcClient.on('guildMemberAdd', (member) => bridgeCore.emit('discord:guildMemberAdd', member));
    dcClient.on('guildMemberRemove', (member) => bridgeCore.emit('discord:guildMemberRemove', member));
    dcClient.on('guildMemberUpdate', (oldMember, newMember) => bridgeCore.emit('discord:guildMemberUpdate', oldMember, newMember));

    // Make bridge instance globally available for commands
    global.bridgeInstance = {
      teamspeak: tsClient,
      discord: dcClient,
      bridgeCore: bridgeCore,
    };

    await dcClient.connect();
    logger.info('Discord client connected');

    // =======================================================================
    // Initialize Bridge Core
    // =======================================================================
    logger.info('Initializing Bridge Core...');
    await bridgeCore.start();

    // =======================================================================
    // Log startup info
    // =======================================================================
    logger.info('Bridge starting', {
      version: process.env.npm_package_version || '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    });

    logger.info('Bridge initialization complete');
    logger.info('Bridge is running. Press Ctrl+C to stop.');

    // =======================================================================
    // Graceful Shutdown
    // =======================================================================
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        if (bridgeCore) {
          await bridgeCore.stop();
        }
        if (dcClient) {
          await dcClient.disconnect();
        }
        if (tsClient) {
          await tsClient.disconnect();
        }
      } catch (error) {
        logger.error('Error during shutdown', { error });
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    if (error instanceof BridgeError) {
      logger.error(error.message, error.context);
      if (!isOperationalError(error)) {
        logger.fatal('Non-operational error, exiting');
        process.exit(1);
      }
    } else {
      logger.fatal('Unexpected error during startup', { error: String(error) });
    }

    // Cleanup on error
    try {
      if (dcClient) await dcClient.disconnect();
      if (tsClient) await tsClient.disconnect();
    } catch {}

    process.exit(1);
  }
}

// Run the application
main();