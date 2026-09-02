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

  const allVisible = (sel, root = document) =>
    [...root.querySelectorAll(sel)].filter(visible);

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
      if (node.id) { parts.unshift('#' + cssEscape(node.id)); break; }
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
    // Любой селектор может оказаться недопустимым — тогда это НЕ повод
    // ронять весь поиск: пробуем следующий признак.
    const tryAll = (sel) => {
      try {
        return [...document.querySelectorAll(sel)].filter(visible);
      } catch (e) {
        return [];
      }
    };

    // В значении атрибута экранируем только кавычку и слэш: оно стоит
    // внутри кавычек, и полное CSS-экранирование там неуместно.
    const q = (v) => String(v).replace(/["\\]/g, '\\$&');
    for (const a of ['data-testid', 'data-test', 'name', 'id']) {
      if (d[a]) {
        const hit = tryAll(`${d.tag}[${a}="${q(d[a])}"]`);
        if (hit.length === 1) return hit[0];
      }
    }
    for (const a of ['aria-label', 'placeholder']) {
      if (d[a]) {
        const hit = tryAll(`${d.tag}[${a}="${q(d[a])}"]`);
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

  // Экранирование по правилам CSS. Своей заменой кавычек тут не обойтись:
  // React 18 выдаёт идентификаторы вида ":ro0:", и селектор
  // "#chakra-modal--body-:ro0:" браузер отвергает целиком как недопустимый.
  // Именно на этом расширение упало у владельца на живом сайте.
  const cssEscape = (v) => (window.CSS && CSS.escape)
    ? CSS.escape(String(v))
    : String(v).replace(/[^\w-]/g, ch => '\\' + ch);

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

  // ── Автоопределение полей Krystal ───────────────────────────────────────
  //
  // Разметку я увидел по скринам владельца, поэтому поля теперь ищутся сами,
  // а показ мышью остаётся запасным путём. Ищем по ВИДИМОЙ ПОДПИСИ, а не по
  // классам: подпись «Min Price» — часть интерфейса, класс — деталь сборки.
  function inputNear(labelRe) {
    const hits = allVisible('input').filter(el => {
      const l = nearbyLabel(el) || '';
      return labelRe.test(l);
    });
    return hits.length === 1 ? hits[0] : null;
  }

  // Надпись с текущей ценой: «Current Price 0.009975 USDG per JINQIAN».
  function priceNode() {
    const nodes = allVisible('*').filter(el => {
      if (el.children.length > 3) return false;
      return /current\s+price/i.test(textOf(el));
    });
    // Берём САМЫЙ ГЛУБОКИЙ подходящий — у внешних предков текст тот же,
    // но в нём намешано лишнее, и число вытащится не то.
    let best = null;
    for (const el of nodes) {
      if (!best || best.contains(el)) best = el;
    }
    return best;
  }

  // Поле суммы. В ручном режиме с односторонним диапазоном оно ОДНО.
  // Если их два — значит диапазон двусторонний и мы не можем доказать,
  // в какое класть. Тогда возвращаем null: отказ честнее догадки.
  function amountInput(exclude) {
    const rest = allVisible('input').filter(el => !exclude.includes(el));
    const numeric = rest.filter(el => {
      const t = (el.getAttribute('inputmode') || el.type || '').toLowerCase();
      return t === 'decimal' || t === 'numeric' || t === 'number' || t === 'text';
    });
    return numeric.length === 1 ? numeric[0] : null;
  }

  // Вкладка Manual против Zap In. Владелец работает в Manual.
  function manualTab() {
    return allVisible('button, [role="tab"]')
      .find(el => /^\s*(?:👆|✋)?\s*manual\s*$/i.test(textOf(el))) || null;
  }

  // Поле суммы НЕ обязательно на старте. Пока диапазон двусторонний, полей
  // два, и это нормальное начальное состояние окна — отказываться на нём
  // нельзя. Сумму ищем позже, когда верхняя граница уже ушла под цену и
  // второе поле исчезло.
  // Кнопка подтверждения. Ищем по точному тексту: «Add Liquidity» или
  // «Approve USDG» на первом заходе. Нажимать что-то похожее нельзя —
  // это кнопка, после которой кошелёк просит подпись.
  function submitButton() {
    const btns = allVisible('button').filter(el => {
      const t = textOf(el).replace(/\s+/g, ' ').trim();
      return /^add liquidity$/i.test(t) || /^approve\b/i.test(t);
    });
    if (btns.length !== 1) return { el: null, why: btns.length
      ? 'таких кнопок несколько — не понимаю, какая нужна'
      : 'кнопки Add Liquidity не вижу' };
    const el = btns[0];
    const off = el.disabled ||
                /true/i.test(el.getAttribute('aria-disabled') || '') ||
                getComputedStyle(el).pointerEvents === 'none';
    if (off) return { el: null, why: `кнопка «${textOf(el)}» неактивна` };
    return { el, why: null, text: textOf(el).replace(/\s+/g, ' ').trim() };
  }

  function autoFields() {
    const lo = inputNear(/min\s*price/i);
    const hi = inputNear(/max\s*price/i);
    if (!lo || !hi) return null;
    const px = priceNode();
    const amt = amountInput([lo, hi]);
    return {
      minPrice: describe(lo), maxPrice: describe(hi),
      amount: amt ? describe(amt) : null,
      price: px ? describe(px) : null,
    };
  }

  return { visible, textOf, describe, find, setReactValue, pressEnter, num,
           snapshot, nearbyLabel, autoFields, manualTab, priceNode, amountInput,
           submitButton };
})();
