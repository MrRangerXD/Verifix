function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserLabel(user) {
  return user ? `${user.username}#${user.discriminator}` : 'Unknown User';
}

module.exports = {
  escapeRegex,
  buildUserLabel,
};
