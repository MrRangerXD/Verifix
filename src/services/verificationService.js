const crypto = require('crypto');
const config = require('../config');
const db = require('../database');
const { createLogger } = require('../utils/logger');

const logger = createLogger();

function createVerificationToken() {
  return crypto.randomBytes(18).toString('hex');
}

function buildVerificationState(token, guildId, channelId) {
  return Buffer.from(JSON.stringify({ token, guildId, channelId })).toString('base64url');
}

function parseVerificationState(state) {
  if (!state) return null;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

function getVerificationSetup(guildId) {
  return db.get(`verify_setup_${guildId}`) || null;
}

function saveVerificationSetup(guildId, payload) {
  return db.set(`verify_setup_${guildId}`, payload);
}

function removeVerificationSetup(guildId) {
  db.delete(`verify_setup_${guildId}`);
}

function getGuildVerificationRole(guild) {
  const setup = getVerificationSetup(guild.id);
  if (!setup?.roleId) return null;
  return guild.roles.cache.get(setup.roleId) || null;
}

function getBaseUrl() {
  return (process.env.BASE_URL || process.env.PUBLIC_URL || config.redirectUri || 'http://localhost:3000').replace(/\/$/, '');
}

function getRedirectUrl() {
  return process.env.VERIFICATION_REDIRECT_URL || process.env.REDIRECT_URI || config.redirectUri || getBaseUrl();
}

function buildVerificationLink(guildId, channelId, token) {
  const state = buildVerificationState(token, guildId, channelId);
  const authUrl = new URL('https://discord.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', `${getBaseUrl()}/verify`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify guilds.join');
  authUrl.searchParams.set('state', state);
  return authUrl.toString();
}

async function grantVerificationAccess(member, setup) {
  if (!member?.guild || !setup) {
    logger.warn('grantVerificationAccess: Missing member or setup');
    return null;
  }
  
  const guild = member.guild;
  
  if (!setup.roleId) {
    logger.error(`grantVerificationAccess: No roleId in setup for guild ${guild.id}`);
    return null;
  }

  let role = guild.roles.cache.get(setup.roleId);
  
  if (!role) {
    logger.error(`grantVerificationAccess: Role ${setup.roleId} not found in guild ${guild.id}. It may have been deleted.`);
    return null;
  }

  try {
    // Check if member already has the role
    if (member.roles.cache.has(role.id)) {
      logger.info(`User ${member.id} already has Verified role in guild ${guild.id}`);
      return role;
    }

    await member.roles.add(role);
    logger.info(`✅ User ${member.id} granted Verified role (${role.id}) in guild ${guild.id}`);
    return role;
  } catch (error) {
    logger.error(`❌ Failed to grant role to user ${member.id} in guild ${guild.id}:`, error.message);
    return null;
  }
}

module.exports = {
  createVerificationToken,
  buildVerificationState,
  parseVerificationState,
  getVerificationSetup,
  saveVerificationSetup,
  removeVerificationSetup,
  getGuildVerificationRole,
  buildVerificationLink,
  grantVerificationAccess,
  getBaseUrl,
  getRedirectUrl,
};
