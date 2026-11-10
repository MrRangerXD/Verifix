const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const cfg = require('../config/plans');
const stock = require('../database/stock');
const plans = require('../database/plans');
const { batchJoin } = require('../services/joinService');
const { logStaffAction } = require('../utils/staffLogger');

const running = new Set();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('djoin')
    .setDescription('Pull stock members into a server')
    .addStringOption((o) => o.setName('server').setDescription('Target server ID').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many (default: max for plan)').setRequired(false)),

  async execute(interaction) {
    const serverId = interaction.options.getString('server');
    const guild = interaction.client.guilds.cache.get(serverId);

    if (!guild) {
      return interaction.reply({ content: 'Bot is not in that server. Add the bot first.', ephemeral: true });
    }
    if (running.has(serverId)) {
      return interaction.reply({ content: 'A djoin is already running for this server.', ephemeral: true });
    }

    const plan = plans.getUser(interaction.user.id);
    const tierName = plan?.config ? plan.tier : cfg.DEFAULT_TIER;
    const maxPull = cfg.MAX_PULL_PER_RUN[tierName] || 3;

    const gate = plans.consume(interaction.user.id, 0);
    if (!gate.ok) {
      const msg = {
        no_plan: 'No active plan. Buy one with `/buy`.',
        expired: 'Your plan expired. Renew with `/buy`.',
        no_runs: 'You used all your runs for this plan.',
        no_quota: 'Join quota finished.',
      }[gate.reason];
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const requested = interaction.options.getInteger('amount') || maxPull;
    const wanted = Math.min(requested, maxPull, plan ? plan.joinsLeft : maxPull);
    const entries = stock.pick(wanted);

    if (!entries.length) {
      return interaction.reply({ content: 'Stock empty or all tokens on cooldown.', ephemeral: true });
    }

    running.add(serverId);
    await interaction.reply({ embeds: [createEmbed({
      title: 'Joining...',
      description: `Pulling **${entries.length}** members into **${guild.name}**.`,
      color: COLORS.primary,
    })] });

    let lastEdit = 0;
    const result = await batchJoin(guild, entries, {
      delay: (plan?.config?.cooldown ? 1200 : 1500),
      onProgress: async (r) => {
        if (Date.now() - lastEdit < 5000) return;
        lastEdit = Date.now();
        await interaction.editReply({ embeds: [createEmbed({
          title: 'Joining...',
          description: `Added **${r.added}** · Already **${r.already}** · Failed **${r.failed}**`,
          color: COLORS.primary,
        })] }).catch(() => null);
      },
    });

    running.delete(serverId);
    if (result.added) plans.consume(interaction.user.id, result.added);

    await interaction.editReply({ embeds: [createEmbed({
      title: result.added ? 'Done' : 'Nothing added',
      description: `Server: **${guild.name}**\nAdded: **${result.added}**\nAlready there: ${result.already}\nFailed: ${result.failed}\nDead skipped: ${result.skipped}`,
      color: result.added ? COLORS.success : COLORS.error,
    })] });

    await logStaffAction(interaction.client, 'djoin', `<@${interaction.user.id}> → \`${guild.id}\` · added ${result.added}`, COLORS.info);
  },
};