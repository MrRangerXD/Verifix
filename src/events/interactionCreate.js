const { createLogger } = require('../utils/logger');
const { isStaff, isAdmin } = require('../utils/permissions');
const plans = require('../database/plans');
const cfg = require('../config/plans');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');

const logger = createLogger();

async function handleButton(interaction) {
  const [action, orderId] = interaction.customId.split('_');
  if (!['claim', 'deny'].includes(action)) return;

  if (!isStaff(interaction.member) && !isAdmin(interaction)) {
    return interaction.reply({ content: 'Staff only.', ephemeral: true });
  }

  const order = plans.getOrder(orderId);
  if (!order || order.status !== 'pending') {
    return interaction.reply({ content: 'Order already resolved.', ephemeral: true });
  }

  if (action === 'deny') {
    plans.setOrderStatus(orderId, 'denied', interaction.user.id);
    return interaction.update({
      embeds: [createEmbed({ title: `Order ${orderId} denied`, description: `<@${order.userId}>`, color: COLORS.error })],
      components: [],
    });
  }

  const tier = cfg.TIERS[order.tier];
  plans.setOrderStatus(orderId, 'paid', interaction.user.id);
  plans.setUser(order.userId, order.tier, tier.days);

  await interaction.update({
    embeds: [createEmbed({ title: `Order ${orderId} paid`, description: `<@${order.userId}> got **${tier.label}**`, color: COLORS.success })],
    components: [],
  });

  interaction.client.users.fetch(order.userId)
    .then((u) => u.send(`Plan **${tier.label}** activated. Enjoy.`))
    .catch(() => null);
}

function registerInteractionCreateEvent(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) return handleButton(interaction);
      if (!interaction.isCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        return interaction.reply({ content: 'Unknown command.', ephemeral: true });
      }

      await command.execute(interaction);
    } catch (error) {
      logger.error(`interaction ${interaction.commandName || interaction.customId} failed`, error);
      const payload = { content: 'Command error — check logs.', ephemeral: true };
      if (interaction.replied || interaction.deferred) interaction.editReply(payload).catch(() => null);
      else interaction.reply(payload).catch(() => null);
    }
  });
}

module.exports = { registerInteractionCreateEvent };