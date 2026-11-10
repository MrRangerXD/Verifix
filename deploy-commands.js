require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('DISCORD_TOKEN and CLIENT_ID required');
  process.exit(1);
}

const dir = path.join(__dirname, 'src', 'commands');
const body = [];

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const mod = require(path.join(dir, file));
  const values = Object.entries(mod)
    .filter(([k]) => k !== 'data' && k !== 'execute')
    .map(([, v]) => v);

  for (const value of [mod, ...values]) {
    if (value?.data?.name && typeof value.execute === 'function') body.push(value.data.toJSON());
  }
}

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body });
  console.log(`Deployed ${body.length} commands${guildId ? ` to ${guildId}` : ' globally'}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});