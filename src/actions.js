// Сценарий входа в позицию на Krystal.
//
// ПОРЯДОК ВВОДА ОБРАТНЫЙ ТОМУ, ЧТО НА METEORA. Там сумма идёт до границ.
// Здесь наоборот: сначала границы, потом сумма. Это видно на снимках экрана
// владельца — пока диапазон двусторонний, в «Deposit Amounts» ДВА поля, и
// второе исчезает только когда верхняя граница уходит ниже текущей цены.
// Если писать сумму первой, поле под ней меняется, и написанное пропадает.
//
// ФОРМА «ВНИЗ». Владелец открывает позицию без верхней пустой части: обе
// границы ниже рынка, тогда нужен только котируемый токен (у него USDG),
// а поле второго токена исчезает совсем. На его снимке при цене 0.009975
// стоят 0.005025 и 0.00959 — то есть верх на 3.9% НИЖЕ цены, а не вровень.
// Поэтому верхняя граница ставится с отступом, а не ровно в цену: ровно
// в цену оставляет полоску, где второй токен всё ещё нужен.
window.KQPActions = (() => {
  const D = window.KQPDom;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function settle(fields, { quiet = 400, timeout = 5000 } = {}) {
    const t0 = Date.now();
    let prev = JSON.stringify(D.snapshot(fields));
    let stable = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(140);
      const now = JSON.stringify(D.snapshot(fields));
      if (now !== prev) { prev = now; stable = Date.now(); continue; }
      if (Date.now() - stable >= quiet) return true;
    }
    return false;
  }

  // Текущая цена. Надпись «Current Price 0.009975 USDG per JINQIAN» —
  // единственный источник, который остаётся верным ПОСЛЕ заполнения.
  // Середина границ годится только до первого нажатия: измерено, что второе
  // нажатие подряд уводит цену с 2.5 на 2.4375, и диапазон ползёт вниз.
  function currentPrice(fields) {
    const fromNode = (el) => {
      if (!el) return null;
      const v = D.num(D.textOf(el).replace(/current\s+price/i, ''));
      return (v != null && v > 0) ? v : null;
    };
    const shown = fromNode(fields.price ? D.find(fields.price) : null)
               ?? fromNode(D.priceNode());
    if (shown != null) return { price: shown, src: 'надпись' };

    const lo = D.num((D.find(fields.minPrice) || {}).value);
    const hi = D.num((D.find(fields.maxPrice) || {}).value);
    if (lo != null && hi != null && lo > 0 && hi > 0)
      return { price: (lo + hi) / 2, src: 'середина границ' };
    return null;
  }

  function round(x) {
    if (!isFinite(x) || x <= 0) return x;
    // Сохраняем значащие цифры: у пары с ценой 0.009975 округление до двух
    // знаков превратило бы весь диапазон в ноль.
    const mag = Math.floor(Math.log10(Math.abs(x)));
    const dec = Math.max(0, Math.min(18, 6 - mag));
    return Number(x.toFixed(dec));
  }

  function bounds(price, { shape, widthPct, gapPct }) {
    if (shape === 'down') {
      return { lo: round(price * (1 - widthPct / 100)),
               hi: round(price * (1 - gapPct / 100)) };
    }
    if (shape === 'up') {
      return { lo: round(price * (1 + gapPct / 100)),
               hi: round(price * (1 + widthPct / 100)) };
    }
    return { lo: round(price * (1 - widthPct / 100)),
             hi: round(price * (1 + widthPct / 100)) };
  }

  // Ручной режим. В режиме Zap In поля другие, и заполнять их этим сценарием
  // нельзя. Переключаем сами, если кнопка нашлась.
  function ensureManual() {
    const tab = D.manualTab();
    if (!tab) return false;
    const active = /true/i.test(tab.getAttribute('aria-selected') || '') ||
                   tab.dataset.state === 'active';
    if (!active) tab.click();
    return true;
  }

  async function fill({ amount, widthPct, shape = 'down', gapPct = 3 },
                      cfg, report) {
    // Сначала пробуем узнать поля сами — разметка известна по снимкам.
    // Выученные показом мыши имеют приоритет: их владелец видел своими глазами.
    let fields = cfg.fields;
    if (!fields || !fields.minPrice || !fields.maxPrice) {
      fields = D.autoFields();
      if (!fields) {
        throw new Error('не нахожу поля сам. Открой «Add Liquidity» → вкладка ' +
                        'Manual, либо нажми «Указать поля» и покажи их мышью');
      }
      report('поля определил сам');
    }
    // Самолечение. Выученные поля могли устареть или быть показаны неверно.
    // Если они не находятся — молча падать нельзя, но и упираться в них тоже:
    // пробуем найти сами и говорим об этом.
    if (!D.find(fields.minPrice) || !D.find(fields.maxPrice)) {
      const auto = D.autoFields();
      if (auto && D.find(auto.minPrice) && D.find(auto.maxPrice)) {
        fields = auto;
        report('выученные поля не нашлись — нашёл сам');
      } else {
        throw new Error('не нахожу поля границ. Открой «Add Liquidity» → ' +
                        'вкладка Manual, либо нажми «Сброс» и потом «Заполнить»');
      }
    }

    ensureManual();

    const src = currentPrice(fields);
    if (!src) {
      throw new Error('не вижу текущую цену. Открой окно так, чтобы была видна ' +
                      'строка Current Price, и повтори');
    }
    const price = src.price;
    if (shape !== 'both' && gapPct >= widthPct) {
      throw new Error(`отступ ${gapPct}% не меньше ширины ${widthPct}% — ` +
                      'диапазон вышел бы пустым');
    }
    const { lo, hi } = bounds(price, { shape, widthPct, gapPct });

    // ГРАНИЦЫ ПЕРВЫМИ, верхняя раньше нижней: пока верхняя выше цены,
    // приложение держит два поля суммы, и опираться на них нельзя.
    report(`верх ${hi}…`);
    D.setReactValue(D.find(fields.maxPrice), hi);
    D.pressEnter(D.find(fields.maxPrice));
    await settle(fields, { timeout: cfg.settleMs * 6 });

    report(`низ ${lo}…`);
    D.setReactValue(D.find(fields.minPrice), lo);
    D.pressEnter(D.find(fields.minPrice));
    await settle(fields, { timeout: cfg.settleMs * 6 });

    // Поле суммы ищем ЗАНОВО: после сужения диапазона второе поле исчезает,
    // и найденное вначале может быть уже не тем полем.
    const amtDesc = (cfg.fields && cfg.fields.amount)
      ? cfg.fields.amount
      : ((D.autoFields() || {}).amount || fields.amount);
    const amtEl = amtDesc ? D.find(amtDesc) : null;
    if (!amtEl) {
      // Полей суммы осталось два. Для формы «вниз» это значит, что верх не
      // ушёл под цену. Для двусторонней это нормально по устройству, но тогда
      // выбрать поле за владельца я не могу — какой из двух токенов вносить,
      // знает только он.
      throw new Error(shape === 'both'
        ? 'границы поставил. Сумму не вписал: при двустороннем диапазоне ' +
          'полей два, и какой токен вносить — решаешь ты. Покажи нужное ' +
          'поле через «Указать поля»'
        : 'границы поставил, но поле суммы одно не осталось — позиция всё ' +
          'ещё двусторонняя. Увеличь отступ');
    }
    report(`сумма ${amount}…`);
    D.setReactValue(amtEl, amount);
    D.pressEnter(amtEl);
    await settle(fields, { timeout: cfg.settleMs * 6 });

    const got = {
      amount: D.num(((amtDesc && D.find(amtDesc)) || amtEl).value),
      lo: D.num((D.find(fields.minPrice) || {}).value),
      hi: D.num((D.find(fields.maxPrice) || {}).value),
    };
    const off = (a, b) => (a == null || b == null || b === 0)
      ? null : Math.abs(a - b) / Math.abs(b) * 100;

    return {
      asked: { amount, lo, hi, price, widthPct, gapPct, shape, priceSrc: src.src },
      got,
      drift: { amount: off(got.amount, amount), lo: off(got.lo, lo),
               hi: off(got.hi, hi) },
      // Главная проверка формы «вниз»: верхняя граница обязана оказаться
      // НИЖЕ цены, иначе второй токен всё ещё нужен и смысл теряется.
      oneSided: got.hi != null && got.hi < price,
    };
  }

  return { fill, currentPrice, round, bounds, ensureManual };
})();
