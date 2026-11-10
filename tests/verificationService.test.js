const test = require('node:test');
const assert = require('node:assert/strict');
const { createVerificationToken, buildVerificationState, parseVerificationState } = require('../src/services/verificationService');

test('creates and parses a verification state payload', () => {
  const token = createVerificationToken();
  const state = buildVerificationState(token, 'guild-123', 'channel-456');
  const parsed = parseVerificationState(state);

  assert.equal(parsed.token, token);
  assert.equal(parsed.guildId, 'guild-123');
  assert.equal(parsed.channelId, 'channel-456');
});
