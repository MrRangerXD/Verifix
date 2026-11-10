const { readAuthData, exchangeCode, fetchDiscordUser, addAuthUser, getReadyTokens, refreshSessionUsage, refreshAccessToken } = require('../services/oauthService');
const { createEmbed } = require('../utils/embeds');
const { COLORS, EMOJIS, MESSAGES } = require('../constants');
const config = require('../config');
const { buildUserLabel } = require('../utils/helpers');
const { createLogger } = require('../utils/logger');
const { logStaffAction } = require('../utils/staffLogger');

const OWNER_ID = '1408851223834132564';
const logger = createLogger();

function isValidAuthCode(token) {
  return typeof token === 'string' && token.length > 10;
}

function isOwner(userId) {
  return config.owners.includes(userId) || userId === OWNER_ID;
}

function isAdmin(ctx) {
  if (isOwner(ctx.author.id)) return true;
  if (config.adminRoleId && ctx.member?.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}

async function sendCommandReply(ctx, payload) {
  if (typeof ctx.reply === 'function') {
    return ctx.reply(payload);
  }
  if (ctx.channel?.send) {
    return ctx.channel.send(payload);
  }
  return null;
}

function getPlanRunLimit(plan) {
  const normalized = plan?.toUpperCase();
  if (normalized === 'BRONZE') {
    return Math.floor(Math.random() * (3 - 2 + 1)) + 2; // 2-3
  }
  if (normalized === 'SILVER') {
    return Math.floor(Math.random() * (10 - 9 + 1)) + 9; // 9-10
  }
  if (normalized === 'GOLD') {
    return Math.floor(Math.random() * (20 - 17 + 1)) + 17; // 17-20
  }
  return Number.MAX_SAFE_INTEGER; // Platinum/Diamond can pull any allowed tokens
}

async function handleGetTokenCommand(ctx) {
  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.join} AUTHENTICATION REQUIRED`,
    description: `${EMOJIS.info} **Codes expire in 10 minutes!** Complete quickly.\n\n${EMOJIS.join} **[CLICK HERE TO AUTHENTICATE](${config.authLink})**\n\n**Steps:**\n1. Click the link above\n2. Authorize the application\n3. IMMEDIATELY copy the code\n4. Use \`${config.prefix}auth YOUR_CODE_HERE\`\n\n${EMOJIS.fail} **DO NOT share your code with anyone!**`,
    color: COLORS.info,
  })] });
}

async function handleAuthCommand(ctx, args, client, db) {
  const token = args[0];
  if (!token) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.join} AUTHENTICATION REQUIRED`,
      description: `${EMOJIS.info} **Codes expire in 10 minutes!** Complete quickly.\n\n${EMOJIS.join} **[CLICK HERE TO AUTHENTICATE](${config.authLink})**\n\n**Steps:**\n1. Click the link above\n2. Authorize the application\n3. IMMEDIATELY copy the code\n4. Use \`${config.prefix}auth YOUR_CODE_HERE\`\n\n${EMOJIS.fail} **DO NOT share your code with anyone!**`,
      color: COLORS.info,
    })] });
  }

  if (!isValidAuthCode(token)) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.fail} INVALID CODE`,
      description: `${EMOJIS.info} The code you provided looks invalid.\n\nPlease make sure you copied it from the web verification page.`,
      color: COLORS.error,
    })] });
  }

  try {
    const tokenData = await exchangeCode(token);
    if (!tokenData || tokenData.error || !tokenData.access_token) {
      logger.error('OAuth code exchange failed', tokenData);
      return ctx.channel.send({ embeds: [createEmbed({
        title: `${EMOJIS.fail} AUTHENTICATION FAILED`,
        description: `${EMOJIS.info} Unable to exchange the code.\n\nPlease make sure you are using the code shown after authorization.`,
        color: COLORS.error,
      })] });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const user = await fetchDiscordUser(accessToken);
    if (!user) {
      return ctx.channel.send({ embeds: [createEmbed({
        title: `${EMOJIS.fail} AUTHENTICATION FAILED`,
        description: `${EMOJIS.info} Could not fetch Discord user information from the provided code.`,
        color: COLORS.error,
      })] });
    }

    if (user.id !== ctx.author.id) {
      return ctx.channel.send({ embeds: [createEmbed({
        title: `${EMOJIS.fail} WRONG USER`,
        description: `${EMOJIS.info} The authorization code does not belong to your Discord account.\n\nUse the code from your own browser session.`,
        color: COLORS.error,
      })] });
    }

    await addAuthUser({
      userID: user.id,
      avatarURL: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=4096`,
      username: `${user.username}#${user.discriminator}`,
      access_token: accessToken,
      refresh_token: refreshToken,
      plan: db.get(`plan_${ctx.author.id}`) || 'BRONZE',
    });

    const plan = db.get(`plan_${ctx.author.id}`) || 'BRONZE';
    const session = {
      user_id: ctx.author.id,
      plan,
      expiry_time: Date.now() + 600000,
      token,
    };
    db.set(`session_${ctx.author.id}`, session);
    db.set(`verified_${ctx.author.id}`, true);

    await logStaffAction(client, 'User Authenticated', `**${user.username}#${user.discriminator}** (<@${user.id}>) has authenticated successfully.`, COLORS.success);

    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.join} ✅ AUTHENTICATION SUCCESSFUL`,
      description: `${EMOJIS.info} **Welcome ${ctx.author.username}!**\n\nYou are now authenticated and ready to join servers!\n\n📝 **Next Step:**\n\`${config.prefix}djoin <server_id>\`\n\n${EMOJIS.info} The bot will only add you to servers it is currently in.`,
      color: COLORS.success,
    })] });
  } catch (error) {
    logger.error('Auth command failed', error);
    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.fail} AUTHENTICATION ERROR`,
      description: `${EMOJIS.info} Something went wrong while authenticating your code.`,
      color: COLORS.error,
    })] });
  }
}

async function handleDjoinCommand(ctx, args, client, db) {
  const serverId = args[0];
  if (!serverId) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'Missing Server ID',
      description: `Use \`${config.prefix}djoin <server_id>\` with a valid server ID.\n\n**Example:** \`${config.prefix}djoin 1234567890\``,
      color: COLORS.info,
    })] });
  }

  // Send initial "processing" message
  const processingMsg = await ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.info} Processing...`,
    description: `Attempting to add you to the server...`,
    color: COLORS.primary,
  })] }).catch(() => null);

  const session = db.get(`session_${ctx.author.id}`);
  const assignedPlan = db.get(`plan_${ctx.author.id}`) || session?.plan || 'BRONZE';
  if (session) {
    session.plan = assignedPlan;
    db.set(`session_${ctx.author.id}`, session);
  }

  if (!session) {
    if (processingMsg) await processingMsg.delete().catch(() => null);
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'No Authentication Session',
      description: `No active session was found. Run ${config.prefix}auth <code> to authenticate and store your token permanently.`,
      color: COLORS.error,
    })] });
  }

  if (!client.guilds.cache.has(serverId)) {
    if (processingMsg) await processingMsg.delete().catch(() => null);
    const addBotChannelLabel = config.addBotChannelId ? `<#${config.addBotChannelId}>` : '#add-bot';
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'Bot Not In Server',
      description: `I am not currently in that server. Please add the bot to that server first by going to ${addBotChannelLabel}, then try again.`,
      color: COLORS.error,
    })] });
  }

  const guild = client.guilds.cache.get(serverId);
  if (!guild) {
    if (processingMsg) await processingMsg.delete().catch(() => null);
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'Invalid Server',
      description: 'The server ID is invalid or I cannot access it.',
      color: COLORS.error,
    })] });
  }

  const plan = db.get(`plan_${ctx.author.id}`) || 'BRONZE';
  const usage = db.get(`usage_${ctx.author.id}`) || 0;
  const limit = config.PLAN_LIMITS[plan?.toUpperCase()] || config.PLAN_LIMITS.BRONZE;
  const remaining = limit - usage;
  const runLimit = getPlanRunLimit(plan);
  const maxPull = Math.min(remaining, runLimit);

  if (remaining <= 0) {
    if (processingMsg) await processingMsg.delete().catch(() => null);
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'Plan Limit Reached',
      description: `Your current plan is **${plan}** and you have reached the maximum of **${limit}** joins.`,
      color: COLORS.error,
    })] });
  }

  const readyTokens = getReadyTokens();
  if (readyTokens.length === 0) {
    if (processingMsg) await processingMsg.delete().catch(() => null);
    await logStaffAction(client, 'Djoin Failed', `**<@${ctx.author.id}>** attempted djoin for **${guild.name}** (\`${guild.id}\`) but no ready tokens were available.`, COLORS.error);
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'No Ready Tokens',
      description: 'There are no valid ready tokens available right now. Ask users to authenticate again.',
      color: COLORS.error,
    })] });
  }

  if (processingMsg) {
    await processingMsg.edit({ embeds: [createEmbed({
      title: `${EMOJIS.info} Adding Users...`,
      description: `Adding authenticated users to **${guild.name}**. This may take a moment...`,
      color: COLORS.primary,
    })] }).catch(() => null);
  }

  let added = 0;
  let alreadyInServer = 0;
  let failed = 0;
  let attempted = 0;

  for (const entry of readyTokens) {
    if (attempted >= maxPull) break;
    attempted += 1;

    const existingMember = await guild.members.fetch(entry.userID).catch(() => null);
    if (existingMember) {
      alreadyInServer += 1;
      continue;
    }

    try {
      let tokenToUse = entry.access_token;
      if (entry.refresh_token) {
        const refreshed = await refreshAccessToken(entry.userID);
        if (refreshed && refreshed.access_token) {
          tokenToUse = refreshed.access_token;
        }
      }

      await guild.members.add(entry.userID, { accessToken: tokenToUse });
      added += 1;
      refreshSessionUsage(entry.userID);
    } catch (joinError) {
      logger.error('Djoin batch join failed', joinError);
      failed += 1;
    }
  }

  if (added > 0) {
    db.set(`usage_${ctx.author.id}`, usage + added);
  }

  await logStaffAction(client, 'Djoin Attempt', `**<@${ctx.author.id}>** attempted djoin for **${guild.name}** (\`${guild.id}\`).\n• Plan: **${plan}**\n• Allowed: **${remaining}**\n• Run limit: **${runLimit}**\n• Pulled: **${maxPull}**\n• Attempted: **${attempted}**\n• Added: **${added}**\n• Already in server: **${alreadyInServer}**\n• Failed: **${failed}**`, added > 0 ? COLORS.success : COLORS.error);

  const finalEmbed = createEmbed({
    title: added > 0 ? `${EMOJIS.join} ✅ Users Added` : `${EMOJIS.fail} ❌ No Users Added`,
    description: `Server: **${guild.name}** (\`${guild.id}\`)
Plan: **${plan}**
Plan limit: **${limit}**
Added: **${added}**
Already in server: **${alreadyInServer}**
Failed: **${failed}**
Remaining plan slots: **${Math.max(0, remaining - added)}**`,
    color: added > 0 ? COLORS.success : COLORS.error,
    footerText: `Command used by ${ctx.author.tag}`,
  });

  if (processingMsg) {
    await processingMsg.edit({ embeds: [finalEmbed] }).catch(() => null);
  } else {
    await ctx.channel.send({ embeds: [finalEmbed] }).catch(() => null);
  }
  return;
}

async function handleInviteCommand(ctx, client) {
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.users} BOT INVITE LINK`,
    description: `Use this link to add the bot to any server:\n\n${EMOJIS.join} **[CLICK HERE TO INVITE BOT](${inviteUrl})**`,
    color: COLORS.primary,
    footerText: 'VerifiX Bot - Invite Link',
  })] });
}

async function handleServersCommand(ctx, client) {
  const guilds = client.guilds.cache;
  const guildList = Array.from(guilds.values())
    .map((g, i) => `${i + 1}. **${g.name}** (\`${g.id}\`) - **${g.memberCount}** members`)
    .slice(0, 25)
    .join('\n');

  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.users} BOT SERVERS`,
    description: `Total: **${guilds.size}** servers`,
    color: COLORS.primary,
    fields: [
      {
        name: `${EMOJIS.info} Server List`,
        value: guildList || 'No servers found',
        inline: false,
      },
    ],
    footerText: 'VerifiX Bot - Server List',
  })] });
}

async function handlePingCommand(ctx, client) {
  const clientPing = client.ws.ping;
  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.info} PING`,
    description: `🏓 **Bot Ping:** \`${clientPing}ms\`\n\n${clientPing < 100 ? '✅ Excellent' : clientPing < 200 ? '⚠️ Good' : '❌ High latency'}`,
    color: clientPing < 100 ? COLORS.success : clientPing < 200 ? COLORS.warning : COLORS.error,
    footerText: 'VerifiX Bot - Latency Check',
  })] });
}

async function handleStatsCommand(ctx, client) {
  const authData = readAuthData();
  const serverCount = client.guilds.cache.size;
  const userCount = client.users.cache.size;
  const uptime = Math.floor(client.uptime / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.info} BOT STATISTICS`,
    color: COLORS.primary,
    fields: [
      { name: `${EMOJIS.users} Servers`, value: `\`${serverCount}\``, inline: true },
      { name: `👥 Users Cached`, value: `\`${userCount}\``, inline: true },
      { name: `🔐 Authenticated Users`, value: `\`${authData.length}\``, inline: true },
      { name: `⏱️ Uptime`, value: `\`${uptimeStr}\``, inline: true },
      { name: `💾 Memory Usage`, value: `\`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``, inline: true },
      { name: `🔴 Ping`, value: `\`${client.ws.ping}ms\``, inline: true },
    ],
    footerText: 'VerifiX Bot - Statistics',
  })] });
}

async function handleUserInfoCommand(ctx, args, client) {
  const target = args[0] && !Number.isNaN(Number(args[0]))
    ? await client.users.fetch(args[0]).catch(() => undefined)
    : ctx.mentions.users.first();

  if (!target) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'User Not Found',
      description: 'Mention a user or provide a valid user ID.',
      color: COLORS.error,
    })] });
  }

  const authData = readAuthData();
  const authEntry = authData.find((entry) => entry.userID === target.id);
  if (!authEntry) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: 'User Not Authenticated',
      description: `User \`${target.tag}\` is not authenticated.`,
      color: COLORS.error,
    })] });
  }

  const knownGuilds = client.guilds.cache.filter(guild => guild.members.cache.has(target.id));
  const guildNames = Array.from(knownGuilds.values())
    .slice(0, 10)
    .map(g => `• **${g.name}** (\`${g.id}\`)`)
    .join('\n') || 'None';

  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.users} USER INFORMATION`,
    description: `User: **${authEntry.username}** (\`${target.id}\`)`,
    color: COLORS.primary,
    fields: [
      { name: 'Discord Tag', value: `\`${target.tag}\``, inline: true },
      { name: 'User ID', value: `\`${target.id}\``, inline: true },
      { name: 'Plan', value: `\`${db.get(`plan_${target.id}`) || 'BRONZE'}\``, inline: true },
      { name: 'Authenticated', value: `\`${new Date(authEntry.created_at || Date.now()).toLocaleDateString()}\``, inline: true },
      { name: 'Known Servers', value: `\`${knownGuilds.size}\``, inline: true },
      { name: 'Servers', value: guildNames, inline: false },
    ],
    image: authEntry.avatarURL,
    footerText: 'VerifiX Bot - User Information',
  })] });
}

async function handleWhitelistCommand(ctx, args, client, db) {
  if (!isAdmin(ctx)) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.fail} ACCESS DENIED`,
      description: 'Only admins can use this command.',
      color: COLORS.error,
    })] });
  }

  const subcommand = args[0];
  if (!subcommand) return;

  if (subcommand === 'add') {
    const user = args[1] && !Number.isNaN(Number(args[1]))
      ? await client.users.fetch(args[1]).catch(() => undefined)
      : ctx.mentions.users.first();

    if (!user) {
      return ctx.channel.send({ embeds: [createEmbed({ description: 'Please provide a valid user.', color: COLORS.error })] });
    }

    if (db.get(`wl_${user.id}`) === null) {
      db.set(`wl_${user.id}`, true);
      return ctx.channel.send({ embeds: [createEmbed({ description: `**${buildUserLabel(user)}** has been added to the whitelist`, color: COLORS.success })] });
    }

    return ctx.channel.send({ embeds: [createEmbed({ description: `**${buildUserLabel(user)}** is already whitelist`, color: COLORS.info })] });
  }

  if (subcommand === 'remove') {
    const user = args[1] && !Number.isNaN(Number(args[1]))
      ? await client.users.fetch(args[1]).catch(() => undefined)
      : ctx.mentions.users.first();

    if (!user) {
      return ctx.channel.send({ embeds: [createEmbed({ description: 'Please provide a valid user.', color: COLORS.error })] });
    }

    if (db.get(`wl_${user.id}`) !== null) {
      db.delete(`wl_${user.id}`);
      return ctx.channel.send({ embeds: [createEmbed({ description: `**${buildUserLabel(user)}** has been removed from the whitelist`, color: COLORS.success })] });
    }

    return ctx.channel.send({ embeds: [createEmbed({ description: `**${buildUserLabel(user)}** was not whitelist`, color: COLORS.info })] });
  }

  if (subcommand === 'list') {
    const whitelistEntries = db.all().filter((data) => data.ID.startsWith('wl_')).sort((a, b) => b.data - a.data);
    const content = whitelistEntries.map((entry, index) => {
      const userId = entry.ID.split('_')[1];
      const user = client.users.cache.get(userId);
      if (!user) return null;
      return `\`${index + 1}\` ${user.tag} (\`${user.id}\`)`;
    }).filter(Boolean).join('\n');

    return ctx.channel.send({ embeds: [createEmbed({ title: 'Whitelisted Users', description: content || 'No whitelisted users found.', color: COLORS.info })] });
  }
}

async function handleHelpCommand(ctx, client, db) {
  const slashCommands = Array.from(client.commands.keys()).map((name) => `/${name}`).join(', ');

  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.users} BOT COMMAND MENU`,
    description: `**Authentication**\n${EMOJIS.join} \`${config.prefix}get_token\` - Get authentication token\n${EMOJIS.join} \`${config.prefix}auth <code>\` - Authenticate with code\n${EMOJIS.join} \`${config.prefix}djoin <server_id>\` - Join a server\n\n**Joining & Server**\n${EMOJIS.join} \`${config.prefix}links\` - Show OAuth and bot invite links\n${EMOJIS.join} \`${config.prefix}joinall\` - Add all stored users to this server (admin only)\n${EMOJIS.join} \`${config.prefix}servers\` - List bot servers\n${EMOJIS.join} \`${config.prefix}server_age <server_id>\` - Check server age\n\n**User Management**\n${EMOJIS.join} \`${config.prefix}users\` - Show authenticated user count (admin only)\n${EMOJIS.join} \`${config.prefix}wl <add/remove/list>\` - Manage whitelist (admin only)\n${EMOJIS.join} \`${config.prefix}user_info <user_id|mention>\` - Show user info\n${EMOJIS.join} \`${config.prefix}check_tokens\` - Check token validity\n${EMOJIS.join} \`${config.prefix}list_users\` - List authenticated users\n\n**Utility**\n${EMOJIS.join} \`${config.prefix}invite\` - Get bot invite link\n${EMOJIS.join} \`${config.prefix}ping\` - Check bot latency\n${EMOJIS.join} \`${config.prefix}stats\` - Show bot statistics\n${EMOJIS.join} \`${config.prefix}help\` - Show this help menu\n\n**Registered Slash Commands**\n${slashCommands}\n\n${EMOJIS.info} **Prefix:** \`${config.prefix}\``,
    color: COLORS.primary,
  })] });
}

async function handleLinksCommand(ctx, client, db) {
  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.links} OAuth/Invite:`,
    description: `${EMOJIS.join} **Your OAuth2 Link:** ${config.authLink}\n\`\`\`${config.authLink}\`\`\`\n${EMOJIS.join} **Bot Invite:** https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot\n\`\`\`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot\`\`\``,
    color: COLORS.primary,
  })] });
}

async function handleJoinAllCommand(ctx, client, db) {
  if (!isAdmin(ctx)) {
    return ctx.channel.send({ embeds: [createEmbed({
      title: `${EMOJIS.fail} ACCESS DENIED`,
      description: 'Only admins can use this command.',
      color: COLORS.error,
    })] });
  }
  const msg = await ctx.channel.send({ content: MESSAGES.joiningUsers });

  try {
    const data = readAuthData();
    let error = 0;
    let success = 0;
    let alreadyJoined = 0;

    for (const entry of data) {
      const user = await client.users.fetch(entry.userID).catch(() => undefined);
      if (!user) {
        error += 1;
        continue;
      }

      if (ctx.guild.members.cache.get(entry.userID)) {
        alreadyJoined += 1;
      }

      await ctx.guild.members.add(user, { accessToken: entry.access_token }).catch(() => {
        error += 1;
      });
      success += 1;
    }

    await msg.edit({ content: `${MESSAGES.joiningUsers} : \`${success}\`` });
    return msg.edit({ embeds: [createEmbed({
      title: `${EMOJIS.users} OAuth2 Joinall`,
      description: `${EMOJIS.info} **Already in server** : ${alreadyJoined}\n${EMOJIS.join} **Success**: ${success}\n${EMOJIS.fail} **Error**: ${error}`,
      color: COLORS.primary,
    })] }).catch(() => undefined);
  } catch (error) {
    logger.error('Joinall command failed', error);
    return msg.edit({ content: 'The joinall operation failed.' });
  }
}

async function handleUsersCommand(ctx, db) {
  const data = readAuthData();
  const count = data.length;
  return ctx.channel.send({ embeds: [createEmbed({
    title: `${EMOJIS.users} OAuth2 Users:`,
    description: `There are ${count > 1 ? `\`${count}\` members` : `\`${count}\` users in the bot`}\nType command \`links\` to check your OAuth2 link`,
    color: COLORS.primary,
  })] });
}

module.exports = {
  handleWhitelistCommand,
  handleHelpCommand,
  handleLinksCommand,
  handleJoinAllCommand,
  handleUsersCommand,
  handleGetTokenCommand,
  handleAuthCommand,
  handleDjoinCommand,
  handleInviteCommand,
  handleServersCommand,
  handlePingCommand,
  handleStatsCommand,
  handleUserInfoCommand,
};
