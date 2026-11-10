const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const config = require('./src/config');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

for (const file of fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    if (!config.token || !config.clientId || !config.guildId) {
      console.error('Missing Discord configuration. Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in your .env file.');
      return;
    }

    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
})();
