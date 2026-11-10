const WebSocket = require('ws');
const { createLogger } = require('../utils/logger');

const logger = createLogger();
const URL_GW = 'wss://gateway.discord.gg/?v=10&encoding=json';
const INTENTS = (1 << 9) | (1 << 12);

function agent() {
  if (!process.env.PROXY_URL) return undefined;
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(process.env.PROXY_URL);
  } catch {
    return undefined;
  }
}

class Session {
  constructor(token, handlers = {}) {
    this.token = token;
    this.h = handlers;
    this.seq = null;
    this.sessionId = null;
    this.hb = null;
    this.acked = true;
    this.attempts = 0;
    this.manual = false;
    this.ready = false;
    this.ws = null;
  }

  connect(resume = false) {
    this.ws = new WebSocket(URL_GW, { agent: agent() });

    this.ws.on('open', () => {
      if (resume && this.sessionId && this.seq !== null) this.resume();
    });

    this.ws.on('message', (raw) => {
      let p;
      try { p = JSON.parse(raw); } catch { return; }
      if (p.s) this.seq = p.s;

      switch (p.op) {
        case 10:
          this.hbStart(p.d.heartbeat_interval);
          if (!resume) this.identify();
          break;
        case 11:
          this.acked = true;
          break;
        case 1:
          this.send({ op: 1, d: this.seq });
          break;
        case 7:
          this.ws.close(4000);
          break;
        case 9:
          this.sessionId = null;
          setTimeout(() => this.identify(), 2000 + Math.random() * 3000);
          break;
        case 0:
          if (p.t === 'READY') {
            this.ready = true;
            this.sessionId = p.d.session_id;
            this.attempts = 0;
            this.h.onReady?.(p.d);
          } else if (p.t === 'RESUMED') {
            this.ready = true;
            this.attempts = 0;
          } else if (p.t === 'MESSAGE_CREATE') {
            this.h.onMessage?.(p.d);
          }
          break;
        default:
          break;
      }
    });

    this.ws.on('close', (code) => {
      clearInterval(this.hb);
      if (this.manual) return;
      this.h.onClose?.(code);

      if (code === 4004 || code === 4014) {
        this.h.onFatal?.(code);
        return;
      }
      if (this.attempts >= 8) {
        this.h.onFatal?.(code);
        return;
      }

      this.attempts += 1;
      const wait = code === 4008 || code === 4009
        ? 6000 + Math.random() * 6000
        : Math.min(30000, 1500 * 2 ** this.attempts);

      setTimeout(() => this.connect(Boolean(this.sessionId)), wait);
    });

    this.ws.on('error', () => {});
  }

  hbStart(interval) {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
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

  resume() {
    this.send({ op: 6, d: { token: this.token, session_id: this.sessionId, seq: this.seq } });
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  setPresence({ status = 'online', activities = [] }) {
    this.send({ op: 3, d: { status, since: 0, afk: false, activities } });
  }

  close() {
    this.manual = true;
    clearInterval(this.hb);
    this.ws?.close(1000);
  }
}

module.exports = { Session, INTENTS };