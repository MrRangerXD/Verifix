const db = require('./index');
const plans = require('../config/plans');

const KEY = 'authUsers';
const MAX_FAILS = 3;
const COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8h — token ko dobara use se pehle rest

function all() {
  return db.get(KEY) || [];
}
function save(list) {
  db.set(KEY, list);
}
function get(userId) {
  return all().find((e) => e.userID === userId) || null;
}
function has(userId) {
  return Boolean(get(userId));
}

function add(entry) {
  const list = all();
  const idx = list.findIndex((e) => e.userID === entry.userID);
  const now = Date.now();
  const record = {
    userID: entry.userID,
    username: entry.username || `user-${entry.userID}`,
    avatarURL: entry.avatarURL || null,
    access_token: entry.access_token,
    refresh_token: entry.refresh_token || null,
    addedBy: entry.addedBy || null,
    addedAt: now,
    tokenIssuedAt: entry.tokenIssuedAt || now,
    status: 'ready',            // ready | cooldown | dead | banned
    fails: 0,
    usedCount: 0,
    lastUsedAt: 0,
    lastCheckedAt: 0,
    cooldownUntil: 0,
    onlined: false,
    note: null,
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record, usedCount: list[idx].usedCount || 0, addedAt: list[idx].addedAt || now };
  } else {
    list.push(record);
  }
  save(list);
  return record;
}

function remove(userId) {
  const list = all();
  const next = list.filter((e) => e.userID !== userId);
  if (next.length === list.length) return false;
  save(next);
  return true;
}

function patch(userId, changes) {
  const list = all();
  const entry = list.find((e) => e.userID === userId);
  if (!entry) return null;
  Object.assign(entry, changes);
  save(list);
  return entry;
}

function markReady(userId, token) {
  return patch(userId, {
    status: 'ready',
    fails: 0,
    lastCheckedAt: Date.now(),
    ...(token ? { access_token: token, tokenIssuedAt: Date.now() } : {}),
  });
}

function markDead(userId, reason) {
  return patch(userId, { status: 'dead', note: reason || 'invalid_token', onlined: false });
}

function markUsed(userId) {
  const entry = get(userId);
  if (!entry) return null;
  return patch(userId, {
    usedCount: (entry.usedCount || 0) + 1,
    lastUsedAt: Date.now(),
    status: 'cooldown',
    cooldownUntil: Date.now() + COOLDOWN_MS,
  });
}

function markFailed(userId, reason) {
  const entry = get(userId);
  if (!entry) return null;
  const fails = (entry.fails || 0) + 1;
  if (fails >= MAX_FAILS) return markDead(userId, reason);
  return patch(userId, { fails, note: reason || 'join_failed' });
}

/** cooldowns expire lazily */
function normalize() {
  const now = Date.now();
  let changed = false;
  const list = all();
  for (const entry of list) {
    if (entry.status === 'cooldown' && entry.cooldownUntil && entry.cooldownUntil <= now) {
      entry.status = 'ready';
      entry.cooldownUntil = 0;
      changed = true;
    }
  }
  if (changed) save(list);
}

/** pick best tokens: ready only, least used first, then oldest used */
function pick(count, { exclude = [] } = {}) {
  normalize();
  const excluded = new Set(exclude);
  return all()
    .filter((e) => e.status === 'ready' && e.access_token && e.access_token.length > 20 && !excluded.has(e.userID))
    .sort((a, b) => (a.usedCount || 0) - (b.usedCount || 0) || (a.lastUsedAt || 0) - (b.lastUsedAt || 0))
    .slice(0, count);
}

function stats() {
  normalize();
  const list = all();
  const byStatus = { ready: 0, cooldown: 0, dead: 0, banned: 0 };
  let onlined = 0;
  for (const e of list) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    if (e.onlined) onlined += 1;
  }
  return {
    total: list.length,
    ...byStatus,
    onlined,
    usable: byStatus.ready,
    healthPct: list.length ? Math.round((byStatus.ready / list.length) * 100) : 0,
  };
}

module.exports = {
  all, get, has, add, remove, patch,
  markReady, markDead, markUsed, markFailed,
  pick, stats, normalize, COOLDOWN_MS,
};