const axios = require('axios');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('../config');
const db = require('../database');

function safeGet(key) {
  try {
    return db.get(key);
  } catch (error) {
    console.error('Database get failed:', error);
    return null;
  }
}

function safeSet(key, value) {
  try {
    return db.set(key, value);
  } catch (error) {
    console.error('Database set failed:', error);
    return null;
  }
}

function safeDelete(key) {
  try {
    return db.delete(key);
  } catch (error) {
    console.error('Database delete failed:', error);
    return null;
  }
}

function readAuthData() {
  return safeGet('authUsers') || [];
}

function writeAuthData(data) {
  return safeSet('authUsers', data);
}

function normalizePlan(plan) {
  return (plan || 'BRONZE').toUpperCase();
}

function isPremiumPlan(plan) {
  return normalizePlan(plan) === 'PLATINUM' || normalizePlan(plan) === 'DIAMOND';
}

function getReadyTokens(planFilter = null) {
  const authData = readAuthData();

  return authData.filter((session) => {
    if (!session || typeof session.access_token !== 'string' || session.access_token.length <= 10) return false;

    const plan = normalizePlan(session.plan);
    if (planFilter && normalizePlan(planFilter) !== plan) return false;
    return true;
  });
}

function refreshSessionUsage(userID) {
  const authData = readAuthData();
  const session = authData.find((entry) => entry.userID === userID);
  if (!session) return false;
  session.lastUsedAt = Date.now();
  if (!session.plan) session.plan = normalizePlan(db.get(`plan_${userID}`) || 'BRONZE');
  writeAuthData(authData);
  return true;
}

async function refreshAccessToken(userID) {
  const authData = readAuthData();
  const session = authData.find((entry) => entry.userID === userID);
  if (!session || !session.refresh_token) return null;

  const form = new FormData();
  form.append('client_id', config.clientId);
  form.append('client_secret', config.clientSecret);
  form.append('grant_type', 'refresh_token');
  form.append('refresh_token', session.refresh_token);

  try {
    const response = await fetch(config.tokenUrl, { method: 'POST', body: form });
    const data = await response.json();
    if (!data || data.error || !data.access_token) {
      return null;
    }

    session.access_token = data.access_token;
    if (data.refresh_token) {
      session.refresh_token = data.refresh_token;
    }
    session.updatedAt = Date.now();
    session.status = 'ready';
    writeAuthData(authData);
    return session;
  } catch (error) {
    console.error('refreshAccessToken failed:', error);
    return null;
  }
}

function addAuthUser(userData) {
  try {
    const existing = readAuthData();
    const index = existing.findIndex((entry) => entry.userID === userData.userID);
    const now = Date.now();
    const plan = normalizePlan(userData.plan || db.get(`plan_${userData.userID}`) || 'BRONZE');
    const authEntry = {
      ...userData,
      status: 'ready',
      lastUsedAt: now,
      plan,
      createdAt: existing[index]?.createdAt || now,
    };

    if (index >= 0) {
      existing[index] = { ...existing[index], ...authEntry };
      writeAuthData(existing);
      return { created: false, data: existing };
    }

    const updated = [...existing, authEntry];
    writeAuthData(updated);
    return { created: true, data: updated };
  } catch (error) {
    console.error('addAuthUser failed:', error);
    return { created: false, data: readAuthData() };
  }
}

function cleanupExpiredSessions() {
  // Removed session expiration logic for lifetime authenticated tokens.
}

function startSessionCleanup() {
  // No periodic cleanup is required for lifetime tokens.
}

async function exchangeCode(code) {
  const form = new FormData();
  form.append('client_id', config.clientId);
  form.append('client_secret', config.clientSecret);
  form.append('grant_type', 'authorization_code');
  form.append('redirect_uri', config.redirectUri);
  form.append('scope', 'identify');
  form.append('scope', 'guilds.join');
  form.append('code', code);

  const response = await fetch(config.tokenUrl, { method: 'POST', body: form });
  return response.json();
}

async function fetchDiscordUser(accessToken) {
  const headers = { authorization: `${config.tokenType || 'Bearer'} ${accessToken}` };
  const response = await axios.get(config.userApiUrl, { headers });
  return response.data;
}

module.exports = {
  readAuthData,
  writeAuthData,
  addAuthUser,
  exchangeCode,
  fetchDiscordUser,
  getReadyTokens,
  refreshSessionUsage,
  refreshAccessToken,
  cleanupExpiredSessions,
  startSessionCleanup,
};
