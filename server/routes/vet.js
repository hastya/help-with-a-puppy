const express = require('express');
const { db } = require('../db');
const { requirePet } = require('../lib/ownership');

const router = express.Router({ mergeParams: true });

// ---- Symptom checker (static reference, no pet scope) --------------------
// Urgency: 'emergency' (немедленно), 'urgent' (в течение суток), 'watch' (наблюдать).
const SYMPTOMS = [
  { id: 'no_breath', text: 'Затруднённое дыхание, синюшность языка', urgency: 'emergency' },
  { id: 'seizure', text: 'Судороги / потеря сознания', urgency: 'emergency' },
  { id: 'bloat', text: 'Вздутый твёрдый живот, безрезультатные попытки рвоты', urgency: 'emergency' },
  { id: 'blood', text: 'Кровь в рвоте или стуле', urgency: 'emergency' },
  { id: 'poison', text: 'Съел потенциально ядовитое (шоколад, крысиный яд)', urgency: 'emergency' },
  { id: 'vomit_repeat', text: 'Многократная рвота более суток', urgency: 'urgent' },
  { id: 'no_eat', text: 'Отказ от еды более 24 часов', urgency: 'urgent' },
  { id: 'limping', text: 'Сильная хромота, не наступает на лапу', urgency: 'urgent' },
  { id: 'fever', text: 'Температура выше 39.5 °C', urgency: 'urgent' },
  { id: 'lethargy', text: 'Вялость, апатия', urgency: 'watch' },
  { id: 'soft_stool', text: 'Мягкий стул без крови', urgency: 'watch' },
  { id: 'scratch', text: 'Зуд, расчёсывание', urgency: 'watch' },
];

router.get('/symptoms', (req, res) => res.json(SYMPTOMS));

router.post('/symptoms/assess', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const picked = SYMPTOMS.filter((s) => ids.includes(s.id));
  const order = { none: 0, watch: 1, urgent: 2, emergency: 3 };
  const top = picked.reduce((a, s) => (order[s.urgency] > order[a] ? s.urgency : a), 'none');
  const advice = {
    emergency: '🚨 Срочно обратитесь в круглосуточную ветклинику или вызовите ветврача немедленно!',
    urgent: '⚠️ Запишитесь к ветеринару в течение 24 часов. Наблюдайте за состоянием.',
    watch: '👀 Понаблюдайте 1–2 дня. Если симптомы усиливаются — к врачу.',
    none: 'Выберите наблюдаемые симптомы для оценки.',
  };
  res.json({ urgency: top, advice: advice[top], matched: picked });
});

// ---- Emergency clinics (demo directory) ---------------------------------
router.get('/clinics', (req, res) => {
  res.json([
    { name: 'Ветклиника «Айболит 24»', phone: '+7 (495) 100-00-01', hours: 'Круглосуточно', address: 'г. Москва, ул. Ленина, 1' },
    { name: 'Центр «ВетДоктор»', phone: '+7 (495) 100-00-02', hours: 'Круглосуточно', address: 'г. Москва, пр. Мира, 42' },
    { name: 'Клиника «Зоовет»', phone: '+7 (495) 100-00-03', hours: '08:00–23:00', address: 'г. Москва, ш. Энтузиастов, 7' },
  ]);
});

// ---- Vet passport documents (pet-scoped) --------------------------------
router.get('/:petId/documents', requirePet, (req, res) => {
  res.json(db.prepare('SELECT * FROM documents WHERE pet_id = ? ORDER BY created_at DESC').all(req.pet.id));
});

router.post('/:petId/documents', requirePet, (req, res) => {
  const { title, kind, note } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Укажите название документа' });
  const info = db.prepare('INSERT INTO documents (pet_id, title, kind, note) VALUES (?, ?, ?, ?)')
    .run(req.pet.id, title, kind || 'Справка', note || null);
  res.status(201).json(db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:petId/documents/:id', requirePet, (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND pet_id = ?').run(Number(req.params.id), req.pet.id);
  res.json({ ok: true });
});

module.exports = router;
