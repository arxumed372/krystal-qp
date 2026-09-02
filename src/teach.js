// Режим обучения: владелец один раз показывает мышью, где какое поле.
//
// Это не костыль, а сознательный выбор. Я не видел разметку Krystal и не могу
// её проверить — сайт закрыт Cloudflare для автоматических браузеров. Показ
// мышью даёт точное знание вместо догадки и переживает переделку сайта:
// если поля переедут, обучение повторяется за десять секунд.
window.KQPTeach = (() => {
  const D = window.KQPDom;

  // Что нужно знать, чтобы войти в позицию.
  const FIELDS = [
    { key: 'amount', title: 'поле СУММЫ', hint: 'кликни поле, куда вводишь сумму' },
    { key: 'minPrice', title: 'поле НИЖНЕЙ границы', hint: 'кликни поле Min Price' },
    { key: 'maxPrice', title: 'поле ВЕРХНЕЙ границы', hint: 'кликни поле Max Price' },
    // Необязательный, но важный. Без него цена берётся как середина границ,
    // а она верна ТОЛЬКО до первого заполнения: после него границы уже
    // сдвинуты, и второе нажатие уехало бы ещё ниже, третье ещё ниже.
    // Здесь показывается не поле ввода, а надпись с текущей ценой.
    { key: 'price', title: 'НАДПИСЬ с текущей ценой', optional: true,
      hint: 'кликни по числу текущей цены (или Enter — пропустить)' },
  ];

  let overlay = null;
  let onDone = null;
  let queue = [];
  let learned = {};

  function banner(text) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed', 'left:50%', 'top:16px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'background:#111827', 'color:#f9fafb',
        'padding:12px 18px', 'border-radius:10px', 'font:14px/1.4 system-ui',
        'box-shadow:0 8px 28px rgba(0,0,0,.45)', 'max-width:min(560px,92vw)',
        'text-align:center', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(overlay);
    }
    overlay.textContent = text;
  }

  function stop() {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
      if (onDone) onDone(null, 'обучение отменено');
      return;
    }
    // Пропуск необязательного шага.
    if (e.key === 'Enter' && queue[0] && queue[0].optional) {
      e.preventDefault();
      queue.shift();
      if (!queue.length) { stop(); if (onDone) onDone(learned, null); }
    }
  }

  function onClick(e) {
    const el = e.target;
    // Показывать надо именно поле ввода. Промах по контейнеру — частая
    // ошибка, и молча принять её нельзя: запомнится не то.
    const step0 = queue[0];
    // Для цены годится любой элемент с числом: это надпись, а не поле.
    const input = (step0 && step0.key === 'price')
      ? el
      : (el.closest && el.closest('input, textarea, [contenteditable="true"]'));
    if (!input) {
      banner('это не поле ввода — кликни прямо по полю');
      return;
    }
    if (step0 && step0.key === 'price' && D.num(D.textOf(input)) == null) {
      banner('в этом месте не видно числа — кликни прямо по цене');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const step = queue.shift();
    learned[step.key] = D.describe(input);
    if (queue.length) {
      const n = queue[0];
      banner(`Запомнил ${step.title}. Теперь ${n.title}: ${n.hint}. Esc — отмена.`);
    } else {
      stop();
      if (onDone) onDone(learned, null);
    }
  }

  function start(done) {
    onDone = done;
    learned = {};
    queue = FIELDS.slice();
    const n = queue[0];
    banner(`Обучение: ${n.title}. ${n.hint}. Esc — отмена.`);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  return { start, FIELDS };
})();
