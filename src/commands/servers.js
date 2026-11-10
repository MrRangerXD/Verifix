const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers')
    .setDescription('List all bot servers'),
  async execute(interaction) {
    try {
      const guilds = interaction.client.guilds.cache;
      const sortedGuilds = Array.from(guilds.values())
        .sort((a, b) => b.memberCount - a.memberCount);
      const guildList = sortedGuilds
        .slice(0, 25)
        .map((g, i) => `${i + 1}. **${g.name}** (\`${g.id}\`) - **${g.memberCount}** members`)
        .join('\n');

      const embed = createEmbed({
        title: `${EMOJIS.users} BOT SERVERS`,
        description: `Total: **${guilds.size}** servers`,
        color: COLORS.primary,
        fields: [
          {
            name: `${EMOJIS.info} Servers`,
            value: guildList || 'No servers found',
            inline: false,
          },
        ],
        footerText: 'VerifiX Bot - Server List',
      });

      return interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Error',
        description: 'Failed to retrieve server list.',
        color: COLORS.error,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
