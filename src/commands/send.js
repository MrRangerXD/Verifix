const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send bot invite message to a channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send the message to')
        .setRequired(true)
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    try {
      const embed = createEmbed({
        title: `${EMOJIS.users} BOT INVITE LINK`,
        description: `Use this link to add the bot to any server:\n\n${EMOJIS.join} **[CLICK HERE TO INVITE BOT](https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot)**\n\n${EMOJIS.info} **Note:** Bot will automatically leave servers after 14 days (except main server).`,
        color: COLORS.success,
        footerText: 'VerifiX Bot - Invite Required',
      });

      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: `Message sent to ${channel}`, ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: 'Failed to send message to that channel.', ephemeral: true });
    }
  },
};