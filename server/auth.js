const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { db } = require('./db');

// A stable-per-process secret. In production ALWAYS set JWT_SECRET in the env;
// otherwise sessions are invalidated on every restart.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '30d';

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Express middleware: requires a valid Bearer token, attaches req.user. */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, experience: u.experience, goal: u.goal,
    units: u.units, theme: u.theme, language: u.language,
    quietFrom: u.quiet_from, quietTo: u.quiet_to,
    notify: {
      health: !!u.notify_health, nutrition: !!u.notify_nutrition,
      training: !!u.notify_training, system: !!u.notify_system,
    },
  };
}

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, name, experience, goal } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  const normalized = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return res.status(400).json({ error: 'Некорректный email' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (exists) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name, experience, goal) VALUES (?, ?, ?, ?, ?)'
  ).run(normalized, hash, name || normalized.split('@')[0], experience || null, goal || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
  const normalized = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = { router, authRequired, publicUser, signToken };
