const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger();

/** free tier models — order = fallback priority */
const DEFAULT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

const models = (process.env.AI_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
const POOL = models.length ? models : DEFAULT_MODELS;

const RPM = Number(process.env.AI_RPM || 18);
let windowStart = Date.now();
let used = 0;
let blockedUntil = 0;

function budgetLeft() {
  if (Date.now() < blockedUntil) return false;
  if (Date.now() - windowStart > 60000) {
    windowStart = Date.now();
    used = 0;
  }
  return used < RPM;
}

function consume() {
  used += 1;
}

/**
 * Ek short line generate karo. Fail hone pe null — caller template pe gir jaata hai.
 */
async function complete(system, user, { maxTokens = 48, temperature = 1.15 } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  if (!budgetLeft()) return null;

  for (const model of POOL) {
    consume();
    try {
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }, {
        headers: {
          authorization: `Bearer ${key}`,
          'HTTP-Referer': process.env.PUBLIC_URL || 'https://verifix.local',
          'X-Title': 'Verifix',
          'Content-Type': 'application/json',
        },
        timeout: 25000,
        validateStatus: () => true,
      });

      if (res.status === 429) {
        blockedUntil = Date.now() + 30000;
        continue;
      }
      if (res.status !== 200) continue;

      const text = res.data?.choices?.[0]?.message?.content?.trim();
      if (text) return text.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').slice(0, 180);
    } catch (error) {
      logger.warn(`[ai] ${model} failed: ${error.message}`);
    }
  }
  return null;
}

function available() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

module.exports = { complete, available, models: POOL };