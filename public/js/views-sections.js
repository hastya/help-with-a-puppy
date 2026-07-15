// Pets section (Health / Training / Nutrition / Vet), Reports, Settings.
(function () {
  const { el, toast, modal, confirm, fmtDate, money, ageLabel } = UI;
  const V = window.Views;
  const field = V._field;
  const emptyState = V._emptyState;

  // =====================================================================
  //  PETS SECTION with sub-tabs
  // =====================================================================
  V.Pets = function (App) {
    const wrap = el('div');
    const pet = App.currentPet();
    if (!pet) return emptyState('🐾', 'Нет питомцев', 'Добавьте собаку, чтобы открыть разделы ухода', () => V.petForm(App));

    const tabs = [['health', '🏥 Здоровье'], ['training', '🎓 Дрессировка'], ['nutrition', '🍲 Питание'], ['vet', '🚑 Ветеринар']];
    wrap.appendChild(el('div.subtabs', tabs.map(([id, label]) =>
      el('div.subtab' + (App.state.subtab === id ? '.active' : ''), { onclick: () => { App.state.subtab = id; App.render(); } }, label))));

    const body = el('div');
    wrap.appendChild(body);
    const map = { health: healthView, training: trainingView, nutrition: nutritionView, vet: vetView };
    (map[App.state.subtab] || healthView)(App, pet, body);
    return wrap;
  };

  // ---------------------------------------------------------------- HEALTH
  function healthView(App, pet, body) {
    body.appendChild(V._loadingCard('Здоровье'));
    (async () => {
      const [weights, vac, meds, breedInfo] = await Promise.all([
        API.get(`/pets/${pet.id}/health/weights`),
        API.get(`/pets/${pet.id}/health/vaccinations`),
        API.get(`/pets/${pet.id}/health/medications`),
        API.get(`/pets/${pet.id}/health/breed-info`),
      ]);
      body.innerHTML = '';

      // Weight chart
      const wc = el('div.card', [el('div.spread', [el('h3', '⚖️ Трекер веса'),
        el('button.btn.small', { onclick: () => weightModal(App, pet) }, '＋ Взвесить')])]);
      const canvas = el('canvas', { height: '200' });
      wc.appendChild(canvas);
      body.appendChild(wc);
      drawWeightChart(canvas, weights);

      // Vaccinations
      const vcard = el('div.card', [el('div.spread', [el('h3', '💉 Календарь прививок'),
        el('button.btn.small.secondary', { onclick: () => vacModal(App, pet) }, '＋')])]);
      if (!vac.length) vcard.appendChild(el('div.empty', 'Нет записей'));
      vac.forEach((v) => vcard.appendChild(vacRow(App, pet, v)));
      body.appendChild(vcard);

      // Medications / treatments
      const mcard = el('div.card', [el('div.spread', [el('h3', '💊 Аптечка и обработки'),
        el('button.btn.small.secondary', { onclick: () => medModal(App, pet) }, '＋')])]);
      if (!meds.length) mcard.appendChild(el('div.empty', 'Нет активных курсов'));
      meds.forEach((m) => mcard.appendChild(medRow(App, pet, m)));
      body.appendChild(mcard);

      // Breed features
      if (breedInfo.diseases && breedInfo.diseases.length) {
        body.appendChild(el('div.card', [
          el('h3', '🧬 Особенности породы'),
          el('div.muted', { style: 'margin-bottom:8px' }, 'На что обратить внимание:'),
          el('div.tag-list', breedInfo.diseases.map((d) => el('span.tag', d))),
          breedInfo.trainingTips ? el('div.mt', { style: 'font-style:italic' }, '💡 ' + breedInfo.trainingTips) : null,
        ]));
      }
    })();
  }

  function vacRow(App, pet, v) {
    const overdue = !v.done && new Date(v.due_date) < new Date();
    return el('div.list-item', [
      el('input', { type: 'checkbox', ...(v.done ? { checked: true } : {}), onchange: async () => {
        await API.post(`/pets/${pet.id}/health/vaccinations/${v.id}/toggle`); toast(v.done ? 'Отменено' : 'Отмечено ✔', 'ok'); App.render();
      }}),
      el('div.li-main', [el('div.li-title', v.name),
        el('div.li-sub', (v.done ? 'Выполнено ' + fmtDate(v.done_date) : 'До ' + fmtDate(v.due_date)))]),
      overdue ? el('span.pill.bad', 'Просрочено') : (v.done ? el('span.pill.ok', '✔') : el('span.pill.info', 'Ждёт')),
    ]);
  }

  function medRow(App, pet, m) {
    return el('div.list-item', [
      el('div', { style: 'font-size:20px' }, m.kind === 'parasite' ? '🐛' : '💊'),
      el('div.li-main', [el('div.li-title', m.name),
        el('div.li-sub', [m.dosage, m.times].filter(Boolean).join(' · ') || 'без деталей')]),
      el('button.btn.ghost.small', { onclick: async () => {
        await API.post(`/pets/${pet.id}/health/medications/${m.id}/toggle`); App.render();
      }}, m.active ? 'Завершить' : 'Возобновить'),
    ]);
  }

  function weightModal(App, pet) {
    modal((close) => {
      const val = el('input', { type: 'number', step: '0.1', placeholder: 'кг' });
      const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const save = el('button.btn', 'Сохранить');
      save.addEventListener('click', async () => {
        if (!val.value) return toast('Введите вес', 'err');
        await API.post(`/pets/${pet.id}/health/weights`, { value: Number(val.value), date: date.value });
        await App.reloadPets(); toast('Записано', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новое взвешивание'), el('div.row', [field('Вес, кг', val), field('Дата', date)]),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  function vacModal(App, pet) {
    modal((close) => {
      const name = el('input', { placeholder: 'Например, От бешенства' });
      const date = el('input', { type: 'date' });
      const save = el('button.btn', 'Добавить');
      save.addEventListener('click', async () => {
        if (!name.value || !date.value) return toast('Заполните поля', 'err');
        await API.post(`/pets/${pet.id}/health/vaccinations`, { name: name.value, due_date: date.value });
        toast('Добавлено', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новая прививка'), field('Название', name), field('Дата', date),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  function medModal(App, pet) {
    modal((close) => {
      const name = el('input', { placeholder: 'Название препарата' });
      const dosage = el('input', { placeholder: 'Дозировка, напр. 1 таблетка' });
      const times = el('input', { placeholder: 'Время, напр. 09:00, 21:00' });
      const dur = el('input', { type: 'number', placeholder: 'дней' });
      const kind = el('select', [el('option', { value: 'medication' }, 'Лекарство'),
        el('option', { value: 'parasite' }, 'Обработка от паразитов')]);
      const save = el('button.btn', 'Добавить');
      save.addEventListener('click', async () => {
        if (!name.value) return toast('Укажите название', 'err');
        await API.post(`/pets/${pet.id}/health/medications`, {
          name: name.value, dosage: dosage.value, times: times.value,
          duration_days: dur.value ? Number(dur.value) : null, kind: kind.value,
        });
        toast('Курс добавлен', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новый курс / обработка'), field('Тип', kind), field('Название', name),
        field('Дозировка', dosage), el('div.row', [field('Время приёма', times), field('Длительность', dur)]),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  // -------------------------------------------------------------- TRAINING
  function trainingView(App, pet, body) {
    body.appendChild(V._loadingCard('Дрессировка'));
    (async () => {
      const list = await API.get(`/pets/${pet.id}/training`);
      body.innerHTML = '';
      const mastered = list.filter((t) => t.status === 'mastered').length;
      const pct = list.length ? Math.round((mastered / list.length) * 100) : 0;

      body.appendChild(el('div.card', [
        el('div.spread', [el('h3', `🎓 План обучения · ${pet.stageLabel}`),
          el('button.btn.small', { onclick: () => addCommand(App, pet) }, '＋ Команда')]),
        el('div.muted', `Освоено ${mastered} из ${list.length} · ${pct}%`),
        el('div.progress.mt', [el('span', { style: `width:${pct}%` })]),
      ]));

      const grouped = {};
      list.forEach((t) => { (grouped[t.category] = grouped[t.category] || []).push(t); });
      Object.entries(grouped).forEach(([cat, items]) => {
        const card = el('div.card', [el('h3', cat)]);
        items.forEach((t) => card.appendChild(commandRow(App, pet, t)));
        body.appendChild(card);
      });
    })();
  }

  function commandRow(App, pet, t) {
    const cycle = { not_started: 'in_progress', in_progress: 'mastered', mastered: 'not_started' };
    const label = { not_started: ['Не начато', 'info'], in_progress: ['В процессе', 'warn'], mastered: ['Освоено ✔', 'ok'] };
    const [lbl, cls] = label[t.status];
    return el('div.list-item', [
      el('div.li-main', [el('div.li-title', t.command),
        el('div.li-sub', t.minutes ? `${t.minutes} мин тренировок` : 'ещё не тренировались')]),
      el('button.btn.ghost.small', { title: '+15 мин', onclick: async () => {
        await API.put(`/pets/${pet.id}/training/${t.id}`, { addMinutes: 15 }); toast('+15 минут', 'ok'); App.render();
      }}, '⏱'),
      el('span.pill.' + cls, { style: 'cursor:pointer', onclick: async () => {
        await API.put(`/pets/${pet.id}/training/${t.id}`, { status: cycle[t.status] }); App.render();
      }}, lbl),
    ]);
  }

  function addCommand(App, pet) {
    modal((close) => {
      const cmd = el('input', { placeholder: 'Например, «Апорт»' });
      const cat = el('input', { placeholder: 'Категория', value: 'Своё' });
      const save = el('button.btn', 'Добавить');
      save.addEventListener('click', async () => {
        if (!cmd.value) return toast('Введите команду', 'err');
        await API.post(`/pets/${pet.id}/training`, { command: cmd.value, category: cat.value }); toast('Добавлено', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новая команда'), field('Команда', cmd), field('Категория', cat),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  // ------------------------------------------------------------- NUTRITION
  function nutritionView(App, pet, body) {
    body.appendChild(V._loadingCard('Питание'));
    (async () => {
      const [cal, stop, meals] = await Promise.all([
        API.get(`/pets/${pet.id}/nutrition/calories`),
        API.get(`/pets/${pet.id}/nutrition/stoplist`),
        API.get(`/pets/${pet.id}/nutrition/meals`),
      ]);
      body.innerHTML = '';

      // Calorie calculator
      const foodKcal = el('input', { type: 'number', placeholder: 'ккал/100г', value: '350' });
      const mealsN = el('input', { type: 'number', value: String(meals.length || 2), min: '1' });
      const out = el('div.grid-3.mt');
      const recalc = async () => {
        const r = await API.get(`/pets/${pet.id}/nutrition/calories?foodKcal=${foodKcal.value || 0}&meals=${mealsN.value || 2}`);
        out.innerHTML = '';
        out.appendChild(statTile(r.mer, 'ккал / день'));
        out.appendChild(statTile(r.portionGrams ?? '—', 'г / порция'));
        out.appendChild(statTile('×' + r.factor, 'коэфф. ' + r.stageLabel.toLowerCase()));
      };
      foodKcal.addEventListener('input', recalc); mealsN.addEventListener('input', recalc);
      body.appendChild(el('div.card', [
        el('h3', '🔥 Калькулятор рациона'),
        el('div.muted', 'Расчёт по формуле RER = 70 × вес^0.75 с учётом возраста, породы и стерилизации.'),
        el('div.row.mt', [field('Калорийность корма', foodKcal), field('Кормлений в день', mealsN)]),
        out,
      ]));
      recalc();

      // Feeding schedule
      const sched = el('div.card', [el('div.spread', [el('h3', '⏰ График кормлений'),
        el('button.btn.small.secondary', { onclick: () => mealModal(App, pet) }, '＋')])]);
      if (!meals.length) sched.appendChild(el('div.empty', 'Добавьте время кормления'));
      meals.forEach((m) => sched.appendChild(el('div.list-item', [
        el('div', { style: 'font-size:20px' }, '🍽️'),
        el('div.li-main', [el('div.li-title', m.time), el('div.li-sub', [m.label, m.grams ? m.grams + ' г' : ''].filter(Boolean).join(' · '))]),
        el('button.btn.ghost.small', { onclick: async () => { await API.del(`/pets/${pet.id}/nutrition/meals/${m.id}`); App.render(); } }, '✕'),
      ])));
      body.appendChild(sched);

      // Stop-list
      body.appendChild(el('div.card', [
        el('h3', '⛔ Стоп-лист опасных продуктов'),
        stop.breedSpecific && stop.breedSpecific.length ? el('div.muted', { style: 'margin-bottom:8px' }, 'Особое внимание для породы отмечено красным') : null,
        el('div.tag-list', stop.items.map((it) => el('span.tag' + (stop.breedSpecific.includes(it) ? '.bad' : ''), it))),
      ]));
    })();
  }

  function statTile(num, lbl) { return el('div.stat', [el('div.num', String(num)), el('div.lbl', lbl)]); }

  function mealModal(App, pet) {
    modal((close) => {
      const time = el('input', { type: 'time', value: '08:00' });
      const label = el('input', { placeholder: 'Например, Завтрак' });
      const grams = el('input', { type: 'number', placeholder: 'граммы' });
      const save = el('button.btn', 'Добавить');
      save.addEventListener('click', async () => {
        await API.post(`/pets/${pet.id}/nutrition/meals`, { time: time.value, label: label.value, grams: grams.value ? Number(grams.value) : null });
        toast('Добавлено', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Кормление'), el('div.row', [field('Время', time), field('Граммы', grams)]), field('Название', label),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  // ------------------------------------------------------------------- VET
  function vetView(App, pet, body) {
    body.appendChild(V._loadingCard('Ветеринар'));
    (async () => {
      const [symptoms, clinics, docs] = await Promise.all([
        API.get('/vet/symptoms'),
        API.get('/vet/clinics'),
        API.get(`/vet/${pet.id}/documents`),
      ]);
      body.innerHTML = '';

      // SOS
      body.appendChild(el('div.card', { style: 'background:linear-gradient(135deg,var(--danger),#c24b4b);color:#fff' }, [
        el('div.spread', [el('h3', { style: 'color:#fff;margin:0' }, '🚑 SOS — экстренная помощь'),
          el('button.btn.secondary.small', { onclick: () => sosModal(clinics) }, 'Найти клинику')]),
        el('div', { style: 'opacity:.9;font-size:14px;margin-top:6px' }, 'Ближайшие круглосуточные ветклиники и телефоны'),
      ]));

      // Symptom checker
      const chosen = new Set();
      const result = el('div.mt');
      const scard = el('div.card', [el('h3', '🩺 Справочник симптомов'), el('div.muted', 'Отметьте наблюдаемые симптомы для оценки срочности')]);
      symptoms.forEach((s) => {
        const cb = el('input', { type: 'checkbox', onchange: () => { cb.checked ? chosen.add(s.id) : chosen.delete(s.id); } });
        scard.appendChild(el('label.checkbox', { style: 'padding:8px 0' }, [cb, s.text]));
      });
      const assess = el('button.btn.mt', { onclick: async () => {
        const r = await API.post('/vet/symptoms/assess', { ids: [...chosen] });
        const cls = { emergency: 'bad', urgent: 'warn', watch: 'ok', none: 'info' }[r.urgency] || 'info';
        result.innerHTML = '';
        result.appendChild(el('div.card', { style: 'margin:0' }, [el('span.pill.' + cls, r.urgency === 'emergency' ? 'ЭКСТРЕННО' : r.urgency === 'urgent' ? 'СРОЧНО' : r.urgency === 'watch' ? 'НАБЛЮДАТЬ' : '—'), el('div.mt', r.advice)]));
      }}, 'Оценить состояние');
      scard.appendChild(assess); scard.appendChild(result);
      body.appendChild(scard);

      // Vet passport documents
      const dcard = el('div.card', [el('div.spread', [el('h3', '📁 Ветеринарный паспорт'),
        el('button.btn.small.secondary', { onclick: () => docModal(App, pet) }, '＋')])]);
      if (!docs.length) dcard.appendChild(el('div.empty', 'Нет сохранённых документов'));
      docs.forEach((d) => dcard.appendChild(el('div.list-item', [
        el('div', { style: 'font-size:20px' }, '📄'),
        el('div.li-main', [el('div.li-title', d.title), el('div.li-sub', [d.kind, d.note].filter(Boolean).join(' · '))]),
        el('button.btn.ghost.small', { onclick: async () => { await API.del(`/vet/${pet.id}/documents/${d.id}`); App.render(); } }, '✕'),
      ])));
      body.appendChild(dcard);
    })();
  }

  function sosModal(clinics) {
    modal((close) => el('div', [
      el('h2', '🚑 Экстренные клиники'),
      ...clinics.map((c) => el('div.card', { style: 'margin-bottom:10px' }, [
        el('div.li-title', c.name),
        el('div.li-sub', c.address), el('div.li-sub', '🕐 ' + c.hours),
        el('a.btn.small.mt', { href: 'tel:' + c.phone.replace(/\s/g, '') }, '📞 ' + c.phone),
      ])),
      el('button.btn.outline.block.mt', { onclick: close }, 'Закрыть'),
    ]));
  }

  function docModal(App, pet) {
    modal((close) => {
      const title = el('input', { placeholder: 'Например, Анализ крови' });
      const kind = el('select', ['Справка', 'Анализы', 'Рецепт', 'Прививочный сертификат', 'Прочее'].map((k) => el('option', k)));
      const note = el('textarea', { placeholder: 'Заметка (необязательно)', rows: '2' });
      const save = el('button.btn', 'Сохранить');
      save.addEventListener('click', async () => {
        if (!title.value) return toast('Укажите название', 'err');
        await API.post(`/vet/${pet.id}/documents`, { title: title.value, kind: kind.value, note: note.value }); toast('Сохранено', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Документ в паспорт'), field('Название', title), field('Тип', kind), field('Заметка', note),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  // =====================================================================
  //  REPORTS  (analytics dashboard)
  // =====================================================================
  let reportPeriod = 'all';
  V.Reports = function (App) {
    const wrap = el('div');
    if (!App.state.pets.length) return emptyState('📊', 'Нет данных', 'Добавьте питомца, чтобы увидеть аналитику');

    // period + mode segmented controls
    const periods = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё время']];
    wrap.appendChild(el('div.spread', { style: 'flex-wrap:wrap;gap:10px;margin-bottom:12px' }, [
      el('div.segmented', periods.map(([id, l]) => el('button' + (reportPeriod === id ? '.active' : ''),
        { onclick: () => { reportPeriod = id; App.render(); } }, l))),
    ]));

    const pet = App.currentPet();
    const modeWrap = el('div.segmented', { style: 'margin-bottom:14px' }, [
      el('button' + (reportMode === 'pet' ? '.active' : ''), { onclick: () => { reportMode = 'pet'; App.render(); } }, '🐕 ' + (pet ? pet.name : 'Питомец')),
      el('button' + (reportMode === 'all' ? '.active' : ''), { onclick: () => { reportMode = 'all'; App.render(); } }, '📊 Все собаки'),
    ]);
    wrap.appendChild(modeWrap);

    const body = el('div');
    wrap.appendChild(body);
    reportMode === 'all' ? summaryReport(App, body) : petReport(App, pet, body);
    return wrap;
  };
  let reportMode = 'pet';

  function petReport(App, pet, body) {
    body.appendChild(V._loadingCard('Аналитика'));
    (async () => {
      const d = await API.get(`/reports/pets/${pet.id}/dashboard?period=${reportPeriod}`);
      body.innerHTML = '';

      // Insight
      body.appendChild(el('div.card', { style: 'background:var(--primary-container);color:var(--on-primary-container)' }, [
        el('div.hstack', [el('div', { style: 'font-size:24px' }, '🤖'),
          el('div', [el('div', { style: 'font-weight:700' }, 'AI-инсайт'), el('div', d.insight)])]),
      ]));

      // Stat row
      body.appendChild(el('div.grid-3', [
        statCard(d.training.mastered + '/' + (d.training.mastered + d.training.in_progress + d.training.not_started), 'Команд освоено'),
        statCard(d.vaccinations.done + '/' + d.vaccinations.total, 'Прививок сделано'),
        statCard(money(d.expensesTotal), 'Расходы'),
      ]));

      // Weight chart
      const wc = el('div.card', [el('h3', '⚖️ Динамика веса')]);
      const c1 = el('canvas', { height: '200' }); wc.appendChild(c1); body.appendChild(wc);
      drawWeightChart(c1, { points: d.weights, norm: d.weightNorm });

      // Training doughnut
      const tc = el('div.card', [el('h3', '🎓 Освоение команд')]);
      const c2 = el('canvas', { height: '200' }); tc.appendChild(c2); body.appendChild(tc);
      drawDoughnut(c2, ['Освоено', 'В процессе', 'Не начато'],
        [d.training.mastered, d.training.in_progress, d.training.not_started], ['#7cd0a9', '#e0a94a', '#d9d7e3']);

      // Expenses bar
      if (Object.keys(d.expenses).length) {
        const ec = el('div.card', [el('h3', '💰 Расходы по категориям')]);
        const c3 = el('canvas', { height: '200' }); ec.appendChild(c3); body.appendChild(ec);
        drawBar(c3, Object.keys(d.expenses), Object.values(d.expenses));
      }

      // Activity heatmap
      body.appendChild(activityHeatmap(d.activities));

      // Export buttons
      body.appendChild(el('div.card', [
        el('h3', '📤 Экспорт'),
        el('div.row', [
          el('button.btn.outline', { onclick: () => API.download(`/reports/pets/${pet.id}/export.csv`, `${pet.name}-report.csv`) }, '⬇ CSV для ветеринара'),
          el('button.btn.outline', { onclick: () => window.print() }, '🖨 PDF (печать)'),
        ]),
      ]));
    })();
  }

  function summaryReport(App, body) {
    body.appendChild(V._loadingCard('Сводная аналитика'));
    (async () => {
      const s = await API.get(`/reports/summary?period=${reportPeriod}`);
      body.innerHTML = '';
      body.appendChild(el('div.grid-3', [
        statCard(String(s.petsCount), 'Собак'),
        statCard(money(s.totalExpenses), 'Всего расходов'),
        statCard(money(s.avgMonthly), 'В месяц (сред.)'),
      ]));

      if (s.expensesByPet.some((p) => p.total > 0)) {
        const pc = el('div.card', [el('h3', '🥧 Распределение бюджета')]);
        const c1 = el('canvas', { height: '220' }); pc.appendChild(c1); body.appendChild(pc);
        drawDoughnut(c1, s.expensesByPet.map((p) => p.name), s.expensesByPet.map((p) => p.total),
          ['#7c9cf0', '#f0a97c', '#7cd0a9', '#e0a94a', '#c88ce0', '#e26d6d']);
      }

      const cc = el('div.card', [el('h3', '📈 Сравнение веса собак')]);
      const c2 = el('canvas', { height: '220' }); cc.appendChild(c2); body.appendChild(cc);
      drawMultiLine(c2, s.weightSeries);

      body.appendChild(el('div.card', [
        el('h3', '🩺 Сводка здоровья за период'),
        el('div.spread', [el('span', 'Прививок выполнено'), el('strong', `${s.vaccinations.done} из ${s.vaccinations.total}`)]),
      ]));
    })();
  }

  function statCard(num, lbl) { return el('div.card.tight', [el('div.stat', [el('div.num', num), el('div.lbl', lbl)])]); }

  function activityHeatmap(activities) {
    const byDate = {}; activities.forEach((a) => byDate[a.date] = a.count);
    const cells = [];
    const today = new Date();
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const c = byDate[key] || 0;
      const lvl = c === 0 ? '' : c === 1 ? ' heat-1' : c === 2 ? ' heat-2' : c === 3 ? ' heat-3' : ' heat-4';
      cells.push(el('div.heat-cell' + lvl, { title: `${key}: ${c} действий` }));
    }
    return el('div.card', [el('h3', '🗓️ Активность (90 дней)'),
      el('div.muted', { style: 'margin-bottom:8px' }, 'Отмечайте кормления, прогулки и тренировки на главном экране'),
      el('div.heatmap', cells)]);
  }

  // ---- Chart.js helpers ----
  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { text: dark ? '#a5a2b3' : '#6a6875', grid: dark ? '#3a3945' : '#e9e8f2' };
  }
  function baseOpts() {
    const c = themeColors();
    return { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text } } },
      scales: { x: { ticks: { color: c.text }, grid: { color: c.grid } }, y: { ticks: { color: c.text }, grid: { color: c.grid } } } };
  }
  function drawWeightChart(canvas, data) {
    const pts = (data.points || []).map((p) => ({ x: p.date, y: p.value }));
    const labels = (data.points || []).map((p) => p.date);
    const ds = [{ label: 'Вес, кг', data: (data.points || []).map((p) => p.value), borderColor: '#7c9cf0', backgroundColor: 'rgba(124,156,240,.15)', fill: true, tension: .3, pointRadius: 4 }];
    if (data.norm) {
      ds.push({ label: 'Норма мин', data: labels.map(() => data.norm.min), borderColor: 'rgba(124,208,169,.6)', borderDash: [6, 4], pointRadius: 0 });
      ds.push({ label: 'Норма макс', data: labels.map(() => data.norm.max), borderColor: 'rgba(226,109,109,.6)', borderDash: [6, 4], pointRadius: 0 });
    }
    new Chart(canvas, { type: 'line', data: { labels, datasets: ds }, options: baseOpts() });
  }
  function drawDoughnut(canvas, labels, values, colors) {
    new Chart(canvas, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: themeColors().text } } } } });
  }
  function drawBar(canvas, labels, values) {
    new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: '#7c9cf0', borderRadius: 8 }] },
      options: { ...baseOpts(), plugins: { legend: { display: false } } } });
  }
  function drawMultiLine(canvas, series) {
    const palette = ['#7c9cf0', '#f0a97c', '#7cd0a9', '#e0a94a', '#c88ce0'];
    const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const datasets = series.map((s, i) => ({
      label: s.name, borderColor: palette[i % palette.length], backgroundColor: 'transparent', tension: .3,
      data: allDates.map((d) => { const pt = s.points.find((p) => p.date === d); return pt ? pt.value : null; }), spanGaps: true,
    }));
    new Chart(canvas, { type: 'line', data: { labels: allDates, datasets }, options: baseOpts() });
  }

  // =====================================================================
  //  SETTINGS
  // =====================================================================
  V.Settings = function (App) {
    const wrap = el('div');
    const u = App.state.user;

    // Profile
    const name = el('input', { value: u.name || '' });
    wrap.appendChild(el('div.card', [
      el('h3', '👤 Профиль хозяина'),
      field('Имя', name),
      el('div.field', [el('label', 'Email'), el('input', { value: u.email, disabled: true })]),
      el('button.btn.small', { onclick: async () => { await saveProfile(App, { name: name.value }); toast('Сохранено', 'ok'); } }, 'Сохранить'),
    ]));

    // Preferences
    const units = seg(['metric', 'imperial'], ['кг / см', 'фунты / дюймы'], u.units, (v) => saveProfile(App, { units: v }));
    const theme = seg(['light', 'dark', 'system'], ['Светлая', 'Тёмная', 'Системная'], u.theme, (v) => { App.applyTheme(v); saveProfile(App, { theme: v }); });
    const lang = seg(['ru', 'en'], ['Русский', 'English'], u.language, (v) => saveProfile(App, { language: v }));
    wrap.appendChild(el('div.card', [
      el('h3', '🎨 Оформление и единицы'),
      el('div.field', [el('label', 'Единицы измерения'), units]),
      el('div.field', [el('label', 'Тема оформления'), theme]),
      el('div.field', [el('label', 'Язык интерфейса'), lang]),
    ]));

    // Notifications
    wrap.appendChild(notificationCard(App, u));

    // Expenses / finance quick add
    wrap.appendChild(financeCard(App));

    // Pet management
    const petCard = el('div.card', [el('h3', '🐕 Управление профилями собак')]);
    App.state.pets.forEach((p) => petCard.appendChild(el('div.list-item', [
      el('div.ava', { style: 'width:36px;height:36px;border-radius:50%;background:var(--primary-container);display:grid;place-items:center' }, p.avatar),
      el('div.li-main', [el('div.li-title', p.name), el('div.li-sub', `${p.breed || '—'} · ${p.stageLabel}`)]),
      el('button.btn.ghost.small', { onclick: () => V.petForm(App, rawPet(p)) }, '✏️'),
      el('button.btn.ghost.small', { onclick: () => archivePet(App, p) }, '📦'),
      el('button.btn.ghost.small', { onclick: () => deletePet(App, p) }, '🗑'),
    ])));
    petCard.appendChild(el('button.btn.small.mt', { onclick: () => V.petForm(App) }, '＋ Добавить собаку'));
    wrap.appendChild(petCard);

    // Data & privacy
    wrap.appendChild(el('div.card', [
      el('h3', '🔐 Данные и конфиденциальность'),
      el('div.row', [
        el('button.btn.outline', { onclick: () => API.download('/settings/export', 'my-data.json') }, '⬇ Экспорт всех данных'),
      ]),
      el('div.muted.mt', 'GDPR: вы можете полностью удалить аккаунт и все данные.'),
      el('button.btn.danger.mt', { onclick: () => deleteAccount(App) }, '🗑 Удалить аккаунт «Забыть меня»'),
    ]));

    // Logout + about
    wrap.appendChild(el('div.card', [
      el('button.btn.outline.block', { onclick: () => App.logout() }, 'Выйти из аккаунта'),
      el('div.muted.mt', { style: 'text-align:center' }, 'Help with a puppy · v1.0.0'),
    ]));

    return wrap;
  };

  function seg(values, labels, current, onPick) {
    return el('div.segmented', values.map((v, i) => {
      const b = el('button' + (v === current ? '.active' : ''), labels[i]);
      b.addEventListener('click', () => { onPick(v); });
      return b;
    }));
  }

  function notificationCard(App, u) {
    const rows = [['health', '🏥 Здоровье (прививки, лекарства)'], ['nutrition', '🍲 Питание (кормления, взвешивание)'],
      ['training', '🎓 Дрессировка (напоминания, уроки)'], ['system', '⚙️ Системные (обновления, новости)']];
    const qFrom = el('input', { type: 'time', value: u.quietFrom });
    const qTo = el('input', { type: 'time', value: u.quietTo });
    const card = el('div.card', [el('h3', '🔔 Уведомления'),
      el('div.muted', { style: 'margin-bottom:8px' }, 'Режим «Не беспокоить» (тихие часы)'),
      el('div.row', [field('С', qFrom), field('До', qTo)])]);
    rows.forEach(([key, label]) => {
      const cb = el('input', { type: 'checkbox', ...(u.notify[key] ? { checked: true } : {}), onchange: () => saveProfile(App, { notify: { [key]: cb.checked } }) });
      card.appendChild(el('label.checkbox', { style: 'padding:8px 0' }, [cb, label]));
    });
    card.appendChild(el('button.btn.small.mt', { onclick: () => { saveProfile(App, { quietFrom: qFrom.value, quietTo: qTo.value }); toast('Сохранено', 'ok'); } }, 'Сохранить часы'));
    return card;
  }

  function financeCard(App) {
    const card = el('div.card', [el('div.spread', [el('h3', '💰 Учёт расходов'),
      el('button.btn.small', { onclick: () => expenseModal(App) }, '＋ Расход')])]);
    const list = el('div'); card.appendChild(list);
    list.appendChild(el('div.loader', el('div.spin')));
    (async () => {
      const rows = await API.get('/expenses');
      list.innerHTML = '';
      if (!rows.length) { list.appendChild(el('div.empty', 'Пока нет расходов')); return; }
      rows.slice(0, 6).forEach((e) => list.appendChild(el('div.list-item', [
        el('div.li-main', [el('div.li-title', e.category + (e.pet_name ? ' · ' + e.pet_name : '')), el('div.li-sub', [fmtDate(e.date), e.note].filter(Boolean).join(' · '))]),
        el('strong', money(e.amount)),
        el('button.btn.ghost.small', { onclick: async () => { await API.del('/expenses/' + e.id); App.render(); } }, '✕'),
      ])));
    })();
    return card;
  }

  function expenseModal(App) {
    modal((close) => {
      const amount = el('input', { type: 'number', placeholder: '₽' });
      const cat = el('select', ['Питание', 'Ветеринар', 'Лекарства', 'Аксессуары', 'Груминг', 'Прочее'].map((c) => el('option', c)));
      const petSel = el('select', [el('option', { value: '' }, 'Общий'), ...App.state.pets.map((p) => el('option', { value: p.id }, p.name))]);
      const note = el('input', { placeholder: 'Заметка' });
      const save = el('button.btn', 'Добавить');
      save.addEventListener('click', async () => {
        if (!amount.value) return toast('Укажите сумму', 'err');
        await API.post('/expenses', { amount: Number(amount.value), category: cat.value, pet_id: petSel.value || null, note: note.value });
        toast('Добавлено', 'ok'); close(); App.render();
      });
      return el('div', [el('h2', 'Новый расход'), el('div.row', [field('Сумма', amount), field('Категория', cat)]),
        field('Питомец', petSel), field('Заметка', note),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), save])]);
    });
  }

  async function saveProfile(App, patch) {
    const { user } = await API.put('/settings/profile', patch);
    App.state.user = user;
  }
  function rawPet(p) { return { id: p.id, name: p.name, breedCode: p.breedCode, birthdate: p.birthdate, sex: p.sex, sterilized: p.sterilized, weight: p.weight, avatar: p.avatar }; }

  async function archivePet(App, p) {
    await API.post(`/pets/${p.id}/archive`, { archived: !p.archived });
    toast(p.archived ? 'Возвращён' : 'Архивирован', 'ok');
    await App.reloadPets(); App.render();
  }

  function deletePet(App, p) {
    modal((close) => {
      const inp = el('input', { placeholder: 'Введите УДАЛИТЬ' });
      const btn = el('button.btn.danger', 'Удалить навсегда');
      btn.addEventListener('click', async () => {
        if (inp.value !== 'УДАЛИТЬ') return toast('Введите слово УДАЛИТЬ', 'err');
        try { await API.del(`/pets/${p.id}`, { confirm: 'УДАЛИТЬ' }); }
        catch (e) { return toast(e.message, 'err'); }
        toast('Профиль удалён', 'ok'); App.state.currentPetId = null;
        await App.reloadPets(); close(); App.render();
      });
      return el('div', [el('h2', 'Удаление профиля'),
        el('p.muted', `Все данные ${p.name} (прививки, лекарства, тренировки) будут удалены. Для подтверждения введите «УДАЛИТЬ».`),
        field('Подтверждение', inp),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), btn])]);
    });
  }

  function deleteAccount(App) {
    modal((close) => {
      const inp = el('input', { placeholder: 'Введите УДАЛИТЬ' });
      const btn = el('button.btn.danger', 'Удалить аккаунт');
      btn.addEventListener('click', async () => {
        if (inp.value !== 'УДАЛИТЬ') return toast('Введите слово УДАЛИТЬ', 'err');
        try { await API.del('/settings/account', { confirm: 'УДАЛИТЬ' }); }
        catch (e) { return toast(e.message, 'err'); }
        toast('Аккаунт удалён', 'ok'); close(); App.logout();
      });
      return el('div', [el('h2', 'Удаление аккаунта (GDPR)'),
        el('p.muted', 'Это действие необратимо. Все ваши данные будут стёрты. Рекомендуем сначала экспортировать данные.'),
        field('Подтверждение', inp),
        el('div.modal-actions', [el('button.btn.outline', { onclick: close }, 'Отмена'), btn])]);
    });
  }
})();
