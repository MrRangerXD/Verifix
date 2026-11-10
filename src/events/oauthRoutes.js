const express = require('express');
const bodyParser = require('body-parser');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const { readAuthData, exchangeCode, fetchDiscordUser, addAuthUser } = require('../services/oauthService');
const { parseVerificationState, getVerificationSetup, grantVerificationAccess, buildVerificationLink, getRedirectUrl } = require('../services/verificationService');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const logger = createLogger();
const router = express.Router();

router.use(bodyParser.text());

// OAuth routes - frontend handles UI/redirect at verificationbotv1

router.get('/allAuth', async (req, res) => {
  try {
    const data = readAuthData();
    res.json(data);
  } catch (error) {
    logger.error('Failed to read auth data', error);
    res.status(500).json({ error: 'Unable to read auth data.' });
  }
});

router.get('/verify', async (req, res) => {
  try {
    const state = req.query.state || req.query.verify;
    
    if (!state) {
      logger.warn('Verification attempted without state parameter');
      return res.status(400).send('❌ Invalid verification request. Missing state.');
    }
    
    const parsed = parseVerificationState(state);
    if (!parsed) {
      logger.warn('Failed to parse verification state');
      return res.status(400).send('❌ Invalid verification request. Corrupted state.');
    }
    
    const setup = getVerificationSetup(parsed.guildId);
    if (!setup) {
      logger.warn(`Verification attempted for unconfigured guild: ${parsed.guildId}`);
      return res.status(400).send('❌ This server has not set up verification yet.');
    }
    
    logger.info(`✅ Setup found for guild ${parsed.guildId}: roleId=${setup.roleId}, channelId=${setup.channelId}`);
    
    if (setup.token !== parsed.token) {
      logger.warn(`Invalid token for guild ${parsed.guildId}`);
      return res.status(400).send('❌ Verification token expired or invalid.');
    }

    const code = req.query.code;
    if (!code) {
      logger.info(`Redirecting to Discord OAuth for guild ${parsed.guildId}`);
      try {
        const authUrl = buildVerificationLink(parsed.guildId, parsed.channelId, parsed.token);
        return res.redirect(authUrl);
      } catch (error) {
        logger.error('Failed to build verification link', error);
        return res.status(500).send('❌ Configuration error. REDIRECT_URI is not set correctly.');
      }
    }

    const tokenData = await exchangeCode(code);
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const user = await fetchDiscordUser(accessToken);

    if (!user) {
      logger.error('Failed to fetch Discord user after OAuth exchange');
      return res.status(400).send('❌ Unable to verify your Discord account. Please try again.');
    }

    const guild = global.client?.guilds?.cache?.get(parsed.guildId);
    if (!guild) {
      logger.error(`Guild ${parsed.guildId} not found`);
      return res.status(400).send('❌ Guild not found. Make sure the bot is in the server.');
    }

    let member;
    try {
      member = guild.members.cache.get(user.id);
      if (!member) {
        member = await guild.members.fetch(user.id);
      }
    } catch (error) {
      logger.error(`Failed to fetch member ${user.id}:`, error);
      member = null;
    }

    if (!member) {
      logger.warn(`User ${user.id} attempted verification but not in guild ${parsed.guildId}`);
      return res.status(400).send('❌ You must be a member of the server to verify. Please join the server first!');
    }

    await addAuthUser({
      userID: user.id,
      avatarURL: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=4096`,
      username: `${user.username}#${user.discriminator}`,
      access_token: accessToken,
      refresh_token: refreshToken,
      plan: 'BRONZE',
    });

    const roleResult = await grantVerificationAccess(member, setup);
    if (!roleResult) {
      logger.warn(`Failed to assign verification role to user ${user.id} in guild ${parsed.guildId}`);
    }

    logger.info(`User ${user.id} verified successfully for guild ${parsed.guildId}`);

    const redirectUrl = getRedirectUrl();
    if (redirectUrl) {
      return res.redirect(redirectUrl);
    }

    return res.status(200).send(`<html><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>✅ Verification Complete!</h1><p>Welcome <strong>${user.username}</strong>!</p><p>You now have full access to <strong>${guild.name}</strong>.</p><p><a href="https://discord.com/channels/${guild.id}" style="padding: 10px 20px; background: #5865F2; color: white; text-decoration: none; border-radius: 5px;">Go to Server</a></p></body></html>`);
  } catch (error) {
    logger.error('Verification callback failed', error);
    return res.status(500).send('Verification failed.');
  }
});

router.post('/', async (req, res) => {
  try {
    const code = req.body;
    if (!code) {
      return res.status(400).send('Missing authorization code.');
    }

    const tokenData = await exchangeCode(code);
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    const user = await fetchDiscordUser(accessToken);
    const avatarHash = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=4096`;

    const result = await addAuthUser({
      userID: user.id,
      avatarURL: avatarHash,
      username: `${user.username}#${user.discriminator}`,
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (result.created && config.webhookUrl) {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_url: '',
          embeds: [{
            color: 0x2f3136,
            title: `${user.username}#${user.discriminator} - ${user.id}`,
            thumbnail: { url: avatarHash },
            description: `\`\`\`diff\n- New User\n\n- Pseudo: ${user.username}#${user.discriminator}\n\n- ID: ${user.id}\n\`\`\``,
          }],
        }),
      });
    }

    if (result.created) {
      logger.info(`New auth user registered: ${user.username}#${user.discriminator}`);
    } else {
      logger.info(`Auth user already exists: ${user.username}#${user.discriminator}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('OAuth exchange failed', error);
    res.status(500).send('OAuth exchange failed.');
  }
});

module.exports = router;
