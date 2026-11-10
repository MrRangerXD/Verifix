const { escapeRegex } = require('../utils/helpers');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const { isAdmin } = require('../utils/permissions');

const logger = createLogger();
const ADMIN_ONLY = new Set(['stock', 'plan', 'onliner', 'joinall', 'users', 'announce', 'send']);

function parseOptions(command, args, ctx, client) {
  const defs = command.data?.toJSON?.().options || [];
  const map = {};
  defs.forEach((opt, i) => { map[opt.name] = args[i] ?? null; });
  return map;
}

function buildInteraction(command, ctx, args, client) {
  const options = parseOptions(command, args, ctx, client);
  let sent = null;

  const send = async (payload) => {
    const data = typeof payload === 'string' ? { content: payload } : payload;
    sent = await ctx.channel.send(data).catch(() => null);
    return sent;
  };

  const resolveId = (raw) => raw?.match(/^<@!?(\d+)>$/)?.[1] || raw?.match(/^<#(\d+)>$/)?.[1] || raw?.match(/^(\d+)$/)?.[1];

  return {
    user: ctx.author,
    member: ctx.member,
    channel: ctx.channel,
    guild: ctx.guild,
    client,
    rawArgs: args,
    isCommand: () => true,
    isButton: () => false,

    reply: send,
    deferReply: async () => {},
    followUp: send,
    editReply: async (payload) => {
      const data = typeof payload === 'string' ? { content: payload } : payload;
      if (sent) return sent.edit(data).catch(() => null);
      return send(data);
    },

    options: {
      getString: (n) => options[n] ?? null,
      getInteger: (n) => {
        const v = Number.parseInt(options[n], 10);
        return Number.isNaN(v) ? null : v;
      },
      getBoolean: (n) => {
        const v = options[n];
        if (v === null) return null;
        return ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
      },
      getSubcommand: () => args[0] || null,
      getChannel: (n) => {
        const id = resolveId(options[n]);
        return id ? ctx.guild.channels.cache.get(id) : null;
      },
      getUser: (n) => {
        const id = resolveId(options[n]);
        return (id && client.users.cache.get(id)) || ctx.mentions?.users?.first() || null;
      },
    },
  };
}

function registerMessageCreateEvent(client) {
  client.on('messageCreate', async (ctx) => {
    if (!ctx.guild || ctx.author.bot) return;

    const rx = new RegExp(`^(<@!?${client.user.id}>|${escapeRegex(config.prefix)})\\s*`);
    if (!rx.test(ctx.content)) return;

    const args = ctx.content.slice(ctx.content.match(rx)[0].length).trim().split(/ +/);
    const cmd = (args.shift() || '').toLowerCase();
    if (!cmd) return;

    const command = client.commands.get(cmd);
    if (!command) return;

    // admin commands channel check skip karte hain
    if (!ADMIN_ONLY.has(cmd)) {
      const { ensureCommandChannel } = require('../utils/commandUtils');
      const check = ensureCommandChannel(cmd, ctx.channel, client);
      if (!check.ok) return ctx.channel.send({ embeds: [check.embed] }).catch(() => null);
    } else if (!isAdmin({ user: ctx.author, member: ctx.member })) {
      return ctx.channel.send({ content: 'Admin only.' }).catch(() => null);
    }

    try {
      await command.execute(buildInteraction(command, ctx, args, client));
    } catch (error) {
      logger.error(`prefix ${cmd} failed`, error);
      ctx.channel.send({ content: 'Command error — check logs.' }).catch(() => null);
    }
  });
}

module.exports = { registerMessageCreateEvent };