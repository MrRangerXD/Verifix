const crypto = require('crypto');
const db = require('./index');
const cfg = require('../config/plans');

const K_PLAN = 'plans';
const K_ORDER = 'orders';
const K_KEY = 'keys';
const K_WALLET = 'wallet';

function tier(name) {
  return cfg.TIERS[(name || '').toUpperCase()] || null;
}

function getUser(userId) {
  const map = db.get(K_PLAN) || {};
  const raw = map[userId];
  if (!raw) return null;
  const t = tier(raw.tier);
  if (!t) return null;
  return {
    ...raw,
    expired: raw.expiresAt ? raw.expiresAt < Date.now() : false,
    joinsLeft: Math.max(0, (raw.joinsQuota || 0) - (raw.joinsUsed || 0)),
    runsLeft: t.runs === Infinity ? Infinity : Math.max(0, (raw.runs || 0) - (raw.runsUsed || 0)),
    config: t,
  };
}

function setUser(userId, tierName, days) {
  const t = tier(tierName);
  if (!t) return null;
  const map = db.get(K_PLAN) || {};
  const prev = map[userId];
  const base = prev && !(prev.expiresAt && prev.expiresAt < Date.now()) ? prev : null;
  map[userId] = {
    tier: tierName.toUpperCase(),
    expiresAt: Math.max(base?.expiresAt || 0, Date.now()) + (days || t.days) * 86400000,
    joinsQuota: (base?.joinsQuota || 0) + t.joinsQuota,
    joinsUsed: base?.joinsUsed || 0,
    runs: (base?.runs || 0) + (t.runs === Infinity ? 999999 : t.runs),
    runsUsed: base?.runsUsed || 0,
    startedAt: base?.startedAt || Date.now(),
  };
  db.set(K_PLAN, map);
  return map[userId];
}

function revoke(userId) {
  const map = db.get(K_PLAN) || {};
  delete map[userId];
  db.set(K_PLAN, map);
}

/** returns { ok, reason, remaining } */
function consume(userId, amount) {
  const plan = getUser(userId);
  if (!plan) return { ok: false, reason: 'no_plan' };
  if (plan.expired) return { ok: false, reason: 'expired' };
  if (plan.runsLeft <= 0) return { ok: false, reason: 'no_runs' };
  if (plan.joinsLeft <= 0) return { ok: false, reason: 'no_quota' };
  const used = Math.min(amount, plan.joinsLeft);
  const map = db.get(K_PLAN) || {};
  map[userId].joinsUsed = (map[userId].joinsUsed || 0) + used;
  map[userId].runsUsed = (map[userId].runsUsed || 0) + 1;
  db.set(K_PLAN, map);
  return { ok: true, used, remaining: plan.joinsLeft - used };
}

// ---- wallet ----
function balance(userId) {
  return (db.get(K_WALLET) || {})[userId] || 0;
}
function addBalance(userId, amount) {
  const w = db.get(K_WALLET) || {};
  w[userId] = (w[userId] || 0) + amount;
  db.set(K_WALLET, w);
  return w[userId];
}
function spend(userId, amount) {
  const w = db.get(K_WALLET) || {};
  if ((w[userId] || 0) < amount) return false;
  w[userId] -= amount;
  db.set(K_WALLET, w);
  return true;
}

// ---- orders ----
function createOrder({ userId, tierName, method }) {
  const t = tier(tierName);
  if (!t) return null;
  const orders = db.get(K_ORDER) || {};
  const id = 'VF' + crypto.randomBytes(3).toString('hex').toUpperCase();
  orders[id] = {
    id, userId, tier: tierName.toUpperCase(), method,
    price: t.price, status: 'pending', createdAt: Date.now(),
  };
  db.set(K_ORDER, orders);
  return orders[id];
}
function getOrder(id) {
  return (db.get(K_ORDER) || {})[id] || null;
}
function setOrderStatus(id, status, by) {
  const orders = db.get(K_ORDER) || {};
  if (!orders[id]) return null;
  orders[id].status = status;
  orders[id].resolvedAt = Date.now();
  orders[id].resolvedBy = by || null;
  db.set(K_ORDER, orders);
  return orders[id];
}

// ---- redeem keys ----
function makeKeys(tierName, qty, days, by) {
  const t = tier(tierName);
  if (!t) return [];
  const keys = db.get(K_KEY) || {};
  const made = [];
  for (let i = 0; i < qty; i += 1) {
    const key = 'VFX-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    keys[key] = { tier: tierName.toUpperCase(), days: days || t.days, createdBy: by, createdAt: Date.now(), used: false };
    made.push(key);
  }
  db.set(K_KEY, keys);
  return made;
}
function redeemKey(key, userId) {
  const keys = db.get(K_KEY) || {};
  const entry = keys[key.trim().toUpperCase()];
  if (!entry) return { ok: false, reason: 'not_found' };
  if (entry.used) return { ok: false, reason: 'used' };
  entry.used = true;
  entry.usedBy = userId;
  entry.usedAt = Date.now();
  db.set(K_KEY, keys);
  setUser(userId, entry.tier, entry.days);
  return { ok: true, tier: entry.tier, days: entry.days };
}

function refundRun(userId) {
  const map = db.get(K_PLAN) || {};
  if (!map[userId]) return;
  map[userId].runsUsed = Math.max(0, (map[userId].runsUsed || 1) - 1);
  db.set(K_PLAN, map);
}

module.exports = {
  tier, getUser, setUser, revoke, consume,
  balance, addBalance, spend,
  createOrder, getOrder, setOrderStatus,
  makeKeys, redeemKey, refundRun,
};