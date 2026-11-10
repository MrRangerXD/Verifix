const fs = require('fs');
const path = require('path');

class SimpleStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.ensureFile();
    this.load();
  }

  ensureFile() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2));
    }
  }

  load() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      this.data = content.trim() ? JSON.parse(content) : {};
    } catch (error) {
      this.data = {};
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(key) {
    return this.data[key] ?? null;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  delete(key) {
    delete this.data[key];
    this.save();
  }

  all() {
    return Object.entries(this.data).map(([ID, data]) => ({ ID, data }));
  }
}

const dbPath = path.resolve(__dirname, '..', '..', 'database.json');
const db = new SimpleStore(dbPath);

module.exports = db;
