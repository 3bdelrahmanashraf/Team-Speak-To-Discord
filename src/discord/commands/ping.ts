/**
 * Ping Command
 * Simple health check command
 */

import type { SlashCommandHandler, CommandContext } from '../types.js';
import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and health');

async function execute(interaction: CommandContext['interaction']): Promise<void> {
  const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(sent.client.ws.ping);

  await interaction.editReply(
    `🏓 Pong!\n` +
    `**Bot Latency:** ${latency}ms\n` +
    `**API Latency:** ${apiLatency}ms`
  );
}

export const pingCommand = {
  data,
  execute,
} satisfies {
  data: ReturnType<typeof SlashCommandBuilder.prototype.toJSON>;
  execute: (interaction: CommandContext['interaction']) => Promise<void>;
};