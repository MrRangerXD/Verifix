const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageActionRow, MessageButton } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const cfg = require('../config/plans');
const store = require('../database/plans');

function planList() {
  return Object.entries(cfg.TIERS).map(([name, t]) =>
    `**${t.label}** — ${cfg.PREFIX_SYMBOL}${t.price} / ${t.days}d\n` +
    `> ${t.joinsQuota} joins · ${t.runs === Infinity ? '∞' : t.runs} runs · ${t.cooldown}s cooldown · ` +
    `${t.onlinerSlots || 'no'} onliner · humanizer ${t.humanizer ? '✓' : '✗'} · brain ${t.brain ? '✓' : '✗'}`
  ).join('\n\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plans')
    .setDescription('Show plans and prices'),

  async execute(interaction) {
    return interaction.reply({ embeds: [createEmbed({
      title: 'Plans',
      description: `${planList()}\n\nBuy with \`/buy\`\nPay via: ${cfg.METHODS.join(', ')}`,
      color: COLORS.primary,
    })] });
  },
};

module.exports.buy = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy a plan')
    .addStringOption((o) => o.setName('tier').setDescription('Plan').setRequired(true)
      .addChoices(...Object.keys(cfg.TIERS).map((k) => ({ name: k, value: k }))))
    .addStringOption((o) => o.setName('method').setDescription('Payment method').setRequired(true)
      .addChoices(...cfg.METHODS.map((m) => ({ name: m, value: m })))),

  async execute(interaction) {
    const tier = interaction.options.getString('tier');
    const method = interaction.options.getString('method');
    const t = cfg.TIERS[tier];

    if (method === 'wallet') {
      if (store.balance(interaction.user.id) < t.price) {
        return interaction.reply({ content: `Wallet low. Need ${cfg.PREFIX_SYMBOL}${t.price}.`, ephemeral: true });
      }
      store.spend(interaction.user.id, t.price);
      store.setUser(interaction.user.id, tier, t.days);
      return interaction.reply({ embeds: [createEmbed({
        title: 'Purchased',
        description: `**${t.label}** active for ${t.days} days.`,
        color: COLORS.success,
      })] });
    }

    const order = store.createOrder({ userId: interaction.user.id, tierName: tier, method });
    const row = new MessageActionRow().addComponents(
      new MessageButton().setCustomId(`claim_${order.id}`).setLabel('Mark Paid').setStyle('SUCCESS'),
      new MessageButton().setCustomId(`deny_${order.id}`).setLabel('Deny').setStyle('DANGER'),
    );

    return interaction.reply({ embeds: [createEmbed({
      title: `Order ${order.id}`,
      description: `Tier: **${t.label}**\nAmount: **${cfg.PREFIX_SYMBOL}${t.price}**\nMethod: **${method}**\n\nPay, then staff "Mark Paid".`,
      color: COLORS.info,
    })], components: [row] });
  },
};

module.exports.wallet = {
  data: new SlashCommandBuilder().setName('wallet').setDescription('Show wallet balance'),
  async execute(interaction) {
    return interaction.reply({ content: `Balance: ${cfg.PREFIX_SYMBOL}${store.balance(interaction.user.id)}`, ephemeral: true });
  },
};

module.exports.myplan = {
  data: new SlashCommandBuilder().setName('myplan').setDescription('Show your plan'),
  async execute(interaction) {
    const p = store.getUser(interaction.user.id);
    if (!p || p.expired) return interaction.reply({ content: 'No active plan. Use `/plans`.', ephemeral: true });
    return interaction.reply({ embeds: [createEmbed({
      title: p.config.label,
      description: `Joins left: **${p.joinsLeft}**\nRuns left: **${p.runsLeft === Infinity ? '∞' : p.runsLeft}**\nExpires: <t:${Math.floor(p.expiresAt / 1000)}:R>`,
      color: COLORS.info,
    })], ephemeral: true });
  },
};

module.exports.redeem = {
  data: new SlashCommandBuilder().setName('redeem').setDescription('Redeem a license key')
    .addStringOption((o) => o.setName('key').setDescription('Key').setRequired(true)),
  async execute(interaction) {
    const out = store.redeemKey(interaction.options.getString('key'), interaction.user.id);
    return interaction.reply({ content: out.ok ? `Redeemed **${out.tier}** for ${out.days}d.` : `Failed: ${out.reason}`, ephemeral: true });
  },
};