const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const config = require('../config');
const stock = require('../database/stock');
const { createLogger } = require('../utils/logger');

const logger = createLogger();

function collectCommands() {
  const dir = path.join(__dirname, '..', 'commands');
  const body = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = require(path.join(dir, file));
    const nested = Object.entries(mod)
      .filter(([k]) => k !== 'data' && k !== 'execute')
      .map(([, v]) => v);

    for (const value of [mod, ...nested]) {
      if (value?.data?.name && typeof value.execute === 'function') body.push(value.data.toJSON());
    }
  }
  return body;
}

async function registerSlashCommands() {
  if (!config.token || !config.clientId) return;

  const body = collectCommands();
  if (!body.length) return logger.warn('No slash commands to register.');

  const rest = new REST({ version: '9' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  try {
    await rest.put(route, { body });
    logger.info(`Registered ${body.length} slash commands${config.guildId ? ` to ${config.guildId}` : ''}.`);
  } catch (error) {
    logger.error('Slash registration failed', error);
  }
}

function registerReadyEvent(client) {
  client.once('ready', async () => {
    logger.info(`Connected as ${client.user.tag} — ${client.guilds.cache.size} guilds`);

    const applyPresence = () => {
      client.user.setPresence({
        status: 'online',
        activities: [{ name: `${config.prefix}help · ${stock.stats().ready} in stock`, type: 'WATCHING' }],
      });
    };

    applyPresence();
    setInterval(applyPresence, 5 * 60 * 1000).unref();

    console.log(chalk.green('========================================='));
    console.log(chalk.cyan('VerifiX'));
    console.log(chalk.green('Bot Ready'));
    console.log(chalk.green('========================================='));

    await registerSlashCommands();
  });
}

module.exports = { registerReadyEvent };