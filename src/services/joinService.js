const { createLogger } = require('../utils/logger');
const stock = require('../database/stock');
const health = require('./tokenHealth');

const logger = createLogger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OPTS = { delay: 1400, maxAttempts: 3 };

/** member hai ya nahi — 429 pe retry, null ko "nahi hai" na maano */
async function memberState(guild, userId) {
  if (guild.members.cache.has(userId)) return 'present';

  for (let i = 0; i < 3; i += 1) {
    try {
      const member = await guild.members.fetch(userId);
      return member ? 'present' : 'absent';
    } catch (error) {
      if (error?.httpStatus === 429 || error?.status === 429) {
        await sleep((error?.retryAfter || 3) * 1000);
        continue;
      }
      if (error?.code === 10007) return 'absent';
      return 'absent';
    }
  }
  return 'absent';
}

async function joinOne(guild, entry, opts = OPTS) {
  const token = await health.ensure(entry);
  if (!token) return { ok: false, reason: 'dead_token' };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt += 1) {
    try {
      await guild.members.add(entry.userID, { accessToken: token });
      stock.markUsed(entry.userID);
      return { ok: true };
    } catch (error) {
      const code = error?.code;
      const status = error?.httpStatus || error?.status;

      if (status === 429) {
        const wait = (error?.retryAfter || 5) * 1000;
        logger.warn(`[join] 429 ${entry.userID} — ${wait}ms`);
        await sleep(wait + 500);
        continue;
      }
      if (code === 50001 || code === 50013) return { ok: false, reason: 'no_permission' };
      if (code === 50007 || status === 403) return { ok: false, reason: 'cannot_add' };
      if (status === 401) {
        const fresh = await health.refresh(entry);
        if (fresh) continue;
        stock.markDead(entry.userID, 'unauthorized');
        return { ok: false, reason: 'dead_token' };
      }
      if (attempt === opts.maxAttempts) {
        stock.markFailed(entry.userID, String(code || error.message));
        return { ok: false, reason: 'failed' };
      }
      await sleep(1000 * attempt);
    }
  }
  return { ok: false, reason: 'exhausted' };
}

async function batchJoin(guild, entries, { delay = OPTS.delay, onProgress } = {}) {
  const result = { added: 0, already: 0, failed: 0, skipped: 0 };

  for (const entry of entries) {
    if ((await memberState(guild, entry.userID)) === 'present') {
      result.already += 1;
      onProgress?.(result, entry);
      continue;
    }

    const out = await joinOne(guild, entry);
    if (out.ok) result.added += 1;
    else if (out.reason === 'dead_token') result.skipped += 1;
    else result.failed += 1;

    onProgress?.(result, entry);
    await sleep(delay + Math.floor(Math.random() * 400));
  }
  return result;
}

module.exports = { batchJoin, joinOne, memberState, sleep };