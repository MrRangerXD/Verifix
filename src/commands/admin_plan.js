const { SlashCommandBuilder } = require('@discordjs/builders');
const { COLORS } = require('../constants');
const config = require('../config');
const cfg = require('../config/plans');
const store = require('../database/plans');

const isAdmin = (i) => config.owners.includes(i.user.id)
  || (config.adminRoleId && i.member?.roles?.cache?.has(config.adminRoleId));

const tierChoices = Object.keys(cfg.TIERS).map((k) => ({ name: k, value: k }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plan')
    .setDescription('Admin plan management')
    .addSubcommand((s) => s.setName('give').setDescription('Give a plan')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption((o) => o.setName('tier').setDescription('Tier').setRequired(true).addChoices(...tierChoices))
      .addIntegerOption((o) => o.setName('days').setDescription('Days override').setRequired(false)))
    .addSubcommand((s) => s.setName('revoke').setDescription('Revoke plan')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('keygen').setDescription('Generate license keys')
      .addStringOption((o) => o.setName('tier').setDescription('Tier').setRequired(true).addChoices(...tierChoices))
      .addIntegerOption((o) => o.setName('qty').setDescription('Quantity').setRequired(true))
      .addIntegerOption((o) => o.setName('days').setDescription('Days').setRequired(false)))
    .addSubcommand((s) => s.setName('wallet-add').setDescription('Add wallet balance')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true))),

  async execute(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', ephemeral: true });
    const sub = interaction.options.getSubcommand?.() || (interaction.rawArgs || [])[0];

    if (sub === 'give') {
      const user = interaction.options.getUser('user');
      const tier = interaction.options.getString('tier');
      store.setUser(user.id, tier, interaction.options.getInteger('days') || undefined);
      return interaction.reply({ content: `Gave **${tier}** to <@${user.id}>.`, ephemeral: true });
    }

    if (sub === 'revoke') {
      const user = interaction.options.getUser('user');
      store.revoke(user.id);
      return interaction.reply({ content: `Revoked <@${user.id}>.`, ephemeral: true });
    }

    if (sub === 'keygen') {
      const keys = store.makeKeys(
        interaction.options.getString('tier'),
        interaction.options.getInteger('qty'),
        interaction.options.getInteger('days') || undefined,
        interaction.user.id,
      );
      const body = keys.join('\n');
      return interaction.reply({
        content: `Generated ${keys.length} keys:\n\`\`\`\n${body}\n\`\`\``,
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');
    const balance = store.addBalance(user.id, interaction.options.getInteger('amount'));
    return interaction.reply({ content: `<@${user.id}> balance → ${cfg.PREFIX_SYMBOL}${balance}`, ephemeral: true });
  },
};