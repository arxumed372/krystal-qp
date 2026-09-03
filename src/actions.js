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

  // Нажатие кнопки подтверждения. Отдельная работа со своими условиями:
  // после неё кошелёк просит подпись, поэтому любое сомнение — отказ.
  // Подпись остаётся за владельцем, её расширение не делает и делать не может.
  function submit(r, shape) {
    const stop = (why) => ({ clicked: false, why });
    if (r.drift.amount == null || r.drift.amount > 1) {
      return stop('сумма в поле не та, что просили');
    }
    if (shape === 'down' && !r.oneSided) {
      return stop('позиция осталась двусторонней');
    }
    if (r.asked.priceSrc !== 'надпись') {
      return stop('цену взял как середину границ, а не из строки Current Price');
    }
    const b = D.submitButton();
    if (!b.el) return stop(b.why);
    b.el.click();
    return { clicked: true, text: b.text };
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

    // Единицы цены переключаем ДО расчёта. Если этого не сделать, границы
    // считаются в одних единицах, а поля живут в других, и числа выходят
    // перевёрнутыми — вместо «около цены» получится «в тысячу раз мимо».
    const unitsBefore = D.priceUnits();
    const sw = D.switchPriceUnits();
    if (sw.changed) {
      report('переключил цену в доллары…');
      await settle(fields, { timeout: cfg.settleMs * 6 });
    }
    if (D.priceIsStable() === false) {
      throw new Error('цена показана не в стейбле' +
        (sw.why ? ` (${sw.why})` : '') +
        '. Нажми над графиком имя монеты сам и повтори');
    }

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

    // ГРАНИЦЫ ПЕРВЫМИ. Но порядок между ними не жёсткий, а зависит от того,
    // куда переезжает диапазон.
    //
    // Если написать верх раньше низа, а новый верх окажется НИЖЕ старого низа,
    // то на мгновение получится перевёрнутый диапазон: низ больше верха.
    // Библиотека Uniswap, на которой работает Krystal, такого не допускает и
    // выбрасывает «Invariant failed» — ту самую красную надпись. То же самое
    // зеркально при переезде вверх.
    //
    // Поэтому сначала двигаем ту границу, которая уводит диапазон в нужную
    // сторону, и перевёрнутого состояния не возникает ни на миг.
    const curLo = D.num((D.find(fields.minPrice) || {}).value);
    const curHi = D.num((D.find(fields.maxPrice) || {}).value);
    const minFirst = (curLo != null && hi < curLo);   // переезжаем вниз
    const steps = minFirst
      ? [['низ', fields.minPrice, lo], ['верх', fields.maxPrice, hi]]
      : [['верх', fields.maxPrice, hi], ['низ', fields.minPrice, lo]];
    if (minFirst) report('диапазон уезжает вниз — сначала нижняя граница');
    for (const [name, desc, value] of steps) {
      report(`${name} ${value}…`);
      const el = D.find(desc);
      if (!el) throw new Error(`поле «${name}» пропало со страницы`);
      D.setReactValue(el, value);
      D.pressEnter(el);
      await settle(fields, { timeout: cfg.settleMs * 6 });
    }

    // Поле суммы ищем ЗАНОВО: после сужения диапазона второе поле исчезает,
    // и найденное вначале может быть уже не тем полем.
    // НИКАКИХ СОХРАНЁННЫХ ССЫЛОК НА УЗЕЛ.
    //
    // Krystal перерисовывает поле суммы, когда меняется диапазон. Старая
    // ссылка продолжает существовать, но она уже не на странице: пишешь в
    // неё — значение меняется, на экране ничего. Расширение отчиталось
    // о 250, а в поле стояло 100 — ровно это.
    // Поэтому поле ищется ЗАНОВО перед каждой записью и перед каждым
    // чтением, и обязано быть частью живого документа.
    const amountEl = () => {
      if (cfg.fields && cfg.fields.amount) {
        const el = D.find(cfg.fields.amount);
        if (el && document.contains(el)) return el;
      }
      // Поля границ тоже ищем ЗАНОВО: они перерисовываются вместе с суммой,
      // и сохранённые ссылки на них перестают что-либо исключать.
      const skip = [D.find(fields.minPrice), D.find(fields.maxPrice)]
        .filter(Boolean);
      return D.amountInput(skip);
    };
    const amtEl = amountEl();
    if (!amtEl) {
      // Полей суммы осталось два. Для формы «вниз» это значит, что верх не
      // ушёл под цену. Для двусторонней это нормально по устройству, но тогда
      // выбрать поле за владельца я не могу — какой из двух токенов вносить,
      // знает только он.
      throw new Error(shape === 'both'
        ? 'границы поставил. Сумму не вписал: при двустороннем диапазоне ' +
          'полей два, и какой токен вносить — решаешь ты. Покажи нужное ' +
          'поле через «Указать поля»'
        : `границы поставил, но поле суммы не опознал ` +
          `(вижу полей: ${D.amountInputs([]).length}, ` +
          `область Deposit Amounts ${D.depositRoot() ? 'нашёл' : 'НЕ нашёл'}). ` +
          `Впиши сумму сам или покажи поле через «Указать поля»`);
    }
    // СУММУ ПИШЕМ С ПРОВЕРКОЙ И ПОВТОРОМ.
    //
    // Krystal сам подставляет в это поле свою величину, когда пересчитывает
    // позицию, и делает это С ЗАДЕРЖКОЙ — уже после того, как поля затихли.
    // Первая версия писала 50, тут же читала 50 и радостно отчитывалась,
    // а через секунду на экране стояло 430. Владелец это поймал.
    // Поэтому: написали, подождали, перечитали, и если сайт переписал —
    // пишем снова. Три попытки, потом честный отказ.
    const writeAmount = async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const el = amountEl();            // ищем заново каждый раз
        if (!el) return null;
        D.setReactValue(el, amount);
        D.pressEnter(el);
        await settle(fields, { timeout: cfg.settleMs * 6 });
        await sleep(900);                 // даём сайту договорить своё
        const check = amountEl();         // и читаем тоже заново
        const now = check ? D.num(check.value) : null;
        if (now != null && amount > 0 &&
            Math.abs(now - amount) / amount <= 0.001) {
          return now;
        }
        report(`в поле ${now} вместо ${amount} — вписываю снова ` +
               `(${attempt} из 2)`);
      }
      const last = amountEl();
      return last ? D.num(last.value) : null;
    };
    report(`сумма ${amount}…`);
    let amountFinal = await writeAmount();

    // СТОРОЖ ПОСЛЕ ЗАПИСИ.
    //
    // Krystal подставляет своё число не сразу: он дожидается загрузки данных
    // пула и только потом пересчитывает депозит. Ожидание в 900 мс это
    // пропускало — расширение отчитывалось «готово», а через пару секунд в
    // поле стояло 393. Поэтому после успеха ещё несколько секунд смотрим,
    // не переписал ли сайт, и возвращаем своё.
    const ok = (v) => v != null && amount > 0 &&
                      Math.abs(v - amount) / amount <= 0.001;
    if (ok(amountFinal)) {
      for (let round = 0; round < 3; round++) {
        let changed = false;
        for (let t = 0; t < 10; t++) {          // ~4 секунды наблюдения
          await sleep(400);
          const el = amountEl();
          const now = el ? D.num(el.value) : null;
          if (!ok(now)) {
            report(`сайт поставил ${now} — возвращаю ${amount}`);
            const again = amountEl();
            if (again) {
              D.setReactValue(again, amount);
              D.pressEnter(again);
              await settle(fields, { timeout: cfg.settleMs * 4 });
            }
            changed = true;
            break;
          }
        }
        if (!changed) break;                    // тишина — значит устоялось
      }
      const last = amountEl();
      amountFinal = last ? D.num(last.value) : amountFinal;
    }

    const got = {
      amount: amountFinal,
      lo: D.num((D.find(fields.minPrice) || {}).value),
      hi: D.num((D.find(fields.maxPrice) || {}).value),
    };
    const off = (a, b) => (a == null || b == null || b === 0)
      ? null : Math.abs(a - b) / Math.abs(b) * 100;

    return {
      asked: { amount, lo, hi, price, widthPct, gapPct, shape, priceSrc: src.src,
               units: D.priceUnits(), unitsSwitched: !!sw.changed,
               unitsBefore },
      got,
      drift: { amount: off(got.amount, amount), lo: off(got.lo, lo),
               hi: off(got.hi, hi) },
      // Главная проверка формы «вниз»: верхняя граница обязана оказаться
      // НИЖЕ цены, иначе второй токен всё ещё нужен и смысл теряется.
      oneSided: got.hi != null && got.hi < price,
      fields,
    };
  }

  // «Подтолкнуть»: нажать плюс и следом минус у каждой границы.
  //
  // Смысл — заставить Krystal пересчитать тики СВОИМ механизмом. Значение
  // возвращается на место, а внутреннее состояние приложения при этом
  // рождается его же кодом, а не нашей записью в поле. Если после этого
  // «Invariant failed» пропадает — значит наша запись не доезжала до
  // внутреннего состояния, и это прямая улика.
  async function nudge(cfg, report) {
    let fields = (cfg.fields && cfg.fields.minPrice) ? cfg.fields : D.autoFields();
    if (!fields) throw new Error('полей не вижу — открой окно Add Liquidity');
    const before = {
      lo: D.num((D.find(fields.minPrice) || {}).value),
      hi: D.num((D.find(fields.maxPrice) || {}).value),
    };
    let touched = 0;
    for (const key of ['minPrice', 'maxPrice']) {
      const el = D.find(fields[key]);
      const { plus, minus } = D.stepButtons(el);
      if (!plus || !minus) continue;
      plus.click();
      await sleep(500);
      minus.click();
      await sleep(500);
      touched++;
    }
    if (!touched) throw new Error('кнопок + и − рядом с границами не нашёл');
    await settle(fields, { timeout: cfg.settleMs * 6 });
    const after = {
      lo: D.num((D.find(fields.minPrice) || {}).value),
      hi: D.num((D.find(fields.maxPrice) || {}).value),
    };
    return { before, after, touched };
  }

  // Наблюдение ПОСЛЕ отчёта.
  //
  // Krystal подставляет своё число иногда через семь секунд и позже — уже
  // после того, как расширение сказало «готово». Внутри одного заполнения
  // столько ждать нельзя, поэтому панель продолжает смотреть отдельно:
  // возвращает сумму, если её подменили, и говорит об этом.
  function holdAmount(cfg, fields, amount, seconds, onEvent) {
    const ok = (v) => v != null && amount > 0 &&
                      Math.abs(v - amount) / amount <= 0.001;
    const find = () => {
      if (cfg.fields && cfg.fields.amount) {
        const el = D.find(cfg.fields.amount);
        if (el && document.contains(el)) return el;
      }
      const skip = [D.find(fields.minPrice), D.find(fields.maxPrice)]
        .filter(Boolean);
      return D.amountInput(skip);
    };
    let left = Math.round(seconds * 1000 / 700);
    let fixes = 0;
    // Каждая наша запись заставляет Krystal пересчитывать позицию, и на
    // промежуточном состоянии его библиотека сыплет красными «Invariant
    // failed». Пять исправлений подряд — это пять таких окон. Поэтому
    // правим не больше двух раз, а дальше говорим человеку посмотреть
    // самому: лишний шум хуже, чем честное «проверь глазами».
    const MAX_FIXES = 2;
    const id = setInterval(() => {
      if (--left <= 0) { clearInterval(id); onEvent({ done: true, fixes }); return; }
      const el = find();
      const now = el ? D.num(el.value) : null;
      if (ok(now)) return;
      if (!el) return;
      if (fixes >= MAX_FIXES) {
        clearInterval(id);
        onEvent({ done: true, fixes, gaveUp: true, was: now });
        return;
      }
      fixes++;
      D.setReactValue(el, amount);
      D.pressEnter(el);
      onEvent({ was: now, fixes });
    }, 700);
    return () => clearInterval(id);
  }

  return { fill, currentPrice, round, bounds, ensureManual, submit, nudge,
           holdAmount };
})();
