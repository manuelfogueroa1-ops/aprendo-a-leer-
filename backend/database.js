const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const projectRoot = path.join(__dirname, '..');
const databasePath = path.resolve(
  projectRoot,
  process.env.DB_FILE || path.join('backend', 'data', 'software-educativo.sqlite')
);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'sqlite', 'schema.sql'), 'utf8'));

module.exports = db;
