const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const config = require('../config');
const { createLogger } = require('../utils/logger');
const { startSessionCleanup } = require('../services/oauthService');

const logger = createLogger();

function getSlashCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');

  for (const file of fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
    }
  }

  return commands;
}

async function registerSlashCommands(client) {
  if (!config.token || !config.clientId || !config.guildId) {
    logger.warn('Skipping slash command registration because DISCORD_TOKEN, CLIENT_ID, or GUILD_ID is missing.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const commands = getSlashCommands();

  if (!commands.length) {
    logger.warn('No slash commands were found to register.');
    return;
  }

  try {
    logger.info('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    logger.info('Slash commands registered successfully.');
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
  }
}

function registerReadyEvent(client) {
  client.on('ready', async () => {
    logger.info(`Verification Bot connected as ${client.user.tag}`);
    logger.info(`OAuth invite: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`);
    logger.info(`Prefix: ${config.prefix}`);
    await client.user.setPresence({
      activities: [{ name: `${config.prefix}help | /help`, type: 'PLAYING' }],
      status: 'Streaming',
    });

    console.log(chalk.green('========================================='));
    console.log(chalk.cyan('Verification Bot'));
    console.log(chalk.green('Version: 3.0.0'));
    console.log(chalk.green('Loaded Commands'));
    console.log(chalk.green('Loaded Events'));
    console.log(chalk.green('Bot Ready'));
    console.log(chalk.green('========================================='));

    await registerSlashCommands(client);
    startSessionCleanup();
  });
}

module.exports = { registerReadyEvent };
