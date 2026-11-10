const axios = require('axios');
const { Session } = require('./gateway');
const stock = require('../database/stock');
const health = require('./tokenHealth');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const sessions = new Map(); // userId -> { session, timers, token }

const STATUSES = ['online', 'online', 'online', 'idle', 'dnd'];
const ACTIVITIES = [
  { type: 0, name: 'Visual Studio Code' },
  { type: 0, name: 'Valorant' },
  { type: 3, name: 'lofi beats' },
  { type: 2, name: 'Spotify' },
  { type: 0, name: 'Minecraft' },
  { type: 1, name: 'a stream' },
  { type: 0, name: 'Discord' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const api = (token) => axios.create({
  baseURL: 'https://discord.com/api/v10',
  headers: { authorization: token, 'user-agent': 'Mozilla/5.0' },
  timeout: 15000,
  validateStatus: () => true,
});

/** presence ko random intervals pe ghumaо — insaan jaisa */
function startHumanizedPresence(userId, session) {
  const timers = [];
  const tick = () => {
    const status = pick(STATUSES);
    const useActivity = Math.random() > 0.25;
    session.setPresence({
      status,
      activities: useActivity ? [pick(ACTIVITIES)] : [],
    });
    timers.push(setTimeout(tick, rnd(180000, 900000))); // 3-15 min
  };
  timers.push(setTimeout(tick, rnd(2000, 20000)));
  return timers;
}

async function setAvatar(token, imageUrl) {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const b64 = Buffer.from(res.data).toString('base64');
  return api(token).patch('/users/@me', { avatar: `data:image/png;base64,${b64}` });
}

async function setBio(token, bio) {
  return api(token).patch('/users/@me', { bio });
}

async function start(userId, { humanize = true } = {}) {
  if (sessions.has(userId)) return { ok: true, already: true };

  const entry = stock.get(userId);
  if (!entry) return { ok: false, reason: 'not_in_stock' };

  const token = await health.ensure(entry);
  if (!token) return { ok: false, reason: 'dead_token' };

  const session = new Session(token, {
    onReady: () => {
      stock.patch(userId, { onlined: true });
      logger.info(`[onliner] ${userId} online`);
    },
    onClose: (code) => {
      if (code === 4004) {
        stock.markDead(userId, 'gateway_auth_failed');
        sessions.delete(userId);
      }
    },
  });

  const record = { session, token, timers: [] };
  if (humanize) record.timers = startHumanizedPresence(userId, session);

  sessions.set(userId, record);
  session.connect();
  return { ok: true };
}

function stop(userId) {
  const record = sessions.get(userId);
  if (!record) return false;
  record.timers.forEach(clearTimeout);
  record.session.close();
  sessions.delete(userId);
  stock.patch(userId, { onlined: false });
  return true;
}

function stopAll() {
  for (const userId of [...sessions.keys()]) stop(userId);
}

function isOnline(userId) {
  return sessions.has(userId);
}

function sessionOf(userId) {
  return sessions.get(userId) || null;
}

/** token expiry se pehle rotate */
function startTokenRotation() {
  setInterval(async () => {
    for (const [userId, record] of sessions) {
      const fresh = await health.refresh(stock.get(userId) || {});
      if (!fresh) continue;
      record.token = fresh;
      stop(userId);
      setTimeout(() => start(userId), 3000);
    }
  }, 4 * 60 * 60 * 1000).unref();
}

/** ek saath N tokens online karo, staggered (identify rate limit 1/5s) */
async function startMany(count, opts = {}) {
  const targets = stock.pick(count);
  const started = [];
  for (const entry of targets) {
    const out = await start(entry.userID, opts);
    if (out.ok) started.push(entry.userID);
    await new Promise((r) => setTimeout(r, 5500));
  }
  return started;
}

module.exports = {
  start, stop, stopAll, isOnline, sessionOf,
  setAvatar, setBio, startMany, startTokenRotation,
  onlineCount: () => sessions.size,
};