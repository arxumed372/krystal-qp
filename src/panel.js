// Плавающая панель: суммы, ширина диапазона, кнопка входа.
//
// Панель НИЧЕГО не подписывает и не нажимает кнопку подтверждения. Она только
// заполняет поля. Последний клик — за владельцем, в его кошельке.
window.KQPPanel = (() => {
  const S = window.KQPSettings;
  const T = window.KQPTeach;
  const A = window.KQPActions;
  const D = window.KQPDom;

  let root = null, cfg = null, statusEl = null, stopHold = null;
  let amount = null, width = null, shape = null, gap = null;

  const css = `
  .kqp { position:fixed; right:16px; bottom:16px; z-index:2147483646;
         width:250px; background:#0f172a; color:#e2e8f0; border-radius:12px;
         font:13px/1.35 system-ui,-apple-system,sans-serif;
         box-shadow:0 10px 34px rgba(0,0,0,.5); border:1px solid #1e293b; }
  .kqp header { padding:9px 12px; font-weight:600; display:flex;
                justify-content:space-between; align-items:center;
                border-bottom:1px solid #1e293b; cursor:move; }
  .kqp .body { padding:10px 12px; display:flex; flex-direction:column; gap:9px; }
  .kqp .lbl { color:#94a3b8; font-size:11px; text-transform:uppercase;
              letter-spacing:.04em; }
  .kqp .row { display:flex; gap:6px; flex-wrap:wrap; }
  .kqp button { background:#1e293b; color:#e2e8f0; border:1px solid #334155;
                border-radius:7px; padding:5px 9px; cursor:pointer; font:inherit; }
  .kqp button:hover { background:#334155; }
  .kqp button.on { background:#16a34a; border-color:#16a34a; color:#fff; }
  .kqp .go { width:100%; padding:9px; font-weight:600; background:#2563eb;
             border-color:#2563eb; color:#fff; }
  .kqp .go:hover { background:#1d4ed8; }
  .kqp .goadd { width:100%; padding:9px; font-weight:600; background:#16a34a;
                border-color:#16a34a; color:#fff; }
  .kqp .goadd:hover { background:#15803d; }
  .kqp .teach, .kqp .probe, .kqp .reset { font-size:12px; }
  .kqp .st { font-size:11.5px; color:#94a3b8; min-height:30px; white-space:pre-wrap;
             word-break:break-word; }
  .kqp .st.err { color:#fca5a5; }
  .kqp .st.ok { color:#86efac; }
  .kqp .x { cursor:pointer; color:#64748b; }
  .kqp .own { width:56px; background:#0b1220; color:#e2e8f0; font:inherit;
              border:1px solid #334155; border-radius:7px; padding:5px 7px; }
  .kqp .own.on { border-color:#16a34a; color:#86efac; }
  .kqp .own.bad { border-color:#ef4444; color:#fca5a5; }
  .kqp .ver { color:#64748b; font-weight:400; font-size:11px; }
  `;

  function status(text, kind) {
    if (!statusEl) return;
    statusEl.className = 'st' + (kind ? ' ' + kind : '');
    statusEl.textContent = text;
  }

  // Ряд кнопок с быстрыми значениями плюс поле для своего.
  // Заготовки покрывают обычный случай, но привязывать владельца только к ним
  // нельзя: у него пул с крупным шагом, и там нужны свои числа.
  function chips(host, values, suffix, get, set) {
    host.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.textContent = v + suffix;
      if (get() === v) b.classList.add('on');
      b.onclick = () => { set(v); chips(host, values, suffix, get, set); };
      host.appendChild(b);
    }
    const own = document.createElement('input');
    own.className = 'own';
    own.placeholder = 'своё';
    own.inputMode = 'decimal';
    // Если текущее значение не из заготовок — показываем его здесь,
    // иначе непонятно, что выбрано.
    if (!values.includes(get())) {
      own.value = String(get());
      own.classList.add('on');
    }
    const apply = () => {
      const v = parseFloat(String(own.value).replace(',', '.'));
      if (!isFinite(v) || v <= 0) {
        own.classList.add('bad');
        return;                       // мусор не принимаем молча
      }
      own.classList.remove('bad');
      set(v);
      chips(host, values, suffix, get, set);
    };
    own.onchange = apply;
    own.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
    host.appendChild(own);
  }

  async function go(alsoSubmit) {
    try {
      status('заполняю…');
      const r = await A.fill({ amount, widthPct: width, shape, gapPct: gap },
                             cfg, m => status(m));
      const d = r.drift;
      // Границы Uniswap V4 садятся на ближайший тик, и точного попадания
      // не бывает по устройству. У владельца пул с комиссией 6%, там шаг
      // особенно крупный: просишь отступ 3%, получаешь около 2%. Поэтому
      // по границам тревожим только при БОЛЬШОМ расхождении, а по сумме —
      // при любом, там подмена означала бы не ту сумму денег.
      const bad = [];
      if (d.amount == null || d.amount > 1) bad.push('сумму');
      if (d.lo == null || d.lo > 25) bad.push('низ');
      if (d.hi == null || d.hi > 25) bad.push('верх');
      const pct = (v) => (v == null || !r.asked.price) ? '—'
        : ((v / r.asked.price - 1) * 100).toFixed(1) + '%';
      const line = `сумма ${r.got.amount ?? '—'}\n` +
                   `низ ${pct(r.got.lo)}, верх ${pct(r.got.hi)} от цены\n` +
                   `${r.got.lo ?? '—'} … ${r.got.hi ?? '—'}\n` +
                   `(просил ${(-r.asked.widthPct).toFixed(0)}% и ` +
                   `${(-r.asked.gapPct).toFixed(0)}%; сайт садит на свой шаг)` +
                   (r.asked.unitsSwitched ? '\nцену переключил в доллары' : '');
      if (bad.length) {
        // Расхождение не прячем. Приложение могло переписать границы —
        // владелец должен увидеть это ДО подписи, а не после.
        status(line + `\nВНИМАНИЕ: сайт сильно изменил ${bad.join(', ')} — проверь перед подписью`, 'err');
      } else if (shape === 'down' && !r.oneSided) {
        // Ради этого всё и делается: верх обязан оказаться НИЖЕ цены,
        // иначе позиция снова двусторонняя и нужен второй токен.
        status(line + '\nверх не ушёл ниже цены — позиция осталась ' +
               'двусторонней. Увеличь отступ', 'err');
      } else if (r.asked.priceSrc === 'середина границ') {
        // Середина границ равна рыночной цене только ДО первого заполнения.
        // После него границы уже сдвинуты, и повторное нажатие увело бы
        // диапазон ещё ниже, а третье — ещё ниже. Молчать об этом нельзя:
        // человек нажал бы дважды и получил не то, что видел.
        status(line + '\nзаполнено, но цену взял как середину границ — ' +
               'второй раз подряд не жми, диапазон уедет. Покажи надпись ' +
               'с ценой через «Указать поля»', 'err');
      } else {
        status(line + '\nготово — жми Add Liquidity сам\nслежу за суммой 20 с…');
        // Держим сумму ещё двадцать секунд: сайт любит подставить своё
        // через семь секунд и позже, когда догрузит данные пула.
        if (stopHold) stopHold();
        stopHold = A.holdAmount(cfg, r.fields, amount, 20, (e) => {
          if (e.done) {
            status(line + (e.fixes
              ? `\nготово. Сайт ${e.fixes} раз(а) менял сумму, я возвращал — ` +
                'проверь поле глазами и жми Add Liquidity'
              : '\nготово — жми Add Liquidity сам'),
              e.fixes ? 'err' : 'ok');
          } else {
            status(line + `\nсайт поставил ${e.was} — вернул ${amount}`, 'err');
          }
        });
      }
      await S.save({ lastAmount: amount, lastWidth: width, lastShape: shape,
                     lastGap: gap });
    } catch (e) {
      status(e.message, 'err');
    }
  }

  // Проверка без записи. Показывает, ЧТО расширение видит на странице,
  // и ничего не трогает. Нужна, чтобы первое знакомство не стоило денег.
  function probe() {
    try {
      const auto = D.autoFields();
      const f = (cfg.fields && cfg.fields.minPrice) ? cfg.fields : auto;
      if (!f) {
        status('полей не вижу. Открой «Add Liquidity» → вкладка Manual', 'err');
        return;
      }
      const val = (d) => { const el = d && D.find(d); return el ? el.value : null; };
      const src = A.currentPrice(f);
      const amtEl = f.amount && D.find(f.amount);
      status(
        `низ: ${val(f.minPrice) ?? 'НЕ ВИЖУ'}\n` +
        `верх: ${val(f.maxPrice) ?? 'НЕ ВИЖУ'}\n` +
        `цена: ${src ? A.round(src.price) + ' (' + src.src + ')' : 'НЕ ВИЖУ'}\n` +
        `поле суммы: ${amtEl ? 'нашёл' : 'НЕ опознал'}\n` +
        `полей в Deposit Amounts: ${D.amountInputs([]).length}` +
        `${D.depositRoot() ? '' : ' (саму область не нашёл)'}\n` +
        `окно: ${D.dialogRoot() ? 'нашёл' : 'НЕ нашёл'}\n` +
        `единицы: ${(() => { const u = D.priceUnits();
           return u ? u.unit + ' за ' + u.per : 'не разобрал'; })()}\n` +
        `источник полей: ${(cfg.fields && cfg.fields.minPrice) ? 'обучение мышью' : 'сам'}`,
        src ? 'ok' : 'err');
    } catch (e) {
      status(e.message, 'err');
    }
  }

  // Сброс выученного. Нужен, если при обучении показали не то: сохранённые
  // поля имеют приоритет над самостоятельным поиском и молча его перебивают.
  async function reset() {
    cfg = await S.save({ fields: null });
    status('выученные поля стёр — теперь ищу сам', 'ok');
  }

  function teach() {
    status('показывай поля мышью…');
    T.start(async (fields, err) => {
      if (err) return status(err, 'err');
      cfg = await S.save({ fields });
      status(fields.price
        ? 'запомнил все четыре: сумма, границы и надпись с ценой'
        : 'границы запомнил. Строка с ценой пропущена — можно жать только ' +
          'один раз подряд, иначе диапазон уедет', fields.price ? 'ok' : 'err');
    });
  }

  function drag(handle, box) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    handle.addEventListener('mousedown', (e) => {
      on = true; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!on) return;
      box.style.left = (ox + e.clientX - sx) + 'px';
      box.style.top = (oy + e.clientY - sy) + 'px';
      box.style.right = 'auto'; box.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { on = false; });
  }

  async function mount() {
    if (root) return;
    cfg = await S.load();
    amount = cfg.lastAmount;
    width = cfg.lastWidth;
    shape = cfg.lastShape;
    gap = cfg.lastGap;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.className = 'kqp';
    root.innerHTML = `
      <header><span>Krystal QP <span class="ver"></span></span><span class="x" title="скрыть">✕</span></header>
      <div class="body">
        <div><div class="lbl">сумма</div><div class="row" id="kqp-a"></div></div>
        <div><div class="lbl">форма</div><div class="row" id="kqp-s"></div></div>
        <div><div class="lbl">ширина %</div><div class="row" id="kqp-w"></div></div>
        <div><div class="lbl">отступ от цены %</div><div class="row" id="kqp-g"></div></div>
        <button class="go">Заполнить</button>
        <div class="row">
          <button class="probe" style="flex:1">Проверить</button>
          <button class="teach" style="flex:1">Указать поля</button>
          <button class="reset">Сброс</button>
        </div>
        <div class="row">
          <button class="nudge" style="flex:1">Подтолкнуть</button>
        </div>
        <div class="st"></div>
      </div>`;
    document.body.appendChild(root);

    // Номер версии в заголовке. Без него не отличить обновлённую сборку от
    // старой: Chrome держит расширение в памяти, пока не нажмёшь обновление
    // на карточке, и правки выглядят как «опять та же ошибка».
    try {
      root.querySelector('.ver').textContent =
        'v' + chrome.runtime.getManifest().version;
    } catch (e) { /* вне расширения версии нет — не беда */ }
    statusEl = root.querySelector('.st');
    chips(root.querySelector('#kqp-a'), cfg.amounts, '', () => amount, v => amount = v);
    chips(root.querySelector('#kqp-w'), cfg.widths, '%', () => width, v => width = v);
    chips(root.querySelector('#kqp-g'), cfg.gaps, '%', () => gap, v => gap = v);
    const SHAPES = [['down', 'вниз'], ['both', '± обе'], ['up', 'вверх']];
    const sh = root.querySelector('#kqp-s');
    const drawShapes = () => {
      sh.innerHTML = '';
      for (const [k, t] of SHAPES) {
        const b = document.createElement('button');
        b.textContent = t;
        if (shape === k) b.classList.add('on');
        b.onclick = () => { shape = k; drawShapes(); };
        sh.appendChild(b);
      }
    };
    drawShapes();
    root.querySelector('.go').onclick = () => go(false);
    root.querySelector('.teach').onclick = teach;
    root.querySelector('.probe').onclick = probe;
    root.querySelector('.reset').onclick = reset;
    root.querySelector('.nudge').onclick = async () => {
      try {
        status('жму + и − у границ…');
        const r = await A.nudge(cfg, m => status(m));
        const same = (a, b) => (a == null || b == null)
          ? false : Math.abs(a - b) / Math.abs(b || 1) < 1e-9;
        status(`было ${r.before.lo} … ${r.before.hi}\n` +
               `стало ${r.after.lo} … ${r.after.hi}\n` +
               (same(r.before.lo, r.after.lo) && same(r.before.hi, r.after.hi)
                 ? 'границы те же — теперь пробуй Add Liquidity'
                 : 'ВНИМАНИЕ: границы сдвинулись, проверь их перед нажатием'),
               'ok');
      } catch (e) { status(e.message, 'err'); }
    };
    root.querySelector('.x').onclick = () => root.remove();
    drag(root.querySelector('header'), root);

    // Поля определяются сами по подписям Min Price / Max Price. Показ мышью
    // остался запасным путём на случай, если Krystal переделает разметку.
    // Единицы цены переключаем СРАЗУ, как только открылось окно, а не в
    // момент заполнения. Владелец заметил, что цена меняется не сразу —
    // потому что раньше это делалось внутри «Заполнить», уже после нажатия.
    let switched = false;
    setInterval(() => {
      const open = !!D.dialogRoot();
      if (!open) { switched = false; return; }   // окно закрыли — забываем
      if (switched) return;
      const st = D.priceIsStable();
      if (st === null) return;                   // строки цены ещё нет
      switched = true;
      if (st) return;                            // уже в долларах, не трогаем
      const r = D.switchPriceUnits();
      if (r.changed) status('переключил цену в доллары', 'ok');
    }, 700);

    status(cfg.fields
      ? 'поля выучены мышью — можно заполнять'
      : 'открой «Add Liquidity» → Manual и жми «Заполнить», поля найду сам');
  }

  return { mount };
})();
