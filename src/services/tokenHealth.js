const axios = require('axios');
const config = require('../config');
const stock = require('../database/stock');

const MAX_AGE = 6 * 86400000; // 6 din — Discord ~7 din me expire karta hai

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
  if (!entry.refresh_token) return null;
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

/** token ko use karne layak banao; dead ho to null */
async function ensure(entry) {
  if (!entry) return null;
  let token = entry.access_token;
  const age = Date.now() - (entry.tokenIssuedAt || 0);

  if (age > MAX_AGE) {
    token = (await refresh(entry)) || token;
  }

  const check = await validate(token);
  if (check.ok) {
    stock.markReady(entry.userID, token);
    return token;
  }
  if (check.dead) {
    const refreshed = await refresh(entry);
    if (refreshed && (await validate(refreshed)).ok) {
      stock.markReady(entry.userID, refreshed);
      return refreshed;
    }
    stock.markDead(entry.userID, 'invalid_token');
    return null;
  }
  return token;
}

/** poori stock scan — 6 ghante pe ek baar chalao */
async function sweep() {
  const list = stock.all().filter((e) => e.status !== 'banned');
  let ok = 0, dead = 0;
  for (const entry of list) {
    const token = await ensure(entry);
    if (token) ok += 1;
    else dead += 1;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { checked: list.length, ok, dead };
}

function startHeartbeat(logger) {
  setInterval(async () => {
    const result = await sweep();
    logger?.info?.(`[health] sweep: ${result.ok} ok / ${result.dead} dead of ${result.checked}`);
  }, 6 * 60 * 60 * 1000).unref();
}

module.exports = { validate, refresh, ensure, sweep, startHeartbeat };