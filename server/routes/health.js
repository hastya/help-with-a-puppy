const express = require('express');
const { db, getBreed } = require('../db');
const { requirePet } = require('../lib/ownership');

// Routes are mounted at /api/pets/:petId/... and all require pet ownership.
const router = express.Router({ mergeParams: true });
router.use(requirePet);

const today = () => new Date().toISOString().slice(0, 10);

// ---- Weight tracker ------------------------------------------------------

router.get('/weights', (req, res) => {
  const rows = db.prepare('SELECT id, date, value FROM weights WHERE pet_id = ? ORDER BY date').all(req.pet.id);
  const breed = getBreed(req.pet.breed_code);
  res.json({
    points: rows,
    norm: breed ? { min: breed.adultWeightMin, max: breed.adultWeightMax } : null,
  });
});

router.post('/weights', (req, res) => {
  const { date, value } = req.body || {};
  if (!value || Number(value) <= 0) return res.status(400).json({ error: 'Укажите вес' });
  const info = db.prepare('INSERT INTO weights (pet_id, date, value) VALUES (?, ?, ?)')
    .run(req.pet.id, date || today(), Number(value));
  // keep pet.weight in sync with the latest measurement
  db.prepare('UPDATE pets SET weight = ? WHERE id = ?').run(Number(value), req.pet.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/weights/:id', (req, res) => {
  db.prepare('DELETE FROM weights WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

// ---- Vaccinations --------------------------------------------------------

router.get('/vaccinations', (req, res) => {
  res.json(db.prepare('SELECT * FROM vaccinations WHERE pet_id = ? ORDER BY due_date').all(req.pet.id));
});

router.post('/vaccinations', (req, res) => {
  const { name, due_date } = req.body || {};
  if (!name || !due_date) return res.status(400).json({ error: 'Укажите название и дату' });
  const info = db.prepare('INSERT INTO vaccinations (pet_id, name, due_date) VALUES (?, ?, ?)')
    .run(req.pet.id, name, due_date);
  res.status(201).json(db.prepare('SELECT * FROM vaccinations WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/vaccinations/:id/toggle', (req, res) => {
  const row = db.prepare('SELECT * FROM vaccinations WHERE id = ? AND pet_id = ?').get(Number(req.params.id), req.pet.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  const done = row.done ? 0 : 1;
  db.prepare('UPDATE vaccinations SET done = ?, done_date = ? WHERE id = ?')
    .run(done, done ? today() : null, row.id);
  res.json({ ...row, done, done_date: done ? today() : null });
});

router.delete('/vaccinations/:id', (req, res) => {
  db.prepare('DELETE FROM vaccinations WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

// ---- Medications & parasite treatments ----------------------------------

router.get('/medications', (req, res) => {
  res.json(db.prepare('SELECT * FROM medications WHERE pet_id = ? ORDER BY active DESC, start_date DESC').all(req.pet.id));
});

router.post('/medications', (req, res) => {
  const { name, dosage, times, start_date, duration_days, kind } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  const info = db.prepare(
    'INSERT INTO medications (pet_id, name, dosage, times, start_date, duration_days, kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.pet.id, name, dosage || null, times || null, start_date || today(), duration_days || null, kind || 'medication');
  res.status(201).json(db.prepare('SELECT * FROM medications WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/medications/:id/toggle', (req, res) => {
  const row = db.prepare('SELECT * FROM medications WHERE id = ? AND pet_id = ?').get(Number(req.params.id), req.pet.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('UPDATE medications SET active = ? WHERE id = ?').run(row.active ? 0 : 1, row.id);
  res.json({ ...row, active: row.active ? 0 : 1 });
});

router.delete('/medications/:id', (req, res) => {
  db.prepare('DELETE FROM medications WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

// ---- Breed health notes --------------------------------------------------

router.get('/breed-info', (req, res) => {
  const breed = getBreed(req.pet.breed_code);
  if (!breed) return res.json({ diseases: [], dangerousFoods: [], trainingTips: null });
  res.json({ diseases: breed.diseases, dangerousFoods: breed.dangerousFoods, trainingTips: breed.trainingTips });
});

module.exports = router;
