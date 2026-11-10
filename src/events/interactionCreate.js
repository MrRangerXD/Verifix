const { createLogger } = require('../utils/logger');
const { createEmbed } = require('../utils/embeds');

const logger = createLogger();

function registerInteractionCreateEvent(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      try {
        await interaction.reply({ content: 'That command is not available.', ephemeral: true });
      } catch (error) {
        logger.error('Failed to reply to unknown slash command', error);
      }
      return;
    }

    try {
      logger.info(`Slash command received: ${interaction.commandName} by ${interaction.user.tag}`);
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Failed to execute slash command ${interaction.commandName}`, error);
      const embed = createEmbed({
        title: 'Command Error',
        description: 'An unexpected error occurred while handling that slash command.',
        color: 0xed4245,
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => undefined);
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => undefined);
      }
    }
  });
}

module.exports = { registerInteractionCreateEvent };
