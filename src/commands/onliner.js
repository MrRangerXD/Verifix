const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const stock = require('../database/stock');
const onliner = require('../services/onliner');
const brain = require('../services/brain');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('onliner')
    .setDescription('Bring stock tokens online / humanize / brain')
    .addSubcommand((s) =>
      s.setName('start')
        .setDescription('Bring N tokens online')
        .addIntegerOption((o) => o.setName('count').setDescription('How many').setRequired(false))
        .addBooleanOption((o) => o.setName('humanize').setDescription('Random status/activity').setRequired(false)))
    .addSubcommand((s) => s.setName('stop').setDescription('Take all offline'))
    .addSubcommand((s) => s.setName('status').setDescription('Onliner status'))
    .addSubcommand((s) =>
      s.setName('brain')
        .setDescription('Trigger chatter')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true))
        .addIntegerOption((o) => o.setName('turns').setDescription('Turns').setRequired(false))
        .addStringOption((o) =>
          o.setName('lang')
            .setDescription('Language')
            .setRequired(false)
            .addChoices(
              { name: 'hinglish', value: 'hinglish' },
              { name: 'english', value: 'english' },
              { name: 'russian', value: 'russian' },
            ))),

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'Admin only.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand?.() || (interaction.rawArgs || [])[0];

    if (sub === 'start') {
      const count = interaction.options.getInteger('count') || 5;
      const humanize = interaction.options.getBoolean('humanize') ?? true;

      await interaction.reply({ content: `Starting ${count} (staggered, ~${Math.ceil(count * 5.5)}s)...`, ephemeral: true });
      const started = await onliner.startMany(count, { humanize });
      return interaction.editReply(`Online now: **${started.length}** (total ${onliner.onlineCount()}).`);
    }

    if (sub === 'stop') {
      const before = onliner.onlineCount();
      onliner.stopAll();
      return interaction.reply({ content: `All offline (${before}).`, ephemeral: true });
    }

    if (sub === 'brain') {
      const channel = interaction.options.getChannel('channel');
      const turns = interaction.options.getInteger('turns') || 4;
      const lang = interaction.options.getString('lang');

      if (!channel) return interaction.reply({ content: 'Channel needed.', ephemeral: true });

      await interaction.reply({ content: 'Starting conversation...', ephemeral: true });
      const out = await brain.converse(channel.id, turns, lang);

      return interaction.editReply(out.ok
        ? `Conversation started — ${turns} turns, lang **${out.lang}**.`
        : `Failed: ${out.reason}`);
    }

    const s = stock.stats();
    return interaction.reply({ embeds: [createEmbed({
      title: 'Onliner',
      description: `Connected: **${onliner.onlineCount()}**\nStock ready: ${s.ready}`,
      color: COLORS.info,
    })], ephemeral: true });
  },
};