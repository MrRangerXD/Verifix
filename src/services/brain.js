const axios = require('axios');
const onliner = require('./onliner');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Persona pool — har token ko ek persona milta hai.
 * Yahan aap apne hisaab se lines add karo.
 */
const PERSONAS = [
  { name: 'gamer', open: ['yo', 'sup', 'anyone up', 'gg'], react: ['lol', 'fr', 'same', 'nah', 'bro'], topics: ['ranked', 'ping', 'clutch', 'wifi'] },
  { name: 'chill', open: ['hey', 'morning', 'just woke up', 'whats good'], react: ['yeah', 'true', 'hmm', 'okay'], topics: ['coffee', 'music', 'weather', 'sleep'] },
  { name: 'hype', open: ['LESGO', 'lets gooo', 'finally'], react: ['W', 'no way', 'yooo'], topics: ['new update', 'drop', 'event'] },
  { name: 'dev', open: ['anyone coding tonight', 'debugging again'], react: ['real', 'rip', 'skill issue'], topics: ['api', 'deploy', 'bug', 'build'] },
];

const FILLER = ['', '', ' lol', ' tbh', ' ngl', ' fr'];

function templateLine(persona, kind) {
  const bank = kind === 'open' ? persona.open : persona.react;
  const base = pick(bank);
  const extra = Math.random() > 0.6 ? ` ${pick(persona.topics)}` : '';
  return (base + extra + pick(FILLER)).trim();
}

async function llmLine(prompt) {
  const url = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  if (!url || !key) return null;
  try {
    const res = await axios.post(`${url}/chat/completions`, {
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      max_tokens: 40,
      temperature: 1.1,
      messages: [
        { role: 'system', content: 'You are a casual Discord user. Reply with ONE short lowercase line, max 10 words. No quotes, no emojis spam.' },
        { role: 'user', content: prompt },
      ],
    }, { headers: { authorization: `Bearer ${key}` }, timeout: 20000 });
    const text = res.data?.choices?.[0]?.message?.content?.trim();
    return text ? text.replace(/^"|"$/g, '') : null;
  } catch {
    return null;
  }
}

async function send(session, channelId, content) {
  const api = axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: { authorization: session.token, 'user-agent': 'Mozilla/5.0' },
    timeout: 15000,
    validateStatus: () => true,
  });
  await api.post(`/channels/${channelId}/typing`).catch(() => null);
  await sleep(rnd(1200, 4000)); // typing gap = insaan
  const res = await api.post(`/channels/${channelId}/messages`, { content, tts: false });
  return res.status === 200;
}

function personaFor(userId) {
  const idx = [...userId].reduce((a, c) => a + c.charCodeAt(0), 0) % PERSONAS.length;
  return PERSONAS[idx];
}

/** ek token ka single message */
async function say(userId, channelId, { replyTo = null } = {}) {
  const record = onliner.sessionOf(userId);
  if (!record) return false;
  const persona = personaFor(userId);

  let line;
  if (replyTo) {
    line = (await llmLine(`Someone said: "${replyTo}". Reply briefly.`)) || templateLine(persona, 'react');
  } else {
    line = (await llmLine(`Start a short casual message about ${pick(persona.topics)}.`)) || templateLine(persona, 'open');
  }

  const ok = await send(record, channelId, line);
  if (ok) logger.info(`[brain] ${persona.name}(${userId}): ${line}`);
  return ok;
}

/** do accounts ke beech N turn ki conversation */
async function converse(channelId, turns = 4) {
  const pool = [...new Set([...require('../database/stock').all().filter((e) => e.onlined).map((e) => e.userID)])];
  if (pool.length < 2) return { ok: false, reason: 'need_2_online' };

  let a = pick(pool);
  let b = pick(pool.filter((id) => id !== a));
  let lastLine = null;

  for (let i = 0; i < turns; i += 1) {
    const speaker = i % 2 === 0 ? a : b;
    const ok = await say(speaker, channelId, { replyTo: lastLine });
    if (ok) lastLine = null;
    await sleep(rnd(8000, 40000));
  }
  return { ok: true, pair: [a, b] };
}

/** random organic chatter — background loop */
function startChatter(getChannels, { minMs = 4 * 60 * 1000, maxMs = 18 * 60 * 1000 } = {}) {
  const loop = async () => {
    const channels = getChannels();
    const online = require('../database/stock').all().filter((e) => e.onlined);
    if (channels.length && online.length) {
      const userId = pick(online.map((e) => e.userID));
      if (Math.random() > 0.7 && online.length > 1) await converse(pick(channels), rnd(2, 4));
      else await say(userId, pick(channels));
    }
    setTimeout(loop, rnd(minMs, maxMs));
  };
  setTimeout(loop, rnd(minMs, maxMs));
}

module.exports = { say, converse, startChatter, PERSONAS };