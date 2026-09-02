// Точка входа. Панель появляется только на страницах, где есть поля ввода —
// на списке пулов она не нужна и только мешала бы.
(() => {
  const looksLikePool = () =>
    /\/pools?\/|\/positions?\/|\/account\//.test(location.pathname) ||
    document.querySelectorAll('input').length >= 2;

  let mounted = false;
  const tick = () => {
    if (mounted) return;
    if (looksLikePool()) { mounted = true; window.KQPPanel.mount(); }
  };

  tick();
  // Krystal — одностраничное приложение: переход между пулами не
  // перезагружает страницу, поэтому следим за изменениями дерева.
  const mo = new MutationObserver(() => tick());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1500);
})();
