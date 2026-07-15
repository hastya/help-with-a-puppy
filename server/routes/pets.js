const express = require('express');
const { db, getBreed } = require('../db');
const calc = require('../lib/calc');
const { requirePet } = require('../lib/ownership');

const router = express.Router();

// ---- helpers -------------------------------------------------------------

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build a default puppy vaccination schedule from a birthdate. */
function defaultVaccinations(birthdate) {
  if (!birthdate) return [];
  return [
    { name: 'Первичная вакцинация (комплексная)', due: addDays(birthdate, 8 * 7) },
    { name: 'Ревакцинация (бустер)', due: addDays(birthdate, 12 * 7) },
    { name: 'Бешенство', due: addDays(birthdate, 14 * 7) },
    { name: 'Ежегодная ревакцинация', due: addDays(birthdate, 52 * 7) },
  ];
}

/** Age-appropriate default training plan. */
function defaultTraining(stage) {
  if (stage === 'puppy') {
    return [
      { command: 'Приучение к туалету / пелёнке', category: 'Базовое' },
      { command: 'Приучение к клетке', category: 'Базовое' },
      { command: 'Социализация', category: 'Базовое' },
      { command: 'Команда «Сидеть»', category: 'Команды' },
      { command: 'Команда «Ко мне»', category: 'Команды' },
      { command: 'Команда «Место»', category: 'Команды' },
    ];
  }
  return [
    { command: 'Выдержка (по 1–3 мин)', category: 'Продвинутое' },
    { command: 'Коррекция поведения', category: 'Поведение' },
    { command: 'Команда «Рядом»', category: 'Команды' },
    { command: 'Трюк «Дай лапу»', category: 'Трюки' },
    { command: 'Трюк «Апорт»', category: 'Трюки' },
  ];
}

/** Serialize a pet row with derived fields (status, breed, weight norm). */
function decoratePet(pet) {
  const breed = getBreed(pet.breed_code);
  const stage = calc.lifeStage(pet.birthdate, breed?.adultWeightMax);
  return {
    id: pet.id,
    name: pet.name,
    breedCode: pet.breed_code,
    breed: breed ? breed.name : null,
    breedInfo: breed,
    birthdate: pet.birthdate,
    ageMonths: calc.ageInMonths(pet.birthdate),
    sex: pet.sex,
    sterilized: !!pet.sterilized,
    weight: pet.weight,
    avatar: pet.avatar,
    archived: !!pet.archived,
    stage,
    stageLabel: calc.STAGE_LABELS[stage],
    weightStatus: calc.weightStatus(pet.weight, breed),
  };
}

// ---- breeds catalogue ----------------------------------------------------

router.get('/breeds', (req, res) => {
  const rows = db.prepare('SELECT code, name, grp, adult_weight_min, adult_weight_max FROM breeds ORDER BY name').all();
  res.json(rows.map((r) => ({
    code: r.code, name: r.name, group: r.grp,
    adultWeightMin: r.adult_weight_min, adultWeightMax: r.adult_weight_max,
  })));
});

// ---- pets CRUD -----------------------------------------------------------

router.get('/pets', (req, res) => {
  const includeArchived = req.query.archived === '1';
  const rows = db.prepare(
    `SELECT * FROM pets WHERE user_id = ? ${includeArchived ? '' : 'AND archived = 0'} ORDER BY created_at`
  ).all(req.user.id);
  res.json(rows.map(decoratePet));
});

router.post('/pets', (req, res) => {
  const { name, breedCode, birthdate, sex, sterilized, weight, avatar } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите кличку' });

  const info = db.prepare(
    `INSERT INTO pets (user_id, name, breed_code, birthdate, sex, sterilized, weight, avatar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, String(name).trim(), breedCode || null, birthdate || null,
    sex || null, sterilized ? 1 : 0, weight || null, avatar || '🐶'
  );
  const petId = info.lastInsertRowid;

  // Seed weight history point
  if (weight) {
    db.prepare('INSERT INTO weights (pet_id, date, value) VALUES (?, ?, ?)')
      .run(petId, new Date().toISOString().slice(0, 10), weight);
  }
  // Seed vaccination schedule
  const insVac = db.prepare('INSERT INTO vaccinations (pet_id, name, due_date) VALUES (?, ?, ?)');
  for (const v of defaultVaccinations(birthdate)) insVac.run(petId, v.name, v.due);

  // Seed age-appropriate training plan
  const breed = getBreed(breedCode);
  const stage = calc.lifeStage(birthdate, breed?.adultWeightMax);
  const insTr = db.prepare('INSERT INTO training (pet_id, command, category) VALUES (?, ?, ?)');
  for (const t of defaultTraining(stage)) insTr.run(petId, t.command, t.category);

  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
  res.status(201).json(decoratePet(pet));
});

router.get('/pets/:petId', requirePet, (req, res) => {
  res.json(decoratePet(req.pet));
});

router.put('/pets/:petId', requirePet, (req, res) => {
  const cur = req.pet;
  const { name, breedCode, birthdate, sex, sterilized, weight, avatar } = req.body || {};
  db.prepare(
    `UPDATE pets SET name=?, breed_code=?, birthdate=?, sex=?, sterilized=?, weight=?, avatar=? WHERE id=?`
  ).run(
    name ?? cur.name, breedCode ?? cur.breed_code, birthdate ?? cur.birthdate,
    sex ?? cur.sex, sterilized != null ? (sterilized ? 1 : 0) : cur.sterilized,
    weight ?? cur.weight, avatar ?? cur.avatar, cur.id
  );
  // Record a weight point if the value changed
  if (weight != null && Number(weight) !== Number(cur.weight)) {
    db.prepare('INSERT INTO weights (pet_id, date, value) VALUES (?, ?, ?)')
      .run(cur.id, new Date().toISOString().slice(0, 10), weight);
  }
  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(cur.id);
  res.json(decoratePet(pet));
});

router.post('/pets/:petId/archive', requirePet, (req, res) => {
  const archived = req.body?.archived ? 1 : 0;
  db.prepare('UPDATE pets SET archived = ? WHERE id = ?').run(archived, req.pet.id);
  res.json({ ok: true, archived: !!archived });
});

router.delete('/pets/:petId', requirePet, (req, res) => {
  // Guard: require explicit confirmation string, matching the "type DELETE" UX.
  if ((req.body?.confirm || req.query.confirm) !== 'УДАЛИТЬ') {
    return res.status(400).json({ error: 'Для удаления передайте confirm="УДАЛИТЬ"' });
  }
  db.prepare('DELETE FROM pets WHERE id = ?').run(req.pet.id); // cascades to all child data
  res.json({ ok: true });
});

module.exports = { router, decoratePet };
