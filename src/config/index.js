const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { PLAN_LIMITS } = require('./plans');

function parseOwners(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const configJsonPath = path.resolve(__dirname, '..', '..', 'config.json');
let fileConfig = {};
if (fs.existsSync(configJsonPath)) {
  try {
    fileConfig = JSON.parse(fs.readFileSync(configJsonPath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse config.json:', error);
    fileConfig = {};
  }
}

const clientId = process.env.CLIENT_ID || fileConfig.clientId || '1481283105837940901';
const redirectUri = process.env.REDIRECT_URI || fileConfig.redirectUri || 'https://verificationbotv1.vercel.app/';

module.exports = {
  token: process.env.DISCORD_TOKEN || fileConfig.token || 'HaQ95W485adevZGYUJbRlPmuSzLxZB48',
  prefix: process.env.DISCORD_PREFIX || fileConfig.prefix || '!',
  guildId: process.env.GUILD_ID || fileConfig.guildId || '1512336007242977321',
  owners: parseOwners(process.env.OWNERS || fileConfig.owners),
  commandChannels: fileConfig.commandChannels || {},
  addBotChannelId: process.env.ADD_BOT_CHANNEL_ID || fileConfig.addBotChannelId || null,
  staffLogChannelId: process.env.STAFF_LOG_CHANNEL_ID || fileConfig.staffLogChannelId || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || fileConfig.adminRoleId || null,
  commandCooldowns: fileConfig.commandCooldowns || { djoin: 30 },
  brandingColor: fileConfig.brandingColor || 0x2f3136,
  authLink: process.env.AUTH_LINK || fileConfig.authLink || (clientId && redirectUri
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds.join`
    : 'https://verificationbotv1.vercel.app/'),
  clientId,
  clientSecret: process.env.CLIENT_SECRET || fileConfig.clientSecret || 'HaQ95W485adevZGYUJbRlPmuSzLxZB48',
  redirectUri,
  webhookUrl: process.env.WEBHOOK_URL || fileConfig.webhookUrl || '',
  tokenUrl: process.env.TOKEN_URL || fileConfig.tokenUrl || 'https://discordapp.com/api/oauth2/token',
  userApiUrl: process.env.USER_API_URL || fileConfig.userApiUrl || 'https://discordapp.com/api/users/@me',
  port: Number(process.env.PORT || fileConfig.port || 3000),
  logLevel: process.env.LOG_LEVEL || fileConfig.logLevel || 'info',
  PLAN_LIMITS,
};
