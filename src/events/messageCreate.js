const { escapeRegex } = require('../utils/helpers');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const db = require('../database');
const {
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
} = require('../handlers/commandHandler');
const { ensureCommandChannel, checkCommandCooldown } = require('../utils/commandUtils');

const logger = createLogger();
function parsePrefixOptions(command, args, ctx, client) {
  const optionsDef = command.data?.toJSON?.().options || [];
  return optionsDef.reduce((acc, opt, index) => {
    const raw = args[index] ?? null;
    acc[opt.name] = { value: raw, type: opt.type, name: opt.name };
    return acc;
  }, {});
}

function createPrefixInteraction(command, ctx, args, client) {
  const options = parsePrefixOptions(command, args, ctx, client);
  return {
    user: ctx.author,
    member: ctx.member,
    channel: ctx.channel,
    guild: ctx.guild,
    client,
    reply: async (replyData) => {
      if (replyData.embeds || replyData.content) {
        return ctx.channel.send({ embeds: replyData.embeds, content: replyData.content });
      }
      return null;
    },
    options: {
      getString: (name) => options[name]?.value ?? null,
      getChannel: (name) => {
        const raw = options[name]?.value;
        if (!raw) return null;
        const channelId = raw.match(/^<#(\d+)>$/)?.[1] || raw.match(/^(\d+)$/)?.[1];
        if (channelId) return ctx.guild.channels.cache.get(channelId);
        return ctx.guild.channels.cache.find((ch) => ch.name === raw.replace(/^#/, ''));
      },
      getUser: (name) => {
        const raw = options[name]?.value;
        if (!raw) return null;
        const userId = raw.match(/^<@!?(\d+)>$/)?.[1] || raw.match(/^(\d+)$/)?.[1];
        if (userId) return client.users.cache.get(userId);
        return ctx.mentions?.users?.first?.();
      },
    },
  };
}

async function executeSlashCommandAsPrefix(command, ctx, args, client) {
  try {
    const interaction = createPrefixInteraction(command, ctx, args, client);
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Prefix execution failed for ${command.data.name}`, error);
    await ctx.channel.send({ content: 'An error occurred while running that command.' }).catch(() => undefined);
  }
}
function registerMessageCreateEvent(client) {
  client.on('messageCreate', async (ctx) => {
    if (!ctx.guild || ctx.author.bot) return;

    const prefixRegex = new RegExp(`^(<@!?${client.user.id}>|${escapeRegex(config.prefix)})\\s*`);
    if (!prefixRegex.test(ctx.content)) return;

    const [, matchedPrefix] = ctx.content.match(prefixRegex);
    const args = ctx.content.slice(matchedPrefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
      logger.info(`Command received: ${cmd} by ${ctx.author.tag}`);
      const channelCheck = ensureCommandChannel(cmd, ctx.channel, client);
      if (!channelCheck.ok) {
        return ctx.channel.send({ embeds: [channelCheck.embed] }).catch(() => undefined);
      }

      if (cmd === 'wl') {
        await handleWhitelistCommand(ctx, args, client, db);
        return;
      }

      if (cmd === 'help') {
        await handleHelpCommand(ctx, client, db);
        return;
      }

      if (cmd === 'links') {
        await handleLinksCommand(ctx, client, db);
        return;
      }

      if (cmd === 'joinall') {
        await handleJoinAllCommand(ctx, client, db);
        return;
      }

      if (cmd === 'users') {
        await handleUsersCommand(ctx, db);
        return;
      }

      if (cmd === 'invite') {
        await handleInviteCommand(ctx, client);
        return;
      }

      if (cmd === 'servers') {
        await handleServersCommand(ctx, client);
        return;
      }

      if (cmd === 'ping') {
        await handlePingCommand(ctx, client);
        return;
      }

      if (cmd === 'stats') {
        await handleStatsCommand(ctx, client);
        return;
      }

      if (cmd === 'user_info') {
        await handleUserInfoCommand(ctx, args, client);
        return;
      }

      if (cmd === 'get_token') {
        await handleGetTokenCommand(ctx);
        return;
      }

      if (cmd === 'auth') {
        await handleAuthCommand(ctx, args, client, db);
        return;
      }

      if (cmd === 'djoin') {
        const cooldown = checkCommandCooldown(cmd, ctx.author.id, db);
        if (!cooldown.ok) {
          await ctx.channel.send({ embeds: [cooldown.embed] }).catch(() => undefined);
          return;
        }
        await handleDjoinCommand(ctx, args, client, db);
        return;
      }

      const command = client.commands.get(cmd);
      if (command) {
        await executeSlashCommandAsPrefix(command, ctx, args, client);
        return;
      }
    } catch (error) {
      logger.error(`Failed to process command ${cmd}`, error);
      await ctx.channel.send({ content: 'An unexpected error occurred while processing that command.' }).catch(() => undefined);
    }
  });
}

module.exports = { registerMessageCreateEvent };
