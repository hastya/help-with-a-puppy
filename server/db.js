const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const breeds = require('./data/breeds');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  experience TEXT,
  goal TEXT,
  units TEXT DEFAULT 'metric',
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'ru',
  quiet_from TEXT DEFAULT '22:00',
  quiet_to TEXT DEFAULT '08:00',
  notify_health INTEGER DEFAULT 1,
  notify_nutrition INTEGER DEFAULT 1,
  notify_training INTEGER DEFAULT 1,
  notify_system INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS breeds (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp TEXT,
  adult_weight_min REAL,
  adult_weight_max REAL,
  activity_factor REAL,
  diseases TEXT,
  dangerous_foods TEXT,
  training_tips TEXT
);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  breed_code TEXT,
  birthdate TEXT,
  sex TEXT,
  sterilized INTEGER DEFAULT 0,
  weight REAL,
  avatar TEXT DEFAULT '🐶',
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS vaccinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_date TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  done_date TEXT
);

CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT,
  times TEXT,
  start_date TEXT,
  duration_days INTEGER,
  kind TEXT DEFAULT 'medication',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS training (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'not_started',
  minutes INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  label TEXT,
  grams REAL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER REFERENCES pets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Seed / refresh breed catalogue
const upsertBreed = db.prepare(`
  INSERT INTO breeds (code, name, grp, adult_weight_min, adult_weight_max, activity_factor, diseases, dangerous_foods, training_tips)
  VALUES (@code, @name, @grp, @adult_weight_min, @adult_weight_max, @activity_factor, @diseases, @dangerous_foods, @training_tips)
  ON CONFLICT(code) DO UPDATE SET
    name=excluded.name, grp=excluded.grp,
    adult_weight_min=excluded.adult_weight_min, adult_weight_max=excluded.adult_weight_max,
    activity_factor=excluded.activity_factor, diseases=excluded.diseases,
    dangerous_foods=excluded.dangerous_foods, training_tips=excluded.training_tips
`);
const seedBreeds = db.transaction((rows) => {
  for (const b of rows) {
    upsertBreed.run({
      code: b.code,
      name: b.name,
      grp: b.group,
      adult_weight_min: b.adultWeightMin,
      adult_weight_max: b.adultWeightMax,
      activity_factor: b.activityFactor,
      diseases: JSON.stringify(b.diseases || []),
      dangerous_foods: JSON.stringify(b.dangerousFoods || []),
      training_tips: b.trainingTips || '',
    });
  }
});
seedBreeds(breeds);

/** Fetch a breed row and parse JSON columns into a friendly object. */
function getBreed(code) {
  if (!code) return null;
  const row = db.prepare('SELECT * FROM breeds WHERE code = ?').get(code);
  if (!row) return null;
  return {
    code: row.code,
    name: row.name,
    group: row.grp,
    adultWeightMin: row.adult_weight_min,
    adultWeightMax: row.adult_weight_max,
    activityFactor: row.activity_factor,
    diseases: JSON.parse(row.diseases || '[]'),
    dangerousFoods: JSON.parse(row.dangerous_foods || '[]'),
    trainingTips: row.training_tips,
  };
}

module.exports = { db, getBreed, DB_PATH };
