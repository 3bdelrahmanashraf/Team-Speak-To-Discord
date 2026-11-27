/**
 * Thread Command
 * Manage thread mappings between TeamSpeak channels and Discord threads
 */

import type { SlashCommandHandler } from '../types.js';
import { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType, ChannelType } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('thread')
  .setDescription('Manage TeamSpeak ↔ Discord thread mappings')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a thread mapping for a TeamSpeak channel')
      .addChannelOption(option =>
        option
          .setName('discord_channel')
          .setDescription('Discord text channel to create threads in')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('ts_channel_id')
          .setDescription('TeamSpeak channel ID')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Thread name prefix')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a thread mapping')
      .addStringOption(option =>
        option
          .setName('ts_channel_id')
          .setDescription('TeamSpeak channel ID')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all thread mappings')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sync')
      .setDescription('Sync existing Discord threads for a TS channel')
      .addStringOption(option =>
        option
          .setName('ts_channel_id')
          .setDescription('TeamSpeak channel ID')
          .setRequired(true)
      )
  );

async function execute(interaction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const bridge = (global as any).bridgeInstance;

  const embed = new EmbedBuilder()
    .setTitle('🧵 Thread Management')
    .setColor(0x5865F2)
    .setTimestamp();

  switch (subcommand) {
    case 'create': {
      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const discordChannel = interaction.options.getChannel('discord_channel', true);
      const tsChannelId = interaction.options.getString('ts_channel_id', true);
      const namePrefix = interaction.options.getString('name') || `TS-${tsChannelId}`;

      if (!bridge.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Check if already mapped
      const existing = bridge.bridgeCore.getChannelMappings().find(m => m.tsChannelId === tsChannelId);
      if (existing) {
        embed.setDescription(`⚠️ TS channel \`${tsChannelId}\` is already mapped to <#${existing.discordChannelId}>`);
        embed.setColor(0xFAA61A);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Create mapping
      const mapping = {
        tsChannelId,
        discordChannelId: discordChannel.id,
        type: 'thread' as const,
        syncMessages: true,
        syncUsers: true,
        syncPermissions: false,
        threadNamePrefix: namePrefix,
      };

      // Emit event for bridge core to handle
      (global as any).bridgeInstance?.bridgeCore?.emit?.('thread:mapping:create', mapping);

      embed.setDescription(`✅ **Thread mapping created!**`);
      embed.addFields(
        { name: '🎮 TeamSpeak Channel', value: `\`${tsChannelId}\``, inline: true },
        { name: '💬 Discord Channel', value: `<#${discordChannel.id}>`, inline: true },
        { name: '🧵 Thread Prefix', value: namePrefix, inline: true }
      );
      embed.setColor(0x57F287);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove': {
      const tsChannelId = interaction.options.getString('ts_channel_id', true);

      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const existing = bridge.bridgeCore.getChannelMappings().find(m => m.tsChannelId === tsChannelId);
      if (!existing) {
        embed.setDescription(`ℹ️ No mapping found for TS channel \`${tsChannelId}\``);
        embed.setColor(0x5865F2);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Emit event for bridge core to handle
      (global as any).bridgeInstance?.bridgeCore?.emit?.('thread:mapping:remove', { tsChannelId });

      embed.setDescription(`✅ **Thread mapping removed!**`);
      embed.addFields({ name: '🎮 TeamSpeak Channel', value: `\`${tsChannelId}\``, inline: true });
      embed.setColor(0x57F287);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'list': {
      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const mappings = bridge.bridgeCore.getChannelMappings().filter(m => m.type === 'thread' || m.type === 'both');

      if (mappings.length === 0) {
        embed.setDescription('ℹ️ No thread mappings configured. Use `/thread create` to add one.');
        embed.setColor(0x5865F2);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const list = mappings.map(m =>
        `• TS: \`${m.tsChannelId}\` ↔ DC: <#${m.discordChannelId}> (${m.threadNamePrefix || 'auto'})`
      ).join('\n');

      embed.setDescription(`**Thread Mappings (${mappings.length})**\n${list}`);
      embed.setColor(0x5865F2);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'sync': {
      const tsChannelId = interaction.options.getString('ts_channel_id', true);

      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Emit event for bridge core to handle sync
      (global as any).bridgeInstance?.bridgeCore?.emit?.('thread:sync', { tsChannelId });

      embed.setDescription(`🔄 **Sync initiated** for TS channel \`${tsChannelId}\``);
      embed.setColor(0x5865F2);
      embed.setFooter({ text: 'This will create/update Discord threads for existing TS channel activity' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export const threadCommand = {
  data: data.toJSON(),
  execute,
} satisfies {
  data: ReturnType<typeof SlashCommandBuilder.prototype.toJSON>;
  execute: (interaction: any) => Promise<void>;
};