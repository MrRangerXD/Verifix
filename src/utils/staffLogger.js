const { createEmbed } = require('./embeds');
const config = require('../config');
const { COLORS } = require('../constants');
const { createLogger } = require('./logger');

const logger = createLogger();

async function logStaffAction(client, title, description, color = COLORS.info) {
  if (!config.staffLogChannelId || !client) return;
  const channel = client.channels.cache.get(config.staffLogChannelId);
  if (!channel || typeof channel.send !== 'function') {
    logger.warn(`Staff log channel not found or invalid: ${config.staffLogChannelId}`);
    return;
  }

  const embed = createEmbed({
    title,
    description,
    color,
    footerText: 'Staff Activity Log',
  });

  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Failed to send staff log message', error);
  }
}

module.exports = { logStaffAction };