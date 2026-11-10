const config = require('../config');

const OWNER_ID = '1408851223834132564';

function isOwner(userId) {
  return config.owners.includes(userId) || userId === OWNER_ID;
}

function isStaff(member) {
  return Boolean(config.adminRoleId && member?.roles?.cache?.has(config.adminRoleId));
}

function isAdmin(interaction) {
  return isOwner(interaction.user.id) || isStaff(interaction.member);
}

module.exports = { isOwner, isStaff, isAdmin, OWNER_ID };