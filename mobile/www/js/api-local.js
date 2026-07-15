// Offline API layer. Exposes window.API with the SAME interface and route
// contract as the server build, but executes everything locally against
// window.Store (localStorage). This lets the entire existing SPA run with no
// backend — the app is fully self-contained on the device.
(function () {
  const TOKEN_KEY = 'hwp_token';
  const db = () => Store.load();
  const save = () => Store.save();
  const today = () => new Date().toISOString().slice(0, 10);

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

  function err(status, message) { const e = new Error(message); e.status = status; return e; }

  function currentUser() {
    const token = getToken();
    if (!token) throw err(401, 'Требуется авторизация');
    const uid = Number(String(token).replace(/^local:/, ''));
    const u = db().users.find((x) => x.id === uid);
    if (!u) throw err(401, 'Пользователь не найден');
    return u;
  }

  function publicUser(u) {
    return {
      id: u.id, email: u.email, name: u.name, experience: u.experience, goal: u.goal,
      units: u.units, theme: u.theme, language: u.language,
      quietFrom: u.quietFrom, quietTo: u.quietTo,
      notify: u.notify || { health: true, nutrition: true, training: true, system: true },
    };
  }

  function ownedPet(uid, petId) {
    return db().pets.find((p) => p.id === Number(petId) && p.user_id === uid) || null;
  }

  function decoratePet(pet) {
    const breed = getBreed(pet.breed_code);
    const stage = Calc.lifeStage(pet.birthdate, breed && breed.adultWeightMax);
    return {
      id: pet.id, name: pet.name, breedCode: pet.breed_code, breed: breed ? breed.name : null,
      breedInfo: breed, birthdate: pet.birthdate, ageMonths: Calc.ageInMonths(pet.birthdate),
      sex: pet.sex, sterilized: !!pet.sterilized, weight: pet.weight, avatar: pet.avatar,
      archived: !!pet.archived, stage, stageLabel: Calc.STAGE_LABELS[stage],
      weightStatus: Calc.weightStatus(pet.weight, breed),
    };
  }

  function addDays(dateStr, days) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

  function defaultVaccinations(birthdate) {
    if (!birthdate) return [];
    return [
      { name: 'Первичная вакцинация (комплексная)', due: addDays(birthdate, 8 * 7) },
      { name: 'Ревакцинация (бустер)', due: addDays(birthdate, 12 * 7) },
      { name: 'Бешенство', due: addDays(birthdate, 14 * 7) },
      { name: 'Ежегодная ревакцинация', due: addDays(birthdate, 52 * 7) },
    ];
  }
  function defaultTraining(stage) {
    if (stage === 'puppy') return [
      { command: 'Приучение к туалету / пелёнке', category: 'Базовое' },
      { command: 'Приучение к клетке', category: 'Базовое' },
      { command: 'Социализация', category: 'Базовое' },
      { command: 'Команда «Сидеть»', category: 'Команды' },
      { command: 'Команда «Ко мне»', category: 'Команды' },
      { command: 'Команда «Место»', category: 'Команды' },
    ];
    return [
      { command: 'Выдержка (по 1–3 мин)', category: 'Продвинутое' },
      { command: 'Коррекция поведения', category: 'Поведение' },
      { command: 'Команда «Рядом»', category: 'Команды' },
      { command: 'Трюк «Дай лапу»', category: 'Трюки' },
      { command: 'Трюк «Апорт»', category: 'Трюки' },
    ];
  }

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
  const CLINICS = [
    { name: 'Ветклиника «Айболит 24»', phone: '+7 (495) 100-00-01', hours: 'Круглосуточно', address: 'г. Москва, ул. Ленина, 1' },
    { name: 'Центр «ВетДоктор»', phone: '+7 (495) 100-00-02', hours: 'Круглосуточно', address: 'г. Москва, пр. Мира, 42' },
    { name: 'Клиника «Зоовет»', phone: '+7 (495) 100-00-03', hours: '08:00–23:00', address: 'г. Москва, ш. Энтузиастов, 7' },
  ];
  const EXP_CATEGORIES = ['Питание', 'Ветеринар', 'Лекарства', 'Аксессуары', 'Груминг', 'Прочее'];

  function periodStart(period) {
    const d = new Date();
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else if (period === 'quarter') d.setMonth(d.getMonth() - 3);
    else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
    else return '1970-01-01';
    return d.toISOString().slice(0, 10);
  }

  // ---- Route table: [method, regex, handler(params, body, query)] ----------
  const routes = [];
  const R = (method, pattern, handler) => {
    const names = [];
    const rx = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    routes.push({ method, rx, names, handler });
  };

  // --- Auth ---
  R('POST', '/auth/register', async (p, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password) throw err(400, 'Email и пароль обязательны');
    if (String(body.password).length < 6) throw err(400, 'Пароль должен быть не короче 6 символов');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Некорректный email');
    if (db().users.find((u) => u.email === email)) throw err(409, 'Пользователь с таким email уже существует');
    const user = {
      id: Store.nextId(), email, passwordHash: await Store.hash(String(body.password)),
      name: body.name || email.split('@')[0], experience: body.experience || null, goal: body.goal || null,
      units: 'metric', theme: 'system', language: 'ru', quietFrom: '22:00', quietTo: '08:00',
      notify: { health: true, nutrition: true, training: true, system: true },
    };
    db().users.push(user); db().session = { userId: user.id }; save();
    setToken('local:' + user.id);
    return { token: 'local:' + user.id, user: publicUser(user) };
  });

  R('POST', '/auth/login', async (p, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = db().users.find((u) => u.email === email);
    if (!user || user.passwordHash !== await Store.hash(String(body.password || ''))) throw err(401, 'Неверный email или пароль');
    db().session = { userId: user.id }; save();
    setToken('local:' + user.id);
    return { token: 'local:' + user.id, user: publicUser(user) };
  });

  R('GET', '/auth/me', () => ({ user: publicUser(currentUser()) }));

  // --- Breeds ---
  R('GET', '/breeds', () => BREEDS.map((b) => ({ code: b.code, name: b.name, group: b.group, adultWeightMin: b.adultWeightMin, adultWeightMax: b.adultWeightMax })));

  // --- Pets ---
  R('GET', '/pets', (p, body, q) => {
    const u = currentUser();
    return db().pets.filter((x) => x.user_id === u.id && (q.archived === '1' || !x.archived)).map(decoratePet);
  });
  R('POST', '/pets', (p, body) => {
    const u = currentUser();
    if (!body.name || !String(body.name).trim()) throw err(400, 'Укажите кличку');
    const pet = {
      id: Store.nextId(), user_id: u.id, name: String(body.name).trim(), breed_code: body.breedCode || null,
      birthdate: body.birthdate || null, sex: body.sex || null, sterilized: body.sterilized ? 1 : 0,
      weight: body.weight || null, avatar: body.avatar || '🐶', archived: 0, created_at: new Date().toISOString(),
    };
    db().pets.push(pet);
    if (pet.weight) db().weights.push({ id: Store.nextId(), pet_id: pet.id, date: today(), value: pet.weight });
    for (const v of defaultVaccinations(pet.birthdate)) db().vaccinations.push({ id: Store.nextId(), pet_id: pet.id, name: v.name, due_date: v.due, done: 0, done_date: null });
    const breed = getBreed(pet.breed_code);
    const stage = Calc.lifeStage(pet.birthdate, breed && breed.adultWeightMax);
    for (const t of defaultTraining(stage)) db().training.push({ id: Store.nextId(), pet_id: pet.id, command: t.command, category: t.category, status: 'not_started', minutes: 0 });
    save();
    return decoratePet(pet);
  });
  R('GET', '/pets/:petId', (p) => { const pet = mustOwn(p.petId); return decoratePet(pet); });
  R('PUT', '/pets/:petId', (p, body) => {
    const pet = mustOwn(p.petId);
    const prevWeight = pet.weight;
    Object.assign(pet, {
      name: body.name ?? pet.name, breed_code: body.breedCode ?? pet.breed_code, birthdate: body.birthdate ?? pet.birthdate,
      sex: body.sex ?? pet.sex, sterilized: body.sterilized != null ? (body.sterilized ? 1 : 0) : pet.sterilized,
      weight: body.weight ?? pet.weight, avatar: body.avatar ?? pet.avatar,
    });
    if (body.weight != null && Number(body.weight) !== Number(prevWeight))
      db().weights.push({ id: Store.nextId(), pet_id: pet.id, date: today(), value: body.weight });
    save();
    return decoratePet(pet);
  });
  R('POST', '/pets/:petId/archive', (p, body) => { const pet = mustOwn(p.petId); pet.archived = body.archived ? 1 : 0; save(); return { ok: true, archived: !!pet.archived }; });
  R('DELETE', '/pets/:petId', (p, body, q) => {
    const pet = mustOwn(p.petId);
    if ((body.confirm || q.confirm) !== 'УДАЛИТЬ') throw err(400, 'Для удаления передайте confirm="УДАЛИТЬ"');
    cascadeDeletePet(pet.id);
    save();
    return { ok: true };
  });

  // --- Health ---
  R('GET', '/pets/:petId/health/weights', (p) => {
    const pet = mustOwn(p.petId); const breed = getBreed(pet.breed_code);
    return { points: db().weights.filter((w) => w.pet_id === pet.id).sort(byDate).map((w) => ({ id: w.id, date: w.date, value: w.value })),
      norm: breed ? { min: breed.adultWeightMin, max: breed.adultWeightMax } : null };
  });
  R('POST', '/pets/:petId/health/weights', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.value || Number(body.value) <= 0) throw err(400, 'Укажите вес');
    const w = { id: Store.nextId(), pet_id: pet.id, date: body.date || today(), value: Number(body.value) };
    db().weights.push(w); pet.weight = Number(body.value); save();
    return { id: w.id };
  });
  R('DELETE', '/pets/:petId/health/weights/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('weights', (w) => w.id === Number(p.id) && w.pet_id === pet.id); save(); return { ok: true }; });

  R('GET', '/pets/:petId/health/vaccinations', (p) => { const pet = mustOwn(p.petId); return db().vaccinations.filter((v) => v.pet_id === pet.id).sort((a, b) => (a.due_date > b.due_date ? 1 : -1)); });
  R('POST', '/pets/:petId/health/vaccinations', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.name || !body.due_date) throw err(400, 'Укажите название и дату');
    const v = { id: Store.nextId(), pet_id: pet.id, name: body.name, due_date: body.due_date, done: 0, done_date: null };
    db().vaccinations.push(v); save(); return v;
  });
  R('POST', '/pets/:petId/health/vaccinations/:id/toggle', (p) => {
    const pet = mustOwn(p.petId); const v = db().vaccinations.find((x) => x.id === Number(p.id) && x.pet_id === pet.id);
    if (!v) throw err(404, 'Не найдено');
    v.done = v.done ? 0 : 1; v.done_date = v.done ? today() : null; save(); return v;
  });
  R('DELETE', '/pets/:petId/health/vaccinations/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('vaccinations', (v) => v.id === Number(p.id) && v.pet_id === pet.id); save(); return { ok: true }; });

  R('GET', '/pets/:petId/health/medications', (p) => {
    const pet = mustOwn(p.petId);
    return db().medications.filter((m) => m.pet_id === pet.id).sort((a, b) => (b.active - a.active) || ((b.start_date || '') > (a.start_date || '') ? 1 : -1));
  });
  R('POST', '/pets/:petId/health/medications', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.name) throw err(400, 'Укажите название');
    const m = { id: Store.nextId(), pet_id: pet.id, name: body.name, dosage: body.dosage || null, times: body.times || null,
      start_date: body.start_date || today(), duration_days: body.duration_days || null, kind: body.kind || 'medication', active: 1 };
    db().medications.push(m); save(); return m;
  });
  R('POST', '/pets/:petId/health/medications/:id/toggle', (p) => {
    const pet = mustOwn(p.petId); const m = db().medications.find((x) => x.id === Number(p.id) && x.pet_id === pet.id);
    if (!m) throw err(404, 'Не найдено'); m.active = m.active ? 0 : 1; save(); return m;
  });
  R('DELETE', '/pets/:petId/health/medications/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('medications', (m) => m.id === Number(p.id) && m.pet_id === pet.id); save(); return { ok: true }; });

  R('GET', '/pets/:petId/health/breed-info', (p) => {
    const pet = mustOwn(p.petId); const breed = getBreed(pet.breed_code);
    if (!breed) return { diseases: [], dangerousFoods: [], trainingTips: null };
    return { diseases: breed.diseases, dangerousFoods: breed.dangerousFoods, trainingTips: breed.trainingTips };
  });

  // --- Training ---
  R('GET', '/pets/:petId/training', (p) => { const pet = mustOwn(p.petId); return db().training.filter((t) => t.pet_id === pet.id); });
  R('POST', '/pets/:petId/training', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.command) throw err(400, 'Укажите команду');
    const t = { id: Store.nextId(), pet_id: pet.id, command: body.command, category: body.category || 'Своё', status: 'not_started', minutes: 0 };
    db().training.push(t); save(); return t;
  });
  R('PUT', '/pets/:petId/training/:id', (p, body) => {
    const pet = mustOwn(p.petId); const t = db().training.find((x) => x.id === Number(p.id) && x.pet_id === pet.id);
    if (!t) throw err(404, 'Не найдено');
    if (['not_started', 'in_progress', 'mastered'].includes(body.status)) t.status = body.status;
    if (body.addMinutes) t.minutes += Number(body.addMinutes); else if (body.minutes != null) t.minutes = Number(body.minutes);
    save(); return t;
  });
  R('DELETE', '/pets/:petId/training/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('training', (t) => t.id === Number(p.id) && t.pet_id === pet.id); save(); return { ok: true }; });

  // --- Nutrition ---
  R('GET', '/pets/:petId/nutrition/calories', (p, body, q) => {
    const pet = mustOwn(p.petId); const breed = getBreed(pet.breed_code);
    const result = Calc.dailyCalories({ weightKg: pet.weight, birthdate: pet.birthdate, sterilized: pet.sterilized, breed });
    const foodKcal = Number(q.foodKcal) || null;
    const meals = Number(q.meals) || db().meals.filter((m) => m.pet_id === pet.id).length || 2;
    const portion = foodKcal ? Calc.portionGrams(result.mer, foodKcal, meals) : null;
    return { ...result, stageLabel: Calc.STAGE_LABELS[result.stage], meals, foodKcal, portionGrams: portion };
  });
  R('GET', '/pets/:petId/nutrition/stoplist', (p) => {
    const pet = mustOwn(p.petId); const breed = getBreed(pet.breed_code);
    const common = ['Шоколад', 'Виноград и изюм', 'Ксилит (подсластитель)', 'Лук и чеснок', 'Алкоголь', 'Кофеин', 'Орехи макадамия', 'Сырое тесто'];
    const breedSpecific = breed ? breed.dangerousFoods : [];
    return { items: Array.from(new Set([...breedSpecific, ...common])), breedSpecific };
  });
  R('GET', '/pets/:petId/nutrition/meals', (p) => { const pet = mustOwn(p.petId); return db().meals.filter((m) => m.pet_id === pet.id).sort((a, b) => (a.time > b.time ? 1 : -1)); });
  R('POST', '/pets/:petId/nutrition/meals', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.time) throw err(400, 'Укажите время кормления');
    const m = { id: Store.nextId(), pet_id: pet.id, time: body.time, label: body.label || 'Кормление', grams: body.grams || null };
    db().meals.push(m); save(); return m;
  });
  R('DELETE', '/pets/:petId/nutrition/meals/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('meals', (m) => m.id === Number(p.id) && m.pet_id === pet.id); save(); return { ok: true }; });

  // --- Vet ---
  R('GET', '/vet/symptoms', () => SYMPTOMS);
  R('POST', '/vet/symptoms/assess', (p, body) => {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const picked = SYMPTOMS.filter((s) => ids.includes(s.id));
    const order = { none: 0, watch: 1, urgent: 2, emergency: 3 };
    const top = picked.reduce((a, s) => (order[s.urgency] > order[a] ? s.urgency : a), 'none');
    const advice = {
      emergency: '🚨 Срочно обратитесь в круглосуточную ветклинику или вызовите ветврача немедленно!',
      urgent: '⚠️ Запишитесь к ветеринару в течение 24 часов. Наблюдайте за состоянием.',
      watch: '👀 Понаблюдайте 1–2 дня. Если симптомы усиливаются — к врачу.',
      none: 'Выберите наблюдаемые симптомы для оценки.',
    };
    return { urgency: top, advice: advice[top], matched: picked };
  });
  R('GET', '/vet/clinics', () => CLINICS);
  R('GET', '/vet/:petId/documents', (p) => { const pet = mustOwn(p.petId); return db().documents.filter((d) => d.pet_id === pet.id).sort((a, b) => (b.created_at > a.created_at ? 1 : -1)); });
  R('POST', '/vet/:petId/documents', (p, body) => {
    const pet = mustOwn(p.petId);
    if (!body.title) throw err(400, 'Укажите название документа');
    const d = { id: Store.nextId(), pet_id: pet.id, title: body.title, kind: body.kind || 'Справка', note: body.note || null, created_at: new Date().toISOString() };
    db().documents.push(d); save(); return d;
  });
  R('DELETE', '/vet/:petId/documents/:id', (p) => { const pet = mustOwn(p.petId); removeWhere('documents', (d) => d.id === Number(p.id) && d.pet_id === pet.id); save(); return { ok: true }; });

  // --- Expenses ---
  R('GET', '/expenses/categories', () => EXP_CATEGORIES);
  R('GET', '/expenses', () => {
    const u = currentUser();
    return db().expenses.filter((e) => e.user_id === u.id).sort((a, b) => (b.date > a.date ? 1 : -1)).map((e) => ({
      ...e, pet_name: (db().pets.find((p) => p.id === e.pet_id) || {}).name || null,
    }));
  });
  R('POST', '/expenses', (p, body) => {
    const u = currentUser();
    if (!body.amount || Number(body.amount) <= 0) throw err(400, 'Укажите сумму');
    if (body.pet_id && !ownedPet(u.id, body.pet_id)) throw err(404, 'Питомец не найден');
    const e = { id: Store.nextId(), user_id: u.id, pet_id: body.pet_id ? Number(body.pet_id) : null, date: body.date || today(), category: body.category || 'Прочее', amount: Number(body.amount), note: body.note || null };
    db().expenses.push(e); save(); return e;
  });
  R('DELETE', '/expenses/:id', (p) => { const u = currentUser(); removeWhere('expenses', (e) => e.id === Number(p.id) && e.user_id === u.id); save(); return { ok: true }; });

  // --- Activity ---
  R('GET', '/pets/:petId/activity', (p) => {
    const pet = mustOwn(p.petId); const map = {};
    for (const a of db().activities.filter((x) => x.pet_id === pet.id)) { const k = a.date + '|' + a.type; map[k] = map[k] || { date: a.date, type: a.type, count: 0 }; map[k].count++; }
    return Object.values(map).sort(byDate);
  });
  R('POST', '/pets/:petId/activity', (p, body) => {
    const pet = mustOwn(p.petId); const type = ['feeding', 'walk', 'training', 'medication'].includes(body.type) ? body.type : 'walk';
    const a = { id: Store.nextId(), pet_id: pet.id, date: body.date || today(), type }; db().activities.push(a); save(); return a;
  });

  // --- Reports ---
  R('GET', '/reports/pets/:petId/dashboard', (p, body, q) => {
    const pet = mustOwn(p.petId); const from = periodStart(q.period || 'all'); const breed = getBreed(pet.breed_code);
    const weights = db().weights.filter((w) => w.pet_id === pet.id).sort(byDate).map((w) => ({ date: w.date, value: w.value }));
    const training = db().training.filter((t) => t.pet_id === pet.id);
    const trainingSummary = { mastered: 0, in_progress: 0, not_started: 0, minutes: 0 };
    for (const t of training) { trainingSummary[t.status] = (trainingSummary[t.status] || 0) + 1; trainingSummary.minutes += t.minutes || 0; }
    const vac = db().vaccinations.filter((v) => v.pet_id === pet.id);
    const meds = db().medications.filter((m) => m.pet_id === pet.id);
    const exp = db().expenses.filter((e) => e.pet_id === pet.id && e.date >= from);
    const expenses = {}; let expensesTotal = 0;
    for (const e of exp) { expenses[e.category] = (expenses[e.category] || 0) + e.amount; expensesTotal += e.amount; }
    const actMap = {};
    for (const a of db().activities.filter((x) => x.pet_id === pet.id && x.date >= from)) actMap[a.date] = (actMap[a.date] || 0) + 1;
    const activities = Object.entries(actMap).map(([date, count]) => ({ date, count })).sort(byDate);
    return {
      pet: { id: pet.id, name: pet.name, avatar: pet.avatar },
      weights, weightNorm: breed ? { min: breed.adultWeightMin, max: breed.adultWeightMax } : null,
      training: trainingSummary,
      vaccinations: { total: vac.length, done: vac.filter((v) => v.done).length },
      medications: { total: meds.length, active: meds.filter((m) => m.active).length },
      expenses, expensesTotal, activities, insight: buildInsight(pet, breed, weights),
    };
  });
  R('GET', '/reports/summary', (p, body, q) => {
    const u = currentUser(); const from = periodStart(q.period || 'year');
    const pets = db().pets.filter((x) => x.user_id === u.id && !x.archived);
    const expensesByPet = pets.map((pt) => ({ id: pt.id, name: pt.name, total: db().expenses.filter((e) => e.pet_id === pt.id && e.date >= from).reduce((s, e) => s + e.amount, 0) }));
    const petIds = new Set(db().pets.filter((x) => x.user_id === u.id).map((x) => x.id));
    const vac = db().vaccinations.filter((v) => petIds.has(v.pet_id));
    const weightSeries = pets.map((pt) => ({ id: pt.id, name: pt.name, points: db().weights.filter((w) => w.pet_id === pt.id).sort(byDate).map((w) => ({ date: w.date, value: w.value })) }));
    const totalExpenses = expensesByPet.reduce((s, r) => s + r.total, 0);
    const months = Math.max(1, monthsBetween(from));
    return { petsCount: pets.length, expensesByPet, totalExpenses, avgMonthly: Math.round(totalExpenses / months),
      vaccinations: { total: vac.length, done: vac.filter((v) => v.done).length }, weightSeries };
  });

  // --- Settings ---
  R('PUT', '/settings/profile', (p, body) => {
    const u = currentUser();
    if (body.name != null) u.name = body.name;
    if (['metric', 'imperial'].includes(body.units)) u.units = body.units;
    if (['light', 'dark', 'system'].includes(body.theme)) u.theme = body.theme;
    if (['ru', 'en'].includes(body.language)) u.language = body.language;
    if (body.quietFrom != null) u.quietFrom = body.quietFrom;
    if (body.quietTo != null) u.quietTo = body.quietTo;
    if (body.notify) u.notify = { ...(u.notify || {}), ...body.notify };
    save(); return { user: publicUser(u) };
  });
  R('DELETE', '/settings/account', (p, body, q) => {
    const u = currentUser();
    if ((body.confirm || q.confirm) !== 'УДАЛИТЬ') throw err(400, 'Для удаления аккаунта передайте confirm="УДАЛИТЬ"');
    for (const pt of db().pets.filter((x) => x.user_id === u.id)) cascadeDeletePet(pt.id);
    removeWhere('expenses', (e) => e.user_id === u.id);
    removeWhere('users', (x) => x.id === u.id);
    db().session = null; save(); setToken(null);
    return { ok: true };
  });

  // ---- helpers -------------------------------------------------------------
  function mustOwn(petId) { const u = currentUser(); const pet = ownedPet(u.id, petId); if (!pet) throw err(404, 'Питомец не найден'); return pet; }
  function removeWhere(table, pred) { const arr = db()[table]; for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1); }
  function cascadeDeletePet(petId) {
    for (const t of ['weights', 'vaccinations', 'medications', 'training', 'meals', 'activities', 'documents', 'expenses'])
      removeWhere(t, (r) => r.pet_id === petId);
    removeWhere('pets', (p) => p.id === petId);
  }
  function byDate(a, b) { return a.date > b.date ? 1 : a.date < b.date ? -1 : 0; }
  function monthsBetween(fromStr) { const f = new Date(fromStr); const n = new Date(); return (n.getFullYear() - f.getFullYear()) * 12 + (n.getMonth() - f.getMonth()) + 1; }
  function buildInsight(pet, breed, weights) {
    if (!breed || !pet.weight) return 'Заполните породу и вес, чтобы получать персональные рекомендации.';
    const ws = Calc.weightStatus(pet.weight, breed); const stage = Calc.lifeStage(pet.birthdate, breed.adultWeightMax);
    if (ws.status === 'over') return `${pet.name} набирает вес выше нормы для породы (${breed.adultWeightMin}–${breed.adultWeightMax} кг) — стоит скорректировать рацион и увеличить активность.`;
    if (ws.status === 'under') return `${pet.name} весит ниже нормы для породы — проверьте калорийность рациона и обратитесь к ветеринару.`;
    if (weights.length >= 2) { const delta = weights[weights.length - 1].value - weights[0].value; if (stage === 'puppy' && delta > 0) return `${pet.name} стабильно растёт (+${delta.toFixed(1)} кг) — это хороший признак здорового развития щенка.`; }
    return `${pet.name} в пределах нормы веса для породы. Так держать! 🐾`;
  }

  function csvExport(pet) {
    const rows = [['Раздел', 'Дата', 'Показатель', 'Значение']];
    for (const w of db().weights.filter((w) => w.pet_id === pet.id).sort(byDate)) rows.push(['Вес', w.date, 'кг', w.value]);
    for (const v of db().vaccinations.filter((v) => v.pet_id === pet.id)) rows.push(['Прививка', v.due_date, v.name, v.done ? 'выполнено' : 'запланировано']);
    for (const m of db().medications.filter((m) => m.pet_id === pet.id)) rows.push(['Лекарство', m.start_date, m.name, m.dosage || '']);
    for (const e of db().expenses.filter((e) => e.pet_id === pet.id)) rows.push(['Расход', e.date, e.category, e.amount]);
    const cell = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\n');
  }
  function jsonExport() {
    const u = currentUser(); const pets = db().pets.filter((p) => p.user_id === u.id); const ids = new Set(pets.map((p) => p.id));
    const pick = (t) => db()[t].filter((r) => ids.has(r.pet_id));
    return JSON.stringify({ exportedAt: new Date().toISOString(), user: publicUser(u), pets,
      weights: pick('weights'), vaccinations: pick('vaccinations'), medications: pick('medications'),
      training: pick('training'), meals: pick('meals'), documents: pick('documents'),
      expenses: db().expenses.filter((e) => e.user_id === u.id), activities: pick('activities') }, null, 2);
  }

  // ---- dispatcher ----------------------------------------------------------
  function parse(path) {
    const [rawPath, qs] = path.split('?');
    const query = {};
    if (qs) for (const kv of qs.split('&')) { const [k, v] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
    return { rawPath, query };
  }

  async function request(method, path, body) {
    const { rawPath, query } = parse(path);
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = rawPath.match(r.rx);
      if (!m) continue;
      const params = {}; r.names.forEach((n, i) => (params[n] = m[i + 1]));
      // simulate async + surface errors like the network client did
      return await r.handler(params, body || {}, query);
    }
    throw err(404, 'Не найдено');
  }

  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.API = {
    getToken, setToken,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p, b) => request('DELETE', p, b),
    async download(path, filename) {
      const { rawPath } = parse(path);
      let content, mime;
      const csv = rawPath.match(/^\/reports\/pets\/([^/]+)\/export\.csv$/);
      if (csv) { content = csvExport(mustOwn(csv[1])); mime = 'text/csv;charset=utf-8'; }
      else if (rawPath === '/settings/export') { content = jsonExport(); mime = 'application/json'; }
      else throw err(404, 'Не найдено');
      triggerDownload(filename, content, mime);
    },
  };
})();
