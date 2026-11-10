const { createEmbed } = require('./embeds');
const config = require('../config');
const { COLORS, EMOJIS } = require('../constants');

function getChannelName(channel) {
  if (!channel) return 'unknown channel';
  if (channel.name) return `#${channel.name}`;
  if (channel.id) return `<${channel.id}>`;
  return 'unknown channel';
}

function ensureCommandChannel(commandName, channel, client) {
  let allowedChannelId = config.commandChannels?.[commandName];
  if (!allowedChannelId && commandName === 'get_token') {
    allowedChannelId = config.commandChannels?.auth;
  }
  if (!allowedChannelId) return { ok: true };
  if (channel.id === allowedChannelId) return { ok: true };

  const targetChannel = client.channels.cache.get(allowedChannelId);
  const targetLabel = targetChannel ? `<#${allowedChannelId}>` : `<#${allowedChannelId}>`;

  const embed = createEmbed({
    title: `${EMOJIS.fail} Wrong Channel`,
    description: `This command can only be used in ${targetLabel}. Please move to the correct channel and try again.`,
    color: COLORS.error,
    footerText: 'Channel restriction enforced',
  });
  return { ok: false, embed };
}

function checkCommandCooldown(commandName, userId, db) {
  const cooldownSeconds = config.commandCooldowns?.[commandName];
  if (!cooldownSeconds) return { ok: true };

  const cooldownKey = `cooldown_${commandName}_${userId}`;
  const expiresAt = db.get(cooldownKey) || 0;
  const now = Date.now();

  if (expiresAt > now) {
    const remainingSeconds = Math.ceil((expiresAt - now) / 1000);
    const embed = createEmbed({
      title: `${EMOJIS.fail} Cooldown Active`,
      description: `Please wait **${remainingSeconds} seconds** before using this command again.`,
      color: COLORS.warning,
      footerText: 'Rate limiting enforced',
    });
    return { ok: false, embed };
  }

  db.set(cooldownKey, now + cooldownSeconds * 1000);
  return { ok: true };
}

module.exports = {
  ensureCommandChannel,
  checkCommandCooldown,
};
