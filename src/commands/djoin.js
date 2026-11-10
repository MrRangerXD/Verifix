const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const cfg = require('../config/plans');
const db = require('../database');
const stock = require('../database/stock');
const plans = require('../database/plans');
const { batchJoin } = require('../services/joinService');
const { logStaffAction } = require('../utils/staffLogger');

function lock(serverId) {
  const key = `djoin_lock_${serverId}`;
  const until = db.get(key);
  if (until && until > Date.now()) return false;
  db.set(key, Date.now() + 15 * 60 * 1000);
  return true;
}
const unlock = (serverId) => db.delete(`djoin_lock_${serverId}`);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('djoin')
    .setDescription('Pull stock members into a server')
    .addStringOption((o) => o.setName('server').setDescription('Server ID').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many').setRequired(false)),

  async execute(i) {
    const serverId = i.options.getString('server') || i.rawArgs?.[0];
    const guild = i.client.guilds.cache.get(serverId);

    if (!guild) return i.reply({ content: 'Bot is not in that server.', ephemeral: true });
    if (!lock(serverId)) return i.reply({ content: 'djoin already running here.', ephemeral: true });

    try {
      const plan = plans.ensure(i.user.id);
      const tier = plan?.config ? plan.tier : cfg.DEFAULT_TIER;
      const cap = cfg.MAX_PULL_PER_RUN[tier] || 3;

      const gate = plans.consume(i.user.id, 0);
      if (!gate.ok) {
        const msg = { no_plan: 'No plan. `/buy`', expired: 'Plan expired.', no_runs: 'Runs over.', no_quota: 'Quota over.' }[gate.reason];
        return i.reply({ content: msg, ephemeral: true });
      }

      const want = Math.min(i.options.getInteger('amount') || cap, cap, plan?.joinsLeft || cap);
      const entries = stock.pick(want);
      if (!entries.length) return i.reply({ content: 'Stock empty or cooling down.', ephemeral: true });

      await i.reply({ embeds: [createEmbed({ title: 'Joining', description: `${entries.length} members → **${guild.name}**`, color: COLORS.primary })] });

      let tick = 0;
      const r = await batchJoin(guild, entries, {
        onProgress: async (p) => {
          if (Date.now() - tick < 6000) return;
          tick = Date.now();
          await i.editReply({ embeds: [createEmbed({ title: 'Joining', description: `added ${p.added} · already ${p.already} · failed ${p.failed}`, color: COLORS.primary })] }).catch(() => null);
        },
      });

      if (r.added > 0) plans.consume(i.user.id, r.added);
      else plans.refundRun(i.user.id);

      await i.editReply({ embeds: [createEmbed({
        title: r.added ? 'Done' : 'Nothing added',
        description: `Added **${r.added}** · Already ${r.already} · Failed ${r.failed} · Dead ${r.skipped}`,
        color: r.added ? COLORS.success : COLORS.error,
      })] });

      logStaffAction(i.client, 'djoin', `<@${i.user.id}> → \`${guild.id}\` · ${r.added} added`, COLORS.info);
    } finally {
      unlock(serverId);
    }
  },
};