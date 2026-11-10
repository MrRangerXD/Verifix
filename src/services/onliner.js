const axios = require('axios');
const { Session } = require('./gateway');
const stock = require('../database/stock');
const health = require('./tokenHealth');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const sessions = new Map();

const STATUSES = ['online', 'online', 'online', 'idle', 'dnd'];
const ACTIVITIES = [
  { type: 0, name: 'Visual Studio Code' },
  { type: 0, name: 'Valorant' },
  { type: 3, name: 'lofi beats' },
  { type: 0, name: 'Minecraft' },
  { type: 1, name: 'a stream' },
  { type: 0, name: 'Discord' },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const rest = (token) => axios.create({
  baseURL: 'https://discord.com/api/v10',
  headers: { authorization: token, 'user-agent': 'Mozilla/5.0' },
  timeout: 20000,
  validateStatus: () => true,
});

function humanizePresence(session) {
  const timers = [];
  const tick = () => {
    session.setPresence({
      status: pick(STATUSES),
      activities: Math.random() > 0.25 ? [pick(ACTIVITIES)] : [],
    });
    timers.push(setTimeout(tick, rnd(180000, 900000)));
  };
  timers.push(setTimeout(tick, rnd(3000, 25000)));
  return timers;
}

async function setAvatar(token, imageUrl) {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const b64 = Buffer.from(res.data).toString('base64');
  return rest(token).patch('/users/@me', { avatar: `data:image/png;base64,${b64}` });
}

async function setBio(token, bio) {
  return rest(token).patch('/users/@me', { bio });
}

function start(userId, { humanize = true } = {}) {
  if (sessions.has(userId)) return Promise.resolve({ ok: true, already: true });

  const entry = stock.get(userId);
  if (!entry) return Promise.resolve({ ok: false, reason: 'not_in_stock' });

  return health.ensure(entry).then((token) => {
    if (!token) return { ok: false, reason: 'dead_token' };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const session = new Session(token, {
        onReady: () => {
          stock.patch(userId, { onlined: true });
          logger.info(`[onliner] ${userId} online`);
          finish({ ok: true });
        },
        onFatal: (code) => {
          stock.markDead(userId, `gateway_${code}`);
          sessions.delete(userId);
          finish({ ok: false, reason: `fatal_${code}` });
        },
      });

      const record = { session, token, timers: [] };
      if (humanize) record.timers = humanizePresence(session);

      sessions.set(userId, record);
      session.connect();

      setTimeout(() => finish({ ok: false, reason: 'timeout' }), 25000);
    });
  });
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
  for (const id of [...sessions.keys()]) stop(id);
}

const isOnline = (userId) => sessions.has(userId);
const sessionOf = (userId) => sessions.get(userId) || null;
const onlineCount = () => sessions.size;

/** rotation: collect targets pehle, phir ek-ek karke restart */
function startTokenRotation() {
  setInterval(async () => {
    const targets = [...sessions.keys()];
    for (const userId of targets) {
      const entry = stock.get(userId);
      if (!entry) { stop(userId); continue; }
      const fresh = await health.refresh(entry);
      if (!fresh) continue;
      stop(userId);
      await new Promise((r) => setTimeout(r, 5500));
      await start(userId);
    }
  }, 4 * 60 * 60 * 1000).unref();
}

async function startMany(count, opts = {}) {
  const started = [];
  for (const entry of stock.pick(count)) {
    const out = await start(entry.userID, opts);
    if (out.ok) started.push(entry.userID);
    await new Promise((r) => setTimeout(r, 5500));
  }
  return started;
}

module.exports = {
  start, stop, stopAll, isOnline, sessionOf, onlineCount,
  setAvatar, setBio, startMany, startTokenRotation,
};