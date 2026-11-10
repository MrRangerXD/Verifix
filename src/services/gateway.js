const WebSocket = require('ws');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const INTENTS = (1 << 9) | (1 << 12); // GUILD_MESSAGES | DIRECT_MESSAGES

class Session {
  constructor(token, { onReady, onMessage, onClose } = {}) {
    this.token = token;
    this.onReady = onReady;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.seq = null;
    this.sessionId = null;
    this.heartbeat = null;
    this.acked = true;
    this.closedByUser = false;
    this.attempts = 0;
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket(GATEWAY);

    this.ws.on('open', () => { this.attempts = 0; });

    this.ws.on('message', (raw) => {
      let pkt;
      try { pkt = JSON.parse(raw); } catch { return; }
      if (pkt.s) this.seq = pkt.s;

      switch (pkt.op) {
        case 10: // HELLO
          this.startHeartbeat(pkt.d.heartbeat_interval);
          this.identify();
          break;
        case 11: // ACK
          this.acked = true;
          break;
        case 1: // heartbeat request
          this.send({ op: 1, d: this.seq });
          break;
        case 7: // reconnect
          this.ws.close(4000);
          break;
        case 9: // invalid session
          this.sessionId = null;
          setTimeout(() => this.identify(), 3000);
          break;
        case 0:
          if (pkt.t === 'READY') {
            this.sessionId = pkt.d.session_id;
            this.onReady?.(pkt.d);
          } else if (pkt.t === 'MESSAGE_CREATE') {
            this.onMessage?.(pkt.d);
          }
          break;
        default: break;
      }
    });

    this.ws.on('close', (code) => {
      clearInterval(this.heartbeat);
      if (this.closedByUser) return;
      this.onClose?.(code);

      if (code === 4004) return;              // auth failed -> dead
      if (code === 4008 || code === 4009) {
        setTimeout(() => this.connect(), 8000 + Math.random() * 7000);
        return;
      }
      const backoff = Math.min(30000, 1500 * 2 ** this.attempts);
      this.attempts += 1;
      setTimeout(() => this.connect(), backoff);
    });

    this.ws.on('error', () => {});
  }

  startHeartbeat(interval) {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (!this.acked) { this.ws?.close(4000); return; }
      this.acked = false;
      this.send({ op: 1, d: this.seq });
    }, interval);
  }

  identify() {
    this.send({
      op: 2,
      d: {
        token: this.token,
        capabilities: 125,
        compress: false,
        properties: { os: 'Windows', browser: 'Chrome', device: '' },
        presence: { status: 'online', since: 0, afk: false, activities: [] },
      },
    });
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  setPresence({ status = 'online', activities = [] }) {
    this.send({ op: 3, d: { status, since: 0, afk: false, activities } });
  }

  close() {
    this.closedByUser = true;
    clearInterval(this.heartbeat);
    this.ws?.close(1000);
  }
}

module.exports = { Session, INTENTS };