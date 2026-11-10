const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the bot invite link'),
  async execute(interaction) {
    const botId = interaction.client.user.id;
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot`;

    const embed = createEmbed({
      title: `${EMOJIS.users} BOT INVITE LINK`,
      description: `Use this link to add the bot to any server:\n\n${EMOJIS.join} **[CLICK HERE TO INVITE BOT](${inviteUrl})**`,
      color: COLORS.primary,
      fields: [
        {
          name: `${EMOJIS.info} Note`,
          value: `Bot will automatically leave servers after **4 hours** (except main server)`,
          inline: false,
        },
      ],
      footerText: 'VerifiX Bot - Invite Link',
    });

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
