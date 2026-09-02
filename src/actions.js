// Сценарий входа в позицию.
//
// ПОРЯДОК. На Meteora я измерил, что сумма должна идти ДО границ: приложение
// пересаживает диапазон, пока сумма пустая, и обратный порядок давал не тот
// диапазон, который просили. Здесь тот же порядок принят по умолчанию, но
// НЕ измерен на Krystal — я не смог открыть их сайт автоматическим браузером.
// Поэтому после заполнения сценарий ПЕРЕЧИТЫВАЕТ все три поля и показывает,
// что реально стоит. Если приложение переписало границы, это будет видно
// сразу, а не после подписи транзакции.
window.KQPActions = (() => {
  const D = window.KQPDom;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Ждём, пока приложение перестанет пересчитывать: два одинаковых снимка
  // подряд. Возврат по таймауту не ошибка — идём дальше с тем, что есть.
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

  // Текущая цена берётся из САМИХ полей границ: их середина. Это честнее,
  // чем выдёргивать число из текста страницы, которого я не видел.
  // Если границы пустые — цену взять неоткуда, и мы говорим об этом прямо,
  // а не подставляем выдуманное число.
  function currentPrice(fields) {
    const lo = D.num((D.find(fields.minPrice) || {}).value);
    const hi = D.num((D.find(fields.maxPrice) || {}).value);
    if (lo != null && hi != null && lo > 0 && hi > 0) return (lo + hi) / 2;
    return null;
  }

  function round(x) {
    if (!isFinite(x) || x <= 0) return x;
    // Сохраняем 6 значащих цифр: у токенов с ценой 0.00000123 округление
    // до двух знаков превратило бы диапазон в ноль.
    const mag = Math.floor(Math.log10(Math.abs(x)));
    const dec = Math.max(0, Math.min(12, 5 - mag));
    return Number(x.toFixed(dec));
  }

  // Основной сценарий. Возвращает отчёт о том, ЧТО РЕАЛЬНО СТОИТ в полях,
  // а не о том, что мы туда отправили.
  async function fill({ amount, widthPct }, cfg, report) {
    const fields = cfg.fields;
    if (!fields || !fields.amount || !fields.minPrice || !fields.maxPrice) {
      throw new Error('поля не выучены — нажми «Указать поля» и покажи их мышью');
    }
    for (const [k, d] of Object.entries(fields)) {
      if (!D.find(d)) {
        throw new Error(`не нахожу ${k} на странице — возможно, сайт изменился, ` +
                        'переобучи поля');
      }
    }

    const price = currentPrice(fields);
    if (price == null) {
      throw new Error('границы пустые — цену взять неоткуда. Открой пул так, ' +
                      'чтобы Min/Max были заполнены, и повтори');
    }

    const lo = round(price * (1 - widthPct / 100));
    const hi = round(price * (1 + widthPct / 100));

    report(`сумма ${amount}…`);
    D.setReactValue(D.find(fields.amount), amount);
    D.pressEnter(D.find(fields.amount));
    await settle(fields, { timeout: cfg.settleMs * 6 });

    report(`верхняя граница ${hi}…`);
    D.setReactValue(D.find(fields.maxPrice), hi);
    D.pressEnter(D.find(fields.maxPrice));
    await settle(fields, { timeout: cfg.settleMs * 6 });

    report(`нижняя граница ${lo}…`);
    D.setReactValue(D.find(fields.minPrice), lo);
    D.pressEnter(D.find(fields.minPrice));
    await settle(fields, { timeout: cfg.settleMs * 6 });

    // Перечитываем. Всё, что расходится с задуманным, показываем явно.
    const got = {
      amount: D.num((D.find(fields.amount) || {}).value),
      lo: D.num((D.find(fields.minPrice) || {}).value),
      hi: D.num((D.find(fields.maxPrice) || {}).value),
    };
    const off = (a, b) => (a == null || b == null || b === 0)
      ? null : Math.abs(a - b) / Math.abs(b) * 100;

    return {
      asked: { amount, lo, hi, price, widthPct },
      got,
      drift: { amount: off(got.amount, amount), lo: off(got.lo, lo), hi: off(got.hi, hi) },
    };
  }

  return { fill, currentPrice, round };
})();
