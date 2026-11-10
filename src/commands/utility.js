const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const db = require('../database');
const stock = require('../database/stock');
const { isAdmin } = require('../utils/permissions');
const { batchJoin } = require('../services/joinService');

module.exports.wl = {
  data: new SlashCommandBuilder().setName('wl').setDescription('Whitelist manager')
    .addStringOption((o) => o.setName('action').setDescription('add|remove|list').setRequired(true).addChoices(
      { name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' },
    ))
    .addStringOption((o) => o.setName('user_id').setDescription('User ID').setRequired(false)),
  async execute(i) {
    if (!isAdmin(i)) return i.reply({ content: 'Admin only.', ephemeral: true });
    const action = i.options.getString('action') || i.rawArgs?.[0];
    const id = i.options.getString('user_id') || i.rawArgs?.[1];

    if (action === 'list') {
      const list = db.keys().filter((k) => k.startsWith('wl_')).map((k) => `• <@${k.slice(3)}>`).join('\n');
      return i.reply({ embeds: [createEmbed({ title: 'Whitelist', description: list || 'Empty', color: COLORS.info })], ephemeral: true });
    }
    if (!id) return i.reply({ content: 'User ID needed.', ephemeral: true });

    if (action === 'add') { db.set(`wl_${id}`, true); return i.reply({ content: `Whitelisted <@${id}>.`, ephemeral: true }); }
    db.delete(`wl_${id}`);
    return i.reply({ content: `Removed <@${id}>.`, ephemeral: true });
  },
};

module.exports.links = {
  data: new SlashCommandBuilder().setName('links').setDescription('OAuth + invite links'),
  async execute(i) {
    const invite = `https://discord.com/api/oauth2/authorize?client_id=${i.client.user.id}&permissions=8&scope=bot`;
    return i.reply({ embeds: [createEmbed({
      title: 'Links',
      description: `**Auth:** ${config.authLink}\n**Invite:** ${invite}`,
      color: COLORS.primary,
    })], ephemeral: true });
  },
};

module.exports.joinall = {
  data: new SlashCommandBuilder().setName('joinall').setDescription('Pull entire stock into this server'),
  async execute(i) {
    if (!isAdmin(i)) return i.reply({ content: 'Admin only.', ephemeral: true });
    const entries = stock.all().filter((e) => e.status === 'ready');
    if (!entries.length) return i.reply({ content: 'Stock empty.', ephemeral: true });

    await i.reply({ content: `Joining ${entries.length} members...` });
    const r = await batchJoin(i.guild, entries, {
      onProgress: async (p) => {
        if (p.added % 10 === 0) await i.editReply(`added ${p.added} / ${entries.length}`).catch(() => null);
      },
    });
    return i.editReply(`Done — added ${r.added}, already ${r.already}, failed ${r.failed}`);
  },
};

module.exports.users = {
  data: new SlashCommandBuilder().setName('users').setDescription('Stock overview'),
  async execute(i) {
    const s = stock.stats();
    return i.reply({ embeds: [createEmbed({
      title: 'Stock',
      description: `Total **${s.total}** · Ready **${s.ready}** · Cooldown ${s.cooldown} · Dead ${s.dead} · Online ${s.onlined}`,
      color: COLORS.info,
    })], ephemeral: true });
  },
};