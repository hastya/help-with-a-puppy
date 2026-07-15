const express = require('express');
const { db, getBreed } = require('../db');
const calc = require('../lib/calc');
const { requirePet } = require('../lib/ownership');

const router = express.Router({ mergeParams: true });
router.use(requirePet);

// ---- Calorie & portion calculator ---------------------------------------
// GET /calories?foodKcal=350&meals=2 → daily calories + per-meal grams.
router.get('/calories', (req, res) => {
  const pet = req.pet;
  const breed = getBreed(pet.breed_code);
  const result = calc.dailyCalories({
    weightKg: pet.weight,
    birthdate: pet.birthdate,
    sterilized: pet.sterilized,
    breed,
  });
  const foodKcal = Number(req.query.foodKcal) || null;
  const meals = Number(req.query.meals) || db.prepare('SELECT COUNT(*) c FROM meals WHERE pet_id = ?').get(pet.id).c || 2;
  const portion = foodKcal ? calc.portionGrams(result.mer, foodKcal, meals) : null;
  res.json({
    ...result,
    stageLabel: calc.STAGE_LABELS[result.stage],
    meals,
    foodKcal,
    portionGrams: portion,
  });
});

// ---- Dangerous foods (stop-list) ----------------------------------------
router.get('/stoplist', (req, res) => {
  const breed = getBreed(req.pet.breed_code);
  const common = ['Шоколад', 'Виноград и изюм', 'Ксилит (подсластитель)', 'Лук и чеснок', 'Алкоголь', 'Кофеин', 'Орехи макадамия', 'Сырое тесто'];
  const breedSpecific = breed ? breed.dangerousFoods : [];
  const merged = Array.from(new Set([...breedSpecific, ...common]));
  res.json({ items: merged, breedSpecific });
});

// ---- Feeding schedule ----------------------------------------------------
router.get('/meals', (req, res) => {
  res.json(db.prepare('SELECT * FROM meals WHERE pet_id = ? ORDER BY time').all(req.pet.id));
});

router.post('/meals', (req, res) => {
  const { time, label, grams } = req.body || {};
  if (!time) return res.status(400).json({ error: 'Укажите время кормления' });
  const info = db.prepare('INSERT INTO meals (pet_id, time, label, grams) VALUES (?, ?, ?, ?)')
    .run(req.pet.id, time, label || 'Кормление', grams || null);
  res.status(201).json(db.prepare('SELECT * FROM meals WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

module.exports = router;
