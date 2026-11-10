const { Client, Collection, Intents } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const { createLogger } = require('./utils/logger');
const { registerReadyEvent } = require('./events/ready');
const { registerMessageCreateEvent } = require('./events/messageCreate');
const { registerInteractionCreateEvent } = require('./events/interactionCreate');
const oauthRoutes = require('./events/oauthRoutes');
const db = require('./database');
const stock = require('./database/stock');
const health = require('./services/tokenHealth');
const onliner = require('./services/onliner');
const brain = require('./services/brain');

const logger = createLogger();

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});
client.commands = new Collection();
global.client = client;
const app = express();

app.use(express.json());
app.use('/', oauthRoutes);

// FIX: database.json aur backups HTTP pe leak ho rahe the (saare tokens plaintext)
const HIDDEN_PATHS = new Set(['/database.json', '/package.json', '/package-lock.json']);
app.use((req, res, next) => {
  if (HIDDEN_PATHS.has(req.path) || req.path.startsWith('/backups/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  return next();
});

// Serve static files (CSS, JS, images, etc.) from root directory
app.use(express.static(path.join(__dirname, '..')));

// 404 error handler for any unmatched routes
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

// FIX: loader sirf data.name uthata tha, isliye business.js ke buy/wallet/redeem/myplan
// aur admin_plan.js ke subcommands kabhi register nahi hote the.
// Ab ek file se multiple commands export ho sakti hain.
function isCommand(value) {
  return Boolean(value && value.data && typeof value.data.name === 'string' && typeof value.execute === 'function');
}

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js')).sort()) {
  let mod;
  try {
    mod = require(path.join(commandsPath, file));
  } catch (error) {
    logger.error(`Failed to load command ${file}`, error);
    continue;
  }

  const candidates = [];
  if (isCommand(mod)) candidates.push(mod);
  for (const [key, value] of Object.entries(mod || {})) {
    if (key === 'data' || key === 'execute') continue;
    if (isCommand(value)) candidates.push(value);
  }

  if (!candidates.length) {
    logger.warn(`No command exported by ${file} — skipped`);
    continue;
  }

  for (const command of candidates) {
    const name = command.data.name;
    if (client.commands.has(name)) {
      logger.warn(`Command "${name}" redefined by ${file} (was ${client.commands.get(name).__file})`);
    }
    command.__file = file;
    client.commands.set(name, command);
  }
}

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (!event || !event.name) continue;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

registerReadyEvent(client);
registerMessageCreateEvent(client);
registerInteractionCreateEvent(client);

// Global error handlers to prevent crashes
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
});

client.on('error', (error) => {
  logger.error('Discord Client Error', error);
});

client.on('shardError', (error) => {
  logger.error('Shard Error', error);
});

if (!config.token) {
  logger.warn('DISCORD_TOKEN was not provided. Add it to your .env file to connect the bot to Discord.');
  process.exit(1);
} else {
  client.login(config.token).catch((error) => {
    logger.error('Failed to log in to Discord', error);
    process.exit(1);
  });
}

const host = process.env.HOST || '0.0.0.0';
const port = Number.isNaN(config.port) ? 3000 : config.port;

const server = app.listen(port, host, () => {
  logger.info(`HTTP server listening on ${host}:${port}`);
});

health.startHeartbeat(logger);
onliner.startTokenRotation();

const brainChannels = () => (process.env.BRAIN_CHANNELS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (brainChannels().length) {
  brain.startChatter(brainChannels);
}

// restore online tokens after restart
setTimeout(async () => {
  const limit = Number(process.env.ONLINE_ON_BOOT || 0);
  if (limit > 0) await onliner.startMany(limit);
}, 8000);

// FIX: db/index.js apna SIGINT/SIGTERM handler rakhta hai jo turant process.exit karta hai,
// isliye neeche wale shutdown handlers kabhi chalte hi nahi the aur pending writes flush nahi hote the.
// prependListener se hum pehle chalte hain.
function shutdown(signal) {
  logger.info(`${signal} signal received: closing HTTP server`);
  try {
    onliner.stopAll();
  } catch (error) {
    logger.error('onliner stopAll failed', error);
  }
  server.close(() => {
    logger.info('HTTP server closed');
    try {
      db.flush();
    } catch (error) {
      logger.error('db flush failed', error);
    }
    client.destroy();
    process.exit(0);
  });
}

process.prependListener('SIGTERM', () => shutdown('SIGTERM'));
process.prependListener('SIGINT', () => shutdown('SIGINT'));