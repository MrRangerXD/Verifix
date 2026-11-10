const { createLogger } = require('../utils/logger');
const stock = require('../database/stock');
const health = require('./tokenHealth');

const logger = createLogger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULTS = { delay: 1400, concurrency: 1, maxAttempts: 3 };

async function joinOne(guild, entry, opts) {
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
        const retry = (error?.retryAfter || error?.rawError?.retry_after || 5) * 1000;
        logger.warn(`[join] 429 on ${entry.userID}, waiting ${retry}ms`);
        await sleep(retry + 500);
        continue;
      }
      if (code === 50001 || code === 50013) return { ok: false, reason: 'no_permission' };
      if (code === 50007 || status === 403) return { ok: false, reason: 'cannot_add' };
      if (status === 401) {
        const refreshed = await health.refresh(entry);
        if (refreshed) continue;
        stock.markDead(entry.userID, 'unauthorized');
        return { ok: false, reason: 'dead_token' };
      }
      if (attempt === opts.maxAttempts) {
        stock.markFailed(entry.userID, code || error.message);
        return { ok: false, reason: 'failed' };
      }
      await sleep(1000 * attempt);
    }
  }
  return { ok: false, reason: 'exhausted' };
}

/**
 * Sequential batch join with progress callback.
 * concurrency >1 real Discord pe 429 storm deta hai — 1 rakho.
 */
async function batchJoin(guild, entries, { delay = DEFAULTS.delay, onProgress } = {}) {
  const result = { added: 0, already: 0, failed: 0, skipped: 0 };

  for (const entry of entries) {
    const existing = guild.members.cache.get(entry.userID)
      || (await guild.members.fetch(entry.userID).catch(() => null));
    if (existing) {
      result.already += 1;
      onProgress?.(result, entry);
      continue;
    }

    const out = await joinOne(guild, entry, DEFAULTS);
    if (out.ok) result.added += 1;
    else if (out.reason === 'dead_token') result.skipped += 1;
    else result.failed += 1;

    onProgress?.(result, entry);
    await sleep(delay + Math.floor(Math.random() * 400));
  }
  return result;
}

module.exports = { batchJoin, joinOne, sleep };