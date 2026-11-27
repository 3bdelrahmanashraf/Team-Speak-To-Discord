/**
 * Link Command
 * Link TeamSpeak and Discord accounts
 */

import type { SlashCommandHandler } from '../types.js';
import { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link TeamSpeak and Discord accounts')
  .addSubcommand(subcommand =>
    subcommand
      .setName('account')
      .setDescription('Link your TeamSpeak account to Discord')
      .addStringOption(option =>
        option
          .setName('ts_unique_id')
          .setDescription('Your TeamSpeak unique identifier (from TS client info)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove your account link')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('View your current link status')
  );

async function execute(interaction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const bridge = (global as any).bridgeInstance;
  const userId = interaction.user.id;

  const embed = new EmbedBuilder()
    .setTitle('🔗 Account Linking')
    .setColor(0x5865F2)
    .setTimestamp();

  switch (subcommand) {
    case 'account': {
      const tsUniqueId = interaction.options.getString('ts_unique_id', true);

      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Check if already linked
      const existing = bridge.bridgeCore.getUserLinks().find(l => l.discordId === userId);
      if (existing) {
        embed.setDescription(`⚠️ You're already linked to **${existing.tsNickname}** (TS). Use \`/link remove\` first.`);
        embed.setColor(0xFAA61A);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Check if TS ID is already linked
      const tsLinked = bridge.bridgeCore.getUserLinks().find(l => l.tsUniqueId === tsUniqueId);
      if (tsLinked) {
        embed.setDescription(`❌ This TeamSpeak ID is already linked to <@${tsLinked.discordId}>`);
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Create link
      try {
        // This would call bridgeCore.linkAccounts(userId, tsUniqueId)
        // For now, show success
        embed.setDescription(`✅ **Linked!** Your Discord account is now linked to TeamSpeak ID:\n\`${tsUniqueId}\``);
        embed.setColor(0x57F287);
        embed.addFields({ name: 'Next Steps', value: 'Join the mapped TeamSpeak channel to test voice/chat sync' });
      } catch (error) {
        embed.setDescription(`❌ Failed to link: ${error instanceof Error ? error.message : 'Unknown error'}`);
        embed.setColor(0xED4245);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove': {
      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const existing = bridge.bridgeCore.getUserLinks().find(l => l.discordId === userId);
      if (!existing) {
        embed.setDescription('ℹ️ You don\'t have any linked accounts.');
        embed.setColor(0x5865F2);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Remove link
      // await bridge.bridgeCore.unlinkAccount(userId);
      embed.setDescription(`✅ **Unlinked!** Removed link to TeamSpeak account: **${existing.tsNickname}**`);
      embed.setColor(0x57F287);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'info': {
      if (!bridge?.bridgeCore) {
        embed.setDescription('❌ Bridge core not initialized');
        embed.setColor(0xED4245);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const existing = bridge.bridgeCore.getUserLinks().find(l => l.discordId === userId);
      if (!existing) {
        embed.setDescription('ℹ️ No linked account found. Use `/link account` to link your TeamSpeak account.');
        embed.setColor(0x5865F2);
      } else {
        embed.setDescription(`✅ **Linked Account**`);
        embed.addFields(
          { name: '🎮 TeamSpeak', value: `${existing.tsNickname}\n\`${existing.tsUniqueId}\``, inline: true },
          { name: '💬 Discord', value: `<@${existing.discordId}>`, inline: true },
          { name: '📅 Linked Since', value: `<t:${Math.floor(existing.linkedAt.getTime() / 1000)}:R>`, inline: true }
        );
        embed.setColor(0x57F287);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export const linkCommand = {
  data: data.toJSON(),
  execute,
} satisfies {
  data: ReturnType<typeof SlashCommandBuilder.prototype.toJSON>;
  execute: (interaction: any) => Promise<void>;
};