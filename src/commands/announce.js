const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Announcement message')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      const message = interaction.options.getString('message');

      const embed = createEmbed({
        title: `📢 ANNOUNCEMENT`,
        description: message,
        color: COLORS.warning,
        footerText: `Announced by ${interaction.user.tag}`,
      });

      await interaction.guild.channels.cache
        .filter(channel => channel.isText() && channel.name.includes('announcements') || channel.name.includes('news'))
        .forEach(channel => {
          channel.send({ embeds: [embed] }).catch(() => {});
        });

      return interaction.reply({ content: 'Announcement posted!', ephemeral: true });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: 'Failed to post announcement.', ephemeral: true });
    }
  },
};
