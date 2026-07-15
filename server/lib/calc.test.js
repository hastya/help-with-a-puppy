const { test } = require('node:test');
const assert = require('node:assert');
const calc = require('./calc');

test('lifeStage: puppy under 12 months', () => {
  const dob = new Date();
  dob.setMonth(dob.getMonth() - 6);
  assert.equal(calc.lifeStage(dob.toISOString()), 'puppy');
});

test('lifeStage: adult between 1 and senior threshold', () => {
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 3);
  assert.equal(calc.lifeStage(dob.toISOString(), 12), 'adult');
});

test('lifeStage: senior for old small dog', () => {
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 10);
  assert.equal(calc.lifeStage(dob.toISOString(), 8), 'senior');
});

test('rer follows 70 * weight^0.75', () => {
  assert.equal(Math.round(calc.rer(10)), Math.round(70 * Math.pow(10, 0.75)));
});

test('portionGrams computes per-meal grams', () => {
  // 500 kcal/day, food 350 kcal/100g, 2 meals => ~71 g/meal
  assert.equal(calc.portionGrams(500, 350, 2), 71);
});

test('weightStatus flags over/under/normal', () => {
  const breed = { adultWeightMin: 10, adultWeightMax: 14 };
  assert.equal(calc.weightStatus(12, breed).status, 'normal');
  assert.equal(calc.weightStatus(20, breed).status, 'over');
  assert.equal(calc.weightStatus(5, breed).status, 'under');
});

test('dailyCalories: sterilized adult uses capped factor', () => {
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 3);
  const r = calc.dailyCalories({ weightKg: 20, birthdate: dob.toISOString(), sterilized: true, breed: { adultWeightMax: 30, activityFactor: 1.8 } });
  assert.equal(r.stage, 'adult');
  assert.ok(r.factor <= 1.6);
  assert.ok(r.mer > r.rer);
});
