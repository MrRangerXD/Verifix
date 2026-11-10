const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const { readAuthData } = require('../services/oauthService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list_users')
    .setDescription('List all authenticated users'),
  async execute(interaction) {
    try {
      const authData = readAuthData();
      const userList = authData
        .map((user, i) => `${i + 1}. **${user.username}** - \`${user.userID}\``)
        .slice(0, 25)
        .join('\n');

      const embed = createEmbed({
        title: `${EMOJIS.users} AUTHENTICATED USERS`,
        description: `Total: **${authData.length}** users`,
        color: COLORS.primary,
        fields: [
          {
            name: `${EMOJIS.info} User List`,
            value: userList || 'No users authenticated',
            inline: false,
          },
        ],
        footerText: `VerifiX Bot - Showing ${Math.min(25, authData.length)} of ${authData.length} users`,
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to retrieve user list.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
