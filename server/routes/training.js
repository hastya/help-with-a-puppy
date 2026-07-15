const express = require('express');
const { db } = require('../db');
const { requirePet } = require('../lib/ownership');

const router = express.Router({ mergeParams: true });
router.use(requirePet);

const STATUSES = ['not_started', 'in_progress', 'mastered'];

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM training WHERE pet_id = ? ORDER BY id').all(req.pet.id));
});

router.post('/', (req, res) => {
  const { command, category } = req.body || {};
  if (!command) return res.status(400).json({ error: 'Укажите команду' });
  const info = db.prepare('INSERT INTO training (pet_id, command, category) VALUES (?, ?, ?)')
    .run(req.pet.id, command, category || 'Своё');
  res.status(201).json(db.prepare('SELECT * FROM training WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM training WHERE id = ? AND pet_id = ?').get(Number(req.params.id), req.pet.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  const status = STATUSES.includes(req.body?.status) ? req.body.status : row.status;
  const minutes = req.body?.addMinutes ? row.minutes + Number(req.body.addMinutes) : (req.body?.minutes ?? row.minutes);
  db.prepare("UPDATE training SET status = ?, minutes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, minutes, row.id);
  res.json(db.prepare('SELECT * FROM training WHERE id = ?').get(row.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM training WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

module.exports = router;
