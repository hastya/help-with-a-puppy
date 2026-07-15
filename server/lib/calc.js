// Domain calculations shared across the API: life-stage detection, calorie
// requirements (RER/MER), portion sizes and weight-norm evaluation.

/**
 * Age of a dog in whole months from a birthdate (ISO string).
 */
function ageInMonths(birthdate, now = new Date()) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b)) return null;
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Life-stage status. Puppy < 12 months. Senior threshold depends on adult
 * weight (large breeds age faster): >7y for big dogs, >9y for small.
 */
function lifeStage(birthdate, adultWeightMax = 20) {
  const months = ageInMonths(birthdate);
  if (months == null) return 'unknown';
  if (months < 12) return 'puppy';
  const seniorMonths = adultWeightMax >= 25 ? 7 * 12 : 9 * 12;
  if (months >= seniorMonths) return 'senior';
  return 'adult';
}

const STAGE_LABELS = { puppy: 'Щенок', adult: 'Взрослая собака', senior: 'Пожилая', unknown: '—' };

/**
 * Resting Energy Requirement (kcal/day): RER = 70 * (weightKg ^ 0.75).
 */
function rer(weightKg) {
  if (!weightKg || weightKg <= 0) return 0;
  return 70 * Math.pow(weightKg, 0.75);
}

/**
 * Maintenance Energy Requirement (kcal/day) = RER * lifecycle/activity factor.
 * Factors follow common veterinary guidelines.
 */
function merFactor({ stage, sterilized, activityFactor = 1.6 }) {
  if (stage === 'puppy') return 2.5; // growing puppies need ~2-3x RER
  if (stage === 'senior') return 1.3;
  // adult
  return sterilized ? Math.min(activityFactor, 1.6) : activityFactor;
}

function dailyCalories({ weightKg, birthdate, sterilized, breed }) {
  const stage = lifeStage(birthdate, breed?.adultWeightMax);
  const base = rer(weightKg);
  const factor = merFactor({ stage, sterilized, activityFactor: breed?.activityFactor });
  return {
    stage,
    rer: Math.round(base),
    factor,
    mer: Math.round(base * factor),
  };
}

/**
 * Portion in grams per meal given daily kcal, food energy density
 * (kcal/100g) and number of meals per day.
 */
function portionGrams(dailyKcal, foodKcalPer100g, mealsPerDay = 2) {
  if (!foodKcalPer100g || foodKcalPer100g <= 0 || mealsPerDay <= 0) return 0;
  const gramsPerDay = (dailyKcal / foodKcalPer100g) * 100;
  return Math.round(gramsPerDay / mealsPerDay);
}

/**
 * Evaluate current weight against breed norm.
 * Returns { status: 'under'|'normal'|'over', min, max }.
 */
function weightStatus(weightKg, breed) {
  const min = breed?.adultWeightMin ?? 0;
  const max = breed?.adultWeightMax ?? 0;
  if (!weightKg || !max) return { status: 'unknown', min, max };
  if (weightKg < min * 0.92) return { status: 'under', min, max };
  if (weightKg > max * 1.08) return { status: 'over', min, max };
  return { status: 'normal', min, max };
}

module.exports = {
  ageInMonths,
  lifeStage,
  STAGE_LABELS,
  rer,
  merFactor,
  dailyCalories,
  portionGrams,
  weightStatus,
};
