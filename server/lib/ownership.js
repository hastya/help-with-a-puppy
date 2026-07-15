const { db } = require('../db');

/**
 * Returns the pet row if it belongs to the given user, otherwise null.
 * Used by every pet-scoped route to enforce data isolation between accounts.
 */
function ownedPet(userId, petId) {
  const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND user_id = ?').get(petId, userId);
  return pet || null;
}

/** Express middleware factory: validates :petId in the path belongs to req.user. */
function requirePet(req, res, next) {
  const petId = Number(req.params.petId);
  const pet = ownedPet(req.user.id, petId);
  if (!pet) return res.status(404).json({ error: 'Питомец не найден' });
  req.pet = pet;
  next();
}

module.exports = { ownedPet, requirePet };
