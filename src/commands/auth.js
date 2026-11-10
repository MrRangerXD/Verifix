const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require('axios');
const { createEmbed } = require('../utils/embeds');
const { COLORS } = require('../constants');
const config = require('../config');
const db = require('../database');
const stock = require('../database/stock');
const { logStaffAction } = require('../utils/staffLogger');

async function exchange(code) {
  const res = await axios.post(config.tokenUrl, new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    scope: 'identify guilds.join',
    code,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
  return res.data;
}

async function fetchUser(token) {
  const res = await axios.get(config.userApiUrl, {
    headers: { authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
  return res.status === 200 ? res.data : null;
}

const helpEmbed = () => createEmbed({
  title: 'Authentication required',
  description: `**Open:** ${config.authLink}\n\n1. Authorize\n2. Code copy karo\n3. \`${config.prefix}auth <code>\`\n\nCode 10 min me expire hota hai.`,
  color: COLORS.info,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Authenticate so you can be pulled into servers')
    .addStringOption((o) => o.setName('code').setDescription('Code from the auth page').setRequired(false)),

  async execute(interaction) {
    const code = interaction.options.getString('code') || interaction.rawArgs?.[0];
    if (!code) return interaction.reply({ embeds: [helpEmbed()], ephemeral: true });

    if (code.length < 10) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Invalid code', description: 'Auth page se poora code copy karo.', color: COLORS.error })],
        ephemeral: true,
      });
    }

    try {
      const data = await exchange(code);
      if (!data?.access_token) {
        return interaction.reply({
          embeds: [createEmbed({ title: 'Auth failed', description: 'Code expire ho gaya ya galat hai. Dobara try karo.', color: COLORS.error })],
          ephemeral: true,
        });
      }

      const user = await fetchUser(data.access_token);
      if (!user) {
        return interaction.reply({
          embeds: [createEmbed({ title: 'Auth failed', description: 'Discord account read nahi ho paaya.', color: COLORS.error })],
          ephemeral: true,
        });
      }

      if (user.id !== interaction.user.id) {
        return interaction.reply({
          embeds: [createEmbed({ title: 'Wrong account', description: 'Ye code kisi aur account ka hai. Apne browser se karo.', color: COLORS.error })],
          ephemeral: true,
        });
      }

      const existed = stock.has(user.id);

      stock.add({
        userID: user.id,
        username: user.username,
        avatarURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : null,
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        addedBy: 'self',
      });

      db.set(`session_${user.id}`, { user_id: user.id, token: data.access_token, createdAt: Date.now() });
      db.set(`verified_${user.id}`, true);

      logStaffAction(interaction.client, existed ? 'Re-auth' : 'New auth',
        `**${user.username}** (<@${user.id}>) stock me ${existed ? 'refresh' : 'add'} hua.`, COLORS.success);

      const stats = stock.stats();
      return interaction.reply({
        embeds: [createEmbed({
          title: existed ? 'Stock refreshed' : 'Added to stock',
          description: `**${user.username}** pullable hai.\n\nStock ready: **${stats.ready}**`,
          color: COLORS.success,
        })],
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Auth error', description: error.message, color: COLORS.error })],
        ephemeral: true,
      });
    }
  },
};