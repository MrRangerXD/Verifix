const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

function parseList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const filePath = path.resolve(__dirname, '..', '..', 'config.json');
let fileConfig = {};
if (fs.existsSync(filePath)) {
  try { fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { fileConfig = {}; }
}

const clientId = process.env.CLIENT_ID || fileConfig.clientId || '';
const redirectUri = process.env.REDIRECT_URI || fileConfig.redirectUri || '';

module.exports = {
  token: process.env.DISCORD_TOKEN || fileConfig.token || '',
  clientSecret: process.env.CLIENT_SECRET || fileConfig.clientSecret || '',

  prefix: process.env.DISCORD_PREFIX || fileConfig.prefix || '!',
  guildId: process.env.GUILD_ID || fileConfig.guildId || '',
  owners: parseList(process.env.OWNERS || fileConfig.owners),

  commandChannels: fileConfig.commandChannels || {},
  addBotChannelId: process.env.ADD_BOT_CHANNEL_ID || fileConfig.addBotChannelId || null,
  staffLogChannelId: process.env.STAFF_LOG_CHANNEL_ID || fileConfig.staffLogChannelId || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || fileConfig.adminRoleId || null,

  brandingColor: fileConfig.brandingColor || 0x2f3136,
  webhookUrl: process.env.WEBHOOK_URL || fileConfig.webhookUrl || '',

  authLink: clientId && redirectUri
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds.join`
    : '',

  clientId,
  redirectUri,
  tokenUrl: 'https://discordapp.com/api/oauth2/token',
  userApiUrl: 'https://discordapp.com/api/users/@me',

  port: Number(process.env.PORT || fileConfig.port || 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
};