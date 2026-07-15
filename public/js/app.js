// Main application controller: bootstrap, auth gate, shell + navigation.
(function () {
  const { el, clear, toast } = UI;

  const App = {
    state: {
      user: null,
      pets: [],
      currentPetId: null,
      tab: 'home',      // home | pets | reports | settings
      subtab: 'health', // health | training | nutrition | vet
    },
    root: document.getElementById('app'),
  };
  window.App = App;

  // ---- theme ----
  App.applyTheme = function (theme) {
    const t = theme || (App.state.user && App.state.user.theme) || 'system';
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  };

  App.currentPet = function () {
    return App.state.pets.find((p) => p.id === App.state.currentPetId) || App.state.pets[0] || null;
  };

  App.setTab = function (tab) {
    App.state.tab = tab;
    App.render();
  };

  App.reloadPets = async function () {
    App.state.pets = await API.get('/pets');
    if (!App.currentPet() && App.state.pets.length) App.state.currentPetId = App.state.pets[0].id;
    if (App.currentPet()) App.state.currentPetId = App.currentPet().id;
  };

  App.refresh = function () { App.render(); };

  App.logout = function () {
    API.setToken(null);
    App.state.user = null;
    App.state.pets = [];
    App.state.currentPetId = null;
    renderAuth();
  };

  // ---- render root ----
  App.render = function () {
    if (!App.state.user) return renderAuth();
    renderShell();
  };

  function renderAuth() {
    clear(App.root);
    App.root.appendChild(Views.Auth(App));
  }

  function renderShell() {
    clear(App.root);
    const shell = el('div.shell');

    // Topbar
    const pet = App.currentPet();
    const titles = {
      home: ['Сегодня', pet ? pet.name : 'Добро пожаловать'],
      pets: ['Питомцы', 'Здоровье · Питание · Дрессировка'],
      reports: ['Отчётность', 'Аналитика и графики'],
      settings: ['Настройки', App.state.user.email],
    };
    const [title, sub] = titles[App.state.tab];
    shell.appendChild(el('div.topbar', [
      el('div.title', [title, el('small', sub)]),
      el('button.icon-btn', { title: 'Сменить тему', onclick: toggleTheme }, themeIcon()),
    ]));

    // Pet switcher (not on settings)
    if (App.state.tab !== 'settings') shell.appendChild(petSwitcher());

    // Main content
    const main = el('div#main-content');
    shell.appendChild(main);
    App.root.appendChild(shell);
    App.root.appendChild(bottomNav());

    renderTab(main);
  }

  function renderTab(main) {
    clear(main);
    const map = {
      home: Views.Home,
      pets: Views.Pets,
      reports: Views.Reports,
      settings: Views.Settings,
    };
    const view = map[App.state.tab];
    main.appendChild(view(App));
  }

  function petSwitcher() {
    const wrap = el('div.pet-switcher');
    for (const p of App.state.pets) {
      const tab = el('div.pet-tab' + (p.id === App.state.currentPetId ? '.active' : ''), {
        onclick: () => { App.state.currentPetId = p.id; App.render(); },
      }, [
        el('div.ava', p.avatar || '🐶'),
        el('div', [el('div.pt-name', p.name), el('div.pt-stage', p.stageLabel || '')]),
      ]);
      wrap.appendChild(tab);
    }
    wrap.appendChild(el('div.pet-tab.add', { onclick: () => Views.petForm(App) }, '＋ Член семьи'));
    return wrap;
  }

  function bottomNav() {
    const items = [
      ['home', '🏠', 'Главная'],
      ['pets', '🐕', 'Питомцы'],
      ['reports', '📊', 'Отчётность'],
      ['settings', '⚙️', 'Настройки'],
    ];
    return el('nav.bottom-nav', items.map(([id, ico, label]) =>
      el('button' + (App.state.tab === id ? '.active' : ''), { onclick: () => App.setTab(id) }, [
        el('span.ico', ico), el('span', label),
      ])
    ));
  }

  function themeIcon() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  }
  async function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (App.state.user) {
      App.state.user.theme = next;
      try { await API.put('/settings/profile', { theme: next }); } catch (e) {}
      // update icon
      const btn = document.querySelector('.topbar .icon-btn');
      if (btn) btn.textContent = themeIcon();
    }
  }

  // ---- boot ----
  window.addEventListener('hwp:logout', () => { toast('Сессия истекла, войдите снова', 'err'); App.logout(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => App.applyTheme());

  (async function boot() {
    App.applyTheme();
    if (!API.getToken()) { App.render(); return; }
    try {
      const { user } = await API.get('/auth/me');
      App.state.user = user;
      App.applyTheme(user.theme);
      await App.reloadPets();
      App.render();
    } catch (e) {
      API.setToken(null);
      App.render();
    }
  })();
})();
