const express = require('express');
const { db } = require('../db');
const { ownedPet } = require('../lib/ownership');

const router = express.Router();
const CATEGORIES = ['Питание', 'Ветеринар', 'Лекарства', 'Аксессуары', 'Груминг', 'Прочее'];

router.get('/categories', (req, res) => res.json(CATEGORIES));

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT e.*, p.name AS pet_name FROM expenses e
     LEFT JOIN pets p ON p.id = e.pet_id
     WHERE e.user_id = ? ORDER BY e.date DESC, e.id DESC`
  ).all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { pet_id, date, category, amount, note } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Укажите сумму' });
  if (pet_id && !ownedPet(req.user.id, pet_id)) return res.status(404).json({ error: 'Питомец не найден' });
  const info = db.prepare(
    'INSERT INTO expenses (user_id, pet_id, date, category, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, pet_id || null, date || new Date().toISOString().slice(0, 10), category || 'Прочее', Number(amount), note || null);
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
