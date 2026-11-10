const crypto = require('crypto');
const config = require('../config');
const db = require('../database');

const stateSecret = config.clientSecret || 'fallback-secret';

function sign(payload) {
  return crypto.createHmac('sha256', stateSecret).update(payload).digest('base64url').slice(0, 24);
}

function buildState(data) {
  const body = Buffer.from(JSON.stringify({ ...data, t: Date.now() })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function parseState(state) {
  if (!state || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  if (sign(body) !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (Date.now() - parsed.t > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getSetup(guildId) { return db.get(`verify_setup_${guildId}`) || null; }
function saveSetup(guildId, payload) { return db.set(`verify_setup_${guildId}`, payload); }
function removeSetup(guildId) { db.delete(`verify_setup_${guildId}`); }

function getBaseUrl() {
  return (process.env.BASE_URL || process.env.PUBLIC_URL || config.redirectUri).replace(/\/+$/, '');
}

/** yahi wo line hai jo pehle tooti hui thi — exchange me bhi yahi URI jaata hai */
function callbackUri() {
  return `${getBaseUrl()}/verify`;
}

function buildVerificationLink(guildId, channelId, token) {
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds.join');
  url.searchParams.set('state', buildState({ guildId, channelId, token }));
  return url.toString();
}

async function grantRole(member, setup) {
  if (!member || !setup?.roleId) return null;
  const role = member.guild.roles.cache.get(setup.roleId);
  if (!role) return null;
  if (member.roles.cache.has(role.id)) return role;
  return member.roles.add(role).catch(() => null);
}

module.exports = {
  buildState, parseState, getSetup, saveSetup, removeSetup,
  getBaseUrl, callbackUri, buildVerificationLink, grantRole,
};