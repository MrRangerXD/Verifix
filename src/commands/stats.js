const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const { readAuthData } = require('../services/oauthService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot statistics'),
  async execute(interaction) {
    try {
      const authData = readAuthData();
      const serverCount = interaction.client.guilds.cache.size;
      const userCount = interaction.client.users.cache.size;
      const uptime = Math.floor(interaction.client.uptime / 1000);
      
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;
      
      const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

      const embed = createEmbed({
        title: `${EMOJIS.info} BOT STATISTICS`,
        color: COLORS.primary,
        fields: [
          {
            name: `${EMOJIS.users} Servers`,
            value: `\`${serverCount}\``,
            inline: true,
          },
          {
            name: `👥 Users Cached`,
            value: `\`${userCount}\``,
            inline: true,
          },
          {
            name: `🔐 Authenticated Users`,
            value: `\`${authData.length}\``,
            inline: true,
          },
          {
            name: `⏱️ Uptime`,
            value: `\`${uptimeStr}\``,
            inline: true,
          },
          {
            name: `💾 Memory Usage`,
            value: `\`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``,
            inline: true,
          },
          {
            name: `🔴 Ping`,
            value: `\`${interaction.client.ws.ping}ms\``,
            inline: true,
          },
        ],
        footerText: 'VerifiX Bot - Statistics',
      });

      return interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to retrieve statistics.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
