const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const stock = require('../database/stock');
const health = require('../services/tokenHealth');

function isAdmin(interaction) {
  if (config.owners.includes(interaction.user.id)) return true;
  if (config.adminRoleId && interaction.member?.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Manage member stock')
    .addSubcommand((s) => s.setName('add').setDescription('Add token(s) to stock')
      .addStringOption((o) => o.setName('tokens').setDescription('access_token or "access refresh" per line').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a user from stock')
      .addStringOption((o) => o.setName('user_id').setDescription('User ID').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List stock')
      .addStringOption((o) => o.setName('status').setDescription('ready|cooldown|dead').setRequired(false)))
    .addSubcommand((s) => s.setName('check').setDescription('Validate whole stock'))
    .addSubcommand((s) => s.setName('stats').setDescription('Stock overview')),

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'Admin only.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand?.() || (interaction.rawArgs || [])[0];

    if (sub === 'add') {
      const raw = interaction.options.getString('tokens')
        || (interaction.rawArgs || []).slice(1).join(' ');
      const lines = raw.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
      await interaction.reply({ content: `Checking ${lines.length} token(s)...`, ephemeral: true });

      const report = { added: 0, dead: 0, dup: 0 };
      for (const line of lines) {
        const [access, refresh] = line.split(/\s+/);
        const check = await health.validate(access);
        if (!check.ok) { report.dead += 1; continue; }
        if (stock.has(check.user.id)) { report.dup += 1; continue; }
        stock.add({
          userID: check.user.id,
          username: check.user.username,
          avatarURL: check.user.avatar
            ? `https://cdn.discordapp.com/avatars/${check.user.id}/${check.user.avatar}.png?size=256`
            : null,
          access_token: access,
          refresh_token: refresh || null,
          addedBy: interaction.user.id,
        });
        report.added += 1;
      }

      const total = stock.stats().usable;
      return interaction.editReply({ embeds: [createEmbed({
        title: 'Stock Updated',
        description: `Added: **${report.added}**\nDead: **${report.dead}**\nDuplicate: **${report.dup}**\n\nUsable stock: **${total}**`,
        color: report.added ? COLORS.success : COLORS.error,
      })] });
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('user_id') || (interaction.rawArgs || [])[1];
      const ok = stock.remove(id);
      return interaction.reply({ content: ok ? `Removed \`${id}\`.` : 'Not in stock.', ephemeral: true });
    }

    if (sub === 'list') {
      const status = interaction.options.getString('status') || (interaction.rawArgs || [])[1] || 'ready';
      const rows = stock.all().filter((e) => e.status === status).slice(0, 25);
      return interaction.reply({ embeds: [createEmbed({
        title: `Stock — ${status}`,
        description: rows.map((e, i) => `\`${i + 1}\` <@${e.userID}> used:${e.usedCount} fails:${e.fails}`).join('\n') || 'Empty',
        color: COLORS.info,
      })], ephemeral: true });
    }

    if (sub === 'check') {
      await interaction.reply({ content: 'Sweeping stock...', ephemeral: true });
      const out = await health.sweep();
      return interaction.editReply({ embeds: [createEmbed({
        title: 'Sweep Complete',
        description: `Checked: ${out.checked}\nAlive: **${out.ok}**\nDead: **${out.dead}**`,
        color: COLORS.info,
      })] });
    }

    const s = stock.stats();
    return interaction.reply({ embeds: [createEmbed({
      title: 'Stock Stats',
      description: `Total: **${s.total}**\nReady: **${s.ready}**\nCooldown: ${s.cooldown}\nDead: ${s.dead}\nOnline: ${s.onlined}\nHealth: ${s.healthPct}%`,
      color: COLORS.primary,
    })], ephemeral: true });
  },
};