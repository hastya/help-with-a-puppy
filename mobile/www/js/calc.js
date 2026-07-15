// Domain calculations (browser build). Exposed as window.Calc.
// Mirror of server/lib/calc.js so the offline app computes identically.
(function () {
  function ageInMonths(birthdate, now = new Date()) {
    if (!birthdate) return null;
    const b = new Date(birthdate);
    if (isNaN(b)) return null;
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    return Math.max(0, months);
  }

  function lifeStage(birthdate, adultWeightMax = 20) {
    const months = ageInMonths(birthdate);
    if (months == null) return 'unknown';
    if (months < 12) return 'puppy';
    const seniorMonths = adultWeightMax >= 25 ? 7 * 12 : 9 * 12;
    if (months >= seniorMonths) return 'senior';
    return 'adult';
  }

  const STAGE_LABELS = { puppy: 'Щенок', adult: 'Взрослая собака', senior: 'Пожилая', unknown: '—' };

  function rer(weightKg) {
    if (!weightKg || weightKg <= 0) return 0;
    return 70 * Math.pow(weightKg, 0.75);
  }

  function merFactor({ stage, sterilized, activityFactor = 1.6 }) {
    if (stage === 'puppy') return 2.5;
    if (stage === 'senior') return 1.3;
    return sterilized ? Math.min(activityFactor, 1.6) : activityFactor;
  }

  function dailyCalories({ weightKg, birthdate, sterilized, breed }) {
    const stage = lifeStage(birthdate, breed && breed.adultWeightMax);
    const base = rer(weightKg);
    const factor = merFactor({ stage, sterilized, activityFactor: breed && breed.activityFactor });
    return { stage, rer: Math.round(base), factor, mer: Math.round(base * factor) };
  }

  function portionGrams(dailyKcal, foodKcalPer100g, mealsPerDay = 2) {
    if (!foodKcalPer100g || foodKcalPer100g <= 0 || mealsPerDay <= 0) return 0;
    const gramsPerDay = (dailyKcal / foodKcalPer100g) * 100;
    return Math.round(gramsPerDay / mealsPerDay);
  }

  function weightStatus(weightKg, breed) {
    const min = (breed && breed.adultWeightMin) || 0;
    const max = (breed && breed.adultWeightMax) || 0;
    if (!weightKg || !max) return { status: 'unknown', min, max };
    if (weightKg < min * 0.92) return { status: 'under', min, max };
    if (weightKg > max * 1.08) return { status: 'over', min, max };
    return { status: 'normal', min, max };
  }

  window.Calc = { ageInMonths, lifeStage, STAGE_LABELS, rer, merFactor, dailyCalories, portionGrams, weightStatus };
})();
