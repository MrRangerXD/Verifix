const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const { readAuthData } = require('../services/oauthService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check_tokens')
    .setDescription('Check token validity'),
  async execute(interaction) {
    try {
      const authData = readAuthData();
      const validTokens = authData.filter(entry => entry.access_token && entry.access_token.length > 10);
      const expiredTokens = authData.filter(entry => !entry.access_token || entry.access_token.length <= 10);

      // Build token list (show first 20, then "... and X more")
      const tokenList = authData
        .slice(0, 20)
        .map(entry => {
          const isValid = entry.access_token && entry.access_token.length > 10;
          const status = isValid ? `✅ VALID` : `❌ EXPIRED`;
          return `${status} <@${entry.userID}>`;
        })
        .join('\n');

      const remaining = authData.length - 20;
      const finalList = remaining > 0 ? tokenList + `\n... and ${remaining} more` : tokenList;

      const embed = createEmbed({
        title: `💎 TOKEN VALIDITY CHECK`,
        description: `Valid: **${validTokens.length}** | Expired: **${expiredTokens.length}**`,
        color: COLORS.primary,
        fields: [
          {
            name: `📊 Token Status`,
            value: finalList || 'No tokens found',
            inline: false,
          },
          {
            name: `💡 Tip`,
            value: `Expired tokens will be automatically refreshed when using \`!djoin\``,
            inline: false,
          },
        ],
        footerText: 'VerifiX Bot - Token Check',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to check tokens.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
