const axios = require('axios');
const config = require('../config');
const stock = require('../database/stock');

const MAX_AGE = 6 * 86400000;
const RECHECK_AFTER = 6 * 3600000;

async function validate(accessToken) {
  try {
    const res = await axios.get(config.userApiUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status === 200) return { ok: true, user: res.data };
    if (res.status === 401) return { ok: false, dead: true, status: 401 };
    return { ok: false, dead: false, status: res.status };
  } catch (error) {
    return { ok: false, dead: false, error: error.message };
  }
}

async function refresh(entry) {
  if (!entry?.refresh_token) return null;
  try {
    const res = await axios.post(config.tokenUrl, new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: entry.refresh_token,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    if (!res.data?.access_token) return null;
    stock.patch(entry.userID, {
      access_token: res.data.access_token,
      refresh_token: res.data.refresh_token || entry.refresh_token,
      tokenIssuedAt: Date.now(),
    });
    return res.data.access_token;
  } catch {
    return null;
  }
}

/**
 * Token use karne layak banao.
 * validate sirf tab jab token stale ho — har join pe API call nahi.
 */
async function ensure(entry) {
  if (!entry) return null;

  let token = entry.access_token;
  if (!token || token.length < 20) {
    token = await refresh(entry);
    if (!token) { stock.markDead(entry.userID, 'no_token'); return null; }
  }

  const age = Date.now() - (entry.tokenIssuedAt || 0);
  const sinceCheck = Date.now() - (entry.lastCheckedAt || 0);

  if (age > MAX_AGE) {
    const fresh = await refresh(entry);
    if (fresh) token = fresh;
  }

  if (sinceCheck < RECHECK_AFTER) return token;

  const check = await validate(token);
  if (check.ok) { stock.markChecked(entry.userID); return token; }

  if (check.dead) {
    const fresh = await refresh(entry);
    if (fresh && (await validate(fresh)).ok) {
      stock.markChecked(entry.userID, fresh);
      return fresh;
    }
    stock.markDead(entry.userID, 'invalid_token');
    return null;
  }
  return token;
}

async function sweep() {
  const list = stock.all().filter((e) => e.status !== 'banned');
  let ok = 0;
  let dead = 0;

  for (const entry of list) {
    const check = await validate(entry.access_token);
    if (check.ok) { stock.markChecked(entry.userID); ok += 1; }
    else if (check.dead) {
      const fresh = await refresh(entry);
      if (fresh) { stock.markChecked(entry.userID, fresh); ok += 1; }
      else { stock.markDead(entry.userID, 'invalid_token'); dead += 1; }
    } else ok += 1;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { checked: list.length, ok, dead };
}

function startHeartbeat(logger) {
  setInterval(async () => {
    const result = await sweep();
    logger?.info?.(`[health] ${result.ok} ok / ${result.dead} dead of ${result.checked}`);
  }, 6 * 60 * 60 * 1000).unref();
}

module.exports = { validate, refresh, ensure, sweep, startHeartbeat };