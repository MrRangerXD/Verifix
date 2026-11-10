const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const { addAuthUser } = require('../services/oauthService');
const verify = require('../services/verificationService');

const logger = createLogger();
const router = express.Router();

router.use(bodyParser.text({ type: '*/*' }));

async function exchange(code, redirectUri) {
  const res = await axios.post(config.tokenUrl, new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
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

router.get('/allAuth', (req, res) => {
  res.json(require('../database/stock').all().map(({ access_token, refresh_token, ...rest }) => rest));
});

router.get('/verify', async (req, res) => {
  const parsed = verify.parseState(req.query.state);
  if (!parsed) return res.status(400).send('Invalid or expired verification link.');

  const setup = verify.getSetup(parsed.guildId);
  if (!setup || setup.token !== parsed.token) {
    return res.status(400).send('This server has no valid verification setup.');
  }

  if (!req.query.code) {
    return res.redirect(verify.buildVerificationLink(parsed.guildId, parsed.channelId, parsed.token));
  }

  try {
    const data = await exchange(req.query.code, verify.callbackUri());
    if (!data.access_token) return res.status(400).send('OAuth exchange failed.');

    const user = await fetchUser(data.access_token);
    if (!user) return res.status(400).send('Could not read your Discord account.');

    const guild = global.client?.guilds?.cache?.get(parsed.guildId);
    if (!guild) return res.status(400).send('Bot is not in that server.');

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return res.status(400).send('Join the server first, then verify.');

    addAuthUser({
      userID: user.id,
      username: user.username,
      avatarURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : null,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      addedBy: 'verify',
    });

    await verify.grantRole(member, setup);
    logger.info(`verified ${user.id} in ${guild.id}`);

    return res.send(`<h2>Verified — welcome ${user.username}</h2>`);
  } catch (error) {
    logger.error('verify failed', error);
    return res.status(500).send('Verification failed.');
  }
});

/** legacy raw-code endpoint — body ab text hai, object nahi */
router.post('/', async (req, res) => {
  const code = typeof req.body === 'string' ? req.body.trim() : req.body?.code;
  if (!code) return res.status(400).send('Missing code.');

  try {
    const data = await exchange(code, config.redirectUri);
    const user = data.access_token ? await fetchUser(data.access_token) : null;
    if (!user) return res.status(400).send('Exchange failed.');

    addAuthUser({
      userID: user.id,
      username: user.username,
      avatarURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : null,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      addedBy: 'web',
    });
    return res.status(200).send('OK');
  } catch (error) {
    logger.error('legacy auth failed', error);
    return res.status(500).send('Failed.');
  }
});

module.exports = router;