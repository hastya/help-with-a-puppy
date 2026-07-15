// All screen renderers. Exposed as window.Views.
(function () {
  const { el, toast, modal, confirm, fmtDate, money, ageLabel } = UI;
  const Views = {};
  window.Views = Views;

  let breedCache = null;
  async function loadBreeds() {
    if (!breedCache) breedCache = await API.get('/breeds');
    return breedCache;
  }

  const AVATARS = ['🐶', '🐕', '🦮', '🐩', '🐕‍🦺', '🌭', '🦴', '🐾'];

  // =====================================================================
  //  AUTH  +  ONBOARDING
  // =====================================================================
  Views.Auth = function (App) {
    const wrap = el('div.auth-wrap');
    const card = el('div.auth-card');
    wrap.appendChild(card);
    let mode = 'login';
    const onboarding = { experience: null, goal: null };

    function render() {
      card.innerHTML = '';
      card.appendChild(el('div.auth-logo', '🐶'));
      card.appendChild(el('h1', 'Help with a puppy'));
      card.appendChild(el('div.auth-sub', 'Персональный уход, обучение и здоровье вашей собаки'));
      mode === 'login' ? loginForm() : registerForm();
    }

    function loginForm() {
      const email = el('input', { type: 'email', placeholder: 'you@example.com' });
      const pass = el('input', { type: 'password', placeholder: '••••••••' });
      const submit = el('button.btn.block', 'Войти');
      const form = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const { token, user } = await API.post('/auth/login', { email: email.value, password: pass.value });
          await enter(token, user);
        } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
      }}, [
        field('Email', email), field('Пароль', pass), submit,
      ]);
      card.appendChild(form);
      card.appendChild(el('div.auth-switch', ['Нет аккаунта? ', el('a', { onclick: () => { mode = 'register'; render(); } }, 'Создать')]));
    }

    function registerForm() {
      // Onboarding step: quick 3-question quiz, then account fields.
      const expChips = chipGroup(['Впервые завожу собаку', 'Есть опыт', 'Профессионал'], (v) => onboarding.experience = v);
      const goalChips = chipGroup(['Здоровье и уход', 'Дрессировка', 'Правильное питание', 'Всё вместе'], (v) => onboarding.goal = v);
      const name = el('input', { placeholder: 'Как вас зовут' });
      const email = el('input', { type: 'email', placeholder: 'you@example.com' });
      const pass = el('input', { type: 'password', placeholder: 'минимум 6 символов' });
      const submit = el('button.btn.block', 'Создать аккаунт');
      const form = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const { token, user } = await API.post('/auth/register', {
            email: email.value, password: pass.value, name: name.value,
            experience: onboarding.experience, goal: onboarding.goal,
          });
          await enter(token, user);
        } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
      }}, [
        el('div.field', [el('label', 'Ваш опыт с собаками'), expChips]),
        el('div.field', [el('label', 'Главная цель'), goalChips]),
        field('Имя', name), field('Email', email), field('Пароль', pass),
        submit,
      ]);
      card.appendChild(form);
      card.appendChild(el('div.auth-switch', ['Уже есть аккаунт? ', el('a', { onclick: () => { mode = 'login'; render(); } }, 'Войти')]));
    }

    async function enter(token, user) {
      API.setToken(token);
      App.state.user = user;
      App.applyTheme(user.theme);
      await App.reloadPets();
      App.state.tab = App.state.pets.length ? 'home' : 'pets';
      App.render();
      if (!App.state.pets.length) setTimeout(() => Views.petForm(App), 300);
    }

    render();
    return wrap;
  };

  function chipGroup(options, onPick) {
    const wrap = el('div.chips');
    options.forEach((opt) => {
      const chip = el('div.chip', opt, { });
      chip.addEventListener('click', () => {
        wrap.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        onPick(opt);
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }
  function field(label, input) { return el('div.field', [el('label', label), input]); }

  // =====================================================================
  //  PET FORM (create / edit)
  // =====================================================================
  Views.petForm = async function (App, pet) {
    const breeds = await loadBreeds();
    const editing = !!pet;
    const data = pet || { avatar: '🐶', sex: 'male', sterilized: false };

    modal((close) => {
      const name = el('input', { placeholder: 'Кличка', value: data.name || '' });
      const breed = el('select', breeds.map((b) =>
        el('option', { value: b.code, ...(b.code === data.breedCode ? { selected: true } : {}) }, `${b.name} (${b.adultWeightMin}–${b.adultWeightMax} кг)`)));
      const birth = el('input', { type: 'date', value: data.birthdate || '' });
      const sex = el('select', [
        el('option', { value: 'male', ...(data.sex === 'male' ? { selected: true } : {}) }, 'Кобель'),
        el('option', { value: 'female', ...(data.sex === 'female' ? { selected: true } : {}) }, 'Сука'),
      ]);
      const weight = el('input', { type: 'number', step: '0.1', min: '0', placeholder: 'кг', value: data.weight || '' });
      const ster = el('input', { type: 'checkbox', ...(data.sterilized ? { checked: true } : {}) });

      // avatar picker
      let chosenAvatar = data.avatar || '🐶';
      const avatarRow = el('div.chips', AVATARS.map((a) => {
        const c = el('div.chip' + (a === chosenAvatar ? '.selected' : ''), a);
        c.addEventListener('click', () => { chosenAvatar = a; avatarRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('selected')); c.classList.add('selected'); });
        return c;
      }));

      const save = el('button.btn', editing ? 'Сохранить' : 'Добавить');
      save.addEventListener('click', async () => {
        if (!name.value.trim()) return toast('Укажите кличку', 'err');
        save.disabled = true;
        const payload = {
          name: name.value.trim(), breedCode: breed.value, birthdate: birth.value || null,
          sex: sex.value, sterilized: ster.checked, weight: weight.value ? Number(weight.value) : null,
          avatar: chosenAvatar,
        };
        try {
          if (editing) { await API.put('/pets/' + pet.id, payload); toast('Профиль обновлён', 'ok'); }
          else { const np = await API.post('/pets', payload); App.state.currentPetId = np.id; toast('Питомец добавлен 🎉', 'ok'); }
          await App.reloadPets();
          close(); App.render();
        } catch (err) { toast(err.message, 'err'); save.disabled = false; }
      });

      return el('div', [
        el('h2', editing ? 'Редактировать питомца' : 'Новый член семьи'),
        el('div.field', [el('label', 'Аватар'), avatarRow]),
        field('Кличка', name),
        field('Порода', breed),
        el('div.row', [field('Дата рождения', birth), field('Пол', sex)]),
        el('div.row', [field('Текущий вес, кг', weight)]),
        el('label.checkbox', { style: 'margin-top:8px' }, [ster, 'Стерилизован / кастрирован']),
        el('div.modal-actions', [
          el('button.btn.outline', { onclick: close }, 'Отмена'),
          save,
        ]),
      ]);
    });
  };

  // =====================================================================
  //  HOME  — сводка на сегодня
  // =====================================================================
  Views.Home = function (App) {
    const wrap = el('div');
    const pet = App.currentPet();
    if (!pet) {
      wrap.appendChild(emptyState('🐾', 'Добавьте первого питомца', 'Нажмите «＋ Член семьи», чтобы начать', () => Views.petForm(App)));
      return wrap;
    }

    wrap.appendChild(el('div.card', [
      el('div.hstack', [
        el('div.ava', { style: 'width:56px;height:56px;font-size:30px;border-radius:50%;background:var(--primary-container);display:grid;place-items:center' }, pet.avatar),
        el('div', { style: 'flex:1' }, [
          el('div', { style: 'font-size:20px;font-weight:700' }, pet.name),
          el('div.muted', `${pet.breed || 'Порода не указана'} · ${ageLabel(pet.ageMonths)}`),
        ]),
        el('span.pill.info', pet.stageLabel),
      ]),
      weightBadge(pet),
    ]));

    const grid = el('div.grid-2');
    wrap.appendChild(grid);
    grid.appendChild(loadingCard('Ближайшие задачи'));
    grid.appendChild(loadingCard('Прогресс обучения'));

    // Load today's data
    (async () => {
      const [vac, meds, training] = await Promise.all([
        API.get(`/pets/${pet.id}/health/vaccinations`),
        API.get(`/pets/${pet.id}/health/medications`),
        API.get(`/pets/${pet.id}/training`),
      ]);
      grid.children[0].replaceWith(upcomingCard(vac, meds));
      grid.children[1] && grid.children[1].replaceWith(trainingMiniCard(App, training));
    })();

    // Quick actions
    wrap.appendChild(el('div.section-title', '⚡ Быстрые действия'));
    wrap.appendChild(el('div.grid-3', [
      quickAction('⚖️', 'Взвесить', () => weightPrompt(App, pet)),
      quickAction('🍽️', 'Кормление', () => logActivity(App, pet, 'feeding', 'Кормление отмечено')),
      quickAction('🚶', 'Прогулка', () => logActivity(App, pet, 'walk', 'Прогулка отмечена')),
    ]));

    return wrap;
  };

  function weightBadge(pet) {
    const ws = pet.weightStatus || {};
    if (!pet.weight) return el('div.muted.mt', 'Добавьте вес, чтобы отслеживать норму.');
    const map = { normal: ['ok', 'В норме'], over: ['bad', 'Выше нормы'], under: ['warn', 'Ниже нормы'], unknown: ['info', '—'] };
    const [cls, label] = map[ws.status] || map.unknown;
    return el('div.spread.mt', [
      el('div', [el('div', { style: 'font-size:22px;font-weight:800' }, pet.weight + ' кг'),
        el('div.muted', ws.min ? `Норма породы: ${ws.min}–${ws.max} кг` : '')]),
      el('span.pill.' + cls, label),
    ]);
  }

  function upcomingCard(vac, meds) {
    const items = [];
    const now = new Date();
    vac.filter((v) => !v.done).slice(0, 3).forEach((v) =>
      items.push(['💉', v.name, fmtDate(v.due_date), new Date(v.due_date) < now ? 'bad' : 'info']));
    meds.filter((m) => m.active).slice(0, 3).forEach((m) =>
      items.push(['💊', m.name, m.dosage || 'по расписанию', 'info']));
    const card = el('div.card', [el('h3', '📅 Ближайшие задачи')]);
    if (!items.length) card.appendChild(el('div.empty', 'Нет активных напоминаний 🎉'));
    items.forEach(([ico, title, sub, cls]) => card.appendChild(el('div.list-item', [
      el('div', { style: 'font-size:20px' }, ico),
      el('div.li-main', [el('div.li-title', title), el('div.li-sub', sub)]),
    ])));
    return card;
  }

  function trainingMiniCard(App, training) {
    const total = training.length || 1;
    const mastered = training.filter((t) => t.status === 'mastered').length;
    const pct = Math.round((mastered / total) * 100);
    return el('div.card', [
      el('h3', '🎓 Прогресс обучения'),
      el('div', { style: 'font-size:30px;font-weight:800;color:var(--primary-dark)' }, pct + '%'),
      el('div.muted', `${mastered} из ${training.length} команд освоено`),
      el('div.progress.mt', [el('span', { style: `width:${pct}%` })]),
      el('button.btn.ghost.small.mt', { onclick: () => { App.state.tab = 'pets'; App.state.subtab = 'training'; App.render(); } }, 'Перейти к дрессировке →'),
    ]);
  }

  function quickAction(ico, label, onclick) {
    return el('div.card.tight', { style: 'text-align:center;cursor:pointer', onclick }, [
      el('div', { style: 'font-size:26px' }, ico), el('div', { style: 'font-weight:600;font-size:14px' }, label),
    ]);
  }

  async function weightPrompt(App, pet) {
    modal((close) => {
      const val = el('input', { type: 'number', step: '0.1', placeholder: 'кг', value: pet.weight || '' });
      const save = el('button.btn', 'Сохранить');
      save.addEventListener('click', async () => {
        if (!val.value) return toast('Введите вес', 'err');
        await API.post(`/pets/${pet.id}/health/weights`, { value: Number(val.value) });
        await App.reloadPets(); toast('Вес записан', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новое взвешивание'), field('Вес, кг', val),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  async function logActivity(App, pet, type, msg) {
    try { await API.post(`/pets/${pet.id}/activity`, { type }); toast(msg, 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }

  // ---- shared small helpers ----
  function emptyState(icon, title, sub, onAction) {
    const wrap = el('div.card', [el('div.empty', [
      el('div.big', icon), el('h3', title), el('div.muted', sub),
    ])]);
    if (onAction) wrap.querySelector('.empty').appendChild(el('button.btn.mt', { onclick: onAction, style: 'margin-top:16px' }, '＋ Добавить'));
    return wrap;
  }
  function loadingCard(title) { return el('div.card', [el('h3', title), el('div.loader', el('div.spin'))]); }

  Views._loadBreeds = loadBreeds;
  Views._field = field;
  Views._emptyState = emptyState;
  Views._loadingCard = loadingCard;
  Views._AVATARS = AVATARS;
})();
