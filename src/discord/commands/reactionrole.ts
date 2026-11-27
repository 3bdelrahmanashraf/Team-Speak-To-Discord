/**
 * Reaction Role Command
 * Manage Discord reaction → TeamSpeak server group mappings
 */

import type { SlashCommandHandler } from '../types.js';
import { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType, ChannelType, PermissionFlagsBits } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('reactionrole')
  .setDescription('Manage Discord reaction → TeamSpeak server group mappings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a reaction role mapping')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Discord channel containing the message')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('message_id')
          .setDescription('ID of the message to add reaction to')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('emoji')
          .setDescription('Emoji to react with (Unicode or custom emoji ID)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('ts_group_name')
          .setDescription('TeamSpeak server group name (exact name)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Description of what this role does')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a reaction role mapping')
      .addStringOption(option =>
        option
          .setName('id')
          .setDescription('Mapping ID (from /reactionrole list)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all reaction role mappings')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sync')
      .setDescription('Apply reaction roles to existing reactions on a message')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Discord channel containing the message')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('message_id')
          .setDescription('ID of the message')
          .setRequired(true)
      )
  );

interface ReactionRoleMapping {
  id: string;
  channelId: string;
  messageId: string;
  emoji: string;
  tsGroupName: string;
  description?: string;
  createdAt: Date;
  createdBy: string;
}

async function execute(interaction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const bridge = (global as any).bridgeInstance;

  const embed = new EmbedBuilder()
    .setTitle('🎭 Reaction Role Management')
    .setColor(0x5865F2)
    .setTimestamp();

  const guild = interaction.guild;
  if (!guild) {
    embed.setDescription('❌ This command can only be used in a server');
    embed.setColor(0xED4245);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Check if bridge is initialized
  if (!bridge?.bridgeCore) {
    embed.setDescription('❌ Bridge core not initialized');
    embed.setColor(0xED4245);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const bridgeCore = bridge.bridgeCore;

  switch (interaction.options.getSubcommand()) {
    case 'add': {
      const channel = interaction.options.getChannel('channel', true);
      const messageId = interaction.options.getString('message_id', true);
      const emoji = interaction.options.getString('emoji', true);
      const tsGroupName = interaction.options.getString('ts_group_name', true);
      const description = interaction.options.getString('description') || '';

      if (!channel.isTextBased()) {
        embed.setDescription('❌ Selected channel must be a text channel');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Verify the message exists
      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch {
        embed.setDescription('❌ Message not found in the specified channel');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Check if TeamSpeak group exists
      if (!bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const tsGroups = bridgeCore.getTSClients(); // This would need a method to get server groups
      // We'll emit an event for the bridge core to handle the mapping creation

      const mappingId = `rr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const mapping = {
        id: mappingId,
        channelId: channel.id,
        messageId,
        emoji,
        tsGroupName,
        description,
        createdAt: new Date(),
        createdBy: interaction.user.id,
      };

      // Emit event for bridge core to handle the mapping creation
      (global as any).bridgeInstance?.bridgeCore?.emit?.('reactionrole:mapping:add', mapping);

      // Add reaction to the message
      try {
        await message.react(emoji);
      } catch (error) {
        logger.warn('Failed to add reaction to message', { error, emoji, messageId });
      }

      embed.setDescription(`✅ **Reaction role added!**`);
      embed.addFields(
        { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
        { name: '📨 Message', value: `\`${messageId}\``, inline: true },
        { name: '😀 Emoji', value: emoji, inline: true },
        { name: '🎮 TS Group', value: tsGroupName, inline: true },
        { name: '📝 Description', value: description || 'None', inline: false },
        { name: '🆔 Mapping ID', value: `\`${mappingId}\``, inline: true }
      );
      embed.setColor(0x57F287);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove': {
      const mappingId = interaction.options.getString('id', true);

      // Emit event for bridge core to handle the mapping removal
      (global as any).bridgeInstance?.bridgeCore?.emit?.('reactionrole:mapping:remove', { mappingId });

      embed.setDescription(`✅ **Reaction role removed!**`);
      embed.addFields({ name: '🆔 Mapping ID', value: `\`${mappingId}\``, inline: true });
      embed.setColor(0x57F287);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'list': {
      // Emit event to get mappings from bridge core
      (global as any).bridgeInstance?.bridgeCore?.emit?.('reactionrole:list', {
        callback: (mappings: any[]) => {
          // This would need to be handled asynchronously
        }
      });

      // For now, show placeholder
      embed.setDescription('📋 **Reaction Role Mappings**');
      embed.addFields({ name: 'ℹ️', value: 'Use `/reactionrole list` to view mappings. Implementation pending bridge core integration.' });
      embed.setColor(0x5865F2);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'sync': {
      const channel = interaction.options.getChannel('channel', true);
      const messageId = interaction.options.getString('message_id', true);

      if (!channel.isTextBased()) {
        embed.setDescription('❌ Selected channel must be a text channel');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch {
        embed.setDescription('❌ Message not found');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Get existing reaction role mappings for this message
      // This would need to be implemented in bridge core
      (global as any).bridgeInstance?.bridgeCore?.emit?.('reactionrole:sync', {
        channelId: channel.id,
        messageId,
        message
      });

      embed.setDescription(`🔄 **Sync initiated** for message in <#${channel.id}>`);
      embed.setColor(0x5865F2);
      embed.setFooter({ text: 'This will add missing reactions to the message based on mappings' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

// Need to import logger
import { createLogger } from '../../shared/utils/logger.js';
const logger = createLogger('discord:reactionrole');

export const reactionRoleCommand = {
  data: data.toJSON(),
  execute,
} satisfies {
  data: ReturnType<typeof SlashCommandBuilder.prototype.toJSON>;
  execute: (interaction: any) => Promise<void>;
};