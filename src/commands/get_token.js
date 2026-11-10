const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('get_token')
    .setDescription('Get authentication token'),
  async execute(interaction) {
    const embed = createEmbed({
      title: `${EMOJIS.join} GET AUTHENTICATION TOKEN`,
      description: `**Click the link below to get your token:**\n\n${EMOJIS.join} **[AUTHORIZE HERE](${config.authLink})**\n\n**📝 Steps:**\n1. Click the link above\n2. Authorize the application\n3. Copy the code from the page\n4. Use \`/auth <CODE>\` to authenticate\n\n⏱️ **Codes expire in 10 minutes!**\n${EMOJIS.fail} **DO NOT share your code!**`,
      color: COLORS.info,
      footerText: 'VerifiX Bot - Token Generation',
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
