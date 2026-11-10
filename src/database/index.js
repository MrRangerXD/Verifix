const fs = require('fs');
const path = require('path');

/**
 * Hardened JSON store.
 * - atomic writes (tmp + rename)
 * - debounced flush (1.5s) so 200 sets != 200 disk writes
 * - in-memory cache = read-modify-write is atomic within the event loop
 * - update(key, fn) for safe mutations
 * - auto backup every 15 min, keeps last 5
 */

const dbPath = path.resolve(__dirname, '..', '..', 'database.json');
const backupDir = path.resolve(__dirname, '..', '..', 'backups');

let cache = null;
let dirty = false;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    cache = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function flush() {
  if (!dirty || !cache) return;
  try {
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, dbPath);
    dirty = false;
  } catch (error) {
    console.error('[db] flush failed:', error.message);
  }
}

function backup() {
  flush();
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(dbPath, path.join(backupDir, `${stamp}.json`));

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of files.slice(0, -5)) fs.unlinkSync(path.join(backupDir, file));
  } catch (error) {
    console.error('[db] backup failed:', error.message);
  }
}

setInterval(flush, 1500).unref();
setInterval(backup, 15 * 60 * 1000).unref();
process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, flush);
}

module.exports = {
  get(key) {
    return load()[key] ?? null;
  },
  set(key, value) {
    load()[key] = value;
    dirty = true;
    return value;
  },
  delete(key) {
    delete load()[key];
    dirty = true;
  },
  has(key) {
    return Object.prototype.hasOwnProperty.call(load(), key);
  },
  /** atomic read-modify-write */
  update(key, mutator) {
    const data = load();
    const next = mutator(data[key] ?? null);
    data[key] = next;
    dirty = true;
    return next;
  },
  all() {
    return Object.entries(load()).map(([ID, data]) => ({ ID, data }));
  },
  keys() {
    return Object.keys(load());
  },
  flush,
  backup,
};