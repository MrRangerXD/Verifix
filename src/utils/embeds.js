const { COLORS } = require('../constants');

function createEmbed({ title, description, color = COLORS.primary, footerText = 'VerifiX Bot', authorName, thumbnailUrl, fields, image, url }) {
  const embed = {
    color,
    title,
    description,
    timestamp: new Date().toISOString(),
    footer: { text: footerText },
  };

  if (authorName) {
    embed.author = { name: authorName };
  }

  if (thumbnailUrl) {
    embed.thumbnail = { url: thumbnailUrl };
  }

  if (fields) {
    embed.fields = fields;
  }

  if (image) {
    embed.image = { url: image };
  }

  if (url) {
    embed.url = url;
  }

  return embed;
}

module.exports = {
  createEmbed,
};
