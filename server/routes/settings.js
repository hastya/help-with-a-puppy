const express = require('express');
const { db } = require('../db');
const { publicUser } = require('../auth');

const router = express.Router();

// ---- Owner profile & preferences ----------------------------------------
router.put('/profile', (req, res) => {
  const u = req.user;
  const { name, units, theme, language, quietFrom, quietTo, notify } = req.body || {};
  db.prepare(
    `UPDATE users SET name=?, units=?, theme=?, language=?, quiet_from=?, quiet_to=?,
       notify_health=?, notify_nutrition=?, notify_training=?, notify_system=? WHERE id=?`
  ).run(
    name ?? u.name,
    ['metric', 'imperial'].includes(units) ? units : u.units,
    ['light', 'dark', 'system'].includes(theme) ? theme : u.theme,
    ['ru', 'en'].includes(language) ? language : u.language,
    quietFrom ?? u.quiet_from,
    quietTo ?? u.quiet_to,
    notify?.health != null ? (notify.health ? 1 : 0) : u.notify_health,
    notify?.nutrition != null ? (notify.nutrition ? 1 : 0) : u.notify_nutrition,
    notify?.training != null ? (notify.training ? 1 : 0) : u.notify_training,
    notify?.system != null ? (notify.system ? 1 : 0) : u.notify_system,
    u.id
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ user: publicUser(updated) });
});

// ---- GDPR: export everything --------------------------------------------
router.get('/export', (req, res) => {
  const uid = req.user.id;
  const pets = db.prepare('SELECT * FROM pets WHERE user_id = ?').all(uid);
  const petIds = pets.map((p) => p.id);
  const inClause = petIds.length ? `(${petIds.join(',')})` : '(0)';
  const dump = {
    exportedAt: new Date().toISOString(),
    user: publicUser(req.user),
    pets,
    weights: db.prepare(`SELECT * FROM weights WHERE pet_id IN ${inClause}`).all(),
    vaccinations: db.prepare(`SELECT * FROM vaccinations WHERE pet_id IN ${inClause}`).all(),
    medications: db.prepare(`SELECT * FROM medications WHERE pet_id IN ${inClause}`).all(),
    training: db.prepare(`SELECT * FROM training WHERE pet_id IN ${inClause}`).all(),
    meals: db.prepare(`SELECT * FROM meals WHERE pet_id IN ${inClause}`).all(),
    documents: db.prepare(`SELECT * FROM documents WHERE pet_id IN ${inClause}`).all(),
    expenses: db.prepare('SELECT * FROM expenses WHERE user_id = ?').all(uid),
    activities: db.prepare(`SELECT * FROM activities WHERE pet_id IN ${inClause}`).all(),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="help-with-a-puppy-export.json"');
  res.json(dump);
});

// ---- GDPR: delete account ("forget me") ---------------------------------
router.delete('/account', (req, res) => {
  if ((req.body?.confirm || req.query.confirm) !== 'УДАЛИТЬ') {
    return res.status(400).json({ error: 'Для удаления аккаунта передайте confirm="УДАЛИТЬ"' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascades to all data
  res.json({ ok: true });
});

module.exports = router;
