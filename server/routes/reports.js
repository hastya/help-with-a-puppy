const express = require('express');
const { db, getBreed } = require('../db');
const calc = require('../lib/calc');
const { requirePet, ownedPet } = require('../lib/ownership');

const router = express.Router();

function periodStart(period) {
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'quarter') d.setMonth(d.getMonth() - 3);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  else return '1970-01-01';
  return d.toISOString().slice(0, 10);
}

// ---- Per-pet dashboard ---------------------------------------------------
router.get('/pets/:petId/dashboard', requirePet, (req, res) => {
  const pet = req.pet;
  const from = periodStart(req.query.period || 'all');
  const breed = getBreed(pet.breed_code);

  const weights = db.prepare('SELECT date, value FROM weights WHERE pet_id = ? ORDER BY date').all(pet.id);

  const training = db.prepare('SELECT status, minutes FROM training WHERE pet_id = ?').all(pet.id);
  const trainingSummary = { mastered: 0, in_progress: 0, not_started: 0, minutes: 0 };
  for (const t of training) {
    trainingSummary[t.status] = (trainingSummary[t.status] || 0) + 1;
    trainingSummary.minutes += t.minutes || 0;
  }

  const vac = db.prepare('SELECT COUNT(*) total, SUM(done) done FROM vaccinations WHERE pet_id = ?').get(pet.id);
  const meds = db.prepare('SELECT COUNT(*) total, SUM(active) active FROM medications WHERE pet_id = ?').get(pet.id);

  const expensesRows = db.prepare(
    'SELECT category, SUM(amount) total FROM expenses WHERE pet_id = ? AND date >= ? GROUP BY category'
  ).all(pet.id, from);
  const expenses = expensesRows.reduce((acc, r) => { acc[r.category] = r.total; return acc; }, {});
  const expensesTotal = expensesRows.reduce((s, r) => s + r.total, 0);

  const activities = db.prepare(
    'SELECT date, COUNT(*) count FROM activities WHERE pet_id = ? AND date >= ? GROUP BY date'
  ).all(pet.id, from);

  // AI-style insight (rule based)
  const insight = buildInsight(pet, breed, weights);

  res.json({
    pet: { id: pet.id, name: pet.name, avatar: pet.avatar },
    weights,
    weightNorm: breed ? { min: breed.adultWeightMin, max: breed.adultWeightMax } : null,
    training: trainingSummary,
    vaccinations: { total: vac.total, done: vac.done || 0 },
    medications: { total: meds.total, active: meds.active || 0 },
    expenses,
    expensesTotal,
    activities,
    insight,
  });
});

function buildInsight(pet, breed, weights) {
  if (!breed || !pet.weight) return 'Заполните породу и вес, чтобы получать персональные рекомендации.';
  const ws = calc.weightStatus(pet.weight, breed);
  const stage = calc.lifeStage(pet.birthdate, breed.adultWeightMax);
  if (ws.status === 'over') return `${pet.name} набирает вес выше нормы для породы (${breed.adultWeightMin}–${breed.adultWeightMax} кг) — стоит скорректировать рацион и увеличить активность.`;
  if (ws.status === 'under') return `${pet.name} весит ниже нормы для породы — проверьте калорийность рациона и обратитесь к ветеринару.`;
  if (weights.length >= 2) {
    const delta = weights[weights.length - 1].value - weights[0].value;
    if (stage === 'puppy' && delta > 0) return `${pet.name} стабильно растёт (+${delta.toFixed(1)} кг) — это хороший признак здорового развития щенка.`;
  }
  return `${pet.name} в пределах нормы веса для породы. Так держать! 🐾`;
}

// ---- Summary across all pets --------------------------------------------
router.get('/summary', (req, res) => {
  const from = periodStart(req.query.period || 'year');
  const pets = db.prepare('SELECT * FROM pets WHERE user_id = ? AND archived = 0').all(req.user.id);

  const byPet = db.prepare(
    `SELECT p.id, p.name, COALESCE(SUM(e.amount),0) total
     FROM pets p LEFT JOIN expenses e ON e.pet_id = p.id AND e.date >= ?
     WHERE p.user_id = ? AND p.archived = 0 GROUP BY p.id`
  ).all(from, req.user.id);

  const health = db.prepare(
    `SELECT COUNT(*) total, SUM(done) done FROM vaccinations
     WHERE pet_id IN (SELECT id FROM pets WHERE user_id = ?)`
  ).get(req.user.id);

  // Weight series per pet for comparison chart
  const series = pets.map((p) => ({
    id: p.id,
    name: p.name,
    points: db.prepare('SELECT date, value FROM weights WHERE pet_id = ? ORDER BY date').all(p.id),
  }));

  const totalExpenses = byPet.reduce((s, r) => s + r.total, 0);
  const months = Math.max(1, monthsBetween(from));

  res.json({
    petsCount: pets.length,
    expensesByPet: byPet,
    totalExpenses,
    avgMonthly: Math.round(totalExpenses / months),
    vaccinations: { total: health.total || 0, done: health.done || 0 },
    weightSeries: series,
  });
});

function monthsBetween(fromStr) {
  const from = new Date(fromStr);
  const now = new Date();
  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()) + 1;
}

// ---- CSV export (for vet / spreadsheets) --------------------------------
router.get('/pets/:petId/export.csv', requirePet, (req, res) => {
  const pet = req.pet;
  const rows = [];
  rows.push(['Раздел', 'Дата', 'Показатель', 'Значение']);
  for (const w of db.prepare('SELECT date, value FROM weights WHERE pet_id = ? ORDER BY date').all(pet.id))
    rows.push(['Вес', w.date, 'кг', w.value]);
  for (const v of db.prepare('SELECT name, due_date, done FROM vaccinations WHERE pet_id = ?').all(pet.id))
    rows.push(['Прививка', v.due_date, v.name, v.done ? 'выполнено' : 'запланировано']);
  for (const m of db.prepare('SELECT name, start_date, dosage FROM medications WHERE pet_id = ?').all(pet.id))
    rows.push(['Лекарство', m.start_date, m.name, m.dosage || '']);
  for (const e of db.prepare('SELECT date, category, amount FROM expenses WHERE pet_id = ?').all(pet.id))
    rows.push(['Расход', e.date, e.category, e.amount]);

  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${pet.name}-report.csv"`);
  res.send(csv);
});

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = router;
