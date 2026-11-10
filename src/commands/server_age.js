const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server_age')
    .setDescription('Check server age')
    .addStringOption(option =>
      option.setName('server')
        .setDescription('Server ID or name')
        .setRequired(false)
    ),
  async execute(interaction) {
    try {
      let targetGuild;
      const serverParam = interaction.options.getString('server');

      if (serverParam) {
        targetGuild = interaction.client.guilds.cache.get(serverParam) ||
          interaction.client.guilds.cache.find(g => g.name.toLowerCase().includes(serverParam.toLowerCase()));
      } else {
        targetGuild = interaction.guild;
      }

      if (!targetGuild) {
        const embed = createEmbed({
          title: `${EMOJIS.fail} Server Not Found`,
          description: 'Could not find the specified server.',
          color: COLORS.error,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const createdDate = targetGuild.createdAt;
      const now = new Date();
      const totalDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      const years = Math.floor(totalDays / 365);
      const months = Math.floor((totalDays % 365) / 30);
      const days = totalDays % 30;

      const owner = await targetGuild.fetchOwner().catch(() => null);

      const embed = createEmbed({
        title: `${EMOJIS.info} SERVER INFORMATION`,
        description: `**${targetGuild.name}**`,
        color: COLORS.primary,
        fields: [
          {
            name: `${EMOJIS.users} Server ID`,
            value: `\`${targetGuild.id}\``,
            inline: true,
          },
          {
            name: `👥 Members`,
            value: `\`${targetGuild.memberCount}\``,
            inline: true,
          },
          {
            name: `👑 Owner`,
            value: owner ? `**${owner.user.tag}** (\`${owner.id}\`)` : 'Unknown',
            inline: true,
          },
          {
            name: `📅 Created`,
            value: `\`${createdDate.toUTCString()}\``,
            inline: false,
          },
          {
            name: `⏱️ Age`,
            value: `\`${years > 0 ? years + 'y ' : ''}${months}m ${days}d\``,
            inline: true,
          },
          {
            name: `🛡️ Verification`,
            value: `\`${targetGuild.verificationLevel || 'NONE'}\``,
            inline: true,
          },
          {
            name: `✨ Features`,
            value: targetGuild.features && targetGuild.features.length ? targetGuild.features.join(', ') : 'None',
            inline: false,
          },
        ],
        footerText: 'VerifiX Bot - Server Age',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to retrieve server information.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
