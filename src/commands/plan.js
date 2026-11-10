const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const config = require('../config');
const db = require('../database');

const VALID_PLANS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

function isAdmin(interaction) {
  const ownerId = '1408851223834132564';
  if (config.owners.includes(interaction.user.id) || interaction.user.id === ownerId) return true;
  if (config.adminRoleId && interaction.member?.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plan')
    .setDescription('Set or view a user plan (admin only)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Select a user')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('plan')
        .setDescription('Plan to assign (BRONZE, SILVER, GOLD, PLATINUM, DIAMOND)')
        .setRequired(true)
        .addChoices(
          { name: 'BRONZE', value: 'BRONZE' },
          { name: 'SILVER', value: 'SILVER' },
          { name: 'GOLD', value: 'GOLD' },
          { name: 'PLATINUM', value: 'PLATINUM' },
          { name: 'DIAMOND', value: 'DIAMOND' },
        )
    ),
  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const plan = interaction.options.getString('plan').toUpperCase();

    if (!VALID_PLANS.includes(plan)) {
      return interaction.reply({ content: 'Invalid plan selected.', ephemeral: true });
    }

    db.set(`plan_${target.id}`, plan);

    const embed = createEmbed({
      title: 'Plan Updated',
      description: `Assigned **${plan}** to **${target.tag}**.`,
      color: 0x43b581,
      footerText: 'VerifiX Bot - Plan Manager',
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
