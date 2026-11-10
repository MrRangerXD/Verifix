const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction) {
    const clientPing = interaction.client.ws.ping;
    
    const embed = createEmbed({
      title: `${EMOJIS.info} PING`,
      description: `🏓 **Bot Ping:** \`${clientPing}ms\`\n\n${clientPing < 100 ? '✅ Excellent' : clientPing < 200 ? '⚠️ Good' : '❌ High latency'}`,
      color: clientPing < 100 ? COLORS.success : clientPing < 200 ? COLORS.warning : COLORS.error,
      footerText: 'VerifiX Bot - Latency Check',
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
