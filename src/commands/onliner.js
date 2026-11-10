const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const stock = require('../database/stock');
const onliner = require('../services/onliner');
const brain = require('../services/brain');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('onliner')
    .setDescription('Bring stock tokens online / humanize / brain')
    .addSubcommand((s) => s.setName('start').setDescription('Bring N tokens online')
      .addIntegerOption((o) => o.setName('count').setDescription('How many').setRequired(false))
      .addBooleanOption((o) => o.setName('humanize').setDescription('Random status/activity').setRequired(false)))
    .addSubcommand((s) => s.setName('stop').setDescription('Take all offline'))
    .addSubcommand((s) => s.setName('status').setDescription('Onliner status'))
    .addSubcommand((s) => s.setName('brain').setDescription('Make online tokens chat')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true))
      .addIntegerOption((o) => o.setName('turns').setDescription('Turns').setRequired(false))),

  async execute(interaction) {
    if (!config.owners.includes(interaction.user.id)) {
      return interaction.reply({ content: 'Owner only.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand?.() || (interaction.rawArgs || [])[0];

    if (sub === 'start') {
      await interaction.reply({ content: 'Starting (staggered)...', ephemeral: true });
      const count = interaction.options.getInteger('count') || 5;
      const humanize = interaction.options.getBoolean('humanize') ?? true;
      const started = await onliner.startMany(count, { humanize });
      return interaction.editReply(`Online now: **${started.length}** (total ${onliner.onlineCount()}).`);
    }

    if (sub === 'stop') {
      onliner.stopAll();
      return interaction.reply({ content: 'All offline.', ephemeral: true });
    }

    if (sub === 'brain') {
      const channel = interaction.options.getChannel('channel');
      const turns = interaction.options.getInteger('turns') || 4;
      const out = await brain.converse(channel.id, turns);
      return interaction.reply({ content: out.ok ? `Conversation started (${turns} turns).` : `Failed: ${out.reason}`, ephemeral: true });
    }

    const s = stock.stats();
    return interaction.reply({ embeds: [createEmbed({
      title: 'Onliner',
      description: `Connected: **${onliner.onlineCount()}**\nStock ready: ${s.ready}`,
      color: COLORS.info,
    })], ephemeral: true });
  },
};