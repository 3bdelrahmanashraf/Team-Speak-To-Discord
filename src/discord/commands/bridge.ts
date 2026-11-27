/**
 * Bridge Status Command
 * Shows the current bridge connection status
 */

import type { SlashCommandHandler } from '../types.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('bridge')
  .setDescription('Show TeamSpeak ↔ Discord bridge status')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current bridge connection status')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('channels')
      .setDescription('Show mapped channels')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('users')
      .setDescription('Show connected users')
  );

async function execute(interaction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const client = interaction.client;

  // Get bridge status from global (will be injected)
  const bridge = (global as any).bridgeInstance;

  const embed = new EmbedBuilder()
    .setTitle('🌉 TeamSpeak ↔ Discord Bridge')
    .setColor(0x5865F2)
    .setTimestamp();

  switch (subcommand) {
    case 'status': {
      const tsConnected = bridge?.teamspeak?.isConnected() || false;
      const dcConnected = client?.isConnected() || false;

      embed.addFields(
        { name: '📊 Overall', value: tsConnected && dcConnected ? '🟢 **Online**' : '🔴 **Offline**', inline: true },
        { name: '🎮 TeamSpeak', value: tsConnected ? '🟢 Connected' : '🔴 Disconnected', inline: true },
        { name: '💬 Discord', value: dcConnected ? '🟢 Connected' : '🔴 Disconnected', inline: true }
      );

      if (bridge?.teamspeak?.getStatus) {
        const tsStatus = bridge.teamspeak.getStatus();
        embed.addFields(
          { name: 'TS State', value: tsStatus.state, inline: true },
          { name: 'TS Reconnects', value: tsStatus.reconnectAttempts.toString(), inline: true }
        );
      }
      break;
    }  // closing brace for case 'status'

    case 'channels': {
      if (bridge?.bridgeCore?.getChannelMappings) {
        const mappings = bridge.bridgeCore.getChannelMappings();
        if (mappings.length > 0) {
          const channelList = mappings.map(m =>
            `• TS: \`${m.tsChannelId}\` ↔ DC: <#${m.discordChannelId}> (${m.type})`
          ).join('\n');
          embed.addFields({ name: '📋 Mapped Channels', value: channelList.slice(0, 1024) });
        } else {
          embed.setDescription('No channels mapped yet. Use the web dashboard to configure mappings.');
        }
      }
      break;
    }  // closing brace for case 'channels'

    case 'users': {
      if (bridge?.bridgeCore?.getUserLinks) {
        const links = bridge.bridgeCore.getUserLinks();
        if (links.length > 0) {
          const userList = links.slice(0, 10).map(l =>
            `• **${l.tsNickname}** (TS) ↔ <@${l.discordId}> (DC)`
          ).join('\n');
          embed.addFields({ name: '👥 Linked Users', value: userList });
          if (links.length > 10) {
            embed.setFooter({ text: `... and ${links.length - 10} more` });
          }
        } else {
          embed.setDescription('No users linked yet.');
        }
      }
      break;
    }  // closing brace for case 'users'
  }  // closing brace for switch statement

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export const bridgeCommand = {
  data: data.toJSON(),
  execute,
};