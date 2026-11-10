const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS } = require('../constants');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available bot commands'),
  async execute(interaction) {
    const embed = createEmbed({
      title: `${EMOJIS.users} BOT COMMANDS`,
      color: COLORS.primary,
      fields: [
        {
          name: 'Slash Commands',
          value: `✅ \`/auth <token>\` - Authenticate with code\n✅ \`/djoin\` - Join a server\n✅ \`/help\` - Show this help menu\n✅ \`/send <channel>\` - Send bot invite message\n✅ \`/plan <user> <plan>\` - Assign a plan to a user (admin only)`,
          inline: false,
        },
        {
          name: 'Prefix Commands',
          value: `✅ \`${config.prefix}get_token\` - Get authentication token\n✅ \`${config.prefix}auth <code>\` - Authenticate with code\n✅ \`${config.prefix}djoin <server_id>\` - Join a server\n✅ \`${config.prefix}links\` - Show OAuth / bot invite links\n✅ \`${config.prefix}joinall\` - Admin only: add all stored users\n✅ \`${config.prefix}users\` - Show authenticated user count\n✅ \`${config.prefix}wl <add/remove/list>\` - Admin only: manage whitelist\n✅ \`${config.prefix}invite\` - Get bot invite link\n✅ \`${config.prefix}servers\` - List bot servers\n✅ \`${config.prefix}ping\` - Check bot latency\n✅ \`${config.prefix}stats\` - Show bot statistics\n✅ \`${config.prefix}user_info <user_id|mention>\` - Show user info\n✅ \`${config.prefix}help\` - Show this help menu`,
          inline: false,
        },
        {
          name: 'Notes',
          value: `All commands work as slash commands where available. Prefix: \`${config.prefix}\``,
          inline: false,
        },
      ],
      footerText: 'VerifiX Bot',
    });

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
