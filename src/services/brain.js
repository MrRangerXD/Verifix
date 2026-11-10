const axios = require('axios');
const onliner = require('./onliner');
const ai = require('./ai');
const stock = require('../database/stock');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LANGS = ['hinglish', 'english', 'russian'];

const LANG_RULES = {
  hinglish: 'Reply in casual Hinglish (Roman Hindi + English mix), like Indian Discord users. Lowercase, max 8 words.',
  english: 'Reply in casual lowercase English slang, max 8 words.',
  russian: 'Reply in casual Russian (Cyrillic), lowercase, max 8 words.',
};

const PERSONAS = {
  gamer: { lang: 'hinglish', topics: ['ranked', 'ping', 'clutch', 'wifi lag'] },
  chill: { lang: 'english', topics: ['coffee', 'music', 'weather', 'sleep'] },
  dev: { lang: 'english', topics: ['api', 'deploy', 'bug', 'build'] },
  rus: { lang: 'russian', topics: ['катки', 'пинг', 'музыка', 'погода'] },
  hype: { lang: 'hinglish', topics: ['new update', 'drop', 'event'] },
};

const TEMPLATES = {
  hinglish: {
    open: ['yo', 'sup', 'koi hai', 'kya scene'],
    react: ['haan bhai', 'sahi hai', 'lol', 'nah', 'same'],
  },
  english: {
    open: ['hey', 'sup', 'anyone up', 'morning'],
    react: ['yeah', 'true', 'fr', 'nah', 'same'],
  },
  russian: {
    open: ['о, привет', 'кто тут', 'доброе утро', 'чё как'],
    react: ['ага', 'реально', 'лол', 'не', 'та же тема'],
  },
};

const FILLER = ['', '', ' lol', ' tbh', ' ngl'];

/** deterministic per-user persona (collision kam) */
function personaFor(userId) {
  const keys = Object.keys(PERSONAS);
  const n = Number(BigInt(userId) % BigInt(keys.length));
  return { name: keys[n], ...PERSONAS[keys[n]] };
}

function templateLine(persona, kind) {
  const bank = TEMPLATES[persona.lang][kind];
  const extra = Math.random() > 0.65 ? ` ${pick(persona.topics)}` : '';
  return (pick(bank) + extra + pick(FILLER)).trim();
}

function clientFor(token) {
  return axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: { authorization: token, 'user-agent': 'Mozilla/5.0' },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function post(session, channelId, content) {
  const api = clientFor(session.token);
  await api.post(`/channels/${channelId}/typing`).catch(() => null);
  await sleep(rnd(1500, 4500));
  const res = await api.post(`/channels/${channelId}/messages`, { content, tts: false });
  return res.status === 200;
}

/** ek message — return { ok, line } taaki reply threading chale */
async function say(userId, channelId, { replyTo = null, forceLang = null } = {}) {
  const record = onliner.sessionOf(userId);
  if (!record) return { ok: false };

  const persona = personaFor(userId);
  const lang = forceLang || persona.lang;

  let line = null;
  if (ai.available()) {
    const system = `You are a normal Discord user chatting in a server. ${LANG_RULES[lang]} No emojis spam, no quotes.`;
    const prompt = replyTo
      ? `Someone just said: "${replyTo}". Reply to it.`
      : `Start a short message about ${pick(persona.topics)}.`;
    line = await ai.complete(system, prompt);
  }
  if (!line) line = templateLine(persona, replyTo ? 'react' : 'open');

  const ok = await post(record, channelId, line);
  if (ok) logger.info(`[brain:${lang}] ${userId}: ${line}`);
  return { ok, line };
}

/** 2-4 online accounts ke beech real threaded conversation */
async function converse(channelId, turns = 4, lang = null) {
  const pool = stock.all().filter((e) => e.onlined).map((e) => e.userID);
  if (pool.length < 2) return { ok: false, reason: 'need_2_online' };

  const a = pick(pool);
  const b = pick(pool.filter((id) => id !== a));
  const useLang = lang || pick(LANGS);

  let lastLine = null;
  for (let i = 0; i < turns; i += 1) {
    const speaker = i % 2 === 0 ? a : b;
    const out = await say(speaker, channelId, { replyTo: lastLine, forceLang: useLang });
    if (out.ok) lastLine = out.line;
    await sleep(rnd(7000, 26000));
  }
  return { ok: true, lang: useLang, pair: [a, b] };
}

/** background organic chatter */
function startChatter(getChannels, { minMs = 5 * 60 * 1000, maxMs = 20 * 60 * 1000 } = {}) {
  const loop = async () => {
    try {
      const channels = getChannels();
      const online = stock.all().filter((e) => e.onlined);
      if (channels.length && online.length) {
        if (online.length > 1 && Math.random() > 0.6) await converse(pick(channels), rnd(2, 4));
        else await say(pick(online).userID, pick(channels));
      }
    } catch (error) {
      logger.error('chatter loop failed', error);
    }
    setTimeout(loop, rnd(minMs, maxMs));
  };
  setTimeout(loop, rnd(minMs, maxMs));
}

module.exports = { say, converse, startChatter, personaFor, LANGS };