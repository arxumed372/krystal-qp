// Слой работы с DOM Krystal.
//
// ПОЧЕМУ ЗДЕСЬ НЕТ ЖЁСТКИХ СЕЛЕКТОРОВ. Разметку Krystal я не видел: сайт стоит
// за Cloudflare, и автоматический браузер туда не пускают. Написать селекторы
// «на глаз» значило бы выдать догадку за знание, а цена ошибки здесь — деньги
// не в тот пул. Поэтому поля один раз показывает владелец мышью (teach.js),
// а этот файл умеет превратить показанный элемент в устойчивый путь и найти
// его обратно после перезагрузки страницы.
window.KQPDom = (() => {

  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const textOf = (el) => (el.innerText || el.textContent || '').trim();

  // ── Устойчивый путь к элементу ──────────────────────────────────────────
  //
  // Порядок предпочтений: смысловые атрибуты, затем подпись рядом с полем,
  // и только в последнюю очередь положение в дереве. Классы Tailwind как
  // источник истины не используются вообще — они меняются от сборки к сборке.
  function describe(el) {
    if (!el) return null;
    const d = { tag: el.tagName.toLowerCase() };
    for (const a of ['data-testid', 'data-test', 'name', 'id', 'aria-label',
                     'placeholder', 'inputmode', 'type']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) d[a] = v;
    }
    d.label = nearbyLabel(el);
    d.path = domPath(el);
    return d;
  }

  // Подпись поля: текст ближайшего предка, в котором есть слова, но нет
  // другого поля ввода. Именно так подписаны поля в подобных интерфейсах.
  function nearbyLabel(el) {
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      if (node.querySelectorAll('input').length > 1) break;
      const t = textOf(node).replace(/\s+/g, ' ').slice(0, 60);
      if (t && /[a-zA-Zа-яА-Я]/.test(t)) return t;
    }
    return null;
  }

  function domPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 12) {
      const tag = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`#${node.id}`); break; }
      const parent = node.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      const same = [...parent.children].filter(c => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      node = parent;
    }
    return parts.join(' > ');
  }

  // Поиск по описанию. Пробуем от самого надёжного признака к самому слабому
  // и ВОЗВРАЩАЕМ null, если уверенности нет: пустой результат честнее, чем
  // случайное поле, в которое уйдут деньги.
  function find(d) {
    if (!d) return null;
    const tryAll = (sel) => [...document.querySelectorAll(sel)].filter(visible);

    for (const a of ['data-testid', 'data-test', 'name', 'id']) {
      if (d[a]) {
        const hit = tryAll(`${d.tag}[${a}="${cssEscape(d[a])}"]`);
        if (hit.length === 1) return hit[0];
      }
    }
    for (const a of ['aria-label', 'placeholder']) {
      if (d[a]) {
        const hit = tryAll(`${d.tag}[${a}="${cssEscape(d[a])}"]`);
        if (hit.length === 1) return hit[0];
      }
    }
    if (d.label) {
      const hit = tryAll(d.tag).filter(el => nearbyLabel(el) === d.label);
      if (hit.length === 1) return hit[0];
    }
    if (d.path) {
      const hit = tryAll(d.path);
      if (hit.length === 1) return hit[0];
    }
    return null;
  }

  const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&');

  // ── Запись в поле React ─────────────────────────────────────────────────
  //
  // Прямое присваивание value React не замечает: у него свой сеттер на
  // прототипе. Пишем через него и шлём событие input, иначе поле визуально
  // меняется, а приложение продолжает считать по старому значению.
  function setReactValue(el, value) {
    if (!el) return false;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, String(value));
    else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  const pressEnter = (el) => {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  };

  const num = (s) => {
    const m = String(s == null ? '' : s).replace(/[,\s$]/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  // Снимок значений полей — по нему ждём, пока приложение пересчитает.
  function snapshot(fields) {
    const out = {};
    for (const [k, d] of Object.entries(fields || {})) {
      const el = find(d);
      out[k] = el ? el.value : null;
    }
    return out;
  }

  return { visible, textOf, describe, find, setReactValue, pressEnter, num,
           snapshot, nearbyLabel };
})();
