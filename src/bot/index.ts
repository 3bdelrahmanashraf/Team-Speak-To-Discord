/**
 * TeamSpeak to Discord Bridge - Main Entry Point
 * Initializes and runs the bridge application
 */

import { loadConfig, getConfig } from '../shared/config/index.js';
import { createLogger } from '../shared/utils/logger.js';
import { BridgeError, ConfigurationError, isOperationalError } from '../shared/utils/errors.js';

// Initialize logger early
const logger = createLogger('bot:main');

async function main(): Promise<void> {
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

    // TODO: Initialize core components
    // - TeamSpeak client
    // - Discord client
    // - Audio pipeline
    // - Chat synchronization
    // - User management
    // - Web dashboard

    logger.info('Bridge initialization complete');
    logger.info('Bridge is running. Press Ctrl+C to stop.');

    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      // TODO: Cleanup connections, save state, etc.
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
    process.exit(1);
  }
}

// Run the application
main();