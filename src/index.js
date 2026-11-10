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

// Serve static files (CSS, JS, images, etc.) from root directory
app.use(express.static(path.join(__dirname, '..')));

// 404 error handler for any unmatched routes
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.data.name) {
    client.commands.set(command.data.name, command);
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

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});
