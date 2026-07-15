// DOM + interaction helpers. Exposed as window.UI.
(function () {
  /** Tiny hyperscript: el('div.card', {onclick}, [children]) */
  function el(tag, props, children) {
    const parts = tag.split(/(?=[.#])/);
    const node = document.createElement(parts[0] || 'div');
    for (const p of parts.slice(1)) {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    }
    if (props && (Array.isArray(props) || typeof props === 'string' || props instanceof Node)) {
      children = props; props = null;
    }
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className += ' ' + v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
      }
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null) return;
    if (Array.isArray(children)) children.forEach((c) => append(node, c));
    else if (children instanceof Node) node.appendChild(children);
    else node.appendChild(document.createTextNode(String(children)));
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function toast(message, type) {
    const host = document.getElementById('toast-host');
    const t = el('div.toast' + (type ? '.' + type : ''), message);
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  /** Modal dialog. content is a builder(close) => Node. */
  function modal(builder) {
    const host = document.getElementById('modal-host');
    const backdrop = el('div.modal-backdrop');
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    const box = el('div.modal');
    box.appendChild(builder(close));
    backdrop.appendChild(box);
    host.appendChild(backdrop);
    return close;
  }

  /** Confirmation dialog returning a promise<boolean>. */
  function confirm(title, message, danger) {
    return new Promise((resolve) => {
      modal((close) => el('div', [
        el('h2', title),
        el('p.muted', message),
        el('div.modal-actions', [
          el('button.btn.outline', { onclick: () => { close(); resolve(false); } }, 'Отмена'),
          el('button.btn' + (danger ? '.danger' : ''), { onclick: () => { close(); resolve(true); } }, 'Подтвердить'),
        ]),
      ]));
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function money(n) { return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ₽'; }
  function ageLabel(months) {
    if (months == null) return '';
    const y = Math.floor(months / 12), m = months % 12;
    const parts = [];
    if (y) parts.push(y + ' г.');
    if (m || !y) parts.push(m + ' мес.');
    return parts.join(' ');
  }

  window.UI = { el, clear, append, toast, modal, confirm, fmtDate, money, ageLabel };
})();
