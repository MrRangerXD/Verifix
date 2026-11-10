const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const config = require('../config');
const db = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Authenticate your session for usage commands')
    .addStringOption((option) => option.setName('token').setDescription('Token from the verification page').setRequired(false)),
  async execute(interaction) {
    try {
      const token = interaction.options.getString('token');

      if (!token) {
        const embed = createEmbed({
          title: 'Authentication Required',
          description: `Open: ${config.authLink}\n\nAfter opening the link, copy the token you receive and run:\n\`/auth <token>\``,
          color: 0x5865f2,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const isValid = typeof token === 'string' && token.length > 10;
      if (!isValid) {
        const embed = createEmbed({
          title: 'Invalid Token',
          description: 'The token you provided is invalid. Please use the token from the verification page.',
          color: 0xed4245,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const session = {
        user_id: interaction.user.id,
        plan: 'BRONZE',
        token,
        createdAt: Date.now(),
      };

      db.set(`session_${interaction.user.id}`, session);

      const embed = createEmbed({
        title: 'Authentication Successful',
        description: 'Your authentication entry is now stored permanently. Your token will remain valid unless revoked.',
        color: 0x43b581,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Authentication Error',
        description: 'Something went wrong while authenticating.',
        color: 0xed4245,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
