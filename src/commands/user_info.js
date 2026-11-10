const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const { readAuthData } = require('../services/oauthService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user_info')
    .setDescription('Get user information')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to get info about')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      const user = interaction.options.getUser('user');
      const authData = readAuthData();
      const authEntry = authData.find(entry => entry.userID === user.id);

      if (!authEntry) {
        const embed = createEmbed({
          title: `${EMOJIS.fail} User Not Found`,
          description: `User \`${user.tag}\` is not authenticated.`,
          color: COLORS.error,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const userGuilds = interaction.client.guilds.cache.filter(guild => guild.members.cache.has(user.id));
      const guildNames = Array.from(userGuilds.values())
        .slice(0, 10)
        .map(g => `• **${g.name}** (\`${g.id}\`)`)
        .join('\n') || 'None';

      const embed = createEmbed({
        title: `${EMOJIS.users} USER INFORMATION`,
        description: `User: **${authEntry.username}** (\`${user.id}\`)`,
        color: COLORS.primary,
        fields: [
          {
            name: 'Discord Tag',
            value: `\`${user.tag}\``,
            inline: true,
          },
          {
            name: 'User ID',
            value: `\`${user.id}\``,
            inline: true,
          },
          {
            name: 'Authenticated',
            value: `\`${new Date(authEntry.created_at || Date.now()).toLocaleDateString()}\``,
            inline: true,
          },
          {
            name: 'Avatar',
            value: `[View Avatar](${authEntry.avatarURL})`,
            inline: true,
          },
          {
            name: 'Known Servers',
            value: `\`${userGuilds.size}\``,
            inline: true,
          },
          {
            name: 'Guilds',
            value: guildNames,
            inline: false,
          },
        ],
        image: authEntry.avatarURL,
        footerText: 'VerifiX Bot - User Information',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to retrieve user information.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
