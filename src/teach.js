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
    }
  }

  function onClick(e) {
    const el = e.target;
    // Показывать надо именно поле ввода. Промах по контейнеру — частая
    // ошибка, и молча принять её нельзя: запомнится не то.
    const input = el.closest && el.closest('input, textarea, [contenteditable="true"]');
    if (!input) {
      banner('это не поле ввода — кликни прямо по полю');
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
