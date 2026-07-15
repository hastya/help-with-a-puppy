const express = require('express');
const { db } = require('../db');
const { requirePet } = require('../lib/ownership');

// Activity log powers the "activity heatmap" on the dashboard.
const router = express.Router({ mergeParams: true });
router.use(requirePet);

const TYPES = ['feeding', 'walk', 'training', 'medication'];

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT date, type, COUNT(*) AS count FROM activities
     WHERE pet_id = ? GROUP BY date, type ORDER BY date`
  ).all(req.pet.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { date, type } = req.body || {};
  const t = TYPES.includes(type) ? type : 'walk';
  const d = date || new Date().toISOString().slice(0, 10);
  const info = db.prepare('INSERT INTO activities (pet_id, date, type) VALUES (?, ?, ?)').run(req.pet.id, d, t);
  res.status(201).json({ id: info.lastInsertRowid, date: d, type: t });
});

module.exports = router;
