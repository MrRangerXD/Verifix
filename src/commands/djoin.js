const { SlashCommandBuilder } = require('@discordjs/builders');
const { createEmbed } = require('../utils/embeds');
const config = require('../config');
const db = require('../database');
const { readAuthData } = require('../services/oauthService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('djoin')
    .setDescription('Add authenticated users to a server using stored tokens')
    .addStringOption((option) => option.setName('server').setDescription('Target server ID').setRequired(true)),
  async execute(interaction) {
    try {
      const serverId = interaction.options.getString('server');
      if (!serverId) {
        const embed = createEmbed({
          title: 'Missing Server ID',
          description: `Use /djoin <server_id> with a valid server ID.`,
          color: 0xed4245,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const plan = db.get(`plan_${interaction.user.id}`) || 'BRONZE';
      const usage = db.get(`usage_${interaction.user.id}`) || 0;
      const limit = config.PLAN_LIMITS[plan.toUpperCase()] || config.PLAN_LIMITS.BRONZE;
      const remaining = limit - usage;

      if (remaining <= 0) {
        const embed = createEmbed({
          title: 'Plan Limit Reached',
          description: `Your current plan is **${plan}** and you have reached the maximum of **${limit}** joins.`,
          color: 0xed4245,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const guild = interaction.client.guilds.cache.get(serverId);
      if (!guild) {
        const embed = createEmbed({
          title: 'Bot Not In Server',
          description: 'I am not currently in that server or the server ID is invalid.',
          color: 0xed4245,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const authData = readAuthData().filter((entry) => typeof entry.access_token === 'string' && entry.access_token.length > 10);
      if (authData.length === 0) {
        const embed = createEmbed({
          title: 'No Authenticated Users',
          description: 'There are no stored authenticated users to add to the server.',
          color: 0xed4245,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      let added = 0;
      let alreadyInServer = 0;
      let failed = 0;

      for (const entry of authData) {
        if (added >= remaining) break;

        const existingMember = await guild.members.fetch(entry.userID).catch(() => null);
        if (existingMember) {
          alreadyInServer += 1;
          continue;
        }

        const userResolvable = entry.userID;
        try {
          await guild.members.add(userResolvable, { accessToken: entry.access_token });
          added += 1;
        } catch (error) {
          failed += 1;
        }
      }

      if (added > 0) {
        db.set(`usage_${interaction.user.id}`, usage + added);
      }

      const embed = createEmbed({
        title: 'Djoin Result',
        description: `Server: **${guild.name}** (\`${guild.id}\`)
Plan: **${plan}**
Joined: **${added}**
Already in server: **${alreadyInServer}**
Failed: **${failed}**
Remaining plan slots: **${Math.max(0, remaining - added)}**`,
        color: added > 0 ? 0x43b581 : 0xed4245,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const embed = createEmbed({
        title: 'Execution Error',
        description: 'Something went wrong while adding users to the server.',
        color: 0xed4245,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
